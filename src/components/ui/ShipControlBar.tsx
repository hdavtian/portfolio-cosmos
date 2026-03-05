import React, { useEffect, useState } from "react";

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
  /** True when Falcon is escorting the Star Destroyer */
  isFollowingSD?: boolean;
  /** Called to break formation with the Star Destroyer */
  onDisengage?: () => void;
}

const ShipControlBar: React.FC<Props> = ({
  phase,
  isFollowingSD = false,
  onDisengage,
}) => {
  const [fadeIn, setFadeIn] = useState(false);

  // Fade in when phase changes from hidden
  useEffect(() => {
    if (phase !== "hidden") {
      const timer = setTimeout(() => setFadeIn(true), 50);
      return () => clearTimeout(timer);
    }
    setFadeIn(false);
  }, [phase]);

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

  const stopEvt = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const showControls = isFollowingSD && !!onDisengage;
  if (!showControls) return null;

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

      </div>
    );
  }

  return null;
};

export default ShipControlBar;
