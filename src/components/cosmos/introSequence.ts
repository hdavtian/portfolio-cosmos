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
const INTRO_SHIP_CINEMATIC_START_MS = 4000;
const INTRO_SHIP_APPROACH_DURATION_MS = Math.round(5000 * INTRO_TIME_SCALE);
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

    let shipCinematicTriggered = false;

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

      // Deterministic hero entrance:
      // 1) Spawn behind camera
      // 2) Sweep into frame
      // 3) Stop with the ship rear facing the viewer
      const distToFinal = ship.position.distanceTo(INTRO_SHIP_FINAL_POS);
      const camDir = new THREE.Vector3();
      currentCamera.getWorldDirection(camDir);
      const camUp = currentCamera.up.clone().normalize();
      const camRight = new THREE.Vector3().crossVectors(camDir, camUp).normalize();
      const endHeroPos = INTRO_SHIP_FINAL_POS.clone();
      const startHeroPos = currentCamera.position
        .clone()
        .addScaledVector(camDir, -260)
        .addScaledVector(camUp, 20)
        .addScaledVector(camRight, 22);
      const controlA = currentCamera.position
        .clone()
        .addScaledVector(camDir, -76)
        .addScaledVector(camUp, 28)
        .addScaledVector(camRight, 64);
      const controlB = endHeroPos
        .clone()
        .addScaledVector(camRight, 84)
        .addScaledVector(camUp, 24);
      const endLookAt = endHeroPos.clone().addScaledVector(camDir, 140);
      const startLookMat = new THREE.Matrix4().lookAt(
        startHeroPos,
        controlA,
        new THREE.Vector3(0, 1, 0),
      );
      const endLookMat = new THREE.Matrix4().lookAt(
        endHeroPos,
        endLookAt,
        new THREE.Vector3(0, 1, 0),
      );
      const startHeroQuat = new THREE.Quaternion().setFromRotationMatrix(startLookMat);
      const endHeroQuat = new THREE.Quaternion().setFromRotationMatrix(endLookMat);
      // Slight side bias so the final orientation is rear-facing but not perfectly straight.
      const sideBias = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        -0.14,
      );
      endHeroQuat.premultiply(sideBias);
      const forwardOffset = ship.userData.forwardOffset as
        | THREE.Quaternion
        | undefined;
      if (forwardOffset) {
        startHeroQuat.multiply(forwardOffset);
        endHeroQuat.multiply(forwardOffset);
      }
      ship.position.copy(startHeroPos);
      ship.quaternion.copy(startHeroQuat);
      onIntroEvent?.("ship-cinematic started");
      shipCinematicRef.current = {
        active: true,
        phase: "approach",
        startTime: performance.now(),
        duration: Math.round((3600 + Math.min(1200, distToFinal * 1.2)) * INTRO_TIME_SCALE),
        startPos: startHeroPos.clone(),
        controlPos: controlA,
        controlPos2: controlB,
        flybyPoint: currentCamera.position
          .clone()
          .addScaledVector(camDir, 22)
          .addScaledVector(camRight, 18),
        endPos: endHeroPos,
        startQuat: ship.quaternion.clone(),
        endQuat: endHeroQuat,
        approachLookAt: endLookAt,
        lightsTriggered: true,
      };
    };

    const animateCamera = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / INTRO_CAMERA_DURATION_MS, 1);
      const eased = easeInOut(progress);
      const currentPos = startPos.clone().lerp(endPos, eased);
      const currentTarget = startTarget.clone().lerp(endTarget, eased);

      controls.setLookAt(
        currentPos.x, currentPos.y, currentPos.z,
        currentTarget.x, currentTarget.y, currentTarget.z,
        false,
      );

      if (!shipCinematicTriggered && elapsed >= INTRO_SHIP_CINEMATIC_START_MS) {
        shipCinematicTriggered = true;
        onIntroEvent?.("ship-cinematic trigger @4s");
        startShipCinematic();
      }

      if (progress < 1) {
        introRafId = requestAnimationFrame(animateCamera);
      } else {
        introRafId = null;
        controls.enabled = previousControlsEnabled;
        setHudVisible(false);
        onIntroEvent?.("camera-intro completed");
        if (!shipCinematicTriggered) {
          shipCinematicTriggered = true;
          onIntroEvent?.("ship-cinematic trigger @intro-end");
          startShipCinematic();
        }
      }
    };

    introRafId = requestAnimationFrame(animateCamera);
  };

  return { startIntroSequence, cancelIntroSequence };
};
