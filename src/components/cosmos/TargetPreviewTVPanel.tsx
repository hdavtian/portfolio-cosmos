import React, { useRef, useEffect } from "react";
import type { TVPhase, TVPreviewController } from "./targetPreviewTV";

interface Props {
  tvPhase: TVPhase;
  controllerRef: React.MutableRefObject<TVPreviewController | null>;
}

const TV_DISPLAY_W = 272;
const TV_DISPLAY_H = 204;

export const TargetPreviewTVPanel: React.FC<Props> = ({
  tvPhase,
  controllerRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctrl = controllerRef.current;
    if (ctrl && canvasRef.current) {
      ctrl.setCanvas(canvasRef.current);
    }
    return () => {
      ctrl?.setCanvas(null);
    };
  }, [controllerRef, tvPhase]);

  const isVisible = tvPhase !== "hidden";

  const statusText =
    tvPhase === "intro" || tvPhase === "static_pre"
      ? "ACQUIRING SIGNAL\u2026"
      : tvPhase === "live_feed"
        ? "\u25CF  LIVE"
        : tvPhase === "outro_terminator"
          ? "SIGNAL LOST"
          : "";

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
      <div
        style={{
          background: "rgba(6, 14, 26, 0.94)",
          border: "1.5px solid rgba(90, 170, 255, 0.3)",
          borderRadius: 6,
          padding: "6px 7px 5px",
          boxShadow:
            "0 4px 28px rgba(0,0,0,0.55), inset 0 0 16px rgba(50,120,220,0.06)",
        }}
      >
        {/* Header */}
        <div
          style={{
            fontFamily: "'Rajdhani', 'Courier New', monospace",
            fontSize: 9,
            color: "rgba(130, 190, 255, 0.65)",
            letterSpacing: 1.8,
            textTransform: "uppercase",
            marginBottom: 3,
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          Target Preview
        </div>

        {/* Canvas container */}
        <div
          style={{
            width: TV_DISPLAY_W,
            height: TV_DISPLAY_H,
            overflow: "hidden",
            borderRadius: 3,
            border: "1px solid rgba(50, 100, 180, 0.2)",
            position: "relative",
            background: "#000",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: TV_DISPLAY_W,
              height: TV_DISPLAY_H,
              display: "block",
            }}
          />
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

        {/* Status bar */}
        <div
          style={{
            fontFamily: "'Rajdhani', 'Courier New', monospace",
            fontSize: 9,
            color:
              tvPhase === "live_feed"
                ? "rgba(80, 255, 120, 0.7)"
                : tvPhase === "outro_terminator"
                  ? "rgba(255, 60, 40, 0.65)"
                  : "rgba(100, 160, 220, 0.5)",
            letterSpacing: 1.2,
            textTransform: "uppercase",
            marginTop: 3,
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          {statusText}
        </div>
      </div>
    </div>
  );
};
