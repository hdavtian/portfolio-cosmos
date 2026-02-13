import React, { useState, useEffect, useRef, useCallback } from "react";
import type { OverlayContent } from "../CosmicContentOverlay";

interface MissionBriefingTerminalProps {
  content: OverlayContent | null;
  isCockpit: boolean;
  onClose?: () => void;
  onAction?: (action: string) => void;
}

// ── Boot sequence lines ───────────────────────────────────────────
const BOOT_LINES = [
  { text: "INITIALIZING SCAN...", delay: 0 },
  { text: "ORBITAL LOCK ACQUIRED", delay: 400 },
  { text: "DECRYPTING DOSSIER...", delay: 800 },
  { text: "STATION IDENTIFIED", delay: 1200 },
  { text: "DOSSIER LOADED ✓", delay: 1600 },
];
const BOOT_DURATION = 2200; // ms before content starts typing

export const MissionBriefingTerminal: React.FC<MissionBriefingTerminalProps> = ({
  content,
  isCockpit,
  onClose,
  onAction,
}) => {
  const [phase, setPhase] = useState<"boot" | "typing" | "ready">("boot");
  const [bootLine, setBootLine] = useState(0);
  const [, setTypedSections] = useState(0);
  const [typedLines, setTypedLines] = useState(0);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevContentRef = useRef<OverlayContent | null>(null);

  // Reset when content changes
  useEffect(() => {
    if (content && content !== prevContentRef.current) {
      prevContentRef.current = content;
      setPhase("boot");
      setBootLine(0);
      setTypedSections(0);
      setTypedLines(0);
      setVisible(true);
    } else if (!content) {
      setVisible(false);
      setTimeout(() => {
        setPhase("boot");
        setBootLine(0);
        setTypedSections(0);
        setTypedLines(0);
      }, 400);
    }
  }, [content]);

  // Boot sequence
  useEffect(() => {
    if (phase !== "boot" || !content) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((line, i) => {
      timers.push(setTimeout(() => setBootLine(i + 1), line.delay));
    });
    timers.push(setTimeout(() => setPhase("typing"), BOOT_DURATION));
    return () => timers.forEach(clearTimeout);
  }, [phase, content]);

  // Typing phase — reveal sections one by one, lines within each
  useEffect(() => {
    if (phase !== "typing" || !content) return;

    const allLines = buildAllLines(content);
    const totalLines = allLines.length;

    let currentLine = 0;
    const timer = setInterval(() => {
      currentLine++;
      // Find which section/line we're at
      let sectionIdx = 0;
      let lineCount = 0;
      for (let s = 0; s < allLines.length; s++) {
        if (currentLine <= lineCount + allLines[s].count) {
          sectionIdx = s;
          break;
        }
        lineCount += allLines[s].count;
      }
      setTypedSections(sectionIdx);
      setTypedLines(currentLine);

      if (currentLine >= totalLines) {
        clearInterval(timer);
        setPhase("ready");
      }
    }, 60); // 60ms per line — fast enough to feel like rapid typing

    return () => clearInterval(timer);
  }, [phase, content]);

  // Auto-scroll during typing
  useEffect(() => {
    if (contentRef.current && phase === "typing") {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [typedLines, phase]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => onClose?.(), 400);
  }, [onClose]);

  if (!content && !visible) return null;

  const allLines = content ? buildAllLines(content) : [];

  return (
    <div
      ref={containerRef}
      style={{
        ...styles.container,
        ...(isCockpit ? styles.cockpit : styles.exterior),
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateY(0)"
          : "translateY(20px)",
      }}
    >
      {/* Scan line overlay */}
      <div style={styles.scanLines} />

      {/* Header bar */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.statusDot} />
          <span style={styles.headerLabel}>MISSION BRIEFING</span>
        </div>
        <button style={styles.closeBtn} onClick={handleClose} title="Close briefing">
          ✕
        </button>
      </div>

      {/* Content area */}
      <div ref={contentRef} style={styles.content}>
        {/* Boot sequence */}
        {phase === "boot" && (
          <div style={styles.bootSection}>
            {BOOT_LINES.slice(0, bootLine).map((line, i) => (
              <div
                key={i}
                style={{
                  ...styles.bootLine,
                  color: i === bootLine - 1 ? "#4fffb0" : "rgba(79,255,176,0.5)",
                }}
              >
                &gt; {line.text}
              </div>
            ))}
            {bootLine < BOOT_LINES.length && (
              <span style={styles.cursor}>█</span>
            )}
          </div>
        )}

        {/* Main content — typing or ready */}
        {(phase === "typing" || phase === "ready") && content && (
          <>
            {/* Station header */}
            <div style={styles.stationHeader}>
              <div style={styles.stationLabel}>STATION</div>
              <div style={styles.stationName}>{content.title}</div>
              {content.subtitle && (
                <div style={styles.stationMeta}>{content.subtitle}</div>
              )}
            </div>

            <div style={styles.divider} />

            {/* Sections */}
            {renderSections(content, allLines, typedLines, phase, onAction)}

            {/* Cursor while typing */}
            {phase === "typing" && (
              <span style={styles.cursor}>█</span>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {phase === "ready" && content?.actions && (
        <div style={styles.footer}>
          {content.actions.map((action, i) => (
            <button
              key={i}
              style={styles.actionBtn}
              onClick={() => onAction?.(action.action)}
            >
              {action.icon && <span>{action.icon} </span>}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────

interface LineBlock {
  type: "section-header" | "description" | "line";
  sectionIdx: number;
  text: string;
  count: number; // always 1 for individual lines
}

function buildAllLines(content: OverlayContent): LineBlock[] {
  const lines: LineBlock[] = [];

  // Description
  if (content.description) {
    lines.push({
      type: "description",
      sectionIdx: -1,
      text: content.description,
      count: 1,
    });
  }

  // Sections
  content.sections.forEach((section, sIdx) => {
    lines.push({
      type: "section-header",
      sectionIdx: sIdx,
      text: section.title,
      count: 1,
    });

    const contentLines = Array.isArray(section.content)
      ? section.content
      : section.content.split("\n\n• ").filter(Boolean);

    contentLines.forEach((line) => {
      lines.push({
        type: "line",
        sectionIdx: sIdx,
        text: line.replace(/^• /, ""),
        count: 1,
      });
    });
  });

  return lines;
}

function renderSections(
  content: OverlayContent,
  _allLines: LineBlock[],
  typedLines: number,
  phase: string,
  _onAction?: (action: string) => void,
) {
  const isReady = phase === "ready";
  let lineIdx = 0;

  const elements: React.ReactNode[] = [];

  // Description
  if (content.description) {
    const show = isReady || lineIdx < typedLines;
    if (show) {
      elements.push(
        <div key="desc" style={styles.description}>
          {content.description}
        </div>,
      );
    }
    lineIdx++;
  }

  // Sections
  content.sections.forEach((section, sIdx) => {
    const headerShow = isReady || lineIdx < typedLines;
    lineIdx++;

    const contentLines = Array.isArray(section.content)
      ? section.content
      : section.content.split("\n\n• ").filter(Boolean);

    const sectionLines: React.ReactNode[] = [];
    contentLines.forEach((line, lIdx) => {
      const show = isReady || lineIdx < typedLines;
      if (show) {
        const cleanLine = line.replace(/^• /, "");
        sectionLines.push(
          <div
            key={lIdx}
            style={{
              ...styles.responsibilityLine,
              animation: isReady ? "none" : "mbt-fadeIn 0.3s ease-out",
            }}
          >
            <span style={styles.bullet}>▸</span>
            <span>{cleanLine}</span>
          </div>,
        );
      }
      lineIdx++;
    });

    if (headerShow) {
      const dates = section.data?.startDate
        ? ` [${section.data.startDate} – ${section.data.endDate || "Present"}]`
        : "";
      elements.push(
        <div key={`section-${sIdx}`} style={styles.sectionBlock}>
          <div style={styles.sectionTitle}>
            {section.title}
            {dates && <span style={styles.sectionDates}>{dates}</span>}
          </div>
          {sectionLines}
        </div>,
      );
    }
  });

  return elements;
}

// ── Styles ────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    zIndex: 10000,
    display: "flex",
    flexDirection: "column",
    background: "rgba(5, 12, 28, 0.92)",
    border: "1px solid rgba(79, 255, 176, 0.25)",
    borderRadius: 6,
    overflow: "hidden",
    fontFamily: "'Rajdhani', 'Courier New', monospace",
    color: "#c8d8e8",
    transition: "opacity 0.4s ease, transform 0.4s ease",
    boxShadow: "0 0 30px rgba(79, 255, 176, 0.08), inset 0 0 60px rgba(0,0,0,0.3)",
  },
  cockpit: {
    top: "10%",
    left: 16,
    width: "min(520px, 85vw)",
    maxHeight: "75vh",
  },
  exterior: {
    top: 50,
    left: 16,
    bottom: 80,
    width: "min(420px, 35vw)",
  },
  scanLines: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(79,255,176,0.015) 2px, rgba(79,255,176,0.015) 4px)",
    zIndex: 1,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 14px",
    background: "rgba(79, 255, 176, 0.06)",
    borderBottom: "1px solid rgba(79, 255, 176, 0.15)",
    position: "relative",
    zIndex: 2,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#4fffb0",
    boxShadow: "0 0 6px #4fffb0",
    display: "inline-block",
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 2,
    color: "rgba(79, 255, 176, 0.8)",
    textTransform: "uppercase" as const,
  },
  closeBtn: {
    background: "none",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "rgba(255,255,255,0.5)",
    cursor: "pointer",
    fontSize: 14,
    borderRadius: 3,
    padding: "2px 8px",
    transition: "all 0.2s",
  },
  content: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 18px",
    position: "relative",
    zIndex: 2,
    scrollbarWidth: "thin" as const,
    scrollbarColor: "rgba(79,255,176,0.2) transparent",
  },
  bootSection: {
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.8,
  },
  bootLine: {
    transition: "color 0.3s",
  },
  cursor: {
    color: "#4fffb0",
    animation: "mbt-blink 0.7s step-end infinite",
    fontSize: 13,
    fontFamily: "'Courier New', monospace",
  },
  stationHeader: {
    marginBottom: 12,
  },
  stationLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 3,
    color: "rgba(79, 255, 176, 0.5)",
    marginBottom: 2,
  },
  stationName: {
    fontSize: 22,
    fontWeight: 700,
    color: "#ffffff",
    letterSpacing: 1,
    textShadow: "0 0 12px rgba(79, 255, 176, 0.3)",
  },
  stationMeta: {
    fontSize: 12,
    color: "rgba(200, 216, 232, 0.6)",
    marginTop: 4,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    background:
      "linear-gradient(90deg, rgba(79,255,176,0.3), rgba(79,255,176,0.05))",
    marginBottom: 14,
  },
  description: {
    fontSize: 13,
    lineHeight: 1.6,
    color: "rgba(200, 216, 232, 0.7)",
    marginBottom: 14,
    fontStyle: "italic" as const,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#4fffb0",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase" as const,
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  sectionDates: {
    fontSize: 11,
    fontWeight: 400,
    color: "rgba(200, 216, 232, 0.4)",
    letterSpacing: 0,
    textTransform: "none" as const,
  },
  responsibilityLine: {
    fontSize: 12.5,
    lineHeight: 1.6,
    color: "rgba(200, 216, 232, 0.85)",
    marginBottom: 6,
    paddingLeft: 16,
    display: "flex",
    gap: 8,
  },
  bullet: {
    color: "rgba(79, 255, 176, 0.5)",
    flexShrink: 0,
    marginTop: 1,
  },
  footer: {
    display: "flex",
    gap: 8,
    padding: "10px 14px",
    borderTop: "1px solid rgba(79, 255, 176, 0.15)",
    background: "rgba(79, 255, 176, 0.04)",
    position: "relative",
    zIndex: 2,
  },
  actionBtn: {
    background: "rgba(79, 255, 176, 0.08)",
    border: "1px solid rgba(79, 255, 176, 0.25)",
    color: "#4fffb0",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'Rajdhani', sans-serif",
    borderRadius: 4,
    padding: "6px 14px",
    letterSpacing: 1,
    transition: "all 0.2s",
    textTransform: "uppercase" as const,
  },
};

// ── Inject keyframe animations ────────────────────────────────────
if (typeof document !== "undefined") {
  const styleId = "mbt-keyframes";
  if (!document.getElementById(styleId)) {
    const sheet = document.createElement("style");
    sheet.id = styleId;
    sheet.textContent = `
      @keyframes mbt-blink {
        50% { opacity: 0; }
      }
      @keyframes mbt-fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(sheet);
  }
}

export default MissionBriefingTerminal;
