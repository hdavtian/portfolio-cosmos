/**
 * Type definitions for spaceship state and controls
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

/**
 * Spaceship view modes
 */
export type ShipViewMode = "exterior" | "interior" | "cockpit";

/**
 * Manual flight control state
 */
export interface ManualFlightState {
  velocity: THREE.Vector3;
  acceleration: number;
  maxSpeed: number;
  currentSpeed: number;
  pitch: number; // Rotation around X axis
  yaw: number; // Rotation around Y axis
  roll: number; // Rotation around Z axis
  targetPitch: number;
  targetYaw: number;
  targetRoll: number;
  isAccelerating: boolean;
  direction: { forward: number; right: number; up: number };
  turboStartTime: number;
  isTurboActive: boolean;
}

/**
 * Keyboard state for manual controls
 */
export interface KeyboardState {
  ArrowUp: boolean;
  ArrowDown: boolean;
  ArrowLeft: boolean;
  ArrowRight: boolean;
  ShiftLeft: boolean;
  KeyQ: boolean; // Strafe left
  KeyE: boolean; // Strafe right
  KeyZ: boolean; // Roll left
  KeyC: boolean; // Roll right
}

/**
 * Spaceship path state for autopilot
 */
export interface SpaceshipPathState {
  currentIndex: number;
  progress: number;
  speed: number;
  targetSpeed: number;
  pauseTime: number;
  isPaused: boolean;
  rollSpeed: number;
  rollAmount: number;
  visitingMoon: boolean;
  moonVisitStartTime: number;
  moonVisitDuration: number;
  currentMoonTarget: THREE.Vector3 | null;
}
