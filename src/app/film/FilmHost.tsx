import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { canKeepAlive } from "../cinematic/keepAlive";
import { setFilmSuspended } from "../../lib/filmSuspend";
import "../wake.css";
import "./filmHost.css";

/** The address of the skills film. */
export const FILM_PATH = "/lab/got";

const Film = lazy(() => import("../../features/lab/SkillsTitlesPage").then((m) => ({ default: m.SkillsTitlesPage })));

// The film's own loader is in its chunk; until that arrives, the same plate
// in plain markup (styled by filmHost.css) so the wait reads as one thing.
const loading = (
  <div className="film-host__loading" role="status" aria-live="polite">
    <p className="titles__loader-kicker">The working years</p>
    <p className="titles__loader-caption">Loading the film</p>
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
  const [keepAlive] = useState(canKeepAlive);
  const [kept, setKept] = useState(false);
  if (keepAlive && onRoute && !kept) setKept(true);

  useLayoutEffect(() => {
    if (kept) setFilmSuspended(!onRoute);
    return () => setFilmSuspended(false);
  }, [kept, onRoute]);

  // Back to a paused film: like the universe, it flickers back to life rather
  // than snapping on. Only after it has been put away, never on first visit.
  // The route change is noticed during render (the derived-state pattern), so
  // the wake class is on the very first frame back.
  const [waking, setWaking] = useState(false);
  const [wasOnRoute, setWasOnRoute] = useState(onRoute);
  if (onRoute !== wasOnRoute) {
    setWasOnRoute(onRoute);
    if (onRoute && kept) setWaking(true);
  }
  useEffect(() => {
    if (!waking) return;
    const timer = window.setTimeout(() => setWaking(false), 1100);
    return () => window.clearTimeout(timer);
  }, [waking]);

  if (!keepAlive || !kept) {
    return onRoute ? <Suspense fallback={loading}>{<Film />}</Suspense> : null;
  }
  return (
    <div
      className={`film-host ${onRoute ? "is-showing" : "is-hidden"}${waking ? " is-waking" : ""}`}
      aria-hidden={!onRoute}
      inert={!onRoute}
    >
      <Suspense fallback={loading}>
        <Film />
      </Suspense>
    </div>
  );
}
