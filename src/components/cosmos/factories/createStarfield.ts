/**
 * createStarfield - Factory for creating starfield backgrounds
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

export interface StarfieldConfig {
  radius: number;
  textureUrl: string;
  color?: THREE.Color;
  opacity?: number;
  side?: THREE.Side;
  segments?: number;
}

/**
 * Create a textured starfield sphere background
 */
export function createBackgroundStarfield(config: StarfieldConfig): THREE.Mesh {
  const {
    radius,
    textureUrl,
    color = new THREE.Color(1.2, 1.2, 1.2),
    opacity = 1.0,
    side = THREE.BackSide,
    segments = 64,
  } = config;

  const textureLoader = new THREE.TextureLoader();
  const starTexture = textureLoader.load(textureUrl);

  const starGeo = new THREE.SphereGeometry(radius, segments, segments);
  const starMat = new THREE.MeshBasicMaterial({
    map: starTexture,
    side,
    toneMapped: false,
    color,
    transparent: opacity < 1.0,
    opacity,
  });

  return new THREE.Mesh(starGeo, starMat);
}

/**
 * Create a point-based starfield (procedural stars)
 */
export function createPointStarfield(
  count: number,
  radius: number,
): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Random point on sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * (0.9 + Math.random() * 0.1); // Slight variation in distance

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}

/**
 * Create layered starfield with outer and inner spheres
 */
export interface LayeredStarfieldConfig {
  outerRadius: number;
  outerTexture: string;
  outerColor?: THREE.Color;
  innerRadius: number;
  innerTexture: string;
  innerColor?: THREE.Color;
  innerOpacity?: number;
}

export function createLayeredStarfield(config: LayeredStarfieldConfig): {
  outer: THREE.Mesh;
  inner: THREE.Mesh;
} {
  const {
    outerRadius,
    outerTexture,
    outerColor = new THREE.Color(1.2, 1.2, 1.2),
    innerRadius,
    innerTexture,
    innerColor = new THREE.Color(0.8, 0.9, 1.0),
    innerOpacity = 0.3,
  } = config;

  const outer = createBackgroundStarfield({
    radius: outerRadius,
    textureUrl: outerTexture,
    color: outerColor,
  });

  const inner = createBackgroundStarfield({
    radius: innerRadius,
    textureUrl: innerTexture,
    color: innerColor,
    opacity: innerOpacity,
  });

  return { outer, inner };
}
