/**
 * Color generation and manipulation utilities
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

/**
 * Generate random vibrant halo color
 * Returns colors in cool/warm spectrum based on random hue
 */
export function generateRandomHaloColor(): THREE.Color {
  const hue = Math.random(); // 0 to 1

  if (hue < 0.33) {
    // Cool blues/cyans
    return new THREE.Color().setHSL(
      0.5 + Math.random() * 0.15,
      0.7 + Math.random() * 0.3,
      0.6,
    );
  } else if (hue < 0.66) {
    // Purples/magentas
    return new THREE.Color().setHSL(
      0.75 + Math.random() * 0.15,
      0.6 + Math.random() * 0.3,
      0.55,
    );
  } else {
    // Warm oranges/yellows/greens
    return new THREE.Color().setHSL(
      0.15 + Math.random() * 0.25,
      0.7 + Math.random() * 0.3,
      0.55,
    );
  }
}

/**
 * Generate random color variance
 * Returns multiplier between min and max (default 0.75 to 1.25)
 */
export function generateColorVariance(
  min: number = 0.75,
  max: number = 1.25,
): number {
  return min + Math.random() * (max - min);
}

/**
 * Apply color variance to a base color
 * Adjusts HSL lightness by variance
 */
export function applyColorVariance(
  baseColor: THREE.Color,
  variance: number,
): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  baseColor.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l * variance);
}

/**
 * Interpolate between two colors
 */
export function lerpColor(
  color1: THREE.Color,
  color2: THREE.Color,
  t: number,
): THREE.Color {
  return new THREE.Color().lerpColors(color1, color2, t);
}

/**
 * Generate orbit color based on name
 * Returns specific color for known planets, default for others
 */
export function getOrbitColorForPlanet(planetName: string): number {
  const name = (planetName || "").toLowerCase();

  if (name.includes("experience")) {
    return 0xe8c547; // gold
  } else if (name.includes("skills")) {
    return 0x33a8ff; // cyan
  } else if (name.includes("projects")) {
    return 0x9933ff; // purple
  }

  return 0x666a80; // neutral
}

/**
 * Generate orbit color for moon based on parent planet
 */
export function getOrbitColorForMoon(parentPlanetName: string): number {
  const name = (parentPlanetName || "").toLowerCase();

  if (name.includes("experience")) {
    return 0xff9966; // warm
  } else if (name.includes("skills")) {
    return 0x66ccff; // cool
  } else if (name.includes("projects")) {
    return 0xcc99ff; // pastel
  }

  return 0x556070; // default
}
