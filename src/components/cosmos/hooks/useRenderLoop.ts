import type React from "react";
import { useCallback, useRef } from "react";
import * as THREE from "three";
import type CameraControls from "camera-controls";
import { physicsWorld } from "../PhysicsWorld";
import { PhysicsTravelAnchor } from "../PhysicsTravelAnchor";
import type { OrbitAnchor, OrbitItem } from "../ResumeSpace3D.orbital";
import type { SceneRef } from "../ResumeSpace3D.types";

export const useRenderLoop = () => {
  const animationFrameRef = useRef<number | null>(null);
  const travelAnchorRef = useRef<PhysicsTravelAnchor | null>(null);

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
      } | null>;
      shipStagingModeRef: React.MutableRefObject<boolean>;
      shipStagingKeysRef: React.MutableRefObject<Record<string, boolean>>;
      manualFlightModeRef: React.MutableRefObject<boolean>;
      manualFlightRef: React.MutableRefObject<any>;
      keyboardStateRef: React.MutableRefObject<Record<string, boolean>>;
      controlSensitivityRef: React.MutableRefObject<number>;
      invertControlsRef: React.MutableRefObject<boolean>;
      followingSpaceshipRef: React.MutableRefObject<boolean>;
      sceneRef: React.MutableRefObject<SceneRef>;
      focusedMoonRef: React.MutableRefObject<THREE.Mesh | null>;
      spaceshipEngineLightRef: React.MutableRefObject<THREE.PointLight | null>;

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
      cockpitSteerRef: React.MutableRefObject<{ x: number; y: number }>;
      cockpitSteerActiveRef: React.MutableRefObject<boolean>;
      rollInputRef: React.MutableRefObject<number>;
      shipRollOffsetRef: React.MutableRefObject<number>;
      navTurnActiveRef: React.MutableRefObject<boolean>;
      optionsRef: React.MutableRefObject<{ spaceFollowDistance?: number }>;
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
    }) => {
      const {
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

      // Reusable temp vectors to avoid per-frame allocations
      const _tmpOffset = new THREE.Vector3();

      const _tmpDesired = new THREE.Vector3();
      const _tmpHoverFloat = new THREE.Vector3();
      const _tmpLookDir = new THREE.Vector3();
      const _tmpQuat = new THREE.Quaternion();

      const animate = () => {
        animationFrameRef.current = requestAnimationFrame(animate);

        const frameNow = performance.now();
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

        // ─── SHIP EXPLORE MODE ──────────────────────────────────
        // FPS-style free-cam locked near the ship. WASD to move,
        // mouse drag handled by OrbitControls for rotation.
        // The UI overlay reads shipExploreCoordsRef to show the
        // user their current position in ship-local space.
        if (shipExploreModeRef.current && spaceshipRef.current) {
          const ship = spaceshipRef.current;
          const keys = shipExploreKeysRef.current;
          const speed = (keys.ShiftLeft || keys.ShiftRight) ? 0.25 : 0.06;
          const cc = sceneRef.current.controls;

          // Configure for explore mode
          if (cc) {
            cc.minDistance = 0.01;
            cc.maxDistance = 1000;
            cc.minPolarAngle = 0;
            cc.maxPolarAngle = Math.PI;
          }

          // Near plane very small so we see nearby geometry
          if (camera instanceof THREE.PerspectiveCamera) {
            if (camera.near > 0.005) {
              camera.near = 0.005;
              camera.updateProjectionMatrix();
            }
          }

          // Build movement from pressed keys using camera-controls API
          if (cc) {
            if (keys.KeyW || keys.ArrowUp) cc.forward(speed, false);
            if (keys.KeyS || keys.ArrowDown) cc.forward(-speed, false);
            if (keys.KeyA || keys.ArrowLeft) cc.truck(-speed, 0, false);
            if (keys.KeyD || keys.ArrowRight) cc.truck(speed, 0, false);
            if (keys.KeyQ) cc.elevate(-speed, false);
            if (keys.KeyE) cc.elevate(speed, false);

            cc.update(deltaSeconds);
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

          // Render scene
          sunMesh.rotation.y += 0.002;
          composer.render();
          return; // Skip all other camera/render logic
        }
        // ─── END EXPLORE MODE ───────────────────────────────────

        let shipIsIdleHover = false; // true when ship is just floating (no nav)

        if (spaceshipRef.current) {
          const ship = spaceshipRef.current;
          const cinematic = shipCinematicRef.current;
          activeShip = ship;

          // Resolve cockpit position from model data (once)
          if (!cockpitPosResolved && ship.userData.cockpitCameraLocal) {
            cockpitLocalPos.copy(ship.userData.cockpitCameraLocal as THREE.Vector3);
            cockpitTargetLocal.copy(
              (ship.userData.cockpitLookLocal as THREE.Vector3) ?? cockpitLocalPos,
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
              const orbitRadius = cinematic.orbitRadius || 260;

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

              if (progress >= 1) {
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
              shipIsIdleHover = true; // flag to skip physics this frame

              // Subtle idle hover — very gentle so it looks alive but
              // doesn't cause visible bobbing inside the cockpit.
              const floatX = Math.sin(hoverElapsed * 0.25) * 0.02;
              const floatY = Math.sin(hoverElapsed * 0.35) * 0.03;
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
                .addScaledVector(_tmpOffset, 60);
              _tmpDesired.y += 25;

              sceneRef.current.controls.setLookAt(
                _tmpDesired.x, _tmpDesired.y, _tmpDesired.z,
                ship.position.x, ship.position.y, ship.position.z,
                true,
              );
              sceneRef.current.controls.update(deltaSeconds);
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
              engineLight.distance = 220 + speedFactor * 140;

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
              const cameraDistance = 60;
              const cameraHeight = 25;

              const backwardDirection = new THREE.Vector3(0, 0, -1);
              backwardDirection.applyQuaternion(ship.quaternion);

              const cameraTargetPos = ship.position
                .clone()
                .add(backwardDirection.multiplyScalar(cameraDistance))
                .add(new THREE.Vector3(0, cameraHeight, 0));

              sceneRef.current.controls.setLookAt(
                cameraTargetPos.x, cameraTargetPos.y, cameraTargetPos.z,
                ship.position.x, ship.position.y, ship.position.z,
                true,
              );
              sceneRef.current.controls.update(deltaSeconds);
            }

            if (spaceshipEngineLightRef.current) {
              const engineLight = spaceshipEngineLightRef.current;
              const baseIntensity = 0.5;
              const turboBoost = manual.isTurboActive ? 3 : 0;
              const boostIntensity = manual.acceleration * 8 + turboBoost;
              engineLight.intensity = baseIntensity + boostIntensity;
              engineLight.distance = 220 + boostIntensity * 40;

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
              (manual.acceleration * 100) | 0 + (manual.isTurboActive ? 1000 : 0);
            if (
              emissiveKey !== (ship.userData._lastEmissiveKey as number | undefined)
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
                      const turboBoost = manual.isTurboActive ? 3 : 0;
                      const boostFactor =
                        1 + manual.acceleration * 6 + turboBoost;
                      mat.emissive
                        .copy(baseEmissive)
                        .multiplyScalar(boostFactor);
                      mat.emissiveIntensity =
                        1 + manual.acceleration * 4 + turboBoost;
                    }
                  });
                }
              });
            }
          } else {
            updateAutopilotNavigation();

            // Exterior follow camera (only when NOT inside ship)
            // Move the orbit center to track the ship's position.
            // The user's azimuth, polar angle, and zoom distance are
            // preserved by camera-controls, allowing free orbit/pan
            // while the camera follows the ship.
            // (Initial behind-and-above placement is done once in
            // handleUseShip / handleShipViewChange via setLookAt.)
            if (followingSpaceshipRef.current && !insideShipRef.current) {
              if (wasInsideShip) {
                wasInsideShip = false;
              }
              const cc = sceneRef.current.controls;
              if (cc) {
                // When a moon is focused, orbit around the moon instead
                // of the ship so the camera stays centred on the moon
                // and bokeh/DOF remains sharp on the target.
                const focusedMoon = focusedMoonRef.current;
                if (focusedMoon) {
                  const moonWorld = new THREE.Vector3();
                  focusedMoon.getWorldPosition(moonWorld);
                  cc.moveTo(moonWorld.x, moonWorld.y, moonWorld.z, true);
                  cc.minDistance = 0;
                  cc.maxDistance = 1000;
                } else {
                  cc.moveTo(
                    ship.position.x,
                    ship.position.y,
                    ship.position.z,
                    true, // smooth transition
                  );
                  cc.minDistance = 5;
                  cc.maxDistance = 1000;
                }
              }
            }
          }

          // ─── MANUAL ROLL (BANK) CONTROL ─────────────────────────
          // Applied from the UI roll buttons.  Works in every flight mode
          // (manual, autopilot, cinematic hover, cockpit steer) by
          // rotating the ship around its local forward (Z) axis.
          // The accumulated offset is stored in shipRollOffsetRef so
          // navigation code can preserve it through lookAt / slerp.
          const rollDir = rollInputRef.current; // -1 | 0 | 1
          if (rollDir !== 0) {
            const rollSpeed = 0.6; // radians / sec — feels responsive
            const angle = rollDir * rollSpeed * deltaSeconds;

            // Accumulate persistent offset
            shipRollOffsetRef.current += angle;

            if (manualFlightModeRef.current) {
              // Manual flight uses Euler angles on ship.rotation
              ship.rotation.z += angle;
            } else {
              // All other modes use quaternions — rotate around ship's
              // local forward axis (local +Z after forwardOffset).
              const localForward = _tmpOffset.set(0, 0, 1)
                .applyQuaternion(ship.quaternion)
                .normalize();
              const rollQuat = _tmpQuat.setFromAxisAngle(localForward, angle);
              ship.quaternion.premultiply(rollQuat);
              ship.quaternion.normalize();
            }
          }

          // ─── INTERIOR CAMERA ──────────────────────────────────
          // Runs AFTER both cinematic and autopilot paths so the camera
          // is always rigidly attached to the ship regardless of which
          // code path moved the ship this frame.
          if (insideShipRef.current && sceneRef.current.controls) {
            ship.getWorldPosition(shipWorldPos);
            ship.getWorldQuaternion(shipWorldQuat);

            const useCockpit = shipViewModeRef.current === "cockpit";
            const localCamera = useCockpit ? cockpitLocalPos : cabinLocalPos;
            const localTarget = useCockpit
              ? cockpitTargetLocal
              : cabinTargetLocal;

            const shipScale = ship.scale.x;
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

            // Apply shift+drag steering — rotate the ship and move it forward
            const steer = cockpitSteerRef.current;
            if (cockpitSteerActiveRef.current && (steer.x !== 0 || steer.y !== 0)) {
              const yawRate = 0.8;   // radians/sec at full deflection
              const pitchRate = 0.5; // radians/sec at full deflection
              const thrustSpeed = 40; // units/sec while steering

              // Yaw (turn left/right) around ship's local Y axis
              const yawAngle = steer.x * yawRate * deltaSeconds;
              const yawQuat = _tmpQuat.setFromAxisAngle(_tmpOffset.set(0, 1, 0), yawAngle);
              ship.quaternion.multiply(yawQuat);

              // Pitch (tilt up/down) around ship's local X axis
              const pitchAngle = steer.y * pitchRate * deltaSeconds;
              const pitchQuat = _tmpQuat.setFromAxisAngle(_tmpOffset.set(1, 0, 0), pitchAngle);
              ship.quaternion.multiply(pitchQuat);

              ship.quaternion.normalize();

              // Move ship forward along its local +Z axis
              const forward = _tmpOffset.set(0, 0, 1).applyQuaternion(ship.quaternion);
              ship.position.addScaledVector(forward, thrustSpeed * deltaSeconds);

              // Recompute world pos/quat after rotating the ship
              ship.getWorldPosition(shipWorldPos);
              ship.getWorldQuaternion(shipWorldQuat);

              // Recompute desired camera/target positions with updated ship transform
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
            }

            const cc = sceneRef.current.controls;

            if (!wasInsideShip) {
              // Transition IN — snap camera to interior position
              cc.setLookAt(
                desiredCameraPos.x, desiredCameraPos.y, desiredCameraPos.z,
                desiredTargetPos.x, desiredTargetPos.y, desiredTargetPos.z,
                false, // instant, no transition
              );
              wasInsideShip = true;
            }

            // Configure first-person constraints
            cc.minDistance = 0.01;
            cc.maxDistance = 0.02; // keep camera at the target (first-person)
            cc.minPolarAngle = useCockpit ? Math.PI * 0.25 : Math.PI * 0.1;
            cc.maxPolarAngle = useCockpit ? Math.PI * 0.75 : Math.PI * 0.9;

            // Near clipping plane for cockpit instruments
            if (camera instanceof THREE.PerspectiveCamera) {
              const desiredNear = useCockpit ? 0.005 : 0.05;
              if (Math.abs(camera.near - desiredNear) > 0.001) {
                camera.near = desiredNear;
                camera.updateProjectionMatrix();
              }
            }

            // Let camera-controls handle user rotation input,
            // then override position to pin inside ship.
            cc.update(deltaSeconds);

            if (navTurnActiveRef.current) {
              // During navigation turn phase: pilot is "strapped in" —
              // force camera to look forward through the cockpit window.
              //
              // Temporarily tighten smoothTime so the camera tracks the
              // ship's rotation closely (minimal drift off-center) while
              // still avoiding the micro-snap jerkiness of instant mode.
              const savedSmooth = cc.smoothTime;
              cc.smoothTime = 0.06; // tight follow — ~60ms to reach target
              cc.setLookAt(
                desiredCameraPos.x, desiredCameraPos.y, desiredCameraPos.z,
                desiredTargetPos.x, desiredTargetPos.y, desiredTargetPos.z,
                true,
              );
              // Run an extra update tick so the tighter smoothTime takes
              // effect immediately this frame.
              cc.update(deltaSeconds);
              cc.smoothTime = savedSmooth; // restore for normal interaction
            } else {
              // Normal operation: preserve user's look direction while
              // pinning position to the ship's interior.
              camera.getWorldDirection(_tmpLookDir);

              // Pin camera to fixed interior position (rigid attachment)
              camera.position.copy(desiredCameraPos);

              // Reconstruct the target from pinned position + look direction
              _tmpDesired.copy(desiredCameraPos).addScaledVector(_tmpLookDir, 2);
              cc.setTarget(_tmpDesired.x, _tmpDesired.y, _tmpDesired.z, false);
              cc.setPosition(desiredCameraPos.x, desiredCameraPos.y, desiredCameraPos.z, false);
            }
          }
          // ─── END INTERIOR CAMERA ──────────────────────────────
        }

        // Physics only needed when ship is actively navigating somewhere
        // AND the user is NOT inside the ship (cockpit steering is handled
        // directly in the interior camera block, not via physics).
        // Skipping when idle/hovering or inside eliminates RAPIER + YUKA overhead (~2-4 ms/frame).
        if (activeShip && !shipIsIdleHover && !insideShipRef.current && physicsWorld.isReady() && travelAnchor) {
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

        // Depth-of-field handling ─────────────────────────────────
        // When inside the cockpit, disable bokeh entirely so cockpit
        // instruments and the destination planet/moon stay crisp.
        // When outside, update focus distance to the focused moon.
        const bokehPass = sceneRef.current.bokehPass as
          | {
              enabled: boolean;
              materialBokeh?: {
                uniforms?: { focus?: { value: number } };
              };
            }
          | undefined;

        if (insideShipRef.current) {
          // Cockpit view: no depth-of-field blur at all
          if (bokehPass?.enabled) {
            bokehPass.enabled = false;
          }
        } else if (bokehPass) {
          if (bokehPass.enabled) {
            const focusedMoon = focusedMoonRef.current;
            if (focusedMoon) {
              const moonWorld = new THREE.Vector3();
              focusedMoon.getWorldPosition(moonWorld);
              const focusDistance = camera.position.distanceTo(moonWorld);
              if (bokehPass.materialBokeh?.uniforms?.focus) {
                bokehPass.materialBokeh.uniforms.focus.value = focusDistance;
              }
            } else {
              bokehPass.enabled = false;
            }
          }
        }

        // Skip orbit system updates when inside the ship — the orbit
        // labels and position calculations aren't visible from the interior
        // and waste CPU time.
        if (!insideShipRef.current) {
          updateOrbitSystem({
            items,
            orbitAnchors,
            camera,
            options: optionsRef.current,
          });
        }

        // Only call controls.update() here when NOT inside the ship —
        // interior mode already called it in the block above.
        if (!insideShipRef.current) {
          controls.update(deltaSeconds);
        }

        composer.render();

        // Render layer-1 overlay meshes and CSS2D labels.
        // Normally skipped when inside the ship (not visible from interior
        // and wastes GPU), BUT we still render them when a moon is focused
        // so cockpit/cabin users can see the moon's text labels.
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
