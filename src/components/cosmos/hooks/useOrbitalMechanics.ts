/**
 * useOrbitalMechanics - Hook for managing orbital objects and their motion
 * Wraps OrbitalSystem
 */

import { useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitalSystem } from "../systems/OrbitalSystem";
import type { OrbitUpdateOptions } from "../systems/OrbitalSystem";
import type { OrbitalItem, FrozenOrbitalState } from "../types";

export interface OrbitalMechanicsOptions {
  planetSpeedMultiplier?: number;
  moonSpeedMultiplier?: number;
  moonSpinMultiplier?: number;
}

export interface OrbitalMechanicsResult {
  registerItem: (item: OrbitalItem) => void;
  updateOrbits: (options: OrbitUpdateOptions) => void;
  freezeOrbits: (
    moonMesh: THREE.Mesh,
    planetSpeed: number,
    moonSpeed: number,
  ) => FrozenOrbitalState;
  restoreOrbits: () => FrozenOrbitalState | null;
  findItem: (mesh: THREE.Mesh) => OrbitalItem | undefined;
  getItems: () => OrbitalItem[];
  isFrozen: () => boolean;
  clear: () => void;
}

/**
 * Manage orbital mechanics for celestial bodies
 */
export function useOrbitalMechanics(): OrbitalMechanicsResult {
  const systemRef = useRef<OrbitalSystem | null>(null);

  // Initialize system on first call
  if (!systemRef.current) {
    systemRef.current = new OrbitalSystem();
  }

  const registerItem = useCallback((item: OrbitalItem) => {
    systemRef.current?.registerObject(item);
  }, []);

  const updateOrbits = useCallback((options: OrbitUpdateOptions) => {
    systemRef.current?.updateOrbits(options);
  }, []);

  const freezeOrbits = useCallback(
    (moonMesh: THREE.Mesh, planetSpeed: number, moonSpeed: number) => {
      return (
        systemRef.current?.freezeOrbits(moonMesh, planetSpeed, moonSpeed) || {}
      );
    },
    [],
  );

  const restoreOrbits = useCallback(() => {
    return systemRef.current?.restoreOrbits() || null;
  }, []);

  const findItem = useCallback((mesh: THREE.Mesh) => {
    return systemRef.current?.findItem(mesh);
  }, []);

  const getItems = useCallback(() => {
    return systemRef.current?.getItems() || [];
  }, []);

  const isFrozen = useCallback(() => {
    return systemRef.current?.isFrozen() || false;
  }, []);

  const clear = useCallback(() => {
    systemRef.current?.clear();
  }, []);

  return {
    registerItem,
    updateOrbits,
    freezeOrbits,
    restoreOrbits,
    findItem,
    getItems,
    isFrozen,
    clear,
  };
}
