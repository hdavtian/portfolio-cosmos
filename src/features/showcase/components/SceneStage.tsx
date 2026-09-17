import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { TechStackTreeNode } from "../../../lib/api/contentV2";
import type { PortfolioCoreSeed } from "../../fast/types";
import type { ShowcaseProject } from "../lib/useShowcaseProjects";
import { SCENE_DEFINITIONS } from "../scenes/registry";
import type { ShowcaseScene } from "../scenes/types";

interface SceneStageProps {
  projects: ShowcaseProject[];
  techStack: TechStackTreeNode[] | undefined;
  /** Technologies of the project open on the page. */
  highlights: string[];
  portfolioCores: PortfolioCoreSeed[] | undefined;
  /** Project whose preview is open on the page. */
  focusProjectId: string | null;
  /** Called once any scene is on screen (the terrain can pause). */
  onShowing: (showing: boolean) => void;
}

type SceneStatus = { phase: "waiting" | "loading" | "ready" | "failed"; progress: number };

/** How long a scene stays before the auto-tour moves on. */
const TOUR_INTERVAL_MS = 45_000;
/** The tour waits until the pointer has been still this long. */
const TOUR_IDLE_MS = 6_000;
/** Matches the glitch-out animation in showcase.css. */
const LEAVE_MS = 420;
const ENTER_MS = 900;
/** Preloading scenes update at about 10 fps. */
const PRELOAD_STEP_MS = 100;
const TOUR_STORAGE_KEY = "showcase:auto-tour";

