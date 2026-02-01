/**
 * Type definitions for scene configuration and rendering
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * Scene reference containing all core Three.js objects
 */
export interface SceneRef {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  controls?: OrbitControls;
  sunLight?: THREE.PointLight;
  labelRendererDom?: HTMLElement;
  bloomPass?: UnrealBloomPass;
  sunMaterial?: THREE.MeshBasicMaterial;
  sunGlowMaterial?: THREE.SpriteMaterial;
}

/**
 * Lighting configuration options
 */
export interface LightingOptions {
  sunIntensity: number;
  sunColor: string;
  ambientColor: string;
  ambientIntensity: number;
}

/**
 * Camera configuration
 */
export interface CameraConfig {
  fov: number;
  near: number;
  far: number;
  position: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
}

/**
 * Orbit anchor reference - for hierarchical orbital motion
 */
export interface OrbitAnchor {
  anchor: THREE.Object3D;
  parent: THREE.Object3D;
}
