import React, { useEffect, useRef, useState, useCallback } from "react";
import type { DebugLogEntry } from "../cosmos/hooks/useCosmosLogs";

// ─── Ship Terminal ───────────────────────────────────────────────
// Retro CRT-style terminal in the top-right corner.
// Two tabs:
//   LOG   — User-facing ship events with typewriter reveal
//   DEBUG — Verbose internal trace logs for development
// Includes a command input row and a Copy button per tab.
// ─────────────────────────────────────────────────────────────────

export interface ShipLogEntry {
  id: number;
  text: string;
  category: "nav" | "orbit" | "system" | "info" | "cmd" | "error";
  timestamp: string;
}

type TabId = "log" | "debug";

interface ShipTerminalProps {
  logs: ShipLogEntry[];
  debugLogs?: DebugLogEntry[];
  debugLogTotal?: number;
  onCommand?: (command: string) => void;
  onClearDebug?: () => void;
  visible?: boolean;
}

const CATEGORY_PREFIX: Record<ShipLogEntry["category"], string> = {
  nav: "NAV",
  orbit: "ORB",
  system: "SYS",
  info: "INF",
  cmd: "CMD",
  error: "ERR",
};

const CATEGORY_COLOR: Record<ShipLogEntry["category"], string> = {
  nav: "#00ff41",
  orbit: "#41ffb0",
  system: "#a0ffa0",
  info: "#80c0ff",
  cmd: "#ffcc00",
  error: "#ff6060",
};

const SOURCE_COLOR: Record<string, string> = {
  orbit: "#41ffb0",
  nav: "#00ff41",
  render: "#8888ff",
  drone: "#ff88ff",
  scene: "#ffaa44",
};

const TYPE_SPEED = 18;
const MAX_TYPE_CHARS = 200;

