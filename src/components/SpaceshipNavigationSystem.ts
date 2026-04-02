/**
 * SpaceshipNavigationSystem - Intelligent navigation to moving targets
 *
 * This system handles spaceship navigation to orbiting objects by:
 * 1. Subscribing to position updates from moving targets
 * 2. Using predictive algorithms to intercept moving objects
 * 3. Smoothly decelerating as it approaches
 * 4. Automatically pausing orbit when close enough
 *
 * Usage:
 * 1. Create navigation system with spaceship reference
 * 2. Call navigateToObject() with target ID
 * 3. System handles subscription, movement, and arrival
 * 4. Get notified via callbacks when arrived
 */

import * as THREE from "three";
import {
  getOrbitalPositionEmitter,
  type PositionUpdate,
} from "./OrbitalPositionEmitter";
import {
  NAV_LATERAL_BIAS,
  NAV_AVOID_COOLDOWN_DIST,
} from "./cosmos/scaleConfig";

export interface NavigationConfig {
  maxSpeed: number; // Maximum travel speed
  turboSpeed: number; // Speed when in turbo mode
  accelerationRate: number; // How fast to accelerate (0-1)
  decelerationDistance: number; // Start slowing down this far from target
  arrivalDistance: number; // Consider "arrived" at this distance
  usePredictiveIntercept: boolean; // Use velocity prediction
  freezeOrbitOnApproach: boolean; // Pause orbit when close
  freezeDistance: number; // Distance at which to freeze orbit
  targetSmoothing: number; // Lerp factor for target position smoothing (0-1)
  rotationSmoothing: number; // Slerp factor for ship rotation smoothing (0-1)
  velocitySmoothing: number; // Lerp factor for target velocity smoothing (0-1)
}

export interface NavigationStatus {
  isNavigating: boolean;
  targetId: string | null;
  distance: number | null;
  eta: number | null; // seconds
  speed: number;
  isTurboActive: boolean;
  targetFrozen: boolean;
  targetPosition: THREE.Vector3 | null;
}

export type NavigationCallback = (status: NavigationStatus) => void;
export type ArrivalCallback = (targetId: string) => void;
export type MissionLogCallback = (message: string) => void;
export type ObstacleProvider = () => Obstacle[];

export interface Obstacle {
  id?: string;
  position: THREE.Vector3;
  radius: number;
}

export class SpaceshipNavigationSystem {
  private spaceship: THREE.Object3D;
  private config: NavigationConfig;
  private currentTarget: {
    id: string | null;
    unsubscribe: (() => void) | null;
    lastPosition: THREE.Vector3 | null;
    lastVelocity: THREE.Vector3 | null;
    startTime: number;
    frozen: boolean;
  } = {
    id: null,
    unsubscribe: null,
    lastPosition: null,
    lastVelocity: null,
    startTime: 0,
    frozen: false,
  };

  private currentSpeed = 0;
  private targetSpeed = 0;
  private isTurboActive = false;
  private lastLogTime = 0; // For throttled logging
  private avoidanceMemory: { id: string; timestamp: number } | null = null;
  private avoidanceCooldownUntil = 0;

  private smoothedTargetPos: THREE.Vector3 | null = null;
  private smoothedTargetVelocity: THREE.Vector3 | null = null;
  private lateralBias: THREE.Vector3 | null = null;

  private onStatusChange: NavigationCallback | null = null;
  private onArrival: ArrivalCallback | null = null;
  private missionLog: MissionLogCallback | null = null;
  private obstaclesProvider: ObstacleProvider | null = null;

  // Temporary waypoint for arc/avoidance travel
  private intermediateWaypoint: THREE.Vector3 | null = null;

  // Arrival threshold helper so we can be more lenient once the target is frozen
  private getArrivalThreshold(): number {
    if (this.currentTarget.frozen) {
      return Math.max(
        this.config.arrivalDistance,
        this.config.freezeDistance * 0.8,
      );
    }
    return this.config.arrivalDistance;
  }

  private emitter = getOrbitalPositionEmitter();

  constructor(spaceship: THREE.Object3D, config?: Partial<NavigationConfig>) {
    this.spaceship = spaceship;
    this.config = {
      maxSpeed: 2.0,
      turboSpeed: 4.0,
      accelerationRate: 0.05,
      decelerationDistance: 100,
      arrivalDistance: 20,
      usePredictiveIntercept: true,
      freezeOrbitOnApproach: true,
      freezeDistance: 50,
      targetSmoothing: 0.12,
      rotationSmoothing: 0.08,
      velocitySmoothing: 0.2,
      ...config,
    };
  }

