import { useCallback, useEffect, useRef, useState } from "react";
import "./CosmosLoader.scss";

interface CosmosLoaderProps {
  onLoadingComplete: () => void;
  isSceneReady?: boolean;
}

type Phase = "idle" | "colorCycle" | "teaser" | "frenzy" | "flash" | "done";

const TEASER_COLORS = ["#007A87", "#720000"];
const DATA_COLORS = ["#665B00", "#001459"];
const COLOR_CYCLE = ["#720000", "#007A87", "#C8B800"];
const TOTAL_REVEAL_LINES = 36;
const PROGRAM_TEXT = "Program: Portfolio";

export default function CosmosLoader({
  onLoadingComplete,
  isSceneReady = false,
}: CosmosLoaderProps) {
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
  const [progress, setProgress] = useState(0);
  const [revealedSet, setRevealedSet] = useState<Set<number>>(new Set());
  const [animationDone, setAnimationDone] = useState(false);

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
      phaseRef.current = phase;
      stripeStartPosRef.current = 0;
      if (phase === "teaser")
        rafRef.current = requestAnimationFrame(showTeaserSignal);
      else if (phase === "frenzy")
        rafRef.current = requestAnimationFrame(showFrenzySignal);
    },
    [stopLoop, showTeaserSignal, showFrenzySignal],
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

    // Build shuffled reveal order
    const order = Array.from({ length: TOTAL_REVEAL_LINES }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    shuffledOrderRef.current = order;

    const TEASER_DURATION = 4000;
    const FRENZY_LINE_INTERVAL = 333;

    const stopTeaser = () => {
      stopLoop();
      phaseRef.current = "idle";
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
      revealCountRef.current = 0;

      const revealId = queueInterval(() => {
        const idx = revealCountRef.current;
        if (idx >= TOTAL_REVEAL_LINES) {
          clearQueuedInterval(revealId);
          onAllRevealed();
          return;
        }
        const lineIndex = shuffledOrderRef.current[idx];
        revealCountRef.current++;
        setRevealedSet((prev) => new Set(prev).add(lineIndex));

        const count = revealCountRef.current;
        const pct = Math.round((count / TOTAL_REVEAL_LINES) * 95);
        setProgress(Math.min(pct, 95));

        if (count === Math.floor(TOTAL_REVEAL_LINES * 0.25)) {
          setStageText("Rendering planetary systems...");
        } else if (count === Math.floor(TOTAL_REVEAL_LINES * 0.5)) {
          setStageText("Compiling shaders...");
        } else if (count === Math.floor(TOTAL_REVEAL_LINES * 0.75)) {
          setStageText("Calibrating navigation...");
        } else if (count === Math.floor(TOTAL_REVEAL_LINES * 0.9)) {
          setStageText("Almost ready...");
        }
      }, FRENZY_LINE_INTERVAL);
    };

    const runEndPhase = () => {
      stopLoop();
      phaseRef.current = "idle";
      fillSolid("#000");
      setProgress(100);
      setStageText("Ready for exploration");
      setShowEndMessage(true);

      queueTimeout(() => {
        let flashCount = 0;
        const flashId = queueInterval(() => {
          fillSolid(flashCount % 2 === 0 ? "#fff" : "#000");
          flashCount++;
          if (flashCount >= 6) {
            clearQueuedInterval(flashId);
            queueTimeout(() => {
              fillSolid("#000");
              setAnimationDone(true);
            }, 200);
          }
        }, 200);
      }, 1000);
    };

    // ── Chained sequence ──

    // 1. Color cycle
    queueTimeout(() => fillSolid(COLOR_CYCLE[0]), 1000);
    queueTimeout(() => fillSolid(COLOR_CYCLE[1]), 2000);
    queueTimeout(() => fillSolid(COLOR_CYCLE[2]), 3000);

    // 2. Teaser 1 → on end: show title
    queueTimeout(() => {
      runTeaser(TEASER_DURATION, () => {
        setTypedText(PROGRAM_TEXT);

        // 3. Teaser 2 → on end: show bottom panel
        queueTimeout(() => {
          runTeaser(TEASER_DURATION, () => {
            setShowStatusUI(true);
            setStageText("Initializing...");

            // 4. Teaser 3 → on end: start frenzy
            queueTimeout(() => {
              runTeaser(TEASER_DURATION, () => {

                // 5. Frenzy → on all revealed: end phase
                queueTimeout(() => {
                  runFrenzy(() => {
                    queueTimeout(() => runEndPhase(), 500);
                  });
                }, 300);
              });
            }, 500);
          });
        }, 500);
      });
    }, 4000);

    return () => {
      window.removeEventListener("resize", resize);
      stopLoop();
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
      intervalsRef.current.forEach((id) => clearInterval(id));
      intervalsRef.current = [];
    };
  }, []);

  // Dismiss only when both animation AND actual loading are complete
  useEffect(() => {
    if (animationDone && isSceneReady) {
      onLoadingComplete();
    }
  }, [animationDone, isSceneReady, onLoadingComplete]);

  return (
    <div className="cosmos-loader">
      <canvas ref={canvasRef} className="cosmos-loader__canvas" />

      <div className="cosmos-loader__overlay">
        <div className="cosmos-loader__tv">
          {typedText && (
            <div className="cosmos-loader__tv-header">{typedText}</div>
          )}
          <div className="cosmos-loader__tv-screen">
            <div className="cosmos-loader__tv-content">
              <div className="cosmos-loader__tv-wordmark">HARMA DAVTIAN</div>
              <div className="cosmos-loader__tv-sub">PORTFOLIO</div>
            </div>
            <div className="cosmos-loader__tv-mask">
              {Array.from({ length: TOTAL_REVEAL_LINES }).map((_, i) => (
                <div
                  key={i}
                  className={`cosmos-loader__tv-strip${
                    revealedSet.has(i)
                      ? " cosmos-loader__tv-strip--peeled"
                      : ""
                  }`}
                />
              ))}
            </div>
            {showEndMessage && (
              <div className="cosmos-loader__end-message">Loading Complete</div>
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
          </div>
        )}
      </div>
    </div>
  );
}
