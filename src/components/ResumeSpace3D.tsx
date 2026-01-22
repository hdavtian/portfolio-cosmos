import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import resumeData from "../data/resume.json";
import { type DiagramStyleOptions } from "./DiagramSettings";

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
import { SpaceshipHUD } from "./SpaceshipHUD";

// Global singleton to prevent multiple WebGL context creation
let globalRenderer: THREE.WebGLRenderer | null = null;
let globalCleanup: (() => void) | null = null;

interface ResumeSpace3DProps {
  onNavigate: (section: number) => void;
  options: DiagramStyleOptions;
}

export default function ResumeSpace3D({
  onNavigate,
  options,
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
  }>({});

  // State for new cosmic systems
  const [overlayContent, setOverlayContent] = useState<OverlayContent | null>(
    null,
  );
  const [contentLoading, setContentLoading] = useState(false);
  const originalMinDistanceRef = useRef<number>(0);

  // Visual console state
  const [consoleVisible, setConsoleVisible] = useState(true);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const consoleLogsRef = useRef<string[]>([]);
  const maxConsoleLogs = 8; // Keep last 8 logs

  // Tour state
  const [tourActive, setTourActive] = useState(false);
  const [tourWaypoint, setTourWaypoint] = useState<string>("");
  const [tourProgress, setTourProgress] = useState({ current: 0, total: 0 });

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

      // Update sun material brightness separately with a cap
      if (sceneRef.current.sunMaterial) {
        const sunBrightness = Math.min(
          0.6 + options.spaceSunIntensity * 0.08,
          1.0,
        );
        sceneRef.current.sunMaterial.color.setRGB(
          sunBrightness,
          sunBrightness * 0.95,
          sunBrightness * 0.7,
        );
      }
    }
    if (sceneRef.current.labelRendererDom) {
      sceneRef.current.labelRendererDom.style.display =
        options.spaceShowLabels === false ? "none" : "block";
    }
  }, [options]);

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

    // --- OBJECTS ---
    const items: {
      mesh: THREE.Mesh;
      orbitSpeed: number;
      angle: number;
      distance: number;
      parent?: THREE.Object3D;
    }[] = [];

    // Track clickable planets for raycasting
    const clickablePlanets: THREE.Mesh[] = [];

    // 1. SUN (Profile)
    const sunTexture = textureLoader.load("/textures/sun.jpg");
    const sunGeometry = new THREE.SphereGeometry(30, 32, 32);
    // Basic material for Sun so it's always bright and not affected by lights
    // Cap brightness at lower value to prevent sun from being too bright to look at
    const initialBrightness = Math.min(
      0.6 + (optionsRef.current.spaceSunIntensity || 2.5) * 0.08,
      1.0,
    );
    const sunMaterial = new THREE.MeshBasicMaterial({
      map: sunTexture,
      color: new THREE.Color(
        initialBrightness,
        initialBrightness * 0.95,
        initialBrightness * 0.7,
      ),
    });
    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sunMesh);
    sceneRef.current.sunMaterial = sunMaterial;

    // Helper function to create a cloudy aurora-like halo texture (canvas-based)
    function createAuroraHaloTexture() {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const centerX = 128;
        const centerY = 128;

        // Base glow
        const gradient1 = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          128,
        );
        gradient1.addColorStop(0, "rgba(100, 200, 255, 0)");
        gradient1.addColorStop(0.3, "rgba(100, 180, 255, 0.15)");
        gradient1.addColorStop(0.5, "rgba(80, 150, 255, 0.3)");
        gradient1.addColorStop(0.7, "rgba(60, 120, 255, 0.2)");
        gradient1.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient1;
        ctx.fillRect(0, 0, 256, 256);

        // Wispy cloud patterns
        for (let i = 0; i < 12; i++) {
          const angle = (Math.PI * 2 * i) / 12;
          const x = centerX + Math.cos(angle) * 80;
          const y = centerY + Math.sin(angle) * 80;
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, 40);
          gradient.addColorStop(0, "rgba(150, 200, 255, 0.4)");
          gradient.addColorStop(0.5, "rgba(100, 150, 255, 0.15)");
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 256, 256);
        }
      }
      return new THREE.CanvasTexture(canvas);
    }

    // Helper function to create ring halo texture
    function createRingHaloTexture() {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const centerX = 64;
        const centerY = 64;

        for (let i = 0; i < 3; i++) {
          const innerRadius = 35 + i * 8;
          const outerRadius = 45 + i * 8;
          const gradient = ctx.createRadialGradient(
            centerX,
            centerY,
            innerRadius,
            centerX,
            centerY,
            outerRadius,
          );
          const opacity = 0.5 - i * 0.15;
          gradient.addColorStop(0, `rgba(120, 180, 255, ${opacity})`);
          gradient.addColorStop(0.5, `rgba(80, 150, 255, ${opacity * 1.2})`);
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 128, 128);
        }
      }
      return new THREE.CanvasTexture(canvas);
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
      const ringGeometry = new THREE.TorusGeometry(distance, 0.3, 8, 64);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x444466,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
      });
      const orbit = new THREE.Mesh(ringGeometry, ringMaterial);
      orbit.rotation.x = Math.PI / 2; // Rotate to horizontal plane
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
      200,
      15,
      0xff5533,
      scene,
      0.0002,
      1,
      "/textures/mars.jpg",
    );

    const skillsPlanet = createPlanet(
      "Skills",
      350,
      20,
      0x3388ff,
      scene,
      0.00015,
      2,
      "/textures/earth.jpg",
    );

    const projectsPlanet = createPlanet(
      "Projects",
      500,
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

      // Reset previous hover
      if (hoveredObject) {
        // Reset hover time so flash effect stops
        hoveredObject.userData.hoverStartTime = 0;
        // Set sprite target opacities to 0 for smooth fade out
        if (hoveredObject.userData.hasHaloLayers) {
          hoveredObject.userData.auroraTargetOpacity = 0;
          hoveredObject.userData.ringTargetOpacity = 0;
          hoveredObject.userData.coreTargetOpacity = 0;
        }
        document.body.style.cursor = "default";
        hoveredObject = null;
      }

      // Apply new hover
      if (intersects.length > 0) {
        const hit = intersects.find(
          (hit) => hit.object.userData.sectionIndex !== undefined,
        );

        if (hit && hit.object.userData.sectionIndex !== undefined) {
          hoveredObject = hit.object;

          // Start the flash effect on first hover
          if (hoveredObject.userData.hoverStartTime === 0) {
            hoveredObject.userData.hoverStartTime = Date.now();
          }

          // Show sprite halo layers with target opacities for smooth fade in
          if (hoveredObject.userData.hasHaloLayers) {
            hoveredObject.userData.auroraTargetOpacity = 0.45;
            hoveredObject.userData.ringTargetOpacity = 0.32;
            hoveredObject.userData.coreTargetOpacity = 0.9;
          }

          document.body.style.cursor = "pointer";
        }
      }
    };

    const onClick = () => {
      raycaster.setFromCamera(pointer, camera);
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

          // Enhanced cosmic interaction based on planet type
          if (
            planetName === "Experience" ||
            planetName === "Skills" ||
            planetName === "Projects"
          ) {
            // Show cosmic overlay for main planets
            if (tourBuilderRef.current) {
              let content: OverlayContent | null = null;

              switch (planetName) {
                case "Experience":
                  content = tourBuilderRef.current[
                    "createExperienceContent"
                  ]?.() || {
                    title: "Experience Planet",
                    description:
                      "Explore my professional journey through the cosmos of career growth.",
                    sections: [
                      {
                        id: "overview",
                        title: "Career Overview",
                        content:
                          "Professional experiences spanning multiple industries and technologies.",
                        type: "text",
                      },
                    ],
                    actions: [
                      {
                        label: "Career Tour",
                        action: "tour:career-journey",
                        icon: "🚀",
                      },
                      {
                        label: "Explore Moons",
                        action: "navigate:experience-moons",
                        icon: "🌙",
                      },
                    ],
                  };
                  break;
                case "Skills":
                  content = tourBuilderRef.current[
                    "createSkillsContent"
                  ]?.() || {
                    title: "Skills Constellation",
                    description:
                      "Technical abilities and creative tools mastered over the years.",
                    sections: [
                      {
                        id: "overview",
                        title: "Technical Skills",
                        content:
                          "Programming languages, frameworks, and development methodologies.",
                        type: "text",
                      },
                    ],
                    actions: [
                      {
                        label: "Technical Deep Dive",
                        action: "tour:technical-deep-dive",
                        icon: "⚡",
                      },
                      {
                        label: "View Portfolio",
                        action: "navigate:projects",
                        icon: "🎨",
                      },
                    ],
                  };
                  break;
                case "Projects":
                  content = {
                    title: "Innovation Station",
                    description:
                      "Creative projects and technological innovations.",
                    sections: [
                      {
                        id: "overview",
                        title: "Project Gallery",
                        content:
                          "Innovative solutions and creative implementations.",
                        type: "text",
                      },
                    ],
                    actions: [
                      {
                        label: "View Gallery",
                        action: "projects:gallery",
                        icon: "🖼️",
                      },
                      {
                        label: "Technical Details",
                        action: "tour:technical-deep-dive",
                        icon: "🔧",
                      },
                    ],
                  };
                  break;
              }

              if (content) {
                setOverlayContent(content);
                setContentLoading(false);
                return; // Don't do regular navigation
              }
            }
          }

          // Special handling for job moons - show cosmic overlay
          const jobData = resumeData.experience.find(
            (job) => job.company === planetName,
          );
          if (jobData) {
            setContentLoading(true);

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
          } else {
            // Regular navigation for other planets
            onNavigate(hit.object.userData.sectionIndex);
          }
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("click", onClick);

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

      // Show content without overlay blocking the view
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
          await cameraDirectorRef.current.systemOverview();
          break;
        case "about":
          await cameraDirectorRef.current.systemOverview();
          // Show About Harma content
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
          vlog("🌌 Navigated to Sun (About)");
          // Restore original camera constraints
          setMinDistance(originalMinDistanceRef.current, "restore after about");
          break;
        case "experience":
          vlog("🌍 Traveling to Experience Planet...");
          await cameraDirectorRef.current.focusPlanet(expPlanet, 300);
          // Restore original camera constraints
          setMinDistance(
            originalMinDistanceRef.current,
            "restore after experience",
          );
          break;
        case "skills":
          vlog("⚡ Traveling to Skills Planet...");
          await cameraDirectorRef.current.focusPlanet(skillsPlanet, 350);
          // Restore original camera constraints
          setMinDistance(
            originalMinDistanceRef.current,
            "restore after skills",
          );
          break;
        case "projects":
          vlog("💡 Traveling to Projects Planet...");
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
                setTourActive(true);
                setOverlayContent(null);
                setContentLoading(false);
                tourGuideRef.current.startTour(tour.waypoints);
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

      // Get the moon's WORLD position (not local position relative to parent)
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
      const distance = 15; // Distance from moon center - testing value

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
    };

    // Initialize navigation interface
    if (container) {
      navigationInterfaceRef.current = new NavigationInterface(
        container,
        handleNavigation,
      );
      // Tour guide functionality removed for simplification
    }

    // --- ANIMATION LOOP ---
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Rotate Sun
      sunMesh.rotation.y += 0.002;

      // Orbit logic
      const speedMultiplier =
        optionsRef.current.spaceOrbitSpeed !== undefined
          ? optionsRef.current.spaceOrbitSpeed
          : 0.1;

      // Animate halo layers and flash effects ALWAYS (independent of orbit speed)
      const time = Date.now() * 0.001; // Time in seconds

      items.forEach((item) => {
        // Handle color flash effect on hover
        if (item.mesh.userData.hoverStartTime > 0) {
          const flashDuration = 1200; // 1.2 seconds for complete flash cycle
          const elapsed = Date.now() - item.mesh.userData.hoverStartTime;
          const material = item.mesh.material as THREE.MeshStandardMaterial;

          if (elapsed < flashDuration) {
            // Quick flash up then fade out
            const progress = elapsed / flashDuration;

            // Create a quick bright flash that fades
            // First 20% of time: rapid bright flash
            // Remaining 80%: gentle fade to original
            let intensity;
            if (progress < 0.2) {
              // Quick flash up - reduced from 0.8 to 0.4 for subtlety
              intensity = (progress / 0.2) * 0.4;
            } else {
              // Slow fade out
              intensity = 0.4 * (1 - (progress - 0.2) / 0.8);
            }

            // Subtle white/cyan flash - reduced intensity values
            material.emissive.setRGB(
              0.3 * intensity,
              0.4 * intensity,
              0.6 * intensity,
            );
          } else {
            // Flash complete, ensure back to original
            material.emissive.copy(item.mesh.userData.originalEmissive);
          }
        } else {
          // Not hovering, ensure emissive is at original
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
      });

      // Only animate orbit positions and planet rotation if speed is not zero
      if (speedMultiplier !== 0) {
        items.forEach((item) => {
          item.angle -= item.orbitSpeed * speedMultiplier;
          item.mesh.position.x = Math.cos(item.angle) * item.distance;
          item.mesh.position.z = -Math.sin(item.angle) * item.distance;

          // Self rotation
          item.mesh.rotation.y += 0.01 * speedMultiplier;
        });
      }

      controls.update();
      composer.render(); // Use composer instead of renderer for bloom effect
      labelRenderer.render(scene, camera);
    };

    animate();

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
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
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
            right: "30px",
            color: "rgba(212, 175, 55, 0.9)",
            fontFamily: "'Cinzel', serif",
            fontSize: "14px",
            textAlign: "right",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 10,
            textShadow: "0 2px 4px rgba(0,0,0,0.8)",
          }}
        >
          <p style={{ margin: "5px 0" }}>↔ DRAG TO ROTATE</p>
          <p style={{ margin: "5px 0" }}>↕ SCROLL TO ZOOM</p>
          <p style={{ margin: "5px 0" }}>• CLICK PLANETS TO VISIT</p>
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
        isTransitioning={false}
        speed={0}
        content={overlayContent}
        contentLoading={contentLoading}
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
                setTourActive(true);
                setOverlayContent(null);
                setContentLoading(false);
                tourGuideRef.current.startTour(tour.waypoints);
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
  );
}
