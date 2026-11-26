import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { TechStackTreeNode } from "@hd/content-schema/tech-stack-tree";
import type { ShowcaseProject } from "../lib/useShowcaseProjects";
import { SCENE_DEFINITIONS } from "../scenes/registry";
import { PeekTitle } from "./PeekTitle";
import { createFlyby } from "../lib/flyby";
import { PEEK_TONES, PEEK_TRANSITIONS, runPeekEnding, runPeekTransition, shuffled, type CancelTransition } from "../lib/peekTransitions";
import { trackEvent } from "../../../lib/analytics";
import { EMPTY_PORTFOLIO, type SceneData, type SceneJob, type ScenePortfolio, type ShowcaseScene } from "../scenes/types";

interface SceneStageProps {
  projects: ShowcaseProject[];
  techStack: TechStackTreeNode[] | undefined;
  /** Technologies of the project open on the page. */
  highlights: string[];
  portfolio: ScenePortfolio | undefined;
  profile: { name: string; title: string } | undefined;
  jobs: SceneJob[];
  skills: SceneData["skills"];
  /** Project whose preview is open on the page. */
  focusProjectId: string | null;
  /** True where the wheel and drag over empty space control the scene (the index). */
  interactive: boolean;
  /** Hidden behind the cinematic experience: no updates, loading or rendering. */
  paused: boolean;
  /** Show the way into the 3D experience (off on project pages). */
  /** Whether the previews panel is shown (not on project pages or under the film). */
  showPanel: boolean;
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
/** Zoom is a lens change on the active scene's camera: narrower field = closer. */
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 1.6;
const ZOOM_WHEEL_RATE = 0.0012;
/** Radians of look-around per pixel dragged, and its limits. */
const DRAG_RATE = 0.0035;
const DRAG_MAX_YAW = 1.2;
const DRAG_MAX_PITCH = 0.6;
/** After letting go, the view eases back to the scene's own framing. */
const DRAG_RETURN_DELAY_MS = 3000;

// Anything a visitor reads or uses keeps the wheel and pointer; the empty
// space around it belongs to the scene.
const PAGE_CONTENT_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "img",
  "svg",
  "canvas",
  "span",
  "strong",
  ".showcase-preview",
  ".showcase-scene-panel",
  ".showcase-pills",
  "[data-scene-block]",
].join(",");

const PLATE_STORAGE_KEY = "showcase:previews-open";

/*
 * HD-12 quick peek: once per browser session, before the slow tour, every scene
 * plays for a few seconds under its own title while one slow zoom runs across
 * them all; a soft flash ends it and the slow tour starts from the first scene.
 */
const PEEK_STORAGE_KEY = "showcase:quick-peek";
/** How long each scene plays in the peek (longer only while the next one loads). */
const PEEK_SLOT_MS = 4_000;
/*
 * One slow sideways slide across the whole peek: the picture is scaled up a
 * little and drifts from one side to the other, in screen space, so it carries
 * straight through every cut whatever each scene's own camera does. (It
 * replaced a lens zoom, which the scenes' own camera moves drowned out.)
 */
const PEEK_SLIDE_SCALE = 1.14;
/** Drift, in percent of the screen width, each side of center (under the 7% the scale leaves). */
const PEEK_SLIDE_TRAVEL = 6;
/** The slide crosses from one side to the other in this long, at a constant rate. */
const PEEK_SLIDE_SPAN_MS = PEEK_SLOT_MS * 7;
/** The quick cut between peek scenes. */
const CUT_MS = 320;
/**
 * Scenes run this many times faster during the peek, as ordinary steps plus
 * one partial step per frame, so no scene sees a bigger step than usual.
 */
const PEEK_SPEED = 2.3;
/*
 * The freighter fly-by (lib/flyby): the first pass comes a little after the
 * first scene shows, then one every 20-40 seconds, in the peek and the slow
 * tour alike, never during the peek's ending.
 */
const FLYBY_FIRST_S: [number, number] = [6, 12];
const FLYBY_EVERY_S: [number, number] = [20, 40];
const FLYBY_PRELOAD_DELAY_MS = 3_000;
/*
 * In the slow tour every scene opens in its random tone, holds it this long,
 * then flickers to its own colors and stays there: a tone washes out real
 * color, such as the screenshots in the gallery and portfolio. (The peek
 * keeps its tones throughout.)
 */
