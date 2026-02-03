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
import SpaceshipHUD from "../SpaceshipHUDClean.tsx";
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

  // HUD visibility state
  const [hudVisible, setHudVisible] = useState(true);

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
    startQuat: THREE.Quaternion;
    endQuat: THREE.Quaternion;
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
  } | null>(null);
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

  // Autopilot navigation state is handled by useNavigationSystem

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

  // HUD show/hide control
  const hudRefs = useRef<{
    top: HTMLElement | null;
    right: HTMLElement | null;
    left: HTMLElement | null;
    footer: HTMLElement | null;
  }>({ top: null, right: null, left: null, footer: null });

  const optionsRef = useCosmosOptions({
    options,
    sceneRef,
    frozenSystemStateRef,
  });

  const {
    currentNavigationTarget,
    navigationDistance,
    navigationETA,
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
    missionLog,
    vlog,
    manualFlightRef,
    spaceshipPathRef,
    enterMoonViewRef,
  });

  const handleExperienceCompanyNavigation = useCallback(
    async (companyId: string) => {
      if (!companyId) return;

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

      await enterMoonViewRef.current?.({ moonMesh, company, useFlight: true });
    },
    [vlog],
  );

  const handleQuickNav = useCallback(
    (targetId: string, targetType: "section" | "moon") => {
      const target =
        targetType === "moon" ? `experience-${targetId}` : targetId;

      if (handleNavigationRef.current) {
        handleNavigationRef.current(target);
      }
    },
    [],
  );

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
        vlog("🚀 Spaceship loaded - ready for navigation");

        // Initialize navigation system
        initializeNavigationSystem(spaceship, scene);
      },
      undefined,
      () => {
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

    enterMoonViewRef.current = enterMoonView;

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
          await cameraDirectorRef.current.systemOverview();
          break;
        case "about":
          // Follow the spaceship!
          vlog("🚀 About Harma navigation triggered");

          if (spaceshipRef.current) {
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
      optionsRef,
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
    let introRafId: number | null = null;
    setTimeout(() => {
      setSceneReady(true);

      // Start the orbital position emitter for tracking moving objects
      emitterRef.current.start();

      // Intro: zoom to provided camera snapshot
      const startPos = camera.position.clone();
      const startTarget = controls.target.clone();
      const endPos = new THREE.Vector3(
        919.9426740762151,
        35.549232587905905,
        180.65560343913018,
      );
      const endTarget = new THREE.Vector3(
        599.99999808,
        0,
        -0.04079999995648001,
      );

      const duration = 5000; // ms
      const startTime = performance.now();
      const previousControlsEnabled = controls.enabled;
      controls.enabled = false;

      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const animateCamera = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);

        const currentPos = new THREE.Vector3().lerpVectors(
          startPos,
          endPos,
          eased,
        );
        const currentTarget = new THREE.Vector3().lerpVectors(
          startTarget,
          endTarget,
          eased,
        );

        camera.position.copy(currentPos);
        controls.target.copy(currentTarget);
        controls.update();

        if (progress < 1) {
          introRafId = requestAnimationFrame(animateCamera);
        } else {
          introRafId = null;
          controls.enabled = previousControlsEnabled;
          setHudVisible(false);

          const startShipCinematic = (attempts: number = 0) => {
            const ship = spaceshipRef.current;
            const currentCamera = sceneRef.current.camera as
              | THREE.PerspectiveCamera
              | undefined;
            const currentControls = sceneRef.current.controls as
              | { target?: THREE.Vector3 }
              | undefined;

            if (!ship || !currentCamera || !currentControls?.target) {
              if (attempts < 10) {
                window.setTimeout(() => startShipCinematic(attempts + 1), 250);
              }
              return;
            }

            manualFlightModeRef.current = false;
            setFollowingSpaceship(false);
            followingSpaceshipRef.current = false;

            const cameraDirection = new THREE.Vector3();
            currentCamera.getWorldDirection(cameraDirection);
            const cameraUp = currentCamera.up.clone().normalize();
            const cameraRight = new THREE.Vector3()
              .crossVectors(cameraDirection, cameraUp)
              .normalize();
            const cameraLeft = cameraRight.clone().multiplyScalar(-1);

            const endPos = new THREE.Vector3(
              902.1810184349341,
              29.572186631042992,
              176.66640623268017,
            );

            const controlPos = ship.position
              .clone()
              .lerp(endPos, 0.65)
              .add(cameraLeft.clone().multiplyScalar(60))
              .add(cameraUp.clone().multiplyScalar(50))
              .add(cameraDirection.clone().multiplyScalar(10));

            const endQuat = new THREE.Quaternion(
              0.13822341047578124,
              0.7484587259553863,
              -0.18943034059866248,
              -0.6203385933491146,
            );

            setShipExteriorLights(true);

            const sunPosition = new THREE.Vector3();
            sunMesh.getWorldPosition(sunPosition);

            shipCinematicRef.current = {
              active: true,
              phase: "orbit",
              startTime: performance.now(),
              duration: 5000,
              startPos: ship.position.clone(),
              controlPos,
              endPos,
              startQuat: ship.quaternion.clone(),
              endQuat,
              lightsTriggered: true,
              orbitStartTime: performance.now(),
              orbitDuration: 6000,
              orbitCenter: sunPosition,
              orbitRadius: 260,
              orbitStartAngle: Math.PI * 0.85,
              orbitEndAngle: Math.PI * 2.1,
            };
          };

          startShipCinematic();
        }
      };

      introRafId = requestAnimationFrame(animateCamera);
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

      if (introRafId !== null) {
        cancelAnimationFrame(introRafId);
        introRafId = null;
      }

      // Stop orbital position emitter
      emitterRef.current.stop();

      // Cleanup navigation system
      disposeNavigationSystem();

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
          onNavigate={handleQuickNav}
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
