export const KEYBOARD_STUDIO_EVENT_CHANNEL = "cosmos.sound_event";

export const COSMOS_SOUND_EVENT_IDS = [
  "cosmos.ui.destination.hover",
  "cosmos.ui.destination.click",
  "cosmos.nav.phase",
  "cosmos.nav.moon.intent",
  "cosmos.nav.moon.cruise_start",
  "cosmos.nav.arrive_moon",
  "cosmos.section.travel_start",
  "cosmos.section.arrived_settle",
  "cosmos.section.arrived_threshold",
  "cosmos.moon.view_enter",
  "cosmos.moon.view_exit",
  "cosmos.orbit_system.freeze",
  "cosmos.orbit_system.restore",
] as const;

export type CosmosSoundEventId = string;

export type KeyboardRecordedNoteEvent = {
  note: string;
  startMs: number;
  durationMs: number;
  velocity: number;
};

export type KeyboardStudioSoundDesign = {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterCutoff: number;
  filterQ: number;
  drive: number;
  chorusDepth: number;
  chorusRate: number;
  delayTime: number;
  delayFeedback: number;
  reverbDecay: number;
  reverbMix: number;
  stereoWidth: number;
  limiterDb: number;
  outputGainDb: number;
  velocityCurve: number;
  oscillatorType: string;
  filterType: "lowpass" | "highpass" | "bandpass" | "notch";
};

export type KeyboardStudioPreset = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  events: KeyboardRecordedNoteEvent[];
  soundDesign: KeyboardStudioSoundDesign;
};

export type KeyboardStudioEventBinding = {
  eventId: CosmosSoundEventId;
  presetId: string;
  enabled: boolean;
  gain: number;
};

export type KeyboardStudioPanelLayout = {
  x: number;
  y: number;
  collapsed: boolean;
  lastOpen: number;
};

export type CosmosSoundEventPayload = {
  source?: string;
  targetId?: string | null;
  targetType?: "section" | "moon" | null;
  phase?: string;
  routeKind?: "moon" | "section" | null;
  detail?: string;
  systemId?: string;
};

export type CosmosSoundEvent = {
  id: CosmosSoundEventId;
  ts: number;
  payload: CosmosSoundEventPayload;
};

export const KEYBOARD_STUDIO_ENABLED_KEY = "keyboardStudio.enabled";
export const KEYBOARD_STUDIO_LAYOUT_KEY = "keyboardStudio.panelLayout";
export const KEYBOARD_STUDIO_PRESETS_KEY = "keyboardStudio.presets";
export const KEYBOARD_STUDIO_BINDINGS_KEY = "keyboardStudio.bindings";

export const DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN: KeyboardStudioSoundDesign = {
  attack: 0.01,
  decay: 0.16,
  sustain: 0.42,
  release: 0.48,
  filterCutoff: 1600,
  filterQ: 0.8,
  drive: 0.12,
  chorusDepth: 0.3,
  chorusRate: 0.8,
  delayTime: 0.18,
  delayFeedback: 0.24,
  reverbDecay: 2.2,
  reverbMix: 0.2,
  stereoWidth: 0.45,
  limiterDb: -2.5,
  outputGainDb: -12,
  velocityCurve: 1.0,
  oscillatorType: "triangle8",
  filterType: "lowpass",
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeEvent = (event: KeyboardRecordedNoteEvent): KeyboardRecordedNoteEvent => ({
  note: String(event.note || "C4"),
  startMs: Math.max(0, Number(event.startMs) || 0),
  durationMs: Math.max(30, Number(event.durationMs) || 0),
  velocity: clamp(Number.isFinite(event.velocity) ? event.velocity : 0.82, 0.05, 1),
});

export const normalizeSoundDesign = (
  input?: Partial<KeyboardStudioSoundDesign> | null,
): KeyboardStudioSoundDesign => ({
  attack: clamp(Number(input?.attack ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.attack), 0, 2),
  decay: clamp(Number(input?.decay ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.decay), 0, 4),
  sustain: clamp(Number(input?.sustain ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.sustain), 0, 1),
  release: clamp(Number(input?.release ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.release), 0.01, 8),
  filterCutoff: clamp(
    Number(input?.filterCutoff ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.filterCutoff),
    100,
    12000,
  ),
  filterQ: clamp(Number(input?.filterQ ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.filterQ), 0.1, 20),
  drive: clamp(Number(input?.drive ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.drive), 0, 1),
  chorusDepth: clamp(
    Number(input?.chorusDepth ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.chorusDepth),
    0,
    1,
  ),
  chorusRate: clamp(Number(input?.chorusRate ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.chorusRate), 0, 8),
  delayTime: clamp(Number(input?.delayTime ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.delayTime), 0, 1.2),
  delayFeedback: clamp(
    Number(input?.delayFeedback ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.delayFeedback),
    0,
    0.95,
  ),
  reverbDecay: clamp(
    Number(input?.reverbDecay ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.reverbDecay),
    0.1,
    12,
  ),
  reverbMix: clamp(Number(input?.reverbMix ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.reverbMix), 0, 1),
  stereoWidth: clamp(
    Number(input?.stereoWidth ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.stereoWidth),
    0,
    1,
  ),
  limiterDb: clamp(
    Number(input?.limiterDb ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.limiterDb),
    -16,
    0,
  ),
  outputGainDb: clamp(
    Number(input?.outputGainDb ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.outputGainDb),
    -36,
    6,
  ),
  velocityCurve: clamp(
    Number(input?.velocityCurve ?? DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.velocityCurve),
    0.2,
    2.6,
  ),
  oscillatorType:
    typeof input?.oscillatorType === "string" && input.oscillatorType.trim().length > 0
      ? input.oscillatorType.trim()
      : DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN.oscillatorType,
  filterType:
    input?.filterType === "highpass"
    || input?.filterType === "bandpass"
    || input?.filterType === "notch"
      ? input.filterType
      : "lowpass",
});

export const loadBooleanStorage = (key: string, fallback: boolean) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
};

