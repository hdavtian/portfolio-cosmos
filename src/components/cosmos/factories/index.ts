/**
 * Factories - Export all factory functions
 */

export { createLabel, type LabelConfig } from "./createLabel";

export {
  createOrbitPath,
  getOrbitColorForPlanet,
  getOrbitColorForMoon,
  type OrbitPathConfig,
} from "./createOrbitPath";

export {
  createBackgroundStarfield,
  createPointStarfield,
  createLayeredStarfield,
  type StarfieldConfig,
  type LayeredStarfieldConfig,
} from "./createStarfield";

export {
  createAmbientLight,
  createSunLight,
  createFillLight,
  createLightingSetup,
  type AmbientLightConfig,
  type PointLightConfig,
  type LightingSetupConfig,
  type LightingSetup,
} from "./createLighting";

export {
  createDetailTexture,
  createTitleOverlay,
  createBulletOverlay,
  type OverlayTextureOptions,
  type TitleOverlayConfig,
  type BulletOverlayConfig,
} from "./createOverlay";
