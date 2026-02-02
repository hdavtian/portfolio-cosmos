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
      manualFlightModeRef: React.MutableRefObject<boolean>;
      manualFlightRef: React.MutableRefObject<any>;
      keyboardStateRef: React.MutableRefObject<Record<string, boolean>>;
      controlSensitivityRef: React.MutableRefObject<number>;
      invertControlsRef: React.MutableRefObject<boolean>;
      followingSpaceshipRef: React.MutableRefObject<boolean>;
      sceneRef: React.MutableRefObject<SceneRef>;
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
        manualFlightModeRef,
        manualFlightRef,
        keyboardStateRef,
        controlSensitivityRef,
        invertControlsRef,
        followingSpaceshipRef,
        sceneRef,
        spaceshipEngineLightRef,
        spaceshipCameraOffsetRef,
        shipViewModeRef,
        insideShipRef,
        optionsRef,
        updateAutopilotNavigation,
        updateOrbitSystem,
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
          } catch (e) {
            console.warn("exitFocusedMoon failed:", e);
          }
          exitFocusRequestRef.current = false;
        }

        if (spaceshipRef.current) {
          const ship = spaceshipRef.current;

          if (manualFlightModeRef.current) {
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

        updateOrbitSystem({
          items,
          orbitAnchors,
          camera,
          options: optionsRef.current,
        });

        controls.update();
        composer.render();
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
