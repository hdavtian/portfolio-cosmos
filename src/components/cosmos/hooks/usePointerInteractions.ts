import type { MutableRefObject, RefObject } from "react";
import { useCallback } from "react";
import * as THREE from "three";
import {
  createFocusedMoonRotationHandlers,
  createPointerInteractionHandlers,
} from "../ResumeSpace3D.interaction";

export const usePointerInteractions = (params: {
  mountRef: RefObject<HTMLDivElement | null>;
  focusedMoonRef: MutableRefObject<THREE.Mesh | null>;
  isDraggingRef: MutableRefObject<boolean>;
  lastPointerRef: MutableRefObject<{ x: number; y: number; t: number } | null>;
  sceneRef: MutableRefObject<{ controls?: { enabled: boolean } | undefined }>;
  insideShipRef?: MutableRefObject<boolean>;
  /** When true, moon rotation drag and overlay-exit clicks are suppressed */
  orbitActiveRef?: MutableRefObject<boolean>;
}) => {
  const { mountRef, focusedMoonRef, isDraggingRef, lastPointerRef, sceneRef, insideShipRef, orbitActiveRef } =
    params;

  const buildRotationHandlers = useCallback(
    (args: {
      raycaster: THREE.Raycaster;
      pointer: THREE.Vector2;
      camera: THREE.Camera;
    }) =>
      createFocusedMoonRotationHandlers({
        mountRef,
        focusedMoonRef,
        isDraggingRef,
        lastPointerRef,
        sceneRef,
        raycaster: args.raycaster,
        pointer: args.pointer,
        camera: args.camera,
        orbitActiveRef,
      }),
    [mountRef, focusedMoonRef, isDraggingRef, lastPointerRef, sceneRef, orbitActiveRef],
  );

  const buildPointerHandlers = useCallback(
    (args: {
      camera: THREE.Camera;
      raycaster: THREE.Raycaster;
      pointer: THREE.Vector2;
      clickablePlanets: THREE.Object3D[];
      overlayClickables: THREE.Object3D[];
      handleNavigation: (target: string) => void | Promise<void>;
      resumeData: any;
      exitFocusedMoon: () => void;
      vlog: (message: string) => void;
      starDestroyerRef?: MutableRefObject<THREE.Group | null>;
      onStarDestroyerClick?: () => void;
      insideShipRef?: MutableRefObject<boolean>;
    }) =>
      createPointerInteractionHandlers({
        mountRef,
        camera: args.camera,
        raycaster: args.raycaster,
        pointer: args.pointer,
        clickablePlanets: args.clickablePlanets,
        overlayClickables: args.overlayClickables,
        handleNavigation: args.handleNavigation,
        resumeData: args.resumeData,
        exitFocusedMoon: args.exitFocusedMoon,
        vlog: args.vlog,
        starDestroyerRef: args.starDestroyerRef,
        onStarDestroyerClick: args.onStarDestroyerClick,
        insideShipRef: args.insideShipRef ?? insideShipRef,
        orbitActiveRef,
        focusedMoonRef,
      }),
    [focusedMoonRef, insideShipRef, mountRef, orbitActiveRef],
  );

  return { buildRotationHandlers, buildPointerHandlers };
};
