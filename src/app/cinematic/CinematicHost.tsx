import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { setCinematicSuspended } from "../../lib/cinematicSuspend";
import "./cinematicHost.css";

const CinematicExperience = lazy(() => import("../../App"));

export const CINEMATIC_PATH = "/cinematic";

/**
 * Keeping the 3D experience alive costs its full memory for the rest of the
 * visit, so only desktops with a mouse and at least 8 GB of RAM keep it.
 * Browsers that don't report memory (Firefox, Safari) keep today's behaviour:
 * leaving the experience unloads it.
 */
const canKeepAlive = () => {
  if (typeof window === "undefined") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;
  return window.matchMedia("(min-width: 900px) and (pointer: fine)").matches && memory >= 8;
};

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
