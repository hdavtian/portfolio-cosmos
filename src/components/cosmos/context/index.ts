/**
 * Context Index
 *
 * Centralized exports for all context providers and hooks.
 */

// SpaceContext
export {
  SpaceContextProvider,
  useSpaceContext,
  type SpaceContextValue,
  type SpaceSceneOptions,
  type SpaceContextProviderProps,
} from "./SpaceContext";

// NavigationContext
export {
  NavigationContextProvider,
  useNavigationContext,
  type NavigationContextValue,
  type NavigationWaypoint,
  type TourDefinition,
  type NavigationContextProviderProps,
} from "./NavigationContext";

// Combined Provider
export { SpaceProvider, type SpaceProviderProps } from "./SpaceProvider";
