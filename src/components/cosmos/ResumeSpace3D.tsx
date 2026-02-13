import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import resumeData from "../../data/resume.json";
import CosmosLoader from "../CosmosLoader";
import {
  DEFAULT_CONTROL_SENSITIVITY,
  DEFAULT_MOON_VISIT_DURATION,
  DEFAULT_SPACESHIP_PATH_SPEED,
  DEFAULT_ZOOM_EXIT_THRESHOLD,
} from "./ResumeSpace3D.constants";
import {
  attachMultiNoteOverlaysFactory,
  createAuroraHaloTexture,
  createCoreHaloTexture,
  createDetailTexture,
  createLabel,
  createLighting,
  createPlanetFactory,
  createRingHaloTexture,
  createStarField,
  createStarfieldMeshes,
  createSunMesh,
  createSunGlowTexture,
} from "./ResumeSpace3D.factories";
import { type OrbitAnchor, type OrbitItem } from "./ResumeSpace3D.orbital";
import {
  freezeSystemForMoon,
  type FrozenSystemState,
} from "./ResumeSpace3D.systemFreeze";
import type { ResumeSpace3DProps, SceneRef } from "./ResumeSpace3D.types";
// Import our new cosmic systems
import {
  CosmosCameraDirector,
  CosmicTourGuide,
  NavigationInterface,
  type NavigationWaypoint,
} from "../CosmicNavigation";
import type { OverlayContent } from "../CosmicContentOverlay";
import {
  TourDefinitionBuilder,
  type PlanetData,
} from "../TourDefinitionBuilder";
import SpaceshipHUD from "../ui/SpaceshipHUD";
import ShipControlBar, { type ShipUIPhase, type ShipView } from "../ui/ShipControlBar";
import CockpitHints from "../ui/CockpitHints";
import CockpitNavPanel from "../ui/CockpitNavPanel";
import { MissionBriefingTerminal } from "../ui/MissionBriefingTerminal";
import { HologramDroneDisplay } from "./HologramDroneDisplay";
import { getOrbitalPositionEmitter } from "../OrbitalPositionEmitter";
import { useCosmosLogs } from "./hooks/useCosmosLogs";
import { useCosmosOptions } from "./hooks/useCosmosOptions";
import { useKeyboardControls } from "./hooks/useKeyboardControls";
import { usePointerInteractions } from "./hooks/usePointerInteractions";
import { useThreeScene } from "./hooks/useThreeScene";
import { useOrbitSystem } from "./hooks/useOrbitSystem";
import { createMoonFocusController } from "./ResumeSpace3D.focusController";
import { useNavigationSystem } from "./hooks/useNavigationSystem";
import { useRenderLoop } from "./hooks/useRenderLoop";
import { createIntroSequenceRunner } from "./introSequence";

// Extend window for logging timestamps
declare global {
  interface Window {
    lastAutopilotLog?: number;
  }
}

type ShipLabelTarget =
  | "front"
  | "rear"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "cockpit";

type ShipLabelInfo = { name: string; uuid: string };
type ShipLabelMark = {
  label: ShipLabelTarget;
  meshName: string;
  meshUuid: string;
  localPoint: [number, number, number];
};

// --- SHIP_DEBUG_LABELS (2026-02-03 snapshot) ---
// Each entry is a small circle used to indicate the larger region direction.
// 0) top
//    mesh: Mesh_0067_Tex_0095_1dds_0, uuid: 01fc05a3-a0e9-44ac-96ce-6cbd4aa6d96c
//    localPoint: [0.9122422225127416, 1.5442983446762355, -0.08458437473518643]
//    worldPoint: [901.876508524019, 30.86552548906256, 176.7214114626555]
// 1) bottom
//    mesh: Mesh_0067_Tex_0095_1dds_0, uuid: 01fc05a3-a0e9-44ac-96ce-6cbd4aa6d96c
//    localPoint: [-1.4762680590244663, -1.3492305317464002, 0.05729344316409879]
//    worldPoint: [902.0770672662713, 29.04214646060716, 176.32207436292234]
// 2) left
//    mesh: Mesh_0068_Tex_0095_2dds_0_1, uuid: ed9824f4-1419-47df-b81c-2bbc9e466d8c
//    localPoint: [6.660106363163475, -2.9067988739019484, -0.003916184310810422]
//    worldPoint: [901.3472866873808, 30.15029999385027, 180.24597607903206]
// 3) right
//    mesh: Mesh_0068_Tex_0095_2dds_0, uuid: 63d700a8-400e-48f1-a8f4-fef1b732149d
//    localPoint: [-6.682026754811734, 2.856149957649478, -0.017892472447783803]
//    worldPoint: [902.5549716380164, 29.767504829162657, 173.09048604694686]
// 4) rear
//    mesh: SurfPatch_Material001_0, uuid: 6282dfed-c415-413c-aecc-52a7744b17b5
//    localPoint: [-0.1861477066534185, -0.009953896327260736, -7.4621855991877055]
//    worldPoint: [905.6224600479799, 30.344568169496842, 177.17883984434613]
// 5) front
//    mesh: Mesh_0068_Tex_0095_2dds_0_1, uuid: ed9824f4-1419-47df-b81c-2bbc9e466d8c
//    localPoint: [-0.011301192244236091, -0.27918260784130666, 7.259686497338635]
//    worldPoint: [898.388639671934, 29.438446524413816, 176.1493109769936]
// 6) cockpit
//    mesh: Mesh_0067_Tex_0095_1dds_0, uuid: 01fc05a3-a0e9-44ac-96ce-6cbd4aa6d96c
//    localPoint: [-6.1963774447354645, 3.5916143936170215, 7.127732464864266]
//    worldPoint: [898.99317807436, 29.801697414970644, 172.56929777924128]

