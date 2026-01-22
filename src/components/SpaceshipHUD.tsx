import React from "react";

interface OverlaySection {
  id: string;
  title: string;
  content: string | string[];
  type: "text" | "timeline" | "skills" | "achievements" | "gallery";
  data?: any;
}

interface OverlayContent {
  title: string;
  subtitle?: string;
  description: string;
  sections: OverlaySection[];
  actions?: { label: string; action: string; icon?: string }[];
}

interface SpaceshipHUDProps {
  // Top Bar
  userName: string;
  userTitle: string;

  // Console
  consoleLogs: string[];
  consoleVisible: boolean;
  onConsoleToggle: () => void;
  onConsoleCopy: () => void;
  onConsoleClear: () => void;

  // Tour Controls
  tourActive: boolean;
  tourWaypoint: string;
  tourProgress: { current: number; total: number };
  onTourPrevious: () => void;
  onTourNext: () => void;
  onTourRestart: () => void;
  onTourEnd: () => void;

  // Speed/Travel indicator
  isTransitioning?: boolean;
  speed?: number;

  // Content Panel
  content: OverlayContent | null;
  contentLoading: boolean;
  onContentAction?: (action: string) => void;
}

export const SpaceshipHUD: React.FC<SpaceshipHUDProps> = ({
  userName,
  userTitle,
  consoleLogs,
  consoleVisible,
  onConsoleToggle,
  onConsoleCopy,
  onConsoleClear,
  tourActive,
  tourWaypoint,
  tourProgress,
  onTourPrevious,
  onTourNext,
  onTourRestart,
  onTourEnd,
  isTransitioning = false,
  speed = 0,
  content,
  contentLoading,
  onContentAction,
}) => {
  return (
    <>
      {/* ========== TOP COCKPIT FRAME ========== */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "45px",
          background: "linear-gradient(180deg, #1a1f28 0%, #0f1419 100%)",
          borderBottom: "3px solid #2a3340",
          boxShadow:
            "0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
          zIndex: 10000,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 25px",
            height: "100%",
          }}
        >
          {/* Left: Commander ID */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                fontSize: "13px",
                color: "#e8c547",
                letterSpacing: "1.5px",
                fontFamily: "'Cinzel', serif",
                fontWeight: "600",
              }}
            >
              {userName}
            </div>
            <div
              style={{
                fontSize: "9px",
                color: "#6a7380",
                fontFamily: "'Courier New', monospace",
                textTransform: "uppercase",
              }}
            >
              / {userTitle}
            </div>
          </div>

          {/* Center: Status Readouts */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "20px",
              fontSize: "9px",
              fontFamily: "'Courier New', monospace",
              color: "#4a9eff",
            }}
          >
            {isTransitioning && (
              <div
                style={{
                  color: "#ff9966",
                  animation: "pulse 0.8s infinite",
                  fontWeight: "bold",
                }}
              >
                ▶ TRANSIT {speed.toFixed(1)}
              </div>
            )}
            <div>● SYS ONLINE</div>
            <div style={{ color: "#6a7380" }}>
              {new Date().toLocaleTimeString("en-US", { hour12: false })}
            </div>
          </div>

          {/* Right: Empty for symmetry */}
          <div style={{ width: "100px" }}></div>
        </div>
      </div>

      {/* ========== RIGHT PANEL - TOUR CONTROLS & CONTENT ========== */}
      <div
        style={{
          position: "fixed",
          top: "45px",
          right: 0,
          width: "450px",
          bottom: "80px",
          background: "#1a1f28",
          borderLeft: "3px solid #2a3340",
          boxShadow:
            "-4px 0 20px rgba(0, 0, 0, 0.8), inset 1px 0 0 rgba(255, 255, 255, 0.05)",
          zIndex: 9998,
          padding: "20px",
          overflowY: "auto",
        }}
      >
        {/* Content Display */}
        <div style={{ marginBottom: tourActive ? "25px" : "0" }}>
          {contentLoading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "200px",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  border: "3px solid #2a3340",
                  borderTop: "3px solid #e8c547",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              <div
                style={{
                  marginTop: "15px",
                  color: "#8a9199",
                  fontSize: "11px",
                  fontFamily: "'Courier New', monospace",
                  letterSpacing: "1px",
                }}
              >
                LOADING DATA...
              </div>
            </div>
          ) : content ? (
            <div style={{ paddingRight: "15px" }}>
              <h2
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "20px",
                  color: "#e8c547",
                  marginBottom: "8px",
                  fontWeight: "600",
                }}
              >
                {content.title}
              </h2>

              {content.subtitle && (
                <p
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: "11px",
                    color: "#8a9199",
                    fontStyle: "italic",
                    marginBottom: "15px",
                  }}
                >
                  {content.subtitle}
                </p>
              )}

              <p
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: "13px",
                  lineHeight: "1.7",
                  color: "#c8d0d8",
                  marginBottom: "20px",
                }}
              >
                {content.description}
              </p>

              {content.sections.map((section) => (
                <div key={section.id} style={{ marginBottom: "20px" }}>
                  <h3
                    style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: "15px",
                      color: "#e8c547",
                      marginBottom: "10px",
                      fontWeight: "600",
                    }}
                  >
                    {section.title}
                  </h3>
                  <div
                    style={{
                      fontFamily: "'Montserrat', sans-serif",
                      fontSize: "12px",
                      lineHeight: "1.8",
                      color: "#b0b8c0",
                      whiteSpace: "pre-line",
                    }}
                  >
                    {typeof section.content === "string" &&
                    section.content.startsWith("• ") ? (
                      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
                        {section.content
                          .split("\n\n")
                          .map((item: string, idx: number) => (
                            <li key={idx} style={{ marginBottom: "6px" }}>
                              {item}
                            </li>
                          ))}
                      </ul>
                    ) : Array.isArray(section.content) ? (
                      section.content.map((item, idx) => (
                        <div key={idx} style={{ marginBottom: "8px" }}>
                          {item}
                        </div>
                      ))
                    ) : (
                      section.content
                    )}
                  </div>
                </div>
              ))}

              {content.actions && content.actions.length > 0 && (
                <div
                  style={{
                    marginTop: "20px",
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  {content.actions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => onContentAction?.(action.action)}
                      style={{
                        background: "#2a3340",
                        border: "1px solid #3a4350",
                        color: "#e8c547",
                        padding: "8px 14px",
                        borderRadius: "3px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: "11px",
                      }}
                    >
                      {action.icon && <span>{action.icon}</span>}
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "200px",
                color: "#3a4350",
                fontSize: "11px",
                fontFamily: "'Courier New', monospace",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              [ SELECT A DESTINATION TO VIEW DETAILS ]
            </div>
          )}

          {tourActive && (
            <div
              style={{
                marginTop: "25px",
                paddingTop: "25px",
                borderTop: "2px solid #2a3340",
              }}
            />
          )}
        </div>

        {/* Tour Controls */}
        {tourActive && (
          <div>
            {/* Header */}
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: "12px",
                color: "#e8c547",
                letterSpacing: "1px",
                marginBottom: "15px",
                paddingBottom: "10px",
                borderBottom: "2px solid #2a3340",
                textAlign: "center",
                fontWeight: "600",
              }}
            >
              GUIDED TOUR
            </div>

            {/* Waypoint */}
            <div
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: "10px",
                color: "#8a9199",
                marginBottom: "12px",
                textAlign: "center",
                lineHeight: "1.5",
              }}
            >
              {tourWaypoint}
            </div>

            {/* Progress Bar */}
            <div
              style={{
                width: "100%",
                height: "6px",
                background: "#0f1419",
                borderRadius: "3px",
                marginBottom: "8px",
                overflow: "hidden",
                border: "1px solid #2a3340",
              }}
            >
              <div
                style={{
                  width: `${(tourProgress.current / tourProgress.total) * 100}%`,
                  height: "100%",
                  background: "#4a9eff",
                  transition: "width 0.5s ease",
                }}
              ></div>
            </div>

            {/* Counter */}
            <div
              style={{
                fontFamily: "'Courier New', monospace",
                fontSize: "9px",
                color: "#6a7380",
                textAlign: "center",
                marginBottom: "15px",
              }}
            >
              {tourProgress.current} / {tourProgress.total}
            </div>

            {/* Nav Buttons */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              <button
                onClick={onTourPrevious}
                disabled={tourProgress.current <= 1}
                style={{
                  background: tourProgress.current <= 1 ? "#0f1419" : "#2a3340",
                  border: "none",
                  borderRadius: "3px",
                  color: tourProgress.current <= 1 ? "#3a4350" : "#c8d0d8",
                  fontSize: "10px",
                  padding: "10px",
                  cursor: tourProgress.current <= 1 ? "not-allowed" : "pointer",
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: "600",
                }}
              >
                ◀ PREV
              </button>
              <button
                onClick={onTourNext}
                disabled={tourProgress.current >= tourProgress.total}
                style={{
                  background:
                    tourProgress.current >= tourProgress.total
                      ? "#0f1419"
                      : "#2a3340",
                  border: "none",
                  borderRadius: "3px",
                  color:
                    tourProgress.current >= tourProgress.total
                      ? "#3a4350"
                      : "#c8d0d8",
                  fontSize: "10px",
                  padding: "10px",
                  cursor:
                    tourProgress.current >= tourProgress.total
                      ? "not-allowed"
                      : "pointer",
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: "600",
                }}
              >
                NEXT ▶
              </button>
            </div>

            {/* Action Buttons */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <button
                onClick={onTourRestart}
                style={{
                  background: "#2a3340",
                  border: "none",
                  borderRadius: "3px",
                  color: "#4a9eff",
                  fontSize: "10px",
                  padding: "10px",
                  cursor: "pointer",
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: "600",
                }}
              >
                🔄 RESTART
              </button>
              <button
                onClick={onTourEnd}
                style={{
                  background: "#2a3340",
                  border: "none",
                  borderRadius: "3px",
                  color: "#dc3545",
                  fontSize: "10px",
                  padding: "10px",
                  cursor: "pointer",
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: "600",
                }}
              >
                ✕ END
              </button>
            </div>

            {/* System Status */}
            <div
              style={{
                marginTop: "20px",
                padding: "12px",
                background: "#0f1419",
                borderRadius: "3px",
                border: "1px solid #2a3340",
              }}
            >
              <div
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: "8px",
                  lineHeight: "1.8",
                  color: "#4a9eff",
                }}
              >
                <div>● PROPULSION</div>
                <div>● NAVIGATION</div>
                <div>● SENSORS</div>
                <div>● SHIELDS</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========== BOTTOM PANEL - INTEGRATED CONSOLE ========== */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          width: "100%",
          height: consoleVisible ? "200px" : "40px",
          background: "#1a1f28",
          borderTop: "3px solid #2a3340",
          boxShadow:
            "0 -4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
          zIndex: 10000,
          transition: "height 0.3s ease",
          display: "flex",
          flexDirection: "row",
        }}
      >
        {/* Panel 1: Console */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            borderRight: "3px solid #2a3340",
          }}
        >
          {/* Console Control Bar */}
          <div
            style={{
              height: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 15px",
              borderBottom: consoleVisible ? "2px solid #2a3340" : "none",
            }}
        >
            {/* Left: Console Toggle */}
            <button
              onClick={onConsoleToggle}
              style={{
                background: consoleVisible ? "#e8c547" : "#2a3340",
                border: "none",
                color: consoleVisible ? "#0f1419" : "#8a9199",
                padding: "6px 12px",
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "9px",
                fontFamily: "'Courier New', monospace",
                textTransform: "uppercase",
                letterSpacing: "1px",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>{consoleVisible ? "▼" : "▲"}</span>
              <span>TELEMETRY</span>
            </button>

            {/* Center: System Indicators */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                fontSize: "8px",
                fontFamily: "'Courier New', monospace",
              }}
            >
              <div style={{ color: "#4a9eff" }}>● PWR: 100%</div>
              <div style={{ color: "#4a9eff" }}>● CONN</div>
              <div style={{ color: "#4a9eff" }}>● LOGS: {consoleLogs.length}</div>
            </div>

            {/* Right: Console Actions */}
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={onConsoleCopy}
                style={{
                  background: "#2a3340",
                  border: "none",
                  borderRadius: "3px",
                  color: "#8a9199",
                  fontSize: "8px",
                  padding: "5px 10px",
                  cursor: "pointer",
                  fontFamily: "'Courier New', monospace",
                  fontWeight: "bold",
                }}
              >
                COPY
              </button>
              <button
                onClick={onConsoleClear}
                style={{
                  background: "#2a3340",
                  border: "none",
                  borderRadius: "3px",
                  color: "#dc3545",
                  fontSize: "8px",
                  padding: "5px 10px",
                  cursor: "pointer",
                  fontFamily: "'Courier New', monospace",
                  fontWeight: "bold",
                }}
              >
                CLEAR
              </button>
            </div>
          </div>

          {/* Console Output */}
          {consoleVisible && (
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "10px 15px",
                background: "#0f1419",
                fontFamily: "'Courier New', monospace",
                fontSize: "10px",
                lineHeight: "1.4",
              }}
            >
              {consoleLogs.length === 0 ? (
                <div
                  style={{
                    color: "#3a4350",
                    fontStyle: "italic",
                    textAlign: "center",
                    paddingTop: "20px",
                  }}
                >
                  [ TELEMETRY CONSOLE - READY ]
                </div>
              ) : (
                consoleLogs.map((log, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: "2px",
                      color: "#4a9eff",
                      opacity: 0.4 + (i / consoleLogs.length) * 0.6,
                    }}
                  >
                    <span style={{ color: "#6a7380" }}>
                      [{new Date().toLocaleTimeString()}]
                    </span>{" "}
                    {log}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Panel 2: Status */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            borderRight: "3px solid #2a3340",
          }}
        >
          {/* Status Header */}
          <div
            style={{
              height: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 15px",
              borderBottom: consoleVisible ? "2px solid #2a3340" : "none",
            }}
          >
            <div
              style={{
                fontSize: "9px",
                fontFamily: "'Courier New', monospace",
                textTransform: "uppercase",
                letterSpacing: "1px",
                fontWeight: "bold",
                color: "#8a9199",
              }}
            >
              SYSTEM STATUS
            </div>
          </div>

          {/* Status Content */}
          {consoleVisible && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 15px",
                background: "#0f1419",
              }}
            >
              <div
                style={{
                  fontSize: "8px",
                  fontFamily: "'Courier New', monospace",
                  color: "#4a9eff",
                  textAlign: "center",
                }}
              >
                [ ALL SYSTEMS NOMINAL ]
              </div>
            </div>
          )}
        </div>

        {/* Panel 3: Navigation */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Navigation Header */}
          <div
            style={{
              height: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 15px",
              borderBottom: consoleVisible ? "2px solid #2a3340" : "none",
            }}
          >
            <div
              style={{
                fontSize: "9px",
                fontFamily: "'Courier New', monospace",
                textTransform: "uppercase",
                letterSpacing: "1px",
                fontWeight: "bold",
                color: "#8a9199",
              }}
            >
              NAV CONTROLS
            </div>
          </div>

          {/* Navigation Content */}
          {consoleVisible && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 15px",
                background: "#0f1419",
              }}
            >
              <div
                style={{
                  fontSize: "8px",
                  fontFamily: "'Courier New', monospace",
                  color: "#4a9eff",
                  textAlign: "center",
                }}
              >
                [ AWAITING INPUT ]
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};
