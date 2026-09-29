import { lazy, Suspense, useLayoutEffect } from "react";
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

  // Not kept between visits, which was measured twice and both times was the
  // slower of the two -- even after its animation frames were properly
  // cancelled rather than left spinning, and even after a hover stopped
  // re-rendering the page underneath. Keeping it roughly doubled the cost of
  // coming back (about 6s of blocked main thread against about 3s to build a
  // fresh one) and made leaving it cost seconds where unmounting costs about a
  // tenth of one. It also held five canvases on every other page against two.
  useLayoutEffect(() => {
    setFilmSuspended(false);
    return () => setFilmSuspended(false);
  }, []);

  // The wrapper lays the film over the page, and its z-index is the stacking
  // context that keeps the film's own loader (z-index 8) under the site nav.
  return onRoute ? (
    <div className="film-host is-showing">
      <Suspense fallback={loading}>
        <Film />
      </Suspense>
    </div>
  ) : null;
}
