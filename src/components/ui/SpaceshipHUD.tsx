import React from "react";
import type { DiagramStyleOptions } from "../DiagramSettings";
import IdentityBadge from "./IdentityBadge";

import "./SpaceshipHUD.scss";

// ============================================================
// SpaceshipHUD — Minimal game UI shell
// ============================================================
// Composes lightweight sub-components. No persistent panels.
// ============================================================

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

const SpaceshipHUD: React.FC<Props> = ({
  userName,
  userTitle,
}) => {
  return (
    <div className="game-hud">
      <IdentityBadge name={userName} title={userTitle} />
    </div>
  );
};

export default SpaceshipHUD;
