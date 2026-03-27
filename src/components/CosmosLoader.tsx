import { useCallback, useEffect, useRef, useState } from "react";
import "./CosmosLoader.scss";

interface CosmosLoaderProps {
  onLoadingComplete: () => void;
  isSceneReady?: boolean;
}

type Phase = "idle" | "colorCycle" | "teaser" | "frenzy" | "flash" | "done";

const TEASER_COLORS = ["#007A87", "#720000"];
const DATA_COLORS = ["#665B00", "#001459"];
const DEFAULT_REVEAL_LINES = 36;
const REVEAL_LINE_MIN_RATIO = 0.2; // 1/5th of max line thickness
const FRENZY_BASE_DURATION_MS = 333 * DEFAULT_REVEAL_LINES;
const PROGRAM_TEXT = "Program: Portfolio";
const OPTIONAL_CODE_SESSION_KEY = "cosmosOptionalCode";

const buildRevealLineFractions = (): number[] => {
  const max = 1 / DEFAULT_REVEAL_LINES;
  const min = max * REVEAL_LINE_MIN_RATIO;
  // Keep reveal duration reasonable while allowing mixed strip heights.
  const lineCount =
    52 + Math.floor(Math.random() * 25); // 52..76 randomized strips
  let remaining = 1;
  const lines: number[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const slotsLeft = lineCount - i - 1;
    const minAllowed = Math.max(min, remaining - slotsLeft * max);
    const maxAllowed = Math.min(max, remaining - slotsLeft * min);
    const value =
      i === lineCount - 1
        ? remaining
        : minAllowed +
          Math.random() * Math.max(0, maxAllowed - minAllowed);
    lines.push(value);
    remaining -= value;
  }
  return lines;
};

