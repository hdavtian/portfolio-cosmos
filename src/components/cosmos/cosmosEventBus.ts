export type CosmosEventMap = {
  "intro:camera-started": { at: number };
  "intro:camera-completed": { at: number };
  "ship:cinematic-started": { at: number; phase: "approach" };
  "ship:cinematic-hover": { at: number; phase: "hover" };
};

type CosmosEventName = keyof CosmosEventMap;
type CosmosEventListener<K extends CosmosEventName> = (payload: CosmosEventMap[K]) => void;

const listenersByEvent: {
  [K in CosmosEventName]: Set<CosmosEventListener<K>>;
} = {
  "intro:camera-started": new Set(),
  "intro:camera-completed": new Set(),
  "ship:cinematic-started": new Set(),
  "ship:cinematic-hover": new Set(),
};

export const emitCosmosEvent = <K extends CosmosEventName>(
  eventName: K,
  payload: CosmosEventMap[K],
): void => {
  listenersByEvent[eventName].forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Never let one listener break event fan-out.
    }
  });
};

export const subscribeCosmosEvent = <K extends CosmosEventName>(
  eventName: K,
  listener: CosmosEventListener<K>,
): (() => void) => {
  listenersByEvent[eventName].add(listener);
  return () => {
    listenersByEvent[eventName].delete(listener);
  };
};

