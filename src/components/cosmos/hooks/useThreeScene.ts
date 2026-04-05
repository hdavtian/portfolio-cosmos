import { useCallback } from "react";
import * as THREE from "three";
import CameraControls from "camera-controls";
import {
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  CAMERA_INITIAL_POS,
  CONTROLS_MIN_DIST,
  CONTROLS_MAX_DIST,
  ZOOM_EXIT_THRESHOLD,
} from "../scaleConfig";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { dlog, dwarn, dinfo, dtable } from "../../../lib/debugLog";

// Install camera-controls with THREE subset (required once before use)
CameraControls.install({ THREE });
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import type { MutableRefObject, RefObject } from "react";
import type { SceneRef } from "../ResumeSpace3D.types";

let globalRenderer: THREE.WebGLRenderer | null = null;
let globalCleanup: (() => void) | null = null;

export const useThreeScene = (params: {
  mountRef: RefObject<HTMLDivElement | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<SceneRef>;
  optionsRef: MutableRefObject<any>;
  controlsDraggingRef: MutableRefObject<boolean>;
  focusedMoonRef: MutableRefObject<THREE.Mesh | null>;
  isDraggingRef: MutableRefObject<boolean>;
  focusedMoonCameraDistanceRef: MutableRefObject<number | null>;
  exitFocusRequestRef: MutableRefObject<boolean>;
  zoomExitThresholdRef: MutableRefObject<number>;
}) => {
  const {
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
  } = params;

  const initializeScene = useCallback(() => {
    if (!mountRef.current) return null;

    if (globalRenderer) {
      try {
        globalRenderer.dispose();
        globalRenderer.forceContextLoss();
        if (globalRenderer.domElement.parentElement) {
          globalRenderer.domElement.parentElement.removeChild(
            globalRenderer.domElement,
          );
        }
      } catch (e) {}
      globalRenderer = null;
    }

    if (globalCleanup) {
      globalCleanup();
      globalCleanup = null;
    }

    const container = mountRef.current;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      container.clientWidth / container.clientHeight,
      CAMERA_NEAR,
      CAMERA_FAR,
    );
    camera.position.set(CAMERA_INITIAL_POS.x, CAMERA_INITIAL_POS.y, CAMERA_INITIAL_POS.z);
    // Look toward the final intro target (Experience planet area)
    camera.lookAt(14946.7, 244.7, -1045.2);

    const renderer =
      globalRenderer ||
      new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.position = "absolute";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    globalRenderer = renderer;

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

    if (optionsRef.current.spaceShowLabels === false) {
      labelRenderer.domElement.style.display = "none";
    }

    const controls = new CameraControls(camera, renderer.domElement);
    sceneRef.current.controls = controls;

    // Smooth damping — camera-controls uses smoothTime (seconds to reach target)
    controls.smoothTime = 0.25;
    controls.draggingSmoothTime = 0.12;
    controls.minDistance = CONTROLS_MIN_DIST;
    controls.maxDistance = CONTROLS_MAX_DIST;

    controls.addEventListener("controlstart", () => {
      controlsDraggingRef.current = true;
    });
    controls.addEventListener("update", () => {
      try {
        if (focusedMoonRef.current && !isDraggingRef.current) {
          const moonWorld = new THREE.Vector3();
          focusedMoonRef.current.getWorldPosition(moonWorld);
          const camPos = camera.position.clone();
          const currentDist = camPos.distanceTo(moonWorld);

          const base = focusedMoonCameraDistanceRef.current ?? currentDist;
          const diff = Math.abs(currentDist - base);
          const threshold = zoomExitThresholdRef.current || ZOOM_EXIT_THRESHOLD;
          if (diff > threshold) {
            exitFocusRequestRef.current = true;
          }
        }
      } catch (e) {
        // ignore
      }
    });

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Subtle depth-of-field pass for the hallway sequence.
    // Keep disabled by default; render loop enables it only in showcase mode.
    const bokehPass = new BokehPass(scene, camera, {
      focus: 54,
      aperture: 0.0001,
      maxblur: 0.0045,
    });
    bokehPass.enabled = false;
    composer.addPass(bokehPass);
    sceneRef.current.bokehPass = bokehPass;

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      Math.min((optionsRef.current.spaceSunIntensity || 2.5) * 0.4, 3),
      0.6,
      0.92,
    );
    composer.addPass(bloomPass);
    sceneRef.current.bloomPass = bloomPass;

    // Debug helper: inspect scene lights from browser console via window.debugLights()
    (window as any).debugLights = () => {
      const lights: any[] = [];
      scene.traverse((o: any) => {
        if (o.isLight) {
          const wp = new THREE.Vector3();
          o.getWorldPosition(wp);
          lights.push({
            type: o.type,
            intensity: o.intensity,
            distance: o.distance || "infinite",
            decay: o.decay,
            color: "#" + o.color?.getHexString(),
            parent: o.parent?.name || o.parent?.type || "root",
            worldPos: wp.toArray().map((n: number) => +n.toFixed(1)),
          });
        }
      });
      dtable(lights);
      dlog("Bloom threshold:", bloomPass.threshold, "strength:", bloomPass.strength);
      dlog("Renderer toneMapping:", renderer.toneMapping, "(0=None, 1=Linear, 4=ACES)");
      return lights;
    };

    // Debug: inspect ship materials, lights, sun state, and emissive properties.
    // Call from console while in cockpit/cabin to diagnose brightness issues.
    (window as any).debugShip = () => {
      dlog("============================================");
      dlog("=== COCKPIT / CABIN LIGHTING DEBUG ===");
      dlog("============================================");

      // --- Sun light state ---
      // The sun PointLight sits at world origin (0,0,0), parented directly to scene.
      let sunLight: any = null;
      scene.traverse((o: any) => {
        if (o.isPointLight && o.parent === scene) {
          const wp = new THREE.Vector3();
          o.getWorldPosition(wp);
          if (wp.length() < 1) sunLight = o; // at origin = sun
        }
      });
      if (sunLight) {
        dlog("--- SUN LIGHT ---");
        dlog("  intensity:", sunLight.intensity);
        dlog("  distance:", sunLight.distance);
        dlog("  decay:", sunLight.decay);
        const wp = new THREE.Vector3();
        sunLight.getWorldPosition(wp);
        dlog("  worldPos:", wp.toArray().map((n: number) => +n.toFixed(0)));
      } else {
        dlog("Sun light: NOT FOUND (scene.sunLight may not be set)");
      }

      // --- Bloom ---
      dlog("--- BLOOM ---");
      dlog("  threshold:", bloomPass.threshold, "strength:", bloomPass.strength, "radius:", bloomPass.radius);
      dlog("  toneMapping:", renderer.toneMapping, "(0=None,1=Linear,4=ACES)", "exposure:", renderer.toneMappingExposure);

      // --- Ship ---
      let shipGroup: THREE.Object3D | null = null;
      scene.traverse((o: any) => {
        if (o.userData?.cockpitCameraLocal) shipGroup = o;
      });
      if (!shipGroup) { dlog("Ship not found in scene"); return; }
      dlog("--- SHIP ---");
      dlog("  scale:", (shipGroup as any).scale.x);
      const sp = (shipGroup as any).position;
      dlog("  position:", [sp.x, sp.y, sp.z].map((n: number) => +n.toFixed(1)));

      // --- Camera ---
      dlog("--- CAMERA ---");
      const cam = camera;
      dlog("  position:", cam.position.toArray().map((n: number) => +n.toFixed(1)));
      const distToShip = cam.position.distanceTo(sp);
      dlog("  distToShip:", +distToShip.toFixed(2));
      if (sunLight) {
        const sunWp = new THREE.Vector3();
        sunLight.getWorldPosition(sunWp);
        dlog("  distToSun:", +cam.position.distanceTo(sunWp).toFixed(0));
      }

      // --- All lights parented to ship ---
      const shipLights: any[] = [];
      (shipGroup as THREE.Object3D).traverse((child: any) => {
        if (child.isLight) {
          shipLights.push({
            type: child.type,
            intensity: child.intensity,
            distance: child.distance,
            color: "#" + child.color?.getHexString(),
            name: child.name || child.parent?.name || "unnamed",
            localPos: child.position.toArray().map((n: number) => +n.toFixed(2)),
          });
        }
      });
      dlog("--- SHIP LIGHTS (" + shipLights.length + ") ---");
      dtable(shipLights);

      // --- Emissive materials on ship ---
      const mats: any[] = [];
      (shipGroup as THREE.Object3D).traverse((child: any) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat: any) => {
            const hasEmissive = mat.emissive && mat.emissive.getHex() !== 0x000000;
            const hasMap = !!mat.emissiveMap;
            const hasIntensity = (mat.emissiveIntensity ?? 0) > 0;
            if (hasEmissive || hasMap || hasIntensity) {
              mats.push({
                mesh: child.name || "unnamed",
                matType: mat.type,
                emissive: mat.emissive ? "#" + mat.emissive.getHexString() : "none",
                emissiveInt: mat.emissiveIntensity ?? 0,
                hasEmissiveMap: hasMap,
                metalness: mat.metalness ?? "N/A",
                roughness: mat.roughness ?? "N/A",
              });
            }
          });
        }
      });
      dlog("--- EMISSIVE MATERIALS (" + mats.length + ") ---");
      if (mats.length > 0) dtable(mats);
      else dlog("  (none found)");

      // --- All scene lights that AREN'T part of the ship ---
      const sceneLights: any[] = [];
      scene.traverse((o: any) => {
        if (o.isLight && o.intensity > 0) {
          // Check if it's inside the ship group
          let isShipChild = false;
          let p = o.parent;
          while (p) {
            if (p === shipGroup) { isShipChild = true; break; }
            p = p.parent;
          }
          if (!isShipChild) {
            const wp = new THREE.Vector3();
            o.getWorldPosition(wp);
            sceneLights.push({
              type: o.type,
              intensity: o.intensity,
              distance: o.distance,
              decay: o.decay,
              worldPos: wp.toArray().map((n: number) => +n.toFixed(0)),
              name: o.name || o.parent?.name || "scene",
            });
          }
        }
      });
      dlog("--- SCENE LIGHTS (non-ship, active) (" + sceneLights.length + ") ---");
      if (sceneLights.length > 0) dtable(sceneLights);

      dlog("============================================");
      return { shipLights, emissives: mats, sceneLights, sunIntensity: sunLight?.intensity };
    };

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

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      // Keep canvas alive while the browser restores context.
      // Without preventDefault many drivers leave a white frame.
      // eslint-disable-next-line no-console
      dwarn("[cosmos] WebGL context lost");
    };
    const handleContextRestored = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(w, h);
      composer.setSize(w, h);
      labelRenderer.setSize(w, h);
      // eslint-disable-next-line no-console
      dinfo("[cosmos] WebGL context restored");
    };
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost as EventListener, false);
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      handleContextRestored as EventListener,
      false,
    );

    return {
      scene,
      camera,
      renderer,
      controls,
      composer,
      labelRenderer,
      container,
      preventDefaultTouch,
      handleContextLost,
      handleContextRestored,
    };
  }, [
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
  ]);

  const setGlobalCleanup = useCallback((cleanup: () => void) => {
    globalCleanup = cleanup;
  }, []);

  return { initializeScene, setGlobalCleanup };
};
