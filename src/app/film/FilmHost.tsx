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

  // The film used to stay mounted once visited, so that coming back resumed it
  // in place. That cost more than it bought: its three.js scene, renderer and
  // three canvases stayed resident on every other page, and its two animation
  // frames kept being scheduled at full rate while drawing nothing. Returning
  // to it now starts it from the top, which is the agreed trade.
  useLayoutEffect(() => {
    setFilmSuspended(false);
    return () => setFilmSuspended(false);
  }, []);

  return onRoute ? <Suspense fallback={loading}>{<Film />}</Suspense> : null;
}