export default function CosmosLoader({
  onLoadingComplete,
  isSceneReady = false,
}: CosmosLoaderProps) {
  const debugEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "true";
  const fastTrackEnabled =
    typeof window !== "undefined" &&
    !!new URLSearchParams(window.location.search).get("fastTrack");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const stripeStartPosRef = useRef(0);
  const timeoutsRef = useRef<number[]>([]);
  const intervalsRef = useRef<number[]>([]);
  const lastColorRef = useRef("#000");

  const [typedText, setTypedText] = useState("");
  const [stageText, setStageText] = useState("");
  const [showStatusUI, setShowStatusUI] = useState(false);
  const [showEndMessage, setShowEndMessage] = useState(false);
  const [entryGateVisible, setEntryGateVisible] = useState(false);
  const [hasEntered, setHasEntered] = useState(fastTrackEnabled);
  const [endMessageFlashVariant, setEndMessageFlashVariant] = useState<"a" | "b">("a");
  const [optionalCode, setOptionalCode] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem(OPTIONAL_CODE_SESSION_KEY) ?? "";
  });
  const [progress, setProgress] = useState(0);
  const [revealedSet, setRevealedSet] = useState<Set<number>>(new Set());
  const [revealLineFractions, setRevealLineFractions] = useState<number[]>(
    () =>
      Array.from(
        { length: DEFAULT_REVEAL_LINES },
        () => 1 / DEFAULT_REVEAL_LINES,
      ),
  );
  const [animationDone, setAnimationDone] = useState(fastTrackEnabled);
  const [debugCurrentMode, setDebugCurrentMode] = useState("boot");
  const [debugModeHistory, setDebugModeHistory] = useState<string[]>([]);

  const shuffledOrderRef = useRef<number[]>([]);
  const revealCountRef = useRef(0);

  const queueTimeout = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timeoutsRef.current.push(id);
  }, []);

  const queueInterval = useCallback((fn: () => void, interval: number) => {
    const id = window.setInterval(fn, interval);
    intervalsRef.current.push(id);
    return id;
  }, []);

  const clearQueuedInterval = useCallback((id: number) => {
    clearInterval(id);
    intervalsRef.current = intervalsRef.current.filter((i) => i !== id);
  }, []);

  const markDebugMode = useCallback(
    (mode: string) => {
      if (!debugEnabled) return;
      setDebugCurrentMode(mode);
      setDebugModeHistory((prev) =>
        prev[prev.length - 1] === mode ? prev : [...prev.slice(-9), mode],
      );
      console.log(`[LOADER:mode] ${mode}`);
    },
    [debugEnabled],
  );

  const setLoaderPhase = useCallback(
    (phase: Phase, modeLabel?: string) => {
      phaseRef.current = phase;
      markDebugMode(modeLabel ?? `phase:${phase}`);
    },
    [markDebugMode],
  );

  const saveOptionalCodeToSession = useCallback((value: string) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(OPTIONAL_CODE_SESSION_KEY, value);
  }, []);

  const handleEnterLoader = useCallback(() => {
    if (hasEntered) return;
    saveOptionalCodeToSession(optionalCode);
    setHasEntered(true);
    markDebugMode("user-entered");
  }, [hasEntered, markDebugMode, optionalCode, saveOptionalCodeToSession]);

  // ── Canvas renderers ─────────────────────────────────────────

  const fillSolid = useCallback((color: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    lastColorRef.current = color;
  }, []);

  const showTeaserSignal = useCallback(() => {
    if (phaseRef.current !== "teaser") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = TEASER_COLORS[0];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = TEASER_COLORS[1];
    const thickness = canvas.height / 27;
    for (let i = -1; i < 28; i += 2) {
      ctx.fillRect(
        0,
        i * thickness + stripeStartPosRef.current,
        canvas.width,
        thickness,
      );
    }
    stripeStartPosRef.current += 2;
    if (stripeStartPosRef.current > thickness * 2)
      stripeStartPosRef.current = 0;
    rafRef.current = requestAnimationFrame(showTeaserSignal);
  }, []);

  const showFrenzySignal = useCallback(() => {
    if (phaseRef.current !== "frenzy") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = DATA_COLORS[0];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const thickness = canvas.height / 27 / 2;
    let pos = -thickness;
    for (let i = 0; i < 56; i++) {
      const t = thickness * (Math.floor(Math.random() * 2) + 1);
      ctx.fillStyle = DATA_COLORS[i % 2];
      ctx.fillRect(0, pos, canvas.width, t);
      pos += t;
    }
    rafRef.current = requestAnimationFrame(showFrenzySignal);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startPhase = useCallback(
    (phase: Phase) => {
      stopLoop();
      setLoaderPhase(phase);
      stripeStartPosRef.current = 0;
      if (phase === "teaser")
        rafRef.current = requestAnimationFrame(showTeaserSignal);
      else if (phase === "frenzy")
        rafRef.current = requestAnimationFrame(showFrenzySignal);
    },
    [stopLoop, showTeaserSignal, showFrenzySignal, setLoaderPhase],
  );

  // ── Orchestration ────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    fillSolid("#000");

    if (fastTrackEnabled) {
      markDebugMode("fast-track-bypass");
      return () => {
        window.removeEventListener("resize", resize);
        stopLoop();
      };
    }

    setLoaderPhase("idle", "idle");
    setTypedText(PROGRAM_TEXT);
    setShowStatusUI(true);
    setStageText("Initializing...");
    setProgress(0);
    setRevealedSet(new Set());
    markDebugMode("status-ui-visible");

    // Build random reveal strips and shuffled reveal order
    const revealLines = buildRevealLineFractions();
    setRevealLineFractions(revealLines);
    const revealLineCount = revealLines.length;
    const order = Array.from({ length: revealLineCount }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    shuffledOrderRef.current = order;

    const TEASER_DURATION = 4000;
    const FRENZY_LINE_INTERVAL = Math.max(
      90,
      Math.round(FRENZY_BASE_DURATION_MS / Math.max(1, revealLineCount)),
    );

    const stopTeaser = () => {
      stopLoop();
      setLoaderPhase("idle", "teaser-end");
      fillSolid(lastColorRef.current);
    };

    const runTeaser = (duration: number, onEnd: () => void) => {
      startPhase("teaser");
      queueTimeout(() => {
        stopTeaser();
        onEnd();
      }, duration);
    };

    const runFrenzy = (onAllRevealed: () => void) => {
      startPhase("frenzy");
      setStageText("Loading content...");
      setProgress(0);
      setRevealedSet(new Set());
      revealCountRef.current = 0;

      const revealId = queueInterval(() => {
        const idx = revealCountRef.current;
        if (idx >= revealLineCount) {
          clearQueuedInterval(revealId);
          onAllRevealed();
          return;
        }
        const lineIndex = shuffledOrderRef.current[idx];
        revealCountRef.current++;
        setRevealedSet((prev) => new Set(prev).add(lineIndex));

        const count = revealCountRef.current;
        const pct = Math.round((count / revealLineCount) * 95);
        setProgress(Math.min(pct, 95));

        if (count === Math.floor(revealLineCount * 0.25)) {
          setStageText("Rendering planetary systems...");
        } else if (count === Math.floor(revealLineCount * 0.5)) {
          setStageText("Compiling shaders...");
        } else if (count === Math.floor(revealLineCount * 0.75)) {
          setStageText("Calibrating navigation...");
        } else if (count === Math.floor(revealLineCount * 0.9)) {
          setStageText("Almost ready...");
        }
      }, FRENZY_LINE_INTERVAL);
    };

    const runEndPhase = () => {
      stopLoop();
      setLoaderPhase("idle", "end-prep");
      fillSolid("#000");
      setProgress(100);
      setStageText("Ready for exploration");
      setShowEndMessage(true);
      setEntryGateVisible(true);
      setEndMessageFlashVariant("a");
      markDebugMode("ready-message");

      queueTimeout(() => {
        setLoaderPhase("flash", "flash");
        markDebugMode("flash");
        let flashCount = 0;
        const flashId = queueInterval(() => {
          setEndMessageFlashVariant((prev) => (prev === "a" ? "b" : "a"));
          fillSolid(flashCount % 2 === 0 ? "#fff" : "#000");
          flashCount++;
          if (flashCount >= 6) {
            clearQueuedInterval(flashId);
            queueTimeout(() => {
              fillSolid("#000");
              setLoaderPhase("done", "done");
              setAnimationDone(true);
              setEndMessageFlashVariant("a");
              markDebugMode("done");
            }, 200);
          }
        }, 200);
      }, 1000);
    };

    // ── Chained sequence ──

    // Start directly at status-ui-visible, then preserve teaser -> frenzy flow.
    queueTimeout(() => {
      markDebugMode("teaser");
      runTeaser(TEASER_DURATION, () => {
        queueTimeout(() => {
          markDebugMode("frenzy");
          runFrenzy(() => {
            queueTimeout(() => {
              markDebugMode("end-phase");
              runEndPhase();
            }, 500);
          });
        }, 300);
      });
    }, 180);

    return () => {
      window.removeEventListener("resize", resize);
      stopLoop();
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
      intervalsRef.current.forEach((id) => clearInterval(id));
      intervalsRef.current = [];
    };
  }, [
    fillSolid,
    markDebugMode,
    queueInterval,
    queueTimeout,
    clearQueuedInterval,
    startPhase,
    stopLoop,
    setLoaderPhase,
  ]);

  useEffect(() => {
    if (animationDone) markDebugMode("animation-done");
  }, [animationDone, markDebugMode]);

  useEffect(() => {
    if (isSceneReady) markDebugMode("scene-ready");
  }, [isSceneReady, markDebugMode]);

  // Dismiss only when animation, scene readiness, and user entry are complete.
  useEffect(() => {
    if (animationDone && isSceneReady && hasEntered) {
      markDebugMode("loader-complete");
      onLoadingComplete();
    }
  }, [animationDone, isSceneReady, hasEntered, onLoadingComplete, markDebugMode]);

  return (
    <div className="cosmos-loader">
      <canvas ref={canvasRef} className="cosmos-loader__canvas" />

      <div className="cosmos-loader__overlay">
        {debugEnabled && (
          <div className="cosmos-loader__debug">
            <div className="cosmos-loader__debug-title">Loader Debug</div>
            <div className="cosmos-loader__debug-current">
              mode: {debugCurrentMode}
            </div>
            {debugModeHistory.length > 0 && (
              <div className="cosmos-loader__debug-history">
                {debugModeHistory.map((mode, idx) => (
                  <span key={`${mode}-${idx}`}>{mode}</span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="cosmos-loader__tv">
          {typedText && (
            <div className="cosmos-loader__tv-header">{typedText}</div>
          )}
          <div className="cosmos-loader__tv-screen">
            <div className="cosmos-loader__tv-content">
              <div className="cosmos-loader__tv-backdrop" aria-hidden="true" />
              <div className="cosmos-loader__tv-text">
                <div className="cosmos-loader__tv-wordmark">HARMA DAVTIAN</div>
                <div className="cosmos-loader__tv-sub">PORTFOLIO</div>
              </div>
            </div>
            <div className="cosmos-loader__tv-mask">
              {revealLineFractions.map((fraction, i) => (
                <div
                  key={i}
                  className={`cosmos-loader__tv-strip${
                    revealedSet.has(i)
                      ? " cosmos-loader__tv-strip--peeled"
                      : ""
                  }`}
                  style={{ height: `${fraction * 100}%`, flex: "0 0 auto" }}
                />
              ))}
            </div>
            {showEndMessage && (
              <div
                className={`cosmos-loader__end-message cosmos-loader__end-message--flash-${endMessageFlashVariant}`}
              >
                App Load Completed
              </div>
            )}
          </div>
        </div>

        {showStatusUI && (
          <div className="cosmos-loader__info">
            <p className="cosmos-loader__stage">{stageText}</p>

            <div className="cosmos-loader__progress-grid" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => {
                const threshold = ((i + 1) / 24) * 100;
                return (
                  <span
                    key={i}
                    className={`cosmos-loader__progress-cell${
                      progress >= threshold
                        ? " cosmos-loader__progress-cell--active"
                        : ""
                    }`}
                  />
                );
              })}
            </div>

            <div className="cosmos-loader__percentage">{progress}%</div>

            {entryGateVisible && (
              <form
                className="cosmos-loader__entry-gate"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEnterLoader();
                }}
              >
                <label className="cosmos-loader__entry-label" htmlFor="optional-code">
                  Optional code
                </label>
                <input
                  id="optional-code"
                  className="cosmos-loader__entry-input"
                  type="text"
                  value={optionalCode}
                  onChange={(e) => setOptionalCode(e.target.value)}
                  placeholder="Enter optional code"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="cosmos-loader__enter-button"
                  disabled={hasEntered}
                >
                  {hasEntered ? "Entering..." : "Enter"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
