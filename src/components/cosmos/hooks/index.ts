/**
 * Hooks - Export all custom React hooks
 */

export { useThreeScene } from "./useThreeScene";
export { useOrbitalMechanics } from "./useOrbitalMechanics";
export { useSpaceshipControls } from "./useSpaceshipControls";
export { useInteraction } from "./useInteraction";
export { useSpaceNavigation } from "./useSpaceNavigation";
export { useLogger } from "./useLogger";

export type { ThreeSceneOptions, ThreeSceneResult } from "./useThreeScene";
export type {
  OrbitalMechanicsOptions,
  OrbitalMechanicsResult,
} from "./useOrbitalMechanics";
export type {
  SpaceshipControlsOptions,
  SpaceshipControlsResult,
} from "./useSpaceshipControls";
export type { InteractionOptions, InteractionResult } from "./useInteraction";
export type {
  NavigationState,
  SpaceNavigationResult,
} from "./useSpaceNavigation";
export type { LoggerOptions, LoggerResult } from "./useLogger";
