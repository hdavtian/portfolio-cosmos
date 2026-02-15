import type { MutableRefObject } from "react";
import * as THREE from "three";
import type CameraControls from "camera-controls";
import type { SceneRef } from "./ResumeSpace3D.types";
import {
  INTRO_CAM_CLEARANCE,
  INTRO_DETOUR_THRESHOLD,
  INTRO_DETOUR_MIN,
  INTRO_DETOUR_MAX,
  INTRO_ORBIT_ENABLED_DIST,
  INTRO_DIST_FACTOR_DIV,
  INTRO_ORBIT_RADIUS,
} from "./scaleConfig";

// --- INTRO FINAL POSITIONS (captured via debugCamera → F9) ---
// Camera settles at Experience planet vantage point.
// Ship is placed just ahead of camera in the look direction.

export const INTRO_TIME_SCALE = 2 / 3;

export const INTRO_CAMERA_FINAL_POS = new THREE.Vector3(
  14954.5,
  246.3,
  -1044.6,
);
export const INTRO_CAMERA_FINAL_TARGET = new THREE.Vector3(
  14946.7,
  244.7,
  -1045.2,
);
// Ship ends up just in front of the camera (camera looks in roughly -x)
export const INTRO_SHIP_FINAL_POS = new THREE.Vector3(
  14940,
  242,
  -1046,
);
// Ship faces roughly -x (toward the Experience planet).
// The Falcon's rendered forward is +Z (due to forwardOffset), so
// Euler(0, -PI/2, 0) maps +Z → -X, placing the camera behind in +X.
export const INTRO_SHIP_FINAL_QUAT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, -Math.PI / 2, 0),
);

const INTRO_CAMERA_DURATION_MS = Math.round(5000 * INTRO_TIME_SCALE);
const INTRO_SHIP_APPROACH_DURATION_MS = Math.round(5000 * INTRO_TIME_SCALE);
const INTRO_SHIP_ORBIT_DURATION_MS = Math.round(6000 * INTRO_TIME_SCALE);
const INTRO_PASS_THROUGH_CHANCE = 0.45;
const INTRO_ORBIT_CHANCE = 0.6;
const INTRO_STRAIGHT_PATH_CHANCE = 0.25;
const INTRO_SPIN_CHANCE = 0.55;
const INTRO_SPIN_MIN_MS = 1200;
const INTRO_SPIN_MAX_MS = 2000;
const INTRO_SPIN_MIN_TURNS = 1;
const INTRO_SPIN_MAX_TURNS = 1.35;
const INTRO_CAMERA_FLYBY_CHANCE = 0.35;

export type ShipCinematicState = {
  active: boolean;
  phase: "orbit" | "approach" | "hover";
  startTime: number;
  duration: number;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  controlPos: THREE.Vector3;
  controlPos2?: THREE.Vector3;
  flybyPoint?: THREE.Vector3;
  startQuat: THREE.Quaternion;
  endQuat: THREE.Quaternion;
  approachLookAt?: THREE.Vector3;
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
  spinStartOffset?: number;
  spinDuration?: number;
  spinTurns?: number;
  settleTargetPos?: THREE.Vector3;
  settleDuration?: number;
};

export type IntroSequenceRunnerParams = {
  camera: THREE.PerspectiveCamera;
  controls: CameraControls;
  sceneRef: MutableRefObject<SceneRef>;
  spaceshipRef: MutableRefObject<THREE.Group | null>;
  shipCinematicRef: MutableRefObject<ShipCinematicState | null>;
  manualFlightModeRef: MutableRefObject<boolean>;
  setFollowingSpaceship: (value: boolean) => void;
  followingSpaceshipRef: MutableRefObject<boolean>;
  setHudVisible: (value: boolean) => void;
  setShipExteriorLights: (value: boolean) => void;
  sunMesh: THREE.Mesh;
};

const getRandomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);

