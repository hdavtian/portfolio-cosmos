import { useCallback, useRef } from "react";
import * as THREE from "three";
import {
  ORBIT_ALTITUDE_MULT,
  ORBIT_HOLD_DURATION,
  ORBIT_ENTRY_DURATION,
  ORBIT_DRIFT_AMP,
  ORBIT_DRIFT_FREQ,
  ORBIT_CAM_BEHIND,
  ORBIT_CAM_ABOVE,
  ORBIT_CAM_PITCH_BLEND,
  ORBIT_EXIT_DURATION,
  ORBIT_EXIT_ANGLE,
  ORBIT_EXIT_ACCEL,
  orbitDebug,
} from "../scaleConfig";

/** Read live-tweakable value (debug overrides take precedence when active) */
const _alt = () => orbitDebug.active ? orbitDebug.altitudeMult : ORBIT_ALTITUDE_MULT;
const _behind = () => orbitDebug.active ? orbitDebug.camBehind : ORBIT_CAM_BEHIND;
const _above = () => orbitDebug.active ? orbitDebug.camAbove : ORBIT_CAM_ABOVE;
const _pitch = () => orbitDebug.active ? orbitDebug.pitchBlend : ORBIT_CAM_PITCH_BLEND;
const _noseTilt = () => orbitDebug.active ? orbitDebug.noseTilt : -7.8;

// ─── Moon Orbit — Stationary Hover ──────────────────────────────────────────
export type OrbitPhase = "idle" | "hold" | "entering" | "orbiting" | "exiting";

export interface OrbitCameraInstruction {
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  lerpFactor: number;
  /** When set, the camera's "up" direction is lerped toward this vector.
   *  Using the moon's outward direction makes the surface appear as ground. */
  cameraUp?: THREE.Vector3;
  /** When true, the render loop should NOT override the camera — let the user
   *  drag/rotate freely.  Ship position still updates (drift). */
  userCameraFree?: boolean;
}

type DebugLogFn = (source: string, message: string) => void;

export interface UseMoonOrbitReturn {
  phaseRef: React.MutableRefObject<OrbitPhase>;
  enterOrbit: (
    moonMesh: THREE.Mesh,
    moonRadius: number,
    shipObj: THREE.Object3D,
  ) => void;
  exitOrbit: () => void;
  updateOrbit: (
    dt: number,
    shipObj: THREE.Object3D,
  ) => OrbitCameraInstruction | null;
  isOrbiting: () => boolean;
  orbitMoonRef: React.MutableRefObject<THREE.Mesh | null>;
  onExitCompleteRef: React.MutableRefObject<(() => void) | null>;
  onOrbitEstablishedRef: React.MutableRefObject<(() => void) | null>;
}

// ─── Temp vectors (reused each frame to avoid GC) ───────────────────────────
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

/** Falcon model-space forward offset (GLTF is rotated 180° Y at load) */
const SHIP_FORWARD_OFFSET = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, Math.PI, 0),
);

// ─── Hook ────────────────────────────────────────────────────────────────────

