/**
 * StarDestroyerCruiser — Autonomous cruising AI for the Star Destroyer
 *
 * Moves the Star Destroyer slowly and majestically through space,
 * like an aircraft carrier compared to the Falcon's speedboat agility.
 *
 * Behavior loop:
 *   IDLE_DRIFT → TURNING → CRUISING → DECELERATING → IDLE_DRIFT
 *
 * Key characteristics compared to the Falcon:
 * - ~10× slower turn rate (ponderous, massive-vessel inertia)
 * - ~10× slower acceleration/deceleration
 * - Long, sweeping flight paths between random waypoints
 * - Subtle banking into turns for realism
 * - Gentle ambient drift when idle (ship feels alive)
 *
 * Usage:
 *   const cruiser = new StarDestroyerCruiser(meshGroup);
 *   // each frame:
 *   cruiser.update(deltaTimeSeconds);
 */

import * as THREE from "three";
import {
  SD_WAYPOINT_MIN_R,
  SD_WAYPOINT_MAX_R,
  SD_WAYPOINT_MAX_H,
  SD_WAYPOINT_ARRIVE,
  SD_MIN_TRAVEL_DIST,
  SD_ENGINE_LIGHT_BASE,
  SD_ENGINE_LIGHT_RANGE,
} from "./cosmos/scaleConfig";

// ── Configuration ────────────────────────────────────────────────

export interface CruiserConfig {
  /** Max forward speed in units/sec (~12 vs Falcon's ~120) */
  cruisingSpeed: number;
  /** Forward acceleration in units/sec² */
  acceleration: number;
  /** Braking deceleration in units/sec² */
  deceleration: number;
  /** Maximum yaw rate in radians/sec (~0.08 ≈ 4.6°/sec) */
  maxTurnRate: number;
  /** Residual drift speed when idle */
  idleDriftSpeed: number;
  /** Distance (world units) at which waypoint is considered reached */
  waypointArrivalDist: number;
  /** Heading must be within this angle (rad) of waypoint to start cruising */
  turnAlignThreshold: number;
  /** Minimum seconds to drift idle before picking next waypoint */
  minIdleDuration: number;
  /** Maximum seconds to drift idle */
  maxIdleDuration: number;
  /** Minimum radius from scene center for waypoint selection */
  waypointMinRadius: number;
  /** Maximum radius from scene center */
  waypointMaxRadius: number;
  /** Maximum Y (height) variation for waypoints */
  waypointMaxHeight: number;
  /** How much the ship banks into turns (0 = none, 0.2 = subtle) */
  bankFactor: number;
  /** Maximum bank angle in radians */
  maxBankAngle: number;
}

const DEFAULT_CONFIG: CruiserConfig = {
  cruisingSpeed: 12,
  acceleration: 1.5,
  deceleration: 2.0,
  maxTurnRate: 0.08,
  idleDriftSpeed: 0.3,
  waypointArrivalDist: SD_WAYPOINT_ARRIVE,
  turnAlignThreshold: 0.15, // ~8.6°
  minIdleDuration: 4,
  maxIdleDuration: 10,
  waypointMinRadius: SD_WAYPOINT_MIN_R,
  waypointMaxRadius: SD_WAYPOINT_MAX_R,
  waypointMaxHeight: SD_WAYPOINT_MAX_H,
  bankFactor: 0.2,
  maxBankAngle: 0.18, // ~10°
};

type CruiserState = "idle_drift" | "turning" | "cruising" | "decelerating";

// ── Class ────────────────────────────────────────────────────────

export class StarDestroyerCruiser {
  private mesh: THREE.Group;
  private config: CruiserConfig;

  // ── Movement state ──
  private state: CruiserState = "idle_drift";
  private currentSpeed = 0;
  private waypoint: THREE.Vector3 | null = null;

  // ── Heading & banking ──
  /** Pure heading quaternion (no bank applied) */
  private headingQuat = new THREE.Quaternion();
  /** Current bank angle (radians, positive = lean right) */
  private currentBank = 0;

  // ── Idle drift timing ──
  private idleTimer = 0;
  private idleDuration: number;

  // ── Ambient drift (oscillation offset, added/removed each frame) ──
  private driftOffset = new THREE.Vector3();

