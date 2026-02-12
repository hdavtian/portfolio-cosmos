import React, { useEffect, useState, useCallback } from "react";

// ============================================================
// CockpitHints — Contextual keyboard/mouse hints when inside ship
// ============================================================
// Shows briefly on entry, dismissable, H to toggle.
// ============================================================

interface Props {
  insideShip: boolean;
  shipViewMode: "exterior" | "interior" | "cockpit";
}

const CockpitHints: React.FC<Props> = ({ insideShip, shipViewMode }) => {
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  // Show hints when entering ship, auto-hide after 5s
  useEffect(() => {
    if (insideShip) {
      setVisible(true);
      setFadingOut(false);
      const timer = setTimeout(() => {
        setFadingOut(true);
        setTimeout(() => setVisible(false), 800);
      }, 5000);
      return () => clearTimeout(timer);
    }
    setVisible(false);
    setFadingOut(false);
  }, [insideShip, shipViewMode]);

  // H key to toggle
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!insideShip) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        setVisible((prev) => {
          if (!prev) setFadingOut(false);
          return !prev;
        });
      }
    },
    [insideShip],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!insideShip || !visible) return null;

  const isCockpit = shipViewMode === "cockpit";

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 80,
    right: 20,
    padding: "12px 16px",
    borderRadius: 8,
    background: "rgba(10, 12, 20, 0.7)",
    border: "1px solid rgba(200, 200, 255, 0.15)",
    backdropFilter: "blur(8px)",
    color: "rgba(200, 210, 230, 0.8)",
    fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
    fontSize: 11,
    lineHeight: 1.7,
    zIndex: 999,
    opacity: fadingOut ? 0 : 1,
    transition: "opacity 0.8s ease",
    pointerEvents: "none",
    maxWidth: 220,
  };

  const labelStyle: React.CSSProperties = {
    color: "rgba(200, 210, 230, 0.5)",
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  };

  const kbdStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "0px 4px",
    borderRadius: 3,
    background: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    fontFamily: "monospace",
    fontSize: 10,
    marginRight: 6,
  };

  return (
    <div style={containerStyle}>
      <div style={labelStyle}>
        {isCockpit ? "COCKPIT CONTROLS" : "CABIN CONTROLS"}
      </div>
      <div>
        <span style={{ marginRight: 4 }}>🖱️</span>Drag — Look around
      </div>
      <div>
        <span style={{ marginRight: 4 }}>🔲</span>Scroll — Zoom (FOV)
      </div>
      <div>
        <span style={{ marginRight: 4 }}>⇧</span>Shift + Drag — Steer Ship
      </div>
      <div style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 6 }}>
        <span style={kbdStyle}>1</span>3rd Person
        <span style={{ ...kbdStyle, marginLeft: 8 }}>2</span>Cabin
        <span style={{ ...kbdStyle, marginLeft: 8 }}>3</span>Cockpit
      </div>
      <div style={{ marginTop: 4, opacity: 0.5 }}>
        <span style={kbdStyle}>H</span>Toggle hints
      </div>
    </div>
  );
};

export default CockpitHints;
