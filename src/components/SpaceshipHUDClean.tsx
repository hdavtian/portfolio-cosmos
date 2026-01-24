import React, { useState } from "react";
import { createPortal } from "react-dom";
import type { DiagramStyleOptions } from "./DiagramSettings";

type HUDSection = { id: string; title: string; content: string | string[] };
type HUDContent = {
  title: string;
  subtitle?: string;
  description: string;
  sections: HUDSection[];
  actions?: { label: string; action: string; icon?: string }[];
};

type Props = {
  userName: string;
  userTitle: string;
  consoleLogs: string[];
  consoleVisible: boolean;
  onConsoleToggle: () => void;
  onConsoleCopy: () => void;
  onConsoleClear: () => void;
  tourActive: boolean;
  tourWaypoint: string;
  tourProgress: { current: number; total: number };
  onTourPrevious: () => void;
  onTourNext: () => void;
  onTourRestart: () => void;
  onTourEnd: () => void;
  isTransitioning?: boolean;
  speed?: number;
  content: HUDContent | null;
  contentLoading: boolean;
  onContentAction?: (action: string) => void;
  cosmosOptions?: DiagramStyleOptions;
  onCosmosOptionsChange?: (options: DiagramStyleOptions) => void;
  onConsoleLog?: (message: string) => void;
};