  // ── Forward offset (model orientation) ──
  /**
   * Quaternion that corrects for the model's nose direction.
   * lookAt convention: -Z faces target.  If the model's visual nose
   * is at +Z, this is a 180° Y rotation (same as the Falcon).
   * Read from mesh.userData.forwardOffset at construction time.
   */
  private forwardOffset: THREE.Quaternion;

  /**
   * The model's nose direction in LOCAL (un-rotated) space.
   * Without forwardOffset: (0, 0, -1).
   * With PI-around-Y offset: (0, 0, 1).
   * Precomputed once so every frame just applies the heading quat.
   */
  private _localForward: THREE.Vector3;

  /**
   * Sign multiplier for banking cross-product.
   * Flips with the forward direction so the ship always banks
   * into the turn regardless of model orientation.
   */
  private _bankSign: number;

  // ── Reusable temp objects (avoid per-frame allocations) ──
  private _forward = new THREE.Vector3();
  private _toTarget = new THREE.Vector3();
  private _targetQuat = new THREE.Quaternion();
  private _lookMatrix = new THREE.Matrix4();
  private _bankQuat = new THREE.Quaternion();
  private _cross = new THREE.Vector3();
  private _up = new THREE.Vector3(0, 1, 0);

  constructor(mesh: THREE.Group, config?: Partial<CruiserConfig>) {
    this.mesh = mesh;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.idleDuration = this.randomIdleDuration();

    // Read forward offset from mesh (set during model loading).
    // If the model's visual nose is at +Z, this should be a 180° Y
    // rotation so that lookAt (which faces -Z) gets flipped.
    this.forwardOffset =
      (mesh.userData.forwardOffset as THREE.Quaternion)?.clone() ??
      new THREE.Quaternion();

    // Precompute the local forward axis:
    // lookAt convention → -Z faces target.
    // After forwardOffset, the local axis that faces the target changes.
    this._localForward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.forwardOffset);

    // Bank sign: ensures the ship always leans INTO the turn.
    // When _localForward.z > 0 (+Z forward), cross-product Y sign
    // is opposite to the -Z case.
    this._bankSign = this._localForward.z > 0 ? 1 : -1;

