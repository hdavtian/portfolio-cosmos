import React from "react";

// ============================================================
// CockpitNavPanel — Destination navigation panel
// ============================================================
// Left-side column showing planets (sections) and moons
// (experience companies) in a compact, hierarchical layout.
// ============================================================

interface NavTarget {
  id: string;
  label: string;
  type: "section" | "moon";
  icon?: string;
  parentId?: string;
}

interface Props {
  targets: NavTarget[];
  currentTarget: string | null;
  isNavigating: boolean;
  onNavigate: (targetId: string, targetType: "section" | "moon") => void;
}

// Group moons under their parent planet
const PLANET_ORDER = ["experience", "skills", "projects", "about", "home"];

const CockpitNavPanel: React.FC<Props> = ({
  targets,
  currentTarget,
  isNavigating,
  onNavigate,
}) => {
  const planets = targets.filter((t) => t.type === "section");
  const moons = targets.filter((t) => t.type === "moon");

  // Sort planets to match the defined order
  const sortedPlanets = PLANET_ORDER.map((id) =>
    planets.find((p) => p.id === id),
  ).filter(Boolean) as NavTarget[];

  const stopEvt = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // ── Styles ──────────────────────────────────────────

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: "50%",
    left: 16,
    transform: "translateY(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    zIndex: 1000,
    pointerEvents: "auto",
    maxHeight: "70vh",
    overflowY: "auto",
    overflowX: "hidden",
    scrollbarWidth: "none",
  };

  const sectionLabelStyle: React.CSSProperties = {
    color: "rgba(200, 210, 230, 0.35)",
    fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    padding: "8px 10px 3px",
    userSelect: "none",
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
    textAlign: "left" as const,
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    boxSizing: "border-box" as const,
  };

  const btnPlanet: React.CSSProperties = {
    ...btnBase,
  };

  const btnMoon: React.CSSProperties = {
    ...btnBase,
    fontSize: 12,
    padding: "8px 16px 8px 26px",
    color: "rgba(200, 210, 230, 0.7)",
    border: "1px solid rgba(200, 200, 255, 0.12)",
    background: "rgba(10, 12, 20, 0.6)",
  };

  const btnActivePlanet: React.CSSProperties = {
    ...btnPlanet,
    background: "rgba(50, 200, 140, 0.2)",
    border: "1px solid rgba(50, 200, 140, 0.45)",
    color: "#ffffff",
    boxShadow: "0 0 8px rgba(50, 200, 140, 0.15)",
  };

  const btnActiveMoon: React.CSSProperties = {
    ...btnMoon,
    background: "rgba(50, 200, 140, 0.2)",
    border: "1px solid rgba(50, 200, 140, 0.45)",
    color: "#ffffff",
    boxShadow: "0 0 8px rgba(50, 200, 140, 0.15)",
  };

  const btnNavigating: React.CSSProperties = {
    ...btnPlanet,
    background: "rgba(232, 197, 71, 0.15)",
    border: "1px solid rgba(232, 197, 71, 0.4)",
    color: "#e8c547",
    boxShadow: "0 0 10px rgba(232, 197, 71, 0.15)",
  };

  const iconStyle: React.CSSProperties = {
    fontSize: 13,
    width: 18,
    textAlign: "center" as const,
    flexShrink: 0,
  };

  const getButtonStyle = (
    target: NavTarget,
    isCurrent: boolean,
    isNav: boolean,
  ): React.CSSProperties => {
    if (isNav && isCurrent) return btnNavigating;
    if (isCurrent)
      return target.type === "moon" ? btnActiveMoon : btnActivePlanet;
    return target.type === "moon" ? btnMoon : btnPlanet;
  };

  return (
    <div style={panelStyle} onMouseDown={stopEvt} onPointerDown={stopEvt}>
      <div style={sectionLabelStyle}>Destinations</div>

      {sortedPlanets.map((planet) => {
        const isCurrent = currentTarget === planet.id;
        const isNav = isNavigating && isCurrent;
        // Child destinations are grouped under their parent planet.
        // Backward compatibility: moons without parentId still belong to Experience.
        const childMoons = moons.filter((moon) =>
          moon.parentId ? moon.parentId === planet.id : planet.id === "experience",
        );

        return (
          <React.Fragment key={planet.id}>
            <button
              style={getButtonStyle(planet, isCurrent, isNav)}
              onClick={() => onNavigate(planet.id, "section")}
              onMouseDown={stopEvt}
            >
              <span style={iconStyle}>{planet.icon}</span>
              {planet.label}
            </button>

            {childMoons.map((moon) => {
              const moonCurrent = currentTarget === moon.id;
              const moonNav = isNavigating && moonCurrent;
              return (
                <button
                  key={moon.id}
                  style={getButtonStyle(moon, moonCurrent, moonNav)}
                  onClick={() => onNavigate(moon.id, "moon")}
                  onMouseDown={stopEvt}
                >
                  <span style={{ ...iconStyle, fontSize: 10 }}>●</span>
                  {moon.label}
                </button>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default CockpitNavPanel;
