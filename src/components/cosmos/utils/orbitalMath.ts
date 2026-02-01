/**
 * Orbital mechanics calculations
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

/**
 * Calculate orbital position from angle and distance
 * Returns x and z coordinates on an elliptical orbit
 */
export function calculateOrbitalPosition(
  angle: number,
  distance: number,
  ellipseRatio: number = 1.0,
): { x: number; z: number } {
  return {
    x: Math.cos(angle) * distance,
    z: Math.sin(angle) * distance * ellipseRatio,
  };
}

/**
 * Update orbital angle based on speed and delta time
 * Returns new angle (wrapped to 2π)
 */
export function updateOrbitalAngle(
  currentAngle: number,
  orbitSpeed: number,
  deltaTime: number,
): number {
  const newAngle = currentAngle + orbitSpeed * deltaTime;
  return newAngle % (Math.PI * 2);
}

/**
 * Apply elliptical orbit position to a mesh
 */
export function applyOrbitalPosition(
  mesh: THREE.Mesh,
  angle: number,
  distance: number,
  ellipseRatio: number = 1.0,
): void {
  const pos = calculateOrbitalPosition(angle, distance, ellipseRatio);
  mesh.position.x = pos.x;
  mesh.position.z = pos.z;
}

/**
 * Calculate orbital velocity for circular orbit
 * v = sqrt(GM/r) simplified for our scene
 */
export function calculateOrbitalVelocity(
  distance: number,
  centralMass: number = 1.0,
): number {
  return Math.sqrt(centralMass / distance);
}

/**
 * Get random starting angle for orbit (0 to 2π)
 */
export function getRandomStartAngle(): number {
  return Math.random() * Math.PI * 2;
}

/**
 * Calculate distance between two points in 3D space
 */
export function calculateDistance(
  pos1: THREE.Vector3,
  pos2: THREE.Vector3,
): number {
  return pos1.distanceTo(pos2);
}

/**
 * Interpolate between two angles taking shortest path
 * Useful for smooth rotation animations
 */
export function lerpAngle(from: number, to: number, t: number): number {
  // Normalize angles to 0-2π range
  from = from % (Math.PI * 2);
  to = to % (Math.PI * 2);

  // Calculate shortest distance
  let diff = to - from;
  if (diff > Math.PI) {
    diff -= Math.PI * 2;
  } else if (diff < -Math.PI) {
    diff += Math.PI * 2;
  }

  return from + diff * t;
}
