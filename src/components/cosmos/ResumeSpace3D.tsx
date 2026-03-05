import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import resumeData from "../../data/resume.json";
import legacyWebsites from "../../data/legacyWebsites.json";
import CosmosLoader from "../CosmosLoader";
import {
  DEFAULT_CONTROL_SENSITIVITY,
  DEFAULT_MOON_VISIT_DURATION,
  DEFAULT_SPACESHIP_PATH_SPEED,
  DEFAULT_ZOOM_EXIT_THRESHOLD,
} from "./ResumeSpace3D.constants";
import {
  attachMultiNoteOverlaysFactory,
  createDetailTexture,
  createLabel,
  createLighting,
  createPlanetFactory,
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
import ShipControlBar, { type ShipUIPhase } from "../ui/ShipControlBar";
import CockpitNavPanel from "../ui/CockpitNavPanel";
import ShipTerminal from "../ui/ShipTerminal";
import { HologramDroneDisplay } from "./HologramDroneDisplay";
// CockpitHologramPanels kept for potential future use
import { getOrbitalPositionEmitter } from "../OrbitalPositionEmitter";
import { StarDestroyerCruiser } from "../StarDestroyerCruiser";
import { useCosmosLogs } from "./hooks/useCosmosLogs";
import { useCosmosOptions } from "./hooks/useCosmosOptions";
import { useKeyboardControls } from "./hooks/useKeyboardControls";
import { usePointerInteractions } from "./hooks/usePointerInteractions";
import { useThreeScene } from "./hooks/useThreeScene";
import { useOrbitSystem } from "./hooks/useOrbitSystem";
import { createMoonFocusController } from "./ResumeSpace3D.focusController";
import { useMoonOrbit, type OrbitPhase } from "./hooks/useMoonOrbit";
import { useNavigationSystem } from "./hooks/useNavigationSystem";
import { useRenderLoop } from "./hooks/useRenderLoop";
import { createIntroSequenceRunner } from "./introSequence";
import {
  SUN_GLOW_SPRITE_SIZE,
  SUN_LABEL_Y,
  EXPERIENCE_ORBIT,
  EXPERIENCE_RADIUS,
  SKILLS_ORBIT,
  SKILLS_RADIUS,
  EXP_MOON_ORBIT_BASE,
  EXP_MOON_ORBIT_STEP,
  EXP_MOON_RADIUS,
  SKILL_MOON_ORBIT_BASE,
  SKILL_MOON_ORBIT_STEP,
  SKILL_MOON_RADIUS,
  FALCON_SCALE,
  FALCON_INITIAL_POS,
  SD_SCALE,
  SD_INITIAL_POS,
  SD_CONE_LENGTH,
  SD_CONE_RADIUS,
  NEAR_DEFAULT,
  NEAR_OVERVIEW,
  CONTROLS_MAX_DIST,
  CAMERA_FAR,
  FOLLOW_DISTANCE,
  FOLLOW_HEIGHT,
  EXP_WANDER_RADIUS,
  SKILLS_WANDER_RADIUS,
  PROJ_WANDER_RADIUS,
  SUN_WANDER_RADIUS,
  NAV_CAMERA_BEHIND,
  SKYFIELD_RADIUS,
  EXP_FOCUS_DIST,
  SKILLS_FOCUS_DIST,
  CINE_DURATION_DIVISOR,
  orbitDebug,
} from "./scaleConfig";

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

const PROJECT_SHOWCASE_NAV_ID = "project-showcase";
const PROJECT_SHOWCASE_LAYER = 2;
const PROJECT_SHOWCASE_CARD_LAYER = 1;
const SKILLS_LATTICE_LAYER = 3;
const PROJECT_SHOWCASE_MIN_ANGLE_PERCENT = 0;
const PROJECT_SHOWCASE_MAX_ANGLE_PERCENT = 100;
const PROJECT_SHOWCASE_DEFAULT_ANGLE_PERCENT = 25;
const PROJECT_SHOWCASE_SHOW_IMAGE_MANIPULATION_CONTROLS = false;
const PROJECT_SHOWCASE_NAV_STOP_BACK_OFFSET = 15;
const PROJECT_SHOWCASE_USE_NEBULA_REALM = true;
const PROJECT_SHOWCASE_NEBULA_JPG_PATH =
  "/models/alternate-universe/starmap_16k.jpg";
const PROJECT_SHOWCASE_NEAR_ANCHOR_DIST = 420;
const SKILLS_LATTICE_NAV_ID = "skills-lattice";
const PROJECT_SHOWCASE_FILTER_OPTIONS = [
  "Angular",
  "C#",
  "Java",
  "JavaScript",
  "TypeScript",
  "React",
  "Node",
] as const;

type ShowcaseEntry = {
  id: string;
  title: string;
  image: string;
  description?: string;
  technologies?: string[];
  year?: number | null;
  fit?: "contain" | "cover";
};

type ShowcasePanelRecord = {
  group: THREE.Group;
  runPos: number;
  entry: ShowcaseEntry;
  fitMode: "contain" | "cover";
  inwardRotationY: number;
  frontFacingRotationY: number;
  cantSign: -1 | 1;
  focusBlend: number;
  frameMat: THREE.MeshBasicMaterial;
  imageMesh: THREE.Mesh;
  imageMat: THREE.MeshBasicMaterial;
  texture: THREE.Texture | null;
  baseRepeat: THREE.Vector2;
  baseOffset: THREE.Vector2;
  zoom: number;
  panX: number;
  panY: number;
};

type SkillsLatticeNodeRecord = {
  mesh: THREE.Mesh;
  baseScale: number;
  phase: number;
  label: string;
  nodeType: "category" | "skill";
  category: string;
  detailItems: string[];
  halo?: THREE.Sprite;
  lineInfluence: number;
};

type SkillsLatticeLinkSegment = {
  from: THREE.Vector3;
  to: THREE.Vector3;
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
  const [, setContentLoading] = useState(false);

  // Hologram Drone display instance — always shown when content is active
  const hologramDroneRef = useRef<HologramDroneDisplay | null>(null);

  // ── Moon Orbit System (declared early so useEffect below can reference orbitPhase) ──
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
    shipLog,
    shipLogs,
    debugLog,
    debugLogs,
    debugLogsRef,
    setDebugLogs,
    debugLogTotal,
  } = useCosmosLogs();

  const {
    enterOrbit,
    exitOrbit,
    updateOrbit,
    isOrbiting,
    onExitCompleteRef: orbitExitCompleteRef,
    onOrbitEstablishedRef,
  } = useMoonOrbit(debugLog, shipLog);

  // Track orbit phase as React state for UI (Leave Orbit button, etc.)
  const [orbitPhase, setOrbitPhase] = useState<OrbitPhase>("idle");

  // Keep orbitActiveRef in sync for pointer handlers
  useEffect(() => {
    orbitActiveRef.current = orbitPhase !== "idle";
  }, [orbitPhase]);

  // Drive hologram drone whenever overlay content changes
  useEffect(() => {
    const drone = hologramDroneRef.current;
    if (!drone) {
      debugLog("drone", "useEffect: no drone ref");
      return;
    }
    if (overlayContent) {
      const moon = focusedMoonRef.current;
      const cam = sceneRef.current.camera;
      if (moon && cam) {
        const moonWorldPos = new THREE.Vector3();
        moon.getWorldPosition(moonWorldPos);
        // During orbit, anchor the drone above the ship rather than beside the moon
        const ship = spaceshipRef.current;
        const anchor = (orbitPhase === "orbiting" && ship)
          ? ship.position.clone()
          : undefined;
        debugLog("drone", `showContent called — orbitPhase=${orbitPhase}, anchor=${anchor ? `[${anchor.x.toFixed(0)},${anchor.y.toFixed(0)},${anchor.z.toFixed(0)}]` : "none"}, moonPos=[${moonWorldPos.x.toFixed(0)},${moonWorldPos.y.toFixed(0)},${moonWorldPos.z.toFixed(0)}]`);
        drone.showContent(overlayContent, moonWorldPos, cam, anchor);
      } else {
        debugLog("drone", `useEffect: missing moon=${!!moon} cam=${!!cam}`);
      }
    } else {
      drone.hideContent();
    }
  }, [overlayContent, orbitPhase]);

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
  const sunLabelRef = useRef<THREE.Object3D | null>(null);
  const projectShowcaseRootRef = useRef<THREE.Group | null>(null);
  const [projectShowcaseReady, setProjectShowcaseReady] = useState(false);
  const [projectShowcaseActive, setProjectShowcaseActive] = useState(false);
  const [projectShowcasePlaying, setProjectShowcasePlaying] = useState(false);
  const [cosmosIntroOverlayOpacity, setCosmosIntroOverlayOpacity] = useState(0);
  const [projectShowcaseEntryOverlayOpacity, setProjectShowcaseEntryOverlayOpacity] =
    useState(0);
  const [projectShowcaseLeverValue, setProjectShowcaseLeverValue] = useState(0);
  const [projectShowcaseAnglePercent, setProjectShowcaseAnglePercentState] =
    useState(PROJECT_SHOWCASE_DEFAULT_ANGLE_PERCENT);
  const [projectShowcaseFocusIndex, setProjectShowcaseFocusIndex] = useState(0);
  const [, setProjectShowcaseViewportTick] = useState(0);
  const projectShowcaseActiveRef = useRef(false);
  const projectShowcasePlayingRef = useRef(false);
  const projectShowcaseLeverValueRef = useRef(0);
  const projectShowcaseAnglePercentRef = useRef(
    PROJECT_SHOWCASE_DEFAULT_ANGLE_PERCENT,
  );
  const projectShowcaseLeverDraggingRef = useRef(false);
  const projectShowcaseLeverFlickRef = useRef(0);
  const projectShowcaseVelocityRef = useRef(0);
  const projectShowcaseJumpTargetRef = useRef<number | null>(null);
  const projectShowcaseForcedFocusIndexRef = useRef<number | null>(null);
  const projectShowcaseLeverRectRef = useRef<DOMRect | null>(null);
  const projectShowcaseLeverLastSampleRef = useRef<{
    value: number;
    t: number;
  } | null>(null);
  const projectShowcaseFocusIndexRef = useRef(0);
  const projectShowcaseLastTickRef = useRef<number | null>(null);
  const projectShowcasePanelsRef = useRef<ShowcasePanelRecord[]>([]);
  const projectShowcaseTrackRef = useRef<{
    axis: "x" | "z";
    minRun: number;
    maxRun: number;
    centerCross: number;
    cameraHeight: number;
    lookAhead: number;
    speed: number;
    cullHalfWindow: number;
  } | null>(null);
  const projectShowcaseRunPosRef = useRef(0);
  const projectShowcasePrevControlsEnabledRef = useRef(true);
  const pendingProjectShowcaseEntryRef = useRef(false);
  const projectShowcaseAwaitingProjectsArrivalRef = useRef(false);
  const projectShowcaseSawProjectsTravelRef = useRef(false);
  const projectShowcaseEntrySequenceRef = useRef<{
    active: boolean;
    raf: number | null;
  }>({ active: false, raf: null });
  const projectShowcaseExitSequenceRef = useRef<{
    active: boolean;
    raf: number | null;
  }>({ active: false, raf: null });
  const projectShowcaseQueuedNavRef = useRef<{
    targetId: string;
    targetType: "section" | "moon";
  } | null>(null);
  const projectShowcaseWorldAnchorRef = useRef<THREE.Vector3 | null>(null);
  const projectShowcaseNebulaRootRef = useRef<THREE.Object3D | null>(null);
  const skillsLatticeRootRef = useRef<THREE.Group | null>(null);
  const skillsLatticeNodesRef = useRef<SkillsLatticeNodeRecord[]>([]);
  const skillsLatticeLineMatsRef = useRef<THREE.LineBasicMaterial[]>([]);
  const skillsLatticeLinkSegmentsRef = useRef<SkillsLatticeLinkSegment[]>([]);
  const skillsLatticeFlowPointsRef = useRef<THREE.Points | null>(null);
  const skillsLatticeFlowMetaRef = useRef<
    Array<{ segmentIndex: number; offset: number; speed: number }>
  >([]);
  const skillsLatticeRippleRef = useRef<{
    active: boolean;
    center: THREE.Vector3;
    startedAt: number;
  }>({
    active: false,
    center: new THREE.Vector3(),
    startedAt: 0,
  });
  const skillsLatticeSelectedNodeRef = useRef<SkillsLatticeNodeRecord | null>(null);
  const skillsLegacyBodiesRef = useRef<THREE.Object3D[]>([]);
  const skillsLatticePendingEntryRef = useRef(false);
  const skillsLatticeActiveRef = useRef(false);
  const [skillsLatticeActive, setSkillsLatticeActive] = useState(false);
  const skillsLatticePrevStateRef = useRef<{
    followingSpaceship: boolean;
    shipVisible: boolean;
    controlsEnabled: boolean;
  } | null>(null);
  const projectShowcaseNebulaDebugLastLogMsRef = useRef(0);
  const projectShowcaseNebulaDebugLastAlphaBucketRef = useRef(-1);
  const [skillsLatticeSelection, setSkillsLatticeSelection] = useState<{
    label: string;
    nodeType: "category" | "skill";
    category: string;
    detailItems: string[];
  } | null>(null);
  const projectShowcaseAngleIntroRef = useRef<{
    raf: number | null;
  }>({ raf: null });
  const projectShowcasePrevStateRef = useRef<{
    followingSpaceship: boolean;
    shipVisible: boolean;
  } | null>(null);
  const spaceshipCameraOffsetRef = useRef(
    new THREE.Vector3(0, FOLLOW_HEIGHT, FOLLOW_DISTANCE),
  );
  const cosmosIntroPlayedRef = useRef(false);


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
  // shipWanderIntervalRef removed — ship no longer wanders autonomously

  // Accumulated roll offset (radians), kept for nav orientation consistency.
  const shipRollOffsetRef = useRef<number>(0);

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

  // --- STAR DESTROYER refs ---
  const starDestroyerRef = useRef<THREE.Group | null>(null);
  const starDestroyerCruiserRef = useRef<StarDestroyerCruiser | null>(null);
  const [followingStarDestroyer, setFollowingStarDestroyer] = useState(false);
  const followingStarDestroyerRef = useRef(false);

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
    isLightspeedActive: boolean;
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
    isLightspeedActive: false,
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
      parentId: "experience",
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
      optionsRef.current.spaceMoonOrbitSpeed ?? 0;

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

  // Ref that stays true whenever moon orbit is active — used by pointer
  // interaction handlers to suppress moon-rotation drags and overlay-exit clicks.
  const orbitActiveRef = useRef(false);
  const pendingOrbitExitNavigationRef = useRef<{
    targetId: string;
    targetType: "section" | "moon";
    departure?: { moonCenter: THREE.Vector3; moonRadius: number };
  } | null>(null);

  const captureMoonDepartureContext = useCallback(() => {
    const moon = focusedMoonRef.current;
    if (!moon) return undefined;
    const moonCenter = new THREE.Vector3();
    moon.getWorldPosition(moonCenter);
    const geo = moon.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const moonRadius = (geo.boundingSphere?.radius ?? 30) * moon.scale.x;
    return { moonCenter, moonRadius };
  }, []);

  const { buildRotationHandlers, buildPointerHandlers } =
    usePointerInteractions({
      mountRef,
      focusedMoonRef,
      isDraggingRef,
      lastPointerRef,
      sceneRef,
      insideShipRef,
      orbitActiveRef,
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
    onMoonOrbitArrivalRef,
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
    shipLog,
    debugLog,
    manualFlightRef,
    spaceshipPathRef,
    enterMoonViewRef,
    shipRollOffsetRef,
    optionsRef,
    followingStarDestroyerRef,
    setFollowingStarDestroyer,
    resolveSpecialSectionTarget: (targetId) => {
      if (targetId !== "projects") return null;
      return projectShowcaseWorldAnchorRef.current
        ? projectShowcaseWorldAnchorRef.current.clone()
        : null;
    },
  });

  const setProjectShowcaseFocus = useCallback((index: number) => {
    const panels = projectShowcasePanelsRef.current;
    if (panels.length === 0) return;
    const safeIndex = THREE.MathUtils.clamp(index, 0, panels.length - 1);
    projectShowcaseFocusIndexRef.current = safeIndex;
    setProjectShowcaseFocusIndex(safeIndex);
  }, []);

  const setProjectShowcaseRunPosition = useCallback((runPos: number) => {
    projectShowcaseRunPosRef.current = runPos;
    const panels = projectShowcasePanelsRef.current;
    if (panels.length === 0) return;
    const track = projectShowcaseTrackRef.current;
    const minRun = track ? track.minRun + 10 : -Infinity;
    const maxRun = track ? track.maxRun - 10 : Infinity;

    const forcedIndex = projectShowcaseForcedFocusIndexRef.current;
    if (forcedIndex !== null) {
      setProjectShowcaseFocus(forcedIndex);
    } else {
      // Find nearest panel by true panel centers for stable highlight timing.
      let bestIndex = 0;
      let bestDist = Infinity;
      panels.forEach((panel, idx) => {
        const panelCenter = THREE.MathUtils.clamp(panel.runPos, minRun, maxRun);
        const d = Math.abs(panelCenter - runPos);
        if (d < bestDist) {
          bestDist = d;
          bestIndex = idx;
        }
      });
      setProjectShowcaseFocus(bestIndex);
    }

    if (!track) return;
    const halfWindow = track.cullHalfWindow;
    panels.forEach((panel) => {
      panel.group.visible = Math.abs(panel.runPos - runPos) <= halfWindow;
    });
  }, [setProjectShowcaseFocus]);

  const setProjectShowcaseLever = useCallback((value: number) => {
    const clamped = THREE.MathUtils.clamp(value, -1, 1);
    projectShowcaseLeverValueRef.current = clamped;
    setProjectShowcaseLeverValue(clamped);
  }, []);

  const setProjectShowcaseAnglePercent = useCallback((value: number) => {
    const clamped = THREE.MathUtils.clamp(
      value,
      PROJECT_SHOWCASE_MIN_ANGLE_PERCENT,
      PROJECT_SHOWCASE_MAX_ANGLE_PERCENT,
    );
    projectShowcaseAnglePercentRef.current = clamped;
    setProjectShowcaseAnglePercentState(clamped);
  }, []);

  function applyProjectShowcaseNebulaFade(alphaValue: number) {
    const nebulaRoot = projectShowcaseNebulaRootRef.current;
    if (!nebulaRoot) return;
    const alpha = THREE.MathUtils.clamp(alphaValue, 0, 1);
    nebulaRoot.visible = alpha > 0.001;
    nebulaRoot.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!(mesh as any).isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        const m = mat as THREE.Material & {
          transparent?: boolean;
          opacity?: number;
          userData?: Record<string, unknown>;
        };
        const base = Number((m.userData?.nebulaBaseOpacity as number) ?? 1);
        m.transparent = true;
        m.opacity = base * alpha;
      });
    });
    const alphaBucket = Math.round(alpha * 10);
    if (alphaBucket !== projectShowcaseNebulaDebugLastAlphaBucketRef.current) {
      projectShowcaseNebulaDebugLastAlphaBucketRef.current = alphaBucket;
      vlog(
        `🌌 Nebula fade alpha=${alpha.toFixed(2)} visible=${nebulaRoot.visible ? "yes" : "no"}`,
      );
    }
  }

  const getFocusedProjectShowcasePanel = useCallback(() => {
    const panels = projectShowcasePanelsRef.current;
    if (panels.length === 0) return null;
    const idx = THREE.MathUtils.clamp(
      projectShowcaseFocusIndexRef.current,
      0,
      panels.length - 1,
    );
    return panels[idx];
  }, []);

  const bumpProjectShowcaseViewportTick = useCallback(() => {
    setProjectShowcaseViewportTick((v) => v + 1);
  }, []);

  const applyProjectShowcasePanelViewport = useCallback(
    (panel: ShowcasePanelRecord) => {
      const texture = panel.texture;
      if (!texture) return;

      const baseRepeatX = panel.baseRepeat.x;
      const baseRepeatY = panel.baseRepeat.y;
      const zoom = THREE.MathUtils.clamp(panel.zoom, 1, 4);
      panel.zoom = zoom;
      const repX = baseRepeatX / zoom;
      const repY = baseRepeatY / zoom;
      const minPanX = -panel.baseOffset.x;
      const maxPanX = (1 - repX) - panel.baseOffset.x;
      const minPanY = -panel.baseOffset.y;
      const maxPanY = (1 - repY) - panel.baseOffset.y;
      panel.panX = THREE.MathUtils.clamp(panel.panX, minPanX, maxPanX);
      panel.panY = THREE.MathUtils.clamp(panel.panY, minPanY, maxPanY);

      texture.repeat.set(repX, repY);
      texture.offset.set(
        panel.baseOffset.x + panel.panX,
        panel.baseOffset.y + panel.panY,
      );
      texture.needsUpdate = true;
    },
    [],
  );

  const resetProjectShowcasePanelViewport = useCallback(
    (index?: number) => {
      const panels = projectShowcasePanelsRef.current;
      if (panels.length === 0) return;
      const safeIndex =
        index ??
        THREE.MathUtils.clamp(
          projectShowcaseFocusIndexRef.current,
          0,
          panels.length - 1,
        );
      const panel = panels[safeIndex];
      if (projectShowcasePlayingRef.current) {
        projectShowcasePlayingRef.current = false;
        setProjectShowcasePlaying(false);
      }
      panel.zoom = 1;
      panel.panX = 0;
      panel.panY = 0;
      applyProjectShowcasePanelViewport(panel);
      bumpProjectShowcaseViewportTick();
    },
    [applyProjectShowcasePanelViewport, bumpProjectShowcaseViewportTick],
  );

  const nudgeProjectShowcasePanelViewport = useCallback(
    (xDir: -1 | 0 | 1, yDir: -1 | 0 | 1) => {
      const panel = getFocusedProjectShowcasePanel();
      if (!panel || !panel.texture) return;
      if (projectShowcasePlayingRef.current) {
        projectShowcasePlayingRef.current = false;
        setProjectShowcasePlaying(false);
      }
      const zoom = THREE.MathUtils.clamp(panel.zoom, 1, 4);
      const repX = panel.baseRepeat.x / zoom;
      const repY = panel.baseRepeat.y / zoom;
      const panRangeX = Math.max(0, 1 - repX);
      const panRangeY = Math.max(0, 1 - repY);
      const stepX = Math.max(panRangeX * 0.14, 0.008);
      const stepY = Math.max(panRangeY * 0.14, 0.008);
      panel.panX += xDir * stepX;
      panel.panY += yDir * stepY;
      applyProjectShowcasePanelViewport(panel);
      bumpProjectShowcaseViewportTick();
    },
    [
      getFocusedProjectShowcasePanel,
      applyProjectShowcasePanelViewport,
      bumpProjectShowcaseViewportTick,
    ],
  );

  const setProjectShowcasePanelZoom = useCallback(
    (zoom: number) => {
      const panel = getFocusedProjectShowcasePanel();
      if (!panel || !panel.texture) return;
      if (projectShowcasePlayingRef.current) {
        projectShowcasePlayingRef.current = false;
        setProjectShowcasePlaying(false);
      }
      const prevZoom = THREE.MathUtils.clamp(panel.zoom, 1, 4);
      const nextZoom = THREE.MathUtils.clamp(zoom, 1, 4);
      const prevRepX = panel.baseRepeat.x / prevZoom;
      const prevRepY = panel.baseRepeat.y / prevZoom;
      const nextRepX = panel.baseRepeat.x / nextZoom;
      const nextRepY = panel.baseRepeat.y / nextZoom;
      // Keep zoom centered on the current viewport center.
      panel.panX += (prevRepX - nextRepX) * 0.5;
      panel.panY += (prevRepY - nextRepY) * 0.5;
      panel.zoom = nextZoom;
      applyProjectShowcasePanelViewport(panel);
      bumpProjectShowcaseViewportTick();
    },
    [
      getFocusedProjectShowcasePanel,
      applyProjectShowcasePanelViewport,
      bumpProjectShowcaseViewportTick,
    ],
  );

  const updateProjectShowcaseLeverFromClientY = useCallback(
    (clientY: number, rect: DOMRect) => {
      const centerY = rect.top + rect.height * 0.5;
      const normalized = (centerY - clientY) / Math.max(1, rect.height * 0.5);
      setProjectShowcaseLever(normalized);
      return THREE.MathUtils.clamp(normalized, -1, 1);
    },
    [setProjectShowcaseLever],
  );

  const startProjectShowcaseLeverDrag = useCallback(
    (clientY: number, rect: DOMRect) => {
      if (projectShowcasePlayingRef.current) {
        projectShowcasePlayingRef.current = false;
        setProjectShowcasePlaying(false);
      }
      projectShowcaseJumpTargetRef.current = null;
      projectShowcaseForcedFocusIndexRef.current = null;
      projectShowcaseLeverDraggingRef.current = true;
      projectShowcaseLeverFlickRef.current = 0;
      const value = updateProjectShowcaseLeverFromClientY(clientY, rect);
      projectShowcaseLeverLastSampleRef.current = {
        value,
        t: performance.now(),
      };
    },
    [updateProjectShowcaseLeverFromClientY],
  );

  const moveProjectShowcaseLeverDrag = useCallback(
    (clientY: number, rect: DOMRect) => {
      if (!projectShowcaseLeverDraggingRef.current) return;
      const value = updateProjectShowcaseLeverFromClientY(clientY, rect);
      const now = performance.now();
      const sample = projectShowcaseLeverLastSampleRef.current;
      if (sample) {
        const dt = Math.max((now - sample.t) / 1000, 1 / 240);
        const dv = value - sample.value;
        projectShowcaseLeverFlickRef.current = THREE.MathUtils.clamp(
          dv / dt,
          -4,
          4,
        );
      }
      projectShowcaseLeverLastSampleRef.current = { value, t: now };
    },
    [updateProjectShowcaseLeverFromClientY],
  );

  const endProjectShowcaseLeverDrag = useCallback(() => {
    if (!projectShowcaseLeverDraggingRef.current) return;
    projectShowcaseLeverDraggingRef.current = false;
    projectShowcaseLeverLastSampleRef.current = null;
    const track = projectShowcaseTrackRef.current;
    if (track) {
      const maxManualSpeed = track.speed * 2.4;
      const impulse = projectShowcaseLeverFlickRef.current * track.speed * 0.15;
      projectShowcaseVelocityRef.current = THREE.MathUtils.clamp(
        projectShowcaseVelocityRef.current + impulse,
        -maxManualSpeed,
        maxManualSpeed,
      );
    }
    projectShowcaseLeverFlickRef.current = 0;
    setProjectShowcaseLever(0);
  }, [setProjectShowcaseLever]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!projectShowcaseLeverDraggingRef.current) return;
      const rect = projectShowcaseLeverRectRef.current;
      if (!rect) return;
      moveProjectShowcaseLeverDrag(e.clientY, rect);
      e.preventDefault();
    };
    const onPointerUp = () => {
      endProjectShowcaseLeverDrag();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [endProjectShowcaseLeverDrag, moveProjectShowcaseLeverDrag]);

  const exitProjectShowcase = useCallback(() => {
    if (projectShowcaseAngleIntroRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseAngleIntroRef.current.raf);
      projectShowcaseAngleIntroRef.current.raf = null;
    }
    if (projectShowcaseExitSequenceRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseExitSequenceRef.current.raf);
      projectShowcaseExitSequenceRef.current.raf = null;
    }
    projectShowcaseExitSequenceRef.current.active = false;
    projectShowcaseQueuedNavRef.current = null;
    if (projectShowcaseEntrySequenceRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseEntrySequenceRef.current.raf);
      projectShowcaseEntrySequenceRef.current.raf = null;
    }
    projectShowcaseEntrySequenceRef.current.active = false;
    setProjectShowcaseEntryOverlayOpacity(0);
    const showcaseRoot = projectShowcaseRootRef.current;
    if (showcaseRoot) {
      showcaseRoot.visible = false;
    }
    if (sunLabelRef.current) {
      sunLabelRef.current.visible = true;
    }
    if (sceneRef.current.camera) {
      sceneRef.current.camera.layers.disable(PROJECT_SHOWCASE_LAYER);
    }
    if (sceneRef.current.controls) {
      sceneRef.current.controls.enabled =
        projectShowcasePrevControlsEnabledRef.current;
    }

    const prev = projectShowcasePrevStateRef.current;
    if (prev) {
      setFollowingSpaceship(prev.followingSpaceship);
      followingSpaceshipRef.current = prev.followingSpaceship;
      if (spaceshipRef.current) {
        spaceshipRef.current.visible = prev.shipVisible;
      }
      projectShowcasePrevStateRef.current = null;
    } else if (spaceshipRef.current) {
      spaceshipRef.current.visible = true;
    }

    projectShowcaseActiveRef.current = false;
    setProjectShowcaseActive(false);
    projectShowcasePlayingRef.current = true;
    setProjectShowcasePlaying(true);
    projectShowcaseVelocityRef.current = 0;
    projectShowcaseJumpTargetRef.current = null;
    projectShowcaseForcedFocusIndexRef.current = null;
    projectShowcaseLeverDraggingRef.current = false;
    projectShowcaseLeverFlickRef.current = 0;
    projectShowcaseLeverLastSampleRef.current = null;
    setProjectShowcaseLever(0);
    projectShowcaseLastTickRef.current = null;
    pendingProjectShowcaseEntryRef.current = false;
    projectShowcaseAwaitingProjectsArrivalRef.current = false;
    projectShowcaseSawProjectsTravelRef.current = false;
    vlog("🛰️ Project Showcase exited");
  }, [setProjectShowcaseLever, vlog]);

  const enterProjectShowcase = useCallback(() => {
    if (projectShowcaseAngleIntroRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseAngleIntroRef.current.raf);
      projectShowcaseAngleIntroRef.current.raf = null;
    }
    if (projectShowcaseExitSequenceRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseExitSequenceRef.current.raf);
      projectShowcaseExitSequenceRef.current.raf = null;
    }
    projectShowcaseExitSequenceRef.current.active = false;
    projectShowcaseQueuedNavRef.current = null;
    if (projectShowcaseEntrySequenceRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseEntrySequenceRef.current.raf);
      projectShowcaseEntrySequenceRef.current.raf = null;
    }
    projectShowcaseEntrySequenceRef.current.active = false;
    const showcaseRoot = projectShowcaseRootRef.current;
    const controls = sceneRef.current.controls;
    const camera = sceneRef.current.camera;
    if (!showcaseRoot || !controls || !camera) {
      vlog("⚠️ Project Showcase is not ready yet");
      return;
    }

    if (projectShowcaseActiveRef.current) return;

    projectShowcasePrevStateRef.current = {
      followingSpaceship: followingSpaceshipRef.current,
      shipVisible: spaceshipRef.current?.visible ?? true,
    };

    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    setInsideShip(false);
    insideShipRef.current = false;
    setShipViewMode("exterior");
    shipViewModeRef.current = "exterior";
    if (spaceshipRef.current) spaceshipRef.current.visible = false;

    showcaseRoot.visible = true;
    if (sunLabelRef.current) {
      sunLabelRef.current.visible = false;
    }

    projectShowcasePrevControlsEnabledRef.current = controls.enabled;
    controls.enabled = false;
    camera.layers.enable(PROJECT_SHOWCASE_LAYER);

    const track = projectShowcaseTrackRef.current;
    if (track) {
      const startRun = track.minRun + 8;
      setProjectShowcaseRunPosition(startRun);
      projectShowcaseLastTickRef.current = performance.now();
    }
    projectShowcasePlayingRef.current = false;
    setProjectShowcasePlaying(false);
    projectShowcaseVelocityRef.current = 0;
    projectShowcaseJumpTargetRef.current = null;
    projectShowcaseForcedFocusIndexRef.current = null;
    projectShowcaseLeverDraggingRef.current = false;
    projectShowcaseLeverFlickRef.current = 0;
    projectShowcaseLeverLastSampleRef.current = null;
    setProjectShowcaseLever(0);

    projectShowcaseActiveRef.current = true;
    setProjectShowcaseActive(true);
    pendingProjectShowcaseEntryRef.current = false;
    projectShowcaseAwaitingProjectsArrivalRef.current = false;
    projectShowcaseSawProjectsTravelRef.current = false;
    startProjectShowcaseAngleIntroSequence();
    vlog("🛰️ Entered Project Showcase");
  }, [
    setProjectShowcaseLever,
    setProjectShowcaseRunPosition,
    vlog,
  ]);

  const toggleProjectShowcasePlayback = useCallback(() => {
    const next = !projectShowcasePlayingRef.current;
    projectShowcasePlayingRef.current = next;
    setProjectShowcasePlaying(next);
    if (next) {
      projectShowcaseVelocityRef.current = 0;
      projectShowcaseJumpTargetRef.current = null;
      projectShowcaseForcedFocusIndexRef.current = null;
      setProjectShowcaseLever(0);
    }
  }, [setProjectShowcaseLever]);

  function startProjectShowcaseAngleIntroSequence() {
    if (projectShowcaseAngleIntroRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseAngleIntroRef.current.raf);
      projectShowcaseAngleIntroRef.current.raf = null;
    }
    // Step 1: immediately parallel to trench wall.
    setProjectShowcaseAnglePercent(0);
    projectShowcasePlayingRef.current = false;
    setProjectShowcasePlaying(false);

    const holdBeforeAngleMs = 2000;
    const angleAnimMs = 1000;
    const holdAfterAngleMs = 1000;
    const totalMs = holdBeforeAngleMs + angleAnimMs + holdAfterAngleMs;
    const startedAt = performance.now();
    const tick = () => {
      if (!projectShowcaseActiveRef.current) {
        projectShowcaseAngleIntroRef.current.raf = null;
        return;
      }
      const elapsed = performance.now() - startedAt;
      if (elapsed < holdBeforeAngleMs) {
        // Step 1: hold for 2s with images parallel to trench walls.
        setProjectShowcaseAnglePercent(0);
      } else if (elapsed < holdBeforeAngleMs + angleAnimMs) {
        // Step 2: animate to 50% over 1s.
        const t = THREE.MathUtils.clamp(
          (elapsed - holdBeforeAngleMs) / angleAnimMs,
          0,
          1,
        );
        const eased = t * t * (3 - 2 * t);
        setProjectShowcaseAnglePercent(THREE.MathUtils.lerp(0, 50, eased));
      } else {
        // Step 3: hold at 50% for 1s.
        setProjectShowcaseAnglePercent(50);
      }

      if (elapsed >= totalMs) {
        // Step 4: start autoplay after full choreography.
        projectShowcasePlayingRef.current = true;
        setProjectShowcasePlaying(true);
        projectShowcaseAngleIntroRef.current.raf = null;
        return;
      }
      projectShowcaseAngleIntroRef.current.raf = requestAnimationFrame(tick);
    };
    projectShowcaseAngleIntroRef.current.raf = requestAnimationFrame(tick);
  }

  const startProjectShowcaseEntrySequence = useCallback(() => {
    if (projectShowcaseActiveRef.current) return;
    if (projectShowcaseEntrySequenceRef.current.active) return;
    const showcaseRoot = projectShowcaseRootRef.current;
    const controls = sceneRef.current.controls;
    const camera = sceneRef.current.camera;
    const track = projectShowcaseTrackRef.current;
    if (!showcaseRoot || !controls || !camera || !track) {
      enterProjectShowcase();
      return;
    }

    pendingProjectShowcaseEntryRef.current = false;
    projectShowcaseAwaitingProjectsArrivalRef.current = false;
    projectShowcaseSawProjectsTravelRef.current = false;
    projectShowcaseEntrySequenceRef.current.active = true;
    setProjectShowcaseEntryOverlayOpacity(0);
    showcaseRoot.visible = true;
    camera.layers.enable(PROJECT_SHOWCASE_LAYER);
    controls.enabled = false;
    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    setFollowingStarDestroyer(false);
    followingStarDestroyerRef.current = false;
    setInsideShip(false);
    insideShipRef.current = false;
    setShipViewMode("exterior");
    shipViewModeRef.current = "exterior";
    if (shipCinematicRef.current) {
      shipCinematicRef.current.active = false;
    }

    const rootPos = new THREE.Vector3();
    showcaseRoot.getWorldPosition(rootPos);
    const run = track.minRun + 8;
    const sway = Math.sin(run * 0.025) * 1.2;
    const travelAxis =
      track.axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const crossAxis =
      track.axis === "z" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1);
    const trenchCam = new THREE.Vector3();
    const trenchTarget = new THREE.Vector3();
    if (track.axis === "z") {
      trenchCam.set(
        rootPos.x + track.centerCross + sway,
        rootPos.y + track.cameraHeight,
        rootPos.z + run,
      );
      trenchTarget.set(
        rootPos.x + track.centerCross,
        rootPos.y + track.cameraHeight - 0.3,
        rootPos.z + run + track.lookAhead,
      );
    } else {
      trenchCam.set(
        rootPos.x + run,
        rootPos.y + track.cameraHeight,
        rootPos.z + track.centerCross + sway,
      );
      trenchTarget.set(
        rootPos.x + run + track.lookAhead,
        rootPos.y + track.cameraHeight - 0.3,
        rootPos.z + track.centerCross,
      );
    }

    const startCam = camera.position.clone();
    const startTarget = new THREE.Vector3();
    const controlsAny = controls as unknown as {
      getTarget?: (out: THREE.Vector3) => void;
    };
    if (controlsAny.getTarget) {
      controlsAny.getTarget(startTarget);
    } else {
      const fallbackDir = new THREE.Vector3();
      camera.getWorldDirection(fallbackDir);
      startTarget.copy(startCam).addScaledVector(fallbackDir, 24);
    }

    // Road-to-horizon style final: long, mostly level approach from behind.
    const finalApproachDist = track.lookAhead * 5.8;
    const approachCam = trenchCam
      .clone()
      .addScaledVector(travelAxis, -finalApproachDist)
      .addScaledVector(crossAxis, 1.2)
      .add(new THREE.Vector3(0, 5.2, 0));
    const approachTarget = trenchTarget
      .clone()
      .addScaledVector(travelAxis, -finalApproachDist * 0.26)
      .addScaledVector(crossAxis, 0.45)
      .add(new THREE.Vector3(0, 1.1, 0));
    // Hold near-horizon altitude for most of the entry run.
    const horizonY = THREE.MathUtils.lerp(startCam.y, trenchCam.y + 5.2, 0.14);
    approachCam.y = horizonY;
    approachTarget.y = horizonY - 0.25;

    const ship = spaceshipRef.current;
    if (ship) ship.visible = true;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const smoothstep = (t: number) => t * t * (3 - 2 * t);
    const durationMs = 4400;
    const phaseSplit = 0.84;
    const startedAt = performance.now();
    const tempCam = new THREE.Vector3();
    const tempTarget = new THREE.Vector3();
    vlog("🎬 Project Showcase entry sequence start");
    const tick = () => {
      if (!projectShowcaseEntrySequenceRef.current.active) return;
      const elapsed = performance.now() - startedAt;
      const t = THREE.MathUtils.clamp(elapsed / durationMs, 0, 1);
      if (t < phaseSplit) {
        const p = easeOutCubic(t / phaseSplit);
        tempCam.lerpVectors(startCam, approachCam, p);
        tempTarget.lerpVectors(startTarget, approachTarget, p);
      } else {
        const p = smoothstep((t - phaseSplit) / (1 - phaseSplit));
        tempCam.lerpVectors(approachCam, trenchCam, p);
        tempTarget.lerpVectors(approachTarget, trenchTarget, p);
      }
      controls.setLookAt(
        tempCam.x,
        tempCam.y,
        tempCam.z,
        tempTarget.x,
        tempTarget.y,
        tempTarget.z,
        false,
      );

      if (ship) {
        const shipForward = tempTarget.clone().sub(tempCam).normalize();
        const shipPos = tempCam
          .clone()
          .addScaledVector(shipForward, 8.4)
          .add(new THREE.Vector3(0, -1.8, 0));
        const glideNoseDown = THREE.MathUtils.lerp(-0.28, -0.06, t);
        const shipAim = shipPos
          .clone()
          .addScaledVector(shipForward, 18)
          .add(new THREE.Vector3(0, -glideNoseDown, 0));
        ship.position.copy(shipPos);
        const lookMat = new THREE.Matrix4();
        lookMat.lookAt(shipPos, shipAim, new THREE.Vector3(0, 1, 0));
        ship.quaternion.setFromRotationMatrix(lookMat);
        const forwardOffset = ship.userData?.forwardOffset as
          | THREE.Quaternion
          | undefined;
        if (forwardOffset) ship.quaternion.multiply(forwardOffset);
      }

      const nebulaFade = THREE.MathUtils.clamp((t - 0.06) / 0.58, 0, 1);
      applyProjectShowcaseNebulaFade(nebulaFade);

      if (t >= 1) {
        vlog("🎬 Project Showcase entry sequence complete");
        applyProjectShowcaseNebulaFade(1);
        enterProjectShowcase();
        window.setTimeout(() => {
          setProjectShowcaseEntryOverlayOpacity(0);
          projectShowcaseEntrySequenceRef.current.active = false;
          projectShowcaseEntrySequenceRef.current.raf = null;
        }, 180);
        return;
      }
      projectShowcaseEntrySequenceRef.current.raf = requestAnimationFrame(tick);
    };

    projectShowcaseEntrySequenceRef.current.raf = requestAnimationFrame(tick);
  }, [
    enterProjectShowcase,
    setFollowingStarDestroyer,
    setProjectShowcaseEntryOverlayOpacity,
  ]);

  const startProjectShowcaseExitSequence = useCallback(
    (targetId: string, targetType: "section" | "moon") => {
      projectShowcaseQueuedNavRef.current = { targetId, targetType };
      if (projectShowcaseExitSequenceRef.current.active) return true;
      if (!projectShowcaseActiveRef.current) return false;

      const showcaseRoot = projectShowcaseRootRef.current;
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      const track = projectShowcaseTrackRef.current;
      if (!showcaseRoot || !controls || !camera || !track) {
        exitProjectShowcase();
        return false;
      }

      if (projectShowcaseEntrySequenceRef.current.raf !== null) {
        cancelAnimationFrame(projectShowcaseEntrySequenceRef.current.raf);
        projectShowcaseEntrySequenceRef.current.raf = null;
      }
      projectShowcaseEntrySequenceRef.current.active = false;
      projectShowcaseExitSequenceRef.current.active = true;
      setFollowingSpaceship(false);
      followingSpaceshipRef.current = false;
      setInsideShip(false);
      insideShipRef.current = false;
      setShipViewMode("exterior");
      shipViewModeRef.current = "exterior";
      if (shipCinematicRef.current) {
        shipCinematicRef.current.active = false;
      }

      projectShowcasePlayingRef.current = false;
      setProjectShowcasePlaying(false);
      projectShowcaseVelocityRef.current = 0;
      projectShowcaseJumpTargetRef.current = null;

      const rootPos = new THREE.Vector3();
      showcaseRoot.getWorldPosition(rootPos);
      const startCam = camera.position.clone();
      const startTarget = new THREE.Vector3();
      const controlsAny = controls as unknown as {
        getTarget?: (out: THREE.Vector3) => void;
      };
      if (controlsAny.getTarget) {
        controlsAny.getTarget(startTarget);
      } else {
        startTarget
          .copy(startCam)
          .add(track.axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0))
          .add(new THREE.Vector3(0, -1.2, 0));
      }
      const flightDir = startTarget.clone().sub(startCam).normalize();
      if (flightDir.lengthSq() < 1e-4) {
        flightDir.copy(track.axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0));
      }

      const pullUpCam = startCam
        .clone()
        .addScaledVector(flightDir, track.lookAhead * 0.95)
        .add(new THREE.Vector3(0, 12, 0));
      const pullUpTarget = startTarget
        .clone()
        .addScaledVector(flightDir, track.lookAhead * 1.8)
        .add(new THREE.Vector3(0, 2, 0));
      const jumpCam = pullUpCam
        .clone()
        .addScaledVector(flightDir, track.lookAhead * 2.35)
        .add(new THREE.Vector3(0, 10, 0));
      const jumpTarget = jumpCam
        .clone()
        .addScaledVector(flightDir, track.lookAhead * 2.5)
        .add(new THREE.Vector3(0, 1, 0));
      const ship = spaceshipRef.current;
      if (ship) ship.visible = true;
      applyProjectShowcaseNebulaFade(1);

      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
      const smoothstep = (t: number) => t * t * (3 - 2 * t);
      const durationMs = 2400;
      const split = 0.62;
      const startedAt = performance.now();
      const tempCam = new THREE.Vector3();
      const tempTarget = new THREE.Vector3();
      vlog("🎬 Project Showcase exit sequence start");
      const tick = () => {
        if (!projectShowcaseExitSequenceRef.current.active) return;
        const elapsed = performance.now() - startedAt;
        const t = THREE.MathUtils.clamp(elapsed / durationMs, 0, 1);
        if (t < split) {
          const p = easeOutCubic(t / split);
          tempCam.lerpVectors(startCam, pullUpCam, p);
          tempTarget.lerpVectors(startTarget, pullUpTarget, p);
        } else {
          const p = smoothstep((t - split) / (1 - split));
          tempCam.lerpVectors(pullUpCam, jumpCam, p);
          tempTarget.lerpVectors(pullUpTarget, jumpTarget, p);
        }
        controls.setLookAt(
          tempCam.x,
          tempCam.y,
          tempCam.z,
          tempTarget.x,
          tempTarget.y,
          tempTarget.z,
          false,
        );
        if (ship) {
          const shipForward = tempTarget.clone().sub(tempCam).normalize();
          const shipPos = tempCam
            .clone()
            .addScaledVector(shipForward, 8.8)
            .add(new THREE.Vector3(0, -2.0, 0));
          const climbNoseUp = THREE.MathUtils.lerp(1.4, 5.2, t);
          const shipAim = shipPos
            .clone()
            .addScaledVector(shipForward, 18)
            .add(new THREE.Vector3(0, climbNoseUp, 0));
          ship.position.copy(shipPos);
          const lookMat = new THREE.Matrix4();
          lookMat.lookAt(shipPos, shipAim, new THREE.Vector3(0, 1, 0));
          ship.quaternion.setFromRotationMatrix(lookMat);
          const forwardOffset = ship.userData?.forwardOffset as
            | THREE.Quaternion
            | undefined;
          if (forwardOffset) ship.quaternion.multiply(forwardOffset);
        }

        if (t >= 1) {
          projectShowcaseExitSequenceRef.current.active = false;
          projectShowcaseExitSequenceRef.current.raf = null;
          const queued = projectShowcaseQueuedNavRef.current;
          projectShowcaseQueuedNavRef.current = null;
          exitProjectShowcase();
          setProjectShowcaseEntryOverlayOpacity(0);
          if (queued) {
            setFollowingSpaceship(true);
            followingSpaceshipRef.current = true;
            if (!manualFlightModeRef.current) {
              handleAutopilotNavigation(queued.targetId, queued.targetType);
            } else {
              const fallbackTarget =
                queued.targetType === "moon"
                  ? `experience-${queued.targetId}`
                  : queued.targetId;
              handleNavigationRef.current?.(fallbackTarget);
            }
          }
          vlog("🎬 Project Showcase exit sequence complete");
          return;
        }
        projectShowcaseExitSequenceRef.current.raf = requestAnimationFrame(tick);
      };

      projectShowcaseExitSequenceRef.current.raf = requestAnimationFrame(tick);
      return true;
    },
    [
      exitProjectShowcase,
      handleAutopilotNavigation,
      setProjectShowcaseEntryOverlayOpacity,
      vlog,
    ],
  );

  const focusSkillsLatticeNode = useCallback(
    (node: SkillsLatticeNodeRecord, animate = true) => {
      skillsLatticeSelectedNodeRef.current = node;
      setSkillsLatticeSelection({
        label: node.label,
        nodeType: node.nodeType,
        category: node.category,
        detailItems: node.detailItems,
      });
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      if (!controls || !camera || !skillsLatticeActiveRef.current) return;
      const worldPos = new THREE.Vector3();
      node.mesh.getWorldPosition(worldPos);
      skillsLatticeRippleRef.current.active = true;
      skillsLatticeRippleRef.current.center.copy(worldPos);
      skillsLatticeRippleRef.current.startedAt = performance.now();
      const camPos = camera.position.clone();
      const dir = camPos.sub(worldPos).normalize();
      const nextCam = worldPos.clone().addScaledVector(dir, 62).add(new THREE.Vector3(0, 9, 0));
      controls.setLookAt(
        nextCam.x,
        nextCam.y,
        nextCam.z,
        worldPos.x,
        worldPos.y + 1.2,
        worldPos.z,
        animate,
      );
    },
    [],
  );

  const exitSkillsLattice = useCallback(() => {
    const latticeRoot = skillsLatticeRootRef.current;
    const camera = sceneRef.current.camera;
    const controls = sceneRef.current.controls;
    if (latticeRoot) latticeRoot.visible = false;
    if (camera) camera.layers.disable(SKILLS_LATTICE_LAYER);
    const prev = skillsLatticePrevStateRef.current;
    if (prev) {
      setFollowingSpaceship(prev.followingSpaceship);
      followingSpaceshipRef.current = prev.followingSpaceship;
      if (spaceshipRef.current) {
        spaceshipRef.current.visible = prev.shipVisible;
      }
      if (controls) controls.enabled = prev.controlsEnabled;
    } else {
      setFollowingSpaceship(true);
      followingSpaceshipRef.current = true;
      if (spaceshipRef.current) spaceshipRef.current.visible = true;
      if (controls) controls.enabled = true;
    }
    skillsLegacyBodiesRef.current.forEach((obj) => {
      obj.visible = true;
    });
    skillsLatticePendingEntryRef.current = false;
    skillsLatticePrevStateRef.current = null;
    skillsLatticeActiveRef.current = false;
    setSkillsLatticeActive(false);
    skillsLatticeRippleRef.current.active = false;
    skillsLatticeSelectedNodeRef.current = null;
    setSkillsLatticeSelection(null);
    vlog("🧠 Skills lattice exited");
  }, [vlog]);

  const enterSkillsLattice = useCallback(() => {
    if (skillsLatticeActiveRef.current) return;
    const latticeRoot = skillsLatticeRootRef.current;
    const controls = sceneRef.current.controls;
    const camera = sceneRef.current.camera;
    if (!latticeRoot || !controls || !camera) return;

    skillsLatticePendingEntryRef.current = false;
    skillsLatticePrevStateRef.current = {
      followingSpaceship: followingSpaceshipRef.current,
      shipVisible: spaceshipRef.current?.visible ?? true,
      controlsEnabled: controls.enabled,
    };
    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    if (spaceshipRef.current) spaceshipRef.current.visible = false;
    skillsLegacyBodiesRef.current.forEach((obj) => {
      obj.visible = false;
    });
    latticeRoot.visible = true;
    camera.layers.enable(SKILLS_LATTICE_LAYER);

    const latticePos = new THREE.Vector3();
    latticeRoot.getWorldPosition(latticePos);
    const startCam = camera.position.clone();
    const startTarget = controls.getTarget(new THREE.Vector3());
    const endCam = latticePos
      .clone()
      .add(new THREE.Vector3(0, 42, 118));
    const endTarget = latticePos.clone().add(new THREE.Vector3(0, 8, 0));
    const startedAt = performance.now();
    const durationMs = 1800;
    controls.enabled = false;

    const tick = () => {
      const t = THREE.MathUtils.clamp(
        (performance.now() - startedAt) / durationMs,
        0,
        1,
      );
      const ease = 1 - Math.pow(1 - t, 3);
      const cam = new THREE.Vector3().lerpVectors(startCam, endCam, ease);
      const target = new THREE.Vector3().lerpVectors(startTarget, endTarget, ease);
      controls.setLookAt(cam.x, cam.y, cam.z, target.x, target.y, target.z, false);
      if (t >= 1) {
        controls.enabled = true;
        skillsLatticeActiveRef.current = true;
        setSkillsLatticeActive(true);
        const firstNode = skillsLatticeNodesRef.current.find(
          (n) => n.nodeType === "category",
        );
        if (firstNode) {
          focusSkillsLatticeNode(firstNode, false);
        }
        vlog("🧠 Skills lattice entered");
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [focusSkillsLatticeNode, vlog]);

  const getProjectShowcaseStopRunForIndex = useCallback((index: number) => {
    const panels = projectShowcasePanelsRef.current;
    if (panels.length === 0) return 0;
    const safeIndex = THREE.MathUtils.clamp(index, 0, panels.length - 1);
    const track = projectShowcaseTrackRef.current;
    const minRun = track ? track.minRun + 10 : -Infinity;
    const maxRun = track ? track.maxRun - 10 : Infinity;
    const current = panels[safeIndex].runPos;
    const prev = safeIndex > 0 ? panels[safeIndex - 1].runPos : undefined;
    const next =
      safeIndex < panels.length - 1 ? panels[safeIndex + 1].runPos : undefined;
    const lowerBound =
      prev !== undefined ? (prev + current) * 0.5 + 0.02 : minRun;
    const upperBound =
      next !== undefined ? (current + next) * 0.5 - 0.02 : maxRun;
    return THREE.MathUtils.clamp(
      current - PROJECT_SHOWCASE_NAV_STOP_BACK_OFFSET,
      Math.max(minRun, lowerBound),
      Math.min(maxRun, upperBound),
    );
  }, []);

  const stepProjectShowcaseFocus = useCallback(
    (direction: -1 | 1) => {
      const panels = projectShowcasePanelsRef.current;
      if (panels.length === 0) return;
      projectShowcaseJumpTargetRef.current = null;
      const current = projectShowcaseFocusIndexRef.current;
      const next =
        (current + direction + panels.length) % panels.length;
      projectShowcaseForcedFocusIndexRef.current = next;
      setProjectShowcaseFocus(next);
      setProjectShowcaseRunPosition(getProjectShowcaseStopRunForIndex(next));
    },
    [
      getProjectShowcaseStopRunForIndex,
      setProjectShowcaseFocus,
      setProjectShowcaseRunPosition,
    ],
  );

  const jumpProjectShowcaseToIndex = useCallback(
    (index: number) => {
      const panels = projectShowcasePanelsRef.current;
      if (panels.length === 0) return;
      const safeIndex = THREE.MathUtils.clamp(index, 0, panels.length - 1);
      projectShowcasePlayingRef.current = false;
      setProjectShowcasePlaying(false);
      projectShowcaseVelocityRef.current = 0;
      projectShowcaseJumpTargetRef.current = null;
      projectShowcaseLeverDraggingRef.current = false;
      projectShowcaseLeverFlickRef.current = 0;
      projectShowcaseLeverLastSampleRef.current = null;
      setProjectShowcaseLever(0);
      projectShowcaseForcedFocusIndexRef.current = safeIndex;
      projectShowcaseJumpTargetRef.current =
        getProjectShowcaseStopRunForIndex(safeIndex);
    },
    [getProjectShowcaseStopRunForIndex, setProjectShowcaseLever],
  );

  const handleExperienceCompanyNavigation = useCallback(
    async (companyId: string) => {
      if (!companyId) return;
      if (startProjectShowcaseExitSequence(companyId, "moon")) {
        return;
      }

      // If already orbiting this moon, ignore — don't re-trigger orbit.
      // Clicking the same moon you're hovering over should be a no-op.
      if (isOrbiting() && focusedMoonRef.current) {
        const focusedName = focusedMoonRef.current.userData?.planetName;
        if (focusedName) {
          const focusedId = focusedName.toLowerCase().replace(/\s+/g, "-");
          if (focusedId === companyId) {
            debugLog("nav", `Ignored click on same moon "${companyId}" — already orbiting`);
            return;
          }
        }
      }

      vlog(`🌙 Initiating moon navigation: ${companyId}`);

      // Exit orbit if currently orbiting (different moon)
      if (isOrbiting()) {
        pendingOrbitExitNavigationRef.current = {
          targetId: companyId,
          targetType: "moon",
          departure: captureMoonDepartureContext(),
        };
        exitOrbit();
        setOrbitPhase("exiting");
        shipLog("Departing orbit — new destination", "orbit");
        return;
      }

      // Always use autopilot — ship flies to the moon, then moon view activates
      if (!manualFlightModeRef.current) {
        handleAutopilotNavigation(companyId, "moon");
        return;
      }

      vlog(`⚠️ Cannot navigate in manual flight mode`);
    },
    [
      vlog,
      handleAutopilotNavigation,
      isOrbiting,
      exitOrbit,
      shipLog,
      debugLog,
      captureMoonDepartureContext,
      startProjectShowcaseExitSequence,
    ],
  );

  const handleQuickNav = useCallback(
    (targetId: string, targetType: "section" | "moon") => {
      if (startProjectShowcaseExitSequence(targetId, targetType)) {
        return;
      }
      // Exit orbit if currently orbiting
      if (isOrbiting()) {
        pendingOrbitExitNavigationRef.current = {
          targetId,
          targetType,
          departure: captureMoonDepartureContext(),
        };
        exitOrbit();
        setOrbitPhase("exiting");
        shipLog("Departing orbit — new destination", "orbit");
        return;
      }

      // Always use autopilot — ship is always engaged
      if (!manualFlightModeRef.current) {
        handleAutopilotNavigation(targetId, targetType);
        return;
      }
      // Fallback for manual flight mode
      const target =
        targetType === "moon" ? `experience-${targetId}` : targetId;
      if (handleNavigationRef.current) {
        handleNavigationRef.current(target);
      }
    },
    [
      handleAutopilotNavigation,
      isOrbiting,
      exitOrbit,
      shipLog,
      captureMoonDepartureContext,
      startProjectShowcaseExitSequence,
    ],
  );

  // Legacy left-panel hide/show logic removed — old CosmicNavigation
  // interface no longer exists. Navigation is handled by the new game UI.

  const appendSystemStatusLog = useCallback((message: string) => {
    setSystemStatusLogs((prev) => {
      const next = [...prev, message];
      return next.length > 8 ? next.slice(-8) : next;
    });
  }, []);

  // ── Orbit Debug Mode (F8 toggle) ─────────────────────────────────────────
  // Lets you nudge orbit camera/ship params live during orbit, then dump
  // final values to the ship terminal for copy-paste.
  useEffect(() => {
    let active = false;

    const STEP_SMALL = 0.02;
    const STEP_TILT = 0.3;

    const dumpValues = () => {
      const lines = [
        "══════ ORBIT DEBUG VALUES ══════",
        `ORBIT_ALTITUDE_MULT  = ${orbitDebug.altitudeMult.toFixed(3)}`,
        `ORBIT_CAM_BEHIND     = ${orbitDebug.camBehind.toFixed(3)}`,
        `ORBIT_CAM_ABOVE      = ${orbitDebug.camAbove.toFixed(3)}`,
        `ORBIT_CAM_PITCH_BLEND= ${orbitDebug.pitchBlend.toFixed(3)}`,
        `noseTilt             = ${orbitDebug.noseTilt.toFixed(2)}`,
        "════════════════════════════════",
      ];
      lines.forEach((l) => shipLog(l, "info"));
      console.log(lines.join("\n"));
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        active = !active;
        orbitDebug.active = active;
        if (active) {
          orbitDebug.reset();
          shipLog("ORBIT DEBUG ON — W/S alt, A/D behind, Q/E above, R/F pitch, T/G tilt, F9 dump", "info");
        } else {
          shipLog("ORBIT DEBUG OFF", "info");
        }
        return;
      }

      if (!active) return;

      if (e.key === "F9") {
        e.preventDefault();
        dumpValues();
        return;
      }

      const k = e.key.toLowerCase();
      let changed = true;

      switch (k) {
        case "w": orbitDebug.altitudeMult += STEP_SMALL; break;
        case "s": orbitDebug.altitudeMult = Math.max(0.05, orbitDebug.altitudeMult - STEP_SMALL); break;
        case "a": orbitDebug.camBehind += STEP_SMALL; break;
        case "d": orbitDebug.camBehind = Math.max(0.05, orbitDebug.camBehind - STEP_SMALL); break;
        case "q": orbitDebug.camAbove += STEP_SMALL; break;
        case "e": orbitDebug.camAbove = Math.max(0, orbitDebug.camAbove - STEP_SMALL); break;
        case "r": orbitDebug.pitchBlend = Math.min(1, orbitDebug.pitchBlend + STEP_SMALL); break;
        case "f": orbitDebug.pitchBlend = Math.max(0, orbitDebug.pitchBlend - STEP_SMALL); break;
        case "t": orbitDebug.noseTilt -= STEP_TILT; break;
        case "g": orbitDebug.noseTilt += STEP_TILT; break;
        default: changed = false;
      }

      if (changed) {
        e.preventDefault();
        debugLog("orbitDbg",
          `alt=${orbitDebug.altitudeMult.toFixed(3)} behind=${orbitDebug.camBehind.toFixed(3)} above=${orbitDebug.camAbove.toFixed(3)} pitch=${orbitDebug.pitchBlend.toFixed(3)} tilt=${orbitDebug.noseTilt.toFixed(2)}`
        );
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      orbitDebug.active = false;
    };
  }, [shipLog, debugLog]);

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
    starDestroyerRef,
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

  // ── Ship auto-engage on intro completion ──────────────
  // When the intro cinematic reaches "hover", auto-engage ship mode
  // (no more choice between "Use Falcon" / "Freely Explore").
  useEffect(() => {
    if (shipUIPhase !== "hidden") return;
    const check = setInterval(() => {
      if (
        shipCinematicRef.current?.active &&
        shipCinematicRef.current.phase === "hover"
      ) {
        clearInterval(check);
        // Auto-engage the ship — same as the old handleUseShip path
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

        if (sceneRef.current.controls && spaceshipRef.current) {
          const cc = sceneRef.current.controls;
          const ship = spaceshipRef.current;
          const followDist = optionsRef.current.spaceFollowDistance ?? FOLLOW_DISTANCE;
          const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
          const camPos = ship.position.clone().addScaledVector(behind, followDist);
          camPos.y += FOLLOW_HEIGHT;
          cc.setLookAt(
            camPos.x, camPos.y, camPos.z,
            ship.position.x, ship.position.y, ship.position.z,
            true,
          );
        }
      }
    }, 500);
    return () => clearInterval(check);
  }, [shipUIPhase]);

  // ── Autonomous ship wander ─────────────────────────
  // startShipWander / stopShipWander removed — ship is always player-controlled

  // ── Ship control bar handlers ──────────────────────
  // handleUseShip / handleFreeExplore / handleSummonFalcon removed — ship auto-engages after intro

  // --- STAR DESTROYER escort handlers ---

  const stopFollowingStarDestroyer = useCallback(() => {
    setFollowingStarDestroyer(false);
    followingStarDestroyerRef.current = false;
    vlog("🔺 Disengaged from Star Destroyer escort");
  }, [vlog]);

  const handleStarDestroyerClick = useCallback(() => {
    // Only allow when aboard the Falcon
    if (!followingSpaceshipRef.current && !insideShipRef.current) {
      vlog("🔺 Must be aboard the Falcon to escort the Star Destroyer");
      return;
    }
    if (!starDestroyerRef.current || !spaceshipRef.current) return;

    // Cancel any active cinematic or navigation
    if (shipCinematicRef.current) {
      shipCinematicRef.current.active = false;
    }

    setFollowingStarDestroyer(true);
    followingStarDestroyerRef.current = true;
    vlog("🔺 Engaging Star Destroyer escort — matching course and speed");
  }, [vlog]);

  // ── Cockpit destination navigation ─────────────────
  const handleCockpitNavigate = useCallback(
    (targetId: string, targetType: "section" | "moon") => {
      vlog(`🎯 Cockpit nav → ${targetType}: ${targetId}`);
      if (skillsLatticeActiveRef.current && targetId !== "skills") {
        exitSkillsLattice();
      }
      if (targetId === "skills" || targetId === SKILLS_LATTICE_NAV_ID) {
        if (skillsLatticeActiveRef.current) {
          vlog("🧠 Skills lattice already active");
          return;
        }
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
        const atSkills =
          currentNavigationTarget === "skills" && navigationDistance === null;
        skillsLatticePendingEntryRef.current = true;
        if (atSkills) {
          enterSkillsLattice();
        } else {
          handleQuickNav("skills", "section");
          vlog("🧠 Routing to Skills — lattice will open on arrival");
        }
        return;
      }
      if (targetId === "projects" || targetId === PROJECT_SHOWCASE_NAV_ID) {
        if (!projectShowcaseReady) {
          vlog("⚠️ Project Showcase is loading");
          return;
        }
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        setInsideShip(false);
        insideShipRef.current = false;
        setShipViewMode("exterior");
        shipViewModeRef.current = "exterior";
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
        if (projectShowcaseActiveRef.current) {
          exitProjectShowcase();
          return;
        }

        const trenchAnchor = projectShowcaseWorldAnchorRef.current;
        const shipPos = spaceshipRef.current?.position;
        const nearTrenchAnchor =
          !!trenchAnchor &&
          !!shipPos &&
          shipPos.distanceTo(trenchAnchor) <= PROJECT_SHOWCASE_NEAR_ANCHOR_DIST;
        const atProjects =
          currentNavigationTarget === "projects" &&
          navigationDistance === null &&
          nearTrenchAnchor;
        if (atProjects) {
          projectShowcaseAwaitingProjectsArrivalRef.current = false;
          projectShowcaseSawProjectsTravelRef.current = false;
          pendingProjectShowcaseEntryRef.current = true;
          startProjectShowcaseEntrySequence();
        } else {
          pendingProjectShowcaseEntryRef.current = true;
          projectShowcaseAwaitingProjectsArrivalRef.current = true;
          projectShowcaseSawProjectsTravelRef.current = false;
          handleQuickNav("projects", "section");
          vlog("🛰️ Routing to Projects — Project Showcase will open on arrival");
        }
        return;
      }

      if (targetType === "moon") {
        handleExperienceCompanyNavigation(targetId);
      } else {
        // Route section nav through the unified quick-nav path so orbit-exit
        // clearance/deferred navigation is always honored.
        handleQuickNav(targetId, "section");
      }
    },
    [
      currentNavigationTarget,
      navigationDistance,
      projectShowcaseReady,
      enterSkillsLattice,
      handleExperienceCompanyNavigation,
      handleQuickNav,
      startProjectShowcaseEntrySequence,
      exitSkillsLattice,
      exitProjectShowcase,
      vlog,
    ],
  );

  useEffect(() => {
    if (
      !pendingProjectShowcaseEntryRef.current ||
      projectShowcaseActiveRef.current ||
      projectShowcaseEntrySequenceRef.current.active
    ) {
      return;
    }

    if (projectShowcaseAwaitingProjectsArrivalRef.current) {
      if (currentNavigationTarget === "projects" && navigationDistance !== null) {
        projectShowcaseSawProjectsTravelRef.current = true;
      }
      if (
        projectShowcaseSawProjectsTravelRef.current &&
        navigationDistance === null
      ) {
        startProjectShowcaseEntrySequence();
      }
      return;
    }

    if (navigationDistance === null) {
      startProjectShowcaseEntrySequence();
    }
  }, [
    currentNavigationTarget,
    navigationDistance,
    startProjectShowcaseEntrySequence,
  ]);

  useEffect(() => {
    if (!skillsLatticePendingEntryRef.current || skillsLatticeActiveRef.current) {
      return;
    }
    if (currentNavigationTarget === "skills" && navigationDistance === null) {
      enterSkillsLattice();
    }
  }, [currentNavigationTarget, navigationDistance, enterSkillsLattice]);

  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    const worldNodePos = new THREE.Vector3();
    const flowPos = new THREE.Vector3();
    const tick = () => {
      if (skillsLatticeActiveRef.current) {
        const t = performance.now() * 0.001;
        const selected = skillsLatticeSelectedNodeRef.current;
        const ripple = skillsLatticeRippleRef.current;
        const nowMs = performance.now();
        let rippleRadius = -1;
        if (ripple.active) {
          const rt = THREE.MathUtils.clamp((nowMs - ripple.startedAt) / 1200, 0, 1);
          rippleRadius = rt * 90;
          if (rt >= 1) ripple.active = false;
        }
        skillsLatticeNodesRef.current.forEach((node) => {
          const pulse = 1 + Math.sin(t * 1.7 + node.phase) * 0.08;
          const selectedBoost = selected?.mesh === node.mesh ? 1.28 : 1;
          node.mesh.scale.setScalar(node.baseScale * pulse * selectedBoost);
          if (node.halo?.material) {
            const hMat = node.halo.material as THREE.SpriteMaterial;
            const focusAlpha = selected?.mesh === node.mesh ? 0.62 : 0.22;
            let rippleBoost = 0;
            if (ripple.active && rippleRadius >= 0) {
              node.mesh.getWorldPosition(worldNodePos);
              const d = worldNodePos.distanceTo(ripple.center);
              rippleBoost = Math.max(0, 1 - Math.abs(d - rippleRadius) / 14) * 0.42;
            }
            hMat.opacity =
              focusAlpha + Math.sin(t * 2.2 + node.phase) * 0.06 + rippleBoost;
          }
        });
        skillsLatticeLineMatsRef.current.forEach((mat, idx) => {
          const wave = 0.34 + 0.14 * Math.sin(t * 1.2 + idx * 0.7);
          const rippleBoost = ripple.active && rippleRadius >= 0 ? 0.18 : 0;
          mat.opacity = Math.min(0.9, wave + rippleBoost);
        });
        const flow = skillsLatticeFlowPointsRef.current;
        const flowMeta = skillsLatticeFlowMetaRef.current;
        const segs = skillsLatticeLinkSegmentsRef.current;
        if (flow && flowMeta.length > 0 && segs.length > 0) {
          const attr = flow.geometry.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < flowMeta.length; i += 1) {
            const meta = flowMeta[i];
            const seg = segs[meta.segmentIndex % segs.length];
            const p = (t * meta.speed + meta.offset) % 1;
            flowPos.lerpVectors(seg.from, seg.to, p);
            attr.setXYZ(i, flowPos.x, flowPos.y, flowPos.z);
          }
          attr.needsUpdate = true;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneReady]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!skillsLatticeActiveRef.current) return;
      const camera = sceneRef.current.camera;
      if (!camera) return;
      const rect = mount.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.layers.set(SKILLS_LATTICE_LAYER);
      raycaster.setFromCamera(pointer, camera as THREE.Camera);
      const meshes = skillsLatticeNodesRef.current.map((n) => n.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) return;
      const hitMesh = hits[0].object as THREE.Mesh;
      const node = skillsLatticeNodesRef.current.find((n) => n.mesh === hitMesh);
      if (!node) return;
      focusSkillsLatticeNode(node, true);
      event.stopPropagation();
    };
    mount.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      mount.removeEventListener("pointerdown", onPointerDown, { capture: true });
    };
  }, [focusSkillsLatticeNode]);

  useEffect(() => {
    if (isLoading || !sceneReady) return;
    let raf = 0;
    const tick = () => {
      const sceneCtx = sceneRef.current;
      const ship = spaceshipRef.current;
      const camera = sceneCtx?.camera;
      if (!sceneCtx || !ship || !camera) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const nebulaRoot = projectShowcaseNebulaRootRef.current;
      if (nebulaRoot?.visible) {
        const nebulaCenterOffset = nebulaRoot.userData?.nebulaCenterOffset as
          | THREE.Vector3
          | undefined;
        nebulaRoot.position.copy(camera.position);
        if (nebulaCenterOffset) {
          nebulaRoot.position.sub(nebulaCenterOffset);
        }
      }

      const shouldFadeDuringOutboundTravel =
        pendingProjectShowcaseEntryRef.current &&
        !projectShowcaseActiveRef.current &&
        !projectShowcaseEntrySequenceRef.current.active &&
        !projectShowcaseExitSequenceRef.current.active;
      const shouldFadeDuringReturnTravel =
        !pendingProjectShowcaseEntryRef.current &&
        !projectShowcaseActiveRef.current &&
        !projectShowcaseEntrySequenceRef.current.active &&
        !projectShowcaseExitSequenceRef.current.active &&
        currentNavigationTarget !== "projects" &&
        navigationDistance !== null;

      if (shouldFadeDuringOutboundTravel || shouldFadeDuringReturnTravel) {
        const distFromKnownCenter = ship.position.length();
        const fadeStart = SKYFIELD_RADIUS * 0.9;
        const fadeEnd = SKYFIELD_RADIUS * 1.18;
        const realmAlpha = THREE.MathUtils.clamp(
          (distFromKnownCenter - fadeStart) / Math.max(1, fadeEnd - fadeStart),
          0,
          1,
        );
        applyProjectShowcaseNebulaFade(realmAlpha);
        if (realmAlpha > 0.001) {
          camera.layers.enable(PROJECT_SHOWCASE_LAYER);
        }
        const now = performance.now();
        if (now - projectShowcaseNebulaDebugLastLogMsRef.current > 2600) {
          projectShowcaseNebulaDebugLastLogMsRef.current = now;
          const nebulaVisible = projectShowcaseNebulaRootRef.current?.visible ?? false;
          vlog(
            `🌌 Nebula travel dbg: dist=${distFromKnownCenter.toFixed(0)} alpha=${realmAlpha.toFixed(
              2,
            )} camLayer=${camera.layers.isEnabled(PROJECT_SHOWCASE_LAYER) ? "on" : "off"} visible=${nebulaVisible ? "yes" : "no"}`,
          );
        }
      } else if (
        !projectShowcaseActiveRef.current &&
        !projectShowcaseEntrySequenceRef.current.active
      ) {
        applyProjectShowcaseNebulaFade(0);
        camera.layers.disable(PROJECT_SHOWCASE_LAYER);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [currentNavigationTarget, isLoading, navigationDistance, sceneReady]);

  useEffect(() => {
    return () => {
      if (projectShowcaseEntrySequenceRef.current.raf !== null) {
        cancelAnimationFrame(projectShowcaseEntrySequenceRef.current.raf);
        projectShowcaseEntrySequenceRef.current.raf = null;
      }
      if (projectShowcaseExitSequenceRef.current.raf !== null) {
        cancelAnimationFrame(projectShowcaseExitSequenceRef.current.raf);
        projectShowcaseExitSequenceRef.current.raf = null;
      }
      if (projectShowcaseAngleIntroRef.current.raf !== null) {
        cancelAnimationFrame(projectShowcaseAngleIntroRef.current.raf);
        projectShowcaseAngleIntroRef.current.raf = null;
      }
      projectShowcaseEntrySequenceRef.current.active = false;
      projectShowcaseExitSequenceRef.current.active = false;
      projectShowcaseQueuedNavRef.current = null;
      projectShowcaseAwaitingProjectsArrivalRef.current = false;
      projectShowcaseSawProjectsTravelRef.current = false;
      skillsLatticePendingEntryRef.current = false;
      skillsLatticeActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading || !sceneReady) return;
    if (cosmosIntroPlayedRef.current) return;
    const ship = spaceshipRef.current;
    const controls = sceneRef.current.controls;
    const camera = sceneRef.current.camera;
    if (!ship || !controls || !camera) return;
    cosmosIntroPlayedRef.current = true;
    setCosmosIntroOverlayOpacity(0.42);

    const baseShipPos = ship.position.clone();
    const baseShipQuat = ship.quaternion.clone();
    const startCam = camera.position.clone();
    const startTarget = new THREE.Vector3();
    const controlsAny = controls as unknown as {
      getTarget?: (out: THREE.Vector3) => void;
    };
    if (controlsAny.getTarget) {
      controlsAny.getTarget(startTarget);
    } else {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      startTarget.copy(startCam).addScaledVector(dir, 30);
    }
    const endCam = startCam.clone().lerp(startTarget, 0.075);

    const durationMs = 2800;
    const startedAt = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const t = THREE.MathUtils.clamp(elapsed / durationMs, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      const bob = Math.sin(elapsed * 0.0017) * 0.18;
      const sway = Math.cos(elapsed * 0.0012) * 0.08;
      ship.position.set(baseShipPos.x + sway, baseShipPos.y + bob, baseShipPos.z);
      ship.quaternion.slerp(baseShipQuat, 0.14);

      const camPos = new THREE.Vector3().lerpVectors(startCam, endCam, ease);
      controls.setLookAt(
        camPos.x,
        camPos.y,
        camPos.z,
        startTarget.x,
        startTarget.y,
        startTarget.z,
        false,
      );

      setCosmosIntroOverlayOpacity(THREE.MathUtils.lerp(0.42, 0, ease));
      if (t >= 1) {
        setCosmosIntroOverlayOpacity(0);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isLoading, sceneReady]);

  useEffect(() => {
    if (!projectShowcaseActive) return;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      const track = projectShowcaseTrackRef.current;
      const showcaseRoot = projectShowcaseRootRef.current;
      if (!controls || !camera || !track || !showcaseRoot) return;
      if (projectShowcaseExitSequenceRef.current.active) return;

      const now = performance.now();
      const last = projectShowcaseLastTickRef.current ?? now;
      const dt = Math.min((now - last) / 1000, 0.08);
      projectShowcaseLastTickRef.current = now;

      const endPad = 10;
      const minRun = track.minRun + endPad;
      const maxRun = track.maxRun - endPad;
      const loopLen = Math.max(1, maxRun - minRun);
      const currentRun = projectShowcaseRunPosRef.current;
      const jumpTarget = projectShowcaseJumpTargetRef.current;

      if (jumpTarget !== null) {
        const normalizedCurrent = THREE.MathUtils.euclideanModulo(
          currentRun - minRun,
          loopLen,
        ) + minRun;
        const normalizedTarget = THREE.MathUtils.euclideanModulo(
          jumpTarget - minRun,
          loopLen,
        ) + minRun;
        const forwardDist =
          normalizedTarget >= normalizedCurrent
            ? normalizedTarget - normalizedCurrent
            : normalizedTarget + loopLen - normalizedCurrent;
        const backwardDist =
          normalizedCurrent >= normalizedTarget
            ? normalizedCurrent - normalizedTarget
            : normalizedCurrent + loopLen - normalizedTarget;
        const goForward = forwardDist <= backwardDist;
        const remaining = Math.min(forwardDist, backwardDist);
        // Two-phase profile: keep a fast clip while far, then brake near target.
        const cruiseSpeed = track.speed * 25;
        const minApproachSpeed = track.speed * 0.14;
        const brakeDistance = 1.7;
        let dynamicSpeed = cruiseSpeed;
        if (remaining < brakeDistance) {
          const t = THREE.MathUtils.clamp(remaining / brakeDistance, 0, 1);
          const eased = t * t * (3 - 2 * t);
          dynamicSpeed = THREE.MathUtils.lerp(
            minApproachSpeed,
            cruiseSpeed,
            eased,
          );
        }
        const step = Math.min(remaining, dynamicSpeed * dt);
        let nextRun = normalizedCurrent + (goForward ? step : -step);
        if (nextRun > maxRun) nextRun -= loopLen;
        if (nextRun < minRun) nextRun += loopLen;
        setProjectShowcaseRunPosition(nextRun);
        if (remaining < 0.18) {
          const direction = goForward ? 1 : -1;
          const edgeGuard = 0.28;
          const nearEdge =
            normalizedTarget <= minRun + edgeGuard ||
            normalizedTarget >= maxRun - edgeGuard;
          const settleRun = nearEdge
            ? normalizedTarget
            : THREE.MathUtils.clamp(
                normalizedTarget + direction * 0.05,
                minRun,
                maxRun,
              );
          setProjectShowcaseRunPosition(settleRun);
          projectShowcaseJumpTargetRef.current = null;
          // Small opposite impulse gives a "heavy shuttle" settle bounce.
          projectShowcaseVelocityRef.current = nearEdge
            ? 0
            : -direction * track.speed * 0.12;
          setProjectShowcaseLever(0);
        }
      } else {
        const maxManualSpeed = track.speed * 11.4;
        let targetVelocity = 0;
        if (projectShowcasePlayingRef.current) {
          targetVelocity = track.speed * 0.75;
        } else if (projectShowcaseLeverDraggingRef.current) {
          const lever = projectShowcaseLeverValueRef.current;
          // Non-linear response: fine near center, stronger at extremes.
          const shapedLever =
            Math.sign(lever) * Math.pow(Math.abs(lever), 1.35);
          targetVelocity = shapedLever * maxManualSpeed;
        }
        const velocitySmooth = projectShowcaseLeverDraggingRef.current ? 20 : 4;
        projectShowcaseVelocityRef.current = THREE.MathUtils.damp(
          projectShowcaseVelocityRef.current,
          targetVelocity,
          velocitySmooth,
          dt,
        );

        if (Math.abs(projectShowcaseVelocityRef.current) > 0.002) {
          let nextRun =
            projectShowcaseRunPosRef.current + projectShowcaseVelocityRef.current * dt;
          if (nextRun > maxRun) {
            nextRun = minRun;
          } else if (nextRun < minRun) {
            nextRun = maxRun;
          }
          setProjectShowcaseRunPosition(nextRun);
        } else if (
          !projectShowcasePlayingRef.current &&
          !projectShowcaseLeverDraggingRef.current
        ) {
          projectShowcaseForcedFocusIndexRef.current = null;
        }
      }

      const focusIndex = THREE.MathUtils.clamp(
        projectShowcaseFocusIndexRef.current,
        0,
        Math.max(0, projectShowcasePanelsRef.current.length - 1),
      );
      const angleT = THREE.MathUtils.clamp(
        projectShowcaseAnglePercentRef.current /
          (PROJECT_SHOWCASE_MAX_ANGLE_PERCENT -
            PROJECT_SHOWCASE_MIN_ANGLE_PERCENT),
        0,
        1,
      );
      projectShowcasePanelsRef.current.forEach((panel, idx) => {
        const target = idx === focusIndex ? 1 : 0;
        panel.focusBlend = THREE.MathUtils.damp(panel.focusBlend, target, 8, dt);
        const toFrontDelta = Math.atan2(
          Math.sin(panel.frontFacingRotationY - panel.inwardRotationY),
          Math.cos(panel.frontFacingRotationY - panel.inwardRotationY),
        );
        panel.group.rotation.y =
          panel.inwardRotationY +
          toFrontDelta * angleT;
        const scaleBoost = 1 + panel.focusBlend * 0.055;
        panel.group.scale.setScalar(scaleBoost);
        panel.frameMat.opacity = 0.22 + panel.focusBlend * 0.26;
      });

      const run = projectShowcaseRunPosRef.current;
      const sway = Math.sin(run * 0.025) * 1.2;
      const rootPos = new THREE.Vector3();
      showcaseRoot.getWorldPosition(rootPos);
      if (track.axis === "z") {
        const camX = rootPos.x + track.centerCross + sway;
        const camY = rootPos.y + track.cameraHeight;
        const camZ = rootPos.z + run;
        controls.setLookAt(
          camX,
          camY,
          camZ,
          rootPos.x + track.centerCross,
          rootPos.y + track.cameraHeight - 0.3,
          rootPos.z + run + track.lookAhead,
          false,
        );
      } else {
        const camX = rootPos.x + run;
        const camY = rootPos.y + track.cameraHeight;
        const camZ = rootPos.z + track.centerCross + sway;
        controls.setLookAt(
          camX,
          camY,
          camZ,
          rootPos.x + run + track.lookAhead,
          rootPos.y + track.cameraHeight - 0.3,
          rootPos.z + track.centerCross,
          false,
        );
      }
    };

    tick();
    return () => cancelAnimationFrame(raf);
  }, [projectShowcaseActive, setProjectShowcaseRunPosition]);

  // ── Project showcase image controls: Shift+drag / Shift+wheel ─────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let dragging = false;
    let activePanel: ShowcasePanelRecord | null = null;
    let lastX = 0;
    let lastY = 0;
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
    const pointer = new THREE.Vector2();

    const getInteractivePanelAtPointer = (
      clientX: number,
      clientY: number,
    ): ShowcasePanelRecord | null => {
      if (!projectShowcaseActiveRef.current) return null;
      const cam = sceneRef.current.camera;
      if (!cam) return null;
      const panels = projectShowcasePanelsRef.current.filter(
        (panel) => panel.fitMode === "cover" && !!panel.texture && panel.group.visible,
      );
      if (panels.length === 0) return null;
      const rect = mount.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, cam);
      const hits = raycaster.intersectObjects(
        panels.map((panel) => panel.imageMesh),
        false,
      );
      if (hits.length === 0) return null;
      const hitObj = hits[0].object;
      return panels.find((panel) => panel.imageMesh === hitObj) ?? null;
    };

    const pauseShowcasePlayback = () => {
      if (!projectShowcasePlayingRef.current) return;
      projectShowcasePlayingRef.current = false;
      setProjectShowcasePlaying(false);
      projectShowcaseJumpTargetRef.current = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, input, select, textarea, a")) return;
      const panel = getInteractivePanelAtPointer(e.clientX, e.clientY);
      if (!panel) return;
      pauseShowcasePlayback();
      dragging = true;
      activePanel = panel;
      lastX = e.clientX;
      lastY = e.clientY;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const panel = activePanel;
      if (!panel) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const zoom = THREE.MathUtils.clamp(panel.zoom, 1, 4);
      const repX = panel.baseRepeat.x / zoom;
      const repY = panel.baseRepeat.y / zoom;
      const rangeX = Math.max(0, 1 - repX);
      const rangeY = Math.max(0, 1 - repY);
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      panel.panX += (dx / width) * rangeX * 1.3;
      panel.panY += (dy / height) * rangeY * 1.3;
      applyProjectShowcasePanelViewport(panel);
      bumpProjectShowcaseViewportTick();
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const onPointerUp = () => {
      dragging = false;
      activePanel = null;
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      const panel = getInteractivePanelAtPointer(e.clientX, e.clientY);
      if (!panel) return;
      pauseShowcasePlayback();
      const zoomDir = e.deltaY < 0 ? 1 : -1;
      setProjectShowcasePanelZoom(panel.zoom + zoomDir * 0.12);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    mount.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    mount.addEventListener("wheel", onWheel, { passive: false, capture: true });

    return () => {
      mount.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      mount.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [
    applyProjectShowcasePanelViewport,
    bumpProjectShowcaseViewportTick,
    setProjectShowcasePanelZoom,
  ]);

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
    if (exp) targets.push({ pos: exp.clone(), radius: EXP_WANDER_RADIUS });
    if (skills) targets.push({ pos: skills.clone(), radius: SKILLS_WANDER_RADIUS });
    if (projects) targets.push({ pos: projects.clone(), radius: PROJ_WANDER_RADIUS });
    // Sun is centered at origin; keep a tighter band so it's in view.
    targets.push({ pos: new THREE.Vector3(0, 0, 0), radius: SUN_WANDER_RADIUS });

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
      // When inside the ship, turn off exterior lights completely —
      // they shine through the hull and add unwanted brightness.
      // When outside: 12 × 0.15 = 1.8 total additive — soft fill.
      const intensity = insideShip ? 0 : (shipExteriorLights ? 0.15 : 0);
      spaceshipLightsRef.current.forEach((light) => {
        light.intensity = intensity;
      });
    }
  }, [shipExteriorLights, insideShip]);

  // Update spaceship interior lights — ONLY active when inside the ship.
  // When viewed from exterior, interior lights create a massive glow sphere
  // (each light has 4-unit range but ship is only 0.8 units long).
  // Cockpit gets moderate light (windshield lets some in); cabin is dimmer.
  useEffect(() => {
    if (spaceshipInteriorLightsRef.current.length > 0) {
      const on = insideShip && shipInteriorLights;
      const isCockpit = shipViewMode === "cockpit";
      // Keep interior illumination controlled; cabin should be notably dim.
      const intensity = on ? (isCockpit ? 0.2 : 0.05) : 0;
      spaceshipInteriorLightsRef.current.forEach((light) => {
        light.intensity = intensity;
      });
    }
  }, [shipInteriorLights, insideShip, shipViewMode]);

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
    sceneRef.current.ambientLight = ambientLight;
    sceneRef.current.sunLight = sunLight;
    sceneRef.current.fillLight = fillLight;

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
    sprite.scale.set(SUN_GLOW_SPRITE_SIZE, SUN_GLOW_SPRITE_SIZE, 1);
    sunMesh.add(sprite);
    sceneRef.current.sunGlowMaterial = spriteMaterial;

    // Sun Labels (Restored)
    const sunLabel = createLabel(
      resumeData.personal.name,
      resumeData.personal.title,
    );
    sunLabel.position.set(0, SUN_LABEL_Y, 0);
    sunMesh.add(sunLabel);
    sunLabelRef.current = sunLabel;

    // 2. HELPER: Create Planet
    const createPlanet = createPlanetFactory({
      scene,
      textureLoader,
      items,
      orbitAnchors,
      clickablePlanets,
    });

    // 3. PLANETS (Sections)
    const expPlanet = createPlanet(
      "Experience",
      EXPERIENCE_ORBIT,
      EXPERIENCE_RADIUS,
      0xff5533,
      scene,
      0.0002,
      1,
      "/textures/mars.jpg",
    );

    const skillsPlanet = createPlanet(
      "Skills",
      SKILLS_ORBIT,
      SKILLS_RADIUS,
      0x3388ff,
      scene,
      0.00015,
      2,
      "/textures/earth.jpg",
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
        EXP_MOON_ORBIT_BASE + i * EXP_MOON_ORBIT_STEP,
        EXP_MOON_RADIUS,
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
    const skillMoonMeshes: THREE.Object3D[] = [];

    skillCategories.forEach((cat, i) => {
      const moon = createPlanet(
        cat,
        SKILL_MOON_ORBIT_BASE + i * SKILL_MOON_ORBIT_STEP,
        SKILL_MOON_RADIUS,
        0xaaddff,
        skillsPlanet,
        0.0015 + Math.random() * 0.001,
        undefined,
        undefined,
        skillsStartOffset + (i * Math.PI * 2) / skillsCount,
      );
      skillMoonMeshes.push(moon);
    });

    // Skills constellation lattice (unique skills representation)
    const skillsLatticeRoot = new THREE.Group();
    skillsLatticeRoot.name = "SkillsConstellationLattice";
    skillsLatticeRoot.position.copy(skillsPlanet.position).add(new THREE.Vector3(0, 8, 0));
    skillsLatticeRoot.visible = false;
    const categoryEntries = Object.entries(resumeData.skills) as Array<
      [string, string[]]
    >;
    const categoryNodeRadius = 3.2;
    const skillNodeRadius = 1.25;
    const latticeRadius = 58;
    const latticeNodes: SkillsLatticeNodeRecord[] = [];
    const latticeLinkSegments: SkillsLatticeLinkSegment[] = [];

    const categoryPositions = categoryEntries.map((_, idx) => {
      const a = (idx / Math.max(1, categoryEntries.length)) * Math.PI * 2;
      const y = Math.sin(idx * 0.9) * 6;
      return new THREE.Vector3(
        Math.cos(a) * latticeRadius,
        y,
        Math.sin(a) * latticeRadius,
      );
    });

    const categoryMat = new THREE.MeshBasicMaterial({
      color: 0x8fd3ff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const skillMat = new THREE.MeshBasicMaterial({
      color: 0xdaf1ff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const makeNodeHalo = (radius: number, color: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.35, "rgba(180,220,255,0.42)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(radius * 4.6);
      return sprite;
    };
    const latticeLineMats: THREE.LineBasicMaterial[] = [];

    // Category ring links.
    {
      const linePoints: number[] = [];
      categoryPositions.forEach((pos, i) => {
        const next = categoryPositions[(i + 1) % categoryPositions.length];
        linePoints.push(pos.x, pos.y, pos.z, next.x, next.y, next.z);
        latticeLinkSegments.push({
          from: pos.clone(),
          to: next.clone(),
        });
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(linePoints, 3),
      );
      const lines = new THREE.LineSegments(
        geom,
        new THREE.LineBasicMaterial({
          color: 0x66c6ff,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        }),
      );
      latticeLineMats.push(lines.material as THREE.LineBasicMaterial);
      skillsLatticeRoot.add(lines);
    }

    categoryEntries.forEach(([category, skills], idx) => {
      const cPos = categoryPositions[idx];
      const categoryNode = new THREE.Mesh(
        new THREE.IcosahedronGeometry(categoryNodeRadius, 1),
        categoryMat.clone(),
      );
      const categoryEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(categoryNode.geometry),
        new THREE.LineBasicMaterial({
          color: 0xeaf6ff,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
        }),
      );
      categoryEdges.scale.setScalar(1.012);
      categoryNode.add(categoryEdges);
      categoryNode.position.copy(cPos);
      categoryNode.userData.skillsNode = {
        label: category,
        nodeType: "category",
        category,
      };
      skillsLatticeRoot.add(categoryNode);
      const catHalo = makeNodeHalo(categoryNodeRadius, 0x8fd3ff);
      if (catHalo) {
        catHalo.position.copy(cPos);
        skillsLatticeRoot.add(catHalo);
      }
      latticeNodes.push({
        mesh: categoryNode,
        baseScale: 1,
        phase: idx * 1.73,
        label: category,
        nodeType: "category",
        category,
        detailItems: skills,
        halo: catHalo ?? undefined,
        lineInfluence: idx,
      });

      const catLabel = createLabel(category, `${skills.length} skills`);
      catLabel.position.set(cPos.x, cPos.y + 6.6, cPos.z);
      skillsLatticeRoot.add(catLabel);

      const skillLinePoints: number[] = [];
      const skillOrbitR = 11 + Math.min(7, skills.length * 0.7);
      skills.forEach((skill, sIdx) => {
        const sa = (sIdx / Math.max(1, skills.length)) * Math.PI * 2 + idx * 0.35;
        const sPos = new THREE.Vector3(
          cPos.x + Math.cos(sa) * skillOrbitR,
          cPos.y + Math.sin(sa * 1.4) * 2.2,
          cPos.z + Math.sin(sa) * skillOrbitR,
        );
        const skillNode = new THREE.Mesh(
          new THREE.OctahedronGeometry(skillNodeRadius, 0),
          skillMat.clone(),
        );
        const skillEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(skillNode.geometry),
          new THREE.LineBasicMaterial({
            color: 0xf4fbff,
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
          }),
        );
        skillEdges.scale.setScalar(1.018);
        skillNode.add(skillEdges);
        skillNode.position.copy(sPos);
        skillNode.userData.skillsNode = {
          label: skill,
          nodeType: "skill",
          category,
        };
        skillsLatticeRoot.add(skillNode);
        const skillHalo = makeNodeHalo(skillNodeRadius, 0xdaf1ff);
        if (skillHalo) {
          skillHalo.position.copy(sPos);
          skillsLatticeRoot.add(skillHalo);
        }
        latticeNodes.push({
          mesh: skillNode,
          baseScale: 1,
          phase: idx * 2.13 + sIdx * 0.77,
          label: skill,
          nodeType: "skill",
          category,
          detailItems: [category],
          halo: skillHalo ?? undefined,
          lineInfluence: idx + sIdx * 0.15,
        });
        const skillLabel = createLabel(skill);
        skillLabel.position.set(sPos.x, sPos.y + 2.4, sPos.z);
        skillsLatticeRoot.add(skillLabel);
        skillLinePoints.push(cPos.x, cPos.y, cPos.z, sPos.x, sPos.y, sPos.z);
        latticeLinkSegments.push({
          from: cPos.clone(),
          to: sPos.clone(),
        });
      });
      const skillGeom = new THREE.BufferGeometry();
      skillGeom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(skillLinePoints, 3),
      );
      const skillLines = new THREE.LineSegments(
        skillGeom,
        new THREE.LineBasicMaterial({
          color: 0x9ad9ff,
          transparent: true,
          opacity: 0.36,
          depthWrite: false,
        }),
      );
      latticeLineMats.push(skillLines.material as THREE.LineBasicMaterial);
      skillsLatticeRoot.add(skillLines);
    });

    skillsLatticeRoot.traverse((obj) => {
      obj.layers.set(SKILLS_LATTICE_LAYER);
    });
    // Data packets flowing along lattice links.
    if (latticeLinkSegments.length > 0) {
      const flowCount = Math.min(320, latticeLinkSegments.length * 3);
      const flowPositions = new Float32Array(flowCount * 3);
      const flowGeom = new THREE.BufferGeometry();
      flowGeom.setAttribute(
        "position",
        new THREE.BufferAttribute(flowPositions, 3),
      );
      const flowMat = new THREE.PointsMaterial({
        color: 0xe8f6ff,
        size: 0.72,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const flowPoints = new THREE.Points(flowGeom, flowMat);
      flowPoints.layers.set(SKILLS_LATTICE_LAYER);
      flowPoints.renderOrder = 8;
      skillsLatticeRoot.add(flowPoints);
      const flowMeta: Array<{ segmentIndex: number; offset: number; speed: number }> = [];
      for (let i = 0; i < flowCount; i += 1) {
        flowMeta.push({
          segmentIndex: Math.floor(Math.random() * latticeLinkSegments.length),
          offset: Math.random(),
          speed: 0.08 + Math.random() * 0.26,
        });
      }
      skillsLatticeFlowPointsRef.current = flowPoints;
      skillsLatticeFlowMetaRef.current = flowMeta;
    }
    scene.add(skillsLatticeRoot);
    skillsLatticeRootRef.current = skillsLatticeRoot;
    skillsLatticeNodesRef.current = latticeNodes;
    skillsLatticeLineMatsRef.current = latticeLineMats;
    skillsLatticeLinkSegmentsRef.current = latticeLinkSegments;
    skillsLegacyBodiesRef.current = [skillsPlanet, ...skillMoonMeshes];

    // Point-based starfield removed — the texture skyboxes (starfield +
    // skyfield) already provide a realistic backdrop that doesn't cluster
    // when the camera travels through the expanded universe.

    // --- SPACESHIP LOADING ---
    const loader = new GLTFLoader();
    loader.load(
      "/models/spaceship/scene.gltf",
      (gltf) => {
        const spaceship = gltf.scene;

        // Scale down the spaceship to be tiny compared to planets
        spaceship.scale.set(FALCON_SCALE, FALCON_SCALE, FALCON_SCALE);

        // Align model forward axis (model front is +Z; navigation lookAt uses -Z)
        spaceship.userData.forwardOffset = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, Math.PI, 0),
        );

        // Position it initially near the sun
        spaceship.position.set(FALCON_INITIAL_POS.x, FALCON_INITIAL_POS.y, FALCON_INITIAL_POS.z);

        // Subtle ambient light on the ship hull — just enough to see detail.
        // Ship is ~0.8 units long; distance 1.5 = ~2× ship length (tight glow).
        const shipLight = new THREE.PointLight(0x6699ff, 0.15, 1.5);
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
          const light = new THREE.PointLight(0xffffff, 0, 3); // was 15, scaled to ship size
          light.position.copy(pos);
          spaceship.add(light);
          exteriorLights.push(light);
        });

        spaceshipLightsRef.current = exteriorLights;

        // Create dedicated engine light for boost effects.
        // Initial distance matches ENGINE_LIGHT_BASE_DIST (2); render loop updates it.
        const engineLight = new THREE.PointLight(0x6699ff, 0.8, 2);
        engineLight.position.set(0, 0, -4); // Back of ship (model space)
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
          const light = new THREE.PointLight(0xffd9b3, 0, 4); // Start OFF — useEffect won't catch async load
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

    // --- STAR DESTROYER LOADING ---
    loader.load(
      "/models/star-destroyer/scene.gltf",
      (gltf) => {
        const model = gltf.scene;

        // Center the model at the group origin so position/rotation
        // are relative to the ship's geometric center.
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Wrap in a group for clean transforms
        const starDestroyer = new THREE.Group();
        starDestroyer.add(model);

        // Scale: 0.06 → ~44 world-units long (~6× larger than the Falcon)
        starDestroyer.scale.set(SD_SCALE, SD_SCALE, SD_SCALE);

        // Initial position — outer area of the system, above the orbital plane
        starDestroyer.position.set(SD_INITIAL_POS.x, SD_INITIAL_POS.y, SD_INITIAL_POS.z);

        // Forward offset: the model's visual nose is at +Z after centering,
        // but lookAt faces -Z. Rotate 180° around Y so the nose leads.
        // (Same pattern as the Millennium Falcon.)
        starDestroyer.userData.forwardOffset =
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));

        // --- Lights ---
        // SD is ~4.4 units long at scale 0.006. Keep light distances proportional.
        // Engine glow (back of ship is +Z in centered local space)
        const engineLight = new THREE.PointLight(0x4488ff, 1.5, 8);
        engineLight.position.set(0, 0, 360);
        starDestroyer.add(engineLight);
        starDestroyer.userData.engineLight = engineLight;

        // Bridge tower light
        const bridgeLight = new THREE.PointLight(0xaaccff, 0.3, 5);
        bridgeLight.position.set(0, 260, 200);
        starDestroyer.add(bridgeLight);

        // Navigation lights (port=red, starboard=green)
        const portLight = new THREE.PointLight(0xff2200, 0.2, 4);
        portLight.position.set(-230, 80, 0);
        starDestroyer.add(portLight);

        const starboardLight = new THREE.PointLight(0x00ff22, 0.2, 4);
        starboardLight.position.set(230, 80, 0);
        starDestroyer.add(starboardLight);

        // Forward searchlight
        const forwardLight = new THREE.PointLight(0x88aaff, 0.3, 6);
        forwardLight.position.set(0, 40, -360);
        starDestroyer.add(forwardLight);

        scene.add(starDestroyer);
        starDestroyerRef.current = starDestroyer;

        // Initialize the cruiser AI
        const cruiser = new StarDestroyerCruiser(starDestroyer);
        starDestroyerCruiserRef.current = cruiser;

        // Register all planets and moons as visitable destinations.
        // getWorldPosition() is called live each frame so orbiting bodies
        // return their current position, not a stale snapshot.
        const sdDests: import("../StarDestroyerCruiser").SDDestination[] = [];
        scene.traverse((obj: any) => {
          if (obj.isMesh && obj.userData?.planetName) {
            const name = obj.userData.planetName as string;
            const mesh = obj as THREE.Mesh;
            sdDests.push({
              name,
              getWorldPosition: () => {
                const wp = new THREE.Vector3();
                mesh.getWorldPosition(wp);
                return wp;
              },
            });
          }
        });
        cruiser.setDestinations(sdDests);

        // Create hyperspace jump cone — a scene-level mesh (not parented
        // to the SD group, since the SD has scale 0.006 which would
        // make the cone invisible).  The cruiser positions/orients it
        // each frame and manages opacity fade-in/out.
        const coneGeo = new THREE.ConeGeometry(SD_CONE_RADIUS, SD_CONE_LENGTH, 24, 1, true);
        // Default cone: tip at +Y, base at -Y.
        // Rotate so tip points along +Z (lookAt direction).
        coneGeo.rotateX(Math.PI / 2);
        // Shift so the narrow end (apex) is at origin (ship pos)
        // and the wide base extends along +Z toward the destination.
        coneGeo.translate(0, 0, SD_CONE_LENGTH / 2);

        // Per-vertex alpha: bright at the apex (ship), fading toward base (destination)
        const posAttr = coneGeo.getAttribute("position");
        const colors = new Float32Array(posAttr.count * 4);
        for (let i = 0; i < posAttr.count; i++) {
          const z = posAttr.getZ(i);
          // z ranges from 0 (apex/ship) to SD_CONE_LENGTH (base/destination)
          const t = z / SD_CONE_LENGTH; // 0 at ship, 1 at destination
          const alpha = 1 - t * t;       // quadratic falloff — depletes toward destination
          colors[i * 4] = 0.3 + 0.4 * (1 - t);   // R: blue-white at base
          colors[i * 4 + 1] = 0.5 + 0.3 * (1 - t); // G
          colors[i * 4 + 2] = 1.0;                  // B: always blue
          colors[i * 4 + 3] = alpha;
        }
        coneGeo.setAttribute("color", new THREE.BufferAttribute(colors, 4));

        const coneMat = new THREE.MeshBasicMaterial({
          color: 0x88bbff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
          vertexColors: true,
        });
        const jumpCone = new THREE.Mesh(coneGeo, coneMat);
        jumpCone.visible = false;
        jumpCone.renderOrder = 999; // render on top for additive glow
        scene.add(jumpCone);
        cruiser.setJumpCone(jumpCone);

        vlog(`🔺 Star Destroyer loaded — ${sdDests.length} destinations registered`);

        // Console commands for directing the Star Destroyer
        (window as any).sendSD = (name: string) => {
          if (!name) {
            const status = cruiser.getStatus();
            console.log("Usage: sendSD('planet or moon name')");
            console.log("Available destinations:", status.destinations.join(", "));
            return;
          }
          const ok = cruiser.sendTo(name);
          if (ok) {
            const s = cruiser.getStatus();
            console.log(`🔺 Star Destroyer dispatched to "${name}"`);
            console.log(`   State: ${s.hlState} | Speed: ${s.speed.toFixed(1)} | From: ${s.currentDest ?? "none"}`);
            console.log(`   SD position:`, starDestroyerRef.current?.position.toArray().map((n: number) => +n.toFixed(0)));
          } else {
            const status = cruiser.getStatus();
            console.log(`❌ Destination "${name}" not found. Available:`, status.destinations.join(", "));
          }
        };
        (window as any).sdStatus = () => {
          const s = cruiser.getStatus();
          console.log("=== STAR DESTROYER STATUS ===");
          console.log("  High-level state:", s.hlState);
          console.log("  Local state:", s.localState);
          console.log("  Speed:", s.speed.toFixed(1), "u/s");
          console.log("  Current system:", s.currentDest ?? "(none)");
          console.log("  Next destination:", s.nextDest ?? "(none)");
          console.log("  Local patrols:", s.localPatrols);
          console.log("  All destinations:", s.destinations.join(", "));
          return s;
        };

        // ── Visual locate beacons ─────────────────────────────────
        // Console: locateFalcon()  or  locateSD()
        // Spawns a dramatic expanding ring + vertical pillar effect
        // at the ship's position that fades over a few seconds.
        const createLocateBeacon = (
          target: THREE.Object3D,
          color: THREE.ColorRepresentation,
          label: string,
        ) => {
          const wp = new THREE.Vector3();
          target.getWorldPosition(wp);

          const group = new THREE.Group();
          group.position.copy(wp);
          scene.add(group);

          // ── Vertical pillar (thin cylinder stretching up & down) ──
          const pillarHeight = 2000;
          const pillarGeo = new THREE.CylinderGeometry(2, 2, pillarHeight, 8, 1, true);
          const pillarMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const pillar = new THREE.Mesh(pillarGeo, pillarMat);
          group.add(pillar);

          // ── Expanding rings (3 staggered) ──
          const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; delay: number }[] = [];
          for (let i = 0; i < 3; i++) {
            const ringGeo = new THREE.TorusGeometry(20, 1.5, 8, 64);
            ringGeo.rotateX(Math.PI / 2); // flat horizontal
            const ringMat = new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: 0.8,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            group.add(ring);
            rings.push({ mesh: ring, mat: ringMat, delay: i * 0.4 });
          }

          // ── Central pulse sphere ──
          const pulseGeo = new THREE.SphereGeometry(8, 16, 16);
          const pulseMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const pulse = new THREE.Mesh(pulseGeo, pulseMat);
          group.add(pulse);

          // ── Animation ──
          const startTime = performance.now();
          const duration = 4000; // 4 seconds total

          const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = elapsed / duration; // 0 → 1

            if (t >= 1) {
              scene.remove(group);
              pillarGeo.dispose(); pillarMat.dispose();
              pulseGeo.dispose(); pulseMat.dispose();
              rings.forEach((r) => { r.mesh.geometry.dispose(); r.mat.dispose(); });
              return; // stop animation
            }

            // Track the ship's live position
            target.getWorldPosition(wp);
            group.position.copy(wp);

            // Pillar: fade out, slight vertical stretch
            pillarMat.opacity = 0.6 * (1 - t * t);
            pillar.scale.y = 1 + t * 0.5;

            // Rings: expand outward with staggered timing
            rings.forEach(({ mesh, mat, delay }) => {
              const rt = Math.max(0, (elapsed - delay * 1000) / (duration - delay * 1000));
              const ringScale = 1 + rt * 25; // expand to 25× original
              mesh.scale.set(ringScale, ringScale, ringScale);
              mat.opacity = 0.8 * Math.max(0, 1 - rt * rt);
            });

            // Pulse: throb and fade
            const pulseScale = 1 + Math.sin(t * Math.PI * 6) * 0.4 * (1 - t);
            pulse.scale.set(pulseScale, pulseScale, pulseScale);
            pulseMat.opacity = 0.9 * (1 - t);

            requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);

          console.log(`🎯 ${label} located at [${wp.x.toFixed(0)}, ${wp.y.toFixed(0)}, ${wp.z.toFixed(0)}]`);
        };

        (window as any).locateFalcon = () => {
          const falcon = spaceshipRef.current;
          if (!falcon) { console.log("❌ Falcon not loaded yet"); return; }
          createLocateBeacon(falcon, 0x4499ff, "Millennium Falcon");
        };

        (window as any).locateSD = () => {
          const sd = starDestroyerRef.current;
          if (!sd) { console.log("❌ Star Destroyer not loaded yet"); return; }
          createLocateBeacon(sd, 0xff4422, "Star Destroyer");
        };

        // ── Debug Camera Mode ────────────────────────────────────────
        // Console: debugCamera()  — enter free-flight debug mode
        //          exitDebugCamera() — re-engage ship follow
        // Controls:
        //   WASD      — move forward/left/backward/right
        //   Q / E     — move down / up
        //   Shift     — 10x speed boost
        //   Ctrl      — 0.1x slow precision mode
        //   Mouse     — orbit (camera-controls native)
        //   Scroll    — zoom (camera-controls native)
        //   F9        — capture camera position to console
        //   Escape    — exit debug camera mode
        let debugCamActive = false;
        let debugCamRAF = 0;
        const debugKeys: Record<string, boolean> = {};
        const DEBUG_BASE_SPEED = 200; // units/sec — tune for universe scale

        const debugKeyDown = (e: KeyboardEvent) => {
          debugKeys[e.key.toLowerCase()] = true;
          if (e.key === "F9") {
            e.preventDefault();
            const cam = sceneRef.current.camera;
            if (!cam) return;
            const p = cam.position;
            const target = new THREE.Vector3();
            (sceneRef.current.controls as any)?.getTarget(target);
            console.log("═══════════════════════════════════════════════════");
            console.log("📷 DEBUG CAMERA — Position Capture");
            console.log("═══════════════════════════════════════════════════");
            console.log(`Camera position : { x: ${p.x.toFixed(1)}, y: ${p.y.toFixed(1)}, z: ${p.z.toFixed(1)} }`);
            console.log(`Look-at target  : { x: ${target.x.toFixed(1)}, y: ${target.y.toFixed(1)}, z: ${target.z.toFixed(1)} }`);
            console.log("");
            console.log("📋 Copy-paste for code:");
            console.log(`  camera: { x: ${p.x.toFixed(1)}, y: ${p.y.toFixed(1)}, z: ${p.z.toFixed(1)} }`);
            console.log(`  target: { x: ${target.x.toFixed(1)}, y: ${target.y.toFixed(1)}, z: ${target.z.toFixed(1)} }`);
            console.log(`  setLookAt(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}, ${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}, false);`);
            console.log("═══════════════════════════════════════════════════");
          }
          if (e.key === "Escape" && debugCamActive) {
            e.preventDefault();
            (window as any).exitDebugCamera();
          }
        };
        const debugKeyUp = (e: KeyboardEvent) => {
          debugKeys[e.key.toLowerCase()] = false;
        };

        const debugCamLoop = () => {
          if (!debugCamActive) return;
          const cam = sceneRef.current.camera;
          const cc = sceneRef.current.controls;
          if (!cam || !cc) { debugCamRAF = requestAnimationFrame(debugCamLoop); return; }

          const dt = 1 / 60; // approximate
          let speed = DEBUG_BASE_SPEED;
          if (debugKeys["shift"]) speed *= 10;
          if (debugKeys["control"]) speed *= 0.1;
          const step = speed * dt;

          // Build movement vector in camera-local space
          const move = new THREE.Vector3();
          if (debugKeys["w"]) move.z -= step;
          if (debugKeys["s"]) move.z += step;
          if (debugKeys["a"]) move.x -= step;
          if (debugKeys["d"]) move.x += step;
          if (debugKeys["e"]) move.y += step;
          if (debugKeys["q"]) move.y -= step;

          if (move.lengthSq() > 0) {
            // Transform to world space using camera orientation
            move.applyQuaternion(cam.quaternion);
            // Move both camera and orbit target together (truck-style)
            const target = new THREE.Vector3();
            (cc as any).getTarget(target);
            const newCam = cam.position.clone().add(move);
            const newTarget = target.clone().add(move);
            (cc as any).setLookAt(
              newCam.x, newCam.y, newCam.z,
              newTarget.x, newTarget.y, newTarget.z,
              false,
            );
          }

          debugCamRAF = requestAnimationFrame(debugCamLoop);
        };

        (window as any).debugCamera = () => {
          if (debugCamActive) {
            console.log("⚠️ Debug camera already active. Use exitDebugCamera() to exit.");
            return;
          }
          debugCamActive = true;

          // Disengage ship following
          followingSpaceshipRef.current = false;
          setFollowingSpaceship(false);
          insideShipRef.current = false;
          setInsideShip(false);

          // Unlock camera controls for free orbiting
          const cc = sceneRef.current.controls;
          if (cc) {
            cc.minDistance = 0.01;
            cc.maxDistance = 999999;
            cc.enabled = true;
          }

          // Start movement loop
          window.addEventListener("keydown", debugKeyDown);
          window.addEventListener("keyup", debugKeyUp);
          debugCamRAF = requestAnimationFrame(debugCamLoop);

          console.log("═══════════════════════════════════════════════════");
          console.log("🎥 DEBUG CAMERA MODE — ACTIVE");
          console.log("═══════════════════════════════════════════════════");
          console.log("  WASD        — fly forward/left/back/right");
          console.log("  Q / E       — descend / ascend");
          console.log("  Shift       — 10× speed boost");
          console.log("  Ctrl        — 0.1× precision mode");
          console.log("  Mouse drag  — orbit / look around");
          console.log("  Scroll      — zoom in/out");
          console.log("  F9          — 📷 capture position to console");
          console.log("  Escape      — exit debug mode");
          console.log("═══════════════════════════════════════════════════");
          console.log("  exitDebugCamera() — re-engage ship follow");
          console.log("═══════════════════════════════════════════════════");
        };

        (window as any).exitDebugCamera = () => {
          if (!debugCamActive) {
            console.log("⚠️ Debug camera not active.");
            return;
          }
          debugCamActive = false;
          cancelAnimationFrame(debugCamRAF);
          window.removeEventListener("keydown", debugKeyDown);
          window.removeEventListener("keyup", debugKeyUp);
          // Clear stuck keys
          Object.keys(debugKeys).forEach(k => debugKeys[k] = false);

          // Re-engage ship following
          followingSpaceshipRef.current = true;
          setFollowingSpaceship(true);
          setShipUIPhase("ship-engaged");

          // Snap camera behind ship
          const cc = sceneRef.current.controls;
          const ship = spaceshipRef.current;
          if (cc && ship) {
            const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
            const camPos = ship.position.clone().addScaledVector(behind, FOLLOW_DISTANCE);
            camPos.y += FOLLOW_HEIGHT;
            cc.setLookAt(
              camPos.x, camPos.y, camPos.z,
              ship.position.x, ship.position.y, ship.position.z,
              true,
            );
          }

          console.log("✅ Debug camera exited — ship follow re-engaged");
        };
      },
      undefined,
      () => {
        vlog("❌ Failed to load Star Destroyer model");
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

    // --- PROJECT SHOWCASE (Trench Run) ---
    loader.load(
      "/models/star-wars-trench-run/scene.gltf",
      (gltf) => {
        const showcaseRoot = new THREE.Group();
        showcaseRoot.name = "ProjectShowcaseRoot";
        showcaseRoot.visible = false;
        const trenchWorldAnchor = new THREE.Vector3(-24800, 420, 18600);
        showcaseRoot.position.copy(trenchWorldAnchor).add(new THREE.Vector3(0, -36, 0));

        const trench = gltf.scene;
        const trenchDiffuseCache = new Map<string, THREE.Texture>();
        const trenchDiffusePending = new Map<
          string,
          THREE.MeshStandardMaterial[]
        >();
        const ensureTrenchDiffuseMap = (mat: THREE.MeshStandardMaterial) => {
          if (mat.map || !mat.name) return;
          const key = mat.name;
          const cached = trenchDiffuseCache.get(key);
          if (cached) {
            mat.map = cached;
            mat.needsUpdate = true;
            return;
          }
          const pending = trenchDiffusePending.get(key);
          if (pending) {
            pending.push(mat);
            return;
          }
          trenchDiffusePending.set(key, [mat]);

          const basePath = `/models/star-wars-trench-run/textures/${key}_diffuse`;
          const exts = ["jpeg", "jpg", "png"];
          const tryLoad = (idx: number) => {
            if (idx >= exts.length) {
              trenchDiffusePending.delete(key);
              return;
            }
            textureLoader.load(
              `${basePath}.${exts[idx]}`,
              (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                trenchDiffuseCache.set(key, texture);
                const waiters = trenchDiffusePending.get(key) ?? [];
                waiters.forEach((waitMat) => {
                  waitMat.map = texture;
                  waitMat.needsUpdate = true;
                });
                trenchDiffusePending.delete(key);
              },
              undefined,
              () => tryLoad(idx + 1),
            );
          };
          tryLoad(0);
        };

        trench.traverse((obj) => {
          const o = obj as THREE.Object3D & {
            isMesh?: boolean;
            isLight?: boolean;
            name?: string;
            visible?: boolean;
            material?: THREE.Material | THREE.Material[];
          };
          const name = (o.name || "").toLowerCase();

          // Disable embedded source lights and cinematic FX props.
          if (o.isLight) {
            o.visible = false;
            return;
          }

          if (!o.isMesh) return;
          if (!name.startsWith("trench_")) {
            o.visible = false;
            return;
          }
          if (
            name.includes("xwing") ||
            name.includes("tie") ||
            name.includes("fighter") ||
            name.includes("turret") ||
            name.includes("laser") ||
            name.includes("blaster") ||
            name.includes("bolt") ||
            name.includes("beam") ||
            name.includes("explosion") ||
            name.includes("sun")
          ) {
            o.visible = false;
            return;
          }

          // Keep original PBR materials and do minimal normalization only.
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((mat) => {
            const src = mat as THREE.MeshStandardMaterial & {
              emissive?: THREE.Color;
              emissiveMap?: THREE.Texture | null;
              emissiveIntensity?: number;
              map?: THREE.Texture | null;
              metalness?: number;
              roughness?: number;
              color?: THREE.Color;
              toneMapped?: boolean;
              vertexColors?: boolean;
            };
            if (src.map) src.map.colorSpace = THREE.SRGBColorSpace;
            if (src.emissiveMap) src.emissiveMap.colorSpace = THREE.SRGBColorSpace;
            if (typeof src.metalness === "number") {
              src.metalness = Math.min(src.metalness, 0.22);
            }
            if (typeof src.roughness === "number") {
              src.roughness = Math.max(src.roughness, 0.62);
            }
            if (typeof src.emissiveIntensity === "number") {
              src.emissiveIntensity = Math.min(src.emissiveIntensity, 0.35);
            }
            // This asset carries vertex colors that tint surfaces cyan in our pipeline.
            src.vertexColors = false;
            if (src.color) src.color.set(0xffffff);
            src.side = THREE.DoubleSide;
            ensureTrenchDiffuseMap(src);
            src.needsUpdate = true;
          });
        });

        // Normalize model scale so first-pass placement is predictable.
        const trenchBounds = new THREE.Box3().setFromObject(trench);
        const trenchSize = trenchBounds.getSize(new THREE.Vector3());
        const trenchMaxDim = Math.max(trenchSize.x, trenchSize.y, trenchSize.z, 1);
        const desiredMaxDim = 420;
        const trenchScale = desiredMaxDim / trenchMaxDim;
        trench.scale.setScalar(trenchScale);
        trenchBounds.setFromObject(trench);
        const trenchSizeScaled = trenchBounds.getSize(new THREE.Vector3());
        const trenchCenter = trenchBounds.getCenter(new THREE.Vector3());
        trench.position.sub(trenchCenter);
        showcaseRoot.add(trench);

        // Isolate trench rendering/lighting from the main cosmos sun.
        showcaseRoot.traverse((obj) => {
          obj.layers.set(PROJECT_SHOWCASE_LAYER);
        });

        const showcaseAmbient = new THREE.AmbientLight(0xffffff, 0.38);
        const showcaseKey = new THREE.DirectionalLight(0xdde8ff, 1.0);
        showcaseKey.position.set(70, 110, 50);
        const showcaseRim = new THREE.DirectionalLight(0x8db8ff, 0.32);
        showcaseRim.position.set(-80, 30, -40);
        showcaseAmbient.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseKey.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseRim.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseRoot.add(showcaseAmbient, showcaseKey, showcaseRim);

        const publishedShowcase = (legacyWebsites as ShowcaseEntry[]).filter(
          (entry) => (entry as { published?: boolean }).published !== false,
        );

        const runAxis: "x" | "z" =
          trenchSizeScaled.z >= trenchSizeScaled.x ? "z" : "x";
        const trenchForward =
          runAxis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        const trenchLateral =
          runAxis === "z" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1);
        // Trench-realm sun source: a strong angled key + beam into trench.
        const showcaseSun = new THREE.DirectionalLight(0xffe6c1, 1.85);
        showcaseSun.position.copy(
          trenchForward
            .clone()
            .multiplyScalar(-340)
            .add(trenchLateral.clone().multiplyScalar(150))
            .add(new THREE.Vector3(0, 220, 0)),
        );
        const showcaseSunTarget = new THREE.Object3D();
        showcaseSunTarget.position.copy(
          trenchForward.clone().multiplyScalar(280).add(new THREE.Vector3(0, 22, 0)),
        );
        const showcaseSunBeam = new THREE.SpotLight(
          0xfff1d8,
          2.35,
          2800,
          Math.PI / 7.2,
          0.58,
          1.2,
        );
        showcaseSunBeam.position.copy(
          trenchForward
            .clone()
            .multiplyScalar(-460)
            .add(trenchLateral.clone().multiplyScalar(160))
            .add(new THREE.Vector3(0, 250, 0)),
        );
        const showcaseSunBeamTarget = new THREE.Object3D();
        showcaseSunBeamTarget.position.copy(
          trenchForward.clone().multiplyScalar(220).add(new THREE.Vector3(0, 4, 0)),
        );
        showcaseSun.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseSunTarget.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseSunBeam.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseSunBeamTarget.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseSun.target = showcaseSunTarget;
        showcaseSunBeam.target = showcaseSunBeamTarget;
        showcaseRoot.add(
          showcaseSunTarget,
          showcaseSun,
          showcaseSunBeamTarget,
          showcaseSunBeam,
        );
        // Keep trench well away from Projects planet so entry can be a true long final.
        showcaseRoot.position
          .copy(trenchWorldAnchor)
          .addScaledVector(trenchForward, 860)
          .addScaledVector(trenchLateral, 95)
          .add(new THREE.Vector3(0, -36, 0));
        if (PROJECT_SHOWCASE_USE_NEBULA_REALM) {
          textureLoader.load(
            PROJECT_SHOWCASE_NEBULA_JPG_PATH,
            (nebulaTexture) => {
              nebulaTexture.colorSpace = THREE.SRGBColorSpace;
              nebulaTexture.mapping = THREE.EquirectangularReflectionMapping;
              nebulaTexture.wrapS = THREE.RepeatWrapping;
              nebulaTexture.wrapT = THREE.ClampToEdgeWrapping;
              nebulaTexture.needsUpdate = true;

              const domeRadius = CAMERA_FAR * 0.48;
              const nebulaGeo = new THREE.SphereGeometry(domeRadius, 96, 64);
              const nebulaMat = new THREE.MeshBasicMaterial({
                map: nebulaTexture,
                color: 0xffffff,
                side: THREE.BackSide,
                transparent: true,
                opacity: 1,
                depthWrite: false,
              });
              nebulaMat.toneMapped = false;
              nebulaMat.userData = nebulaMat.userData || {};
              nebulaMat.userData.nebulaBaseOpacity = 1;

              const nebulaRoot = new THREE.Mesh(nebulaGeo, nebulaMat);
              nebulaRoot.name = "ProjectShowcaseNebulaRealm";
              nebulaRoot.layers.set(PROJECT_SHOWCASE_LAYER);
              nebulaRoot.frustumCulled = false;
              nebulaRoot.renderOrder = -1000;
              nebulaRoot.rotation.y = Math.PI * 0.1;

              scene.add(nebulaRoot);
              projectShowcaseNebulaRootRef.current = nebulaRoot;
              applyProjectShowcaseNebulaFade(0);
              vlog(
                `🌌 Project showcase JPG sky loaded radius=${domeRadius.toFixed(
                  0,
                )} path=${PROJECT_SHOWCASE_NEBULA_JPG_PATH}`,
              );
            },
            undefined,
            () => {
              vlog(
                "⚠️ Project showcase JPG sky failed — using default cosmos outside trench",
              );
            },
          );
        }
        const runLength =
          runAxis === "z" ? trenchSizeScaled.z : trenchSizeScaled.x;
        const trenchWidth =
          runAxis === "z" ? trenchSizeScaled.x : trenchSizeScaled.z;
        const panelOffset = THREE.MathUtils.clamp(trenchWidth * 0.075, 3.6, 7.4);
        const panelY = THREE.MathUtils.clamp(trenchSizeScaled.y * 0.015, 2.2, 5.4);
        const panelWidth = THREE.MathUtils.clamp(trenchWidth * 0.2304, 9.072, 13.536);
        const panelHeight = panelWidth * (9 / 16);
        const panelSpacing = THREE.MathUtils.clamp(
          runLength / Math.max(6, publishedShowcase.length + 2),
          18,
          36,
        );
        const runStart = -((publishedShowcase.length - 1) * panelSpacing) / 2;
        const panelRecords: ShowcasePanelRecord[] = [];

        publishedShowcase.forEach((entry, index) => {
          const side = index % 2 === 0 ? -1 : 1;
          const panelGroup = new THREE.Group();
          const runPos = runStart + index * panelSpacing;
          if (runAxis === "z") {
            panelGroup.position.set(
              side * panelOffset,
              panelY + ((index % 3) - 1) * 0.9,
              runPos,
            );
          } else {
            panelGroup.position.set(
              runPos,
              panelY + ((index % 3) - 1) * 0.9,
              side * panelOffset,
            );
          }
          // Keep inward-facing baseline; user controls extra readable cant via slider.
          let inwardRotationY = 0;
          let frontFacingRotationY = 0;
          let cantSign: -1 | 1 = 1;
          if (runAxis === "z") {
            inwardRotationY = side < 0 ? Math.PI / 2 : -Math.PI / 2;
            // Plane front normal points toward -Z (toward incoming camera travel).
            frontFacingRotationY = Math.PI;
            cantSign = side < 0 ? 1 : -1;
          } else {
            inwardRotationY = side < 0 ? 0 : Math.PI;
            // Plane front normal points toward -X when traveling +X.
            frontFacingRotationY = Math.PI / 2;
            cantSign = side < 0 ? -1 : 1;
          }
          panelGroup.rotation.y = inwardRotationY;

          const frame = new THREE.Mesh(
            new THREE.PlaneGeometry(panelWidth * 1.03, panelHeight * 1.08),
            new THREE.MeshBasicMaterial({
              color: 0x72c6ff,
              transparent: true,
              opacity: 0.22,
              side: THREE.DoubleSide,
            }),
          );
          const frameMat = frame.material as THREE.MeshBasicMaterial;
          frame.position.z = -0.15;

          const imageMat = new THREE.MeshBasicMaterial({
            color: 0xb8b8b8,
            side: THREE.FrontSide,
            toneMapped: false,
          });
          const imagePlane = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            imageMat,
          );
          const fitMode = entry.fit ?? "contain";
          const panelRecord: ShowcasePanelRecord = {
            group: panelGroup,
            runPos,
            entry,
            fitMode,
            inwardRotationY,
            frontFacingRotationY,
            cantSign,
            focusBlend: 0,
            frameMat,
            imageMesh: imagePlane,
            imageMat,
            texture: null,
            baseRepeat: new THREE.Vector2(1, 1),
            baseOffset: new THREE.Vector2(0, 0),
            zoom: 1,
            panX: 0,
            panY: 0,
          };
          const applyImageFit = (
            imageAspect?: number,
            texture?: THREE.Texture,
          ) => {
            if (!imageAspect || !Number.isFinite(imageAspect) || imageAspect <= 0) {
              imagePlane.scale.set(panelWidth, panelHeight, 1);
              if (texture) {
                panelRecord.baseRepeat.set(1, 1);
                panelRecord.baseOffset.set(0, 0);
                texture.repeat.copy(panelRecord.baseRepeat);
                texture.offset.copy(panelRecord.baseOffset);
                texture.needsUpdate = true;
              }
              return;
            }
            const frameAspect = panelWidth / panelHeight;
            let displayWidth = panelWidth;
            let displayHeight = panelHeight;
            if (fitMode === "cover") {
              // Cover mode uses UV crop in a fixed viewport, which gives us
              // CSS-like overflow:hidden behavior and a stable base for pan/zoom.
              displayWidth = panelWidth;
              displayHeight = panelHeight;
              if (texture) {
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                if (imageAspect > frameAspect) {
                  const visibleX = frameAspect / imageAspect;
                  panelRecord.baseRepeat.set(visibleX, 1);
                  panelRecord.baseOffset.set((1 - visibleX) * 0.5, 0);
                } else {
                  const visibleY = imageAspect / frameAspect;
                  panelRecord.baseRepeat.set(1, visibleY);
                  // Top-align cover images when vertical crop is applied.
                  panelRecord.baseOffset.set(0, 1 - visibleY);
                }
                texture.repeat.copy(panelRecord.baseRepeat);
                texture.offset.copy(panelRecord.baseOffset);
                texture.needsUpdate = true;
              }
            } else {
              if (texture) {
                panelRecord.baseRepeat.set(1, 1);
                panelRecord.baseOffset.set(0, 0);
                texture.repeat.copy(panelRecord.baseRepeat);
                texture.offset.copy(panelRecord.baseOffset);
                texture.needsUpdate = true;
              }
              if (imageAspect > frameAspect) {
                displayWidth = panelWidth;
                displayHeight = panelWidth / imageAspect;
              } else {
                displayHeight = panelHeight;
                displayWidth = panelHeight * imageAspect;
              }
            }
            imagePlane.scale.set(displayWidth, displayHeight, 1);
          };
          applyImageFit();
          textureLoader.load(
            entry.image,
            (texture) => {
              texture.colorSpace = THREE.SRGBColorSpace;
              imageMat.map = texture;
              imageMat.color.set(0xffffff);
              panelRecord.texture = texture;
              const img = texture.image as
                | { width?: number; height?: number }
                | undefined;
              const imgAspect =
                img?.width && img?.height ? img.width / img.height : undefined;
              applyImageFit(imgAspect, texture);
              imageMat.needsUpdate = true;
            },
            undefined,
            () => {
              imageMat.color.set(0x5c6a86);
            },
          );

          panelGroup.add(frame);
          panelGroup.add(imagePlane);
          const detailLines = [
            entry.title,
            ...(entry.description ? [entry.description] : []),
            ...((entry.technologies || []).slice(0, 5).map((t) => `• ${t}`)),
          ];
          const detailTexture = createDetailTexture(detailLines, {
            width: 1024,
            height: 512,
            bgColor: "rgba(6, 12, 22, 0.82)",
            lineColor: "rgba(120, 180, 255, 0.75)",
            textColor: "rgba(228, 240, 255, 0.96)",
            showLine: true,
            fontSize: 25,
            lineSpacing: 36,
            textAlign: "left",
            padding: 54,
          });
          const detailMat = new THREE.MeshBasicMaterial({
            map: detailTexture,
            transparent: true,
            opacity: 0.94,
            toneMapped: false,
            side: THREE.DoubleSide,
          });
          const detailPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(panelWidth * 0.88, panelHeight * 0.76),
            detailMat,
          );
          detailPlane.position.set(
            side < 0 ? -panelWidth * 0.96 : panelWidth * 0.96,
            0,
            -0.08,
          );
          panelGroup.add(detailPlane);
          // Render cards in the overlay layer so they bypass HDR bloom/tonemapping.
          panelGroup.traverse((child) => {
            child.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
          });
          showcaseRoot.add(panelGroup);
          panelRecords.push(panelRecord);
        });

        projectShowcasePanelsRef.current = panelRecords;
        const minRun = runStart;
        const maxRun = runStart + (publishedShowcase.length - 1) * panelSpacing;
        projectShowcaseTrackRef.current = {
          axis: runAxis,
          minRun,
          maxRun,
          centerCross: 0,
          cameraHeight: panelY,
          lookAhead: THREE.MathUtils.clamp(panelSpacing * 1.9, 22, 48),
          speed: THREE.MathUtils.clamp(panelSpacing * 0.1625, 2.5, 5.5),
          cullHalfWindow: THREE.MathUtils.clamp(panelSpacing * 4.4, 70, 130),
        };
        const initialRun = minRun + 8;
        projectShowcaseRunPosRef.current = initialRun;
        setProjectShowcaseRunPosition(initialRun);
        setProjectShowcaseFocus(0);

        scene.add(showcaseRoot);
        projectShowcaseRootRef.current = showcaseRoot;
        projectShowcaseWorldAnchorRef.current = showcaseRoot.position.clone();
        setProjectShowcaseReady(true);
        vlog("🛰️ Project Showcase trench loaded");
      },
      undefined,
      () => {
        projectShowcaseRootRef.current = null;
        projectShowcaseWorldAnchorRef.current = null;
        if (projectShowcaseNebulaRootRef.current) {
          scene.remove(projectShowcaseNebulaRootRef.current);
          projectShowcaseNebulaRootRef.current = null;
        }
        setProjectShowcaseReady(false);
        vlog("⚠️ Failed to load Project Showcase trench model");
      },
    );

    // ── Moon orbit arrival handler ─────────────────────────────────────────────
    // When the nav system reports arrival at a moon, we kick off the orbit
    // state machine instead of immediately entering the content overlay.
    // Content / drone will appear once orbit is established.
    onMoonOrbitArrivalRef.current = (moonMesh: THREE.Mesh, company: any) => {
      const ship = spaceshipRef.current;
      const name = company.navLabel || company.company;
      debugLog("orbit", `onMoonOrbitArrival fired for "${name}"`);
      if (!ship) {
        debugLog("orbit", "ABORT — spaceshipRef is null");
        return;
      }

      // Compute moon radius from its geometry bounding sphere
      const geo = moonMesh.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const moonRadius = (geo.boundingSphere?.radius ?? 30) * moonMesh.scale.x;
      debugLog("orbit", `moonRadius=${moonRadius.toFixed(1)}, scale=${moonMesh.scale.x.toFixed(2)}`);

      const shipPos = ship.position;
      const moonPos = new THREE.Vector3();
      moonMesh.getWorldPosition(moonPos);
      debugLog("orbit", `ship=[${shipPos.x.toFixed(1)},${shipPos.y.toFixed(1)},${shipPos.z.toFixed(1)}]`);
      debugLog("orbit", `moon=[${moonPos.x.toFixed(1)},${moonPos.y.toFixed(1)},${moonPos.z.toFixed(1)}]`);

      // Kick off orbit
      enterOrbit(moonMesh, moonRadius, ship);
      setOrbitPhase("hold");
      shipLog(`Orbit hold — ${name}`, "orbit");
      debugLog("orbit", "Phase → hold");

      // Slow moon self-rotation to 1/3 during orbit for a calm view
      const prevSpinSpeed = optionsRef.current.spaceMoonSpinSpeed ?? 0.1;
      optionsRef.current = {
        ...optionsRef.current,
        spaceMoonSpinSpeed: prevSpinSpeed / 3,
      };
      debugLog("orbit", `Moon spin slowed: ${prevSpinSpeed.toFixed(3)} → ${(prevSpinSpeed / 3).toFixed(3)}`);

      // Suppress zoom-exit detection while in orbit — camera moves continuously
      focusedMoonCameraDistanceRef.current = null;

      // When orbit is fully established, show drone content
      onOrbitEstablishedRef.current = () => {
        setOrbitPhase("orbiting");
        shipLog("Stable orbit established", "orbit");
        debugLog("orbit", "Phase → orbiting — calling enterMoonView");

        // Now trigger the content overlay via the old enterMoonView path
        enterMoonView({
          moonMesh,
          company,
          useFlight: false,
        });

        // Keep zoom-exit suppressed during orbiting
        focusedMoonCameraDistanceRef.current = null;
        debugLog("orbit", "enterMoonView called, zoom-exit suppressed");
      };

      // When orbit exit finishes, clean up
      orbitExitCompleteRef.current = () => {
        setOrbitPhase("idle");
        shipLog("Orbit departed", "orbit");
        debugLog("orbit", "Phase → idle (exit complete)");

        // Restore moon self-rotation to original speed
        optionsRef.current = {
          ...optionsRef.current,
          spaceMoonSpinSpeed: prevSpinSpeed,
        };
        debugLog("orbit", `Moon spin restored: ${prevSpinSpeed.toFixed(3)}`);

        // Fully exit moon focus — clears focusedMoonRef, overlayContent,
        // hides hologram drone, and restores frozen orbital motion.
        // Without this, the moon stays "focused" and can re-trigger orbit.
        exitMoonView();
        debugLog("orbit", "exitMoonView called — full cleanup");

        // Re-enable zoom-exit detection
        focusedMoonCameraDistanceRef.current = null;

        const pendingNav = pendingOrbitExitNavigationRef.current;
        pendingOrbitExitNavigationRef.current = null;
        if (pendingNav && !manualFlightModeRef.current) {
          debugLog(
            "orbit",
            `Running deferred nav after orbit exit: ${pendingNav.targetType}:${pendingNav.targetId}`,
          );
          handleAutopilotNavigation(
            pendingNav.targetId,
            pendingNav.targetType,
            pendingNav.departure,
          );
        }
      };
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

      tourBuilderRef.current?.registerPlanet("experience", expPlanetData);
      tourBuilderRef.current?.registerPlanet("skills", skillsPlanetData);

      planetsDataRef.current.set("experience", expPlanetData);
      planetsDataRef.current.set("skills", skillsPlanetData);
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

      // Any navigation cancels Star Destroyer escort
      if (followingStarDestroyerRef.current) {
        setFollowingStarDestroyer(false);
        followingStarDestroyerRef.current = false;
        vlog("🔺 Star Destroyer escort disengaged — navigating elsewhere");
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
            const behindOffset = shipDirection.multiplyScalar(-NAV_CAMERA_BEHIND);
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
          vlog(
            target === "projects"
              ? `${planetLabel} — Routing to trench destination...`
              : `${planetLabel} — Traveling to ${target} Planet...`,
          );

          // Always use autopilot — ship is always engaged
          if (!manualFlightModeRef.current) {
            // Use unified quick-nav path to ensure moon-exit clearance applies.
            handleQuickNav(target, "section");
            break;
          }

          if (target === "projects") {
            pendingProjectShowcaseEntryRef.current = true;
            projectShowcaseAwaitingProjectsArrivalRef.current = false;
            projectShowcaseSawProjectsTravelRef.current = false;
            startProjectShowcaseEntrySequence();
            break;
          }

          // Fallback: manual flight mode — direct camera
          const planetMesh = target === "experience" ? expPlanet : skillsPlanet;
          const planetDist = target === "experience" ? EXP_FOCUS_DIST : SKILLS_FOCUS_DIST;
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
      starDestroyerRef,
      onStarDestroyerClick: handleStarDestroyerClick,
      insideShipRef,
    });

    const onPointerMoveGlobal = (event: PointerEvent) => {
      if (projectShowcaseActiveRef.current) return;
      onPointerMove(event);
    };
    const onClickGlobal = (event: MouseEvent) => {
      if (projectShowcaseActiveRef.current) return;
      onClick(event);
    };
    const onPointerDownRotateGlobal = (event: PointerEvent) => {
      if (projectShowcaseActiveRef.current) return;
      onPointerDownRotate(event);
    };
    const onPointerMoveRotateGlobal = (event: PointerEvent) => {
      if (projectShowcaseActiveRef.current) return;
      onPointerMoveRotate(event);
    };
    const onPointerUpRotateGlobal = (event: PointerEvent) => {
      if (projectShowcaseActiveRef.current) return;
      onPointerUpRotate(event);
    };

    window.addEventListener("pointermove", onPointerMoveGlobal);
    window.addEventListener("click", onClickGlobal);
    // Add rotate handlers
    window.addEventListener("pointerdown", onPointerDownRotateGlobal);
    window.addEventListener("pointermove", onPointerMoveRotateGlobal);
    window.addEventListener("pointerup", onPointerUpRotateGlobal);

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
      spaceshipCameraOffsetRef,
      shipViewModeRef,
      insideShipRef,
      debugSnapToShipRef,
      shipExploreModeRef,
      shipExploreKeysRef,
      shipExploreCoordsRef,
      shipRollOffsetRef,
      navTurnActiveRef,
      settledViewTargetRef,
      optionsRef,
      hologramDroneRef,
      starDestroyerCruiserRef,
      starDestroyerRef,
      followingStarDestroyerRef,
      updateAutopilotNavigation,
      updateMoonOrbit: updateOrbit,
      isMoonOrbiting: isOrbiting,
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
      debugLog,
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

      // Boot message in ship terminal
      shipLog("Systems online", "system");
      shipLog("Navigation ready — autopilot engaged", "nav");

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
            camera.near = NEAR_OVERVIEW;
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
      window.removeEventListener("pointermove", onPointerMoveGlobal);
      window.removeEventListener("click", onClickGlobal);
      window.removeEventListener("pointerdown", onPointerDownRotateGlobal);
      window.removeEventListener("pointermove", onPointerMoveRotateGlobal);
      window.removeEventListener("pointerup", onPointerUpRotateGlobal);
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

      projectShowcaseRootRef.current = null;
      projectShowcaseWorldAnchorRef.current = null;
      projectShowcaseNebulaRootRef.current = null;
      skillsLatticeRootRef.current = null;
      skillsLatticeNodesRef.current = [];
      skillsLatticeLineMatsRef.current = [];
      skillsLatticeLinkSegmentsRef.current = [];
      skillsLatticeFlowPointsRef.current = null;
      skillsLatticeFlowMetaRef.current = [];
      skillsLatticeRippleRef.current.active = false;
      skillsLatticeSelectedNodeRef.current = null;
      setSkillsLatticeSelection(null);
      setSkillsLatticeActive(false);
      skillsLegacyBodiesRef.current = [];
      projectShowcasePanelsRef.current = [];
      projectShowcaseTrackRef.current = null;


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

  const focusedProjectShowcasePanel =
    projectShowcasePanelsRef.current[projectShowcaseFocusIndex] ?? null;
  const projectShowcaseNavEntries = projectShowcasePanelsRef.current.map(
    (panel) => panel.entry,
  );
  const projectShowcaseNavRows = [
    ...projectShowcaseNavEntries.map((entry, index) => ({
      key: `${entry.id}-${index}`,
      title: `${index + 1}. ${entry.title}`,
      index,
      placeholder: false,
    })),
    ...Array.from({ length: 8 }, (_, idx) => ({
      key: `placeholder-${idx}`,
      title: "",
      index: -1,
      placeholder: true,
    })),
  ];
  const focusedProjectShowcaseHasCoverCrop =
    focusedProjectShowcasePanel?.fitMode === "cover" &&
    ((focusedProjectShowcasePanel.baseRepeat.x ?? 1) < 0.999 ||
      (focusedProjectShowcasePanel.baseRepeat.y ?? 1) < 0.999);

  return (
    <>
      <style>{`
        .project-showcase-nav-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .project-showcase-nav-scroll::-webkit-scrollbar-track {
          background: rgba(10, 16, 28, 0.72);
          border-radius: 6px;
        }
        .project-showcase-nav-scroll::-webkit-scrollbar-thumb {
          background: rgba(110, 165, 230, 0.72);
          border-radius: 6px;
          border: 1px solid rgba(160, 200, 255, 0.25);
        }
      `}</style>
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
          {cosmosIntroOverlayOpacity > 0.001 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10035,
                pointerEvents: "none",
                background: `rgba(2, 4, 10, ${cosmosIntroOverlayOpacity.toFixed(3)})`,
              }}
            />
          )}
          {projectShowcaseEntryOverlayOpacity > 0.001 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10040,
                pointerEvents: "none",
                background: `radial-gradient(ellipse at 50% 42%, rgba(8, 16, 30, ${(
                  projectShowcaseEntryOverlayOpacity * 0.32
                ).toFixed(3)}), rgba(2, 5, 12, ${projectShowcaseEntryOverlayOpacity.toFixed(
                  3,
                )}) 82%)`,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 72,
              }}
            >
              <div
                style={{
                  color: "rgba(193, 215, 255, 0.9)",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  fontSize: 13,
                  textTransform: "uppercase",
                  textShadow: "0 0 14px rgba(80, 130, 220, 0.42)",
                  opacity: THREE.MathUtils.clamp(
                    projectShowcaseEntryOverlayOpacity * 1.4,
                    0,
                    1,
                  ),
                }}
              >
                Entering Project Showcase
              </div>
            </div>
          )}
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

          {!isLoading && (
            <button
              type="button"
              aria-label={consoleVisible ? "Hide console logs" : "Show console logs"}
              title={consoleVisible ? "Hide console logs" : "Show console logs"}
              onClick={() => setConsoleVisible(!consoleVisible)}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                zIndex: 10002,
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: "1px solid rgba(150, 170, 190, 0.45)",
                background: consoleVisible
                  ? "rgba(38, 46, 58, 0.88)"
                  : "rgba(24, 30, 40, 0.84)",
                color: consoleVisible ? "#d8e7ff" : "#b6c6da",
                boxShadow: consoleVisible
                  ? "0 2px 8px rgba(8, 12, 18, 0.45)"
                  : "0 1px 6px rgba(8, 12, 18, 0.35)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                lineHeight: 1,
                userSelect: "none",
              }}
            >
              <span aria-hidden="true">&gt;_</span>
            </button>
          )}

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

          {/* Ship Control Bar — hidden while Project Showcase is active */}
          {!projectShowcaseActive && (
            <ShipControlBar
              phase={shipUIPhase}
              isFollowingSD={followingStarDestroyer}
              onDisengage={stopFollowingStarDestroyer}
            />
          )}

          {/* Ship Terminal — top-right CRT log + command input */}
          <ShipTerminal
            logs={shipLogs}
            debugLogs={debugLogs}
            debugLogTotal={debugLogTotal}
            visible={consoleVisible}
            onCommand={(cmd) => {
              shipLog(`$ ${cmd}`, "cmd");
              // Command execution will be wired later
            }}
            onClearDebug={() => {
              debugLogsRef.current = [];
              setDebugLogs([]);
            }}
          />

          {/* Ship destination nav panel — left side (all ship modes) */}
          {shipUIPhase === "ship-engaged" && (
            <CockpitNavPanel
              targets={navigationTargets}
              currentTarget={currentNavigationTarget}
              isNavigating={navigationDistance !== null}
              onNavigate={handleCockpitNavigate}
            />
          )}

          {skillsLatticeActive && skillsLatticeSelection && (
            <div
              style={{
                position: "fixed",
                right: 18,
                top: 108,
                width: 296,
                zIndex: 1120,
                borderRadius: 10,
                border: "1px solid rgba(110, 210, 255, 0.42)",
                background: "rgba(6, 14, 26, 0.86)",
                color: "#d8eeff",
                padding: "12px 12px 10px",
                fontFamily: "'Rajdhani', sans-serif",
                backdropFilter: "blur(6px)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1.4,
                  color: "#8fcfff",
                  marginBottom: 5,
                }}
              >
                SKILLS CONSTELLATION
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1.1,
                  color: "#f2f8ff",
                }}
              >
                {skillsLatticeSelection.label}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "rgba(180,220,255,0.92)",
                }}
              >
                {skillsLatticeSelection.nodeType === "category"
                  ? "Category"
                  : `Skill in ${skillsLatticeSelection.category}`}
              </div>
              <div
                style={{
                  marginTop: 9,
                  maxHeight: 180,
                  overflowY: "auto",
                  borderTop: "1px solid rgba(120,170,220,0.24)",
                  paddingTop: 8,
                  fontSize: 12,
                  lineHeight: 1.4,
                }}
              >
                {skillsLatticeSelection.detailItems.map((item) => (
                  <div key={item} style={{ marginBottom: 5, color: "#c6ddf5" }}>
                    - {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {projectShowcaseActive && (
            <div
              style={{
                position: "fixed",
                right: 18,
                top: 96,
                zIndex: 1100,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "flex-end",
                width: 332,
                maxWidth: 332,
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(114, 198, 255, 0.45)",
                  background: "rgba(8, 16, 26, 0.78)",
                  color: "#c7e9ff",
                  fontSize: 12,
                  fontFamily: "'Rajdhani', sans-serif",
                  letterSpacing: 0.6,
                }}
              >
                PROJECT SHOWCASE
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignSelf: "flex-start",
                }}
              >
                <button
                  onClick={() => stepProjectShowcaseFocus(-1)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(200, 220, 255, 0.35)",
                    background: "rgba(10, 12, 20, 0.75)",
                    color: "#e8ebff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                  }}
                >
                  Prev
                </button>
                <button
                  onClick={toggleProjectShowcasePlayback}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(200, 220, 255, 0.35)",
                    background: "rgba(10, 12, 20, 0.75)",
                    color: "#e8ebff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                  }}
                >
                  {projectShowcasePlaying ? "Pause" : "Play"}
                </button>
                <button
                  onClick={() => stepProjectShowcaseFocus(1)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(200, 220, 255, 0.35)",
                    background: "rgba(10, 12, 20, 0.75)",
                    color: "#e8ebff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                  }}
                >
                  Next
                </button>
              </div>
              <div
                style={{
                  width: "100%",
                  padding: "8px 10px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(114, 198, 255, 0.3)",
                  background: "rgba(7, 13, 24, 0.84)",
                  color: "#c7e9ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  display: "flex",
                  gap: 10,
                  alignItems: "stretch",
                  minHeight: 290,
                }}
              >
                <div
                  style={{
                    width: 54,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: 13, lineHeight: 1, opacity: 0.92 }}>▲</div>
                  <div
                    onPointerDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      projectShowcaseLeverRectRef.current = rect;
                      startProjectShowcaseLeverDrag(e.clientY, rect);
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    style={{
                      position: "relative",
                      width: 30,
                      height: 232,
                      borderRadius: 999,
                      border: "1px solid rgba(160, 205, 255, 0.38)",
                      background:
                        "linear-gradient(180deg, rgba(22,40,58,0.95) 0%, rgba(10,18,28,0.9) 100%)",
                      cursor: "ns-resize",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 5,
                        right: 5,
                        top: "50%",
                        height: 1,
                        background: "rgba(160, 200, 255, 0.45)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: 4,
                        right: 4,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: "1px solid rgba(220, 235, 255, 0.65)",
                        background:
                          "radial-gradient(circle at 30% 30%, rgba(180,220,255,0.95) 0%, rgba(96,154,210,0.95) 35%, rgba(30,64,94,0.98) 100%)",
                        boxShadow: "0 2px 8px rgba(5, 10, 16, 0.5)",
                        top: `${50 - projectShowcaseLeverValue * 40}%`,
                        transform: "translateY(-50%)",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1, opacity: 0.92 }}>▼</div>
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    {PROJECT_SHOWCASE_FILTER_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        style={{
                          padding: "4px 7px",
                          borderRadius: 6,
                          border: "1px solid rgba(120, 165, 225, 0.32)",
                          background: "rgba(10, 16, 28, 0.78)",
                          color: "#c5dcff",
                          cursor: "pointer",
                          fontFamily: "'Rajdhani', sans-serif",
                          fontSize: 10,
                          letterSpacing: 0.35,
                          lineHeight: 1.1,
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  <div
                    className="project-showcase-nav-scroll"
                    style={{
                      flex: 1,
                      minHeight: 188,
                      maxHeight: 230,
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 6,
                      paddingRight: 4,
                      scrollbarWidth: "thin",
                      scrollbarColor:
                        "rgba(110, 165, 230, 0.7) rgba(10, 16, 28, 0.72)",
                    }}
                  >
                    {projectShowcaseNavRows.map((row) => {
                      const active = row.index === projectShowcaseFocusIndex;
                      return (
                        <button
                          key={row.key}
                          onClick={() => {
                            if (row.placeholder || row.index < 0) return;
                            jumpProjectShowcaseToIndex(row.index);
                          }}
                          style={{
                            padding: "5px 7px",
                            borderRadius: 6,
                            border: active
                              ? "1px solid rgba(155, 220, 255, 0.78)"
                              : "1px solid rgba(120, 165, 225, 0.32)",
                            background: active
                              ? "rgba(34, 92, 140, 0.88)"
                              : "rgba(10, 16, 28, 0.78)",
                            color: active ? "#ecf6ff" : "#c5dcff",
                            cursor: row.placeholder ? "default" : "pointer",
                            textAlign: "left",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 10,
                            fontWeight: active ? 700 : 600,
                            letterSpacing: 0.32,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            opacity: row.placeholder ? 0.52 : 1,
                            minHeight: 24,
                            maxWidth: "100%",
                          }}
                          title={row.placeholder ? "" : row.title}
                        >
                          {row.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {PROJECT_SHOWCASE_SHOW_IMAGE_MANIPULATION_CONTROLS &&
                focusedProjectShowcaseHasCoverCrop && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(130, 170, 255, 0.35)",
                    background: "rgba(8, 12, 20, 0.75)",
                    color: "#c8d8ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 11,
                    lineHeight: 1.3,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, letterSpacing: 0.35 }}>
                    IMAGE CONTROLS
                  </div>
                  <div style={{ opacity: 0.9 }}>
                    Cover image is cropped. Use arrows and zoom slider.
                  </div>
                  <div style={{ opacity: 0.78 }}>
                    Shift+Drag pan • Shift+Wheel zoom
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 4,
                    }}
                  >
                    {[
                      { label: "↖", dx: -1 as const, dy: 1 as const },
                      { label: "↑", dx: 0 as const, dy: 1 as const },
                      { label: "↗", dx: 1 as const, dy: 1 as const },
                      { label: "←", dx: -1 as const, dy: 0 as const },
                      { label: "•", dx: 0 as const, dy: 0 as const },
                      { label: "→", dx: 1 as const, dy: 0 as const },
                      { label: "↙", dx: -1 as const, dy: -1 as const },
                      { label: "↓", dx: 0 as const, dy: -1 as const },
                      { label: "↘", dx: 1 as const, dy: -1 as const },
                    ].map((dir) => (
                      <button
                        key={dir.label}
                        onClick={() => {
                          if (dir.dx === 0 && dir.dy === 0) {
                            resetProjectShowcasePanelViewport();
                            return;
                          }
                          nudgeProjectShowcasePanelViewport(dir.dx, dir.dy);
                        }}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid rgba(190, 215, 255, 0.35)",
                          background:
                            dir.dx === 0 && dir.dy === 0
                              ? "rgba(24, 60, 86, 0.85)"
                              : "rgba(10, 12, 20, 0.75)",
                          color: "#e8ebff",
                          cursor: "pointer",
                          fontSize: 12,
                          fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 700,
                        }}
                      >
                        {dir.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Zoom</span>
                      <span>
                        {(focusedProjectShowcasePanel?.zoom ?? 1).toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={4}
                      step={0.01}
                      value={focusedProjectShowcasePanel?.zoom ?? 1}
                      onChange={(e) =>
                        setProjectShowcasePanelZoom(Number(e.target.value))
                      }
                    />
                  </div>
                  <button
                    onClick={() => resetProjectShowcasePanelViewport()}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(200, 220, 255, 0.35)",
                      background: "rgba(10, 12, 20, 0.75)",
                      color: "#e8ebff",
                      cursor: "pointer",
                      fontSize: 11,
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                      letterSpacing: 0.35,
                    }}
                  >
                    Reset View
                  </button>
                </div>
              )}
              <div
                style={{
                  width: "100%",
                  padding: "8px 10px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(114, 198, 255, 0.3)",
                  background: "rgba(7, 13, 24, 0.84)",
                  color: "#d9e6ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>IMAGE ANGLE</span>
                  <span>{projectShowcaseAnglePercent.toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={PROJECT_SHOWCASE_MIN_ANGLE_PERCENT}
                  max={PROJECT_SHOWCASE_MAX_ANGLE_PERCENT}
                  step={1}
                  value={projectShowcaseAnglePercent}
                  onChange={(e) =>
                    setProjectShowcaseAnglePercent(Number(e.target.value))
                  }
                />
              </div>
            </div>
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
                      4000 * (distance / CINE_DURATION_DIVISOR),
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
                      4500 * (distance / CINE_DURATION_DIVISOR),
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
                cc.maxDistance = CONTROLS_MAX_DIST;
              }
              // Restore near clipping plane
              if (sceneRef.current.camera instanceof THREE.PerspectiveCamera) {
                sceneRef.current.camera.near = NEAR_DEFAULT;
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
            content={null}
            contentLoading={false}
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

    </>
  );
}
