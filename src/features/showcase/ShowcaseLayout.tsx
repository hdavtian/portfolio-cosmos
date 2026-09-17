import { useCallback, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AtmosphereBackdrop } from "./components/AtmosphereBackdrop";
import { SceneStage } from "./components/SceneStage";
import { usePortfolioCoresQuery, useResumeQuery, useTechStackQuery } from "../../lib/query/contentQueries";
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
  const portfolioCores = usePortfolioCoresQuery().data?.payload;
  const experience = useResumeQuery().data?.payload.experience;
  const jobs = useMemo<SceneJob[]>(
    () =>
      (experience ?? []).map((entry) => {
        // The published resume carries the 3D site's extras too.
        const extras = entry as typeof entry & {
          droneIntroText?: string;
          jobMemories?: Array<{ type: string; text: string }>;
          jobTech?: Array<{ label: string }>;
        };
        return {
          id: entry.id,
          company: entry.company,
          location: entry.location,
          startDate: entry.startDate,
          endDate: entry.endDate,
          droneIntroText: extras.droneIntroText,
          positions: entry.positions,
          memories: extras.jobMemories ?? [],
          tech: (extras.jobTech ?? []).map((tech) => tech.label),
        };
      }),
    [experience],
  );
  // Only the index lets the scene take the wheel; project pages scroll.
  const onIndex = useLocation().pathname === "/";
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
        <AtmosphereBackdrop tint={tint} paused={sceneShowing} />
        {sceneEnabled ? (
          <SceneStage
            projects={projects}
            techStack={techStack}
            highlights={highlights}
            portfolioCores={portfolioCores}
            jobs={jobs}
            interactive={onIndex}
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
