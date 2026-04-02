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
type ShipLogFn = (message: string, category?: "orbit" | "info" | "nav" | "system" | "error" | "cmd") => void;

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

const _hoverOutward = new THREE.Vector3();
const _entryOutward = new THREE.Vector3();
const _tangentA = new THREE.Vector3();
const _tangentB = new THREE.Vector3();
const _hcTangent = new THREE.Vector3();
const _hcCamPos = new THREE.Vector3();
const _hcSurfBelow = new THREE.Vector3();
const _hcSkyAbove = new THREE.Vector3();
const _hcCamTarget = new THREE.Vector3();
const _hcCamUp = new THREE.Vector3();
const _orientTangent = new THREE.Vector3();
const _orientLookTarget = new THREE.Vector3();
const _orientM = new THREE.Matrix4();
const _exitLookTarget = new THREE.Vector3();
const _exitM = new THREE.Matrix4();
const _exitCamPos = new THREE.Vector3();
const _exitCamTarget = new THREE.Vector3();
const _exitCamUp = new THREE.Vector3(0, 1, 0);

// ─── Hook ────────────────────────────────────────────────────────────────────

export const useMoonOrbit = (
  debugLog: DebugLogFn,
  shipLog?: ShipLogFn,
): UseMoonOrbitReturn => {
  // Keep moon-arrival handoff snappy so it cannot feel like "moving away".
  const HOLD_DURATION = Math.min(ORBIT_HOLD_DURATION, 0.25);
  const ENTRY_TURN_PHASE_END = 0.12;

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
  const entryHoverTargetRef = useRef(new THREE.Vector3());
  const entryStartRadiusRef = useRef(0);
  const entryTargetRadiusRef = useRef(0);
  const entryMaxRadiusRef = useRef(0);
  const instantEntryRef = useRef(false);
  const orbitDriftTimeRef = useRef(0);

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

  const shipDiagThrottleRef = useRef<Record<string, number>>({});
  const shipDiag = useCallback((tag: string, msg: string, minMs = 800) => {
    if (!shipLog) return;
    const now = performance.now();
    if (
      shipDiagThrottleRef.current[tag] &&
      now - shipDiagThrottleRef.current[tag] < minMs
    ) {
      return;
    }
    shipDiagThrottleRef.current[tag] = now;
    shipLog(`DIAG ${tag} | ${msg}`, "orbit");
  }, [shipLog]);

  // ── Compute the hover station above the moon ──────────────────

  const computeHoverStation = useCallback(
    (moonCenter: THREE.Vector3, moonRadius: number, shipPos: THREE.Vector3) => {
      const outward = _hoverOutward
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
      orbitDriftTimeRef.current = 0;

      moonMesh.getWorldPosition(moonCenterRef.current);
      debugLog("orbit", `enterOrbit() moonCenter=[${moonCenterRef.current.x.toFixed(0)},${moonCenterRef.current.y.toFixed(0)},${moonCenterRef.current.z.toFixed(0)}]`);

      computeHoverStation(moonCenterRef.current, moonRadius, shipObj.position);

      entryPosRef.current.copy(shipObj.position);
      entryQuatRef.current.copy(shipObj.quaternion);
      entryStartRadiusRef.current = shipObj.position.distanceTo(moonCenterRef.current);
      entryTargetRadiusRef.current = hoverPosRef.current.distanceTo(moonCenterRef.current);
      entryMaxRadiusRef.current = entryStartRadiusRef.current;
      instantEntryRef.current = false;

      debugLog("orbit", `enterOrbit() DONE → phase=hold, hoverPos=[${hoverPosRef.current.x.toFixed(0)},${hoverPosRef.current.y.toFixed(0)},${hoverPosRef.current.z.toFixed(0)}], outward=[${hoverOutwardRef.current.x.toFixed(2)},${hoverOutwardRef.current.y.toFixed(2)},${hoverOutwardRef.current.z.toFixed(2)}], rStart=${entryStartRadiusRef.current.toFixed(1)} rTarget=${entryTargetRadiusRef.current.toFixed(1)}`);
      shipDiag(
        "entry-init",
        `rStart=${entryStartRadiusRef.current.toFixed(1)} rTarget=${entryTargetRadiusRef.current.toFixed(1)} delta=${(entryTargetRadiusRef.current - entryStartRadiusRef.current).toFixed(1)}`,
        0,
      );
    },
    [computeHoverStation, debugLog, shipDiag],
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
        const holdT = Math.min(phaseTimerRef.current / HOLD_DURATION, 1.0);
        // Lock ship at initial arrival point during hold so any residual
        // autopilot/physics momentum cannot pull it away before entry descent.
        const preLockOffset = shipObj.position.distanceTo(entryPosRef.current);
        if (preLockOffset > 0.5) {
          throttledLog("holdDrift", `drift-detected preLockOffset=${preLockOffset.toFixed(2)} (forcing lock)`);
          shipDiag("hold-drift", `preLockOffset=${preLockOffset.toFixed(2)} forcingLock=1`);
        }
        shipObj.position.copy(entryPosRef.current);

        if (phaseTimerRef.current >= HOLD_DURATION) {
          debugLog("orbit", `▶ TRANSITION: hold → entering (timer=${phaseTimerRef.current.toFixed(2)}s)`);
          phaseRef.current = "entering";
          phaseTimerRef.current = 0;
          entryPosRef.current.copy(shipObj.position);
          entryQuatRef.current.copy(shipObj.quaternion);
          computeHoverStation(moonCenterRef.current, moonR, shipObj.position);

          // Build an entry target that never "bounces away" from the moon:
          // if the computed hover radius is farther than current arrival radius,
          // clamp it inward so the transition is turn -> descend.
          const startOutward = new THREE.Vector3()
            .subVectors(entryPosRef.current, moonCenterRef.current);
          const arrivalRadius = Math.max(startOutward.length(), moonR * 1.1);
          startOutward.normalize();
          const desiredHoverRadius = hoverPosRef.current.distanceTo(moonCenterRef.current);
          const clampedHoverRadius = Math.min(
            desiredHoverRadius,
            Math.max(moonR * 1.05, arrivalRadius - moonR * 0.12),
          );
          entryHoverTargetRef.current
            .copy(moonCenterRef.current)
            .addScaledVector(startOutward, clampedHoverRadius);
          entryStartRadiusRef.current = entryPosRef.current.distanceTo(moonCenterRef.current);
          entryTargetRadiusRef.current = entryHoverTargetRef.current.distanceTo(moonCenterRef.current);
          entryMaxRadiusRef.current = entryStartRadiusRef.current;
          instantEntryRef.current =
            Math.abs(entryStartRadiusRef.current - entryTargetRadiusRef.current) < 5;
          debugLog(
            "orbit",
            `entry-init rStart=${entryStartRadiusRef.current.toFixed(1)} rTarget=${entryTargetRadiusRef.current.toFixed(1)} desiredHoverR=${desiredHoverRadius.toFixed(1)} clampedHoverR=${clampedHoverRadius.toFixed(1)} (delta=${(entryTargetRadiusRef.current - entryStartRadiusRef.current).toFixed(1)})`,
          );
          shipDiag(
            "entry-target",
            `rStart=${entryStartRadiusRef.current.toFixed(1)} rTarget=${entryTargetRadiusRef.current.toFixed(1)} desired=${desiredHoverRadius.toFixed(1)} clamped=${clampedHoverRadius.toFixed(1)}`,
            0,
          );
          if (instantEntryRef.current) {
            shipDiag(
              "entry-instant",
              `delta=${(entryTargetRadiusRef.current - entryStartRadiusRef.current).toFixed(2)} immediate=1`,
              0,
            );
          }
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
        if (instantEntryRef.current) {
          shipObj.position.copy(entryHoverTargetRef.current);
          orientShipForHover(shipObj, hoverOutwardRef.current, 1.0);
          debugLog("orbit", "▶ TRANSITION: entering → orbiting (instant)");
          shipDiag(
            "entry-complete",
            `instant=1 rFinal=${shipObj.position.distanceTo(moonCenterRef.current).toFixed(1)} rStart=${entryStartRadiusRef.current.toFixed(1)} rTarget=${entryTargetRadiusRef.current.toFixed(1)}`,
            0,
          );
          phaseRef.current = "orbiting";
          phaseTimerRef.current = 0;
          orbitDriftTimeRef.current = 0;
          onOrbitEstablishedRef.current?.();

          const camInstr = computeHoverCamera(
            shipObj.position, moonCenterRef.current, hoverOutwardRef.current, moonR, 0, throttledLog,
          );
          return camInstr;
        }

        const t = Math.min(phaseTimerRef.current / ORBIT_ENTRY_DURATION, 1.0);
        const ease = t * t * (3 - 2 * t);

        // Keep final hover station anchored to the arrival outward vector.
        computeHoverStation(moonCenterRef.current, moonR, entryPosRef.current);

        // Two-stage path: rotate first (hold position), then descend/translate.
        // This avoids the "bounce up then down" look from arcing waypoints.
        const turnPhaseEnd = ENTRY_TURN_PHASE_END;
        if (ease < turnPhaseEnd) {
          shipObj.position.copy(entryPosRef.current);
        } else {
          const u = (ease - turnPhaseEnd) / (1 - turnPhaseEnd);
          const uEase = u * u * (3 - 2 * u);
          shipObj.position.lerpVectors(
            entryPosRef.current,
            entryHoverTargetRef.current,
            uEase,
          );
        }

        const currentRadius = shipObj.position.distanceTo(moonCenterRef.current);
        if (currentRadius > entryMaxRadiusRef.current) {
          entryMaxRadiusRef.current = currentRadius;
        }
        throttledLog(
          "entryRadius",
          `t=${t.toFixed(2)} ease=${ease.toFixed(2)} rNow=${currentRadius.toFixed(1)} rStart=${entryStartRadiusRef.current.toFixed(1)} rTarget=${entryTargetRadiusRef.current.toFixed(1)} away=${(currentRadius - entryStartRadiusRef.current).toFixed(2)} toTarget=${(currentRadius - entryTargetRadiusRef.current).toFixed(2)}`,
        );
        shipDiag(
          "entry-radius",
          `t=${t.toFixed(2)} rNow=${currentRadius.toFixed(1)} away=${(currentRadius - entryStartRadiusRef.current).toFixed(2)} toTarget=${(currentRadius - entryTargetRadiusRef.current).toFixed(2)}`,
          600,
        );

        // Use current outward each frame so orientation/camera naturally follows
        // the descent into station instead of "bouncing".
        const entryOutward = _entryOutward
          .subVectors(shipObj.position, moonCenterRef.current);
        if (entryOutward.lengthSq() < 0.01) entryOutward.copy(outward);
        entryOutward.normalize();
        orientShipForHover(shipObj, entryOutward, ease);

        throttledLog("entering", `t=${t.toFixed(2)} ease=${ease.toFixed(2)} ship=[${shipObj.position.x.toFixed(0)},${shipObj.position.y.toFixed(0)},${shipObj.position.z.toFixed(0)}]`);

        if (t >= 1.0) {
          debugLog("orbit", `▶ TRANSITION: entering → orbiting`);
          shipObj.position.copy(entryHoverTargetRef.current);
          entryPosRef.current.copy(entryHoverTargetRef.current);
          debugLog(
            "orbit",
            `entry-complete rFinal=${shipObj.position.distanceTo(moonCenterRef.current).toFixed(1)} rMax=${entryMaxRadiusRef.current.toFixed(1)} rStart=${entryStartRadiusRef.current.toFixed(1)} rTarget=${entryTargetRadiusRef.current.toFixed(1)}`,
          );
          shipDiag(
            "entry-complete",
            `rFinal=${shipObj.position.distanceTo(moonCenterRef.current).toFixed(1)} rMax=${entryMaxRadiusRef.current.toFixed(1)} rStart=${entryStartRadiusRef.current.toFixed(1)} rTarget=${entryTargetRadiusRef.current.toFixed(1)}`,
            0,
          );
          phaseRef.current = "orbiting";
          phaseTimerRef.current = 0;
          orbitDriftTimeRef.current = 0;
          debugLog("orbit", `onOrbitEstablishedRef set=${!!onOrbitEstablishedRef.current} — calling it`);
          onOrbitEstablishedRef.current?.();
        }

        const camInstr = computeHoverCamera(
          shipObj.position, moonCenterRef.current, entryOutward, moonR, 0, throttledLog,
          {
            // Keep camera horizon steadier at entry start and blend to moon-ground framing.
            upBlend: ease,
            targetBlend: THREE.MathUtils.lerp(0.86, _pitch(), ease),
            lerpFactor: THREE.MathUtils.lerp(0.028, 0.04, ease),
          },
        );
        return camInstr;
      }

      // ── ORBITING phase (stationary hover) ──────────────────────
      if (phase === "orbiting") {
        orbitDriftTimeRef.current += dt;
        const driftTime = orbitDriftTimeRef.current;
        // Ease-in drift so orbit start does not look like a "bounce/pop".
        const driftRamp = THREE.MathUtils.clamp(driftTime / 1.1, 0, 1);
        const driftAmt = moonR * ORBIT_DRIFT_AMP;
        const freq = ORBIT_DRIFT_FREQ * Math.PI * 2;

        _tangentA.crossVectors(outward, _up).normalize();
        if (_tangentA.lengthSq() < 0.01) _tangentA.set(1, 0, 0);
        _tangentB.crossVectors(outward, _tangentA).normalize();

        const driftX = Math.sin(driftTime * freq) * driftAmt * driftRamp;
        const driftZ = Math.sin(driftTime * freq * 0.7 + 1.3) * driftAmt * 0.6 * driftRamp;
        const driftY = Math.sin(driftTime * freq * 0.4 + 2.1) * driftAmt * 0.3 * driftRamp;

        computeHoverStation(moonCenterRef.current, moonR, entryPosRef.current);
        shipObj.position
          .copy(hoverPosRef.current)
          .addScaledVector(_tangentA, driftX)
          .addScaledVector(_tangentB, driftZ)
          .addScaledVector(outward, driftY);

        orientShipForHover(shipObj, outward, 1.0);

        throttledLog("orbiting", `drift=[${driftX.toFixed(1)},${driftZ.toFixed(1)},${driftY.toFixed(1)}] ramp=${driftRamp.toFixed(2)} ship=[${shipObj.position.x.toFixed(0)},${shipObj.position.y.toFixed(0)},${shipObj.position.z.toFixed(0)}]`);

        // Keep camera anchored to the hover station while the ship drifts,
        // so moon visits retain ship motion without introducing camera bob.
        const camInstr = computeHoverCamera(
          hoverPosRef.current, moonCenterRef.current, outward, moonR, driftTime, throttledLog,
        );
        camInstr.userCameraFree = true;
        return camInstr;
      }

      // ── EXITING phase ──────────────────────────────────────────
      if (phase === "exiting") {
        const t = Math.min(phaseTimerRef.current / ORBIT_EXIT_DURATION, 1.0);
        const ease = t * t;

        if (phaseTimerRef.current <= dt * 2) {
          _tangentA.crossVectors(outward, _up).normalize();
          if (_tangentA.lengthSq() < 0.01) _tangentA.set(1, 0, 0);

          exitDirRef.current
            .copy(outward)
            .multiplyScalar(Math.cos(ORBIT_EXIT_ANGLE))
            .addScaledVector(_tangentA, Math.sin(ORBIT_EXIT_ANGLE))
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
          cameraTarget: _exitCamTarget.copy(shipObj.position),
          lerpFactor: 0.05,
          cameraUp: _exitCamUp.set(0, 1, 0),
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
  options?: {
    upBlend?: number;
    targetBlend?: number;
    lerpFactor?: number;
  },
): OrbitCameraInstruction {
  _hcTangent.crossVectors(outward, _up).normalize();
  if (_hcTangent.lengthSq() < 0.01) _hcTangent.set(1, 0, 0);

  const behindDist = moonR * _behind();
  const aboveDist = moonR * _above();

  _hcCamPos
    .copy(shipPos)
    .addScaledVector(_hcTangent, -behindDist)
    .addScaledVector(outward, aboveDist);

  _hcSurfBelow.copy(moonCenter).addScaledVector(outward, moonR);
  _hcSkyAbove.copy(shipPos).addScaledVector(outward, moonR * 0.5);
  const targetBlend = options?.targetBlend ?? _pitch();
  _hcCamTarget.lerpVectors(_hcSurfBelow, _hcSkyAbove, targetBlend);
  _hcCamUp
    .copy(_up)
    .lerp(outward, THREE.MathUtils.clamp(options?.upBlend ?? 1, 0, 1))
    .normalize();

  log("hoverCam", `tangent=[${_hcTangent.x.toFixed(2)},${_hcTangent.y.toFixed(2)},${_hcTangent.z.toFixed(2)}] behind=${behindDist.toFixed(0)} above=${aboveDist.toFixed(0)} | camPos=[${_hcCamPos.x.toFixed(0)},${_hcCamPos.y.toFixed(0)},${_hcCamPos.z.toFixed(0)}] lookAt=[${_hcCamTarget.x.toFixed(0)},${_hcCamTarget.y.toFixed(0)},${_hcCamTarget.z.toFixed(0)}] | surfBelow=[${_hcSurfBelow.x.toFixed(0)},${_hcSurfBelow.y.toFixed(0)},${_hcSurfBelow.z.toFixed(0)}] blend=${targetBlend.toFixed(2)} upBlend=${THREE.MathUtils.clamp(options?.upBlend ?? 1, 0, 1).toFixed(2)}`);

  return {
    cameraPosition: _hcCamPos,
    cameraTarget: _hcCamTarget,
    lerpFactor: options?.lerpFactor ?? 0.04,
    cameraUp: _hcCamUp,
  };
}

function orientShipForHover(
  ship: THREE.Object3D,
  outward: THREE.Vector3,
  blendAmount: number,
) {
  _orientTangent.crossVectors(outward, _up).normalize();
  if (_orientTangent.lengthSq() < 0.01) _orientTangent.set(1, 0, 0);

  _orientLookTarget
    .copy(ship.position)
    .addScaledVector(_orientTangent, 10)
    .addScaledVector(outward, _noseTilt());

  _orientM.lookAt(ship.position, _orientLookTarget, outward);
  _q.setFromRotationMatrix(_orientM);
  _q.multiply(SHIP_FORWARD_OFFSET);

  ship.quaternion.slerp(_q, 0.02 + blendAmount * 0.04);
}

function orientShipForExit(
  ship: THREE.Object3D,
  exitDir: THREE.Vector3,
  t: number,
) {
  _exitLookTarget.copy(ship.position).addScaledVector(exitDir, 10);
  _exitM.lookAt(ship.position, _exitLookTarget, _up);
  _q.setFromRotationMatrix(_exitM);
  _q.multiply(SHIP_FORWARD_OFFSET);
  ship.quaternion.slerp(_q, 0.03 + t * 0.05);
}

function computeExitCamera(
  shipPos: THREE.Vector3,
  exitDir: THREE.Vector3,
): THREE.Vector3 {
  _exitCamPos.copy(shipPos).addScaledVector(exitDir, -12);
  _exitCamPos.y += 4;
  return _exitCamPos;
}
