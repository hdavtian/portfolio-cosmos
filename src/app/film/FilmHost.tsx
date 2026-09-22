import { lazy, Suspense, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { canKeepAlive } from "../cinematic/keepAlive";
import { setFilmSuspended } from "../../lib/filmSuspend";
import "./filmHost.css";

/** The address of the skills film. */
export const FILM_PATH = "/lab/got";

const Film = lazy(() => import("../../features/lab/SkillsTitlesPage").then((m) => ({ default: m.SkillsTitlesPage })));

const loading = <div className="route-loading">Loading the film…</div>;

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

  if (!keepAlive || !kept) {
    return onRoute ? <Suspense fallback={loading}>{<Film />}</Suspense> : null;
  }
  return (
    <div className={`film-host ${onRoute ? "is-showing" : "is-hidden"}`} aria-hidden={!onRoute} inert={!onRoute}>
      <Suspense fallback={loading}>
        <Film />
      </Suspense>
    </div>
  );
}