  /**
   * Start navigating to a target object
   */
  public navigateToObject(
    targetId: string,
    useTurbo: boolean = false,
  ): boolean {
    // Check if target is registered with emitter
    if (!this.emitter.isTracking(targetId)) {
      const errorMsg = `⚠️ Cannot navigate - target not tracked: ${targetId}`;
      if (this.missionLog) this.missionLog(errorMsg);
      return false;
    }

    // Cancel any existing navigation
    this.cancelNavigation();

    const logMsg = `🚀 NAV ENGAGE: Target locked - ${targetId} | Turbo: ${useTurbo ? "ENABLED" : "DISABLED"}`;
    if (this.missionLog) this.missionLog(logMsg);

    // Subscribe to position updates
    const unsubscribe = this.emitter.subscribe(
      targetId,
      this.handlePositionUpdate,
    );

    // Prime last known position/velocity immediately to avoid a zero-vector jump on first tick
    const initialUpdate = this.emitter.getCurrentPosition(targetId);

    this.currentTarget = {
      id: targetId,
      unsubscribe,
      lastPosition: initialUpdate?.worldPosition.clone() || null,
      lastVelocity: initialUpdate?.velocity.clone() || null,
      startTime: Date.now(),
      frozen: false,
    };

    this.isTurboActive = useTurbo;
    this.emitStatusChange();

    this.lateralBias = null;
    // Subtle lateral easing (no vertical component)
    if (initialUpdate?.worldPosition) {
      const shipPos = this.spaceship.position.clone();
      const toTarget = initialUpdate.worldPosition.clone().sub(shipPos);
      const dir = toTarget.clone().normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const lateral = new THREE.Vector3().crossVectors(dir, up);
      if (lateral.lengthSq() > 0.0001) {
        const sign = Math.random() > 0.5 ? 1 : -1;
        this.lateralBias = lateral.normalize().multiplyScalar(NAV_LATERAL_BIAS * sign);
      }
    }

    return true;
  }

  /**
   * Cancel current navigation
   */
  public cancelNavigation(): void {
    if (this.currentTarget.unsubscribe) {
      this.currentTarget.unsubscribe();
    }

    // Resume orbit if we froze it
    if (this.currentTarget.frozen && this.currentTarget.id) {
      this.emitter.resumeOrbit(this.currentTarget.id);
    }

    this.currentTarget = {
      id: null,
      unsubscribe: null,
      lastPosition: null,
      lastVelocity: null,
      startTime: 0,
      frozen: false,
    };

    this.currentSpeed = 0;
    this.targetSpeed = 0;
    this.isTurboActive = false;
    this.smoothedTargetPos = null;
    this.smoothedTargetVelocity = null;
    this.lateralBias = null;

    this.emitStatusChange();
  }

