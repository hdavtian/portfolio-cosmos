/**
 * StarDestroyerCruiser — Autonomous cruising AI for the Star Destroyer
 *
 * Maneuvers like a super-carrier at sea: slow, ponderous turns and
 * gentle acceleration within planet/moon systems.  For inter-planet
 * travel it engages lightspeed (dramatic speed ramp-up).
 *
 * Behavior loop:
 *   1. Patrol locally around current planet/moon (carrier maneuvers)
 *   2. After a few local patrols, pick a new planet/moon destination
 *   3. Turn toward destination, engage lightspeed
 *   4. Decelerate into new system, resume local patrol
 *
 * Console commands (set up in ResumeSpace3D.tsx):
 *   sendSD('experience')   — send to a specific planet/moon
 *   sdStatus()             — show current state
 */

import * as THREE from "three";
import {
  SD_LOCAL_PATROL_RADIUS,
  SD_LOCAL_PATROL_HEIGHT,
  SD_LOCAL_CRUISE_SPEED,
  SD_LOCAL_ACCEL,
  SD_LOCAL_DECEL,
  SD_LOCAL_TURN_RATE,
  SD_LOCAL_IDLE_MIN,
  SD_LOCAL_IDLE_MAX,
  SD_LOCAL_PATROLS_MIN,
  SD_LOCAL_PATROLS_MAX,
  SD_LIGHTSPEED,
  SD_LIGHTSPEED_DECEL_DIST,
  SD_LIGHTSPEED_LERP,
  SD_LIGHTSPEED_ARRIVAL,
  SD_WAYPOINT_ARRIVE,
  SD_ENGINE_LIGHT_BASE,
  SD_ENGINE_LIGHT_RANGE,
  SD_ENGINE_LIGHT_LIGHTSPEED,
  SD_JUMP_TURN_RATE,
  SD_CONE_FADE_IN_SECS,
  SD_CONE_FADE_OUT_SECS,
  SD_CONE_MAX_OPACITY,
} from "./cosmos/scaleConfig";

// ── Types ────────────────────────────────────────────────────────

/** A celestial body the SD can visit */
export interface SDDestination {
  name: string;
  getWorldPosition: () => THREE.Vector3;  // live position (orbiting bodies move)
}

type LocalState = "idle_drift" | "turning" | "cruising" | "decelerating";

type HighLevelState =
  | "local_patrol"       // patrolling around current destination
  | "turning_to_jump"    // aligning heading for lightspeed
  | "lightspeed"         // inter-planet travel
  | "decelerating_jump"  // slowing down into destination system
  ;

// ── Class ────────────────────────────────────────────────────────

export class StarDestroyerCruiser {
  private mesh: THREE.Group;
  private enabled = true;

  // ── High-level navigation ──
  private hlState: HighLevelState = "local_patrol";
  private destinations: SDDestination[] = [];
  private currentDest: SDDestination | null = null;
  private nextDest: SDDestination | null = null;
  private localPatrolCount = 0;
  private localPatrolTarget: number;  // how many local patrols before moving on

  // ── Local patrol state (carrier maneuvers) ──
  private localState: LocalState = "idle_drift";
  private currentSpeed = 0;
  private waypoint: THREE.Vector3 | null = null;

  // ── Heading & banking ──
  private headingQuat = new THREE.Quaternion();
  private currentBank = 0;

  // ── Idle timing ──
  private idleTimer = 0;
  private idleDuration: number;

  // ── Ambient drift ──
  private driftOffset = new THREE.Vector3();

  // ── Forward offset (model orientation) ──
  private forwardOffset: THREE.Quaternion;
  private _localForward: THREE.Vector3;
  private _bankSign: number;

  // ── Lightspeed state ──
  private lightspeedSpeed = 0;  // current interpolated speed during jump

  // ── Hyperspace cone effect ──
  private jumpCone: THREE.Mesh | null = null;
  private jumpConeMat: THREE.MeshBasicMaterial | null = null;
  private coneTimer = 0;           // seconds since cone became active
  private coneFading = false;      // true = fading out after jump
  private coneFadeTimer = 0;       // seconds since fade-out started

  // ── Reusable temp objects ──
  private _forward = new THREE.Vector3();
  private _toTarget = new THREE.Vector3();
  private _targetQuat = new THREE.Quaternion();
  private _lookMatrix = new THREE.Matrix4();
  private _bankQuat = new THREE.Quaternion();
  private _cross = new THREE.Vector3();
  private _up = new THREE.Vector3(0, 1, 0);

