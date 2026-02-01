/**
 * createLighting - Factory for creating Three.js lights
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

export interface AmbientLightConfig {
  color?: THREE.Color | number;
  intensity?: number;
}

export interface PointLightConfig {
  color?: THREE.Color | number;
  intensity?: number;
  distance?: number;
  decay?: number;
  position?: THREE.Vector3;
  castShadow?: boolean;
}

/**
 * Create ambient light
 */
export function createAmbientLight(
  config: AmbientLightConfig = {},
): THREE.AmbientLight {
  const { color = new THREE.Color(0.13, 0.13, 0.13), intensity = 0.5 } = config;

  return new THREE.AmbientLight(color, intensity);
}

/**
 * Create sun light (central point light)
 */
export function createSunLight(
  config: PointLightConfig = {},
): THREE.PointLight {
  const {
    color = new THREE.Color(1.0, 1.0, 1.0),
    intensity = 10.0,
    distance = 1000,
    decay = 0.5,
    position = new THREE.Vector3(0, 0, 0),
    castShadow = false,
  } = config;

  const light = new THREE.PointLight(color, intensity, distance, decay);
  light.position.copy(position);
  light.castShadow = castShadow;

  return light;
}

/**
 * Create fill light (ambient illumination)
 */
export function createFillLight(
  config: PointLightConfig = {},
): THREE.PointLight {
  const {
    color = new THREE.Color(0.2, 0.4, 1.0),
    intensity = 2.0,
    distance = 100,
    decay = 1,
    position = new THREE.Vector3(50, 50, -100),
    castShadow = false,
  } = config;

  const light = new THREE.PointLight(color, intensity, distance, decay);
  light.position.copy(position);
  light.castShadow = castShadow;

  return light;
}

/**
 * Create complete lighting setup
 */
export interface LightingSetupConfig {
  ambientLight?: AmbientLightConfig;
  sunLight?: PointLightConfig;
  fillLight?: PointLightConfig;
}

export interface LightingSetup {
  ambient: THREE.AmbientLight;
  sun: THREE.PointLight;
  fill: THREE.PointLight;
}

export function createLightingSetup(
  config: LightingSetupConfig = {},
): LightingSetup {
  return {
    ambient: createAmbientLight(config.ambientLight),
    sun: createSunLight(config.sunLight),
    fill: createFillLight(config.fillLight),
  };
}
