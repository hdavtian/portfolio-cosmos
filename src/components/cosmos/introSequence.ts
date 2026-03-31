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
} from "./scaleConfig";

// --- INTRO FINAL POSITIONS (captured via debugCamera → F9) ---
// Camera settles at Experience planet vantage point.
// Ship is placed just ahead of camera in the look direction.

export const INTRO_TIME_SCALE = 2 / 3;

export const INTRO_CAMERA_START_POS = new THREE.Vector3(
  15551.613,
  1472.504,
  -2145.511,
);
export const INTRO_CAMERA_START_TARGET = new THREE.Vector3(
  14946.7,
  244.7,
  -1045.2,
);
export const INTRO_CAMERA_FINAL_POS = new THREE.Vector3(
  15366.426,
  300.846,
  -1189.038,
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

const INTRO_CAMERA_DURATION_MS = 7000;
const INTRO_SHIP_APPROACH_DURATION_MS = Math.round(5000 * INTRO_TIME_SCALE);
export const INTRO_SHIP_PICKUP_DURATION_MS = 6200;
const INTRO_CAMERA_RETREAT_START_PROGRESS = 0;
const INTRO_PASS_THROUGH_CHANCE = 0.45;
const INTRO_ORBIT_CHANCE = 0.6;
const INTRO_STRAIGHT_PATH_CHANCE = 0.25;
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
  cameraRetreatStartProgress?: number;
  cameraRetreatStartPos?: THREE.Vector3;
  cameraRetreatStartTarget?: THREE.Vector3;
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
  introCameraPrealignedRef: MutableRefObject<boolean>;
  setHudVisible: (value: boolean) => void;
  setShipExteriorLights: (value: boolean) => void;
  sunMesh: THREE.Mesh;
  onIntroEvent?: (event: string) => void;
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
    controls,
    sceneRef,
    spaceshipRef,
    shipCinematicRef,
    manualFlightModeRef,
    setFollowingSpaceship,
    followingSpaceshipRef,
    introCameraPrealignedRef,
    setHudVisible,
    setShipExteriorLights,
    onIntroEvent,
  } = params;

  let introRafId: number | null = null;

  const cancelIntroSequence = () => {
    if (introRafId !== null) {
      cancelAnimationFrame(introRafId);
      introRafId = null;
      onIntroEvent?.("camera-intro cancelled");
    }
  };

  const startIntroSequence = () => {
    cancelIntroSequence();
    introCameraPrealignedRef.current = false;
    const introShip = spaceshipRef.current;
    if (introShip) {
      // Prevent distant "spec" sightings during the 7s camera intro.
      introShip.visible = false;
    }

    const startPos = INTRO_CAMERA_START_POS.clone();
    const startTarget = INTRO_CAMERA_START_TARGET.clone();
    const endPos = INTRO_CAMERA_FINAL_POS.clone();
    const endTarget = INTRO_CAMERA_FINAL_TARGET.clone();

    const startTime = performance.now();
    const previousControlsEnabled = controls.enabled;
    controls.enabled = false;
    onIntroEvent?.("camera-intro started");
    controls.setLookAt(
      startPos.x,
      startPos.y,
      startPos.z,
      startTarget.x,
      startTarget.y,
      startTarget.z,
      false,
    );

    // Smoother than cubic ease: gentle acceleration/deceleration.
    const easeInOut = (t: number) => {
      const clamped = THREE.MathUtils.clamp(t, 0, 1);
      return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
    };

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

      // Intro beat: Falcon comes from behind camera very slowly, passes just
      // beyond camera focus, then settles for a rear/top boarding-style view.
      const camDir = new THREE.Vector3();
      currentCamera.getWorldDirection(camDir);
      const camUp = currentCamera.up.clone().normalize();
      const camRight = new THREE.Vector3().crossVectors(camDir, camUp).normalize();
      const endHeroPos = currentCamera.position
        .clone()
        .addScaledVector(camDir, 4)
        .addScaledVector(camUp, -1.2)
        .addScaledVector(camRight, 0.8);
      const startHeroPos = currentCamera.position
        .clone()
        .addScaledVector(camDir, -6)
        .addScaledVector(camUp, -3.8)
        .addScaledVector(camRight, 0.9);
      const controlA = startHeroPos
        .clone()
        .lerp(endHeroPos, 0.35)
        .addScaledVector(camUp, 1.6)
        .addScaledVector(camRight, 1.5);
      const controlB = startHeroPos
        .clone()
        .lerp(endHeroPos, 0.76)
        .addScaledVector(camUp, 0.7)
        .addScaledVector(camRight, -0.6);
      const endLookAt = endHeroPos.clone().addScaledVector(camDir, 110);
      const startLookMat = new THREE.Matrix4().lookAt(
        startHeroPos,
        startHeroPos.clone().add(camDir),
        new THREE.Vector3(0, 1, 0),
      );
      const endLookMat = new THREE.Matrix4().lookAt(
        endHeroPos,
        endLookAt,
        new THREE.Vector3(0, 1, 0),
      );
      const startHeroQuat = new THREE.Quaternion().setFromRotationMatrix(startLookMat);
      const endHeroQuat = new THREE.Quaternion().setFromRotationMatrix(endLookMat);
      const forwardOffset = ship.userData.forwardOffset as
        | THREE.Quaternion
        | undefined;
      if (forwardOffset) {
        startHeroQuat.multiply(forwardOffset);
        endHeroQuat.multiply(forwardOffset);
      }
      ship.visible = true;
      ship.position.copy(startHeroPos);
      ship.quaternion.copy(startHeroQuat);
      onIntroEvent?.("ship-cinematic started");
      const retreatStartProgress = INTRO_CAMERA_RETREAT_START_PROGRESS;
      const retreatStartTarget = currentControls
        .getTarget(new THREE.Vector3())
        .clone();
      shipCinematicRef.current = {
        active: true,
        phase: "approach",
        startTime: performance.now(),
        duration: INTRO_SHIP_PICKUP_DURATION_MS,
        startPos: startHeroPos.clone(),
        controlPos: controlA,
        controlPos2: controlB,
        flybyPoint: undefined,
        endPos: endHeroPos,
        startQuat: ship.quaternion.clone(),
        endQuat: endHeroQuat,
        approachLookAt: endLookAt,
        lightsTriggered: true,
        cameraRetreatStartProgress: retreatStartProgress,
        cameraRetreatStartPos: currentCamera.position.clone(),
        cameraRetreatStartTarget: retreatStartTarget,
      };
    };

    let _introFrameCount = 0;
    const animateCamera = () => {
      const _iStart = performance.now();
      _introFrameCount++;
      const elapsed = _iStart - startTime;
      const progress = Math.min(elapsed / INTRO_CAMERA_DURATION_MS, 1);
      const eased = easeInOut(progress);
      const currentPos = startPos.clone().lerp(endPos, eased);
      const currentTarget = startTarget.clone().lerp(endTarget, eased);

      controls.setLookAt(
        currentPos.x, currentPos.y, currentPos.z,
        currentTarget.x, currentTarget.y, currentTarget.z,
        false,
      );

      const _iMs = performance.now() - _iStart;
      if (_iMs > 5) {
        console.warn(`[PERF:intro] camera frame #${_introFrameCount} progress=${(progress * 100).toFixed(0)}% took ${_iMs.toFixed(1)}ms`);
      }

      if (progress < 1) {
        introRafId = requestAnimationFrame(animateCamera);
      } else {
        introRafId = null;
        controls.enabled = previousControlsEnabled;
        setHudVisible(false);
        console.warn(`[PERF:intro] camera intro COMPLETED after ${_introFrameCount} frames, elapsed=${elapsed.toFixed(0)}ms`);
        onIntroEvent?.("camera-intro completed");
        onIntroEvent?.("ship-cinematic trigger @intro-end");
        startShipCinematic();
      }
    };

    introRafId = requestAnimationFrame(animateCamera);
  };

  return { startIntroSequence, cancelIntroSequence };
};
