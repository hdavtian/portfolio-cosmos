import React from "react";

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
}) => {
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
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px",
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
          bottom: 80,
          width: 420,
          padding: 16,
          background: "#111418",
          overflowY: "auto",
          zIndex: 9999,
        }}
      >
        {tourActive && (
          <div style={{ marginBottom: 12 }}>
            <div className="overlay-subtitle" style={{ textAlign: "center" }}>
              GUIDED TOUR
            </div>
            <div className="section-tabs" style={{ marginTop: 8 }}>
              <button
                className="section-tab"
                onClick={onTourPrevious}
                disabled={tourProgress.current <= 1}
              >
                Prev
              </button>
              <button
                className="section-tab"
                onClick={onTourNext}
                disabled={tourProgress.current >= tourProgress.total}
              >
                Next
              </button>
              <button className="section-tab" onClick={onTourRestart}>
                Restart
              </button>
              <button className="section-tab" onClick={onTourEnd}>
                End
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#8a9199" }}>
              {tourWaypoint}
            </div>
          </div>
        )}

        <div>
          {contentLoading ? (
            <div style={{ color: "#8a9199" }}>Loading...</div>
          ) : content ? (
            <div>
              <h3 style={{ color: "#e8c547", margin: 0 }}>{content.title}</h3>
              {content.subtitle && (
                <div style={{ color: "#8a9199", marginBottom: 8 }}>
                  {content.subtitle}
                </div>
              )}
              <p style={{ color: "#c8d0d8" }}>{content.description}</p>

              {content.sections?.map((s) => (
                <div key={s.id} style={{ marginTop: 12 }}>
                  <div style={{ color: "#e8c547", fontWeight: 600 }}>
                    {s.title}
                  </div>
                  <div
                    style={{
                      color: "#b0b8c0",
                      whiteSpace: "pre-wrap",
                      marginTop: 6,
                    }}
                  >
                    {Array.isArray(s.content)
                      ? s.content.join("\n")
                      : s.content}
                  </div>
                </div>
              ))}

              {content.actions?.length ? (
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  {content.actions.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => onContentAction?.(a.action)}
                      style={{
                        background: "#2a3340",
                        color: "#e8c547",
                        border: "1px solid rgba(232,197,71,0.08)",
                        padding: "6px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
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
            <div style={{ color: "#6a7380" }}>
              Select a destination to view details.
            </div>
          )}
        </div>
      </aside>

      <footer
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#0f1419",
          borderTop: "1px solid rgba(255,255,255,0.02)",
          zIndex: 10000,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: 8,
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={onConsoleToggle}
              style={{
                background: consoleVisible ? "#e8c547" : "#2a3340",
                border: "none",
                color: consoleVisible ? "#0f1419" : "#c8d0d8",
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {consoleVisible ? "▼" : "▲"} TELEMETRY
            </button>
            <button
              onClick={onConsoleCopy}
              style={{
                background: "#2a3340",
                color: "#8a9199",
                border: "none",
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              COPY
            </button>
            <button
              onClick={onConsoleClear}
              style={{
                background: "#2a3340",
                color: "#dc3545",
                border: "none",
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              CLEAR
            </button>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {isTransitioning && (
              <div style={{ color: "#c8d0d8", fontSize: 12 }}>
                Speed: {Math.round(speed)}
              </div>
            )}
            <div style={{ color: "#e8c547", fontWeight: 700 }}>SYSTEM</div>
          </div>
        </div>

        {consoleVisible && (
          <div
            style={{
              background: "#0b0f12",
              maxHeight: 200,
              overflowY: "auto",
              padding: 12,
              borderTop: "1px solid rgba(255,255,255,0.02)",
            }}
          >
            {consoleLogs.length === 0 ? (
              <div
                style={{
                  color: "#3a4350",
                  fontStyle: "italic",
                  textAlign: "center",
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
                      fontSize: 12,
                      padding: "4px 0",
                    }}
                  >
                    {l}
                  </div>
                ))
            )}
          </div>
        )}
      </footer>
    </>
  );
};

export default SpaceshipHUD;
