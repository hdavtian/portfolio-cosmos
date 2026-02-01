/**
 * createOrbitPath - Factory for creating orbital paths (elliptical tubes)
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

export interface OrbitPathConfig {
  distance: number;
  ellipseRatio?: number;
  tubeRadius?: number;
  color?: number;
  opacity?: number;
  segments?: number;
  radialSegments?: number;
}

/**
 * Create an elliptical orbit path using tube geometry
 */
export function createOrbitPath(config: OrbitPathConfig): THREE.Mesh {
  const {
    distance,
    ellipseRatio = 0.85,
    tubeRadius = 0.12,
    color = 0x666a80,
    opacity = 0.08,
    segments = 256,
    radialSegments = 12,
  } = config;

  // Create elliptical curve
  const ellipseCurve = new THREE.EllipseCurve(
    0,
    0,
    distance,
    distance * ellipseRatio,
    0,
    Math.PI * 2,
    false,
    0,
  );

  const ellipsePoints = ellipseCurve.getPoints(segments);
  const ellipsePath = new THREE.CatmullRomCurve3(
    ellipsePoints.map((p) => new THREE.Vector3(p.x, 0, p.y)),
    true,
    "centripetal",
  );

  // Create tube geometry along the path
  const ringGeometry = new THREE.TubeGeometry(
    ellipsePath,
    segments,
    tubeRadius,
    radialSegments,
    true,
  );

  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
  });

  const orbit = new THREE.Mesh(ringGeometry, ringMaterial);
  orbit.userData.isOrbitLine = true; // Mark for visibility control

  return orbit;
}

/**
 * Get orbit color based on planet type
 */
export function getOrbitColorForPlanet(planetName: string): number {
  switch (planetName.toLowerCase()) {
    case "experience":
      return 0xe8c547; // gold
    case "skills":
      return 0x33a8ff; // cyan
    case "projects":
      return 0x9933ff; // purple
    default:
      return 0x666a80; // neutral
  }
}

/**
 * Get orbit color based on parent planet (for moons)
 */
export function getOrbitColorForMoon(parentPlanetName: string): number {
  const parentName = parentPlanetName.toLowerCase();

  if (parentName.includes("experience")) {
    return 0xff9966; // warm for moons of Experience
  } else if (parentName.includes("skills")) {
    return 0x66ccff; // cool for moons of Skills
  } else if (parentName.includes("projects")) {
    return 0xcc99ff; // pastel for moons of Projects
  } else {
    return 0x556070; // neutral
  }
}
