import type React from "react";
import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import {
  SpaceshipNavigationSystem,
  type NavigationStatus,
} from "../../SpaceshipNavigationSystem";
import type { SceneRef } from "../ResumeSpace3D.types";

export const useNavigationSystem = (deps: {
  resumeData: any;
  emitterRef: React.MutableRefObject<{
    isTracking: (id: string) => boolean;
    getCurrentPosition: (id: string) => { worldPosition: THREE.Vector3 } | null;
    getRegisteredObjectIds: () => string[];
  }>;
  spaceshipRef: React.MutableRefObject<THREE.Object3D | null>;
  sceneRef: React.MutableRefObject<SceneRef>;
  followingSpaceshipRef: React.MutableRefObject<boolean>;
  manualFlightModeRef: React.MutableRefObject<boolean>;
  focusedMoonRef: React.MutableRefObject<THREE.Mesh | null>;
  exitFocusRequestRef: React.MutableRefObject<boolean>;
  missionLog: (message: string) => void;
  vlog: (message: string) => void;
  manualFlightRef: React.MutableRefObject<any>;
  spaceshipPathRef: React.MutableRefObject<any>;
  enterMoonViewRef: React.MutableRefObject<
    | ((params: {
        moonMesh: THREE.Mesh;
        company: any;
        useFlight?: boolean;
      }) => void)
    | null
  >;
}) => {
  const {
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
  } = deps;

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

  const navigationSystemRef = useRef<SpaceshipNavigationSystem | null>(null);

  const initializeNavigationSystem = useCallback(
    (spaceship: THREE.Object3D, scene: THREE.Scene) => {
      navigationSystemRef.current = new SpaceshipNavigationSystem(spaceship, {
        maxSpeed: 3.0,
        turboSpeed: 6.0,
        accelerationRate: 0.12,
        decelerationDistance: 150,
        arrivalDistance: 30,
        usePredictiveIntercept: true,
        freezeOrbitOnApproach: true,
        freezeDistance: 60,
      });

      navigationSystemRef.current.setOnStatusChange(
        (status: NavigationStatus) => {
          setNavigationDistance(status.distance);
          setNavigationETA(status.eta);
        },
      );

      navigationSystemRef.current.setMissionLog(missionLog);

      navigationSystemRef.current.setObstaclesProvider(() => {
        const obstacles: {
          id?: string;
          position: THREE.Vector3;
          radius: number;
        }[] = [];

        const ids = emitterRef.current.getRegisteredObjectIds();
        ids.forEach((id) => {
          if (id === navigationSystemRef.current?.getStatus().targetId) return;
          const pos = emitterRef.current.getCurrentPosition(id);
          if (pos) {
            obstacles.push({
              id,
              position: pos.worldPosition.clone(),
              radius: id.startsWith("moon-") ? 50 : 100,
            });
          }
        });

        return obstacles;
      });

      navigationSystemRef.current.setOnArrival((targetId: string) => {
        vlog(`✅ ARRIVED at ${targetId}`);

        const companyId = targetId.replace("moon-", "");
        const company = resumeData.experience.find(
          (exp: any) => exp.id === companyId,
        );

        if (!company) {
          vlog(`⚠️ Could not find company for moon: ${targetId}`);
          return;
        }

        let moonMesh: THREE.Mesh | null = null;
        scene.traverse((object) => {
          if (
            object instanceof THREE.Mesh &&
            object.userData.moonId === targetId
          )
            moonMesh = object;
        });

        if (!moonMesh) {
          vlog(`⚠️ Could not find moon mesh: ${targetId}`);
          return;
        }

        vlog(`🌙 Processing arrival at moon: ${company.company}`);
        missionLog(
          `🌙 STATION CONTACT: Arrived at ${company.company} - Establishing connection`,
        );

        enterMoonViewRef.current?.({ moonMesh, company, useFlight: false });
      });

      vlog("🎯 Navigation system initialized");
    },
    [emitterRef, enterMoonViewRef, missionLog, resumeData, vlog],
  );

  const handleAutopilotNavigation = useCallback(
    (targetId: string, targetType: "section" | "moon") => {
      vlog(`🖱️ CLICK: Navigation button clicked - ${targetType}: ${targetId}`);

      if (focusedMoonRef.current) {
        exitFocusRequestRef.current = true;
        vlog("↩️ Exiting previous focused moon before new navigation");
      }

      if (!followingSpaceshipRef.current || manualFlightModeRef.current) {
        vlog("⚠️ Navigation only available in autopilot mode");
        vlog(
          `   Following: ${followingSpaceshipRef.current}, Manual: ${manualFlightModeRef.current}`,
        );
        return;
      }

      if (!navigationSystemRef.current) {
        vlog("⚠️ Navigation system not initialized");
        return;
      }

      vlog(`🎯 Autopilot navigation to ${targetType}: ${targetId}`);

      if (targetType === "moon") {
        const moonId = `moon-${targetId}`;

        if (!emitterRef.current.isTracking(moonId)) {
          vlog(`⚠️ Moon ${targetId} is not being tracked by emitter`);
          return;
        }

        const currentPos = emitterRef.current.getCurrentPosition(moonId);
        const useTurbo =
          currentPos && spaceshipRef.current
            ? spaceshipRef.current.position.distanceTo(
                currentPos.worldPosition,
              ) > 500
            : true;

        vlog(`🎯 Starting navigation to moon: ${moonId}`);
        vlog(`   Emitter tracking: ${emitterRef.current.isTracking(moonId)}`);
        vlog(`   Nav system exists: ${!!navigationSystemRef.current}`);
        vlog(`   Ship exists: ${!!spaceshipRef.current}`);

        const success = navigationSystemRef.current.navigateToObject(
          moonId,
          useTurbo,
        );

        if (success) {
          setCurrentNavigationTarget(targetId);
          vlog(
            `✅ Navigation started to moon: ${targetId} (turbo: ${useTurbo})`,
          );
          missionLog(
            `🎯 NAVIGATION INITIATED: Target - ${targetId} | Distance: ${currentPos ? spaceshipRef.current!.position.distanceTo(currentPos.worldPosition).toFixed(0) : "unknown"}u`,
          );
        } else {
          vlog(`❌ Failed to start navigation to moon: ${targetId}`);
          missionLog(`⚠️ NAVIGATION FAILED: Unable to lock onto ${targetId}`);
        }
      } else if (targetType === "section") {
        let targetPosition: THREE.Vector3 | null = null;
        let targetName = targetId;

        // Special handling for section targets that don't have matching planets
        if (targetId === "home") {
          // Navigate to the sun/origin
          targetPosition = new THREE.Vector3(0, 0, 0);
          vlog("🏠 Navigating to Home (Sun)");
        } else if (targetId === "about") {
          // Already following the ship - nothing to navigate to
          vlog("ℹ️ Already following ship - 'About' navigation is current view");
          return;
        } else {
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
          const targetPos = targetPosition as THREE.Vector3;
          const distance = shipPos.distanceTo(targetPos);

          vlog(
            `✅ Target found at [${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)}]`,
          );
          vlog(
            `📍 Ship at [${shipPos.x.toFixed(1)}, ${shipPos.y.toFixed(1)}, ${shipPos.z.toFixed(1)}]`,
          );
          vlog(`📏 Distance: ${distance.toFixed(1)} units`);

          navigationTargetRef.current = {
            id: targetId,
            type: targetType,
            position: targetPos,
            startPosition: shipPos.clone(),
            startTime: Date.now(),
            useTurbo: distance > 500,
          };

          vlog(
            `📏 Distance to target: ${distance.toFixed(1)} units ${navigationTargetRef.current.useTurbo ? "(TURBO enabled)" : ""}`,
          );
        } else {
          vlog(`❌ Could not find target: ${targetId}`);
          setCurrentNavigationTarget(null);
        }
      }
    },
    [
      emitterRef,
      exitFocusRequestRef,
      focusedMoonRef,
      followingSpaceshipRef,
      manualFlightModeRef,
      missionLog,
      sceneRef,
      spaceshipRef,
      vlog,
    ],
  );

  const updateAutopilotNavigation = useCallback(() => {
    const ship = spaceshipRef.current;
    if (!ship) return;

    const pathData = spaceshipPathRef.current;

    if (
      !window.lastAutopilotLog ||
      Date.now() - window.lastAutopilotLog > 2000
    ) {
      vlog(
        `🤖 AUTOPILOT: nav=${!!navigationTargetRef.current.id}, system=${!!navigationSystemRef.current?.getStatus().isNavigating}`,
      );
      window.lastAutopilotLog = Date.now();
    }

    if (navigationSystemRef.current) {
      const deltaTime = 0.016;
      const status = navigationSystemRef.current.getStatus();
      if (
        (status.isNavigating && !(window as any).lastNavSystemLog) ||
        Date.now() - ((window as any).lastNavSystemLog || 0) > 2000
      ) {
        vlog(
          `🎯 Nav System Active: ${status.targetId}, dist: ${status.distance?.toFixed(1)}`,
        );
        (window as any).lastNavSystemLog = Date.now();
      }
      navigationSystemRef.current.update(deltaTime);
    }

    if (
      navigationTargetRef.current.id &&
      navigationTargetRef.current.position &&
      navigationTargetRef.current.type === "section"
    ) {
      const target = navigationTargetRef.current;
      const shipPos = ship.position.clone();
      const targetPos = target.position;

      if (!targetPos) {
        vlog("⚠️ Navigation target position is null");
        return;
      }

      const distance = shipPos.distanceTo(targetPos);

      if (
        !target.lastUpdateFrame ||
        Date.now() - target.lastUpdateFrame > 500
      ) {
        setNavigationDistance(distance);
        const estimatedSpeed = target.useTurbo ? 4.0 : 2.0;
        setNavigationETA(distance / estimatedSpeed);
        target.lastUpdateFrame = Date.now();
      }

      const direction = new THREE.Vector3()
        .subVectors(targetPos, shipPos)
        .normalize();

      let targetSpeed = 0.5;
      const decelerationDistance = 100;

      if (distance > decelerationDistance) {
        if (target.useTurbo && distance > 200) {
          targetSpeed = 4.0;
          manualFlightRef.current.acceleration = 1.0;
          manualFlightRef.current.isTurboActive = true;
          if (!target.turboLogged) {
            vlog(`🔥 TURBO MODE: Engaged at distance ${distance.toFixed(1)}`);
            target.turboLogged = true;
          }
        } else {
          targetSpeed = 2.0;
          manualFlightRef.current.acceleration = 0.6;
          manualFlightRef.current.isTurboActive = false;
        }
      } else {
        const progress = distance / decelerationDistance;
        targetSpeed = Math.max(0.1, progress * 2.0);
        manualFlightRef.current.acceleration = progress * 0.6;
        manualFlightRef.current.isTurboActive = false;
        if (!target.decelerationLogged) {
          vlog(`🛑 DECELERATION: Starting at distance ${distance.toFixed(1)}`);
          target.decelerationLogged = true;
        }
      }

      pathData.speed += (targetSpeed - pathData.speed) * 0.05;
      ship.position.add(direction.multiplyScalar(pathData.speed));

      const lookTarget = targetPos.clone();
      ship.lookAt(lookTarget);

      if (followingSpaceshipRef.current && sceneRef.current.controls) {
        const camera = sceneRef.current.camera;
        if (camera) {
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
      }

      if (distance < 20) {
        vlog(`✅ ARRIVED at ${target.id}`);
        vlog(`   Final distance: ${distance.toFixed(2)} units`);
        vlog(
          `   Ship position: [${ship.position.x.toFixed(1)}, ${ship.position.y.toFixed(1)}, ${ship.position.z.toFixed(1)}]`,
        );
        vlog(`   Speed: ${pathData.speed.toFixed(2)}`);

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

        pathData.visitingMoon = false;
        pathData.currentMoonTarget = null;
        vlog(`🧹 Cleared moon visit state`);

        vlog(`🔧 Clearing navigation state and re-enabling controls`);

        if (sceneRef.current.controls) {
          sceneRef.current.controls.enabled = true;
          sceneRef.current.controls.enableZoom = true;
          sceneRef.current.controls.enablePan = true;
          vlog(`🎮 Controls enabled: zoom=true, pan=true`);
        }

        if (target.type === "moon") {
          vlog(
            `🌙 Arrived at moon - showing overlays and enabling exploration`,
          );

          const company = resumeData.experience.find(
            (exp: any) => exp.id === target.id,
          );
          let moonMesh: THREE.Mesh | null = null;

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
                  moonMesh = object;
                }
              }
            }
          });

          if (moonMesh && company) {
            enterMoonViewRef.current?.({
              moonMesh,
              company,
              useFlight: false,
            });
          }
        }

        vlog(`🏁 Navigation complete - exiting navigation block`);
        return;
      }
    }
  }, [
    enterMoonViewRef,
    followingSpaceshipRef,
    manualFlightRef,
    resumeData,
    sceneRef,
    spaceshipPathRef,
    spaceshipRef,
    vlog,
  ]);

  const disposeNavigationSystem = useCallback(() => {
    if (navigationSystemRef.current) {
      navigationSystemRef.current.dispose();
      navigationSystemRef.current = null;
    }
  }, []);

  return {
    currentNavigationTarget,
    navigationDistance,
    navigationETA,
    handleAutopilotNavigation,
    initializeNavigationSystem,
    updateAutopilotNavigation,
    disposeNavigationSystem,
  };
};
