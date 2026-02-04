import React, { useState, useEffect, useRef } from "react";
import { HexColorPicker } from "react-colorful";
import { gsap } from "gsap";
import { createPortal } from "react-dom";
import type { DiagramStyleOptions } from "./DiagramSettings";
import UniverseLogsTerminal from "./UniverseLogsTerminal";
import "./SpaceshipHUDClean.scss";

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
  hudVisible?: boolean;
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
  followingSpaceship?: boolean;
  insideShip?: boolean;
  shipViewMode?: "exterior" | "interior" | "cockpit";
  onEnterShip?: () => void;
  onExitShip?: () => void;
  onGoToCockpit?: () => void;
  onGoToInterior?: () => void;
  shipExteriorLights?: boolean;
  onShipExteriorLightsChange?: (value: boolean) => void;
  shipInteriorLights?: boolean;
  onShipInteriorLightsChange?: (value: boolean) => void;
  manualFlightMode?: boolean;
  onManualFlightModeChange?: (value: boolean) => void;
  manualFlightSpeed?: number;
  manualFlightMaxSpeed?: number;
  keyboardState?: Record<string, boolean>;
  keyboardUpdateTrigger?: number;
  invertControls?: boolean;
  onInvertControlsChange?: (value: boolean) => void;
  controlSensitivity?: number;
  onControlSensitivityChange?: (value: number) => void;
  onStopFollowing?: () => void;
  navigationTargets?: Array<{
    id: string;
    label: string;
    type: "section" | "moon";
    icon?: string;
  }>;
  onNavigate?: (targetId: string, targetType: "section" | "moon") => void;
  currentTarget?: string | null;
  navigationDistance?: number | null;
  navigationETA?: number | null;
  isTransitioning?: boolean;
  speed?: number;
  content: HUDContent | null;
  contentLoading: boolean;
  onContentAction?: (action: string) => void;
  cosmosOptions?: DiagramStyleOptions;
  onCosmosOptionsChange?: (options: DiagramStyleOptions) => void;
  shipMovementDebug?: boolean;
  onShipMovementDebugChange?: (value: boolean) => void;
  shipMovementDebugPanel?: React.ReactNode;
  systemStatusLogs?: string[];
  onSystemStatusCopy?: () => void;
  onSystemStatusClear?: () => void;
  onConsoleLog?: (message: string) => void;
  missionControlLogs?: string[];
  onMissionControlLog?: (message: string) => void;
  onMissionControlClear?: () => void;
  onMissionControlCopy?: () => void;
};

type RGB = { r: number; g: number; b: number };

const clampRgb = (value: number) => Math.max(0, Math.min(255, value));

const hexToRgb = (hex: string): RGB => {
  const cleanHex = hex.replace("#", "");
  const expanded =
    cleanHex.length === 3
      ? cleanHex
          .split("")
          .map((c) => c + c)
          .join("")
      : cleanHex;
  const intVal = Number.parseInt(expanded, 16);
  if (Number.isNaN(intVal)) return { r: 255, g: 221, b: 153 };
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
};

