/**
 * Launching the cinematic experience from the portfolio.
 *
 * "loading"  the experience is mounted and running behind the page, its loader
 *            standing in as the page's background while the site stays usable.
 * "ready"    the loader is waiting on its Enter button (or the experience is
 *            already loaded), so the page fades out and hands over.
 *
 * `loaded` records that the experience has finished loading and is still in
 * memory: later launches skip the loader entirely and the call to action says
 * "back to", not "enter".
 */
export type CinematicLaunch = "idle" | "loading" | "ready";

type Listener = () => void;

let state: CinematicLaunch = "idle";
let loaded = false;
let still = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const listener of listeners) listener();
};

export const getCinematicLaunch = () => state;

export const setCinematicLaunch = (next: CinematicLaunch) => {
  if (next === state) return;
  state = next;
  // The portfolio's own styles follow these, to dim the scenes and then fade
  // the page away (see showcase.css).
  const root = document.documentElement;
  root.classList.toggle("is-cinematic-loading", next === "loading");
  root.classList.toggle("is-cinematic-ready", next === "ready");
  notify();
};

/**
 * True while the paused experience stays on as a frozen backdrop behind the
 * portfolio, just after coming back from it. Clicking it goes back in; after a
 * while it fades and the background previews take over again.
 */
export const isCinematicStill = () => still;

export const setCinematicStill = (next: boolean) => {
  if (next === still) return;
  still = next;
  document.documentElement.classList.toggle("is-cinematic-still", next);
  notify();
};

export const isCinematicLoaded = () => loaded;

export const setCinematicLoaded = (next: boolean) => {
  if (next === loaded) return;
  loaded = next;
  notify();
};

export const subscribeCinematicLaunch = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
