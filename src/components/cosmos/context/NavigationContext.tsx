/**
 * NavigationContext.tsx
 *
 * Context provider for navigation state, tour management, and waypoint tracking.
 * Provides global access to navigation targets, tour progress, and journey state.
 */

import React, { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { NavigationState, NavigationTarget, TourProgress } from "../types";

export interface NavigationWaypoint {
  id: string;
  name: string;
  targetType: "planet" | "moon" | "overview" | "custom";
  targetName: string;
  position?: { x: number; y: number; z: number };
  duration?: number;
  narration?: string;
  contentSection?: string;
}

export interface TourDefinition {
  id: string;
  name: string;
  description: string;
  waypoints: NavigationWaypoint[];
  autoAdvance?: boolean;
  waypointDelay?: number;
}

export interface NavigationContextValue {
  // Current navigation state
  navigationState: NavigationState | null;
  isNavigating: boolean;

  // Navigation control
  navigateTo: (target: NavigationTarget) => void;
  clearNavigation: () => void;
  updateNavigationProgress: (progress: Partial<NavigationState>) => void;

  // Tour management
  activeTour: TourDefinition | null;
  tourProgress: TourProgress | null;
  startTour: (tour: TourDefinition) => void;
  stopTour: () => void;
  nextWaypoint: () => void;
  previousWaypoint: () => void;
  goToWaypoint: (index: number) => void;

  // Tour state
  isTourActive: boolean;
  currentWaypointIndex: number;
  totalWaypoints: number;

  // Manual flight mode
  isManualFlightMode: boolean;
  setManualFlightMode: (enabled: boolean) => void;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(
  undefined,
);

export interface NavigationContextProviderProps {
  children: ReactNode;
}

export const NavigationContextProvider: React.FC<
  NavigationContextProviderProps
> = ({ children }) => {
  const [navigationState, setNavigationState] =
    useState<NavigationState | null>(null);
  const [activeTour, setActiveTour] = useState<TourDefinition | null>(null);
  const [tourProgress, setTourProgress] = useState<TourProgress | null>(null);
  const [isManualFlightMode, setIsManualFlightMode] = useState(false);

  const navigateTo = useCallback((target: NavigationTarget) => {
    setNavigationState({
      id: target.id,
      currentTarget: target.name || target.label,
      type: target.type,
      targetType: target.type,
      position: target.position || null,
      targetPosition: target.position || null,
      startPosition: null,
      startTime: Date.now(),
      distance: target.distance || 0,
      eta: target.eta || 0,
      isNavigating: true,
      useTurbo: target.useTurbo || false,
    });
  }, []);

  const clearNavigation = useCallback(() => {
    setNavigationState(null);
  }, []);

  const updateNavigationProgress = useCallback(
    (progress: Partial<NavigationState>) => {
      setNavigationState((prev) => {
        if (!prev) return null;
        return { ...prev, ...progress };
      });
    },
    [],
  );

  const startTour = useCallback(
    (tour: TourDefinition) => {
      setActiveTour(tour);
      setTourProgress({
        current: 0,
        total: tour.waypoints.length,
        currentWaypointIndex: 0,
        totalWaypoints: tour.waypoints.length,
        isPlaying: true,
        completedWaypoints: [],
      } as TourProgress);

      // Navigate to first waypoint
      const firstWaypoint = tour.waypoints[0];
      if (firstWaypoint) {
        navigateTo({
          id: firstWaypoint.id,
          name: firstWaypoint.targetName,
          type: firstWaypoint.targetType as any,
          position: firstWaypoint.position
            ? ({
                x: firstWaypoint.position.x,
                y: firstWaypoint.position.y,
                z: firstWaypoint.position.z,
              } as any)
            : undefined,
        });
      }
    },
    [navigateTo],
  );

  const stopTour = useCallback(() => {
    setActiveTour(null);
    setTourProgress(null);
    clearNavigation();
  }, [clearNavigation]);

  const nextWaypoint = useCallback(() => {
    if (!activeTour || !tourProgress) return;

    const nextIndex = (tourProgress.currentWaypointIndex || 0) + 1;
    if (nextIndex >= activeTour.waypoints.length) {
      // Tour complete
      stopTour();
      return;
    }

    const waypoint = activeTour.waypoints[nextIndex];
    setTourProgress((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        currentWaypointIndex: nextIndex,
        completedWaypoints: [
          ...(prev.completedWaypoints || []),
          tourProgress.currentWaypointIndex || 0,
        ],
      };
    });

    navigateTo({
      id: waypoint.id,
      name: waypoint.targetName,
      type: waypoint.targetType as any,
    });
  }, [activeTour, tourProgress, navigateTo, stopTour]);

  const previousWaypoint = useCallback(() => {
    if (!activeTour || !tourProgress || (tourProgress.currentWaypointIndex || 0) === 0)
      return;

    const prevIndex = (tourProgress.currentWaypointIndex || 1) - 1;
    const waypoint = activeTour.waypoints[prevIndex];

    setTourProgress((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        currentWaypointIndex: prevIndex,
        completedWaypoints: (prev.completedWaypoints || []).filter(
          (idx: number) => idx !== prevIndex,
        ),
      };
    });

    navigateTo({
      id: waypoint.id,
      name: waypoint.targetName,
      type: waypoint.targetType as any,
    });
  }, [activeTour, tourProgress, navigateTo]);

  const goToWaypoint = useCallback(
    (index: number) => {
      if (
        !activeTour ||
        !tourProgress ||
        index < 0 ||
        index >= activeTour.waypoints.length
      )
        return;

      const waypoint = activeTour.waypoints[index];
      setTourProgress((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentWaypointIndex: index,
        };
      });

      navigateTo({
        id: waypoint.id || '',
        name: waypoint.targetName,
        type: waypoint.targetType,
      });
    },
    [activeTour, tourProgress, navigateTo],
  );

  const setManualFlightMode = useCallback(
    (enabled: boolean) => {
      setIsManualFlightMode(enabled);
      if (enabled) {
        // Clear any active navigation when entering manual flight
        clearNavigation();
      }
    },
    [clearNavigation],
  );

  const value: NavigationContextValue = {
    navigationState,
    isNavigating: navigationState?.isNavigating || false,
    navigateTo,
    clearNavigation,
    updateNavigationProgress,
    activeTour,
    tourProgress,
    startTour,
    stopTour,
    nextWaypoint,
    previousWaypoint,
    goToWaypoint,
    isTourActive: activeTour !== null,
    currentWaypointIndex: tourProgress?.currentWaypointIndex || 0,
    totalWaypoints: activeTour?.waypoints.length || 0,
    isManualFlightMode,
    setManualFlightMode,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

// Custom hook for consuming context
export const useNavigationContext = (): NavigationContextValue => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error(
      "useNavigationContext must be used within NavigationContextProvider",
    );
  }
  return context;
};
