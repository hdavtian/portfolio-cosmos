import React, { useEffect, useState, useCallback, useRef } from "react";
import { FOLLOW_DISTANCE } from "../cosmos/scaleConfig";

// Zoom slider range: 0% = farthest (ZOOM_MAX_DIST), 100% = closest (ZOOM_MIN_DIST).
// Camera follow-distance is stored as world units on spaceFollowDistance.
const ZOOM_MIN_DIST = 1;   // closest camera distance (100% zoom)
const ZOOM_MAX_DIST = 9;   // farthest camera distance (0% zoom)

// ============================================================
// ShipControlBar — Ship control bar UI
// ============================================================
// Phases: hidden (before intro completes) → ship-engaged (control bar visible)
// Ship auto-engages after the intro cinematic — no manual choice needed.
// ============================================================

export type ShipUIPhase =
  | "hidden"        // before ship settles / intro completes
  | "initial"       // (legacy — unused, auto-transitions to ship-engaged)
  | "ship-engaged"  // using the ship — control bar visible
  | "free-explore"; // (legacy — unused)

export type ShipView = "exterior" | "interior" | "cockpit";

interface Props {
  phase: ShipUIPhase;
  activeView: ShipView;
  onUseShip?: () => void;       // legacy — unused (ship auto-engages)
  onFreeExplore?: () => void;   // legacy — unused
  onLeaveShip: () => void;
  onSummonFalcon?: () => void;  // legacy — unused
  onViewChange: (view: ShipView) => void;
  onRollStart?: (direction: -1 | 1) => void;
  onRollStop?: () => void;
  rollAngle?: number;
  /** True when Falcon is escorting the Star Destroyer */
  isFollowingSD?: boolean;
  /** Called to break formation with the Star Destroyer */
  onDisengage?: () => void;
  zoomLevel?: number;
  onZoomChange?: (value: number) => void;
}

