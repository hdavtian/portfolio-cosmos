import type React from "react";
import { useCallback, useRef } from "react";
import * as THREE from "three";
import type CameraControls from "camera-controls";
import { physicsWorld } from "../PhysicsWorld";
import { PhysicsTravelAnchor } from "../PhysicsTravelAnchor";
import type { OrbitAnchor, OrbitItem } from "../ResumeSpace3D.orbital";
import type { SceneRef } from "../ResumeSpace3D.types";
import {
  FOLLOW_DISTANCE,
  FOLLOW_HEIGHT,
  INTRO_ORBIT_RADIUS,
  ENGINE_LIGHT_BASE_DIST,
  ENGINE_LIGHT_RANGE,
  NEAR_EXPLORE,
  CONTROLS_MAX_DIST,
  NEAR_CABIN,
  INTERIOR_MIN_DIST,
  INTERIOR_MAX_DIST,
} from "../scaleConfig";
import { computeFalconFollowCameraPose } from "../falconFollowCameraPose";

export const useRenderLoop = () => {
  const animationFrameRef = useRef<number | null>(null);
  const travelAnchorRef = useRef<PhysicsTravelAnchor | null>(null);
  const COMET_MIN_INTERVAL_MS = 8000;
  const COMET_MAX_INTERVAL_MS = 14000;
  const COMET_DURATION_MIN_MS = 1800;
  const COMET_DURATION_MAX_MS = 2600;
  const COMET_TRAIL_LENGTH_MIN = 38;
  const COMET_TRAIL_LENGTH_MAX = 64;
  const COMET_DURATION_FAR_MAX_MS = 4500;
  const COMET_TAIL_POINT_COUNT = 96;

  const startRenderLoop = useCallback(
    (params: {
      exitFocusRequestRef: React.MutableRefObject<boolean>;
      exitMoonView: () => void;
      spaceshipRef: React.MutableRefObject<THREE.Group | null>;
      shipCinematicRef: React.MutableRefObject<{
        active: boolean;
        phase: "orbit" | "approach" | "hover";
        startTime: number;
        duration: number;
        startPos: THREE.Vector3;
        controlPos: THREE.Vector3;
        controlPos2?: THREE.Vector3;
        endPos: THREE.Vector3;
        flybyPoint?: THREE.Vector3;
        startQuat: THREE.Quaternion;
        endQuat: THREE.Quaternion;
        approachLookAt?: THREE.Vector3;
        spinStartOffset?: number;
        spinDuration?: number;
        spinTurns?: number;
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
        settleTargetPos?: THREE.Vector3;
        settleDuration?: number;
        cameraRetreatStartProgress?: number;
        cameraRetreatStartPos?: THREE.Vector3;
        cameraRetreatStartTarget?: THREE.Vector3;
      } | null>;
      shipStagingModeRef: React.MutableRefObject<boolean>;
      shipStagingKeysRef: React.MutableRefObject<Record<string, boolean>>;
      manualFlightModeRef: React.MutableRefObject<boolean>;
      introCameraPrealignedRef: React.MutableRefObject<boolean>;
      manualFlightRef: React.MutableRefObject<any>;
      currentNavigationTargetRef?: React.MutableRefObject<string | null>;
      keyboardStateRef: React.MutableRefObject<Record<string, boolean>>;
      controlSensitivityRef: React.MutableRefObject<number>;
      invertControlsRef: React.MutableRefObject<boolean>;
      followingSpaceshipRef: React.MutableRefObject<boolean>;
      sceneRef: React.MutableRefObject<SceneRef>;
      focusedMoonRef: React.MutableRefObject<THREE.Mesh | null>;
      spaceshipEngineLightRef: React.MutableRefObject<THREE.PointLight | null>;
      spaceshipCameraOffsetRef: React.MutableRefObject<THREE.Vector3>;
      shipViewModeRef: React.MutableRefObject<
        "exterior" | "interior" | "cockpit"
      >;
      insideShipRef: React.MutableRefObject<boolean>;
      debugSnapToShipRef: React.MutableRefObject<boolean>;
      shipExploreModeRef: React.MutableRefObject<boolean>;
      shipExploreKeysRef: React.MutableRefObject<Record<string, boolean>>;
      shipExploreCoordsRef: React.MutableRefObject<{
        local: [number, number, number];
        world: [number, number, number];
      }>;
      navTurnActiveRef: React.MutableRefObject<boolean>;
      projectShowcaseActiveRef: React.MutableRefObject<boolean>;
      projectShowcaseTrackRef?: React.MutableRefObject<{
        axis: "x" | "z" | "y";
      } | null>;
      settledViewTargetRef: React.MutableRefObject<THREE.Vector3 | null>;
      optionsRef: React.MutableRefObject<{
        spaceFollowDistance?: number;
        spaceFollowHeight?: number;
        spaceCameraSmoothTime?: number;
        spaceNavCameraBehind?: number;
        spaceNavCameraHeight?: number;
      }>;
      hologramDroneRef: React.MutableRefObject<{
        update: (delta: number, camera: THREE.Camera) => void;
        isActive: () => boolean;
      } | null>;
      updateMoonOrbit: (dt: number, ship: THREE.Object3D) => {
        cameraPosition: THREE.Vector3;
        cameraTarget: THREE.Vector3;
        lerpFactor: number;
        cameraUp?: THREE.Vector3;
        userCameraFree?: boolean;
      } | null;
      isMoonOrbiting: () => boolean;
      updateAutopilotNavigation: () => void;
      updateOrbitSystem: (params: {
        items: OrbitItem[];
        orbitAnchors: OrbitAnchor[];
        camera: THREE.Camera;
        options: any;
      }) => void;
      renderer: THREE.WebGLRenderer;
      items: OrbitItem[];
      orbitAnchors: OrbitAnchor[];
      camera: THREE.Camera;
      controls: CameraControls;
      composer: { render: () => void };
      labelRenderer: {
        render: (scene: THREE.Scene, camera: THREE.Camera) => void;
      };
      scene: THREE.Scene;
      sunMesh: THREE.Object3D;
      vlog: (message: string) => void;
      gpuWarmupInProgressRef?: React.MutableRefObject<boolean>;
      [key: string]: unknown;
    }) => {
      const {
        exitFocusRequestRef,
        exitMoonView,
        spaceshipRef,
        shipCinematicRef,
        shipStagingModeRef,
        shipStagingKeysRef,
        manualFlightModeRef,
        introCameraPrealignedRef,
        manualFlightRef,
        currentNavigationTargetRef,
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
        settledViewTargetRef,
        optionsRef,
        hologramDroneRef,
        navTurnActiveRef,
        projectShowcaseActiveRef,
        projectShowcaseTrackRef,
        gpuWarmupInProgressRef,
        updateMoonOrbit,
        isMoonOrbiting,
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
      } = params;

      if (!travelAnchorRef.current) {
        travelAnchorRef.current = new PhysicsTravelAnchor();
      }

      void physicsWorld.init();
      let lastFrameTime = performance.now();
      // Default cockpit/cabin positions — from ship-labeling system.
      // Cockpit INTERIOR — offset inward from the exterior surface label.
      // Exterior surface was (-6.2, 3.6, 7.1). Interior: ~0.8 inward (+X),
      // ~0.5 lower (seated eye), ~1.1 behind windshield.
      // NOTE: these are multiplied by ship.scale (0.5) in the transform below.
      const cockpitLocalPos = new THREE.Vector3(-6.05, 3.16, 5.36);
      const cockpitTargetLocal = new THREE.Vector3(-6.05, 3.16, 11.36);
      const cabinLocalPos = new THREE.Vector3(0, -0.64, -4.49);
      const cabinTargetLocal = new THREE.Vector3(0, -0.64, 1.51);
      let cockpitPosResolved = false;
      const shipWorldPos = new THREE.Vector3();
      const shipWorldQuat = new THREE.Quaternion();
      const desiredCameraPos = new THREE.Vector3();
      const desiredTargetPos = new THREE.Vector3();
      let wasInsideShip = false; // track enter/exit transitions
      let wasInsideShipEmissiveClamped = false;

      // Reusable temp vectors to avoid per-frame allocations
      const _tmpOffset = new THREE.Vector3();
      const _tmpScaled = new THREE.Vector3();
      const _tmpDesired = new THREE.Vector3();
      const _tmpHoverFloat = new THREE.Vector3();
      const _tmpLookDir = new THREE.Vector3();
      const _tmpControlTarget = new THREE.Vector3();
      const _tmpCamLocal = new THREE.Vector3();
      const _tmpCamClamped = new THREE.Vector3();
      const _orbitCamTarget = new THREE.Vector3();
      const _orbitCurUp = new THREE.Vector3(0, 1, 0);
      const _engineTint = new THREE.Color(0x5aa7ff);
      const _lightspeedColor = new THREE.Color();
      let _orbitUpActive = false;
      let interiorLightSnapshot: {
        sun?: number;
        fill?: number;
        ambient?: number;
        exposure: number;
      } | null = null;
      const LIGHTSPEED_STREAK_COUNT = 140;
      const LIGHTSPEED_THICK_STREAK_COUNT = 42;
      const LIGHTSPEED_THICK_COPIES = 5;
      let lightspeedStreakGroup: THREE.LineSegments | null = null;
      let lightspeedStreakPositions: Float32Array | null = null;
      let lightspeedStreakMeta: Float32Array | null = null; // x,y,z,len,speed
      let lightspeedStreakColors: Float32Array | null = null;
      let lightspeedThickGroup: THREE.LineSegments | null = null;
      let lightspeedThickPositions: Float32Array | null = null;
      let lightspeedThickMeta: Float32Array | null = null; // x,y,z,len,speed
      let lightspeedThickColors: Float32Array | null = null;
      let lightspeedVisualIntensity = 0;
      let lightspeedEnterAt = 0;
      let lightspeedWasActive = false;
      let lightspeedPitchWasActive = false;
      let lightspeedRigPitchRad = 0; // camera-rig pitch bias (camera-only)
      let lightspeedPitchKickAt = 0;
      let lightspeedPitchPendingDir: -1 | 0 | 1 = 0;
      let cometGroup: THREE.Group | null = null;
      let cometHeadSprite: THREE.Sprite | null = null;
      let cometCoreSprite: THREE.Sprite | null = null;
      let cometHeadMaterial: THREE.SpriteMaterial | null = null;
      let cometCoreMaterial: THREE.SpriteMaterial | null = null;
      let cometTailGeometry: THREE.BufferGeometry | null = null;
      let cometTailCore: THREE.Points | null = null;
      let cometTailGlow: THREE.Points | null = null;
      let cometTailCoreMaterial: THREE.PointsMaterial | null = null;
      let cometTailGlowMaterial: THREE.PointsMaterial | null = null;
      let cometTailMeta: Float32Array | null = null; // lag, side, depth, phase, speed, drift
      let cometActive = false;
      let cometStartAt = 0;
      let cometDurationMs = 0;
      let cometTrailLength = 0;
      let cometTravelDistance = 0;
      let cometScale = 1;
      let cometAlphaScale = 1;
      let cometTailSpread = 1;
      let cometFadeOutStart = 0.72;
      const cometStart = new THREE.Vector3();
      const cometEnd = new THREE.Vector3();
      const cometHead = new THREE.Vector3();
      const cometTailPoint = new THREE.Vector3();
      const cometDirection = new THREE.Vector3();
      const cometSide = new THREE.Vector3();
      const cometDepth = new THREE.Vector3();
      let nextCometAt =
        performance.now() +
        THREE.MathUtils.randFloat(
          COMET_MIN_INTERVAL_MS * 0.45,
          COMET_MAX_INTERVAL_MS * 0.65,
        );
      const baseCameraFov =
        camera instanceof THREE.PerspectiveCamera ? camera.fov : null;

      const resetLightspeedStreak = (i: number) => {
        if (!lightspeedStreakMeta || !lightspeedStreakPositions) return;
        const mi = i * 5;
        const pi = i * 6;
        const x = (Math.random() - 0.5) * 160;
        const y = (Math.random() - 0.5) * 80;
        const z = -(30 + Math.random() * 280);
        const len = 40 + Math.random() * 120;
        const speed = 90 + Math.random() * 130;
        lightspeedStreakMeta[mi] = x;
        lightspeedStreakMeta[mi + 1] = y;
        lightspeedStreakMeta[mi + 2] = z;
        lightspeedStreakMeta[mi + 3] = len;
        lightspeedStreakMeta[mi + 4] = speed;
        // Start point closer to camera, end point converges toward forward focus.
        lightspeedStreakPositions[pi] = x;
        lightspeedStreakPositions[pi + 1] = y;
        lightspeedStreakPositions[pi + 2] = z;
        lightspeedStreakPositions[pi + 3] = x * 0.2;
        lightspeedStreakPositions[pi + 4] = y * 0.2;
        lightspeedStreakPositions[pi + 5] = z - len;
        if (lightspeedStreakColors) {
          const ci = i * 6;
          // Some streaks intentionally fainter for depth layering.
          const tone = Math.random() < 0.34 ? 0.26 + Math.random() * 0.22 : 0.62 + Math.random() * 0.38;
          const r = 0.72 * tone;
          const g = 0.85 * tone;
          const b = 1.00 * tone;
          lightspeedStreakColors[ci] = r;
          lightspeedStreakColors[ci + 1] = g;
          lightspeedStreakColors[ci + 2] = b;
          lightspeedStreakColors[ci + 3] = r;
          lightspeedStreakColors[ci + 4] = g;
          lightspeedStreakColors[ci + 5] = b;
        }
      };

      const writeThickStreakCopies = (i: number, x: number, y: number, z: number, endZ: number) => {
        if (!lightspeedThickPositions) return;
        const base = i * LIGHTSPEED_THICK_COPIES * 6;
        // 3 close parallel lines read visually as "thicker streaks".
        const offsets: Array<[number, number]> = [
          [0, 0],
          [1.1, 0.55],
          [-1.1, -0.55],
          [2.0, 1.05],
          [-2.0, -1.05],
        ];
        for (let c = 0; c < LIGHTSPEED_THICK_COPIES; c += 1) {
          const off = offsets[c];
          const pi = base + c * 6;
          lightspeedThickPositions[pi] = x + off[0];
          lightspeedThickPositions[pi + 1] = y + off[1];
          lightspeedThickPositions[pi + 2] = z;
          lightspeedThickPositions[pi + 3] = 0;
          lightspeedThickPositions[pi + 4] = 0;
          lightspeedThickPositions[pi + 5] = endZ;
        }
      };

      const resetLightspeedThickStreak = (i: number) => {
        if (!lightspeedThickMeta) return;
        const mi = i * 5;
        const x = (Math.random() - 0.5) * 190;
        const y = (Math.random() - 0.5) * 92;
        const z = -(26 + Math.random() * 300);
        const len = 56 + Math.random() * 150;
        const speed = 92 + Math.random() * 120;
        lightspeedThickMeta[mi] = x;
        lightspeedThickMeta[mi + 1] = y;
        lightspeedThickMeta[mi + 2] = z;
        lightspeedThickMeta[mi + 3] = len;
        lightspeedThickMeta[mi + 4] = speed;
        writeThickStreakCopies(i, x, y, z, z - len);
        if (lightspeedThickColors) {
          const base = i * LIGHTSPEED_THICK_COPIES * 6;
          // Thick lines also get faint variants, but generally brighter than thin set.
          const tone = Math.random() < 0.28 ? 0.34 + Math.random() * 0.24 : 0.68 + Math.random() * 0.32;
          const r = 0.78 * tone;
          const g = 0.90 * tone;
          const b = 1.00 * tone;
          for (let c = 0; c < LIGHTSPEED_THICK_COPIES; c += 1) {
            const ci = base + c * 6;
            lightspeedThickColors[ci] = r;
            lightspeedThickColors[ci + 1] = g;
            lightspeedThickColors[ci + 2] = b;
            lightspeedThickColors[ci + 3] = r;
            lightspeedThickColors[ci + 4] = g;
            lightspeedThickColors[ci + 5] = b;
          }
        }
      };

      const ensureLightspeedStreaks = () => {
        if (lightspeedStreakGroup && lightspeedThickGroup) return;
        lightspeedStreakPositions = new Float32Array(LIGHTSPEED_STREAK_COUNT * 6);
        lightspeedStreakMeta = new Float32Array(LIGHTSPEED_STREAK_COUNT * 5);
        lightspeedStreakColors = new Float32Array(LIGHTSPEED_STREAK_COUNT * 6);
        for (let i = 0; i < LIGHTSPEED_STREAK_COUNT; i += 1) {
          resetLightspeedStreak(i);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
          "position",
          new THREE.BufferAttribute(lightspeedStreakPositions, 3),
        );
        geo.setAttribute(
          "color",
          new THREE.BufferAttribute(lightspeedStreakColors, 3),
        );
        const mat = new THREE.LineBasicMaterial({
          color: 0xbfd9ff,
          transparent: true,
          opacity: 0.45,
          vertexColors: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        });
        lightspeedStreakGroup = new THREE.LineSegments(geo, mat);
        lightspeedStreakGroup.visible = false;
        lightspeedStreakGroup.renderOrder = 999;
        scene.add(lightspeedStreakGroup);

        lightspeedThickPositions = new Float32Array(
          LIGHTSPEED_THICK_STREAK_COUNT * LIGHTSPEED_THICK_COPIES * 6,
        );
        lightspeedThickMeta = new Float32Array(LIGHTSPEED_THICK_STREAK_COUNT * 5);
        lightspeedThickColors = new Float32Array(
          LIGHTSPEED_THICK_STREAK_COUNT * LIGHTSPEED_THICK_COPIES * 6,
        );
        for (let i = 0; i < LIGHTSPEED_THICK_STREAK_COUNT; i += 1) {
          resetLightspeedThickStreak(i);
        }
        const thickGeo = new THREE.BufferGeometry();
        thickGeo.setAttribute(
          "position",
          new THREE.BufferAttribute(lightspeedThickPositions, 3),
        );
        thickGeo.setAttribute(
          "color",
          new THREE.BufferAttribute(lightspeedThickColors, 3),
        );
        const thickMat = new THREE.LineBasicMaterial({
          color: 0xe8f4ff,
          transparent: true,
          opacity: 0.30,
          vertexColors: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        });
        lightspeedThickGroup = new THREE.LineSegments(thickGeo, thickMat);
        lightspeedThickGroup.visible = false;
        lightspeedThickGroup.renderOrder = 1000;
        scene.add(lightspeedThickGroup);
      };

      const createCometHeadTexture = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 192;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Main elongated head glow (brighter near the front tip).
          ctx.save();
          ctx.translate(114, 64);
          ctx.scale(1.9, 1.0);
          const head = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
          head.addColorStop(0, "rgba(255,255,255,1)");
          head.addColorStop(0.25, "rgba(225,245,255,0.98)");
          head.addColorStop(0.6, "rgba(140,210,255,0.48)");
          head.addColorStop(1, "rgba(120,190,255,0)");
          ctx.fillStyle = head;
          ctx.beginPath();
          ctx.arc(0, 0, 34, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Subtle back-shear so the head reads like a fast streak, not a sphere.
          ctx.save();
          ctx.translate(80, 64);
          ctx.scale(2.2, 0.75);
          const shear = ctx.createRadialGradient(0, 0, 0, 0, 0, 42);
          shear.addColorStop(0, "rgba(180,225,255,0.42)");
          shear.addColorStop(1, "rgba(120,190,255,0)");
          ctx.fillStyle = shear;
          ctx.beginPath();
          ctx.arc(0, 0, 42, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
      };

      const createCometTrailTexture = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const g = ctx.createRadialGradient(48, 48, 1, 48, 48, 47);
          g.addColorStop(0, "rgba(255,255,255,1)");
          g.addColorStop(0.3, "rgba(205,236,255,0.88)");
          g.addColorStop(0.68, "rgba(124,198,255,0.24)");
          g.addColorStop(1, "rgba(100,180,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
      };

      const ensureCometVisuals = () => {
        if (cometGroup) return;
        const headTexture = createCometHeadTexture();
        const tailParticleTexture = createCometTrailTexture();

        cometGroup = new THREE.Group();
        cometGroup.visible = false;

        cometHeadMaterial = new THREE.SpriteMaterial({
          map: headTexture,
          color: 0xe7f6ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        cometHeadSprite = new THREE.Sprite(cometHeadMaterial);
        cometHeadSprite.scale.set(8.8, 8.8, 1);
        cometHeadSprite.renderOrder = 998;
        cometGroup.add(cometHeadSprite);

        cometCoreMaterial = new THREE.SpriteMaterial({
          map: headTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        cometCoreSprite = new THREE.Sprite(cometCoreMaterial);
        cometCoreSprite.scale.set(3.8, 3.8, 1);
        cometCoreSprite.renderOrder = 999;
        cometGroup.add(cometCoreSprite);

        cometTailGeometry = new THREE.BufferGeometry();
        cometTailGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            new Float32Array(COMET_TAIL_POINT_COUNT * 3),
            3,
          ),
        );
        cometTailGlowMaterial = new THREE.PointsMaterial({
          map: tailParticleTexture,
          color: 0x9fd6ff,
          size: 4.8,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
          alphaTest: 0.01,
        });
        cometTailGlow = new THREE.Points(cometTailGeometry, cometTailGlowMaterial);
        cometTailGlow.renderOrder = 995;
        cometGroup.add(cometTailGlow);

        cometTailCoreMaterial = new THREE.PointsMaterial({
          map: tailParticleTexture,
          color: 0xe9f7ff,
          size: 2.4,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
          alphaTest: 0.01,
        });
        cometTailCore = new THREE.Points(cometTailGeometry, cometTailCoreMaterial);
        cometTailCore.renderOrder = 996;
        cometGroup.add(cometTailCore);
        cometTailMeta = new Float32Array(COMET_TAIL_POINT_COUNT * 6);

        scene.add(cometGroup);
      };

      const getNextCometIntervalMs = () =>
        THREE.MathUtils.randFloat(COMET_MIN_INTERVAL_MS, COMET_MAX_INTERVAL_MS);

      const startComet = (now: number) => {
        ensureCometVisuals();
        if (
          !cometGroup ||
          !cometHeadSprite ||
          !cometCoreSprite ||
          !cometTailMeta
        ) {
          return;
        }
        cometActive = true;
        cometStartAt = now;
        cometDurationMs = THREE.MathUtils.randFloat(
          COMET_DURATION_MIN_MS,
          COMET_DURATION_MAX_MS,
        );
        cometTrailLength = THREE.MathUtils.randFloat(
          COMET_TRAIL_LENGTH_MIN,
          COMET_TRAIL_LENGTH_MAX,
        );
        cometTravelDistance = 0;
        cometScale = 1;
        cometAlphaScale = 1;
        cometTailSpread = 1;
        cometFadeOutStart = 0.72;

        // Mix near/mid/far shooting stars so not every comet is close.
        const profileRoll = Math.random();
        let startXAbs = 58;
        let startYMin = -26;
        let startYMax = 18;
        let travelXMin = 76;
        let travelXMax = 118;
        let startZMin = -165;
        let startZMax = -104;
        let travelZMin = -14;
        let travelZMax = 10;

        if (profileRoll > 0.72) {
          // Far profile: smaller/dimmer, longer travel and later fade.
          cometScale = 0.62;
          cometAlphaScale = 0.64;
          cometTailSpread = 0.65;
          cometFadeOutStart = 0.9;
          cometDurationMs = THREE.MathUtils.randFloat(
            3000,
            COMET_DURATION_FAR_MAX_MS,
          );
          startXAbs = 120;
          startYMin = -72;
          startYMax = 54;
          travelXMin = 180;
          travelXMax = 320;
          startZMin = -520;
          startZMax = -320;
          travelZMin = -160;
          travelZMax = 140;
          cometTrailLength *= 1.34;
        } else if (profileRoll > 0.36) {
          // Mid profile.
          cometScale = 0.84;
          cometAlphaScale = 0.82;
          cometTailSpread = 0.82;
          cometFadeOutStart = 0.82;
          cometDurationMs = THREE.MathUtils.randFloat(2300, 3300);
          startXAbs = 92;
          startYMin = -58;
          startYMax = 42;
          travelXMin = 130;
          travelXMax = 240;
          startZMin = -340;
          startZMax = -190;
          travelZMin = -110;
          travelZMax = 90;
          cometTrailLength *= 1.16;
        }

        const dir = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 1.8,
          (Math.random() - 0.5) * 2,
        );
        if (Math.abs(dir.x) + Math.abs(dir.y) < 0.55) {
          dir.x += Math.random() < 0.5 ? -0.5 : 0.5;
        }
        dir.normalize();
        cometDirection.copy(dir);
        const upCandidate = new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          0.7 + Math.random() * 0.6,
          (Math.random() - 0.5) * 0.6,
        ).normalize();
        cometSide.crossVectors(cometDirection, upCandidate);
        if (cometSide.lengthSq() < 1e-4) {
          cometSide.crossVectors(cometDirection, new THREE.Vector3(0, 1, 0));
        }
        cometSide.normalize();
        cometDepth.crossVectors(cometDirection, cometSide).normalize();

        const axisSideRange = THREE.MathUtils.randFloat(startXAbs * 0.35, startXAbs);
        const axisDepthRange = THREE.MathUtils.randFloat(
          Math.abs(startZMin) * 0.28,
          Math.abs(startZMax),
        );
        const offsetYRange = THREE.MathUtils.randFloat(
          Math.abs(startYMin) * 0.5,
          Math.abs(startYMax),
        );
        cometTravelDistance = THREE.MathUtils.randFloat(
          Math.max(travelXMin, Math.abs(travelZMin)),
          Math.max(travelXMax, Math.abs(travelZMax), 80),
        );
        const startOffsetSide = (Math.random() - 0.5) * axisSideRange;
        const startOffsetDepth = (Math.random() - 0.5) * axisDepthRange;
        const startOffsetY = (Math.random() - 0.5) * offsetYRange;
        const center = new THREE.Vector3()
          .addScaledVector(cometSide, startOffsetSide)
          .addScaledVector(cometDepth, startOffsetDepth)
          .addScaledVector(new THREE.Vector3(0, 1, 0), startOffsetY);

        cometStart
          .copy(center)
          .addScaledVector(cometDirection, -cometTravelDistance * 0.5);
        cometEnd
          .copy(center)
          .addScaledVector(cometDirection, cometTravelDistance * 0.5);

        for (let i = 0; i < COMET_TAIL_POINT_COUNT; i += 1) {
          const t = i / Math.max(COMET_TAIL_POINT_COUNT - 1, 1);
          const idx = i * 6;
          const lag = t * 0.86 + Math.random() * 0.06;
          cometTailMeta[idx] = lag;
          cometTailMeta[idx + 1] = (Math.random() - 0.5) * 2.8 * cometTailSpread;
          cometTailMeta[idx + 2] = (Math.random() - 0.5) * 1.8 * cometTailSpread;
          cometTailMeta[idx + 3] = Math.random() * Math.PI * 2;
          cometTailMeta[idx + 4] = 0.7 + Math.random() * 1.8;
          cometTailMeta[idx + 5] = 0.4 + Math.random() * 0.9;
        }

        cometGroup.visible = true;
        cometHeadSprite.position.copy(cometStart);
        cometCoreSprite.position.copy(cometStart);
      };

      const updateComet = (now: number, cameraRef: THREE.Camera) => {
        if (
          !cometGroup ||
          !cometHeadSprite ||
          !cometCoreSprite ||
          !cometHeadMaterial ||
          !cometCoreMaterial ||
          !cometTailGeometry ||
          !cometTailCoreMaterial ||
          !cometTailGlowMaterial ||
          !cometTailMeta
        ) {
          return;
        }
        const progress = THREE.MathUtils.clamp(
          (now - cometStartAt) / Math.max(cometDurationMs, 1),
          0,
          1,
        );
        if (progress >= 1) {
          cometActive = false;
          cometGroup.visible = false;
          cometHeadMaterial.opacity = 0;
          cometCoreMaterial.opacity = 0;
          cometTailCoreMaterial.opacity = 0;
          cometTailGlowMaterial.opacity = 0;
          nextCometAt = now + getNextCometIntervalMs();
          return;
        }

        cometGroup.position.copy(cameraRef.position);
        cometGroup.quaternion.copy(cameraRef.quaternion);

        const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
        cometHead.lerpVectors(cometStart, cometEnd, eased);
        cometDirection.copy(cometEnd).sub(cometStart).normalize();
        cometSide.set(-cometDirection.y, cometDirection.x, 0);
        if (cometSide.lengthSq() < 1e-4) {
          cometSide.set(0, 1, 0);
        }
        cometSide.normalize();
        cometDepth.crossVectors(cometDirection, cometSide).normalize();
        const cometAngle = Math.atan2(cometDirection.y, cometDirection.x);

        const fadeIn = THREE.MathUtils.smoothstep(progress, 0, 0.15);
        const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, cometFadeOutStart, 1);
        const alpha = fadeIn * fadeOut * cometAlphaScale;
        const flicker = 0.92 + Math.sin(now * 0.025) * 0.08;
        cometTailCoreMaterial.opacity = 0.82 * alpha * flicker;
        cometTailGlowMaterial.opacity = 0.34 * alpha;
        cometHeadMaterial.opacity = 0.98 * alpha;
        cometCoreMaterial.opacity = 1.0 * alpha;

        cometHeadSprite.position.copy(cometHead);
        cometCoreSprite.position.copy(cometHead);

        cometHeadMaterial.rotation = cometAngle;
        cometCoreMaterial.rotation = cometAngle;
        cometHeadSprite.scale.set(
          (10.4 + alpha * 2.1) * cometScale,
          (6.1 + alpha * 1.1) * cometScale,
          1,
        );
        cometCoreSprite.scale.set(
          (4.1 + alpha * 0.9) * cometScale,
          (2.5 + alpha * 0.55) * cometScale,
          1,
        );

        const tailPositions = (cometTailGeometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute).array as Float32Array;
        for (let i = 0; i < COMET_TAIL_POINT_COUNT; i += 1) {
          const metaIndex = i * 6;
          const lag = cometTailMeta[metaIndex];
          const sideAmp = cometTailMeta[metaIndex + 1];
          const depthAmp = cometTailMeta[metaIndex + 2];
          const phase = cometTailMeta[metaIndex + 3];
          const speed = cometTailMeta[metaIndex + 4];
          const drift = cometTailMeta[metaIndex + 5];
          const p = THREE.MathUtils.clamp(eased - lag, 0, 1);
          cometTailPoint.lerpVectors(cometStart, cometEnd, p);
          const stretch = lag * cometTrailLength * (0.75 + drift * 0.25);
          cometTailPoint.addScaledVector(cometDirection, -stretch);
          const organic = Math.sin(now * 0.006 * speed + phase) * (0.2 + lag * 0.7);
          cometTailPoint.addScaledVector(cometSide, sideAmp + organic);
          cometTailPoint.addScaledVector(
            cometDepth,
            depthAmp + Math.cos(now * 0.004 * speed + phase) * 0.25,
          );
          const idx = i * 3;
          tailPositions[idx] = cometTailPoint.x;
          tailPositions[idx + 1] = cometTailPoint.y;
          tailPositions[idx + 2] = cometTailPoint.z;
        }
        cometTailGeometry.getAttribute("position").needsUpdate = true;
      };

      let _perfFrameCount = 0;
      let _perfSlowFrames = 0;

      const animate = () => {
        animationFrameRef.current = requestAnimationFrame(animate);

        if (gpuWarmupInProgressRef?.current) {
          lastFrameTime = performance.now();
          return;
        }

        const _p0 = performance.now();
        _perfFrameCount++;

        const frameNow = _p0;
        const deltaSeconds = Math.min(
          Math.max((frameNow - lastFrameTime) / 1000, 0),
          0.1,
        );
        lastFrameTime = frameNow;
        const travelAnchor = travelAnchorRef.current;
        let activeShip: THREE.Object3D | null = null;

        if (exitFocusRequestRef.current) {
          try {
            exitMoonView();
          } catch (e) {}
          exitFocusRequestRef.current = false;
        }

        const _p1 = performance.now();

        // Lightspeed camera-rig "seat push" inertia (camera-only):
        // - engage: upward pitch kick
        // - during travel: slowly settle toward level
        // - disengage/decel: downward kick then recover to level
        const lsNow = !!manualFlightRef.current?.isLightspeedActive;
        if (lsNow && !lightspeedPitchWasActive) {
          lightspeedPitchKickAt = performance.now();
          lightspeedPitchPendingDir = 1;
        } else if (!lsNow && lightspeedPitchWasActive) {
          lightspeedPitchKickAt = performance.now();
          lightspeedPitchPendingDir = -1;
        }
        lightspeedPitchWasActive = lsNow;
        if (lightspeedPitchPendingDir !== 0) {
          const kickDelayMs = lightspeedPitchPendingDir > 0 ? 220 : 120;
          if (performance.now() - lightspeedPitchKickAt >= kickDelayMs) {
            lightspeedRigPitchRad +=
              lightspeedPitchPendingDir > 0 ? 0.11 : -0.085;
            lightspeedPitchPendingDir = 0;
          }
        }
        const pitchSettleRate = lsNow ? 0.85 : 1.35;
        lightspeedRigPitchRad +=
          (0 - lightspeedRigPitchRad) *
          (1 - Math.exp(-pitchSettleRate * deltaSeconds));
        lightspeedRigPitchRad = THREE.MathUtils.clamp(
          lightspeedRigPitchRad,
          -0.14,
          0.16,
        );

        // ─── SHIP EXPLORE MODE ──────────────────────────────────
        // FPS-style free-cam locked near the ship. WASD to move,
        // mouse drag handled by OrbitControls for rotation.
        // The UI overlay reads shipExploreCoordsRef to show the
        // user their current position in ship-local space.
        if (shipExploreModeRef.current && spaceshipRef.current) {
          const ship = spaceshipRef.current;
          const keys = shipExploreKeysRef.current;
          const speed = keys.ShiftLeft || keys.ShiftRight ? 0.25 : 0.06;
          const oc = sceneRef.current.controls as any;

          // Disable orbit panning but allow rotation (look around)
          if (oc) {
            oc.enablePan = false;
            oc.enableZoom = false;
            oc.enableRotate = true;
            oc.minDistance = 0.01;
            oc.maxDistance = 1000;
            oc.minPolarAngle = 0;
            oc.maxPolarAngle = Math.PI;
          }

          // Near plane very small so we see nearby geometry
          if (camera instanceof THREE.PerspectiveCamera) {
            if (camera.near > NEAR_EXPLORE) {
              camera.near = NEAR_EXPLORE;
              camera.updateProjectionMatrix();
            }
          }

          // Build movement vector from pressed keys
          const moveDir = _tmpOffset.set(0, 0, 0);
          if (keys.KeyW || keys.ArrowUp) moveDir.z -= 1;
          if (keys.KeyS || keys.ArrowDown) moveDir.z += 1;
          if (keys.KeyA || keys.ArrowLeft) moveDir.x -= 1;
          if (keys.KeyD || keys.ArrowRight) moveDir.x += 1;
          if (keys.KeyQ) moveDir.y -= 1;
          if (keys.KeyE) moveDir.y += 1;

          if (moveDir.lengthSq() > 0) {
            moveDir.normalize().multiplyScalar(speed);
            // Move relative to camera orientation
            const camRight = _tmpScaled
              .set(1, 0, 0)
              .applyQuaternion(camera.quaternion);
            const camUp = _tmpDesired
              .set(0, 1, 0)
              .applyQuaternion(camera.quaternion);
            camera.getWorldDirection(_tmpLookDir);
            camera.position
              .addScaledVector(_tmpLookDir, -moveDir.z)
              .addScaledVector(camRight, moveDir.x)
              .addScaledVector(camUp, moveDir.y);
            // Move target with camera so orbit center follows
            if (oc) {
              oc.target
                .addScaledVector(_tmpLookDir, -moveDir.z)
                .addScaledVector(camRight, moveDir.x)
                .addScaledVector(camUp, moveDir.y);
            }
          }

          // Compute ship-local coordinates of the camera
          const localPos = _tmpHoverFloat.copy(camera.position);
          ship.worldToLocal(localPos);
          shipExploreCoordsRef.current.local = [
            parseFloat(localPos.x.toFixed(2)),
            parseFloat(localPos.y.toFixed(2)),
            parseFloat(localPos.z.toFixed(2)),
          ];
          shipExploreCoordsRef.current.world = [
            parseFloat(camera.position.x.toFixed(2)),
            parseFloat(camera.position.y.toFixed(2)),
            parseFloat(camera.position.z.toFixed(2)),
          ];

          // Update OrbitControls for user rotation
          if (oc) oc.update();

          // Render scene
          sunMesh.rotation.y += 0.002;
          const _pExploreRenderStart = performance.now();
          composer.render();
          const _pExploreTotal = performance.now() - _p0;
          if (_pExploreTotal > 50) {
            const renderMs = performance.now() - _pExploreRenderStart;
            console.warn(`[PERF] EXPLORE frame #${_perfFrameCount} total=${_pExploreTotal.toFixed(1)}ms composer.render=${renderMs.toFixed(1)}ms`);
          }
          return; // Skip all other camera/render logic
        }
        // ─── END EXPLORE MODE ───────────────────────────────────

        let shipIsIdleHover = false;
        let moonOrbitActive = false;
        let orbitUserCamFree = false;
        let _p2 = _p1;
        if (spaceshipRef.current) {
          const ship = spaceshipRef.current;
          const cinematic = shipCinematicRef.current;
          activeShip = ship;

          // Resolve cockpit position from model data (once)
          if (!cockpitPosResolved && ship.userData.cockpitCameraLocal) {
            cockpitLocalPos.copy(
              ship.userData.cockpitCameraLocal as THREE.Vector3,
            );
            cockpitTargetLocal.copy(
              (ship.userData.cockpitLookLocal as THREE.Vector3) ??
                cockpitLocalPos,
            );
            cockpitPosResolved = true;
            vlog(
              `✈️ Render loop: cockpit resolved [${cockpitLocalPos.x.toFixed(2)}, ${cockpitLocalPos.y.toFixed(2)}, ${cockpitLocalPos.z.toFixed(2)}]`,
            );
          }

          if (shipStagingModeRef.current) {
            const keys = shipStagingKeysRef.current;
            const moveSpeed = keys.ShiftLeft ? 2.0 : 0.6;
            const turnSpeed = keys.ShiftLeft ? 0.02 : 0.01;

            const cameraForward = new THREE.Vector3();
            camera.getWorldDirection(cameraForward);
            const cameraUp = new THREE.Vector3(0, 1, 0);
            const cameraRight = new THREE.Vector3()
              .crossVectors(cameraForward, cameraUp)
              .normalize();

            const move = new THREE.Vector3();
            if (keys.KeyW) move.add(cameraForward);
            if (keys.KeyS) move.sub(cameraForward);
            if (keys.KeyA) move.sub(cameraRight);
            if (keys.KeyD) move.add(cameraRight);
            if (keys.KeyR) move.add(cameraUp);
            if (keys.KeyF) move.sub(cameraUp);

            if (move.lengthSq() > 0) {
              ship.position.add(move.normalize().multiplyScalar(moveSpeed));
            }

            if (keys.ArrowLeft) ship.rotation.y += turnSpeed;
            if (keys.ArrowRight) ship.rotation.y -= turnSpeed;
            if (keys.ArrowUp) ship.rotation.x += turnSpeed;
            if (keys.ArrowDown) ship.rotation.x -= turnSpeed;
            if (keys.KeyQ) ship.rotation.z += turnSpeed;
            if (keys.KeyE) ship.rotation.z -= turnSpeed;
          } else if (cinematic?.active) {
            const now = performance.now();
            const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

            if (cinematic.phase === "orbit") {
              const orbitDuration = cinematic.orbitDuration || 6000;
              const orbitStartTime = cinematic.orbitStartTime || now;
              const orbitProgress = Math.min(
                (now - orbitStartTime) / orbitDuration,
                1,
              );
              const orbitAngle = THREE.MathUtils.lerp(
                cinematic.orbitStartAngle || 0,
                cinematic.orbitEndAngle || Math.PI * 1.2,
                orbitProgress,
              );
              const orbitCenter = cinematic.orbitCenter || new THREE.Vector3();
              const orbitRadius = cinematic.orbitRadius || INTRO_ORBIT_RADIUS;

              ship.position.set(
                orbitCenter.x + Math.cos(orbitAngle) * orbitRadius,
                orbitCenter.y + Math.sin(orbitAngle * 0.6) * 40,
                orbitCenter.z + Math.sin(orbitAngle) * orbitRadius,
              );

              const lookMatrix = new THREE.Matrix4().lookAt(
                ship.position,
                orbitCenter,
                new THREE.Vector3(0, 1, 0),
              );
              const orbitQuat = new THREE.Quaternion().setFromRotationMatrix(
                lookMatrix,
              );
              const forwardOffset = ship.userData.forwardOffset as
                | THREE.Quaternion
                | undefined;
              if (forwardOffset) {
                orbitQuat.multiply(forwardOffset);
              }
              ship.quaternion.copy(orbitQuat);

              if (orbitProgress >= 1) {
                cinematic.phase = "approach";
                cinematic.startTime = now;
                cinematic.startPos = ship.position.clone();
                cinematic.startQuat = ship.quaternion.clone();
              }
            } else if (cinematic.phase === "approach") {
              const progress = Math.min(
                (now - cinematic.startTime) / cinematic.duration,
                1,
              );
              const passThrough = Boolean(cinematic.approachLookAt);
              const posProgress = passThrough
                ? Math.min(progress, 0.9)
                : progress;
              const easedPos = easeOutCubic(posProgress);
              const oneMinus = 1 - easedPos;
              let currentPos: THREE.Vector3;

              if (cinematic.flybyPoint) {
                const mid = cinematic.flybyPoint;
                const segT =
                  easedPos < 0.5 ? easedPos / 0.5 : (easedPos - 0.5) / 0.5;
                const segOneMinus = 1 - segT;
                if (easedPos < 0.5) {
                  currentPos = new THREE.Vector3()
                    .copy(cinematic.startPos)
                    .multiplyScalar(segOneMinus * segOneMinus)
                    .add(
                      cinematic.controlPos
                        .clone()
                        .multiplyScalar(2 * segOneMinus * segT),
                    )
                    .add(mid.clone().multiplyScalar(segT * segT));
                } else {
                  const controlTwo =
                    cinematic.controlPos2 || cinematic.controlPos;
                  currentPos = new THREE.Vector3()
                    .copy(mid)
                    .multiplyScalar(segOneMinus * segOneMinus)
                    .add(
                      controlTwo.clone().multiplyScalar(2 * segOneMinus * segT),
                    )
                    .add(cinematic.endPos.clone().multiplyScalar(segT * segT));
                }
              } else if (cinematic.controlPos2) {
                currentPos = new THREE.Vector3()
                  .copy(cinematic.startPos)
                  .multiplyScalar(oneMinus * oneMinus * oneMinus)
                  .add(
                    cinematic.controlPos
                      .clone()
                      .multiplyScalar(3 * oneMinus * oneMinus * easedPos),
                  )
                  .add(
                    cinematic.controlPos2
                      .clone()
                      .multiplyScalar(3 * oneMinus * easedPos * easedPos),
                  )
                  .add(
                    cinematic.endPos
                      .clone()
                      .multiplyScalar(easedPos * easedPos * easedPos),
                  );
              } else {
                currentPos = new THREE.Vector3()
                  .copy(cinematic.startPos)
                  .multiplyScalar(oneMinus * oneMinus)
                  .add(
                    cinematic.controlPos
                      .clone()
                      .multiplyScalar(2 * oneMinus * easedPos),
                  )
                  .add(
                    cinematic.endPos
                      .clone()
                      .multiplyScalar(easedPos * easedPos),
                  );
              }

              const lookAtTarget = cinematic.approachLookAt || camera.position;
              const approachLook = new THREE.Matrix4().lookAt(
                currentPos,
                lookAtTarget,
                new THREE.Vector3(0, 1, 0),
              );
              const approachQuat = new THREE.Quaternion().setFromRotationMatrix(
                approachLook,
              );
              const forwardOffset = ship.userData.forwardOffset as
                | THREE.Quaternion
                | undefined;
              if (forwardOffset) {
                approachQuat.multiply(forwardOffset);
              }

              const easedRot = easeOutCubic(progress);
              const currentQuat = new THREE.Quaternion().slerpQuaternions(
                cinematic.startQuat,
                approachQuat,
                easedRot,
              );

              if (cinematic.approachLookAt && progress >= 0.9) {
                cinematic.endQuat = currentQuat.clone();
              }

              if (cinematic.spinDuration && cinematic.spinTurns) {
                const spinStart =
                  cinematic.startTime + (cinematic.spinStartOffset || 0);
                const spinEnd = spinStart + cinematic.spinDuration;
                if (now >= spinStart && now <= spinEnd) {
                  const spinT = (now - spinStart) / cinematic.spinDuration;
                  const clampedSpinT = Math.min(Math.max(spinT, 0), 1);
                  const easedSpin = THREE.MathUtils.smootherstep(
                    clampedSpinT,
                    0,
                    1,
                  );
                  const angle =
                    easedSpin * Math.PI * 2 * (cinematic.spinTurns || 1);
                  const rollAxis = new THREE.Vector3(0, 0, -1)
                    .applyQuaternion(currentQuat)
                    .normalize();
                  const spinQuat = new THREE.Quaternion().setFromAxisAngle(
                    rollAxis,
                    angle,
                  );
                  currentQuat.multiply(spinQuat);
                }
              }

              ship.position.copy(currentPos);
              ship.quaternion.copy(currentQuat);
              if (
                cinematic.cameraRetreatStartPos &&
                cinematic.cameraRetreatStartTarget &&
                sceneRef.current.controls
              ) {
                const retreatStart = THREE.MathUtils.clamp(
                  cinematic.cameraRetreatStartProgress ?? 0.64,
                  0,
                  0.96,
                );
                if (progress >= retreatStart) {
                  const retreatT = THREE.MathUtils.smootherstep(
                    (progress - retreatStart) / Math.max(0.0001, 1 - retreatStart),
                    0,
                    1,
                  );
                  const followPose = computeFalconFollowCameraPose(
                    ship,
                    {
                      navCameraBehind: optionsRef.current.spaceNavCameraBehind,
                      navCameraHeight: optionsRef.current.spaceNavCameraHeight,
                    },
                    _tmpDesired,
                    _tmpControlTarget,
                  );
                  const retreatCam = _tmpOffset
                    .copy(cinematic.cameraRetreatStartPos)
                    .lerp(followPose.cameraPos, retreatT);
                  const retreatTarget = _tmpScaled
                    .copy(cinematic.cameraRetreatStartTarget)
                    .lerp(followPose.targetPos, retreatT);
                  sceneRef.current.controls.setLookAt(
                    retreatCam.x,
                    retreatCam.y,
                    retreatCam.z,
                    retreatTarget.x,
                    retreatTarget.y,
                    retreatTarget.z,
                    false,
                  );
                }
              }

              if (progress >= 1) {
                introCameraPrealignedRef.current = true;
                cinematic.phase = "hover";
                cinematic.hoverStartTime = now;
                cinematic.hoverBasePos = currentPos.clone();
                cinematic.hoverStartQuat = ship.quaternion.clone();
                if (passThrough) {
                  cinematic.settleTargetPos = cinematic.endPos.clone();
                  cinematic.settleDuration = Math.max(
                    2200,
                    cinematic.duration * 0.5,
                  );
                }
              }
            } else {
              const hoverStart = cinematic.hoverStartTime || now;
              const hoverElapsed = (now - hoverStart) / 1000;
              let basePos = cinematic.hoverBasePos || cinematic.endPos;
              if (cinematic.settleTargetPos && cinematic.settleDuration) {
                const settleT = Math.min(
                  (now - hoverStart) / cinematic.settleDuration,
                  1,
                );
                const easedSettle = THREE.MathUtils.smootherstep(settleT, 0, 1);
                basePos = basePos
                  .clone()
                  .lerp(cinematic.settleTargetPos, easedSettle);
              }
              shipIsIdleHover = true; // skip physics while idling in cinematic hover
              // Cinematic idle hover — intentionally visible so the ship never
              // looks frozen after the intro settles.
              const floatX = Math.sin(hoverElapsed * 0.36) * 0.11;
              const floatY = Math.sin(hoverElapsed * 0.52) * 0.17;
              _tmpHoverFloat.set(floatX, floatY, 0);
              ship.position.copy(basePos).add(_tmpHoverFloat);

              const faceProgress = Math.min(hoverElapsed / 6, 1);
              const easedFaceProgress =
                faceProgress * faceProgress * (3 - 2 * faceProgress);
              const hoverStartQuat =
                cinematic.hoverStartQuat || cinematic.endQuat;
              ship.quaternion
                .copy(hoverStartQuat)
                .slerp(cinematic.endQuat, easedFaceProgress);
            }

            if (debugSnapToShipRef.current && sceneRef.current.controls) {
              _tmpOffset.set(0, 0, -1).applyQuaternion(ship.quaternion);
              _tmpDesired
                .copy(ship.position)
                .addScaledVector(_tmpOffset, 60).y += 20;

              const cc = sceneRef.current.controls;
              camera.position.lerp(_tmpDesired, 0.12);
              const lerpedPos = camera.position;
              const curTarget = cc.getTarget(_tmpControlTarget);
              curTarget.lerp(ship.position, 0.12);
              cc.setLookAt(
                lerpedPos.x,
                lerpedPos.y,
                lerpedPos.z,
                curTarget.x,
                curTarget.y,
                curTarget.z,
                false,
              );
              cc.update(deltaSeconds);
            }

            if (spaceshipEngineLightRef.current) {
              const engineLight = spaceshipEngineLightRef.current;
              const lastPos = ship.userData.cinematicLastPos as
                | THREE.Vector3
                | undefined;
              const lastTime = ship.userData.cinematicLastTime as
                | number
                | undefined;
              let speed = 0;

              if (lastPos && lastTime) {
                const dt = Math.max((now - lastTime) / 1000, 1 / 120);
                speed = ship.position.distanceTo(lastPos) / dt;
              }

              ship.userData.cinematicLastPos = ship.position.clone();
              ship.userData.cinematicLastTime = now;

              const speedFactor = Math.min(speed / 60, 1.6);
              const baseIntensity = 0.8;
              engineLight.intensity = baseIntensity + speedFactor * 3.2;
              engineLight.distance = ENGINE_LIGHT_BASE_DIST + speedFactor * ENGINE_LIGHT_RANGE;

              const blueAmount = 0.3 + speedFactor * 0.7;
              engineLight.color.setRGB(
                blueAmount * 0.3,
                blueAmount * 0.6,
                blueAmount * 1.0,
              );
            }
          } else if (manualFlightModeRef.current) {
            const manual = manualFlightRef.current;
            const keyboard = keyboardStateRef.current;

            const baseTurnRate = 0.003;
            const turnRate = baseTurnRate * controlSensitivityRef.current;
            const springBackRate = 0.08;
            const invertMultiplier = invertControlsRef.current ? -1 : 1;

            if (keyboard.ArrowUp) {
              ship.rotation.x += turnRate * invertMultiplier;
              manual.targetPitch = 0.03 * invertMultiplier;
            } else if (keyboard.ArrowDown) {
              ship.rotation.x -= turnRate * invertMultiplier;
              manual.targetPitch = -0.03 * invertMultiplier;
            } else {
              manual.targetPitch = 0;
            }

            if (keyboard.ArrowLeft) {
              ship.rotation.y += turnRate * invertMultiplier;
              manual.targetYaw = 0.03 * invertMultiplier;
            } else if (keyboard.ArrowRight) {
              ship.rotation.y -= turnRate * invertMultiplier;
              manual.targetYaw = -0.03 * invertMultiplier;
            } else {
              manual.targetYaw = 0;
            }

            if (keyboard.KeyZ) {
              ship.rotation.z += turnRate * 0.5;
              manual.targetRoll = 0.03;
            } else if (keyboard.KeyC) {
              ship.rotation.z -= turnRate * 0.5;
              manual.targetRoll = -0.03;
            } else {
              manual.targetRoll = 0;
            }

            manual.pitch +=
              (manual.targetPitch - manual.pitch) * springBackRate;
            manual.yaw += (manual.targetYaw - manual.yaw) * springBackRate;
            manual.roll += (manual.targetRoll - manual.roll) * springBackRate;

            manual.isAccelerating = keyboard.ShiftLeft;

            if (manual.isAccelerating) {
              manual.acceleration = Math.min(manual.acceleration + 0.008, 1.0);

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
              manual.acceleration = Math.max(manual.acceleration - 0.005, 0);
              manual.turboStartTime = 0;
              manual.isTurboActive = false;
            }

            const turboMultiplier = manual.isTurboActive ? 1.5 : 1.0;
            manual.currentSpeed =
              manual.acceleration * manual.maxSpeed * turboMultiplier;

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

            ship.position.add(direction.multiplyScalar(manual.currentSpeed));

            if (followingSpaceshipRef.current && sceneRef.current.controls) {
              const cameraDistance =
                optionsRef.current.spaceFollowDistance ?? FOLLOW_DISTANCE;
              const cameraHeight =
                optionsRef.current.spaceFollowHeight ?? FOLLOW_HEIGHT;

              const backwardDirection = new THREE.Vector3(0, 0, -1);
              backwardDirection.applyQuaternion(ship.quaternion);

              const cameraTargetPos = ship.position
                .clone()
                .add(backwardDirection.multiplyScalar(cameraDistance))
                .add(new THREE.Vector3(0, cameraHeight, 0));

              const cc = sceneRef.current.controls;
              camera.position.lerp(cameraTargetPos, 0.1);
              const lerpedPos = camera.position;
              const curTarget = cc.getTarget(_tmpControlTarget);
              curTarget.lerp(ship.position, 0.1);
              cc.setLookAt(
                lerpedPos.x,
                lerpedPos.y,
                lerpedPos.z,
                curTarget.x,
                curTarget.y,
                curTarget.z,
                false,
              );
              cc.update(deltaSeconds);
            }

            if (spaceshipEngineLightRef.current) {
              const engineLight = spaceshipEngineLightRef.current;
              const baseIntensity = 0.5;
              const turboBoost = manual.isTurboActive ? 3 : 0;
              const boostIntensity = manual.acceleration * 8 + turboBoost;
              engineLight.intensity = baseIntensity + boostIntensity;
              engineLight.distance = ENGINE_LIGHT_BASE_DIST + boostIntensity * ENGINE_LIGHT_RANGE;

              if (manual.acceleration > 0) {
                const blueAmount = 0.3 + manual.acceleration * 0.7;
                const turboGlow = manual.isTurboActive ? 1.5 : 1.0;
                engineLight.color.setRGB(
                  blueAmount * 0.3 * turboGlow,
                  blueAmount * 0.6 * turboGlow,
                  blueAmount * 1.0 * turboGlow,
                );
              } else {
                engineLight.color.set(0x6699ff);
              }
            }

            // Throttle expensive emissive traverse to once every ~6 frames
            const emissiveKey =
              (manual.acceleration * 100) |
              (0 + (manual.isTurboActive ? 1000 : 0));
            if (
              emissiveKey !==
              (ship.userData._lastEmissiveKey as number | undefined)
            ) {
              ship.userData._lastEmissiveKey = emissiveKey;
              ship.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material) {
                  const materials = Array.isArray(child.material)
                    ? child.material
                    : [child.material];
                  materials.forEach((mat) => {
                    if (mat.emissive && mat.emissive.getHex() > 0) {
                      const baseEmissive =
                        mat.userData.baseEmissive || mat.emissive.clone();
                      if (!mat.userData.baseEmissive) {
                        mat.userData.baseEmissive = baseEmissive;
                      }
                      // Keep emissive boost subtle to avoid "glowing flashlight" Falcon.
                      const turboBoost = manual.isTurboActive ? 0.5 : 0;
                      const boostFactor =
                        1 + manual.acceleration * 1.5 + turboBoost;
                      mat.emissive
                        .copy(baseEmissive)
                        .multiplyScalar(boostFactor);
                      mat.emissiveIntensity =
                        1 + manual.acceleration * 1.0 + turboBoost;
                    }
                  });
                }
              });
            }
          } else {
            updateAutopilotNavigation();

            // Moon orbit camera override (restores orbit behavior after arrival)
            if (isMoonOrbiting() && !navTurnActiveRef.current) {
              const camInstr = updateMoonOrbit(deltaSeconds, ship);
              if (camInstr && sceneRef.current.controls) {
                moonOrbitActive = true;
                const cc = sceneRef.current.controls;
                const cp = camInstr.cameraPosition;
                const ct = camInstr.cameraTarget;
                const lf = camInstr.lerpFactor;

                if (!insideShipRef.current) {
                  if (camInstr.userCameraFree) {
                    orbitUserCamFree = true;
                    if (!cc.enabled) cc.enabled = true;
                    const curTarget = cc.getTarget(_orbitCamTarget);
                    const smoothTgt = 0.03;
                    cc.setTarget(
                      curTarget.x + (ct.x - curTarget.x) * smoothTgt,
                      curTarget.y + (ct.y - curTarget.y) * smoothTgt,
                      curTarget.z + (ct.z - curTarget.z) * smoothTgt,
                      false,
                    );
                  } else {
                    const curPos = camera.position;
                    const lerpedPosX = curPos.x + (cp.x - curPos.x) * lf;
                    const lerpedPosY = curPos.y + (cp.y - curPos.y) * lf;
                    const lerpedPosZ = curPos.z + (cp.z - curPos.z) * lf;
                    const curTarget = cc.getTarget(_orbitCamTarget);
                    const lerpedTgtX = curTarget.x + (ct.x - curTarget.x) * lf;
                    const lerpedTgtY = curTarget.y + (ct.y - curTarget.y) * lf;
                    const lerpedTgtZ = curTarget.z + (ct.z - curTarget.z) * lf;

                    camera.position.set(lerpedPosX, lerpedPosY, lerpedPosZ);
                    if (camInstr.cameraUp) {
                      _orbitUpActive = true;
                      _orbitCurUp.lerp(camInstr.cameraUp, lf * 2);
                      _orbitCurUp.normalize();
                      camera.up.copy(_orbitCurUp);
                    }
                    camera.lookAt(lerpedTgtX, lerpedTgtY, lerpedTgtZ);
                    camera.updateMatrixWorld();
                    cc.setLookAt(
                      lerpedPosX,
                      lerpedPosY,
                      lerpedPosZ,
                      lerpedTgtX,
                      lerpedTgtY,
                      lerpedTgtZ,
                      false,
                    );
                    if (cc.enabled) cc.enabled = false;
                  }
                } else {
                  if (!cc.enabled) cc.enabled = true;
                  if (_orbitUpActive) {
                    _orbitCurUp.set(0, 1, 0);
                    camera.up.set(0, 1, 0);
                    _orbitUpActive = false;
                  }
                }
              }
            } else {
              if (sceneRef.current.controls && !sceneRef.current.controls.enabled) {
                sceneRef.current.controls.enabled = true;
              }
              if (_orbitUpActive) {
                _orbitCurUp.set(0, 1, 0);
                camera.up.set(0, 1, 0);
                _orbitUpActive = false;
              }
            }

            _p2 = performance.now();

            if (followingSpaceshipRef.current) {
              if (insideShipRef.current) {
                ship.getWorldPosition(shipWorldPos);
                ship.getWorldQuaternion(shipWorldQuat);
                if (sceneRef.current.controls) {
                  const useCockpit = shipViewModeRef.current === "cockpit";
                  const localCamera = useCockpit
                    ? cockpitLocalPos
                    : cabinLocalPos;
                  const localTarget = useCockpit
                    ? cockpitTargetLocal
                    : cabinTargetLocal;

                  // IMPORTANT: the labeled local coordinates are in the mesh's
                  // local space.  The ship group has scale 0.5, so we must
                  // apply scale before rotation — otherwise the camera ends up
                  // at 2× the correct distance (outside the hull).
                  const shipScale = ship.scale.x; // uniform scale
                  desiredCameraPos
                    .copy(localCamera)
                    .multiplyScalar(shipScale)
                    .applyQuaternion(shipWorldQuat)
                    .add(shipWorldPos);
                  desiredTargetPos
                    .copy(localTarget)
                    .multiplyScalar(shipScale)
                    .applyQuaternion(shipWorldQuat)
                    .add(shipWorldPos);

                  const cc = sceneRef.current.controls;

                  if (!wasInsideShip) {
                    cc.setLookAt(
                      desiredCameraPos.x,
                      desiredCameraPos.y,
                      desiredCameraPos.z,
                      desiredTargetPos.x,
                      desiredTargetPos.y,
                      desiredTargetPos.z,
                      false,
                    );
                    wasInsideShip = true;
                  }

                  cc.minDistance = INTERIOR_MIN_DIST;
                  cc.maxDistance = INTERIOR_MAX_DIST;
                  cc.minPolarAngle = useCockpit ? Math.PI * 0.25 : Math.PI * 0.1;
                  cc.maxPolarAngle = useCockpit ? Math.PI * 0.75 : Math.PI * 0.9;

                  if (camera instanceof THREE.PerspectiveCamera) {
                    const desiredNear = useCockpit ? NEAR_EXPLORE : NEAR_CABIN;
                    if (Math.abs(camera.near - desiredNear) > 0.001) {
                      camera.near = desiredNear;
                      camera.updateProjectionMatrix();
                    }
                  }

                  const sl = sceneRef.current.sunLight as
                    | THREE.PointLight
                    | undefined;
                  const al = sceneRef.current.ambientLight as
                    | THREE.AmbientLight
                    | undefined;
                  if (sl) {
                    if (!interiorLightSnapshot) {
                      interiorLightSnapshot = {
                        sun: sl.intensity,
                        fill: sceneRef.current.fillLight?.intensity,
                        ambient: al?.intensity,
                        exposure: renderer.toneMappingExposure,
                      };
                    }
                    // Cabin has no windows: block external sun contribution.
                    // Cockpit gets a small amount through windshield.
                    sl.intensity = useCockpit ? 0.22 : 0.0;
                  }
                  const fl = sceneRef.current.fillLight as
                    | THREE.PointLight
                    | undefined;
                  if (fl) {
                    fl.intensity = useCockpit ? 0.09 : 0.0;
                  }
                  if (al) {
                    al.intensity = useCockpit ? 0.06 : 0.03;
                  }
                  renderer.toneMappingExposure = useCockpit ? 0.74 : 0.56;

                  if (!wasInsideShipEmissiveClamped) {
                    wasInsideShipEmissiveClamped = true;
                    ship.traverse((child: any) => {
                      if (child.isMesh && child.material) {
                        const mats = Array.isArray(child.material)
                          ? child.material
                          : [child.material];
                        mats.forEach((mat: any) => {
                          if (mat.emissiveIntensity > 1) {
                            if (mat._origEmissiveIntensity === undefined) {
                              mat._origEmissiveIntensity = mat.emissiveIntensity;
                            }
                            mat.emissiveIntensity = 0.35;
                          }
                        });
                      }
                    });
                  }

                  cc.update(deltaSeconds);

                  if (navTurnActiveRef.current) {
                    const savedSmooth = cc.smoothTime;
                    cc.smoothTime = 0.06;
                    cc.setLookAt(
                      desiredCameraPos.x,
                      desiredCameraPos.y,
                      desiredCameraPos.z,
                      desiredTargetPos.x,
                      desiredTargetPos.y,
                      desiredTargetPos.z,
                      true,
                    );
                    cc.update(deltaSeconds);
                    cc.smoothTime = savedSmooth;
                  } else {
                    camera.getWorldDirection(_tmpLookDir);
                    camera.position.copy(desiredCameraPos);
                    _tmpDesired
                      .copy(desiredCameraPos)
                      .addScaledVector(_tmpLookDir, 2);
                    cc.setTarget(_tmpDesired.x, _tmpDesired.y, _tmpDesired.z, false);
                    cc.setPosition(
                      desiredCameraPos.x,
                      desiredCameraPos.y,
                      desiredCameraPos.z,
                      false,
                    );
                  }

                  // Hard interior volume clamp (local ship space): allows free look
                  // but prevents the camera from drifting outside the hull.
                  const invShipQuat = shipWorldQuat.clone().invert();
                  _tmpCamLocal
                    .copy(camera.position)
                    .sub(shipWorldPos)
                    .applyQuaternion(invShipQuat)
                    .divideScalar(shipScale);

                  const anchor = useCockpit ? cockpitLocalPos : cabinLocalPos;
                  const xPad = useCockpit ? 0.85 : 2.05;
                  const yPad = useCockpit ? 0.72 : 1.05;
                  const zBack = useCockpit ? 1.15 : 2.55;
                  const zFront = useCockpit ? 0.55 : 1.55;

                  _tmpCamClamped.set(
                    THREE.MathUtils.clamp(_tmpCamLocal.x, anchor.x - xPad, anchor.x + xPad),
                    THREE.MathUtils.clamp(_tmpCamLocal.y, anchor.y - yPad, anchor.y + yPad),
                    THREE.MathUtils.clamp(_tmpCamLocal.z, anchor.z - zBack, anchor.z + zFront),
                  );

                  if (_tmpCamClamped.distanceToSquared(_tmpCamLocal) > 1e-6) {
                    _tmpCamClamped
                      .multiplyScalar(shipScale)
                      .applyQuaternion(shipWorldQuat)
                      .add(shipWorldPos);
                    camera.position.copy(_tmpCamClamped);
                    cc.setPosition(
                      _tmpCamClamped.x,
                      _tmpCamClamped.y,
                      _tmpCamClamped.z,
                      false,
                    );
                  }
                }
              } else {
                // Reset interior flag when outside the ship
                if (wasInsideShip) {
                  wasInsideShip = false;
                  const sl = sceneRef.current.sunLight as
                    | THREE.PointLight
                    | undefined;
                  if (sl) {
                    sl.intensity = interiorLightSnapshot?.sun ?? 18;
                  }
                  const fl = sceneRef.current.fillLight as
                    | THREE.PointLight
                    | undefined;
                  if (fl) {
                    fl.intensity = interiorLightSnapshot?.fill ?? 3;
                  }
                  const al = sceneRef.current.ambientLight as
                    | THREE.AmbientLight
                    | undefined;
                  if (al) {
                    al.intensity = interiorLightSnapshot?.ambient ?? 0.5;
                  }
                  renderer.toneMappingExposure =
                    interiorLightSnapshot?.exposure ?? 1;
                  interiorLightSnapshot = null;
                  if (wasInsideShipEmissiveClamped) {
                    wasInsideShipEmissiveClamped = false;
                    const EXTERIOR_EMISSIVE_RESTORE_CAP = 1.2;
                    ship.traverse((child: any) => {
                      if (child.isMesh && child.material) {
                        const mats = Array.isArray(child.material)
                          ? child.material
                          : [child.material];
                        mats.forEach((mat: any) => {
                          if (mat._origEmissiveIntensity !== undefined) {
                            mat.emissiveIntensity = Math.min(
                              mat._origEmissiveIntensity,
                              EXTERIOR_EMISSIVE_RESTORE_CAP,
                            );
                          }
                        });
                      }
                    });
                  }
                }
                if (
                  sceneRef.current.controls &&
                  !moonOrbitActive &&
                  !navTurnActiveRef.current
                ) {
                  const cc = sceneRef.current.controls;
                  const focusedMoon = focusedMoonRef.current;
                  const settledTarget = settledViewTargetRef.current;
                  if (focusedMoon) {
                    const moonWorld = new THREE.Vector3();
                    focusedMoon.getWorldPosition(moonWorld);
                    cc.moveTo(moonWorld.x, moonWorld.y, moonWorld.z, true);
                    cc.minDistance = 0;
                    cc.maxDistance = CONTROLS_MAX_DIST;
                  } else if (settledTarget) {
                    cc.moveTo(
                      settledTarget.x,
                      settledTarget.y,
                      settledTarget.z,
                      true,
                    );
                    cc.minDistance = 5;
                    cc.maxDistance = CONTROLS_MAX_DIST;
                  } else {
                    const lightspeedActive = !!manualFlightRef.current?.isLightspeedActive;
                    cc.moveTo(
                      ship.position.x,
                      ship.position.y,
                      ship.position.z,
                      !lightspeedActive,
                    );
                    cc.minDistance = 0.5;
                    cc.maxDistance = CONTROLS_MAX_DIST;
                    const baseFollowDist =
                      optionsRef.current.spaceFollowDistance ?? FOLLOW_DISTANCE;
                    // Keep ship visible during high-speed travel (especially
                    // long planet-to-planet lightspeed legs) by tightening
                    // chase distance while lightspeed is active.
                    const wantDist = manualFlightRef.current?.isLightspeedActive
                      ? Math.max(2.8, baseFollowDist / 12)
                      : baseFollowDist;
                    const normalSmooth = optionsRef.current.spaceCameraSmoothTime ?? 0.25;
                    cc.smoothTime = manualFlightRef.current?.isLightspeedActive
                      ? Math.max(0.03, normalSmooth / 10)
                      : normalSmooth;
                    if (Math.abs(cc.distance - wantDist) > 0.1) {
                      cc.dollyTo(wantDist, !lightspeedActive);
                    }
                    // During lightspeed, keep ship pinned to screen center:
                    // enforce behind-ship camera and exact target each frame.
                    if (lightspeedActive) {
                      const followHeight =
                        optionsRef.current.spaceFollowHeight ?? FOLLOW_HEIGHT;
                      const back = _tmpOffset
                        .set(0, 0, -1)
                        .applyQuaternion(ship.quaternion)
                        .normalize();
                      const desiredCam = _tmpDesired
                        .copy(ship.position)
                        .addScaledVector(back, wantDist)
                        .addScaledVector(new THREE.Vector3(0, 1, 0), followHeight);
                      // Camera-only rig pitch: rotate boom vector around ship-right axis.
                      const rel = _tmpScaled.copy(desiredCam).sub(ship.position);
                      const toShip = _tmpLookDir
                        .copy(ship.position)
                        .sub(desiredCam)
                        .normalize();
                      const right = _tmpHoverFloat
                        .crossVectors(toShip, new THREE.Vector3(0, 1, 0))
                        .normalize();
                      if (right.lengthSq() > 1e-6 && Math.abs(lightspeedRigPitchRad) > 1e-4) {
                        rel.applyAxisAngle(right, lightspeedRigPitchRad);
                        desiredCam.copy(ship.position).add(rel);
                      }
                      camera.position.lerp(desiredCam, 0.22);
                      cc.setLookAt(
                        camera.position.x,
                        camera.position.y,
                        camera.position.z,
                        ship.position.x,
                        ship.position.y,
                        ship.position.z,
                        false,
                      );
                    }
                  }
                }
              }
            }
          }
        }

        // Drive Falcon rear blue-panel emissive by actual ship speed.
        if (activeShip && !insideShipRef.current) {
          const ship = activeShip as THREE.Object3D & {
            userData: Record<string, unknown>;
          };
          const now = performance.now();
          const prevPos = ship.userData._enginePanelPrevPos as THREE.Vector3 | undefined;
          const prevTime = ship.userData._enginePanelPrevTime as number | undefined;
          let speedUnitsPerSec = 0;
          if (prevPos && prevTime) {
            const dt = Math.max((now - prevTime) / 1000, 1 / 120);
            speedUnitsPerSec = ship.position.distanceTo(prevPos) / dt;
          }
          ship.userData._enginePanelPrevPos = ship.position.clone();
          ship.userData._enginePanelPrevTime = now;
          const panelMaterials = ship.userData.enginePanelMaterials as
            | Array<{
                material: THREE.Material & {
                  emissive?: THREE.Color;
                  emissiveIntensity?: number;
                };
                baseEmissive: THREE.Color;
                baseIntensity: number;
              }>
            | undefined;
          if (panelMaterials && panelMaterials.length > 0) {
            const lightspeedActive = !!manualFlightRef.current?.isLightspeedActive;
            let speedNorm = THREE.MathUtils.clamp(speedUnitsPerSec / 220, 0, 1.8);
            if (lightspeedActive) {
              speedNorm = Math.max(speedNorm, 1.1);
            }
            panelMaterials.forEach((entry) => {
              const mat = entry.material;
              if (!mat.emissive || typeof mat.emissiveIntensity !== "number") return;
              const baseIntensity = Math.max(0.15, entry.baseIntensity || 1);
              const tintMix = 0.22 + Math.min(0.42, speedNorm * 0.24);
              const intensityBoost = 1 + speedNorm * 2.5 + (lightspeedActive ? 2.3 : 0);
              mat.emissive
                .copy(entry.baseEmissive)
                .lerp(_engineTint, tintMix)
                .multiplyScalar(1 + speedNorm * 1.7 + (lightspeedActive ? 1.15 : 0));
              mat.emissiveIntensity = THREE.MathUtils.clamp(
                baseIntensity * intensityBoost,
                baseIntensity * 0.8,
                baseIntensity * 8,
              );
            });
          }
        }

        // Physics only needed when ship is actively moving in exterior view.
        // Skip during idle cinematic hover and interior mode to prevent camera/ship tugging.
        if (
          activeShip &&
          !shipIsIdleHover &&
          !navTurnActiveRef.current &&
          !manualFlightRef.current?.isLightspeedActive &&
          !insideShipRef.current &&
          physicsWorld.isReady() &&
          travelAnchor
        ) {
          const world = physicsWorld.getWorld();
          if (world && !travelAnchor.isInitialized()) {
            travelAnchor.init(world, scene, activeShip.position);
          }

          if (travelAnchor.isInitialized()) {
            travelAnchor.setTarget(activeShip.position);
            travelAnchor.preStep(deltaSeconds);
            physicsWorld.step(deltaSeconds);
            travelAnchor.postStep();
          }
        }

        sunMesh.rotation.y += 0.002;

        const bokehPass = sceneRef.current.bokehPass as
          | {
              enabled: boolean;
              materialBokeh?: {
                uniforms?: {
                  focus?: { value: number };
                  aperture?: { value: number };
                  maxblur?: { value: number };
                };
              };
            }
          | undefined;
        const droneActive = hologramDroneRef.current?.isActive();
        const showcaseDofActive = projectShowcaseActiveRef.current;
        const showcaseAxis = projectShowcaseTrackRef?.current?.axis;
        const elevatorShaftMode = showcaseAxis === "y";
        if (insideShipRef.current || droneActive || !showcaseDofActive) {
          if (bokehPass?.enabled) {
            bokehPass.enabled = false;
          }
        } else if (bokehPass) {
          if (!bokehPass.enabled) bokehPass.enabled = true;
          const focusTarget = new THREE.Vector3();
          const fallbackFocusDistance = 52;
          let focusDistance = fallbackFocusDistance;
          try {
            (controls as unknown as { getTarget: (out: THREE.Vector3) => THREE.Vector3 })
              .getTarget(focusTarget);
            const camToTarget = camera.position.distanceTo(focusTarget);
            if (elevatorShaftMode) {
              // In elevator mode we want opposite-window content crisp while
              // retaining subtle blur elsewhere in the shaft.
              focusDistance = THREE.MathUtils.clamp(camToTarget * 0.96, 28, 92);
            } else {
              // Keep near geometry in focus and let distant tunnel drift softly out.
              focusDistance = THREE.MathUtils.clamp(camToTarget * 0.55, 36, 82);
            }
          } catch {
            focusDistance = fallbackFocusDistance;
          }
          const uniforms = bokehPass.materialBokeh?.uniforms;
          if (uniforms?.focus) {
            uniforms.focus.value = focusDistance;
          }
          if (uniforms?.aperture) {
            uniforms.aperture.value = elevatorShaftMode ? 0.00006 : 0.0001;
          }
          if (uniforms?.maxblur) {
            uniforms.maxblur.value = elevatorShaftMode ? 0.0022 : 0.0045;
          }
        }

        const _p3 = performance.now();

        updateOrbitSystem({
          items,
          orbitAnchors,
          camera,
          options: optionsRef.current,
        });

        // Only call controls.update() here when NOT inside the ship —
        // interior mode already called it in the block above.
        if (!insideShipRef.current && (!moonOrbitActive || orbitUserCamFree)) {
          controls.update(deltaSeconds);
        }

        const _p4 = performance.now();

        if (hologramDroneRef.current) {
          hologramDroneRef.current.update(deltaSeconds, camera);
        }

        const _p5 = performance.now();

        // Third-person lightspeed streaks (Star Wars-style star lines).
        // Only active in exterior follow mode while lightspeed is engaged.
        const lightspeedActive =
          !!manualFlightRef.current?.isLightspeedActive &&
          followingSpaceshipRef.current &&
          !insideShipRef.current &&
          shipViewModeRef.current === "exterior";
        if (lightspeedActive && !lightspeedWasActive) {
          lightspeedEnterAt = performance.now();
        }
        lightspeedWasActive = lightspeedActive;
        const sinceEnter = performance.now() - lightspeedEnterAt;
        // Let ship dart first, then kick in visuals/FOV after a short delay.
        const visualTarget =
          lightspeedActive && sinceEnter > 350 ? 1 : 0;
        const visualLerp = 1 - Math.exp(-4.5 * deltaSeconds);
        lightspeedVisualIntensity +=
          (visualTarget - lightspeedVisualIntensity) * visualLerp;

        if (camera instanceof THREE.PerspectiveCamera && baseCameraFov !== null) {
          const desiredFov = baseCameraFov + 2.2 * lightspeedVisualIntensity;
          if (Math.abs(camera.fov - desiredFov) > 0.02) {
            camera.fov = desiredFov;
            camera.updateProjectionMatrix();
          }
        }

        ensureLightspeedStreaks();
        if (lightspeedStreakGroup && lightspeedStreakPositions && lightspeedStreakMeta) {
          const isSkillsLightspeedTravel =
            lightspeedActive &&
            (currentNavigationTargetRef?.current === "skills"
              || currentNavigationTargetRef?.current === "skills-lattice");
          lightspeedStreakGroup.visible = lightspeedVisualIntensity > 0.02;
          const mat = lightspeedStreakGroup.material as THREE.LineBasicMaterial;
          mat.opacity = 0.12 + 0.38 * lightspeedVisualIntensity;
          const colorAttr = lightspeedStreakGroup.geometry.getAttribute(
            "color",
          ) as THREE.BufferAttribute;
          if (lightspeedVisualIntensity > 0.02) {
            // Keep streak field locked in front of camera in world space.
            lightspeedStreakGroup.position.copy(camera.position);
            lightspeedStreakGroup.quaternion.copy(camera.quaternion);
            const posAttr = lightspeedStreakGroup.geometry.getAttribute(
              "position",
            ) as THREE.BufferAttribute;
            for (let i = 0; i < LIGHTSPEED_STREAK_COUNT; i += 1) {
              const mi = i * 5;
              const pi = i * 6;
              lightspeedStreakMeta[mi + 2] +=
                lightspeedStreakMeta[mi + 4] *
                deltaSeconds *
                (7 + lightspeedVisualIntensity * 4);
              if (lightspeedStreakMeta[mi + 2] > -6) {
                resetLightspeedStreak(i);
                continue;
              }
              const x = lightspeedStreakMeta[mi];
              const y = lightspeedStreakMeta[mi + 1];
              const z = lightspeedStreakMeta[mi + 2];
              const len = lightspeedStreakMeta[mi + 3];
              const endZ = z - len;
              lightspeedStreakPositions[pi] = x;
              lightspeedStreakPositions[pi + 1] = y;
              lightspeedStreakPositions[pi + 2] = z;
              // Force one single, stable vanishing point at center.
              lightspeedStreakPositions[pi + 3] = 0;
              lightspeedStreakPositions[pi + 4] = 0;
              lightspeedStreakPositions[pi + 5] = endZ;
              if (isSkillsLightspeedTravel) {
                const hue = (performance.now() * 0.00008 + i * 0.013) % 1;
                _lightspeedColor.setHSL(hue, 0.95, 0.68);
              } else {
                // Original cool-white tunnel palette.
                const t = 0.74 + 0.24 * (0.5 + 0.5 * Math.sin(i * 1.7));
                _lightspeedColor.setRGB(0.7 * t, 0.82 * t, 1.0 * t);
              }
              colorAttr.setXYZ(i * 2, _lightspeedColor.r, _lightspeedColor.g, _lightspeedColor.b);
              colorAttr.setXYZ(i * 2 + 1, _lightspeedColor.r, _lightspeedColor.g, _lightspeedColor.b);
            }
            posAttr.needsUpdate = true;
            colorAttr.needsUpdate = true;
          }
        }
        if (lightspeedThickGroup && lightspeedThickPositions && lightspeedThickMeta) {
          lightspeedThickGroup.visible = lightspeedVisualIntensity > 0.08;
          const thickMat = lightspeedThickGroup.material as THREE.LineBasicMaterial;
          const isSkillsLightspeedTravel =
            lightspeedActive &&
            (currentNavigationTargetRef?.current === "skills"
              || currentNavigationTargetRef?.current === "skills-lattice");
          if (isSkillsLightspeedTravel) {
            const h = (performance.now() * 0.00006) % 1;
            thickMat.color.setHSL(h, 0.9, 0.7);
          } else {
            thickMat.color.set(0xe8f4ff);
          }
          thickMat.opacity = 0.11 + 0.36 * lightspeedVisualIntensity;
          if (lightspeedVisualIntensity > 0.08) {
            lightspeedThickGroup.position.copy(camera.position);
            lightspeedThickGroup.quaternion.copy(camera.quaternion);
            const thickPosAttr = lightspeedThickGroup.geometry.getAttribute(
              "position",
            ) as THREE.BufferAttribute;
            for (let i = 0; i < LIGHTSPEED_THICK_STREAK_COUNT; i += 1) {
              const mi = i * 5;
              lightspeedThickMeta[mi + 2] +=
                lightspeedThickMeta[mi + 4] *
                deltaSeconds *
                (6.5 + lightspeedVisualIntensity * 4.5);
              if (lightspeedThickMeta[mi + 2] > -6) {
                resetLightspeedThickStreak(i);
                continue;
              }
              const x = lightspeedThickMeta[mi];
              const y = lightspeedThickMeta[mi + 1];
              const z = lightspeedThickMeta[mi + 2];
              const len = lightspeedThickMeta[mi + 3];
              writeThickStreakCopies(i, x, y, z, z - len);
            }
            thickPosAttr.needsUpdate = true;
          }
        }

        const cometSuppressed = true;
        if (cometSuppressed) {
          if (cometActive) {
            cometActive = false;
          }
          if (cometGroup) {
            cometGroup.visible = false;
          }
          if (cometHeadMaterial) cometHeadMaterial.opacity = 0;
          if (cometCoreMaterial) cometCoreMaterial.opacity = 0;
          if (cometTailCoreMaterial) cometTailCoreMaterial.opacity = 0;
          if (cometTailGlowMaterial) cometTailGlowMaterial.opacity = 0;
          nextCometAt = Math.max(nextCometAt, performance.now() + 5500);
        } else {
          const now = performance.now();
          if (!cometActive && now >= nextCometAt) {
            startComet(now);
          }
          if (cometActive) {
            updateComet(now, camera);
          }
        }

        const _p6 = performance.now();
        composer.render();
        const _p7 = performance.now();

        // Skip the extra render passes when inside the ship — the
        // layer-1 overlay meshes and CSS2D labels aren't visible from
        // the interior, so rendering them just wastes GPU time.
        if (!insideShipRef.current || focusedMoonRef.current) {
          const prevMask = camera.layers.mask;
          camera.layers.set(1);
          const prevAutoClear = renderer.autoClear;
          renderer.autoClear = false;
          renderer.clearDepth();
          renderer.render(scene, camera);
          renderer.autoClear = prevAutoClear;
          camera.layers.mask = prevMask;
          labelRenderer.render(scene, camera);
        }

        const _pEnd = performance.now();
        const _pTotal = _pEnd - _p0;
        if (_pTotal > 50) {
          _perfSlowFrames++;
          const mode = shipExploreModeRef.current ? "explore"
            : shipStagingModeRef.current ? "staging"
            : shipCinematicRef.current?.active ? `cinematic:${shipCinematicRef.current.phase}`
            : manualFlightModeRef.current ? "manual"
            : isMoonOrbiting() ? "moonOrbit"
            : "autopilot";
          console.warn(
            `[PERF] SLOW FRAME #${_perfFrameCount} (slow#${_perfSlowFrames}) total=${_pTotal.toFixed(1)}ms mode=${mode}\n` +
            `  exitFocus=${(_p1 - _p0).toFixed(1)}ms` +
            ` | shipLogic=${((_p2 ?? _p1) - _p1).toFixed(1)}ms` +
            ` | camFollow+bokeh=${(_p3 - (_p2 ?? _p1)).toFixed(1)}ms` +
            ` | orbitSys+ctrl=${(_p4 - _p3).toFixed(1)}ms` +
            ` | droneUpdate=${(_p5 - _p4).toFixed(1)}ms` +
            ` | lightspeed+comets=${(_p6 - _p5).toFixed(1)}ms` +
            ` | composer.render=${(_p7 - _p6).toFixed(1)}ms` +
            ` | layer1+labels=${(_pEnd - _p7).toFixed(1)}ms`
          );
        }
      };

      animate();
    },
    [],
  );

  const stopRenderLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    physicsWorld.reset();
  }, []);

  return { startRenderLoop, stopRenderLoop };
};
