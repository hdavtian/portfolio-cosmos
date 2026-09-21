/* eslint-disable react-hooks/set-state-in-effect --
 * The loader is a timed sequence (teaser, frenzy, end) driven by timers and by
 * loading hints from the scene, so its effects do set state. Removing the
 * canvas render loop made these long-standing patterns visible to the rule.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "../lib/analytics";
import { IS_DEBUG_OVERLAYS, dlog } from "../lib/debugLog";
import "./CosmosLoader.scss";

export interface CosmosLoaderProps {
  onLoadingComplete: () => void;
  /** Name on the loader's TV screen (published profile). */
  wordmark?: string;
  isSceneReady?: boolean;
  loadingProgressHint?: number;
  loadingStageHint?: string;
}

type Phase = "idle" | "colorCycle" | "teaser" | "frenzy" | "done";

const DEFAULT_REVEAL_LINES = 36;
const REVEAL_LINE_MIN_RATIO = 0.2; // 1/5th of max line thickness
const FRENZY_BASE_DURATION_MS = 333 * DEFAULT_REVEAL_LINES;
const PROGRAM_TEXT = "Program: My Tech Journey";

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
  wordmark = "HARMA DAVTIAN",
  isSceneReady = false,
  loadingProgressHint = 0,
  loadingStageHint = "",
}: CosmosLoaderProps) {
  const debugEnabled = IS_DEBUG_OVERLAYS;
  const phaseRef = useRef<Phase>("idle");
  const timeoutsRef = useRef<number[]>([]);
  const intervalsRef = useRef<number[]>([]);
  // The broadcast signal behind the TV is drawn by the compositor (see
  // CosmosLoader.scss). It used to be redrawn on the canvas every frame, which
  // stuttered whenever the 3D scene was busy compiling shaders or decoding
  // textures on the main thread.
  const [signalPhase, setSignalPhase] = useState<Phase>("idle");

  const [typedText, setTypedText] = useState("");
  const [stageText, setStageText] = useState("");
  const [showStatusUI, setShowStatusUI] = useState(false);
  const [showEndMessage, setShowEndMessage] = useState(false);
  const [typedCompletionText, setTypedCompletionText] = useState("");
  const [entryGateVisible, setEntryGateVisible] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [showInspirationOverlay, setShowInspirationOverlay] = useState(false);
  const [progress, setProgress] = useState(0);
  const [revealLineFractions, setRevealLineFractions] = useState<number[]>(
    () =>
      Array.from(
        { length: DEFAULT_REVEAL_LINES },
        () => 1 / DEFAULT_REVEAL_LINES,
      ),
  );
  const [animationDone, setAnimationDone] = useState(false);
  const [debugCurrentMode, setDebugCurrentMode] = useState("boot");
  const [debugModeHistory, setDebugModeHistory] = useState<string[]>([]);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (animationDone) return;
    if (phaseRef.current !== "frenzy") return;
    const normalizedHint = Math.max(0, Math.min(99, Math.round(loadingProgressHint)));
    setProgress((prev) => Math.max(prev, normalizedHint));
  }, [loadingProgressHint, animationDone]);

  useEffect(() => {
    if (!loadingStageHint || showEndMessage) return;
    if (phaseRef.current === "frenzy" || phaseRef.current === "done") return;
    setStageText(loadingStageHint);
  }, [loadingStageHint, showEndMessage]);

  const shuffledOrderRef = useRef<number[]>([]);
  const revealCountRef = useRef(0);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const setStripRef = useCallback(
    (index: number) => (node: HTMLDivElement | null) => {
      stripRefs.current[index] = node;
    },
    [],
  );
  const revealStrip = useCallback((index: number) => {
    stripRefs.current[index]?.classList.add("cosmos-loader__tv-strip--peeled");
  }, []);
  const coverAllStrips = useCallback(() => {
    for (const strip of stripRefs.current) {
      strip?.classList.remove("cosmos-loader__tv-strip--peeled");
    }
  }, []);

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
      dlog(`[LOADER:mode] ${mode}`);
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

  const handleEnterLoader = useCallback(() => {
    if (hasEntered) return;
    trackEvent("loader_enter_click");
    setHasEntered(true);
    markDebugMode("user-entered");
  }, [hasEntered, markDebugMode]);

  // ── Signal ───────────────────────────────────────────────────

  const startPhase = useCallback(
    (phase: Phase) => {
      setLoaderPhase(phase);
      setSignalPhase(phase);
    },
    [setLoaderPhase],
  );

  // ── Orchestration ────────────────────────────────────────────

  useEffect(() => {
    setLoaderPhase("idle", "idle");
    setTypedText(PROGRAM_TEXT);
    setShowStatusUI(true);
    setStageText("Initializing...");
    setProgress((prev) => Math.max(prev, 0));
    coverAllStrips();
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
      setSignalPhase("idle");
      setLoaderPhase("idle", "teaser-end");
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
      coverAllStrips();
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
        revealStrip(lineIndex);

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
      setSignalPhase("done");
      setLoaderPhase("idle", "end-prep");
      setProgress(100);
      setStageText("Ready for Exploration");
      setShowEndMessage(true);
      setEntryGateVisible(true);
      markDebugMode("ready-message");
      setLoaderPhase("done", "done");
      setAnimationDone(true);
      markDebugMode("done");
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
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
      intervalsRef.current.forEach((id) => clearInterval(id));
      intervalsRef.current = [];
    };
  }, [
    coverAllStrips,
    markDebugMode,
    queueInterval,
    queueTimeout,
    clearQueuedInterval,
    revealStrip,
    startPhase,
    setLoaderPhase,
  ]);

  useEffect(() => {
    if (animationDone) markDebugMode("animation-done");
  }, [animationDone, markDebugMode]);

  useEffect(() => {
    if (isSceneReady) markDebugMode("scene-ready");
  }, [isSceneReady, markDebugMode]);

  useEffect(() => {
    if (!showInspirationOverlay) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowInspirationOverlay(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showInspirationOverlay]);

  useEffect(() => {
    if (!showEndMessage) {
      setTypedCompletionText("");
      return;
    }
    const finalText = "... Load Completed ...";
    setTypedCompletionText("");
    let index = 0;
    const typeId = window.setInterval(() => {
      index += 1;
      setTypedCompletionText(finalText.slice(0, index));
      if (index >= finalText.length) {
        clearInterval(typeId);
      }
    }, 42);
    return () => {
      clearInterval(typeId);
    };
  }, [showEndMessage]);

  // Dismiss only when animation, scene readiness, and user entry are complete.
  useEffect(() => {
    if (animationDone && isSceneReady && hasEntered) {
      markDebugMode("loader-complete");
      onLoadingComplete();
    }
  }, [animationDone, isSceneReady, hasEntered, onLoadingComplete, markDebugMode]);

  return (
    <div className="cosmos-loader">
      <div className="cosmos-loader__signal" data-phase={signalPhase} aria-hidden="true">
        <div className="cosmos-loader__signal-bars" />
        <div className="cosmos-loader__signal-data" />
        <div className="cosmos-loader__signal-noise" />
      </div>

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
                <div className="cosmos-loader__tv-wordmark">{wordmark}</div>
                <div className="cosmos-loader__tv-sub">PORTFOLIO</div>
              </div>
            </div>
            <div className="cosmos-loader__tv-mask">
              {revealLineFractions.map((fraction, i) => (
                <div
                  key={i}
                  ref={setStripRef(i)}
                  className="cosmos-loader__tv-strip"
                  style={{ height: `${fraction * 100}%`, flex: "0 0 auto" }}
                />
              ))}
            </div>
          </div>
        </div>

        {showStatusUI && (
          <div className="cosmos-loader__info">
            <div className="cosmos-loader__status-row">
              <div className="cosmos-loader__status-inline">
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
                <p className="cosmos-loader__stage">{stageText}</p>
                {showEndMessage && (
                  <div className="cosmos-loader__end-message" aria-live="polite">
                    {typedCompletionText}
                  </div>
                )}
              </div>
              {entryGateVisible && (
                <div className="cosmos-loader__entry-gate">
                  <button
                    type="button"
                    className="cosmos-loader__enter-button"
                    onClick={handleEnterLoader}
                    disabled={hasEntered}
                  >
                    {hasEntered ? "Entering..." : "Enter"}
                  </button>
                </div>
              )}
            </div>
            <hr className="cosmos-loader__divider" />
            <div className="cosmos-loader__footer-line">
              <span>harmadavtian.com</span>
              <span aria-hidden="true">|</span>
              <span>{currentYear}</span>
            </div>
            <div className="cosmos-loader__footer-about">
              <button
                type="button"
                className="cosmos-loader__about-trigger"
                onClick={() => {
                  trackEvent("loader_about_click");
                  setShowInspirationOverlay(true);
                }}
                aria-label="About this loader"
              >
                about loader
              </button>
            </div>
          </div>
        )}

        {showInspirationOverlay && (
          <div
            className="cosmos-loader__about-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Sinclair loader inspiration"
            onClick={() => setShowInspirationOverlay(false)}
          >
            <div
              className="cosmos-loader__about-card"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="cosmos-loader__about-close"
                onClick={() => setShowInspirationOverlay(false)}
                aria-label="Close overlay"
              >
                X
              </button>
              <p className="cosmos-loader__about-text">
                This loader was inspired by my very first computer, a British-made
                Sinclair Spectrum from the 1980s. The game load screens are forever
                etched in my memory.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