const ShipControlBar: React.FC<Props> = ({
  phase,
  activeView,
  // onUseShip, onFreeExplore, onSummonFalcon — no longer used (auto-engage)
  onLeaveShip,
  onViewChange,
  onRollStart,
  onRollStop,
  rollAngle = 0,
  isFollowingSD = false,
  onDisengage,
  zoomLevel = FOLLOW_DISTANCE,
  onZoomChange,
}) => {
  const [fadeIn, setFadeIn] = useState(false);
  const [rollingDir, setRollingDir] = useState<-1 | 0 | 1>(0);
  const rollingRef = useRef<-1 | 0 | 1>(0);

  // Fade in when phase changes from hidden
  useEffect(() => {
    if (phase !== "hidden") {
      const timer = setTimeout(() => setFadeIn(true), 50);
      return () => clearTimeout(timer);
    }
    setFadeIn(false);
  }, [phase]);

  // Roll start/stop helpers — work with both mouse and touch
  const startRoll = useCallback(
    (dir: -1 | 1) => {
      rollingRef.current = dir;
      setRollingDir(dir);
      onRollStart?.(dir);
    },
    [onRollStart],
  );

  const stopRoll = useCallback(() => {
    if (rollingRef.current !== 0) {
      rollingRef.current = 0;
      setRollingDir(0);
      onRollStop?.();
    }
  }, [onRollStop]);

  // Global pointerup to catch releases outside the button
  useEffect(() => {
    const handleUp = () => stopRoll();
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [stopRoll]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (phase === "ship-engaged") {
        switch (e.key.toLowerCase()) {
          case "x":
            e.preventDefault();
            onLeaveShip();
            break;
          case "1":
            e.preventDefault();
            onViewChange("exterior");
            break;
          case "2":
            e.preventDefault();
            onViewChange("interior");
            break;
          case "3":
            e.preventDefault();
            onViewChange("cockpit");
            break;
        }
      }
    },
    [phase, onLeaveShip, onViewChange],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (phase === "hidden") return null;

  const btnBase: React.CSSProperties = {
    padding: "10px 20px",
    borderRadius: 8,
    border: "1px solid rgba(200, 200, 255, 0.25)",
    background: "rgba(10, 12, 20, 0.75)",
    color: "#c8cce0",
    fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: 0.8,
    cursor: "pointer",
    backdropFilter: "blur(12px)",
    transition: "all 0.2s ease",
    whiteSpace: "nowrap" as const,
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: "rgba(80, 140, 255, 0.3)",
    border: "1px solid rgba(100, 160, 255, 0.6)",
    color: "#ffffff",
    boxShadow: "0 0 12px rgba(80, 140, 255, 0.25)",
  };

  const btnDanger: React.CSSProperties = {
    ...btnBase,
    background: "rgba(255, 100, 80, 0.12)",
    border: "1px solid rgba(255, 100, 80, 0.35)",
    color: "#ff9080",
    fontSize: 12,
  };

  const kbdStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "1px 5px",
    borderRadius: 3,
    background: "rgba(255, 255, 255, 0.1)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    fontSize: 10,
    marginLeft: 6,
    fontFamily: "monospace",
    verticalAlign: "middle",
  };

  // Roll button styles
  const rollBtnBase: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid rgba(200, 200, 255, 0.2)",
    background: "rgba(10, 12, 20, 0.75)",
    color: "#a0a8c0",
    fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
    backdropFilter: "blur(12px)",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap" as const,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none" as const,
    touchAction: "none" as const,
  };

  const rollBtnActive: React.CSSProperties = {
    ...rollBtnBase,
    background: "rgba(80, 200, 160, 0.3)",
    border: "1px solid rgba(80, 220, 160, 0.6)",
    color: "#b0ffd0",
    boxShadow: "0 0 10px rgba(80, 220, 160, 0.2)",
  };

  const rollGroupStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 0,
    borderRadius: 8,
    overflow: "hidden",
    border: "1px solid rgba(200, 200, 255, 0.15)",
  };

  const rollBtnLeft: React.CSSProperties = {
    ...(rollingDir === -1 ? rollBtnActive : rollBtnBase),
    borderRadius: "7px 0 0 7px",
    border: "none",
    borderRight: "1px solid rgba(200, 200, 255, 0.1)",
    padding: "8px 11px",
  };

  const rollBtnRight: React.CSSProperties = {
    ...(rollingDir === 1 ? rollBtnActive : rollBtnBase),
    borderRadius: "0 7px 7px 0",
    border: "none",
    padding: "8px 11px",
  };

  const rollLabelStyle: React.CSSProperties = {
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    color: "rgba(160, 168, 192, 0.6)",
    fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
    fontWeight: 600,
    padding: "0 6px",
    background: "rgba(10, 12, 20, 0.75)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    lineHeight: 1.2,
    minWidth: 42,
  };

  const stopEvt = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // ── Phase: Ship engaged — control bar ──────────────
  if (phase === "ship-engaged") {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          zIndex: 1000,
          opacity: fadeIn ? 1 : 0,
          transition: "opacity 1s ease-in-out",
          pointerEvents: "auto",
        }}
        onMouseDown={stopEvt}
        onPointerDown={stopEvt}
      >
        {/* Zoom slider — above the buttons, 3rd person exterior only */}
        {activeView === "exterior" && onZoomChange && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid rgba(200, 200, 255, 0.15)",
              background: "rgba(10, 12, 20, 0.75)",
              backdropFilter: "blur(12px)",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <span style={{
              fontSize: 9,
              letterSpacing: 1,
              textTransform: "uppercase" as const,
              color: "rgba(160, 168, 192, 0.6)",
              fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
              fontWeight: 600,
              whiteSpace: "nowrap" as const,
            }}>
              ZOOM
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(((ZOOM_MAX_DIST - zoomLevel) / (ZOOM_MAX_DIST - ZOOM_MIN_DIST)) * 100)}
              onChange={(e) => {
                e.stopPropagation();
                const pct = parseFloat(e.target.value);
                // 0% → farthest (ZOOM_MAX_DIST), 100% → closest (ZOOM_MIN_DIST)
                const dist = ZOOM_MAX_DIST - (pct / 100) * (ZOOM_MAX_DIST - ZOOM_MIN_DIST);
                onZoomChange(Math.round(dist * 10) / 10);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                height: 4,
                cursor: "pointer",
                accentColor: "rgba(80, 140, 255, 0.8)",
              }}
            />
            <span style={{
              fontSize: 10,
              fontFamily: "monospace",
              color: "rgba(180, 200, 255, 0.7)",
              minWidth: 30,
              textAlign: "right" as const,
            }}>
              {Math.round(((ZOOM_MAX_DIST - zoomLevel) / (ZOOM_MAX_DIST - ZOOM_MIN_DIST)) * 100)}%
            </span>
          </div>
        )}

        {/* Star Destroyer escort — Disengage button */}
        {isFollowingSD && onDisengage && (
          <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <button
              style={{
                ...btnBase,
                background: "rgba(80, 200, 255, 0.15)",
                border: "1px solid rgba(80, 200, 255, 0.45)",
                color: "#60ccff",
                fontSize: 12,
                letterSpacing: 1.2,
              }}
              onClick={() => onDisengage()}
              onMouseDown={stopEvt}
            >
              Disengage
            </button>
          </div>
        )}

        {/* Main button row */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={btnDanger}
            onClick={() => onLeaveShip()}
            onMouseDown={stopEvt}
          >
            Leave Ship<span style={kbdStyle}>X</span>
          </button>
          <button
            style={activeView === "exterior" ? btnActive : btnBase}
            onClick={() => onViewChange("exterior")}
            onMouseDown={stopEvt}
          >
            3rd Person<span style={kbdStyle}>1</span>
          </button>
          <button
            style={activeView === "interior" ? btnActive : btnBase}
            onClick={() => onViewChange("interior")}
            onMouseDown={stopEvt}
          >
            Cabin<span style={kbdStyle}>2</span>
          </button>
          <button
            style={activeView === "cockpit" ? btnActive : btnBase}
            onClick={() => onViewChange("cockpit")}
            onMouseDown={stopEvt}
          >
            Cockpit<span style={kbdStyle}>3</span>
          </button>

          {/* Divider */}
          <div style={{
            width: 1,
            alignSelf: "stretch",
            margin: "4px 2px",
            background: "rgba(200, 200, 255, 0.15)",
          }} />

          {/* Roll (bank) control — hold to roll the ship left or right */}
          <div style={rollGroupStyle}>
            <button
              style={rollBtnLeft}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); startRoll(-1); }}
              title="Roll left (bank port)"
            >
              {/* Tilted horizon icon — left bank */}
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                <line x1="2" y1="10" x2="16" y2="5" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
                <line x1="3" y1="9.5" x2="7" y2="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="11" y1="6.5" x2="15" y2="5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="9" cy="7.2" r="1.5" fill="currentColor" />
              </svg>
            </button>
            <div style={rollLabelStyle}>
              <span>Ship</span>
              <span>Roll</span>
              {Math.abs(rollAngle) > 0.005 && (
                <span style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "rgba(180, 200, 255, 0.8)",
                  letterSpacing: 0,
                }}>
                  {(rollAngle * (180 / Math.PI)).toFixed(1)}°
                </span>
              )}
            </div>
            <button
              style={rollBtnRight}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); startRoll(1); }}
              title="Roll right (bank starboard)"
            >
              {/* Tilted horizon icon — right bank */}
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                <line x1="2" y1="5" x2="16" y2="10" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
                <line x1="3" y1="5.5" x2="7" y2="7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="11" y1="8.5" x2="15" y2="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="9" cy="7.8" r="1.5" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ShipControlBar;