const SpaceshipHUD: React.FC<Props> = ({
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
  cosmosOptions = {},
  onCosmosOptionsChange = () => {},
  onConsoleLog,
}) => {
  const [cosmosExpanded, setCosmosExpanded] = useState(true);

  const cosmosContainer =
    typeof document !== "undefined"
      ? document.getElementById("cosmos-options-container")
      : null;

  const handleCosmosOptionChange = (
    key: keyof DiagramStyleOptions,
    value: any,
  ) => {
    const newOptions: DiagramStyleOptions = { ...cosmosOptions, [key]: value };
    onCosmosOptionsChange(newOptions);

    if (onConsoleLog) {
      switch (key) {
        case "spaceOrbitSpeed":
          onConsoleLog(
            `🌍 Orbit speed adjusted to ${Number(value).toFixed(1)}x`,
          );
          break;
        case "spaceMoonOrbitSpeed":
          onConsoleLog(
            `🌙 Moon orbit speed adjusted to ${Number(value).toFixed(1)}x`,
          );
          break;
        case "spaceSunIntensity":
          onConsoleLog(`☀️ Sun intensity set to ${Number(value).toFixed(2)}`);
          break;
        case "spaceSunColor":
          onConsoleLog(`🎨 Sun color set to ${String(value)}`);
          break;
        case "spaceTintSunMesh":
          onConsoleLog(`🖌️ Sun surface tint ${value ? "enabled" : "disabled"}`);
          break;
        case "spaceShowLabels":
          onConsoleLog(`🏷️ Planet labels ${value ? "enabled" : "disabled"}`);
          break;
        case "spaceShowOrbits":
          onConsoleLog(`⭕ Orbit lines ${value ? "visible" : "hidden"}`);
          break;
        default:
          onConsoleLog(`⚙️ Setting '${String(key)}' updated`);
      }
    }
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 45,
          zIndex: 10000,
          background: "#0f1419",
          borderBottom: "2px solid rgba(212, 175, 55, 0.3)",
        }}
        className="spaceship-hud__top"
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            height: "100%",
          }}
        >
          <div>
            <div
              style={{
                color: "#e8c547",
                fontFamily: "Cinzel, serif",
                fontWeight: 600,
              }}
            >
              {userName}
            </div>
            {userTitle && (
              <div style={{ color: "#8a9199", fontSize: 12 }}>{userTitle}</div>
            )}
          </div>
          <div style={{ color: "#6a7380", fontSize: 12 }}>
            {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      <aside
        style={{
          position: "fixed",
          top: 45,
          right: 0,
          bottom: 182,
          width: 420,
          background: "#111418",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          borderLeft: "2px solid rgba(212, 175, 55, 0.3)",
        }}
        className="spaceship-hud__right"
      >
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {tourActive && (
            <div style={{ marginBottom: 12 }}>
              <div
                className="overlay-subtitle"
                style={{
                  textAlign: "center",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
              >
                GUIDED TOUR
              </div>
              <div className="section-tabs" style={{ marginTop: 8 }}>
                <button
                  className="section-tab"
                  onClick={onTourPrevious}
                  disabled={tourProgress.current <= 1}
                  style={{
                    color: "#fff",
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                >
                  Prev
                </button>
                <button
                  className="section-tab"
                  onClick={onTourNext}
                  disabled={tourProgress.current >= tourProgress.total}
                  style={{
                    color: "#fff",
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                >
                  Next
                </button>
                <button
                  className="section-tab"
                  onClick={onTourRestart}
                  style={{
                    color: "#fff",
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                >
                  Restart
                </button>
                <button
                  className="section-tab"
                  onClick={onTourEnd}
                  style={{
                    color: "#fff",
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                >
                  End
                </button>
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "#8a9199",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
              >
                {tourWaypoint}
              </div>
            </div>
          )}

          <div>
            {contentLoading ? (
              <div
                style={{
                  color: "#8a9199",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
              >
                Loading...
              </div>
            ) : content ? (
              <div>
                <h3
                  style={{
                    color: "#e8c547",
                    margin: 0,
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                >
                  {content.title}
                </h3>
                {content.subtitle && (
                  <div
                    style={{
                      color: "#8a9199",
                      marginBottom: 8,
                      fontFamily: "'Rajdhani', sans-serif",
                    }}
                  >
                    {content.subtitle}
                  </div>
                )}
                <p
                  style={{
                    color: "#c8d0d8",
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                >
                  {content.description}
                </p>

                {content.sections?.map((s) => (
                  <div key={s.id} style={{ marginTop: 12 }}>
                    <div
                      style={{
                        color: "#e8c547",
                        fontWeight: 600,
                        fontFamily: "'Rajdhani', sans-serif",
                      }}
                    >
                      {s.title}
                    </div>
                    <div
                      style={{
                        color: "#b0b8c0",
                        whiteSpace: "pre-wrap",
                        marginTop: 6,
                        fontFamily: "'Rajdhani', sans-serif",
                      }}
                    >
                      {Array.isArray(s.content)
                        ? s.content.join("\n")
                        : s.content}
                    </div>
                  </div>
                ))}

                {content.actions?.length ? (
                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {content.actions.map((a, i) => (
                      <button
                        key={i}
                        onClick={() => onContentAction?.(a.action)}
                        style={{
                          background: "#2a3340",
                          color: "#fff",
                          border: "1px solid rgba(212, 175, 55, 0.3)",
                          padding: "6px 10px",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 11,
                          fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 600,
                          letterSpacing: 0.5,
                        }}
                      >
                        {a.icon ? `${a.icon} ` : ""}
                        {a.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                style={{
                  color: "#6a7380",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
              >
                Select a destination to view details.
              </div>
            )}
          </div>
        </div>

        {/* Footer Panel attached to bottom */}
      </aside>

      <footer
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 182,
          background: "#0f1419",
          borderTop: "2px solid rgba(212, 175, 55, 0.3)",
          zIndex: 10000,
          display: "flex",
          gap: 0,
        }}
        className="spaceship-hud__footer"
      >
        {/* Left Panel: TELEMETRY Console */}
        <div
          style={{
            flex: "1 1 40%",
            borderRight: "2px solid rgba(212, 175, 55, 0.3)",
            display: "flex",
            flexDirection: "column",
            background: "#0f1419",
            position: "relative",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid rgba(212, 175, 55, 0.2)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              onClick={onConsoleToggle}
              className="hud-button"
              style={{
                background: consoleVisible ? "#e8c547" : "#2a3340",
                border: "none",
                color: consoleVisible ? "#0f1419" : "#fff",
                padding: "5px 10px",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 11,
                fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: 0.5,
              }}
            >
              {consoleVisible ? "▼" : "▲"} TELEMETRY
            </button>
            <button
              onClick={onConsoleCopy}
              className="hud-button"
              style={{
                background: "#2a3340",
                color: "#fff",
                border: "none",
                padding: "5px 10px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "'Rajdhani', sans-serif",
              }}
            >
              COPY
            </button>
            <button
              onClick={onConsoleClear}
              className="hud-button"
              style={{
                background: "#2a3340",
                color: "#fff",
                border: "none",
                padding: "5px 10px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "'Rajdhani', sans-serif",
              }}
            >
              CLEAR
            </button>
          </div>

          {consoleVisible && (
            <div
              className="hud-console-panel"
              style={{
                flex: 1,
                background: "#0b0f12",
                overflowY: "auto",
                padding: 8,
              }}
            >
              {consoleLogs.length === 0 ? (
                <div
                  style={{
                    color: "#3a4350",
                    fontStyle: "italic",
                    textAlign: "center",
                    fontSize: 11,
                    fontFamily: "'Rajdhani', monospace",
                  }}
                >
                  [ TELEMETRY CONSOLE - READY ]
                </div>
              ) : (
                consoleLogs
                  .slice()
                  .reverse()
                  .map((l, i) => (
                    <div
                      key={i}
                      style={{
                        color: "#9aa6b2",
                        fontFamily: "Courier New, monospace",
                        fontSize: 10,
                        padding: "2px 0",
                      }}
                    >
                      {l}
                    </div>
                  ))
              )}
            </div>
          )}
        </div>

        {/* Middle Panel: MISSION CONTROL */}
        <div
          style={{
            flex: "1 1 30%",
            borderRight: "2px solid rgba(212, 175, 55, 0.3)",
            display: "flex",
            flexDirection: "column",
            background: "#0f1419",
            position: "relative",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid rgba(212, 175, 55, 0.2)",
              color: "#e8c547",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "'Rajdhani', sans-serif",
              letterSpacing: 1,
            }}
          >
            MISSION CONTROL
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6a7380",
              fontSize: 11,
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            Awaiting commands...
          </div>
        </div>

        {/* Right Panel: SYSTEM STATUS */}
        <div
          style={{
            flex: "1 1 30%",
            display: "flex",
            flexDirection: "column",
            background: "#0f1419",
            position: "relative",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid rgba(212, 175, 55, 0.2)",
              color: "#e8c547",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "'Rajdhani', sans-serif",
              letterSpacing: 1,
            }}
          >
            SYSTEM STATUS
          </div>
          <div
            style={{
              flex: 1,
              padding: "8px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {isTransitioning && (
              <div
                style={{
                  color: "#c8d0d8",
                  fontSize: 11,
                  fontFamily: "'Rajdhani', monospace",
                }}
              >
                SPEED: {Math.round(speed)} u/s
              </div>
            )}
            <div
              style={{
                color: "#50fa7b",
                fontSize: 11,
                fontFamily: "'Rajdhani', monospace",
              }}
            >
              ● ALL SYSTEMS NOMINAL
            </div>
          </div>
        </div>
      </footer>

      {cosmosContainer &&
        createPortal(
          <div>
            <div
              onClick={() => setCosmosExpanded(!cosmosExpanded)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                padding: "8px 0",
              }}
            >
              <div
                style={{
                  color: "#e8c547",
                  fontWeight: 600,
                  fontSize: 12,
                  fontFamily: "'Rajdhani', sans-serif",
                  letterSpacing: 1,
                }}
              >
                COSMOS OPTIONS
              </div>
              <div style={{ color: "#e8c547", fontSize: 11 }}>
                {cosmosExpanded ? "▼" : "▶"}
              </div>
            </div>

            {cosmosExpanded && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  overflowY: "auto",
                }}
              >
                <div>
                  <label
                    style={{
                      color: "#8a9199",
                      fontSize: 11,
                      display: "block",
                      marginBottom: 4,
                      fontFamily: "'Rajdhani', sans-serif",
                    }}
                  >
                    Orbit Speed:{" "}
                    {cosmosOptions.spaceOrbitSpeed !== undefined
                      ? cosmosOptions.spaceOrbitSpeed.toFixed(1)
                      : "0.1"}
                    x
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={
                      cosmosOptions.spaceOrbitSpeed !== undefined
                        ? cosmosOptions.spaceOrbitSpeed
                        : 0.1
                    }
                    onChange={(e) =>
                      handleCosmosOptionChange(
                        "spaceOrbitSpeed",
                        Number(e.target.value),
                      )
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      color: "#8a9199",
                      fontSize: 11,
                      display: "block",
                      marginBottom: 4,
                      fontFamily: "'Rajdhani', sans-serif",
                    }}
                  >
                    Moon Orbit Speed:{" "}
                    {cosmosOptions.spaceMoonOrbitSpeed !== undefined
                      ? cosmosOptions.spaceMoonOrbitSpeed.toFixed(1)
                      : (cosmosOptions.spaceOrbitSpeed ?? 0.1).toFixed(1)}
                    x
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={
                      cosmosOptions.spaceMoonOrbitSpeed !== undefined
                        ? (cosmosOptions.spaceMoonOrbitSpeed as number)
                        : (cosmosOptions.spaceOrbitSpeed ?? 0.1)
                    }
                    onChange={(e) =>
                      handleCosmosOptionChange(
                        "spaceMoonOrbitSpeed",
                        Number(e.target.value),
                      )
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      color: "#8a9199",
                      fontSize: 11,
                      display: "block",
                      marginBottom: 4,
                      fontFamily: "'Rajdhani', sans-serif",
                    }}
                  >
                    Sun Intensity:{" "}
                    {cosmosOptions.spaceSunIntensity?.toFixed(2) || "2.50"}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.05"
                    value={cosmosOptions.spaceSunIntensity || 2.5}
                    onChange={(e) =>
                      handleCosmosOptionChange(
                        "spaceSunIntensity",
                        Number(e.target.value),
                      )
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      color: "#8a9199",
                      fontSize: 11,
                      display: "block",
                      margin: "8px 0 4px 0",
                      fontFamily: "'Rajdhani', sans-serif",
                    }}
                  >
                    Sun Color
                  </label>
                  <input
                    type="color"
                    value={cosmosOptions.spaceSunColor || "#ffdd99"}
                    onChange={(e) =>
                      handleCosmosOptionChange("spaceSunColor", e.target.value)
                    }
                    style={{
                      width: 56,
                      height: 28,
                      padding: 0,
                      border: "1px solid rgba(212, 175, 55, 0.5)",
                      borderRadius: 6,
                      background: "#0f1419",
                    }}
                  />
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#8a9199",
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cosmosOptions.spaceShowLabels !== false}
                    onChange={(e) =>
                      handleCosmosOptionChange(
                        "spaceShowLabels",
                        e.target.checked,
                      )
                    }
                  />
                  Show Planet Labels
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#8a9199",
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cosmosOptions.spaceShowOrbits !== false}
                    onChange={(e) =>
                      handleCosmosOptionChange(
                        "spaceShowOrbits",
                        e.target.checked,
                      )
                    }
                  />
                  Show Orbit Lines
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#8a9199",
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cosmosOptions.spaceTintSunMesh === true}
                    onChange={(e) =>
                      handleCosmosOptionChange(
                        "spaceTintSunMesh",
                        e.target.checked,
                      )
                    }
                  />
                  Tint Sun Surface (subtle hue)
                </label>

                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px solid rgba(212, 175, 55, 0.15)",
                  }}
                >
                  <div
                    style={{
                      color: "#e8c547",
                      fontWeight: 600,
                      fontSize: 11,
                      fontFamily: "'Rajdhani', sans-serif",
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}
                  >
                    COSMIC AUDIO
                  </div>
                  <select
                    style={{
                      width: "100%",
                      marginBottom: 8,
                      padding: 5,
                      background: "rgba(0,0,0,0.8)",
                      color: "rgba(212, 175, 55, 0.9)",
                      border: "1px solid rgba(212, 175, 55, 0.5)",
                      borderRadius: 4,
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: 11,
                    }}
                  >
                    <option value="">🔇 Silence</option>
                    <option value="cosmic-journey">🌌 Cosmic Journey</option>
                    <option value="stellar-winds">⭐ Stellar Winds</option>
                    <option value="deep-space">🌠 Deep Space</option>
                    <option value="galactic-ambience">
                      🌍 Galactic Ambience
                    </option>
                  </select>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ fontSize: 11 }}>🔊</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      defaultValue="30"
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: 11, color: "#8a9199" }}>30%</span>
                  </div>
                </div>
              </div>
            )}
          </div>,
          cosmosContainer,
        )}
    </>
  );
};

export default SpaceshipHUD;
