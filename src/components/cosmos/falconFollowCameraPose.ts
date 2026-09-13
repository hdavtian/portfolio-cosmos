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
  // A vehicle can pin its own chase distance (e.g. the Bronco sits much
  // closer); that overrides the Falcon-tuned options and clamp.
  const vehicleCamera = ship.userData.followCamera as
    | { behind: number; height: number }
    | undefined;
  const navCameraBehind =
    vehicleCamera?.behind ??
    THREE.MathUtils.clamp(
      options.navCameraBehind ?? NAV_CAMERA_BEHIND,
      NAV_CAMERA_BEHIND_MIN,
      NAV_CAMERA_BEHIND_MAX,
    );
  const navCameraHeight =
    vehicleCamera?.height ?? options.navCameraHeight ?? NAV_CAMERA_HEIGHT;
  outCameraPos
    .set(0, 0, -1)
    .applyQuaternion(ship.quaternion)
    .multiplyScalar(navCameraBehind)
    .add(ship.position);
  outCameraPos.y += navCameraHeight;
  outTargetPos.copy(ship.position);
  return { cameraPos: outCameraPos, targetPos: outTargetPos };
};
