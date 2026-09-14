import * as THREE from "three";

/**
 * Ship engine glow, driven from speed. Two parts:
 * - the hull material's emissive intensity (its emissive map lights only the
 *   engine grille, so this brightens just the engines, and bloom does the rest)
 * - soft additive sprites sitting along the grille, which swell at high speed.
 */

export type EngineGlowMaterial = {
  material: THREE.MeshStandardMaterial;
  baseIntensity: number;
};

/** Cap so bloom doesn't white out the grille. */
const MAX_HULL_ENGINE_INTENSITY = 6;
/** Speed (units / sec) at which the "punch it" boost is fully on. */
const PUNCH_SPEED = 2400;
const PUNCH_MAX = 2.5;

/**
 * @param travelGlow 0 idle .. 1 cruising (from the engine light's intensity)
 * @param speedUnitsPerSec the ship's current speed, for the punch boost
 */
export const applyEngineGlow = (
  ship: THREE.Object3D,
  engineLight: THREE.PointLight,
  travelGlow: number,
  speedUnitsPerSec: number,
  elapsedSeconds: number,
): void => {
  const glow = THREE.MathUtils.clamp(travelGlow, 0, 1);
  const punch = THREE.MathUtils.clamp(speedUnitsPerSec / PUNCH_SPEED, 0, PUNCH_MAX);
  // Engines burn; a steady glow reads as a painted light.
  const flicker =
    1 +
    Math.sin(elapsedSeconds * 23) * 0.04 +
    Math.sin(elapsedSeconds * 37 + 1.3) * 0.03;

  const materials = ship.userData.engineGlowMaterials as EngineGlowMaterial[] | undefined;
  materials?.forEach(({ material, baseIntensity }) => {
    material.emissiveIntensity = Math.min(
      MAX_HULL_ENGINE_INTENSITY,
      baseIntensity * (1 + glow * 1.5 + punch * 1.4) * (glow > 0 ? flicker : 1),
    );
  });

  const sprites = engineLight.userData.glowSprites as THREE.Sprite[] | undefined;
  sprites?.forEach((sprite) => {
    const material = sprite.material as THREE.SpriteMaterial;
    const baseScale = (sprite.userData.baseScale as number | undefined) ?? 1;
    const baseOpacity = (sprite.userData.baseOpacity as number | undefined) ?? 1;
    material.opacity = THREE.MathUtils.clamp(
      (glow * 0.75 + Math.min(1, punch) * 0.25) * baseOpacity * flicker,
      0,
      1,
    );
    sprite.scale.setScalar(baseScale * (1 + glow * 0.4 + punch * 0.9) * flicker);
  });
};
