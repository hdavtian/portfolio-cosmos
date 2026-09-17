import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { setCinematicSuspended } from "../../lib/cinematicSuspend";
import { CINEMATIC_PATH, canKeepAlive } from "./keepAlive";
import "./cinematicHost.css";

const CinematicExperience = lazy(() => import("../../App"));

const loading = <div className="route-loading">Loading cinematic experience...</div>;

/**
 * Hosts the cinematic experience above the routes. Where allowed, once
 * visited it stays mounted: leaving slides it away and pauses it (render
 * loop, audio and input; see lib/cinematicSuspend), coming back slides it in
 * where it was. Elsewhere it mounts only while its route is open.
 */
export function CinematicHost() {
  const { pathname } = useLocation();
  const showing = pathname === CINEMATIC_PATH;
  const [keepAlive] = useState(canKeepAlive);
  const [kept, setKept] = useState(false);
  // Mount on the first visit and keep it from then on.
  if (keepAlive && showing && !kept) setKept(true);

  const hostRef = useRef<HTMLDivElement>(null);
  const showingRef = useRef(showing);

  useLayoutEffect(() => {
    showingRef.current = showing;
    if (kept) setCinematicSuspended(!showing);
  }, [kept, showing]);

  // If the browser drops the hidden experience's graphics under memory
  // pressure, let it go; the next visit loads it fresh.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onContextLost = () => {
      if (!showingRef.current) {
        setKept(false);
        setCinematicSuspended(false);
      }
    };
    host.addEventListener("webglcontextlost", onContextLost, true);
    return () => host.removeEventListener("webglcontextlost", onContextLost, true);
  }, [kept]);

  if (!keepAlive || !kept) {
    return showing ? <Suspense fallback={loading}>{<CinematicExperience />}</Suspense> : null;
  }

  return (
    <div
      ref={hostRef}
      className={`cinematic-host ${showing ? "is-showing" : "is-hidden"}`}
      aria-hidden={!showing}
      inert={!showing}
    >
      <Suspense fallback={loading}>
        <CinematicExperience />
      </Suspense>
    </div>
  );
}
