/**
 * Launching the cinematic experience from the portfolio.
 *
 * "loading"  the experience is mounted and running behind the page, its loader
 *            standing in as the page's background while the site stays usable.
 * "ready"    the loader is waiting on its Enter button, so the page fades out
 *            and hands over.
 */
export type CinematicLaunch = "idle" | "loading" | "ready";

type Listener = (state: CinematicLaunch) => void;

let state: CinematicLaunch = "idle";
const listeners = new Set<Listener>();

export const getCinematicLaunch = () => state;

export const setCinematicLaunch = (next: CinematicLaunch) => {
  if (next === state) return;
  state = next;
  // The portfolio's own styles follow these, to dim the scenes and then fade
  // the page away (see showcase.css).
  const root = document.documentElement;
  root.classList.toggle("is-cinematic-loading", next === "loading");
  root.classList.toggle("is-cinematic-ready", next === "ready");
  for (const listener of listeners) listener(next);
};

export const subscribeCinematicLaunch = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
