/**
 * SpaceOverlays.tsx
 *
 * UI overlay components for the 3D space scene.
 * Handles HUD, console logging, content overlays, and loading screens.
 */

import React from "react";
import { useNavigationContext } from "../context";
import { useLogger } from "../hooks";
import "./SpaceOverlays.scss";

// Console log display
export interface ConsoleLogProps {
  visible?: boolean;
  maxLogs?: number;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export const ConsoleLog: React.FC<ConsoleLogProps> = ({
  visible = true,
  maxLogs = 10,
  position = "top-right",
}) => {
  const { consoleLogs } = useLogger();

  if (!visible) return null;

  const displayLogs = consoleLogs.slice(-maxLogs);

  return (
    <div className={`space-console-log space-console-log--${position}`}>
      <div className="space-console-log__title">🌌 UNIVERSE LOGS</div>
      {displayLogs.map((log, idx) => (
        <div
          key={idx}
          className="space-console-log__entry"
          style={{
            borderBottom:
              idx < displayLogs.length - 1
                ? "1px solid rgba(232, 197, 71, 0.1)"
                : "none",
          }}
        >
          {log}
        </div>
      ))}
      {displayLogs.length === 0 && (
        <div className="space-console-log__empty">No logs yet...</div>
      )}
    </div>
  );
};

// Mission Control (Ship) logs
export interface MissionLogProps {
  visible?: boolean;
  maxLogs?: number;
}

export const MissionLog: React.FC<MissionLogProps> = ({
  visible = true,
  maxLogs = 5,
}) => {
  const { shipLogs } = useLogger();

  if (!visible) return null;

  const displayLogs = shipLogs.slice(-maxLogs);

  return (
    <div className="space-mission-log">
      <div className="space-mission-log__title">🚀 MISSION CONTROL</div>
      {displayLogs.map((log, idx) => (
        <div key={idx} className="space-mission-log__entry">
          {log}
        </div>
      ))}
      {displayLogs.length === 0 && (
        <div className="space-mission-log__empty">
          Awaiting mission objectives...
        </div>
      )}
    </div>
  );
};

// Navigation status display
export interface NavigationStatusProps {
  visible?: boolean;
}

export const NavigationStatus: React.FC<NavigationStatusProps> = ({
  visible = true,
}) => {
  const {
    navigationState,
    isNavigating,
    isTourActive,
    currentWaypointIndex,
    totalWaypoints,
  } = useNavigationContext();

  if (!visible || (!isNavigating && !isTourActive)) return null;

  return (
    <div className="space-navigation-status">
      {isTourActive && (
        <div className="space-navigation-status__tour">
          🎯 GUIDED TOUR: {currentWaypointIndex + 1} / {totalWaypoints}
        </div>
      )}
      {isNavigating && navigationState && (
        <>
          <div className="space-navigation-status__target">
            ➜ {navigationState.id || "Unknown"}
          </div>
          <div className="space-navigation-status__details">
            Navigation in progress...
            {navigationState.useTurbo && " • 🔥 TURBO"}
          </div>
        </>
      )}
    </div>
  );
};

// Loading screen component
export interface LoadingScreenProps {
  visible?: boolean;
  message?: string;
  progress?: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  visible = true,
  message = "Initializing cosmos...",
  progress,
}) => {
  if (!visible) return null;

  return (
    <div className="space-loading-screen">
      <div className="space-loading-screen__stars" />

      <div className="space-loading-screen__content">
        <div className="space-loading-screen__icon">🌌</div>

        <div className="space-loading-screen__message">{message}</div>

        {typeof progress === "number" && (
          <div className="space-loading-screen__progress-bar">
            <div
              className="space-loading-screen__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {typeof progress === "number" && (
          <div className="space-loading-screen__percentage">
            {progress.toFixed(0)}%
          </div>
        )}
      </div>
    </div>
  );
};

// Combined overlays component
export interface SpaceOverlaysProps {
  showConsole?: boolean;
  showMissionLog?: boolean;
  showNavStatus?: boolean;
  showLoading?: boolean;
  loadingMessage?: string;
  loadingProgress?: number;
}

export const SpaceOverlays: React.FC<SpaceOverlaysProps> = ({
  showConsole = true,
  showMissionLog = true,
  showNavStatus = true,
  showLoading = false,
  loadingMessage,
  loadingProgress,
}) => {
  return (
    <>
      <LoadingScreen
        visible={showLoading}
        message={loadingMessage}
        progress={loadingProgress}
      />
      <NavigationStatus visible={showNavStatus} />
      <ConsoleLog visible={showConsole} />
      <MissionLog visible={showMissionLog} />
    </>
  );
};
