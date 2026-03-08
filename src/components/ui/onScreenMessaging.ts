export type OnScreenMessage = {
  id: number;
  text: string;
  createdAt: number;
  durationMs: number;
};

type OnScreenMessageListener = (message: OnScreenMessage) => void;
export type OnScreenTelemetry = {
  distance: number | null;
  speed: number | null;
};
type OnScreenTelemetryListener = (telemetry: OnScreenTelemetry) => void;

let onScreenMessageId = 0;
const listeners = new Set<OnScreenMessageListener>();
const telemetryListeners = new Set<OnScreenTelemetryListener>();
let telemetryState: OnScreenTelemetry = {
  distance: null,
  speed: null,
};

export const subscribeOnScreenMessages = (
  listener: OnScreenMessageListener,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const onScreenMessage = (
  text: string,
  options?: {
    durationMs?: number;
  },
): OnScreenMessage => {
  const message: OnScreenMessage = {
    id: ++onScreenMessageId,
    text,
    createdAt: Date.now(),
    durationMs: options?.durationMs ?? 5000,
  };
  listeners.forEach((listener) => listener(message));
  return message;
};

export const subscribeOnScreenTelemetry = (
  listener: OnScreenTelemetryListener,
): (() => void) => {
  telemetryListeners.add(listener);
  listener(telemetryState);
  return () => {
    telemetryListeners.delete(listener);
  };
};

export const setOnScreenTelemetry = (telemetry: Partial<OnScreenTelemetry>) => {
  telemetryState = {
    ...telemetryState,
    ...telemetry,
  };
  telemetryListeners.forEach((listener) => listener(telemetryState));
};

export const clearOnScreenTelemetry = () => {
  telemetryState = {
    distance: null,
    speed: null,
  };
  telemetryListeners.forEach((listener) => listener(telemetryState));
};

declare global {
  interface Window {
    onScreenMessage?: typeof onScreenMessage;
    setOnScreenTelemetry?: typeof setOnScreenTelemetry;
  }
}

if (typeof window !== "undefined") {
  window.onScreenMessage = onScreenMessage;
  window.setOnScreenTelemetry = setOnScreenTelemetry;
}
