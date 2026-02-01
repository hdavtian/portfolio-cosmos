/**
 * Orbital System - Manages orbital mechanics and animations
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";
import type { OrbitalItem, FrozenOrbitalState } from "../types";

export interface OrbitUpdateOptions {
  planetSpeedMultiplier: number;
  moonSpeedMultiplier: number;
  moonSpinMultiplier: number;
  focusedMoon: THREE.Mesh | null;
}

/**
 * Manages orbital objects (planets and moons) and their motion
 */
export class OrbitalSystem {
  private items: OrbitalItem[] = [];
  private frozenState: FrozenOrbitalState | null = null;

  /**
   * Register an orbital object to be tracked
   */
  registerObject(item: OrbitalItem): void {
    this.items.push(item);
  }

  /**
   * Get all registered items
   */
  getItems(): OrbitalItem[] {
    return this.items;
  }

  /**
   * Find an item by its mesh
   */
  findItem(mesh: THREE.Mesh): OrbitalItem | undefined {
    return this.items.find((item) => item.mesh === mesh);
  }

  /**
   * Update all orbital positions and rotations
   */
  updateOrbits(options: OrbitUpdateOptions): void {
    this.items.forEach((item) => {
      const isMoon = item.mesh.userData?.isMoon === true;
      const speedMultiplier = isMoon
        ? options.moonSpeedMultiplier
        : options.planetSpeedMultiplier;

      // Update orbital angle only when speed is greater than 0
      const isFocused = options.focusedMoon === item.mesh;

      if (!item.mesh.userData.pauseOrbit && !isFocused) {
        if (speedMultiplier > 0) {
          item.angle += item.orbitSpeed * speedMultiplier;
        }

        // Calculate position on elliptical orbit
        const usesAnchor = item.mesh.userData?.orbitUsesAnchor === true;
        const parentRotationY =
          !usesAnchor && isMoon && item.mesh.parent
            ? item.mesh.parent.rotation.y
            : 0;

        const orbitAngle = isMoon ? item.angle - parentRotationY : item.angle;
        const orbitRatio = item.mesh.userData?.orbitEllipseRatio ?? 1;

        item.mesh.position.x = Math.cos(orbitAngle) * item.distance;
        item.mesh.position.z =
          -Math.sin(orbitAngle) * item.distance * orbitRatio;
      }

      // Self rotation: use moon spin speed control for moons, base spin for planets
      const baseSpin = isMoon ? 0.02 * options.moonSpinMultiplier : 0.008;

      // For planets that have moons as children, only apply rotation if moon orbit speed > 0
      const isPlanetWithMoons = item.mesh.userData?.isMainPlanet === true;
      const shouldRotate =
        !isPlanetWithMoons || options.moonSpeedMultiplier > 0;
      const shouldApplySpin =
        shouldRotate && (!isMoon || options.moonSpinMultiplier > 0);

      if (shouldApplySpin) {
        item.mesh.rotation.y += baseSpin;
      }

      // Apply residual spin velocity from user interaction
      const spin = item.mesh.userData.spinVelocity as THREE.Vector3 | undefined;
      if (spin) {
        const dt = 1 / 60; // approximate delta-time
        item.mesh.rotation.x += spin.x * dt;
        item.mesh.rotation.y += spin.y * dt;
        // decay spin slowly
        spin.multiplyScalar(0.995);
      }
    });
  }

  /**
   * Freeze orbital motion for a specific moon
   * Returns frozen state for later restoration
   */
  freezeOrbits(
    moonMesh: THREE.Mesh,
    currentOrbitSpeed: number,
    currentMoonOrbitSpeed: number,
  ): FrozenOrbitalState {
    // Don't freeze if already frozen
    if (this.frozenState) {
      console.log("🧊 Orbital motion already frozen - reusing frozen state");
      return this.frozenState;
    }

    const moonItemEntry = this.findItem(moonMesh);
    if (!moonItemEntry) {
      console.warn("⚠️ Could not find moon item entry");
      return {};
    }

    console.log(`🧊 Freezing orbital motion for moon visit`);

    // Store the original speeds
    this.frozenState = {
      parentPlanetOrbitSpeed: currentOrbitSpeed,
      parentPlanetMoonOrbitSpeed: currentMoonOrbitSpeed,
      moonOrbitSpeed: moonItemEntry.orbitSpeed,
      moonItemEntry: moonItemEntry,
    };

    console.log(
      `   Stored speeds: planet=${this.frozenState.parentPlanetOrbitSpeed}, ` +
        `moonOrbit=${this.frozenState.parentPlanetMoonOrbitSpeed}, ` +
        `thisMoon=${this.frozenState.moonOrbitSpeed}`,
    );

    // Freeze this specific moon's orbit speed
    moonItemEntry.orbitSpeed = 0;

    console.log(`   ✅ All orbital motion frozen`);

    return this.frozenState;
  }

  /**
   * Restore orbital motion from frozen state
   */
  restoreOrbits(): FrozenOrbitalState | null {
    const state = this.frozenState;

    if (!state) {
      console.log("⚠️ No frozen orbital state to restore");
      return null;
    }

    console.log("🔄 Restoring orbital motion");

    // Restore the moon's orbit speed
    if (state.moonItemEntry && state.moonOrbitSpeed !== undefined) {
      state.moonItemEntry.orbitSpeed = state.moonOrbitSpeed;
      console.log(`   Restored moon orbit speed: ${state.moonOrbitSpeed}`);
    }

    // Clear the frozen state
    this.frozenState = null;

    console.log(`   ✅ Orbital motion restored`);

    return state;
  }

  /**
   * Get current frozen state (if any)
   */
  getFrozenState(): FrozenOrbitalState | null {
    return this.frozenState;
  }

  /**
   * Check if orbits are currently frozen
   */
  isFrozen(): boolean {
    return this.frozenState !== null;
  }

  /**
   * Clear all registered items
   */
  clear(): void {
    this.items = [];
    this.frozenState = null;
  }

  /**
   * Get count of registered items
   */
  getCount(): number {
    return this.items.length;
  }
}