export const useMoonOrbit = (debugLog: DebugLogFn): UseMoonOrbitReturn => {
  const phaseRef = useRef<OrbitPhase>("idle");
  const orbitMoonRef = useRef<THREE.Mesh | null>(null);
  const onExitCompleteRef = useRef<(() => void) | null>(null);
  const onOrbitEstablishedRef = useRef<(() => void) | null>(null);

  // Moon state
  const moonCenterRef = useRef(new THREE.Vector3());
  const moonRadiusRef = useRef(0);
  const phaseTimerRef = useRef(0);
  const totalTimeRef = useRef(0);

  // Hover station
  const hoverPosRef = useRef(new THREE.Vector3());
  const hoverOutwardRef = useRef(new THREE.Vector3());

  // Entry blend
  const entryPosRef = useRef(new THREE.Vector3());
  const entryQuatRef = useRef(new THREE.Quaternion());

  // Exit state
  const exitDirRef = useRef(new THREE.Vector3());
  const exitSpeedRef = useRef(0);
  const exitStartPosRef = useRef(new THREE.Vector3());

  // Throttle helper — only log once per second per tag
  const throttleRef = useRef<Record<string, number>>({});
  const throttledLog = useCallback((tag: string, msg: string) => {
    const now = performance.now();
    if (throttleRef.current[tag] && now - throttleRef.current[tag] < 1000) return;
    throttleRef.current[tag] = now;
    debugLog("orbit", `[${tag}] ${msg}`);
  }, [debugLog]);

  // ── Compute the hover station above the moon ──────────────────

  const computeHoverStation = useCallback(
    (moonCenter: THREE.Vector3, moonRadius: number, shipPos: THREE.Vector3) => {
      const outward = new THREE.Vector3()
        .copy(shipPos)
        .sub(moonCenter);
      if (outward.lengthSq() < 0.01) outward.set(0, 1, 0);
      outward.normalize();
      hoverOutwardRef.current.copy(outward);

      const alt = moonRadius * _alt();
      hoverPosRef.current
        .copy(moonCenter)
        .addScaledVector(outward, moonRadius + alt);

      throttledLog("hoverStation", `outward=[${outward.x.toFixed(2)},${outward.y.toFixed(2)},${outward.z.toFixed(2)}] alt=${alt.toFixed(0)} hoverPos=[${hoverPosRef.current.x.toFixed(0)},${hoverPosRef.current.y.toFixed(0)},${hoverPosRef.current.z.toFixed(0)}]`);
    },
    [throttledLog],
  );

  // ── Enter orbit ──────────────────────────────────────────────

  const enterOrbit = useCallback(
    (moonMesh: THREE.Mesh, moonRadius: number, shipObj: THREE.Object3D) => {
      // If already orbiting (any non-idle phase), ignore — prevents re-entry
      // from clicking the same moon again.
      if (phaseRef.current !== "idle") {
        debugLog("orbit", `enterOrbit() IGNORED — already in phase="${phaseRef.current}"`);
        return;
      }
      debugLog("orbit", `▶▶▶ enterOrbit() CALLED — moonR=${moonRadius}, ship=[${shipObj.position.x.toFixed(0)},${shipObj.position.y.toFixed(0)},${shipObj.position.z.toFixed(0)}]`);

      phaseRef.current = "hold";
      orbitMoonRef.current = moonMesh;
      moonRadiusRef.current = moonRadius;
      phaseTimerRef.current = 0;
      totalTimeRef.current = 0;

      moonMesh.getWorldPosition(moonCenterRef.current);
      debugLog("orbit", `enterOrbit() moonCenter=[${moonCenterRef.current.x.toFixed(0)},${moonCenterRef.current.y.toFixed(0)},${moonCenterRef.current.z.toFixed(0)}]`);

      computeHoverStation(moonCenterRef.current, moonRadius, shipObj.position);

      entryPosRef.current.copy(shipObj.position);
      entryQuatRef.current.copy(shipObj.quaternion);

      debugLog("orbit", `enterOrbit() DONE → phase=hold, hoverPos=[${hoverPosRef.current.x.toFixed(0)},${hoverPosRef.current.y.toFixed(0)},${hoverPosRef.current.z.toFixed(0)}], outward=[${hoverOutwardRef.current.x.toFixed(2)},${hoverOutwardRef.current.y.toFixed(2)},${hoverOutwardRef.current.z.toFixed(2)}]`);
    },
    [computeHoverStation, debugLog],
  );

  // ── Exit orbit ───────────────────────────────────────────────

  const exitOrbit = useCallback(() => {
    debugLog("orbit", `▶▶▶ exitOrbit() CALLED — current phase=${phaseRef.current}`);
    if (phaseRef.current === "idle" || phaseRef.current === "exiting") return;
    phaseRef.current = "exiting";
    phaseTimerRef.current = 0;
    exitSpeedRef.current = 0.5;
    debugLog("orbit", `exitOrbit() → phase=exiting`);
  }, [debugLog]);

  // ── Per-frame update ─────────────────────────────────────────

  const updateOrbit = useCallback(
    (dt: number, shipObj: THREE.Object3D): OrbitCameraInstruction | null => {
      const phase = phaseRef.current;
      if (phase === "idle") return null;

      // Keep moon center fresh
      if (orbitMoonRef.current) {
        orbitMoonRef.current.getWorldPosition(moonCenterRef.current);
      }

      phaseTimerRef.current += dt;
      totalTimeRef.current += dt;
      const moonR = moonRadiusRef.current;
      const outward = hoverOutwardRef.current;

      // ── HOLD phase ─────────────────────────────────────────────
      if (phase === "hold") {
        const holdT = Math.min(phaseTimerRef.current / ORBIT_HOLD_DURATION, 1.0);

        if (phaseTimerRef.current >= ORBIT_HOLD_DURATION) {
          debugLog("orbit", `▶ TRANSITION: hold → entering (timer=${phaseTimerRef.current.toFixed(2)}s)`);
          phaseRef.current = "entering";
          phaseTimerRef.current = 0;
          entryPosRef.current.copy(shipObj.position);
          entryQuatRef.current.copy(shipObj.quaternion);
          computeHoverStation(moonCenterRef.current, moonR, shipObj.position);
        }

        const camInstr = computeHoverCamera(
          shipObj.position, moonCenterRef.current, outward, moonR, 0, throttledLog,
        );
        const isFirstFrame = phaseTimerRef.current < 0.05;
        camInstr.lerpFactor = isFirstFrame ? 0.30 : (0.03 + holdT * 0.04);

        throttledLog("hold", `holdT=${holdT.toFixed(2)} lf=${camInstr.lerpFactor.toFixed(3)} ship=[${shipObj.position.x.toFixed(0)},${shipObj.position.y.toFixed(0)},${shipObj.position.z.toFixed(0)}]`);
        return camInstr;
      }

      // ── ENTERING phase ─────────────────────────────────────────
      if (phase === "entering") {
        const t = Math.min(phaseTimerRef.current / ORBIT_ENTRY_DURATION, 1.0);
        const ease = t * t * (3 - 2 * t);

        computeHoverStation(moonCenterRef.current, moonR, entryPosRef.current);
        shipObj.position.lerpVectors(entryPosRef.current, hoverPosRef.current, ease);
        orientShipForHover(shipObj, outward, ease);

        throttledLog("entering", `t=${t.toFixed(2)} ease=${ease.toFixed(2)} ship=[${shipObj.position.x.toFixed(0)},${shipObj.position.y.toFixed(0)},${shipObj.position.z.toFixed(0)}]`);

        if (t >= 1.0) {
          debugLog("orbit", `▶ TRANSITION: entering → orbiting`);
          phaseRef.current = "orbiting";
          phaseTimerRef.current = 0;
          debugLog("orbit", `onOrbitEstablishedRef set=${!!onOrbitEstablishedRef.current} — calling it`);
          onOrbitEstablishedRef.current?.();
        }

        const camInstr = computeHoverCamera(
          shipObj.position, moonCenterRef.current, outward, moonR, 0, throttledLog,
        );
        return camInstr;
      }

      // ── ORBITING phase (stationary hover) ──────────────────────
      if (phase === "orbiting") {
        const driftTime = totalTimeRef.current;
        const driftAmt = moonR * ORBIT_DRIFT_AMP;
        const freq = ORBIT_DRIFT_FREQ * Math.PI * 2;

        const tangentA = new THREE.Vector3()
          .crossVectors(outward, _up)
          .normalize();
        if (tangentA.lengthSq() < 0.01) tangentA.set(1, 0, 0);
        const tangentB = new THREE.Vector3()
          .crossVectors(outward, tangentA)
          .normalize();

        const driftX = Math.sin(driftTime * freq) * driftAmt;
        const driftZ = Math.sin(driftTime * freq * 0.7 + 1.3) * driftAmt * 0.6;
        const driftY = Math.sin(driftTime * freq * 0.4 + 2.1) * driftAmt * 0.3;

        computeHoverStation(moonCenterRef.current, moonR, entryPosRef.current);
        shipObj.position
          .copy(hoverPosRef.current)
          .addScaledVector(tangentA, driftX)
          .addScaledVector(tangentB, driftZ)
          .addScaledVector(outward, driftY);

        orientShipForHover(shipObj, outward, 1.0);

        throttledLog("orbiting", `drift=[${driftX.toFixed(1)},${driftZ.toFixed(1)},${driftY.toFixed(1)}] ship=[${shipObj.position.x.toFixed(0)},${shipObj.position.y.toFixed(0)},${shipObj.position.z.toFixed(0)}]`);

        const camInstr = computeHoverCamera(
          shipObj.position, moonCenterRef.current, outward, moonR, driftTime, throttledLog,
        );
        camInstr.userCameraFree = true;
        return camInstr;
      }

      // ── EXITING phase ──────────────────────────────────────────
      if (phase === "exiting") {
        const t = Math.min(phaseTimerRef.current / ORBIT_EXIT_DURATION, 1.0);
        const ease = t * t;

        if (phaseTimerRef.current <= dt * 2) {
          const tangentA = new THREE.Vector3()
            .crossVectors(outward, _up)
            .normalize();
          if (tangentA.lengthSq() < 0.01) tangentA.set(1, 0, 0);

          exitDirRef.current
            .copy(outward)
            .multiplyScalar(Math.cos(ORBIT_EXIT_ANGLE))
            .addScaledVector(tangentA, Math.sin(ORBIT_EXIT_ANGLE))
            .normalize();
          exitStartPosRef.current.copy(shipObj.position);
          debugLog("orbit", `exiting first frame — exitDir=[${exitDirRef.current.x.toFixed(2)},${exitDirRef.current.y.toFixed(2)},${exitDirRef.current.z.toFixed(2)}]`);
        }

        exitSpeedRef.current += ORBIT_EXIT_ACCEL * dt;
        const dist = exitSpeedRef.current * phaseTimerRef.current * (1 + ease);
        shipObj.position
          .copy(exitStartPosRef.current)
          .addScaledVector(exitDirRef.current, dist);
        orientShipForExit(shipObj, exitDirRef.current, t);

        throttledLog("exiting", `t=${t.toFixed(2)} dist=${dist.toFixed(1)} ship=[${shipObj.position.x.toFixed(0)},${shipObj.position.y.toFixed(0)},${shipObj.position.z.toFixed(0)}]`);

        if (t >= 1.0) {
          debugLog("orbit", `▶ TRANSITION: exiting → idle`);
          phaseRef.current = "idle";
          orbitMoonRef.current = null;
          phaseTimerRef.current = 0;
          onExitCompleteRef.current?.();
        }

        return {
          cameraPosition: computeExitCamera(shipObj.position, exitDirRef.current),
          cameraTarget: shipObj.position.clone(),
          lerpFactor: 0.05,
          // Gently roll camera.up back to world-Y during exit
          cameraUp: new THREE.Vector3(0, 1, 0),
        };
      }

      debugLog("orbit", `⚠️ FELL THROUGH — phase="${phase}" returned null`);
      return null;
    },
    [computeHoverStation, debugLog, throttledLog],
  );

  const isOrbiting = useCallback(() => phaseRef.current !== "idle", []);

  return {
    phaseRef,
    enterOrbit,
    exitOrbit,
    updateOrbit,
    isOrbiting,
    orbitMoonRef,
    onExitCompleteRef,
    onOrbitEstablishedRef,
  };
};

