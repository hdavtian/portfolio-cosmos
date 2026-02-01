/**
 * Cosmos Module - Barrel Export
 *
 * Main export file for the cosmos 3D space visualization module.
 */

// Main component
export { CosmosSpace, default as default } from "./CosmosSpace";
export type { CosmosSpaceProps } from "./CosmosSpace";

// Contexts
export { SpaceProvider } from "./context/SpaceProvider";
export { useSpaceContext } from "./context/SpaceContext";
export { useNavigationContext } from "./context/NavigationContext";

// Components (when needed)
export { SpaceCanvas } from "./components/SpaceCanvas";
export { SpaceOverlays } from "./components/SpaceOverlays";
export { SpaceScene } from "./components/SpaceScene";

// Types
export type { NavigationState, NavigationTarget } from "./types/navigation";
export type { SceneRef } from "./types/scene";