    // Initialize heading from current mesh orientation
    this.headingQuat.copy(this.mesh.quaternion);
  }

  // ════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════════

  /**
   * Main update — call once per frame with delta time in seconds.
   *
   * Orchestrates the state machine:
   *   1. Remove previous ambient drift (restore true position)
   *   2. Run state-specific logic (heading, throttle, movement)
   *   3. Compose final mesh orientation (heading + bank)
   *   4. Reapply ambient drift
   *   5. Update engine visual effects
   */
  public update(deltaTime: number): void {
    // Clamp delta to prevent huge jumps on tab-switch / lag spikes
    const dt = Math.min(deltaTime, 0.1);

    // 1. Remove previous drift to work with "true" position
    this.mesh.position.sub(this.driftOffset);

    // 2. State-specific behavior
    switch (this.state) {
      case "idle_drift":
        this.updateIdleDrift(dt);
        break;
      case "turning":
        this.updateTurning(dt);
        break;
      case "cruising":
        this.updateCruising(dt);
        break;
      case "decelerating":
        this.updateDecelerating(dt);
        break;
    }

    // 3. Compose heading + bank → mesh quaternion
    this.composeFinalOrientation();

    // 4. Ambient drift (subtle alive-feeling oscillation)
    this.applyAmbientDrift();

    // 5. Engine glow
    this.updateEngineEffect();
  }

  /** Get the pure heading quaternion (no bank) for formation matching. */
  public getHeadingQuat(): THREE.Quaternion {
    return this.headingQuat;
  }

  /** Get current speed in units/sec. */
  public getCurrentSpeed(): number {
    return this.currentSpeed;
  }

  /**
   * Get the ship's "true" position without ambient drift.
   *
   * The mesh.position includes a small sinusoidal drift for visual
   * liveliness. For formation-flying calculations (Falcon escort)
   * we need the clean position so the Falcon doesn't jitter with
   * the oscillation.
   */
  public getTruePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.mesh.position).sub(this.driftOffset);
  }

  /** Get current state info (for debugging / HUD) */
  public getStatus(): {
    state: CruiserState;
    speed: number;
    waypoint: THREE.Vector3 | null;
    distanceToWaypoint: number | null;
  } {
    return {
      state: this.state,
      speed: this.currentSpeed,
      waypoint: this.waypoint?.clone() ?? null,
      distanceToWaypoint: this.waypoint
        ? this.mesh.position.distanceTo(this.waypoint)
        : null,
    };
  }

  // ════════════════════════════════════════════════════════════════
  //  STATE MACHINE — each state governs heading, throttle & movement
  // ════════════════════════════════════════════════════════════════

  /**
   * IDLE_DRIFT — The destroyer floats nearly motionless,
   * bleeding off residual speed. After a random pause it
   * picks a new waypoint and transitions to TURNING.
   */
  private updateIdleDrift(dt: number): void {
    // Bleed off remaining speed
    this.currentSpeed = Math.max(
      this.currentSpeed - this.config.deceleration * 0.3 * dt,
      0,
    );

    // Coast forward at residual speed
    if (this.currentSpeed > 0.01) {
      this.moveForward(dt);
    }

    // Slowly level banking
    this.currentBank *= 1 - 2.0 * dt;

    // Wait, then pick next waypoint
    this.idleTimer += dt;
    if (this.idleTimer >= this.idleDuration) {
      this.selectNewWaypoint();
      this.state = "turning";
      this.idleTimer = 0;
    }
  }

  /**
   * TURNING — Slowly rotating to face the chosen waypoint.
   * Barely moves forward — like an aircraft carrier coming about.
   * Transitions to CRUISING once heading is aligned.
   */
  private updateTurning(dt: number): void {
    if (!this.waypoint) {
      this.state = "idle_drift";
      return;
    }

    // Slow heading rotation toward waypoint
    this.rotateTowardWaypoint(dt);

    // Very gentle forward thrust during turn (15% of cruise speed max)
    this.updateThrottle(dt, this.config.cruisingSpeed * 0.15);

    // Move in current forward direction
    this.moveForward(dt);

    // Bank into the turn
    this.updateBanking(dt);

    // Transition when heading is aligned
    const alignment = this.getWaypointAlignment();
    if (alignment > Math.cos(this.config.turnAlignThreshold)) {
      this.state = "cruising";
    }
  }

  /**
   * CRUISING — Moving at full speed toward the waypoint.
   * Gradual acceleration with minor heading corrections.
   * Transitions to DECELERATING when close enough.
   */
  private updateCruising(dt: number): void {
    if (!this.waypoint) {
      this.state = "idle_drift";
      return;
    }

    // Minor heading corrections while cruising
    this.rotateTowardWaypoint(dt);

    // Accelerate toward full cruising speed
    this.updateThrottle(dt, this.config.cruisingSpeed);

    // Move forward
    this.moveForward(dt);

    // Ease out of banking as heading stabilizes
    this.currentBank *= 1 - 1.5 * dt;

    // Check distance — start decelerating when needed
    const dist = this.mesh.position.distanceTo(this.waypoint);
    const decelDist = this.calculateDecelerationDistance();
    if (dist < decelDist) {
      this.state = "decelerating";
    }
  }

  /**
   * DECELERATING — Approaching the waypoint, gradually slowing.
   * Eases to a near-stop then transitions to IDLE_DRIFT.
   */
  private updateDecelerating(dt: number): void {
    if (!this.waypoint) {
      this.state = "idle_drift";
      return;
    }

    // Continue gentle heading corrections
    this.rotateTowardWaypoint(dt);

    // Decelerate
    this.currentSpeed = Math.max(
      this.currentSpeed - this.config.deceleration * dt,
      0,
    );

    // Move forward at current speed
    this.moveForward(dt);

    // Ease out banking
    this.currentBank *= 1 - 2.0 * dt;

    // Transition to idle when nearly stopped
    if (this.currentSpeed < 0.1) {
      this.state = "idle_drift";
      this.idleDuration = this.randomIdleDuration();
      this.idleTimer = 0;
      this.waypoint = null;
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  NAVIGATION — waypoint selection & heading control
  // ════════════════════════════════════════════════════════════════

  /**
   * Pick a new random waypoint in the universe.
   *
   * Selects a point on a spherical shell between minRadius and
   * maxRadius from the scene center, with moderate height variation.
   * Ensures minimum distance from current position so the ship
   * always has a meaningful journey.
   */
  public selectNewWaypoint(): void {
    const { waypointMinRadius, waypointMaxRadius, waypointMaxHeight } =
      this.config;

    const angle = Math.random() * Math.PI * 2;
    const radius =
      waypointMinRadius +
      Math.random() * (waypointMaxRadius - waypointMinRadius);
    const height = (Math.random() - 0.5) * 2 * waypointMaxHeight;

    this.waypoint = new THREE.Vector3(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius,
    );

    // Ensure minimum travel distance
    const minDist = SD_MIN_TRAVEL_DIST;
    if (this.mesh.position.distanceTo(this.waypoint) < minDist) {
      const dir = this.waypoint
        .clone()
        .sub(this.mesh.position)
        .normalize();
      this.waypoint
        .copy(this.mesh.position)
        .addScaledVector(dir, minDist + Math.random() * 300);
    }
  }

  /**
   * Slowly rotate the ship toward the current waypoint.
   *
   * Uses constant angular velocity (clamped slerp) to simulate
   * the ponderous turning of a massive vessel. A full 180° turn
   * takes ~39 seconds at the default 0.08 rad/sec turn rate.
   */
  public rotateTowardWaypoint(dt: number): void {
    if (!this.waypoint) return;

    // Build target look-at quaternion.
    // lookAt convention: -Z faces the waypoint.
    this._lookMatrix.lookAt(this.mesh.position, this.waypoint, this._up);
    this._targetQuat.setFromRotationMatrix(this._lookMatrix);

    // Apply forwardOffset so the model's visual nose (which may be
    // +Z rather than -Z) actually faces the waypoint.
    this._targetQuat.multiply(this.forwardOffset);

    // Angular distance to target heading
    const angle = this.headingQuat.angleTo(this._targetQuat);
    if (angle < 0.001) return; // Already aligned

    // Constant turn rate: slerp factor = desired_angle / remaining_angle
    const maxTurnThisFrame = this.config.maxTurnRate * dt;
    const slerpFactor = Math.min(maxTurnThisFrame / angle, 1);

    this.headingQuat.slerp(this._targetQuat, slerpFactor);
    this.headingQuat.normalize();
  }

  /**
   * Get the ship's forward direction vector (nose direction).
   *
   * Uses the precomputed _localForward (which accounts for the
   * forwardOffset) rotated by the current heading quaternion.
   */
  public getForwardDirection(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this._localForward).applyQuaternion(this.headingQuat);
  }

  /**
   * How aligned is the ship's heading with the waypoint direction?
   *
   * Returns the dot product of forward and to-target vectors:
   *   1.0 = perfectly aligned
   *  -1.0 = facing opposite direction
   */
  private getWaypointAlignment(): number {
    if (!this.waypoint) return 1;

    this.getForwardDirection(this._forward);
    this._toTarget
      .copy(this.waypoint)
      .sub(this.mesh.position)
      .normalize();

    return this._forward.dot(this._toTarget);
  }

  // ════════════════════════════════════════════════════════════════
  //  MOVEMENT — throttle & forward translation
  // ════════════════════════════════════════════════════════════════

  /**
   * Gradually adjust speed toward the target speed.
   *
   * Acceleration is intentionally slow to convey the immense mass
   * of the Star Destroyer — it takes several seconds to reach
   * cruising speed.
   */
  public updateThrottle(dt: number, targetSpeed: number): void {
    if (this.currentSpeed < targetSpeed) {
      this.currentSpeed = Math.min(
        this.currentSpeed + this.config.acceleration * dt,
        targetSpeed,
      );
    } else {
      this.currentSpeed = Math.max(
        this.currentSpeed - this.config.deceleration * 0.5 * dt,
        targetSpeed,
      );
    }
  }

  /**
   * Move the ship forward based on current speed and heading.
   */
  public moveForward(dt: number): void {
    this.getForwardDirection(this._forward);
    this.mesh.position.addScaledVector(this._forward, this.currentSpeed * dt);
  }

  /**
   * Calculate the distance at which to begin decelerating,
   * based on current speed and deceleration rate.
   *
   *   d = v² / (2a) + arrival buffer
   */
  private calculateDecelerationDistance(): number {
    const v = this.currentSpeed;
    const a = this.config.deceleration;
    return (v * v) / (2 * a) + this.config.waypointArrivalDist;
  }

  // ════════════════════════════════════════════════════════════════
  //  BANKING — subtle lean into turns
  // ════════════════════════════════════════════════════════════════

  /**
   * Apply subtle banking (roll) during turns.
   *
   * Uses the cross product of the forward and to-target vectors
   * to determine turn direction, then smoothly interpolates the
   * bank angle. Gives the ship a natural, nautical feel.
   */
  public updateBanking(dt: number): void {
    if (!this.waypoint) return;

    // Determine turn direction via cross product
    this.getForwardDirection(this._forward);
    this._toTarget
      .copy(this.waypoint)
      .sub(this.mesh.position)
      .normalize();
    this._cross.crossVectors(this._forward, this._toTarget);

    // _bankSign ensures correct lean direction regardless of
    // whether the model's nose is at -Z or +Z.
    const targetBank = THREE.MathUtils.clamp(
      this._bankSign * this._cross.y * this.config.bankFactor,
      -this.config.maxBankAngle,
      this.config.maxBankAngle,
    );

    // Smooth interpolation toward target bank
    this.currentBank += (targetBank - this.currentBank) * 2.0 * dt;
  }

  // ════════════════════════════════════════════════════════════════
  //  ORIENTATION COMPOSITION
  // ════════════════════════════════════════════════════════════════

  /**
   * Compose the final mesh quaternion from heading + bank.
   *
   * Heading is the pure yaw/pitch rotation toward the waypoint.
   * Bank is a roll around the ship's local forward (Z) axis,
   * applied on top of the heading to lean into turns.
   */
  private composeFinalOrientation(): void {
    // Start with pure heading
    this.mesh.quaternion.copy(this.headingQuat);

    // Apply bank as a roll around the model's local forward axis.
    // _localForward is (0,0,-1) or (0,0,1) depending on forwardOffset.
    if (Math.abs(this.currentBank) > 0.0005) {
      this._bankQuat.setFromAxisAngle(this._localForward, this.currentBank);
      this.mesh.quaternion.multiply(this._bankQuat);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  AMBIENT EFFECTS — drift & engine glow
  // ════════════════════════════════════════════════════════════════

  /**
   * Apply very subtle ambient positional drift.
   *
   * Pure sinusoidal oscillation (no accumulation) so the ship
   * gently bobs like a vessel at anchor. The offset is stored
   * and subtracted at the start of each frame to keep the
   * "true" position clean for navigation math.
   */
  private applyAmbientDrift(): void {
    const time = performance.now() / 1000;

    this.driftOffset.set(
      Math.sin(time * 0.09) * 0.25,
      Math.sin(time * 0.12) * 0.4,
      Math.cos(time * 0.07) * 0.15,
    );

    this.mesh.position.add(this.driftOffset);
  }

  /**
   * Update engine glow intensity based on current speed.
   *
   * The engine light (stored in userData.engineLight) shifts from
   * a dim idle glow to bright blue-white when cruising.
   */
  private updateEngineEffect(): void {
    const engineLight = this.mesh.userData.engineLight as
      | THREE.PointLight
      | undefined;
    if (!engineLight) return;

    const speedFraction = Math.min(
      this.currentSpeed / this.config.cruisingSpeed,
      1,
    );

    // Intensity ramps with speed
    engineLight.intensity = 0.5 + speedFraction * 3.5;
    engineLight.distance = SD_ENGINE_LIGHT_BASE + speedFraction * SD_ENGINE_LIGHT_RANGE;

    // Color shifts: dim blue → bright blue-white
    const r = 0.2 + speedFraction * 0.4;
    const g = 0.35 + speedFraction * 0.45;
    const b = 0.8 + speedFraction * 0.2;
    engineLight.color.setRGB(r, g, b);
  }

  // ── Utilities ──────────────────────────────────────────────────

  private randomIdleDuration(): number {
    return (
      this.config.minIdleDuration +
      Math.random() * (this.config.maxIdleDuration - this.config.minIdleDuration)
    );
  }
}