export const saveBooleanStorage = (key: string, value: boolean) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // localStorage can be unavailable in private browsing.
  }
};

export const loadPanelLayout = (fallback: KeyboardStudioPanelLayout): KeyboardStudioPanelLayout => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(KEYBOARD_STUDIO_LAYOUT_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<KeyboardStudioPanelLayout>;
    return {
      x: Number.isFinite(parsed.x) ? Number(parsed.x) : fallback.x,
      y: Number.isFinite(parsed.y) ? Number(parsed.y) : fallback.y,
      collapsed: Boolean(parsed.collapsed),
      lastOpen: Number.isFinite(parsed.lastOpen) ? Number(parsed.lastOpen) : fallback.lastOpen,
    };
  } catch {
    return fallback;
  }
};

export const savePanelLayout = (layout: KeyboardStudioPanelLayout) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEYBOARD_STUDIO_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // no-op
  }
};

export const loadPresets = (): KeyboardStudioPreset[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEYBOARD_STUDIO_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<KeyboardStudioPreset>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && item.id && item.name)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        createdAt: String(item.createdAt || new Date().toISOString()),
        updatedAt: String(item.updatedAt || new Date().toISOString()),
        source: (item.source as KeyboardStudioPreset["source"]) ?? "custom",
        events: Array.isArray(item.events) ? item.events.map((event) => normalizeEvent(event as KeyboardRecordedNoteEvent)) : [],
        soundDesign: normalizeSoundDesign(item.soundDesign),
      }));
  } catch {
    return [];
  }
};

export const savePresets = (presets: KeyboardStudioPreset[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEYBOARD_STUDIO_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // no-op
  }
};

export const loadBindings = (): KeyboardStudioEventBinding[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEYBOARD_STUDIO_BINDINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<KeyboardStudioEventBinding>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.eventId === "string" && typeof item.presetId === "string")
      .map((item) => ({
        eventId: item.eventId as CosmosSoundEventId,
        presetId: String(item.presetId),
        enabled: item.enabled !== false,
        gain: clamp(Number(item.gain ?? 1), 0, 1.6),
      }));
  } catch {
    return [];
  }
};

export const saveBindings = (bindings: KeyboardStudioEventBinding[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEYBOARD_STUDIO_BINDINGS_KEY, JSON.stringify(bindings));
  } catch {
    // no-op
  }
};

export const emitCosmosSoundEvent = (
  id: CosmosSoundEventId,
  payload: CosmosSoundEventPayload = {},
) => {
  if (typeof window === "undefined") return;
  const event: CosmosSoundEvent = {
    id,
    ts: Date.now(),
    payload,
  };
  window.dispatchEvent(
    new CustomEvent<CosmosSoundEvent>(KEYBOARD_STUDIO_EVENT_CHANNEL, { detail: event }),
  );
};

export const onCosmosSoundEvent = (
  callback: (event: CosmosSoundEvent) => void,
) => {
  if (typeof window === "undefined") return () => {};
  const listener = (evt: Event) => {
    const detail = (evt as CustomEvent<CosmosSoundEvent>).detail;
    if (!detail || !detail.id) return;
    callback(detail);
  };
  window.addEventListener(KEYBOARD_STUDIO_EVENT_CHANNEL, listener as EventListener);
  return () => {
    window.removeEventListener(KEYBOARD_STUDIO_EVENT_CHANNEL, listener as EventListener);
  };
};
