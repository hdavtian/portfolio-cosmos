import * as THREE from "three";

type PositionalAudioOptions = {
  refDistance?: number;
  rolloffFactor?: number;
  distanceModel?: "inverse" | "linear" | "exponential";
  maxDistance?: number;
  directionalCone?: {
    innerAngle: number;
    outerAngle: number;
    outerGain: number;
  };
};

export const attachAudioListenerToCamera = (
  camera: THREE.Camera | null | undefined,
  listener: THREE.AudioListener,
) => {
  if (!camera) return false;
  if (listener.parent === camera) return true;
  if (listener.parent) {
    listener.parent.remove(listener);
  }
  camera.add(listener);
  return true;
};

export const createPositionalAudio = (
  listener: THREE.AudioListener,
  options?: PositionalAudioOptions,
) => {
  const audio = new THREE.PositionalAudio(listener);
  audio.setRefDistance(options?.refDistance ?? 18);
  audio.setRolloffFactor(options?.rolloffFactor ?? 1.2);
  audio.setDistanceModel(options?.distanceModel ?? "inverse");
  audio.setMaxDistance(options?.maxDistance ?? 1400);
  if (options?.directionalCone) {
    audio.setDirectionalCone(
      options.directionalCone.innerAngle,
      options.directionalCone.outerAngle,
      options.directionalCone.outerGain,
    );
  }
  return audio;
};

export const playPositionalOneShot = (
  audio: THREE.PositionalAudio,
  buffer: AudioBuffer,
  volume: number,
  playbackRate = 1,
) => {
  if (audio.isPlaying) {
    audio.stop();
  }
  audio.setLoop(false);
  audio.setBuffer(buffer);
  audio.setVolume(THREE.MathUtils.clamp(volume, 0, 1));
  audio.setPlaybackRate(playbackRate);
  audio.play();
};
