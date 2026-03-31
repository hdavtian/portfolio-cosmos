import React, { useRef, useEffect } from "react";
import type { DashcamPhase, DashcamController } from "./dashcamTV";

interface Props {
  dashcamPhase: DashcamPhase;
  controllerRef: React.MutableRefObject<DashcamController | null>;
}

const DC_DISPLAY_W = 272;
const DC_DISPLAY_H = 204;

export const DashcamTVPanel: React.FC<Props> = ({
  dashcamPhase,
  controllerRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = controllerRef.current;
    if (ctrl && canvasRef.current) {
      ctrl.setCanvas(canvasRef.current);
    }
    return () => {
      ctrl?.setCanvas(null);
    };
  }, [controllerRef, dashcamPhase]);

  // Screen shake: slightly stronger than target preview for engine vibration
  useEffect(() => {
    if (dashcamPhase !== "live_feed") {
      if (shakeRef.current) shakeRef.current.style.transform = "";
      return;
    }
    let raf: number;
    let last = 0;
    const el = shakeRef.current;
    const tick = (t: number) => {
      if (t - last > 70) {
        last = t;
        if (el) {
          const x = (Math.random() - 0.5) * 3.6;
          const y = (Math.random() - 0.5) * 3.6;
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
  }, [dashcamPhase]);

  const isVisible = dashcamPhase !== "hidden";

  const statusText =
    dashcamPhase === "intro" || dashcamPhase === "static_pre"
      ? "CONNECTING\u2026"
      : dashcamPhase === "live_feed"
        ? "\u25CF  FLIGHT CAM"
        : dashcamPhase === "outro_terminator"
          ? "FEED TERMINATED"
          : "";

  return (
    <div
      style={{
        position: "fixed",
        right: 22,
        top: "calc(50% + 130px)",
        transform: `translateY(-50%) ${isVisible ? "translateX(0)" : "translateX(120%)"}`,
        opacity: isVisible ? 1 : 0,
        transition: isVisible
          ? "transform 0.45s cubic-bezier(0.22,1,0.36,1) 0.12s, opacity 0.35s ease-out 0.12s"
          : "transform 0.3s ease-in, opacity 0.2s ease-in",
        zIndex: 1107,
        pointerEvents: "none",
      }}
    >
      <style>{`
        @keyframes dcSignalPulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          background: "rgba(14, 10, 6, 0.94)",
          border: "1.5px solid rgba(255, 160, 50, 0.25)",
          borderRadius: 6,
          padding: "6px 7px 5px",
          boxShadow:
            "0 4px 28px rgba(0,0,0,0.55), inset 0 0 16px rgba(220,120,30,0.06)",
        }}
      >
        {/* Header */}
        <div
          style={{
            fontFamily: "'Rajdhani', 'Courier New', monospace",
            fontSize: 9,
            color: "rgba(255, 180, 80, 0.6)",
            letterSpacing: 1.8,
            textTransform: "uppercase",
            marginBottom: 3,
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          Flight Cam
        </div>

        {/* Canvas container with shake wrapper */}
        <div
          style={{
            width: DC_DISPLAY_W,
            height: DC_DISPLAY_H,
            overflow: "hidden",
            borderRadius: 3,
            border: "1px solid rgba(200, 120, 40, 0.2)",
            position: "relative",
            background: "#000",
          }}
        >
          <div ref={shakeRef}>
            <canvas
              ref={canvasRef}
              style={{
                width: DC_DISPLAY_W,
                height: DC_DISPLAY_H,
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
              dashcamPhase === "live_feed"
                ? "rgba(255, 200, 80, 0.7)"
                : dashcamPhase === "outro_terminator"
                  ? "rgba(255, 60, 40, 0.65)"
                  : "rgba(200, 160, 100, 0.5)",
            letterSpacing: 1.2,
            textTransform: "uppercase",
            marginTop: 3,
            textAlign: "center",
            lineHeight: 1,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <span>{statusText}</span>

          {dashcamPhase === "live_feed" && (
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
                    background: "rgba(255, 200, 80, 0.55)",
                    animation: `dcSignalPulse ${0.6 + i * 0.18}s ease-in-out infinite`,
                    animationDelay: `${i * 0.1}s`,
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
