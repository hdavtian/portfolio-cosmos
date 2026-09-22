/**
 * The skills film's pause flag. Where the film is kept alive between visits
 * (see app/film/FilmHost), it is "suspended" while hidden: its render loop,
 * playback and keyboard handling idle, and it resumes where it was.
 */

type Listener = (suspended: boolean) => void;

let suspended = false;
const listeners = new Set<Listener>();

export const isFilmSuspended = () => suspended;

export const setFilmSuspended = (next: boolean) => {
  if (next === suspended) return;
  suspended = next;
  for (const listener of listeners) listener(next);
};

export const subscribeFilmSuspended = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