const readTourPreference = () => {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

const prefetchCinematic = () => {
  void import("../../../App");
};

/**
 * Fragments of the cinematic universe behind the portfolio: one renderer, one
 * visible scene at a time, glitch transitions, a switcher and an auto-tour.
 */
export function SceneStage({ projects, techStack, highlights, portfolioCores, focusProjectId, onShowing }: SceneStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [statuses, setStatuses] = useState<Record<string, SceneStatus>>(() =>
    Object.fromEntries(SCENE_DEFINITIONS.map((scene) => [scene.id, { phase: "waiting", progress: 0 }])),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [transition, setTransition] = useState<"leaving" | "entering" | null>(null);
  const [autoTour, setAutoTour] = useState(readTourPreference);

  // Live values for the render loop, which is set up once.
  const scenesRef = useRef(new Map<string, ShowcaseScene>());
  const activeRef = useRef<string | null>(null);
  const transitionRef = useRef<"leaving" | "entering" | null>(null);
  const autoTourRef = useRef(autoTour);
  const highlightsRef = useRef(highlights);
  const focusRef = useRef(focusProjectId);
  const onShowingRef = useRef(onShowing);
  const lastInteractionRef = useRef(performance.now());
  const activeSinceRef = useRef(performance.now());
  useLayoutEffect(() => {
    autoTourRef.current = autoTour;
    highlightsRef.current = highlights;
    focusRef.current = focusProjectId;
    onShowingRef.current = onShowing;
  });

  const hasData = projects.length > 0 && techStack !== undefined && portfolioCores !== undefined;
  const dataRef = useRef({ projects, techStack: techStack ?? [], portfolioCores: portfolioCores ?? [] });
  useLayoutEffect(() => {
    dataRef.current = { projects, techStack: techStack ?? [], portfolioCores: portfolioCores ?? [] };
  });

  const switchTo = useCallback((id: string) => {
    const scene = scenesRef.current.get(id);
    if (!scene || scene.progress() < 1 || transitionRef.current || activeRef.current === id) return;
    transitionRef.current = "leaving";
    setTransition("leaving");
    window.setTimeout(() => {
      activeRef.current = id;
      activeSinceRef.current = performance.now();
      setActiveId(id);
      onShowingRef.current(true);
      transitionRef.current = "entering";
      setTransition("entering");
      window.setTimeout(() => {
        transitionRef.current = null;
        setTransition(null);
      }, ENTER_MS);
    }, LEAVE_MS);
  }, []);

  useEffect(() => {
    for (const scene of scenesRef.current.values()) scene.setHighlights?.(highlights);
  }, [highlights]);

  useEffect(() => {
    for (const scene of scenesRef.current.values()) scene.setFocusProject?.(focusProjectId);
  }, [focusProjectId]);

  useEffect(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, autoTour ? "on" : "off");
    } catch {
      // Preference just isn't remembered.
    }
  }, [autoTour]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasData) return;
    let disposed = false;
    let cleanup = () => {};

    void import("three").then(async (THREE) => {
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x03050a, 1);
      host.appendChild(renderer.domElement);

      const size = { width: 1, height: 1 };
      const resize = () => {
        size.width = host.clientWidth;
        size.height = host.clientHeight;
        renderer.setSize(size.width, size.height, false);
        for (const scene of scenesRef.current.values()) scene.resize(size.width, size.height);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();

      const pointer = { x: 0, y: 0 };
      const smoothed = { x: 0, y: 0 };
      const onPointerMove = (event: PointerEvent) => {
        pointer.x = event.clientX / window.innerWidth - 0.5;
        pointer.y = event.clientY / window.innerHeight - 0.5;
        lastInteractionRef.current = performance.now();
      };
      window.addEventListener("pointermove", onPointerMove, { passive: true });

      const reported = new Map<string, string>();
      const report = (id: string, status: SceneStatus) => {
        const key = `${status.phase}:${Math.round(status.progress * 100)}`;
        if (reported.get(id) === key) return;
        reported.set(id, key);
        setStatuses((current) => ({ ...current, [id]: status }));
      };

      let frame = 0;
      let last = performance.now();
      let preloadAccumulator = 0;
      const render = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        smoothed.x += (pointer.x - smoothed.x) * (1 - Math.exp(-4 * dt));
        smoothed.y += (pointer.y - smoothed.y) * (1 - Math.exp(-4 * dt));

        preloadAccumulator += dt * 1000;
        const preloadTick = preloadAccumulator >= PRELOAD_STEP_MS;
        const preloadDt = preloadAccumulator / 1000;
        if (preloadTick) preloadAccumulator = 0;

        for (const definition of SCENE_DEFINITIONS) {
          const scene = scenesRef.current.get(definition.id);
          if (!scene) continue;
          const progress = scene.progress();
          if (definition.id === activeRef.current) {
            scene.update(dt, smoothed, true);
          } else if (progress < 1 && preloadTick) {
            scene.update(preloadDt, smoothed, false);
          }
          report(definition.id, { phase: progress >= 1 ? "ready" : "loading", progress });
        }

        // First showing: the first scene in tour order that is ready, unless an
        // earlier one is still loading (the tour order is the intended opening).
        if (!activeRef.current) {
          for (const definition of SCENE_DEFINITIONS) {
            const scene = scenesRef.current.get(definition.id);
            if (!scene) break;
            if (scene.progress() >= 1) {
              activeRef.current = definition.id;
              activeSinceRef.current = now;
              setActiveId(definition.id);
              onShowingRef.current(true);
            }
            break;
          }
        }

        // Auto-tour to the next ready scene while the visitor is idle.
        if (
          autoTourRef.current &&
          activeRef.current &&
          !transitionRef.current &&
          now - activeSinceRef.current > TOUR_INTERVAL_MS &&
          now - lastInteractionRef.current > TOUR_IDLE_MS
        ) {
          const index = SCENE_DEFINITIONS.findIndex((definition) => definition.id === activeRef.current);
          for (let step = 1; step < SCENE_DEFINITIONS.length; step += 1) {
            const candidate = SCENE_DEFINITIONS[(index + step) % SCENE_DEFINITIONS.length];
            if ((scenesRef.current.get(candidate.id)?.progress() ?? 0) >= 1) {
              switchTo(candidate.id);
              break;
            }
          }
        }

        const active = activeRef.current ? scenesRef.current.get(activeRef.current) : null;
        if (active) renderer.render(active.scene, active.camera);
        frame = requestAnimationFrame(render);
      };

      const onVisibility = () => {
        cancelAnimationFrame(frame);
        if (!document.hidden) {
          last = performance.now();
          frame = requestAnimationFrame(render);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      frame = requestAnimationFrame(render);

      cleanup = () => {
        cancelAnimationFrame(frame);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pointermove", onPointerMove);
        observer.disconnect();
        for (const scene of scenesRef.current.values()) scene.dispose();
        scenesRef.current.clear();
        renderer.dispose();
        renderer.domElement.remove();
      };

      // Build scenes in tour order; each starts preloading as soon as it exists.
      for (const definition of SCENE_DEFINITIONS) {
        if (disposed) return;
        setStatuses((current) => ({ ...current, [definition.id]: { phase: "loading", progress: 0 } }));
        try {
          const scene = await definition.create(THREE, dataRef.current, { renderer });
          if (disposed) {
            scene.dispose();
            return;
          }
          scene.resize(size.width, size.height);
          scene.setHighlights?.(highlightsRef.current);
          scene.setFocusProject?.(focusRef.current);
          scenesRef.current.set(definition.id, scene);
        } catch {
          setStatuses((current) => ({ ...current, [definition.id]: { phase: "failed", progress: 0 } }));
        }
      }
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [hasData, switchTo]);

  const activeLabel = SCENE_DEFINITIONS.find((definition) => definition.id === activeId)?.label;

  return (
    <>
      <div
        className={[
          "showcase-scenes",
          activeId ? "is-showing" : "",
          transition ? `is-${transition}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden="true"
      >
        <div ref={hostRef} className="showcase-scenes__canvas" />
        <div className="showcase-scenes__mood" />
        <div className="showcase-scenes__mood showcase-scenes__mood--lift" />
        <div className="showcase-scenes__shade" />
      </div>

      <aside className="showcase-scene-panel" aria-label="Cinematic scenes">
        <ol className="showcase-scene-switcher">
          {SCENE_DEFINITIONS.map((definition, index) => {
            const status = statuses[definition.id];
            const percent = Math.round((status?.progress ?? 0) * 100);
            const isActive = definition.id === activeId;
            const ready = status?.phase === "ready";
            return (
              <li key={definition.id}>
                <button
                  type="button"
                  className={`showcase-scene-switcher__item${isActive ? " is-active" : ""}${ready ? " is-ready" : ""}`}
                  onClick={() => {
                    lastInteractionRef.current = performance.now();
                    switchTo(definition.id);
                  }}
                  disabled={!ready || isActive}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span className="showcase-scene-switcher__index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="showcase-scene-switcher__label">{definition.label}</span>
                  {status?.phase === "loading" || status?.phase === "waiting" ? (
                    <span className="showcase-scene-switcher__loading" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                      <span className="showcase-scene-switcher__bar">
                        <span style={{ transform: `scaleX(${Math.max(0.04, status.progress)})` }} />
                      </span>
                      <span className="showcase-scene-switcher__percent">{String(percent).padStart(2, "0")}%</span>
                    </span>
                  ) : null}
                  {status?.phase === "failed" ? <span className="showcase-scene-switcher__percent">offline</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="showcase-scene-panel__tour"
          aria-pressed={autoTour}
          onClick={() => setAutoTour((value) => !value)}
        >
          Auto tour {autoTour ? "on" : "off"}
        </button>

        {activeLabel ? (
          <div className="showcase-gateway" key={activeId}>
            <p className="showcase-gateway__eyebrow">{activeLabel} · a fragment of the cinematic universe</p>
            <Link to="/cinematic" className="showcase-gateway__link" onMouseEnter={prefetchCinematic} onFocus={prefetchCinematic}>
              Enter the full experience
              <span className="showcase-gateway__arrow" aria-hidden="true" />
            </Link>
            <p className="showcase-gateway__note">3D, sound and a few seconds to load</p>
          </div>
        ) : null}
      </aside>
    </>
  );
}
