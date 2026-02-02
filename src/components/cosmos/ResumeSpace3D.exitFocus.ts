import type React from "react";
import * as THREE from "three";

export type OrbitItem = {
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
};

export const createExitFocusedMoon = (deps: {
  scene: THREE.Scene;
  items: OrbitItem[];
  overlayClickables: THREE.Object3D[];
  focusedMoonRef: React.MutableRefObject<THREE.Mesh | null>;
  frozenOrbitalSpeedsRef: React.MutableRefObject<{
    parentPlanetOrbitSpeed?: number;
    parentPlanetMoonOrbitSpeed?: number;
    moonOrbitSpeed?: number;
    moonItemEntry?: OrbitItem;
  } | null>;
  optionsRef: React.MutableRefObject<{
    spaceOrbitSpeed?: number;
    spaceMoonOrbitSpeed?: number;
  }>;
  onOptionsChange?: (options: any) => void;
  isDraggingRef: React.MutableRefObject<boolean>;
  sceneRef: React.MutableRefObject<{
    controls?: { enabled: boolean } | undefined;
  }>;
  vlog: (message: string) => void;
}) => {
  const {
    scene,
    items,
    overlayClickables,
    focusedMoonRef,
    frozenOrbitalSpeedsRef,
    optionsRef,
    onOptionsChange,
    isDraggingRef,
    sceneRef,
    vlog,
  } = deps;

  return () => {
    const focused = focusedMoonRef.current;
    if (!focused) return;

    // Remove single overlay if present
    const overlay = focused.userData.detailOverlay as THREE.Mesh | undefined;
    if (overlay) {
      if (overlay.parent) overlay.parent.remove(overlay);
      const oi = overlayClickables.indexOf(overlay);
      if (oi >= 0) overlayClickables.splice(oi, 1);
      try {
        if (overlay.geometry) overlay.geometry.dispose();
        if (overlay.material) (overlay.material as THREE.Material).dispose();
      } catch (e) {
        // ignore
      }
      focused.userData.detailOverlay = null;
    }

    // Remove multiple note overlays if present
    const overlays = focused.userData.detailOverlays as
      | THREE.Mesh[]
      | undefined;
    if (overlays && overlays.length) {
      overlays.forEach((o) => {
        if (o.parent) o.parent.remove(o);
        const oi = overlayClickables.indexOf(o);
        if (oi >= 0) overlayClickables.splice(oi, 1);
        try {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (o.material as THREE.Material).dispose();
        } catch (e) {
          // ignore
        }
      });
      focused.userData.detailOverlays = null;
    }

    // Find items entry
    const itemEntry = items.find((it) => it.mesh === focused);
    if (itemEntry) {
      const originalParent = (itemEntry as any).originalParent as
        | THREE.Object3D
        | undefined;
      const newParent = originalParent || itemEntry.parent || scene;

      // Convert world position back into the parent's local space, then reparent
      const worldPos = new THREE.Vector3();
      focused.getWorldPosition(worldPos);
      // add to parent then set local position
      newParent.add(focused);
      newParent.worldToLocal(worldPos);
      focused.position.copy(worldPos);

      // mark as attached again
      itemEntry.detached = false;
      itemEntry.parent = newParent;

      // Recompute polar coordinates for consistent orbit continuation
      const x = focused.position.x;
      const z = focused.position.z;
      const orbitRatio = focused.userData?.orbitEllipseRatio ?? 1;
      const usesAnchor = focused.userData?.orbitUsesAnchor === true;
      const parentRotationY =
        !usesAnchor && newParent ? newParent.rotation.y : 0;
      itemEntry.distance =
        Math.sqrt(x * x + (z * z) / (orbitRatio * orbitRatio)) ||
        itemEntry.distance;
      // Match updateOrbit's parent-rotation compensation for moons
      itemEntry.angle = Math.atan2(-z / orbitRatio, x) + parentRotationY;
    }

    // Resume orbit and clear user-driven spin
    focused.userData.pauseOrbit = false;
    focused.userData.spinVelocity = undefined;

    // RESTORE ORBITAL SPEEDS: Restore the speeds we froze when focusing
    if (frozenOrbitalSpeedsRef.current) {
      vlog(`❄️ Restoring orbital motion after moon visit`);

      const frozen = frozenOrbitalSpeedsRef.current;
      vlog(
        `   Restoring speeds: planet=${frozen.parentPlanetOrbitSpeed}, moonOrbit=${frozen.parentPlanetMoonOrbitSpeed}, thisMoon=${frozen.moonOrbitSpeed}`,
      );

      // Restore the global speed settings
      if (onOptionsChange) {
        onOptionsChange({
          ...optionsRef.current,
          spaceOrbitSpeed: frozen.parentPlanetOrbitSpeed ?? 0.1,
          spaceMoonOrbitSpeed: frozen.parentPlanetMoonOrbitSpeed ?? 0.01,
        });
      }

      // Restore this specific moon's orbit speed
      if (frozen.moonItemEntry && frozen.moonOrbitSpeed !== undefined) {
        frozen.moonItemEntry.orbitSpeed = frozen.moonOrbitSpeed;
      }

      // Clear the frozen speeds
      frozenOrbitalSpeedsRef.current = null;

      vlog(`   ✅ Orbital motion restored`);
    }

    // Disable any ongoing drag
    isDraggingRef.current = false;
    if (sceneRef.current && sceneRef.current.controls) {
      sceneRef.current.controls.enabled = true;
    }

    // Clear focused reference
    focusedMoonRef.current = null;
  };
};
