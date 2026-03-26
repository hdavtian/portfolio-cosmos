import { useCallback, useEffect, useRef, useState } from "react";
import "./CosmosLoader.scss";

interface CosmosLoaderProps {
  onLoadingComplete: () => void;
}

type Phase = "boot" | "pilot" | "header" | "data" | "done";

const PILOT_COLORS = ["#007A87", "#720000"];
const DATA_COLORS = ["#665B00", "#001459"];
const TOTAL_REVEAL_LINES = 36;

export default function CosmosLoader({ onLoadingComplete }: CosmosLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("boot");
  const stripeStartPosRef = useRef(0);
  const pilotColorIndexRef = useRef(0);
  const pilotTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Initializing...");
  const [headerText, setHeaderText] = useState("");
  const [showReady, setShowReady] = useState(false);
  const [revealedSet, setRevealedSet] = useState<Set<number>>(new Set());
  const shuffledOrderRef = useRef<number[]>([]);
  const revealCountRef = useRef(0);

  const queueTimeout = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timeoutsRef.current.push(id);
  }, []);

  // ── Canvas signal renderers ───────────────────────────────────

  const showPilotSignal = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = PILOT_COLORS[pilotColorIndexRef.current];
    pilotColorIndexRef.current = 1 - pilotColorIndexRef.current;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    pilotTimerRef.current = window.setTimeout(showPilotSignal, 2000);
  }, []);

  const showHeaderSignal = useCallback(() => {
    if (phaseRef.current !== "header") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = PILOT_COLORS[0];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = PILOT_COLORS[1];
    const thickness = canvas.height / 27;
    for (let i = -1; i < 28; i += 2) {
      ctx.fillRect(0, i * thickness + stripeStartPosRef.current, canvas.width, thickness);
    }
    stripeStartPosRef.current++;
    if (stripeStartPosRef.current > thickness * 2) stripeStartPosRef.current = 0;
    rafRef.current = requestAnimationFrame(showHeaderSignal);
  }, []);

  const showDataSignal = useCallback(() => {
    if (phaseRef.current !== "data") return;
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
    rafRef.current = requestAnimationFrame(showDataSignal);
  }, []);

  const stopAnimationLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pilotTimerRef.current !== null) {
      clearTimeout(pilotTimerRef.current);
      pilotTimerRef.current = null;
    }
  }, []);

  const stopRevealTimer = useCallback(() => {
    if (revealTimerRef.current !== null) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const startPhase = useCallback(
    (phase: Phase) => {
      stopAnimationLoop();
      phaseRef.current = phase;
      stripeStartPosRef.current = 0;
      if (phase === "pilot") showPilotSignal();
      else if (phase === "header") rafRef.current = requestAnimationFrame(showHeaderSignal);
      else if (phase === "data") rafRef.current = requestAnimationFrame(showDataSignal);
      else if (phase === "done") {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        }
      }
    },
    [stopAnimationLoop, showPilotSignal, showHeaderSignal, showDataSignal],
  );

  // ── Orchestration (~30s) ──────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Build shuffled reveal order once
    const order = Array.from({ length: TOTAL_REVEAL_LINES }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    shuffledOrderRef.current = order;

    const DRAWING_START = 14000;
    const DRAWING_DURATION = 14000;
    const LINE_INTERVAL = Math.floor(DRAWING_DURATION / TOTAL_REVEAL_LINES);

    const sequence: Array<{ at: number; fn: () => void }> = [
      // ── Boot ──
      { at: 600, fn: () => setStage("Loading stellar textures...") },

      // ── Pilot 1 ──
      { at: 1800, fn: () => startPhase("pilot") },
      { at: 2200, fn: () => setProgress(5) },

      // ── Header 1 ──
      { at: 4000, fn: () => startPhase("header") },
      { at: 4500, fn: () => { setProgress(10); setHeaderText("Program: Portfolio"); } },
      { at: 5500, fn: () => { setProgress(15); setStage("Generating orbital paths..."); } },

      // ── Data 1 (short burst) ──
      { at: 7000, fn: () => startPhase("data") },
      { at: 7300, fn: () => { setProgress(20); startPhase("pilot"); } },

      // ── Header 2 ──
      { at: 8500, fn: () => { startPhase("header"); setStage("Rendering planetary systems..."); } },
      { at: 9500, fn: () => setProgress(25) },

      // ── Data 2 (short burst) ──
      { at: 11000, fn: () => startPhase("data") },
      { at: 11300, fn: () => { setProgress(30); startPhase("pilot"); } },

      // ── Header 3 ──
      { at: 12500, fn: () => { startPhase("header"); setStage("Calibrating navigation..."); } },
      { at: 13500, fn: () => setProgress(35) },

      // ── Drawing phase: data signal + random line reveal ──
      {
        at: DRAWING_START,
        fn: () => {
          startPhase("data");
          setStage("Loading content...");
          revealCountRef.current = 0;
          revealTimerRef.current = window.setInterval(() => {
            const idx = revealCountRef.current;
            if (idx >= TOTAL_REVEAL_LINES) {
              stopRevealTimer();
              return;
            }
            const lineIndex = shuffledOrderRef.current[idx];
            revealCountRef.current++;
            setRevealedSet((prev) => new Set(prev).add(lineIndex));

            const count = revealCountRef.current;
            const pct = 35 + Math.round((count / TOTAL_REVEAL_LINES) * 60);
            setProgress(Math.min(pct, 95));

            if (count === Math.floor(TOTAL_REVEAL_LINES * 0.3)) {
              setStage("Initializing spaceship systems...");
            } else if (count === Math.floor(TOTAL_REVEAL_LINES * 0.6)) {
              setStage("Compiling shaders...");
            } else if (count === Math.floor(TOTAL_REVEAL_LINES * 0.85)) {
              setStage("Almost ready...");
            }
          }, LINE_INTERVAL);
        },
      },

      // ── Done ──
      { at: DRAWING_START + DRAWING_DURATION + 500, fn: () => {
        setProgress(100);
        setStage("Ready for exploration");
      }},
      { at: DRAWING_START + DRAWING_DURATION + 1000, fn: () => {
        startPhase("done");
        setShowReady(true);
      }},
      { at: DRAWING_START + DRAWING_DURATION + 3500, fn: () => onLoadingComplete() },
    ];

    for (const step of sequence) {
      queueTimeout(step.fn, step.at);
    }

    return () => {
      window.removeEventListener("resize", resize);
      stopAnimationLoop();
      stopRevealTimer();
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  return (
    <div className="cosmos-loader">
      <canvas ref={canvasRef} className="cosmos-loader__canvas" />

      <div className="cosmos-loader__overlay">
        <div className="cosmos-loader__tv">
          {headerText && (
            <div className="cosmos-loader__tv-header">{headerText}</div>
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
                    revealedSet.has(i) ? " cosmos-loader__tv-strip--peeled" : ""
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="cosmos-loader__info">
          <p className="cosmos-loader__stage">{stage}</p>

          <div className="cosmos-loader__progress-grid" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => {
              const threshold = ((i + 1) / 24) * 100;
              return (
                <span
                  key={i}
                  className={`cosmos-loader__progress-cell${
                    progress >= threshold ? " cosmos-loader__progress-cell--active" : ""
                  }`}
                />
              );
            })}
          </div>

          <div className="cosmos-loader__percentage">{progress}%</div>

          {showReady && <div className="cosmos-loader__ready">READY</div>}
        </div>
      </div>
    </div>
  );
}
