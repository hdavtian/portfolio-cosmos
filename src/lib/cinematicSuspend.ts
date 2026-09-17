/**
 * The cinematic pause flag. The cinematic experience stays alive behind the
 * portfolio (see CinematicHost); while it's hidden it is "suspended": its
 * render loop idles, its audio is suspended and its global input listeners
 * ignore events, so the portfolio in front owns the keyboard, wheel and mouse.
 */

type Listener = (suspended: boolean) => void;

let suspended = false;
const listeners = new Set<Listener>();

export const isCinematicSuspended = () => suspended;

export const setCinematicSuspended = (next: boolean) => {
  if (next === suspended) return;
  suspended = next;
  for (const listener of listeners) listener(next);
};

export const subscribeCinematicSuspended = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