export const buildDynamicShipCinematic = (params: {
  ship: THREE.Group;
  camera: THREE.PerspectiveCamera;
  sunMesh: THREE.Mesh;
  passThroughChance?: number;
}) => {
  const {
    ship,
    camera,
    sunMesh,
    passThroughChance = INTRO_PASS_THROUGH_CHANCE,
  } = params;

  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  const cameraUp = camera.up.clone().normalize();
  const cameraRight = new THREE.Vector3()
    .crossVectors(cameraDirection, cameraUp)
    .normalize();
  const cameraLeft = cameraRight.clone().multiplyScalar(-1);

  const endPos = INTRO_SHIP_FINAL_POS.clone();
  const endQuat = INTRO_SHIP_FINAL_QUAT.clone();
  const startPos = ship.position.clone();

  const distanceToFinal = startPos.distanceTo(endPos);
  const shouldDetour = distanceToFinal < INTRO_DETOUR_THRESHOLD;
  const shouldCameraFlyby = Math.random() < INTRO_CAMERA_FLYBY_CHANCE;

  const routeRoll = Math.random();
  const isStraightRoute = routeRoll < INTRO_STRAIGHT_PATH_CHANCE;
  const isScenicRoute = routeRoll >= 0.65;
  const deviationScale = isScenicRoute ? 1.2 : 0.7;

  const baseControl = startPos
    .clone()
    .lerp(endPos, isScenicRoute ? 0.6 : getRandomBetween(0.45, 0.65));

  const lateral = cameraLeft
    .clone()
    .multiplyScalar(getRandomBetween(-80, 80) * deviationScale);
  const vertical = cameraUp
    .clone()
    .multiplyScalar(getRandomBetween(15, 90) * deviationScale);
  const forward = cameraDirection
    .clone()
    .multiplyScalar(getRandomBetween(-20, 80) * deviationScale);

  const shouldFlyByCamera =
    !isStraightRoute && Math.random() < passThroughChance;

  let controlPos = baseControl.clone().add(lateral).add(vertical).add(forward);
  let controlPos2: THREE.Vector3 | undefined = baseControl
    .clone()
    .add(
      cameraRight
        .clone()
        .multiplyScalar(getRandomBetween(-70, 70) * deviationScale),
    )
    .add(
      cameraUp
        .clone()
        .multiplyScalar(getRandomBetween(-10, 60) * deviationScale),
    )
    .add(
      cameraDirection
        .clone()
        .multiplyScalar(getRandomBetween(-40, 120) * deviationScale),
    );

  let flybyPoint: THREE.Vector3 | undefined;
  let approachLookAt: THREE.Vector3 | undefined;

  if (shouldDetour) {
    const cameraPos = camera.position.clone();
    const detourDistance = getRandomBetween(
      INTRO_DETOUR_MIN,
      INTRO_DETOUR_MAX,
    );

    if (shouldCameraFlyby) {
      flybyPoint = cameraPos
        .clone()
        .add(cameraDirection.clone().multiplyScalar(INTRO_CAM_CLEARANCE));
      approachLookAt = endPos.clone();
      controlPos = startPos
        .clone()
        .lerp(cameraPos, getRandomBetween(0.5, 0.7))
        .add(cameraRight.clone().multiplyScalar(getRandomBetween(-50, 50)))
        .add(cameraUp.clone().multiplyScalar(getRandomBetween(-30, 50)));
      const behindCamera = cameraPos
        .clone()
        .add(cameraDirection.clone().multiplyScalar(-detourDistance))
        .lerp(endPos, 0.35);
      controlPos2 = behindCamera
        .clone()
        .add(cameraRight.clone().multiplyScalar(getRandomBetween(-140, 140)))
        .add(cameraUp.clone().multiplyScalar(getRandomBetween(-60, 120)));
    } else {
      const detourPoint = cameraPos
        .clone()
        .add(cameraDirection.clone().multiplyScalar(detourDistance))
        .add(cameraRight.clone().multiplyScalar(getRandomBetween(-180, 180)))
        .add(cameraUp.clone().multiplyScalar(getRandomBetween(-120, 200)));

      flybyPoint = detourPoint.clone();
      controlPos = startPos
        .clone()
        .lerp(detourPoint, 0.45)
        .add(cameraLeft.clone().multiplyScalar(getRandomBetween(-60, 60)));
      controlPos2 = detourPoint
        .clone()
        .lerp(endPos, 0.45)
        .add(cameraRight.clone().multiplyScalar(getRandomBetween(-50, 50)))
        .add(cameraUp.clone().multiplyScalar(getRandomBetween(-10, 40)));
    }
  } else if (isStraightRoute) {
    controlPos = startPos.clone().lerp(endPos, 0.5);
    controlPos2 = undefined;
    flybyPoint = undefined;
  } else if (shouldFlyByCamera || shouldCameraFlyby) {
    const cameraPos = camera.position.clone();
    flybyPoint = cameraPos
      .clone()
      .add(cameraDirection.clone().multiplyScalar(INTRO_CAM_CLEARANCE));
    approachLookAt = endPos.clone();
    controlPos = startPos
      .clone()
      .lerp(cameraPos, getRandomBetween(0.55, 0.75))
      .add(cameraRight.clone().multiplyScalar(getRandomBetween(-50, 50)))
      .add(cameraUp.clone().multiplyScalar(getRandomBetween(-40, 40)));
    const behindCamera = cameraPos
      .clone()
      .add(cameraDirection.clone().multiplyScalar(getRandomBetween(-260, -160)))
      .lerp(endPos, 0.35);
    controlPos2 = behindCamera
      .clone()
      .add(cameraLeft.clone().multiplyScalar(getRandomBetween(-60, 60)))
      .add(cameraUp.clone().multiplyScalar(getRandomBetween(-30, 50)));
  }

  const sunPosition = new THREE.Vector3();
  sunMesh.getWorldPosition(sunPosition);

  const distanceToSun = startPos.distanceTo(sunPosition);
  const orbitEnabled =
    Math.random() < INTRO_ORBIT_CHANCE &&
    !shouldDetour &&
    !isStraightRoute &&
    distanceToSun < INTRO_ORBIT_ENABLED_DIST;

  const distanceFactor = THREE.MathUtils.clamp(distanceToFinal / INTRO_DIST_FACTOR_DIV, 0.6, 1.4);
  const approachDuration =
    INTRO_SHIP_APPROACH_DURATION_MS *
    distanceFactor *
    (shouldDetour ? 1.4 : 1) *
    (shouldCameraFlyby ? 1.3 : 1);

  return {
    endPos,
    endQuat,
    controlPos,
    controlPos2,
    flybyPoint,
    approachLookAt,
    orbitCenter: sunPosition,
    orbitEnabled,
    isStraightRoute,
    shouldDetour,
    approachDuration,
  };
};

