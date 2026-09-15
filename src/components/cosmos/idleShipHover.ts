import * as THREE from "three";
import CameraControls from "camera-controls";

/**
 * Keeps a parked ship looking alive: once nothing has moved it for a moment,
 * it floats gently around a fixed base point (like the moon-orbit hover
 * drift), and the follow camera slowly sways. The camera aims at the base
 * point, not the floating ship, so the ship moves on screen while the view
 * stays steady. Both are very slow and small on purpose (no seasickness).
 */

/** Seconds the ship must sit untouched before it starts to hover. */
const HOVER_DELAY_S = 2;
/** Seconds the hover eases in over. */
const HOVER_RAMP_S = 3;
/** Float distance in world units (the Falcon is ~0.7 units long). */
const HOVER_AMPLITUDE = 0.06;
/** Gentle roll/pitch rock, radians. */
const HOVER_ROCK = THREE.MathUtils.degToRad(0.8);

const SWAY_AZIMUTH = THREE.MathUtils.degToRad(4);
const SWAY_POLAR = THREE.MathUtils.degToRad(1.5);
const SWAY_AZIMUTH_PERIOD_S = 52;
const SWAY_POLAR_PERIOD_S = 71;
/** The sway pauses this long after the user touches the camera. */
const SWAY_PAUSE_AFTER_INPUT_S = 4;

const TAU = Math.PI * 2;
const HOVER_STATE_KEY = "__idleHover";
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);

type HoverState = {
  base: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
  written: THREE.Vector3;
  writtenQuaternion: THREE.Quaternion;
  stillSeconds: number;
  hoverSeconds: number;
};

const _offset = new THREE.Vector3();
const _rockA = new THREE.Quaternion();
const _rockB = new THREE.Quaternion();

/**
 * Call every frame while the ship is parked and followed. Returns the point
 * the follow camera should aim at while hovering, or null when not hovering
 * (aim at the ship as usual). If anything else moves or turns the ship, the
 * hover resets, so it never fights travel, manual flight or scripted moves.
 */
export const updateIdleShipHover = (
  ship: THREE.Object3D,
  deltaSeconds: number,
  eligible: boolean,
): THREE.Vector3 | null => {
  let state = ship.userData[HOVER_STATE_KEY] as HoverState | undefined;
  if (!eligible) {
    if (state) delete ship.userData[HOVER_STATE_KEY];
    return null;
  }
  if (!state) {
    state = {
      base: ship.position.clone(),
      baseQuaternion: ship.quaternion.clone(),
      written: ship.position.clone(),
      writtenQuaternion: ship.quaternion.clone(),
      stillSeconds: 0,
      hoverSeconds: 0,
    };
    ship.userData[HOVER_STATE_KEY] = state;
    return null;
  }

  const movedByOthers =
    ship.position.distanceToSquared(state.written) > 1e-10 ||
    ship.quaternion.angleTo(state.writtenQuaternion) > 1e-5;
  if (movedByOthers) {
    state.base.copy(ship.position);
    state.baseQuaternion.copy(ship.quaternion);
    state.written.copy(ship.position);
    state.writtenQuaternion.copy(ship.quaternion);
    state.stillSeconds = 0;
    state.hoverSeconds = 0;
    return null;
  }

  state.stillSeconds += deltaSeconds;
  if (state.stillSeconds < HOVER_DELAY_S) return null;
  state.hoverSeconds += deltaSeconds;
  const t = state.hoverSeconds;
  const ramp = THREE.MathUtils.smoothstep(t / HOVER_RAMP_S, 0, 1);

  // Three slow, unrelated waves in the ship's own frame.
  _offset
    .set(
      Math.sin(t * TAU * 0.11) * HOVER_AMPLITUDE * 0.5,
      Math.sin(t * TAU * 0.17 + 1.1) * HOVER_AMPLITUDE,
      Math.sin(t * TAU * 0.07 + 2.3) * HOVER_AMPLITUDE * 0.35,
    )
    .applyQuaternion(state.baseQuaternion)
    .multiplyScalar(ramp);
  ship.position.copy(state.base).add(_offset);

  _rockA.setFromAxisAngle(Z_AXIS, Math.sin(t * TAU * 0.09) * HOVER_ROCK * ramp);
  _rockB.setFromAxisAngle(X_AXIS, Math.sin(t * TAU * 0.13 + 0.7) * HOVER_ROCK * 0.6 * ramp);
  ship.quaternion.copy(state.baseQuaternion).multiply(_rockA).multiply(_rockB);

  state.written.copy(ship.position);
  state.writtenQuaternion.copy(ship.quaternion);
  return state.base;
};

type SwayState = {
  time: number;
  pausedUntil: number;
  lastAzimuth: number;
  lastPolar: number;
};

const swayStates = new WeakMap<CameraControls, SwayState>();

/** A very slow orbit sway of the follow camera; pauses while the user interacts. */
export const applyIdleCameraSway = (
  controls: CameraControls,
  deltaSeconds: number,
  nowSeconds: number,
): void => {
  let state = swayStates.get(controls);
  if (!state) {
    state = { time: 0, pausedUntil: 0, lastAzimuth: 0, lastPolar: 0 };
    swayStates.set(controls, state);
  }
  if (controls.currentAction !== CameraControls.ACTION.NONE) {
    state.pausedUntil = nowSeconds + SWAY_PAUSE_AFTER_INPUT_S;
  }
  if (nowSeconds < state.pausedUntil) return;

  state.time += deltaSeconds;
  const azimuth = Math.sin((TAU * state.time) / SWAY_AZIMUTH_PERIOD_S) * SWAY_AZIMUTH;
  const polar = Math.sin((TAU * state.time) / SWAY_POLAR_PERIOD_S) * SWAY_POLAR;
  // Apply only the change, so the user's own framing is kept.
  controls.rotate(azimuth - state.lastAzimuth, polar - state.lastPolar, true);
  state.lastAzimuth = azimuth;
  state.lastPolar = polar;
};