const TRUE_COLOR_AFTER_MS = 3_000;
/**
 * The flicker, as ms after the hold: off, on, off, on, then off for good.
 * Two returns of the tone in about half a second, under three flashes a second.
 */
const TRUE_COLOR_FLICKER = [90, 200, 290, 470];
/**
 * The per-scene titles (PeekTitle). Off since HD-12 review: they pulled the eye
 * away from the scenes, and the names mean little to visitors. True brings them back.
 */
const SHOW_PEEK_TITLES = false;
/*
 * Random start points: before a scene's turn in the peek, it is run ahead in
 * the background by a random amount of its own time, so the peek shows a
 * random moment rather than always the opening seconds. Run in 0.1 s steps
 * (the largest step scenes get anyway), within a small time budget per frame.
 */
const PREROLL_RANGE_S: [number, number] = [4, 40];
/** The first scene has nothing playing in front of it, so its run-ahead is kept short. */
const PREROLL_FIRST_RANGE_S: [number, number] = [2, 14];
const PREROLL_STEP_S = 0.1;
const PREROLL_BUDGET_MS = 4;
/** The first scene waits at most this long for its run-ahead before showing. */
const PREROLL_FIRST_WAIT_MS = 1_500;

const randomIn = ([min, max]: [number, number]) => min + Math.random() * (max - min);

type PeekPhase = "preview" | "boom" | "done";

/** Runs once a session, and only for visitors who leave the auto-tour on. */
const readPeekWanted = () => {
  if (!readTourPreference()) return false;
  try {
    return sessionStorage.getItem(PEEK_STORAGE_KEY) !== "seen";
  } catch {
    return false;
  }
};

const markPeekSeen = () => {
  try {
    sessionStorage.setItem(PEEK_STORAGE_KEY, "seen");
  } catch {
    // Without session storage it simply may play again.
  }
};

/** The previews list starts closed; a visitor who opens it finds it open next time. */
const readPlatePreference = () => {
  try {
    return localStorage.getItem(PLATE_STORAGE_KEY) === "open";
  } catch {
    return false;
  }
};

/** The next scene in the peek after `id`, skipping any that failed to load. */
const nextPeekSceneAfter = (id: string, failed: Set<string>) => {
  const index = SCENE_DEFINITIONS.findIndex((definition) => definition.id === id);
  return SCENE_DEFINITIONS.slice(index + 1).find((definition) => !failed.has(definition.id))?.id;
};

const isSceneSurface =(target: EventTarget | null) =>
  target instanceof Element && !target.closest(PAGE_CONTENT_SELECTOR);

const readTourPreference = () => {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};



/**
 * Fragments of the cinematic universe behind the portfolio: one renderer, one
 * visible scene at a time, glitch transitions, a switcher and an auto-tour.
 */
