/**
 * useSpaceNavigation - Hook for managing navigation state and targeting
 */

import { useState, useRef, useCallback } from "react";
import * as THREE from "three";
import type { NavigationTarget } from "../types";

export interface NavigationState {
  currentTarget: string | null;
  targetType: "section" | "moon" | null;
  targetPosition: THREE.Vector3 | null;
  startPosition: THREE.Vector3 | null;
  startTime: number;
  distance: number | null;
  eta: number | null;
  useTurbo: boolean;
  isNavigating: boolean;
}

export interface SpaceNavigationResult {
  navigationState: NavigationState;
  navigateTo: (target: NavigationTarget) => void;
  updateNavigation: (currentPos: THREE.Vector3, speed: number) => void;
  clearNavigation: () => void;
  isNavigating: () => boolean;
}

/**
 * Manage navigation state and targeting
 */
export function useSpaceNavigation(): SpaceNavigationResult {
  const [currentTarget, setCurrentTarget] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [eta, setEta] = useState<number | null>(null);

  const navigationRef = useRef<{
    id: string | null;
    type: "section" | "moon" | null;
    position: THREE.Vector3 | null;
    startPosition: THREE.Vector3 | null;
    startTime: number;
    useTurbo: boolean;
  }>({
    id: null,
    type: null,
    position: null,
    startPosition: null,
    startTime: 0,
    useTurbo: false,
  });

  // Navigate to target
  const navigateTo = useCallback((target: NavigationTarget) => {
    navigationRef.current = {
      id: target.id,
      type: target.type as any,
      position: target.position?.clone() || null,
      startPosition: target.startPosition?.clone() || null,
      startTime: Date.now(),
      useTurbo: target.useTurbo ?? false,
    };

    setCurrentTarget(target.id);

    console.log(
      `🎯 Navigation started: ${target.id} (${target.type})${target.useTurbo ? " [TURBO]" : ""}`,
    );
  }, []);

  // Update navigation (call in animation loop)
  const updateNavigation = useCallback(
    (currentPos: THREE.Vector3, speed: number) => {
      const nav = navigationRef.current;

      if (!nav.position) {
        setDistance(null);
        setEta(null);
        return;
      }

      const dist = currentPos.distanceTo(nav.position);
      setDistance(dist);

      // Calculate ETA (rough estimate)
      if (speed > 0) {
        const etaSeconds = dist / speed;
        setEta(etaSeconds);
      } else {
        setEta(null);
      }
    },
    [],
  );

  // Clear navigation
  const clearNavigation = useCallback(() => {
    navigationRef.current = {
      id: null,
      type: null,
      position: null,
      startPosition: null,
      startTime: 0,
      useTurbo: false,
    };
    setCurrentTarget(null);
    setDistance(null);
    setEta(null);

    console.log("🔄 Navigation cleared");
  }, []);

  // Check if navigating
  const isNavigating = useCallback(() => {
    return navigationRef.current.id !== null;
  }, []);

  const navigationState: NavigationState = {
    currentTarget,
    targetType: navigationRef.current.type,
    targetPosition: navigationRef.current.position,
    startPosition: navigationRef.current.startPosition,
    startTime: navigationRef.current.startTime,
    distance,
    eta,
    useTurbo: navigationRef.current.useTurbo,
    isNavigating: currentTarget !== null,
  };

  return {
    navigationState,
    navigateTo,
    updateNavigation,
    clearNavigation,
    isNavigating,
  };
}
