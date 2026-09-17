import { useCallback, useMemo, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { AtmosphereBackdrop } from "./components/AtmosphereBackdrop";
import { GalleryBackdrop, type SceneLoadState } from "./components/GalleryBackdrop";
import { SceneLoader } from "./components/SceneLoader";
import { BackdropTintContext } from "./lib/backdropTint";
import { useShowcaseProjects } from "./lib/useShowcaseProjects";

const DEFAULT_TINT = "#6f7787";

// The cinematic fragment is for large screens with a mouse, where it adds
// something; phones and reduced-motion visitors keep the light terrain.
const canShowCinematicScene = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(min-width: 900px) and (pointer: fine)").matches &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const prefetchCinematic = () => {
  void import("../../App");
};

/** Shell of the redesigned portfolio: atmosphere, pills, and the page. */
export function ShowcaseLayout() {
  const [tint, setTintState] = useState(DEFAULT_TINT);
  const setTint = useCallback((color: string | null) => setTintState(color ?? DEFAULT_TINT), []);
  const context = useMemo(() => ({ setTint }), [setTint]);
  const { personal, projects } = useShowcaseProjects();
  const [sceneEnabled] = useState(canShowCinematicScene);
  const [sceneState, setSceneState] = useState<SceneLoadState>({ phase: "idle" });
  const sceneReady = sceneState.phase === "ready";

  return (
    <BackdropTintContext.Provider value={context}>
      <div className="showcase">
        <AtmosphereBackdrop tint={tint} paused={sceneReady} />
        {sceneEnabled ? (
          <div className={`showcase-gallery${sceneReady ? " is-ready" : ""}`}>
            <GalleryBackdrop projects={projects} onState={setSceneState} />
            <div className="showcase-gallery__shade" />
          </div>
        ) : null}
        {sceneEnabled ? <SceneLoader state={sceneState} /> : null}
        <a href="#showcase-main" className="skip-link">
          Skip to main content
        </a>
        <nav className="showcase-pills" aria-label="Site">
          <Link to="/portfolio" className="showcase-pill">
            Work
          </Link>
          <NavLink to="/resume" className="showcase-pill">
            Resume
          </NavLink>
          <NavLink
            to="/cinematic"
            className="showcase-pill"
            onMouseEnter={prefetchCinematic}
            onFocus={prefetchCinematic}
          >
            Cinematic
          </NavLink>
          {personal?.email ? (
            <a href={`mailto:${personal.email}`} className="showcase-pill">
              Email
            </a>
          ) : null}
        </nav>
        <main id="showcase-main" className="showcase__main">
          <Outlet />
        </main>
      </div>
    </BackdropTintContext.Provider>
  );
}