  /**
   * Update spaceship position - call this every frame
   * @param _deltaTime Time elapsed since last frame (currently unused but kept for future physics improvements)
   */
  public update(_deltaTime: number): void {
    if (!this.currentTarget.id || !this.currentTarget.lastPosition) {
      return;
    }

    const shipPos = this.spaceship.position.clone();
    const baseTargetPos = this.getTargetPosition();
    const dt = Math.max(_deltaTime || 1 / 60, 1 / 120);
    const smoothingAlpha = (factor: number) =>
      1 - Math.pow(1 - Math.min(Math.max(factor, 0), 1), dt * 60);

    const now = Date.now();

    // Obstacle avoidance: check for celestial bodies in the path
    const baseDistance = shipPos.distanceTo(baseTargetPos);
    if (
      baseDistance > 50 &&
      !this.intermediateWaypoint &&
      this.obstaclesProvider &&
      now > this.avoidanceCooldownUntil
    ) {
      const obstacles = this.obstaclesProvider();
      const toTarget = baseTargetPos.clone().sub(shipPos);
      const dir = toTarget.clone().normalize();
      const segLen = toTarget.length();

      for (const obs of obstacles) {
        if (obs.id && obs.id === this.currentTarget.id) continue;

        // If we recently generated a waypoint, avoid flapping by keeping it for a few frames
        if (this.avoidanceMemory && this.avoidanceMemory.id === obs.id) {
          const elapsed = now - this.avoidanceMemory.timestamp;
          if (elapsed < 1200) {
            // keep current waypoint memory, skip setting a new one
            break;
          }
          this.avoidanceMemory = null;
        }

        // Distance from obstacle center to line segment ship->target
        const toObs = obs.position.clone().sub(shipPos);
        const t = Math.max(
          0,
          Math.min(1, toObs.dot(dir) / Math.max(segLen, 0.0001)),
        );
        const closestPoint = shipPos
          .clone()
          .add(dir.clone().multiplyScalar(segLen * t));
        const clearance = obs.radius; // radii already include safety margin
        const distToPath = obs.position.distanceTo(closestPoint);

        if (distToPath < clearance) {
          // Create a lateral avoidance waypoint (no vertical climb)
          const up = new THREE.Vector3(0, 1, 0);
          let lateral = new THREE.Vector3().crossVectors(dir, up);
          if (lateral.lengthSq() < 0.0001) {
            lateral = new THREE.Vector3(1, 0, 0);
          }
          lateral.normalize();
          const avoidOffset = obs.radius * 1.8; // route well clear
          // Steer to whichever side the ship is already on (deterministic)
          const shipSide = toObs.dot(lateral);
          const sign = shipSide < 0 ? 1 : -1;
          this.intermediateWaypoint = obs.position
            .clone()
            .add(lateral.multiplyScalar(avoidOffset * sign));
          this.intermediateWaypoint.y = shipPos.y;
          this.avoidanceMemory = {
            id: obs.id || "obstacle",
            timestamp: now,
          };
          // Small cooldown to prevent immediate re-trigger after clearing
          this.avoidanceCooldownUntil = now + 1500;
          if (this.missionLog) {
            this.missionLog(
              `🛰️ AVOIDANCE: Routing around ${obs.id || "obstacle"} (${(
                avoidOffset * sign
              ).toFixed(0)}u lateral)`,
            );
          }
          break;
        }
      }
    }

    let targetPos = this.intermediateWaypoint || baseTargetPos;
    if (!this.intermediateWaypoint && this.lateralBias) {
      const falloff = Math.min(Math.max(baseDistance / NAV_AVOID_COOLDOWN_DIST, 0), 1);
      targetPos = targetPos
        .clone()
        .add(this.lateralBias.clone().multiplyScalar(falloff));
    }
    if (this.intermediateWaypoint) {
      this.smoothedTargetPos = targetPos.clone();
    } else {
      if (!this.smoothedTargetPos) {
        this.smoothedTargetPos = targetPos.clone();
      } else {
        this.smoothedTargetPos.lerp(
          targetPos,
          smoothingAlpha(this.config.targetSmoothing),
        );
      }
      targetPos = this.smoothedTargetPos.clone();
    }

    // Calculate distance to current aim point
    const distance = shipPos.distanceTo(targetPos);

    // If we were aiming for a waypoint and it's reached, clear it and continue to real target
    if (this.intermediateWaypoint && distance < 80) {
      this.intermediateWaypoint = null;
      this.avoidanceMemory = null;
      this.avoidanceCooldownUntil = now + 1500; // brief grace period before reconsidering obstacles
      if (this.missionLog)
        this.missionLog("✅ WAYPOINT CLEARED: Resuming intercept");
      return; // wait until next frame to continue with the main target for stability
    }

    // Throttled logging every 1 second
    // reuse timestamp for throttled logging and other calculations
    if (now - this.lastLogTime > 1000) {
      // Calculate ETA
      const eta =
        this.currentSpeed > 0
          ? Math.ceil(distance / this.currentSpeed / 60)
          : 999;
      const etaStr = eta < 999 ? `${eta}s` : "--";

      const statusMsg = `📡 NAV STATUS: ${this.currentTarget.id} | Dist: ${distance.toFixed(0)}u | Speed: ${(this.currentSpeed * 100).toFixed(0)}% | ETA: ${etaStr} | ${this.currentTarget.frozen ? "🧊 LOCKED" : this.isTurboActive ? "⚡ TURBO" : "🚀 CRUISE"}`;

      if (this.missionLog) this.missionLog(statusMsg);

      this.lastLogTime = now;
    }

    // Check for arrival (more lenient once orbit is frozen) only when aiming at the real target
    if (!this.intermediateWaypoint && distance < this.getArrivalThreshold()) {
      this.handleArrival();
      return;
    }

    // Freeze orbit if close enough and not already frozen
    if (
      this.config.freezeOrbitOnApproach &&
      !this.currentTarget.frozen &&
      !this.intermediateWaypoint &&
      distance < this.config.freezeDistance &&
      this.currentTarget.id
    ) {
      const freezeMsg = `🧊 ORBIT FREEZE: Distance ${distance.toFixed(1)} units - Target locked in position`;
      if (this.missionLog) this.missionLog(freezeMsg);
      this.emitter.pauseOrbit(this.currentTarget.id);
      this.currentTarget.frozen = true;
      // Update position one more time after freezing
      this.currentTarget.lastVelocity = new THREE.Vector3(0, 0, 0);
    }

    // Calculate direction to target
    const direction = new THREE.Vector3()
      .subVectors(targetPos, shipPos)
      .normalize();

    // Determine target speed based on distance
    this.calculateTargetSpeed(distance);

    // Smooth speed adjustment
    const speedDelta =
      (this.targetSpeed - this.currentSpeed) * this.config.accelerationRate;
    this.currentSpeed += speedDelta;

    // Cap speed to avoid overshoot thrash when very close
    if (distance < 150) {
      const cap = this.isTurboActive ? 2.2 : 1.6;
      this.currentSpeed = Math.min(this.currentSpeed, cap);
    }

    // Move spaceship
    this.spaceship.position.add(direction.multiplyScalar(this.currentSpeed));

    // ── Real-time deflection: gently push ship out of any obstacle ──
    if (this.obstaclesProvider) {
      const obstacles = this.obstaclesProvider();
      const shipPos2 = this.spaceship.position;
      for (const obs of obstacles) {
        if (obs.id && obs.id === this.currentTarget.id) continue;
        const dx = shipPos2.x - obs.position.x;
        const dy = shipPos2.y - obs.position.y;
        const dz = shipPos2.z - obs.position.z;
        const distToCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distToCenter < obs.radius && distToCenter > 0.01) {
          const penetration = 1 - distToCenter / obs.radius;
          const pushStrength = penetration * obs.radius * 0.15;
          const invDist = 1 / distToCenter;
          shipPos2.x += dx * invDist * pushStrength;
          shipPos2.y += dy * invDist * pushStrength;
          shipPos2.z += dz * invDist * pushStrength;
          this.currentSpeed *= Math.max(0.3, 1 - penetration);
        }
      }
    }