// ─── Utility functions ───────────────────────────────────────────────────────

type ThrottledLogFn = (tag: string, msg: string) => void;

function computeHoverCamera(
  shipPos: THREE.Vector3,
  moonCenter: THREE.Vector3,
  outward: THREE.Vector3,
  moonR: number,
  _time: number,
  log: ThrottledLogFn,
): OrbitCameraInstruction {
  const tangent = new THREE.Vector3().crossVectors(outward, _up).normalize();
  if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0);

  const behindDist = moonR * _behind();
  const aboveDist = moonR * _above();

  const camPos = new THREE.Vector3()
    .copy(shipPos)
    .addScaledVector(tangent, -behindDist)
    .addScaledVector(outward, aboveDist);

  // Blend: 0 = surface, 0.5 = ship, 1 = sky above ship
  const surfaceBelow = new THREE.Vector3()
    .copy(moonCenter)
    .addScaledVector(outward, moonR);
  const skyAbove = new THREE.Vector3()
    .copy(shipPos)
    .addScaledVector(outward, moonR * 0.5);
  const camTarget = new THREE.Vector3().lerpVectors(
    surfaceBelow,
    skyAbove,
    _pitch(),
  );

  log("hoverCam", `tangent=[${tangent.x.toFixed(2)},${tangent.y.toFixed(2)},${tangent.z.toFixed(2)}] behind=${behindDist.toFixed(0)} above=${aboveDist.toFixed(0)} | camPos=[${camPos.x.toFixed(0)},${camPos.y.toFixed(0)},${camPos.z.toFixed(0)}] lookAt=[${camTarget.x.toFixed(0)},${camTarget.y.toFixed(0)},${camTarget.z.toFixed(0)}] | surfBelow=[${surfaceBelow.x.toFixed(0)},${surfaceBelow.y.toFixed(0)},${surfaceBelow.z.toFixed(0)}] blend=${_pitch()}`);

  return {
    cameraPosition: camPos,
    cameraTarget: camTarget,
    lerpFactor: 0.04,
    // "Up" = outward from moon surface → makes the moon appear as ground/horizon
    cameraUp: outward.clone(),
  };
}