export default function ResumeSpace3D({
  options,
  onOptionsChange,
}: ResumeSpace3DProps) {
  // EXPORT SURFACE
  // Props: options, onOptionsChange
  // Emits: onOptionsChange (options sync)
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<SceneRef>({});

  // State for new cosmic systems
  const [overlayContent, setOverlayContent] = useState<OverlayContent | null>(
    null,
  );
  const [contentLoading, setContentLoading] = useState(false);

  // Content display variant
  type ContentDisplayVariant = "mission-briefing" | "hologram-drone" | "classic";
  const CONTENT_VARIANTS: { id: ContentDisplayVariant; label: string }[] = [
    { id: "mission-briefing", label: "Terminal" },
    { id: "hologram-drone", label: "Drone" },
    { id: "classic", label: "Classic" },
  ];
  const [contentDisplayVariant, setContentDisplayVariant] =
    useState<ContentDisplayVariant>("mission-briefing");

  // Hologram Drone display instance
  const hologramDroneRef = useRef<HologramDroneDisplay | null>(null);

  // Drive hologram drone based on content and variant
  useEffect(() => {
    const drone = hologramDroneRef.current;
    if (!drone) return;
    if (contentDisplayVariant === "hologram-drone" && overlayContent) {
      const moon = focusedMoonRef.current;
      const cam = sceneRef.current.camera;
      if (moon && cam) {
        const moonWorldPos = new THREE.Vector3();
        moon.getWorldPosition(moonWorldPos);
        drone.showContent(overlayContent, moonWorldPos, cam);
      }
    } else {
      drone.hideContent();
    }
  }, [overlayContent, contentDisplayVariant]);

  const originalMinDistanceRef = useRef<number>(0);
  // Request flag to tell the scene effect to exit focused moon (cross-scope safe)
  const exitFocusRequestRef = useRef<boolean>(false);

  // How many world units change in camera-to-moon distance should trigger exiting focus
  // Tune this to allow small zoom adjustments without losing focus.
  const zoomExitThresholdRef = useRef<number>(DEFAULT_ZOOM_EXIT_THRESHOLD); // units (default suggestion)
  const {
    consoleVisible,
    setConsoleVisible,
    consoleLogs,
    consoleLogsRef,
    missionControlLogs,
    missionControlLogsRef,
    setConsoleLogs,
    setMissionControlLogs,
    vlog,
    missionLog,
  } = useCosmosLogs();

  const [shipMovementDebug, setShipMovementDebug] = useState(false);
  const [systemStatusLogs, setSystemStatusLogs] = useState<string[]>([]);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);

  // Tour state
  const [tourActive, setTourActive] = useState(false);
  const [tourWaypoint, setTourWaypoint] = useState<string>("");
  const [tourProgress, setTourProgress] = useState({ current: 0, total: 0 });

  // Spaceship state
  const [followingSpaceship, setFollowingSpaceship] = useState(false);
  const followingSpaceshipRef = useRef(false);
  const [shipExteriorLights, setShipExteriorLights] = useState(false);
  const [shipInteriorLights, setShipInteriorLights] = useState(true);
  const [insideShip, setInsideShip] = useState(false);
  const insideShipRef = useRef(false);
  const spaceshipInteriorLightsRef = useRef<THREE.PointLight[]>([]);
  const [shipViewMode, setShipViewMode] = useState<
    "exterior" | "interior" | "cockpit"
  >("exterior");
  const shipViewModeRef = useRef<"exterior" | "interior" | "cockpit">(
    "exterior",
  );
  const spaceshipRef = useRef<THREE.Group | null>(null);
  const shipStagingModeRef = useRef(false);
  const shipStagingKeysRef = useRef<Record<string, boolean>>({
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    KeyR: false,
    KeyF: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    KeyQ: false,
    KeyE: false,
    ShiftLeft: false,
  });
  const shipCinematicRef = useRef<{
    active: boolean;
    phase: "orbit" | "approach" | "hover";
    startTime: number;
    duration: number;
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    controlPos: THREE.Vector3;
    controlPos2?: THREE.Vector3;
    flybyPoint?: THREE.Vector3;
    startQuat: THREE.Quaternion;
    endQuat: THREE.Quaternion;
    approachLookAt?: THREE.Vector3;
    lightsTriggered?: boolean;
    orbitStartTime?: number;
    orbitDuration?: number;
    orbitCenter?: THREE.Vector3;
    orbitRadius?: number;
    orbitStartAngle?: number;
    orbitEndAngle?: number;
    hoverStartTime?: number;
    hoverBasePos?: THREE.Vector3;
    hoverStartQuat?: THREE.Quaternion;
    spinStartOffset?: number;
    spinDuration?: number;
    spinTurns?: number;
    settleTargetPos?: THREE.Vector3;
    settleDuration?: number;
  } | null>(null);
  // Ship UI phase (controls which buttons are visible)
  const [shipUIPhase, setShipUIPhase] = useState<ShipUIPhase>("hidden");
  const shipWanderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cockpit steering (shift+drag) — yaw/pitch input to turn the ship
  const cockpitSteerRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const cockpitSteerActiveRef = useRef(false);
  const cockpitSteerStartRef = useRef<{ x: number; y: number } | null>(null);

  // Manual roll (bank) control — -1 = roll left, 0 = idle, 1 = roll right
  const rollInputRef = useRef<number>(0);
  // Accumulated user roll offset (radians) — persists across navigation
  const shipRollOffsetRef = useRef<number>(0);
  const [displayRollAngle, setDisplayRollAngle] = useState(0);

  const spaceshipLightsRef = useRef<THREE.PointLight[]>([]);
  const spaceshipEngineLightRef = useRef<THREE.PointLight | null>(null);
  const spaceshipPathRef = useRef<{
    currentIndex: number;
    progress: number;
    speed: number;
    targetSpeed: number;
    pauseTime: number;
    isPaused: boolean;
    rollSpeed: number;
    rollAmount: number;
    visitingMoon: boolean;
    moonVisitStartTime: number;
    moonVisitDuration: number;
    currentMoonTarget: THREE.Vector3 | null;
  }>({
    currentIndex: 0,
    progress: 0,
    speed: DEFAULT_SPACESHIP_PATH_SPEED,
    targetSpeed: DEFAULT_SPACESHIP_PATH_SPEED,
    pauseTime: 0,
    isPaused: false,
    rollSpeed: 0,
    rollAmount: 0,
    visitingMoon: false,
    moonVisitStartTime: 0,
    moonVisitDuration: DEFAULT_MOON_VISIT_DURATION, // 10 seconds
    currentMoonTarget: null,
  });

  // Items ref to track orbital objects (moons, planets)
  const itemsRef = useRef<
    {
      mesh: THREE.Mesh;
      orbitSpeed: number;
      angle: number;
      distance: number;
      parent?: THREE.Object3D;
      detached?: boolean;
      originalParent?: THREE.Object3D;
      overlayMeshes?: THREE.Mesh[];
      overlayOffsets?: number[];
      overlayHeights?: number[];
    }[]
  >([]);

  // Ship Explore Mode — debug FPS camera to locate cockpit and other positions
  const [shipExploreMode, setShipExploreMode] = useState(false);
  const shipExploreModeRef = useRef(false);
  const shipExploreKeysRef = useRef<Record<string, boolean>>({
    KeyW: false, KeyA: false, KeyS: false, KeyD: false,
    KeyQ: false, KeyE: false,
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    ShiftLeft: false, ShiftRight: false,
  });
  const shipExploreCoordsRef = useRef<{
    local: [number, number, number];
    world: [number, number, number];
  }>({ local: [0, 0, 0], world: [0, 0, 0] });
  const [exploreCoords, setExploreCoords] = useState<{
    local: [number, number, number];
    world: [number, number, number];
  }>({ local: [0, 0, 0], world: [0, 0, 0] });
  const [exploreSavedPositions, setExploreSavedPositions] = useState<
    { label: string; local: [number, number, number] }[]
  >([]);

  // Manual flight control state
  const [manualFlightMode, setManualFlightMode] = useState(false);
  const manualFlightModeRef = useRef(false);
  const [keyboardUpdateTrigger, setKeyboardUpdateTrigger] = useState(0);
  const [invertControls, setInvertControls] = useState(false);
  const invertControlsRef = useRef(false);
  const [controlSensitivity, setControlSensitivity] = useState(
    DEFAULT_CONTROL_SENSITIVITY,
  ); // 0.1 to 2.0
  const controlSensitivityRef = useRef(DEFAULT_CONTROL_SENSITIVITY);
  const manualFlightRef = useRef<{
    velocity: THREE.Vector3;
    acceleration: number;
    maxSpeed: number;
    currentSpeed: number;
    pitch: number; // Rotation around X axis
    yaw: number; // Rotation around Y axis
    roll: number; // Rotation around Z axis
    targetPitch: number;
    targetYaw: number;
    targetRoll: number;
    isAccelerating: boolean;
    direction: { forward: number; right: number; up: number };
    turboStartTime: number;
    isTurboActive: boolean;
  }>({
    velocity: new THREE.Vector3(),
    acceleration: 0,
    maxSpeed: 2.0,
    currentSpeed: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    targetPitch: 0,
    targetYaw: 0,
    targetRoll: 0,
    isAccelerating: false,
    direction: { forward: 0, right: 0, up: 0 },
    turboStartTime: 0,
    isTurboActive: false,
  });

  // Keyboard state for manual controls
  const keyboardStateRef = useRef({
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    ShiftLeft: false,
    KeyQ: false, // Strafe left
    KeyE: false, // Strafe right
    KeyW: false, // Forward
    KeyS: false, // Backward
    KeyA: false, // Strafe left
    KeyD: false, // Strafe right
    KeyR: false, // Ascend
    KeyF: false, // Descend
    KeyX: false, // Brake
    KeyC: false, // Toggle cockpit
  });

  const [debugSnapToShip, setDebugSnapToShip] = useState(false);
  const debugSnapToShipRef = useRef(false);
  const startIntroSequenceRef = useRef<(() => void) | null>(null);

  // Debug ship label state
  const [debugShipLabelMode, setDebugShipLabelMode] = useState(false);
  const debugShipLabelModeRef = useRef(false);
  const [debugShipLabel, setDebugShipLabel] =
    useState<ShipLabelTarget>("front");
  const debugShipLabelRef = useRef<ShipLabelTarget>("front");
  const [debugShipLabels, setDebugShipLabels] = useState<
    Partial<Record<ShipLabelTarget, ShipLabelInfo>>
  >({});
  const debugShipLabelsRef = useRef<
    Partial<Record<ShipLabelTarget, ShipLabelInfo>>
  >({});
  const debugHitMarkerRef = useRef<THREE.Mesh | null>(null);
  const debugShipLabelMarkersRef = useRef<THREE.Mesh[]>([]);
  const debugShipLabelMarksRef = useRef<
    Partial<Record<ShipLabelTarget, ShipLabelMark[]>>
  >({});
  const debugPointerDownRef = useRef<{
    x: number;
    y: number;
    t: number;
  } | null>(null);

  // Build navigation targets from resume data
  const navigationTargets = [
    {
      id: "experience",
      label: "Experience",
      type: "section" as const,
      icon: "🚀",
    },
    { id: "skills", label: "Skills", type: "section" as const, icon: "🧠" },
    {
      id: "projects",
      label: "Projects",
      type: "section" as const,
      icon: "🪐",
    },
    {
      id: "about",
      label: "About",
      type: "section" as const,
      icon: "👨‍🚀",
    },
    { id: "home", label: "Home", type: "section" as const, icon: "☀️" },
    ...resumeData.experience.map((exp) => ({
      id: exp.id,
      label: exp.navLabel || exp.company,
      type: "moon" as const,
      icon: "🌕",
    })),
  ];

  // RULES
  // -----
  // - On moon visit, freeze only the current system so the camera can lock.
  // - Always capture the pre-visit moon orbit speed so exit can restore the
  //   exact prior state (moving vs. stopped, and original speed).
  // Centralized function to freeze orbital motion (call before ANY moon visit)
  // Defined early to be available for handleAutopilotNavigation
  const freezeOrbitalMotion = (moonMesh: THREE.Mesh) => {
    // Don't freeze if already frozen
    if (frozenOrbitalSpeedsRef.current) {
      vlog("🧊 Orbital motion already frozen - reusing frozen state");
      return;
    }

    const moonItemEntry = itemsRef.current.find((it) => it.mesh === moonMesh);
    if (!moonItemEntry) {
      vlog("⚠️ Could not find moon item entry");
      return;
    }

    vlog(`🧊 Freezing orbital motion for moon visit`);

    // Store the original speeds
    frozenOrbitalSpeedsRef.current = {
      parentPlanetOrbitSpeed: optionsRef.current.spaceOrbitSpeed,
      parentPlanetMoonOrbitSpeed: optionsRef.current.spaceMoonOrbitSpeed,
      moonOrbitSpeed: moonItemEntry.orbitSpeed,
      moonItemEntry: moonItemEntry,
    };

    vlog(
      `   Stored speeds: planet=${frozenOrbitalSpeedsRef.current.parentPlanetOrbitSpeed}, moonOrbit=${frozenOrbitalSpeedsRef.current.parentPlanetMoonOrbitSpeed}, thisMoon=${frozenOrbitalSpeedsRef.current.moonOrbitSpeed}`,
    );

    lastMoonOrbitSpeedRef.current =
      optionsRef.current.spaceMoonOrbitSpeed ?? 0.01;

    if (sceneRef.current.scene) {
      freezeSystemForMoon({
        moonMesh,
        items: itemsRef.current,
        scene: sceneRef.current.scene,
        frozenSystemStateRef,
        showOrbits: optionsRef.current.spaceShowOrbits !== false,
        vlog,
      });
    }

    // Freeze the speeds immediately
    if (onOptionsChange) {
      onOptionsChange({
        ...optionsRef.current,
        spaceMoonOrbitSpeed: 0,
      });
    }

    // Freeze this specific moon's orbit speed
    moonItemEntry.orbitSpeed = 0;

    vlog(`   ✅ All orbital motion frozen`);
  };

  // Autopilot navigation is handled by useNavigationSystem

  // Refs for cosmic systems
  const cameraDirectorRef = useRef<CosmosCameraDirector | null>(null);
  const focusedMoonRef = useRef<THREE.Mesh | null>(null);
  const tourGuideRef = useRef<CosmicTourGuide | null>(null);
  const navigationInterfaceRef = useRef<NavigationInterface | null>(null);
  const tourBuilderRef = useRef<TourDefinitionBuilder | null>(null);
  const planetsDataRef = useRef<Map<string, PlanetData>>(new Map());
  const enterMoonViewRef = useRef<
    | ((params: {
        moonMesh: THREE.Mesh;
        company: any;
        useFlight?: boolean;
      }) => void)
    | null
  >(null);
  const handleNavigationRef = useRef<
    ((target: string) => void | Promise<void>) | null
  >(null);

  // New navigation system refs
  const emitterRef = useRef(getOrbitalPositionEmitter());

  // Private setter for minDistance to make it easier to track where it's being set
  const setMinDistance = (value: number, reason?: string) => {
    if (sceneRef.current.controls) {
      sceneRef.current.controls.minDistance = value;
      if (reason) {
        vlog(`🔧 minDistance set to ${value} (${reason})`);
      }
    }
  };

  // Drag-to-rotate state for focused moon
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  // Track whether OrbitControls is actively being dragged by the user
  const controlsDraggingRef = useRef(false);
  // Store camera distance to focused moon when entering focus; used to detect zoom
  const focusedMoonCameraDistanceRef = useRef<number | null>(null);

  // Store original orbital speeds when focusing on a moon, so we can restore them on exit
  const frozenOrbitalSpeedsRef = useRef<{
    parentPlanetOrbitSpeed?: number;
    parentPlanetMoonOrbitSpeed?: number;
    moonOrbitSpeed?: number;
    moonItemEntry?: any; // Store the moon's item entry for speed restoration
  } | null>(null);
  const frozenSystemStateRef = useRef<FrozenSystemState | null>(null);
  const lastMoonOrbitSpeedRef = useRef<number | null>(null);
  const lastMoonSpinSpeedRef = useRef<number | null>(null);

  const { buildRotationHandlers, buildPointerHandlers } =
    usePointerInteractions({
      mountRef,
      focusedMoonRef,
      isDraggingRef,
      lastPointerRef,
      sceneRef,
    });

  const optionsRef = useCosmosOptions({
    options,
    sceneRef,
    frozenSystemStateRef,
  });

  const {
    currentNavigationTarget,
    navigationDistance,
    navigationETA,
    navTurnActiveRef,
    settledViewTargetRef,
    handleAutopilotNavigation,
    initializeNavigationSystem,
    updateAutopilotNavigation,
    disposeNavigationSystem,
  } = useNavigationSystem({
    resumeData,
    emitterRef,
    spaceshipRef,
    sceneRef,
    followingSpaceshipRef,
    manualFlightModeRef,
    focusedMoonRef,
    exitFocusRequestRef,
    shipCinematicRef,
    insideShipRef,
    missionLog,
    vlog,
    manualFlightRef,
    spaceshipPathRef,
    enterMoonViewRef,
    shipRollOffsetRef,
  });

  const handleExperienceCompanyNavigation = useCallback(
    async (companyId: string) => {
      if (!companyId) return;

      vlog(`🌙 Initiating moon navigation: ${companyId}`);

      // ── Ship-engaged mode → autopilot ──────────────────────────
      // If the user is following the ship (or inside it) and not in
      // manual flight, the ship itself should travel to the moon.
      if (
        (followingSpaceshipRef.current || insideShipRef.current) &&
        !manualFlightModeRef.current
      ) {
        vlog(`🚀 Ship engaged — routing to autopilot navigation`);
        handleAutopilotNavigation(companyId, "moon");
        return;
      }

      // ── Camera-only mode → fly camera directly ────────────────
      const company = resumeData.experience.find(
        (exp) =>
          exp.company.toLowerCase().includes(companyId) || exp.id === companyId,
      );

      if (!company) return;

      let moonMesh: THREE.Mesh | undefined;

      sceneRef.current.scene?.traverse((object) => {
        if (object instanceof THREE.Mesh && object.userData.planetName) {
          const planetName = object.userData.planetName.toLowerCase();
          if (
            planetName.includes(companyId.toLowerCase()) ||
            planetName.includes(company.company.toLowerCase())
          ) {
            moonMesh = object;
          }
        }
      });

      if (!moonMesh) {
        vlog(`⚠️ Moon not found for company: ${companyId}`);
        return;
      }

      vlog(`✅ Moon found: ${company.company} (camera-only flight)`);

      await enterMoonViewRef.current?.({ moonMesh, company, useFlight: true });
    },
    [vlog, handleAutopilotNavigation],
  );

  const handleQuickNav = useCallback(
    (targetId: string, targetType: "section" | "moon") => {
      if (
        (followingSpaceshipRef.current || insideShipRef.current) &&
        !manualFlightModeRef.current
      ) {
        handleAutopilotNavigation(targetId, targetType);
        return;
      }

      const target =
        targetType === "moon" ? `experience-${targetId}` : targetId;

      if (handleNavigationRef.current) {
        handleNavigationRef.current(target);
      }
    },
    [handleAutopilotNavigation],
  );

  // Legacy left-panel hide/show logic removed — old CosmicNavigation
  // interface no longer exists. Navigation is handled by the new game UI.

  const appendSystemStatusLog = useCallback((message: string) => {
    setSystemStatusLogs((prev) => {
      const next = [...prev, message];
      return next.length > 8 ? next.slice(-8) : next;
    });
  }, []);

  const { initializeScene, setGlobalCleanup } = useThreeScene({
    mountRef,
    rendererRef,
    sceneRef,
    optionsRef,
    controlsDraggingRef,
    focusedMoonRef,
    isDraggingRef,
    focusedMoonCameraDistanceRef,
    exitFocusRequestRef,
    zoomExitThresholdRef,
  });

  const { updateOrbitSystem } = useOrbitSystem({
    sceneRef: sceneRef as MutableRefObject<{ camera?: THREE.Camera }>,
    focusedMoonRef,
    spaceshipRef,
    insideShipRef,
    vlog,
  });

  const { startRenderLoop, stopRenderLoop } = useRenderLoop();

  // OWNERSHIP MAP
  // - useThreeScene: scene/camera/renderer lifecycle + cleanup
  // - useCosmosOptions: options sync into scene refs
  // - useCosmosLogs: console + mission logs
  // - useKeyboardControls/usePointerInteractions: input handlers
  // - useOrbitSystem: orbit updates + labels/halo
  // - useNavigationSystem: autopilot navigation + arrival handling
  // - useRenderLoop: animation loop + ship movement
  // - createMoonFocusController: moon enter/exit + overlays

  // ── Ship UI phase detection ──────────────────────────
  // Poll for ship hover state to show initial buttons
  useEffect(() => {
    if (shipUIPhase !== "hidden") return;
    const check = setInterval(() => {
      if (
        shipCinematicRef.current?.active &&
        shipCinematicRef.current.phase === "hover"
      ) {
        setShipUIPhase("initial");
        clearInterval(check);
      }
    }, 500);
    return () => clearInterval(check);
  }, [shipUIPhase]);

  // ── Autonomous ship wander ─────────────────────────
  const startShipWander = useCallback(() => {
    if (shipWanderIntervalRef.current) {
      clearInterval(shipWanderIntervalRef.current);
    }
    const wander = () => {
      const ship = spaceshipRef.current;
      if (!ship) return;
      // If something else took over (user engaged ship), stop
      if (followingSpaceshipRef.current || insideShipRef.current) {
        if (shipWanderIntervalRef.current) {
          clearInterval(shipWanderIntervalRef.current);
          shipWanderIntervalRef.current = null;
        }
        return;
      }

      const startPos = ship.position.clone();
      // Pick a random position within the solar system bounds
      const endPos = new THREE.Vector3(
        (Math.random() - 0.5) * 1200,
        (Math.random() - 0.5) * 400,
        (Math.random() - 0.5) * 1200,
      );
      // Make sure it's reasonably far
      if (endPos.distanceTo(startPos) < 200) {
        endPos.add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 400,
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 400,
          ),
        );
      }

      // Build a gentle bezier curve
      const mid = startPos.clone().lerp(endPos, 0.5);
      const controlPos = mid
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 300,
            (Math.random() - 0.5) * 150,
            (Math.random() - 0.5) * 300,
          ),
        );

      const distance = startPos.distanceTo(endPos);
      const duration = THREE.MathUtils.clamp(
        6000 * (distance / 600),
        5000,
        14000,
      );

      // Compute a facing quaternion toward the end position
      const lookTarget = endPos.clone();
      const tmpObj = new THREE.Object3D();
      tmpObj.position.copy(startPos);
      tmpObj.lookAt(lookTarget);
      const endQuat = tmpObj.quaternion.clone();

      shipCinematicRef.current = {
        active: true,
        phase: "approach",
        startTime: performance.now(),
        duration,
        startPos: startPos.clone(),
        controlPos,
        endPos: endPos.clone(),
        startQuat: ship.quaternion.clone(),
        endQuat,
      };
    };

    // Start first wander immediately
    wander();
    // Then re-wander every 8-15 seconds
    shipWanderIntervalRef.current = setInterval(
      wander,
      8000 + Math.random() * 7000,
    );
  }, []);

  const stopShipWander = useCallback(() => {
    if (shipWanderIntervalRef.current) {
      clearInterval(shipWanderIntervalRef.current);
      shipWanderIntervalRef.current = null;
    }
  }, []);

  // ── Ship control bar handlers ──────────────────────
  const handleUseShip = useCallback(() => {
    stopShipWander();

    // Deactivate cinematic so autopilot/follow can run
    if (shipCinematicRef.current) {
      shipCinematicRef.current.active = false;
    }

    setFollowingSpaceship(true);
    followingSpaceshipRef.current = true;
    setInsideShip(false);
    insideShipRef.current = false;
    setShipViewMode("exterior");
    shipViewModeRef.current = "exterior";
    setShipUIPhase("ship-engaged");

    // Point camera behind and above the ship using the ship's orientation
    if (sceneRef.current.controls && spaceshipRef.current) {
      const cc = sceneRef.current.controls;
      const ship = spaceshipRef.current;
      const followDist = optionsRef.current.spaceFollowDistance ?? 60;

      // Camera behind ship (-Z in ship's local space) and elevated
      const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
      const camPos = ship.position.clone().addScaledVector(behind, followDist);
      camPos.y += 25;
      cc.setLookAt(
        camPos.x, camPos.y, camPos.z,
        ship.position.x, ship.position.y, ship.position.z,
        true,
      );
    }

    vlog("🚀 Ship engaged — 3rd person view");
  }, [stopShipWander, vlog]);

  const handleFreeExplore = useCallback(() => {
    // Disengage from ship
    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    setInsideShip(false);
    insideShipRef.current = false;
    setShipViewMode("exterior");
    shipViewModeRef.current = "exterior";
    setShipUIPhase("free-explore");

    // Start the ship wandering autonomously
    startShipWander();

    vlog("🌌 Free explore — Falcon will roam the universe");
  }, [startShipWander, vlog]);

  const handleLeaveShip = useCallback(() => {
    // Restore camera constraints
    if (sceneRef.current.camera instanceof THREE.PerspectiveCamera) {
      sceneRef.current.camera.near = 0.1;
      sceneRef.current.camera.fov = 45;
      sceneRef.current.camera.updateProjectionMatrix();
    }
    if (sceneRef.current.controls) {
      const cc = sceneRef.current.controls;
      cc.minPolarAngle = 0;
      cc.maxPolarAngle = Math.PI;
      cc.minDistance = 0.01;
      cc.maxDistance = 6000;
    }

    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    setInsideShip(false);
    insideShipRef.current = false;
    setShipViewMode("exterior");
    shipViewModeRef.current = "exterior";
    setShipUIPhase("free-explore");

    // Start ship wandering
    startShipWander();

    vlog("🚪 Left the ship — Falcon roaming freely");
  }, [startShipWander, vlog]);

  const handleSummonFalcon = useCallback(() => {
    stopShipWander();

    const ship = spaceshipRef.current;
    const cam = sceneRef.current.camera;
    if (!ship || !cam) return;

    // Deactivate any active cinematic
    if (shipCinematicRef.current) {
      shipCinematicRef.current.active = false;
    }

    // Position the ship behind the camera and fly it in
    const camDir = new THREE.Vector3();
    cam.getWorldDirection(camDir);
    const behindCamera = cam.position
      .clone()
      .add(camDir.clone().multiplyScalar(-150))
      .add(new THREE.Vector3(0, 30, 0));

    ship.position.copy(behindCamera);

    // Target position in front of camera
    const frontOfCamera = cam.position
      .clone()
      .add(camDir.clone().multiplyScalar(80))
      .add(new THREE.Vector3(0, -5, 0));

    // Face the ship toward the arrival point
    const tmpObj = new THREE.Object3D();
    tmpObj.position.copy(behindCamera);
    tmpObj.lookAt(frontOfCamera);
    ship.quaternion.copy(tmpObj.quaternion);

    const controlPos = behindCamera.clone().lerp(frontOfCamera, 0.5);
    controlPos.y += 20;

    shipCinematicRef.current = {
      active: true,
      phase: "approach",
      startTime: performance.now(),
      duration: 3000,
      startPos: behindCamera.clone(),
      controlPos,
      endPos: frontOfCamera.clone(),
      startQuat: ship.quaternion.clone(),
      endQuat: tmpObj.quaternion.clone(),
    };

    // After 3 seconds, auto-engage 3rd person
    setTimeout(() => {
      handleUseShip();
    }, 3200);

    vlog("🦅 Summoning Falcon...");
  }, [stopShipWander, handleUseShip, vlog]);

  // ── Cockpit destination navigation ─────────────────
  const handleCockpitNavigate = useCallback(
    (targetId: string, targetType: "section" | "moon") => {
      vlog(`🎯 Cockpit nav → ${targetType}: ${targetId}`);
      if (targetType === "moon") {
        handleExperienceCompanyNavigation(targetId);
      } else {
        handleAutopilotNavigation(targetId, "section");
      }
    },
    [handleExperienceCompanyNavigation, handleAutopilotNavigation, vlog],
  );

  const handleShipViewChange = useCallback(
    (view: ShipView) => {
      if (view === "exterior") {
        // Go to 3rd person
        setInsideShip(false);
        insideShipRef.current = false;
        setShipViewMode("exterior");
        shipViewModeRef.current = "exterior";

        // Restore camera constraints
        if (sceneRef.current.camera instanceof THREE.PerspectiveCamera) {
          sceneRef.current.camera.near = 0.1;
          sceneRef.current.camera.fov = 45;
          sceneRef.current.camera.updateProjectionMatrix();
        }
        if (sceneRef.current.controls) {
          const cc = sceneRef.current.controls;
          cc.minPolarAngle = 0;
          cc.maxPolarAngle = Math.PI;
          cc.minDistance = 5;
          cc.maxDistance = 6000;
        }

        // Reposition camera behind and above the ship using its orientation
        if (sceneRef.current.controls && spaceshipRef.current) {
          const cc = sceneRef.current.controls;
          const ship = spaceshipRef.current;
          const followDist = optionsRef.current.spaceFollowDistance ?? 60;
          const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
          const camPos = ship.position.clone().addScaledVector(behind, followDist);
          camPos.y += 25;
          cc.setLookAt(
            camPos.x, camPos.y, camPos.z,
            ship.position.x, ship.position.y, ship.position.z,
            true,
          );
        }

        // Re-enable depth-of-field if there's a focused moon
        if (focusedMoonRef.current && sceneRef.current.bokehPass) {
          (sceneRef.current.bokehPass as { enabled: boolean }).enabled = true;
        }

        vlog("🎥 3rd person view");
      } else if (view === "interior") {
        // Go to cabin
        if (!followingSpaceship) {
          setFollowingSpaceship(true);
          followingSpaceshipRef.current = true;
        }
        setInsideShip(true);
        insideShipRef.current = true;
        setShipViewMode("interior");
        shipViewModeRef.current = "interior";

        if (
          spaceshipRef.current &&
          sceneRef.current.camera &&
          sceneRef.current.controls
        ) {
          const ship = spaceshipRef.current;
          const shipWorldPos = new THREE.Vector3();
          const shipWorldQuat = new THREE.Quaternion();
          ship.getWorldPosition(shipWorldPos);
          ship.getWorldQuaternion(shipWorldQuat);

          const shipScale = ship.scale.x;
          const cabinWorldPos = new THREE.Vector3(0, -0.64, -4.49)
            .multiplyScalar(shipScale)
            .applyQuaternion(shipWorldQuat)
            .add(shipWorldPos);
          const cabinLookTarget = new THREE.Vector3(0, -0.64, 1.51)
            .multiplyScalar(shipScale)
            .applyQuaternion(shipWorldQuat)
            .add(shipWorldPos);

          if (sceneRef.current.camera instanceof THREE.PerspectiveCamera) {
            sceneRef.current.camera.fov = 45;
            sceneRef.current.camera.updateProjectionMatrix();
          }

          sceneRef.current.controls.setLookAt(
            cabinWorldPos.x,
            cabinWorldPos.y,
            cabinWorldPos.z,
            cabinLookTarget.x,
            cabinLookTarget.y,
            cabinLookTarget.z,
            false,
          );
        }

        vlog("🪟 Cabin view");
      } else if (view === "cockpit") {
        // Go to cockpit
        if (!followingSpaceship) {
          setFollowingSpaceship(true);
          followingSpaceshipRef.current = true;
        }
        setInsideShip(true);
        insideShipRef.current = true;
        setShipViewMode("cockpit");
        shipViewModeRef.current = "cockpit";

        if (
          spaceshipRef.current &&
          sceneRef.current.camera &&
          sceneRef.current.controls
        ) {
          const ship = spaceshipRef.current;
          const shipWorldPos = new THREE.Vector3();
          const shipWorldQuat = new THREE.Quaternion();
          ship.getWorldPosition(shipWorldPos);
          ship.getWorldQuaternion(shipWorldQuat);

          const cockpitCamLocal =
            (ship.userData.cockpitCameraLocal as THREE.Vector3) ??
            new THREE.Vector3(-6.05, 3.16, 5.36);
          const cockpitLookLocal =
            (ship.userData.cockpitLookLocal as THREE.Vector3) ??
            new THREE.Vector3(-6.05, 3.16, 11.36);

          const shipScale = ship.scale.x;
          const cockpitWorldPos = cockpitCamLocal
            .clone()
            .multiplyScalar(shipScale)
            .applyQuaternion(shipWorldQuat)
            .add(shipWorldPos);
          const windowTarget = cockpitLookLocal
            .clone()
            .multiplyScalar(shipScale)
            .applyQuaternion(shipWorldQuat)
            .add(shipWorldPos);

          if (sceneRef.current.camera instanceof THREE.PerspectiveCamera) {
            sceneRef.current.camera.near = 0.01;
            sceneRef.current.camera.fov = 45;
            sceneRef.current.camera.updateProjectionMatrix();
          }

          sceneRef.current.controls.setLookAt(
            cockpitWorldPos.x,
            cockpitWorldPos.y,
            cockpitWorldPos.z,
            windowTarget.x,
            windowTarget.y,
            windowTarget.z,
            false,
          );
        }

        vlog("✈️ Cockpit view");
      }
    },
    [followingSpaceship, vlog],
  );

  // ── Roll (bank) control handlers ────────────────────
  const handleRollStart = useCallback(
    (direction: -1 | 1) => {
      rollInputRef.current = direction;
    },
    [],
  );

  const handleRollStop = useCallback(() => {
    rollInputRef.current = 0;
    // Snap display to final value
    setDisplayRollAngle(shipRollOffsetRef.current);
  }, []);

  // Poll roll angle for display while rolling
  useEffect(() => {
    let raf: number;
    const poll = () => {
      if (rollInputRef.current !== 0) {
        setDisplayRollAngle(shipRollOffsetRef.current);
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── FOV zoom when inside ship (scroll wheel) ──────
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!insideShipRef.current) return;
      const cam = sceneRef.current.camera;
      if (!(cam instanceof THREE.PerspectiveCamera)) return;

      e.preventDefault();
      const delta = e.deltaY > 0 ? 2 : -2;
      cam.fov = THREE.MathUtils.clamp(cam.fov + delta, 20, 90);
      cam.updateProjectionMatrix();
    };

    const mount = mountRef.current;
    if (mount) {
      mount.addEventListener("wheel", handleWheel, { passive: false });
    }
    return () => {
      if (mount) {
        mount.removeEventListener("wheel", handleWheel);
      }
    };
  }, []);

  // ── Shift+drag steering when inside ship ────────────
  // Shift+drag turns the ship in the drag direction (yaw/pitch).
  // The render loop applies the rotation to the ship quaternion and
  // adds forward thrust so the ship moves toward where you steer.
  useEffect(() => {
    const STEER_SENSITIVITY = 0.003;

    const onPointerDown = (e: PointerEvent) => {
      if (!insideShipRef.current || !e.shiftKey) return;
      cockpitSteerActiveRef.current = true;
      cockpitSteerStartRef.current = { x: e.clientX, y: e.clientY };
      cockpitSteerRef.current.set(0, 0);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!cockpitSteerActiveRef.current || !cockpitSteerStartRef.current)
        return;
      // dx → yaw (left/right), dy → pitch (up/down)
      const dx =
        (e.clientX - cockpitSteerStartRef.current.x) * STEER_SENSITIVITY;
      const dy =
        (e.clientY - cockpitSteerStartRef.current.y) * STEER_SENSITIVITY;
      cockpitSteerRef.current.set(
        THREE.MathUtils.clamp(-dx, -1, 1), // yaw: drag-right → turn right (negative yaw)
        THREE.MathUtils.clamp(-dy, -1, 1), // pitch: drag-down → pitch down
      );
    };
    const onPointerUp = () => {
      cockpitSteerActiveRef.current = false;
      cockpitSteerStartRef.current = null;
      cockpitSteerRef.current.set(0, 0);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  // Update spaceship exterior lights
  useEffect(() => {
    debugShipLabelRef.current = debugShipLabel;
  }, [debugShipLabel]);

  useEffect(() => {
    debugShipLabelModeRef.current = debugShipLabelMode;
  }, [debugShipLabelMode]);

  useEffect(() => {
    debugShipLabelsRef.current = debugShipLabels;
  }, [debugShipLabels]);

  const getRandomEndPosNearPlanets = useCallback(() => {
    const camera = sceneRef.current.camera as
      | THREE.PerspectiveCamera
      | undefined;
    const cameraPos = camera?.position.clone() ?? new THREE.Vector3();
    const cameraDir = new THREE.Vector3(0, 0, 1);
    if (camera) {
      camera.getWorldDirection(cameraDir);
    }
    const cameraUp =
      camera?.up.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
    const cameraRight = new THREE.Vector3()
      .crossVectors(cameraDir, cameraUp)
      .normalize();

    const targets: Array<{ pos: THREE.Vector3; radius: number }> = [];
    const exp = planetsDataRef.current.get("experience")?.position;
    const skills = planetsDataRef.current.get("skills")?.position;
    const projects = planetsDataRef.current.get("projects")?.position;
    if (exp) targets.push({ pos: exp.clone(), radius: 320 });
    if (skills) targets.push({ pos: skills.clone(), radius: 360 });
    if (projects) targets.push({ pos: projects.clone(), radius: 340 });
    // Sun is centered at origin; keep a tighter band so it's in view.
    targets.push({ pos: new THREE.Vector3(0, 0, 0), radius: 260 });

    if (targets.length === 0) {
      return new THREE.Vector3(
        (Math.random() - 0.5) * 1600,
        (Math.random() - 0.5) * 800,
        (Math.random() - 0.5) * 1600,
      );
    }

    const pick = targets[Math.floor(Math.random() * targets.length)];
    const inViewThreshold = 0.25;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const radius = pick.radius * (0.55 + Math.random() * 0.75);
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * radius,
        (Math.random() - 0.5) * (radius * 0.6),
        (Math.random() - 0.5) * radius,
      );
      const candidate = pick.pos.clone().add(offset);
      if (!camera) return candidate;

      const toCandidate = candidate.clone().sub(cameraPos).normalize();
      if (toCandidate.dot(cameraDir) > inViewThreshold) {
        return candidate;
      }
    }

    const forwardDistance = 700 + Math.random() * 700;
    const spread = 320 + Math.random() * 180;
    const fallback = cameraPos
      .clone()
      .add(cameraDir.clone().multiplyScalar(forwardDistance))
      .add(cameraRight.clone().multiplyScalar((Math.random() - 0.5) * spread))
      .add(
        cameraUp.clone().multiplyScalar((Math.random() - 0.5) * spread * 0.5),
      );

    return fallback.clone().lerp(pick.pos, 0.35);
  }, []);

  const resetShipLabels = useCallback(() => {
    if (!spaceshipRef.current) return;
    spaceshipRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        delete object.userData.debugSide;
      }
    });
    setDebugShipLabels({});
    debugShipLabelMarksRef.current = {};
    debugShipLabelMarkersRef.current.forEach((marker) => {
      marker.parent?.remove(marker);
      marker.geometry.dispose();
      if (Array.isArray(marker.material)) {
        marker.material.forEach((mat) => mat.dispose());
      } else {
        marker.material.dispose();
      }
    });
    debugShipLabelMarkersRef.current = [];
    if (debugHitMarkerRef.current) {
      debugHitMarkerRef.current.visible = false;
    }
  }, []);

  useEffect(() => {
    if (spaceshipLightsRef.current.length > 0) {
      spaceshipLightsRef.current.forEach((light) => {
        light.intensity = shipExteriorLights ? 1.5 : 0;
      });
    }
  }, [shipExteriorLights]);

  // Update spaceship interior lights
  useEffect(() => {
    if (spaceshipInteriorLightsRef.current.length > 0) {
      spaceshipInteriorLightsRef.current.forEach((light) => {
        light.intensity = shipInteriorLights ? 2 : 0;
      });
    }
  }, [shipInteriorLights]);

  useKeyboardControls({
    enabled: manualFlightMode,
    keyboardStateRef: keyboardStateRef as MutableRefObject<
      Record<string, boolean>
    >,
    setKeyboardUpdateTrigger,
  });

  useEffect(() => {
    const sceneSetup = initializeScene();
    if (!sceneSetup) return;

    const {
      scene,
      camera,
      renderer,
      controls,
      composer,
      labelRenderer,
      container,
      preventDefaultTouch,
    } = sceneSetup;

    // Create sprite materials/textures for halo layers
    const auroraTexture = createAuroraHaloTexture();
    auroraTexture.minFilter = THREE.LinearFilter;
    auroraTexture.magFilter = THREE.LinearFilter;

    const ringTexture = createRingHaloTexture();
    ringTexture.minFilter = THREE.LinearFilter;
    ringTexture.magFilter = THREE.LinearFilter;

    const coreTexture = createCoreHaloTexture();

    // clickable overlay registry (planes that should be raycast-targeted)
    const overlayClickables: THREE.Object3D[] = [];

    // (attachDetailOverlay removed — replaced by attachMultiNoteOverlays)
    const attachMultiNoteOverlays = attachMultiNoteOverlaysFactory({
      scene,
      overlayClickables,
      createDetailTexture,
      vlog,
    });
    // --- TEXTURES ---
    const textureLoader = new THREE.TextureLoader();

    const { starfield, skyfield } = createStarfieldMeshes(textureLoader);
    scene.add(starfield);
    scene.add(skyfield);

    // --- LIGHTING ---
    const { ambientLight, sunLight, fillLight } = createLighting(
      optionsRef.current,
    );
    scene.add(ambientLight);
    scene.add(sunLight);
    scene.add(fillLight);
    sceneRef.current.sunLight = sunLight;

    const { sunMesh, sunMaterial } = createSunMesh(textureLoader);
    scene.add(sunMesh);
    sceneRef.current.sunMaterial = sunMaterial;

    // Hologram Drone display
    hologramDroneRef.current = new HologramDroneDisplay(scene);

    // --- OBJECTS ---
    const items: OrbitItem[] = [];

    const orbitAnchors: OrbitAnchor[] = [];

    // Update items ref so it's accessible outside useFrame
    itemsRef.current = items;
    // clickable planet registry (used for raycasting planet clicks)
    const clickablePlanets: THREE.Object3D[] = [];

    // Sun Glow (Procedural Texture)
    const glowTexture = createSunGlowTexture();

    const spriteMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffaa00,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(180, 180, 1);
    sunMesh.add(sprite);
    sceneRef.current.sunGlowMaterial = spriteMaterial;

    // Sun Labels (Restored)
    const sunLabel = createLabel(
      resumeData.personal.name,
      resumeData.personal.title,
    );
    sunLabel.position.set(0, 50, 0);
    sunMesh.add(sunLabel);

    // 2. HELPER: Create Planet
    const createPlanet = createPlanetFactory({
      scene,
      textureLoader,
      items,
      orbitAnchors,
      clickablePlanets,
      auroraTexture,
      ringTexture,
      coreTexture,
    });

    // 3. PLANETS (Sections)
    const expPlanet = createPlanet(
      "Experience",
      600,
      15,
      0xff5533,
      scene,
      0.0002,
      1,
      "/textures/mars.jpg",
    );

    const skillsPlanet = createPlanet(
      "Skills",
      1000,
      20,
      0x3388ff,
      scene,
      0.00015,
      2,
      "/textures/earth.jpg",
    );

    const projectsPlanet = createPlanet(
      "Projects",
      900,
      18,
      0x9933ff,
      scene,
      0.0001,
      3,
      "/textures/jupiter.jpg",
    );
    createPlanet(
      "Scrolling Resume",
      40,
      5,
      0xcc99ff,
      projectsPlanet,
      0.003,
      undefined,
      "/textures/neptune.jpg",
    );

    // 4. MOONS
    const experienceJobs = Object.values(resumeData.experience).flat();
    const experienceCount = experienceJobs.length || 1;
    const experienceStartOffset = Math.PI * 0.15;

    experienceJobs.forEach((job, i) => {
      // Determine texture based on job ID
      let textureUrl: string | undefined;
      if (job.id === "investcloud") {
        textureUrl = "/textures/custom-planet-textures/texture1.jpg";
      } else if (job.id === "boingo") {
        textureUrl = "/textures/custom-planet-textures/texture3.jpg";
      } else if (job.id === "rpa") {
        textureUrl = "/textures/custom-planet-textures/texture4-rpa.jpg";
      }

      // Job moons should be clickable with section index 2+i
      // (section 0 = hero+summary, section 1 = skills, sections 2+ = jobs)
      const moonMesh = createPlanet(
        job.company,
        60 + i * 20,
        5,
        0xffaadd,
        expPlanet,
        0.002 + Math.random() * 0.001,
        2 + i, // Make job moons clickable with correct section index
        textureUrl,
        experienceStartOffset + (i * Math.PI * 2) / experienceCount,
      );

      // Register moon with position emitter for tracking
      const moonId = `moon-${job.id}`;
      moonMesh.userData.moonId = moonId;
      emitterRef.current.registerObject(moonId, moonMesh, 16); // 60fps updates

      // Remove the rotation that might be causing visual issues
      // moon.rotation.x = Math.PI / 2;
    });

    const skillCategories = Object.keys(resumeData.skills);
    const skillsCount = skillCategories.length || 1;
    const skillsStartOffset = Math.PI * 0.35;

    skillCategories.forEach((cat, i) => {
      createPlanet(
        cat,
        70 + i * 15,
        6,
        0xaaddff,
        skillsPlanet,
        0.0015 + Math.random() * 0.001,
        undefined,
        undefined,
        skillsStartOffset + (i * Math.PI * 2) / skillsCount,
      );
    });

    // Enhanced point-based starfield for deep space effect
    const starField = createStarField();
    scene.add(starField);

    // --- SPACESHIP LOADING ---
    const loader = new GLTFLoader();
    loader.load(
      "/models/spaceship/scene.gltf",
      (gltf) => {
        const spaceship = gltf.scene;

        // Scale down the spaceship to be tiny compared to planets
        spaceship.scale.set(0.5, 0.5, 0.5);

        // Align model forward axis (model front is +Z; navigation lookAt uses -Z)
        spaceship.userData.forwardOffset = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, Math.PI, 0),
        );

        // Position it initially near the sun
        spaceship.position.set(50, 20, 50);

        // Add a subtle point light to the spaceship for visibility
        const shipLight = new THREE.PointLight(0x6699ff, 0.5, 50);
        spaceship.add(shipLight);

        // Create exterior lights (initially off)
        const exteriorLights: THREE.PointLight[] = [];
        const lightPositions = [
          // Top lights
          new THREE.Vector3(0, 2, 0), // Top center
          new THREE.Vector3(2, 1.5, 2), // Top front right
          new THREE.Vector3(-2, 1.5, 2), // Top front left
          new THREE.Vector3(2, 1.5, -2), // Top back right
          new THREE.Vector3(-2, 1.5, -2), // Top back left
          // Bottom lights
          new THREE.Vector3(0, -2, 0), // Bottom center
          new THREE.Vector3(2, -1.5, 2), // Bottom front right
          new THREE.Vector3(-2, -1.5, 2), // Bottom front left
          new THREE.Vector3(2, -1.5, -2), // Bottom back right
          new THREE.Vector3(-2, -1.5, -2), // Bottom back left
          // Side lights
          new THREE.Vector3(3, 0, 0), // Right side
          new THREE.Vector3(-3, 0, 0), // Left side
        ];

        lightPositions.forEach((pos) => {
          const light = new THREE.PointLight(0xffffff, 0, 15);
          light.position.copy(pos);
          spaceship.add(light);
          exteriorLights.push(light);
        });

        spaceshipLightsRef.current = exteriorLights;

        // Create dedicated engine light for boost effects
        const engineLight = new THREE.PointLight(0x6699ff, 0.8, 220);
        engineLight.position.set(0, 0, -4); // Back of ship
        spaceship.add(engineLight);
        spaceshipEngineLightRef.current = engineLight;

        // Create interior lights (for cabin and cockpit)
        const interiorLights: THREE.PointLight[] = [];
        const interiorLightPositions = [
          new THREE.Vector3(0, 0.8, 0), // Center ceiling light
          new THREE.Vector3(1.5, 0.5, 1), // Cabin area (right front)
          new THREE.Vector3(0, 0.6, 3.5), // Cockpit area
          new THREE.Vector3(-1, 0.5, 0), // Left side
          new THREE.Vector3(1, 0.5, 0), // Right side
        ];

        interiorLightPositions.forEach((pos) => {
          const light = new THREE.PointLight(0xffd9b3, 2, 8); // Warm interior lighting
          light.position.copy(pos);
          spaceship.add(light);
          interiorLights.push(light);
        });

        spaceshipInteriorLightsRef.current = interiorLights;

        scene.add(spaceship);
        spaceshipRef.current = spaceship;
        vlog("🚀 Spaceship loaded - ready for navigation");

        // --- COCKPIT POSITION ---
        // Reference points from the ship-labeling system:
        //   cockpit exterior surface: [-6.20, 3.59, 7.13]  (right side, forward)
        //   right hull edge:          [-6.68, 2.86, 0.00]  (-X is starboard)
        //   front edge:               [-0.01, -0.28, 7.26] (+Z is forward)
        //
        // The cockpit tube protrudes right-forward from the disc.
        // Interior offset from surface: ~0.8 inward (+X), ~0.5 lower (seated
        // eye height), ~1.1 back from windshield (behind pilot chair).
        // NOTE: render loop multiplies these by ship.scale (0.5) during
        //       the local→world transformation.
        const cockpitCamLocal = new THREE.Vector3(-6.05, 3.16, 5.36);
        const cockpitLookLocal = new THREE.Vector3(-6.05, 3.16, 11.36); // forward through window
        spaceship.userData.cockpitCameraLocal = cockpitCamLocal;
        spaceship.userData.cockpitLookLocal = cockpitLookLocal;
        vlog(`✈️ Cockpit interior position: camera [${cockpitCamLocal.x.toFixed(1)}, ${cockpitCamLocal.y.toFixed(1)}, ${cockpitCamLocal.z.toFixed(1)}], look [${cockpitLookLocal.x.toFixed(1)}, ${cockpitLookLocal.y.toFixed(1)}, ${cockpitLookLocal.z.toFixed(1)}]`);

        // Initialize navigation system
        initializeNavigationSystem(spaceship, scene);
      },
      undefined,
      () => {
        vlog("❌ Failed to load spaceship model");
      },
    );

    // --- INTERACTION ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const debugHitMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffff66,
        emissive: 0xffee88,
        emissiveIntensity: 1.2,
      }),
    );
    debugHitMarker.visible = false;
    scene.add(debugHitMarker);
    debugHitMarkerRef.current = debugHitMarker;

    const { onPointerDownRotate, onPointerMoveRotate, onPointerUpRotate } =
      buildRotationHandlers({ raycaster, pointer, camera });

    const enableMoonDepthOfField = (moonMesh: THREE.Mesh) => {
      const bokehPass = sceneRef.current.bokehPass as
        | {
            enabled: boolean;
            materialBokeh?: { uniforms?: { focus?: { value: number } } };
          }
        | undefined;
      if (!bokehPass) return;
      bokehPass.enabled = true;
      const moonWorld = new THREE.Vector3();
      moonMesh.getWorldPosition(moonWorld);
      const focusDistance = camera.position.distanceTo(moonWorld);
      if (bokehPass.materialBokeh?.uniforms?.focus) {
        bokehPass.materialBokeh.uniforms.focus.value = focusDistance;
      }
    };

    const disableMoonDepthOfField = () => {
      const bokehPass = sceneRef.current.bokehPass as
        | {
            enabled: boolean;
          }
        | undefined;
      if (bokehPass) {
        bokehPass.enabled = false;
      }
    };

    const { enterMoonView, exitMoonView } = createMoonFocusController({
      scene,
      items,
      overlayClickables,
      attachMultiNoteOverlays,
      setContentLoading,
      setOverlayContent,
      vlog,
      sceneRef,
      focusedMoonRef,
      focusedMoonCameraDistanceRef,
      frozenOrbitalSpeedsRef,
      frozenSystemStateRef,
      optionsRef,
      onOptionsChange,
      isDraggingRef,
      cameraDirectorRef,
      setMinDistance,
      freezeOrbitalMotion,
      lastMoonOrbitSpeedRef,
      lastMoonSpinSpeedRef,
      onMoonViewStart: enableMoonDepthOfField,
      onMoonViewEnd: disableMoonDepthOfField,
    });

    // Wrap enterMoonView so that when arriving via ship navigation
    // (useFlight: false) in 3rd-person exterior mode, the camera is
    // gently repositioned behind the ship for a good view of the moon.
    // The user's current view mode (cockpit, cabin, exterior) is preserved.
    enterMoonViewRef.current = async (params) => {
      // Reposition camera in exterior follow mode for a clean arrival view
      if (
        !params.useFlight &&
        !insideShipRef.current &&
        followingSpaceshipRef.current &&
        sceneRef.current.controls &&
        spaceshipRef.current
      ) {
        const cc = sceneRef.current.controls;
        const ship = spaceshipRef.current;
        const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(
          ship.quaternion,
        );
        const camPos = ship.position.clone().addScaledVector(behind, 50);
        camPos.y += 20;
        cc.setLookAt(
          camPos.x, camPos.y, camPos.z,
          ship.position.x, ship.position.y, ship.position.z,
          true,
        );
      }

      await enterMoonView(params);

      // When arriving via ship navigation, the camera is being
      // repositioned programmatically (setLookAt, moveTo). These
      // moves fire camera-controls "update" events which would
      // trip the zoom-exit handler (distance change > threshold).
      // Suppress zoom-exit detection for a settling period by
      // nulling the baseline — the handler falls back to
      // `base = currentDist`, making diff = 0.
      if (!params.useFlight) {
        focusedMoonCameraDistanceRef.current = null;
        setTimeout(() => {
          if (focusedMoonRef.current && sceneRef.current.camera) {
            const mw = new THREE.Vector3();
            focusedMoonRef.current.getWorldPosition(mw);
            focusedMoonCameraDistanceRef.current =
              sceneRef.current.camera.position.distanceTo(mw);
          }
        }, 2500);
      }
    };

    // freezeOrbitalMotion moved earlier in the file to avoid hoisting issues

    // --- COSMIC SYSTEMS INITIALIZATION ---
    // Initialize camera director for cinematic movements
    cameraDirectorRef.current = new CosmosCameraDirector(camera, controls);

    // Initialize tour builder
    tourBuilderRef.current = new TourDefinitionBuilder();

    // Register planet data for tours
    const registerPlanetData = () => {
      // Register Experience Planet
      const expPlanetData: PlanetData = {
        name: "Experience",
        position: expPlanet.position.clone(),
        data: resumeData.experience,
        moons: Object.values(resumeData.experience)
          .flat()
          .map((job, index) => ({
            name: job.company,
            position: new THREE.Vector3(
              expPlanet.position.x + (60 + index * 20) * Math.cos(index * 0.8),
              expPlanet.position.y + (index % 2 === 0 ? 10 : -10),
              expPlanet.position.z + (60 + index * 20) * Math.sin(index * 0.8),
            ),
            data: job,
          })),
      };

      // Register Skills Planet
      const skillsPlanetData: PlanetData = {
        name: "Skills",
        position: skillsPlanet.position.clone(),
        data: resumeData.skills,
        moons: Object.keys(resumeData.skills).map((category, index) => ({
          name: category,
          position: new THREE.Vector3(
            skillsPlanet.position.x + (70 + index * 15) * Math.cos(index * 1.2),
            skillsPlanet.position.y + (index % 2 === 0 ? 15 : -15),
            skillsPlanet.position.z + (70 + index * 15) * Math.sin(index * 1.2),
          ),
          data: (resumeData.skills as any)[category],
        })),
      };

      // Register Projects Planet
      const projectsPlanetData: PlanetData = {
        name: "Projects",
        position: projectsPlanet.position.clone(),
        data: {
          name: "Projects",
          description: "Creative projects and innovations",
        },
      };

      tourBuilderRef.current?.registerPlanet("experience", expPlanetData);
      tourBuilderRef.current?.registerPlanet("skills", skillsPlanetData);
      tourBuilderRef.current?.registerPlanet("projects", projectsPlanetData);

      planetsDataRef.current.set("experience", expPlanetData);
      planetsDataRef.current.set("skills", skillsPlanetData);
      planetsDataRef.current.set("projects", projectsPlanetData);
    };

    registerPlanetData();

    // ── CAMERA DEBUG TOOL ──────────────────────────────────────────
    // Exposes window.__captureViewpoint(planetName?) to log the
    // current camera position, angle, and distance relative to a
    // planet.  The user can then communicate exact viewpoint data.
    // Press Shift+F8 in the browser as a shortcut.
    (window as any).__captureViewpoint = (planetName?: string) => {
      const cam = sceneRef.current.camera;
      const cc = sceneRef.current.controls;
      if (!cam) {
        console.log("❌ No camera available");
        return;
      }

      const camPos = cam.position.clone();
      const orbitTarget = new THREE.Vector3();
      if (cc) (cc as any).getTarget(orbitTarget);

      // Gather all planets
      const planets: Array<{
        name: string;
        worldPos: THREE.Vector3;
        radius: number;
      }> = [];
      sceneRef.current.scene?.traverse((obj: any) => {
        if (obj.isMesh && obj.userData?.sectionId) {
          const wp = new THREE.Vector3();
          obj.getWorldPosition(wp);
          const geo = obj.geometry;
          const r =
            geo?.parameters?.radius ??
            (geo?.boundingSphere
              ? (geo.computeBoundingSphere(), geo.boundingSphere?.radius ?? 10)
              : 10);
          planets.push({ name: obj.userData.sectionId, worldPos: wp, radius: r });
        }
      });

      // If planetName provided, filter to it
      let targets = planets;
      if (planetName) {
        targets = planets.filter(
          (p) => p.name.toLowerCase() === planetName.toLowerCase(),
        );
      }

      console.log("═══════════════════════════════════════");
      console.log("📷 CAMERA VIEWPOINT CAPTURE");
      console.log("═══════════════════════════════════════");
      console.log(
        `Camera position: { x: ${camPos.x.toFixed(1)}, y: ${camPos.y.toFixed(1)}, z: ${camPos.z.toFixed(1)} }`,
      );
      console.log(
        `Orbit target:    { x: ${orbitTarget.x.toFixed(1)}, y: ${orbitTarget.y.toFixed(1)}, z: ${orbitTarget.z.toFixed(1)} }`,
      );

      if (targets.length === 0 && planets.length > 0) {
        // If no sectionId found, try planetName userData
        sceneRef.current.scene?.traverse((obj: any) => {
          if (obj.isMesh && obj.userData?.planetName) {
            const wp = new THREE.Vector3();
            obj.getWorldPosition(wp);
            const geo = obj.geometry;
            const r = geo?.parameters?.radius ?? 10;
            const pn = obj.userData.planetName as string;
            if (
              !planetName ||
              pn.toLowerCase().includes(planetName.toLowerCase())
            ) {
              targets.push({ name: pn, worldPos: wp, radius: r });
            }
          }
        });
      }

      // Also check planetsDataRef
      if (targets.length === 0) {
        planetsDataRef.current.forEach((data, key) => {
          if (!planetName || key.toLowerCase().includes(planetName.toLowerCase())) {
            targets.push({
              name: key,
              worldPos: data.position.clone(),
              radius: (data as any).radius ?? 20,
            });
          }
        });
      }

      for (const planet of targets) {
        const offset = camPos.clone().sub(planet.worldPos);
        const dist = camPos.distanceTo(planet.worldPos);
        // Compute spherical angles relative to the planet
        const theta = Math.atan2(offset.x, offset.z) * (180 / Math.PI); // azimuth
        const phi =
          Math.asin(
            Math.min(1, Math.max(-1, offset.y / Math.max(dist, 0.001))),
          ) * (180 / Math.PI); // elevation

        console.log(`\n🪐 Planet: ${planet.name}`);
        console.log(
          `   Planet world pos: { x: ${planet.worldPos.x.toFixed(1)}, y: ${planet.worldPos.y.toFixed(1)}, z: ${planet.worldPos.z.toFixed(1)} }`,
        );
        console.log(`   Planet radius: ${planet.radius.toFixed(1)}`);
        console.log(`   Camera distance: ${dist.toFixed(1)}`);
        console.log(
          `   Camera offset:   { x: ${offset.x.toFixed(1)}, y: ${offset.y.toFixed(1)}, z: ${offset.z.toFixed(1)} }`,
        );
        console.log(`   Azimuth: ${theta.toFixed(1)}°  Elevation: ${phi.toFixed(1)}°`);
        console.log(
          `   Distance / radius: ${(dist / planet.radius).toFixed(1)}x`,
        );

        // Output a copy-pasteable viewpoint object
        console.log(`   📋 Viewpoint data:`);
        console.log(
          `   { offset: { x: ${offset.x.toFixed(1)}, y: ${offset.y.toFixed(1)}, z: ${offset.z.toFixed(1)} }, distance: ${dist.toFixed(1)}, azimuth: ${theta.toFixed(1)}, elevation: ${phi.toFixed(1)} }`,
        );
      }

      if (targets.length === 0) {
        console.log("\n⚠️ No planets found. Available planet names:");
        planets.forEach((p) => console.log(`   - ${p.name}`));
        console.log("   (Also try: 'experience', 'skills', 'projects')");
      }
      console.log("═══════════════════════════════════════");
    };

    // Keyboard shortcut: Shift+F8 to capture viewpoint
    const handleDebugKey = (e: KeyboardEvent) => {
      if (e.key === "F8" && e.shiftKey) {
        e.preventDefault();
        (window as any).__captureViewpoint();
      }
    };
    window.addEventListener("keydown", handleDebugKey);

    // Initialize tour guide with content display handler
    const handleContentDisplay = (waypoint: NavigationWaypoint) => {
      vlog(`🎬 Tour waypoint: ${waypoint.name}`);
      setTourWaypoint(waypoint.name);
      if (waypoint.narration) {
        vlog(`📖 ${waypoint.narration}`);
      }

      // If this is an experience moon waypoint, delegate to the same
      // experience-company navigation handler so camera travel and
      // right-pane content match an explicit moon click.
      // If this is an experience moon waypoint, finalize focus using the
      // same overlay/attach logic as clicking the moon (Tour already flew).
      if (waypoint.id && waypoint.id.startsWith("experience-moon-")) {
        try {
          const candidate =
            (waypoint.content && (waypoint.content as any).title) ||
            waypoint.name;
          const company = (resumeData.experience as any[]).find((c) => {
            if (!c) return false;
            const lname = (c.company || c.id || "").toLowerCase();
            return candidate
              .toLowerCase()
              .includes(lname.split(" ")[0] || lname);
          });
          if (company) {
            // locate moon mesh
            let moonMesh: THREE.Mesh | undefined;
            sceneRef.current.scene?.traverse((object) => {
              if (object instanceof THREE.Mesh && object.userData.planetName) {
                const pname = object.userData.planetName.toLowerCase();
                if (
                  pname.includes((company.id || "").toLowerCase()) ||
                  pname.includes((company.company || "").toLowerCase())
                ) {
                  moonMesh = object;
                }
              }
            });

            if (moonMesh) {
              setContentLoading(true);
              enterMoonView({ moonMesh, company, useFlight: false });
              return;
            }
          }
        } catch (e) {
          vlog("⚠️ Error finalizing tour waypoint");
        }
      }

      // Default: Show content without overlay blocking the view
      if (waypoint.content) {
        setOverlayContent(waypoint.content);
        setContentLoading(false);
      }
    };

    const handleProgressUpdate = (current: number, total: number) => {
      setTourProgress({ current, total });
    };

    tourGuideRef.current = new CosmicTourGuide(
      cameraDirectorRef.current,
      handleContentDisplay,
      handleProgressUpdate,
    );

    // Initialize navigation interface
    const handleNavigation = async (target: string) => {
      if (!cameraDirectorRef.current) return;

      // If a moon is currently focused, schedule exit so its orbit resumes before navigating
      if (focusedMoonRef.current) {
        exitFocusRequestRef.current = true;
      }

      switch (target) {
        case "home":
          // Stop following spaceship if we were
          if (followingSpaceship) {
            setFollowingSpaceship(false);
            followingSpaceshipRef.current = false;
            if (sceneRef.current.controls)
              sceneRef.current.controls.enabled = true;
          }
          if (startIntroSequenceRef.current) {
            startIntroSequenceRef.current();
          } else {
            await cameraDirectorRef.current.systemOverview();
          }
          break;
        case "about":
          // Follow the spaceship!
          vlog("🚀 About Harma navigation triggered");

          if (spaceshipRef.current) {
            vlog("🚀 Spaceship located, beginning pursuit...");

            // Fly camera to behind the spaceship, then enable follow mode
            const shipPos = spaceshipRef.current.position.clone();
            const shipDirection = new THREE.Vector3();
            spaceshipRef.current.getWorldDirection(shipDirection);
            const behindOffset = shipDirection.multiplyScalar(-60);
            const heightOffset = new THREE.Vector3(0, 20, 0);
            const targetCameraPos = shipPos
              .clone()
              .add(behindOffset)
              .add(heightOffset);

            // Animate camera to behind ship using camera director (no conflict with render loop)
            await cameraDirectorRef.current.flyTo({
              position: targetCameraPos,
              lookAt: shipPos,
              duration: 1.5,
              ease: "power2.inOut",
            });

            // Now enable follow mode - render loop takes over cleanly
            setFollowingSpaceship(true);
            followingSpaceshipRef.current = true;

            if (sceneRef.current.controls) {
              const sp = spaceshipRef.current.position;
              sceneRef.current.controls.setTarget(sp.x, sp.y, sp.z, false);
              sceneRef.current.controls.enabled = true;
            }
            vlog(
              "🎯 Following spaceship engaged - orbit around ship enabled",
            );
          } else {
            // Fallback to sun if spaceship not loaded yet
            await cameraDirectorRef.current.systemOverview();
            vlog("🌌 Navigated to Sun (About) - spaceship not yet loaded");
          }
          // Show About overlay regardless
          const aboutContent: OverlayContent = {
            title: "About Harma Davtian",
            subtitle: "Lead Full Stack Engineer",
            description: resumeData.summary,
            sections: [
              {
                id: "contact",
                title: "Contact Information",
                content: [
                  `📧 ${resumeData.personal.email}`,
                  `📞 ${resumeData.personal.phone}`,
                  `📍 ${resumeData.personal.location}`,
                ],
                type: "text",
              },
              {
                id: "expertise",
                title: "Professional Focus",
                content:
                  "Specializing in full-stack development with a focus on scalable architecture, team leadership, and innovative problem-solving across diverse technology stacks.",
                type: "text",
              },
            ],
            actions: [
              {
                label: "View Experience",
                action: "navigate:experience",
                icon: "🌍",
              },
              {
                label: "Technical Skills",
                action: "navigate:skills",
                icon: "⚡",
              },
              {
                label: "Start Career Tour",
                action: "tour:career-journey",
                icon: "🚀",
              },
            ],
          };
          setOverlayContent(aboutContent);
          setContentLoading(false);
          if (!spaceshipRef.current) {
            // Only restore constraints if we're not following spaceship
            setMinDistance(
              originalMinDistanceRef.current,
              "restore after about",
            );
          }
          break;
        case "experience":
        case "skills":
        case "projects": {
          const planetLabel = target === "experience" ? "🌍 Experience" : target === "skills" ? "⚡ Skills" : "💡 Projects";
          vlog(`${planetLabel} — Traveling to ${target} Planet...`);

          // Ship-engaged → autopilot navigation to the planet
          if (
            (followingSpaceshipRef.current || insideShipRef.current) &&
            !manualFlightModeRef.current
          ) {
            vlog(`🚀 Ship engaged — routing planet travel to autopilot`);
            handleAutopilotNavigation(target, "section");
            break;
          }

          // Camera-only mode — stop following ship and fly camera directly
          if (followingSpaceship) {
            setFollowingSpaceship(false);
            followingSpaceshipRef.current = false;
            if (sceneRef.current.controls)
              sceneRef.current.controls.enabled = true;
          }

          const planetMesh = target === "experience" ? expPlanet : target === "skills" ? skillsPlanet : projectsPlanet;
          const planetDist = target === "experience" ? 300 : target === "skills" ? 350 : 400;
          await cameraDirectorRef.current.focusPlanet(planetMesh, planetDist);
          setMinDistance(
            originalMinDistanceRef.current,
            `restore after ${target}`,
          );
          break;
        }
        default:
          // Handle tour actions
          if (target.startsWith("tour:")) {
            const tourType = target.replace("tour:", "");
            vlog(`🚀 Tour request from navigation: ${tourType}`);

            if (tourBuilderRef.current && tourGuideRef.current) {
              let tour;
              switch (tourType) {
                case "career-journey":
                  tour = tourBuilderRef.current.createCareerJourneyTour();
                  break;
                case "technical-deep-dive":
                  tour = tourBuilderRef.current.createTechnicalDeepDiveTour();
                  break;
                case "leadership-story":
                  tour = tourBuilderRef.current.createLeadershipStoryTour();
                  break;
              }

              if (tour) {
                vlog(
                  `✅ Starting tour: ${tour.title} with ${tour.waypoints.length} waypoints`,
                );
                // Resolve any experience-moon waypoint positions to live moon world positions
                const resolvedWaypoints = tour.waypoints.map((wp) => {
                  try {
                    if (wp.id && wp.id.startsWith("experience-moon-")) {
                      const candidate =
                        (wp.content && (wp.content as any).title) || wp.name;
                      let moonMesh: THREE.Mesh | undefined;
                      sceneRef.current.scene?.traverse((object) => {
                        if (
                          object instanceof THREE.Mesh &&
                          object.userData.planetName
                        ) {
                          const pname = (
                            object.userData.planetName || ""
                          ).toLowerCase();
                          if (
                            candidate &&
                            pname.includes(
                              (candidate || "").toLowerCase().split(" ")[0],
                            )
                          ) {
                            moonMesh = object as THREE.Mesh;
                          }
                        }
                      });

                      if (moonMesh) {
                        const worldPos = new THREE.Vector3();
                        moonMesh.getWorldPosition(worldPos);
                        const offset = new THREE.Vector3(80, 40, 60);
                        return {
                          ...wp,
                          target: {
                            ...wp.target,
                            lookAt: worldPos.clone(),
                            position: worldPos.clone().add(offset),
                          },
                        } as typeof wp;
                      }
                    }
                  } catch (e) {
                    vlog("⚠️ Error resolving waypoint to mesh");
                  }
                  return wp;
                });

                setTourActive(true);
                setOverlayContent(null);
                setContentLoading(false);
                tourGuideRef.current.startTour(resolvedWaypoints);
              } else {
                vlog(`❌ Failed to create tour`);
              }
            } else {
              vlog(`❌ Tour system not initialized`);
            }
          }
          // Handle experience company specific navigation
          else if (target.startsWith("experience-")) {
            const companyId = target.replace("experience-", "");
            await handleExperienceCompanyNavigation(companyId);
          }
          break;
      }
    };

    handleNavigationRef.current = handleNavigation;

    const { onPointerMove, onClick } = buildPointerHandlers({
      camera,
      raycaster,
      pointer,
      clickablePlanets,
      overlayClickables,
      handleNavigation,
      resumeData,
      exitFocusedMoon: exitMoonView,
      vlog,
    });

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("click", onClick);
    // Add rotate handlers
    window.addEventListener("pointerdown", onPointerDownRotate);
    window.addEventListener("pointermove", onPointerMoveRotate);
    window.addEventListener("pointerup", onPointerUpRotate);

    const onDebugPointerMove = (event: PointerEvent) => {
      if (!debugShipLabelModeRef.current || !spaceshipRef.current) {
        if (debugHitMarkerRef.current) {
          debugHitMarkerRef.current.visible = false;
        }
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(
        spaceshipRef.current.children,
        true,
      );
      const hit = hits.find((entry) => entry.object instanceof THREE.Mesh);

      if (!hit || !(hit.object instanceof THREE.Mesh)) {
        if (debugHitMarkerRef.current) {
          debugHitMarkerRef.current.visible = false;
        }
        return;
      }

      if (debugHitMarkerRef.current) {
        debugHitMarkerRef.current.visible = true;
        debugHitMarkerRef.current.position.copy(hit.point);
      }
    };

    const applyDebugLabel = (event: PointerEvent) => {
      if (!debugShipLabelModeRef.current || !spaceshipRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(
        spaceshipRef.current.children,
        true,
      );
      const hit = hits.find((entry) => entry.object instanceof THREE.Mesh);
      if (!hit || !(hit.object instanceof THREE.Mesh)) return;

      event.preventDefault();
      event.stopPropagation();

      const mesh = hit.object as THREE.Mesh;
      const labelColorMap: Record<string, number> = {
        front: 0x00ffcc,
        rear: 0xffaa00,
        left: 0x6699ff,
        right: 0xff66cc,
        top: 0x66ff66,
        bottom: 0xff6666,
        cockpit: 0xc084ff,
      };
      const label = debugShipLabelRef.current;
      const labelColor = labelColorMap[label];
      const ship = spaceshipRef.current;
      if (!ship) return;
      const localPoint = ship.worldToLocal(hit.point.clone());
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 14, 14),
        new THREE.MeshStandardMaterial({
          color: labelColor,
          emissive: labelColor,
          emissiveIntensity: 1.4,
        }),
      );
      marker.position.copy(localPoint);
      marker.userData.debugLabel = label;
      marker.userData.debugLabelTarget = mesh.uuid;
      ship.add(marker);
      debugShipLabelMarkersRef.current.push(marker);

      const mark: ShipLabelMark = {
        label,
        meshName: mesh.name,
        meshUuid: mesh.uuid,
        localPoint: [localPoint.x, localPoint.y, localPoint.z],
      };
      const nextMarks = debugShipLabelMarksRef.current[label]
        ? [...(debugShipLabelMarksRef.current[label] as ShipLabelMark[]), mark]
        : [mark];
      debugShipLabelMarksRef.current = {
        ...debugShipLabelMarksRef.current,
        [label]: nextMarks,
      };
      setDebugShipLabels((prev) => ({
        ...prev,
        [label]: prev[label] || { name: mesh.name, uuid: mesh.uuid },
      }));

      console.log("SHIP_DEBUG_LABEL", {
        label,
        mesh: mesh.name,
        uuid: mesh.uuid,
        localPoint: mark.localPoint,
      });

      if (debugHitMarkerRef.current) {
        const markerMat = debugHitMarkerRef.current
          .material as THREE.MeshStandardMaterial;
        markerMat.color.setHex(labelColor);
        markerMat.emissive.setHex(labelColor);
      }
    };

    const onDebugPointerDown = (event: PointerEvent) => {
      if (!debugShipLabelModeRef.current) return;
      debugPointerDownRef.current = {
        x: event.clientX,
        y: event.clientY,
        t: performance.now(),
      };
    };

    const onDebugPointerUp = (event: PointerEvent) => {
      if (!debugShipLabelModeRef.current) return;
      const start = debugPointerDownRef.current;
      debugPointerDownRef.current = null;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 6) return;
      applyDebugLabel(event);
    };

    const dumpShipLabels = () => {
      if (!spaceshipRef.current) return;
      const ship = spaceshipRef.current;
      const labelEntries = Object.entries(debugShipLabelMarksRef.current);
      const marks: Array<{
        label: ShipLabelTarget;
        mesh: string;
        uuid: string;
        localPoint: [number, number, number];
        worldPoint: [number, number, number];
      }> = [];

      labelEntries.forEach(([label, entries]) => {
        (entries as ShipLabelMark[] | undefined)?.forEach((entry) => {
          const local = new THREE.Vector3(
            entry.localPoint[0],
            entry.localPoint[1],
            entry.localPoint[2],
          );
          const world = ship.localToWorld(local.clone());
          marks.push({
            label: label as ShipLabelTarget,
            mesh: entry.meshName,
            uuid: entry.meshUuid,
            localPoint: entry.localPoint,
            worldPoint: [world.x, world.y, world.z],
          });
        });
      });

      console.log("SHIP_DEBUG_LABELS", marks);
    };

    window.addEventListener("pointermove", onDebugPointerMove);
    window.addEventListener("pointerdown", onDebugPointerDown, true);
    window.addEventListener("pointerup", onDebugPointerUp, true);

    const onDebugLabelKey = (event: KeyboardEvent) => {
      if (event.code === "KeyJ" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        dumpShipLabels();
      }
    };

    window.addEventListener("keydown", onDebugLabelKey, { capture: true });

    // Initialize navigation interface
    if (container) {
      navigationInterfaceRef.current = new NavigationInterface(
        container,
        handleNavigation,
      );
      // Tour guide functionality removed for simplification
      // Populate experience submenu dynamically with all jobs
      try {
        const submenu = container.querySelector(
          ".experience-submenu",
        ) as HTMLElement | null;
        if (submenu) {
          // clear existing static items
          submenu.innerHTML = "";
          resumeData.experience.forEach((company) => {
            const id =
              (company.id as string) ||
              company.company.toLowerCase().replace(/\s+/g, "-");
            const btn = document.createElement("button");
            btn.className = "target-button submenu-item";
            btn.dataset.target = `experience-${id}`;
            btn.dataset.company = company.company;
            btn.textContent = `${company.company}`;
            btn.addEventListener("click", () => {
              // Delegate to handleNavigation so behavior is consistent
              handleNavigation(`experience-${id}`);
            });
            submenu.appendChild(btn);
          });
        }
      } catch (e) {
        vlog("⚠️ Failed to populate experience submenu");
      }
    }

    // --- ANIMATION LOOP ---
    startRenderLoop({
      exitFocusRequestRef,
      exitMoonView,
      spaceshipRef,
      shipCinematicRef,
      shipStagingModeRef,
      shipStagingKeysRef,
      manualFlightModeRef,
      manualFlightRef,
      keyboardStateRef,
      controlSensitivityRef,
      invertControlsRef,
      followingSpaceshipRef,
      sceneRef,
      focusedMoonRef,
      spaceshipEngineLightRef,
      shipViewModeRef,
      insideShipRef,
      debugSnapToShipRef,
      shipExploreModeRef,
      shipExploreKeysRef,
      shipExploreCoordsRef,
      cockpitSteerRef,
      cockpitSteerActiveRef,
      rollInputRef,
      shipRollOffsetRef,
      navTurnActiveRef,
      settledViewTargetRef,
      optionsRef,
      hologramDroneRef,
      updateAutopilotNavigation,
      updateOrbitSystem,
      renderer,
      items,
      orbitAnchors,
      camera,
      controls,
      composer,
      labelRenderer,
      scene,
      sunMesh,
      vlog,
    });

    // Trigger loading complete with camera animation
    const { startIntroSequence, cancelIntroSequence } =
      createIntroSequenceRunner({
        camera,
        controls,
        sceneRef,
        spaceshipRef,
        shipCinematicRef,
        manualFlightModeRef,
        setFollowingSpaceship,
        followingSpaceshipRef,
        setHudVisible: () => {},  // legacy — old HUD panels removed
        setShipExteriorLights,
        sunMesh,
      });

    startIntroSequenceRef.current = startIntroSequence;

    setTimeout(() => {
      setSceneReady(true);

      // Start the orbital position emitter for tracking moving objects
      emitterRef.current.start();

      startIntroSequence();
    }, 100);

    // --- CLEANUP ---
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect =
        mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(
        mountRef.current.clientWidth,
        mountRef.current.clientHeight,
      );
      composer.setSize(
        mountRef.current.clientWidth,
        mountRef.current.clientHeight,
      );
      labelRenderer.setSize(
        mountRef.current.clientWidth,
        mountRef.current.clientHeight,
      );
    };

    window.addEventListener("resize", handleResize);

    const handleCameraSnapshot = () => {
      const currentCamera = sceneRef.current.camera as
        | THREE.PerspectiveCamera
        | undefined;
      const currentControls = sceneRef.current.controls as
        | { target?: THREE.Vector3 }
        | undefined;

      if (!currentCamera || !currentControls?.target) return;

      const snapshot = {
        position: {
          x: currentCamera.position.x,
          y: currentCamera.position.y,
          z: currentCamera.position.z,
        },
        target: {
          x: currentControls.target.x,
          y: currentControls.target.y,
          z: currentControls.target.z,
        },
        rotation: {
          x: currentCamera.rotation.x,
          y: currentCamera.rotation.y,
          z: currentCamera.rotation.z,
        },
        fov: currentCamera.fov,
        zoom: currentCamera.zoom,
        near: currentCamera.near,
        far: currentCamera.far,
      };

      console.log("CAMERA_SNAPSHOT", snapshot);
    };

    const handleSnapshotKey = (event: KeyboardEvent) => {
      if (event.code === "KeyL" && event.shiftKey) {
        handleCameraSnapshot();
      }
    };

    window.addEventListener("keydown", handleSnapshotKey);

    const handleShipSnapshot = () => {
      const ship = spaceshipRef.current;
      if (!ship) return;

      const snapshot = {
        position: {
          x: ship.position.x,
          y: ship.position.y,
          z: ship.position.z,
        },
        rotation: {
          x: ship.rotation.x,
          y: ship.rotation.y,
          z: ship.rotation.z,
        },
        quaternion: {
          x: ship.quaternion.x,
          y: ship.quaternion.y,
          z: ship.quaternion.z,
          w: ship.quaternion.w,
        },
        scale: {
          x: ship.scale.x,
          y: ship.scale.y,
          z: ship.scale.z,
        },
      };

      console.log("SHIP_SNAPSHOT", snapshot);
    };

    const handleShipStagingKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyM" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const next = !shipStagingModeRef.current;
        shipStagingModeRef.current = next;
        if (next) {
          if (shipCinematicRef.current) {
            shipCinematicRef.current.active = false;
          }
          setFollowingSpaceship(false);
          followingSpaceshipRef.current = false;
          setManualFlightMode(false);
          manualFlightModeRef.current = false;
        }

        Object.keys(shipStagingKeysRef.current).forEach((key) => {
          shipStagingKeysRef.current[key] = false;
        });

        console.log(
          `SHIP_STAGING_MODE ${next ? "ENABLED" : "DISABLED"} (WASD/RF move, arrows/QE rotate, Shift for faster).`,
        );
        return;
      }

      if (event.code === "KeyP" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        handleShipSnapshot();
        return;
      }

      if (
        shipStagingModeRef.current &&
        event.code in shipStagingKeysRef.current
      ) {
        event.preventDefault();
        event.stopPropagation();
        shipStagingKeysRef.current[event.code] = true;
      }
    };

    const handleShipStagingKeyUp = (event: KeyboardEvent) => {
      if (
        shipStagingModeRef.current &&
        event.code in shipStagingKeysRef.current
      ) {
        event.preventDefault();
        event.stopPropagation();
        shipStagingKeysRef.current[event.code] = false;
      }
    };

    window.addEventListener("keydown", handleShipStagingKeyDown, {
      capture: true,
    });
    window.addEventListener("keyup", handleShipStagingKeyUp, { capture: true });

    // ─── SHIP EXPLORE MODE ─────────────────────────────────────
    // Ctrl+Shift+` (backtick) toggles explore mode for cockpit identification.
    const handleExploreKeyDown = (e: KeyboardEvent) => {
      // Toggle with Ctrl+Shift+`
      if (e.ctrlKey && e.shiftKey && e.code === "Backquote") {
        e.preventDefault();
        const entering = !shipExploreModeRef.current;
        shipExploreModeRef.current = entering;
        setShipExploreMode(entering);

        if (entering && spaceshipRef.current) {
          // Teleport camera near the ship center
          const ship = spaceshipRef.current;
          const shipPos = new THREE.Vector3();
          ship.getWorldPosition(shipPos);
          if (sceneRef.current.controls) {
            const p = shipPos.clone().add(new THREE.Vector3(0, 1, 3));
            const t = shipPos.clone().add(new THREE.Vector3(0, 0, 5));
            sceneRef.current.controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false);
          }
          vlog("🔍 Ship explore mode ACTIVATED — use WASD to move, mouse to look");
        } else {
          vlog("🔍 Ship explore mode DEACTIVATED");
          // Restore near plane
          if (camera instanceof THREE.PerspectiveCamera) {
            camera.near = 1;
            camera.updateProjectionMatrix();
          }
        }
        return;
      }

      // Track keys while explore mode is active
      if (shipExploreModeRef.current) {
        if (e.code in shipExploreKeysRef.current) {
          shipExploreKeysRef.current[e.code] = true;
        }
      }
    };

    const handleExploreKeyUp = (e: KeyboardEvent) => {
      if (shipExploreModeRef.current) {
        if (e.code in shipExploreKeysRef.current) {
          shipExploreKeysRef.current[e.code] = false;
        }
      }
    };

    window.addEventListener("keydown", handleExploreKeyDown, { capture: true });
    window.addEventListener("keyup", handleExploreKeyUp, { capture: true });

    // Poll explore coords into React state for the overlay (4 Hz is enough)
    const explorePollInterval = setInterval(() => {
      if (shipExploreModeRef.current) {
        setExploreCoords({ ...shipExploreCoordsRef.current });
      }
    }, 250);
    // ─── END SHIP EXPLORE MODE ─────────────────────────────────

    const cleanup = () => {
      stopRenderLoop();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleShipStagingKeyDown, {
        capture: true,
      });
      window.removeEventListener("keyup", handleShipStagingKeyUp, {
        capture: true,
      });
      window.removeEventListener("keydown", handleSnapshotKey);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("pointerdown", onPointerDownRotate);
      window.removeEventListener("pointermove", onPointerMoveRotate);
      window.removeEventListener("pointerup", onPointerUpRotate);
      window.removeEventListener("pointermove", onDebugPointerMove);
      window.removeEventListener("pointerdown", onDebugPointerDown, true);
      window.removeEventListener("pointerup", onDebugPointerUp, true);
      window.removeEventListener("keydown", onDebugLabelKey, { capture: true });
      window.removeEventListener("keydown", handleExploreKeyDown, { capture: true });
      window.removeEventListener("keyup", handleExploreKeyUp, { capture: true });
      clearInterval(explorePollInterval);

      cancelIntroSequence();

      // Stop orbital position emitter
      emitterRef.current.stop();

      // Cleanup navigation system
      disposeNavigationSystem();

      // Cleanup hologram drone
      if (hologramDroneRef.current) {
        hologramDroneRef.current.dispose();
        hologramDroneRef.current = null;
      }

      // Remove touch event listeners
      renderer.domElement.removeEventListener(
        "touchstart",
        preventDefaultTouch,
      );
      renderer.domElement.removeEventListener("touchmove", preventDefaultTouch);

      if (container && container.parentElement) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }

      // Clean up Three.js resources
      renderer.dispose();
      rendererRef.current = null;
      labelRenderer.domElement.remove();

      // Traverse and dispose scene objects to free memory
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          } else if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose());
          }
        }
      });

      if (debugHitMarkerRef.current) {
        debugHitMarkerRef.current.geometry.dispose();
        if (Array.isArray(debugHitMarkerRef.current.material)) {
          debugHitMarkerRef.current.material.forEach((mat) => mat.dispose());
        } else {
          debugHitMarkerRef.current.material.dispose();
        }
        debugHitMarkerRef.current = null;
      }
    };
    setGlobalCleanup(cleanup);

    return cleanup;
  }, []);

  return (
    <>
      {/* Show loader while scene is setting up */}
      {isLoading && (
        <CosmosLoader
          onLoadingComplete={() => {
            setIsLoading(false);
          }}
        />
      )}

      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          opacity: !isLoading && sceneReady ? 1 : 0,
          transition: "opacity 1.5s ease-in-out",
        }}
      >
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
          <div
            ref={mountRef}
            className="width-full height-full"
            style={{
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          />

          {/* Ship Explore Mode Overlay */}
          {shipExploreMode && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 99999,
                pointerEvents: "none",
                fontFamily: "'JetBrains Mono', 'Rajdhani', monospace",
              }}
            >
              {/* Top banner */}
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(255, 60, 60, 0.85)",
                  color: "#fff",
                  padding: "8px 24px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  pointerEvents: "auto",
                  zIndex: 100000,
                }}
              >
                SHIP EXPLORE MODE &nbsp;|&nbsp; Ctrl+Shift+` to exit
              </div>

              {/* Crosshair */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 20,
                  height: 20,
                  border: "2px solid rgba(0, 255, 150, 0.7)",
                  borderRadius: "50%",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 4,
                    height: 4,
                    background: "rgba(0, 255, 150, 0.9)",
                    borderRadius: "50%",
                  }}
                />
              </div>

              {/* Coordinates panel (bottom-left) */}
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  bottom: 16,
                  left: 16,
                  background: "rgba(0, 0, 0, 0.85)",
                  border: "1px solid rgba(0, 255, 150, 0.5)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  color: "#0f6",
                  fontSize: 13,
                  lineHeight: 1.8,
                  minWidth: 320,
                  pointerEvents: "auto",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#fff" }}>
                  CAMERA POSITION (ship-local)
                </div>
                <div>
                  X: <span style={{ color: "#ff6b6b" }}>{exploreCoords.local[0].toFixed(2)}</span>
                  &nbsp;&nbsp;
                  Y: <span style={{ color: "#51cf66" }}>{exploreCoords.local[1].toFixed(2)}</span>
                  &nbsp;&nbsp;
                  Z: <span style={{ color: "#339af0" }}>{exploreCoords.local[2].toFixed(2)}</span>
                </div>
                <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
                  World: [{exploreCoords.world[0]}, {exploreCoords.world[1]}, {exploreCoords.world[2]}]
                </div>
              </div>

              {/* Right panel — View + Mark + Log controls */}
              <div
                style={{
                  position: "absolute",
                  top: 55,
                  right: 16,
                  bottom: 16,
                  width: 260,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  pointerEvents: "auto",
                  overflowY: "auto",
                }}
              >
                {/* ── CONTROLS REFERENCE ── */}
                <div style={{
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,200,50,0.5)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#ffd43b",
                  fontSize: 11,
                  lineHeight: 1.7,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: "#fff" }}>CONTROLS</div>
                  <div><span style={{ color: "#aaa" }}>WASD</span> Move &nbsp; <span style={{ color: "#aaa" }}>Q/E</span> Down/Up &nbsp; <span style={{ color: "#aaa" }}>Shift</span> Fast</div>
                  <div><span style={{ color: "#aaa" }}>Mouse drag</span> Look around</div>
                </div>

                {/* ── VIEW ALIGNMENT BUTTONS ── */}
                <div
                  style={{
                    background: "rgba(0,0,0,0.85)",
                    border: "1px solid rgba(100,200,255,0.5)",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#fff" }}>LOOK DIRECTION</div>
                  {(() => {
                    const viewBtnStyle: React.CSSProperties = {
                      padding: "7px 8px",
                      background: "rgba(100,200,255,0.2)",
                      color: "#8ecfff",
                      border: "1px solid rgba(100,200,255,0.4)",
                      borderRadius: 5,
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                      fontSize: 11,
                      cursor: "pointer",
                      textTransform: "uppercase" as const,
                      flex: "1 1 auto",
                      textAlign: "center" as const,
                    };
                    const cam = sceneRef.current.camera;
                    // Helper: orient camera to look in a ship-local direction
                    const lookShipDir = (localDir: [number, number, number], e: React.MouseEvent) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (!cam || !spaceshipRef.current || !sceneRef.current.controls) return;
                      const ship = spaceshipRef.current;
                      const quat = new THREE.Quaternion();
                      ship.getWorldQuaternion(quat);
                      const dir = new THREE.Vector3(...localDir).applyQuaternion(quat).normalize();
                      const cc = sceneRef.current.controls!;
                      const t = cam.position.clone().addScaledVector(dir, 2);
                      cc.setTarget(t.x, t.y, t.z, false);
                    };
                    const stopEvt = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); };
                    return (
                      <>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([0, 0, 1], e)}>Look Forward</button>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([0, 0, -1], e)}>Look Back</button>
                        </div>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([-1, 0, 0], e)}>Look Right</button>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([1, 0, 0], e)}>Look Left</button>
                        </div>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([0, 1, 0], e)}>Look Up</button>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([0, -1, 0], e)}>Look Down</button>
                        </div>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          <button
                            style={{ ...viewBtnStyle, background: "rgba(255, 180, 50, 0.3)", color: "#ffcc66", border: "1px solid rgba(255,180,50,0.5)", flex: "1 1 100%" }}
                            onMouseDown={stopEvt}
                            onClick={(e) => {
                              stopEvt(e);
                              if (!cam || !sceneRef.current.controls) return;
                              const lookDir = new THREE.Vector3();
                              cam.getWorldDirection(lookDir);
                              lookDir.negate();
                              const t = cam.position.clone().addScaledVector(lookDir, 2);
                              sceneRef.current.controls!.setTarget(t.x, t.y, t.z, false);
                            }}
                          >
                            Turn Around
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            style={{ ...viewBtnStyle, background: "rgba(0,255,150,0.2)", color: "#0f6", border: "1px solid rgba(0,255,150,0.4)", flex: "1 1 100%" }}
                            onMouseDown={stopEvt}
                            onClick={(e) => {
                              stopEvt(e);
                              if (!cam) return;
                              // Roll left: rotate camera's up vector around the look direction
                              const fwd = new THREE.Vector3();
                              cam.getWorldDirection(fwd);
                              const rollQuat = new THREE.Quaternion().setFromAxisAngle(fwd, Math.PI / 36); // 5° CCW
                              cam.up.applyQuaternion(rollQuat).normalize();
                            }}
                          >
                            Roll Left
                          </button>
                          <button
                            style={{ ...viewBtnStyle, background: "rgba(0,255,150,0.2)", color: "#0f6", border: "1px solid rgba(0,255,150,0.4)", flex: "1 1 100%" }}
                            onMouseDown={stopEvt}
                            onClick={(e) => {
                              stopEvt(e);
                              if (!cam) return;
                              // Roll right: rotate camera's up vector around the look direction
                              const fwd = new THREE.Vector3();
                              cam.getWorldDirection(fwd);
                              const rollQuat = new THREE.Quaternion().setFromAxisAngle(fwd, -Math.PI / 36); // 5° CW
                              cam.up.applyQuaternion(rollQuat).normalize();
                            }}
                          >
                            Roll Right
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* ── MARK BUTTONS ── */}
                <div
                  style={{
                    background: "rgba(0,0,0,0.85)",
                    border: "1px solid rgba(180,130,255,0.5)",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#fff" }}>MARK POSITION</div>
                  {(() => {
                    const markBtnBase: React.CSSProperties = {
                      padding: "7px 12px",
                      color: "#fff",
                      borderRadius: 6,
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                      fontSize: 12,
                      letterSpacing: 0.8,
                      cursor: "pointer",
                      textTransform: "uppercase" as const,
                      width: "100%",
                      textAlign: "center" as const,
                    };
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button
                          style={{ ...markBtnBase, background: "rgba(255,60,60,0.85)", border: "2px solid rgba(255,100,100,0.7)" }}
                          onClick={() => {
                            const coords = shipExploreCoordsRef.current.local;
                            setExploreSavedPositions((prev) => [...prev, { label: "COCKPIT", local: [...coords] }]);
                            if (spaceshipRef.current) {
                              const cam = new THREE.Vector3(coords[0], coords[1], coords[2]);
                              const look = new THREE.Vector3(coords[0], coords[1], coords[2] + 6);
                              spaceshipRef.current.userData.cockpitCameraLocal = cam;
                              spaceshipRef.current.userData.cockpitLookLocal = look;
                              vlog(`COCKPIT MARKED at local [${coords[0]}, ${coords[1]}, ${coords[2]}]`);
                            }
                          }}
                        >Mark Cockpit</button>
                        <button
                          style={{ ...markBtnBase, background: "rgba(50,150,255,0.85)", border: "2px solid rgba(100,180,255,0.7)" }}
                          onClick={() => {
                            const coords = shipExploreCoordsRef.current.local;
                            setExploreSavedPositions((prev) => [...prev, { label: "CABIN", local: [...coords] }]);
                            vlog(`CABIN MARKED at local [${coords[0]}, ${coords[1]}, ${coords[2]}]`);
                          }}
                        >Mark Cabin</button>
                        <button
                          style={{ ...markBtnBase, background: "rgba(50,200,100,0.85)", border: "2px solid rgba(100,220,150,0.7)" }}
                          onClick={() => {
                            const coords = shipExploreCoordsRef.current.local;
                            setExploreSavedPositions((prev) => [...prev, { label: "CUSTOM", local: [...coords] }]);
                            vlog(`CUSTOM MARKED at local [${coords[0]}, ${coords[1]}, ${coords[2]}]`);
                          }}
                        >Mark Custom</button>
                      </div>
                    );
                  })()}
                </div>

                {/* ── LOG TO CONSOLE ── */}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const positions = exploreSavedPositions;
                    const current = shipExploreCoordsRef.current;
                    console.log("\n%c═══ SHIP EXPLORE MODE — SAVED POSITIONS ═══", "color: #ff6b6b; font-weight: bold; font-size: 14px;");
                    console.log("%cCurrent camera (ship-local):", "color: #0f6; font-weight: bold;", current.local);
                    console.log("%cCurrent camera (world):", "color: #888;", current.world);
                    console.log("");
                    positions.forEach((p) => {
                      const color = p.label === "COCKPIT" ? "#ff6b6b" : p.label === "CABIN" ? "#339af0" : "#51cf66";
                      console.log(`%c${p.label}:`, `color: ${color}; font-weight: bold;`, `new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2]})`);
                    });
                    console.log("");
                    console.log("%c── Copy-paste ready code ──", "color: #ffd43b; font-weight: bold;");
                    const codeLines = [
                      "// ═══ Ship Explore Mode — Saved Positions ═══",
                      `// Generated at ${new Date().toISOString()}`,
                      `// Ship scale: ${spaceshipRef.current?.scale.x ?? "unknown"}`,
                      "",
                    ];
                    positions.forEach((p) => {
                      codeLines.push(`// ${p.label}`);
                      codeLines.push(`const ${p.label.toLowerCase()}CamLocal = new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2]});`);
                      codeLines.push(`const ${p.label.toLowerCase()}LookLocal = new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2] + 6});`);
                      codeLines.push("");
                    });
                    if (positions.length === 0) {
                      codeLines.push("// (no positions marked yet — current camera position below)");
                      codeLines.push(`const currentLocal = new THREE.Vector3(${current.local[0]}, ${current.local[1]}, ${current.local[2]});`);
                    }
                    const codeStr = codeLines.join("\n");
                    console.log(codeStr);
                    console.log("%c═══ END ═══", "color: #ff6b6b; font-weight: bold;");
                    // Also try to copy to clipboard
                    navigator.clipboard.writeText(codeStr).then(
                      () => console.log("%cCopied to clipboard!", "color: #0f6; font-weight: bold;"),
                      () => console.log("%cClipboard copy failed — please copy from above.", "color: #ff0;"),
                    );
                  }}
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255, 200, 50, 0.9)",
                    color: "#000",
                    border: "2px solid rgba(255, 220, 100, 0.8)",
                    borderRadius: 8,
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: 1,
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  LOG ALL TO CONSOLE + COPY
                </button>
              </div>

              {/* Saved positions log (top-left) */}
              {exploreSavedPositions.length > 0 && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: 60,
                    left: 16,
                    background: "rgba(0, 0, 0, 0.85)",
                    border: "1px solid rgba(180, 130, 255, 0.5)",
                    borderRadius: 8,
                    padding: "12px 16px",
                    color: "#d0bfff",
                    fontSize: 12,
                    lineHeight: 1.8,
                    minWidth: 280,
                    maxHeight: 300,
                    overflowY: "auto",
                    pointerEvents: "auto",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#fff" }}>
                    SAVED POSITIONS
                  </div>
                  {exploreSavedPositions.map((pos, idx) => (
                    <div key={idx} style={{ borderBottom: "1px solid rgba(180,130,255,0.2)", paddingBottom: 4, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: pos.label === "COCKPIT" ? "#ff6b6b" : pos.label === "CABIN" ? "#339af0" : "#51cf66" }}>
                        {pos.label}
                      </span>
                      : [{pos.local[0]}, {pos.local[1]}, {pos.local[2]}]
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      // Copy all saved positions to clipboard as code
                      const code = exploreSavedPositions
                        .map((p) => `// ${p.label}: new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2]})`)
                        .join("\n");
                      navigator.clipboard.writeText(code).then(() => {
                        vlog("📋 Positions copied to clipboard!");
                      });
                    }}
                    style={{
                      marginTop: 8,
                      padding: "6px 14px",
                      background: "rgba(180, 130, 255, 0.3)",
                      color: "#d0bfff",
                      border: "1px solid rgba(180,130,255,0.5)",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 11,
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 600,
                    }}
                  >
                    Copy All to Clipboard
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Ship Control Bar — initial choice + view controls */}
          <ShipControlBar
            phase={shipUIPhase}
            activeView={insideShip ? shipViewMode : "exterior"}
            onUseShip={handleUseShip}
            onFreeExplore={handleFreeExplore}
            onLeaveShip={handleLeaveShip}
            onSummonFalcon={handleSummonFalcon}
            onViewChange={handleShipViewChange}
            onRollStart={handleRollStart}
            onRollStop={handleRollStop}
            rollAngle={displayRollAngle}
          />

          {/* Cockpit/Cabin keyboard hints */}
          <CockpitHints
            insideShip={insideShip}
            shipViewMode={shipViewMode}
          />

          {/* Ship destination nav panel — right side (all ship modes) */}
          {shipUIPhase === "ship-engaged" && (
            <CockpitNavPanel
              targets={navigationTargets}
              currentTarget={currentNavigationTarget}
              isNavigating={!!currentNavigationTarget}
              onNavigate={handleCockpitNavigate}
            />
          )}

          {/* Spaceship HUD Interface */}
          <SpaceshipHUD
            userName="HARMA DAVTIAN"
            userTitle="Lead Full Stack Engineer"
            shipMovementDebug={shipMovementDebug}
            onShipMovementDebugChange={setShipMovementDebug}
            shipMovementDebugPanel={
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    color: "#e8c547",
                    fontSize: 12,
                    fontFamily: "'Rajdhani', sans-serif",
                    letterSpacing: 0.6,
                  }}
                >
                  KEY COMBO HELP
                </div>
                <button
                  onClick={() =>
                    appendSystemStatusLog(
                      "Shift+L: Camera snapshot (CAMERA_SNAPSHOT).\nCaptures camera position, target, rotation, FOV, zoom, near/far.",
                    )
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(232, 197, 71, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#e8c547",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  Log Shift+L details
                </button>
                <button
                  onClick={() =>
                    appendSystemStatusLog(
                      "Shift+M: Toggle Ship Staging Mode.\nControls: WASD/RF move, arrows/QE rotate, Shift = faster.\nShift+P: Ship snapshot (SHIP_SNAPSHOT).",
                    )
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(100, 149, 237, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  Log Shift+M details
                </button>
                <button
                  onClick={() =>
                    appendSystemStatusLog(
                      "Shift+J: Dump Ship Labels (SHIP_DEBUG_LABELS).\nUse Label Ship mode + click to mark points, then Shift+J to log.",
                    )
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(120, 255, 170, 0.45)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#7dffb1",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  Log Shift+J details
                </button>
                <button
                  onClick={() => {
                    if (!spaceshipRef.current) return;
                    const ship = spaceshipRef.current;
                    if (shipCinematicRef.current) {
                      shipCinematicRef.current.active = false;
                      shipCinematicRef.current = null;
                    }
                    setFollowingSpaceship(false);
                    followingSpaceshipRef.current = false;
                    setManualFlightMode(false);
                    manualFlightModeRef.current = false;
                    setInsideShip(false);
                    insideShipRef.current = false;
                    setShipViewMode("exterior");
                    shipViewModeRef.current = "exterior";
                    const randomOffset = new THREE.Vector3(
                      (Math.random() - 0.5) * 1600,
                      (Math.random() - 0.5) * 800,
                      (Math.random() - 0.5) * 1600,
                    );
                    ship.position.copy(randomOffset);
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(100, 149, 237, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
                  }}
                >
                  Random Ship
                </button>
                <button
                  onClick={() => {
                    if (!spaceshipRef.current) return;
                    const ship = spaceshipRef.current;
                    if (shipCinematicRef.current) {
                      shipCinematicRef.current.active = false;
                      shipCinematicRef.current = null;
                    }
                    setFollowingSpaceship(false);
                    followingSpaceshipRef.current = false;
                    setManualFlightMode(false);
                    manualFlightModeRef.current = false;

                    const startPos = ship.position.clone();
                    const endPos = getRandomEndPosNearPlanets();
                    if (endPos.distanceTo(startPos) < 300) {
                      endPos.add(new THREE.Vector3(300, 150, -350));
                    }

                    const controlPos = startPos.clone().lerp(endPos, 0.5);
                    const distance = startPos.distanceTo(endPos);
                    const duration = THREE.MathUtils.clamp(
                      4000 * (distance / 600),
                      3000,
                      9000,
                    );

                    shipCinematicRef.current = {
                      active: true,
                      phase: "approach",
                      startTime: performance.now(),
                      duration,
                      startPos: startPos.clone(),
                      controlPos,
                      endPos: endPos.clone(),
                      startQuat: ship.quaternion.clone(),
                      endQuat: ship.quaternion.clone(),
                    };
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(100, 149, 237, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
                  }}
                >
                  Random Straight
                </button>
                <button
                  onClick={() => {
                    if (!spaceshipRef.current) return;
                    const ship = spaceshipRef.current;
                    if (shipCinematicRef.current) {
                      shipCinematicRef.current.active = false;
                      shipCinematicRef.current = null;
                    }
                    setFollowingSpaceship(false);
                    followingSpaceshipRef.current = false;
                    setManualFlightMode(false);
                    manualFlightModeRef.current = false;

                    const startPos = ship.position.clone();
                    const endPos = getRandomEndPosNearPlanets();
                    if (endPos.distanceTo(startPos) < 300) {
                      endPos.add(new THREE.Vector3(-350, 120, 280));
                    }

                    const cameraDir = new THREE.Vector3();
                    sceneRef.current.camera?.getWorldDirection(cameraDir);
                    const cameraUp = new THREE.Vector3(0, 1, 0);
                    const cameraRight = new THREE.Vector3()
                      .crossVectors(cameraDir, cameraUp)
                      .normalize();

                    const controlPos = startPos
                      .clone()
                      .lerp(endPos, 0.45)
                      .add(
                        cameraRight.multiplyScalar((Math.random() - 0.5) * 200),
                      )
                      .add(
                        cameraUp.multiplyScalar((Math.random() - 0.5) * 160),
                      );
                    const controlPos2 = startPos
                      .clone()
                      .lerp(endPos, 0.75)
                      .add(
                        cameraRight.multiplyScalar((Math.random() - 0.5) * 180),
                      )
                      .add(
                        cameraUp.multiplyScalar((Math.random() - 0.5) * 140),
                      );

                    const distance = startPos.distanceTo(endPos);
                    const duration = THREE.MathUtils.clamp(
                      4500 * (distance / 600),
                      3500,
                      10000,
                    );

                    shipCinematicRef.current = {
                      active: true,
                      phase: "approach",
                      startTime: performance.now(),
                      duration,
                      startPos: startPos.clone(),
                      controlPos,
                      controlPos2,
                      endPos: endPos.clone(),
                      startQuat: ship.quaternion.clone(),
                      endQuat: ship.quaternion.clone(),
                    };
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(100, 149, 237, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
                  }}
                >
                  Random Curved
                </button>
                <button
                  onClick={() => {
                    startIntroSequenceRef.current?.();
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(232, 197, 71, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#e8c547",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
                  }}
                >
                  Home
                </button>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(232, 197, 71, 0.4)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#e8c547",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={debugSnapToShip}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setDebugSnapToShip(next);
                      debugSnapToShipRef.current = next;
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  Snap
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(100, 149, 237, 0.5)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={debugShipLabelMode}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setDebugShipLabelMode(next);
                      debugShipLabelModeRef.current = next;
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  Label Ship
                </label>
                <select
                  value={debugShipLabel}
                  onChange={(event) =>
                    setDebugShipLabel(event.target.value as ShipLabelTarget)
                  }
                  style={{
                    padding: "6px 8px",
                    borderRadius: 10,
                    border: "1px solid rgba(100, 149, 237, 0.5)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  <option value="front">
                    Front{debugShipLabels.front ? " ✓" : ""}
                  </option>
                  <option value="rear">
                    Rear{debugShipLabels.rear ? " ✓" : ""}
                  </option>
                  <option value="left">
                    Left{debugShipLabels.left ? " ✓" : ""}
                  </option>
                  <option value="right">
                    Right{debugShipLabels.right ? " ✓" : ""}
                  </option>
                  <option value="top">
                    Top{debugShipLabels.top ? " ✓" : ""}
                  </option>
                  <option value="bottom">
                    Bottom{debugShipLabels.bottom ? " ✓" : ""}
                  </option>
                  <option value="cockpit">
                    Cockpit{debugShipLabels.cockpit ? " ✓" : ""}
                  </option>
                </select>
                <button
                  onClick={() => resetShipLabels()}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255, 120, 120, 0.6)",
                    background: "rgba(30,10,10,0.7)",
                    color: "#ff8c8c",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  Reset Labels
                </button>
              </div>
            }
            consoleLogs={consoleLogs}
            consoleVisible={consoleVisible}
            onConsoleToggle={() => setConsoleVisible(!consoleVisible)}
            onConsoleCopy={() => {
              navigator.clipboard.writeText(consoleLogs.join("\n"));
            }}
            onConsoleClear={() => {
              setConsoleLogs([]);
              consoleLogsRef.current = [];
            }}
            missionControlLogs={missionControlLogs}
            onMissionControlLog={missionLog}
            onMissionControlClear={() => {
              setMissionControlLogs([]);
              missionControlLogsRef.current = [];
            }}
            onMissionControlCopy={() => {
              navigator.clipboard.writeText(missionControlLogs.join("\n"));
            }}
            systemStatusLogs={systemStatusLogs}
            onSystemStatusCopy={() => {
              navigator.clipboard.writeText(systemStatusLogs.join("\n"));
            }}
            onSystemStatusClear={() => {
              setSystemStatusLogs([]);
            }}
            tourActive={tourActive}
            tourWaypoint={tourWaypoint}
            tourProgress={tourProgress}
            onTourPrevious={() => tourGuideRef.current?.previousWaypoint()}
            onTourNext={() => tourGuideRef.current?.nextWaypoint()}
            onTourRestart={() => tourGuideRef.current?.restartTour()}
            onTourEnd={() => {
              tourGuideRef.current?.stopTour();
              setTourActive(false);
              setOverlayContent(null);
              setContentLoading(false);
              vlog("🛑 Tour ended");
            }}
            followingSpaceship={followingSpaceship}
            insideShip={insideShip}
            shipViewMode={shipViewMode}
            onEnterShip={() => {
              if (!followingSpaceship) {
                setFollowingSpaceship(true);
                followingSpaceshipRef.current = true;
              }

              if (manualFlightModeRef.current) {
                setManualFlightMode(false);
                manualFlightModeRef.current = false;
              }

              setInsideShip(true);
              insideShipRef.current = true;
              setShipViewMode("interior");
              shipViewModeRef.current = "interior";

              // Initialize camera inside ship at cabin location (right front)
              if (
                spaceshipRef.current &&
                sceneRef.current.camera &&
                sceneRef.current.controls
              ) {
                const ship = spaceshipRef.current;
                const shipWorldPos = new THREE.Vector3();
                const shipWorldQuat = new THREE.Quaternion();
                ship.getWorldPosition(shipWorldPos);
                ship.getWorldQuaternion(shipWorldQuat);

                // Cabin anchor — from explore mode labeling
                const shipScale = ship.scale.x;
                const cabinWorldPos = new THREE.Vector3(0, -0.64, -4.49)
                  .multiplyScalar(shipScale)
                  .applyQuaternion(shipWorldQuat)
                  .add(shipWorldPos);

                // Camera looks forward from cabin
                const cabinLookTarget = new THREE.Vector3(0, -0.64, 1.51)
                  .multiplyScalar(shipScale)
                  .applyQuaternion(shipWorldQuat)
                  .add(shipWorldPos);

                sceneRef.current.controls.setLookAt(
                  cabinWorldPos.x, cabinWorldPos.y, cabinWorldPos.z,
                  cabinLookTarget.x, cabinLookTarget.y, cabinLookTarget.z,
                  false, // instant
                );
              }

              vlog("🛸 Entering ship - interior view (cabin)");
            }}
            onExitShip={() => {
              setInsideShip(false);
              insideShipRef.current = false;
              setShipViewMode("exterior");
              shipViewModeRef.current = "exterior";

              // Restore camera constraints from interior mode
              if (sceneRef.current.camera instanceof THREE.PerspectiveCamera) {
                sceneRef.current.camera.near = 0.1;
                sceneRef.current.camera.updateProjectionMatrix();
              }
              if (sceneRef.current.controls) {
                const cc = sceneRef.current.controls;
                cc.minPolarAngle = 0;
                cc.maxPolarAngle = Math.PI;
                cc.minDistance = 0.01;
                cc.maxDistance = 6000;
              }

              vlog("🚪 Exiting ship - exterior view");
            }}
            onGoToCockpit={() => {
              setShipViewMode("cockpit");
              shipViewModeRef.current = "cockpit";

              // Position camera inside model's actual cockpit
              if (
                spaceshipRef.current &&
                sceneRef.current.camera &&
                sceneRef.current.controls
              ) {
                const ship = spaceshipRef.current;
                const shipWorldPos = new THREE.Vector3();
                const shipWorldQuat = new THREE.Quaternion();
                ship.getWorldPosition(shipWorldPos);
                ship.getWorldQuaternion(shipWorldQuat);

                const cockpitCamLocal = (ship.userData.cockpitCameraLocal as THREE.Vector3)
                  ?? new THREE.Vector3(-6.05, 3.16, 5.36);
                const cockpitLookLocal = (ship.userData.cockpitLookLocal as THREE.Vector3)
                  ?? new THREE.Vector3(-6.05, 3.16, 11.36);

                const shipScale = ship.scale.x;
                const cockpitWorldPos = cockpitCamLocal
                  .clone()
                  .multiplyScalar(shipScale)
                  .applyQuaternion(shipWorldQuat)
                  .add(shipWorldPos);

                const windowTarget = cockpitLookLocal
                  .clone()
                  .multiplyScalar(shipScale)
                  .applyQuaternion(shipWorldQuat)
                  .add(shipWorldPos);

                // Reduce near clipping plane so cockpit geometry is visible
                if (sceneRef.current.camera instanceof THREE.PerspectiveCamera) {
                  sceneRef.current.camera.near = 0.01;
                  sceneRef.current.camera.updateProjectionMatrix();
                }

                sceneRef.current.controls.setLookAt(
                  cockpitWorldPos.x, cockpitWorldPos.y, cockpitWorldPos.z,
                  windowTarget.x, windowTarget.y, windowTarget.z,
                  false, // instant
                );
              }

              vlog("✈️ Moving to cockpit");
            }}
            onGoToInterior={() => {
              setShipViewMode("interior");
              shipViewModeRef.current = "interior";

              // Return to cabin location
              if (
                spaceshipRef.current &&
                sceneRef.current.camera &&
                sceneRef.current.controls
              ) {
                const ship = spaceshipRef.current;
                const shipWorldPos = new THREE.Vector3();
                const shipWorldQuat = new THREE.Quaternion();
                ship.getWorldPosition(shipWorldPos);
                ship.getWorldQuaternion(shipWorldQuat);

                // Cabin anchor — from explore mode labeling
                const shipScale = ship.scale.x;
                const cabinWorldPos = new THREE.Vector3(0, -0.64, -4.49)
                  .multiplyScalar(shipScale)
                  .applyQuaternion(shipWorldQuat)
                  .add(shipWorldPos);

                // Look forward from cabin
                const cabinLookTarget = new THREE.Vector3(0, -0.64, 1.51)
                  .multiplyScalar(shipScale)
                  .applyQuaternion(shipWorldQuat)
                  .add(shipWorldPos);

                // Restore near clipping plane when leaving cockpit
                if (sceneRef.current.camera instanceof THREE.PerspectiveCamera) {
                  sceneRef.current.camera.near = 0.1;
                  sceneRef.current.camera.updateProjectionMatrix();
                }

                sceneRef.current.controls.setLookAt(
                  cabinWorldPos.x, cabinWorldPos.y, cabinWorldPos.z,
                  cabinLookTarget.x, cabinLookTarget.y, cabinLookTarget.z,
                  false, // instant
                );
              }

              vlog("🚪 Moving to main interior (cabin)");
            }}
            shipExteriorLights={shipExteriorLights}
            onShipExteriorLightsChange={setShipExteriorLights}
            shipInteriorLights={shipInteriorLights}
            onShipInteriorLightsChange={setShipInteriorLights}
            manualFlightMode={manualFlightMode}
            onManualFlightModeChange={(value) => {
              vlog(
                `🕹️ Flight mode changed to: ${value ? "MANUAL" : "AUTOPILOT"}`,
              );
              setManualFlightMode(value);
              manualFlightModeRef.current = value;

              // Reset manual flight state when switching modes
              if (value) {
                // Entering manual mode - reset physics
                vlog(`   Resetting flight physics for manual mode`);
                manualFlightRef.current.velocity.set(0, 0, 0);
                manualFlightRef.current.acceleration = 0;
                manualFlightRef.current.currentSpeed = 0;
                manualFlightRef.current.pitch = 0;
                manualFlightRef.current.yaw = 0;
                manualFlightRef.current.roll = 0;
                manualFlightRef.current.targetPitch = 0;
                manualFlightRef.current.targetYaw = 0;
                manualFlightRef.current.targetRoll = 0;
                manualFlightRef.current.isAccelerating = false;
                vlog("✋ Manual flight mode activated - Take control!");
              } else {
                // Returning to autopilot
                vlog(
                  "🤖 Autopilot engaged - Ship will resume autonomous flight",
                );
              }
            }}
            manualFlightSpeed={manualFlightRef.current.currentSpeed}
            manualFlightMaxSpeed={manualFlightRef.current.maxSpeed}
            keyboardState={keyboardStateRef.current}
            keyboardUpdateTrigger={keyboardUpdateTrigger}
            invertControls={invertControls}
            onInvertControlsChange={(value) => {
              setInvertControls(value);
              invertControlsRef.current = value;
            }}
            controlSensitivity={controlSensitivity}
            onControlSensitivityChange={(value) => {
              setControlSensitivity(value);
              controlSensitivityRef.current = value;
            }}
            onStopFollowing={() => {
              setFollowingSpaceship(false);
              followingSpaceshipRef.current = false;
              setInsideShip(false);
              insideShipRef.current = false;
              setShipViewMode("exterior");
              shipViewModeRef.current = "exterior";
              if (sceneRef.current.controls) {
                const cc = sceneRef.current.controls;
                cc.enabled = true;
                cc.minPolarAngle = 0;
                cc.maxPolarAngle = Math.PI;
                cc.minDistance = 0.01;
                cc.maxDistance = 6000;
              }
              // Restore near clipping plane
              if (sceneRef.current.camera instanceof THREE.PerspectiveCamera) {
                sceneRef.current.camera.near = 0.1;
                sceneRef.current.camera.updateProjectionMatrix();
              }
              vlog("🛑 Stopped following spaceship");
            }}
            navigationTargets={navigationTargets}
            onNavigate={handleQuickNav}
            currentTarget={currentNavigationTarget}
            navigationDistance={navigationDistance}
            navigationETA={navigationETA}
            isTransitioning={false}
            speed={0}
            content={contentDisplayVariant === "classic" ? overlayContent : null}
            contentLoading={contentDisplayVariant === "classic" ? contentLoading : false}
            cosmosOptions={options}
            onCosmosOptionsChange={(newOptions) => {
              // Pass the options change up to the parent component
              if (onOptionsChange) {
                onOptionsChange(newOptions);
              }
            }}
            onConsoleLog={(message) => {
              vlog(message);
            }}
            onContentAction={(action: string) => {
              vlog(`🎬 Content action received: ${action}`);

              // Handle different actions
              if (action.startsWith("tour:")) {
                const tourType = action.replace("tour:", "");
                vlog(`🔍 Tour type: ${tourType}`);
                vlog(`📦 tourBuilderRef exists: ${!!tourBuilderRef.current}`);
                vlog(`📦 tourGuideRef exists: ${!!tourGuideRef.current}`);

                if (tourBuilderRef.current && tourGuideRef.current) {
                  vlog(`🚀 Starting ${tourType} tour...`);
                  let tour;
                  switch (tourType) {
                    case "career-journey":
                      tour = tourBuilderRef.current.createCareerJourneyTour();
                      vlog(
                        `📋 Tour created with ${tour?.waypoints.length || 0} waypoints`,
                      );
                      break;
                    case "technical-deep-dive":
                      tour =
                        tourBuilderRef.current.createTechnicalDeepDiveTour();
                      break;
                    case "leadership-story":
                      tour = tourBuilderRef.current.createLeadershipStoryTour();
                      break;
                  }

                  if (tour) {
                    vlog(`✅ Tour object valid, starting...`);
                    // Resolve experience-moon targets to live world positions
                    const resolvedWaypoints = tour.waypoints.map((wp) => {
                      try {
                        if (wp.id && wp.id.startsWith("experience-moon-")) {
                          const candidate =
                            (wp.content && (wp.content as any).title) ||
                            wp.name;
                          let moonMesh: THREE.Mesh | undefined;
                          sceneRef.current.scene?.traverse((object) => {
                            if (
                              object instanceof THREE.Mesh &&
                              object.userData.planetName
                            ) {
                              const pname = (
                                object.userData.planetName || ""
                              ).toLowerCase();
                              if (
                                candidate &&
                                pname.includes(
                                  (candidate || "").toLowerCase().split(" ")[0],
                                )
                              ) {
                                moonMesh = object as THREE.Mesh;
                              }
                            }
                          });
                          if (moonMesh) {
                            const worldPos = new THREE.Vector3();
                            moonMesh.getWorldPosition(worldPos);
                            const offset = new THREE.Vector3(80, 40, 60);
                            return {
                              ...wp,
                              target: {
                                ...wp.target,
                                lookAt: worldPos.clone(),
                                position: worldPos.clone().add(offset),
                              },
                            } as typeof wp;
                          }
                        }
                      } catch (e) {
                        vlog("⚠️ Error resolving waypoint to mesh");
                      }
                      return wp;
                    });

                    setTourActive(true);
                    setOverlayContent(null);
                    setContentLoading(false);
                    tourGuideRef.current.startTour(resolvedWaypoints);
                    vlog(
                      `✨ Tour started: ${tour.title} (${tour.waypoints.length} waypoints)`,
                    );
                  } else {
                    vlog(`❌ Tour object is null or undefined`);
                  }
                } else {
                  vlog(`❌ Tour refs not initialized`);
                }
              } else if (action.startsWith("navigate:")) {
                const target = action.replace("navigate:", "");
                if (cameraDirectorRef.current) {
                  // If navigating away from a focused moon, restore it first
                  if (focusedMoonRef.current) {
                    exitFocusRequestRef.current = true;
                  }
                  switch (target) {
                    case "sun":
                    case "home":
                      setOverlayContent(null);
                      setContentLoading(false);
                      if (originalMinDistanceRef.current > 0) {
                        setMinDistance(
                          originalMinDistanceRef.current,
                          "restore on navigate home",
                        );
                      }
                      if (startIntroSequenceRef.current) {
                        startIntroSequenceRef.current();
                      } else {
                        cameraDirectorRef.current.systemOverview();
                      }
                      break;
                    case "experience":
                      const expData = planetsDataRef.current.get("experience");
                      if (expData) {
                        cameraDirectorRef.current.flyTo({
                          position: new THREE.Vector3(
                            expData.position.x + 300,
                            expData.position.y + 150,
                            expData.position.z + 200,
                          ),
                          lookAt: expData.position,
                          duration: 2,
                        });
                      }
                      break;
                    case "skills":
                      const skillsData = planetsDataRef.current.get("skills");
                      if (skillsData) {
                        cameraDirectorRef.current.flyTo({
                          position: new THREE.Vector3(
                            skillsData.position.x + 350,
                            skillsData.position.y + 150,
                            skillsData.position.z + 250,
                          ),
                          lookAt: skillsData.position,
                          duration: 2,
                        });
                      }
                      break;
                    case "projects":
                      const projectsData =
                        planetsDataRef.current.get("projects");
                      if (projectsData) {
                        cameraDirectorRef.current.flyTo({
                          position: new THREE.Vector3(
                            projectsData.position.x + 400,
                            projectsData.position.y + 200,
                            projectsData.position.z + 300,
                          ),
                          lookAt: projectsData.position,
                          duration: 2,
                        });
                      }
                      break;
                  }
                }
              } else if (action === "mode:free") {
                tourGuideRef.current?.stopTour();
              }
            }}
          />
        </div>
      </div>

      {/* Mission Briefing Terminal — moon visit content display (Variant 5) */}
      {contentDisplayVariant === "mission-briefing" && (
        <MissionBriefingTerminal
          content={overlayContent}
          isCockpit={insideShip}
          onClose={() => setOverlayContent(null)}
        />
      )}

      {/* Content display variant switcher — only visible when content is active */}
      {overlayContent && shipUIPhase === "ship-engaged" && (
        <div
          style={{
            position: "fixed",
            bottom: 72,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 2,
            background: "rgba(5, 12, 28, 0.85)",
            border: "1px solid rgba(79, 255, 176, 0.2)",
            borderRadius: 6,
            padding: 3,
            zIndex: 10001,
            fontFamily: "'Rajdhani', sans-serif",
            backdropFilter: "blur(8px)",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1.5,
              color: "rgba(79, 255, 176, 0.45)",
              textTransform: "uppercase",
              padding: "4px 8px",
              alignSelf: "center",
            }}
          >
            DISPLAY
          </span>
          {CONTENT_VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => setContentDisplayVariant(v.id)}
              style={{
                background:
                  contentDisplayVariant === v.id
                    ? "rgba(79, 255, 176, 0.15)"
                    : "transparent",
                border:
                  contentDisplayVariant === v.id
                    ? "1px solid rgba(79, 255, 176, 0.35)"
                    : "1px solid transparent",
                color:
                  contentDisplayVariant === v.id
                    ? "#4fffb0"
                    : "rgba(200, 216, 232, 0.5)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "'Rajdhani', sans-serif",
                borderRadius: 4,
                padding: "4px 12px",
                letterSpacing: 0.5,
                transition: "all 0.2s",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
