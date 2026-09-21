import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { CINEMATIC_PATH, canKeepAlive } from "../../app/cinematic/keepAlive";
import { isCinematicStill, setCinematicLaunch, subscribeCinematicLaunch } from "../../app/cinematic/launchStore";
import { AtmosphereBackdrop } from "./components/AtmosphereBackdrop";
import { SceneStage } from "./components/SceneStage";
import { useReleaseQuery, useTechStackQuery } from "../../lib/query/contentQueries";
import type { SceneJob } from "./scenes/types";
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
  const { personal, projects } = useShowcaseProjects();
  const techStack = useTechStackQuery().data?.payload;
  const release = useReleaseQuery().data;
  const portfolio = useMemo(
    () =>
      release && {
        cores: release.collections.portfolioCores,
        entries: release.collections.portfolioEntries,
        mediaUrl: release.mediaUrl,
      },
    [release],
  );
  const jobs = useMemo<SceneJob[]>(
    () =>
      (release?.collections.experiences ?? []).map((entry) => ({
        slug: entry.slug,
        company: entry.company,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        droneIntroText: entry.droneIntroText,
        positions: entry.positions,
        memories: entry.jobMemories,
        tech: entry.jobTech.map((tech) => tech.label),
      })),
    [release],
  );
  const { pathname } = useLocation();
  // Only the index lets the scene take the wheel; project pages scroll.
  const onIndex = pathname === "/";
  // While the cinematic experience is open the scenes pause underneath it where
  // both can stay alive; elsewhere they unload and rebuild on return. A visit
  // that starts on the experience doesn't start them at all.
  const onCinematic = pathname === CINEMATIC_PATH;
  // While the experience's last frame is the backdrop, the previews wait.
  const cinematicStill = useSyncExternalStore(subscribeCinematicLaunch, isCinematicStill, isCinematicStill);
  const [keepScenes] = useState(canKeepAlive);
  const [scenesStarted, setScenesStarted] = useState(false);
  if (!onCinematic && !scenesStarted) setScenesStarted(true);
  const runScenes = scenesStarted && (!onCinematic || keepScenes);
  const [focusProjectId, setFocusProject] = useState<string | null>(null);
  const [sceneEnabled] = useState(canShowCinematicScene);
  const [sceneShowing, setSceneShowing] = useState(false);
  const [highlights, setHighlightsState] = useState<string[]>([]);
  const setHighlights = useCallback((technologies: string[]) => setHighlightsState(technologies), []);
  const context = useMemo(
    () => ({ setTint, setHighlights, setFocusProject, sceneShowing }),
    [setTint, setHighlights, sceneShowing],
  );

  return (
    <BackdropTintContext.Provider value={context}>
      <div className="showcase">
        <AtmosphereBackdrop tint={tint} paused={sceneShowing || onCinematic || cinematicStill} />
        {sceneEnabled && runScenes ? (
          <SceneStage
            projects={projects}
            techStack={techStack}
            highlights={highlights}
            portfolio={portfolio}
            jobs={jobs}
            interactive={onIndex && !cinematicStill}
            paused={onCinematic || cinematicStill}
            showGateway={!pathname.startsWith("/portfolio/")}
            focusProjectId={focusProjectId}
            onShowing={setSceneShowing}
          />
        ) : null}
        <a href="#showcase-main" className="skip-link">
          Skip to main content
        </a>
        <nav className="showcase-pills" aria-label="Site">
          <Link to="/" className="showcase-pill">
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
            onClick={(event) => {
              // Same hand-off as the gateway panel, so both routes in behave alike.
              if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              setCinematicLaunch("loading");
            }}
          >
            Cinematic
          </NavLink>
          {personal?.email ? (
            <a href={`mailto:${personal.email}`} className="showcase-pill">
              Contact
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