function orientShipForHover(
  ship: THREE.Object3D,
  outward: THREE.Vector3,
  blendAmount: number,
) {
  const tangent = new THREE.Vector3().crossVectors(outward, _up).normalize();
  if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0);

  const lookTarget = new THREE.Vector3()
    .copy(ship.position)
    .addScaledVector(tangent, 10)
    .addScaledVector(outward, _noseTilt()); // negative = nose down toward surface

  const m = new THREE.Matrix4().lookAt(ship.position, lookTarget, outward);
  _q.setFromRotationMatrix(m);
  _q.multiply(SHIP_FORWARD_OFFSET);

  ship.quaternion.slerp(_q, 0.02 + blendAmount * 0.04);
}

function orientShipForExit(
  ship: THREE.Object3D,
  exitDir: THREE.Vector3,
  t: number,
) {
  const lookTarget = new THREE.Vector3()
    .copy(ship.position)
    .addScaledVector(exitDir, 10);
  const m = new THREE.Matrix4().lookAt(ship.position, lookTarget, _up);
  _q.setFromRotationMatrix(m);
  _q.multiply(SHIP_FORWARD_OFFSET);
  ship.quaternion.slerp(_q, 0.03 + t * 0.05);
}

function computeExitCamera(
  shipPos: THREE.Vector3,
  exitDir: THREE.Vector3,
): THREE.Vector3 {
  return new THREE.Vector3()
    .copy(shipPos)
    .addScaledVector(exitDir, -12)
    .add(new THREE.Vector3(0, 4, 0));
}
