import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { OrbitItem } from "./ResumeSpace3D.orbital";

export type FrozenSystemState = {
  systemId: string;
  planetItem?: OrbitItem;
  planetOrbitSpeed?: number;
  moonItems: { item: OrbitItem; orbitSpeed: number }[];
  orbitLines: THREE.Object3D[];
};

const resolveSystemId = (moonMesh: THREE.Mesh): string | undefined => {
  const direct = moonMesh.userData?.systemId as string | undefined;
  if (direct) return direct;

  let current: THREE.Object3D | null = moonMesh.parent;
  while (current) {
    const data = (current as any).userData as Record<string, any> | undefined;
    if (data?.systemId) return data.systemId as string;
    if (data?.planetName) return String(data.planetName).toLowerCase();
    current = current.parent;
  }
  return undefined;
};

// RULES
// -----
// - On restore, orbit ellipses for the frozen system must return to the
//   global visibility state (showOrbits). Do not force visible when off.
export const restoreFrozenSystem = (params: {
  frozenSystemStateRef: MutableRefObject<FrozenSystemState | null>;
  showOrbits?: boolean;
  vlog?: (message: string) => void;
}) => {
  const { frozenSystemStateRef, showOrbits = true, vlog } = params;
  const state = frozenSystemStateRef.current;
  if (!state) return;

  if (state.planetItem && state.planetOrbitSpeed !== undefined) {
    state.planetItem.orbitSpeed = state.planetOrbitSpeed;
  }
  state.moonItems.forEach(({ item, orbitSpeed }) => {
    item.orbitSpeed = orbitSpeed;
  });

  state.orbitLines.forEach((line) => {
    // Show orbit ellipses for the restored system (respect global visibility)
    line.visible = showOrbits;
  });

  vlog?.(`🧭 Restored orbit system: ${state.systemId}`);
  frozenSystemStateRef.current = null;
};

// RULES
// -----
// - On moon focus, hide orbit ellipses for the affected system only.
//   Global visibility is preserved and restored on exit.
export const freezeSystemForMoon = (params: {
  moonMesh: THREE.Mesh;
  items: OrbitItem[];
  scene: THREE.Scene;
  frozenSystemStateRef: MutableRefObject<FrozenSystemState | null>;
  showOrbits?: boolean;
  vlog?: (message: string) => void;
}) => {
  const { moonMesh, items, scene, frozenSystemStateRef, showOrbits, vlog } =
    params;

  const systemId = resolveSystemId(moonMesh);
  if (!systemId) return;

  if (frozenSystemStateRef.current?.systemId === systemId) {
    vlog?.("🧊 Orbit system already frozen - reusing frozen state");
    return;
  }

  if (frozenSystemStateRef.current) {
    restoreFrozenSystem({ frozenSystemStateRef, showOrbits, vlog });
  }

  const planetItem = items.find(
    (it) =>
      it.mesh.userData?.isMainPlanet && it.mesh.userData?.systemId === systemId,
  );

  const moonItems = items
    .filter(
      (it) =>
        it.mesh.userData?.isMoon && it.mesh.userData?.systemId === systemId,
    )
    .map((it) => ({ item: it, orbitSpeed: it.orbitSpeed }));

  const orbitLines: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (obj.userData?.isOrbitLine && obj.userData?.orbitSystemId === systemId) {
      orbitLines.push(obj);
      // Hide orbit ellipses for the focused system during moon view
      obj.visible = false;
    }
  });

  const state: FrozenSystemState = {
    systemId,
    planetItem,
    planetOrbitSpeed: planetItem?.orbitSpeed,
    moonItems,
    orbitLines,
  };

  if (planetItem) {
    planetItem.orbitSpeed = 0;
  }
  moonItems.forEach(({ item }) => {
    item.orbitSpeed = 0;
  });

  frozenSystemStateRef.current = state;
  vlog?.(`🧊 Frozen orbit system: ${systemId}`);
};