const rgbToHex = ({ r, g, b }: RGB) => {
  const toHex = (val: number) => clampRgb(val).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const SpaceshipHUD: React.FC<Props> = ({
  userName,
  userTitle,
  consoleLogs,
  consoleVisible,
  onConsoleCopy,
  onConsoleClear,
  tourActive,
  tourWaypoint,
  tourProgress,
  onTourPrevious,
  onTourNext,
  onTourRestart,
  onTourEnd,
  followingSpaceship = false,
  insideShip = false,
  shipViewMode = "exterior",
  onEnterShip,
  onExitShip,
  onGoToCockpit,
  onGoToInterior,
  shipExteriorLights = false,
  onShipExteriorLightsChange,
  shipInteriorLights = true,
  onShipInteriorLightsChange,
  manualFlightMode = false,
  onManualFlightModeChange,
  manualFlightSpeed = 0,
  manualFlightMaxSpeed = 1,
  keyboardState = {},
  keyboardUpdateTrigger = 0,
  invertControls = false,
  onInvertControlsChange,
  controlSensitivity = 0.5,
  onControlSensitivityChange,
  onStopFollowing,
  navigationTargets = [],
  onNavigate,
  currentTarget = null,
  navigationDistance = null,
  navigationETA = null,
  isTransitioning = false,
  speed = 0,
  content,
  contentLoading,
  onContentAction,
  cosmosOptions = {},
  onCosmosOptionsChange = () => {},
  shipMovementDebug = false,
  onShipMovementDebugChange,
  shipMovementDebugPanel,
  systemStatusLogs = [],
  onSystemStatusCopy,
  onSystemStatusClear,
  onConsoleLog,
  hudVisible = true,
  missionControlLogs = [],
  // @ts-expect-error - Kept for future use
  onMissionControlLog = () => {},
  onMissionControlClear = () => {},
  onMissionControlCopy = () => {},
}) => {
  const [cosmosExpanded, setCosmosExpanded] = useState(false);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [contextualPosition, setContextualPosition] = useState({
    right: 20,
    bottom: 20,
  });
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1920,
    height: typeof window !== "undefined" ? window.innerHeight : 1080,
  }));
  const [panelPercents, setPanelPercents] = useState({
    left: 18,
    right: 24,
    footer: 24,
  });
  const [leftPanelEl, setLeftPanelEl] = useState<HTMLElement | null>(null);
  const [sunColorPickerOpen, setSunColorPickerOpen] = useState(false);
  const [consoleFeedback, setConsoleFeedback] = useState<string | null>(null);
  const [missionFeedback, setMissionFeedback] = useState<string | null>(null);
  const [sunColorDraft, setSunColorDraft] = useState(
    cosmosOptions.spaceSunColor || "#ffdd99",
  );
  const sunColorPickerRef = useRef<HTMLDivElement | null>(null);
  const sunColorButtonRef = useRef<HTMLButtonElement | null>(null);
  const sunColorRafRef = useRef<number | null>(null);
  const sunColorPendingRef = useRef<string | null>(null);
  const consoleFeedbackTimeoutRef = useRef<number | null>(null);
  const missionFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sunColorPickerOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (sunColorPickerRef.current?.contains(target)) return;
      if (sunColorButtonRef.current?.contains(target)) return;
      setSunColorPickerOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [sunColorPickerOpen]);

  useEffect(() => {
    if (!sunColorPickerOpen) {
      setSunColorDraft(cosmosOptions.spaceSunColor || "#ffdd99");
    }
  }, [sunColorPickerOpen, cosmosOptions.spaceSunColor]);

  useEffect(() => {
    return () => {
      if (sunColorRafRef.current !== null) {
        cancelAnimationFrame(sunColorRafRef.current);
      }
      if (consoleFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(consoleFeedbackTimeoutRef.current);
      }
      if (missionFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(missionFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const queueSunColorUpdate = (value: string) => {
    sunColorPendingRef.current = value;
    if (sunColorRafRef.current !== null) return;
    sunColorRafRef.current = requestAnimationFrame(() => {
      if (sunColorPendingRef.current) {
        handleCosmosOptionChange("spaceSunColor", sunColorPendingRef.current);
      }
      sunColorRafRef.current = null;
    });
  };

  const isUniverseLog = (log: string) => {
    const keywords = [
      "orbit",
      "moon",
      "planet",
      "cosmos",
      "space",
      "sun",
      "galaxy",
      "universe",
      "label",
      "tint",
    ];
    const lower = log.toLowerCase();
    return keywords.some((k) => lower.includes(k));
  };

  const clampValue = (value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max);
  };

  const showConsoleFeedback = (message: string) => {
    setConsoleFeedback(message);
    if (consoleFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(consoleFeedbackTimeoutRef.current);
    }
    consoleFeedbackTimeoutRef.current = window.setTimeout(() => {
      setConsoleFeedback(null);
    }, 1200);
  };

  const showMissionFeedback = (message: string) => {
    setMissionFeedback(message);
    if (missionFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(missionFeedbackTimeoutRef.current);
    }
    missionFeedbackTimeoutRef.current = window.setTimeout(() => {
      setMissionFeedback(null);
    }, 1200);
  };

  const universeLogs = consoleLogs.filter(isUniverseLog);
  const footerHeaderStyle = {
    padding: "8px 12px",
    borderBottom: "1px solid rgba(212, 175, 55, 0.2)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  } as const;
  const footerHeaderTitleStyle = {
    color: "#e8c547",
    fontWeight: 600,
    fontSize: 12,
    fontFamily: "'Rajdhani', sans-serif",
    letterSpacing: 1,
  } as const;
  const footerHeaderButtonStyle = {
    background: "#2a3340",
    color: "#fff",
    border: "none",
    padding: "5px 10px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 10,
    fontFamily: "'Rajdhani', sans-serif",
  } as const;
  const footerHeaderFeedbackStyle = {
    color: "#8bc34a",
    fontSize: 10,
    fontFamily: "'Rajdhani', sans-serif",
    letterSpacing: 0.6,
  } as const;

  // Derived pixel sizes from percents and viewport
  const leftWidthPx = clampValue(
    (panelPercents.left / 100) * viewportSize.width,
    220,
    viewportSize.width * 0.4,
  );
  const rightWidthPx = clampValue(
    (panelPercents.right / 100) * viewportSize.width,
    260,
    viewportSize.width * 0.4,
  );
  const footerHeightPx = clampValue(
    (panelPercents.footer / 100) * viewportSize.height,
    150,
    viewportSize.height * 0.4,
  );

  const cosmosContainer =
    typeof document !== "undefined"
      ? document.getElementById("cosmos-options-container")
      : null;

  // Animate HUD show/hide
  useEffect(() => {
    if (typeof document === "undefined") return;

    const tl = gsap.timeline({
      defaults: { duration: 0.4, ease: "power2.inOut" },
    });

    const topEl = document.querySelector(".spaceship-hud__top");
    const rightEl = document.querySelector(".spaceship-hud__right");
    const leftEl = document.querySelector(".spaceship-hud__left");
    const footerEl = document.querySelector(".spaceship-hud__footer");

    if (hudVisible) {
      tl.fromTo(topEl, { y: "-120%", autoAlpha: 0 }, { y: "0%", autoAlpha: 1 })
        .fromTo(
          leftEl,
          { x: "-110%", autoAlpha: 0 },
          { x: "0%", autoAlpha: 1 },
          "-=0.45",
        )
        .fromTo(
          rightEl,
          { x: "110%", autoAlpha: 0 },
          { x: "0%", autoAlpha: 1 },
          "-=0.42",
        )
        .fromTo(
          footerEl,
          { y: "120%", autoAlpha: 0 },
          { y: "0%", autoAlpha: 1 },
          "-=0.40",
        );
    } else {
      tl.to(topEl, { y: "-120%", autoAlpha: 0 })
        .to(leftEl, { x: "-110%", autoAlpha: 0 }, "-=0.45")
        .to(rightEl, { x: "110%", autoAlpha: 0 }, "-=0.42")
        .to(footerEl, { y: "120%", autoAlpha: 0 }, "-=0.40");
    }

    return () => {
      tl.kill();
    };
  }, [hudVisible]);

  // Locate the left HUD container injected by CosmicNavigation for resizing/portals
  useEffect(() => {
    if (typeof document === "undefined") return;

    const findLeftPanel = () => {
      const el = document.querySelector(
        ".spaceship-hud__left",
      ) as HTMLElement | null;
      if (el) {
        setLeftPanelEl(el);
        return true;
      }
      return false;
    };

    if (findLeftPanel()) return;

    const observer = new MutationObserver(() => {
      if (findLeftPanel()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  // Track viewport for percentage-based sizing
  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Apply dynamic sizing to the left HUD panel that lives outside React
  useEffect(() => {
    if (!leftPanelEl) return;
    leftPanelEl.style.width = `${leftWidthPx}px`;
    leftPanelEl.style.bottom = `${footerHeightPx}px`;
  }, [leftPanelEl, leftWidthPx, footerHeightPx]);

  // Resizing logic for left, right, and footer edges
  const startResize =
    (target: "left" | "right" | "footer") =>
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();

      const handleMouseMove = (e: MouseEvent) => {
        const maxWidthPx = viewportSize.width * 0.4;
        if (target === "left") {
          const newWidthPx = clampValue(e.clientX, 220, maxWidthPx);
          const newPercent = (newWidthPx / viewportSize.width) * 100;
          setPanelPercents((prev) => ({ ...prev, left: newPercent }));
        } else if (target === "right") {
          const newWidthPx = clampValue(
            viewportSize.width - e.clientX,
            260,
            maxWidthPx,
          );
          const newPercent = (newWidthPx / viewportSize.width) * 100;
          setPanelPercents((prev) => ({ ...prev, right: newPercent }));
        } else if (target === "footer") {
          const maxHeightPx = viewportSize.height * 0.4;
          const newHeightPx = clampValue(
            viewportSize.height - e.clientY,
            150,
            maxHeightPx,
          );
          const newPercent = (newHeightPx / viewportSize.height) * 100;
          setPanelPercents((prev) => ({ ...prev, footer: newPercent }));
        }
      };

      const handleMouseUp = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    };

  // Calculate contextual controls position based on HUD dimensions
  useEffect(() => {
    const calculatePosition = () => {
      if (typeof document === "undefined") return;

      const rightPanel = document.querySelector(
        ".spaceship-hud__right",
      ) as HTMLElement | null;
      const footer = document.querySelector(
        ".spaceship-hud__footer",
      ) as HTMLElement | null;

      // When HUD is hidden, treat panel sizes as zero so controls hug the viewport
      const rightWidth = hudVisible ? rightPanel?.offsetWidth || 0 : 0;
      const footerHeight = hudVisible ? footer?.offsetHeight || 0 : 0;

      setContextualPosition({
        right: rightWidth + 50,
        bottom: footerHeight + 50,
      });
    };

    // Calculate on mount
    calculatePosition();

    // Recalculate on window resize
    window.addEventListener("resize", calculatePosition);

    // Cleanup
    return () => {
      window.removeEventListener("resize", calculatePosition);
    };
  }, [
    followingSpaceship,
    keyboardUpdateTrigger,
    rightWidthPx,
    footerHeightPx,
    hudVisible,
  ]); // Recalculate when following state changes or keyboard updates

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
            `🌍 Planets orbit speed adjusted to ${Number(value).toFixed(1)}x`,
          );
          break;
        case "spaceMoonOrbitSpeed":
          onConsoleLog(
            `🌙 Moon orbit speed adjusted to ${Number(value).toFixed(1)}x`,
          );
          break;
        case "spaceMoonSpinSpeed":
          onConsoleLog(
            `🌀 Moon spin speed adjusted to ${Number(value).toFixed(1)}x`,
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
        case "spaceFollowDistance":
          onConsoleLog(
            `📏 Ship follow distance set to ${Number(value).toFixed(0)}`,
          );
          break;
        default:
          onConsoleLog(`⚙️ Setting '${String(key)}' updated`);
      }
    }
  };

  return (
    <>
      {/* Navigation Drawer - Only in Autopilot Mode */}
      {followingSpaceship &&
        !manualFlightMode &&
        navigationTargets.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="spaceship-nav-drawer"
            style={{
              right: `${contextualPosition.right + 320 + 20}px`, // controls position + controls width + gap
              bottom: `${contextualPosition.bottom}px`,
            }}
          >
            <div className="nav-drawer__header">
              <span className="nav-drawer__icon">🧭</span>
              <h3 className="nav-drawer__title">Quick Nav</h3>
            </div>

            <div className="nav-drawer__list">
              {navigationTargets.map((target) => (
                <button
                  key={target.id}
                  className={`nav-drawer__item ${currentTarget === target.id ? "active" : ""} ${target.type === "moon" ? "nav-drawer__item--moon" : ""}`}
                  onClick={() => onNavigate?.(target.id, target.type)}
                  title={`Navigate to ${target.label}`}
                >
                  {target.icon && (
                    <span className="nav-drawer__item-icon">{target.icon}</span>
                  )}
                  <span className="nav-drawer__item-label">{target.label}</span>
                  {target.type === "moon" && (
                    <span className="nav-drawer__item-badge">🌙</span>
                  )}
                </button>
              ))}
            </div>

            {/* Navigation Status */}
            {currentTarget &&
              (navigationDistance !== null || navigationETA !== null) && (
                <div className="nav-drawer__status">
                  {navigationDistance !== null && (
                    <div className="nav-drawer__status-item">
                      <span className="nav-drawer__status-label">
                        Distance:
                      </span>
                      <span className="nav-drawer__status-value">
                        {navigationDistance < 1000
                          ? `${navigationDistance.toFixed(0)} u`
                          : `${(navigationDistance / 1000).toFixed(1)} km`}
                      </span>
                    </div>
                  )}
                  {navigationETA !== null && (
                    <div className="nav-drawer__status-item">
                      <span className="nav-drawer__status-label">ETA:</span>
                      <span className="nav-drawer__status-value">
                        {navigationETA.toFixed(1)}s
                      </span>
                    </div>
                  )}
                </div>
              )}
          </div>,
          document.body,
        )}

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
          bottom: footerHeightPx,
          width: rightWidthPx,
          background: "#111418",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          borderLeft: "2px solid rgba(212, 175, 55, 0.3)",
        }}
        className="spaceship-hud__right"
      >
        <div
          className="hud-resize-handle hud-resize-handle--right"
          onMouseDown={startResize("right")}
        />
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {followingSpaceship && (
            <div style={{ marginBottom: 12 }}>
              <div
                className="overlay-subtitle"
                style={{
                  textAlign: "center",
                  fontFamily: "'Rajdhani', sans-serif",
                  color: "#e8c547",
                }}
              >
                🚀 FOLLOWING SPACESHIP
              </div>
              <div style={{ marginTop: 8, textAlign: "center" }}>
                <button
                  className="section-tab"
                  onClick={onStopFollowing}
                  style={{
                    color: "#fff",
                    fontFamily: "'Rajdhani', sans-serif",
                    background: "rgba(212, 55, 55, 0.2)",
                    border: "1px solid rgba(212, 55, 55, 0.5)",
                    padding: "8px 24px",
                    cursor: "pointer",
                    borderRadius: "4px",
                    fontSize: "14px",
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(212, 55, 55, 0.4)";
                    e.currentTarget.style.borderColor =
                      "rgba(212, 55, 55, 0.8)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(212, 55, 55, 0.2)";
                    e.currentTarget.style.borderColor =
                      "rgba(212, 55, 55, 0.5)";
                  }}
                >
                  🛑 STOP FOLLOWING
                </button>
              </div>
            </div>
          )}
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
          height: footerHeightPx,
          background: "#0f1419",
          borderTop: "2px solid rgba(212, 175, 55, 0.3)",
          zIndex: 10000,
          display: "flex",
          gap: 0,
        }}
        className="spaceship-hud__footer"
      >
        <div
          className="hud-resize-handle hud-resize-handle--footer"
          onMouseDown={startResize("footer")}
        />
        {/* Left Panel: Universe Logs */}
        <div
          style={{
            flex: "1 1 40%",
            borderRight: "2px solid rgba(212, 175, 55, 0.3)",
            display: "flex",
            flexDirection: "column",
            background: "#0f1419",
            position: "relative",
            minHeight: 0,
          }}
        >
          <div style={footerHeaderStyle}>
            <div style={footerHeaderTitleStyle}>Universe Logs</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {consoleFeedback && (
                <span style={footerHeaderFeedbackStyle}>{consoleFeedback}</span>
              )}
              <button
                onClick={() => {
                  onConsoleCopy();
                  showConsoleFeedback("COPIED");
                }}
                className="hud-button"
                style={footerHeaderButtonStyle}
              >
                COPY
              </button>
              <button
                onClick={() => {
                  onConsoleClear();
                  showConsoleFeedback("CLEARED");
                }}
                className="hud-button"
                style={footerHeaderButtonStyle}
              >
                CLEAR
              </button>
            </div>
          </div>

          <UniverseLogsTerminal logs={universeLogs} visible={consoleVisible} />
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
            minHeight: 0,
          }}
        >
          <div style={footerHeaderStyle}>
            <span style={footerHeaderTitleStyle}>Ship's Logs</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {missionFeedback && (
                <span style={footerHeaderFeedbackStyle}>{missionFeedback}</span>
              )}
              <button
                onClick={() => {
                  onMissionControlCopy();
                  showMissionFeedback("COPIED");
                }}
                style={footerHeaderButtonStyle}
                title="Copy mission logs"
              >
                COPY
              </button>
              <button
                onClick={() => {
                  onMissionControlClear();
                  showMissionFeedback("CLEARED");
                }}
                style={footerHeaderButtonStyle}
                title="Clear mission logs"
              >
                CLEAR
              </button>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minHeight: 0,
            }}
          >
            {missionControlLogs.length === 0 ? (
              <div
                style={{
                  color: "#6a7380",
                  fontSize: 13,
                  fontFamily: "'Orbitron', monospace",
                  fontStyle: "italic",
                  textAlign: "center",
                  marginTop: 20,
                }}
              >
                Awaiting navigation commands...
              </div>
            ) : (
              missionControlLogs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    color: "#8bc34a",
                    fontSize: 12,
                    fontFamily: "'Orbitron', monospace",
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {log}
                </div>
              ))
            )}
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
          <div style={footerHeaderStyle}>
            <span style={footerHeaderTitleStyle}>SYSTEM STATUS</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => onSystemStatusCopy?.()}
                style={footerHeaderButtonStyle}
                title="Copy system status"
              >
                COPY
              </button>
              <button
                onClick={() => onSystemStatusClear?.()}
                style={footerHeaderButtonStyle}
                title="Clear system status"
              >
                CLEAR
              </button>
            </div>
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
            {systemStatusLogs.length === 0 ? (
              <div
                style={{
                  color: "#50fa7b",
                  fontSize: 11,
                  fontFamily: "'Rajdhani', monospace",
                }}
              >
                ● ALL SYSTEMS NOMINAL
              </div>
            ) : (
              systemStatusLogs.map((log, index) => (
                <div
                  key={index}
                  style={{
                    color: "#9ec2ff",
                    fontSize: 11,
                    fontFamily: "'Rajdhani', monospace",
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </footer>

      {leftPanelEl &&
        createPortal(
          <div
            className="hud-resize-handle hud-resize-handle--left"
            onMouseDown={startResize("left")}
          />,
          leftPanelEl,
        )}

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
                  overflow: "visible",
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
                    Planets Orbit Speed:{" "}
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
                      ? cosmosOptions.spaceMoonOrbitSpeed.toFixed(3)
                      : (cosmosOptions.spaceOrbitSpeed ?? 0.01).toFixed(3)}
                    x
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.001"
                    value={
                      cosmosOptions.spaceMoonOrbitSpeed !== undefined
                        ? (cosmosOptions.spaceMoonOrbitSpeed as number)
                        : (cosmosOptions.spaceOrbitSpeed ?? 0.01)
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
                    Moon Spin Speed:{" "}
                    {cosmosOptions.spaceMoonSpinSpeed !== undefined
                      ? cosmosOptions.spaceMoonSpinSpeed.toFixed(1)
                      : "0.1"}
                    x
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={
                      cosmosOptions.spaceMoonSpinSpeed !== undefined
                        ? (cosmosOptions.spaceMoonSpinSpeed as number)
                        : 0.1
                    }
                    onChange={(e) =>
                      handleCosmosOptionChange(
                        "spaceMoonSpinSpeed",
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
                  <div
                    style={{ position: "relative", display: "inline-block" }}
                  >
                    <button
                      type="button"
                      ref={sunColorButtonRef}
                      onClick={() => setSunColorPickerOpen((open) => !open)}
                      style={{
                        width: 56,
                        height: 28,
                        padding: 0,
                        border: "1px solid rgba(212, 175, 55, 0.5)",
                        borderRadius: 6,
                        background: cosmosOptions.spaceSunColor || "#ffdd99",
                        cursor: "pointer",
                      }}
                      aria-label="Open sun color picker"
                    />

                    {sunColorPickerOpen && (
                      <div
                        ref={sunColorPickerRef}
                        style={{
                          position: "absolute",
                          top: 34,
                          left: 0,
                          padding: 8,
                          borderRadius: 8,
                          border: "1px solid rgba(212, 175, 55, 0.5)",
                          background: "rgba(7, 10, 14, 0.95)",
                          boxShadow: "0 6px 18px rgba(0, 0, 0, 0.45)",
                          zIndex: 10,
                          width: 200,
                        }}
                      >
                        <div style={{ marginBottom: 8 }}>
                          <HexColorPicker
                            color={sunColorDraft}
                            onChange={(value) => {
                              setSunColorDraft(value);
                              queueSunColorUpdate(value);
                            }}
                            style={{ width: "100%", height: 140 }}
                          />
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, 1fr)",
                            gap: 6,
                            marginBottom: 8,
                          }}
                        >
                          {(["r", "g", "b"] as const).map((channel) => {
                            const rgb = hexToRgb(sunColorDraft);
                            return (
                              <label
                                key={channel}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 4,
                                  color: "#8a9199",
                                  fontSize: 10,
                                  fontFamily: "'Rajdhani', sans-serif",
                                }}
                              >
                                {channel.toUpperCase()}
                                <input
                                  type="number"
                                  min={0}
                                  max={255}
                                  value={rgb[channel]}
                                  onChange={(event) => {
                                    const nextValue = clampRgb(
                                      Number(event.target.value),
                                    );
                                    const nextRgb = {
                                      ...rgb,
                                      [channel]: nextValue,
                                    };
                                    const nextHex = rgbToHex(nextRgb);
                                    setSunColorDraft(nextHex);
                                    queueSunColorUpdate(nextHex);
                                  }}
                                  style={{
                                    width: "100%",
                                    padding: "4px 6px",
                                    borderRadius: 6,
                                    border:
                                      "1px solid rgba(212, 175, 55, 0.35)",
                                    background: "rgba(0, 0, 0, 0.6)",
                                    color: "rgba(212, 175, 55, 0.9)",
                                    fontFamily: "'Rajdhani', sans-serif",
                                    fontSize: 11,
                                  }}
                                />
                              </label>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleCosmosOptionChange(
                              "spaceSunColor",
                              sunColorDraft,
                            );
                            setSunColorPickerOpen(false);
                          }}
                          style={{
                            marginTop: 6,
                            padding: "4px 10px",
                            fontSize: 10,
                            borderRadius: 6,
                            border: "1px solid rgba(212, 175, 55, 0.5)",
                            background: "rgba(0, 0, 0, 0.6)",
                            color: "rgba(212, 175, 55, 0.9)",
                            fontFamily: "'Rajdhani', sans-serif",
                            cursor: "pointer",
                            width: "100%",
                          }}
                        >
                          OK
                        </button>
                      </div>
                    )}
                  </div>
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

            <div style={{ marginTop: 16 }}>
              <div
                onClick={() => setDebugExpanded(!debugExpanded)}
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
                  DEBUG OPTIONS
                </div>
                <div style={{ color: "#e8c547", fontSize: 11 }}>
                  {debugExpanded ? "▼" : "▶"}
                </div>
              </div>

              {debugExpanded && (
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: "#c8d0d8",
                      fontSize: 12,
                      fontFamily: "'Rajdhani', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={shipMovementDebug}
                      onChange={(event) =>
                        onShipMovementDebugChange?.(event.target.checked)
                      }
                    />
                    Ship movement debug
                  </label>
                  {shipMovementDebug && shipMovementDebugPanel && (
                    <div
                      style={{
                        marginTop: 4,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {shipMovementDebugPanel}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>,
          cosmosContainer,
        )}

      {/* Navigation Drawer - Only in Autopilot Mode */}
      {followingSpaceship &&
        !manualFlightMode &&
        navigationTargets.length > 0 && (
          <div className="spaceship-nav-drawer">
            <div className="nav-drawer__header">
              <span className="nav-drawer__icon">🧭</span>
              <h3 className="nav-drawer__title">Quick Nav</h3>
            </div>

            <div className="nav-drawer__list">
              {navigationTargets.map((target) => (
                <button
                  key={target.id}
                  className={`nav-drawer__item ${currentTarget === target.id ? "active" : ""} ${target.type === "moon" ? "nav-drawer__item--moon" : ""}`}
                  onClick={() => onNavigate?.(target.id, target.type)}
                  title={`Navigate to ${target.label}`}
                >
                  {target.icon && (
                    <span className="nav-drawer__item-icon">{target.icon}</span>
                  )}
                  <span className="nav-drawer__item-label">{target.label}</span>
                  {target.type === "moon" && (
                    <span className="nav-drawer__item-badge">🌙</span>
                  )}
                </button>
              ))}
            </div>

            {/* Navigation Status */}
            {currentTarget &&
              (navigationDistance !== null || navigationETA !== null) && (
                <div className="nav-drawer__status">
                  {navigationDistance !== null && (
                    <div className="nav-drawer__status-item">
                      <span className="nav-drawer__status-label">
                        Distance:
                      </span>
                      <span className="nav-drawer__status-value">
                        {navigationDistance < 1000
                          ? `${navigationDistance.toFixed(0)} u`
                          : `${(navigationDistance / 1000).toFixed(1)} km`}
                      </span>
                    </div>
                  )}
                  {navigationETA !== null && (
                    <div className="nav-drawer__status-item">
                      <span className="nav-drawer__status-label">ETA:</span>
                      <span className="nav-drawer__status-value">
                        {navigationETA.toFixed(1)}s
                      </span>
                    </div>
                  )}
                </div>
              )}
          </div>
        )}

      {/* Contextual Controls - Ship Controls */}
      {followingSpaceship &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="contextual-controls"
            style={{
              right: `${contextualPosition.right}px`,
              bottom: `${contextualPosition.bottom}px`,
            }}
          >
            <div className="contextual-controls-header">
              <span>🚀 SHIP CONTROLS</span>
            </div>

            <div className="contextual-control-group">
              <label>
                <input
                  type="checkbox"
                  checked={shipExteriorLights}
                  onChange={(e) => {
                    if (onShipExteriorLightsChange) {
                      onShipExteriorLightsChange(e.target.checked);
                    }
                    if (onConsoleLog) {
                      onConsoleLog(
                        e.target.checked
                          ? "💡 Ship exterior lights ON"
                          : "💡 Ship exterior lights OFF",
                      );
                    }
                  }}
                />
                <span>Exterior Lights</span>
              </label>
            </div>

            {/* Flight Mode Toggle - Only show when NOT inside ship */}
            {!insideShip && (
              <div className="contextual-control-group flight-mode-toggle">
                <div className="mode-buttons">
                  <button
                    className={`mode-button ${!manualFlightMode ? "active" : ""}`}
                    onClick={() => {
                      if (onManualFlightModeChange) {
                        onManualFlightModeChange(false);
                      }
                      if (onConsoleLog) {
                        onConsoleLog("🤖 Autopilot engaged");
                      }
                    }}
                  >
                    🤖 AUTOPILOT
                  </button>
                  <button
                    className={`mode-button ${manualFlightMode ? "active" : ""}`}
                    onClick={() => {
                      if (onManualFlightModeChange) {
                        onManualFlightModeChange(true);
                      }
                      if (onConsoleLog) {
                        onConsoleLog("✋ Manual control activated");
                      }
                    }}
                  >
                    ✋ MANUAL
                  </button>
                </div>
              </div>
            )}

            {/* Manual Flight Controls - Only show in manual mode and NOT inside ship */}
            {!insideShip && manualFlightMode && (
              <div className="manual-flight-controls">
                {/* Flight Settings */}
                <div className="flight-settings">
                  <div className="setting-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={invertControls}
                        onChange={(e) => {
                          if (onInvertControlsChange) {
                            onInvertControlsChange(e.target.checked);
                          }
                        }}
                      />
                      <span>Invert Controls</span>
                    </label>
                  </div>
                  <div className="setting-row">
                    <label>
                      <span>Sensitivity</span>
                      <input
                        type="range"
                        min="0.1"
                        max="2.0"
                        step="0.1"
                        value={controlSensitivity}
                        onChange={(e) => {
                          if (onControlSensitivityChange) {
                            onControlSensitivityChange(
                              parseFloat(e.target.value),
                            );
                          }
                        }}
                        style={{ width: "100%" }}
                      />
                      <span className="value">
                        {Math.round(controlSensitivity * 10)}/20
                      </span>
                    </label>
                  </div>
                </div>

                {/* Speedometer */}
                <div className="speedometer">
                  <div className="speed-label">VELOCITY</div>
                  <div className="speed-value">
                    {Math.round(
                      ((manualFlightSpeed || 0) / (manualFlightMaxSpeed || 1)) *
                        100,
                    )}
                    <span className="speed-unit">%</span>
                  </div>
                  <div className="speed-bar">
                    <div
                      className="speed-bar-fill"
                      style={{
                        width: `${((manualFlightSpeed || 0) / (manualFlightMaxSpeed || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Navigation Keypad */}
                <div className="nav-keypad">
                  <div className="nav-instructions">
                    Use Arrow Keys + SHIFT to boost
                  </div>
                  <div className="nav-grid">
                    {/* Top row */}
                    <div className="nav-key-spacer"></div>
                    <button
                      className={`nav-key ${keyboardState?.ArrowUp ? "active" : ""}`}
                      onMouseDown={() => {
                        const event = new KeyboardEvent("keydown", {
                          code: "ArrowUp",
                        });
                        window.dispatchEvent(event);
                      }}
                      onMouseUp={() => {
                        const event = new KeyboardEvent("keyup", {
                          code: "ArrowUp",
                        });
                        window.dispatchEvent(event);
                      }}
                    >
                      ▲
                    </button>
                    <div className="nav-key-spacer"></div>

                    {/* Middle row */}
                    <button
                      className={`nav-key ${keyboardState?.ArrowLeft ? "active" : ""}`}
                      onMouseDown={() => {
                        const event = new KeyboardEvent("keydown", {
                          code: "ArrowLeft",
                        });
                        window.dispatchEvent(event);
                      }}
                      onMouseUp={() => {
                        const event = new KeyboardEvent("keyup", {
                          code: "ArrowLeft",
                        });
                        window.dispatchEvent(event);
                      }}
                    >
                      ◀
                    </button>
                    <button
                      className={`nav-key center-key ${keyboardState?.ShiftLeft ? "boost-active" : ""}`}
                      onMouseDown={() => {
                        const event = new KeyboardEvent("keydown", {
                          code: "ShiftLeft",
                        });
                        window.dispatchEvent(event);
                      }}
                      onMouseUp={() => {
                        const event = new KeyboardEvent("keyup", {
                          code: "ShiftLeft",
                        });
                        window.dispatchEvent(event);
                      }}
                    >
                      {keyboardState?.ShiftLeft ? "🔥" : "⚡"}
                    </button>
                    <button
                      className={`nav-key ${keyboardState?.ArrowRight ? "active" : ""}`}
                      onMouseDown={() => {
                        const event = new KeyboardEvent("keydown", {
                          code: "ArrowRight",
                        });
                        window.dispatchEvent(event);
                      }}
                      onMouseUp={() => {
                        const event = new KeyboardEvent("keyup", {
                          code: "ArrowRight",
                        });
                        window.dispatchEvent(event);
                      }}
                    >
                      ▶
                    </button>

                    {/* Bottom row */}
                    <div className="nav-key-spacer"></div>
                    <button
                      className={`nav-key ${keyboardState?.ArrowDown ? "active" : ""}`}
                      onMouseDown={() => {
                        const event = new KeyboardEvent("keydown", {
                          code: "ArrowDown",
                        });
                        window.dispatchEvent(event);
                      }}
                      onMouseUp={() => {
                        const event = new KeyboardEvent("keyup", {
                          code: "ArrowDown",
                        });
                        window.dispatchEvent(event);
                      }}
                    >
                      ▼
                    </button>
                    <div className="nav-key-spacer"></div>
                  </div>
                </div>
              </div>
            )}

            {/* Interior Lights - Only show when inside ship */}
            {insideShip && (
              <div className="contextual-control-group">
                <label>
                  <input
                    type="checkbox"
                    checked={shipInteriorLights}
                    onChange={(e) => {
                      if (onShipInteriorLightsChange) {
                        onShipInteriorLightsChange(e.target.checked);
                      }
                      if (onConsoleLog) {
                        onConsoleLog(
                          e.target.checked
                            ? "💡 Ship interior lights ON"
                            : "💡 Ship interior lights OFF",
                        );
                      }
                    }}
                  />
                  <span>Interior Lights</span>
                </label>
              </div>
            )}

            {/* Interior View Controls - Only show when NOT inside ship */}
            {!insideShip && (
              <>
                <div className="contextual-control-group">
                  <label>
                    <span>Follow Distance</span>
                    <input
                      type="range"
                      min="20"
                      max="150"
                      step="5"
                      value={cosmosOptions.spaceFollowDistance ?? 80}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        onCosmosOptionsChange({
                          ...cosmosOptions,
                          spaceFollowDistance: value,
                        });
                        if (onConsoleLog) {
                          onConsoleLog(`📏 Ship follow distance: ${value}`);
                        }
                      }}
                      style={{ width: "100%" }}
                    />
                    <span className="value">
                      {cosmosOptions.spaceFollowDistance ?? 80}
                    </span>
                  </label>
                </div>

                <div className="contextual-control-group">
                  <label>
                    <span>Travel Speed</span>
                    <input
                      type="range"
                      min="10"
                      max="200"
                      step="10"
                      value={cosmosOptions.spaceTravelSpeed ?? 50}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        onCosmosOptionsChange({
                          ...cosmosOptions,
                          spaceTravelSpeed: value,
                        });
                        if (onConsoleLog) {
                          onConsoleLog(`🚀 Ship travel speed: ${value}%`);
                        }
                      }}
                      style={{ width: "100%" }}
                    />
                    <span className="value">
                      {cosmosOptions.spaceTravelSpeed ?? 50}%
                    </span>
                  </label>
                </div>

                <button
                  className="contextual-action-button"
                  onClick={() => {
                    if (onEnterShip) {
                      onEnterShip();
                      if (onConsoleLog) {
                        onConsoleLog("🛸 Entering ship interior...");
                      }
                    }
                  }}
                  style={{
                    background:
                      "linear-gradient(135deg, #1e3a5f 0%, #2a5a8f 100%)",
                    border: "1px solid rgba(100, 149, 237, 0.6)",
                    color: "#6495ed",
                    marginBottom: "8px",
                  }}
                >
                  🛸 ENTER SHIP
                </button>
              </>
            )}

            {/* Inside Ship Controls - Only show when inside */}
            {insideShip && (
              <>
                {shipViewMode === "interior" && (
                  <button
                    className="contextual-action-button"
                    onClick={() => {
                      if (onGoToCockpit) {
                        onGoToCockpit();
                        if (onConsoleLog) {
                          onConsoleLog("✈️ Moving to cockpit...");
                        }
                      }
                    }}
                    style={{
                      background:
                        "linear-gradient(135deg, #2a5a8f 0%, #3a7abf 100%)",
                      border: "1px solid rgba(100, 149, 237, 0.8)",
                      color: "#87ceeb",
                      marginBottom: "8px",
                    }}
                  >
                    ✈️ GO TO COCKPIT
                  </button>
                )}

                {shipViewMode === "cockpit" && (
                  <button
                    className="contextual-action-button"
                    onClick={() => {
                      if (onGoToInterior) {
                        onGoToInterior();
                        if (onConsoleLog) {
                          onConsoleLog("🚪 Returning to main interior...");
                        }
                      }
                    }}
                    style={{
                      background:
                        "linear-gradient(135deg, #2a5a8f 0%, #3a7abf 100%)",
                      border: "1px solid rgba(100, 149, 237, 0.8)",
                      color: "#87ceeb",
                      marginBottom: "8px",
                    }}
                  >
                    🚪 RETURN TO CABIN
                  </button>
                )}

                <button
                  className="contextual-action-button"
                  onClick={() => {
                    if (onExitShip) {
                      onExitShip();
                      if (onConsoleLog) {
                        onConsoleLog("🚪 Exiting ship...");
                      }
                    }
                  }}
                  style={{
                    background:
                      "linear-gradient(135deg, #1e5f3a 0%, #2a8f5a 100%)",
                    border: "1px solid rgba(50, 205, 50, 0.6)",
                    color: "#32cd32",
                    marginBottom: "8px",
                  }}
                >
                  🚪 EXIT SHIP
                </button>
              </>
            )}

            <button
              className="contextual-stop-button"
              onClick={() => {
                if (onStopFollowing) {
                  onStopFollowing();
                }
              }}
            >
              STOP FOLLOWING
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

export default SpaceshipHUD;
