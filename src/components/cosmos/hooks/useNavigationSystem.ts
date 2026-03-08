import type React from "react";
import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import {
  SpaceshipNavigationSystem,
  type NavigationStatus,
} from "../../SpaceshipNavigationSystem";
import type { DiagramStyleOptions } from "../../DiagramSettings";
import type { SceneRef } from "../ResumeSpace3D.types";
import {
  SUN_OBSTACLE_RADIUS,
  NAV_FALLBACK_PLANET_R,
  NAV_MAX_SPEED,
  NAV_TURBO_SPEED,
  NAV_DECEL_DISTANCE,
  NAV_ARRIVAL_DIST,
  NAV_FREEZE_DIST,
  NAV_CAMERA_BEHIND,
  NAV_CAMERA_HEIGHT,
  NAV_SETTLE_OFFSET,
  NAV_CRUISE_SPEED,
  NAV_CRUISE_ENGAGE_DIST,
  NAV_CRUISE_LERP,
  NAV_TURBO_ENGAGE_DIST,
  NAV_WAYPOINT_CLEAR,
  NAV_TURBO_THRESHOLD,
  NAV_DECEL_EXTRA,
  NAV_LIGHTSPEED,
  NAV_LIGHTSPEED_ENGAGE_DIST,
  NAV_LIGHTSPEED_DECEL_DIST,
  NAV_LIGHTSPEED_LERP,
} from "../scaleConfig";

