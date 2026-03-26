import React, { useState, useMemo } from "react";

// ============================================================
// CockpitNavPanel — Destination navigation panel
// ============================================================
// Left-side column showing planets (sections) and moons
// (experience companies) in a compact, hierarchical layout
// with a career timeline alongside experience entries.
// ============================================================

interface NavTarget {
  id: string;
  label: string;
  type: "section" | "moon";
  icon?: string;
  parentId?: string;
  startDate?: string;
  endDate?: string;
}

interface Props {
  targets: NavTarget[];
  currentTarget: string | null;
  isNavigating: boolean;
  onNavigate: (targetId: string, targetType: "section" | "moon") => void;
  panelStyleOverride?: React.CSSProperties;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}

const PLANET_ORDER = ["experience", "skills", "projects", "portfolio", "about"];

const parseDateNumeric = (d: string): number => {
  const [m, y] = d.split("/");
  return (parseInt(y, 10) || 0) * 12 + (parseInt(m, 10) || 0);
};
const extractYear = (d: string): string => d.split("/")[1] || d;

// ── Individual button with local hover / press state ────────

const NavBtn: React.FC<{
  target: NavTarget;
  isCurrent: boolean;
  isNavigatingTo: boolean;
  onClick: () => void;
  stopEvt: (e: React.MouseEvent) => void;
}> = ({ target, isCurrent, isNavigatingTo, onClick, stopEvt }) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isMoon = target.type === "moon";

  const btnStyle = useMemo((): React.CSSProperties => {
    const s: React.CSSProperties = {
      padding: isMoon ? "5px 14px 5px 8px" : "8px 16px",
      borderRadius: isMoon ? 5 : 7,
      border: `1px solid rgba(200, 200, 255, ${isMoon ? 0.07 : 0.18})`,
      background: `rgba(10, 12, 20, ${isMoon ? 0.45 : 0.72})`,
      color: isMoon ? "rgba(200, 210, 230, 0.62)" : "#c8cce0",
      fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
      fontWeight: 600,
      fontSize: isMoon ? 11.5 : 13,
      letterSpacing: isMoon ? 0.4 : 0.8,
      cursor: "pointer",
      backdropFilter: "blur(10px)",
      transition: "all 0.28s ease, transform 0.12s ease",
      whiteSpace: "nowrap" as const,
      textAlign: "left" as const,
      display: "flex",
      alignItems: "center",
      gap: isMoon ? 6 : 8,
      width: "100%",
      boxSizing: "border-box" as const,
      outline: "none",
      transform: "scale(1)",
    };

    if (isNavigatingTo && isCurrent) {
      s.background = "rgba(232, 197, 71, 0.14)";
      s.border = "1px solid rgba(232, 197, 71, 0.4)";
      s.color = "#e8c547";
      s.boxShadow = "0 0 10px rgba(232, 197, 71, 0.14)";
    } else if (isCurrent) {
      s.background = `rgba(50, 200, 140, ${isMoon ? 0.12 : 0.18})`;
      s.border = `1px solid rgba(50, 200, 140, ${isMoon ? 0.32 : 0.45})`;
      s.color = "#ffffff";
      s.boxShadow = `0 0 8px rgba(50, 200, 140, ${isMoon ? 0.08 : 0.14})`;
    } else if (hovered) {
      s.background = `rgba(18, 26, 48, ${isMoon ? 0.7 : 0.82})`;
      s.border = `1px solid rgba(200, 200, 255, ${isMoon ? 0.18 : 0.32})`;
      s.color = isMoon ? "rgba(220, 225, 240, 0.88)" : "#dde0f0";
      s.boxShadow = `0 0 14px rgba(120, 160, 255, ${isMoon ? 0.05 : 0.08})`;
    }

    if (pressed) {
      s.transform = "scale(0.965)";
      s.transition = "all 0.28s ease, transform 0.06s ease";
    }

    return s;
  }, [isMoon, isCurrent, isNavigatingTo, hovered, pressed]);

  const dotGlow = hovered || isCurrent;

  return (
    <button
      style={btnStyle}
      onClick={onClick}
      onMouseDown={(e) => { setPressed(true); stopEvt(e); }}
      onMouseUp={() => setPressed(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
    >
      {isMoon ? (
        <span
          style={{
            display: "inline-block",
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: dotGlow
              ? "rgba(50, 200, 140, 0.7)"
              : "rgba(200, 210, 230, 0.3)",
            boxShadow: dotGlow ? "0 0 6px rgba(50, 200, 140, 0.35)" : "none",
            transition: "all 0.28s ease",
            flexShrink: 0,
          }}
        />
      ) : (
        <span
          style={{
            fontSize: 12,
            width: 16,
            textAlign: "center" as const,
            flexShrink: 0,
            opacity: hovered || isCurrent ? 1 : 0.7,
            transition: "opacity 0.28s ease",
          }}
        >
          {target.icon}
        </span>
      )}
      {target.label}
    </button>
  );
};

// ── Main panel ──────────────────────────────────────────────

const CockpitNavPanel: React.FC<Props> = ({
  targets,
  currentTarget,
  isNavigating,
  onNavigate,
  panelStyleOverride,
  panelRef,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const planets = targets.filter((t) => t.type === "section");
  const moons = targets.filter((t) => t.type === "moon");

  const sortedPlanets = PLANET_ORDER.map((id) =>
    planets.find((p) => p.id === id),
  ).filter(Boolean) as NavTarget[];

  const careerSpan = useMemo(() => {
    let earliest = Infinity;
    let latest = -Infinity;
    let earliestStr = "";
    let latestStr = "";
    moons.forEach((m) => {
      if (m.startDate) {
        const v = parseDateNumeric(m.startDate);
        if (v < earliest) { earliest = v; earliestStr = m.startDate; }
      }
      if (m.endDate) {
        const v = parseDateNumeric(m.endDate);
        if (v > latest) { latest = v; latestStr = m.endDate; }
      }
    });
    if (!earliestStr || !latestStr) return null;
    return { start: extractYear(earliestStr), end: extractYear(latestStr) };
  }, [moons]);

  const stopEvt = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // Tighten overall nav footprint (~40% narrower than previous 238px).
  const panelWidth = 142;

  const shellStyle: React.CSSProperties = {
    position: "fixed",
    top: "50%",
    left: 10,
    transform: "translateY(-50%)",
    zIndex: 1000,
    pointerEvents: "auto",
  };

  const panelStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    maxHeight: "72vh",
    width: panelWidth,
    overflowY: "auto",
    overflowX: "visible",
    scrollbarWidth: "none",
    transition: "transform 280ms ease, opacity 220ms ease",
    transform: isCollapsed ? `translateX(-${panelWidth + 18}px)` : "translateX(0)",
    opacity: isCollapsed ? 0 : 1,
    pointerEvents: isCollapsed ? "none" : "auto",
  };

  const collapsedTabStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 8,
    width: 30,
    minHeight: 176,
    border: "1px solid rgba(200, 210, 230, 0.32)",
    borderRadius: 8,
    background: "rgba(10, 12, 20, 0.82)",
    color: "rgba(220, 230, 245, 0.88)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
    transition: "opacity 220ms ease, transform 280ms ease",
    opacity: isCollapsed ? 1 : 0,
    transform: isCollapsed ? "translateX(0)" : "translateX(-12px)",
    pointerEvents: isCollapsed ? "auto" : "none",
    backdropFilter: "blur(10px)",
  };

  const sectionLabelStyle: React.CSSProperties = {
    color: "rgba(200, 210, 230, 0.3)",
    fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    padding: "6px 10px 3px",
    userSelect: "none",
  };

  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
  };

  const sectionHeaderToggleStyle: React.CSSProperties = {
    width: 16,
    height: 16,
    border: "1px solid rgba(200, 210, 230, 0.3)",
    borderRadius: 4,
    background: "rgba(10, 12, 20, 0.78)",
    color: "rgba(220, 230, 245, 0.86)",
    fontSize: 11,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    backdropFilter: "blur(8px)",
    padding: 0,
    flexShrink: 0,
  };

  const collapsedLabelStyle: React.CSSProperties = {
    ...sectionLabelStyle,
    padding: 0,
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    transform: "rotate(180deg)",
    whiteSpace: "nowrap",
  };

  const bracketColor = "rgba(255, 255, 255, 0.62)";

  const dateStyle: React.CSSProperties = {
    fontFamily: "'Rajdhani', 'Consolas', monospace",
    fontSize: 8.5,
    fontWeight: 600,
    letterSpacing: 1,
    color: "rgba(255, 255, 255, 0.82)",
    userSelect: "none",
    whiteSpace: "nowrap",
    width: 26,
    textAlign: "right" as const,
    flexShrink: 0,
  };

  return (
    <div
      ref={panelRef}
      style={{ ...shellStyle, ...panelStyleOverride }}
      onMouseDown={stopEvt}
      onPointerDown={stopEvt}
    >
      <button
        type="button"
        style={collapsedTabStyle}
        onClick={() => setIsCollapsed(false)}
        onMouseDown={stopEvt}
        aria-label="Show NaviComputer"
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>→</span>
        <span style={collapsedLabelStyle}>NaviComputer</span>
      </button>

      <div style={panelStyle}>
        <div style={sectionHeaderStyle}>
          <button
            type="button"
            style={sectionHeaderToggleStyle}
            onClick={() => setIsCollapsed(true)}
            onMouseDown={stopEvt}
            aria-label="Minimize NaviComputer"
          >
            ←
          </button>
          <div style={sectionLabelStyle}>NaviComputer</div>
        </div>

        {sortedPlanets.map((planet) => {
          const isCurrent = currentTarget === planet.id;
          const isNav = isNavigating && isCurrent;
          const childMoons = moons.filter((moon) =>
            moon.parentId ? moon.parentId === planet.id : planet.id === "experience",
          );
          const hasMoons = childMoons.length > 0;
          const showTimeline = hasMoons && !!careerSpan;

          return (
            <React.Fragment key={planet.id}>
              <NavBtn
                target={planet}
                isCurrent={isCurrent}
                isNavigatingTo={isNav}
                onClick={() => onNavigate(planet.id, "section")}
                stopEvt={stopEvt}
              />

              {hasMoons && (
                <div
                  style={{
                    marginLeft: showTimeline ? 0 : 18,
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  {childMoons.map((moon, moonIdx) => {
                    const moonCurrent = currentTarget === moon.id;
                    const moonNav = isNavigating && moonCurrent;
                    const isFirst = moonIdx === 0;
                    const isLast = moonIdx === childMoons.length - 1;

                    return (
                      <div
                        key={moon.id}
                        style={{
                          display: "flex",
                          alignItems: "stretch",
                          width: "100%",
                        }}
                      >
                        {/* Date + bracket column */}
                        {showTimeline && (
                          <>
                            {/* Date label: visible only on first and last rows */}
                            <span
                              style={{
                                ...dateStyle,
                                alignSelf: "center",
                                opacity: isFirst || isLast ? 1 : 0,
                              }}
                            >
                              {isFirst
                                ? careerSpan!.end
                                : isLast
                                  ? careerSpan!.start
                                  : ""}
                            </span>

                            {/* Bracket segment: top corner, vertical bar, or bottom corner */}
                            <div
                              style={{
                                width: 7,
                                alignSelf: "stretch",
                                borderRight: `2px solid ${bracketColor}`,
                                borderTop: isFirst
                                  ? `2px solid ${bracketColor}`
                                  : undefined,
                                borderBottom: isLast
                                  ? `2px solid ${bracketColor}`
                                  : undefined,
                                marginLeft: 3,
                                marginRight: 5,
                                flexShrink: 0,
                              }}
                            />
                          </>
                        )}

                        {/* Button wrapper — padding creates visual gap without
                            breaking the continuous bracket border */}
                        <div style={{ flex: 1, padding: "1px 0" }}>
                          <NavBtn
                            target={moon}
                            isCurrent={moonCurrent}
                            isNavigatingTo={moonNav}
                            onClick={() => onNavigate(moon.id, "moon")}
                            stopEvt={stopEvt}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default CockpitNavPanel;
