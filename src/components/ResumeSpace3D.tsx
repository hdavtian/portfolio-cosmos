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
            globalRenderer.domElement
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
      10000
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
      0.5 // Lower threshold so more things glow
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
    // Increase ambient light so MeshLambertMaterial planets are visible
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const sunLight = new THREE.PointLight(
      0xffffff,
      optionsRef.current.spaceSunIntensity || 2.5,
      8000 // Increased distance so light reaches all planets
    );
    sunLight.position.set(0, 0, 0);
    // Disable shadows to reduce shader complexity
    sunLight.castShadow = false;
    scene.add(sunLight);
    sceneRef.current.sunLight = sunLight;

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
    const initialBrightness =
      0.8 + (optionsRef.current.spaceSunIntensity || 2.5) * 0.15;
    const sunMaterial = new THREE.MeshBasicMaterial({
      map: sunTexture,
      color: new THREE.Color(
        initialBrightness,
        initialBrightness * 0.95,
        initialBrightness * 0.7
      ),
    });
    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sunMesh);
    sceneRef.current.sunMaterial = sunMaterial;

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
        { passive: false }
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
      resumeData.personal.title
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
      textureUrl?: string
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
        0
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

      // Planet Mesh - Use simpler material for GPU compatibility
      const planetGeometry = new THREE.SphereGeometry(size, 32, 32);
      const planetMaterial = new THREE.MeshLambertMaterial({
        color: textureUrl ? 0xffffff : color,
        map: textureUrl ? textureLoader.load(textureUrl) : null,
        emissive: 0x000000, // Will change on hover
      });
      const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
      // Store original color for hover effect
      planetMesh.userData.originalEmissive = new THREE.Color(0x000000);
      planetMesh.userData.hoverEmissive = new THREE.Color(0x4444ff);
      // Disable shadows for GPU compatibility
      planetMesh.castShadow = false;
      planetMesh.receiveShadow = false;

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

      // Interaction data
      planetMesh.userData = { isPlanet: true, sectionIndex };

      // Add to clickable array if it has a section
      if (sectionIndex !== undefined) {
        clickablePlanets.push(planetMesh);
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
      "/textures/mars.jpg"
    );

    const skillsPlanet = createPlanet(
      "Skills",
      280,
      20,
      0x3388ff,
      scene,
      0.0015,
      2,
      "/textures/earth.jpg"
    );

    const projectsPlanet = createPlanet(
      "Projects",
      380,
      18,
      0x9933ff,
      scene,
      0.001,
      3,
      "/textures/jupiter.jpg"
    );
    createPlanet(
      "Scrolling Resume",
      40,
      5,
      0xcc99ff,
      projectsPlanet,
      0.03,
      undefined,
      "/textures/neptune.jpg"
    );

    // 4. MOONS
    Object.values(resumeData.experience)
      .flat()
      .forEach((job, i) => {
        const moon = createPlanet(
          job.company,
          40 + i * 10,
          5,
          0xffaadd,
          expPlanet,
          0.02 + Math.random() * 0.01
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
        0.015 + Math.random() * 0.01
      );
    });

    // Starfield
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 5000;
    const posArray = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 3000;
    }

    starsGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(posArray, 3)
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

      // Reset previous hover
      if (hoveredObject && hoveredObject.userData.originalEmissive) {
        (
          (hoveredObject as THREE.Mesh).material as THREE.MeshLambertMaterial
        ).emissive.copy(hoveredObject.userData.originalEmissive);
        document.body.style.cursor = "default";
        hoveredObject = null;
      }

      // Apply new hover
      if (intersects.length > 0) {
        const hit = intersects.find(
          (hit) => hit.object.userData.sectionIndex !== undefined
        );
        if (hit && hit.object.userData.sectionIndex !== undefined) {
          hoveredObject = hit.object;
          if (hoveredObject.userData.hoverEmissive) {
            (
              (hoveredObject as THREE.Mesh)
                .material as THREE.MeshLambertMaterial
            ).emissive.copy(hoveredObject.userData.hoverEmissive);
            document.body.style.cursor = "pointer";
          }
        }
      }
    };

    const onClick = () => {
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(clickablePlanets, false);

      if (intersects.length > 0) {
        // Find first object with userData.sectionIndex
        const hit = intersects.find(
          (hit) => hit.object.userData.sectionIndex !== undefined
        );
        if (hit && hit.object.userData.sectionIndex !== undefined) {
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
        mountRef.current.clientHeight
      );
      composer.setSize(
        mountRef.current.clientWidth,
        mountRef.current.clientHeight
      );
      labelRenderer.setSize(
        mountRef.current.clientWidth,
        mountRef.current.clientHeight
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
        preventDefaultTouch
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
