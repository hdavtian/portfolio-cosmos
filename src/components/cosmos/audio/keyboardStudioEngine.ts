import { Midi } from "@tonejs/midi";
import * as Tone from "tone";
import {
  type KeyboardRecordedNoteEvent,
  type KeyboardStudioSoundDesign,
  DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN,
  normalizeSoundDesign,
} from "./keyboardStudioBindings";

type PlaybackOptions = {
  gain?: number;
  ghostPlayback?: boolean;
  onNoteOn?: (note: string) => void;
  onNoteOff?: (note: string) => void;
  onStateChange?: (playing: boolean) => void;
};

type WorkletSaturator = {
  input: GainNode;
  output: GainNode;
  node: AudioWorkletNode;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toSec = (ms: number) => Math.max(0.001, ms / 1000);

const normalizeEvents = (events: KeyboardRecordedNoteEvent[]) =>
  [...events]
    .map((event) => ({
      note: event.note,
      startMs: Math.max(0, Number(event.startMs) || 0),
      durationMs: Math.max(30, Number(event.durationMs) || 0),
      velocity: clamp(Number.isFinite(event.velocity) ? event.velocity : 0.82, 0.05, 1),
    }))
    .sort((a, b) => a.startMs - b.startMs);

export const createKeyboardStudioEngine = () => {
  let synth: Tone.PolySynth | null = null;
  let filter: Tone.Filter | null = null;
  let distortion: Tone.Distortion | null = null;
  let chorus: Tone.Chorus | null = null;
  let delay: Tone.FeedbackDelay | null = null;
  let reverb: Tone.Reverb | null = null;
  let stereoWidener: Tone.StereoWidener | null = null;
  let limiter: Tone.Limiter | null = null;
  let outputGain: Tone.Gain | null = null;
  let masterGain: Tone.Gain | null = null;
  let workletSaturator: WorkletSaturator | null = null;
  let designState: KeyboardStudioSoundDesign = { ...DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN };
  let masterVolumeScalar = 1;
  const heldManualNotes = new Set<string>();
  let playbackIds: number[] = [];
  let stopId: number | null = null;
  let playbackVersion = 0;
  let playbackActive = false;

  const clearSchedules = () => {
    playbackIds.forEach((id) => Tone.Transport.clear(id));
    playbackIds = [];
    if (stopId !== null) {
      Tone.Transport.clear(stopId);
      stopId = null;
    }
  };

  const setupGraph = async () => {
    if (synth) return;
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: designState.oscillatorType as any },
      envelope: {
        attack: designState.attack,
        decay: designState.decay,
        sustain: designState.sustain,
        release: designState.release,
      },
      volume: -8,
    });
    synth.maxPolyphony = 16;
    filter = new Tone.Filter(designState.filterCutoff, designState.filterType);
    filter.Q.value = designState.filterQ;
    distortion = new Tone.Distortion(designState.drive);
    distortion.oversample = "2x";
    chorus = new Tone.Chorus({
      frequency: designState.chorusRate,
      delayTime: 2.8,
      depth: designState.chorusDepth,
      spread: 130,
      wet: Math.min(0.8, designState.chorusDepth * 0.75),
    }).start();
    delay = new Tone.FeedbackDelay(designState.delayTime, designState.delayFeedback);
    delay.wet.value = clamp(designState.delayFeedback * 0.75, 0, 0.8);
    reverb = new Tone.Reverb({
      decay: designState.reverbDecay,
      preDelay: 0.03,
      wet: designState.reverbMix,
    });
    stereoWidener = new Tone.StereoWidener(designState.stereoWidth);
    limiter = new Tone.Limiter(designState.limiterDb);
    outputGain = new Tone.Gain(Tone.dbToGain(designState.outputGainDb));
    masterGain = new Tone.Gain(clamp(masterVolumeScalar, 0, 1));
    synth.connect(filter);
    filter.connect(distortion);
    distortion.connect(chorus);
    chorus.connect(delay);
    delay.connect(reverb);
    reverb.connect(stereoWidener);
    stereoWidener.connect(limiter);
    limiter.connect(outputGain);
    outputGain.connect(masterGain);
    masterGain.toDestination();

    // Worklet-first attempt: custom soft saturator inserted after filter.
    try {
      const rawContext = Tone.getContext().rawContext;
      const processorCode = `
class KeyboardStudioSaturator extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "drive", defaultValue: 0.18, minValue: 0, maxValue: 1 }];
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output || output.length === 0) return true;
    const drive = parameters.drive;
    for (let ch = 0; ch < output.length; ch += 1) {
      const inCh = input[ch] || input[0];
      const outCh = output[ch];
      if (!inCh || !outCh) continue;
      for (let i = 0; i < outCh.length; i += 1) {
        const d = drive.length === 1 ? drive[0] : drive[i];
        const x = inCh[i] || 0;
        const amount = 1 + d * 18;
        outCh[i] = Math.tanh(x * amount) / Math.tanh(amount);
      }
    }
    return true;
  }
}
registerProcessor("keyboard-studio-saturator", KeyboardStudioSaturator);
      `;
      const blob = new Blob([processorCode], { type: "application/javascript" });
      const moduleUrl = URL.createObjectURL(blob);
      await rawContext.audioWorklet.addModule(moduleUrl);
      URL.revokeObjectURL(moduleUrl);
      const inputNode = rawContext.createGain();
      const outputNode = rawContext.createGain();
      const worklet = new AudioWorkletNode(rawContext, "keyboard-studio-saturator");
      inputNode.connect(worklet);
      worklet.connect(outputNode);
      worklet.parameters.get("drive")?.setValueAtTime(
        clamp(designState.drive, 0, 1),
        rawContext.currentTime,
      );
      workletSaturator = {
        input: inputNode,
        output: outputNode,
        node: worklet,
      };

      // Re-patch graph: filter -> worklet -> chorus
      try {
        filter.disconnect();
      } catch {
        // no-op
      }
      try {
        distortion.disconnect();
      } catch {
        // no-op
      }
      filter.connect(inputNode);
      outputNode.connect(chorus.input as unknown as AudioNode);
    } catch {
      workletSaturator = null;
    }
  };

  const applySoundDesign = async (next: Partial<KeyboardStudioSoundDesign>) => {
    designState = normalizeSoundDesign({ ...designState, ...next });
    if (!synth) return designState;
    synth.set({
      oscillator: {
        type: designState.oscillatorType as any,
      },
      envelope: {
        attack: designState.attack,
        decay: designState.decay,
        sustain: designState.sustain,
        release: designState.release,
      },
    });
    if (filter) {
      filter.frequency.value = designState.filterCutoff;
      filter.Q.value = designState.filterQ;
      filter.type = designState.filterType;
    }
    if (distortion) {
      distortion.distortion = designState.drive;
    }
    if (chorus) {
      chorus.frequency.value = designState.chorusRate;
      chorus.depth = designState.chorusDepth;
      chorus.wet.value = clamp(designState.chorusDepth * 0.75, 0, 0.8);
    }
    if (delay) {
      delay.delayTime.value = designState.delayTime;
      delay.feedback.value = designState.delayFeedback;
      delay.wet.value = clamp(designState.delayFeedback * 0.75, 0, 0.8);
    }
    if (reverb) {
      reverb.decay = designState.reverbDecay;
      reverb.wet.value = designState.reverbMix;
      await reverb.generate();
    }
    if (stereoWidener) {
      stereoWidener.width.value = designState.stereoWidth;
    }
    if (limiter) {
      limiter.threshold.value = designState.limiterDb;
    }
    if (outputGain) {
      outputGain.gain.value = Tone.dbToGain(designState.outputGainDb);
    }
    if (workletSaturator) {
      const rawContext = Tone.getContext().rawContext;
      workletSaturator.node.parameters.get("drive")?.setValueAtTime(
        clamp(designState.drive, 0, 1),
        rawContext.currentTime,
      );
    }
    return designState;
  };

  const velocityByCurve = (rawVelocity: number, gainScale = 1) => {
    const normalized = clamp(rawVelocity, 0.05, 1);
    return clamp(Math.pow(normalized, designState.velocityCurve) * gainScale, 0.02, 1);
  };

  return {
    async ensureReady() {
      try {
        await Tone.start();
      } catch {
        // blocked until gesture
      }
      if (!synth) await setupGraph();
      return true;
    },
    async setSoundDesign(next: Partial<KeyboardStudioSoundDesign>) {
      return applySoundDesign(next);
    },
    setMasterVolume(volume: number) {
      masterVolumeScalar = clamp(volume, 0, 1);
      if (masterGain) {
        masterGain.gain.value = masterVolumeScalar;
      }
    },
    getSoundDesign() {
      return { ...designState };
    },
    noteOn(note: string, velocity = 0.82) {
      if (!synth) return;
      if (heldManualNotes.has(note)) {
        // Re-trigger semantics: ensure previous voice for this note is released first.
        synth.triggerRelease(note);
        heldManualNotes.delete(note);
      }
      synth.triggerAttack(note, undefined, velocityByCurve(velocity));
      heldManualNotes.add(note);
    },
    noteOff(note: string) {
      if (!synth) return;
      synth.triggerRelease(note);
      heldManualNotes.delete(note);
    },
    stopAll() {
      if (!synth) return;
      synth.releaseAll();
      heldManualNotes.clear();
    },
    stopPlayback() {
      playbackVersion += 1;
      playbackActive = false;
      clearSchedules();
      Tone.Transport.stop();
      Tone.Transport.cancel();
    },
    async playSequence(
      events: KeyboardRecordedNoteEvent[],
      options?: PlaybackOptions,
    ) {
      if (!synth) await this.ensureReady();
      if (!synth) return;
      const normalized = normalizeEvents(events);
      if (normalized.length === 0) return;
      this.stopPlayback();
      const version = playbackVersion + 1;
      playbackVersion = version;
      playbackActive = true;
      options?.onStateChange?.(true);
      const gainScale = clamp(options?.gain ?? 1, 0, 1.6);
      playbackIds = normalized.map((event) =>
        Tone.Transport.schedule((time) => {
          const durationSec = toSec(event.durationMs);
          synth?.triggerAttackRelease(
            event.note,
            durationSec,
            time,
            velocityByCurve(event.velocity, gainScale),
          );
          if (options?.ghostPlayback) {
            Tone.Draw.schedule(() => {
              if (!playbackActive || version !== playbackVersion) return;
              options?.onNoteOn?.(event.note);
            }, time);
            Tone.Draw.schedule(() => {
              if (!playbackActive || version !== playbackVersion) return;
              options?.onNoteOff?.(event.note);
            }, time + durationSec);
          }
        }, toSec(event.startMs)),
      );
      const endSec = normalized.reduce(
        (maxT, event) => Math.max(maxT, toSec(event.startMs + event.durationMs)),
        0,
      ) + 0.25;
      stopId = Tone.Transport.scheduleOnce((time) => {
        Tone.Draw.schedule(() => {
          if (!playbackActive || version !== playbackVersion) return;
          this.stopPlayback();
          options?.onStateChange?.(false);
        }, time);
      }, endSec);
      Tone.Transport.start("+0.03");
    },
    exportMidiBlob(events: KeyboardRecordedNoteEvent[]) {
      const normalized = normalizeEvents(events);
      const midi = new Midi();
      const track = midi.addTrack();
      normalized.forEach((event) => {
        track.addNote({
          midi: Tone.Frequency(event.note).toMidi(),
          time: toSec(event.startMs),
          duration: toSec(event.durationMs),
          velocity: clamp(event.velocity, 0.05, 1),
        });
      });
      const bytes = midi.toArray();
      const buffer = new Uint8Array(bytes).buffer;
      return new Blob([buffer], { type: "audio/midi" });
    },
    dispose() {
      this.stopPlayback();
      if (synth) {
        synth.releaseAll();
        heldManualNotes.clear();
        synth.dispose();
        synth = null;
      }
      filter?.dispose();
      filter = null;
      distortion?.dispose();
      distortion = null;
      chorus?.dispose();
      chorus = null;
      delay?.dispose();
      delay = null;
      reverb?.dispose();
      reverb = null;
      stereoWidener?.dispose();
      stereoWidener = null;
      limiter?.dispose();
      limiter = null;
      outputGain?.dispose();
      outputGain = null;
      masterGain?.dispose();
      masterGain = null;
      workletSaturator = null;
    },
  };
};
