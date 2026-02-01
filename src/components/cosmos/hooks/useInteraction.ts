/**
 * useInteraction - Hook for raycasting and pointer interaction
 * Wraps InteractionSystem
 */

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { InteractionSystem } from "../systems/InteractionSystem";
import type { HoverConfig, ClickResult } from "../systems/InteractionSystem";

export interface InteractionOptions {
  enabled?: boolean;
  hoverConfig?: Partial<HoverConfig>;
}

export interface InteractionResult {
  handlePointerMove: (event: MouseEvent) => THREE.Object3D | null;
  handleClick: (event: MouseEvent) => ClickResult;
  checkOverlayClick: (event: MouseEvent) => boolean;
  clearHover: () => void;
  getHoveredObject: () => THREE.Object3D | null;
}

/**
 * Manage pointer interactions with 3D objects
 */
export function useInteraction(
  containerRef: React.RefObject<HTMLDivElement>,
  camera: THREE.Camera | null,
  clickableObjects: THREE.Object3D[],
  overlayObjects: THREE.Object3D[],
  options: InteractionOptions = {},
): InteractionResult {
  const systemRef = useRef<InteractionSystem | null>(null);
  const { enabled = true, hoverConfig } = options;

  // Initialize system
  if (!systemRef.current) {
    systemRef.current = new InteractionSystem(hoverConfig);
  }

  // Handle pointer move
  const handlePointerMove = useCallback(
    (event: MouseEvent): THREE.Object3D | null => {
      if (!systemRef.current || !containerRef.current || !camera || !enabled) {
        return null;
      }

      systemRef.current.updatePointer(event, containerRef.current);
      return systemRef.current.handleHover(camera, clickableObjects);
    },
    [containerRef, camera, clickableObjects, enabled],
  );

  // Handle click
  const handleClick = useCallback(
    (event: MouseEvent): ClickResult => {
      if (!systemRef.current || !containerRef.current || !camera || !enabled) {
        return { hit: false };
      }

      systemRef.current.updatePointer(event, containerRef.current);
      return systemRef.current.handleClick(camera, clickableObjects);
    },
    [containerRef, camera, clickableObjects, enabled],
  );

  // Check overlay click
  const checkOverlayClick = useCallback(
    (event: MouseEvent): boolean => {
      if (!systemRef.current || !containerRef.current || !camera || !enabled) {
        return false;
      }

      systemRef.current.updatePointer(event, containerRef.current);
      return systemRef.current.checkOverlayClick(camera, overlayObjects);
    },
    [containerRef, camera, overlayObjects, enabled],
  );

  // Clear hover
  const clearHover = useCallback(() => {
    systemRef.current?.clearHoveredObject();
  }, []);

  // Get hovered object
  const getHoveredObject = useCallback(() => {
    return systemRef.current?.getHoveredObject() || null;
  }, []);

  // Setup event listeners
  useEffect(() => {
    if (!containerRef.current || !enabled) return;

    const container = containerRef.current;

    const onPointerMove = (event: MouseEvent) => {
      handlePointerMove(event);
    };

    const onClick = (event: MouseEvent) => {
      handleClick(event);
    };

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("click", onClick);

    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("click", onClick);
    };
  }, [containerRef, enabled, handlePointerMove, handleClick]);

  return {
    handlePointerMove,
    handleClick,
    checkOverlayClick,
    clearHover,
    getHoveredObject,
  };
}
