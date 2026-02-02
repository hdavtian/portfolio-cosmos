import type { MutableRefObject, RefObject } from "react";
import { useCallback } from "react";
import * as THREE from "three";
import type { OverlayContent } from "../../CosmicContentOverlay";
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
}) => {
  const { mountRef, focusedMoonRef, isDraggingRef, lastPointerRef, sceneRef } =
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
      }),
    [mountRef, focusedMoonRef, isDraggingRef, lastPointerRef, sceneRef],
  );

  const buildPointerHandlers = useCallback(
    (args: {
      camera: THREE.Camera;
      raycaster: THREE.Raycaster;
      pointer: THREE.Vector2;
      clickablePlanets: THREE.Object3D[];
      overlayClickables: THREE.Object3D[];
      handleNavigation: (target: string) => void | Promise<void>;
      handleExperienceCompanyNavigation: (
        companyId: string,
      ) => void | Promise<void>;
      resumeData: any;
      setContentLoading: React.Dispatch<React.SetStateAction<boolean>>;
      setOverlayContent: React.Dispatch<
        React.SetStateAction<OverlayContent | null>
      >;
      exitFocusedMoon: () => void;
      vlog: (message: string) => void;
    }) =>
      createPointerInteractionHandlers({
        mountRef,
        camera: args.camera,
        raycaster: args.raycaster,
        pointer: args.pointer,
        clickablePlanets: args.clickablePlanets,
        overlayClickables: args.overlayClickables,
        handleNavigation: args.handleNavigation,
        handleExperienceCompanyNavigation:
          args.handleExperienceCompanyNavigation,
        resumeData: args.resumeData,
        setContentLoading: args.setContentLoading,
        setOverlayContent: args.setOverlayContent,
        exitFocusedMoon: args.exitFocusedMoon,
        vlog: args.vlog,
      }),
    [mountRef],
  );

  return { buildRotationHandlers, buildPointerHandlers };
};
