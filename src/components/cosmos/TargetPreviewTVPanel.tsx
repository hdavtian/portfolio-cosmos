import React, { useRef, useEffect, useState, useCallback } from "react";
import type { TVPhase, TVPreviewController } from "./targetPreviewTV";
import type { DashcamPhase, DashcamController } from "./dashcamTV";

type ActiveTab = "target" | "flight";

interface Props {
  tvPhase: TVPhase;
  tvControllerRef: React.MutableRefObject<TVPreviewController | null>;
  dashcamPhase: DashcamPhase;
  dashcamControllerRef: React.MutableRefObject<DashcamController | null>;
}

const TV_DISPLAY_W = 272;
const TV_DISPLAY_H = 204;

export const TargetPreviewTVPanel: React.FC<Props> = ({
  tvPhase,
  tvControllerRef,
  dashcamPhase,
  dashcamControllerRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("target");
  const prevVisibleRef = useRef(false);

  // Randomly pick initial tab when the panel becomes visible
  useEffect(() => {
    const isVisible = tvPhase !== "hidden" || dashcamPhase !== "hidden";
    if (isVisible && !prevVisibleRef.current) {
      setActiveTab(Math.random() > 0.5 ? "flight" : "target");
    }
    prevVisibleRef.current = isVisible;
  }, [tvPhase, dashcamPhase]);

  // Assign the shared canvas to whichever controller is active
  useEffect(() => {
    const canvas = canvasRef.current;
    const tvCtrl = tvControllerRef.current;
    const dcCtrl = dashcamControllerRef.current;

    if (activeTab === "target") {
      tvCtrl?.setCanvas(canvas);
      dcCtrl?.setCanvas(null);
    } else {
      tvCtrl?.setCanvas(null);
      dcCtrl?.setCanvas(canvas);
    }

    return () => {
      tvCtrl?.setCanvas(null);
      dcCtrl?.setCanvas(null);
    };
  }, [activeTab, tvControllerRef, dashcamControllerRef, tvPhase, dashcamPhase]);

  // Screen shake during live_feed
  useEffect(() => {
    const activeLive =
      (activeTab === "target" && tvPhase === "live_feed") ||
      (activeTab === "flight" && dashcamPhase === "live_feed");
    if (!activeLive) {
      if (shakeRef.current) shakeRef.current.style.transform = "";
      return;
    }
    let raf: number;
    let last = 0;
    const intensity = activeTab === "flight" ? 3.6 : 2.8;
    const el = shakeRef.current;
    const tick = (t: number) => {
      if (t - last > 85) {
        last = t;
        if (el) {
          const x = (Math.random() - 0.5) * intensity;
          const y = (Math.random() - 0.5) * intensity;
          el.style.transform = `translate(${x}px, ${y}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (el) el.style.transform = "";
    };
  }, [activeTab, tvPhase, dashcamPhase]);

  const handleTabClick = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
  }, []);

  const isVisible = tvPhase !== "hidden" || dashcamPhase !== "hidden";
  const activePhase = activeTab === "target" ? tvPhase : dashcamPhase;

  const statusText =
    activePhase === "intro" || activePhase === "static_pre"
      ? activeTab === "target"
        ? "ACQUIRING SIGNAL\u2026"
        : "CONNECTING\u2026"
      : activePhase === "live_feed"
        ? activeTab === "target"
          ? "\u25CF  LIVE"
          : "\u25CF  FLIGHT CAM"
        : activePhase === "outro_terminator"
          ? activeTab === "target"
            ? "SIGNAL LOST"
            : "FEED TERMINATED"
          : "";

  const isTarget = activeTab === "target";
  const accentColor = isTarget
    ? "rgba(90, 170, 255,"
    : "rgba(255, 160, 50,";
  const liveColor = isTarget
    ? "rgba(80, 255, 120,"
    : "rgba(255, 200, 80,";

  return (
    <div
      style={{
        position: "fixed",
        right: 22,
        top: "50%",
        transform: `translateY(-50%) ${isVisible ? "translateX(0)" : "translateX(120%)"}`,
        opacity: isVisible ? 1 : 0,
        transition: isVisible
          ? "transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease-out"
          : "transform 0.3s ease-in, opacity 0.2s ease-in",
        zIndex: 1108,
        pointerEvents: "none",
      }}
    >
      <style>{`
        @keyframes tvSignalPulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          background: isTarget
            ? "rgba(6, 14, 26, 0.94)"
            : "rgba(14, 10, 6, 0.94)",
          border: `1.5px solid ${accentColor}0.3)`,
          borderRadius: 6,
          padding: "6px 7px 5px",
          boxShadow: isTarget
            ? "0 4px 28px rgba(0,0,0,0.55), inset 0 0 16px rgba(50,120,220,0.06)"
            : "0 4px 28px rgba(0,0,0,0.55), inset 0 0 16px rgba(220,120,30,0.06)",
          transition: "background 0.3s, border-color 0.3s, box-shadow 0.3s",
        }}
      >
        {/* Tab buttons */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 4,
            justifyContent: "center",
          }}
        >
          {(["target", "flight"] as const).map((tab) => {
            const selected = activeTab === tab;
            const tabIsTarget = tab === "target";
            return (
              <button
                key={tab}
                onClick={() => handleTabClick(tab)}
                style={{
                  pointerEvents: "auto",
                  cursor: "pointer",
                  border: "none",
                  outline: "none",
                  borderRadius: 3,
                  padding: "2px 10px",
                  fontSize: 8,
                  fontFamily: "'Rajdhani', 'Courier New', monospace",
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  lineHeight: 1.4,
                  transition: "all 0.2s",
                  background: selected
                    ? tabIsTarget
                      ? "rgba(50, 130, 255, 0.25)"
                      : "rgba(255, 150, 40, 0.25)"
                    : "rgba(255,255,255,0.04)",
                  color: selected
                    ? tabIsTarget
                      ? "rgba(130, 200, 255, 0.9)"
                      : "rgba(255, 200, 120, 0.9)"
                    : "rgba(160,160,170,0.4)",
                  boxShadow: selected
                    ? tabIsTarget
                      ? "0 0 6px rgba(50,130,255,0.2)"
                      : "0 0 6px rgba(255,150,40,0.2)"
                    : "none",
                }}
              >
                {tabIsTarget ? "Target" : "Flight"}
              </button>
            );
          })}
        </div>

        {/* Canvas container with shake wrapper */}
        <div
          style={{
            width: TV_DISPLAY_W,
            height: TV_DISPLAY_H,
            overflow: "hidden",
            borderRadius: 3,
            border: `1px solid ${accentColor}0.2)`,
            position: "relative",
            background: "#000",
            transition: "border-color 0.3s",
          }}
        >
          <div ref={shakeRef}>
            <canvas
              ref={canvasRef}
              style={{
                width: TV_DISPLAY_W,
                height: TV_DISPLAY_H,
                display: "block",
              }}
            />
          </div>
          {/* CRT vignette */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 3,
              background:
                "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.45) 100%)",
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Status bar with signal bars */}
        <div
          style={{
            fontFamily: "'Rajdhani', 'Courier New', monospace",
            fontSize: 9,
            color:
              activePhase === "live_feed"
                ? `${liveColor}0.7)`
                : activePhase === "outro_terminator"
                  ? "rgba(255, 60, 40, 0.65)"
                  : `${accentColor}0.5)`,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            marginTop: 3,
            textAlign: "center",
            lineHeight: 1,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            transition: "color 0.3s",
          }}
        >
          <span>{statusText}</span>

          {activePhase === "live_feed" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "flex-end",
                gap: 1.2,
                marginLeft: 7,
                height: 10,
              }}
            >
              {[3, 5, 7, 9, 11].map((h, i) => (
                <span
                  key={i}
                  style={{
                    display: "block",
                    width: 2,
                    height: h,
                    background: `${liveColor}0.55)`,
                    animation: `tvSignalPulse ${0.7 + i * 0.15}s ease-in-out infinite`,
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
