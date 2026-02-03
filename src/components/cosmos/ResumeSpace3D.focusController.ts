import type React from "react";
import * as THREE from "three";
import { createFinalizeFocusOnMoon } from "./ResumeSpace3D.content";
import { createExitFocusedMoon } from "./ResumeSpace3D.exitFocus";
import { type OrbitItem } from "./ResumeSpace3D.orbital";
import {
  restoreFrozenSystem,
  type FrozenSystemState,
} from "./ResumeSpace3D.systemFreeze";
import type { SceneRef } from "./ResumeSpace3D.types";
import type { CosmosCameraDirector } from "../CosmicNavigation";
import type { OverlayContent } from "../CosmicContentOverlay";

export const createMoonFocusController = (deps: {
  scene: THREE.Scene;
  items: OrbitItem[];
  overlayClickables: THREE.Object3D[];
  attachMultiNoteOverlays: (
    planetMesh: THREE.Mesh,
    overlayDefs: Array<
      string | { type?: string; text?: string; lines?: string[] }
    >,
    options?: { radiusOffset?: number; opacity?: number },
  ) => THREE.Mesh[];
  setContentLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setOverlayContent: React.Dispatch<
    React.SetStateAction<OverlayContent | null>
  >;
  vlog: (message: string) => void;
  sceneRef: React.MutableRefObject<SceneRef>;
  focusedMoonRef: React.MutableRefObject<THREE.Mesh | null>;
  focusedMoonCameraDistanceRef: React.MutableRefObject<number | null>;
  frozenOrbitalSpeedsRef: React.MutableRefObject<{
    parentPlanetOrbitSpeed?: number;
    parentPlanetMoonOrbitSpeed?: number;
    moonOrbitSpeed?: number;
    moonItemEntry?: OrbitItem;
  } | null>;
  frozenSystemStateRef: React.MutableRefObject<FrozenSystemState | null>;
  optionsRef: React.MutableRefObject<{
    spaceShowOrbits?: boolean;
    spaceOrbitSpeed?: number;
    spaceMoonOrbitSpeed?: number;
    spaceMoonSpinSpeed?: number;
  }>;
  onOptionsChange?: (options: any) => void;
  isDraggingRef: React.MutableRefObject<boolean>;
  cameraDirectorRef: React.MutableRefObject<CosmosCameraDirector | null>;
  setMinDistance: (minDistance: number, reason?: string) => void;
  freezeOrbitalMotion: (moonMesh: THREE.Mesh) => void;
  lastMoonOrbitSpeedRef: React.MutableRefObject<number | null>;
  lastMoonSpinSpeedRef: React.MutableRefObject<number | null>;
  onMoonViewStart?: (moonMesh: THREE.Mesh) => void;
  onMoonViewEnd?: () => void;
}) => {
  const {
    scene,
    items,
    overlayClickables,
    attachMultiNoteOverlays,
    setContentLoading,
    setOverlayContent,
    vlog,
    sceneRef,
    focusedMoonRef,
    focusedMoonCameraDistanceRef,
    frozenOrbitalSpeedsRef,
    frozenSystemStateRef,
    optionsRef,
    onOptionsChange,
    isDraggingRef,
    cameraDirectorRef,
    setMinDistance,
    freezeOrbitalMotion,
    lastMoonOrbitSpeedRef,
    lastMoonSpinSpeedRef,
    onMoonViewStart,
    onMoonViewEnd,
  } = deps;

  const exitFocusedMoon = createExitFocusedMoon({
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
  });

  const finalizeFocusOnMoon = createFinalizeFocusOnMoon({
    scene,
    items,
    attachMultiNoteOverlays,
    setContentLoading,
    setOverlayContent,
    vlog,
    sceneRef,
    focusedMoonRef,
    focusedMoonCameraDistanceRef,
    onFocus: () => {
      if (lastMoonOrbitSpeedRef.current === null) {
        lastMoonOrbitSpeedRef.current =
          optionsRef.current.spaceMoonOrbitSpeed ?? 0.01;
      }
      lastMoonSpinSpeedRef.current =
        optionsRef.current.spaceMoonSpinSpeed ?? 0.1;
      optionsRef.current = {
        ...optionsRef.current,
        spaceMoonSpinSpeed: 0.1,
      };
      if (onOptionsChange) {
        onOptionsChange({
          ...optionsRef.current,
          spaceMoonSpinSpeed: 0.1,
        });
      }
    },
  });

  // RULES
  // -----
  // - When leaving a moon, restore the system orbit state as it was before
  //   entering. If the moon/system was stopped, keep it stopped. If it was
  //   moving, resume at the exact prior speed and path.
  // - Exiting should never re-derive orbit path from scratch; it must
  //   reattach the moon and continue from the stored state.
  // Exit moon view (single authoritative path)
  const exitMoonView = () => {
    const shouldExitRestoreOptions = !!frozenOrbitalSpeedsRef.current;

    restoreFrozenSystem({
      frozenSystemStateRef,
      showOrbits: optionsRef.current.spaceShowOrbits !== false,
      vlog,
    });

    const nextOptions = { ...optionsRef.current };
    let applyOptions = false;

    if (lastMoonOrbitSpeedRef.current !== null) {
      nextOptions.spaceMoonOrbitSpeed = lastMoonOrbitSpeedRef.current;
      applyOptions = true;
      lastMoonOrbitSpeedRef.current = null;
    }

    if (lastMoonSpinSpeedRef.current !== null) {
      nextOptions.spaceMoonSpinSpeed = lastMoonSpinSpeedRef.current;
      applyOptions = true;
      lastMoonSpinSpeedRef.current = null;
    }

    if (applyOptions) {
      optionsRef.current = nextOptions;
    }

    exitFocusedMoon();

    onMoonViewEnd?.();

    if (applyOptions && onOptionsChange && !shouldExitRestoreOptions) {
      onOptionsChange(nextOptions);
    }
  };

  const enterMoonView = async (params: {
    moonMesh: THREE.Mesh;
    company: any;
    useFlight?: boolean;
  }) => {
    const { moonMesh, company, useFlight = false } = params;

    if (focusedMoonRef.current && focusedMoonRef.current !== moonMesh) {
      exitMoonView();
    }

    // CRITICAL: Freeze orbital motion BEFORE getting position
    // This ensures the moon stays still during camera flight
    freezeOrbitalMotion(moonMesh);

    if (useFlight && cameraDirectorRef.current) {
      // Get the moon's WORLD position (now that it's frozen)
      const moonWorldPos = new THREE.Vector3();
      moonMesh.getWorldPosition(moonWorldPos);

      vlog(
        `🌙 Moon world: [${moonWorldPos
          .toArray()
          .map((n) => n.toFixed(1))
          .join(", ")}]`,
      );
      vlog(
        `🌙 Moon local: [${moonMesh.position
          .toArray()
          .map((n) => n.toFixed(1))
          .join(", ")}]`,
      );

      // Calculate camera position - simplified to just be directly in front
      const distance = 25; // Distance from moon center - testing value

      // Simple: position camera directly along one axis from moon
      const cameraPos = new THREE.Vector3(
        moonWorldPos.x,
        moonWorldPos.y,
        moonWorldPos.z + distance, // Just move back along Z axis
      );

      vlog(
        `📷 Camera: [${cameraPos
          .toArray()
          .map((n) => n.toFixed(1))
          .join(", ")}]`,
      );
      vlog(`📏 Distance: ${cameraPos.distanceTo(moonWorldPos).toFixed(2)}`);

      // Log controls target BEFORE flyTo
      if (sceneRef.current.controls) {
        vlog(
          `🎯 Before flyTo - target: [${sceneRef.current.controls.target
            .toArray()
            .map((n) => n.toFixed(1))
            .join(", ")}]`,
        );
      }

      await cameraDirectorRef.current.flyTo({
        position: cameraPos,
        lookAt: moonWorldPos,
        duration: 2.5,
        ease: "power2.inOut",
      });

      vlog(`✈️ Flight to ${company.company} complete`);

      // CRITICAL: Update OrbitControls target AFTER flyTo completes
      // This allows manual zoom to work toward the moon, not the sun!
      if (sceneRef.current.controls && sceneRef.current.camera) {
        vlog(`🎯 After flyTo, updating target to moon...`);
        sceneRef.current.controls.target.copy(moonWorldPos);
        setMinDistance(0, "allow zoom to moon surface");
        sceneRef.current.controls.update(); // Force update to apply changes

        const camToTarget = sceneRef.current.camera.position.distanceTo(
          sceneRef.current.controls.target,
        );
        vlog(
          `✓ Target updated: [${sceneRef.current.controls.target
            .toArray()
            .map((n) => n.toFixed(1))
            .join(", ")}]`,
        );
        vlog(
          `📐 Camera-to-target distance: ${camToTarget.toFixed(2)} (min: ${sceneRef.current.controls.minDistance}, max: ${sceneRef.current.controls.maxDistance})`,
        );
      }
    }

    // After arriving, finalize focus/overlays for the moon (extracted)
    finalizeFocusOnMoon(moonMesh, company);
    onMoonViewStart?.(moonMesh);
  };

  return { enterMoonView, exitMoonView };
};
