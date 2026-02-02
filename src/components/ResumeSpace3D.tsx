/**
 * ============================================================================
 * RESUMESPACE3D.TSX - 3D Space Resume Visualization Component
 * ============================================================================
 *
 * PURPOSE:
 * This is a large, monolithic React component (~4600 lines) that creates an
 * interactive 3D space scene using Three.js to display resume information.
 * The resume sections (Experience, Skills, Projects) are represented as planets
 * orbiting a sun, with job positions as moons orbiting the Experience planet.
 * Users can navigate via a controllable spaceship in autopilot or manual flight mode.
 *
 * CORE FEATURES:
 *
 * 1. THREE.JS SCENE MANAGEMENT
 *    - WebGL renderer with post-processing effects (bloom)
 *    - CSS2D renderer for labels
 *    - Perspective camera with OrbitControls
 *    - Scene with sun, planets, moons, starfield backgrounds
 *    - Point lights with physical decay and ambient lighting
 *
 * 2. CELESTIAL BODIES
 *    - Sun: Central object representing the resume owner
 *    - Planets: Main resume sections (Experience, Skills, Projects)
 *    - Moons: Individual jobs orbiting the Experience planet
 *    - All with textures, labels, orbital mechanics, and interactive hovers
 *
 * 3. SPACESHIP NAVIGATION SYSTEM
 *    - GLTF model loader for spaceship mesh
 *    - Autopilot mode: Automated navigation to planets/moons
 *    - Manual flight mode: Keyboard-controlled flight with pitch/yaw/roll
 *    - Turbo boost for long-distance travel
 *    - Camera follow system with multiple view modes (exterior/interior/cockpit)
 *
 * 4. INTERACTION & NAVIGATION
 *    - Raycasting for click detection on planets and moons
 *    - Moon focus mode: Zoom in, freeze orbit, display overlays
 *    - Hover effects with multi-layer halos and emissive glow
 *    - Drag-to-rotate focused moons
 *    - Quick navigation drawer for autopilot jumps
 *
 * 5. CONTENT OVERLAY SYSTEM
 *    - Dynamic overlay content for focused moons (job details)
 *    - Procedural texture generation for detail overlays
 *    - Title overlays and bullet-point notes that slide out
 *    - Cosmic content overlay component integration
 *
 * 6. TOUR SYSTEM
 *    - Guided tour functionality via CosmicTourGuide
 *    - Waypoint-based camera animations
 *    - Progress tracking and tour state management
 *
 * 7. LOGGING SYSTEMS
 *    - vlog(): Universe Logs - Technical/debug info displayed in on-screen console
 *    - missionLog(): Ship Logs - Game-style navigation events for HUD
 *    - Visual console overlay with timestamp formatting
 *
 * 8. ORBITAL MECHANICS
 *    - Elliptical orbit paths with customizable speeds
 *    - Orbit freezing/unfreezing for moon focus
 *    - Orbital position tracking via OrbitalPositionEmitter
 *    - Orbit anchor system for hierarchical motion
 *
 * 9. VISUAL EFFECTS
 *    - UnrealBloomPass for glow effects
 *    - Procedural sprite-based halos (aurora, ring, core layers)
 *    - Random halo colors and animations per planet
 *    - Emissive material flash effects on hover
 *    - Multi-layer starfield backgrounds with depth
 *
 * 10. STATE MANAGEMENT
 *     - React state for UI updates (loading, tour, navigation, visibility)
 *     - Refs for performance-critical data (spaceship, navigation targets, items)
 *     - Keyboard state tracking for manual flight controls
 *     - Navigation state (current target, distance, ETA)
 *
 * KEY FUNCTIONS:
 *
 * SCENE SETUP:
 * - createPlanet(): Factory function to create planet/moon meshes with orbits
 * - createLabel(): CSS2D label generation
 * - createDetailTexture(): Canvas-based texture generation for overlays
 * - attachMultiNoteOverlays(): Attach multiple text overlays to planets
 *
 * NAVIGATION & INTERACTION:
 * - handleAutopilotNavigation(): Navigate to planets/moons in autopilot mode
 * - handleExperienceCompanyNavigation(): Navigate to specific job moons
 * - finalizeFocusOnMoon(): Enter focus mode on a moon (freeze orbit, show overlay)
 * - exitFocusedMoon(): Exit focus mode and restore normal orbit
 * - onClick(): Raycasting-based click handler for planets/moons
 * - onPointerMove(): Hover detection and visual effects
 *
 * ORBITAL MECHANICS:
 * - freezeOrbitalMotion(): Freeze all orbital speeds for moon visit
 * - Animation loop updates for orbital positions and angles
 *
 * SPACESHIP CONTROL:
 * - Manual flight keyboard handlers (pitch, yaw, roll, strafe)
 * - Autopilot navigation with turbo boost
 * - Camera follow system with view mode switching
 * - SpaceshipNavigationSystem integration for moon tracking
 *
 * CONTENT & UI:
 * - handleContentDisplay(): Display overlay content for waypoints
 * - handleNavigation(): Router for different navigation targets
 * - registerPlanetData(): Build planet metadata for tour system
 * - vlog(), missionLog(): Dual logging system for debug and game events
 *
 * VISUAL EFFECTS:
 * - animate(): Main render loop (60fps) handling all animations
 * - Hover effect animations (halo layers, emissive pulses, flashes)
 * - Bullet overlay slide-out animations
 * - Camera animation system for smooth movements
 *
 * HELPERS:
 * - setMinDistance(): Utility to control camera zoom limits
 * - handleResize(): Responsive canvas resizing
 * - preventDefaultTouch(): Touch gesture handling
 *
 * REACT LIFECYCLE:
 * - Main useEffect: Scene initialization, spaceship loading, event listeners
 * - Options useEffect: Live updates for bloom, sun intensity, orbit visibility
 * - Light effects: Exterior/interior spaceship lights
 * - Manual flight: Keyboard event handlers
 *
 * EXTERNAL INTEGRATIONS:
 * - CosmicNavigation.ts: Camera director, tour guide, navigation interface
 * - TourDefinitionBuilder.ts: Tour waypoint system
 * - OrbitalPositionEmitter.ts: Real-time object position tracking
 * - SpaceshipNavigationSystem.ts: Advanced navigation for moving targets
 * - SpaceshipHUDClean.tsx: On-screen HUD with navigation controls
 * - CosmicContentOverlay.tsx: Full-screen overlay for focused content
 *
 * DATA SOURCES:
 * - resume.json: Resume data (experience, skills, projects)
 * - Textures: Planet surfaces, sun, starfields
 * - GLTF Model: Spaceship 3D model
 *
 * KNOWN ISSUES:
 * - File is extremely large (~4600 lines) and difficult to maintain
 * - Many responsibilities mixed in one component
 * - Complex state dependencies between refs and React state
 * - Some console.log statements remain for critical errors
 *
 * REFACTORING CANDIDATES:
 * - Extract scene setup into separate module
 * - Extract spaceship control system
 * - Extract orbital mechanics system
 * - Extract interaction handlers (click, hover, drag)
 * - Extract visual effects (halos, overlays, animations)
 * - Create custom hooks for state management
 * - Separate canvas creation from business logic
 *
 * ============================================================================
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import resumeData from "../data/resume.json";
import CosmosLoader from "./CosmosLoader";
import {
  DEFAULT_CONTROL_SENSITIVITY,
  DEFAULT_MOON_VISIT_DURATION,
  DEFAULT_SPACESHIP_PATH_SPEED,
  DEFAULT_ZOOM_EXIT_THRESHOLD,
} from "./cosmos/ResumeSpace3D.constants";
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
} from "./cosmos/ResumeSpace3D.factories";
import { createFinalizeFocusOnMoon } from "./cosmos/ResumeSpace3D.content";
import { createExitFocusedMoon } from "./cosmos/ResumeSpace3D.exitFocus";
import {
  createFocusedMoonRotationHandlers,
  createPointerInteractionHandlers,
} from "./cosmos/ResumeSpace3D.interaction";
import { updateOrbit } from "./cosmos/ResumeSpace3D.orbital";
import { easeOutCubic } from "./cosmos/ResumeSpace3D.helpers";
import {
  freezeSystemForMoon,
  restoreFrozenSystem,
  type FrozenSystemState,
} from "./cosmos/ResumeSpace3D.systemFreeze";
import type {
  ResumeSpace3DProps,
  SceneRef,
} from "./cosmos/ResumeSpace3D.types";

// Import our new cosmic systems
import {
  CosmosCameraDirector,
  CosmicTourGuide,
  NavigationInterface,
  type NavigationWaypoint,
} from "./CosmicNavigation";
import type { OverlayContent } from "./CosmicContentOverlay";
import {
  TourDefinitionBuilder,
  type PlanetData,
} from "./TourDefinitionBuilder";
import SpaceshipHUD from "./SpaceshipHUDClean.tsx";
import { getOrbitalPositionEmitter } from "./OrbitalPositionEmitter";
import {
  SpaceshipNavigationSystem,
  type NavigationStatus,
} from "./SpaceshipNavigationSystem";

// Global singleton to prevent multiple WebGL context creation
let globalRenderer: THREE.WebGLRenderer | null = null;
let globalCleanup: (() => void) | null = null;

// Extend window for logging timestamps
declare global {
  interface Window {
    lastAutopilotLog?: number;
  }
}

export default function ResumeSpace3D({
  options,
  onOptionsChange,
}: ResumeSpace3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<SceneRef>({});

  // State for new cosmic systems
  const [overlayContent, setOverlayContent] = useState<OverlayContent | null>(
    null,
  );
  const [contentLoading, setContentLoading] = useState(false);
  const originalMinDistanceRef = useRef<number>(0);
  // Request flag to tell the scene effect to exit focused moon (cross-scope safe)
  const exitFocusRequestRef = useRef<boolean>(false);

  // How many world units change in camera-to-moon distance should trigger exiting focus
  // Tune this to allow small zoom adjustments without losing focus.
  const zoomExitThresholdRef = useRef<number>(DEFAULT_ZOOM_EXIT_THRESHOLD); // units (default suggestion)

  // Visual console state
  const [consoleVisible, setConsoleVisible] = useState(true);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const consoleLogsRef = useRef<string[]>([]);

  // HUD visibility state
  const [hudVisible, setHudVisible] = useState(true);

  // Mission Control logs state (for game/navigation logs)
  const [missionControlLogs, setMissionControlLogs] = useState<string[]>([]);
  const missionControlLogsRef = useRef<string[]>([]);

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
  const spaceshipLightsRef = useRef<THREE.PointLight[]>([]);
  const spaceshipEngineLightRef = useRef<THREE.PointLight | null>(null);

  const spaceshipCameraOffsetRef = useRef<THREE.Vector3>(
    new THREE.Vector3(0, 20, -60),
  );
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
    KeyZ: false, // Roll left
    KeyC: false, // Roll right
  });

  // Autopilot navigation state
  const [currentNavigationTarget, setCurrentNavigationTarget] = useState<
    string | null
  >(null);
  const [navigationDistance, setNavigationDistance] = useState<number | null>(
    null,
  );
  const [navigationETA, setNavigationETA] = useState<number | null>(null);
  const navigationTargetRef = useRef<{
    id: string | null;
    type: "section" | "moon" | null;
    position: THREE.Vector3 | null;
    startPosition: THREE.Vector3 | null;
    startTime: number;
    useTurbo: boolean;
    lastUpdateFrame?: number;
    turboLogged?: boolean;
    decelerationLogged?: boolean;
  }>({
    id: null,
    type: null,
    position: null,
    startPosition: null,
    startTime: 0,
    useTurbo: false,
  });

  // Build navigation targets from resume data
  const navigationTargets = [
    {
      id: "experience",
      label: "Experience",
      type: "section" as const,
      icon: "🌍",
    },
    { id: "skills", label: "Skills", type: "section" as const, icon: "⚡" },
    ...resumeData.experience.map((exp) => ({
      id: exp.id,
      label: exp.navLabel || exp.company,
      type: "moon" as const,
      icon: "🏢",
    })),
  ];

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

  // Handle autopilot navigation from drawer
  const handleAutopilotNavigation = (
    targetId: string,
    targetType: "section" | "moon",
  ) => {
    vlog(`🖱️ CLICK: Navigation button clicked - ${targetType}: ${targetId}`);

    // If a moon is currently focused, schedule exit so its orbit resumes before new travel
    if (focusedMoonRef.current) {
      exitFocusRequestRef.current = true;
      vlog("↩️ Exiting previous focused moon before new navigation");
    }

    if (!followingSpaceshipRef.current || manualFlightModeRef.current) {
      vlog("⚠️ Navigation only available in autopilot mode");
      vlog(
        `   Following: ${followingSpaceshipRef.current}, Manual: ${manualFlightModeRef.current}`,
      );
      return;
    }

    if (!navigationSystemRef.current) {
      vlog("⚠️ Navigation system not initialized");
      return;
    }

    vlog(`🎯 Autopilot navigation to ${targetType}: ${targetId}`);

    if (targetType === "moon") {
      // Use new navigation system for moons
      const moonId = `moon-${targetId}`;

      if (!emitterRef.current.isTracking(moonId)) {
        vlog(`⚠️ Moon ${targetId} is not being tracked by emitter`);
        return;
      }

      // Determine if we should use turbo based on distance
      const currentPos = emitterRef.current.getCurrentPosition(moonId);
      const useTurbo =
        currentPos && spaceshipRef.current
          ? spaceshipRef.current.position.distanceTo(currentPos.worldPosition) >
            500
          : true;

      vlog(`🎯 Starting navigation to moon: ${moonId}`);
      vlog(`   Emitter tracking: ${emitterRef.current.isTracking(moonId)}`);
      vlog(`   Nav system exists: ${!!navigationSystemRef.current}`);
      vlog(`   Ship exists: ${!!spaceshipRef.current}`);

      const success = navigationSystemRef.current.navigateToObject(
        moonId,
        useTurbo,
      );

      if (success) {
        setCurrentNavigationTarget(targetId);
        vlog(`✅ Navigation started to moon: ${targetId} (turbo: ${useTurbo})`);
        missionLog(
          `🎯 NAVIGATION INITIATED: Target - ${targetId} | Distance: ${currentPos ? spaceshipRef.current!.position.distanceTo(currentPos.worldPosition).toFixed(0) : "unknown"}u`,
        );
      } else {
        vlog(`❌ Failed to start navigation to moon: ${targetId}`);
        missionLog(`⚠️ NAVIGATION FAILED: Unable to lock onto ${targetId}`);
      }
    } else if (targetType === "section") {
      // Handle section navigation (planets) - use old approach for now
      // TODO: Could also use new system for planets
      let targetPosition: THREE.Vector3 | null = null;
      let targetName = targetId;

      sceneRef.current.scene?.traverse((object) => {
        if (object instanceof THREE.Mesh && object.userData.planetName) {
          const objName = (object.userData.planetName || "").toLowerCase();
          if (objName === targetName.toLowerCase()) {
            targetPosition = new THREE.Vector3();
            object.getWorldPosition(targetPosition);
          }
        }
      });

      if (targetPosition && spaceshipRef.current) {
        const shipPos = spaceshipRef.current.position.clone();
        const targetPos = targetPosition as THREE.Vector3;
        const distance = shipPos.distanceTo(targetPos);

        vlog(
          `✅ Target found at [${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)}]`,
        );
        vlog(
          `📍 Ship at [${shipPos.x.toFixed(1)}, ${shipPos.y.toFixed(1)}, ${shipPos.z.toFixed(1)}]`,
        );
        vlog(`📏 Distance: ${distance.toFixed(1)} units`);

        // Store navigation data for old system
        navigationTargetRef.current = {
          id: targetId,
          type: targetType,
          position: targetPos,
          startPosition: shipPos.clone(),
          startTime: Date.now(),
          useTurbo: distance > 500,
        };

        vlog(
          `📏 Distance to target: ${distance.toFixed(1)} units ${navigationTargetRef.current.useTurbo ? "(TURBO enabled)" : ""}`,
        );
      } else {
        vlog(`❌ Could not find target: ${targetId}`);
        setCurrentNavigationTarget(null);
      }
    }
  };

  // Custom logging function
  const vlog = (message: string, data?: any) => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 1,
    });
    const logMessage = `[${timestamp}] ${message}`;

    // Log to regular console
    if (data !== undefined) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }

    // Add to visual console
    const newLogs = [...consoleLogsRef.current, logMessage];
    consoleLogsRef.current = newLogs;
    setConsoleLogs(newLogs);
  };

  // Mission Control logging (game-related logs for navigation, combat, etc.)
  const missionLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const logMessage = `[${timestamp}] ${message}`;

    // Add to mission control console
    const newLogs = [...missionControlLogsRef.current, logMessage];
    missionControlLogsRef.current = newLogs;
    setMissionControlLogs(newLogs);
  };

  // Refs for cosmic systems
  const cameraDirectorRef = useRef<CosmosCameraDirector | null>(null);
  const focusedMoonRef = useRef<THREE.Mesh | null>(null);
  const tourGuideRef = useRef<CosmicTourGuide | null>(null);
  const navigationInterfaceRef = useRef<NavigationInterface | null>(null);
  const tourBuilderRef = useRef<TourDefinitionBuilder | null>(null);
  const planetsDataRef = useRef<Map<string, PlanetData>>(new Map());

  // New navigation system refs
  const emitterRef = useRef(getOrbitalPositionEmitter());
  const navigationSystemRef = useRef<SpaceshipNavigationSystem | null>(null);

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

  // HUD show/hide control
  const hudRefs = useRef<{
    top: HTMLElement | null;
    right: HTMLElement | null;
    left: HTMLElement | null;
    footer: HTMLElement | null;
  }>({ top: null, right: null, left: null, footer: null });

  // Store options in a ref so the animation loop can access the latest values
  // without needing to be recreated on every render
  const optionsRef = useRef({ spaceMoonOrbitSpeed: 0.01, ...options });
  useEffect(() => {
    optionsRef.current = { spaceMoonOrbitSpeed: 0.01, ...options };

    // Update live properties - directly control bloom like the original
    if (sceneRef.current.bloomPass && options.spaceSunIntensity !== undefined) {
      // Map slider value (0.5-5) to bloom strength (0-2)
      const bloomStrength = (options.spaceSunIntensity / 5) * 2;
      sceneRef.current.bloomPass.strength = bloomStrength;
      console.log("Updated bloom strength to:", bloomStrength);
    }

    if (sceneRef.current.sunLight && options.spaceSunIntensity !== undefined) {
      sceneRef.current.sunLight.intensity = options.spaceSunIntensity * 2;
      // Tint only the light with chosen color; do not repaint sun mesh
      if (options.spaceSunColor) {
        sceneRef.current.sunLight.color = new THREE.Color(
          options.spaceSunColor,
        );
      }
      // Update glow sprite color to match sun color; adjust opacity slightly by intensity
      if (sceneRef.current.sunGlowMaterial) {
        const glowColor = new THREE.Color(options.spaceSunColor || 0xffaa00);
        sceneRef.current.sunGlowMaterial.color.copy(glowColor);
        sceneRef.current.sunGlowMaterial.opacity = Math.min(
          0.4 + (options.spaceSunIntensity || 2.5) * 0.1,
          0.9,
        );
      }
    }
    // Optionally tint the sun mesh surface. When disabled, keep texture unmodified.
    if (sceneRef.current.sunMaterial) {
      if (options.spaceTintSunMesh && options.spaceSunColor) {
        sceneRef.current.sunMaterial.color.set(options.spaceSunColor);
      } else {
        sceneRef.current.sunMaterial.color.set(0xffffff);
      }
      sceneRef.current.sunMaterial.needsUpdate = true;
    }
    if (sceneRef.current.labelRendererDom) {
      sceneRef.current.labelRendererDom.style.display =
        options.spaceShowLabels === false ? "none" : "block";
    }

    // Control orbit lines visibility
    if (sceneRef.current.scene) {
      const showOrbits = options.spaceShowOrbits !== false;
      sceneRef.current.scene.traverse((object) => {
        if (object.userData.isOrbitLine) {
          object.visible = showOrbits;
        }
      });
      if (frozenSystemStateRef.current) {
        frozenSystemStateRef.current.orbitLines.forEach((line) => {
          line.visible = false;
        });
      }
    }
  }, [options]);

  // Update spaceship exterior lights
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

  // Manual flight keyboard controls
  useEffect(() => {
    if (!manualFlightMode) {
      // Clear all keyboard states when exiting manual mode
      Object.keys(keyboardStateRef.current).forEach((key) => {
        keyboardStateRef.current[key as keyof typeof keyboardStateRef.current] =
          false;
      });
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code in keyboardStateRef.current) {
        e.preventDefault(); // Prevent default browser behavior
        e.stopPropagation(); // Stop event from reaching other handlers
        keyboardStateRef.current[
          e.code as keyof typeof keyboardStateRef.current
        ] = true;
        setKeyboardUpdateTrigger((prev) => prev + 1); // Trigger UI update
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code in keyboardStateRef.current) {
        e.preventDefault();
        e.stopPropagation();
        keyboardStateRef.current[
          e.code as keyof typeof keyboardStateRef.current
        ] = false;
        setKeyboardUpdateTrigger((prev) => prev + 1); // Trigger UI update
      }
    };

    // Use capture phase to intercept events before other handlers
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      // Clear keyboard states on cleanup
      Object.keys(keyboardStateRef.current).forEach((key) => {
        keyboardStateRef.current[key as keyof typeof keyboardStateRef.current] =
          false;
      });
    };
  }, [manualFlightMode]);

  useEffect(() => {
    if (!mountRef.current) return;

    // NUCLEAR CLEANUP: Force cleanup of any existing global context before proceeding
    if (globalRenderer) {
      console.log("Force disposing existing global renderer");
      try {
        globalRenderer.dispose();
        globalRenderer.forceContextLoss();
        if (globalRenderer.domElement.parentElement) {
          globalRenderer.domElement.parentElement.removeChild(
            globalRenderer.domElement,
          );
        }
      } catch (e) {
        console.warn("Error disposing old renderer:", e);
      }
      globalRenderer = null;
    }

    // Clean up any previous global renderer first
    if (globalCleanup) {
      globalCleanup();
      globalCleanup = null;
    }

    const container = mountRef.current;

    // Prevent duplicate canvases
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // --- SCENE SETUP ---
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      10000,
    );
    camera.position.set(0, 400, 600);
    camera.lookAt(0, 0, 0);

    // Renderer (WebGL)
    const renderer =
      globalRenderer ||
      new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.position = "absolute";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    globalRenderer = renderer;

    // (moved) helper functions are defined earlier to avoid TDZ

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
    // Renderer (CSS 2D for labels)
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(container.clientWidth, container.clientHeight);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0px";
    labelRenderer.domElement.style.pointerEvents = "none";
    labelRenderer.domElement.style.zIndex = "100";
    container.appendChild(labelRenderer.domElement);

    sceneRef.current.labelRendererDom = labelRenderer.domElement;
    sceneRef.current.scene = scene;
    sceneRef.current.camera = camera;

    // Apply initial visibility
    if (optionsRef.current.spaceShowLabels === false) {
      labelRenderer.domElement.style.display = "none";
    }

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    sceneRef.current.controls = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0; // Allow zooming through objects
    controls.maxDistance = 6000; // Increased to allow more zoom out while staying within starfield
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;

    // Track when OrbitControls starts/ends user interaction so we don't exit focus
    controls.addEventListener("start", () => {
      controlsDraggingRef.current = true;
    });
    controls.addEventListener("change", () => {
      try {
        // If there's a focused moon, only exit when the camera distance to the moon changes (zoom),
        // not when the user rotates/pans around it. Also ignore while user is directly dragging the moon.
        if (focusedMoonRef.current && !isDraggingRef.current) {
          const moonWorld = new THREE.Vector3();
          focusedMoonRef.current.getWorldPosition(moonWorld);
          const camPos = camera.position.clone();
          const currentDist = camPos.distanceTo(moonWorld);

          const base = focusedMoonCameraDistanceRef.current ?? currentDist;
          const diff = Math.abs(currentDist - base);
          // If distance changed significantly (zoom), request exit. Use configurable threshold.
          const threshold = zoomExitThresholdRef.current || 12;
          if (diff > threshold) {
            exitFocusRequestRef.current = true;
          }
        }
      } catch (e) {
        // ignore
      }
    });

    // Wheel events indicate zooming; rely on controls.change distance checks instead
    // (don't exit immediately on wheel so small zooms/pinch are allowed)
    renderer.domElement.addEventListener(
      "wheel",
      () => {
        // no immediate action; controls.change will detect significant zoom and exit when needed
      },
      { passive: true },
    );

    // Multi-touch gestures (pinch) will be handled by controls.change distance checks
    renderer.domElement.addEventListener(
      "touchstart",
      () => {
        // do nothing immediate; let the distance threshold logic decide whether to exit
      },
      { passive: true },
    );

    // Post-processing for bloom effect
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      Math.min((optionsRef.current.spaceSunIntensity || 2.5) * 0.4, 3), // Increased multiplier and cap
      0.6, // Increased radius for more glow
      0.5, // Lower threshold so more things glow
    );
    composer.addPass(bloomPass);
    sceneRef.current.bloomPass = bloomPass;

    // Prevent default browser zoom/pinch behavior so OrbitControls can handle it
    const preventDefaultTouch = (e: Event) => {
      if ((e as TouchEvent).touches && (e as TouchEvent).touches.length > 1) {
        e.preventDefault();
      }
    };
    renderer.domElement.addEventListener("touchstart", preventDefaultTouch, {
      passive: false,
    });
    renderer.domElement.addEventListener("touchmove", preventDefaultTouch, {
      passive: false,
    });
    renderer.domElement.style.touchAction = "none";

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

    // --- OBJECTS ---
    const items: {
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
    }[] = [];

    const orbitAnchors: { anchor: THREE.Object3D; parent: THREE.Object3D }[] =
      [];

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
      1400,
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
    Object.values(resumeData.experience)
      .flat()
      .forEach((job, i) => {
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
        );

        // Register moon with position emitter for tracking
        const moonId = `moon-${job.id}`;
        moonMesh.userData.moonId = moonId;
        emitterRef.current.registerObject(moonId, moonMesh, 16); // 60fps updates
        console.log(
          `📡 Registered moon for tracking: ${moonId} (${job.company})`,
        );

        // Remove the rotation that might be causing visual issues
        // moon.rotation.x = Math.PI / 2;
      });

    Object.keys(resumeData.skills).forEach((cat, i) => {
      createPlanet(
        cat,
        70 + i * 15,
        6,
        0xaaddff,
        skillsPlanet,
        0.0015 + Math.random() * 0.001,
      );
    });

    // Log final clickable planets array
    console.log(
      `🌍 Total clickable planets registered: ${clickablePlanets.length}`,
      clickablePlanets.map((p) => ({
        name: p.userData.planetName,
        sectionIndex: p.userData.sectionIndex,
        hasHaloLayers: !!p.userData.hasHaloLayers,
        hasEmissive: !!p.userData.hoverEmissive,
      })),
    );

    // Enhanced point-based starfield for deep space effect
    const starField = createStarField();
    scene.add(starField);

    // --- SPACESHIP LOADING ---
    console.log("🚀 Initializing spaceship loader...");
    const loader = new GLTFLoader();
    loader.load(
      "/models/spaceship/scene.gltf",
      (gltf) => {
        console.log("✅ Spaceship GLTF loaded successfully");
        const spaceship = gltf.scene;

        // Log ship structure to find cockpit
        console.log("🔍 Ship structure:");
        spaceship.traverse((child) => {
          if (child.name) {
            console.log(`  - ${child.name}:`, child.type, child.position);
          }
        });

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
        const engineLight = new THREE.PointLight(0x6699ff, 0.5, 30);
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

        console.log("🚀 Spaceship added to scene at", spaceship.position);
        vlog("🚀 Spaceship loaded - ready for navigation");

        // Initialize navigation system
        navigationSystemRef.current = new SpaceshipNavigationSystem(spaceship, {
          maxSpeed: 3.0,
          turboSpeed: 6.0,
          accelerationRate: 0.12,
          decelerationDistance: 150,
          arrivalDistance: 30,
          usePredictiveIntercept: true,
          freezeOrbitOnApproach: true,
          freezeDistance: 60,
        });

        // Set up callbacks for navigation status updates
        navigationSystemRef.current.setOnStatusChange(
          (status: NavigationStatus) => {
            setNavigationDistance(status.distance);
            setNavigationETA(status.eta);
            // Update any other UI state as needed
          },
        );

        // Set up mission log callback
        navigationSystemRef.current.setMissionLog(missionLog);

        // Provide obstacles (moons/planets) for avoidance
        navigationSystemRef.current.setObstaclesProvider(() => {
          const obstacles: {
            id?: string;
            position: THREE.Vector3;
            radius: number;
          }[] = [];

          if (emitterRef.current) {
            const ids = emitterRef.current.getRegisteredObjectIds();
            ids.forEach((id) => {
              // Don't treat current target as obstacle
              if (id === navigationSystemRef.current?.getStatus().targetId)
                return;

              const pos = emitterRef.current?.getCurrentPosition(id);
              if (pos) {
                obstacles.push({
                  id,
                  position: pos.worldPosition.clone(),
                  radius: id.startsWith("moon-") ? 50 : 100,
                });
              }
            });
          }

          return obstacles;
        });

        // Set up arrival callback
        navigationSystemRef.current.setOnArrival((targetId: string) => {
          vlog(`✅ ARRIVED at ${targetId}`);

          // Handle arrival at moon - inline to access finalizeFocusOnMoon
          // Extract company ID from moon ID (remove "moon-" prefix)
          const companyId = targetId.replace("moon-", "");
          const company = resumeData.experience.find(
            (exp) => exp.id === companyId,
          );

          if (!company) {
            vlog(`⚠️ Could not find company for moon: ${targetId}`);
            return;
          }

          // Find the moon mesh
          let moonMesh: THREE.Mesh | null = null;
          scene.traverse((object) => {
            if (
              object instanceof THREE.Mesh &&
              object.userData.moonId === targetId
            ) {
              moonMesh = object;
            }
          });

          if (!moonMesh) {
            vlog(`⚠️ Could not find moon mesh: ${targetId}`);
            return;
          }

          vlog(`🌙 Processing arrival at moon: ${company.company}`);
          missionLog(
            `🌙 STATION CONTACT: Arrived at ${company.company} - Establishing connection`,
          );

          enterMoonView({ moonMesh, company, useFlight: false });
        });

        console.log("🎯 Navigation system initialized");
      },
      (progress) => {
        // Loading progress
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`📦 Loading spaceship: ${Math.round(percent)}%`);
        }
      },
      (error) => {
        console.error("❌ Error loading spaceship:", error);
        vlog("❌ Failed to load spaceship model");
      },
    );

    // --- INTERACTION ---
    // Cache HUD panel elements for show/hide animations
    hudRefs.current.top = document.querySelector(
      ".spaceship-hud__top",
    ) as HTMLElement | null;
    hudRefs.current.right = document.querySelector(
      ".spaceship-hud__right",
    ) as HTMLElement | null;
    hudRefs.current.left = document.querySelector(
      ".spaceship-hud__left",
    ) as HTMLElement | null;
    hudRefs.current.footer = document.querySelector(
      ".spaceship-hud__footer",
    ) as HTMLElement | null;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const { onPointerDownRotate, onPointerMoveRotate, onPointerUpRotate } =
      createFocusedMoonRotationHandlers({
        mountRef,
        focusedMoonRef,
        isDraggingRef,
        lastPointerRef,
        sceneRef,
        raycaster,
        pointer,
        camera,
      });

    const exitFocusedMoon = createExitFocusedMoon({
      scene,
      items,
      overlayClickables,
      focusedMoonRef,
      frozenOrbitalSpeedsRef,
      optionsRef,
      onOptionsChange,
      isDraggingRef,
      sceneRef,
      vlog,
    });

    const exitMoonView = () => {
      const shouldExitRestoreOptions = !!frozenOrbitalSpeedsRef.current;

      restoreFrozenSystem({
        frozenSystemStateRef,
        showOrbits: optionsRef.current.spaceShowOrbits !== false,
        vlog,
      });

      const nextOptions = { ...optionsRef.current };
      let applyOptions = false;

      if (lastMoonOrbitSpeedRef.current !== null) {
        nextOptions.spaceMoonOrbitSpeed = lastMoonOrbitSpeedRef.current;
        applyOptions = true;
        lastMoonOrbitSpeedRef.current = null;
      }

      if (lastMoonSpinSpeedRef.current !== null) {
        nextOptions.spaceMoonSpinSpeed = lastMoonSpinSpeedRef.current;
        applyOptions = true;
        lastMoonSpinSpeedRef.current = null;
      }

      if (applyOptions) {
        optionsRef.current = nextOptions;
      }

      exitFocusedMoon();

      if (applyOptions && onOptionsChange && !shouldExitRestoreOptions) {
        onOptionsChange(nextOptions);
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
          console.warn("Error finalizing tour waypoint:", e);
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
          await cameraDirectorRef.current.systemOverview();
          break;
        case "about":
          // Follow the spaceship!
          console.log("🚀 About Harma clicked - checking spaceship...");
          vlog("🚀 About Harma navigation triggered");

          if (spaceshipRef.current) {
            console.log("✅ Spaceship found, initiating follow mode");
            vlog("🚀 Spaceship located, beginning pursuit...");

            // Enable follow mode immediately
            setFollowingSpaceship(true);
            followingSpaceshipRef.current = true;

            // Fly camera to behind the spaceship
            const shipPos = spaceshipRef.current.position.clone();

            // Get the ship's backward direction (behind it)
            const shipDirection = new THREE.Vector3();
            spaceshipRef.current.getWorldDirection(shipDirection);
            const behindOffset = shipDirection.multiplyScalar(-60); // 60 units behind
            const heightOffset = new THREE.Vector3(0, 20, 0); // 20 units above

            const targetCameraPos = shipPos
              .clone()
              .add(behindOffset)
              .add(heightOffset);

            // Animate camera to behind spaceship
            const startPos = camera.position.clone();
            const duration = 2000; // 2 seconds
            const startTime = Date.now();

            const animateToShip = () => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const eased = progress * progress * (3 - 2 * progress); // smooth ease

              const currentShipPos = spaceshipRef.current!.position.clone();
              camera.position.lerpVectors(startPos, targetCameraPos, eased);
              camera.lookAt(currentShipPos);

              if (progress < 1) {
                requestAnimationFrame(animateToShip);
              } else {
                // Set orbit controls to follow the ship
                if (sceneRef.current.controls) {
                  sceneRef.current.controls.target.copy(currentShipPos);
                  sceneRef.current.controls.enabled = true;
                  sceneRef.current.controls.enableDamping = true;
                }
                vlog(
                  "🎯 Following spaceship engaged - orbit around ship enabled",
                );
              }
            };

            animateToShip();
          } else {
            console.warn("⚠️ Spaceship not loaded yet");
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
          vlog("🌍 Traveling to Experience Planet...");
          // Stop following spaceship if we were
          if (followingSpaceship) {
            setFollowingSpaceship(false);
            followingSpaceshipRef.current = false;
            if (sceneRef.current.controls)
              sceneRef.current.controls.enabled = true;
          }
          await cameraDirectorRef.current.focusPlanet(expPlanet, 300);
          // Restore original camera constraints
          setMinDistance(
            originalMinDistanceRef.current,
            "restore after experience",
          );
          break;
        case "skills":
          vlog("⚡ Traveling to Skills Planet...");
          // Stop following spaceship if we were
          if (followingSpaceship) {
            setFollowingSpaceship(false);
            followingSpaceshipRef.current = false;
            if (sceneRef.current.controls)
              sceneRef.current.controls.enabled = true;
          }
          await cameraDirectorRef.current.focusPlanet(skillsPlanet, 350);
          // Restore original camera constraints
          setMinDistance(
            originalMinDistanceRef.current,
            "restore after skills",
          );
          break;
        case "projects":
          vlog("💡 Traveling to Projects Planet...");
          // Stop following spaceship if we were
          if (followingSpaceship) {
            setFollowingSpaceship(false);
            followingSpaceshipRef.current = false;
            if (sceneRef.current.controls)
              sceneRef.current.controls.enabled = true;
          }
          await cameraDirectorRef.current.focusPlanet(projectsPlanet, 400);
          // Restore original camera constraints
          setMinDistance(
            originalMinDistanceRef.current,
            "restore after projects",
          );
          break;
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
                    console.warn("Error resolving waypoint to mesh:", e);
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

    const handleExperienceCompanyNavigation = async (companyId: string) => {
      if (!cameraDirectorRef.current) return;

      vlog(`🌙 Initiating moon navigation: ${companyId}`);

      // Find the specific company data
      const company = resumeData.experience.find(
        (exp) =>
          exp.company.toLowerCase().includes(companyId) || exp.id === companyId,
      );

      if (!company) return;

      // Find the corresponding moon mesh in the 3D scene
      let moonMesh: THREE.Mesh | undefined;

      // Search through all meshes in the scene to find the company moon
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

      vlog(`✅ Moon found: ${company.company}`);

      await enterMoonView({ moonMesh, company, useFlight: true });
    };

    const finalizeFocusOnMoon = createFinalizeFocusOnMoon({
      scene,
      items,
      attachMultiNoteOverlays,
      setContentLoading,
      setOverlayContent,
      vlog,
      sceneRef,
      focusedMoonRef,
      focusedMoonCameraDistanceRef,
      onFocus: () => {
        if (lastMoonOrbitSpeedRef.current === null) {
          lastMoonOrbitSpeedRef.current =
            optionsRef.current.spaceMoonOrbitSpeed ?? 0.01;
        }
        lastMoonSpinSpeedRef.current =
          optionsRef.current.spaceMoonSpinSpeed ?? 1.0;
        optionsRef.current = {
          ...optionsRef.current,
          spaceMoonSpinSpeed: 0.1,
        };
        if (onOptionsChange) {
          onOptionsChange({
            ...optionsRef.current,
            spaceMoonSpinSpeed: 0.1,
          });
        }
      },
    });

    const enterMoonView = async (params: {
      moonMesh: THREE.Mesh;
      company: any;
      useFlight?: boolean;
    }) => {
      const { moonMesh, company, useFlight = false } = params;

      if (focusedMoonRef.current && focusedMoonRef.current !== moonMesh) {
        exitMoonView();
      }

      // CRITICAL: Freeze orbital motion BEFORE getting position
      // This ensures the moon stays still during camera flight
      freezeOrbitalMotion(moonMesh);

      if (useFlight && cameraDirectorRef.current) {
        // Get the moon's WORLD position (now that it's frozen)
        const moonWorldPos = new THREE.Vector3();
        moonMesh.getWorldPosition(moonWorldPos);

        vlog(
          `🌙 Moon world: [${moonWorldPos
            .toArray()
            .map((n) => n.toFixed(1))
            .join(", ")}]`,
        );
        vlog(
          `🌙 Moon local: [${moonMesh.position
            .toArray()
            .map((n) => n.toFixed(1))
            .join(", ")}]`,
        );

        // Calculate camera position - simplified to just be directly in front
        const distance = 25; // Distance from moon center - testing value

        // Simple: position camera directly along one axis from moon
        const cameraPos = new THREE.Vector3(
          moonWorldPos.x,
          moonWorldPos.y,
          moonWorldPos.z + distance, // Just move back along Z axis
        );

        vlog(
          `📷 Camera: [${cameraPos
            .toArray()
            .map((n) => n.toFixed(1))
            .join(", ")}]`,
        );
        vlog(`📏 Distance: ${cameraPos.distanceTo(moonWorldPos).toFixed(2)}`);

        // Log controls target BEFORE flyTo
        if (sceneRef.current.controls) {
          vlog(
            `🎯 Before flyTo - target: [${sceneRef.current.controls.target
              .toArray()
              .map((n) => n.toFixed(1))
              .join(", ")}]`,
          );
        }

        await cameraDirectorRef.current.flyTo({
          position: cameraPos,
          lookAt: moonWorldPos,
          duration: 2.5,
          ease: "power2.inOut",
        });

        vlog(`✈️ Flight to ${company.company} complete`);

        // CRITICAL: Update OrbitControls target AFTER flyTo completes
        // This allows manual zoom to work toward the moon, not the sun!
        if (sceneRef.current.controls && sceneRef.current.camera) {
          vlog(`🎯 After flyTo, updating target to moon...`);
          sceneRef.current.controls.target.copy(moonWorldPos);
          setMinDistance(0, "allow zoom to moon surface");
          sceneRef.current.controls.update(); // Force update to apply changes

          const camToTarget = sceneRef.current.camera.position.distanceTo(
            sceneRef.current.controls.target,
          );
          vlog(
            `✓ Target updated: [${sceneRef.current.controls.target
              .toArray()
              .map((n) => n.toFixed(1))
              .join(", ")}]`,
          );
          vlog(
            `📐 Camera-to-target distance: ${camToTarget.toFixed(2)} (min: ${sceneRef.current.controls.minDistance}, max: ${sceneRef.current.controls.maxDistance})`,
          );
        }
      }

      // After arriving, finalize focus/overlays for the moon (extracted)
      finalizeFocusOnMoon(moonMesh, company);
    };

    const { onPointerMove, onClick } = createPointerInteractionHandlers({
      mountRef,
      camera,
      raycaster,
      pointer,
      clickablePlanets,
      overlayClickables,
      handleNavigation,
      handleExperienceCompanyNavigation,
      resumeData,
      setContentLoading,
      setOverlayContent,
      exitFocusedMoon: exitMoonView,
      vlog,
    });

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("click", onClick);
    // Add rotate handlers
    window.addEventListener("pointerdown", onPointerDownRotate);
    window.addEventListener("pointermove", onPointerMoveRotate);
    window.addEventListener("pointerup", onPointerUpRotate);

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
        console.warn("Failed to populate experience submenu:", e);
      }
    }

    // --- ANIMATION LOOP ---
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // If an external request to exit focused moon was made (from UI), run it here
      if (exitFocusRequestRef.current) {
        try {
          exitMoonView();
        } catch (e) {
          console.warn("exitFocusedMoon failed:", e);
        }
        exitFocusRequestRef.current = false;
      }

      // --- SPACESHIP ANIMATION ---
      if (spaceshipRef.current) {
        const ship = spaceshipRef.current;

        if (manualFlightModeRef.current) {
          // MANUAL FLIGHT MODE
          const manual = manualFlightRef.current;
          const keyboard = keyboardStateRef.current;

          // Calculate direction based on keyboard input
          const baseTurnRate = 0.003; // Base turn rate (very subtle)
          const turnRate = baseTurnRate * controlSensitivityRef.current; // Use ref, not state
          const springBackRate = 0.08; // How fast ship returns to neutral
          const invertMultiplier = invertControlsRef.current ? -1 : 1; // Use ref, not state

          // Apply incremental rotation when keys are pressed
          if (keyboard.ArrowUp) {
            ship.rotation.x += turnRate * invertMultiplier; // Pitch up (nose up)
            manual.targetPitch = 0.03 * invertMultiplier; // Visual tilt (reduced)
          } else if (keyboard.ArrowDown) {
            ship.rotation.x -= turnRate * invertMultiplier; // Pitch down (nose down)
            manual.targetPitch = -0.03 * invertMultiplier;
          } else {
            manual.targetPitch = 0; // Spring back when not pressed
          }

          if (keyboard.ArrowLeft) {
            ship.rotation.y += turnRate * invertMultiplier; // Yaw left (inverted if enabled)
            manual.targetYaw = 0.03 * invertMultiplier;
          } else if (keyboard.ArrowRight) {
            ship.rotation.y -= turnRate * invertMultiplier; // Yaw right (inverted if enabled)
            manual.targetYaw = -0.03 * invertMultiplier;
          } else {
            manual.targetYaw = 0; // Spring back when not pressed
          }

          if (keyboard.KeyZ) {
            ship.rotation.z += turnRate * 0.5; // Roll left
            manual.targetRoll = 0.03;
          } else if (keyboard.KeyC) {
            ship.rotation.z -= turnRate * 0.5; // Roll right
            manual.targetRoll = -0.03;
          } else {
            manual.targetRoll = 0; // Spring back when not pressed
          }

          // Smooth visual tilt for physics feel (ship rocks gently)
          manual.pitch += (manual.targetPitch - manual.pitch) * springBackRate;
          manual.yaw += (manual.targetYaw - manual.yaw) * springBackRate;
          manual.roll += (manual.targetRoll - manual.roll) * springBackRate;

          // Handle acceleration with physics
          manual.isAccelerating = keyboard.ShiftLeft;

          if (manual.isAccelerating) {
            // Gradual acceleration buildup
            manual.acceleration = Math.min(manual.acceleration + 0.008, 1.0);

            // Check for turbo mode (at 100% for 3 seconds)
            if (manual.acceleration >= 1.0) {
              if (manual.turboStartTime === 0) {
                manual.turboStartTime = Date.now();
              } else if (
                Date.now() - manual.turboStartTime >= 3000 &&
                !manual.isTurboActive
              ) {
                manual.isTurboActive = true;
                vlog("🔥 TURBO MODE ACTIVATED!");
              }
            } else {
              manual.turboStartTime = 0;
              manual.isTurboActive = false;
            }
          } else {
            // Gentle, gradual deceleration (coasting physics)
            manual.acceleration = Math.max(manual.acceleration - 0.005, 0);
            manual.turboStartTime = 0;
            manual.isTurboActive = false;
          }

          // Update speed based on acceleration (turbo adds 50% speed boost)
          const turboMultiplier = manual.isTurboActive ? 1.5 : 1.0;
          manual.currentSpeed =
            manual.acceleration * manual.maxSpeed * turboMultiplier;

          // Calculate forward direction from ship's rotation
          const direction = new THREE.Vector3(0, 0, 1);
          const rotationMatrix = new THREE.Matrix4();
          rotationMatrix.makeRotationFromEuler(
            new THREE.Euler(
              ship.rotation.x - manual.pitch,
              ship.rotation.y - manual.yaw,
              ship.rotation.z - manual.roll,
            ),
          );
          direction.applyMatrix4(rotationMatrix);

          // Apply velocity
          ship.position.add(direction.multiplyScalar(manual.currentSpeed));

          // Camera follows ship in 3rd person view (like a game)
          if (followingSpaceshipRef.current && sceneRef.current.controls) {
            const cameraDistance = 60; // Distance behind ship
            const cameraHeight = 20; // Height above ship

            // Calculate camera position behind and above ship
            const backwardDirection = new THREE.Vector3(0, 0, -1);
            backwardDirection.applyQuaternion(ship.quaternion);

            const cameraTargetPos = ship.position
              .clone()
              .add(backwardDirection.multiplyScalar(cameraDistance))
              .add(new THREE.Vector3(0, cameraHeight, 0));

            // Smooth camera follow
            camera.position.lerp(cameraTargetPos, 0.1);

            // Camera looks at ship
            sceneRef.current.controls.target.lerp(ship.position, 0.1);
            sceneRef.current.controls.update();
          }

          // Boost engine light intensity when accelerating
          if (spaceshipEngineLightRef.current) {
            const engineLight = spaceshipEngineLightRef.current;
            const baseIntensity = 0.5;
            const turboBoost = manual.isTurboActive ? 3 : 0;
            const boostIntensity = manual.acceleration * 8 + turboBoost; // Much stronger boost
            engineLight.intensity = baseIntensity + boostIntensity;

            // Shift color from white to cyan-blue during acceleration
            if (manual.acceleration > 0) {
              const blueAmount = 0.3 + manual.acceleration * 0.7;
              const turboGlow = manual.isTurboActive ? 1.5 : 1.0;
              engineLight.color.setRGB(
                blueAmount * 0.3 * turboGlow, // Less red
                blueAmount * 0.6 * turboGlow, // Medium green
                blueAmount * 1.0 * turboGlow, // Full blue
              );
            } else {
              // Reset to default blue when not accelerating
              engineLight.color.set(0x6699ff);
            }
          }

          // Also enhance the ship's built-in blue emissive materials
          ship.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              const materials = Array.isArray(child.material)
                ? child.material
                : [child.material];
              materials.forEach((mat) => {
                // If material has emissive property and it's blue-ish
                if (mat.emissive && mat.emissive.getHex() > 0) {
                  const baseEmissive =
                    mat.userData.baseEmissive || mat.emissive.clone();
                  if (!mat.userData.baseEmissive) {
                    mat.userData.baseEmissive = baseEmissive;
                  }
                  // Boost emissive intensity during acceleration (much stronger in turbo)
                  const turboBoost = manual.isTurboActive ? 3 : 0;
                  const boostFactor = 1 + manual.acceleration * 6 + turboBoost;
                  mat.emissive.copy(baseEmissive).multiplyScalar(boostFactor);
                  mat.emissiveIntensity =
                    1 + manual.acceleration * 4 + turboBoost;
                }
              });
            }
          });
        } else {
          // AUTOPILOT MODE
          const pathData = spaceshipPathRef.current;

          // Log autopilot state occasionally (every 2 seconds)
          if (
            !window.lastAutopilotLog ||
            Date.now() - window.lastAutopilotLog > 2000
          ) {
            vlog(
              `🤖 AUTOPILOT: nav=${!!navigationTargetRef.current.id}, system=${!!navigationSystemRef.current?.getStatus().isNavigating}`,
            );
            window.lastAutopilotLog = Date.now();
          }

          // Update new navigation system if active (for moon navigation)
          if (navigationSystemRef.current) {
            const deltaTime = 0.016; // Approximate 60fps
            const status = navigationSystemRef.current.getStatus();
            if (
              (status.isNavigating && !(window as any).lastNavSystemLog) ||
              Date.now() - ((window as any).lastNavSystemLog || 0) > 2000
            ) {
              vlog(
                `🎯 Nav System Active: ${status.targetId}, dist: ${status.distance?.toFixed(1)}`,
              );
              (window as any).lastNavSystemLog = Date.now();
            }
            navigationSystemRef.current.update(deltaTime);
          }

          // Old navigation system for sections/planets (non-moon targets)
          if (
            navigationTargetRef.current.id &&
            navigationTargetRef.current.position &&
            navigationTargetRef.current.type === "section" // Only use old system for sections
          ) {
            const target = navigationTargetRef.current;
            const shipPos = ship.position.clone();
            const targetPos = target.position;

            if (!targetPos) {
              vlog("⚠️ Navigation target position is null");
              return;
            }

            const distance = shipPos.distanceTo(targetPos);

            // Update distance and ETA (throttled - only every 500ms)
            if (
              !target.lastUpdateFrame ||
              Date.now() - target.lastUpdateFrame > 500
            ) {
              setNavigationDistance(distance);
              const estimatedSpeed = target.useTurbo ? 4.0 : 2.0;
              setNavigationETA(distance / estimatedSpeed);
              target.lastUpdateFrame = Date.now();
            }

            // Direction to target
            const direction = new THREE.Vector3()
              .subVectors(targetPos, shipPos)
              .normalize();

            // Determine speed based on distance and turbo mode
            let targetSpeed = 0.5; // Base autopilot speed
            const decelerationDistance = 100; // Start slowing down 100 units away

            if (distance > decelerationDistance) {
              // Far away - accelerate
              if (target.useTurbo && distance > 200) {
                targetSpeed = 4.0; // Turbo speed
                // Set turbo visuals
                manualFlightRef.current.acceleration = 1.0;
                manualFlightRef.current.isTurboActive = true;
                if (!target.turboLogged) {
                  vlog(
                    `🔥 TURBO MODE: Engaged at distance ${distance.toFixed(1)}`,
                  );
                  target.turboLogged = true;
                }
              } else {
                targetSpeed = 2.0; // Normal max speed
                manualFlightRef.current.acceleration = 0.6;
                manualFlightRef.current.isTurboActive = false;
              }
            } else {
              // Close to target - decelerate gently
              const progress = distance / decelerationDistance;
              targetSpeed = Math.max(0.1, progress * 2.0); // Gentle approach
              manualFlightRef.current.acceleration = progress * 0.6;
              manualFlightRef.current.isTurboActive = false;
              if (!target.decelerationLogged) {
                vlog(
                  `🛑 DECELERATION: Starting at distance ${distance.toFixed(1)}`,
                );
                target.decelerationLogged = true;
              }
            }

            // Smooth speed change
            pathData.speed += (targetSpeed - pathData.speed) * 0.05;

            // Move ship toward target
            ship.position.add(direction.multiplyScalar(pathData.speed));

            // Orient ship toward target
            const lookTarget = targetPos.clone();
            ship.lookAt(lookTarget);

            // Camera follows ship during navigation
            if (
              followingSpaceshipRef.current &&
              camera &&
              sceneRef.current.controls
            ) {
              const cameraDistance = 60;
              const cameraHeight = 20;

              // Calculate camera position behind and above ship
              const backwardDirection = new THREE.Vector3(0, 0, -1);
              backwardDirection.applyQuaternion(ship.quaternion);

              const cameraTargetPos = ship.position
                .clone()
                .add(backwardDirection.multiplyScalar(cameraDistance))
                .add(new THREE.Vector3(0, cameraHeight, 0));

              // Smooth camera follow
              camera.position.lerp(cameraTargetPos, 0.1);

              // Camera looks at ship
              sceneRef.current.controls.target.lerp(ship.position, 0.1);
              sceneRef.current.controls.update();
            }

            // Arrival check - within 20 units
            if (distance < 20) {
              vlog(`✅ ARRIVED at ${target.id}`);
              vlog(`   Final distance: ${distance.toFixed(2)} units`);
              vlog(
                `   Ship position: [${ship.position.x.toFixed(1)}, ${ship.position.y.toFixed(1)}, ${ship.position.z.toFixed(1)}]`,
              );
              vlog(`   Speed: ${pathData.speed.toFixed(2)}`);

              // Clear navigation state
              setCurrentNavigationTarget(null);
              setNavigationDistance(null);
              setNavigationETA(null);
              navigationTargetRef.current = {
                id: null,
                type: null,
                position: null,
                startPosition: null,
                startTime: 0,
                useTurbo: false,
                lastUpdateFrame: undefined,
              };
              manualFlightRef.current.acceleration = 0;
              manualFlightRef.current.isTurboActive = false;

              pathData.visitingMoon = false;
              pathData.currentMoonTarget = null;
              vlog(`🧹 Cleared moon visit state`);

              vlog(`🔧 Clearing navigation state and re-enabling controls`);

              // Re-enable orbit controls for user interaction
              if (sceneRef.current.controls) {
                sceneRef.current.controls.enabled = true;
                sceneRef.current.controls.enableZoom = true;
                sceneRef.current.controls.enablePan = true;
                vlog(`🎮 Controls enabled: zoom=true, pan=true`);
              }

              // If it's a moon, show overlays and finalize focus
              if (target.type === "moon") {
                vlog(
                  `🌙 Arrived at moon - showing overlays and enabling exploration`,
                );

                // Find the moon mesh and company data
                const company = resumeData.experience.find(
                  (exp) => exp.id === target.id,
                );
                let moonMesh: THREE.Mesh | null = null;

                sceneRef.current.scene?.traverse((object) => {
                  if (
                    object instanceof THREE.Mesh &&
                    object.userData.planetName
                  ) {
                    const objName = (
                      object.userData.planetName || ""
                    ).toLowerCase();
                    if (company) {
                      const companyName = (
                        company.navLabel || company.company
                      ).toLowerCase();
                      if (
                        objName.includes(companyName.split(" ")[0]) ||
                        companyName.includes(objName)
                      ) {
                        moonMesh = object;
                      }
                    }
                  }
                });

                if (moonMesh && company) {
                  // Orbital motion was already frozen at navigation start
                  // Show the overlays and detach the moon
                  enterMoonView({ moonMesh, company, useFlight: false });
                }
              }

              vlog(`🏁 Navigation complete - exiting navigation block`);
              // Exit navigation - return to allow normal behavior
              return;
            }

            // No more waypoint behavior - ship only moves when navigating
          } else {
            // Ship idles when not navigating
          }

          // If following spaceship, move camera and target with ship while maintaining user's viewing angle
          if (followingSpaceshipRef.current) {
            if (insideShipRef.current) {
              // Inside ship view - camera moves with ship, user can zoom/look around

              // Get ship's world position and rotation
              const shipWorldPos = new THREE.Vector3();
              const shipWorldQuat = new THREE.Quaternion();
              ship.getWorldPosition(shipWorldPos);
              ship.getWorldQuaternion(shipWorldQuat);

              if (sceneRef.current.controls) {
                // Calculate the target point (where we're looking) in ship's local space
                const targetOffset =
                  shipViewModeRef.current === "cockpit"
                    ? new THREE.Vector3(0, 0.5, 10) // Cockpit: look forward through window
                    : new THREE.Vector3(0.5, 0, 0); // Cabin: look at cabin center (right front area)

                // Transform target to world space
                const localTargetOffset = targetOffset
                  .clone()
                  .applyQuaternion(shipWorldQuat);
                const worldTarget = shipWorldPos.clone().add(localTargetOffset);

                // Get camera's current offset from the target (in world space)
                const currentCameraOffset = camera.position
                  .clone()
                  .sub(sceneRef.current.controls.target);

                // Update target to follow ship
                sceneRef.current.controls.target.copy(worldTarget);

                // Calculate desired camera position
                const desiredCameraPos = worldTarget
                  .clone()
                  .add(currentCameraOffset);

                // Constrain camera to stay inside ship bounds (in ship's local space)
                const shipLocalCameraPos = desiredCameraPos
                  .clone()
                  .sub(shipWorldPos);
                // Convert to ship's local coordinate system
                const inverseQuat = shipWorldQuat.clone().invert();
                shipLocalCameraPos.applyQuaternion(inverseQuat);

                // Define ship interior bounds (adjust based on model size)
                const bounds =
                  shipViewModeRef.current === "cockpit"
                    ? { x: 1.2, y: 1, z: 6 } // Cockpit bounds (forward area)
                    : { x: 2.5, y: 1.2, z: 3 }; // Cabin bounds (right front area)

                // Clamp camera position within bounds
                shipLocalCameraPos.x = Math.max(
                  -bounds.x,
                  Math.min(bounds.x, shipLocalCameraPos.x),
                );
                shipLocalCameraPos.y = Math.max(
                  -bounds.y,
                  Math.min(bounds.y, shipLocalCameraPos.y),
                );
                shipLocalCameraPos.z = Math.max(
                  -bounds.z,
                  Math.min(bounds.z, shipLocalCameraPos.z),
                );

                // Convert back to world space
                shipLocalCameraPos.applyQuaternion(shipWorldQuat);
                const constrainedCameraPos = shipWorldPos
                  .clone()
                  .add(shipLocalCameraPos);

                // Apply constrained camera position
                camera.position.copy(constrainedCameraPos);

                // Configure controls for interior view
                sceneRef.current.controls.enablePan = false;
                sceneRef.current.controls.enableRotate = true;
                sceneRef.current.controls.enableZoom = true;

                if (shipViewModeRef.current === "cockpit") {
                  // Cockpit: Allow zoom to window (close) or back to see cockpit (far)
                  sceneRef.current.controls.minDistance = 0.3; // Zoom close to window
                  sceneRef.current.controls.maxDistance = 4; // Zoom out to see cockpit
                } else {
                  // Interior: Allow zoom around cabin
                  sceneRef.current.controls.minDistance = 0.5; // Zoom close to details
                  sceneRef.current.controls.maxDistance = 3.5; // Zoom out to see cabin
                }

                sceneRef.current.controls.update();
              }
            } else {
              // Exterior follow view (existing logic)
              const followDistance =
                optionsRef.current.spaceFollowDistance || 60;

              // Update the camera offset if user has moved the camera (via orbit controls)
              const currentOffset = camera.position.clone().sub(ship.position);

              // Only update stored offset if it's significantly different (user dragged)
              if (
                currentOffset.distanceTo(spaceshipCameraOffsetRef.current) > 1
              ) {
                spaceshipCameraOffsetRef.current.copy(currentOffset);
              }

              // Scale the offset to match the desired follow distance
              const scaledOffset = spaceshipCameraOffsetRef.current
                .clone()
                .normalize()
                .multiplyScalar(followDistance);

              // Apply the scaled offset to maintain viewing angle at correct distance
              const desiredCameraPos = ship.position.clone().add(scaledOffset);
              camera.position.copy(desiredCameraPos);

              // Update orbit controls target to ship position
              if (sceneRef.current.controls) {
                sceneRef.current.controls.target.copy(ship.position);
                sceneRef.current.controls.enablePan = true;
                sceneRef.current.controls.maxDistance = 1000; // Reset to normal
                sceneRef.current.controls.update();
              }
            }
          }
        } // End of autopilot mode block
      } // End of spaceship animation

      // Rotate Sun
      sunMesh.rotation.y += 0.002;

      // Animate halo layers and flash effects ALWAYS (independent of orbit speed)
      const time = Date.now() * 0.001; // Time in seconds

      items.forEach((item) => {
        // Handle color flash effect on hover
        // Hover/flash handling with cooldown and variable strength
        if (item.mesh.userData.flashActive) {
          const flashDuration = 900; // ms for flash animation
          const elapsed = Date.now() - (item.mesh.userData.hoverStartTime || 0);
          const material = item.mesh.material as THREE.MeshStandardMaterial;

          if (elapsed < flashDuration) {
            const progress = elapsed / flashDuration;
            // stronger quick peak then faster decay
            let intensity;
            if (progress < 0.18) {
              intensity =
                (progress / 0.18) * (item.mesh.userData.flashStrength || 0.8);
            } else {
              intensity =
                (item.mesh.userData.flashStrength || 0.8) *
                Math.max(0, 1 - (progress - 0.18) / 0.82);
            }

            // Color skew toward cyan/blue but modulated by intensity
            const r = 0.2 * intensity;
            const g = 0.35 * intensity;
            const b = 0.6 * intensity;
            material.emissive.setRGB(r, g, b);
          } else {
            // Flash complete: ensure emissive resets and mark inactive
            material.emissive.copy(item.mesh.userData.originalEmissive);
            item.mesh.userData.flashActive = false;
            item.mesh.userData.hoverStartTime = 0;
            item.mesh.userData.lastFlashAt = Date.now();
          }
        } else {
          // Not in an active flash: ensure emissive is at original
          const material = item.mesh.material as THREE.MeshStandardMaterial;
          material.emissive.copy(item.mesh.userData.originalEmissive);
        }

        // Animate sprite-based halo layers (aurora, ring, core)
        if (item.mesh.userData.hasHaloLayers) {
          const aurora = item.mesh.userData.auroraSprite as THREE.Sprite;
          const ring = item.mesh.userData.ringSprite as THREE.Sprite;
          const core = item.mesh.userData.coreSprite as THREE.Sprite;
          const aMat = aurora.material as THREE.SpriteMaterial;
          const rMat = ring.material as THREE.SpriteMaterial;
          const cMat = core.material as THREE.SpriteMaterial;
          const targetAurora = item.mesh.userData.auroraTargetOpacity || 0;
          const targetRing = item.mesh.userData.ringTargetOpacity || 0;
          const targetCore = item.mesh.userData.coreTargetOpacity || 0;
          const haloSpeed = item.mesh.userData.haloSpeedVariance || 1;

          // Smoothly lerp opacities toward targets
          aMat.opacity += (targetAurora - aMat.opacity) * 0.08;
          rMat.opacity += (targetRing - rMat.opacity) * 0.08;
          cMat.opacity += (targetCore - cMat.opacity) * 0.12;

          // Visibility toggles
          aurora.visible = aMat.opacity > 0.005;
          ring.visible = rMat.opacity > 0.005;
          core.visible = cMat.opacity > 0.005;

          // Rotate aurora and ring for subtle motion
          aMat.rotation = (time * 0.06 * haloSpeed) % (Math.PI * 2);
          rMat.rotation = (-time * 0.12 * haloSpeed) % (Math.PI * 2);

          // Pulsing core scale
          const baseCoreScale = (core.scale.x + core.scale.y) / 2 || 1;
          const pulse = 1 + Math.sin(time * 2.0 * haloSpeed) * 0.06;
          core.scale.set(baseCoreScale * pulse, baseCoreScale * pulse, 1);
        }

        // Orient any detail overlay panels to face the camera horizontally (keep upright)
        if (item.mesh.userData.detailOverlay) {
          const panel = item.mesh.userData.detailOverlay as THREE.Mesh;
          if (panel && sceneRef.current && sceneRef.current.camera) {
            // Get world positions
            const panelWorldPos = new THREE.Vector3();
            panel.getWorldPosition(panelWorldPos);
            const camPos = sceneRef.current.camera.position.clone();

            // Compute vector from panel to camera, project to XZ plane to keep upright
            const dir = camPos.sub(panelWorldPos);
            dir.y = 0; // zero out vertical component
            const angle = Math.atan2(dir.x, dir.z);

            // Apply rotation around Y so panel faces camera horizontally
            panel.rotation.y = angle;
            panel.rotation.x = 0;
            panel.rotation.z = 0;
          }
        }

        // Also update any small "detailOverlays" (multi-note panels) so they follow the planet
        const multi = item.mesh.userData.detailOverlays as
          | THREE.Mesh[]
          | undefined;
        if (
          multi &&
          multi.length &&
          sceneRef.current &&
          sceneRef.current.camera
        ) {
          const camPos = sceneRef.current.camera.position;
          const baseWorld = new THREE.Vector3();
          const size =
            ((item.mesh.geometry as any)?.parameters?.radius as number) || 5;
          const dt = 1 / 60; // approximate frame delta for angular updates
          multi.forEach((ov, ovIdx) => {
            // Title overlays are world-space and sit above the planet
            if (ov.userData?.isTitleOverlay) {
              item.mesh.getWorldPosition(baseWorld);
              const titleOffset =
                (ov.userData.titleOffset as number) || size * 0.03;
              ov.position.set(
                baseWorld.x,
                baseWorld.y + size + titleOffset,
                baseWorld.z,
              );
              // face camera horizontally
              const dirT = new THREE.Vector3().subVectors(camPos, ov.position);
              dirT.y = 0;
              ov.rotation.set(0, Math.atan2(dirT.x, dirT.z), 0);
              return;
            }

            // Bullet-style overlays: slide out under the title and remain static/readable
            const isBullet = ov.userData?.isBulletOverlay;
            if (isBullet) {
              // base world position follows the planet
              item.mesh.getWorldPosition(baseWorld);

              // Find title position (if available) otherwise compute a reasonable top position
              const titleMesh = item.mesh.userData?.titleOverlay as
                | THREE.Mesh
                | undefined;
              const titlePos = new THREE.Vector3();
              if (titleMesh) {
                titleMesh.getWorldPosition(titlePos);
              } else {
                // fallback: above planet surface
                titlePos.set(
                  baseWorld.x,
                  baseWorld.y + size + size * 0.03,
                  baseWorld.z,
                );
              }

              const planeH = ov.userData?.planeHeight ?? size * 0.35;
              const planeW = ov.userData?.planeWidth ?? planeH * 2;
              const index = ov.userData?.bulletIndex ?? 0;
              const spacing = planeH * 0.45; // closer stacking for bullet points

              // Compute left-edge alignment using title width and bullet width
              const titleWidth =
                (titleMesh && titleMesh.userData?.planeWidth) || size * 1.2;
              const titleLeft = titlePos.x - titleWidth * 0.5;
              const inset = Math.min(planeW * 0.15, titleWidth * 0.05);
              const bulletTargetX = titleLeft + planeW * 0.5 + inset;

              const targetPos = new THREE.Vector3(
                bulletTargetX,
                titlePos.y - planeH * 0.6 - index * spacing,
                titlePos.z,
              );

              // slide progress animates from left/right toward the target on same horizontal plane
              const sp = ov.userData?.slideProgress ?? 0;
              const active =
                !!item.mesh.userData.pauseOrbit ||
                focusedMoonRef.current === item.mesh;
              const slideRate = 3.0; // per second
              const nextSp = active
                ? Math.min(1, sp + slideRate * dt)
                : Math.max(0, sp - slideRate * dt);
              ov.userData.slideProgress = nextSp;
              const t = easeOutCubic(nextSp);

              const startOffset = (titleWidth || planeW) * 0.9;
              const sd = ov.userData?.slideDir ?? 1;
              const startPos = new THREE.Vector3(
                targetPos.x + sd * startOffset,
                targetPos.y,
                targetPos.z,
              );
              ov.position.lerpVectors(startPos, targetPos, t);

              // face camera horizontally like the title
              const dirT = new THREE.Vector3().subVectors(camPos, ov.position);
              dirT.y = 0;
              ov.rotation.set(0, Math.atan2(dirT.x, dirT.z), 0);

              // visibility based on slide progress
              ov.visible = nextSp > 0.01;

              // Debug: log InvestCloud bullets
              try {
                const pname = item.mesh.userData?.planetName as
                  | string
                  | undefined;
                if (pname && pname.toLowerCase().includes("investcloud")) {
                  vlog(
                    `INVESTCLOUD_OVERLAY_BULLET ${ovIdx} ${JSON.stringify({
                      index,
                      slide: nextSp,
                      pos: ov.position.clone().toArray(),
                      target: targetPos.toArray(),
                    })}`,
                  );
                }
              } catch (e) {
                // ignore
              }
            } else {
              // fallback: keep as-is at current position and face camera
              ov.rotation.x = 0;
              ov.rotation.z = 0;
              const dirT = new THREE.Vector3().subVectors(camPos, ov.position);
              dirT.y = 0;
              ov.rotation.y = Math.atan2(dirT.x, dirT.z);
            }
          });
        }
      });

      updateOrbit({
        items,
        orbitAnchors,
        options: optionsRef.current,
        focusedMoon: focusedMoonRef.current,
      });

      // Check occlusion for CSS2D labels
      const raycaster = new THREE.Raycaster();
      raycaster.camera = camera; // Set camera for sprite raycasting
      const cameraDirection = new THREE.Vector3();

      items.forEach((item) => {
        // Skip if mesh is not fully initialized
        if (!item.mesh || !item.mesh.matrixWorld) return;

        // Find the CSS2DObject label in the mesh's children
        const label = item.mesh.children.find(
          (child) => child instanceof CSS2DObject,
        ) as CSS2DObject | undefined;

        if (label) {
          try {
            // Get label position in world space
            const labelPos = new THREE.Vector3();
            label.getWorldPosition(labelPos);

            // Calculate direction from camera to label
            cameraDirection.copy(labelPos).sub(camera.position).normalize();

            // Set up raycaster
            raycaster.set(camera.position, cameraDirection);

            // Calculate distance to label
            const distanceToLabel = camera.position.distanceTo(labelPos);

            // Check intersections with all celestial bodies and spaceship
            let isOccluded = false;

            // Check other planets/moons
            for (const otherItem of items) {
              if (
                otherItem !== item &&
                otherItem.mesh &&
                otherItem.mesh.matrixWorld
              ) {
                const intersects = raycaster.intersectObject(
                  otherItem.mesh,
                  false, // Don't recurse to avoid sprites
                );
                // If something intersects before reaching the label, it's occluded
                if (
                  intersects.length > 0 &&
                  intersects[0].distance < distanceToLabel - 5
                ) {
                  isOccluded = true;
                  break;
                }
              }
            }

            // Check spaceship
            if (
              !isOccluded &&
              spaceshipRef.current &&
              spaceshipRef.current.matrixWorld
            ) {
              const intersects = raycaster.intersectObject(
                spaceshipRef.current,
                false, // Don't recurse to avoid sprites
              );
              if (
                intersects.length > 0 &&
                intersects[0].distance < distanceToLabel - 5
              ) {
                isOccluded = true;
              }
            }

            // Update label visibility with smooth transition
            if (label.element) {
              label.element.style.transition = "opacity 0.2s ease-in-out";
              label.element.style.opacity = isOccluded ? "0" : "1";
            }
          } catch (error) {
            // Silently skip if there's an error with this label
          }
        }
      });

      controls.update();
      composer.render(); // Use composer instead of renderer for bloom effect
      labelRenderer.render(scene, camera);
    };

    animate();

    // Trigger loading complete with camera animation
    setTimeout(() => {
      setSceneReady(true);

      // Start the orbital position emitter for tracking moving objects
      emitterRef.current.start();
      console.log("📡 Orbital position emitter started");

      // Add smooth zoom and pan animation
      const startPos = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      };
      const endPos = { x: 0, y: 400, z: 600 };
      const startTime = Date.now();
      const duration = 2500; // 2.5 seconds

      // Start from a zoomed out position for dramatic effect
      camera.position.set(50, 500, 800);

      const animateCamera = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic for smooth deceleration
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        camera.position.x = startPos.x + (endPos.x - startPos.x) * easeProgress;
        camera.position.y = startPos.y + (endPos.y - startPos.y) * easeProgress;
        camera.position.z = startPos.z + (endPos.z - startPos.z) * easeProgress;
        camera.lookAt(0, 0, 0);

        if (progress < 1) {
          requestAnimationFrame(animateCamera);
        }
      };

      animateCamera();
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

    globalCleanup = () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("click", onClick);

      // Stop orbital position emitter
      emitterRef.current.stop();
      console.log("📡 Orbital position emitter stopped");

      // Cleanup navigation system
      if (navigationSystemRef.current) {
        navigationSystemRef.current.dispose();
        navigationSystemRef.current = null;
        console.log("🎯 Navigation system disposed");
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
      globalRenderer = null;
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
    };

    return globalCleanup;
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

          {/* HUD Toggle Button */}
          <button
            onClick={() => setHudVisible((v) => !v)}
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20000,
              padding: "8px 14px",
              borderRadius: 18,
              border: "1px solid rgba(232, 197, 71, 0.6)",
              background: hudVisible
                ? "rgba(15,20,25,0.9)"
                : "rgba(15,20,25,0.6)",
              color: "#e8c547",
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              letterSpacing: 0.5,
              cursor: "pointer",
              boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
            }}
          >
            {hudVisible ? "Hide HUD" : "Show HUD"}
          </button>

          <div
            style={{
              position: "absolute",
              bottom: "30px",
              right: "450px",
              color: "rgba(212, 175, 55, 0.9)",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: "12px",
              textAlign: "right",
              pointerEvents: "none",
              userSelect: "none",
              zIndex: 10,
              textShadow: "0 2px 4px rgba(0,0,0,0.8)",
            }}
          >
            <p style={{ margin: "4px 0" }}>↔ DRAG TO ROTATE</p>
            <p style={{ margin: "4px 0" }}>↕ SCROLL TO ZOOM</p>
            <p style={{ margin: "4px 0" }}>• CLICK PLANETS TO VISIT</p>
          </div>
        </div>

        {/* Spaceship HUD Interface */}
        <SpaceshipHUD
          hudVisible={hudVisible}
          userName="HARMA DAVTIAN"
          userTitle="Lead Full Stack Engineer"
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

              // Cabin is at right front (1.5 right, 0.2 up, 1 forward in ship local space)
              const cabinLocalPos = new THREE.Vector3(1.5, 0.2, 1);
              const cabinWorldPos = cabinLocalPos
                .clone()
                .applyQuaternion(shipWorldQuat)
                .add(shipWorldPos);

              // Camera looks into cabin center
              const cabinLookTarget = new THREE.Vector3(0.5, 0, 0)
                .applyQuaternion(shipWorldQuat)
                .add(shipWorldPos);

              sceneRef.current.camera.position.copy(cabinWorldPos);
              sceneRef.current.controls.target.copy(cabinLookTarget);
              sceneRef.current.controls.update();
            }

            vlog("🛸 Entering ship - interior view (cabin)");
          }}
          onExitShip={() => {
            setInsideShip(false);
            insideShipRef.current = false;
            setShipViewMode("exterior");
            shipViewModeRef.current = "exterior";
            vlog("🚪 Exiting ship - exterior view");
          }}
          onGoToCockpit={() => {
            setShipViewMode("cockpit");
            shipViewModeRef.current = "cockpit";

            // Position camera in cockpit looking forward
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

              // Cockpit position (center, slightly up, forward)
              const cockpitLocalPos = new THREE.Vector3(0, 0.5, 3);
              const cockpitWorldPos = cockpitLocalPos
                .clone()
                .applyQuaternion(shipWorldQuat)
                .add(shipWorldPos);

              // Look forward through window
              const windowTarget = new THREE.Vector3(0, 0.5, 10)
                .applyQuaternion(shipWorldQuat)
                .add(shipWorldPos);

              sceneRef.current.camera.position.copy(cockpitWorldPos);
              sceneRef.current.controls.target.copy(windowTarget);
              sceneRef.current.controls.update();
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

              // Cabin position (right front)
              const cabinLocalPos = new THREE.Vector3(1.5, 0.2, 1);
              const cabinWorldPos = cabinLocalPos
                .clone()
                .applyQuaternion(shipWorldQuat)
                .add(shipWorldPos);

              // Look into cabin center
              const cabinLookTarget = new THREE.Vector3(0.5, 0, 0)
                .applyQuaternion(shipWorldQuat)
                .add(shipWorldPos);

              sceneRef.current.camera.position.copy(cabinWorldPos);
              sceneRef.current.controls.target.copy(cabinLookTarget);
              sceneRef.current.controls.update();
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
              vlog("🤖 Autopilot engaged - Ship will resume autonomous flight");
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
              sceneRef.current.controls.enabled = true;
            }
            vlog("🛑 Stopped following spaceship");
          }}
          navigationTargets={navigationTargets}
          onNavigate={handleAutopilotNavigation}
          currentTarget={currentNavigationTarget}
          navigationDistance={navigationDistance}
          navigationETA={navigationETA}
          isTransitioning={false}
          speed={0}
          content={overlayContent}
          contentLoading={contentLoading}
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
                    tour = tourBuilderRef.current.createTechnicalDeepDiveTour();
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
                      console.warn("Error resolving waypoint to mesh:", e);
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
                    cameraDirectorRef.current.systemOverview();
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
                    const projectsData = planetsDataRef.current.get("projects");
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
    </>
  );
}
