import { lazy, Suspense, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { setFilmSuspended } from "../../lib/filmSuspend";
import "../wake.css";
import "./filmHost.css";

/** The address of the skills film. */
export const FILM_PATH = "/progression";
/** Where it used to live, kept redirecting for links already out there. */
export const FILM_OLD_PATH = "/lab/got";

const Film = lazy(() => import("../../features/lab/SkillsTitlesPage").then((m) => ({ default: m.SkillsTitlesPage })));

// The film's own loader is in its chunk; until that arrives, the same plate
// in plain markup (styled by filmHost.css) so the wait reads as one thing.
const loading = (
  <div className="film-host__loading" role="status" aria-live="polite">
    <p className="titles__loader-kicker">Skill progression</p>
    <p className="titles__loader-caption">Loading skill progression journey and map</p>
    <span className="titles__loader-line" aria-hidden="true" />
  </div>
);

/**
 * Hosts the skills film inside the portfolio's layout, under its nav. Where
 * allowed (see keepAlive), once visited it stays mounted: leaving pauses its
 * loops (see lib/filmSuspend), coming back resumes it where it was, scrubber
 * position and all. Elsewhere it mounts only while its route is open.
 */
export function FilmHost() {
  const { pathname } = useLocation();
  const onRoute = pathname === FILM_PATH;
  // Mounted on the first visit and kept from then on, the way the universe is.
  const [kept, setKept] = useState(false);
  if (onRoute && !kept) setKept(true);

  // Suspended really does mean stopped now: both of the film's animation frames
  // are cancelled rather than re-scheduled to draw nothing (see
  // SkillsTitlesPage), and the hidden film is moved off and clipped away rather
  // than left under a blur (see filmHost.css). Put away it costs memory and its
  // canvases, but no main thread, and coming back is a class change instead of
  // three seconds of building a scene from scratch.
  useLayoutEffect(() => {
    if (kept) setFilmSuspended(!onRoute);
    return () => setFilmSuspended(false);
  }, [kept, onRoute]);

  if (!kept) return null;

  // The wrapper lays the film over the page, and its z-index is the stacking
  // context that keeps the film's own loader (z-index 8) under the site nav.
  return (
    <div className={`film-host ${onRoute ? "is-showing" : "is-hidden"}`} aria-hidden={!onRoute} inert={!onRoute}>
      <Suspense fallback={loading}>
        <Film />
      </Suspense>
    </div>
  );
}
