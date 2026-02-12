import React, { useEffect, useState, useCallback } from "react";

// ============================================================
// ShipControlBar — Main ship engagement UI
// ============================================================
// Phase 1: Initial choice ("Use Millennium Falcon" / "Freely Explore")
// Phase 2: Ship control bar (Leave Ship, 3rd Person, Cabin, Cockpit)
// Phase 3: Free explore with "Summon Falcon" button
// ============================================================

export type ShipUIPhase =
  | "hidden"        // before ship settles
  | "initial"       // initial choice buttons
  | "ship-engaged"  // using the ship — control bar visible
  | "free-explore"; // freely exploring — summon button visible

export type ShipView = "exterior" | "interior" | "cockpit";

interface Props {
  phase: ShipUIPhase;
  activeView: ShipView;
  onUseShip: () => void;
  onFreeExplore: () => void;
  onLeaveShip: () => void;
  onSummonFalcon: () => void;
  onViewChange: (view: ShipView) => void;
}

const ShipControlBar: React.FC<Props> = ({
  phase,
  activeView,
  onUseShip,
  onFreeExplore,
  onLeaveShip,
  onSummonFalcon,
  onViewChange,
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

  const baseStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 32,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 8,
    zIndex: 1000,
    opacity: fadeIn ? 1 : 0,
    transition: "opacity 1s ease-in-out",
    pointerEvents: "auto",
  };

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

  const btnAccent: React.CSSProperties = {
    ...btnBase,
    background: "rgba(232, 197, 71, 0.15)",
    border: "1px solid rgba(232, 197, 71, 0.45)",
    color: "#e8c547",
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

  const stopEvt = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // ── Phase: Initial choice ──────────────────────────
  if (phase === "initial") {
    return (
      <div style={baseStyle} onMouseDown={stopEvt} onPointerDown={stopEvt}>
        <button
          style={btnAccent}
          onClick={() => onUseShip()}
          onMouseDown={stopEvt}
        >
          Use Millennium Falcon
        </button>
        <button
          style={btnBase}
          onClick={() => onFreeExplore()}
          onMouseDown={stopEvt}
        >
          Freely Explore Universe
        </button>
      </div>
    );
  }

  // ── Phase: Ship engaged — control bar ──────────────
  if (phase === "ship-engaged") {
    return (
      <div style={baseStyle} onMouseDown={stopEvt} onPointerDown={stopEvt}>
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
      </div>
    );
  }

  // ── Phase: Free explore — summon button ────────────
  if (phase === "free-explore") {
    return (
      <div style={baseStyle} onMouseDown={stopEvt} onPointerDown={stopEvt}>
        <button
          style={btnAccent}
          onClick={() => onSummonFalcon()}
          onMouseDown={stopEvt}
        >
          Summon Falcon
        </button>
      </div>
    );
  }

  return null;
};

export default ShipControlBar;
