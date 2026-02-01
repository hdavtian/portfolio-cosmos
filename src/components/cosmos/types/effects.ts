/**
 * Type definitions for visual effects (halos, overlays, particles)
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

/**
 * Halo layer sprites for hover effects
 */
export interface HaloLayers {
  aurora: THREE.Sprite;
  ring: THREE.Sprite;
  core: THREE.Sprite;
}

/**
 * Overlay definition for detail overlays
 */
export interface OverlayDefinition {
  type?: "title" | "general";
  text?: string;
  lines?: string[];
}

/**
 * Texture generation options
 */
export interface TextureOptions {
  width?: number;
  height?: number;
  bgColor?: string;
  lineColor?: string;
  textColor?: string;
  showLine?: boolean;
  fontSize?: number;
  lineSpacing?: number;
  textAlign?: CanvasTextAlign;
  padding?: number;
}

/**
 * Overlay creation options
 */
export interface OverlayOptions {
  radiusOffset?: number;
  opacity?: number;
}
