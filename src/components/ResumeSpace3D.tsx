import { useEffect, useRef } from "react";
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
    sunLight?: THREE.PointLight;
    labelRendererDom?: HTMLElement;
    bloomPass?: UnrealBloomPass;
    sunMaterial?: THREE.MeshBasicMaterial;
  }>({});

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

    // Renderer (WebGL) - Create ONLY if global doesn't exist
    console.log("Creating NEW WebGL context");
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    globalRenderer = renderer; // Store globally
    rendererRef.current = renderer;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    // Disable shadows to reduce shader complexity for GPU compatibility
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    // Renderer (CSS 2D for labels)
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(container.clientWidth, container.clientHeight);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0px";
    labelRenderer.domElement.style.pointerEvents = "none";
    container.appendChild(labelRenderer.domElement);

    sceneRef.current.labelRendererDom = labelRenderer.domElement;
    // Apply initial visibility
    if (optionsRef.current.spaceShowLabels === false) {
      labelRenderer.domElement.style.display = "none";
    }

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 50;
    controls.maxDistance = 2500;
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

    // Background - Two-layer starfield (matching original implementation)
    // Outer layer: Main starfield
    const starTexture = textureLoader.load("/textures/8k_stars.jpg");
    const starGeo = new THREE.SphereGeometry(500, 64, 64);
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
    const skyGeo = new THREE.SphereGeometry(490, 64, 64);
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

    // Helper function to create a cloudy aurora-like halo texture
    const createAuroraHaloTexture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Create multiple layered gradients for aurora effect
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

        // Add wispy cloud-like patterns
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
    };

    // Helper function to create ring halo texture
    const createRingHaloTexture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const centerX = 64;
        const centerY = 64;

        // Create ring effect with multiple bands
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
    };

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
      orbitSpeed: number = 0.005,
      sectionIndex?: number,
      textureUrl?: string,
    ) => {
      // Orbit Path
      const orbitCurve = new THREE.EllipseCurve(
        0,
        0,
        distance,
        distance,
        0,
        2 * Math.PI,
        false,
        0,
      );
      const points = orbitCurve.getPoints(128);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x555555,
        transparent: true,
        opacity: 0.2,
      });
      const orbit = new THREE.Line(geometry, material);
      orbit.rotation.x = Math.PI / 2;
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

        // Layer 1: Aurora cloud effect (largest, slowest rotation)
        const auroraTexture = createAuroraHaloTexture();
        const auroraSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: auroraTexture,
            color: haloColor,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
          }),
        );
        auroraSprite.scale.set(
          size * 5 * sizeVariance,
          size * 5 * sizeVariance,
          1,
        );
        planetMesh.add(auroraSprite);
        planetMesh.userData.auroraSprite = auroraSprite;
        planetMesh.userData.auroraTargetOpacity = 0;

        // Layer 2: Inner glow/ring (medium size, counter-rotation)
        const ringTexture = createRingHaloTexture();
        const darkerHaloColor = haloColor.clone().multiplyScalar(0.8);
        const ringSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: ringTexture,
            color: darkerHaloColor,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
          }),
        );
        ringSprite.scale.set(
          size * 3.5 * sizeVariance,
          size * 3.5 * sizeVariance,
          1,
        );
        planetMesh.add(ringSprite);
        planetMesh.userData.ringSprite = ringSprite;
        planetMesh.userData.ringTargetOpacity = 0;

        // Layer 3: Pulsing core glow (smallest, brightest)
        const coreCanvas = document.createElement("canvas");
        coreCanvas.width = 64;
        coreCanvas.height = 64;
        const coreCtx = coreCanvas.getContext("2d");
        if (coreCtx) {
          const gradient = coreCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
          gradient.addColorStop(0, "rgba(200, 230, 255, 0.8)");
          gradient.addColorStop(0.4, "rgba(100, 180, 255, 0.6)");
          gradient.addColorStop(0.8, "rgba(50, 120, 255, 0.2)");
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          coreCtx.fillStyle = gradient;
          coreCtx.fillRect(0, 0, 64, 64);
        }
        const coreTexture = new THREE.CanvasTexture(coreCanvas);
        const brighterHaloColor = haloColor.clone().multiplyScalar(1.2);
        const coreSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: coreTexture,
            color: brighterHaloColor,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
          }),
        );
        coreSprite.scale.set(
          size * 2.5 * sizeVariance,
          size * 2.5 * sizeVariance,
          1,
        );
        planetMesh.add(coreSprite);
        planetMesh.userData.coreSprite = coreSprite;
        planetMesh.userData.coreTargetOpacity = 0;
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
            hasHaloLayers: !!planetMesh.userData.auroraSprite,
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
      180,
      15,
      0xff5533,
      scene,
      0.002,
      1,
      "/textures/mars.jpg",
    );

    const skillsPlanet = createPlanet(
      "Skills",
      280,
      20,
      0x3388ff,
      scene,
      0.0015,
      2,
      "/textures/earth.jpg",
    );

    const projectsPlanet = createPlanet(
      "Projects",
      380,
      18,
      0x9933ff,
      scene,
      0.001,
      3,
      "/textures/jupiter.jpg",
    );
    createPlanet(
      "Scrolling Resume",
      40,
      5,
      0xcc99ff,
      projectsPlanet,
      0.03,
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
          textureUrl = "/textures/custom-planet-textures/texture2.jpg";
        }

        const moon = createPlanet(
          job.company,
          40 + i * 10,
          5,
          0xffaadd,
          expPlanet,
          0.02 + Math.random() * 0.01,
          undefined,
          textureUrl,
        );
        moon.rotation.x = Math.PI / 2;
      });

    Object.keys(resumeData.skills).forEach((cat, i) => {
      createPlanet(
        cat,
        50 + i * 8,
        6,
        0xaaddff,
        skillsPlanet,
        0.015 + Math.random() * 0.01,
      );
    });

    // Log final clickable planets array
    console.log(
      `🌍 Total clickable planets registered: ${clickablePlanets.length}`,
      clickablePlanets.map((p) => ({
        name: p.userData.planetName,
        sectionIndex: p.userData.sectionIndex,
        hasHaloLayers: !!p.userData.auroraSprite,
        hasEmissive: !!p.userData.hoverEmissive,
      })),
    );

    // Starfield
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 5000;
    const posArray = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 3000;
    }

    starsGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(posArray, 3),
    );
    const starsMaterial = new THREE.PointsMaterial({
      size: 2,
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
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
        // Set target opacities to 0 for smooth fade out
        if (hoveredObject.userData.auroraSprite) {
          hoveredObject.userData.auroraTargetOpacity = 0;
        }
        if (hoveredObject.userData.ringSprite) {
          hoveredObject.userData.ringTargetOpacity = 0;
        }
        if (hoveredObject.userData.coreSprite) {
          hoveredObject.userData.coreTargetOpacity = 0;
        }
        console.log(
          `👋 Unhovered: "${hoveredObject.userData.planetName}" - fading out halo layers`,
        );
        document.body.style.cursor = "default";
        hoveredObject = null;
      }

      // Apply new hover
      if (intersects.length > 0) {
        console.log(
          `🎯 Raycast hit ${intersects.length} objects:`,
          intersects.map((i) => ({
            name: i.object.userData.planetName,
            sectionIndex: i.object.userData.sectionIndex,
            distance: i.distance,
            hasHaloLayers: !!i.object.userData.auroraSprite,
          })),
        );

        const hit = intersects.find(
          (hit) => hit.object.userData.sectionIndex !== undefined,
        );

        if (hit && hit.object.userData.sectionIndex !== undefined) {
          hoveredObject = hit.object;
          console.log(
            `✨ Hovering: "${hoveredObject.userData.planetName}" (section ${hoveredObject.userData.sectionIndex})`,
          );

          // Start the flash effect on first hover
          if (hoveredObject.userData.hoverStartTime === 0) {
            hoveredObject.userData.hoverStartTime = Date.now();
            console.log(`  → Started flash effect`);
          }

          // Show all halo layers with different target opacities for smooth fade in
          if (hoveredObject.userData.auroraSprite) {
            hoveredObject.userData.auroraTargetOpacity = 0.7;
            console.log(`  → 🌟 Fading in aurora layer`);
          }
          if (hoveredObject.userData.ringSprite) {
            hoveredObject.userData.ringTargetOpacity = 0.85;
            console.log(`  → 🌟 Fading in ring layer`);
          }
          if (hoveredObject.userData.coreSprite) {
            hoveredObject.userData.coreTargetOpacity = 0.9;
            console.log(`  → 🌟 Fading in core glow layer`);
          }

          if (!hoveredObject.userData.auroraSprite) {
            console.warn(
              `  ⚠️ No halo layers found for "${hoveredObject.userData.planetName}"!`,
            );
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
          onNavigate(hit.object.userData.sectionIndex);
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("click", onClick);

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
          : 1;

      // Only animate if speed is not zero
      if (speedMultiplier !== 0) {
        items.forEach((item) => {
          item.angle += item.orbitSpeed * speedMultiplier;
          item.mesh.position.x = Math.cos(item.angle) * item.distance;
          item.mesh.position.z = Math.sin(item.angle) * item.distance;

          // Self rotation
          item.mesh.rotation.y += 0.01 * speedMultiplier;

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

          // Animate halo layers ALWAYS (even when hidden) for seamless living effect
          const time = Date.now() * 0.001; // Time in seconds
          const planetOffset = item.angle * 10; // Unique offset per planet

          if (item.mesh.userData.auroraSprite) {
            const auroraSprite = item.mesh.userData.auroraSprite;
            const material = auroraSprite.material as THREE.SpriteMaterial;
            const targetOpacity = item.mesh.userData.auroraTargetOpacity || 0;
            const haloSpeed = item.mesh.userData.haloSpeedVariance || 1;
            const haloSize = item.mesh.userData.haloSizeVariance || 1;

            // Slow wavy rotation with slight variation - using random speed
            material.rotation +=
              (0.003 * haloSpeed +
                Math.sin(time * 0.5 + planetOffset) * 0.002) *
              speedMultiplier;

            // Living breathing scale effect
            const breathe = 1.0 + Math.sin(time * 0.8 + planetOffset) * 0.12;
            const baseScale = item.mesh.geometry.parameters.radius * 5;
            auroraSprite.scale.set(baseScale * breathe, baseScale * breathe, 1);

            // Smooth fade to target with flowing opacity variation
            const currentBase = material.opacity;
            const newBase = currentBase + (targetOpacity - currentBase) * 0.1; // Smooth lerp
            if (newBase > 0.01) {
              const opacityFlow = Math.sin(time * 1.2 + planetOffset) * 0.15;
              material.opacity = Math.max(0, newBase + opacityFlow);
            } else {
              material.opacity = 0;
            }
          }

          if (item.mesh.userData.ringSprite) {
            const ringSprite = item.mesh.userData.ringSprite;
            const material = ringSprite.material as THREE.SpriteMaterial;
            const targetOpacity = item.mesh.userData.ringTargetOpacity || 0;
            const haloSpeed = item.mesh.userData.haloSpeedVariance || 1;
            const haloSize = item.mesh.userData.haloSizeVariance || 1;

            // Counter-rotation with variation - using random speed
            material.rotation -=
              (0.006 * haloSpeed +
                Math.cos(time * 0.7 + planetOffset) * 0.003) *
              speedMultiplier;

            // Pulsing scale with random size
            const pulse = 1.0 + Math.cos(time * 1.5 + planetOffset) * 0.08;
            const baseScale =
              item.mesh.geometry.parameters.radius * 3.5 * haloSize;
            ringSprite.scale.set(baseScale * pulse, baseScale * pulse, 1);

            // Smooth fade to target with shimmer effect
            const currentBase = material.opacity;
            const newBase = currentBase + (targetOpacity - currentBase) * 0.12; // Smooth lerp
            if (newBase > 0.01) {
              const shimmer = Math.cos(time * 2 + planetOffset) * 0.15;
              material.opacity = Math.max(0, newBase + shimmer);
            } else {
              material.opacity = 0;
            }
          }

          if (item.mesh.userData.coreSprite) {
            const coreSprite = item.mesh.userData.coreSprite;
            const material = coreSprite.material as THREE.SpriteMaterial;
            const targetOpacity = item.mesh.userData.coreTargetOpacity || 0;
            const haloSpeed = item.mesh.userData.haloSpeedVariance || 1;
            const haloSize = item.mesh.userData.haloSizeVariance || 1;

            // Faster pulsing with double frequency - using random speed
            const pulse1 = Math.sin(time * 3 * haloSpeed + planetOffset) * 0.1;
            const pulse2 =
              Math.sin(time * 5 * haloSpeed + planetOffset * 0.5) * 0.05;
            const combinedPulse = 1.0 + pulse1 + pulse2;
            const baseScale =
              item.mesh.geometry.parameters.radius * 2.5 * haloSize;
            coreSprite.scale.set(
              baseScale * combinedPulse,
              baseScale * combinedPulse,
              1,
            );

            // Smooth fade to target with rapid pulsing
            const currentBase = material.opacity;
            const newBase = currentBase + (targetOpacity - currentBase) * 0.15; // Fastest lerp
            if (newBase > 0.01) {
              const heartbeat =
                Math.sin(time * 4 * haloSpeed + planetOffset) * 0.15;
              material.opacity = Math.max(0, newBase + heartbeat);

              // Subtle brightness shift for living effect
              const brightnessShift =
                0.95 + Math.sin(time * 2.5 + planetOffset) * 0.1;
              const baseColor =
                item.mesh.userData.haloColor || new THREE.Color(0xaaddff);
              material.color.copy(
                baseColor.clone().multiplyScalar(brightnessShift * 1.2),
              );
            } else {
              material.opacity = 0;
            }
          }
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
  );
}