const NAV_REPEAT_SECTION_EPSILON = 1.5;
const NAV_MOVEMENT_HEARTBEAT_LOGS = false;
const NAV_DOUBLE_CLICK_TRACE_LOGS = true;
const NAV_TRACE_TO_SHIP_LOG = true;
const NAV_ORBIT_EXIT_CLEAR_AWAY_BLEND = 0.4; // 40% biased away from moon surface
const NAV_ORBIT_EXIT_CLEAR_MIN_DIST = 180;
const NAV_ORBIT_EXIT_CLEAR_MAX_DIST = 320;
const NAV_ORBIT_EXIT_CLEAR_SPEED = 0.9;
const NAV_MOON_ARRIVAL_DISTANCE = 36;
const NAV_MOON_FREEZE_DISTANCE = 42;
const NAV_PLANET_STAGING_MIN_DIST = 1680;
const NAV_PLANET_STAGING_RADIUS_MULT = 15.2;

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
  shipLog: (message: string, category?: "nav" | "orbit" | "system" | "info" | "cmd" | "error") => void;
  debugLog: (source: string, message: string) => void;
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
  optionsRef: React.MutableRefObject<DiagramStyleOptions>;
  /** When true, Falcon is escorting the Star Destroyer */
  followingStarDestroyerRef: React.MutableRefObject<boolean>;
  /** Set React state for SD escort (paired with the ref) */
  setFollowingStarDestroyer: (v: boolean) => void;
  /** Optional non-planet section anchors (e.g., Projects trench) */
  resolveSpecialSectionTarget?: (targetId: string) => THREE.Vector3 | null;
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
    shipLog,
    debugLog,
    manualFlightRef,
    spaceshipPathRef,
    enterMoonViewRef,
    shipRollOffsetRef,
    optionsRef,
    followingStarDestroyerRef,
    setFollowingStarDestroyer,
    resolveSpecialSectionTarget,
  } = deps;

  const navTraceLastAtRef = useRef<Record<string, number>>({});
  const navTrace = (method: string, detail?: string, throttleMs = 0) => {
    if (!NAV_DOUBLE_CLICK_TRACE_LOGS) return;
    const now = Date.now();
    const key = `${method}:${detail || ""}`;
    const lastAt = navTraceLastAtRef.current[key] || 0;
    if (throttleMs > 0 && now - lastAt < throttleMs) return;
    navTraceLastAtRef.current[key] = now;
    const msg = `🧭 TRACE ${method}${detail ? ` | ${detail}` : ""}`;
    vlog(msg);
    if (NAV_TRACE_TO_SHIP_LOG) {
      shipLog(msg, "nav");
    }
  };

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

  type MoonDepartureContext = {
    moonCenter: THREE.Vector3;
    moonRadius: number;
  };

  /** Callback fired when ship arrives at a moon — set by ResumeSpace3D to trigger orbit */
  const onMoonOrbitArrivalRef = useRef<
    ((moonMesh: THREE.Mesh, company: any) => void) | null
  >(null);

  const navigationTargetRef = useRef<{
    id: string | null;
    type: "section" | "moon" | null;
    position: THREE.Vector3 | null;
    startPosition: THREE.Vector3 | null;
    startTime: number;
    useTurbo: boolean;
    forceLightspeed?: boolean;
    targetRadius?: number; // actual radius of the destination body
    lastUpdateFrame?: number;
    cruiseLogged?: boolean;
    turboLogged?: boolean;
    lightspeedLogged?: boolean;
    lightspeedBurstUntil?: number;
    decelerationLogged?: boolean;
    // Turn-toward-target phase: ship rotates to face destination before moving
    turnPhase?: "clearing" | "turning" | "pausing" | "traveling" | "settling";
    turnStartTime?: number;
    turnPauseStartTime?: number;
    cameraAlignStartTime?: number;
    turnStartQuat?: THREE.Quaternion;
    turnTargetQuat?: THREE.Quaternion;
    clearanceTarget?: THREE.Vector3;
    clearanceDistance?: number;
    // Pending moon navigation — delayed until turn completes
    pendingMoonId?: string;
    pendingMoonTurbo?: boolean;
    pendingMoonInterSystem?: boolean;
    // Orbital approach: the real planet centre (position is the staging point)
    planetCenter?: THREE.Vector3;
    // Gentle arc travel: an intermediate waypoint near the planet at the
    // ship's starting altitude, and the initial distance for progress calc.
    arcMidPoint?: THREE.Vector3;
    arcFinalApproachPoint?: THREE.Vector3;
    arcInitialDistance?: number;
    arcPassedMidPoint?: boolean;
    aboutFailSafeLogged?: boolean;
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
  const activeMoonLightspeedRef = useRef<string | null>(null);

  // Exposed to render loop: true while the ship is in the "turning" phase
  const navTurnActiveRef = useRef(false);

  // Scratch vectors for obstacle avoidance (reused to avoid GC pressure)
  const _avoidDir = useRef(new THREE.Vector3());
  const _avoidToObs = useRef(new THREE.Vector3());
  const _avoidClosest = useRef(new THREE.Vector3());
  const _avoidLateral = useRef(new THREE.Vector3());
  const _deflectPush = useRef(new THREE.Vector3());

  // Section-travel avoidance state
  const sectionAvoidWaypoint = useRef<THREE.Vector3 | null>(null);
  const sectionAvoidCooldown = useRef(0); // timestamp
  // Keep deterministic fallback staging side per section target.
  // This prevents repeated clicks on the same planet from randomly
  // picking opposite staging hemispheres.
  const sectionFallbackSideRef = useRef<Record<string, 1 | -1>>({});

  // After a planet-approach settle, the camera should orbit around the
  // planet centre (not the ship) to keep the perpendicular view.
  // Cleared when new navigation starts.
  const settledViewTargetRef = useRef<THREE.Vector3 | null>(null);

  // ── Shared obstacle gathering for both nav paths ──────────────
  // Scans the scene for all celestial bodies (sun, planets, moons)
  // and returns them with realistic collision radii + safety margin.
  const gatherObstacles = useCallback(
    (excludeTargetId: string | null) => {
      navTrace(
        "gatherObstacles()",
        `exclude=${excludeTargetId ?? "none"}`,
        1500,
      );
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
            radius: SUN_OBSTACLE_RADIUS, // actual radius 60, glow sprite 180 — keep well clear
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
          let actualRadius = NAV_FALLBACK_PLANET_R; // fallback
          if (geo && geo.parameters && (geo.parameters as any).radius) {
            actualRadius = (geo.parameters as any).radius;
          }

          // Safety margin: scaled bodies are much larger now — use modest
          // clearance so the ship doesn't zigzag through empty space.
          // Planet radius + 40 units ≈ 1.3–1.4× radius (plenty of visual gap).
          // Moon radius + 20 units ≈ 1.5–1.7× radius.
          const safetyMargin = ud.isMoon ? 20 : 40;
          const safetyMultiplier = (actualRadius + safetyMargin) / actualRadius;

          obstacles.push({
            id,
            position: obj.getWorldPosition(new THREE.Vector3()),
            radius: actualRadius * safetyMultiplier,
          });
        }
      });

      navTrace("gatherObstacles() result", `count=${obstacles.length}`, 1500);
      return obstacles;
    },
    [sceneRef],
  );

  const resolveMoonSystemId = useCallback(
    (moonId: string): string | null => {
      const scene = sceneRef.current.scene;
      if (!scene) return null;
      let sid: string | null = null;
      scene.traverse((obj) => {
        if (sid || !(obj instanceof THREE.Mesh)) return;
        const ud = obj.userData as any;
        if (ud?.moonId === moonId || ud?.planetName?.toLowerCase?.().replace(/\s+/g, "-") === moonId.replace(/^moon-/, "")) {
          sid = (ud.systemId as string | undefined)?.toLowerCase() ?? null;
        }
      });
      return sid;
    },
    [sceneRef],
  );

  const resolveCurrentSystemId = useCallback((): string | null => {
    if (focusedMoonRef.current) {
      const ud = focusedMoonRef.current.userData as any;
      const sid = (ud?.systemId as string | undefined)?.toLowerCase();
      if (sid) return sid;
    }
    const ship = spaceshipRef.current;
    const scene = sceneRef.current.scene;
    if (!ship || !scene) return null;
    let bestDist = Infinity;
    let bestSystem: string | null = null;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const ud = obj.userData as any;
      if (!ud?.isMainPlanet) return;
      const wp = obj.getWorldPosition(new THREE.Vector3());
      const d = ship.position.distanceTo(wp);
      if (d < bestDist) {
        bestDist = d;
        bestSystem =
          ((ud.systemId as string | undefined) ||
            (ud.planetName as string | undefined) ||
            null)?.toLowerCase() ?? null;
      }
    });
    return bestSystem;
  }, [focusedMoonRef, sceneRef, spaceshipRef]);

  const initializeNavigationSystem = useCallback(
    (spaceship: THREE.Object3D, scene: THREE.Scene) => {
      navTrace("initializeNavigationSystem()", "called");
      navigationSystemRef.current = new SpaceshipNavigationSystem(spaceship, {
        maxSpeed: optionsRef.current.spaceMoonNavMaxSpeed ?? NAV_MAX_SPEED,
        turboSpeed: optionsRef.current.spaceMoonNavTurboSpeed ?? NAV_TURBO_SPEED,
        accelerationRate: 0.12,
        decelerationDistance: NAV_DECEL_DISTANCE,
        arrivalDistance: NAV_ARRIVAL_DIST,
        usePredictiveIntercept: true,
        freezeOrbitOnApproach: true,
        freezeDistance: NAV_FREEZE_DIST,
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
        shipLog("Destination reached", "nav");
        debugLog("nav", `setOnArrival fired for targetId="${targetId}"`);

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

        // Hand off to orbit system (set by ResumeSpace3D) instead of
        // directly entering the content overlay.
        debugLog("nav", `moonMesh found: ${!!moonMesh}, onMoonOrbitArrivalRef set: ${!!onMoonOrbitArrivalRef.current}`);
        if (onMoonOrbitArrivalRef.current) {
          debugLog("nav", "Calling onMoonOrbitArrivalRef (orbit path)");
          onMoonOrbitArrivalRef.current(moonMesh, company);
        } else {
          debugLog("nav", "FALLBACK: onMoonOrbitArrivalRef not set, using enterMoonView");
          // Fallback if orbit system not wired yet
          enterMoonViewRef.current?.({ moonMesh, company, useFlight: false });
        }
      });

      vlog("🎯 Navigation system initialized");
    },
    [
      debugLog,
      emitterRef,
      enterMoonViewRef,
      missionLog,
      optionsRef,
      resumeData,
      shipLog,
      vlog,
    ],
  );

  const handleAutopilotNavigation = useCallback(
    (
      targetId: string,
      targetType: "section" | "moon",
      departureContext?: MoonDepartureContext,
    ) => {
      navTrace(
        "handleAutopilotNavigation()",
        `target=${targetType}:${targetId}`,
      );
      vlog(`🖱️ CLICK: Navigation button clicked - ${targetType}: ${targetId}`);

      // Disengage Star Destroyer escort if active
      if (followingStarDestroyerRef.current) {
        followingStarDestroyerRef.current = false;
        setFollowingStarDestroyer(false);
        vlog("🔺 Star Destroyer escort disengaged — navigating elsewhere");
      }

      if (focusedMoonRef.current) {
        exitFocusRequestRef.current = true;
        vlog("↩️ Exiting previous focused moon before new navigation");
      }

      if (manualFlightModeRef.current) {
        navTrace("handleAutopilotNavigation()", "blocked:manual-flight");
        vlog("⚠️ Navigation unavailable in manual flight mode");
        return;
      }

      if (!followingSpaceshipRef.current) {
        navTrace("handleAutopilotNavigation()", "blocked:not-following-ship");
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
        navTrace("handleAutopilotNavigation()", "blocked:nav-system-missing");
        vlog("⚠️ Navigation system not initialized");
        return;
      }
      navigationSystemRef.current.updateConfig({
        maxSpeed: optionsRef.current.spaceMoonNavMaxSpeed ?? NAV_MAX_SPEED,
        turboSpeed: optionsRef.current.spaceMoonNavTurboSpeed ?? NAV_TURBO_SPEED,
      });

      vlog(`🎯 Autopilot navigation to ${targetType}: ${targetId}`);

      // Clear any prior avoidance / settled-view state from previous navigation
      sectionAvoidWaypoint.current = null;
      sectionAvoidCooldown.current = 0;
      settledViewTargetRef.current = null;
      // Always stop any existing nav system motion before starting a fresh route.
      // Prevents one-frame tug/yoyo when users retarget quickly.
      navigationSystemRef.current.cancelNavigation();
      activeMoonLightspeedRef.current = null;

      if (targetType === "moon") {
        navTrace("handleAutopilotNavigation()", `moon-flow:${targetId}`);
        const moonId = `moon-${targetId}`;
        navigationSystemRef.current.updateConfig({
          maxSpeed: optionsRef.current.spaceMoonNavMaxSpeed ?? NAV_MAX_SPEED,
          turboSpeed: optionsRef.current.spaceMoonNavTurboSpeed ?? NAV_TURBO_SPEED,
          arrivalDistance: NAV_MOON_ARRIVAL_DISTANCE,
          freezeDistance: NAV_MOON_FREEZE_DISTANCE,
          freezeOrbitOnApproach: true,
        });

        if (!emitterRef.current.isTracking(moonId)) {
          navTrace("handleAutopilotNavigation()", `moon-not-tracked:${moonId}`);
          vlog(`⚠️ Moon ${targetId} is not being tracked by emitter`);
          return;
        }

        const currentPos = emitterRef.current.getCurrentPosition(moonId);
        const moonDisplayName =
          targetId.charAt(0).toUpperCase() + targetId.slice(1).replace(/-/g, " ");
        shipLog(`Setting course for ${moonDisplayName}`, "nav");
        const moonTurboThreshold =
          optionsRef.current.spaceMoonNavTurboThreshold ?? NAV_TURBO_THRESHOLD;
        const destinationSystemId = resolveMoonSystemId(moonId);
        const currentSystemId = resolveCurrentSystemId();
        const isSystemMismatchMoonJump =
          !!destinationSystemId &&
          !!currentSystemId &&
          destinationSystemId !== currentSystemId;
        const projectsAnchor = resolveSpecialSectionTarget
          ? resolveSpecialSectionTarget("projects")
          : null;
        const aboutAnchor = resolveSpecialSectionTarget
          ? resolveSpecialSectionTarget("about")
          : null;
        const skillsAnchor = resolveSpecialSectionTarget
          ? resolveSpecialSectionTarget("skills")
          : null;
        const isLeavingProjectsArea =
          !!projectsAnchor &&
          !!spaceshipRef.current &&
          spaceshipRef.current.position.distanceTo(projectsAnchor) <= 3200;
        const isLeavingAboutArea =
          !!aboutAnchor &&
          !!spaceshipRef.current &&
          spaceshipRef.current.position.distanceTo(aboutAnchor) <= 5200;
        const isLeavingSkillsArea =
          !!skillsAnchor &&
          !!spaceshipRef.current &&
          spaceshipRef.current.position.distanceTo(skillsAnchor) <= 4200;
        const isInterSystemMoonJump =
          isSystemMismatchMoonJump
          || isLeavingProjectsArea
          || isLeavingAboutArea
          || isLeavingSkillsArea;
        const useTurbo =
          currentPos && spaceshipRef.current
            ? spaceshipRef.current.position.distanceTo(
                currentPos.worldPosition,
              ) > moonTurboThreshold || isInterSystemMoonJump
            : true;

        const ship = spaceshipRef.current!;
        vlog(`🎯 Starting turn toward moon: ${moonId}`);

        let clearanceTarget: THREE.Vector3 | undefined;
        let clearanceDistance: number | undefined;
        if (departureContext && currentPos?.worldPosition) {
          const outward = _navMoonOutward.current
            .subVectors(ship.position, departureContext.moonCenter);
          if (outward.lengthSq() < 1e-6) outward.set(0, 1, 0);
          outward.normalize();
          const toDest = _navDir.current
            .subVectors(currentPos.worldPosition, ship.position);
          if (toDest.lengthSq() < 1e-6) toDest.copy(outward);
          toDest.normalize();

          const clearHeading = toDest
            .clone()
            .lerp(outward, NAV_ORBIT_EXIT_CLEAR_AWAY_BLEND)
            .normalize();
          clearanceDistance = THREE.MathUtils.clamp(
            departureContext.moonRadius * 5.5,
            NAV_ORBIT_EXIT_CLEAR_MIN_DIST,
            NAV_ORBIT_EXIT_CLEAR_MAX_DIST,
          );
          clearanceTarget = ship.position
            .clone()
            .addScaledVector(clearHeading, clearanceDistance);
          vlog(
            `🧹 Orbit-clearance: ${clearanceDistance.toFixed(0)}u before turn`,
          );
        }

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
          turnStartTime: performance.now(),
          turnStartQuat: ship.quaternion.clone(),
          turnTargetQuat,
          pendingMoonId: moonId,
          pendingMoonTurbo: useTurbo,
          pendingMoonInterSystem: isInterSystemMoonJump,
          turnPhase: clearanceTarget ? "clearing" : "turning",
          clearanceTarget,
          clearanceDistance,
          forceLightspeed: isInterSystemMoonJump,
        };
        manualFlightRef.current.acceleration = 0;
        manualFlightRef.current.isTurboActive = false;
        manualFlightRef.current.isLightspeedActive = false;
        setCurrentNavigationTarget(targetId);
        vlog(
          `✅ Turn initiated toward moon: ${targetId} (turbo: ${useTurbo}${isInterSystemMoonJump ? ", lightspeed route" : ""})`,
        );
        missionLog(
          `🎯 NAVIGATION INITIATED: Target - ${targetId} | Distance: ${currentPos ? spaceshipRef.current!.position.distanceTo(currentPos.worldPosition).toFixed(0) : "unknown"}u`,
        );
      } else if (targetType === "section") {
        navigationSystemRef.current.updateConfig({
          arrivalDistance: NAV_ARRIVAL_DIST,
          freezeDistance: NAV_FREEZE_DIST,
          freezeOrbitOnApproach: true,
        });
        if (
          currentNavigationTarget === targetId &&
          navigationDistance === null &&
          !navigationSystemRef.current?.getStatus().isNavigating
        ) {
          navTrace(
            "handleAutopilotNavigation()",
            `section-id-noop:${targetId}`,
          );
          vlog(`ℹ️ Already at ${targetId} — ignoring repeat section click`);
          return;
        }
        navTrace("handleAutopilotNavigation()", `section-flow:${targetId}`);
        let targetPosition: THREE.Vector3 | null = null;
        let targetName = targetId;
        let targetRadius = 60; // default (sun)
        const specialSectionTarget = resolveSpecialSectionTarget
          ? resolveSpecialSectionTarget(targetId)
          : null;
        const isDirectSectionApproach = !!specialSectionTarget;

        // Special handling for section targets that don't have matching planets
        if (specialSectionTarget) {
          targetPosition = specialSectionTarget.clone();
          targetRadius = NAV_FALLBACK_PLANET_R;
          vlog(`🛰️ Navigating to ${targetId} anchor`);
        } else if (targetId === "home") {
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
          const sectionDisplayName =
            targetId.charAt(0).toUpperCase() + targetId.slice(1).replace(/-/g, " ");
          shipLog(`Setting course for ${sectionDisplayName}`, "nav");
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

          // Standard sections stage above/below planet; direct sections route
          // straight to anchor (used by Projects trench destination).
          let stagingPoint = planetCenter.clone();
          if (!isDirectSectionApproach) {
            const key = targetId.toLowerCase();
            const remembered = sectionFallbackSideRef.current[key];
            const upOrDown: 1 | -1 = remembered ?? (Math.random() > 0.5 ? 1 : -1);
            sectionFallbackSideRef.current[key] = upOrDown;
            const planeNormal = new THREE.Vector3(0, 1, 0);
            const stagingDistance = Math.max(
              targetRadius * NAV_PLANET_STAGING_RADIUS_MULT,
              NAV_PLANET_STAGING_MIN_DIST,
            );
            stagingPoint = planetCenter
              .clone()
              .addScaledVector(planeNormal, upOrDown * stagingDistance);
            vlog(
              `🛸 Planet staging: ${upOrDown > 0 ? "ABOVE" : "BELOW"} at ${stagingDistance.toFixed(0)}u`,
            );
            vlog(
              `   Staging point: [${stagingPoint.x.toFixed(1)}, ${stagingPoint.y.toFixed(1)}, ${stagingPoint.z.toFixed(1)}]`,
            );
          } else {
            vlog(
              `🛫 Direct approach point: [${stagingPoint.x.toFixed(1)}, ${stagingPoint.y.toFixed(1)}, ${stagingPoint.z.toFixed(1)}]`,
            );
          }

          const distToStaging = shipPos.distanceTo(stagingPoint);
          let clearanceTarget: THREE.Vector3 | undefined;
          let clearanceDistance: number | undefined;
          if (departureContext) {
            const outward = _navMoonOutward.current
              .subVectors(shipPos, departureContext.moonCenter);
            if (outward.lengthSq() < 1e-6) outward.set(0, 1, 0);
            outward.normalize();
            const toDest = _navDir.current.subVectors(stagingPoint, shipPos);
            if (toDest.lengthSq() < 1e-6) toDest.copy(outward);
            toDest.normalize();
            const clearHeading = toDest
              .clone()
              .lerp(outward, NAV_ORBIT_EXIT_CLEAR_AWAY_BLEND)
              .normalize();
            clearanceDistance = THREE.MathUtils.clamp(
              departureContext.moonRadius * 5.5,
              NAV_ORBIT_EXIT_CLEAR_MIN_DIST,
              NAV_ORBIT_EXIT_CLEAR_MAX_DIST,
            );
            clearanceTarget = shipPos
              .clone()
              .addScaledVector(clearHeading, clearanceDistance);
            vlog(
              `🧹 Orbit-clearance: ${clearanceDistance.toFixed(0)}u before section turn`,
            );
          }
          navTrace(
            "handleAutopilotNavigation()",
            `section-staging-dist:${targetId}=${distToStaging.toFixed(3)}`,
          );
          if (distToStaging <= NAV_REPEAT_SECTION_EPSILON) {
            // Re-clicking the same section while already parked should be a no-op.
            // Avoid restarting turn/travel state from (almost) identical positions.
            navTrace(
              "handleAutopilotNavigation()",
              `section-noop-repeat:${targetId}`,
            );
            settledViewTargetRef.current = planetCenter.clone();
            setCurrentNavigationTarget(null);
            setNavigationDistance(null);
            setNavigationETA(null);
            vlog(
              `ℹ️ Already at ${targetId} staging point — keeping current settled view`,
            );
            return;
          }

          // First turn aligns nose directly toward planet center.
          const turnTargetQuat = new THREE.Quaternion();
          const tmpObj = new THREE.Object3D();
          tmpObj.position.copy(spaceshipRef.current.position);
          tmpObj.lookAt(planetCenter);
          turnTargetQuat.copy(tmpObj.quaternion);
          applyRollOffset(turnTargetQuat);

          navigationTargetRef.current = {
            id: targetId,
            type: targetType,
            position: stagingPoint,
            startPosition: shipPos.clone(),
            startTime: Date.now(),
            useTurbo: true,
            forceLightspeed: true,
            targetRadius,
            turnPhase:
              targetId === "about" || targetId === "projects"
                ? "traveling"
                : clearanceTarget
                  ? "clearing"
                  : "turning",
            turnStartTime: performance.now(),
            turnStartQuat: spaceshipRef.current.quaternion.clone(),
            turnTargetQuat,
            planetCenter,
            clearanceTarget,
            clearanceDistance,
          };
          if (targetId === "about" && isDirectSectionApproach) {
            const toStage = stagingPoint.clone().sub(shipPos);
            const travelDist = toStage.length();
            if (travelDist > 1e-3) {
              const approachDir = stagingPoint.clone().sub(planetCenter);
              if (approachDir.lengthSq() < 1e-6) {
                approachDir.set(0, 0, 1);
              } else {
                approachDir.normalize();
              }
              const approachDist = THREE.MathUtils.clamp(travelDist * 0.38, 2600, 9000);
              const approachPoint = stagingPoint
                .clone()
                .addScaledVector(approachDir, approachDist);
              const toApproach = approachPoint.clone().sub(shipPos);
              toApproach.normalize();
              const up = new THREE.Vector3(0, 1, 0);
              const lateral = new THREE.Vector3().crossVectors(toApproach, up);
              if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
              lateral.normalize();
              const centerToShip = shipPos.clone().sub(planetCenter);
              const lateralSign = centerToShip.dot(lateral) >= 0 ? 1 : -1;
              const arcOffset = THREE.MathUtils.clamp(travelDist * 0.18, 1400, 6200);
              const arcLift = THREE.MathUtils.clamp(travelDist * 0.04, 240, 1200);
              const arcMid = shipPos
                .clone()
                .lerp(approachPoint, 0.5)
                .addScaledVector(lateral, arcOffset * lateralSign)
                .add(new THREE.Vector3(0, arcLift, 0));
              navigationTargetRef.current.arcMidPoint = arcMid;
              navigationTargetRef.current.arcFinalApproachPoint = approachPoint;
              navigationTargetRef.current.arcInitialDistance = shipPos.distanceTo(approachPoint);
              navigationTargetRef.current.arcPassedMidPoint = false;
              vlog(
                `🌀 About curved staging path armed (offset ${arcOffset.toFixed(0)}u, lift ${arcLift.toFixed(0)}u)`,
              );
            }
          } else if (targetId === "projects" && isDirectSectionApproach) {
            const toStage = stagingPoint.clone().sub(shipPos);
            const travelDist = toStage.length();
            if (travelDist > 1e-3) {
              const approachDir = stagingPoint.clone().sub(planetCenter);
              if (approachDir.lengthSq() < 1e-6) {
                approachDir.copy(stagingPoint).sub(shipPos);
                if (approachDir.lengthSq() < 1e-6) approachDir.set(0, 0, 1);
              }
              approachDir.normalize();
              const approachDist = THREE.MathUtils.clamp(travelDist * 0.22, 1200, 5200);
              const approachPoint = stagingPoint
                .clone()
                .addScaledVector(approachDir, approachDist);
              const toApproach = approachPoint.clone().sub(shipPos).normalize();
              const up = new THREE.Vector3(0, 1, 0);
              const lateral = new THREE.Vector3().crossVectors(toApproach, up);
              if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
              lateral.normalize();
              const centerToShip = shipPos.clone().sub(planetCenter);
              const lateralSign = centerToShip.dot(lateral) >= 0 ? 1 : -1;
              const arcOffset = THREE.MathUtils.clamp(travelDist * 0.1, 700, 3400);
              const arcLift = THREE.MathUtils.clamp(travelDist * 0.055, 300, 1400);
              const arcMid = shipPos
                .clone()
                .lerp(approachPoint, 0.5)
                .addScaledVector(lateral, arcOffset * lateralSign)
                .add(new THREE.Vector3(0, arcLift, 0));
              navigationTargetRef.current.arcMidPoint = arcMid;
              navigationTargetRef.current.arcFinalApproachPoint = approachPoint;
              navigationTargetRef.current.arcInitialDistance = shipPos.distanceTo(approachPoint);
              navigationTargetRef.current.arcPassedMidPoint = false;
              vlog(
                `🌀 Projects curved staging path armed (offset ${arcOffset.toFixed(0)}u, lift ${arcLift.toFixed(0)}u)`,
              );
            }
          }
          if (targetId === "about" || targetId === "projects") {
            navTurnActiveRef.current = false;
            vlog(`🌀 ${targetId === "projects" ? "Projects" : "About"} special-case: skipping turn phase, curving directly`);
          }
          setCurrentNavigationTarget(targetId);

          vlog(
            `📏 Distance to staging: ${distToStaging.toFixed(1)} units ${navigationTargetRef.current.useTurbo ? "(TURBO enabled)" : ""}`,
          );
        } else {
          navTrace("handleAutopilotNavigation()", `section-target-missing:${targetId}`);
          vlog(`❌ Could not find target: ${targetId}`);
          setCurrentNavigationTarget(null);
        }
      }
    },
    [
      currentNavigationTarget,
      navigationDistance,
      emitterRef,
      exitFocusRequestRef,
      focusedMoonRef,
      followingSpaceshipRef,
      manualFlightModeRef,
      shipCinematicRef,
      missionLog,
      shipLog,
      sceneRef,
      spaceshipRef,
      optionsRef,
      resolveMoonSystemId,
      resolveCurrentSystemId,
      resolveSpecialSectionTarget,
      vlog,
    ],
  );

  // Reusable scratch vectors — avoid per-frame allocations
  const _navDir = useRef(new THREE.Vector3());
  const _navCamPos = useRef(new THREE.Vector3());
  const _navToCam = useRef(new THREE.Vector3());
  const _navBehindDir = useRef(new THREE.Vector3());
  const _navControlTarget = useRef(new THREE.Vector3());
  const _navCamForward = useRef(new THREE.Vector3());
  const _navMoonOutward = useRef(new THREE.Vector3());
  const _navArcPoint = useRef(new THREE.Vector3());

  const updateAutopilotNavigation = useCallback(() => {
    navTrace(
      "updateAutopilotNavigation()",
      `tick:target=${navigationTargetRef.current.id ?? "none"} phase=${navigationTargetRef.current.turnPhase ?? "none"}`,
      2000,
    );
    const ship = spaceshipRef.current;
    if (!ship) return;

    const pathData = spaceshipPathRef.current;
    const now = Date.now();
    const localTurnPhase = navigationTargetRef.current.turnPhase;
    const isCameraAlignmentHold =
      localTurnPhase === "clearing" ||
      localTurnPhase === "turning" ||
      localTurnPhase === "pausing";

    if (
      NAV_MOVEMENT_HEARTBEAT_LOGS &&
      (!window.lastAutopilotLog || now - window.lastAutopilotLog > 2000)
    ) {
      vlog(
        `🤖 AUTOPILOT: nav=${!!navigationTargetRef.current.id}, system=${!!navigationSystemRef.current?.getStatus().isNavigating}`,
      );
      window.lastAutopilotLog = now;
    }

    if (navigationSystemRef.current && !isCameraAlignmentHold) {
      const deltaTime = 0.016;
      const status = navigationSystemRef.current.getStatus();
      if (
        NAV_MOVEMENT_HEARTBEAT_LOGS &&
        ((status.isNavigating && !(window as any).lastNavSystemLog) ||
          now - ((window as any).lastNavSystemLog || 0) > 2000)
      ) {
        vlog(
          `🎯 Nav System Active: ${status.targetId}, dist: ${status.distance?.toFixed(1)}`,
        );
        (window as any).lastNavSystemLog = now;
      }
      navigationSystemRef.current.update(deltaTime);
      if (status.isNavigating && activeMoonLightspeedRef.current) {
        const isLightspeedMoon = status.targetId === activeMoonLightspeedRef.current;
        if (isLightspeedMoon) {
          const dist = status.distance ?? Infinity;
          const lightspeedOn = dist > NAV_LIGHTSPEED_DECEL_DIST;
          manualFlightRef.current.acceleration = lightspeedOn ? 1.0 : 0.25;
          manualFlightRef.current.isTurboActive = lightspeedOn;
          manualFlightRef.current.isLightspeedActive = lightspeedOn;
        }
      } else if (!status.isNavigating && activeMoonLightspeedRef.current) {
        activeMoonLightspeedRef.current = null;
        manualFlightRef.current.isTurboActive = false;
        manualFlightRef.current.isLightspeedActive = false;
      }
    } else if (isCameraAlignmentHold) {
      // Ensure no residual thrust while camera alignment owns the transition.
      manualFlightRef.current.acceleration = 0;
      manualFlightRef.current.isTurboActive = false;
      manualFlightRef.current.isLightspeedActive = false;
    }

    // Handle both section travel AND moon turn phase
    const navTarget = navigationTargetRef.current;
    const isSectionTravel =
      navTarget.id && navTarget.position && navTarget.type === "section";
    const isPreTravelTurnPhase =
      navTarget.id &&
      (navTarget.turnPhase === "clearing" ||
        navTarget.turnPhase === "turning" ||
        navTarget.turnPhase === "pausing");

    if (isSectionTravel || isPreTravelTurnPhase) {
      const target = navigationTargetRef.current;
      const targetPos = target.position;

      // For section travel, targetPos is required for movement
      // For moon turn phase, we only need the quaternion slerp
      if (!targetPos && !isPreTravelTurnPhase) {
        vlog("⚠️ Navigation target position is null");
        return;
      }

      const distance = targetPos
        ? ship.position.distanceTo(targetPos)
        : 0;
      const suppressShipFollowCameraForSkills =
        target.type === "section" &&
        target.id === "skills" &&
        distance < 2600;

      if (targetPos && (!target.lastUpdateFrame || now - target.lastUpdateFrame > 500)) {
        setNavigationDistance(distance);
        const estimatedSpeed = target.useTurbo ? 4.0 : 2.0;
        setNavigationETA(distance / estimatedSpeed);
        target.lastUpdateFrame = now;
      }

      // ── CLEARING PHASE: move away from current moon before turn/punch ──
      if (target.turnPhase === "clearing" && target.clearanceTarget) {
        navTrace("updateAutopilotNavigation()", "phase:clearing", 700);
        navTurnActiveRef.current = true;
        pathData.speed = 0;

        const toClear = _navDir.current
          .subVectors(target.clearanceTarget, ship.position);
        const clearDist = toClear.length();

        if (clearDist > 1e-6) {
          toClear.normalize();
          const tmpObj = new THREE.Object3D();
          tmpObj.position.copy(ship.position);
          tmpObj.lookAt(target.clearanceTarget);
          const clearQuat = tmpObj.quaternion.clone();
          applyRollOffset(clearQuat);
          ship.quaternion.slerp(clearQuat, 0.06);
          ship.position.addScaledVector(toClear, NAV_ORBIT_EXIT_CLEAR_SPEED);
        }

        manualFlightRef.current.acceleration = 0.2;
        manualFlightRef.current.isTurboActive = false;
        manualFlightRef.current.isLightspeedActive = false;

        if (
          !insideShipRef.current &&
          followingSpaceshipRef.current &&
          sceneRef.current.controls &&
          !suppressShipFollowCameraForSkills
        ) {
          const camPos = _navCamPos.current;
          camPos.set(0, 0, -1).applyQuaternion(ship.quaternion);
          const navCameraBehind = THREE.MathUtils.clamp(
            optionsRef.current.spaceNavCameraBehind ?? NAV_CAMERA_BEHIND,
            6,
            14,
          );
          const navCameraHeight =
            optionsRef.current.spaceNavCameraHeight ?? NAV_CAMERA_HEIGHT;
          camPos.multiplyScalar(navCameraBehind).add(ship.position);
          camPos.y += navCameraHeight;
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

        if (clearDist <= 8) {
          const finalTarget = target.position ?? target.clearanceTarget;
          const turnTargetQuat = new THREE.Quaternion();
          const tmpObj = new THREE.Object3D();
          tmpObj.position.copy(ship.position);
          tmpObj.lookAt(finalTarget);
          turnTargetQuat.copy(tmpObj.quaternion);
          applyRollOffset(turnTargetQuat);

          target.turnPhase = "turning";
          target.turnStartTime = performance.now();
          target.turnStartQuat = ship.quaternion.clone();
          target.turnTargetQuat = turnTargetQuat;
          target.clearanceTarget = undefined;
          target.startPosition = ship.position.clone();
          vlog("🧹 Orbit clearance complete — starting destination turn");
        }
        return;
      }

      // ── TURN PHASE: smoothly rotate ship toward target before moving ──
      if (target.turnPhase === "turning") {
        navTrace("updateAutopilotNavigation()", "phase:turning", 700);
        navTurnActiveRef.current = true;
        pathData.speed = 0;
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
          sceneRef.current.controls &&
          !suppressShipFollowCameraForSkills
        ) {
          const camPos = _navCamPos.current;
          // Camera behind ship, facing the destination
          camPos.set(0, 0, -1).applyQuaternion(ship.quaternion);
          const navCameraBehind = THREE.MathUtils.clamp(
            optionsRef.current.spaceNavCameraBehind ?? NAV_CAMERA_BEHIND,
            6,
            14,
          );
          const navCameraHeight =
            optionsRef.current.spaceNavCameraHeight ?? NAV_CAMERA_HEIGHT;
          camPos.multiplyScalar(navCameraBehind).add(ship.position);
          camPos.y += navCameraHeight;

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
          target.cameraAlignStartTime = performance.now();
          // Keep this true through pause so other camera systems (moon-orbit)
          // don't fight the "camera get behind ship" alignment pass.
          navTurnActiveRef.current = true;
          vlog("🔄 Turn complete — pausing before travel");
        }
        return; // Don't move yet, just rotate
      }

      // ── PAUSE PHASE: short beat after turn, before travel ──
      if (target.turnPhase === "pausing") {
        navTrace("updateAutopilotNavigation()", "phase:pausing", 700);
        pathData.speed = 0;
        const MIN_PAUSE_DURATION = 500; // ms
        const pauseElapsed = performance.now() - (target.turnPauseStartTime || 0);
        const alignElapsed =
          performance.now() -
          (target.cameraAlignStartTime || target.turnPauseStartTime || 0);
        const MAX_CAMERA_ALIGN_WAIT = 2800; // ms hard safety net

        // Keep nudging camera behind ship while paused so acceleration
        // begins only when the ship is framed from behind.
        if (
          !insideShipRef.current &&
          followingSpaceshipRef.current &&
          sceneRef.current.controls
        ) {
          const camPos = _navCamPos.current;
          camPos.set(0, 0, -1).applyQuaternion(ship.quaternion);
          const navCameraBehind = THREE.MathUtils.clamp(
            optionsRef.current.spaceNavCameraBehind ?? NAV_CAMERA_BEHIND,
            6,
            14,
          );
          const navCameraHeight =
            optionsRef.current.spaceNavCameraHeight ?? NAV_CAMERA_HEIGHT;
          camPos.multiplyScalar(navCameraBehind).add(ship.position);
          camPos.y += navCameraHeight;

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

        let cameraReady = true;
        if (
          !insideShipRef.current &&
          followingSpaceshipRef.current &&
          sceneRef.current.camera &&
          sceneRef.current.controls
        ) {
          const toCam = _navToCam.current
            .subVectors(sceneRef.current.camera.position, ship.position);
          if (toCam.lengthSq() > 1e-8) {
            toCam.normalize();
            const behindDir = _navBehindDir.current
              .set(0, 0, -1)
              .applyQuaternion(ship.quaternion)
              .normalize();
            const behindDot = toCam.dot(behindDir);
            const shipForward = _navDir.current.copy(behindDir).multiplyScalar(-1);
            const camForward = _navCamForward.current;
            sceneRef.current.camera.getWorldDirection(camForward);
            const lookDot = camForward.dot(shipForward);

            const controlTargetErr = sceneRef.current.controls
              .getTarget(_navControlTarget.current)
              .distanceTo(ship.position);

            // Ship should only launch when camera is truly behind, not too close,
            // and already looking almost directly toward destination.
            cameraReady =
              behindDot > 0.93 &&
              lookDot > 0.85 &&
              controlTargetErr < 20;
          }
        }

        const holdForCamera =
          pauseElapsed >= MIN_PAUSE_DURATION &&
          !cameraReady &&
          alignElapsed < MAX_CAMERA_ALIGN_WAIT;
        if (holdForCamera) {
          return; // hold position until camera catches up behind ship
        }

        if (
          pauseElapsed >= MIN_PAUSE_DURATION &&
          !cameraReady &&
          alignElapsed >= MAX_CAMERA_ALIGN_WAIT
        ) {
          vlog("⚠️ Camera alignment timeout — proceeding to avoid deadlock");
        }

        if (pauseElapsed >= MIN_PAUSE_DURATION) {
          // If this was a moon turn, start the navigation system now
          if (target.pendingMoonId && navigationSystemRef.current) {
            if (target.pendingMoonInterSystem) {
              navigationSystemRef.current.updateConfig({
                maxSpeed: optionsRef.current.spaceMoonNavMaxSpeed ?? NAV_MAX_SPEED,
                turboSpeed: NAV_LIGHTSPEED,
              });
            } else {
              navigationSystemRef.current.updateConfig({
                maxSpeed: optionsRef.current.spaceMoonNavMaxSpeed ?? NAV_MAX_SPEED,
                turboSpeed: optionsRef.current.spaceMoonNavTurboSpeed ?? NAV_TURBO_SPEED,
              });
            }
            const success = navigationSystemRef.current.navigateToObject(
              target.pendingMoonId,
              target.pendingMoonTurbo ?? true,
            );
            if (success) {
              vlog(`▶️ Pause done — moon navigation started: ${target.pendingMoonId}`);
              activeMoonLightspeedRef.current = target.pendingMoonInterSystem
                ? target.pendingMoonId
                : null;
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
            navTurnActiveRef.current = false;
          } else {
            target.turnPhase = "traveling";
            pathData.speed = 0; // start from zero speed
            navTurnActiveRef.current = false;
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
        navTrace("updateAutopilotNavigation()", "phase:settling", 700);
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
            .addScaledVector(awayFromPlanet, NAV_SETTLE_OFFSET);

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
          setCurrentNavigationTarget(target.id);
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
          manualFlightRef.current.isLightspeedActive = false;
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
      const planetRadius = target.targetRadius || NAV_FALLBACK_PLANET_R;
      const arrivalDistance = target.planetCenter
        ? 30 // Get close to the staging point before settling
        : target.type === "moon"
          // Moon arrivals must finish near the hover station; arriving far out
          // creates the visible "bounce" handoff before orbit settles.
          ? Math.max(28, Math.min(42, planetRadius * 1.2))
          : Math.max(planetRadius * 4, 80);

      // ── TRAVEL PHASE: move toward target with obstacle avoidance ──
      // targetPos is guaranteed non-null here (moon-turn phases return
      // earlier, and section travel exits if targetPos is null).
      if (!targetPos) return;

      // --- Obstacle avoidance for section travel ---
      // Check if the straight-line path to the target intersects any
      // celestial body. If so, compute a lateral waypoint to route around.
      // Also handles "departure": if the ship is currently INSIDE an
      // obstacle (e.g. just visited a moon), push the waypoint further out
      // so the ship clears the body before heading to the new destination.
      const avoidWp = sectionAvoidWaypoint.current;
      if (
        distance > 50 &&
        !avoidWp &&
        now > sectionAvoidCooldown.current &&
        !target.forceLightspeed
      ) {
        const obstacles = gatherObstacles(target.id);
        const dir = _avoidDir.current.subVectors(targetPos, ship.position).normalize();
        const segLen = distance;

        for (const obs of obstacles) {
          const toObs = _avoidToObs.current.subVectors(obs.position, ship.position);
          const distShipToObs = ship.position.distanceTo(obs.position);

          // ── Ship inside obstacle radius → departure push ──
          // After a moon visit the ship sits right at the body.
          // Push the avoidance waypoint outward so it clears fully.
          const insideObstacle = distShipToObs < obs.radius * 1.2;

          const proj = toObs.dot(dir);
          const t = Math.max(0, Math.min(1, proj / Math.max(segLen, 0.001)));
          const closest = _avoidClosest.current
            .copy(ship.position)
            .addScaledVector(dir, segLen * t);
          const distToPath = obs.position.distanceTo(closest);

          if (distToPath < obs.radius || insideObstacle) {
            // Path is blocked or ship is inside body — compute lateral waypoint
            const up = new THREE.Vector3(0, 1, 0);
            const lateral = _avoidLateral.current.crossVectors(dir, up);
            if (lateral.lengthSq() < 0.0001) lateral.set(1, 0, 0);
            lateral.normalize();

            // Deterministic: steer to the side the ship is already on
            const shipSide = toObs.dot(lateral);
            const sign = shipSide < 0 ? 1 : -1;
            // 50% more clearance than before (was 1.8×, now 2.7×).
            // When departing from inside an obstacle, add extra distance.
            const avoidOffset = insideObstacle
              ? obs.radius * 3.2   // generous departure clearance
              : obs.radius * 2.7;  // standard avoidance (+50%)

            sectionAvoidWaypoint.current = obs.position
              .clone()
              .addScaledVector(lateral, avoidOffset * sign);
            sectionAvoidWaypoint.current.y = ship.position.y; // keep altitude
            sectionAvoidCooldown.current = now + 1500; // prevent re-trigger

            vlog(
              `🛰️ ${insideObstacle ? "DEPARTURE" : "AVOIDANCE"}: Routing around ${obs.id} (${(avoidOffset * sign).toFixed(0)}u lateral)`,
            );
            break;
          }
        }
      }

      // If we have an avoidance waypoint, check if we've passed it
      if (avoidWp) {
        const distToWp = ship.position.distanceTo(avoidWp);
        if (distToWp < NAV_WAYPOINT_CLEAR) {
          // Cleared the obstacle — resume direct path
          sectionAvoidWaypoint.current = null;
          vlog("✅ Avoidance waypoint cleared — resuming direct path");
        }
      }

      // Steer target: direct staging target (or avoidance waypoint).
      let steerTarget: THREE.Vector3;
      if (sectionAvoidWaypoint.current) {
        steerTarget = sectionAvoidWaypoint.current;
      } else {
        steerTarget = targetPos;
        if (
          target.type === "section"
          && (target.id === "about" || target.id === "projects")
          && target.arcMidPoint
          && target.startPosition
          && target.arcFinalApproachPoint
        ) {
          if (!target.arcPassedMidPoint) {
            const distToApproach = ship.position.distanceTo(target.arcFinalApproachPoint);
            const passThreshold = Math.max(arrivalDistance * 12, 560);
            if (distToApproach <= passThreshold) {
              target.arcPassedMidPoint = true;
              vlog(`🌀 ${target.id === "projects" ? "Projects" : "About"} curved path: aligned on approach rail`);
            } else {
              const initialDist = Math.max(
                target.arcInitialDistance ?? target.startPosition.distanceTo(target.arcFinalApproachPoint),
                1,
              );
              const progress = THREE.MathUtils.clamp(
                1 - distToApproach / initialDist,
                0,
                1,
              );
              // Continuous curve from start to the pre-approach rail point.
              const lookAheadT = THREE.MathUtils.clamp(
                progress + (target.id === "projects" ? 0.18 : 0.16),
                0.03,
                0.992,
              );
              const omt = 1 - lookAheadT;
              const arcPoint = _navArcPoint.current;
              arcPoint.copy(target.startPosition).multiplyScalar(omt * omt);
              arcPoint.addScaledVector(target.arcMidPoint, 2 * omt * lookAheadT);
              arcPoint.addScaledVector(target.arcFinalApproachPoint, lookAheadT * lookAheadT);
              steerTarget = arcPoint;
            }
          }
        }
      }
      if (
        !Number.isFinite(steerTarget.x) ||
        !Number.isFinite(steerTarget.y) ||
        !Number.isFinite(steerTarget.z)
      ) {
        navTrace("updateAutopilotNavigation()", "abort:invalid-steer-target");
        vlog("⚠️ Invalid steer target detected — aborting navigation safely");
        pathData.speed = 0;
        setCurrentNavigationTarget(
          target.type === "section" ? target.id : null,
        );
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
        return;
      }
      const direction = _navDir.current
        .subVectors(steerTarget, ship.position)
        .normalize();
      if (
        !Number.isFinite(direction.x) ||
        !Number.isFinite(direction.y) ||
        !Number.isFinite(direction.z) ||
        direction.lengthSq() < 1e-8
      ) {
        navTrace("updateAutopilotNavigation()", "abort:invalid-direction");
        vlog("⚠️ Invalid direction vector detected — aborting navigation safely");
        pathData.speed = 0;
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
        return;
      }

      let targetSpeed = 0.5;
      let lerpAlpha = 0.05; // default smoothing

      // Determine speed tier based on distance.
      // Lightspeed for long inter-planet hops; turbo for medium; normal for close.
      if (
        target.type === "section"
        && (target.id === "about" || target.id === "projects")
        && target.startTime > 0
        && now - target.startTime > 45000
      ) {
        target.forceLightspeed = false;
        target.arcPassedMidPoint = true;
        target.arcMidPoint = undefined;
        target.arcFinalApproachPoint = undefined;
        if (!target.aboutFailSafeLogged) {
          target.aboutFailSafeLogged = true;
          vlog(`🛑 ${target.id === "projects" ? "Projects" : "About"} failsafe: forcing final straight-in approach`);
        }
      }
      const decelDist = distance > NAV_LIGHTSPEED_ENGAGE_DIST
        ? NAV_LIGHTSPEED_DECEL_DIST   // lightspeed needs longer to slow down
        : arrivalDistance + NAV_DECEL_EXTRA;

      if (distance > decelDist) {
        if (
          target.forceLightspeed ||
          ((target.useTurbo && distance > NAV_LIGHTSPEED_ENGAGE_DIST) &&
            !sectionAvoidWaypoint.current)
        ) {
          // ── LIGHTSPEED: inter-planet travel ──
          targetSpeed = NAV_LIGHTSPEED;
          lerpAlpha = NAV_LIGHTSPEED_LERP;
          manualFlightRef.current.acceleration = 1.0;
          manualFlightRef.current.isTurboActive = true;
          manualFlightRef.current.isLightspeedActive = true;
          if (!target.lightspeedLogged) {
            target.lightspeedBurstUntil = performance.now() + 260;
            pathData.speed = Math.max(pathData.speed, NAV_LIGHTSPEED * 0.32);
            vlog(`⚡ LIGHTSPEED: Engaged at distance ${distance.toFixed(0)}`);
            shipLog("Lightspeed engaged", "nav");
            target.lightspeedLogged = true;
          }
          if ((target.lightspeedBurstUntil || 0) > performance.now()) {
            targetSpeed *= 1.15;
          }
        } else if (target.useTurbo && distance > NAV_TURBO_ENGAGE_DIST) {
          // ── TURBO: medium distance ──
          targetSpeed = sectionAvoidWaypoint.current ? 2.0 : 4.0;
          manualFlightRef.current.acceleration = sectionAvoidWaypoint.current ? 0.6 : 1.0;
          manualFlightRef.current.isTurboActive = !sectionAvoidWaypoint.current;
          if (!target.turboLogged && !sectionAvoidWaypoint.current) {
            vlog(`🔥 TURBO MODE: Engaged at distance ${distance.toFixed(1)}`);
            target.turboLogged = true;
          }
        } else if (distance > NAV_CRUISE_ENGAGE_DIST) {
          // ── CRUISE: moon-to-moon within same system ──
          targetSpeed = NAV_CRUISE_SPEED;
          lerpAlpha = NAV_CRUISE_LERP;
          manualFlightRef.current.acceleration = 0.7;
          manualFlightRef.current.isTurboActive = false;
          manualFlightRef.current.isLightspeedActive = false;
          if (!target.cruiseLogged) {
            shipLog("Cruise speed engaged", "nav");
            target.cruiseLogged = true;
          }
        } else {
          // ── NORMAL: close approach ──
          targetSpeed = 2.0;
          manualFlightRef.current.acceleration = 0.6;
          manualFlightRef.current.isTurboActive = false;
          manualFlightRef.current.isLightspeedActive = false;
        }
      } else {
        // ── DECELERATION: smooth stop ──
        const progress = distance / decelDist;
        targetSpeed = Math.max(0.1, progress * 4.0);
        lerpAlpha = 0.06; // slightly faster lerp for responsive decel
        manualFlightRef.current.acceleration = progress * 0.6;
        manualFlightRef.current.isTurboActive = false;
        manualFlightRef.current.isLightspeedActive = false;
        if (!target.decelerationLogged) {
          vlog(`🛑 DECELERATION: Starting at distance ${distance.toFixed(1)}`);
          target.decelerationLogged = true;
        }
      }

      pathData.speed += (targetSpeed - pathData.speed) * lerpAlpha;
      ship.position.addScaledVector(direction, pathData.speed);

      // ── Real-time deflection: gently push ship out of any obstacle ──
      // Skip while lightspeed is active to avoid micro-corrections that
      // produce visible "herky-jerky" jitter in long-range travel.
      if (!manualFlightRef.current.isLightspeedActive) {
        // Exclude the active target from real-time deflection; otherwise
        // planet travel can get permanently repelled near arrival.
        const deflectObstacles = gatherObstacles(target.id ?? null);
        for (const obs of deflectObstacles) {
          const toShip = _deflectPush.current.subVectors(ship.position, obs.position);
          const distToCenter = toShip.length();
          if (distToCenter < obs.radius && distToCenter > 0.01) {
            // How deeply inside: 1.0 = at center, 0.0 = at edge
            const penetration = 1 - distToCenter / obs.radius;
            // Push strength: gentle but escalates if deeply inside
            const pushStrength = penetration * obs.radius * 0.15;
            toShip.normalize();
            ship.position.addScaledVector(toShip, pushStrength);
            // Slow down when deflecting to avoid tunnelling further in
            pathData.speed *= Math.max(0.3, 1 - penetration);
          }
        }
      }

      // Smooth heading update instead of hard lookAt snap each frame.
      const _tmpLookObj = new THREE.Object3D();
      const skipAboutHeading =
        target.type === "section"
        && (target.id === "about" || target.id === "projects")
        && !target.arcPassedMidPoint;
      if (!skipAboutHeading) {
        _tmpLookObj.position.copy(ship.position);
        _tmpLookObj.lookAt(steerTarget);
        const targetQuat = _tmpLookObj.quaternion.clone();
        applyRollOffset(targetQuat);
        const turnAlpha = manualFlightRef.current.isLightspeedActive ? 0.24 : 0.12;
        ship.quaternion.slerp(targetQuat, turnAlpha);
      }

      // Only update exterior follow camera when NOT inside the ship —
      // the interior camera block in the render loop handles cockpit/cabin.
      if (
        followingSpaceshipRef.current &&
        !insideShipRef.current &&
        sceneRef.current.controls &&
        !suppressShipFollowCameraForSkills
      ) {
        const camPos = _navCamPos.current;
        camPos.set(0, 0, -1).applyQuaternion(ship.quaternion);
        const navCameraBehind = THREE.MathUtils.clamp(
          optionsRef.current.spaceNavCameraBehind ?? NAV_CAMERA_BEHIND,
          6,
          14,
        );
        const navCameraHeight =
          optionsRef.current.spaceNavCameraHeight ?? NAV_CAMERA_HEIGHT;
        camPos.multiplyScalar(navCameraBehind).add(ship.position);
        camPos.y += navCameraHeight;

        sceneRef.current.controls.setLookAt(
          camPos.x, camPos.y, camPos.z,
          ship.position.x, ship.position.y, ship.position.z,
          true,
        );
      }

      if (distance < arrivalDistance) {
        navTrace(
          "updateAutopilotNavigation()",
          `arrival-check:dist=${distance.toFixed(3)} threshold=${arrivalDistance.toFixed(3)}`,
        );
        // ── For sections: transition to "settling" phase where the ship
        // turns to face the planet centre from the staging point, giving
        // the user a top-down or bottom-up view of the system. ──
        if (
          target.type === "section"
          && target.planetCenter
          && target.id !== "skills"
          && target.id !== "about"
          && target.id !== "projects"
        ) {
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
        shipLog("Arriving at destination", "nav");
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
        manualFlightRef.current.isLightspeedActive = false;

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
            `🌙 Arrived at moon — initiating orbit sequence`,
          );
          shipLog("Entering orbit", "orbit");
          debugLog("nav", `updateAutopilot ARRIVED at moon target.id="${target.id}"`);

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

          debugLog("nav", `company="${company?.company ?? "null"}", moonMesh=${!!moonMesh}, orbitRef=${!!onMoonOrbitArrivalRef.current}`);
          if (moonMesh && company) {
            // Fire the orbit-arrival callback (set by ResumeSpace3D)
            // which triggers the orbit state machine instead of
            // immediately showing content overlays.
            onMoonOrbitArrivalRef.current?.(moonMesh, company);
          } else {
            debugLog("nav", "WARN: moonMesh or company not found — orbit skipped");
          }
        }

        vlog(`🏁 Navigation complete - exiting navigation block`);
        return;
      }
    }
  }, [
    debugLog,
    enterMoonViewRef,
    followingSpaceshipRef,
    insideShipRef,
    manualFlightRef,
    resumeData,
    sceneRef,
    shipLog,
    spaceshipPathRef,
    spaceshipRef,
    optionsRef,
    vlog,
  ]);

  const disposeNavigationSystem = useCallback(() => {
    navTrace("disposeNavigationSystem()", "called");
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
    /** Set this to receive moon arrival events (triggers orbit) */
    onMoonOrbitArrivalRef,
  };
};
