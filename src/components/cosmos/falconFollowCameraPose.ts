import * as THREE from "three";
import { NAV_CAMERA_BEHIND, NAV_CAMERA_HEIGHT } from "./scaleConfig";

export const NAV_CAMERA_BEHIND_MIN = 6;
export const NAV_CAMERA_BEHIND_MAX = 14;

type FollowPoseOptions = {
  navCameraBehind?: number;
  navCameraHeight?: number;
};

export const computeFalconFollowCameraPose = (
  ship: THREE.Object3D,
  options: FollowPoseOptions = {},
  outCameraPos: THREE.Vector3 = new THREE.Vector3(),
  outTargetPos: THREE.Vector3 = new THREE.Vector3(),
) => {
  const navCameraBehind = THREE.MathUtils.clamp(
    options.navCameraBehind ?? NAV_CAMERA_BEHIND,
    NAV_CAMERA_BEHIND_MIN,
    NAV_CAMERA_BEHIND_MAX,
  );
  const navCameraHeight = options.navCameraHeight ?? NAV_CAMERA_HEIGHT;
  outCameraPos
    .set(0, 0, -1)
    .applyQuaternion(ship.quaternion)
    .multiplyScalar(navCameraBehind)
    .add(ship.position);
  outCameraPos.y += navCameraHeight;
  outTargetPos.copy(ship.position);
  return { cameraPos: outCameraPos, targetPos: outTargetPos };
};
