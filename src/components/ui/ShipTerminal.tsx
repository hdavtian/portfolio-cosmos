import React, { useEffect, useRef, useState, useCallback } from "react";
import type { DebugLogEntry } from "../cosmos/hooks/useCosmosLogs";

// ─── Ship Terminal ───────────────────────────────────────────────
// Retro CRT-style terminal in the top-right corner.
// Primary tab:
//   LOG   — unified ship + debug stream with typewriter reveal
// Secondary tab:
//   TOOLS — quick terminal actions
// Includes a command input row and a Copy button per tab.
// ─────────────────────────────────────────────────────────────────

export interface ShipLogEntry {
  id: number;
  text: string;
  category: "nav" | "orbit" | "system" | "info" | "cmd" | "error";
  timestamp: string;
}

type TabId = "log" | "tools";
export type ShipTerminalToolAction = {
  id: string;
  label: string;
  hint?: string;
  onRun: () => void;
};

interface ShipTerminalProps {
  logs: ShipLogEntry[];
  debugLogs?: DebugLogEntry[];
  debugLogTotal?: number;
  toolActions?: ShipTerminalToolAction[];
  onCommand?: (command: string) => void;
  onClearLog?: () => void;
  onClearDebug?: () => void;
  emitFalconLocation?: boolean;
  emitSDLocation?: boolean;
  onEmitFalconLocationChange?: (enabled: boolean) => void;
  onEmitSDLocationChange?: (enabled: boolean) => void;
  onClose?: () => void;
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

const TYPE_SPEED = 18;
const MAX_TYPE_CHARS = 200;
const TERMINAL_LAYOUT_STORAGE_KEY = "ship-terminal-layout-v1";
const TERMINAL_MIN_WIDTH = 300;
const TERMINAL_MIN_HEIGHT = 240;

const ShipTerminal: React.FC<ShipTerminalProps> = ({
  logs,
  debugLogTotal = 0,
  toolActions = [],
  onCommand,
  onClearLog,
  emitFalconLocation = false,
  emitSDLocation = false,
  onEmitFalconLocationChange,
  onEmitSDLocationChange,
  onClose,
  visible = true,
}) => {
  const logScrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("log");
  const [copyFlash, setCopyFlash] = useState(false);
  const [isDocked, setIsDocked] = useState(true);
  const [panelWidth, setPanelWidth] = useState(420);
  const [panelHeight, setPanelHeight] = useState(
    typeof window !== "undefined" ? Math.max(320, window.innerHeight) : 720,
  );
  const [panelX, setPanelX] = useState(
    typeof window !== "undefined" ? Math.max(24, window.innerWidth - 440) : 900,
  );
  const [panelY, setPanelY] = useState(16);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startPanelX: number;
    startPanelY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startPanelX: 0,
    startPanelY: 0,
  });
  const resizeStateRef = useRef<{
    mode: "left" | "right" | "bottom" | "bottom-left" | "bottom-right" | null;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startPanelX: number;
  }>({
    mode: null,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
    startPanelX: 0,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TERMINAL_LAYOUT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        isDocked?: boolean;
        panelWidth?: number;
        panelHeight?: number;
        panelX?: number;
        panelY?: number;
      };
      if (typeof parsed.isDocked === "boolean") setIsDocked(parsed.isDocked);
      if (typeof parsed.panelWidth === "number") setPanelWidth(parsed.panelWidth);
      if (typeof parsed.panelHeight === "number") setPanelHeight(parsed.panelHeight);
      if (typeof parsed.panelX === "number") setPanelX(parsed.panelX);
      if (typeof parsed.panelY === "number") setPanelY(parsed.panelY);
    } catch {
      // ignore corrupt persisted layout
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        TERMINAL_LAYOUT_STORAGE_KEY,
        JSON.stringify({ isDocked, panelWidth, panelHeight, panelX, panelY }),
      );
    } catch {
      // ignore storage write failures
    }
  }, [isDocked, panelWidth, panelHeight, panelX, panelY]);

  useEffect(() => {
    const onWindowResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPanelWidth((w) => Math.max(TERMINAL_MIN_WIDTH, Math.min(w, vw - 12)));
      setPanelHeight((h) => Math.max(TERMINAL_MIN_HEIGHT, Math.min(h, vh)));
      setPanelX((x) => Math.max(6, Math.min(x, vw - TERMINAL_MIN_WIDTH - 6)));
      setPanelY((y) => Math.max(0, Math.min(y, vh - TERMINAL_MIN_HEIGHT)));
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

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
      text = toolActions
        .map((tool) => `${tool.label}${tool.hint ? ` — ${tool.hint}` : ""}`)
        .join("\n");
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1200);
    });
  }, [activeTab, logs, toolActions]);

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

  const currentLogs = activeTab === "log" ? logs : toolActions;
  const scrollRef = logScrollRef;

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDocked) return;
    const targetEl = e.target as Element | null;
    if (targetEl?.closest("button, input, textarea, select, a, label")) {
      return;
    }
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanelX: panelX,
      startPanelY: panelY,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const startResize = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: "left" | "right" | "bottom" | "bottom-left" | "bottom-right",
  ) => {
    e.stopPropagation();
    resizeStateRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startW: panelWidth,
      startH: panelHeight,
      startPanelX: panelX,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMoveCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const resize = resizeStateRef.current;
    if (drag.active) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPanelX(Math.max(6, Math.min(drag.startPanelX + dx, vw - panelWidth - 6)));
      setPanelY(Math.max(0, Math.min(drag.startPanelY + dy, vh - panelHeight)));
      return;
    }
    if (!resize.mode) return;
    const dx = e.clientX - resize.startX;
    const dy = e.clientY - resize.startY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nextW = resize.startW;
    let nextH = resize.startH;
    let nextX = resize.startPanelX;
    if (resize.mode === "right" || resize.mode === "bottom-right") {
      nextW = resize.startW + dx;
    }
    if (resize.mode === "left" || resize.mode === "bottom-left") {
      nextW = resize.startW - dx;
      nextX = resize.startPanelX + dx;
    }
    if (resize.mode === "bottom" || resize.mode === "bottom-left" || resize.mode === "bottom-right") {
      nextH = resize.startH + dy;
    }
    nextW = Math.max(TERMINAL_MIN_WIDTH, Math.min(nextW, vw - 12));
    nextH = Math.max(TERMINAL_MIN_HEIGHT, Math.min(nextH, vh));
    if (!isDocked) {
      nextX = Math.max(6, Math.min(nextX, vw - nextW - 6));
      setPanelX(nextX);
    }
    setPanelWidth(nextW);
    setPanelHeight(nextH);
  };

  const onPointerUpCapture = () => {
    dragStateRef.current.active = false;
    resizeStateRef.current.mode = null;
  };

  const effectiveHeight = Math.max(TERMINAL_MIN_HEIGHT, Math.min(panelHeight, window.innerHeight));
  const wrapperStyle: React.CSSProperties = isDocked
    ? {
      position: "fixed",
      top: 0,
      right: 0,
      width: panelWidth,
      height: effectiveHeight,
      zIndex: 10050,
      fontFamily: "'Courier New', 'Consolas', monospace",
      fontSize: 11,
      lineHeight: 1.5,
      pointerEvents: "auto",
      userSelect: "text",
    }
    : {
      position: "fixed",
      left: panelX,
      top: panelY,
      width: panelWidth,
      height: effectiveHeight,
      zIndex: 10050,
      fontFamily: "'Courier New', 'Consolas', monospace",
      fontSize: 11,
      lineHeight: 1.5,
      pointerEvents: "auto",
      userSelect: "text",
    };

  return (
    <div
      style={wrapperStyle}
      onPointerMove={onPointerMoveCapture}
      onPointerUp={onPointerUpCapture}
      onPointerCancel={onPointerUpCapture}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "rgba(0, 12, 4, 0.88)",
          border: "1px solid rgba(0, 255, 65, 0.25)",
          borderRadius: 6,
          boxShadow:
            "0 0 12px rgba(0, 255, 65, 0.08), inset 0 0 30px rgba(0, 20, 8, 0.5)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header bar with title + copy button */}
        <div
          onPointerDown={startDrag}
          style={{
            padding: "4px 10px",
            background: "rgba(0, 255, 65, 0.08)",
            borderBottom: "1px solid rgba(0, 255, 65, 0.15)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: isDocked ? "default" : "move",
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
            onClick={() => setIsDocked((prev) => !prev)}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: "transparent",
              border: "1px solid rgba(120, 180, 255, 0.25)",
              borderRadius: 3,
              color: "rgba(120, 180, 255, 0.65)",
              fontSize: 9,
              fontFamily: "'Courier New', monospace",
              padding: "1px 6px",
              cursor: "pointer",
              letterSpacing: 0.5,
            }}
            title={isDocked ? "Detach terminal" : "Dock terminal to side"}
          >
            {isDocked ? "DETACH" : "DOCK"}
          </button>
          <button
            onClick={handleCopy}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
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
          {activeTab === "log" && onClearLog && (
            <button
              onClick={onClearLog}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
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
          <button
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 140, 140, 0.28)",
              borderRadius: 3,
              color: "rgba(255, 140, 140, 0.75)",
              fontSize: 10,
              fontFamily: "'Courier New', monospace",
              padding: "0 6px",
              cursor: "pointer",
              fontWeight: 700,
              lineHeight: 1.2,
            }}
            title="Close terminal"
          >
            X
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(0, 255, 65, 0.1)" }}>
          <button style={tabStyle("log")} onClick={() => setActiveTab("log")}>
            Log {debugLogTotal > 0 && (
              <span style={{ opacity: 0.5, fontSize: 8, marginLeft: 3 }}>
                (dbg:{debugLogTotal})
              </span>
            )}
          </button>
          <button style={tabStyle("tools")} onClick={() => setActiveTab("tools")}>
            Tools
          </button>
        </div>

        {/* Telemetry toggles */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "4px 10px",
            borderBottom: "1px solid rgba(0, 255, 65, 0.08)",
            color: "rgba(0, 255, 65, 0.65)",
            fontSize: 9,
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={emitFalconLocation}
              onChange={(e) => onEmitFalconLocationChange?.(e.target.checked)}
              style={{ accentColor: "#00ff41", width: 12, height: 12 }}
            />
            Falcon location
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={emitSDLocation}
              onChange={(e) => onEmitSDLocationChange?.(e.target.checked)}
              style={{ accentColor: "#00ff41", width: 12, height: 12 }}
            />
            SD location
          </label>
        </div>

        {/* Log area */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 120,
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

          {activeTab === "tools" &&
            toolActions.map((tool) => (
              <div key={tool.id} style={{ marginBottom: 7 }}>
                <button
                  onClick={tool.onRun}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "rgba(0, 255, 65, 0.07)",
                    border: "1px solid rgba(0, 255, 65, 0.18)",
                    color: "rgba(190, 255, 210, 0.92)",
                    borderRadius: 4,
                    padding: "6px 8px",
                    cursor: "pointer",
                    fontFamily: "'Courier New', monospace",
                    fontSize: 10,
                  }}
                >
                  {tool.label}
                </button>
                {tool.hint && (
                  <div style={{ marginTop: 2, color: "rgba(0, 255, 65, 0.42)", fontSize: 9 }}>
                    {tool.hint}
                  </div>
                )}
              </div>
            ))}

          {currentLogs.length === 0 && (
            <div style={{ color: "rgba(0, 255, 65, 0.3)", fontStyle: "italic" }}>
              {activeTab === "log" ? "Awaiting signal..." : "No tools available."}
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
      {/* Resize handles */}
      <div
        onPointerDown={(e) => startResize(e, isDocked ? "left" : "right")}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          [isDocked ? "left" : "right"]: 0,
          width: 8,
          cursor: "ew-resize",
          zIndex: 2,
        }}
      />
      <div
        onPointerDown={(e) => startResize(e, "bottom")}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 8,
          cursor: "ns-resize",
          zIndex: 2,
        }}
      />
      <div
        onPointerDown={(e) => startResize(e, isDocked ? "bottom-left" : "bottom-right")}
        style={{
          position: "absolute",
          bottom: 0,
          [isDocked ? "left" : "right"]: 0,
          width: 14,
          height: 14,
          cursor: isDocked ? "nesw-resize" : "nwse-resize",
          zIndex: 3,
        }}
      />

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
