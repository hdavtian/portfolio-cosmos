/**
 * Geometry helper functions for common Three.js operations
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

/**
 * Create elliptical orbit path using EllipseCurve and CatmullRomCurve
 * Returns tube geometry for rendering orbit line
 */
export function createEllipseOrbitPath(
  distance: number,
  ellipseRatio: number,
  tubeRadius: number,
  segments: number = 256,
  radialSegments: number = 12,
): THREE.TubeGeometry {
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

  return new THREE.TubeGeometry(
    ellipsePath,
    segments,
    tubeRadius,
    radialSegments,
    true,
  );
}

/**
 * Create sphere geometry with specified parameters
 */
export function createSphereGeometry(
  radius: number,
  widthSegments: number = 32,
  heightSegments: number = 32,
): THREE.SphereGeometry {
  return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
}

/**
 * Create plane geometry for overlays
 */
export function createPlaneGeometry(
  width: number,
  height: number,
): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(width, height);
}

/**
 * Dispose of geometry safely
 */
export function disposeGeometry(geometry: THREE.BufferGeometry): void {
  try {
    geometry.dispose();
  } catch (e) {
    console.warn("Failed to dispose geometry:", e);
  }
}

/**
 * Dispose of material safely
 */
export function disposeMaterial(
  material: THREE.Material | THREE.Material[],
): void {
  try {
    if (Array.isArray(material)) {
      material.forEach((mat) => mat.dispose());
    } else {
      material.dispose();
    }
  } catch (e) {
    console.warn("Failed to dispose material:", e);
  }
}

/**
 * Dispose of mesh (geometry + material)
 */
export function disposeMesh(mesh: THREE.Mesh): void {
  if (mesh.geometry) {
    disposeGeometry(mesh.geometry);
  }
  if (mesh.material) {
    disposeMaterial(mesh.material);
  }
}

/**
 * Calculate aspect ratio from texture/image
 */
export function calculateAspectRatio(
  image: HTMLCanvasElement | HTMLImageElement,
): number {
  return image.width && image.height ? image.width / image.height : 1;
}

/**
 * Create point cloud geometry for starfield
 */
export function createPointStarfield(
  count: number,
  minDistance: number,
  maxDistance: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count * 3; i += 3) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const distance = minDistance + Math.random() * (maxDistance - minDistance);

    positions[i] = distance * Math.sin(phi) * Math.cos(theta);
    positions[i + 1] = distance * Math.sin(phi) * Math.sin(theta);
    positions[i + 2] = distance * Math.cos(phi);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}
