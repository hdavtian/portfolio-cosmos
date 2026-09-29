import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { skillsDataFromRelease } from "../lab/skillsData";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { CINEMATIC_PATH, canKeepAlive } from "../../app/cinematic/keepAlive";
import { FILM_PATH, FilmHost } from "../../app/film/FilmHost";
import { isCinematicStill, subscribeCinematicLaunch } from "../../app/cinematic/launchStore";
import { AtmosphereBackdrop } from "./components/AtmosphereBackdrop";
import { SceneStage } from "./components/SceneStage";
import { NavHint, type NavHintId } from "./components/NavHint";
import { useReleaseQuery, useTechStackQuery } from "../../lib/query/contentQueries";
import type { SceneJob } from "./scenes/types";
import { BackdropTintContext } from "./lib/backdropTint";
import { useShowcaseProjects } from "./lib/useShowcaseProjects";

const DEFAULT_TINT = "#6f7787";

/**
 * The spinner inside a nav pill, while the page it leads to is on its way.
 * Marked aria-hidden: the pill's own text already names the destination, and
 * `aria-busy` on the pill is what carries the state to a screen reader.
 */
function Busy({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="showcase-pill__busy" aria-hidden="true" />;
}

/**
 * A pill's classes. NavLink only adds `active` for itself when className is a
 * string, so passing a function here means spelling it out.
 */
const pillWith = (isActive: boolean, busy: boolean) =>
  `showcase-pill${isActive ? " active" : ""}${busy ? " is-busy" : ""}`;

// The cinematic fragment is for large screens with a mouse, where it adds
// something; phones and reduced-motion visitors keep the light terrain.
const canShowCinematicScene = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(min-width: 900px) and (pointer: fine)").matches &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const importCinematic = () => import("../../App");
const prefetchCinematic = () => {
  void importCinematic();
};

/**
 * The nav owns the state only the nav cares about -- which pill the pointer is
 * on, and which one is waiting for its page. Held a level up, in the layout,
 * every hover re-rendered the layout's children: the scene stage, and the whole
 * of the progression film. Hovering a link re-rendered a 3D page, which is why
 * the canvas blinked black and everything went slow under the pointer.
 */
function ShowcaseNav({ email }: { email: string | undefined }) {
  const { pathname } = useLocation();
  const [hovered, setHovered] = useState<NavHintId | null>(null);
  const [pending, setPending] = useState<string | null>(null);
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

  // An ordinary route is there as soon as the address is; the universe waits on
  // its chunk and clears itself when that import resolves (see its pill below).
  // Noticed during render, the way the hosts do it, so the spinner goes on the
  // same frame the page arrives rather than one after.
  if (pending && pending !== CINEMATIC_PATH && pathname === pending) setPending(null);

  const pillClass =
    (path: string) =>
    ({ isActive }: { isActive: boolean }) =>
      pillWith(isActive, path === pending);

  return (
    <>
      <nav ref={pillsRef} className="showcase-pills" aria-label="Site" onMouseLeave={() => setHovered(null)}>
        {/* `end`: Home is current only on the index, not on every route under it. */}
        <NavLink to="/" end className={pillClass("/")} onMouseEnter={() => setHovered("home")} onFocus={() => setHovered("home")} onClick={() => setPending("/")}>
          Home
          <Busy on={pending === "/"} />
        </NavLink>
        <NavLink to={FILM_PATH} className={pillClass(FILM_PATH)} onMouseEnter={() => setHovered("tech")} onFocus={() => setHovered("tech")} onClick={() => setPending(FILM_PATH)}>
          Tech Progression
          <Busy on={pending === FILM_PATH} />
        </NavLink>
        <NavLink to="/resume" className={pillClass("/resume")} onMouseEnter={() => setHovered("resume")} onFocus={() => setHovered("resume")} onClick={() => setPending("/resume")}>
          Résumé
          <Busy on={pending === "/resume"} />
        </NavLink>
        {/* An ordinary link: the address changes on the click, and the loader
            shows under this nav until the visitor enters. It used to hold the
            navigation back until a 4.4MB chunk had mounted and painted its
            gate, which left the address stale for as long as that took -- and
            fired the deferred navigation even if the visitor had since gone
            somewhere else. */}
        <NavLink
          to={CINEMATIC_PATH}
          className={pillClass(CINEMATIC_PATH)}
          onMouseEnter={() => {
            setHovered("cinematic");
            prefetchCinematic();
          }}
          onFocus={() => {
            setHovered("cinematic");
            prefetchCinematic();
          }}
          onClick={() => {
            // Already cached if it was prefetched on hover, so this resolves
            // exactly when the chunk is ready to render.
            setPending(CINEMATIC_PATH);
            void importCinematic().finally(() => setPending(null));
          }}
        >
          Universe
          <Busy on={pending === CINEMATIC_PATH} />
        </NavLink>
        {email ? (
          <a href={`mailto:${email}`} className="showcase-pill" onMouseEnter={() => setHovered("contact")} onFocus={() => setHovered("contact")}>
            Contact
          </a>
        ) : null}
      </nav>
      {/* Rendered only while a pill is hovered. It used to be an always-present
          panel of at least 320px with nothing in it, which took the pointer
          under the nav and turned the cursor to a finger over empty screen. */}
      <div
        className="showcase-nav-hint"
        style={navWidth ? { width: navWidth } : undefined}
        onMouseLeave={() => setHovered(null)}
      >
        {hovered ? <NavHint hovered={hovered} onEnterCinematic={() => setHovered(null)} /> : null}
      </div>
    </>
  );
}

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
      const prose = entry.jobMemories.map((memory) => ({ type: asMemoryType(memory.style), text: memory.text }));
      return {
        slug: entry.slug,
        company: entry.company,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        droneIntroText: entry.droneIntroText,
        positions: entry.positions,
        memories: [...prose, ...flyBy],
        tech: labels,
      };
    });
  }, [release]);
  // The film's timeline, for its preview on the home page.
  const skills = useMemo(() => {
    if (!release) return { places: [], spans: [], lineOf: new Map(), lineNames: new Map(), rolled: new Set<string>() };
    const { places, spans, lineOf, lineNames, rolled } = skillsDataFromRelease(release);
    return { places, spans, lineOf, lineNames, rolled };
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
            skills={skills}
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
        <ShowcaseNav email={personal?.email} />
        <main id="showcase-main" className="showcase__main">
          <Outlet />
        </main>
        <FilmHost />
      </div>
    </BackdropTintContext.Provider>
  );
}