  constructor(mesh: THREE.Group) {
    this.mesh = mesh;
    this.idleDuration = this.randomIdleDuration();
    this.localPatrolTarget = this.randomPatrolCount();

    // Read forward offset from mesh
    this.forwardOffset =
      (mesh.userData.forwardOffset as THREE.Quaternion)?.clone() ??
      new THREE.Quaternion();

    this._localForward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.forwardOffset);

    this._bankSign = this._localForward.z > 0 ? 1 : -1;

    // Initialize heading from current mesh orientation
    this.headingQuat.copy(this.mesh.quaternion);
  }

  // ════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════════

  /** Attach the hyperspace cone mesh (created externally at scene scale). */
  public setJumpCone(cone: THREE.Mesh): void {
    this.jumpCone = cone;
    this.jumpConeMat = cone.material as THREE.MeshBasicMaterial;
    cone.visible = false;
  }

  /** Register all visitable planets/moons. Call once after scene setup. */
  public setDestinations(dests: SDDestination[]): void {
    this.destinations = dests;
    // Start patrolling near whatever destination is closest
    if (!this.currentDest && dests.length > 0) {
      let closest: SDDestination | null = null;
      let closestDist = Infinity;
      const pos = this.mesh.position;
      for (const d of dests) {
        const dist = pos.distanceTo(d.getWorldPosition());
        if (dist < closestDist) {
          closestDist = dist;
          closest = d;
        }
      }
      this.currentDest = closest;
    }
  }

  /** Direct the SD to a specific destination by name. Forces immediate jump. */
  public sendTo(name: string): boolean {
    const target = this.destinations.find(
      (d) => d.name.toLowerCase() === name.toLowerCase(),
    );
    if (!target) return false;

    this.nextDest = target;
    // Force immediate jump — interrupt whatever the SD is currently doing
    this.currentSpeed = 0;
    this.waypoint = null;
    this.localState = "idle_drift";
    this.initiateJump();
    return true;
  }

  /** Main frame update. */
  public update(deltaTime: number): void {
    if (!this.enabled) {
      if (this.jumpCone) this.jumpCone.visible = false;
      return;
    }
    const dt = Math.min(deltaTime, 0.1);

    // Remove previous drift
    this.mesh.position.sub(this.driftOffset);

    switch (this.hlState) {
      case "local_patrol":
        this.updateLocalPatrol(dt);
        break;
      case "turning_to_jump":
        this.updateTurningToJump(dt);
        break;
      case "lightspeed":
        this.updateLightspeed(dt);
        break;
      case "decelerating_jump":
        this.updateDeceleratingJump(dt);
        break;
    }

    // Compose heading + bank → mesh quaternion
    this.composeFinalOrientation();

    // Ambient drift (only during local patrol)
    if (this.hlState === "local_patrol") {
      this.applyAmbientDrift();
    } else {
      this.driftOffset.set(0, 0, 0);
    }

    // Engine glow
    this.updateEngineEffect();

    // Hyperspace cone effect
    this.updateJumpCone(dt);
  }

  /** Enable/disable autonomous SD behavior. */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.currentSpeed = 0;
      this.lightspeedSpeed = 0;
      this.waypoint = null;
      this.nextDest = null;
      this.hlState = "local_patrol";
      this.localState = "idle_drift";
      if (this.jumpCone) this.jumpCone.visible = false;
    }
  }

  /** Current autonomy mode state. */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /** Get pure heading quaternion (no bank) for formation matching. */
  public getHeadingQuat(): THREE.Quaternion {
    return this.headingQuat;
  }

  /** Get current speed in units/sec. */
  public getCurrentSpeed(): number {
    return this.hlState === "lightspeed" || this.hlState === "decelerating_jump"
      ? this.lightspeedSpeed * 60  // convert per-frame to per-second estimate
      : this.currentSpeed;
  }

  /** Get true position without ambient drift. */
  public getTruePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.mesh.position).sub(this.driftOffset);
  }

  /** Get forward direction vector. */
  public getForwardDirection(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this._localForward).applyQuaternion(this.headingQuat);
  }

  /** Get current status for debugging / HUD. */
  public getStatus(): {
    hlState: HighLevelState;
    localState: LocalState;
    speed: number;
    currentDest: string | null;
    nextDest: string | null;
    localPatrols: string;
    destinations: string[];
  } {
    return {
      hlState: this.hlState,
      localState: this.localState,
      speed: this.getCurrentSpeed(),
      currentDest: this.currentDest?.name ?? null,
      nextDest: this.nextDest?.name ?? null,
      localPatrols: `${this.localPatrolCount}/${this.localPatrolTarget}`,
      destinations: this.destinations.map((d) => d.name),
    };
  }

  // ════════════════════════════════════════════════════════════════
  //  HIGH-LEVEL STATES
  // ════════════════════════════════════════════════════════════════

  // ── LOCAL PATROL ───────────────────────────────────────────────
  // Carrier-like maneuvers around the current planet/moon system.

  private updateLocalPatrol(dt: number): void {
    switch (this.localState) {
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
  }

  private updateIdleDrift(dt: number): void {
    // Bleed off remaining speed
    this.currentSpeed = Math.max(
      this.currentSpeed - SD_LOCAL_DECEL * 0.3 * dt, 0,
    );
    if (this.currentSpeed > 0.01) this.moveForward(dt);
    this.currentBank *= 1 - 2.0 * dt;

    this.idleTimer += dt;
    if (this.idleTimer >= this.idleDuration) {
      // Should we jump to another system?
      if (this.localPatrolCount >= this.localPatrolTarget && this.destinations.length > 1) {
        this.initiateJump();
        return;
      }
      // Otherwise pick another local waypoint
      this.selectLocalWaypoint();
      this.localState = "turning";
      this.idleTimer = 0;
    }
  }

  private updateTurning(dt: number): void {
    if (!this.waypoint) { this.localState = "idle_drift"; return; }
    this.rotateToward(this.waypoint, dt, SD_LOCAL_TURN_RATE);
    this.updateThrottle(dt, SD_LOCAL_CRUISE_SPEED * 0.15);
    this.moveForward(dt);
    this.updateBanking(dt);
    if (this.getAlignment(this.waypoint) > Math.cos(0.15)) {
      this.localState = "cruising";
    }
  }

  private updateCruising(dt: number): void {
    if (!this.waypoint) { this.localState = "idle_drift"; return; }
    this.rotateToward(this.waypoint, dt, SD_LOCAL_TURN_RATE);
    this.updateThrottle(dt, SD_LOCAL_CRUISE_SPEED);
    this.moveForward(dt);
    this.currentBank *= 1 - 1.5 * dt;
    const dist = this.mesh.position.distanceTo(this.waypoint);
    if (dist < this.calculateDecelDist()) {
      this.localState = "decelerating";
    }
  }

  private updateDecelerating(dt: number): void {
    if (!this.waypoint) { this.localState = "idle_drift"; return; }
    this.rotateToward(this.waypoint, dt, SD_LOCAL_TURN_RATE);
    this.currentSpeed = Math.max(this.currentSpeed - SD_LOCAL_DECEL * dt, 0);
    this.moveForward(dt);
    this.currentBank *= 1 - 2.0 * dt;
    if (this.currentSpeed < 0.1) {
      this.localState = "idle_drift";
      this.idleDuration = this.randomIdleDuration();
      this.idleTimer = 0;
      this.waypoint = null;
      this.localPatrolCount++;
    }
  }

  // ── TURNING TO JUMP ────────────────────────────────────────────
  // Align heading toward the destination before engaging lightspeed.

  private updateTurningToJump(dt: number): void {
    if (!this.nextDest) { this.hlState = "local_patrol"; return; }

    const targetPos = this.nextDest.getWorldPosition();
    // Use the faster jump turn rate (~5s for a 90° turn)
    this.rotateToward(targetPos, dt, SD_JUMP_TURN_RATE);

    // Gentle forward drift while turning
    this.updateThrottle(dt, SD_LOCAL_CRUISE_SPEED * 0.2);
    this.moveForward(dt);
    this.updateBanking(dt);

    // Track cone fade-in timer
    this.coneTimer += dt;

    // Aligned enough? Engage lightspeed.
    const alignment = this.getAlignment(targetPos);
    if (alignment > Math.cos(0.12)) { // within ~7°
      this.hlState = "lightspeed";
      this.lightspeedSpeed = Math.max(this.currentSpeed / 60, 1);
      this.currentSpeed = 0;
      // Begin cone fade-out once at full lightspeed
      this.coneFading = false; // will be set true after a short delay
    }
  }

  // ── LIGHTSPEED ─────────────────────────────────────────────────
  // Dramatic speed ramp: accelerate to SD_LIGHTSPEED, cruise, decelerate.

  private updateLightspeed(dt: number): void {
    if (!this.nextDest) { this.hlState = "local_patrol"; return; }

    const targetPos = this.nextDest.getWorldPosition();
    const dist = this.mesh.position.distanceTo(targetPos);

    // Rotate ship visually toward target (cosmetic heading)
    this.rotateToward(targetPos, dt, SD_JUMP_TURN_RATE);
    this.currentBank *= 1 - 3.0 * dt;

    // Ramp up to lightspeed
    const targetSpeed = dist > SD_LIGHTSPEED_DECEL_DIST
      ? SD_LIGHTSPEED
      : SD_LIGHTSPEED * Math.max(dist / SD_LIGHTSPEED_DECEL_DIST, 0.05);

    this.lightspeedSpeed += (targetSpeed - this.lightspeedSpeed) * SD_LIGHTSPEED_LERP;

    // Move TOWARD the target (not just forward) — prevents overshoot
    // when heading isn't perfectly aligned at these extreme speeds.
    const moveDir = this._toTarget.copy(targetPos).sub(this.mesh.position).normalize();
    const moveAmount = Math.min(this.lightspeedSpeed, dist - SD_LIGHTSPEED_ARRIVAL * 0.5);
    this.mesh.position.addScaledVector(moveDir, Math.max(moveAmount, 0.5));

    // Start cone fade-out once at significant lightspeed
    if (!this.coneFading && this.lightspeedSpeed > SD_LIGHTSPEED * 0.3) {
      this.coneFading = true;
      this.coneFadeTimer = 0;
    }

    // Close enough? Start decelerating into the system
    if (dist < SD_LIGHTSPEED_DECEL_DIST) {
      this.hlState = "decelerating_jump";
    }
  }

  // ── DECELERATING JUMP ──────────────────────────────────────────
  // Gracefully slow down and enter the destination system.

  private updateDeceleratingJump(dt: number): void {
    if (!this.nextDest) { this.hlState = "local_patrol"; return; }

    const targetPos = this.nextDest.getWorldPosition();
    const dist = this.mesh.position.distanceTo(targetPos);

    // Keep heading corrections (visual)
    this.rotateToward(targetPos, dt, SD_JUMP_TURN_RATE);
    this.currentBank *= 1 - 3.0 * dt;

    // Decelerate proportionally to remaining distance
    const targetSpeed = SD_LIGHTSPEED * Math.max(dist / SD_LIGHTSPEED_DECEL_DIST, 0.01);
    this.lightspeedSpeed += (targetSpeed - this.lightspeedSpeed) * SD_LIGHTSPEED_LERP * 2;
    this.lightspeedSpeed = Math.max(this.lightspeedSpeed, 0.5);

    // Move TOWARD the target — clamp so we don't overshoot
    const moveDir = this._toTarget.copy(targetPos).sub(this.mesh.position).normalize();
    const moveAmount = Math.min(this.lightspeedSpeed, dist * 0.8);
    this.mesh.position.addScaledVector(moveDir, Math.max(moveAmount, 0.1));

    // Arrived?
    const newDist = this.mesh.position.distanceTo(targetPos);
    if (newDist < SD_LIGHTSPEED_ARRIVAL || this.lightspeedSpeed < 1) {
      // Transition to local patrol at new destination
      this.currentDest = this.nextDest;
      this.nextDest = null;
      this.hlState = "local_patrol";
      this.localState = "idle_drift";
      this.localPatrolCount = 0;
      this.localPatrolTarget = this.randomPatrolCount();
      this.currentSpeed = Math.min(this.lightspeedSpeed, SD_LOCAL_CRUISE_SPEED * 0.5);
      this.lightspeedSpeed = 0;
      this.idleDuration = this.randomIdleDuration();
      this.idleTimer = 0;
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  NAVIGATION HELPERS
  // ════════════════════════════════════════════════════════════════

  /** Initiate a jump to a new system. Picks random if nextDest not set. */
  private initiateJump(): void {
    if (!this.nextDest) {
      this.nextDest = this.pickRandomDestination();
    }
    if (!this.nextDest) {
      // No valid destinations — keep patrolling
      this.localPatrolCount = 0;
      return;
    }
    this.hlState = "turning_to_jump";
    this.waypoint = null;
    // Reset cone effect timers
    this.coneTimer = 0;
    this.coneFading = false;
    this.coneFadeTimer = 0;
  }

  /** Pick a random destination different from the current one. */
  private pickRandomDestination(): SDDestination | null {
    const candidates = this.destinations.filter((d) => d !== this.currentDest);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /** Select a local waypoint near the current destination. */
  private selectLocalWaypoint(): void {
    const center = this.currentDest
      ? this.currentDest.getWorldPosition()
      : this.mesh.position.clone();

    const angle = Math.random() * Math.PI * 2;
    const radius = SD_LOCAL_PATROL_RADIUS * (0.3 + Math.random() * 0.7);
    const height = (Math.random() - 0.5) * 2 * SD_LOCAL_PATROL_HEIGHT;

    this.waypoint = new THREE.Vector3(
      center.x + Math.cos(angle) * radius,
      center.y + height,
      center.z + Math.sin(angle) * radius,
    );

    // Ensure minimum travel distance
    const minDist = 200;
    if (this.mesh.position.distanceTo(this.waypoint) < minDist) {
      const dir = this.waypoint.clone().sub(this.mesh.position).normalize();
      this.waypoint.copy(this.mesh.position).addScaledVector(dir, minDist + Math.random() * 200);
    }
  }

  /** Rotate heading toward a target position. */
  private rotateToward(target: THREE.Vector3, dt: number, turnRate: number): void {
    this._lookMatrix.lookAt(this.mesh.position, target, this._up);
    this._targetQuat.setFromRotationMatrix(this._lookMatrix);
    this._targetQuat.multiply(this.forwardOffset);

    const angle = this.headingQuat.angleTo(this._targetQuat);
    if (angle < 0.001) return;

    const maxTurn = turnRate * dt;
    const slerpFactor = Math.min(maxTurn / angle, 1);
    this.headingQuat.slerp(this._targetQuat, slerpFactor);
    this.headingQuat.normalize();
  }

  /** Dot product of forward vs direction to target (1 = aligned). */
  private getAlignment(target: THREE.Vector3): number {
    this.getForwardDirection(this._forward);
    this._toTarget.copy(target).sub(this.mesh.position).normalize();
    return this._forward.dot(this._toTarget);
  }

  // ════════════════════════════════════════════════════════════════
  //  MOVEMENT
  // ════════════════════════════════════════════════════════════════

  private updateThrottle(dt: number, targetSpeed: number): void {
    if (this.currentSpeed < targetSpeed) {
      this.currentSpeed = Math.min(
        this.currentSpeed + SD_LOCAL_ACCEL * dt, targetSpeed,
      );
    } else {
      this.currentSpeed = Math.max(
        this.currentSpeed - SD_LOCAL_DECEL * 0.5 * dt, targetSpeed,
      );
    }
  }

  private moveForward(dt: number): void {
    this.getForwardDirection(this._forward);
    this.mesh.position.addScaledVector(this._forward, this.currentSpeed * dt);
  }

  private calculateDecelDist(): number {
    const v = this.currentSpeed;
    return (v * v) / (2 * SD_LOCAL_DECEL) + SD_WAYPOINT_ARRIVE;
  }

  // ════════════════════════════════════════════════════════════════
  //  BANKING
  // ════════════════════════════════════════════════════════════════

  private updateBanking(dt: number): void {
    const target = this.waypoint ?? (this.nextDest?.getWorldPosition() ?? null);
    if (!target) return;

    this.getForwardDirection(this._forward);
    this._toTarget.copy(target).sub(this.mesh.position).normalize();
    this._cross.crossVectors(this._forward, this._toTarget);

    const maxBank = 0.18; // ~10°
    const targetBank = THREE.MathUtils.clamp(
      this._bankSign * this._cross.y * 0.2,
      -maxBank, maxBank,
    );
    this.currentBank += (targetBank - this.currentBank) * 2.0 * dt;
  }

  // ════════════════════════════════════════════════════════════════
  //  ORIENTATION
  // ════════════════════════════════════════════════════════════════

  private composeFinalOrientation(): void {
    this.mesh.quaternion.copy(this.headingQuat);
    if (Math.abs(this.currentBank) > 0.0005) {
      this._bankQuat.setFromAxisAngle(this._localForward, this.currentBank);
      this.mesh.quaternion.multiply(this._bankQuat);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  AMBIENT EFFECTS
  // ════════════════════════════════════════════════════════════════

  private applyAmbientDrift(): void {
    const time = performance.now() / 1000;
    this.driftOffset.set(
      Math.sin(time * 0.09) * 0.25,
      Math.sin(time * 0.12) * 0.4,
      Math.cos(time * 0.07) * 0.15,
    );
    this.mesh.position.add(this.driftOffset);
  }

  private updateEngineEffect(): void {
    const engineLight = this.mesh.userData.engineLight as THREE.PointLight | undefined;
    if (!engineLight) return;

    const isJumping = this.hlState === "lightspeed" || this.hlState === "decelerating_jump"
      || this.hlState === "turning_to_jump";

    if (isJumping) {
      // Lightspeed engine effect — bright blue-white flare
      const jumpFraction = Math.min(this.lightspeedSpeed / SD_LIGHTSPEED, 1);
      engineLight.intensity = 1.0 + jumpFraction * 8.0;
      engineLight.distance = SD_ENGINE_LIGHT_BASE + jumpFraction * SD_ENGINE_LIGHT_LIGHTSPEED;
      engineLight.color.setRGB(
        0.4 + jumpFraction * 0.5,
        0.5 + jumpFraction * 0.4,
        0.9 + jumpFraction * 0.1,
      );
    } else {
      // Normal local patrol engine glow
      const speedFraction = Math.min(this.currentSpeed / SD_LOCAL_CRUISE_SPEED, 1);
      engineLight.intensity = 0.5 + speedFraction * 3.5;
      engineLight.distance = SD_ENGINE_LIGHT_BASE + speedFraction * SD_ENGINE_LIGHT_RANGE;
      engineLight.color.setRGB(
        0.2 + speedFraction * 0.4,
        0.35 + speedFraction * 0.45,
        0.8 + speedFraction * 0.2,
      );
    }
  }

  // ── Hyperspace cone ────────────────────────────────────────────

  /**
   * Update the hyperspace cone visual effect.
   *
   * Timeline:
   *   turning_to_jump → cone fades in over SD_CONE_FADE_IN_SECS
   *   lightspeed      → cone at peak, then fades out over SD_CONE_FADE_OUT_SECS
   *   all other states → cone hidden
   */
  private updateJumpCone(dt: number): void {
    if (!this.jumpCone || !this.jumpConeMat) return;

    const isTurning = this.hlState === "turning_to_jump";
    const isJumping = this.hlState === "lightspeed" || this.hlState === "decelerating_jump";

    if (isTurning) {
      // Fade in during turn alignment
      const fadeProgress = Math.min(this.coneTimer / SD_CONE_FADE_IN_SECS, 1);
      this.jumpConeMat.opacity = fadeProgress * SD_CONE_MAX_OPACITY;
      this.jumpCone.visible = true;
    } else if (isJumping && !this.coneFading) {
      // Full brightness briefly before fade starts
      this.jumpConeMat.opacity = SD_CONE_MAX_OPACITY;
      this.jumpCone.visible = true;
    } else if (this.coneFading) {
      // Fade out after entering hyperspace
      this.coneFadeTimer += dt;
      const fadeProgress = 1 - Math.min(this.coneFadeTimer / SD_CONE_FADE_OUT_SECS, 1);
      this.jumpConeMat.opacity = fadeProgress * SD_CONE_MAX_OPACITY;
      this.jumpCone.visible = fadeProgress > 0.01;
      if (fadeProgress <= 0.01) {
        this.coneFading = false;
        this.jumpCone.visible = false;
      }
    } else {
      // Local patrol or decelerating into system — no cone
      this.jumpCone.visible = false;
      this.jumpConeMat.opacity = 0;
      return;
    }

    // Position & orient cone: base at ship, extending toward destination
    if (this.jumpCone.visible) {
      const dest = this.nextDest ?? this.currentDest;
      if (dest) {
        // Position at ship's world position
        this.jumpCone.position.copy(this.mesh.position);

        // Look toward the destination — the cone geometry is set up
        // so that +Z is the cone's extension direction (apex → base tip)
        const targetPos = dest.getWorldPosition();
        this.jumpCone.lookAt(targetPos);
      }
    }
  }

  // ── Utilities ──────────────────────────────────────────────────

  private randomIdleDuration(): number {
    return SD_LOCAL_IDLE_MIN + Math.random() * (SD_LOCAL_IDLE_MAX - SD_LOCAL_IDLE_MIN);
  }

  private randomPatrolCount(): number {
    return SD_LOCAL_PATROLS_MIN + Math.floor(
      Math.random() * (SD_LOCAL_PATROLS_MAX - SD_LOCAL_PATROLS_MIN + 1),
    );
  }
}
