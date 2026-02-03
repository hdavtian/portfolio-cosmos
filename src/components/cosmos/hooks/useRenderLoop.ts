import type React from "react";
import { useCallback, useRef } from "react";
import * as THREE from "three";
import type { OrbitAnchor, OrbitItem } from "../ResumeSpace3D.orbital";
import type { SceneRef } from "../ResumeSpace3D.types";

export const useRenderLoop = () => {
  const animationFrameRef = useRef<number | null>(null);

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
        endPos: THREE.Vector3;
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
      spaceshipCameraOffsetRef: React.MutableRefObject<THREE.Vector3>;
      shipViewModeRef: React.MutableRefObject<
        "exterior" | "interior" | "cockpit"
      >;
      insideShipRef: React.MutableRefObject<boolean>;
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
      controls: { update: () => void };
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
      } = params;

      const animate = () => {
        animationFrameRef.current = requestAnimationFrame(animate);

        if (exitFocusRequestRef.current) {
          try {
            exitMoonView();
          } catch (e) {}
          exitFocusRequestRef.current = false;
        }

        if (spaceshipRef.current) {
          const ship = spaceshipRef.current;
          const cinematic = shipCinematicRef.current;

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
              const eased = easeOutCubic(progress);
              const oneMinus = 1 - eased;
              const currentPos = new THREE.Vector3()
                .copy(cinematic.startPos)
                .multiplyScalar(oneMinus * oneMinus)
                .add(
                  cinematic.controlPos
                    .clone()
                    .multiplyScalar(2 * oneMinus * eased),
                )
                .add(cinematic.endPos.clone().multiplyScalar(eased * eased));
              const approachLook = new THREE.Matrix4().lookAt(
                currentPos,
                camera.position,
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

              const currentQuat = new THREE.Quaternion().slerpQuaternions(
                cinematic.startQuat,
                approachQuat,
                eased,
              );

              ship.position.copy(currentPos);
              ship.quaternion.copy(currentQuat);

              if (progress >= 1) {
                cinematic.phase = "hover";
                cinematic.hoverStartTime = now;
                cinematic.hoverBasePos = currentPos.clone();
                cinematic.hoverStartQuat = ship.quaternion.clone();
              }
            } else {
              const hoverStart = cinematic.hoverStartTime || now;
              const hoverElapsed = (now - hoverStart) / 1000;
              const basePos = cinematic.hoverBasePos || cinematic.endPos;
              const floatX = Math.sin(hoverElapsed * 0.4) * 0.27;
              const floatY = Math.sin(hoverElapsed * 0.6) * 0.4;
              ship.position
                .copy(basePos)
                .add(new THREE.Vector3(floatX, floatY, 0));

              const faceProgress = Math.min(hoverElapsed / 6, 1);
              const easedFaceProgress =
                faceProgress * faceProgress * (3 - 2 * faceProgress);
              const hoverStartQuat =
                cinematic.hoverStartQuat || cinematic.endQuat;
              ship.quaternion
                .copy(hoverStartQuat)
                .slerp(cinematic.endQuat, easedFaceProgress);
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
              const cameraHeight = 20;

              const backwardDirection = new THREE.Vector3(0, 0, -1);
              backwardDirection.applyQuaternion(ship.quaternion);

              const cameraTargetPos = ship.position
                .clone()
                .add(backwardDirection.multiplyScalar(cameraDistance))
                .add(new THREE.Vector3(0, cameraHeight, 0));

              camera.position.lerp(cameraTargetPos, 0.1);

              sceneRef.current.controls.target.lerp(ship.position, 0.1);
              sceneRef.current.controls.update();
            }

            if (spaceshipEngineLightRef.current) {
              const engineLight = spaceshipEngineLightRef.current;
              const baseIntensity = 0.5;
              const turboBoost = manual.isTurboActive ? 3 : 0;
              const boostIntensity = manual.acceleration * 8 + turboBoost;
              engineLight.intensity = baseIntensity + boostIntensity;

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
                    mat.emissive.copy(baseEmissive).multiplyScalar(boostFactor);
                    mat.emissiveIntensity =
                      1 + manual.acceleration * 4 + turboBoost;
                  }
                });
              }
            });
          } else {
            updateAutopilotNavigation();

            if (followingSpaceshipRef.current) {
              if (insideShipRef.current) {
                const shipWorldPos = new THREE.Vector3();
                const shipWorldQuat = new THREE.Quaternion();
                ship.getWorldPosition(shipWorldPos);
                ship.getWorldQuaternion(shipWorldQuat);

                if (sceneRef.current.controls) {
                  const targetOffset =
                    shipViewModeRef.current === "cockpit"
                      ? new THREE.Vector3(0, 0.5, 10)
                      : new THREE.Vector3(0.5, 0, 0);

                  const localTargetOffset = targetOffset
                    .clone()
                    .applyQuaternion(shipWorldQuat);
                  const worldTarget = shipWorldPos
                    .clone()
                    .add(localTargetOffset);

                  const currentCameraOffset = camera.position
                    .clone()
                    .sub(sceneRef.current.controls.target);

                  sceneRef.current.controls.target.copy(worldTarget);

                  const desiredCameraPos = worldTarget
                    .clone()
                    .add(currentCameraOffset);

                  const shipLocalCameraPos = desiredCameraPos
                    .clone()
                    .sub(shipWorldPos);
                  const inverseQuat = shipWorldQuat.clone().invert();
                  shipLocalCameraPos.applyQuaternion(inverseQuat);

                  const bounds =
                    shipViewModeRef.current === "cockpit"
                      ? { x: 1.2, y: 1, z: 6 }
                      : { x: 2.5, y: 1.2, z: 3 };

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

                  shipLocalCameraPos.applyQuaternion(shipWorldQuat);
                  const constrainedCameraPos = shipWorldPos
                    .clone()
                    .add(shipLocalCameraPos);

                  camera.position.copy(constrainedCameraPos);

                  sceneRef.current.controls.enablePan = false;
                  sceneRef.current.controls.enableRotate = true;
                  sceneRef.current.controls.enableZoom = true;

                  if (shipViewModeRef.current === "cockpit") {
                    sceneRef.current.controls.minDistance = 0.3;
                    sceneRef.current.controls.maxDistance = 4;
                  } else {
                    sceneRef.current.controls.minDistance = 0.5;
                    sceneRef.current.controls.maxDistance = 3.5;
                  }

                  sceneRef.current.controls.update();
                }
              } else {
                const followDistance =
                  optionsRef.current.spaceFollowDistance || 60;

                const currentOffset = camera.position
                  .clone()
                  .sub(ship.position);

                if (
                  currentOffset.distanceTo(spaceshipCameraOffsetRef.current) > 1
                ) {
                  spaceshipCameraOffsetRef.current.copy(currentOffset);
                }

                const scaledOffset = spaceshipCameraOffsetRef.current
                  .clone()
                  .normalize()
                  .multiplyScalar(followDistance);

                const desiredCameraPos = ship.position
                  .clone()
                  .add(scaledOffset);
                camera.position.copy(desiredCameraPos);

                if (sceneRef.current.controls) {
                  sceneRef.current.controls.target.copy(ship.position);
                  sceneRef.current.controls.enablePan = true;
                  sceneRef.current.controls.maxDistance = 1000;
                  sceneRef.current.controls.update();
                }
              }
            }
          }
        }

        sunMesh.rotation.y += 0.002;

        const bokehPass = sceneRef.current.bokehPass as
          | {
              enabled: boolean;
              materialBokeh?: { uniforms?: { focus?: { value: number } } };
            }
          | undefined;
        if (bokehPass?.enabled) {
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

        updateOrbitSystem({
          items,
          orbitAnchors,
          camera,
          options: optionsRef.current,
        });

        controls.update();
        composer.render();

        const prevMask = camera.layers.mask;
        camera.layers.set(1);
        const prevAutoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(scene, camera);
        renderer.autoClear = prevAutoClear;
        camera.layers.mask = prevMask;
        labelRenderer.render(scene, camera);
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
  }, []);

  return { startRenderLoop, stopRenderLoop };
};
