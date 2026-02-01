/**
 * Type definitions for celestial bodies (planets, moons, stars)
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

/**
 * Orbital item representing any object that orbits (planet or moon)
 */
export interface OrbitalItem {
  mesh: THREE.Mesh;
  orbitSpeed: number;
  angle: number;
  distance: number;
  parent?: THREE.Object3D;
  detached?: boolean;
  originalParent?: THREE.Object3D;
  overlayMeshes?: THREE.Mesh[];
  overlayOffsets?: number[];
  overlayHeights?: number[];
}

/**
 * Configuration for creating a planet or moon
 */
export interface PlanetConfig {
  name: string;
  distance: number;
  size: number;
  color: number;
  parent: THREE.Object3D;
  orbitSpeed?: number;
  sectionIndex?: number;
  textureUrl?: string;
}

/**
 * Frozen orbital state - stored when pausing orbital motion
 */
export interface FrozenOrbitalState {
  parentPlanetOrbitSpeed?: number;
  parentPlanetMoonOrbitSpeed?: number;
  moonOrbitSpeed?: number;
  moonItemEntry?: OrbitalItem;
}

/**
 * Planet user data stored in THREE.Mesh.userData
 */
export interface PlanetUserData {
  isPlanet: boolean;
  isMoon: boolean;
  isMainPlanet: boolean;
  planetName: string;
  sectionIndex?: number;
  moonId?: string;
  orbitEllipseRatio: number;
  orbitUsesAnchor: boolean;

  // Hover effect data
  originalEmissive: THREE.Color;
  hoverStartTime: number;
  lastFlashAt: number;
  flashActive: boolean;
  flashStrength: number;
  hoverCount: number;
  superEvery: number;
  lastSuperFlashAt: number;
  isPointerOver: boolean;

  // Halo data
  hasHaloLayers?: boolean;
  haloSizeVariance?: number;
  haloSpeedVariance?: number;
  haloColor?: THREE.Color;
  auroraSprite?: THREE.Sprite;
  ringSprite?: THREE.Sprite;
  coreSprite?: THREE.Sprite;

  // Overlay data
  detailOverlays?: THREE.Mesh[];
  titleOverlay?: THREE.Mesh;

  // Orbit anchor
  orbitAnchor?: THREE.Object3D;
}

/**
 * Overlay mesh user data
 */
export interface OverlayUserData {
  isDetailOverlay: boolean;
  isOverlay: boolean;
  isTitleOverlay?: boolean;
  isBulletOverlay?: boolean;
  bulletIndex?: number;
  radiusOffset?: number;
  elev?: number;
  planeHeight?: number;
  planeWidth?: number;
  slideDir?: number;
  slideProgress?: number;
  theta?: number;
  angularSpeed?: number;
  inclination?: number;
}