    // Orient spaceship toward target (smooth rotation)
    const desiredMatrix = new THREE.Matrix4().lookAt(
      this.spaceship.position,
      targetPos,
      this.spaceship.up,
    );
    const desiredQuat = new THREE.Quaternion().setFromRotationMatrix(
      desiredMatrix,
    );
    const forwardOffset = (this.spaceship as any)?.userData?.forwardOffset as
      | THREE.Quaternion
      | undefined;
    if (forwardOffset) {
      desiredQuat.multiply(forwardOffset);
    }
    const rotAlpha = smoothingAlpha(this.config.rotationSmoothing);
    this.spaceship.quaternion.slerp(desiredQuat, rotAlpha);

    // Emit status update
    this.emitStatusChange();
  }

  /**
   * Get predicted target position based on velocity
   */
  private getTargetPosition(): THREE.Vector3 {
    if (!this.currentTarget.lastPosition) {
      return new THREE.Vector3();
    }

    // If target is frozen or prediction disabled, use current position
    if (
      this.currentTarget.frozen ||
      !this.config.usePredictiveIntercept ||
      !this.currentTarget.lastVelocity ||
      this.currentTarget.lastVelocity.length() < 0.01
    ) {
      return this.currentTarget.lastPosition.clone();
    }

    // Predict where target will be based on current speed and velocity
    const shipPos = this.spaceship.position.clone();
    const currentDistance = shipPos.distanceTo(this.currentTarget.lastPosition);

    // Estimate time to reach target
    // currentSpeed is units per frame; convert to units per second assuming ~60fps
    const speedPerSecond = this.currentSpeed * 60;
    const estimatedTime = currentDistance / Math.max(speedPerSecond, 0.1);

    // Clamp velocity to avoid extreme prediction leaps
    const velocity =
      this.smoothedTargetVelocity || this.currentTarget.lastVelocity;
    const clampedVelocity = velocity.clone().clampLength(0, 200); // units per second cap

    // Predict target position
    const predictedPosition = this.currentTarget.lastPosition
      .clone()
      .add(clampedVelocity.multiplyScalar(estimatedTime));

    return predictedPosition;
  }

  /**
   * Calculate appropriate speed based on distance
   */
  private calculateTargetSpeed(distance: number): void {
    if (distance > this.config.decelerationDistance) {
      // Far away - use max speed
      this.targetSpeed = this.isTurboActive
        ? this.config.turboSpeed
        : this.config.maxSpeed;
    } else {
      // Close to target - decelerate smoothly, but keep some thrust if frozen
      const progress = distance / this.config.decelerationDistance;
      const baseSpeed = progress * this.config.maxSpeed;
      const minSpeed = this.currentTarget.frozen ? 0.6 : 0.1;
      this.targetSpeed = Math.max(minSpeed, baseSpeed);
      // Disable turbo during deceleration
      this.isTurboActive = false;
    }
  }

  /**
   * Handle position updates from the emitter
   */
  private handlePositionUpdate = (update: PositionUpdate): void => {
    this.currentTarget.lastPosition = update.worldPosition.clone();
    this.currentTarget.lastVelocity = update.velocity.clone();
    if (!this.smoothedTargetVelocity) {
      this.smoothedTargetVelocity = update.velocity.clone();
    } else {
      this.smoothedTargetVelocity.lerp(
        update.velocity,
        Math.min(Math.max(this.config.velocitySmoothing, 0), 1),
      );
    }
  };

  /**
   * Handle arrival at target
   */
  private handleArrival(): void {
    const targetId = this.currentTarget.id;
    const arrivalMsg = `✅ ARRIVAL CONFIRMED: Reached ${targetId} - Navigation complete`;
    if (this.missionLog) this.missionLog(arrivalMsg);

    // Notify callback — this typically triggers enterMoonView which
    // freezes the moon's orbital motion for the focused-moon experience.
    if (this.onArrival && targetId) {
      this.onArrival(targetId);
    }

    // Clear the frozen flag BEFORE cancelNavigation so it does NOT call
    // emitter.resumeOrbit — the onArrival callback has already set up
    // its own orbital freeze and resumeOrbit would undo it.
    this.currentTarget.frozen = false;

    // Clean up navigation
    this.cancelNavigation();
  }

  /**
   * Emit status change to callback
   */
  private emitStatusChange(): void {
    if (!this.onStatusChange) return;

    const status: NavigationStatus = {
      isNavigating: this.currentTarget.id !== null,
      targetId: this.currentTarget.id,
      distance: this.currentTarget.lastPosition
        ? this.spaceship.position.distanceTo(this.currentTarget.lastPosition)
        : null,
      eta: this.calculateETA(),
      speed: this.currentSpeed,
      isTurboActive: this.isTurboActive,
      targetFrozen: this.currentTarget.frozen,
      targetPosition: this.currentTarget.lastPosition?.clone() ?? null,
    };

    this.onStatusChange(status);
  }

  /**
   * Calculate estimated time of arrival
   */
  private calculateETA(): number | null {
    if (!this.currentTarget.lastPosition || this.currentSpeed < 0.01) {
      return null;
    }

    const distance = this.spaceship.position.distanceTo(
      this.currentTarget.lastPosition,
    );

    // Simple estimation - doesn't account for deceleration
    return distance / this.currentSpeed;
  }

  /**
   * Set callback for status changes
   */
  public setOnStatusChange(callback: NavigationCallback): void {
    this.onStatusChange = callback;
  }

  /**
   * Set callback for arrival
   */
  public setOnArrival(callback: ArrivalCallback): void {
    this.onArrival = callback;
  }

  /**
   * Set mission log callback for game-related navigation messages
   */
  public setMissionLog(callback: MissionLogCallback): void {
    this.missionLog = callback;
  }

  /**
   * Provide a function that returns obstacles to avoid (planets/moons as spheres)
   */
  public setObstaclesProvider(provider: ObstacleProvider): void {
    this.obstaclesProvider = provider;
  }

  /**
   * Get current navigation status
   */
  public getStatus(): NavigationStatus {
    return {
      isNavigating: this.currentTarget.id !== null,
      targetId: this.currentTarget.id,
      distance: this.currentTarget.lastPosition
        ? this.spaceship.position.distanceTo(this.currentTarget.lastPosition)
        : null,
      eta: this.calculateETA(),
      speed: this.currentSpeed,
      isTurboActive: this.isTurboActive,
      targetFrozen: this.currentTarget.frozen,
      targetPosition: this.currentTarget.lastPosition?.clone() ?? null,
    };
  }

  /**
   * Enable/disable turbo during flight
   */
  public setTurbo(enabled: boolean): void {
    // Only allow turbo if far from target
    if (this.currentTarget.lastPosition) {
      const distance = this.spaceship.position.distanceTo(
        this.currentTarget.lastPosition,
      );
      if (distance > this.config.decelerationDistance) {
        this.isTurboActive = enabled;
      }
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<NavigationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    this.cancelNavigation();
    this.onStatusChange = null;
    this.onArrival = null;
  }
}
