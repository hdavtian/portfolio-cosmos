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
import { type DiagramStyleOptions } from "./DiagramSettings";
import CosmosLoader from "./CosmosLoader";

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

// Global singleton to prevent multiple WebGL context creation
let globalRenderer: THREE.WebGLRenderer | null = null;
let globalCleanup: (() => void) | null = null;

// Extend window for logging timestamps
declare global {
  interface Window {
    lastAutopilotLog?: number;
    lastWaypointLog?: number;
  }
}

interface ResumeSpace3DProps {
  onNavigate: (section: number) => void;
  options: DiagramStyleOptions;
  onOptionsChange?: (options: DiagramStyleOptions) => void;
}

export default function ResumeSpace3D({
  options,
  onOptionsChange,
}: ResumeSpace3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<{
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    controls?: OrbitControls;
    sunLight?: THREE.PointLight;
    labelRendererDom?: HTMLElement;
    bloomPass?: UnrealBloomPass;
    sunMaterial?: THREE.MeshBasicMaterial;
    sunGlowMaterial?: THREE.SpriteMaterial;
  }>({});

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
  const zoomExitThresholdRef = useRef<number>(12); // units (default suggestion)

  // Visual console state
  const [consoleVisible, setConsoleVisible] = useState(true);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const consoleLogsRef = useRef<string[]>([]);
  const maxConsoleLogs = 8; // Keep last 8 logs

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
    waypoints: THREE.Vector3[];
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
    waypoints: [],
    currentIndex: 0,
    progress: 0,
    speed: 0.002,
    targetSpeed: 0.002,
    pauseTime: 0,
    isPaused: false,
    rollSpeed: 0,
    rollAmount: 0,
    visitingMoon: false,
    moonVisitStartTime: 0,
    moonVisitDuration: 10000, // 10 seconds
    currentMoonTarget: null,
  });

  // Manual flight control state
  const [manualFlightMode, setManualFlightMode] = useState(false);
  const manualFlightModeRef = useRef(false);
  const [keyboardUpdateTrigger, setKeyboardUpdateTrigger] = useState(0);
  const [invertControls, setInvertControls] = useState(false);
  const invertControlsRef = useRef(false);
  const [controlSensitivity, setControlSensitivity] = useState(0.5); // 0.1 to 2.0
  const controlSensitivityRef = useRef(0.5);
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

  // Handle autopilot navigation from drawer
  const handleAutopilotNavigation = (
    targetId: string,
    targetType: "section" | "moon",
  ) => {
    vlog(`🖱️ CLICK: Navigation button clicked - ${targetType}: ${targetId}`);

    if (!followingSpaceshipRef.current || manualFlightModeRef.current) {
      vlog("⚠️ Navigation only available in autopilot mode");
      vlog(
        `   Following: ${followingSpaceshipRef.current}, Manual: ${manualFlightModeRef.current}`,
      );
      return;
    }

    vlog(`🎯 Autopilot navigation to ${targetType}: ${targetId}`);
    setCurrentNavigationTarget(targetId);

    // Find target position
    let targetPosition: THREE.Vector3 | null = null;

    if (targetType === "moon") {
      // Find the moon mesh
      const company = resumeData.experience.find((exp) => exp.id === targetId);

      sceneRef.current.scene?.traverse((object) => {
        if (object instanceof THREE.Mesh && object.userData.planetName) {
          const objName = (object.userData.planetName || "").toLowerCase();

          if (company) {
            const companyName = (
              company.navLabel || company.company
            ).toLowerCase();
            if (
              objName.includes(companyName.split(" ")[0]) ||
              companyName.includes(objName)
            ) {
              targetPosition = new THREE.Vector3();
              object.getWorldPosition(targetPosition);
            }
          }
        }
      });
    } else if (targetType === "section") {
      // Find section planet (Experience or Skills)
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
    }

    if (targetPosition && spaceshipRef.current) {
      const shipPos = spaceshipRef.current.position.clone();
      const targetPos = targetPosition as THREE.Vector3; // Type assertion since we checked null above
      const distance = shipPos.distanceTo(targetPos);

      vlog(
        `✅ Target found at [${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)}]`,
      );
      vlog(
        `📍 Ship at [${shipPos.x.toFixed(1)}, ${shipPos.y.toFixed(1)}, ${shipPos.z.toFixed(1)}]`,
      );
      vlog(`📏 Distance: ${distance.toFixed(1)} units`);

      // Store navigation data
      navigationTargetRef.current = {
        id: targetId,
        type: targetType,
        position: targetPos,
        startPosition: shipPos.clone(),
        startTime: Date.now(),
        useTurbo: distance > 500, // Use turbo for distances > 500 units
      };

      vlog(
        `📏 Distance to target: ${distance.toFixed(1)} units ${navigationTargetRef.current.useTurbo ? "(TURBO enabled)" : ""}`,
      );
    } else {
      vlog(`❌ Could not find target: ${targetId}`);
      vlog(
        `   Target pos: ${!!targetPosition}, Ship ref: ${!!spaceshipRef.current}`,
      );
      setCurrentNavigationTarget(null);
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
    const newLogs = [...consoleLogsRef.current, logMessage].slice(
      -maxConsoleLogs,
    );
    consoleLogsRef.current = newLogs;
    setConsoleLogs(newLogs);
  };

  // Refs for cosmic systems
  const cameraDirectorRef = useRef<CosmosCameraDirector | null>(null);
  const focusedMoonRef = useRef<THREE.Mesh | null>(null);
  const tourGuideRef = useRef<CosmicTourGuide | null>(null);
  const navigationInterfaceRef = useRef<NavigationInterface | null>(null);
  const tourBuilderRef = useRef<TourDefinitionBuilder | null>(null);
  const planetsDataRef = useRef<Map<string, PlanetData>>(new Map());

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

  // Store options in a ref so the animation loop can access the latest values
  // without needing to be recreated on every render
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;

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

    // Helper: create a soft aurora-like halo texture (canvas -> CanvasTexture)
    function createAuroraHaloTexture() {
      // Create a horizontally-elongated soft halo using an elliptical radial gradient
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw several layered elliptical gradients for a soft aurora band
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // We'll draw into a scaled context to create an elliptical radial gradient
        for (let layer = 0; layer < 4; layer++) {
          const maxRadius = 160 - layer * 24;
          ctx.save();
          // scale X to stretch horizontally
          const scaleX = 1.6 - layer * 0.12;
          ctx.translate(cx, cy);
          ctx.scale(scaleX, 1);
          const grad = ctx.createRadialGradient(
            0,
            0,
            maxRadius * 0.12,
            0,
            0,
            maxRadius,
          );
          const alphaBase = 0.06 + layer * 0.02;
          grad.addColorStop(0, `rgba(180,230,255,${alphaBase * 0.15})`);
          grad.addColorStop(0.4, `rgba(140,200,255,${alphaBase * 0.9})`);
          grad.addColorStop(0.7, `rgba(80,160,255,${alphaBase * 0.4})`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Add a few soft wisps for texture
        for (let i = 0; i < 6; i++) {
          const y = cy + (i - 3) * 8 + Math.random() * 6;
          ctx.save();
          ctx.globalAlpha = 0.12 + Math.random() * 0.06;
          ctx.fillStyle = `rgba(180,230,255,0.5)`;
          ctx.fillRect(40, y - 6, canvas.width - 80, 12);
          ctx.restore();
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.premultiplyAlpha = true;
      (tex as any).encoding = (THREE as any).sRGBEncoding;
      tex.needsUpdate = true;
      return tex;
    }

    // Create sprite materials/textures for halo layers
    const auroraTexture = createAuroraHaloTexture();
    auroraTexture.minFilter = THREE.LinearFilter;
    auroraTexture.magFilter = THREE.LinearFilter;

    const ringTexture = createRingHaloTexture();
    ringTexture.minFilter = THREE.LinearFilter;
    ringTexture.magFilter = THREE.LinearFilter;

    const coreCanvas = document.createElement("canvas");
    coreCanvas.width = 64;
    coreCanvas.height = 64;
    const coreCtx = coreCanvas.getContext("2d");
    if (coreCtx) {
      const cx = 32;
      const cy = 32;
      const grad = coreCtx.createRadialGradient(cx, cy, 0, cx, cy, 32);
      grad.addColorStop(0, "rgba(255,255,230,1)");
      grad.addColorStop(0.5, "rgba(255,200,150,0.7)");
      grad.addColorStop(1, "rgba(255,0,0,0)");
      coreCtx.fillStyle = grad;
      coreCtx.fillRect(0, 0, 64, 64);
    }
    const coreTexture = new THREE.CanvasTexture(coreCanvas);
    coreTexture.minFilter = THREE.LinearFilter;
    coreTexture.magFilter = THREE.LinearFilter;

    // Helper to create a canvas texture with lines and text for close-up overlays
    const createDetailTexture = (
      lines: string[],
      options?: {
        width?: number;
        height?: number;
        bgColor?: string;
        lineColor?: string;
        textColor?: string;
        showLine?: boolean;
        fontSize?: number;
        lineSpacing?: number;
        textAlign?: CanvasTextAlign;
        padding?: number;
      },
    ) => {
      const width = options?.width || 1024;
      const height = options?.height || 512;
      const bgColor = options?.bgColor || "rgba(0,0,0,0)";
      const lineColor = options?.lineColor || "rgba(180,220,255,0.9)";
      const textColor = options?.textColor || "rgba(220,240,255,0.95)";
      const showLine = options?.showLine ?? true;
      const fontSize = options?.fontSize ?? 28;
      const lineSpacing = options?.lineSpacing ?? Math.round(fontSize * 1.4);
      const textAlign = options?.textAlign ?? ("left" as CanvasTextAlign);
      const padding = options?.padding ?? 64;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return new THREE.CanvasTexture(canvas);

      // Transparent background (so texture can be blended onto sphere)
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // Optionally draw a subtle horizontal guide line (centered)
      if (showLine) {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const y = height * 0.5;
        ctx.moveTo(40, y);
        ctx.lineTo(width - 40, y);
        ctx.stroke();
      }

      // Render text lines with a monospace/techy font
      ctx.fillStyle = textColor;
      ctx.font = `${fontSize}px monospace`;
      ctx.textBaseline = "middle";
      ctx.textAlign = textAlign;
      lines.forEach((line, i) => {
        const x = textAlign === "left" ? padding : width / 2;
        ctx.fillText(line, x, padding + i * lineSpacing);
      });

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    };

    // (attachDetailOverlay removed — replaced by attachMultiNoteOverlays)

    // Attach multiple small note overlays around a planet (world-space) using an array of short strings
    const attachMultiNoteOverlays = (
      planetMesh: THREE.Mesh,
      overlayDefs: Array<
        string | { type?: string; text?: string; lines?: string[] }
      >,
      options?: { radiusOffset?: number; opacity?: number },
    ) => {
      // Remove existing overlays if present
      const existing = planetMesh.userData.detailOverlays as
        | THREE.Mesh[]
        | undefined;
      if (existing && existing.length) {
        existing.forEach((o) => {
          if (o.parent) o.parent.remove(o);
          const idx = overlayClickables.indexOf(o);
          if (idx >= 0) overlayClickables.splice(idx, 1);
          try {
            if (o.geometry) o.geometry.dispose();
            if (o.material) (o.material as THREE.Material).dispose();
          } catch (e) {
            // ignore
          }
        });
      }

      const size =
        ((planetMesh.geometry as THREE.SphereGeometry).parameters
          .radius as number) || 5;
      const centerWorld = new THREE.Vector3();
      planetMesh.getWorldPosition(centerWorld);

      const overlays: THREE.Mesh[] = [];
      overlayDefs.forEach((note, idx) => {
        // normalize def to object form
        const def =
          typeof note === "string" ? { type: "general", text: note } : note;
        // Title overlay: placed above planet and does not rotate with planet
        if (def.type === "title" || def.lines) {
          const lines = def.lines || [planetMesh.userData.planetName || ""];
          const titleTex = createDetailTexture(lines, {
            width: 1024,
            height: 256,
            // Transparent backdrop; restore guide line under title for clarity
            textColor: "rgba(230,235,245,0.86)",
            showLine: true,
            fontSize: 26,
            lineSpacing: 28,
            textAlign: "left",
            padding: 48,
          });
          const aspectT = (titleTex.image as any)?.width
            ? (titleTex.image as any).width / (titleTex.image as any).height
            : 4;
          const planeHT = size * 1.2;
          const planeWT = planeHT * aspectT;
          const geoT = new THREE.PlaneGeometry(planeWT, planeHT);
          const matT = new THREE.MeshBasicMaterial({
            map: titleTex,
            transparent: true,
            // Tone down brightness slightly to reduce bloom/glow
            opacity: options?.opacity ?? 0.88,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide,
          });
          const meshT = new THREE.Mesh(geoT, matT);
          const worldPosT = new THREE.Vector3();
          planetMesh.getWorldPosition(worldPosT);
          meshT.position.set(
            worldPosT.x,
            worldPosT.y + size + size * 0.03,
            worldPosT.z,
          );
          meshT.userData.isTitleOverlay = true;
          meshT.userData.planeWidth = planeWT;
          meshT.userData.planeHeight = planeHT;
          meshT.userData.isDetailOverlay = true;
          meshT.userData.isOverlay = true; // Mark as overlay so raycaster ignores it
          meshT.raycast = () => {}; // Disable raycasting for this overlay - clicks pass through
          meshT.renderOrder = 0; // Use default render order to respect depth
          scene.add(meshT);
          overlays.push(meshT);
          // Don't add to overlayClickables - we want clicks to pass through
          // overlayClickables.push(meshT);
          // store as planet title overlay reference
          planetMesh.userData.titleOverlay = meshT;
          return; // continue to next def
        }

        // Small texture for general note (bullet-style)
        const bulletText = `- ${def.text || ""}`;
        const textTex = createDetailTexture([bulletText], {
          width: 512,
          height: 128,
          bgColor: "rgba(0,0,0,0)",
          showLine: false,
          // Softer cyan to avoid overbright glow
          textColor: "rgba(180,220,240,0.82)",
          fontSize: 20,
          lineSpacing: 26,
          textAlign: "left",
          padding: 48,
        });

        const aspect = (textTex.image as any)?.width
          ? (textTex.image as any).width / (textTex.image as any).height
          : 4;
        const planeH = size * 0.4; // small panel height
        const planeW = planeH * aspect;
        const geo = new THREE.PlaneGeometry(planeW, planeH);
        const mat = new THREE.MeshBasicMaterial({
          map: textTex,
          transparent: true,
          opacity: options?.opacity ?? 0.9,
          depthWrite: true,
          depthTest: true,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);

        // For general overlays: create bullet panels that will slide out under the title
        const elev = 0.02 * size; // small lift above surface while hidden
        const radialOffset = options?.radiusOffset ?? 0.02 * size;

        // mark as bullet overlay and track stacking index
        mesh.userData.isBulletOverlay = true;
        mesh.userData.bulletIndex = overlays.filter(
          (o) => !(o.userData && o.userData.isTitleOverlay),
        ).length;
        mesh.userData.radiusOffset = radialOffset;
        mesh.userData.elev = elev;
        mesh.userData.planeHeight = planeH;
        mesh.userData.planeWidth = planeW;
        mesh.userData.slideDir = Math.random() < 0.5 ? -1 : 1;
        mesh.userData.slideProgress = 0; // 0 = hidden at moon, 1 = slid out under title

        // start at planet center (hidden) and slide out toward title position when active
        mesh.position.set(centerWorld.x, centerWorld.y + elev, centerWorld.z);

        // keep overlays horizontal and readable (no tilt)
        mesh.rotation.x = 0;
        mesh.rotation.z = 0;

        mesh.userData.isDetailOverlay = true;
        mesh.userData.isOverlay = true; // Mark as overlay so raycaster ignores it
        mesh.raycast = () => {}; // Disable raycasting for this overlay - clicks pass through
        mesh.renderOrder = 0; // Use default render order to respect depth

        scene.add(mesh);
        overlays.push(mesh);
        // Don't add to overlayClickables - we want clicks to pass through to the moon
        // overlayClickables.push(mesh);
        // Debug: log initial overlay parameters for InvestCloud
        try {
          const pname = planetMesh.userData?.planetName as string | undefined;
          if (pname && pname.toLowerCase().includes("investcloud")) {
            try {
              const pos = mesh.position.clone().toArray();
              vlog(
                `INVESTCLOUD_OVERLAY_INIT ${idx} ${JSON.stringify({
                  theta: mesh.userData.theta,
                  angularSpeed: mesh.userData.angularSpeed,
                  inclination: mesh.userData.inclination,
                  radiusOffset: mesh.userData.radiusOffset,
                  elev: mesh.userData.elev,
                  position: pos,
                })}`,
              );
            } catch (e) {
              vlog(`INVESTCLOUD_OVERLAY_INIT ${idx} (log error)`);
            }
          }
        } catch (e) {
          // ignore
        }
      });

      planetMesh.userData.detailOverlays = overlays;
      return overlays;
    };
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

    // Background - Large distant starfield (skybox approach)
    // Create a much larger sphere to avoid visible sphere edge on zoom out
    const starTexture = textureLoader.load("/textures/8k_stars.jpg");
    const starGeo = new THREE.SphereGeometry(8000, 64, 64); // Much larger sphere
    const starMat = new THREE.MeshBasicMaterial({
      map: starTexture,
      side: THREE.BackSide,
      toneMapped: false,
      color: new THREE.Color(1.2, 1.2, 1.2), // Brightened to 120%
    });
    const starfield = new THREE.Mesh(starGeo, starMat);
    scene.add(starfield);

    // Inner layer: Secondary star layer for depth
    const skyTexture = textureLoader.load("/textures/stars.jpg");
    const skyGeo = new THREE.SphereGeometry(7800, 64, 64); // Much larger sphere
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTexture,
      side: THREE.BackSide,
      toneMapped: false,
      transparent: true,
      opacity: 0.3,
      color: new THREE.Color(0.8, 0.9, 1.0), // Blue tint
    });
    const skyfield = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyfield);

    // --- LIGHTING ---
    // Match original site: very dim ambient + strong point light with decay + fill light
    const ambientLight = new THREE.AmbientLight(
      new THREE.Color(0.13, 0.13, 0.13),
      0.5,
    );
    scene.add(ambientLight);

    const sunLight = new THREE.PointLight(
      new THREE.Color(1.0, 1.0, 1.0),
      (optionsRef.current.spaceSunIntensity || 2.5) * 4, // Multiply by 4 to match original's 10.0 default
      1000, // Distance
      0.5, // Decay for physical light falloff
    );
    sunLight.position.set(0, 0, 0);
    sunLight.castShadow = false;
    scene.add(sunLight);
    sceneRef.current.sunLight = sunLight;

    // Fill light for ambient illumination (matches original)
    const fillLight = new THREE.PointLight(
      new THREE.Color(0.2, 0.4, 1.0),
      2.0,
      100,
      1,
    );
    fillLight.position.set(50, 50, -100);
    scene.add(fillLight);

    // Sun mesh (visual center object)
    const sunGeometry = new THREE.SphereGeometry(60, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.position.set(0, 0, 0);
    scene.add(sunMesh);
    sceneRef.current.sunMaterial = sunMaterial;
    // Try to apply a sun texture to preserve detail
    try {
      textureLoader.load("/textures/sun.jpg", (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        sunMaterial.map = tex;
        sunMaterial.needsUpdate = true;
      });
    } catch {}

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
    // clickable overlay registry (planes that should be raycast-targeted)
    const overlayClickables: THREE.Object3D[] = [];
    // clickable planet registry (used for raycasting planet clicks)
    const clickablePlanets: THREE.Object3D[] = [];

    // Helper function to create ring halo texture
    function createRingHaloTexture() {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Draw multiple soft rings with radial gradients
        for (let i = 0; i < 3; i++) {
          const inner = 48 + i * 12;
          const outer = 68 + i * 18;
          const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
          const opacity = 0.45 - i * 0.12;
          grad.addColorStop(0, `rgba(120,180,255,${opacity})`);
          grad.addColorStop(0.5, `rgba(100,160,230,${opacity * 1.1})`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, outer, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.premultiplyAlpha = true;
      (tex as any).encoding = (THREE as any).sRGBEncoding;
      tex.needsUpdate = true;
      return tex;
    }

    // Sun Glow (Procedural Texture)
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(255, 200, 100, 1)");
      gradient.addColorStop(0.2, "rgba(255, 150, 50, 0.8)");
      gradient.addColorStop(0.5, "rgba(255, 100, 0, 0.2)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    }
    const glowTexture = new THREE.CanvasTexture(canvas);

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

    // Label Helper
    const createLabel = (text: string, subtext?: string) => {
      const div = document.createElement("div");
      div.className = "space-label";
      div.style.color = "rgba(255, 255, 255, 0.9)";
      div.style.fontFamily = "Cinzel, serif";
      div.style.textShadow = "0 0 10px #000";
      div.style.textAlign = "center";
      div.style.pointerEvents = "auto";
      div.style.cursor = "pointer";

      // Prevent wheel events on labels from triggering browser zoom
      div.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        { passive: false },
      );

      const title = document.createElement("div");
      title.textContent = text;
      title.style.fontSize = "16px";
      title.style.fontWeight = "bold";
      div.appendChild(title);

      if (subtext) {
        const sub = document.createElement("div");
        sub.textContent = subtext;
        sub.style.fontSize = "10px";
        sub.style.opacity = "0.8";
        div.appendChild(sub);
      }

      return new CSS2DObject(div);
    };

    // Sun Labels (Restored)
    const sunLabel = createLabel(
      resumeData.personal.name,
      resumeData.personal.title,
    );
    sunLabel.position.set(0, 50, 0);
    sunMesh.add(sunLabel);

    // 2. HELPER: Create Planet
    const createPlanet = (
      name: string,
      distance: number,
      size: number,
      color: number,
      parent: THREE.Object3D,
      orbitSpeed: number = 0.1,
      sectionIndex?: number,
      textureUrl?: string,
    ) => {
      // Orbit Path - Create professional orbital rings using TorusGeometry approach
      // Make rings thinner: main orbits slightly thicker than moon orbits
      const isMainOrbit = parent === scene; // scene-centered orbits (around Sun)
      const tubeRadius = isMainOrbit ? 0.12 : 0.08;
      const ringGeometry = new THREE.TorusGeometry(distance, tubeRadius, 8, 64);

      // Distinct orbit colors: main planets around the sun vs. moons around planets
      let ringColorHex: number = 0x444466;
      if (isMainOrbit) {
        switch ((name || "").toLowerCase()) {
          case "experience":
            ringColorHex = 0xe8c547; // gold
            break;
          case "skills":
            ringColorHex = 0x33a8ff; // cyan
            break;
          case "projects":
            ringColorHex = 0x9933ff; // purple
            break;
          default:
            ringColorHex = 0x666a80; // neutral
        }
      } else {
        const parentName = (
          (parent as any)?.userData?.planetName || ""
        ).toLowerCase();
        if (parentName.includes("experience")) {
          ringColorHex = 0xff9966; // warm for moons of Experience
        } else if (parentName.includes("skills")) {
          ringColorHex = 0x66ccff; // cool for moons of Skills
        } else if (parentName.includes("projects")) {
          ringColorHex = 0xcc99ff; // pastel for moons of Projects
        } else {
          ringColorHex = 0x556070;
        }
      }

      const ringMaterial = new THREE.MeshBasicMaterial({
        color: ringColorHex,
        transparent: true,
        // Further mute brightness so orbits don't dominate the scene
        opacity: isMainOrbit ? 0.08 : 0.05,
        side: THREE.DoubleSide,
      });
      const orbit = new THREE.Mesh(ringGeometry, ringMaterial);
      orbit.rotation.x = Math.PI / 2; // Rotate to horizontal plane
      orbit.userData.isOrbitLine = true; // Mark for visibility control
      parent.add(orbit);

      // Planet Mesh - Use MeshStandardMaterial for physically-based rendering (matches original)
      const planetGeometry = new THREE.SphereGeometry(size, 32, 32);
      const planetMaterial = new THREE.MeshStandardMaterial({
        color: textureUrl ? 0xffffff : color,
        map: textureUrl ? textureLoader.load(textureUrl) : null,
        emissive: new THREE.Color(0.0, 0.0, 0.0), // Will change on hover
        metalness: 0.05,
        roughness: 1.0,
      });
      const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
      // Store original color for hover effect
      planetMesh.userData.originalEmissive = new THREE.Color(0x000000);
      planetMesh.userData.hoverStartTime = 0; // Track when hover started for flash effect
      planetMesh.userData.lastFlashAt = 0; // last time a flash occurred (ms)
      planetMesh.userData.flashActive = false; // whether flash is currently animating
      planetMesh.userData.flashStrength = 0.6; // multiplier for flash intensity
      // Track hover counts to limit super-flashes: do a super flash every 4 or 5 distinct hovers
      planetMesh.userData.hoverCount = 0;
      planetMesh.userData.superEvery = Math.random() < 0.5 ? 4 : 5;
      planetMesh.userData.lastSuperFlashAt = 0;
      planetMesh.userData.isPointerOver = false; // track enter/leave transitions
      // Disable shadows for GPU compatibility
      planetMesh.castShadow = false;
      planetMesh.receiveShadow = false;

      // Add multi-layer halo effect for hover (only for clickable planets)
      if (sectionIndex !== undefined) {
        // Generate random properties for this planet's halo (within 50% variance)
        const sizeVariance = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
        const speedVariance = 0.75 + Math.random() * 0.5; // 0.75 to 1.25

        // Generate random halo color - vibrant colors in cool/warm spectrum
        const hue = Math.random(); // 0 to 1
        let haloColor: THREE.Color;
        if (hue < 0.33) {
          // Cool blues/cyans
          haloColor = new THREE.Color().setHSL(
            0.5 + Math.random() * 0.15,
            0.7 + Math.random() * 0.3,
            0.6,
          );
        } else if (hue < 0.66) {
          // Purples/magentas
          haloColor = new THREE.Color().setHSL(
            0.75 + Math.random() * 0.15,
            0.6 + Math.random() * 0.3,
            0.55,
          );
        } else {
          // Warm oranges/yellows/greens
          haloColor = new THREE.Color().setHSL(
            0.15 + Math.random() * 0.25,
            0.7 + Math.random() * 0.3,
            0.55,
          );
        }

        // Store random properties
        planetMesh.userData.haloSizeVariance = sizeVariance;
        planetMesh.userData.haloSpeedVariance = speedVariance;
        planetMesh.userData.haloColor = haloColor;

        // Create sprite-based halo layers (aurora, ring, core)
        const auroraMaterial = new THREE.SpriteMaterial({
          map: auroraTexture,
          color: haloColor,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const auroraSprite = new THREE.Sprite(auroraMaterial);
        auroraSprite.scale.set(
          size * 4 * sizeVariance,
          size * 4 * sizeVariance,
          1,
        );
        auroraSprite.position.set(0, 0, 0);
        planetMesh.add(auroraSprite);

        const ringMaterial = new THREE.SpriteMaterial({
          map: ringTexture,
          color: haloColor,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const ringSprite = new THREE.Sprite(ringMaterial);
        ringSprite.scale.set(
          size * 2.6 * sizeVariance,
          size * 2.6 * sizeVariance,
          1,
        );
        ringSprite.position.set(0, 0, 0);
        planetMesh.add(ringSprite);

        const coreMaterial = new THREE.SpriteMaterial({
          map: coreTexture,
          color: new THREE.Color(1, 0.95, 0.85),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const coreSprite = new THREE.Sprite(coreMaterial);
        coreSprite.scale.set(size * 1.2, size * 1.2, 1);
        coreSprite.position.set(0, 0, 0);
        planetMesh.add(coreSprite);

        planetMesh.userData.auroraSprite = auroraSprite;
        planetMesh.userData.ringSprite = ringSprite;
        planetMesh.userData.coreSprite = coreSprite;
        planetMesh.userData.auroraTargetOpacity = 0;
        planetMesh.userData.ringTargetOpacity = 0;
        planetMesh.userData.coreTargetOpacity = 0;
        planetMesh.userData.hasHaloLayers = true;
      }

      // Start position
      const startAngle = Math.random() * Math.PI * 2;
      planetMesh.position.x = Math.cos(startAngle) * distance;
      planetMesh.position.z = Math.sin(startAngle) * distance;

      parent.add(planetMesh);

      // Add to animation lists
      items.push({
        mesh: planetMesh,
        orbitSpeed,
        angle: startAngle,
        distance,
        parent: parent,
      });

      // Label
      const label = createLabel(name);
      label.position.set(0, size + 10, 0);
      planetMesh.add(label);

      // Interaction data - merge with existing userData to preserve haloSprite
      planetMesh.userData = {
        ...planetMesh.userData,
        isPlanet: true,
        sectionIndex,
        planetName: name,
        isMoon: parent !== scene,
        isMainPlanet: parent === scene,
      };

      // Add to clickable array if it has a section
      if (sectionIndex !== undefined) {
        clickablePlanets.push(planetMesh);
        console.log(
          `✅ Added clickable planet: "${name}" (sectionIndex: ${sectionIndex})`,
          {
            hasHaloLayers: !!planetMesh.userData.hasHaloLayers,
            haloColor: planetMesh.userData.haloColor,
            haloSize: planetMesh.userData.haloSizeVariance,
            haloSpeed: planetMesh.userData.haloSpeedVariance,
            position: planetMesh.position,
            size: size,
          },
        );
      } else {
        console.log(`ℹ️ Created non-clickable planet: "${name}"`);
      }

      return planetMesh;
    };

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
        createPlanet(
          job.company,
          60 + i * 20,
          5,
          0xffaadd,
          expPlanet,
          0.002 + Math.random() * 0.001,
          2 + i, // Make job moons clickable with correct section index
          textureUrl,
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
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 15000; // Increased star count for better density
    const posArray = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i += 3) {
      // Create more evenly distributed stars in spherical coordinates
      const radius = 2000 + Math.random() * 4000; // Stars at varying depths
      const theta = Math.random() * Math.PI * 2; // Azimuth angle
      const phi = Math.acos(2 * Math.random() - 1); // Polar angle (ensures even distribution)

      posArray[i] = radius * Math.sin(phi) * Math.cos(theta); // x
      posArray[i + 1] = radius * Math.sin(phi) * Math.sin(theta); // y
      posArray[i + 2] = radius * Math.cos(phi); // z
    }

    starsGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(posArray, 3),
    );
    const starsMaterial = new THREE.PointsMaterial({
      size: 1.5,
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: false, // Keep consistent size regardless of camera distance
    });
    const starField = new THREE.Points(starsGeometry, starsMaterial);
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

        // Generate random flight path waypoints throughout the cosmos
        const generateFlightPath = () => {
          const waypoints: THREE.Vector3[] = [];
          const numWaypoints = 8;

          for (let i = 0; i < numWaypoints; i++) {
            // 30% chance to target a random moon instead of random space
            if (Math.random() < 0.3 && items.length > 0) {
              // Find all moons
              const moons = items.filter(
                (item) => item.mesh.userData?.isMoon === true,
              );

              if (moons.length > 0) {
                // Pick random moon
                const randomMoon =
                  moons[Math.floor(Math.random() * moons.length)];
                const moonWorldPos = new THREE.Vector3();
                randomMoon.mesh.getWorldPosition(moonWorldPos);

                // Position near the moon (30 units away)
                const offset = new THREE.Vector3(
                  (Math.random() - 0.5) * 60,
                  (Math.random() - 0.5) * 40,
                  (Math.random() - 0.5) * 60,
                )
                  .normalize()
                  .multiplyScalar(30);

                waypoints.push(moonWorldPos.clone().add(offset));
                console.log(
                  `🌙 Spaceship will visit moon: ${randomMoon.mesh.userData.planetName}`,
                );
                continue;
              }
            }

            // Regular random waypoint
            const angle = (i / numWaypoints) * Math.PI * 2;
            const radius = 200 + Math.random() * 800;
            const height = (Math.random() - 0.5) * 400;

            waypoints.push(
              new THREE.Vector3(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius,
              ),
            );
          }

          // Close the loop
          waypoints.push(waypoints[0].clone());

          return waypoints;
        };

        spaceshipPathRef.current.waypoints = generateFlightPath();
        spaceshipPathRef.current.currentIndex = 0;
        spaceshipPathRef.current.progress = 0;

        console.log(
          "🛤️ Flight path generated with",
          spaceshipPathRef.current.waypoints.length,
          "waypoints",
        );
        vlog("🚀 Spaceship loaded and flight path initialized");
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
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let hoveredObject: THREE.Object3D | null = null;

    const onPointerMove = (event: MouseEvent) => {
      if (!mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Check for hover
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(clickablePlanets, false);

      // Debug: log on every 100th move to avoid spam
      if (Math.random() < 0.01) {
        console.log(
          `🔍 Raycasting: ${clickablePlanets.length} clickable planets, ${intersects.length} intersections`,
        );
      }

      // Determine the object under pointer (if any)
      const hit = intersects.find(
        (h) => h.object.userData.sectionIndex !== undefined,
      );

      const now = Date.now();

      // If we hit a valid planet
      if (hit && hit.object.userData.sectionIndex !== undefined) {
        const obj = hit.object;

        // If focused/paused, don't activate hover halo
        if (obj.userData.pauseOrbit) {
          // Ensure we clear any previous hover state if pointer moved from another object
          if (hoveredObject && hoveredObject !== obj) {
            const prev = hoveredObject;
            prev.userData.isPointerOver = false;
            if (!prev.userData.flashActive) prev.userData.hoverStartTime = 0;
            if (prev.userData.hasHaloLayers) {
              prev.userData.auroraTargetOpacity = 0;
              prev.userData.ringTargetOpacity = 0;
              prev.userData.coreTargetOpacity = 0;
            }
            document.body.style.cursor = "default";
            hoveredObject = null;
          }
        } else {
          // If pointer moved from another object, clear previous
          if (hoveredObject && hoveredObject !== obj) {
            const prev = hoveredObject;
            prev.userData.isPointerOver = false;
            if (!prev.userData.flashActive) prev.userData.hoverStartTime = 0;
            if (prev.userData.hasHaloLayers) {
              prev.userData.auroraTargetOpacity = 0;
              prev.userData.ringTargetOpacity = 0;
              prev.userData.coreTargetOpacity = 0;
            }
          }

          hoveredObject = obj;

          // Detect enter transition (distinct hover)
          const becameOver = !obj.userData.isPointerOver;
          obj.userData.isPointerOver = true;

          if (becameOver) {
            // Increment the hover count (counts distinct enter events)
            obj.userData.hoverCount = (obj.userData.hoverCount || 0) + 1;
            const superEvery = obj.userData.superEvery || 4;
            const lastSuper = obj.userData.lastSuperFlashAt || 0;
            const superCooldown = 2000; // ms minimum between super flashes

            // Decide whether this enter should be a 'super' flash (every N hovers)
            const shouldSuper =
              obj.userData.hoverCount % superEvery === 0 &&
              now - lastSuper > superCooldown;

            if (shouldSuper) {
              // Super flash
              obj.userData.hoverStartTime = now;
              obj.userData.flashActive = true;
              obj.userData.flashStrength = 0.6 + Math.random() * 1.0; // strong
              obj.userData.lastFlashAt = now;
              obj.userData.lastSuperFlashAt = now;

              if (obj.userData.hasHaloLayers) {
                obj.userData.auroraTargetOpacity = 0.6;
                obj.userData.ringTargetOpacity = 0.4;
                obj.userData.coreTargetOpacity = 1.0;
              }
            } else {
              // Small/subtle emission that still sends light out
              obj.userData.hoverStartTime = now;
              obj.userData.flashActive = true;
              obj.userData.flashStrength = 0.12 + Math.random() * 0.12; // small
              obj.userData.lastFlashAt = now;

              if (obj.userData.hasHaloLayers) {
                obj.userData.auroraTargetOpacity = 0.18;
                obj.userData.ringTargetOpacity = 0.12;
                obj.userData.coreTargetOpacity = 0.22;
              }
            }

            document.body.style.cursor = "pointer";
          }
        }
      } else {
        // No hit: clear previous hovered object if any
        if (hoveredObject) {
          const prev = hoveredObject;
          prev.userData.isPointerOver = false;
          if (!prev.userData.flashActive) prev.userData.hoverStartTime = 0;
          if (prev.userData.hasHaloLayers) {
            prev.userData.auroraTargetOpacity = 0;
            prev.userData.ringTargetOpacity = 0;
            prev.userData.coreTargetOpacity = 0;
          }
          document.body.style.cursor = "default";
          hoveredObject = null;
        }
      }
    };

    const onClick = (event: MouseEvent) => {
      // Update pointer from the actual click position to avoid stale coords
      if (mountRef.current) {
        const rect = mountRef.current.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      }

      raycaster.setFromCamera(pointer, camera);

      // First, check for overlay clicks (exit focused moon)
      // Filter out objects marked as overlays since they should not block interaction
      const overlayHits = raycaster.intersectObjects(
        overlayClickables.filter((o) => !o.userData.isOverlay),
        false,
      );
      if (overlayHits.length > 0) {
        // Exit focused moon view when overlay is clicked
        exitFocusedMoon();
        return;
      }

      // Clicking empty space should not exit moon focus — only overlay clicks or navigation/zoom do.
      const intersects = raycaster.intersectObjects(clickablePlanets, false);

      console.log(`🖱️ Click detected: ${intersects.length} intersections`);

      if (intersects.length > 0) {
        // Find first object with userData.sectionIndex
        const hit = intersects.find(
          (hit) => hit.object.userData.sectionIndex !== undefined,
        );
        if (hit && hit.object.userData.sectionIndex !== undefined) {
          console.log(
            `📍 Navigating to section ${hit.object.userData.sectionIndex} ("${hit.object.userData.planetName}")`,
          );

          const planetName = hit.object.userData.planetName;

          // Main planets: Fly to them using handleNavigation (same as quick nav)
          if (
            planetName === "Experience" ||
            planetName === "Skills" ||
            planetName === "Projects"
          ) {
            const pname = planetName.toLowerCase();
            const target =
              pname === "experience"
                ? "experience"
                : pname === "skills"
                  ? "skills"
                  : "projects";

            vlog(`🌍 Planet clicked: ${planetName}, flying to ${target}`);
            handleNavigation(target);
            return;
          }

          // Special handling for job moons - show cosmic overlay
          const jobData = resumeData.experience.find(
            (job) => job.company === planetName,
          );
          if (jobData) {
            setContentLoading(true);

            // Trigger the same travel + focus behavior as navigator clicks
            try {
              const cid =
                (jobData as any).id ||
                (jobData.company || "").toLowerCase().replace(/\s+/g, "-");
              // fire-and-forget: start the camera travel and moon focus
              // handleExperienceCompanyNavigation is defined later in this scope
              // but it's safe to call here because this handler runs on user interaction later.
              (handleExperienceCompanyNavigation as any)?.(cid);
            } catch (e) {
              // ignore if function not yet defined
            }

            // Build comprehensive job content sections
            const sections: any[] = [];

            // Add each position as a section
            jobData.positions?.forEach((position, idx) => {
              const posWithDates = position as any;
              sections.push({
                id: `position-${idx}`,
                title: position.title,
                content: position.responsibilities.join("\n\n• "),
                type: "text",
                data: {
                  startDate: posWithDates.startDate,
                  endDate: posWithDates.endDate,
                },
              });
            });

            const jobContent: OverlayContent = {
              title: jobData.company,
              subtitle: `${jobData.startDate} - ${jobData.endDate || "Present"} • ${jobData.location}`,
              description:
                jobData.positions?.[0]?.responsibilities[0] ||
                `Professional experience at ${jobData.company}.`,
              sections,
              actions: [
                {
                  label: "View Career Journey",
                  action: "tour:career-journey",
                  icon: "📈",
                },
              ],
            };

            // Simulate loading delay for smooth animation
            setTimeout(() => {
              setOverlayContent(jobContent);
              setContentLoading(false);
            }, 300);
          }
        }
      }
    };

    // Pointer handlers for rotating a focused moon directly
    const onPointerDownRotate = (event: PointerEvent) => {
      if (!mountRef.current || !focusedMoonRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const py = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.x = px;
      pointer.y = py;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(
        focusedMoonRef.current,
        true,
      );
      if (intersects.length > 0) {
        isDraggingRef.current = true;
        lastPointerRef.current = {
          x: event.clientX,
          y: event.clientY,
          t: Date.now(),
        };
        if (sceneRef.current && sceneRef.current.controls) {
          sceneRef.current.controls.enabled = false;
        }
      }
    };

    const onPointerMoveRotate = (event: PointerEvent) => {
      if (
        !isDraggingRef.current ||
        !focusedMoonRef.current ||
        !lastPointerRef.current
      )
        return;
      const now = Date.now();
      const dt = Math.max((now - lastPointerRef.current.t) / 1000, 1 / 120);
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;

      // Map drag delta to rotation deltas
      const rotY = dx * 0.008; // horizontal drag -> rotate around Y
      const rotX = dy * 0.008; // vertical drag -> rotate around X
      focusedMoonRef.current.rotation.y += rotY;
      focusedMoonRef.current.rotation.x += rotX;

      // Compute spin velocity to continue after release (inverse mapping)
      const vx = rotX / dt;
      const vy = rotY / dt;
      focusedMoonRef.current.userData.spinVelocity = new THREE.Vector3(
        vx * 0.15,
        vy * 0.15,
        0,
      );

      lastPointerRef.current = { x: event.clientX, y: event.clientY, t: now };
    };

    const onPointerUpRotate = (_event: PointerEvent) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        if (sceneRef.current && sceneRef.current.controls) {
          sceneRef.current.controls.enabled = true;
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("click", onClick);
    // Add rotate handlers
    window.addEventListener("pointerdown", onPointerDownRotate);
    window.addEventListener("pointermove", onPointerMoveRotate);
    window.addEventListener("pointerup", onPointerUpRotate);

    // Function to exit focused moon view: reattach, resume orbit, remove overlay, disable user spin
    const exitFocusedMoon = () => {
      const focused = focusedMoonRef.current;
      if (!focused) return;

      // Remove single overlay if present
      const overlay = focused.userData.detailOverlay as THREE.Mesh | undefined;
      if (overlay) {
        if (overlay.parent) overlay.parent.remove(overlay);
        const oi = overlayClickables.indexOf(overlay);
        if (oi >= 0) overlayClickables.splice(oi, 1);
        try {
          if (overlay.geometry) overlay.geometry.dispose();
          if (overlay.material) (overlay.material as THREE.Material).dispose();
        } catch (e) {
          // ignore
        }
        focused.userData.detailOverlay = null;
      }

      // Remove multiple note overlays if present
      const overlays = focused.userData.detailOverlays as
        | THREE.Mesh[]
        | undefined;
      if (overlays && overlays.length) {
        overlays.forEach((o) => {
          if (o.parent) o.parent.remove(o);
          const oi = overlayClickables.indexOf(o);
          if (oi >= 0) overlayClickables.splice(oi, 1);
          try {
            if (o.geometry) o.geometry.dispose();
            if (o.material) (o.material as THREE.Material).dispose();
          } catch (e) {
            // ignore
          }
        });
        focused.userData.detailOverlays = null;
      }

      // Find items entry
      const itemEntry = items.find((it) => it.mesh === focused);
      if (itemEntry) {
        const originalParent = (itemEntry as any).originalParent as
          | THREE.Object3D
          | undefined;
        const newParent = originalParent || itemEntry.parent || scene;

        // Convert world position back into the parent's local space, then reparent
        const worldPos = new THREE.Vector3();
        focused.getWorldPosition(worldPos);
        // add to parent then set local position
        newParent.add(focused);
        newParent.worldToLocal(worldPos);
        focused.position.copy(worldPos);

        // mark as attached again
        itemEntry.detached = false;
        itemEntry.parent = newParent;

        // Recompute polar coordinates for consistent orbit continuation
        const x = focused.position.x;
        const z = focused.position.z;
        itemEntry.distance = Math.sqrt(x * x + z * z) || itemEntry.distance;
        itemEntry.angle = Math.atan2(-z, x);
      }

      // Resume orbit and clear user-driven spin
      focused.userData.pauseOrbit = false;
      focused.userData.spinVelocity = undefined;

      // RESTORE ORBITAL SPEEDS: Restore the speeds we froze when focusing
      if (frozenOrbitalSpeedsRef.current) {
        vlog(`❄️ Restoring orbital motion after moon visit`);

        const frozen = frozenOrbitalSpeedsRef.current;
        vlog(
          `   Restoring speeds: planet=${frozen.parentPlanetOrbitSpeed}, moonOrbit=${frozen.parentPlanetMoonOrbitSpeed}, thisMoon=${frozen.moonOrbitSpeed}`,
        );

        // Restore the global speed settings
        if (onOptionsChange) {
          onOptionsChange({
            ...optionsRef.current,
            spaceOrbitSpeed: frozen.parentPlanetOrbitSpeed ?? 0.1,
            spaceMoonOrbitSpeed: frozen.parentPlanetMoonOrbitSpeed ?? 0.1,
          });
        }

        // Restore this specific moon's orbit speed
        if (frozen.moonItemEntry && frozen.moonOrbitSpeed !== undefined) {
          frozen.moonItemEntry.orbitSpeed = frozen.moonOrbitSpeed;
        }

        // Clear the frozen speeds
        frozenOrbitalSpeedsRef.current = null;

        vlog(`   ✅ Orbital motion restored`);
      }

      // Disable any ongoing drag
      isDraggingRef.current = false;
      if (sceneRef.current && sceneRef.current.controls) {
        sceneRef.current.controls.enabled = true;
      }

      // Clear focused reference
      focusedMoonRef.current = null;
    };

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
              finalizeFocusOnMoon(moonMesh, company);
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

      // CRITICAL: Freeze orbital motion BEFORE getting position
      // This ensures the moon stays still during camera flight
      const moonItemEntry = items.find((it) => it.mesh === moonMesh);
      if (moonItemEntry) {
        vlog(`🧊 PRE-FLIGHT: Freezing orbital motion`);

        // Store the original speeds BEFORE freezing
        frozenOrbitalSpeedsRef.current = {
          parentPlanetOrbitSpeed: optionsRef.current.spaceOrbitSpeed,
          parentPlanetMoonOrbitSpeed: optionsRef.current.spaceMoonOrbitSpeed,
          moonOrbitSpeed: moonItemEntry.orbitSpeed,
          moonItemEntry: moonItemEntry,
        };

        vlog(
          `   Stored speeds: planet=${frozenOrbitalSpeedsRef.current.parentPlanetOrbitSpeed}, moonOrbit=${frozenOrbitalSpeedsRef.current.parentPlanetMoonOrbitSpeed}, thisMoon=${frozenOrbitalSpeedsRef.current.moonOrbitSpeed}`,
        );

        // Freeze the speeds immediately
        if (onOptionsChange) {
          onOptionsChange({
            ...optionsRef.current,
            spaceOrbitSpeed: 0,
            spaceMoonOrbitSpeed: 0,
          });
        }

        // Freeze this specific moon's orbit speed
        moonItemEntry.orbitSpeed = 0;

        vlog(`   ✅ All orbital motion frozen before flight`);
      }

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

      // After arriving, finalize focus/overlays for the moon (extracted)
      finalizeFocusOnMoon(moonMesh!, company);
    };

    // Helper: finalize focus on a moon (attach overlays, pause orbit, detach, set focused state)
    const finalizeFocusOnMoon = (moonMesh: THREE.Mesh, company: any) => {
      try {
        const moonWorldPos = new THREE.Vector3();
        moonMesh.getWorldPosition(moonWorldPos);

        const detailLines: string[] = [];
        detailLines.push(company.company.toUpperCase());
        const firstPos = company.positions?.[0];
        if (firstPos) {
          const fp: any = firstPos as any;
          detailLines.push(
            `${fp.title} (${fp.startDate || ""} - ${fp.endDate || "Present"})`,
          );
        }
        detailLines.push(company.location || "");

        const jobNotes = (company as any).notes || [];
        const overlayDefs: Array<
          string | { type?: string; text?: string; lines?: string[] }
        > = [];
        overlayDefs.push({ type: "title", lines: detailLines });
        if (Array.isArray(jobNotes) && jobNotes.length) {
          jobNotes.forEach((n: string) => overlayDefs.push(n));
        }

        // Prepare right-pane content
        const sections: any[] = [];
        company.positions?.forEach((position: any, idx: number) => {
          sections.push({
            id: `position-${idx}`,
            title: position.title,
            content: (position.responsibilities || []).join("\n\n• "),
            type: "text",
            data: {
              startDate: position.startDate,
              endDate: position.endDate,
            },
          });
        });

        const jobContent: OverlayContent = {
          title: company.company,
          subtitle: `${company.startDate || ""} - ${company.endDate || "Present"} • ${company.location || ""}`,
          description:
            company.positions?.[0]?.responsibilities?.[0] ||
            `Professional experience at ${company.company}.`,
          sections,
          actions: [
            {
              label: "View Career Journey",
              action: "tour:career-journey",
              icon: "📈",
            },
          ],
        };

        // Show right-pane content (simulate load)
        setContentLoading(true);
        setTimeout(() => {
          setOverlayContent(jobContent);
          setContentLoading(false);
        }, 300);

        // Attach overlays
        attachMultiNoteOverlays(moonMesh, overlayDefs, {
          radiusOffset: 0.04,
          opacity: 0.95,
        });

        // Mark moon as focused: pause orbital revolution but allow spinning/interaction
        moonMesh.userData.pauseOrbit = true;
        if (!moonMesh.userData.spinVelocity) {
          moonMesh.userData.spinVelocity = new THREE.Vector3(0, 0, 0);
        }

        // Disable halo on focused moon
        if (moonMesh.userData.hasHaloLayers) {
          moonMesh.userData.auroraTargetOpacity = 0;
          moonMesh.userData.ringTargetOpacity = 0;
          moonMesh.userData.coreTargetOpacity = 0;
          const a = moonMesh.userData.auroraSprite as THREE.Sprite | undefined;
          const r = moonMesh.userData.ringSprite as THREE.Sprite | undefined;
          const c = moonMesh.userData.coreSprite as THREE.Sprite | undefined;
          if (a && a.material) {
            (a.material as THREE.SpriteMaterial).opacity = 0;
            a.visible = false;
          }
          if (r && r.material) {
            (r.material as THREE.SpriteMaterial).opacity = 0;
            r.visible = false;
          }
          if (c && c.material) {
            (c.material as THREE.SpriteMaterial).opacity = 0;
            c.visible = false;
          }
        }

        // Detach moon from its orbital parent so it stops inheriting parent's revolution
        const itemEntry = items.find((it) => it.mesh === moonMesh);
        if (itemEntry) {
          itemEntry.originalParent = itemEntry.parent;
          const worldPos = new THREE.Vector3();
          moonMesh.getWorldPosition(worldPos);

          vlog(`🔄 Detaching moon from parent`);
          vlog(
            `   World pos before detach: [${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)}]`,
          );
          vlog(
            `   Local pos before detach: [${moonMesh.position.x.toFixed(1)}, ${moonMesh.position.y.toFixed(1)}, ${moonMesh.position.z.toFixed(1)}]`,
          );
          vlog(`   Parent: ${itemEntry.parent?.type || "unknown"}`);

          scene.add(moonMesh);
          moonMesh.position.copy(worldPos);
          itemEntry.detached = true;
          itemEntry.parent = scene;

          vlog(
            `   Position after detach: [${moonMesh.position.x.toFixed(1)}, ${moonMesh.position.y.toFixed(1)}, ${moonMesh.position.z.toFixed(1)}]`,
          );
          vlog(
            `   Moon visible: ${moonMesh.visible}, in scene: ${moonMesh.parent === scene}`,
          );

          // Note: Orbital speeds were already frozen before camera flight
          vlog(`   (Orbital speeds already frozen during pre-flight)`);
        }

        focusedMoonRef.current = moonMesh;
        focusedMoonCameraDistanceRef.current =
          sceneRef.current?.camera?.position.distanceTo(moonWorldPos) || null;
      } catch (e) {
        console.warn("Failed to finalize focus on moon:", e);
      }
    };

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
          exitFocusedMoon();
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
              `🤖 AUTOPILOT: nav=${!!navigationTargetRef.current.id}, waypoints=${pathData.waypoints.length}, visiting=${pathData.visitingMoon}`,
            );
            window.lastAutopilotLog = Date.now();
          }

          // Check for active navigation target from drawer
          if (
            navigationTargetRef.current.id &&
            navigationTargetRef.current.position
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

              // CRITICAL: Clear waypoints to prevent waypoint mode from taking over
              pathData.waypoints = [];
              pathData.visitingMoon = false;
              pathData.currentMoonTarget = null;
              vlog(`🧹 Cleared waypoints and moon visit state`);

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
                  // Show the overlays and detach the moon
                  finalizeFocusOnMoon(moonMesh, company);
                }
              }

              vlog(`🏁 Navigation complete - exiting navigation block`);
              // Exit navigation - return to allow normal behavior
              return;
            }

            // Skip normal waypoint behavior while navigating
          } else if (spaceshipPathRef.current.waypoints.length > 0) {
            // Normal waypoint behavior
            if (
              !window.lastWaypointLog ||
              Date.now() - window.lastWaypointLog > 2000
            ) {
              vlog(
                `🛤️ WAYPOINT MODE: ${spaceshipPathRef.current.waypoints.length} waypoints, visiting=${pathData.visitingMoon}`,
              );
              window.lastWaypointLog = Date.now();
            }

            // Check if we're visiting a moon
            if (pathData.visitingMoon) {
              const elapsed = Date.now() - pathData.moonVisitStartTime;

              if (elapsed >= pathData.moonVisitDuration) {
                // Finished visiting moon
                pathData.visitingMoon = false;
                pathData.currentMoonTarget = null;
                vlog("🚀 MOON VISIT ENDED: Resuming waypoint flight");
              } else {
                // Orbit around the moon slowly
                if (pathData.currentMoonTarget) {
                  const orbitSpeed = 0.0005;
                  const orbitRadius = 30;
                  const orbitAngle = (elapsed * orbitSpeed) % (Math.PI * 2);

                  const orbitX =
                    pathData.currentMoonTarget.x +
                    Math.cos(orbitAngle) * orbitRadius;
                  const orbitY =
                    pathData.currentMoonTarget.y +
                    Math.sin(orbitAngle * 0.5) * 10;
                  const orbitZ =
                    pathData.currentMoonTarget.z +
                    Math.sin(orbitAngle) * orbitRadius;

                  ship.position.set(orbitX, orbitY, orbitZ);
                  ship.lookAt(pathData.currentMoonTarget);
                }
                // Skip normal movement
                return;
              }
            }

            // Smoothly accelerate/decelerate to target speed (never stop)
            pathData.speed += (pathData.targetSpeed - pathData.speed) * 0.02;

            // Apply travel speed multiplier from options
            const speedMultiplier =
              (optionsRef.current.spaceTravelSpeed ?? 50) / 50;

            // Move along path
            pathData.progress += pathData.speed * speedMultiplier;

            if (pathData.progress >= 1) {
              pathData.progress = 0;
              pathData.currentIndex =
                (pathData.currentIndex + 1) % pathData.waypoints.length;

              // Check if next waypoint is near a moon
              const nextWaypoint = pathData.waypoints[pathData.currentIndex];
              const moons = items.filter(
                (item) => item.mesh.userData?.isMoon === true,
              );

              for (const moonItem of moons) {
                const moonWorldPos = new THREE.Vector3();
                moonItem.mesh.getWorldPosition(moonWorldPos);

                // If waypoint is within 50 units of moon, start visit
                if (nextWaypoint.distanceTo(moonWorldPos) < 50) {
                  pathData.visitingMoon = true;
                  pathData.moonVisitStartTime = Date.now();
                  pathData.currentMoonTarget = moonWorldPos.clone();
                  vlog(
                    `🌙 MOON VISIT STARTED: ${moonItem.mesh.userData.planetName} (10 second orbit)`,
                  );
                  vlog(
                    `   Moon at: [${moonWorldPos.x.toFixed(1)}, ${moonWorldPos.y.toFixed(1)}, ${moonWorldPos.z.toFixed(1)}]`,
                  );
                  break;
                }
              }

              // Randomly vary speed for natural movement
              pathData.targetSpeed = 0.002 + Math.random() * 0.002;

              // Very rarely trigger a barrel roll - 3% chance
              if (Math.random() < 0.03) {
                pathData.rollSpeed = (Math.random() > 0.5 ? 1 : -1) * 0.02;
                pathData.rollAmount = Math.PI * 2;
              }
            }

            // Get current and next waypoint
            const current = pathData.waypoints[pathData.currentIndex];
            const next =
              pathData.waypoints[
                (pathData.currentIndex + 1) % pathData.waypoints.length
              ];

            // Smooth interpolation between waypoints
            const t = pathData.progress;
            const smoothT = t * t * (3 - 2 * t); // Smoothstep

            ship.position.lerpVectors(current, next, smoothT);

            // Orient spaceship to face direction of travel
            const direction = new THREE.Vector3()
              .subVectors(next, current)
              .normalize();
            const targetQuaternion = new THREE.Quaternion();
            const up = new THREE.Vector3(0, 1, 0);
            const matrix = new THREE.Matrix4();
            matrix.lookAt(direction, new THREE.Vector3(0, 0, 0), up);
            targetQuaternion.setFromRotationMatrix(matrix);
            ship.quaternion.slerp(targetQuaternion, 0.05);

            // Apply barrel roll if active
            if (Math.abs(pathData.rollAmount) > 0.01) {
              const rollAxis = new THREE.Vector3(0, 0, 1);
              rollAxis.applyQuaternion(ship.quaternion);
              const rollQuat = new THREE.Quaternion();
              rollQuat.setFromAxisAngle(rollAxis, pathData.rollSpeed);
              ship.quaternion.multiply(rollQuat);

              pathData.rollAmount -= Math.abs(pathData.rollSpeed);
              if (pathData.rollAmount <= 0) {
                pathData.rollSpeed = 0;
                pathData.rollAmount = 0;
              }
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
                  const worldTarget = shipWorldPos
                    .clone()
                    .add(localTargetOffset);

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
                const currentOffset = camera.position
                  .clone()
                  .sub(ship.position);

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
                const desiredCameraPos = ship.position
                  .clone()
                  .add(scaledOffset);
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
          } // End of normal waypoint behavior
        } // End of autopilot mode block
      } // End of spaceship animation

      // Rotate Sun
      sunMesh.rotation.y += 0.002;

      // Orbit logic (separate speeds for main planets vs. moons)
      const planetSpeedMultiplier =
        optionsRef.current.spaceOrbitSpeed !== undefined
          ? optionsRef.current.spaceOrbitSpeed
          : 0.1;
      const moonSpeedMultiplier =
        optionsRef.current.spaceMoonOrbitSpeed !== undefined
          ? (optionsRef.current.spaceMoonOrbitSpeed as number)
          : (optionsRef.current.spaceOrbitSpeed ?? 0.1);

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
              const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
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

      // Animate orbital positions only when speed is greater than zero
      items.forEach((item) => {
        const isMoon = item.mesh.userData?.isMoon === true;
        const sm = isMoon ? moonSpeedMultiplier : planetSpeedMultiplier;

        // Only update orbital position if speed is greater than 0
        // Also skip if this is a focused moon
        if (sm > 0) {
          const isFocused = focusedMoonRef.current === item.mesh;
          if (!item.mesh.userData.pauseOrbit && !isFocused) {
            item.angle += item.orbitSpeed * sm;
            item.mesh.position.x = Math.cos(item.angle) * item.distance;
            item.mesh.position.z = -Math.sin(item.angle) * item.distance;
          }
        }

        // Self rotation: use moon spin speed control for moons, base spin for planets
        const isMoonBody = item.mesh.userData?.isMoon === true;

        // Get moon spin speed multiplier from options (default to 1.0 if not set)
        const moonSpinMultiplier =
          optionsRef.current.spaceMoonSpinSpeed !== undefined
            ? optionsRef.current.spaceMoonSpinSpeed
            : 1.0;

        const baseSpin = isMoonBody ? 0.02 * moonSpinMultiplier : 0.008; // moons use multiplier

        // For planets that have moons as children, only apply rotation if moon orbit speed > 0
        // Otherwise the planet rotation causes moons to orbit even when speed is 0
        const isPlanetWithPotentialMoons =
          item.mesh.userData?.isMainPlanet === true;
        const shouldRotate =
          !isPlanetWithPotentialMoons || moonSpeedMultiplier > 0;

        // Only rotate if should rotate AND if it's not a moon with 0 spin speed
        const shouldApplySpin =
          shouldRotate && (!isMoonBody || moonSpinMultiplier > 0);

        if (shouldApplySpin) {
          item.mesh.rotation.y += baseSpin;
        }

        // Apply any residual spin velocity from user interaction (always applied)
        const spin = item.mesh.userData.spinVelocity as
          | THREE.Vector3
          | undefined;
        if (spin) {
          // approximate delta-time
          const dt = 1 / 60; // seconds
          item.mesh.rotation.x += spin.x * dt;
          item.mesh.rotation.y += spin.y * dt;

          // decay spin slowly
          spin.multiplyScalar(0.995);
        }
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
