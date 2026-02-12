import type React from "react";
import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import {
  SpaceshipNavigationSystem,
  type NavigationStatus,
} from "../../SpaceshipNavigationSystem";
import type { SceneRef } from "../ResumeSpace3D.types";

// ── PLANET VIEWPOINTS ─────────────────────────────────────────────
// Each entry defines a camera offset relative to the planet centre.
// The ship will fly to a staging point along this axis, and the
// camera will end up at approximately the captured position.
//
// To add new viewpoints:
//   1. Navigate to a planet, orbit/zoom the camera to the desired view
//   2. Press Shift+F8 or run __captureViewpoint("planetName") in console
//   3. Copy the offset from the console output and paste it here
//   4. Multiple entries per planet → random selection each visit
// ─────────────────────────────────────────────────────────────────
interface PlanetViewpoint {
  offset: { x: number; y: number; z: number };
  distance: number;
}

const PLANET_VIEWPOINTS: Record<string, PlanetViewpoint[]> = {
  experience: [
    { offset: { x: -15.8, y: 344.5, z: 131.8 }, distance: 369.1 },
  ],
  // skills: [],
  // projects: [],
};

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
  shipRollOffsetRef: React.MutableRefObject<number>;
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
    shipRollOffsetRef,
  } = deps;

  // Reusable objects for baking the user's roll offset into lookAt quaternions
  const _rollAxis = useRef(new THREE.Vector3());
  const _rollQuat = useRef(new THREE.Quaternion());

  /** Apply the user's manual roll offset to a quaternion (in-place). */
  const applyRollOffset = (quat: THREE.Quaternion) => {
    const rollAngle = shipRollOffsetRef.current;
    if (Math.abs(rollAngle) > 0.0001) {
      // Roll around the quaternion's local Z axis
      _rollQuat.current.setFromAxisAngle(
        _rollAxis.current.set(0, 0, 1),
        rollAngle,
      );
      quat.multiply(_rollQuat.current);
    }
  };

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
    turnPhase?: "turning" | "pausing" | "traveling" | "settling";
    turnStartTime?: number;
    turnPauseStartTime?: number;
    turnStartQuat?: THREE.Quaternion;
    turnTargetQuat?: THREE.Quaternion;
    // Pending moon navigation — delayed until turn completes
    pendingMoonId?: string;
    pendingMoonTurbo?: boolean;
    // Orbital approach: the real planet centre (position is the staging point)
    planetCenter?: THREE.Vector3;
    // Gentle arc travel: an intermediate waypoint near the planet at the
    // ship's starting altitude, and the initial distance for progress calc.
    arcMidPoint?: THREE.Vector3;
    arcInitialDistance?: number;
    settleStartTime?: number;
    settleStartQuat?: THREE.Quaternion;
    settleTargetQuat?: THREE.Quaternion;
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

  // After a planet-approach settle, the camera should orbit around the
  // planet centre (not the ship) to keep the perpendicular view.
  // Cleared when new navigation starts.
  const settledViewTargetRef = useRef<THREE.Vector3 | null>(null);

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

      // Clear any prior avoidance / settled-view state from previous navigation
      sectionAvoidWaypoint.current = null;
      sectionAvoidCooldown.current = 0;
      settledViewTargetRef.current = null;

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

        // Compute facing quaternion toward moon (preserving user roll)
        const turnTargetQuat = new THREE.Quaternion();
        if (currentPos) {
          const tmpObj = new THREE.Object3D();
          tmpObj.position.copy(ship.position);
          tmpObj.lookAt(currentPos.worldPosition);
          turnTargetQuat.copy(tmpObj.quaternion);
          applyRollOffset(turnTargetQuat);
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
          const planetCenter = (targetPosition as THREE.Vector3).clone();
          const distance = shipPos.distanceTo(planetCenter);

          vlog(
            `✅ Target found at [${planetCenter.x.toFixed(1)}, ${planetCenter.y.toFixed(1)}, ${planetCenter.z.toFixed(1)}]`,
          );
          vlog(
            `📍 Ship at [${shipPos.x.toFixed(1)}, ${shipPos.y.toFixed(1)}, ${shipPos.z.toFixed(1)}]`,
          );
          vlog(`📏 Distance: ${distance.toFixed(1)} units`);

          // ── ORBITAL APPROACH ──────────────────────────────────────
          // Use a user-defined viewpoint if available for this planet,
          // otherwise fall back to a random above/below staging point.
          // The staging point is where the SHIP parks; the camera is
          // then placed ~80 u further along the same axis during settle.
          const viewpoints = PLANET_VIEWPOINTS[targetId.toLowerCase()];
          let stagingPoint: THREE.Vector3;

          if (viewpoints && viewpoints.length > 0) {
            // Pick a random viewpoint
            const vp =
              viewpoints[Math.floor(Math.random() * viewpoints.length)];
            const camOffset = new THREE.Vector3(vp.offset.x, vp.offset.y, vp.offset.z);
            // Camera would be at planetCenter + camOffset.
            // Ship parks 80 u closer to the planet along the same axis.
            const dir = camOffset.clone().normalize();
            stagingPoint = planetCenter
              .clone()
              .add(camOffset)
              .addScaledVector(dir, -80);

            vlog(
              `🛸 Using viewpoint preset for "${targetId}" (${viewpoints.length} available)`,
            );
          } else {
            // Fallback: random above/below
            const upOrDown = Math.random() > 0.5 ? 1 : -1;
            const heightOffset = Math.max(targetRadius * 6, 200);
            stagingPoint = new THREE.Vector3(
              planetCenter.x,
              planetCenter.y + upOrDown * heightOffset,
              planetCenter.z,
            );
            vlog(
              `🛸 Orbital approach: ${upOrDown > 0 ? "ABOVE" : "BELOW"} system at height ${heightOffset.toFixed(0)}u`,
            );
          }

          vlog(
            `   Staging point: [${stagingPoint.x.toFixed(1)}, ${stagingPoint.y.toFixed(1)}, ${stagingPoint.z.toFixed(1)}]`,
          );

          const distToStaging = shipPos.distanceTo(stagingPoint);

          // Arc mid-point: a position near the planet at the ship's
          // starting altitude.  The ship approaches horizontally toward
          // this point, then curves up/down to the staging point,
          // creating a gentle arc rather than a straight-line flight.
          const arcMidPoint = new THREE.Vector3(
            planetCenter.x,
            shipPos.y,
            planetCenter.z,
          );

          // The initial turn faces the arc mid-point (horizontal approach)
          // rather than the staging point directly.
          const turnTargetQuat = new THREE.Quaternion();
          const tmpObj = new THREE.Object3D();
          tmpObj.position.copy(spaceshipRef.current.position);
          tmpObj.lookAt(arcMidPoint);
          turnTargetQuat.copy(tmpObj.quaternion);
          applyRollOffset(turnTargetQuat);

          navigationTargetRef.current = {
            id: targetId,
            type: targetType,
            position: stagingPoint,
            startPosition: shipPos.clone(),
            startTime: Date.now(),
            useTurbo: distToStaging > 500,
            targetRadius,
            turnPhase: "turning",
            turnStartTime: performance.now(),
            turnStartQuat: spaceshipRef.current.quaternion.clone(),
            turnTargetQuat,
            planetCenter,
            arcMidPoint,
            arcInitialDistance: distToStaging,
          };

          vlog(
            `📏 Distance to staging: ${distToStaging.toFixed(1)} units ${navigationTargetRef.current.useTurbo ? "(TURBO enabled)" : ""}`,
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

      // ── SETTLING PHASE: ship has reached the staging point and now
      // smoothly rotates to face the planet center from above/below.
      // The camera moves behind the ship on the same axis so both
      // ship nose and camera point straight at the planet — giving a
      // perpendicular view of the orbital plane. ──
      if (target.turnPhase === "settling") {
        const SETTLE_DURATION = 2.0; // seconds — smooth, cinematic turn
        const elapsed =
          (performance.now() - (target.settleStartTime || 0)) / 1000;
        const t = Math.min(elapsed / SETTLE_DURATION, 1);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        if (target.settleStartQuat && target.settleTargetQuat) {
          ship.quaternion
            .copy(target.settleStartQuat)
            .slerp(target.settleTargetQuat, eased);
        }

        // Position camera on the same axis as ship→planet, further
        // behind the ship.  Both the ship and camera look at the
        // planet centre, perpendicular to the orbital plane.
        if (
          followingSpaceshipRef.current &&
          !insideShipRef.current &&
          sceneRef.current.controls &&
          target.planetCenter
        ) {
          // Direction from planet to ship (the "up" axis of the view)
          const awayFromPlanet = _navCamPos.current
            .subVectors(ship.position, target.planetCenter)
            .normalize();

          // Camera is 80 units further along that same axis
          const camPos = ship.position
            .clone()
            .addScaledVector(awayFromPlanet, 80);

          sceneRef.current.controls.setLookAt(
            camPos.x, camPos.y, camPos.z,
            target.planetCenter.x,
            target.planetCenter.y,
            target.planetCenter.z,
            true,
          );
        }

        if (t >= 1) {
          vlog("🛸 Settle complete — ship now facing planet system");

          // ── Directly run arrival cleanup here instead of falling
          // through to the travel code, which would override the
          // ship's settled orientation and camera position. ──
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
          if (sceneRef.current.controls) {
            sceneRef.current.controls.enabled = true;
          }
          vlog("🏁 Planet approach complete");
          return;
        }
        return; // Still settling — don't move or check arrival
      }

      // Arrival distance depends on whether we're heading to a staging
      // point (orbital approach) or directly to a body.
      const planetRadius = target.targetRadius || 20;
      const arrivalDistance = target.planetCenter
        ? 30 // Get close to the staging point before settling
        : Math.max(planetRadius * 4, 80);

      // ── TRAVEL PHASE: move toward target with obstacle avoidance ──
      // targetPos is guaranteed non-null here (moon-turn phases return
      // earlier, and section travel exits if targetPos is null).
      if (!targetPos) return;

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

      // Steer target: for orbital approaches, blend between the arc
      // mid-point (horizontal approach) and the staging point (vertical
      // ascent/descent) based on travel progress to create a gentle arc.
      let steerTarget: THREE.Vector3;
      if (sectionAvoidWaypoint.current) {
        steerTarget = sectionAvoidWaypoint.current;
      } else if (target.arcMidPoint && target.arcInitialDistance) {
        // Progress 0→1 from start to staging point
        const arcProgress = 1 - Math.min(distance / target.arcInitialDistance, 1);
        // Ease-in: steer more toward staging point as we get closer
        const blend = arcProgress * arcProgress;
        steerTarget = target.arcMidPoint.clone().lerp(targetPos, blend);
      } else {
        steerTarget = targetPos;
      }
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
      applyRollOffset(ship.quaternion);

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
        // ── For sections: transition to "settling" phase where the ship
        // turns to face the planet centre from the staging point, giving
        // the user a top-down or bottom-up view of the system. ──
        if (target.type === "section" && target.planetCenter) {
          vlog(`🛸 Reached staging point — settling to face planet`);
          pathData.speed = 0;

          // Compute the quaternion to face the planet centre from here.
          // The staging point is almost directly above/below the planet,
          // so the look direction is nearly along the Y axis.  The default
          // Object3D.lookAt uses (0,1,0) as up — which becomes degenerate
          // when looking straight down or up.  Use Matrix4.lookAt with a
          // safe up vector (world +Z) instead.
          const dir = new THREE.Vector3()
            .subVectors(target.planetCenter, ship.position)
            .normalize();
          // Choose an up vector that isn't parallel to the look direction
          const safeUp = Math.abs(dir.y) > 0.9
            ? new THREE.Vector3(0, 0, 1)
            : new THREE.Vector3(0, 1, 0);
          const settleMatrix = new THREE.Matrix4().lookAt(
            ship.position,
            target.planetCenter,
            safeUp,
          );
          const settleQuat = new THREE.Quaternion().setFromRotationMatrix(
            settleMatrix,
          );
          // Flip 180° around Y so the cockpit (visual front) faces
          // the planet instead of the rear.
          const flip180 = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            Math.PI,
          );
          settleQuat.multiply(flip180);
          applyRollOffset(settleQuat);

          // Set the settled view target NOW so the render loop's follow
          // camera orbits around the planet (not the ship) during the
          // entire settling animation — preventing a camera jump.
          settledViewTargetRef.current = target.planetCenter.clone();

          target.turnPhase = "settling";
          target.settleStartTime = performance.now();
          target.settleStartQuat = ship.quaternion.clone();
          target.settleTargetQuat = settleQuat;
          return;
        }

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
    settledViewTargetRef,
    handleAutopilotNavigation,
    initializeNavigationSystem,
    updateAutopilotNavigation,
    disposeNavigationSystem,
  };
};
