/**
 * Type definitions for navigation, waypoints, and targeting
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

/**
 * Navigation target type - either a section (planet) or moon
 */
export type NavigationTargetType =
  | "section"
  | "moon"
  | "planet"
  | "overview"
  | "custom";

/**
 * Navigation target with metadata for quick navigation
 */
export interface NavigationTarget {
  id: string;
  label?: string;
  name?: string;
  type: NavigationTargetType;
  icon?: string;
  position?: THREE.Vector3;
  startPosition?: THREE.Vector3;
  distance?: number;
  eta?: number;
  useTurbo?: boolean;
}

/**
 * Active navigation state
 */
export interface NavigationState {
  id: string | null;
  currentTarget?: string | null;
  type: NavigationTargetType | null;
  targetType?: NavigationTargetType | null;
  position: THREE.Vector3 | null;
  targetPosition?: THREE.Vector3 | null;
  startPosition: THREE.Vector3 | null;
  startTime: number;
  distance?: number | null;
  eta?: number | null;
  useTurbo: boolean;
  isNavigating?: boolean;
  lastUpdateFrame?: number;
  turboLogged?: boolean;
  decelerationLogged?: boolean;
}

/**
 * Tour progress state
 */
export interface TourProgress {
  current: number;
  total: number;
  currentWaypointIndex?: number;
  totalWaypoints?: number;
  isPlaying?: boolean;
  completedWaypoints?: number[];
}