const ShipTerminal: React.FC<ShipTerminalProps> = ({
  logs,
  debugLogs = [],
  debugLogTotal = 0,
  onCommand,
  onClearDebug,
  visible = true,
}) => {
  const logScrollRef = useRef<HTMLDivElement>(null);
  const debugScrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("log");
  const [copyFlash, setCopyFlash] = useState(false);

  // Typewriter state for Log tab
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [typeProgress, setTypeProgress] = useState(0);
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLogIdRef = useRef(-1);

  // Auto-scroll Log tab
  useEffect(() => {
    if (activeTab === "log" && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logs, typeProgress, activeTab]);

  // Auto-scroll Debug tab
  useEffect(() => {
    if (activeTab === "debug" && debugScrollRef.current) {
      debugScrollRef.current.scrollTop = debugScrollRef.current.scrollHeight;
    }
  }, [debugLogs, activeTab]);

  // Typewriter effect for the newest log entry
  useEffect(() => {
    if (logs.length === 0) return;
    const newest = logs[logs.length - 1];
    if (newest.id === lastLogIdRef.current) return;
    lastLogIdRef.current = newest.id;

    setRevealedIds((prev) => {
      const next = new Set(prev);
      logs.forEach((l) => {
        if (l.id !== newest.id) next.add(l.id);
      });
      return next;
    });

    setTypeProgress(0);
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);

    const fullLen = Math.min(newest.text.length, MAX_TYPE_CHARS);
    let progress = 0;
    typeTimerRef.current = setInterval(() => {
      progress += 1;
      setTypeProgress(progress);
      if (progress >= fullLen) {
        if (typeTimerRef.current) clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
        setRevealedIds((prev) => new Set(prev).add(newest.id));
      }
    }, TYPE_SPEED);

    return () => {
      if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    };
  }, [logs]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const cmd = inputValue.trim();
      if (cmd && onCommand) onCommand(cmd);
      setInputValue("");
    },
    [inputValue, onCommand],
  );

  const handleCopy = useCallback(() => {
    let text: string;
    if (activeTab === "log") {
      text = logs
        .map((e) => `${e.timestamp} ${CATEGORY_PREFIX[e.category]}> ${e.text}`)
        .join("\n");
    } else {
      text = debugLogs
        .map((e) => `${e.timestamp} [${e.source}] ${e.text}`)
        .join("\n");
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1200);
    });
  }, [activeTab, logs, debugLogs]);

  if (!visible) return null;

  const tabStyle = (id: TabId): React.CSSProperties => ({
    flex: 1,
    padding: "3px 0",
    background: activeTab === id ? "rgba(0, 255, 65, 0.12)" : "transparent",
    border: "none",
    borderBottom:
      activeTab === id
        ? "2px solid #00ff41"
        : "2px solid transparent",
    color: activeTab === id ? "#00ff41" : "rgba(0, 255, 65, 0.35)",
    fontFamily: "'Courier New', 'Consolas', monospace",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    cursor: "pointer",
    transition: "all 0.15s",
  });

  const currentLogs = activeTab === "log" ? logs : debugLogs;
  const scrollRef = activeTab === "log" ? logScrollRef : debugScrollRef;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        width: 340,
        zIndex: 900,
        fontFamily: "'Courier New', 'Consolas', monospace",
        fontSize: 11,
        lineHeight: 1.5,
        pointerEvents: "auto",
        userSelect: "text",
      }}
    >
      <div
        style={{
          background: "rgba(0, 12, 4, 0.88)",
          border: "1px solid rgba(0, 255, 65, 0.25)",
          borderRadius: 6,
          boxShadow:
            "0 0 12px rgba(0, 255, 65, 0.08), inset 0 0 30px rgba(0, 20, 8, 0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header bar with title + copy button */}
        <div
          style={{
            padding: "4px 10px",
            background: "rgba(0, 255, 65, 0.08)",
            borderBottom: "1px solid rgba(0, 255, 65, 0.15)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#00ff41",
              boxShadow: "0 0 4px #00ff41",
              display: "inline-block",
            }}
          />
          <span
            style={{
              color: "rgba(0, 255, 65, 0.6)",
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontWeight: 600,
              flex: 1,
            }}
          >
            Ship Terminal
          </span>
          <button
            onClick={handleCopy}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: copyFlash ? "rgba(0, 255, 65, 0.25)" : "transparent",
              border: "1px solid rgba(0, 255, 65, 0.2)",
              borderRadius: 3,
              color: copyFlash ? "#00ff41" : "rgba(0, 255, 65, 0.4)",
              fontSize: 9,
              fontFamily: "'Courier New', monospace",
              padding: "1px 6px",
              cursor: "pointer",
              transition: "all 0.15s",
              letterSpacing: 0.5,
            }}
          >
            {copyFlash ? "COPIED" : "COPY"}
          </button>
          {activeTab === "debug" && onClearDebug && (
            <button
              onClick={onClearDebug}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                background: "transparent",
                border: "1px solid rgba(255, 100, 100, 0.2)",
                borderRadius: 3,
                color: "rgba(255, 100, 100, 0.5)",
                fontSize: 9,
                fontFamily: "'Courier New', monospace",
                padding: "1px 6px",
                cursor: "pointer",
                letterSpacing: 0.5,
              }}
            >
              CLEAR
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(0, 255, 65, 0.1)" }}>
          <button style={tabStyle("log")} onClick={() => setActiveTab("log")}>
            Log
          </button>
          <button style={tabStyle("debug")} onClick={() => setActiveTab("debug")}>
            Debug {debugLogTotal > 0 && (
              <span style={{ opacity: 0.5, fontSize: 8, marginLeft: 3 }}>
                ({debugLogTotal})
              </span>
            )}
          </button>
        </div>

        {/* Log area */}
        <div
          ref={scrollRef}
          style={{
            height: 200,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "6px 10px",
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 65, 0.015) 2px, rgba(0, 255, 65, 0.015) 4px)",
          }}
        >
          {activeTab === "log" &&
            logs.map((entry) => {
              const isNewest =
                entry.id === lastLogIdRef.current &&
                !revealedIds.has(entry.id);
              const displayText = isNewest
                ? entry.text.slice(0, typeProgress)
                : entry.text;
              const prefix = CATEGORY_PREFIX[entry.category];
              const color = CATEGORY_COLOR[entry.category];

              return (
                <div key={entry.id} style={{ marginBottom: 2 }}>
                  <span style={{ color: "rgba(0, 255, 65, 0.35)", fontSize: 9 }}>
                    {entry.timestamp}
                  </span>{" "}
                  <span
                    style={{ color, opacity: 0.7, fontWeight: 700, fontSize: 10 }}
                  >
                    {prefix}&gt;
                  </span>{" "}
                  <span style={{ color }}>
                    {displayText}
                    {isNewest && (
                      <span
                        style={{
                          opacity: 0.8,
                          animation: "terminalBlink 0.6s step-end infinite",
                        }}
                      >
                        ▌
                      </span>
                    )}
                  </span>
                </div>
              );
            })}

          {activeTab === "debug" &&
            debugLogs.map((entry) => {
              const color = SOURCE_COLOR[entry.source] || "#88aa88";
              return (
                <div key={entry.id} style={{ marginBottom: 1, fontSize: 10, lineHeight: 1.4 }}>
                  <span style={{ color: "rgba(0, 255, 65, 0.3)", fontSize: 8 }}>
                    {entry.timestamp}
                  </span>{" "}
                  <span
                    style={{
                      color,
                      opacity: 0.6,
                      fontWeight: 700,
                      fontSize: 9,
                      textTransform: "uppercase",
                    }}
                  >
                    [{entry.source}]
                  </span>{" "}
                  <span style={{ color: "rgba(0, 255, 65, 0.7)" }}>
                    {entry.text}
                  </span>
                </div>
              );
            })}

          {currentLogs.length === 0 && (
            <div style={{ color: "rgba(0, 255, 65, 0.3)", fontStyle: "italic" }}>
              {activeTab === "log" ? "Awaiting signal..." : "No debug logs yet."}
            </div>
          )}
        </div>

        {/* Command input */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "4px 10px 6px",
            borderTop: "1px solid rgba(0, 255, 65, 0.12)",
            background: "rgba(0, 8, 2, 0.5)",
          }}
        >
          <span
            style={{
              color: "#00ff41",
              opacity: 0.6,
              marginRight: 6,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            &gt;
          </span>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="enter command..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#00ff41",
              fontFamily: "'Courier New', 'Consolas', monospace",
              fontSize: 11,
              caretColor: "#00ff41",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </form>
      </div>

      <style>{`
        @keyframes terminalBlink {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default ShipTerminal;