export const createIntroSequenceRunner = (
  params: IntroSequenceRunnerParams,
) => {
  const {
    camera,
    controls,
    sceneRef,
    spaceshipRef,
    shipCinematicRef,
    manualFlightModeRef,
    setFollowingSpaceship,
    followingSpaceshipRef,
    setHudVisible,
    setShipExteriorLights,
    sunMesh,
  } = params;

  let introRafId: number | null = null;

  const cancelIntroSequence = () => {
    if (introRafId !== null) {
      cancelAnimationFrame(introRafId);
      introRafId = null;
    }
  };

  const startIntroSequence = () => {
    cancelIntroSequence();

    const startPos = camera.position.clone();
    const startTarget = new THREE.Vector3();
    controls.getTarget(startTarget);
    const endPos = INTRO_CAMERA_FINAL_POS.clone();
    const endTarget = INTRO_CAMERA_FINAL_TARGET.clone();

    const startTime = performance.now();
    const previousControlsEnabled = controls.enabled;
    controls.enabled = false;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animateCamera = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / INTRO_CAMERA_DURATION_MS, 1);
      const eased = easeOutCubic(progress);

      const currentPos = new THREE.Vector3().lerpVectors(
        startPos,
        endPos,
        eased,
      );
      const currentTarget = new THREE.Vector3().lerpVectors(
        startTarget,
        endTarget,
        eased,
      );

      controls.setLookAt(
        currentPos.x, currentPos.y, currentPos.z,
        currentTarget.x, currentTarget.y, currentTarget.z,
        false,
      );

      if (progress < 1) {
        introRafId = requestAnimationFrame(animateCamera);
      } else {
        introRafId = null;
        controls.enabled = previousControlsEnabled;
        setHudVisible(false);

        const startShipCinematic = (attempts: number = 0) => {
          const ship = spaceshipRef.current;
          const currentCamera = sceneRef.current.camera as
            | THREE.PerspectiveCamera
            | undefined;
          const currentControls = sceneRef.current.controls;

          if (!ship || !currentCamera || !currentControls) {
            if (attempts < 10) {
              window.setTimeout(() => startShipCinematic(attempts + 1), 250);
            }
            return;
          }

          manualFlightModeRef.current = false;
          setFollowingSpaceship(false);
          followingSpaceshipRef.current = false;
          setShipExteriorLights(true);

          // Check if the ship is already close to its final position
          // (e.g. gentle zoom-in intro — no elaborate cinematic needed).
          const distToFinal = ship.position.distanceTo(INTRO_SHIP_FINAL_POS);
          if (distToFinal < 200) {
            // Ship is already at/near its spot — place it precisely and
            // go straight to "hover" phase so auto-engage kicks in quickly.
            ship.position.copy(INTRO_SHIP_FINAL_POS);
            ship.quaternion.copy(INTRO_SHIP_FINAL_QUAT);

            shipCinematicRef.current = {
              active: true,
              phase: "hover",
              startTime: performance.now(),
              duration: 1000,
              startPos: INTRO_SHIP_FINAL_POS.clone(),
              controlPos: INTRO_SHIP_FINAL_POS.clone(),
              endPos: INTRO_SHIP_FINAL_POS.clone(),
              startQuat: INTRO_SHIP_FINAL_QUAT.clone(),
              endQuat: INTRO_SHIP_FINAL_QUAT.clone(),
              hoverStartTime: performance.now(),
              hoverBasePos: INTRO_SHIP_FINAL_POS.clone(),
              hoverStartQuat: INTRO_SHIP_FINAL_QUAT.clone(),
            };
          } else {
            // Ship is far away — play the full cinematic approach
            const cinematicPath = buildDynamicShipCinematic({
              ship,
              camera: currentCamera,
              sunMesh,
            });

            const spinEnabled = Math.random() < INTRO_SPIN_CHANCE;
            const spinTurns = spinEnabled
              ? getRandomBetween(INTRO_SPIN_MIN_TURNS, INTRO_SPIN_MAX_TURNS)
              : undefined;
            const spinDuration = spinEnabled
              ? getRandomBetween(INTRO_SPIN_MIN_MS, INTRO_SPIN_MAX_MS)
              : undefined;
            const spinStartOffset = spinEnabled
              ? (cinematicPath.approachDuration ||
                  INTRO_SHIP_APPROACH_DURATION_MS) * getRandomBetween(0.25, 0.6)
              : undefined;

            const orbitEnabled = cinematicPath.orbitEnabled !== false;
            shipCinematicRef.current = {
              active: true,
              phase: orbitEnabled ? "orbit" : "approach",
              startTime: orbitEnabled ? performance.now() : performance.now(),
              duration:
                cinematicPath.approachDuration || INTRO_SHIP_APPROACH_DURATION_MS,
              startPos: ship.position.clone(),
              controlPos: cinematicPath.controlPos,
              controlPos2: cinematicPath.controlPos2,
              flybyPoint: cinematicPath.flybyPoint,
              endPos: cinematicPath.endPos,
              startQuat: ship.quaternion.clone(),
              endQuat: cinematicPath.endQuat,
              approachLookAt: cinematicPath.approachLookAt,
              lightsTriggered: true,
              orbitStartTime: orbitEnabled ? performance.now() : undefined,
              orbitDuration: orbitEnabled
                ? INTRO_SHIP_ORBIT_DURATION_MS
                : undefined,
              orbitCenter: cinematicPath.orbitCenter,
              orbitRadius: orbitEnabled ? INTRO_ORBIT_RADIUS : undefined,
              orbitStartAngle: orbitEnabled ? Math.PI * 0.85 : undefined,
              orbitEndAngle: orbitEnabled ? Math.PI * 2.1 : undefined,
              spinStartOffset,
              spinDuration,
              spinTurns,
            };

            if (!orbitEnabled) {
              shipCinematicRef.current.startTime = performance.now();
              shipCinematicRef.current.startPos = ship.position.clone();
              shipCinematicRef.current.startQuat = ship.quaternion.clone();
            }
          }
        };

        startShipCinematic();
      }
    };

    introRafId = requestAnimationFrame(animateCamera);
  };

  return { startIntroSequence, cancelIntroSequence };
};
