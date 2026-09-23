import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { CINEMATIC_PATH, canKeepAlive } from "../../app/cinematic/keepAlive";
import { FILM_PATH, FilmHost } from "../../app/film/FilmHost";
import { isCinematicStill, setCinematicLaunch, subscribeCinematicLaunch } from "../../app/cinematic/launchStore";
import { AtmosphereBackdrop } from "./components/AtmosphereBackdrop";
import { SceneStage } from "./components/SceneStage";
import { NavHint, type NavHintId } from "./components/NavHint";
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
  // Which nav pill the pointer is on; the hint panel under the nav follows it.
  const [hovered, setHovered] = useState<NavHintId | null>(null);
  // The hint panel is as wide as the row of pills, measured (the row wraps).
  const pillsRef = useRef<HTMLElement>(null);
  const [navWidth, setNavWidth] = useState<number | null>(null);
  useEffect(() => {
    const nav = pillsRef.current;
    if (!nav) return;
    const measure = () => setNavWidth(nav.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);
  const setTint = useCallback((color: string | null) => setTintState(color ?? DEFAULT_TINT), []);
  const { personal, projects } = useShowcaseProjects();
  const techStack = useTechStackQuery().data?.payload;
  const release = useReleaseQuery().data;
  const portfolio = useMemo(
    () =>
      release && {
        cores: release.collections.portfolioCores,
        entries: release.collections.portfolioEntries,
        media: release.media,
      },
    [release],
  );
  // A job's labels and fly-by come from its skill uses, each a link into the
  // master list drawn by the record's name, and each shown only where its
  // surfaces say (Admin -> Experience -> Skills used). The fly-by pool is the
  // prose memories plus the uses ticked for it, drawn in the use's style. A
  // release from before the master list has no uses and shows its typed labels.
  const jobs = useMemo<SceneJob[]>(() => {
    const nameBySlug = new Map((release?.collections.technologies ?? []).map((record) => [record.slug, record.name]));
    const asMemoryType = (style?: string) => (style === "code" ? "code" : style === "handwritten" ? "memory" : "tech");
    return (release?.collections.experiences ?? []).map((entry) => {
      const uses = (entry.skillsUsed ?? [])
        .map((use) => ({ ...use, name: nameBySlug.get(use.technologySlug) }))
        .filter((use): use is typeof use & { name: string } => Boolean(use.name));
      const labels = uses.filter((use) => use.surfaces.includes("moonLabel")).map((use) => use.name);
      const flyBy = uses
        .filter((use) => use.surfaces.includes("flyBy"))
        .map((use) => ({ type: asMemoryType(use.style), text: use.name }));
      const prose = entry.jobMemories.map((memory) => ({
        type: memory.style ? asMemoryType(memory.style) : memory.type,
        text: memory.text,
      }));
      return {
        slug: entry.slug,
        company: entry.company,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        droneIntroText: entry.droneIntroText,
        positions: entry.positions,
        memories: uses.length > 0 ? [...prose, ...flyBy] : entry.jobMemories,
        tech: uses.length > 0 ? labels : entry.jobTech.map((tech) => tech.label),
      };
    });
  }, [release]);
  const { pathname } = useLocation();
  // Only the index lets the scene take the wheel; project pages scroll.
  const onIndex = pathname === "/";
  // While the cinematic experience is open the scenes pause underneath it where
  // both can stay alive; elsewhere they unload and rebuild on return. A visit
  // that starts on the experience doesn't start them at all.
  const onCinematic = pathname === CINEMATIC_PATH;
  // The skills film covers the page the same way; the previews pause under it.
  const onFilm = pathname === FILM_PATH;
  // While the experience's last frame is the backdrop, the previews wait.
  const cinematicStill = useSyncExternalStore(subscribeCinematicLaunch, isCinematicStill, isCinematicStill);
  const [keepScenes] = useState(canKeepAlive);
  const [scenesStarted, setScenesStarted] = useState(false);
  if (!onCinematic && !onFilm && !scenesStarted) setScenesStarted(true);
  const runScenes = scenesStarted && (!(onCinematic || onFilm) || keepScenes);
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
        <AtmosphereBackdrop tint={tint} paused={sceneShowing || onCinematic || onFilm || cinematicStill} />
        {sceneEnabled && runScenes ? (
          <SceneStage
            projects={projects}
            techStack={techStack}
            highlights={highlights}
            portfolio={portfolio}
            profile={release?.profile}
            jobs={jobs}
            interactive={onIndex && !cinematicStill}
            paused={onCinematic || onFilm || cinematicStill}
            showPanel={!pathname.startsWith("/portfolio/") && !onFilm}
            focusProjectId={focusProjectId}
            onShowing={setSceneShowing}
          />
        ) : null}
        <a href="#showcase-main" className="skip-link">
          Skip to main content
        </a>
        <nav
          ref={pillsRef}
          className="showcase-pills"
          aria-label="Site"
          onMouseLeave={() => setHovered(null)}
        >
          {/* `end`: Home is current only on the index, not on every route under it. */}
          <NavLink to="/" end className="showcase-pill" onMouseEnter={() => setHovered("home")} onFocus={() => setHovered("home")}>
            Home
          </NavLink>
          <NavLink to="/lab/got" className="showcase-pill" onMouseEnter={() => setHovered("tech")} onFocus={() => setHovered("tech")}>
            Tech Progression
          </NavLink>
          <NavLink to="/resume" className="showcase-pill" onMouseEnter={() => setHovered("resume")} onFocus={() => setHovered("resume")}>
            Résumé
          </NavLink>
          <NavLink
            to="/universe"
            className="showcase-pill"
            onMouseEnter={() => {
              setHovered("cinematic");
              prefetchCinematic();
            }}
            onFocus={() => {
              setHovered("cinematic");
              prefetchCinematic();
            }}
            onClick={(event) => {
              // Same hand-off as the hint panel, so both routes in behave alike.
              if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              setCinematicLaunch("loading");
            }}
          >
            Universe
          </NavLink>
          {personal?.email ? (
            <a href={`mailto:${personal.email}`} className="showcase-pill" onMouseEnter={() => setHovered("contact")} onFocus={() => setHovered("contact")}>
              Contact
            </a>
          ) : null}
        </nav>
        <div
          className="showcase-nav-hint"
          style={navWidth ? { width: navWidth } : undefined}
          onMouseLeave={() => setHovered(null)}
        >
          <NavHint hovered={hovered} onEnterCinematic={() => setHovered(null)} />
        </div>
        <main id="showcase-main" className="showcase__main">
          <Outlet />
        </main>
        <FilmHost />
      </div>
    </BackdropTintContext.Provider>
  );
}
