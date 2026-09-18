import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setCinematicSuspended } from "../../lib/cinematicSuspend";
import { CINEMATIC_PATH, canKeepAlive } from "./keepAlive";
import { getCinematicLaunch, setCinematicLaunch, subscribeCinematicLaunch } from "./launchStore";
import "./cinematicHost.css";

const CinematicExperience = lazy(() => import("../../App"));

const loading = <div className="route-loading">Loading cinematic experience...</div>;

/**
 * Hosts the cinematic experience above the routes. Where allowed, once
 * visited it stays mounted: leaving pauses it (render loop, audio and input;
 * see lib/cinematicSuspend), coming back shows it where it was.
 *
 * Launching it from the portfolio loads it *behind* the page first: its own
 * loader stands in as the page's background while the site stays usable, and
 * once the loader is waiting on its Enter button the page fades away and the
 * experience takes the screen. Elsewhere it mounts only while its route is open.
 */
export function CinematicHost() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onRoute = pathname === CINEMATIC_PATH;
  const launch = useSyncExternalStore(subscribeCinematicLaunch, getCinematicLaunch, getCinematicLaunch);
  const preloading = launch !== "idle" && !onRoute;
  const showing = onRoute || launch === "ready";

  const [keepAlive] = useState(canKeepAlive);
  const [kept, setKept] = useState(false);
  // Mount on the first visit (or when a launch starts) and keep it from then on.
  if (keepAlive && (onRoute || preloading) && !kept) setKept(true);

  const hostRef = useRef<HTMLDivElement>(null);
  const showingRef = useRef(showing);

  useLayoutEffect(() => {
    showingRef.current = showing;
    // Running while it loads behind the page, paused only when truly put away.
    if (kept) setCinematicSuspended(!showing && !preloading);
  }, [kept, showing, preloading]);

  // The loader's Enter gate appearing means the experience is ready for the
  // visitor: the page can step aside. Watching the DOM keeps the handover out
  // of the 3D app itself.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || launch !== "loading") return;
    const check = () => {
      if (!host.querySelector(".cosmos-loader__entry-gate")) return false;
      setCinematicLaunch("ready");
      return true;
    };
    if (check()) return;
    const observer = new MutationObserver(check);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [launch]);

  // Once the page has faded, the experience owns the screen and the address.
  useEffect(() => {
    if (launch !== "ready" || onRoute) return;
    const timer = window.setTimeout(() => navigate(CINEMATIC_PATH), 700);
    return () => window.clearTimeout(timer);
  }, [launch, navigate, onRoute]);

  // The launch ends when the visitor comes back from the experience, not
  // while it is still handing over.
  const enteredRoute = useRef(false);
  useEffect(() => {
    if (onRoute) {
      enteredRoute.current = true;
      return;
    }
    if (enteredRoute.current && launch !== "idle") {
      enteredRoute.current = false;
      setCinematicLaunch("idle");
    }
  }, [launch, onRoute]);

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
    return onRoute ? <Suspense fallback={loading}>{<CinematicExperience />}</Suspense> : null;
  }

  const state = showing ? "is-showing" : preloading ? "is-preloading" : "is-hidden";

  return (
    <div
      ref={hostRef}
      className={`cinematic-host ${state}`}
      aria-hidden={!showing}
      inert={!showing}
    >
      <Suspense fallback={loading}>
        <CinematicExperience />
      </Suspense>
    </div>
  );
}
