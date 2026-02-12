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
  shipCinematicRef: React.MutableRefObject<{ active: boolean } | null>;
  insideShipRef: React.MutableRefObject<boolean>;
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
    shipCinematicRef,
    insideShipRef,
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
    targetRadius?: number; // actual radius of the destination body
    lastUpdateFrame?: number;
    turboLogged?: boolean;
    decelerationLogged?: boolean;
    // Turn-toward-target phase: ship rotates to face destination before moving
    turnPhase?: "turning" | "pausing" | "traveling";
    turnStartTime?: number;
    turnPauseStartTime?: number;
    turnStartQuat?: THREE.Quaternion;
    turnTargetQuat?: THREE.Quaternion;
    // Pending moon navigation — delayed until turn completes
    pendingMoonId?: string;
    pendingMoonTurbo?: boolean;
  }>({
    id: null,
    type: null,
    position: null,
    startPosition: null,
    startTime: 0,
    useTurbo: false,
  });

  const navigationSystemRef = useRef<SpaceshipNavigationSystem | null>(null);

  // Exposed to render loop: true while the ship is in the "turning" phase
  const navTurnActiveRef = useRef(false);

  // Scratch vectors for obstacle avoidance (reused to avoid GC pressure)
  const _avoidDir = useRef(new THREE.Vector3());
  const _avoidToObs = useRef(new THREE.Vector3());
  const _avoidClosest = useRef(new THREE.Vector3());
  const _avoidLateral = useRef(new THREE.Vector3());

  // Section-travel avoidance state
  const sectionAvoidWaypoint = useRef<THREE.Vector3 | null>(null);
  const sectionAvoidCooldown = useRef(0); // timestamp

  // ── Shared obstacle gathering for both nav paths ──────────────
  // Scans the scene for all celestial bodies (sun, planets, moons)
  // and returns them with realistic collision radii + safety margin.
  const gatherObstacles = useCallback(
    (excludeTargetId: string | null) => {
      const obstacles: {
        id: string;
        position: THREE.Vector3;
        radius: number;
      }[] = [];

      const scene = sceneRef.current.scene;
      if (!scene) return obstacles;

      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;

        const ud = obj.userData;

        // ── Sun ───────────────────────────────────────────
        if (ud.isSun) {
          obstacles.push({
            id: "sun",
            position: obj.getWorldPosition(new THREE.Vector3()),
            radius: 200, // actual radius 60, glow sprite 180 — keep well clear
          });
          return;
        }

        // ── Planets & Moons ──────────────────────────────
        if (ud.isPlanet) {
          const id = ud.moonId || ud.systemId || ud.planetName || "";
          // Don't include the destination as an obstacle
          if (excludeTargetId && (id === excludeTargetId || ud.planetName === excludeTargetId)) return;

          // Get actual geometry radius and add safety margin
          const geo = obj.geometry;
          let actualRadius = 20; // fallback
          if (geo && geo.parameters && (geo.parameters as any).radius) {
            actualRadius = (geo.parameters as any).radius;
          }

          // Safety margin: 3x actual radius for planets, 4x for moons
          // (moons are small — need proportionally more clearance)
          const safetyMultiplier = ud.isMoon ? 4 : 3;

          obstacles.push({
            id,
            position: obj.getWorldPosition(new THREE.Vector3()),
            radius: actualRadius * safetyMultiplier,
          });
        }
      });

      return obstacles;
    },
    [sceneRef],
  );

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
        return gatherObstacles(
          navigationSystemRef.current?.getStatus().targetId ?? null,
        );
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

      if (manualFlightModeRef.current) {
        vlog("⚠️ Navigation unavailable in manual flight mode");
        return;
      }

      if (!followingSpaceshipRef.current) {
        // Auto-engage ship follow if we were called while the ship exists
        // (e.g. click-to-navigate while inside ship sets followingSpaceship)
        vlog("⚠️ Ship follow not active — cannot use autopilot");
        return;
      }

      // ── Stop cinematic hover/orbit so the ship can move ────────
      // The render loop's cinematic branch blocks autopilot updates,
      // so we must deactivate it before the ship can navigate.
      if (shipCinematicRef.current?.active) {
        vlog("🎬 Deactivating cinematic to allow navigation");
        shipCinematicRef.current.active = false;
      }

      if (!navigationSystemRef.current) {
        vlog("⚠️ Navigation system not initialized");
        return;
      }

      vlog(`🎯 Autopilot navigation to ${targetType}: ${targetId}`);

      // Clear any prior avoidance state from previous navigation
      sectionAvoidWaypoint.current = null;
      sectionAvoidCooldown.current = 0;

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

        const ship = spaceshipRef.current!;
        vlog(`🎯 Starting turn toward moon: ${moonId}`);

        // Compute facing quaternion toward moon
        const turnTargetQuat = new THREE.Quaternion();
        if (currentPos) {
          const tmpObj = new THREE.Object3D();
          tmpObj.position.copy(ship.position);
          tmpObj.lookAt(currentPos.worldPosition);
          turnTargetQuat.copy(tmpObj.quaternion);
        }

        // Set up turn phase — navigateToObject is delayed until turn completes
        navigationTargetRef.current = {
          id: targetId,
          type: targetType,
          position: currentPos?.worldPosition ?? null,
          startPosition: ship.position.clone(),
          startTime: Date.now(),
          useTurbo,
          turnPhase: "turning",
          turnStartTime: performance.now(),
          turnStartQuat: ship.quaternion.clone(),
          turnTargetQuat,
          pendingMoonId: moonId,
          pendingMoonTurbo: useTurbo,
        };
        setCurrentNavigationTarget(targetId);
        vlog(
          `✅ Turn initiated toward moon: ${targetId} (turbo: ${useTurbo})`,
        );
        missionLog(
          `🎯 NAVIGATION INITIATED: Target - ${targetId} | Distance: ${currentPos ? spaceshipRef.current!.position.distanceTo(currentPos.worldPosition).toFixed(0) : "unknown"}u`,
        );
      } else if (targetType === "section") {
        let targetPosition: THREE.Vector3 | null = null;
        let targetName = targetId;
        let targetRadius = 60; // default (sun)

        // Special handling for section targets that don't have matching planets
        if (targetId === "home") {
          // Navigate to the sun/origin
          targetPosition = new THREE.Vector3(0, 0, 0);
          targetRadius = 60; // sun radius
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
                // Extract actual geometry radius
                const geo = object.geometry;
                if (geo && geo.parameters && (geo.parameters as any).radius) {
                  targetRadius = (geo.parameters as any).radius;
                }
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

          // Compute the quaternion the ship needs to face the target
          const turnTargetQuat = new THREE.Quaternion();
          const tmpObj = new THREE.Object3D();
          tmpObj.position.copy(spaceshipRef.current.position);
          tmpObj.lookAt(targetPos);
          turnTargetQuat.copy(tmpObj.quaternion);

          navigationTargetRef.current = {
            id: targetId,
            type: targetType,
            position: targetPos,
            startPosition: shipPos.clone(),
            startTime: Date.now(),
            useTurbo: distance > 500,
            targetRadius,
            turnPhase: "turning",
            turnStartTime: performance.now(),
            turnStartQuat: spaceshipRef.current.quaternion.clone(),
            turnTargetQuat,
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
      shipCinematicRef,
      missionLog,
      sceneRef,
      spaceshipRef,
      vlog,
    ],
  );

  // Reusable scratch vectors — avoid per-frame allocations
  const _navDir = useRef(new THREE.Vector3());
  const _navCamPos = useRef(new THREE.Vector3());

  const updateAutopilotNavigation = useCallback(() => {
    const ship = spaceshipRef.current;
    if (!ship) return;

    const pathData = spaceshipPathRef.current;
    const now = Date.now();

    if (!window.lastAutopilotLog || now - window.lastAutopilotLog > 2000) {
      vlog(
        `🤖 AUTOPILOT: nav=${!!navigationTargetRef.current.id}, system=${!!navigationSystemRef.current?.getStatus().isNavigating}`,
      );
      window.lastAutopilotLog = now;
    }

    if (navigationSystemRef.current) {
      const deltaTime = 0.016;
      const status = navigationSystemRef.current.getStatus();
      if (
        (status.isNavigating && !(window as any).lastNavSystemLog) ||
        now - ((window as any).lastNavSystemLog || 0) > 2000
      ) {
        vlog(
          `🎯 Nav System Active: ${status.targetId}, dist: ${status.distance?.toFixed(1)}`,
        );
        (window as any).lastNavSystemLog = now;
      }
      navigationSystemRef.current.update(deltaTime);
    }

    // Handle both section travel AND moon turn phase
    const navTarget = navigationTargetRef.current;
    const isSectionTravel =
      navTarget.id && navTarget.position && navTarget.type === "section";
    const isMoonTurnPhase =
      navTarget.id &&
      navTarget.type === "moon" &&
      (navTarget.turnPhase === "turning" || navTarget.turnPhase === "pausing");

    if (isSectionTravel || isMoonTurnPhase) {
      const target = navigationTargetRef.current;
      const targetPos = target.position;

      // For section travel, targetPos is required for movement
      // For moon turn phase, we only need the quaternion slerp
      if (!targetPos && !isMoonTurnPhase) {
        vlog("⚠️ Navigation target position is null");
        return;
      }

      const distance = targetPos
        ? ship.position.distanceTo(targetPos)
        : 0;

      if (targetPos && (!target.lastUpdateFrame || now - target.lastUpdateFrame > 500)) {
        setNavigationDistance(distance);
        const estimatedSpeed = target.useTurbo ? 4.0 : 2.0;
        setNavigationETA(distance / estimatedSpeed);
        target.lastUpdateFrame = now;
      }

      // ── TURN PHASE: smoothly rotate ship toward target before moving ──
      if (target.turnPhase === "turning") {
        navTurnActiveRef.current = true;
        const TURN_DURATION = 1.5; // seconds
        const elapsed =
          (performance.now() - (target.turnStartTime || 0)) / 1000;
        const t = Math.min(elapsed / TURN_DURATION, 1);
        // Smooth ease-in-out
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        if (target.turnStartQuat && target.turnTargetQuat) {
          ship.quaternion
            .copy(target.turnStartQuat)
            .slerp(target.turnTargetQuat, eased);
        }

        // In 3rd person: gently swing the camera to look toward the destination
        if (
          !insideShipRef.current &&
          followingSpaceshipRef.current &&
          sceneRef.current.controls
        ) {
          const camPos = _navCamPos.current;
          // Camera behind ship, facing the destination
          camPos.set(0, 0, -1).applyQuaternion(ship.quaternion);
          camPos.multiplyScalar(60).add(ship.position);
          camPos.y += 25;

          sceneRef.current.controls.setLookAt(
            camPos.x,
            camPos.y,
            camPos.z,
            ship.position.x,
            ship.position.y,
            ship.position.z,
            true,
          );
        }

        if (t >= 1) {
          // Turn finished — enter a brief pause before travel begins
          target.turnPhase = "pausing";
          target.turnPauseStartTime = performance.now();
          navTurnActiveRef.current = false;
          vlog("🔄 Turn complete — pausing before travel");
        }
        return; // Don't move yet, just rotate
      }

      // ── PAUSE PHASE: short beat after turn, before travel ──
      if (target.turnPhase === "pausing") {
        const PAUSE_DURATION = 500; // ms
        const pauseElapsed =
          performance.now() - (target.turnPauseStartTime || 0);

        if (pauseElapsed >= PAUSE_DURATION) {
          // If this was a moon turn, start the navigation system now
          if (target.pendingMoonId && navigationSystemRef.current) {
            const success = navigationSystemRef.current.navigateToObject(
              target.pendingMoonId,
              target.pendingMoonTurbo ?? true,
            );
            if (success) {
              vlog(`▶️ Pause done — moon navigation started: ${target.pendingMoonId}`);
            }
            // Clear the section-type navigation since moon system takes over
            navigationTargetRef.current = {
              id: target.id,
              type: target.type,
              position: null,
              startPosition: null,
              startTime: 0,
              useTurbo: false,
            };
          } else {
            target.turnPhase = "traveling";
            pathData.speed = 0; // start from zero speed
            vlog("▶️ Pause done — beginning travel");
          }
        }
        return; // Hold position during pause
      }

      // Arrival distance: stop at a comfortable viewing distance from the body.
      // Use 4x the target's radius (or min 80 units) so we can see the
      // planet and its moons from a nice orbital perspective.
      const planetRadius = target.targetRadius || 20;
      const arrivalDistance = Math.max(planetRadius * 4, 80);

      // ── TRAVEL PHASE: move toward target with obstacle avoidance ──

      // --- Obstacle avoidance for section travel ---
      // Check if the straight-line path to the target intersects any
      // celestial body. If so, compute a lateral waypoint to route around.
      const avoidWp = sectionAvoidWaypoint.current;
      if (
        distance > 50 &&
        !avoidWp &&
        now > sectionAvoidCooldown.current
      ) {
        const obstacles = gatherObstacles(target.id);
        const dir = _avoidDir.current.subVectors(targetPos, ship.position).normalize();
        const segLen = distance;

        for (const obs of obstacles) {
          const toObs = _avoidToObs.current.subVectors(obs.position, ship.position);
          const proj = toObs.dot(dir);
          const t = Math.max(0, Math.min(1, proj / Math.max(segLen, 0.001)));
          const closest = _avoidClosest.current
            .copy(ship.position)
            .addScaledVector(dir, segLen * t);
          const distToPath = obs.position.distanceTo(closest);

          if (distToPath < obs.radius) {
            // Path is blocked — compute lateral waypoint
            const up = new THREE.Vector3(0, 1, 0);
            const lateral = _avoidLateral.current.crossVectors(dir, up);
            if (lateral.lengthSq() < 0.0001) lateral.set(1, 0, 0);
            lateral.normalize();

            // Deterministic: steer to the side the ship is already on
            const shipSide = toObs.dot(lateral);
            const sign = shipSide < 0 ? 1 : -1;
            const avoidOffset = obs.radius * 1.3;

            sectionAvoidWaypoint.current = obs.position
              .clone()
              .addScaledVector(lateral, avoidOffset * sign);
            sectionAvoidWaypoint.current.y = ship.position.y; // keep altitude
            sectionAvoidCooldown.current = now + 1500; // prevent re-trigger

            vlog(
              `🛰️ AVOIDANCE: Routing around ${obs.id} (${(avoidOffset * sign).toFixed(0)}u lateral)`,
            );
            break;
          }
        }
      }

      // If we have an avoidance waypoint, check if we've passed it
      if (avoidWp) {
        const distToWp = ship.position.distanceTo(avoidWp);
        if (distToWp < 40) {
          // Cleared the obstacle — resume direct path
          sectionAvoidWaypoint.current = null;
          vlog("✅ Avoidance waypoint cleared — resuming direct path");
        }
      }

      // Steer toward avoidance waypoint if active, otherwise toward target
      const steerTarget = sectionAvoidWaypoint.current || targetPos;
      const direction = _navDir.current
        .subVectors(steerTarget, ship.position)
        .normalize();

      let targetSpeed = 0.5;
      // Start decelerating well before the arrival zone for a smooth stop
      const decelerationDistance = arrivalDistance + 80;

      if (distance > decelerationDistance) {
        if (target.useTurbo && distance > 200) {
          targetSpeed = sectionAvoidWaypoint.current ? 2.0 : 4.0; // slow down for avoidance
          manualFlightRef.current.acceleration = sectionAvoidWaypoint.current ? 0.6 : 1.0;
          manualFlightRef.current.isTurboActive = !sectionAvoidWaypoint.current;
          if (!target.turboLogged && !sectionAvoidWaypoint.current) {
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
      ship.position.addScaledVector(direction, pathData.speed);

      ship.lookAt(steerTarget);

      // Only update exterior follow camera when NOT inside the ship —
      // the interior camera block in the render loop handles cockpit/cabin.
      if (
        followingSpaceshipRef.current &&
        !insideShipRef.current &&
        sceneRef.current.controls
      ) {
        const camPos = _navCamPos.current;
        camPos.set(0, 0, -1).applyQuaternion(ship.quaternion);
        camPos.multiplyScalar(60).add(ship.position);
        camPos.y += 25;

        sceneRef.current.controls.setLookAt(
          camPos.x, camPos.y, camPos.z,
          ship.position.x, ship.position.y, ship.position.z,
          true,
        );
      }

      if (distance < arrivalDistance) {
        vlog(`✅ ARRIVED at ${target.id}`);
        vlog(`   Final distance: ${distance.toFixed(2)} units`);
        vlog(
          `   Ship position: [${ship.position.x.toFixed(1)}, ${ship.position.y.toFixed(1)}, ${ship.position.z.toFixed(1)}]`,
        );
        vlog(`   Speed: ${pathData.speed.toFixed(2)}`);

        setCurrentNavigationTarget(null);
        setNavigationDistance(null);
        setNavigationETA(null);
        navTurnActiveRef.current = false;
        sectionAvoidWaypoint.current = null;
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
          vlog(`🎮 Controls re-enabled`);
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
    insideShipRef,
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
    navTurnActiveRef,
    handleAutopilotNavigation,
    initializeNavigationSystem,
    updateAutopilotNavigation,
    disposeNavigationSystem,
  };
};