export function SceneStage({ projects, techStack, highlights, portfolio, profile, jobs, skills, focusProjectId, interactive, paused, showPanel, onShowing }: SceneStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Already loaded and in memory: going back is instant, and the link says so.
  const [statuses, setStatuses] = useState<Record<string, SceneStatus>>(() =>
    Object.fromEntries(SCENE_DEFINITIONS.map((scene) => [scene.id, { phase: "waiting", progress: 0 }])),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [transition, setTransition] = useState<"leaving" | "entering" | null>(null);
  const [autoTour, setAutoTour] = useState(readTourPreference);
  const [plateOpen, setPlateOpen] = useState(readPlatePreference);
  const [peekPhase, setPeekPhase] = useState<PeekPhase>(() => (readPeekWanted() ? "preview" : "done"));
  // Loop-side peek state: time in the current slot, total peek time, and
  // whether the ending has reached black (the first scene is back in).
  const peekRef = useRef({
    phase: peekPhase,
    slot: 0,
    total: 0,
    switched: false,
    // A transition between peek scenes is playing.
    transitioning: false,
    // A fresh order of transition effects each session.
    effects: shuffled(PEEK_TRANSITIONS),
    effectIndex: 0,
    // Random run-ahead per scene (seconds of scene time), and how much is done.
    offsets: new Map<string, number>(),
    rolled: new Map<string, number>(),
    // When the first scene became ready, for its run-ahead wait.
    firstReadyAt: 0,
  });
  const fxRef = useRef<HTMLCanvasElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const plateTimerRef = useRef<HTMLSpanElement>(null);
  const cancelTransitionRef = useRef<CancelTransition | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const cutRef = useRef<HTMLDivElement>(null);
  const failedRef = useRef(new Set<string>());

  // Live values for the render loop, which is set up once.
  const scenesRef = useRef(new Map<string, ShowcaseScene>());
  const activeRef = useRef<string | null>(null);
  const transitionRef = useRef<"leaving" | "entering" | null>(null);
  const autoTourRef = useRef(autoTour);
  const highlightsRef = useRef(highlights);
  const focusRef = useRef(focusProjectId);
  const interactiveRef = useRef(interactive);
  const pausedRef = useRef(paused);
  // Set by the render effect; lets un-pausing start the loop it stopped.
  const resumeRef = useRef<(() => void) | null>(null);
  const onShowingRef = useRef(onShowing);
  const lastInteractionRef = useRef(performance.now());
  const activeSinceRef = useRef(performance.now());
  useLayoutEffect(() => {
    autoTourRef.current = autoTour;
    highlightsRef.current = highlights;
    focusRef.current = focusProjectId;
    interactiveRef.current = interactive;
    pausedRef.current = paused;
    onShowingRef.current = onShowing;
  });

  // Coming off a pause, the loop has stopped and has to be asked to start again.
  useEffect(() => {
    if (!paused) resumeRef.current?.();
  }, [paused]);

  const hasData = projects.length > 0 && techStack !== undefined && portfolio !== undefined;
  const dataRef = useRef({ profile: profile ?? { name: "", title: "" }, projects, techStack: techStack ?? [], portfolio: portfolio ?? EMPTY_PORTFOLIO, jobs, skills });
  useLayoutEffect(() => {
    dataRef.current = { profile: profile ?? { name: "", title: "" }, projects, techStack: techStack ?? [], portfolio: portfolio ?? EMPTY_PORTFOLIO, jobs, skills };
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

  // A hard cut, not the slow glitch; with a short pop unless a peek
  // transition is already covering it.
  const cutTo = useCallback((id: string, pop = true) => {
    activeRef.current = id;
    activeSinceRef.current = performance.now();
    setActiveId(id);
    if (!pop) return;
    cutRef.current?.animate(
      [
        { opacity: 0.55, backdropFilter: "blur(6px) brightness(1.6)" },
        { opacity: 0, backdropFilter: "blur(0px) brightness(1)" },
      ],
      { duration: CUT_MS, easing: "ease-out" },
    );
  }, []);

  const setPeek = useCallback((phase: PeekPhase) => {
    peekRef.current.phase = phase;
    setPeekPhase(phase);
    // Scenes hear when the peek (and its ending) is over.
    for (const scene of scenesRef.current.values()) scene.setPeek?.(phase !== "done");
  }, []);

  const startBoom = useCallback(
    (outcome: "completed" | "skipped") => {
      if (peekRef.current.phase !== "preview") return;
      cancelTransitionRef.current?.();
      cancelTransitionRef.current = null;
      Object.assign(peekRef.current, { switched: false, transitioning: false });
      setPeek("boom");
      trackEvent("showcase_quick_peek", { outcome, scene_id: activeRef.current });
      // The ending: boom, static and fade to black, silence, then the first
      // scene fades in and the slow tour starts.
      const host = hostRef.current;
      const fade = slideRef.current;
      const fx = fxRef.current;
      const begin = () => {
        activeSinceRef.current = performance.now();
        setPeek("done");
      };
      if (!host || !fade || !fx) {
        begin();
        return;
      }
      cancelTransitionRef.current = runPeekEnding({
        host,
        fade,
        fx,
        onBlack: () => {
          // Under the black: the slide lets go, and the first scene goes in.
          peekRef.current.switched = true;
          const first = SCENE_DEFINITIONS.find((definition) => (scenesRef.current.get(definition.id)?.progress() ?? 0) >= 1);
          if (first && first.id !== activeRef.current) cutTo(first.id, false);
        },
        onRise: begin,
      });
    },
    [setPeek, cutTo],
  );

  useEffect(() => {
    for (const scene of scenesRef.current.values()) scene.setHighlights?.(highlights);
  }, [highlights]);

  useEffect(() => {
    for (const scene of scenesRef.current.values()) scene.setFocusProject?.(focusProjectId);
  }, [focusProjectId]);

  // Back from the cinematic experience: give the current scene a full tour interval.
  useEffect(() => {
    if (!paused) activeSinceRef.current = performance.now();
  }, [paused]);

  useEffect(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, autoTour ? "on" : "off");
    } catch {
      // Preference just isn't remembered.
    }
  }, [autoTour]);

  useEffect(() => {
    try {
      localStorage.setItem(PLATE_STORAGE_KEY, plateOpen ? "open" : "closed");
    } catch {
      // Preference just isn't remembered.
    }
  }, [plateOpen]);

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
      // The fly-by gets a fresh canvas on every run, like the scenes' renderer.
      // Its dispose() forces the context lost, and a canvas whose context was
      // lost hands a new renderer that same dead context: reusing one fixed
      // <canvas> made any rerun of this effect (every hot update in dev) throw
      // in createFlyby and leave the scene layer blank.
      const fxCanvas = fxRef.current;
      const shipCanvas = document.createElement("canvas");
      shipCanvas.className = "showcase-scenes__ship";
      fxCanvas?.before(shipCanvas);
      // The ship is decoration: if its renderer can't start (no WebGL context
      // to be had), the scenes carry on without it instead of failing too.
      let flyby: ReturnType<typeof createFlyby> | null = null;
      try {
        if (fxCanvas) flyby = createFlyby(THREE, shipCanvas);
      } catch (error) {
        console.warn("[showcase] fly-by unavailable", error);
      }
      // When the next pass is due (loop time), set once a scene is showing.
      let nextFlybyAt = 0;
      // Development only: start a pass now, for checking it without waiting.
      if (import.meta.env.DEV) {
        // __showcaseFlyby(true) makes the pass fire its lasers, (false) keeps it quiet.
        const helper = Object.assign((lasers?: boolean) => flyby?.launch({ lasers }), {
          isFlying: () => flyby?.flying ?? false,
        });
        (window as unknown as { __showcaseFlyby?: typeof helper }).__showcaseFlyby = helper;
      }

      const size = { width: 1, height: 1 };
      const resize = () => {
        size.width = host.clientWidth;
        size.height = host.clientHeight;
        renderer.setSize(size.width, size.height, false);
        for (const scene of scenesRef.current.values()) scene.resize(size.width, size.height);
        flyby?.resize(size.width, size.height);
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

      // Visitor view control over empty space: wheel zooms, drag looks around.
      const view = { zoom: 1, zoomTarget: 1, yaw: 0, pitch: 0, yawTarget: 0, pitchTarget: 0, releasedAt: 0 };
      let drag: { id: number; x: number; y: number } | null = null;
      const root = document.documentElement;
      const canControl = (target: EventTarget | null) =>
        interactiveRef.current && activeRef.current !== null && isSceneSurface(target);
      const onWheel = (event: WheelEvent) => {
        if (event.ctrlKey || !canControl(event.target)) return;
        event.preventDefault();
        view.zoomTarget = THREE.MathUtils.clamp(
          view.zoomTarget * Math.exp(event.deltaY * ZOOM_WHEEL_RATE),
          ZOOM_MIN,
          ZOOM_MAX,
        );
        lastInteractionRef.current = performance.now();
      };
      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0 || event.pointerType === "touch" || !canControl(event.target)) return;
        event.preventDefault();
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        root.classList.add("is-scene-dragging");
      };
      const onDragMove = (event: PointerEvent) => {
        if (!drag) {
          root.classList.toggle("is-scene-grab", canControl(event.target));
          return;
        }
        if (event.pointerId !== drag.id) return;
        view.yawTarget = THREE.MathUtils.clamp(view.yawTarget - (event.clientX - drag.x) * DRAG_RATE, -DRAG_MAX_YAW, DRAG_MAX_YAW);
        view.pitchTarget = THREE.MathUtils.clamp(view.pitchTarget - (event.clientY - drag.y) * DRAG_RATE, -DRAG_MAX_PITCH, DRAG_MAX_PITCH);
        drag.x = event.clientX;
        drag.y = event.clientY;
      };
      const onPointerUp = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.id) return;
        drag = null;
        view.releasedAt = performance.now();
        root.classList.remove("is-scene-dragging");
      };
      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onDragMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      let viewSceneId: string | null = null;
      const worldUp = new THREE.Vector3(0, 1, 0);
      // The peek's slide: how far across it is (0..1), and how much of it is
      // applied (1 in the peek, eased to 0 after, dropped at once under the flash).
      const slideDirection = Math.random() < 0.5 ? 1 : -1;
      let slidePresence = 0;
      let slideWritten = "";
      let toneWritten = "";
      // The scene the current tone was picked for, and that tone.
      let toneSceneId: string | null = null;
      let toneForScene = "";
      // When the current scene came on (for the true-color release below).
      let toneSince = 0;
      // When the slow tour began (the peek's end, or the first frame without one).
      let tourStartedAt = 0;
      const failed = failedRef.current;
      const nextPeekScene = (id: string) => nextPeekSceneAfter(id, failed);

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
        if (pausedRef.current) {
          // Stop the loop rather than spin through it drawing nothing. A paused
          // scene used to keep asking for a frame ~60 times a second for as long
          // as the visitor stayed away, competing with whatever page they were
          // actually on. resume() below starts it again.
          last = now;
          frame = 0;
          return;
        }
        // Real time since the last frame. Scenes get it capped (a slow frame
        // must not jump them); the peek clock runs on it uncapped, so a heavy
        // scene at a low frame rate still gets a 4-second slot, not 20. A pause
        // or hidden tab resets `last`, so time away is not counted.
        const frameMs = now - last;
        const dt = Math.min(0.1, frameMs / 1000);
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
            // The peek plays each scene fast: several ordinary steps per frame.
            const speed = peekRef.current.phase === "preview" ? PEEK_SPEED : 1;
            for (let step = 0; step < Math.floor(speed); step += 1) scene.update(dt, smoothed, true);
            const partial = speed - Math.floor(speed);
            if (partial > 0.001) scene.update(dt * partial, smoothed, true);
          } else if (progress < 1 && preloadTick) {
            scene.update(preloadDt, smoothed, false);
          }
          report(definition.id, { phase: progress >= 1 ? "ready" : "loading", progress });
        }

        // Peek run-ahead: the scene up next (or the first, before anything
        // shows) is moved to its random start point, a little each frame.
        const peekNow = peekRef.current;
        let firstRunAheadDone = true;
        if (peekNow.phase === "preview") {
          const upNext = activeRef.current
            ? nextPeekScene(activeRef.current)
            : SCENE_DEFINITIONS.find((definition) => !failedRef.current.has(definition.id))?.id;
          const scene = upNext ? scenesRef.current.get(upNext) : undefined;
          if (upNext && scene && scene.progress() >= 1) {
            if (!peekNow.offsets.has(upNext)) {
              peekNow.offsets.set(upNext, randomIn(activeRef.current ? PREROLL_RANGE_S : PREROLL_FIRST_RANGE_S));
            }
            const target = peekNow.offsets.get(upNext) ?? 0;
            let rolled = peekNow.rolled.get(upNext) ?? 0;
            const started = performance.now();
            while (rolled < target && performance.now() - started < PREROLL_BUDGET_MS) {
              scene.update(PREROLL_STEP_S, smoothed, true);
              rolled += PREROLL_STEP_S;
            }
            peekNow.rolled.set(upNext, rolled);
            if (!activeRef.current) {
              peekNow.firstReadyAt ||= now;
              firstRunAheadDone = rolled >= target || now - peekNow.firstReadyAt > PREROLL_FIRST_WAIT_MS;
            }
          }
        }

        // First showing: the first scene in tour order that is ready, unless an
        // earlier one is still loading (the tour order is the intended opening).
        if (!activeRef.current && firstRunAheadDone) {
          for (const definition of SCENE_DEFINITIONS) {
            const scene = scenesRef.current.get(definition.id);
            if (!scene) break;
            if (scene.progress() >= 1) {
              activeRef.current = definition.id;
              activeSinceRef.current = now;
              setActiveId(definition.id);
              onShowingRef.current(true);
              // The peek counts as seen once it has started.
              if (peekRef.current.phase === "preview") markPeekSeen();
            }
            break;
          }
        }

        const peek = peekRef.current;
        // Turning the tour off ends the peek where it is.
        if (peek.phase === "preview" && !autoTourRef.current) setPeek("done");
        // Peek: each scene gets its slot, then a cut to the next one. A scene
        // still loading is waited for (the current one keeps playing); one that
        // failed is skipped. Mouse, wheel and scroll don't hold it up.
        if (peek.phase === "preview" && activeRef.current && !transitionRef.current) {
          peek.slot += frameMs;
          peek.total += frameMs;
          if (peek.slot >= PEEK_SLOT_MS && !peek.transitioning) {
            const next = nextPeekScene(activeRef.current);
            if (!next) {
              startBoom("completed");
            } else if ((scenesRef.current.get(next)?.progress() ?? 0) >= 1) {
              // A different jagged transition for each cut; the scene swaps
              // at its darkest moment.
              const host = hostRef.current;
              const fx = fxRef.current;
              if (host && fx) {
                peek.transitioning = true;
                const kind = peek.effects[peek.effectIndex % peek.effects.length];
                peek.effectIndex += 1;
                cancelTransitionRef.current = runPeekTransition(kind, {
                  host,
                  fx,
                  onCut: () => {
                    if (peekRef.current.phase !== "preview") return;
                    peekRef.current.slot = 0;
                    cutTo(next, false);
                  },
                  onDone: () => {
                    peekRef.current.transitioning = false;
                    cancelTransitionRef.current = null;
                  },
                });
              } else {
                peek.slot = 0;
                cutTo(next);
              }
            }
          }
        }
        // The ending runs on its own clock (runPeekEnding); the loop only lets
        // the slide go: at once once the screen is black, gently otherwise.
        const sliding = peek.phase === "preview" || (peek.phase === "boom" && !peek.switched);
        if (sliding) {
          slidePresence = 1;
        } else if (peek.phase === "boom" || peek.switched) {
          slidePresence = 0;
        } else if (slidePresence > 0) {
          slidePresence *= Math.exp(-2.5 * dt);
          if (slidePresence < 0.002) slidePresence = 0;
        }
        const slideEl = slideRef.current;
        if (slideEl) {
          const across = Math.min(1, peek.total / PEEK_SLIDE_SPAN_MS);
          const x = slideDirection * PEEK_SLIDE_TRAVEL * (1 - 2 * across) * slidePresence;
          const scale = 1 + (PEEK_SLIDE_SCALE - 1) * slidePresence;
          const transform = slidePresence > 0 ? `translateX(${x.toFixed(3)}%) scale(${scale.toFixed(4)})` : "";
          if (transform !== slideWritten) {
            slideEl.style.transform = transform;
            slideWritten = transform;
          }
          // A random color tone every time a scene comes on, in the peek and
          // the slow tour alike, never the same one twice in a row. It changes
          // with the scene: under a peek transition, or mid-glitch in the tour.
          if (activeRef.current !== toneSceneId) {
            toneSceneId = activeRef.current;
            toneSince = now;
            // Never the tone picked last time (which may already have been released).
            const choices = PEEK_TONES.filter((candidate) => candidate !== toneForScene);
            toneForScene = toneSceneId ? choices[Math.floor(Math.random() * choices.length)] : "";
          }
          let tone = toneForScene;
          // In the slow tour the tone only opens a scene, then flickers off to
          // show the scene as it really is. Timed from the later of the scene
          // coming on and the slow tour starting (after the peek, the first
          // scene goes in during the black, three seconds before the tour).
          if (peek.phase === "done") tourStartedAt ||= now;
          if (peek.phase === "done" && toneSceneId) {
            const after = now - Math.max(toneSince, tourStartedAt) - TRUE_COLOR_AFTER_MS;
            if (after >= 0) {
              const step = TRUE_COLOR_FLICKER.findIndex((until) => after < until);
              // Even steps of the flicker are untoned, odd ones toned; past the end, untoned.
              tone = step >= 0 && step % 2 === 1 ? toneForScene : "";
            }
          }
          if (tone !== toneWritten) {
            slideEl.style.filter = tone;
            toneWritten = tone;
          }
        }

        // Duration bar along the top: the peek slot, then the tour interval.
        // The same value drives the small timer under the active scene in the
        // gear panel, so the two always agree (it used to be a CSS animation
        // of its own, which started late and ran on through pauses).
        const share =
          peek.phase === "preview"
            ? peek.slot / PEEK_SLOT_MS
            : peek.phase === "boom"
              ? 0
              : (now - activeSinceRef.current) / TOUR_INTERVAL_MS;
        const fill = `scaleX(${Math.min(1, Math.max(0, share)).toFixed(4)})`;
        if (barRef.current) barRef.current.style.transform = fill;
        if (plateTimerRef.current) plateTimerRef.current.style.transform = fill;

        // Auto-tour to the next ready scene while the visitor is idle.
        if (
          peek.phase === "done" &&
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
        if (active) {
          // A new scene starts from its own framing.
          if (viewSceneId !== activeRef.current) {
            viewSceneId = activeRef.current;
            Object.assign(view, { zoom: 1, zoomTarget: 1, yaw: 0, pitch: 0, yawTarget: 0, pitchTarget: 0 });
          }
          if (!interactiveRef.current) view.zoomTarget = 1;
          if (!drag && (!interactiveRef.current || now - view.releasedAt > DRAG_RETURN_DELAY_MS)) {
            view.yawTarget *= Math.exp(-1.2 * dt);
            view.pitchTarget *= Math.exp(-1.2 * dt);
          }
          const ease = 1 - Math.exp(-7 * dt);
          view.zoom += (view.zoomTarget - view.zoom) * ease;
          view.yaw += (view.yawTarget - view.yaw) * ease;
          view.pitch += (view.pitchTarget - view.pitch) * ease;

          // Applied just for this render, so scenes keep their own camera state.
          const { camera } = active;
          const lens = view.zoom;
          const adjusted =
            Math.abs(lens - 1) > 0.001 || Math.abs(view.yaw) > 0.0005 || Math.abs(view.pitch) > 0.0005;
          const fov = camera.fov;
          const quaternion = adjusted ? camera.quaternion.clone() : null;
          if (adjusted) {
            camera.fov = THREE.MathUtils.clamp(fov * lens, 8, 120);
            camera.updateProjectionMatrix();
            camera.rotateOnWorldAxis(worldUp, view.yaw);
            camera.rotateX(view.pitch);
            camera.updateMatrixWorld();
          }
          if (active.render) active.render(renderer);
          else renderer.render(active.scene, camera);
          if (quaternion) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
            camera.quaternion.copy(quaternion);
            camera.updateMatrixWorld();
          }

          // The freighter, now and then, over whatever is showing.
          const randomSeconds = ([min, max]: [number, number]) => (min + Math.random() * (max - min)) * 1000;
          if (!nextFlybyAt) {
            nextFlybyAt = now + randomSeconds(FLYBY_FIRST_S);
            // The ship model (4.6 MB) loads a little after the first scene
            // shows, so it never competes with the scenes' own loading.
            window.setTimeout(() => flyby?.preload(), FLYBY_PRELOAD_DELAY_MS);
          }
          if (flyby && !flyby.flying && now >= nextFlybyAt) {
            if (peekRef.current.phase === "boom") nextFlybyAt = now + 2_000;
            else {
              flyby.launch();
              // Not ready yet (the model is still loading): try again shortly.
              nextFlybyAt = now + (flyby.flying ? randomSeconds(FLYBY_EVERY_S) : 1_000);
            }
          }
          // Close to real time even on a slow machine (a pass should not crawl
          // in slow motion), without letting one frame jump it far.
          flyby?.update(Math.min(0.25, frameMs / 1000));
          flyby?.render();
        }
        frame = requestAnimationFrame(render);
      };

      // Starting the loop again after it has stopped, whether it stopped for a
      // pause or a hidden tab. Never schedules a second frame alongside a live one.
      const resume = () => {
        if (frame || pausedRef.current || document.hidden) return;
        last = performance.now();
        frame = requestAnimationFrame(render);
      };
      resumeRef.current = resume;

      const onVisibility = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        if (!document.hidden) resume();
      };
      document.addEventListener("visibilitychange", onVisibility);
      frame = requestAnimationFrame(render);

      cleanup = () => {
        cancelAnimationFrame(frame);
        cancelTransitionRef.current?.();
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("wheel", onWheel);
        window.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onDragMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        root.classList.remove("is-scene-grab", "is-scene-dragging");
        observer.disconnect();
        for (const scene of scenesRef.current.values()) scene.dispose();
        scenesRef.current.clear();
        flyby?.dispose();
        shipCanvas.remove();
        if (import.meta.env.DEV) delete (window as unknown as { __showcaseFlyby?: () => void }).__showcaseFlyby;
        renderer.dispose();
        // Hand the GPU memory back now, not whenever the browser gets to it
        // (the cinematic experience may be taking over).
        renderer.forceContextLoss();
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
          scene.setPeek?.(peekRef.current.phase !== "done");
          scenesRef.current.set(definition.id, scene);
        } catch {
          failedRef.current.add(definition.id);
          setStatuses((current) => ({ ...current, [definition.id]: { phase: "failed", progress: 0 } }));
        }
      }
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [hasData, switchTo, cutTo, setPeek, startBoom]);

  const activeIndex = SCENE_DEFINITIONS.findIndex((definition) => definition.id === activeId);
  const activeDefinition = SCENE_DEFINITIONS[activeIndex] ?? null;
  const activeDestination = activeDefinition?.destination({
    profile: profile ?? { name: "", title: "" },
    projects,
    techStack: techStack ?? [],
    portfolio: portfolio ?? EMPTY_PORTFOLIO,
    jobs,
    skills,
  });

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
        {/* The peek's slow slide moves this layer; transitions animate the one inside. */}
        <div ref={slideRef} className="showcase-scenes__slide">
          <div ref={hostRef} className="showcase-scenes__canvas" />
        </div>
        <div className="showcase-scenes__mood" />
        <div className="showcase-scenes__mood showcase-scenes__mood--lift" />
        <div className="showcase-scenes__shade" />
        {/* The fly-by ship's canvas is added here by the scenes effect, just
            before the fx layer: outside the toned layer, so it keeps its own colors. */}
        <canvas ref={fxRef} className="showcase-scenes__fx" />
        <div ref={cutRef} className="showcase-scenes__cut" />
      </div>

      {peekPhase === "preview" && activeDefinition && !paused ? (
        <div className={`showcase-peek${SHOW_PEEK_TITLES ? "" : " is-untitled"}`}>
          {SHOW_PEEK_TITLES ? (
            <PeekTitle
              key={activeDefinition.id}
              sceneId={activeDefinition.id}
              label={activeDefinition.label}
              position={activeIndex + 1}
              total={SCENE_DEFINITIONS.length}
            />
          ) : null}
          <button type="button" className="showcase-peek__skip" onClick={() => startBoom("skipped")}>
            Skip preview
          </button>
        </div>
      ) : null}

      {activeId && autoTour && !paused && peekPhase !== "boom" ? (
        <div className="showcase-duration" aria-hidden="true">
          <div ref={barRef} className={`showcase-duration__fill${peekPhase === "preview" ? " is-peek" : ""}`} />
        </div>
      ) : null}

      <aside className="showcase-scene-panel" aria-label="Universe scenes" hidden={!showPanel}>
      {/* HD-10: the list is tucked behind the gear below; most visitors never need it. */}
      <div className="showcase-scene-plate" id="showcase-scene-plate" hidden={!plateOpen}>
        <p className="showcase-scene-plate__title">Background previews</p>
        <ol className="showcase-scene-switcher" aria-label="Background previews">
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
                    trackEvent("showcase_background_preview_click", {
                      scene_id: definition.id,
                      scene_label: definition.label,
                      scene_index: index,
                      previous_scene_id: activeId,
                    });
                    lastInteractionRef.current = performance.now();
                    // Picking a scene by hand ends the peek.
                    if (peekRef.current.phase === "preview") setPeek("done");
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
                  {isActive && autoTour && !paused && peekPhase !== "boom" ? (
                    // Time on this scene: the peek slot, then the tour interval.
                    // Filled from the render loop, with the bar along the top.
                    <span className={`showcase-scene-switcher__timer${peekPhase === "preview" ? " is-peek" : ""}`} aria-hidden="true">
                      <span ref={plateTimerRef} />
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
          onClick={() => {
            // Turning the tour on gives the current scene a full interval.
            activeSinceRef.current = performance.now();
            setAutoTour((value) => !value);
          }}
        >
          Auto tour {autoTour ? "on" : "off"}
        </button>
      </div>

      <div className="showcase-scene-footer">
      {activeDefinition && activeDestination ? (
        // Where the preview playing now can be seen in full. Not dimmed like
        // the plate: it is the one thing here meant to be read.
        <p className="showcase-scene-goto" key={activeDefinition.id}>
          <span className="showcase-scene-goto__now">Now showing: {activeDefinition.label}</span>
          <Link
            className="showcase-scene-goto__link"
            to={activeDestination.to}
            onClick={() =>
              trackEvent("showcase_background_preview_goto", {
                scene_id: activeDefinition.id,
                scene_label: activeDefinition.label,
                destination: activeDestination.to,
              })
            }
          >
            {activeDestination.text}
            <span className="showcase-scene-goto__arrow" aria-hidden="true">→</span>
          </Link>
        </p>
      ) : null}
      <button
        type="button"
        className={`showcase-scene-gear${plateOpen ? " is-open" : ""}`}
        aria-expanded={plateOpen}
        aria-controls="showcase-scene-plate"
        aria-label={plateOpen ? "Hide background previews" : "Show background previews"}
        title={plateOpen ? "Hide background previews" : "Background previews"}
        onClick={() => setPlateOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
            transform="translate(-1 0)"
          />
        </svg>
      </button>
      </div>

      </aside>

    </>
  );
}
