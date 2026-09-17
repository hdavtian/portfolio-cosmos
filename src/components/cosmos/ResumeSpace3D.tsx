import type CameraControls from "camera-controls";
import gsap from "gsap";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import ThreeGlobe from "three-globe";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import aboutDeck from "../../data/aboutDeck.json";
import type { AboutPathTravelMessage, TechStackTreeNode } from "../../lib/api/contentV2";
import {
  CareerGallery,
  type CareerGalleryFocusInfo,
} from "./careerGallery/CareerGallery";
import {
  applyGalleryExteriorControls,
  applyGalleryInteriorControls,
  attachGalleryDolly,
  captureGalleryControls,
  collectPortfolioGalleryItems,
  lookFromToward,
  restoreGalleryControls,
  runGalleryEntryGlide,
  type GalleryControlsSnapshot,
} from "./careerGallery/careerGalleryCamera";
import CareerGalleryTitleCard from "./careerGallery/CareerGalleryTitleCard";
import { FalconLaserBursts } from "./careerGallery/falconLaserBursts";
import { GalleryShroud } from "./careerGallery/galleryShroud";
import {
  createHeatHazePass,
  ShipRimLight,
} from "./careerGallery/falconHeatAndRim";
import {
  LabelVisibilityManager,
  type BoxOccluder,
  type SphereOccluder,
} from "./labelVisibility";
import { StarDestroyerMoments } from "./starDestroyerMoments";
import { SunEnhancements, type SunOccluder } from "./celestial/SunEnhancements";
import { ImpactFlash } from "./aboutJourney/impactFlash";
// SD configurator (removable: delete sdConfigurator/ and lines marked "SD configurator")
import {
  SdFlyoverConfigurator,
  recordSdIntroView,
  writeSdConfiguratorOpen,
} from "./sdConfigurator/SdFlyoverConfigurator";
// Universe backdrop (removable: delete universeBackdrop/ and lines marked "Universe backdrop")
import {
  UniverseBackdrop,
  createBlackHoleLensPass,
  readStoredUniverseStyle,
  writeStoredUniverseStyle,
  type UniverseStyle,
} from "./universeBackdrop/UniverseBackdrop";
import resumeData from "../../data/resume.json";
import { trackEvent } from "../../lib/analytics";
import { IS_DEBUG, IS_DEBUG_OVERLAYS, dlog, dwarn } from "../../lib/debugLog";
import CosmosLoader from "../CosmosLoader";
import {
  DEFAULT_CONTROL_SENSITIVITY,
  DEFAULT_MOON_VISIT_DURATION,
  DEFAULT_SPACESHIP_PATH_SPEED,
  DEFAULT_ZOOM_EXIT_THRESHOLD,
} from "./ResumeSpace3D.constants";
import {
  attachMultiNoteOverlaysFactory,
  createDetailTexture,
  createLabel,
  createLighting,
  createPlanetFactory,
  createStarfieldMeshes,
  createSunGlowTexture,
  createSunMesh,
} from "./ResumeSpace3D.factories";
import { type OrbitAnchor, type OrbitItem } from "./ResumeSpace3D.orbital";
import {
  freezeSystemForMoon,
  type FrozenSystemState,
} from "./ResumeSpace3D.systemFreeze";
import type { ResumeSpace3DProps, SceneRef } from "./ResumeSpace3D.types";
// Import our new cosmic systems
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { OverlayContent } from "../CosmicContentOverlay";
import {
  COSMIC_AUDIO_TRACKS,
  CosmicTourGuide,
  CosmosCameraDirector,
  NavigationInterface,
  type NavigationWaypoint,
} from "../CosmicNavigation";
import {
  TourDefinitionBuilder,
  type PlanetData,
} from "../TourDefinitionBuilder";
import CockpitNavPanel from "../ui/CockpitNavPanel";
import CosmicMiniMap3D from "../ui/CosmicMiniMap3D";
import {
  clearOnScreenTelemetry,
  onScreenMessage,
  setOnScreenTelemetry,
} from "../ui/onScreenMessaging";
import ShipControlBar, { type ShipUIPhase } from "../ui/ShipControlBar";
import ShipTerminal, { type ShipTerminalToolAction } from "../ui/ShipTerminal";
import SpaceshipHUD from "../ui/SpaceshipHUD";
import UserOnScreenMessages from "../ui/UserOnScreenMessages";
import {
  HologramDroneDisplay,
  type DroneAudioBuffers,
  type DroneVisualVariant,
} from "./HologramDroneDisplay";
// CockpitHologramPanels kept for potential future use
import { getOrbitalPositionEmitter } from "../OrbitalPositionEmitter";
import { StarDestroyerCruiser } from "../StarDestroyerCruiser";
import {
  AboutJourneyController,
  AboutJourneyPhase,
  type AboutTravelCameraMode,
} from "./aboutJourney/AboutJourneyController";
import AboutJourneyDebugPanel from "./aboutJourney/AboutJourneyDebugPanel";
import {
  createAboutParticleSwarm,
  type AboutParticleSwarmHandle,
} from "./aboutJourney/AboutParticleSwarm";
import { MjolnirRider } from "./aboutJourney/MjolnirRider";
import {
  legacyLoopLength,
  type RouteObstacle,
  type RouteStop,
} from "./aboutJourney/cosmicRoute";
import {
  COSMOS_SOUND_EVENT_IDS,
  DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN,
  KEYBOARD_STUDIO_ENABLED_KEY,
  loadBindings,
  loadPanelLayout,
  loadPresets,
  normalizeSoundDesign,
  onCosmosSoundEvent,
  saveBindings,
  saveBooleanStorage,
  savePanelLayout,
  savePresets,
  type KeyboardRecordedNoteEvent,
  type KeyboardStudioEventBinding,
  type KeyboardStudioPanelLayout,
  type KeyboardStudioPreset,
  type KeyboardStudioSoundDesign,
} from "./audio/keyboardStudioBindings";
import { createKeyboardStudioEngine } from "./audio/keyboardStudioEngine";
import {
  attachAudioListenerToCamera,
  createPositionalAudio,
  playPositionalOneShot,
} from "./audio/threeAudioUtils";
import { subscribeCosmosEvent } from "./cosmosEventBus";
import DebugZoneOverlay from "./DebugZoneOverlay";
import { useCosmosLogs } from "./hooks/useCosmosLogs";
import { useCosmosOptions } from "./hooks/useCosmosOptions";
import { useKeyboardControls } from "./hooks/useKeyboardControls";
import { useMoonOrbit, type OrbitPhase } from "./hooks/useMoonOrbit";
import {
  useNavigationSystem,
  type NavigationTravelPhase,
} from "./hooks/useNavigationSystem";
import { useOrbitSystem } from "./hooks/useOrbitSystem";
import { usePointerInteractions } from "./hooks/usePointerInteractions";
import { useRenderLoop } from "./hooks/useRenderLoop";
import { useThreeScene } from "./hooks/useThreeScene";
import {
  INTRO_CAMERA_FINAL_POS,
  INTRO_CAMERA_FINAL_TARGET,
  createIntroSequenceRunner,
} from "./introSequence";
import MoonOrbitHtmlLayout from "./MoonOrbitHtmlLayout";
import { buildMoonPortfolioPayload } from "./moonPortfolioSelector";
import {
  buildPortfolioRegistryModel,
  type PortfolioCoreView,
  type PortfolioGroupView,
} from "./portfolioData";
import { createMoonFocusController } from "./ResumeSpace3D.focusController";
import {
  CINE_DURATION_DIVISOR,
  CONTROLS_MAX_DIST,
  EXPERIENCE_ORBIT,
  EXPERIENCE_RADIUS,
  EXP_FOCUS_DIST,
  EXP_MOON_ORBIT_BASE,
  EXP_MOON_ORBIT_STEP,
  EXP_MOON_RADIUS,
  EXP_WANDER_RADIUS,
  FALCON_INITIAL_POS,
  FALCON_SCALE,
  FOLLOW_DISTANCE,
  FOLLOW_HEIGHT,
  NEAR_DEFAULT,
  NEAR_OVERVIEW,
  PROJ_WANDER_RADIUS,
  SD_CONE_LENGTH,
  SD_CONE_RADIUS,
  SD_INITIAL_POS,
  SD_SCALE,
  SKILLS_FOCUS_DIST,
  SKILLS_WANDER_RADIUS,
  SUN_GLOW_SPRITE_SIZE,
  SUN_OBSTACLE_RADIUS,
  SUN_WANDER_RADIUS,
  orbitDebug,
} from "./scaleConfig";
import { TargetPreviewTVPanel } from "./TargetPreviewTVPanel";

// Extend window for logging timestamps
declare global {
  interface Window {
    lastAutopilotLog?: number;
  }
}

type ShipLabelTarget =
  | "front"
  | "rear"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "cockpit";

type ShipLabelInfo = { name: string; uuid: string };
type ShipLabelMark = {
  label: ShipLabelTarget;
  meshName: string;
  meshUuid: string;
  localPoint: [number, number, number];
};

const ABOUT_MEMORY_SQUARE_NAV_ID = "memory-squares";
const ORBITAL_PORTFOLIO_NAV_ID = "orbital-portfolio";
const ORBITAL_PORTFOLIO_LAYER = 4;
const ORBITAL_PORTFOLIO_DEBUG_LOGS = true;
const ORBITAL_PORTFOLIO_NONFOCUS_PLATE_OPACITY = 0.74;
const ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS = 5;
const ORBITAL_PORTFOLIO_CARD_MAX_THUMBS = 6;
const ORBITAL_PORTFOLIO_STATION_ORBIT_SPEED = 0.16;
const ORBITAL_PORTFOLIO_INSPECT_DEFAULT_DISTANCE = 148;
const ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE = 70;
const ORBITAL_PORTFOLIO_INSPECT_ZOOM_OUT_MULTIPLIER = 1.05;
// Quick flip between drone visuals for moon visits.
const MOON_VISIT_DRONE_VARIANT: DroneVisualVariant = "oblivion";
// Temporary diagnostic switch: disable drone entry calls to isolate orbit pauses.
const DISABLE_MOON_DRONE_ENTRY_FOR_TEST = false;
const SOUND_SLIDER_TICKS_ID = "sound-slider-ticks";
const ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE = 280;
const ORBITAL_PORTFOLIO_INSPECT_EXIT_MIN_DISTANCE = 58;
const ORBITAL_PORTFOLIO_INSPECT_EXIT_MAX_DISTANCE = 320;
const ORBITAL_PORTFOLIO_INSPECT_EXIT_TARGET_DRIFT = 220;
const ORBITAL_PORTFOLIO_INSPECT_EXIT_GRACE_MS = 900;
const ORBITAL_PORTFOLIO_STATE_DEBUG_LOGS = true;
const MOON_TRAVEL_SIGN_MAX_ACTIVE = 28;
/** Memory text textures kept for reuse; oldest unused ones are freed beyond this. */
const MOON_TRAVEL_SIGN_TEXTURE_CACHE_MAX = 48;
/** A memory closer than this to the camera plane (in front or behind) has passed the viewer. */
const MOON_TRAVEL_SIGN_PASSED_VIEWER_DIST = 4;
const MOON_ORBIT_SIGN_DEBUG_LOGS = false;
// Card layer stays on the overlay pass to avoid bloom/tonemapping washout.
const PROJECT_SHOWCASE_CARD_LAYER = 1;
const SKILLS_LATTICE_LAYER = 3;
const EXPERIENCE_END_CAMERA_POSITION = new THREE.Vector3(
  11281.3,
  -534.0,
  1301.6,
);
const EXPERIENCE_END_CAMERA_TARGET = new THREE.Vector3(11970.8, -828.9, -116.5);

// Perf experiment: `?placeholders=true` swaps the ship and drone GLTFs for
// simple primitives, to isolate model cost from code cost.
const PLACEHOLDER_MODELS: boolean = (() => {
  if (typeof window === "undefined") return false;
  try {
    return (
      new URLSearchParams(window.location.search).get("placeholders") ===
      "true"
    );
  } catch {
    return false;
  }
})();

// The Millennium Falcon (falcon2) is the default ship; `?ship=bronco` flies a
// 1989 Ford Bronco instead.
const SHIP_VARIANT: string | null = (() => {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("ship");
  } catch {
    return null;
  }
})();

const SHIP_VARIANT_MODEL_PATHS: Record<string, string> = {
  bronco: "/models/bronco/ford_bronco_1989.glb",
  falcon2: "/models/falcon2/falcon2.glb",
};
const SHIP_MODEL_PATH =
  (SHIP_VARIANT && SHIP_VARIANT_MODEL_PATHS[SHIP_VARIANT]) ||
  SHIP_VARIANT_MODEL_PATHS.falcon2;

const loadVehicleAsShip = async (loader: GLTFLoader, path: string) => {
  const gltf = await loader.loadAsync(path);
  // Fit the model to the Falcon's model-space footprint (~14 units) and center
  // it so the Falcon's scale, cockpit offsets and follow camera still work.
  const vehicle = gltf.scene;
  const box = new THREE.Box3().setFromObject(vehicle);
  const size = box.getSize(new THREE.Vector3());
  vehicle.scale.setScalar(14 / Math.max(size.x, size.y, size.z, 0.0001));
  box.setFromObject(vehicle);
  vehicle.position.sub(box.getCenter(new THREE.Vector3()));
  capEmissiveIntensity(vehicle);
  // The ship is always in flight here; hide any modeled landing gear
  // (e.g. the falcon2 model's "Landing Gear Legs" node). GLTFLoader
  // sanitizes node names, turning spaces into underscores.
  vehicle.traverse((obj) => {
    if (/landing[\s_]*gear/i.test(obj.name)) obj.visible = false;
  });

  // The falcon2 hull's emissive map is black except the rear engine grille, so
  // the material's emissive intensity brightens just the engines. Find where
  // the grille is too (vertices whose UVs fall in its texture rectangle) so
  // glow sprites can sit right on it.
  const engineGlowMaterials = new Set<THREE.MeshStandardMaterial>();
  const enginePoints: THREE.Vector3[] = [];
  vehicle.updateMatrixWorld(true);
  vehicle.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      const mat = material as THREE.MeshStandardMaterial;
      if (mat.isMeshStandardMaterial && mat.emissiveMap) engineGlowMaterials.add(mat);
    });
    const uv = mesh.geometry.getAttribute("uv");
    const position = mesh.geometry.getAttribute("position");
    if (!uv || !position) return;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (
        u >= ENGINE_GRILLE_UV.minU &&
        u <= ENGINE_GRILLE_UV.maxU &&
        v >= ENGINE_GRILLE_UV.minV &&
        v <= ENGINE_GRILLE_UV.maxV
      ) {
        enginePoints.push(
          new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld),
        );
      }
    }
  });

  const scene = new THREE.Group();
  scene.add(vehicle);
  scene.userData.engineGlowMaterials = Array.from(engineGlowMaterials).map((material) => ({
    material,
    baseIntensity: material.emissiveIntensity,
  }));
  // Evenly spaced samples across the grille, left to right.
  enginePoints.sort((a, b) => a.x - b.x);
  const sampleCount = Math.min(ENGINE_GLOW_SPRITE_COUNT, enginePoints.length);
  scene.userData.engineGlowPoints = Array.from({ length: sampleCount }, (_, i) =>
    enginePoints[
      Math.round((i * (enginePoints.length - 1)) / Math.max(1, sampleCount - 1))
    ].clone(),
  );
  return { ...gltf, scene };
};

/** Texture rectangle of the falcon2 engine grille (and the strips below it). */
const ENGINE_GRILLE_UV = { minU: 0.465, maxU: 0.87, minV: 0.805, maxV: 0.885 };
const ENGINE_GLOW_SPRITE_COUNT = 9;

// Some exports author very high emissive strength (e.g. 8× via
// KHR_materials_emissive_strength), which the scene's bloom turns into a
// white-out. Cap it so glow details stay readable.
const MAX_IMPORTED_EMISSIVE_INTENSITY = 1.2;
function capEmissiveIntensity(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach((material) => {
      const mat = material as THREE.MeshStandardMaterial;
      if (
        typeof mat.emissiveIntensity === "number" &&
        mat.emissiveIntensity > MAX_IMPORTED_EMISSIVE_INTENSITY
      ) {
        mat.emissiveIntensity = MAX_IMPORTED_EMISSIVE_INTENSITY;
      }
    });
  });
}

// Moon-visit drone model (the Death Star). HologramDroneDisplay normalizes
// whatever model it gets to drone size.
const DRONE_MODEL_PATH = "/models/deathstar/deathstar.glb";
/** Rides the About cosmic rail and smashes it at the end of the ride. */
const MJOLNIR_MODEL_PATH = "/models/mjolnir/mjolnir.glb";

// Self-illumination for drone models that read too dark in moon orbit. A
// real light attached to the drone would change the scene's light count each
// visit and recompile every lit shader (a measured multi-hundred-ms stall), so
// light the surface from its own color texture instead. Kept low: at 0.6 it
// washed out all shading and the Death Star looked flat.
const DRONE_SELF_ILLUMINATION = 0.18;

/**
 * Shading for the drone model, injected into its standard material: a fixed
 * key light from the upper front right (in view space), a tight specular
 * shine and a cool rim, so the sphere reads as a lit, round, metallic object.
 * No scene light is added (that would recompile every lit shader).
 */
const applyDroneShine = (material: THREE.MeshStandardMaterial) => {
  material.metalness = Math.max(material.metalness, 0.35);
  material.roughness = Math.min(material.roughness, 0.55);
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      /* glsl */ `
        vec3 dsNormal = normalize( normal );
        vec3 dsView = normalize( vViewPosition );
        vec3 dsLight = normalize( vec3( 0.55, 0.65, 0.52 ) );
        float dsDiffuse = max( dot( dsNormal, dsLight ), 0.0 );
        vec3 dsHalf = normalize( dsLight + dsView );
        float dsSpecular = pow( max( dot( dsNormal, dsHalf ), 0.0 ), 48.0 );
        float dsRim = pow( 1.0 - max( dot( dsNormal, dsView ), 0.0 ), 3.0 );
        outgoingLight = outgoingLight * ( 0.45 + 0.95 * dsDiffuse )
          + diffuseColor.rgb * dsDiffuse * 0.35
          + vec3( dsSpecular * 0.6 )
          + vec3( 0.55, 0.7, 1.0 ) * dsRim * 0.3;
        #include <opaque_fragment>
      `,
    );
  };
  material.customProgramCacheKey = () => "drone-shine-v1";
  material.needsUpdate = true;
};

const loadDroneVariant = async (loader: GLTFLoader, path: string) => {
  const gltf = await loader.loadAsync(path);
  capEmissiveIntensity(gltf.scene);
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach((material) => {
      const mat = material as THREE.MeshStandardMaterial;
      // Replaces any authored glow mask too: the Death Star's hull material
      // ships with a (mostly dark) emissive map, which kept it unlit.
      if (!mat.isMeshStandardMaterial) return;
      applyDroneShine(mat);
      if (!mat.map) return;
      mat.emissive = new THREE.Color(0xffffff);
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = DRONE_SELF_ILLUMINATION;
    });
  });
  return gltf;
};

const buildFalconPlaceholder = (): THREE.Group => {
  // Roughly the Falcon's model-space footprint (x ±6.7, z ±7.3); front is +Z.
  const scene = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3ad,
    metalness: 0.4,
    roughness: 0.6,
  });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(13.4, 2.4, 13), hullMat);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 4), hullMat);
  cockpit.position.set(-6.05, 1.2, 6.5);
  const engineMat = new THREE.MeshStandardMaterial({
    color: 0x1a2a44,
    emissive: new THREE.Color(0x4aa8ff),
    emissiveIntensity: 1.2,
  });
  const engine = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 0.4), engineMat);
  engine.position.set(0, 0, -6.7);
  scene.add(hull, cockpit, engine);
  return scene;
};

const buildDronePlaceholder = (): THREE.Group => {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0xd8dde3,
      metalness: 0.3,
      roughness: 0.5,
    }),
  );
  const eye = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshStandardMaterial({
      color: 0x220000,
      emissive: new THREE.Color(0xff3322),
      emissiveIntensity: 1.5,
    }),
  );
  eye.position.set(0, 0, 0.45);
  scene.add(body, eye);
  return scene;
};
const OBLIVION_DRONE_AUDIO_PATHS = {
  activation: "/models/oblivion-drone/199938__drzhnn__01-activation.wav",
  transmission:
    "/models/oblivion-drone/199939__drzhnn__08-data-transmission.wav",
  movement: [
    "/models/oblivion-drone/199941__drzhnn__06-blip.wav",
    "/models/oblivion-drone/199942__drzhnn__05-klaxon.wav",
    "/models/oblivion-drone/199940__drzhnn__07-confirmation.wav",
    "/models/oblivion-drone/199935__drzhnn__04-blip.wav",
  ],
} as const;
const FALCON_NAV_SFX_PATHS = {
  moonTravel: [
    "/audio/falcon/moon-travel-1.m4a",
    "/audio/falcon/moon-travel-2.m4a",
  ],
  speedOfLight: "/audio/falcon/speed-of-light.m4a",
  changeOfDirection: "/audio/falcon/change-of-direction.m4a",
  override: "/audio/falcon/override.m4a",
} as const;
type FalconNavCueKind = keyof typeof FALCON_NAV_SFX_PATHS;
const FALCON_MOON_TRAVEL_DEFAULT_VOLUME = 0.68;
// Destinations are spread far apart and at very different heights (Y is up)
// so travel between them is long and climbs and dives. Experience stays on its
// orbit near the sun (the intro is framed on it); About is the farthest out
// and lowest. All stay within ~34k of the sun (skybox radius 45k).
const ORBITAL_PORTFOLIO_WORLD_ANCHOR = new THREE.Vector3(-3500, -7600, 28000);
const ORBITAL_PORTFOLIO_NEAR_ANCHOR_DIST = 620;
const ORBITAL_PORTFOLIO_NAV_STANDOFF_DIST = 560;
const ORBITAL_PORTFOLIO_NAV_VERTICAL_OFFSET = 90;
const ORBITAL_PORTFOLIO_CORE_LABEL_MAX_DISTANCE = 7600;
const ENABLE_POST_LOAD_COSMOS_MICRO_INTRO = false;
const CAMERA_TRACE_ENABLED = true;
const SKILLS_LATTICE_NAV_ID = "skills-lattice";
// High above the sun's plane, ~29.5k out.
const SKILLS_LATTICE_WORLD_ANCHOR = new THREE.Vector3(21000, 8600, -18900);
// Career Gallery: hologram shell of portfolio screenshots. High up in the open
// (-x) side of the universe, ~28.6k from the sun.
const CAREER_GALLERY_NAV_ID = "career-gallery";
const CAREER_GALLERY_NAV_LABEL = "Career Gallery";
const CAREER_GALLERY_WORLD_ANCHOR = new THREE.Vector3(-26600, 6500, 8400);
// Twice the Skills shell (396). The interior's density comes from its 320
// faces (see CareerGallery.ts), not from the radius.
const CAREER_GALLERY_RADIUS = 792;
const CAREER_GALLERY_NAV_STANDOFF_DIST = CAREER_GALLERY_RADIUS + 1300;
const CAREER_GALLERY_ARRIVAL_DIST = CAREER_GALLERY_RADIUS + 600;
const CAREER_GALLERY_ENTRY_TRIGGER_DIST = CAREER_GALLERY_RADIUS + 1900;
const CAREER_GALLERY_ENTRY_GLIDE_MS = 5000;
/**
 * Inside the gallery the viewpoint drifts slowly off-center on a gentle loop
 * (this share of the radius), so tiles at different distances shift against
 * each other: motion parallax is what makes the space feel deep.
 */
const CAREER_GALLERY_DRIFT_RADII = 0.3;
const CAREER_GALLERY_DRIFT_RAMP_S = 4;
/**
 * Outside the gallery the Falcon sits bottom-left, close to the camera, rear
 * toward us: offset in the camera's frame (x right, y up, z ahead).
 */
/**
 * The Career Gallery interior (glide inside, look around) is kept but turned
 * off: the outside view is the experience. Flip to bring back "Enter Gallery".
 */
const CAREER_GALLERY_INTERIOR_ENABLED = false;
// Close enough that most of the ship runs off the bottom-left corner.
const CAREER_GALLERY_SHIP_OFFSET = new THREE.Vector3(-0.64, -0.38, 1.1);
/** Heat haze strength behind the parked Falcon's engines. */
const CAREER_GALLERY_HEAT_STRENGTH = 0.22;
/** Its two cannons, in ship model space (front is +Z; fitted to ~14 long). */
const CAREER_GALLERY_SHIP_MUZZLES = [
  new THREE.Vector3(0, 0.9, 7.5),
  new THREE.Vector3(0, -0.9, 7.5),
];
const ABOUT_MEMORY_SQUARE_WORLD_ANCHOR = new THREE.Vector3(-12000, 520, -13200);
/**
 * The About ride's bottom control panel (speed arrows, camera toggles,
 * momentum bar, hints) and its arrow-key/pointer input. Off: the ride is
 * started by grabbing Mjolnir and runs on its own to the end.
 */
const ABOUT_TRAM_HUD_ENABLED = false;
/** Gap the About roller coaster keeps from Experience moons' surfaces. */
const ABOUT_ROUTE_MOON_CLEARANCE = 110;
// About: the farthest destination from the sun (~33.9k) and well below it.
const ABOUT_PARTICLE_SWARM_WORLD_ANCHOR = new THREE.Vector3(24500, -11700, 20300);
const ABOUT_MEMORY_SQUARE_NAV_STANDOFF_DIST = 4200;
const ABOUT_MEMORY_SQUARE_ENTRY_TRIGGER_DIST = 4550;
/** Tighter CameraControls distance limits while the about journey allows free look (keeps points visible). */
const ABOUT_JOURNEY_CAM_MIN_DIST = 280;
const ABOUT_JOURNEY_CAM_MAX_DIST = 7200;
const ABOUT_MEMORY_SQUARE_CAMERA_STOP_DIST = 3900;
const ABOUT_CELL_GRID_DIVISIONS = 14;
const ABOUT_CELL_BACK_GRID_DIVISIONS = 6;
const ABOUT_SWARM_ASSEMBLED_HOLD_MS = 2800;
const ABOUT_SWARM_BREAKOUT_MS = 1900;
const ABOUT_SWARM_MIN_MS = 10000;
const ABOUT_SWARM_MAX_MS = 20000;
const ABOUT_SWARM_REFORM_MS = 2600;
const ABOUT_SWARM_SETTLE_MS = 1150;
const ABOUT_BREAK_IMPULSE = 120;
const ABOUT_REFORM_STIFFNESS = 8.8;
const ABOUT_REFORM_DAMPING = 0.86;
const ABOUT_SPIN_MAX = 0.9;
const ABOUT_SWARM_DISTANCE_GATE = 28000;
const SKILLS_LATTICE_ARRIVAL_DIST = 900;
const SKILLS_LATTICE_TONE_MOTIFS_HZ: number[][] = [
  [392.0, 440.0, 349.23, 349.23, 261.63],
  [261.63, 329.63, 392.0, 349.23, 293.66],
  [293.66, 349.23, 392.0, 329.63, 261.63],
];
const SKILLS_LATTICE_TONE_NOTE_DURATION_MS = 430;
const SKILLS_LATTICE_TONE_NOTE_STEP_MS = 610;
const SKILLS_LATTICE_TONE_PHRASE_PAUSE_MS = 2100;
const SKILLS_LATTICE_TONE_MASTER_GAIN = 0.09;
const SKILLS_LATTICE_TONE_PHRASE_PAUSE_MAX_MS = 60000;
type SkillsLatticeTonePreset = {
  id: string;
  label: string;
  description: string;
  mainType: OscillatorType;
  layerType: OscillatorType;
  layerRatio: number;
  layerDetune: number;
  mainGain: number;
  layerGain: number;
  filterType: BiquadFilterType;
  filterMul: number;
  filterMin: number;
  filterMax: number;
  filterQ: number;
  attackSec: number;
  decaySec: number;
  sustain: number;
  releaseSec: number;
  outputTrim: number;
  accentColor: number;
};
const SKILLS_LATTICE_TONE_PRESETS: SkillsLatticeTonePreset[] = [
  {
    id: "celestial-pad",
    label: "Celestial Pad",
    description: "Warm cinematic pad with airy tail.",
    mainType: "triangle",
    layerType: "sine",
    layerRatio: 0.5,
    layerDetune: 4,
    mainGain: 0.82,
    layerGain: 0.46,
    filterType: "lowpass",
    filterMul: 5.4,
    filterMin: 900,
    filterMax: 3200,
    filterQ: 0.85,
    attackSec: 0.026,
    decaySec: 0.11,
    sustain: 0.62,
    releaseSec: 0.22,
    outputTrim: 0.95,
    accentColor: 0xc18bff,
  },
  {
    id: "glass-bell",
    label: "Glass Bell",
    description: "Bright crystalline bell, spacey shimmer.",
    mainType: "sine",
    layerType: "triangle",
    layerRatio: 2,
    layerDetune: 7,
    mainGain: 0.72,
    layerGain: 0.38,
    filterType: "bandpass",
    filterMul: 4.6,
    filterMin: 760,
    filterMax: 3600,
    filterQ: 1.35,
    attackSec: 0.01,
    decaySec: 0.09,
    sustain: 0.42,
    releaseSec: 0.32,
    outputTrim: 0.88,
    accentColor: 0x8fe3ff,
  },
  {
    id: "analog-choir",
    label: "Analog Choir",
    description: "Vintage synth-choir, gentle and emotive.",
    mainType: "sawtooth",
    layerType: "triangle",
    layerRatio: 1.005,
    layerDetune: -6,
    mainGain: 0.54,
    layerGain: 0.46,
    filterType: "lowpass",
    filterMul: 3.8,
    filterMin: 700,
    filterMax: 2500,
    filterQ: 0.9,
    attackSec: 0.03,
    decaySec: 0.13,
    sustain: 0.58,
    releaseSec: 0.24,
    outputTrim: 0.8,
    accentColor: 0x9dffd5,
  },
  {
    id: "hollow-reed",
    label: "Hollow Reed",
    description: "Mystic reed-like tone with darker body.",
    mainType: "triangle",
    layerType: "sawtooth",
    layerRatio: 1.5,
    layerDetune: 2,
    mainGain: 0.75,
    layerGain: 0.28,
    filterType: "lowpass",
    filterMul: 3.1,
    filterMin: 620,
    filterMax: 2200,
    filterQ: 0.72,
    attackSec: 0.02,
    decaySec: 0.12,
    sustain: 0.56,
    releaseSec: 0.26,
    outputTrim: 0.82,
    accentColor: 0xffcc8f,
  },
  {
    id: "cosmic-chime",
    label: "Cosmic Chime",
    description: "Soft digital chime with glassy upper shimmer.",
    mainType: "sine",
    layerType: "square",
    layerRatio: 2.01,
    layerDetune: -3,
    mainGain: 0.84,
    layerGain: 0.18,
    filterType: "highpass",
    filterMul: 2.8,
    filterMin: 520,
    filterMax: 2400,
    filterQ: 0.95,
    attackSec: 0.008,
    decaySec: 0.085,
    sustain: 0.34,
    releaseSec: 0.36,
    outputTrim: 0.8,
    accentColor: 0xa5f7ff,
  },
  {
    id: "deep-drone-flute",
    label: "Deep Drone Flute",
    description: "Breathy low flute tone with sci-fi body.",
    mainType: "triangle",
    layerType: "sine",
    layerRatio: 0.25,
    layerDetune: 2,
    mainGain: 0.74,
    layerGain: 0.48,
    filterType: "lowpass",
    filterMul: 2.4,
    filterMin: 500,
    filterMax: 1700,
    filterQ: 0.7,
    attackSec: 0.03,
    decaySec: 0.14,
    sustain: 0.66,
    releaseSec: 0.42,
    outputTrim: 0.78,
    accentColor: 0x90b3ff,
  },
  {
    id: "starlight-pluck",
    label: "Starlight Pluck",
    description: "Short plucky synth with quick sparkle.",
    mainType: "square",
    layerType: "triangle",
    layerRatio: 1.5,
    layerDetune: 5,
    mainGain: 0.62,
    layerGain: 0.34,
    filterType: "bandpass",
    filterMul: 5.2,
    filterMin: 900,
    filterMax: 3600,
    filterQ: 1.1,
    attackSec: 0.006,
    decaySec: 0.07,
    sustain: 0.24,
    releaseSec: 0.22,
    outputTrim: 0.74,
    accentColor: 0xff9fdd,
  },
];
const resolveSkillsLatticeTonePreset = (id: string): SkillsLatticeTonePreset =>
  SKILLS_LATTICE_TONE_PRESETS.find((preset) => preset.id === id) ??
  SKILLS_LATTICE_TONE_PRESETS[0];
const FAST_TRACK_TARGET: string | null = (() => {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("fastTrack");
  } catch {
    return null;
  }
})();
type KeyboardPianoKey = {
  note: string;
  midi: number;
  isBlack: boolean;
  leftUnit: number;
};
const ONSCREEN_KEYBOARD_ROOT_MIDI = 48; // C3
const ONSCREEN_KEYBOARD_KEY_COUNT = 36; // C3..B5
const ONSCREEN_KEYBOARD_MIN_DURATION_MS = 30;
const ONSCREEN_KEYBOARD_DEFAULT_VELOCITY = 0.82;
const ONSCREEN_KEYBOARD_WHITE_KEY_COUNT = 21;
const KEYBOARD_STUDIO_COMPUTER_KEY_CODES = [
  "KeyZ",
  "KeyS",
  "KeyX",
  "KeyD",
  "KeyC",
  "KeyV",
  "KeyG",
  "KeyB",
  "KeyH",
  "KeyN",
  "KeyJ",
  "KeyM",
  "KeyQ",
  "Digit2",
  "KeyW",
  "Digit3",
  "KeyE",
  "KeyR",
  "Digit5",
  "KeyT",
  "Digit6",
  "KeyY",
  "Digit7",
  "KeyU",
  "KeyI",
  "Digit9",
  "KeyO",
  "Digit0",
  "KeyP",
  "BracketLeft",
  "Equal",
  "BracketRight",
  "Backslash",
  "Semicolon",
  "Quote",
  "Slash",
] as const;
const KEYBOARD_STUDIO_DEFAULT_LAYOUT: KeyboardStudioPanelLayout = {
  x: 18,
  y: 0,
  collapsed: false,
  lastOpen: Date.now(),
};
const KEYBOARD_STUDIO_SETTINGS_SLOTS_KEY = "keyboardStudio.settingsSlots";
const KEYBOARD_STUDIO_DEFAULT_DEMO_EVENTS: KeyboardRecordedNoteEvent[] = [
  { note: "C4", startMs: 0, durationMs: 460, velocity: 0.82 },
  { note: "E4", startMs: 340, durationMs: 480, velocity: 0.82 },
  { note: "G4", startMs: 700, durationMs: 520, velocity: 0.84 },
  { note: "B4", startMs: 1060, durationMs: 600, velocity: 0.78 },
  { note: "C5", startMs: 1640, durationMs: 710, velocity: 0.86 },
  { note: "A4", startMs: 2430, durationMs: 460, velocity: 0.78 },
  { note: "G4", startMs: 2820, durationMs: 460, velocity: 0.76 },
  { note: "D4", startMs: 3200, durationMs: 580, velocity: 0.8 },
];
const makeKeyboardStudioFactoryPreset = (
  id: string,
  name: string,
  soundDesign: Partial<KeyboardStudioSoundDesign>,
  events: KeyboardRecordedNoteEvent[] = KEYBOARD_STUDIO_DEFAULT_DEMO_EVENTS,
): KeyboardStudioPreset => {
  const now = new Date().toISOString();
  return {
    id,
    name,
    source: id,
    createdAt: now,
    updatedAt: now,
    events,
    soundDesign: normalizeSoundDesign(soundDesign),
  };
};
const KEYBOARD_STUDIO_FACTORY_PRESETS: KeyboardStudioPreset[] = [
  makeKeyboardStudioFactoryPreset("factory-nebula-keys", "Nebula Keys", {
    attack: 0.012,
    decay: 0.18,
    sustain: 0.45,
    release: 0.6,
    filterCutoff: 2200,
    drive: 0.1,
    chorusDepth: 0.38,
    delayFeedback: 0.32,
    reverbMix: 0.26,
    outputGainDb: -10,
    velocityCurve: 0.95,
    oscillatorType: "triangle8",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-cinematic-bell", "Cinematic Bell", {
    attack: 0.004,
    decay: 0.38,
    sustain: 0.28,
    release: 1.25,
    filterCutoff: 5200,
    drive: 0.05,
    chorusDepth: 0.14,
    delayFeedback: 0.24,
    reverbDecay: 4.3,
    reverbMix: 0.35,
    stereoWidth: 0.62,
    outputGainDb: -12,
    oscillatorType: "sine4",
    filterType: "bandpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-synth-pluck", "Synth Pluck", {
    attack: 0.002,
    decay: 0.09,
    sustain: 0.14,
    release: 0.3,
    filterCutoff: 3000,
    filterQ: 1.6,
    drive: 0.22,
    chorusDepth: 0.16,
    delayTime: 0.12,
    delayFeedback: 0.18,
    reverbMix: 0.12,
    outputGainDb: -11.5,
    velocityCurve: 1.2,
    oscillatorType: "square6",
    filterType: "bandpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-solar-winds", "Solar Winds", {
    attack: 0.08,
    decay: 0.32,
    sustain: 0.72,
    release: 2.2,
    filterCutoff: 1400,
    filterQ: 0.7,
    drive: 0.04,
    chorusDepth: 0.55,
    chorusRate: 0.34,
    delayTime: 0.28,
    delayFeedback: 0.44,
    reverbDecay: 6.8,
    reverbMix: 0.54,
    stereoWidth: 0.86,
    outputGainDb: -13.5,
    velocityCurve: 0.88,
    oscillatorType: "sine8",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-aurora-pad", "Aurora Pad", {
    attack: 0.045,
    decay: 0.24,
    sustain: 0.64,
    release: 1.6,
    filterCutoff: 1900,
    chorusDepth: 0.42,
    delayFeedback: 0.28,
    reverbMix: 0.32,
    stereoWidth: 0.74,
    outputGainDb: -11.8,
    oscillatorType: "triangle4",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-ion-spark", "Ion Spark", {
    attack: 0.002,
    decay: 0.06,
    sustain: 0.1,
    release: 0.22,
    filterCutoff: 6100,
    filterQ: 1.9,
    drive: 0.26,
    chorusDepth: 0.11,
    delayTime: 0.08,
    delayFeedback: 0.14,
    reverbMix: 0.08,
    outputGainDb: -12.4,
    velocityCurve: 1.38,
    oscillatorType: "sawtooth8",
    filterType: "highpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-cosmic-choir", "Cosmic Choir", {
    attack: 0.03,
    decay: 0.29,
    sustain: 0.58,
    release: 1.45,
    filterCutoff: 2400,
    drive: 0.08,
    chorusDepth: 0.36,
    delayTime: 0.22,
    delayFeedback: 0.29,
    reverbDecay: 5.2,
    reverbMix: 0.42,
    stereoWidth: 0.7,
    outputGainDb: -12,
    oscillatorType: "sine8",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-deep-pulse", "Deep Pulse", {
    attack: 0.004,
    decay: 0.12,
    sustain: 0.22,
    release: 0.38,
    filterCutoff: 980,
    filterQ: 1.3,
    drive: 0.33,
    chorusDepth: 0.09,
    delayFeedback: 0.11,
    reverbMix: 0.08,
    outputGainDb: -10.5,
    velocityCurve: 1.25,
    oscillatorType: "square8",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-glass-orbit", "Glass Orbit", {
    attack: 0.006,
    decay: 0.2,
    sustain: 0.24,
    release: 1.4,
    filterCutoff: 7000,
    filterQ: 1.1,
    drive: 0.02,
    chorusDepth: 0.26,
    delayTime: 0.31,
    delayFeedback: 0.36,
    reverbDecay: 4.8,
    reverbMix: 0.46,
    stereoWidth: 0.82,
    outputGainDb: -13,
    oscillatorType: "sine2",
    filterType: "bandpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-neutron-pluck", "Neutron Pluck", {
    attack: 0.001,
    decay: 0.05,
    sustain: 0.08,
    release: 0.18,
    filterCutoff: 4200,
    filterQ: 2.2,
    drive: 0.37,
    chorusDepth: 0.08,
    delayTime: 0.09,
    delayFeedback: 0.1,
    reverbMix: 0.06,
    outputGainDb: -12.5,
    velocityCurve: 1.48,
    oscillatorType: "square4",
    filterType: "highpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-dream-keys", "Dream Keys", {
    attack: 0.02,
    decay: 0.16,
    sustain: 0.43,
    release: 0.74,
    filterCutoff: 2800,
    drive: 0.09,
    chorusDepth: 0.28,
    delayTime: 0.17,
    delayFeedback: 0.24,
    reverbMix: 0.24,
    stereoWidth: 0.56,
    outputGainDb: -11.2,
    oscillatorType: "triangle16",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-sunrise-lead", "Sunrise Lead", {
    attack: 0.007,
    decay: 0.12,
    sustain: 0.31,
    release: 0.42,
    filterCutoff: 3600,
    filterQ: 1.4,
    drive: 0.24,
    chorusDepth: 0.18,
    chorusRate: 1.2,
    delayTime: 0.14,
    delayFeedback: 0.21,
    reverbMix: 0.15,
    outputGainDb: -10.8,
    oscillatorType: "sawtooth12",
    filterType: "bandpass",
  }),
  makeKeyboardStudioFactoryPreset(
    "factory-voyager-ambient",
    "Voyager Ambient",
    {
      attack: 0.09,
      decay: 0.4,
      sustain: 0.76,
      release: 2.8,
      filterCutoff: 1200,
      drive: 0.03,
      chorusDepth: 0.52,
      chorusRate: 0.26,
      delayTime: 0.34,
      delayFeedback: 0.5,
      reverbDecay: 8.2,
      reverbMix: 0.62,
      stereoWidth: 0.92,
      outputGainDb: -14,
      oscillatorType: "sine16",
      filterType: "lowpass",
    },
  ),
  makeKeyboardStudioFactoryPreset("factory-grand-piano", "Grand Piano", {
    attack: 0.002,
    decay: 0.24,
    sustain: 0.35,
    release: 0.56,
    filterCutoff: 4600,
    drive: 0.06,
    chorusDepth: 0.05,
    reverbMix: 0.16,
    outputGainDb: -10.8,
    oscillatorType: "triangle2",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-electric-piano", "Electric Piano", {
    attack: 0.006,
    decay: 0.16,
    sustain: 0.44,
    release: 0.68,
    filterCutoff: 3800,
    drive: 0.12,
    chorusDepth: 0.22,
    delayFeedback: 0.16,
    reverbMix: 0.2,
    outputGainDb: -10.6,
    oscillatorType: "sine2",
    filterType: "bandpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-organ", "Organ", {
    attack: 0.005,
    decay: 0.1,
    sustain: 0.82,
    release: 0.42,
    filterCutoff: 2800,
    drive: 0.14,
    chorusDepth: 0.18,
    reverbMix: 0.18,
    outputGainDb: -11.4,
    oscillatorType: "square2",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-violin", "Violin", {
    attack: 0.045,
    decay: 0.22,
    sustain: 0.61,
    release: 0.88,
    filterCutoff: 3400,
    chorusDepth: 0.25,
    reverbMix: 0.27,
    outputGainDb: -12.2,
    oscillatorType: "sawtooth3",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-flute", "Flute", {
    attack: 0.02,
    decay: 0.18,
    sustain: 0.57,
    release: 0.7,
    filterCutoff: 5200,
    drive: 0.03,
    chorusDepth: 0.14,
    reverbMix: 0.24,
    outputGainDb: -12.8,
    oscillatorType: "sine1",
    filterType: "bandpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-guitar", "Guitar", {
    attack: 0.003,
    decay: 0.14,
    sustain: 0.29,
    release: 0.38,
    filterCutoff: 4200,
    drive: 0.19,
    chorusDepth: 0.1,
    reverbMix: 0.12,
    outputGainDb: -11.2,
    oscillatorType: "triangle4",
    filterType: "bandpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-sitar", "Sitar (Exotic)", {
    attack: 0.002,
    decay: 0.22,
    sustain: 0.2,
    release: 0.46,
    filterCutoff: 5600,
    filterQ: 2.4,
    drive: 0.18,
    chorusDepth: 0.08,
    reverbMix: 0.18,
    outputGainDb: -12.4,
    oscillatorType: "sawtooth4",
    filterType: "highpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-kalimba", "Kalimba (Exotic)", {
    attack: 0.001,
    decay: 0.19,
    sustain: 0.15,
    release: 0.8,
    filterCutoff: 6500,
    drive: 0.04,
    chorusDepth: 0.09,
    delayFeedback: 0.26,
    reverbMix: 0.3,
    outputGainDb: -13.1,
    oscillatorType: "triangle2",
    filterType: "highpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-drum-kit", "Drum Kit", {
    attack: 0.001,
    decay: 0.05,
    sustain: 0.05,
    release: 0.12,
    filterCutoff: 2900,
    filterQ: 1.9,
    drive: 0.42,
    chorusDepth: 0.04,
    reverbMix: 0.08,
    outputGainDb: -9.8,
    velocityCurve: 1.4,
    oscillatorType: "square16",
    filterType: "highpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-808-kick", "808 Kick", {
    attack: 0.001,
    decay: 0.11,
    sustain: 0.02,
    release: 0.2,
    filterCutoff: 700,
    filterQ: 1.1,
    drive: 0.5,
    chorusDepth: 0,
    reverbMix: 0.03,
    outputGainDb: -8.6,
    velocityCurve: 1.45,
    oscillatorType: "sine32",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset(
    "factory-cinematic-chords",
    "Cinematic Chords",
    {
      attack: 0.04,
      decay: 0.28,
      sustain: 0.66,
      release: 1.4,
      filterCutoff: 2100,
      drive: 0.08,
      chorusDepth: 0.31,
      delayFeedback: 0.24,
      reverbMix: 0.38,
      stereoWidth: 0.78,
      outputGainDb: -12.5,
      oscillatorType: "triangle8",
      filterType: "lowpass",
    },
  ),
  makeKeyboardStudioFactoryPreset("factory-laser-zap", "Laser Zap (SFX)", {
    attack: 0.001,
    decay: 0.04,
    sustain: 0.02,
    release: 0.09,
    filterCutoff: 7600,
    filterQ: 2.8,
    drive: 0.36,
    chorusDepth: 0.05,
    delayFeedback: 0.06,
    reverbMix: 0.05,
    outputGainDb: -10.4,
    velocityCurve: 1.55,
    oscillatorType: "sawtooth16",
    filterType: "highpass",
  }),
  makeKeyboardStudioFactoryPreset("factory-impact-boom", "Impact Boom (SFX)", {
    attack: 0.001,
    decay: 0.2,
    sustain: 0.08,
    release: 0.4,
    filterCutoff: 900,
    drive: 0.44,
    chorusDepth: 0,
    reverbMix: 0.12,
    outputGainDb: -9.7,
    velocityCurve: 1.35,
    oscillatorType: "square32",
    filterType: "lowpass",
  }),
  makeKeyboardStudioFactoryPreset(
    "factory-spaceship-console",
    "Spaceship Console",
    {
      attack: 0.002,
      decay: 0.07,
      sustain: 0.12,
      release: 0.24,
      filterCutoff: 4800,
      filterQ: 2.2,
      drive: 0.22,
      chorusDepth: 0.18,
      delayFeedback: 0.2,
      reverbMix: 0.14,
      outputGainDb: -11.7,
      oscillatorType: "square8",
      filterType: "bandpass",
    },
  ),
  makeKeyboardStudioFactoryPreset(
    "factory-hyperdrive-whine",
    "Hyperdrive Whine",
    {
      attack: 0.035,
      decay: 0.24,
      sustain: 0.54,
      release: 1.1,
      filterCutoff: 3100,
      filterQ: 1.5,
      drive: 0.17,
      chorusDepth: 0.41,
      delayFeedback: 0.36,
      reverbMix: 0.45,
      stereoWidth: 0.88,
      outputGainDb: -13.4,
      oscillatorType: "sawtooth20",
      filterType: "bandpass",
    },
  ),
];
const KEYBOARD_STUDIO_BEAT_PATTERNS = {
  pulse: [
    { note: "C3", startMs: 0, durationMs: 160, velocity: 0.95 },
    { note: "G3", startMs: 260, durationMs: 130, velocity: 0.66 },
    { note: "C3", startMs: 520, durationMs: 160, velocity: 0.92 },
    { note: "G3", startMs: 780, durationMs: 130, velocity: 0.66 },
    { note: "C3", startMs: 1040, durationMs: 170, velocity: 0.97 },
    { note: "A#3", startMs: 1320, durationMs: 140, velocity: 0.62 },
  ],
  orbit: [
    { note: "C3", startMs: 0, durationMs: 130, velocity: 0.88 },
    { note: "D#3", startMs: 180, durationMs: 110, velocity: 0.72 },
    { note: "G3", startMs: 380, durationMs: 120, velocity: 0.76 },
    { note: "D#3", startMs: 560, durationMs: 110, velocity: 0.7 },
    { note: "C3", startMs: 760, durationMs: 130, velocity: 0.9 },
    { note: "A#3", startMs: 930, durationMs: 110, velocity: 0.66 },
    { note: "G3", startMs: 1140, durationMs: 130, velocity: 0.72 },
    { note: "F3", startMs: 1330, durationMs: 110, velocity: 0.64 },
  ],
  cinematic: [
    { note: "C3", startMs: 0, durationMs: 210, velocity: 0.94 },
    { note: "C4", startMs: 220, durationMs: 120, velocity: 0.58 },
    { note: "G3", startMs: 420, durationMs: 150, velocity: 0.7 },
    { note: "D#4", startMs: 620, durationMs: 110, velocity: 0.52 },
    { note: "C3", startMs: 860, durationMs: 220, velocity: 0.96 },
    { note: "A#3", startMs: 1120, durationMs: 150, velocity: 0.74 },
    { note: "G3", startMs: 1360, durationMs: 160, velocity: 0.72 },
  ],
} as const;
const ONSCREEN_KEYBOARD_SEMITONE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;
const buildOnscreenKeyboardKeys = (): KeyboardPianoKey[] => {
  const keys: KeyboardPianoKey[] = [];
  let whiteCursor = 0;
  for (let i = 0; i < ONSCREEN_KEYBOARD_KEY_COUNT; i += 1) {
    const midi = ONSCREEN_KEYBOARD_ROOT_MIDI + i;
    const semitone = midi % 12;
    const name = ONSCREEN_KEYBOARD_SEMITONE_NAMES[semitone] ?? "C";
    const octave = Math.floor(midi / 12) - 1;
    const isBlack = name.includes("#");
    const leftUnit = isBlack ? Math.max(whiteCursor - 0.34, 0) : whiteCursor;
    keys.push({
      note: `${name}${octave}`,
      midi,
      isBlack,
      leftUnit,
    });
    if (!isBlack) whiteCursor += 1;
  }
  return keys;
};
const SKILLS_LATTICE_NAV_STANDOFF_DIST = 1200;
const SKILLS_LATTICE_ENTRY_TRIGGER_DIST = 1800;
const SKILLS_SD_PATROL_RADIUS = 150;
const SKILLS_SD_PATROL_SPEED = 0.03;
/**
 * The Star Destroyer used to be parked circling Skills. It now only appears
 * in scripted moments (starDestroyerMoments.ts); flip to bring the hold back.
 */
const STAR_DESTROYER_SKILLS_HOLD = false;
/** Escort: the first lightspeed trip always gets one; later ones by chance. */
const STAR_DESTROYER_ESCORT_CHANCE = 0.3;
const STAR_DESTROYER_ESCORT_COOLDOWN_MS = 180_000;
/**
 * Fly-over start: after the intro Falcon reaches its hover, wait at least
 * this long, then until the camera has stopped turning (the intro keeps
 * panning while the ship settles) so the path is built from the final view.
 */
const STAR_DESTROYER_FLYOVER_MIN_DELAY_MS = 500;
/** Camera counts as settled below this turn rate (rad/s)… */
const STAR_DESTROYER_FLYOVER_SETTLED_TURN_RATE = 0.03;
/** …held for this long. */
const STAR_DESTROYER_FLYOVER_SETTLED_MS = 600;
/** Start anyway after this long, even if the camera never settles. */
const STAR_DESTROYER_FLYOVER_MAX_WAIT_MS = 15000;
type AboutExitConfirmIntent = {
  source: "quick" | "cockpit" | "experience";
  targetId: string;
  targetType: "section" | "moon";
};


const ABOUT_RETARGET_SHATTER_MS = 2600;
const ABOUT_CRYSTAL_DISPERSING_FADE_MS = 2400;
const ABOUT_DISPERSAL_SUN_PAN_MS = 2300;

// The ride paces messages evenly along the path; beyond this many they crowd.
const ABOUT_PATH_RIDE_MESSAGE_LIMIT = 18;

const DEFAULT_BACKGROUND_MUSIC_TRACK =
  Object.keys(COSMIC_AUDIO_TRACKS)[0] ?? "";
const EXPERIENCE_MOON_OVERLAY_TEXTURE_BY_JOB_ID: Record<string, string> = {
  investcloud: "/textures/custom-planet-textures/investcloud.jpg",
  rpa: "/textures/custom-planet-textures/texture4-rpa.jpg",
  boingo: "/textures/custom-planet-textures/boingo.jpg",
  "capital-group": "/textures/custom-planet-textures/capitalgroup.jpg",
  murad: "/textures/custom-planet-textures/murad.jpg",
  unitedlayer: "/textures/custom-planet-textures/unitedlayer.jpg",
  stormscape: "/textures/custom-planet-textures/stormscape.jpg",
};

const EXPERIENCE_MOON_BASE_TEXTURES: string[] = [
  "/textures/custom-planet-textures/2k_jupiter.jpg",
  "/textures/custom-planet-textures/2k_mars.jpg",
  "/textures/custom-planet-textures/2k_mercury.jpg",
  "/textures/custom-planet-textures/2k_neptune.jpg",
  "/textures/custom-planet-textures/2k_saturn.jpg",
  "/textures/custom-planet-textures/2k_venus_atmosphere.jpg",
  "/textures/custom-planet-textures/2k_venus_surface.jpg",
];

type OrbitalPortfolioStationRecord = {
  index: number;
  coreId: string;
  plainIndex: number;
  ringIndex: number;
  plainAngle: number;
  coreAnchorLocal: THREE.Vector3;
  plainNormalLocal: THREE.Vector3;
  group: THREE.Group;
  ring: THREE.Line;
  plate: THREE.Mesh;
  frame: THREE.Mesh;
  platePositionAttr: THREE.BufferAttribute;
  framePositionAttr: THREE.BufferAttribute;
  plateFlatPositions: Float32Array;
  plateCurvedPositions: Float32Array;
  frameFlatPositions: Float32Array;
  frameCurvedPositions: Float32Array;
  straightenBlend: number;
  label: THREE.Object3D;
  halo: THREE.Sprite;
  mediaHaloGroup: THREE.Group;
  variantSatelliteGroup: THREE.Group;
  impactSprite: THREE.Sprite;
  impactStartedAt: number;
  impactDurationMs: number;
  impactLocalPoint: THREE.Vector2;
  rippleAmplitude: number;
  rippleWavelength: number;
  rippleSpeed: number;
  rippleTravelMax: number;
  pulsePhase: number;
  textureScrollNorm: number;
  textureMaxOffsetY: number;
  textureFitMode: "contain" | "cover";
  cardTitleMesh: THREE.Mesh;
  cardVariantTabs: Array<{
    mesh: THREE.Mesh;
    frame: THREE.Mesh;
    variantIndex: number;
  }>;
  /** Arrows beside the tab row when a project has more client sites than tab slots. */
  cardVariantTabNavMeshes: Array<{
    mesh: THREE.Mesh;
    frame: THREE.Mesh;
    direction: "prev" | "next";
  }>;
  /** Index of the client site shown in the first tab slot. */
  variantTabPageStart: number;
  cardThumbMeshes: Array<{
    mesh: THREE.Mesh;
    frame: THREE.Mesh;
    mediaIndex: number;
  }>;
  cardThumbNavMeshes: Array<{
    mesh: THREE.Mesh;
    frame: THREE.Mesh;
    direction: "prev" | "next";
  }>;
  cardSlideNavMeshes: Array<{
    mesh: THREE.Mesh;
    frame: THREE.Mesh;
    direction: "prev" | "next";
  }>;
  orbitLane: 0 | 1;
  orbitAngle: number;
  orbitDirection: 1 | -1;
  orbitRadius: number;
  orbitVerticalAmp: number;
  orbitMotionBlend: number;
};

type OrbitalPortfolioMatterPacketRecord = {
  mesh: THREE.Sprite;
  progress: number;
  speed: number;
  sourceCoreIndex: number;
  targetStation: number;
  targetOffset: THREE.Vector2;
  willImpact: boolean;
  missOffset: THREE.Vector3;
  phase: number;
  startOffset: THREE.Vector3;
};

type OrbitalPortfolioCoreRecord = {
  id: string;
  title: string;
  centerLocal: THREE.Vector3;
  root: THREE.Group;
  nucleus: THREE.Mesh;
  glow: THREE.Mesh;
  sliceGroup: THREE.Group;
  sliceMats: THREE.MeshBasicMaterial[];
  rayMats: THREE.LineBasicMaterial[];
  panelMat: THREE.MeshPhongMaterial | null;
  panelColorAttr: THREE.BufferAttribute | null;
  panelBaseColors: Float32Array | null;
  outerOrbit: THREE.Line;
};

type MoonTravelSignRecord = {
  object: THREE.Object3D;
  material: THREE.Material;
  ageMs: number;
  ttlMs: number;
  memoryIndex: number;
  velocity: THREE.Vector3;
  baseScale: THREE.Vector3;
  arcStart?: THREE.Vector3;
  arcControl?: THREE.Vector3;
  arcEnd?: THREE.Vector3;
};

type JobMemoryType = "default" | "tech" | "code" | "memory";
type JobMemoryEntry = {
  text: string;
  type: JobMemoryType;
};

type OrbitSignTuning = {
  timeBetweenMessagesSec: number;
  continuousLoop: boolean;
  waitAfterStreamSec: number;
  travelSpeed: number;
  lightIntensity: number;
  startFontScale: number;
  endFontScale: number;
};

const buildCurvedPanelPositions = (
  flatPositions: Float32Array,
  width: number,
  arcRadians: number,
): Float32Array => {
  const curved = new Float32Array(flatPositions.length);
  curved.set(flatPositions);
  if (Math.abs(arcRadians) < 1e-4) return curved;
  const radius = width / arcRadians;
  for (let i = 0; i < curved.length; i += 3) {
    const x = flatPositions[i];
    const y = flatPositions[i + 1];
    const theta = x / radius;
    curved[i] = Math.sin(theta) * radius;
    curved[i + 1] = y;
    curved[i + 2] = radius * (1 - Math.cos(theta));
  }
  return curved;
};

const morphPanelGeometry = (
  attr: THREE.BufferAttribute,
  curved: Float32Array,
  flat: Float32Array,
  straightenBlend: number,
) => {
  const dest = attr.array as Float32Array;
  const curvedWeight = 1 - straightenBlend;
  for (let i = 0; i < dest.length; i += 1) {
    dest[i] = curved[i] * curvedWeight + flat[i] * straightenBlend;
  }
  attr.needsUpdate = true;
};

const applyTextureCoverTop = (
  texture: THREE.Texture,
  panelAspect: number,
  scrollNorm: number,
): number => {
  const image = texture.image as
    | { width?: number; height?: number }
    | undefined;
  const iw = image?.width ?? 0;
  const ih = image?.height ?? 0;
  if (iw <= 0 || ih <= 0 || panelAspect <= 0) return 0;
  const imageAspect = iw / ih;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  let repeatX = 1;
  let repeatY = 1;
  let offsetX = 0;
  let offsetY = 0;
  if (imageAspect > panelAspect) {
    // Wider image: crop equally left/right (centered).
    repeatX = panelAspect / imageAspect;
    offsetX = (1 - repeatX) * 0.5;
  } else if (imageAspect < panelAspect) {
    // Taller image: crop vertically, anchor at top; wheel can scroll down.
    repeatY = imageAspect / panelAspect;
    const maxOffsetY = Math.max(0, 1 - repeatY);
    const clampedScroll = THREE.MathUtils.clamp(scrollNorm, 0, 1);
    offsetY = maxOffsetY * (1 - clampedScroll);
  }
  texture.repeat.set(repeatX, repeatY);
  texture.offset.set(offsetX, offsetY);
  texture.needsUpdate = true;
  return Math.max(0, 1 - repeatY);
};

const applyTextureContainCentered = (
  texture: THREE.Texture,
  panelAspect: number,
) => {
  const image = texture.image as
    | { width?: number; height?: number }
    | undefined;
  const iw = image?.width ?? 0;
  const ih = image?.height ?? 0;
  if (iw <= 0 || ih <= 0 || panelAspect <= 0) return;
  const imageAspect = iw / ih;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  let repeatX = 1;
  let repeatY = 1;
  let offsetX = 0;
  let offsetY = 0;
  if (imageAspect > panelAspect) {
    // Contain (letterbox): preserve full width, pad top/bottom.
    repeatY = imageAspect / panelAspect;
    offsetY = (1 - repeatY) * 0.5;
  } else if (imageAspect < panelAspect) {
    // Contain (pillarbox): preserve full height, pad left/right.
    repeatX = panelAspect / imageAspect;
    offsetX = (1 - repeatX) * 0.5;
  }
  texture.repeat.set(repeatX, repeatY);
  texture.offset.set(offsetX, offsetY);
  texture.needsUpdate = true;
};

const applyTextureForFitMode = (
  texture: THREE.Texture,
  panelAspect: number,
  fitMode: "contain" | "cover" | undefined,
  scrollNorm = 0,
): number => {
  if (fitMode === "contain") {
    applyTextureContainCentered(texture, panelAspect);
    return 0;
  }
  return applyTextureCoverTop(texture, panelAspect, scrollNorm);
};

const createMoonTravelSignTexture = (
  entry: JobMemoryEntry,
): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  const text = String(entry?.text ?? "");
  const type = entry?.type ?? "default";
  const normalized = String(text ?? "")
    .replace(/\s*•\s*/g, " • ")
    .replace(/\s+/g, " ")
    .trim();
  const splitForLines = () => {
    if (normalized.length <= 48) return [normalized];
    const parts = normalized
      .split(" • ")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length <= 1) return [normalized];
    const half = Math.ceil(parts.length * 0.5);
    const lineA = parts.slice(0, half).join(" • ").trim();
    const lineB = parts.slice(half).join(" • ").trim();
    return [lineA, lineB].filter(Boolean);
  };
  const lines = splitForLines();
  canvas.width = 2048;
  canvas.height = lines.length > 1 ? 512 : 320;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fontSize = lines.length > 1 ? 84 : 98;
  const maxTextWidth = canvas.width * 0.9;
  while (fontSize > 52) {
    ctx.font = `700 ${fontSize}px Rajdhani, Segoe UI, sans-serif`;
    const widest = lines.reduce(
      (max, line) => Math.max(max, ctx.measureText(line).width),
      0,
    );
    if (widest <= maxTextWidth) break;
    fontSize -= 3;
  }
  const styleByType: Record<
    JobMemoryType,
    {
      fontFamily: string;
      weight: number;
      shadowColor: string;
      shadowBlur: number;
      strokeStyle: string;
      fillStyle: string;
      drawBackdrop: boolean;
      backdropFill?: string;
      backdropStroke?: string;
    }
  > = {
    default: {
      fontFamily: "Rajdhani, Segoe UI, sans-serif",
      weight: 700,
      shadowColor: "rgba(94, 214, 255, 0.55)",
      shadowBlur: 14,
      strokeStyle: "rgba(120, 196, 228, 0.86)",
      fillStyle: "rgba(200, 236, 248, 0.9)",
      drawBackdrop: false,
    },
    tech: {
      fontFamily: "Rajdhani, Segoe UI, sans-serif",
      weight: 700,
      shadowColor: "rgba(106, 220, 255, 0.62)",
      shadowBlur: 16,
      strokeStyle: "rgba(148, 226, 255, 0.92)",
      fillStyle: "rgba(220, 246, 255, 0.95)",
      drawBackdrop: false,
    },
    code: {
      fontFamily: "JetBrains Mono, Consolas, monospace",
      weight: 700,
      shadowColor: "rgba(255, 255, 255, 0.25)",
      shadowBlur: 8,
      strokeStyle: "rgba(245, 245, 245, 0.9)",
      fillStyle: "rgba(255, 255, 255, 0.98)",
      drawBackdrop: true,
      backdropFill: "rgba(8, 8, 10, 0.94)",
      backdropStroke: "rgba(235, 235, 235, 0.8)",
    },
    memory: {
      fontFamily: "Segoe Script, Brush Script MT, cursive",
      weight: 700,
      shadowColor: "rgba(255, 220, 90, 0.58)",
      shadowBlur: 14,
      strokeStyle: "rgba(244, 206, 92, 0.85)",
      fillStyle: "rgba(255, 238, 164, 0.95)",
      drawBackdrop: false,
    },
  };
  const style = styleByType[type] ?? styleByType.default;
  ctx.font = `${style.weight} ${fontSize}px ${style.fontFamily}`;
  ctx.shadowColor = style.shadowColor;
  ctx.shadowBlur = style.shadowBlur;
  ctx.lineWidth = Math.max(3, Math.floor(fontSize * 0.05));
  ctx.strokeStyle = style.strokeStyle;
  ctx.fillStyle = style.fillStyle;
  const x = canvas.width * 0.5;
  const lineGap = fontSize * 1.16;
  const startY = canvas.height * 0.5 - (lines.length - 1) * lineGap * 0.5;
  const widestLine = lines.reduce(
    (max, line) => Math.max(max, ctx.measureText(line).width),
    0,
  );
  if (style.drawBackdrop) {
    // For code-style memories, make the box hug text like fit-content with light padding.
    const padX = Math.max(24, fontSize * 0.34);
    const padY = Math.max(14, fontSize * 0.2);
    const textTop = startY - fontSize * 0.62;
    const textBottom = startY + (lines.length - 1) * lineGap + fontSize * 0.62;
    const w = Math.min(canvas.width - 24, widestLine + padX * 2);
    const h = Math.min(canvas.height - 24, textBottom - textTop + padY * 2);
    const left = THREE.MathUtils.clamp(x - w * 0.5, 12, canvas.width - w - 12);
    const top = THREE.MathUtils.clamp(
      textTop - padY,
      12,
      canvas.height - h - 12,
    );
    const r = Math.min(22, h * 0.2);
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + w - r, top);
    ctx.quadraticCurveTo(left + w, top, left + w, top + r);
    ctx.lineTo(left + w, top + h - r);
    ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
    ctx.lineTo(left + r, top + h);
    ctx.quadraticCurveTo(left, top + h, left, top + h - r);
    ctx.lineTo(left, top + r);
    ctx.quadraticCurveTo(left, top, left + r, top);
    ctx.closePath();
    ctx.fillStyle = style.backdropFill ?? "rgba(10, 10, 12, 0.9)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = style.backdropStroke ?? "rgba(220, 220, 220, 0.8)";
    ctx.stroke();
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadowBlur;
    ctx.strokeStyle = style.strokeStyle;
    ctx.fillStyle = style.fillStyle;
  }
  lines.forEach((line, idx) => {
    const y = startY + idx * lineGap;
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
};

const normalizeRideMessageText = (text: string): string =>
  text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\/n/g, "\n");

type SkillsLatticeNodeRecord = {
  mesh: THREE.Mesh;
  baseScale: number;
  phase: number;
  label: string;
  // "category" = a top-level tech stack node (a core); "skill" = any deeper node.
  nodeType: "category" | "skill";
  /** Name of the top-level node this belongs to (its branch). */
  category: string;
  /** 1 for cores, 2 for their children, and so on. */
  depth: number;
  /** Names from the core down to this node, e.g. ["Frontend", "Frameworks", "React"]. */
  path: string[];
  detailItems: string[];
  halo?: THREE.Sprite;
  lineInfluence: number;
};

type SkillsLatticeLinkSegment = {
  from: THREE.Vector3;
  to: THREE.Vector3;
};

type SkillsLatticeLineGroup = {
  material: THREE.LineBasicMaterial;
  kind: "ring" | "skill";
  category?: string;
};

type SkillsLatticeArcRecord = {
  line: THREE.Line;
  points: Float32Array;
  targetIndex: number;
  phase: number;
  sway: number;
  speed: number;
};

type SkillsLatticeFlowMeta = {
  segmentIndex: number;
  offset: number;
  speed: number;
  hue: number;
  hueDrift: number;
};

type AboutSwarmPhase =
  | "assembledHold"
  | "breakOut"
  | "swarm"
  | "reform"
  | "settle";

type AboutDeckBlock = {
  type: "text" | "image";
  title: string;
  body?: string;
  src?: string;
};

type AboutDeckSlide = {
  id: string;
  holdMs?: number;
  explodeAfter?: boolean;
  reveal?: {
    pattern?: "scanline" | "center-out" | "spiral" | "noise-cluster";
    blockStaggerMs?: number;
    cellRevealMs?: number;
  };
  blocks: AboutDeckBlock[];
};

type AboutDeckData = {
  aboutDeck: {
    slides: AboutDeckSlide[];
  };
};

type AboutCellSlot = {
  worldPosition: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  tileIndex: number;
  face: "front" | "back" | "rim";
  u: number;
  v: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  contentStrength: number;
};

type AboutCellRecord = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
  burstDirection: THREE.Vector3;
  spinAxisPrimary: THREE.Vector3;
  spinAxisSecondary: THREE.Vector3;
  spinRatePrimary: number;
  spinRateSecondary: number;
  sourceSlotIndex: number;
  targetSlotIndex: number;
  pulsePhase: number;
};

type AboutCellAnimationRuntime = {
  phase: AboutSwarmPhase;
  phaseStartedAt: number;
  phaseDurationMs: number;
  swarmDurationMs: number;
  active: boolean;
  initialized: boolean;
  lastTickMs: number;
  distanceGateActive: boolean;
};

// --- SHIP_DEBUG_LABELS (2026-02-03 snapshot) ---
// Each entry is a small circle used to indicate the larger region direction.
// 0) top
//    mesh: Mesh_0067_Tex_0095_1dds_0, uuid: 01fc05a3-a0e9-44ac-96ce-6cbd4aa6d96c
//    localPoint: [0.9122422225127416, 1.5442983446762355, -0.08458437473518643]
//    worldPoint: [901.876508524019, 30.86552548906256, 176.7214114626555]
// 1) bottom
//    mesh: Mesh_0067_Tex_0095_1dds_0, uuid: 01fc05a3-a0e9-44ac-96ce-6cbd4aa6d96c
//    localPoint: [-1.4762680590244663, -1.3492305317464002, 0.05729344316409879]
//    worldPoint: [902.0770672662713, 29.04214646060716, 176.32207436292234]
// 2) left
//    mesh: Mesh_0068_Tex_0095_2dds_0_1, uuid: ed9824f4-1419-47df-b81c-2bbc9e466d8c
//    localPoint: [6.660106363163475, -2.9067988739019484, -0.003916184310810422]
//    worldPoint: [901.3472866873808, 30.15029999385027, 180.24597607903206]
// 3) right
//    mesh: Mesh_0068_Tex_0095_2dds_0, uuid: 63d700a8-400e-48f1-a8f4-fef1b732149d
//    localPoint: [-6.682026754811734, 2.856149957649478, -0.017892472447783803]
//    worldPoint: [902.5549716380164, 29.767504829162657, 173.09048604694686]
// 4) rear
//    mesh: SurfPatch_Material001_0, uuid: 6282dfed-c415-413c-aecc-52a7744b17b5
//    localPoint: [-0.1861477066534185, -0.009953896327260736, -7.4621855991877055]
//    worldPoint: [905.6224600479799, 30.344568169496842, 177.17883984434613]
// 5) front
//    mesh: Mesh_0068_Tex_0095_2dds_0_1, uuid: ed9824f4-1419-47df-b81c-2bbc9e466d8c
//    localPoint: [-0.011301192244236091, -0.27918260784130666, 7.259686497338635]
//    worldPoint: [898.388639671934, 29.438446524413816, 176.1493109769936]
// 6) cockpit
//    mesh: Mesh_0067_Tex_0095_1dds_0, uuid: 01fc05a3-a0e9-44ac-96ce-6cbd4aa6d96c
//    localPoint: [-6.1963774447354645, 3.5916143936170215, 7.127732464864266]
//    worldPoint: [898.99317807436, 29.801697414970644, 172.56929777924128]

export default function ResumeSpace3D({
  options,
  onOptionsChange,
  onReloadUniverse,
  portfolioCores,
  moonPortfolioMapping,
  aboutPathTravelMessages,
  techStack,
  profile,
}: ResumeSpace3DProps) {
  // Published (or bundled) before mount, so a plain slice is stable for the scene's lifetime.
  const aboutPathRideMessages = useMemo(
    () => aboutPathTravelMessages.slice(0, ABOUT_PATH_RIDE_MESSAGE_LIMIT),
    [aboutPathTravelMessages],
  );
  const aboutDeckData = aboutDeck as AboutDeckData;
  const aboutSlides = aboutDeckData.aboutDeck.slides;

  const portfolioCoreBuild = useMemo(
    () =>
      buildPortfolioRegistryModel(portfolioCores),
    [portfolioCores],
  );
  const moonPortfolioByCompanyId = useMemo(() => {
    const map = new Map<string, NonNullable<OverlayContent["moonPortfolio"]>>();
    (resumeData.experience ?? []).forEach((company: any) => {
      const companyId = String(company?.id ?? "").trim();
      if (!companyId) return;
      const payload = buildMoonPortfolioPayload({
        companyId,
        companyName: String(company?.company ?? companyId),
        coreSeeds: portfolioCores,
        mappings: moonPortfolioMapping,
      });
      if (payload) map.set(companyId, payload);
    });
    return map;
  }, [portfolioCores, moonPortfolioMapping]);
  const getMoonPortfolio = useCallback(
    (company: any): OverlayContent["moonPortfolio"] => {
      const companyId = String(company?.id ?? "").trim();
      if (!companyId) return null;
      return moonPortfolioByCompanyId.get(companyId) ?? null;
    },
    [moonPortfolioByCompanyId],
  );
  // EXPORT SURFACE
  // Props: options, onOptionsChange
  // Emits: onOptionsChange (options sync)
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const careerGalleryRef = useRef<CareerGallery | null>(null);
  const careerGalleryWorldAnchorRef = useRef<THREE.Vector3 | null>(
    CAREER_GALLERY_WORLD_ANCHOR.clone(),
  );
  const careerGalleryPendingEntryRef = useRef(false);
  const careerGalleryEnteringRef = useRef(false);
  const careerGalleryActiveRef = useRef(false);
  const careerGallerySnapshotRef = useRef<GalleryControlsSnapshot | null>(null);
  const careerGalleryGlideCancelRef = useRef<(() => void) | null>(null);
  const careerGalleryZoomDetachRef = useRef<(() => void) | null>(null);
  const [careerGalleryActive, setCareerGalleryActive] = useState(false);
  /** Parked outside the gallery, camera locked on the globe. */
  const careerGalleryOutsideRef = useRef(false);
  const [careerGalleryOutside, setCareerGalleryOutside] = useState(false);
  /** Ship pose before it parked in front of the camera outside the gallery. */
  const careerGalleryShipPoseRef = useRef<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  } | null>(null);
  const careerGalleryLasersRef = useRef<FalconLaserBursts | null>(null);
  /** Nebula cocoon with ion-storm pulses; thins as you approach the gallery. */
  const careerGalleryShroudRef = useRef<GalleryShroud | null>(null);
  const [careerGallerySelection, setCareerGallerySelection] =
    useState<CareerGalleryFocusInfo | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const sceneRef = useRef<SceneRef>({});

  // State for new cosmic systems
  const [overlayContent, setOverlayContent] = useState<OverlayContent | null>(
    null,
  );
  const [, setContentLoading] = useState(false);

  // Hologram Drone display instance — always shown when content is active
  const hologramDroneRef = useRef<HologramDroneDisplay | null>(null);

  // ── Moon Orbit System (declared early so useEffect below can reference orbitPhase) ──
  const originalMinDistanceRef = useRef<number>(0);
  // Request flag to tell the scene effect to exit focused moon (cross-scope safe)
  const exitFocusRequestRef = useRef<boolean>(false);

  // How many world units change in camera-to-moon distance should trigger exiting focus
  // Tune this to allow small zoom adjustments without losing focus.
  const zoomExitThresholdRef = useRef<number>(DEFAULT_ZOOM_EXIT_THRESHOLD); // units (default suggestion)
  const {
    consoleVisible,
    setConsoleVisible,
    consoleLogs,
    consoleLogsRef,
    missionControlLogs,
    missionControlLogsRef,
    setConsoleLogs,
    setMissionControlLogs,
    vlog,
    missionLog,
    shipLog: rawShipLog,
    shipLogs,
    shipLogsRef,
    setShipLogs,
    debugLog: rawDebugLog,
    debugLogs,
    debugLogsRef,
    setDebugLogs,
    debugLogTotal,
  } = useCosmosLogs();
  const [emitFalconLocationLogs, setEmitFalconLocationLogs] =
    useState(IS_DEBUG);
  const [emitSDLocationLogs, setEmitSDLocationLogs] = useState(IS_DEBUG);
  const [logCamTraceEnabled, setLogCamTraceEnabled] = useState(IS_DEBUG);
  const [logAboutDebugEnabled, setLogAboutDebugEnabled] = useState(IS_DEBUG);
  const [logNavTraceEnabled, setLogNavTraceEnabled] = useState(IS_DEBUG);
  const [logNavDiagEnabled, setLogNavDiagEnabled] = useState(IS_DEBUG);
  const [logAudioChannelEnabled, setLogAudioChannelEnabled] =
    useState(IS_DEBUG);
  const [logDroneDebugEnabled, setLogDroneDebugEnabled] = useState(IS_DEBUG);
  const [logNavDebugEnabled, setLogNavDebugEnabled] = useState(IS_DEBUG);
  const shipLog = useCallback(
    (
      message: string,
      category: "nav" | "orbit" | "system" | "info" | "cmd" | "error" = "info",
    ) => {
      const isCamTrace = message.includes("[CAMTRACE]");
      const isAboutDebug = message.includes("ABOUTDBG");
      const isNavTrace = message.includes("🧭 TRACE");
      const isNavDiag = message.includes("🧪 NAVDIAG");
      const isAudioChannel = message.startsWith("[audio]");
      if (isCamTrace && !logCamTraceEnabled) return;
      if (isAboutDebug && !logAboutDebugEnabled) return;
      if (isNavTrace && !logNavTraceEnabled) return;
      if (isNavDiag && !logNavDiagEnabled) return;
      if (isAudioChannel && !logAudioChannelEnabled) return;
      rawShipLog(message, category);
    },
    [
      rawShipLog,
      logCamTraceEnabled,
      logAboutDebugEnabled,
      logNavTraceEnabled,
      logNavDiagEnabled,
      logAudioChannelEnabled,
    ],
  );
  const debugLog = useCallback(
    (source: string, message: string) => {
      if (source === "drone" && !logDroneDebugEnabled) return;
      if (source === "nav" && !logNavDebugEnabled) return;
      if (source === "audio" && !logAudioChannelEnabled) return;
      rawDebugLog(source, message);
    },
    [
      rawDebugLog,
      logDroneDebugEnabled,
      logNavDebugEnabled,
      logAudioChannelEnabled,
    ],
  );
  const toggleLogChannel = useCallback(
    (label: string, next: boolean, setter: (next: boolean) => void) => {
      setter(next);
      shipLog(`[LOGCFG] ${label} ${next ? "enabled" : "disabled"}`, "info");
      if (next) {
        shipLog(`[LOGCFG] ${label} is live`, "info");
      }
    },
    [shipLog],
  );

  const {
    enterOrbit,
    exitOrbit,
    updateOrbit,
    isOrbiting,
    onExitCompleteRef: orbitExitCompleteRef,
    onOrbitEstablishedRef,
  } = useMoonOrbit(debugLog, shipLog);

  // Track orbit phase as React state for UI (Leave Orbit button, etc.)
  const [orbitPhase, setOrbitPhase] = useState<OrbitPhase>("idle");
  const [droneSummonNonce, setDroneSummonNonce] = useState(0);
  const [droneInspectMode, setDroneInspectMode] = useState(false);
  const [moonHtmlVisible, setMoonHtmlVisible] = useState(false);
  const [moonIntroComplete, setMoonIntroComplete] = useState(false);
  const moonHtmlLayoutRef = useRef<HTMLDivElement | null>(null);
  const moonHtmlTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const [moonHtmlClosing, setMoonHtmlClosing] = useState(false);
  const moonHtmlCloseTimerRef = useRef<number | null>(null);
  const MOON_HTML_CLOSE_MS = 450;
  const [droneSoundEnabled, setDroneSoundEnabled] = useState(false);
  const [droneSoundVolume, setDroneSoundVolume] = useState(0.35);
  const [falconSoundEnabled, setFalconSoundEnabled] = useState(false);
  const [falconSoundVolume, setFalconSoundVolume] = useState(
    FALCON_MOON_TRAVEL_DEFAULT_VOLUME,
  );
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicTrack, setMusicTrack] = useState<string>(
    DEFAULT_BACKGROUND_MUSIC_TRACK,
  );
  const [overallVolume, setOverallVolume] = useState(0.3);
  const [backgroundMusicVolume, setBackgroundMusicVolume] = useState(1);
  const [showSoundSettingsModal, setShowSoundSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "sound" | "logs">(
    "general",
  );
  const availableMusicTracks = useMemo(
    () => Object.keys(COSMIC_AUDIO_TRACKS),
    [],
  );

  // Keep orbitActiveRef in sync for pointer handlers
  useEffect(() => {
    orbitActiveRef.current = orbitPhase !== "idle";
  }, [orbitPhase]);

  // Drive hologram drone whenever overlay content changes
  useEffect(() => {
    const drone = hologramDroneRef.current;
    if (!drone) {
      debugLog("drone", "useEffect: no drone ref");
      return;
    }
    const shouldShowDrone =
      !DISABLE_MOON_DRONE_ENTRY_FOR_TEST &&
      orbitPhase === "orbiting" &&
      (!!overlayContent || droneInspectMode);
    if (shouldShowDrone) {
      const moon = focusedMoonRef.current;
      const cam = sceneRef.current.camera;
      if (moon && cam) {
        const moonWorldPos = new THREE.Vector3();
        moon.getWorldPosition(moonWorldPos);
        const ship = spaceshipRef.current;
        const anchor =
          orbitPhase === "orbiting" && ship ? ship.position.clone() : undefined;
        if (droneInspectMode) {
          debugLog(
            "drone",
            `showInspectMode called — orbitPhase=${orbitPhase}`,
          );
          drone.showInspectMode(moonWorldPos, cam, anchor);
        } else if (overlayContent && !moonIntroComplete) {
          debugLog("drone", `showIntroCard called — orbitPhase=${orbitPhase}`);
          drone.showIntroCard(overlayContent, moonWorldPos, cam, anchor);
        }
        const droneRenderer = rendererRef.current;
        const droneCamera = sceneRef.current.camera;
        if (droneRenderer && droneCamera) {
          const panelTextures = drone.getPanelTextures();
          for (const tex of panelTextures) {
            droneRenderer.initTexture(tex);
          }
          const panelScene = drone.getPanelGroup();
          if (panelScene) {
            droneRenderer.compile(panelScene, droneCamera as THREE.Camera);
          }
        }
      } else {
        debugLog("drone", `useEffect: missing moon=${!!moon} cam=${!!cam}`);
      }
    } else {
      drone.hideContentImmediate();
      if (droneInspectMode) setDroneInspectMode(false);
      // Clean up HTML layout on orbit exit
      if (moonHtmlTimelineRef.current) {
        moonHtmlTimelineRef.current.kill();
        moonHtmlTimelineRef.current = null;
      }
      if (moonHtmlCloseTimerRef.current !== null) {
        window.clearTimeout(moonHtmlCloseTimerRef.current);
        moonHtmlCloseTimerRef.current = null;
      }
      setMoonHtmlClosing(false);
      setMoonHtmlVisible(false);
      setMoonIntroComplete(false);
    }
  }, [
    overlayContent,
    orbitPhase,
    droneSummonNonce,
    droneInspectMode,
    moonIntroComplete,
  ]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (
        orbitPhase !== "orbiting" ||
        !overlayContent ||
        orbitalPortfolioActiveRef.current
      ) {
        return;
      }
      if (moonHtmlVisible) return;
      const consumed =
        hologramDroneRef.current?.handleScroll(event.deltaY) ?? false;
      if (!consumed) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    });
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [orbitPhase, overlayContent, moonHtmlVisible]);

  useEffect(() => {
    if (!moonHtmlVisible || !moonHtmlLayoutRef.current) return;
    const wrapper = moonHtmlLayoutRef.current;
    const layoutEl = wrapper.querySelector(".moon-html-layout");
    if (!layoutEl) return;
    if (moonHtmlTimelineRef.current) {
      moonHtmlTimelineRef.current.kill();
    }
    const tl = gsap.timeline();
    tl.fromTo(
      layoutEl,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" },
    );
    tl.fromTo(
      wrapper.querySelectorAll(
        ".moon-html-layout__portfolio, .moon-html-layout__narrative, .moon-html-layout__tech",
      ),
      { opacity: 0, y: 20, scale: 0.97 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: "power2.out",
        stagger: 0.1,
      },
      "-=0.3",
    );
    moonHtmlTimelineRef.current = tl;
    return () => {
      tl.kill();
    };
  }, [moonHtmlVisible]);

  const [shipMovementDebug, setShipMovementDebug] = useState(false);
  const [systemStatusLogs, setSystemStatusLogs] = useState<string[]>([]);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [loaderVisualComplete, setLoaderVisualComplete] = useState(false);
  const [criticalAssetsReady, setCriticalAssetsReady] = useState(false);
  const [droneGpuWarmupReady, setDroneGpuWarmupReady] = useState(false);
  const [loaderProgressHint, setLoaderProgressHint] = useState(0);
  const [loaderStageHint, setLoaderStageHint] = useState("Initializing...");
  const loadingActiveRef = useRef(true);
  const gpuWarmupInProgressRef = useRef(false);
  const sceneModelsLoadedRef = useRef(0);
  const [allSceneModelsLoaded, setAllSceneModelsLoaded] = useState(false);
  const SCENE_MODEL_COUNT = 2; // spaceship, star-destroyer
  const markSceneModelLoaded = useCallback(() => {
    sceneModelsLoadedRef.current += 1;
    if (sceneModelsLoadedRef.current >= SCENE_MODEL_COUNT) {
      dwarn(`[PERF:load] all ${SCENE_MODEL_COUNT} scene models added to scene`);
      setAllSceneModelsLoaded(true);
    }
  }, []);
  // The space background is always on (the user-facing toggle was removed).
  const [spaceBackgroundVisible] = useState(true);
  const starfieldMeshRef = useRef<THREE.Mesh | null>(null);
  const skyfieldMeshRef = useRef<THREE.Mesh | null>(null);
  // Universe backdrop: "lightbox" (photo spheres), "realism" or "vivid" 3D universe.
  const universeBackdropRef = useRef<UniverseBackdrop | null>(null);
  /** Boiling surface, corona, solar flares and lens flare for the sun. */
  const sunEnhancementsRef = useRef<SunEnhancements | null>(null);
  const [universeStyle, setUniverseStyle] = useState<UniverseStyle>(() =>
    readStoredUniverseStyle(),
  );
  const universeStyleRef = useRef<UniverseStyle>(universeStyle);
  universeStyleRef.current = universeStyle;

  // Tour state
  const [tourActive, setTourActive] = useState(false);
  const [tourWaypoint, setTourWaypoint] = useState<string>("");
  const [tourProgress, setTourProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    hologramDroneRef.current?.setSoundEnabled(droneSoundEnabled);
  }, [droneSoundEnabled]);

  useEffect(() => {
    hologramDroneRef.current?.setSoundVolume(droneSoundVolume);
  }, [droneSoundVolume]);

  useEffect(() => {
    if (falconSoundEnabled) return;
    if (falconTravelFadeTimeoutRef.current !== null) {
      window.clearTimeout(falconTravelFadeTimeoutRef.current);
      falconTravelFadeTimeoutRef.current = null;
    }
    const falconAudio = falconTravelAudioRef.current;
    if (falconAudio?.isPlaying) {
      falconAudio.stop();
    }
  }, [falconSoundEnabled]);

  useEffect(() => {
    const falconAudio = falconTravelAudioRef.current;
    if (!falconAudio?.isPlaying) return;
    falconAudio.setVolume(
      THREE.MathUtils.clamp(overallVolume * falconSoundVolume, 0, 1),
    );
  }, [falconSoundVolume, overallVolume]);

  useEffect(() => {
    const effectiveMusicVolume = overallVolume * backgroundMusicVolume;
    window.dispatchEvent(
      new CustomEvent("cosmicVolumeChange", {
        detail: { volume: effectiveMusicVolume },
      }),
    );
  }, [overallVolume, backgroundMusicVolume]);

  useEffect(() => {
    const toneMaster = orbitalPortfolioToneRuntimeRef.current.masterGain;
    if (!toneMaster) return;
    toneMaster.gain.value = THREE.MathUtils.clamp(
      overallVolume * SKILLS_LATTICE_TONE_MASTER_GAIN,
      0,
      0.09,
    );
  }, [overallVolume]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("cosmicAudioChange", {
        detail: { track: musicEnabled ? musicTrack : "" },
      }),
    );
  }, [musicEnabled, musicTrack]);

  useEffect(() => {
    if (!oblivionDroneAudioBuffersRef.current) return;
    hologramDroneRef.current?.setDroneAudioBuffers(
      oblivionDroneAudioBuffersRef.current,
    );
  }, [criticalAssetsReady]);

  useEffect(() => {
    if (!oblivionDronePreloadedRef.current) return;
    hologramDroneRef.current?.setDroneVariant(
      MOON_VISIT_DRONE_VARIANT,
      oblivionDronePreloadedRef.current,
    );
  }, [criticalAssetsReady]);

  // ── GPU Warmup ─────────────────────────────────────────────────────────────
  // Follows the Three.js recommended pre-render sequence:
  //   1. Wait until ALL models are loaded and added to the scene
  //   2. renderer.initTexture()  — upload every texture to GPU
  //   3. renderer.compileAsync() — compile all shader programs
  //   4. composer.render()       — upload geometry buffers (first draw call)
  //   5. Restore visibility, dismiss loading screen
  //
  // The render loop is paused during this process (gpuWarmupInProgressRef)
  // to prevent interference from concurrent compositor renders.
  useEffect(() => {
    loadingActiveRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    if (!sceneReady || !criticalAssetsReady || !allSceneModelsLoaded) return;
    if (droneGpuWarmupDoneRef.current) return;
    const renderer = rendererRef.current;
    const mainScene = sceneRef.current.scene;
    const liveCamera = sceneRef.current.camera as THREE.Camera | undefined;
    if (!renderer || !mainScene || !liveCamera) return;
    setDroneGpuWarmupReady(false);
    droneGpuWarmupDoneRef.current = true;

    const warmup = async () => {
      try {
        setLoaderProgressHint((prev) => Math.max(prev, 78));
        setLoaderStageHint("Warming up GPU...");
        gpuWarmupInProgressRef.current = true;
        const warmupStart = performance.now();
        const yieldToMainThread = () =>
          new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
          });

        // Keep warmup focused on currently visible scene content so the
        // loader stays responsive. Full-scene forcing was causing long
        // monolithic stalls during frenzy.
        const activeCameraMask = liveCamera.layers.mask;
        let meshCount = 0;
        let objectCount = 0;
        mainScene.traverse((obj) => {
          objectCount++;
          const mesh = obj as THREE.Mesh;
          if (
            mesh.isMesh &&
            obj.visible &&
            (obj.layers.mask & activeCameraMask) !== 0
          ) {
            meshCount++;
          }
        });
        dwarn(
          `[PERF:warmup] GPU warmup STARTING — ${meshCount} visible meshes, ${objectCount} objects`,
        );

        // Step 1 — Upload every texture to the GPU in chunks so
        // the browser can keep painting loader animations smoothly.
        let textureCount = 0;
        const meshList: THREE.Mesh[] = [];
        mainScene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (
            mesh.isMesh &&
            obj.visible &&
            (obj.layers.mask & activeCameraMask) !== 0
          ) {
            meshList.push(mesh);
          }
        });
        const WARMUP_CHUNK_SIZE = 24;
        for (let i = 0; i < meshList.length; i += 1) {
          const mesh = meshList[i];
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const mat of materials) {
            if (!mat) continue;
            const m = mat as unknown as Record<string, unknown>;
            for (const key of Object.keys(m)) {
              const val = m[key];
              if (val && (val as THREE.Texture).isTexture) {
                renderer.initTexture(val as THREE.Texture);
                textureCount++;
              }
            }
          }
          if ((i + 1) % WARMUP_CHUNK_SIZE === 0) {
            await yieldToMainThread();
          }
        }
        const initTextureMs = performance.now() - warmupStart;
        setLoaderProgressHint((prev) => Math.max(prev, 88));
        setLoaderStageHint("Compiling shaders...");
        dwarn(
          `[PERF:warmup] initTexture: ${textureCount} textures in ${initTextureMs.toFixed(1)}ms`,
        );

        // Step 2 — Compile all shader programs asynchronously. Hidden objects
        // (the Falcon before the intro reveal, etc.) are skipped by
        // compileAsync, so their shaders would otherwise compile on the frame
        // they first appear. Reveal them for this step only; lights stay as-is
        // so the compiled programs match the real light count. They are hidden
        // again before Step 3, so no textures upload for them here.
        const compileStart = performance.now();
        await yieldToMainThread();
        const revealedForCompile: THREE.Object3D[] = [];
        mainScene.traverse((obj) => {
          if (!obj.visible && !(obj as THREE.Light).isLight) {
            obj.visible = true;
            revealedForCompile.push(obj);
          }
        });
        const COMPILE_TIMEOUT_MS = 8000;
        try {
          await Promise.race([
            renderer.compileAsync(mainScene, liveCamera).catch((err) => {
              dwarn("[PERF:warmup] compileAsync error (non-fatal):", err);
            }),
            new Promise<void>((resolve) =>
              setTimeout(resolve, COMPILE_TIMEOUT_MS),
            ),
          ]);
        } finally {
          revealedForCompile.forEach((obj) => {
            obj.visible = false;
          });
        }
        const compileMs = performance.now() - compileStart;
        if (compileMs >= COMPILE_TIMEOUT_MS) {
          dwarn(
            `[PERF:warmup] compileAsync timed out after ${COMPILE_TIMEOUT_MS}ms — continuing`,
          );
        }
        setLoaderProgressHint((prev) => Math.max(prev, 94));
        setLoaderStageHint("Finalizing render pipeline...");

        // Step 3 — Lightweight geometry upload pass using renderer only.
        const renderStart = performance.now();
        renderer.render(mainScene, liveCamera);
        const renderMs = performance.now() - renderStart;

        // Step 4 — Warm the EffectComposer at 1/4 resolution so bloom
        // shaders are compiled before the live render loop uses them.
        // Previous attempts at full-resolution composer warmup caused long
        // loader freezes; the reduced size keeps the cost manageable while
        // still triggering all shader compilation paths.
        let composerWarmMs = 0;
        const composer = composerRef.current;
        if (composer) {
          const composerWarmStart = performance.now();
          const origSize = renderer.getSize(new THREE.Vector2());
          const qw = Math.max(1, Math.ceil(origSize.x / 4));
          const qh = Math.max(1, Math.ceil(origSize.y / 4));
          renderer.setSize(qw, qh, false);
          composer.setSize(qw, qh);
          composer.render();
          renderer.setSize(origSize.x, origSize.y, false);
          composer.setSize(origSize.x, origSize.y);
          composerWarmMs = performance.now() - composerWarmStart;
        }

        const totalMs = performance.now() - warmupStart;
        dwarn(
          `[PERF:warmup] GPU warmup COMPLETE — initTexture=${initTextureMs.toFixed(1)}ms compileAsync=${compileMs.toFixed(1)}ms render=${renderMs.toFixed(1)}ms composerWarm=${composerWarmMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms`,
        );
      } catch (e) {
        dwarn("[PERF:warmup] GPU warmup error:", e);
      } finally {
        gpuWarmupInProgressRef.current = false;
        setLoaderProgressHint((prev) => Math.max(prev, 99));
        setLoaderStageHint("Almost ready...");
        setDroneGpuWarmupReady(true);
      }
    };

    void warmup();
  }, [sceneReady, criticalAssetsReady, allSceneModelsLoaded]);

  useEffect(() => {
    if (!sceneReady) return;
    const unlockAudio = () => {
      void hologramDroneRef.current?.resumeAudioContext();
      const camera = sceneRef.current.camera;
      if (camera) {
        if (!falconTravelAudioListenerRef.current) {
          falconTravelAudioListenerRef.current = new THREE.AudioListener();
        }
        attachAudioListenerToCamera(
          camera,
          falconTravelAudioListenerRef.current,
        );
      }
      const ctx = falconTravelAudioListenerRef.current?.context;
      if (ctx && ctx.state !== "running") {
        void ctx.resume().catch(() => {});
      }
      const toneRuntime = orbitalPortfolioToneRuntimeRef.current;
      if (!toneRuntime.context && falconTravelAudioListenerRef.current) {
        toneRuntime.context = falconTravelAudioListenerRef.current
          .context as AudioContext;
      }
      if (toneRuntime.context && !toneRuntime.masterGain) {
        toneRuntime.masterGain = toneRuntime.context.createGain();
        toneRuntime.masterGain.gain.value = THREE.MathUtils.clamp(
          overallVolume * SKILLS_LATTICE_TONE_MASTER_GAIN,
          0,
          0.09,
        );
        toneRuntime.masterGain.connect(toneRuntime.context.destination);
      } else if (toneRuntime.masterGain) {
        toneRuntime.masterGain.gain.value = THREE.MathUtils.clamp(
          overallVolume * SKILLS_LATTICE_TONE_MASTER_GAIN,
          0,
          0.09,
        );
      }
      if (toneRuntime.context && toneRuntime.context.state !== "running") {
        void toneRuntime.context.resume().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, [overallVolume, sceneReady]);

  useEffect(() => {
    return () => {
      if (falconTravelFadeTimeoutRef.current !== null) {
        window.clearTimeout(falconTravelFadeTimeoutRef.current);
        falconTravelFadeTimeoutRef.current = null;
      }
      const falconAudio = falconTravelAudioRef.current;
      if (falconAudio) {
        if (falconAudio.isPlaying) falconAudio.stop();
        if (falconAudio.parent) falconAudio.parent.remove(falconAudio);
      }
      falconTravelAudioRef.current = null;
      const listener = falconTravelAudioListenerRef.current;
      if (listener?.parent) {
        listener.parent.remove(listener);
      }
      falconTravelAudioListenerRef.current = null;
      falconNavCueBuffersRef.current = {
        moonTravel: [],
        speedOfLight: null,
        changeOfDirection: null,
        override: null,
      };
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    THREE.Cache.enabled = true;
    const gltfPreloader = new GLTFLoader();
    const texturePreloader = new THREE.TextureLoader();
    const audioPreloader = new THREE.AudioLoader();
    // Started synchronously so the scene-setup effect (which runs after this
    // one) can reuse the same parse instead of loading the Falcon twice.
    const falconGltfPromise = PLACEHOLDER_MODELS
      ? (Promise.resolve({
          scene: buildFalconPlaceholder(),
        }) as unknown as ReturnType<GLTFLoader["loadAsync"]>)
      : loadVehicleAsShip(gltfPreloader, SHIP_MODEL_PATH);
    spaceshipGltfPromiseRef.current = falconGltfPromise;

    const loadTextureSafe = async (url: string) => {
      try {
        const texture = await texturePreloader.loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      } catch {
        return null;
      }
    };

    const loadAudioSafe = async (url: string) => {
      try {
        const buffer = await audioPreloader.loadAsync(url);
        debugLog("drone", `[audio] preloaded ${url}`);
        return buffer;
      } catch {
        debugLog("drone", `[audio] FAILED preload ${url}`);
        return null;
      }
    };

    const _preloadStart = performance.now();
    const preloadCriticalAssets = async () => {
      try {
        setLoaderProgressHint((prev) => Math.max(prev, 8));
        setLoaderStageHint("Loading critical assets...");
        dwarn("[PERF:load] preloadCriticalAssets START");
        debugLog(
          "loader",
          `[models] preload start ship=${SHIP_MODEL_PATH} sd=/models/star-destroyer-2/star_wars_imperial_ii_star_destroyer.glb drone=${DRONE_MODEL_PATH}`,
        );
        const [
          spaceshipGltf,
          starDestroyerGltf,
          oblivionDroneGltf,
          activationBuffer,
          transmissionBuffer,
          falconMoonTravelBuffer1,
          falconMoonTravelBuffer2,
          falconSpeedOfLightBuffer,
          falconChangeOfDirectionBuffer,
          falconOverrideBuffer,
          ...movementBuffers
        ] = await Promise.all([
          falconGltfPromise,
          gltfPreloader.loadAsync(
            "/models/star-destroyer-2/star_wars_imperial_ii_star_destroyer.glb",
          ),
          PLACEHOLDER_MODELS
            ? Promise.resolve({ scene: buildDronePlaceholder() })
            : loadDroneVariant(gltfPreloader, DRONE_MODEL_PATH),
          loadAudioSafe(OBLIVION_DRONE_AUDIO_PATHS.activation),
          loadAudioSafe(OBLIVION_DRONE_AUDIO_PATHS.transmission),
          loadAudioSafe(FALCON_NAV_SFX_PATHS.moonTravel[0]),
          loadAudioSafe(FALCON_NAV_SFX_PATHS.moonTravel[1]),
          loadAudioSafe(FALCON_NAV_SFX_PATHS.speedOfLight),
          loadAudioSafe(FALCON_NAV_SFX_PATHS.changeOfDirection),
          loadAudioSafe(FALCON_NAV_SFX_PATHS.override),
          ...OBLIVION_DRONE_AUDIO_PATHS.movement.map((url) =>
            loadAudioSafe(url),
          ),
        ]);

        if (!cancelled) {
          // Inject drone model/audio as soon as they resolve; do not block on
          // unrelated texture/music warmups.
          oblivionDronePreloadedRef.current = (
            oblivionDroneGltf as { scene: THREE.Object3D }
          ).scene;
          hologramDroneRef.current?.setDroneVariant(
            MOON_VISIT_DRONE_VARIANT,
            oblivionDronePreloadedRef.current,
          );
          oblivionDroneAudioBuffersRef.current = {
            activation: activationBuffer,
            transmission: transmissionBuffer,
            movement: movementBuffers.filter(
              (buf): buf is AudioBuffer => !!buf,
            ),
          };
          hologramDroneRef.current?.setDroneAudioBuffers(
            oblivionDroneAudioBuffersRef.current,
          );
          falconNavCueBuffersRef.current = {
            moonTravel: [
              falconMoonTravelBuffer1,
              falconMoonTravelBuffer2,
            ].filter((buffer): buffer is AudioBuffer => !!buffer),
            speedOfLight: falconSpeedOfLightBuffer,
            changeOfDirection: falconChangeOfDirectionBuffer,
            override: falconOverrideBuffer,
          };
          debugLog(
            "drone",
            `[audio] buffers ready activation=${!!activationBuffer} transmission=${!!transmissionBuffer} movement=${oblivionDroneAudioBuffersRef.current.movement?.length ?? 0}`,
          );
          debugLog(
            "audio",
            `[falcon] preload moon=${falconNavCueBuffersRef.current.moonTravel.length} speedOfLight=${!!falconSpeedOfLightBuffer} changeOfDirection=${!!falconChangeOfDirectionBuffer} override=${!!falconOverrideBuffer}`,
          );
          spaceshipPreloadedGltfRef.current = spaceshipGltf as {
            scene: THREE.Group;
          };
          starDestroyerPreloadedGltfRef.current = starDestroyerGltf as {
            scene: THREE.Group;
          };
          debugLog(
            "loader",
            "[models] preloaded Falcon, Star Destroyer, Drone",
          );
          setLoaderProgressHint((prev) => Math.max(prev, 70));
          setLoaderStageHint("Preparing scene...");
        }

        const portfolioCoreImageJobs = (() => {
          const urls = new Set<string>();
          const visit = (value: unknown) => {
            if (!value) return;
            if (Array.isArray(value)) {
              value.forEach(visit);
              return;
            }
            if (typeof value !== "object") return;
            Object.entries(value as Record<string, unknown>).forEach(
              ([key, nested]) => {
                if (
                  (key === "image" || key === "thumbnail") &&
                  typeof nested === "string" &&
                  nested.trim().length > 0
                ) {
                  urls.add(nested.trim());
                  return;
                }
                visit(nested);
              },
            );
          };
          visit(portfolioCores);
          debugLog(
            "project-showcase",
            `[textures] portfolio core preload urls=${urls.size}`,
          );
          return Array.from(urls).map((textureUrl) =>
            loadTextureSafe(textureUrl),
          );
        })();
        const moonTextureWarmupJobs = [
          ...Array.from(
            new Set(Object.values(EXPERIENCE_MOON_OVERLAY_TEXTURE_BY_JOB_ID)),
          ).map((textureUrl) => loadTextureSafe(textureUrl)),
          ...EXPERIENCE_MOON_BASE_TEXTURES.map((textureUrl) =>
            loadTextureSafe(textureUrl),
          ),
        ];

        const musicTrackWarmupJobs = Object.values(COSMIC_AUDIO_TRACKS)
          .filter((url) => typeof url === "string" && url.trim().length > 0)
          .map(async (url) => {
            try {
              const probe = new Audio();
              probe.preload = "auto";
              probe.src = url;
              await new Promise<void>((resolve) => {
                const onReady = () => {
                  cleanup();
                  resolve();
                };
                const onError = () => {
                  cleanup();
                  resolve();
                };
                const cleanup = () => {
                  probe.removeEventListener("canplaythrough", onReady);
                  probe.removeEventListener("loadeddata", onReady);
                  probe.removeEventListener("error", onError);
                };
                probe.addEventListener("canplaythrough", onReady, {
                  once: true,
                });
                probe.addEventListener("loadeddata", onReady, { once: true });
                probe.addEventListener("error", onError, { once: true });
                probe.load();
              });
              return true;
            } catch {
              return false;
            }
          });

        const deferredJobCount =
          portfolioCoreImageJobs.length +
          moonTextureWarmupJobs.length +
          musicTrackWarmupJobs.length;
        dwarn(
          `[PERF:load] critical assets done; scheduling deferred preload jobs=${deferredJobCount}`,
        );
        void Promise.allSettled([
          ...portfolioCoreImageJobs,
          ...moonTextureWarmupJobs,
          ...musicTrackWarmupJobs,
        ]).then(() => {
          if (!cancelled) {
            dwarn(
              `[PERF:load] deferred preload COMPLETE jobs=${deferredJobCount}`,
            );
          }
        });
      } finally {
        if (!cancelled) {
          dwarn(
            `[PERF:load] setCriticalAssetsReady(true) after ${(performance.now() - _preloadStart).toFixed(0)}ms`,
          );
          setLoaderProgressHint((prev) => Math.max(prev, 75));
          setLoaderStageHint("Starting GPU warmup...");
          setCriticalAssetsReady(true);
        }
      }
    };

    preloadCriticalAssets();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Universe backdrop: the photo lightbox only shows in "lightbox" style.
    const lightbox = spaceBackgroundVisible && universeStyle === "lightbox";
    if (starfieldMeshRef.current) {
      starfieldMeshRef.current.visible = lightbox;
    }
    if (skyfieldMeshRef.current) {
      skyfieldMeshRef.current.visible = lightbox;
    }
    const backdropScene = sceneRef.current.scene;
    if (backdropScene) {
      // The 3D universe draws its own warp tunnel instead of the old streaks.
      backdropScene.userData.suppressLegacyLightspeedStreaks =
        spaceBackgroundVisible && universeStyle !== "lightbox";
    }
    const backdrop = universeBackdropRef.current;
    if (backdrop) {
      if (spaceBackgroundVisible && universeStyle !== "lightbox") {
        backdrop.setStyle(universeStyle);
      } else {
        backdrop.hide();
      }
    }
  }, [spaceBackgroundVisible, universeStyle]);

  // Universe backdrop: black hole lensing pass (right after the scene render,
  // enabled only while the black hole is on screen).
  useEffect(() => {
    if (!sceneReady) return;
    const composer = composerRef.current;
    if (!composer) return;
    const pass = createBlackHoleLensPass();
    composer.insertPass(pass, 1);
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const backdrop = universeBackdropRef.current;
      const camera = sceneRef.current.camera;
      if (!backdrop || !camera) {
        pass.enabled = false;
        return;
      }
      backdrop.updateLensPass(pass, camera);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      composer.removePass(pass);
      pass.dispose();
    };
  }, [sceneReady]);

  // Cinematic sun: animate corona/flares and aim the lens flare (fades when a
  // planet, moon or the Falcon passes in front of the sun).
  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    let last = performance.now();
    const occluders: SunOccluder[] = [];
    const pool: SunOccluder[] = [];
    const worldScale = new THREE.Vector3();
    const nextOccluder = () => {
      let entry = pool[occluders.length];
      if (!entry) {
        entry = { center: new THREE.Vector3(), radius: 0 };
        pool.push(entry);
      }
      occluders.push(entry);
      return entry;
    };
    const getOccluders = () => {
      occluders.length = 0;
      for (const item of itemsRef.current) {
        const mesh = item.mesh;
        if (!mesh?.parent || !mesh.visible || !mesh.geometry) continue;
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
        const entry = nextOccluder();
        mesh.getWorldPosition(entry.center);
        mesh.getWorldScale(worldScale);
        entry.radius =
          (mesh.geometry.boundingSphere?.radius ?? 0) *
          Math.max(worldScale.x, worldScale.y, worldScale.z);
      }
      const ship = spaceshipRef.current;
      if (ship?.visible) {
        const entry = nextOccluder();
        ship.getWorldPosition(entry.center);
        entry.radius = 0.5;
      }
      return occluders;
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const sun = sunEnhancementsRef.current;
      const camera = sceneRef.current.camera;
      if (!sun || !camera) return;
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      sun.update(dt, camera, getOccluders);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneReady]);

  // Universe backdrop: switcher (also listed in Console → Tools).
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    const choose = (style: UniverseStyle) => () => {
      writeStoredUniverseStyle(style);
      setUniverseStyle(style);
    };
    win.universeLightbox = choose("lightbox");
    win.universeRealism = choose("realism");
    win.universeVivid = choose("vivid");
    return () => {
      delete win.universeLightbox;
      delete win.universeRealism;
      delete win.universeVivid;
    };
  }, []);

  useEffect(() => {
    if (loaderVisualComplete && criticalAssetsReady && droneGpuWarmupReady) {
      dwarn(
        `[PERF:load] isLoading→false (loaderVisualComplete=${loaderVisualComplete} criticalAssetsReady=${criticalAssetsReady} droneGpuWarmupReady=${droneGpuWarmupReady})`,
      );
      setIsLoading(false);
    }
  }, [loaderVisualComplete, criticalAssetsReady, droneGpuWarmupReady]);

  // Spaceship state
  const [followingSpaceship, setFollowingSpaceship] = useState(false);
  const followingSpaceshipRef = useRef(false);
  const [shipExteriorLights, setShipExteriorLights] = useState(false);
  const [shipInteriorLights, setShipInteriorLights] = useState(true);
  const [insideShip, setInsideShip] = useState(false);
  const insideShipRef = useRef(false);
  const spaceshipInteriorLightsRef = useRef<THREE.PointLight[]>([]);
  const [shipViewMode, setShipViewMode] = useState<
    "exterior" | "interior" | "cockpit"
  >("exterior");
  const shipViewModeRef = useRef<"exterior" | "interior" | "cockpit">(
    "exterior",
  );
  const spaceshipRef = useRef<THREE.Group | null>(null);
  const sunLabelRef = useRef<THREE.Object3D | null>(null);
  const [cosmosIntroOverlayOpacity, setCosmosIntroOverlayOpacity] = useState(1);
  const spaceshipPreloadedGltfRef = useRef<{ scene: THREE.Group } | null>(null);
  const spaceshipGltfPromiseRef = useRef<ReturnType<
    GLTFLoader["loadAsync"]
  > | null>(null);
  const starDestroyerPreloadedGltfRef = useRef<{ scene: THREE.Group } | null>(
    null,
  );
  const oblivionDronePreloadedRef = useRef<THREE.Object3D | null>(null);
  const oblivionDroneAudioBuffersRef = useRef<DroneAudioBuffers | null>(null);
  const falconNavCueBuffersRef = useRef<{
    moonTravel: AudioBuffer[];
    speedOfLight: AudioBuffer | null;
    changeOfDirection: AudioBuffer | null;
    override: AudioBuffer | null;
  }>({
    moonTravel: [],
    speedOfLight: null,
    changeOfDirection: null,
    override: null,
  });
  const falconTravelAudioListenerRef = useRef<THREE.AudioListener | null>(null);
  const falconTravelAudioRef = useRef<THREE.PositionalAudio | null>(null);
  const falconTravelFadeTimeoutRef = useRef<number | null>(null);
  const falconActiveCueKindRef = useRef<FalconNavCueKind | null>(null);
  const falconPendingCueKindRef = useRef<FalconNavCueKind | null>(null);
  const droneGpuWarmupDoneRef = useRef(false);
  const pendingOrbitalPortfolioEntryRef = useRef(false);
  const orbitalPortfolioAwaitingArrivalRef = useRef(false);
  const orbitalPortfolioSawTravelRef = useRef(false);
  const orbitalPortfolioWorldAnchorRef = useRef<THREE.Vector3 | null>(null);
  const orbitalPortfolioRootRef = useRef<THREE.Group | null>(null);
  const orbitalPortfolioBeaconRef = useRef<THREE.Mesh | null>(null);
  const orbitalPortfolioStationsRef = useRef<OrbitalPortfolioStationRecord[]>(
    [],
  );
  const orbitalPortfolioGroupsRef = useRef<PortfolioGroupView[]>([]);
  const orbitalPortfolioCoresRef = useRef<OrbitalPortfolioCoreRecord[]>([]);
  const orbitalPortfolioCoresByIdRef = useRef<
    Map<string, OrbitalPortfolioCoreRecord>
  >(new Map());
  const orbitalPortfolioCoreViewsRef = useRef<PortfolioCoreView[]>([]);
  const orbitalPortfolioConnectorLinesRef = useRef<THREE.Line[]>([]);
  const orbitalPortfolioMatterGroupRef = useRef<THREE.Group | null>(null);
  const orbitalPortfolioMatterPacketsRef = useRef<
    OrbitalPortfolioMatterPacketRecord[]
  >([]);
  const orbitalPortfolioCorePickMeshesRef = useRef<THREE.Mesh[]>([]);
  const orbitalPortfolioOuterRingsRef = useRef<THREE.Line[]>([]);
  const moonTravelSignGroupRef = useRef<THREE.Group | null>(null);
  const moonTravelSignsRef = useRef<MoonTravelSignRecord[]>([]);
  const moonTravelSignLastSpawnAtRef = useRef(0);
  const moonTravelSignPauseUntilRef = useRef(0);
  const moonTravelSignSequenceWrappedRef = useRef(false);
  const moonTravelSignLoopHaltedRef = useRef(false);
  const moonTravelSignLaneCursorRef = useRef(0);
  const moonTravelSignPathCycleRef = useRef<{
    order: number[];
    index: number;
    lastSlot: number;
  }>({
    order: [0, 2, 4, 1, 3],
    index: 0,
    lastSlot: -1,
  });
  const moonTravelSignPoolRef = useRef<JobMemoryEntry[]>([]);
  const moonTravelSignPoolCursorRef = useRef(0);
  const moonTravelSignActiveCompanyRef = useRef<string | null>(null);
  const moonTravelSignTextureCacheRef = useRef<Map<string, THREE.Texture>>(
    new Map(),
  );
  const [orbitSignTuning, setOrbitSignTuning] = useState<OrbitSignTuning>({
    timeBetweenMessagesSec: 1.8,
    continuousLoop: true,
    // Replay shortly after the last memory flies past.
    waitAfterStreamSec: 3,
    travelSpeed: 0.9,
    lightIntensity: 1.7,
    startFontScale: 0.1,
    endFontScale: 1.86,
  });
  const orbitSignTuningRef = useRef<OrbitSignTuning>(orbitSignTuning);
  const [showOrbitSignTuningControls, setShowOrbitSignTuningControls] =
    useState(false);
  const [viewerMemoriesEnabled, setViewerMemoriesEnabled] = useState(false);
  const [moonMemoryControlsVisible, setMoonMemoryControlsVisible] =
    useState(false);
  const viewerMemoriesEnabledRef = useRef(false);
  const [moonMemoryManualMode, setMoonMemoryManualMode] = useState(false);
  const moonMemoryManualModeRef = useRef(false);
  const [moonMemoryPlaybackPlaying, setMoonMemoryPlaybackPlaying] =
    useState(false);
  const moonMemoryPlaybackPlayingRef = useRef(false);
  const [moonMemoryScrubValue, setMoonMemoryScrubValue] = useState(0);
  const moonMemoryScrubValueRef = useRef(0);
  const moonMemoryLastUiSyncAtRef = useRef(0);
  const moonMemoryScrubRequestRef = useRef<{ value: number } | null>(null);
  const moonOrbitSignDebugLastLogAtRef = useRef(0);
  const [orbitalPortfolioReady, setOrbitalPortfolioReady] = useState(false);
  const [orbitalPortfolioActive, setOrbitalPortfolioActive] = useState(false);
  const orbitalPortfolioActiveRef = useRef(false);
  const orbitalPortfolioPlayingRef = useRef(true);
  const [orbitalPortfolioOrbitsEnabled, setOrbitalPortfolioOrbitsEnabled] =
    useState(true);
  const orbitalPortfolioOrbitsEnabledRef = useRef(true);
  const [orbitalPortfolioAutoplayEnabled, setOrbitalPortfolioAutoplayEnabled] =
    useState(false);
  const orbitalPortfolioAutoplayEnabledRef = useRef(false);
  const [orbitalPortfolioFocusIndex, setOrbitalPortfolioFocusIndex] =
    useState(0);
  const orbitalPortfolioFocusIndexRef = useRef(0);
  const [orbitalPortfolioHasActiveFocus, setOrbitalPortfolioHasActiveFocus] =
    useState(true);
  const orbitalPortfolioHasActiveFocusRef = useRef(true);
  const [orbitalPortfolioVariantIndex, setOrbitalPortfolioVariantIndex] =
    useState(0);
  const orbitalPortfolioVariantIndexRef = useRef(0);
  const [orbitalPortfolioMediaIndex, setOrbitalPortfolioMediaIndex] =
    useState(0);
  const [orbitalPortfolioThumbPageStart, setOrbitalPortfolioThumbPageStart] =
    useState(0);
  const orbitalPortfolioThumbPageStartRef = useRef(0);
  const orbitalPortfolioPrevThumbPageStartRef = useRef(0);
  const orbitalPortfolioThumbSlideDirectionRef = useRef<"prev" | "next" | null>(
    null,
  );
  const [orbitalPortfolioSearchQuery, setOrbitalPortfolioSearchQuery] =
    useState("");
  const [orbitalPortfolioYearFilter, setOrbitalPortfolioYearFilter] =
    useState("all");
  const [orbitalPortfolioTechFilter, setOrbitalPortfolioTechFilter] =
    useState("all");
  const [orbitalPortfolioFocusedCoreId, setOrbitalPortfolioFocusedCoreId] =
    useState("");
  const orbitalPortfolioFocusedCoreIdRef = useRef("");
  const [orbitalRegistrySelectedCoreId, setOrbitalRegistrySelectedCoreId] =
    useState("");
  const [orbitalRegistryPanelVisible, setOrbitalRegistryPanelVisible] =
    useState(true);
  const orbitalPortfolioLastViewedRef = useRef<{
    focusIndex: number | null;
    variantIndex: number;
    mediaIndex: number;
  }>({
    focusIndex: null,
    variantIndex: 0,
    mediaIndex: 0,
  });
  const orbitalPortfolioAutoRef = useRef({
    lastAdvanceAt: 0,
    intervalMs: 3200,
    pausedUntil: 0,
  });
  const orbitalPortfolioManualCameraLockRef = useRef(false);
  const orbitalPortfolioCameraDistanceRef = useRef(1);
  const orbitalPortfolioCameraDistanceTargetRef = useRef(1);
  const orbitalPortfolioCameraPosRef = useRef(new THREE.Vector3());
  const orbitalPortfolioCameraTargetRef = useRef(new THREE.Vector3());
  const orbitalPortfolioCameraInitializedRef = useRef(false);
  const orbitalPortfolioEntrySequenceRef = useRef({
    active: false,
    startedAt: 0,
    durationMs: 2600,
    startCam: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    revealCam: new THREE.Vector3(),
    revealTarget: new THREE.Vector3(),
    finalCam: new THREE.Vector3(),
    finalTarget: new THREE.Vector3(),
  });
  const orbitalPortfolioPendingInspectRequestRef = useRef<{
    stationIndex: number;
    mediaIndex?: number;
    options?: {
      autoplay?: boolean;
      variantIndex?: number;
      enforceCanonicalInspectDistance?: boolean;
    };
  } | null>(null);
  const orbitalPortfolioIgnoreManualUntilRef = useRef(0);
  const orbitalPortfolioInspectedStationIndexRef = useRef<number | null>(null);
  const orbitalPortfolioInspectDistanceRef = useRef<number | null>(null);
  const orbitalPortfolioInspectStartedAtRef = useRef(0);
  const orbitalPortfolioDebugLastLogAtRef = useRef(0);
  const orbitalPortfolioStateDebugLastLogAtRef = useRef(0);
  const orbitalPortfolioDebugDumpedRef = useRef(false);
  const orbitalPortfolioEntryGateSignatureRef = useRef("");
  const orbitalPortfolioPrevStateRef = useRef<{
    followingSpaceship: boolean;
    shipVisible: boolean;
    controlsEnabled: boolean;
    cameraLayerMask: number;
    controlsMinDistance?: number;
    controlsMaxDistance?: number;
  } | null>(null);
  const orbitalPortfolioToneRuntimeRef = useRef<{
    enabled: boolean;
    context: AudioContext | null;
    masterGain: GainNode | null;
    activeVoices: Array<{
      oscMain: OscillatorNode;
      oscLayer: OscillatorNode;
      mainGain: GainNode;
      layerGain: GainNode;
      filter: BiquadFilterNode;
      voiceGain: GainNode;
    }>;
    nextEventAtMs: number;
    motifIndex: number;
    noteIndex: number;
    accentCoreIndex: number;
    accentNodeLabel: string;
    accentColorHex: number;
    accentUntilAtMs: number;
    debugNoteCounter: number;
  }>({
    enabled: false,
    context: null,
    masterGain: null,
    activeVoices: [],
    nextEventAtMs: 0,
    motifIndex: 0,
    noteIndex: 0,
    accentCoreIndex: -1,
    accentNodeLabel: "",
    accentColorHex: 0xc18bff,
    accentUntilAtMs: 0,
    debugNoteCounter: 0,
  });
  const skillsLatticeTonePresetState = useState(
    SKILLS_LATTICE_TONE_PRESETS[0]?.id ?? "celestial-pad",
  );
  const skillsLatticeTonePresetId = skillsLatticeTonePresetState[0];
  const skillsLatticeTonePresetIdRef = useRef(skillsLatticeTonePresetId);
  useEffect(() => {
    skillsLatticeTonePresetIdRef.current = skillsLatticeTonePresetId;
  }, [skillsLatticeTonePresetId]);
  const activeSkillsLatticeTonePreset = useMemo(
    () => resolveSkillsLatticeTonePreset(skillsLatticeTonePresetId),
    [skillsLatticeTonePresetId],
  );
  const skillsLatticeTonePhrasePauseState = useState(
    SKILLS_LATTICE_TONE_PHRASE_PAUSE_MS,
  );
  const skillsLatticeTonePhrasePauseMs = skillsLatticeTonePhrasePauseState[0];
  const skillsLatticeTonePhrasePauseMsRef = useRef(
    skillsLatticeTonePhrasePauseMs,
  );
  useEffect(() => {
    skillsLatticeTonePhrasePauseMsRef.current = skillsLatticeTonePhrasePauseMs;
  }, [skillsLatticeTonePhrasePauseMs]);
  const [skillsLatticeToneReleaseSec, setSkillsLatticeToneReleaseSec] =
    useState(activeSkillsLatticeTonePreset.releaseSec);
  const skillsLatticeToneReleaseSecRef = useRef(skillsLatticeToneReleaseSec);
  useEffect(() => {
    skillsLatticeToneReleaseSecRef.current = skillsLatticeToneReleaseSec;
  }, [skillsLatticeToneReleaseSec]);
  useEffect(() => {
    setSkillsLatticeToneReleaseSec(activeSkillsLatticeTonePreset.releaseSec);
  }, [activeSkillsLatticeTonePreset.releaseSec]);
  const onscreenKeyboardKeys = useMemo(() => buildOnscreenKeyboardKeys(), []);
  const [keyboardStudioEnabled] = useState(false);
  const [onscreenKeyboardPanelLayout, setOnscreenKeyboardPanelLayout] =
    useState(() => loadPanelLayout(KEYBOARD_STUDIO_DEFAULT_LAYOUT));
  const [onscreenKeyboardPanelVisible, setOnscreenKeyboardPanelVisible] =
    useState(false);
  const [onscreenKeyboardPanelCollapsed, setOnscreenKeyboardPanelCollapsed] =
    useState(loadPanelLayout(KEYBOARD_STUDIO_DEFAULT_LAYOUT).collapsed);
  const [onscreenKeyboardRecording, setOnscreenKeyboardRecording] =
    useState(false);
  const [onscreenKeyboardPlaying, setOnscreenKeyboardPlaying] = useState(false);
  const [onscreenKeyboardGhostAutoplay, setOnscreenKeyboardGhostAutoplay] =
    useState(true);
  const [onscreenKeyboardPressedNotes, setOnscreenKeyboardPressedNotes] =
    useState<string[]>([]);
  const [
    onscreenKeyboardGhostPressedNotes,
    setOnscreenKeyboardGhostPressedNotes,
  ] = useState<string[]>([]);
  const [onscreenKeyboardRecordedEvents, setOnscreenKeyboardRecordedEvents] =
    useState<KeyboardRecordedNoteEvent[]>([]);
  const [keyboardStudioPresets, setKeyboardStudioPresets] = useState<
    KeyboardStudioPreset[]
  >(() => loadPresets());
  const [keyboardStudioBindings, setKeyboardStudioBindings] = useState<
    KeyboardStudioEventBinding[]
  >(() => loadBindings());
  const [keyboardStudioPresetName, setKeyboardStudioPresetName] = useState("");
  const [keyboardStudioSelectedPresetId, setKeyboardStudioSelectedPresetId] =
    useState<string>("factory-nebula-keys");
  const [keyboardStudioSelectedSource, setKeyboardStudioSelectedSource] =
    useState<string>("factory-nebula-keys");
  const [keyboardStudioBeatPatternId, setKeyboardStudioBeatPatternId] =
    useState<keyof typeof KEYBOARD_STUDIO_BEAT_PATTERNS>("pulse");
  const [keyboardStudioBeatTempoBpm, setKeyboardStudioBeatTempoBpm] =
    useState(96);
  const [keyboardStudioBeatLoopEnabled, setKeyboardStudioBeatLoopEnabled] =
    useState(false);
  const [keyboardStudioKnownEventIds, setKeyboardStudioKnownEventIds] =
    useState<string[]>(() => [...COSMOS_SOUND_EVENT_IDS]);
  const [keyboardStudioSoundDesign, setKeyboardStudioSoundDesign] =
    useState<KeyboardStudioSoundDesign>(DEFAULT_KEYBOARD_STUDIO_SOUND_DESIGN);
  const [keyboardStudioSavedSettings, setKeyboardStudioSavedSettings] =
    useState<
      Array<{
        id: string;
        name: string;
        createdAt: string;
        soundDesign: KeyboardStudioSoundDesign;
      }>
    >(() => {
      if (typeof window === "undefined") return [];
      try {
        const raw = window.localStorage.getItem(
          KEYBOARD_STUDIO_SETTINGS_SLOTS_KEY,
        );
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Array<{
          id?: string;
          name?: string;
          createdAt?: string;
          soundDesign?: Partial<KeyboardStudioSoundDesign>;
        }>;
        if (!Array.isArray(parsed)) return [];
        return parsed
          .slice(0, 10)
          .filter((slot) => !!slot.id && !!slot.name)
          .map((slot) => ({
            id: String(slot.id),
            name: String(slot.name),
            createdAt: String(slot.createdAt || new Date().toISOString()),
            soundDesign: normalizeSoundDesign(slot.soundDesign),
          }));
      } catch {
        return [];
      }
    });
  const [
    keyboardStudioSelectedSettingsId,
    setKeyboardStudioSelectedSettingsId,
  ] = useState("");
  const [keyboardStudioMainColumnWidth, setKeyboardStudioMainColumnWidth] =
    useState(510);
  const onscreenKeyboardPressedNotesRef = useRef<string[]>([]);
  const onscreenKeyboardRecordedEventsRef = useRef<KeyboardRecordedNoteEvent[]>(
    [],
  );
  const onscreenKeyboardRecordingRef = useRef(false);
  const onscreenKeyboardGhostAutoplayRef = useRef(true);
  const onscreenKeyboardRecordStartRef = useRef(0);
  const onscreenKeyboardActiveNotesRef = useRef(
    new Map<string, { startMs: number; velocity: number }>(),
  );
  const keyboardStudioEngineRef = useRef<ReturnType<
    typeof createKeyboardStudioEngine
  > | null>(null);
  const keyboardStudioBeatLoopTimerRef = useRef<number | null>(null);
  const keyboardStudioControlFeedbackLastAtRef = useRef(0);
  const onscreenKeyboardPanelDragRef = useRef<{
    active: boolean;
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const keyboardStudioMainColumnResizeRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const keyboardStudioPointerNoteRef = useRef<Map<number, string>>(new Map());
  const keyboardStudioNotePointerCountRef = useRef<Map<string, number>>(
    new Map(),
  );
  const keyboardStudioPressedCodesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    onscreenKeyboardPressedNotesRef.current = onscreenKeyboardPressedNotes;
  }, [onscreenKeyboardPressedNotes]);
  useEffect(() => {
    onscreenKeyboardRecordedEventsRef.current = onscreenKeyboardRecordedEvents;
  }, [onscreenKeyboardRecordedEvents]);
  useEffect(() => {
    onscreenKeyboardRecordingRef.current = onscreenKeyboardRecording;
  }, [onscreenKeyboardRecording]);
  useEffect(() => {
    onscreenKeyboardGhostAutoplayRef.current = onscreenKeyboardGhostAutoplay;
  }, [onscreenKeyboardGhostAutoplay]);
  useEffect(() => {
    saveBooleanStorage(KEYBOARD_STUDIO_ENABLED_KEY, keyboardStudioEnabled);
  }, [keyboardStudioEnabled]);
  useEffect(() => {
    savePanelLayout({
      ...onscreenKeyboardPanelLayout,
      collapsed: onscreenKeyboardPanelCollapsed,
    });
  }, [onscreenKeyboardPanelCollapsed, onscreenKeyboardPanelLayout]);
  useEffect(() => {
    savePresets(keyboardStudioPresets);
  }, [keyboardStudioPresets]);
  useEffect(() => {
    saveBindings(keyboardStudioBindings);
  }, [keyboardStudioBindings]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        KEYBOARD_STUDIO_SETTINGS_SLOTS_KEY,
        JSON.stringify(keyboardStudioSavedSettings.slice(0, 10)),
      );
    } catch {
      // ignore storage failures
    }
  }, [keyboardStudioSavedSettings]);
  const allKeyboardStudioPresetOptions = useMemo<KeyboardStudioPreset[]>(
    () => [...KEYBOARD_STUDIO_FACTORY_PRESETS, ...keyboardStudioPresets],
    [keyboardStudioPresets],
  );
  const selectedKeyboardStudioPreset = useMemo(
    () =>
      allKeyboardStudioPresetOptions.find(
        (preset) => preset.id === keyboardStudioSelectedSource,
      ) ?? KEYBOARD_STUDIO_FACTORY_PRESETS[0],
    [allKeyboardStudioPresetOptions, keyboardStudioSelectedSource],
  );
  const onscreenKeyboardActiveNoteSet = useMemo(
    () =>
      new Set([
        ...onscreenKeyboardPressedNotes,
        ...onscreenKeyboardGhostPressedNotes,
      ]),
    [onscreenKeyboardGhostPressedNotes, onscreenKeyboardPressedNotes],
  );
  const onscreenKeyboardGhostNoteSet = useMemo(
    () => new Set(onscreenKeyboardGhostPressedNotes),
    [onscreenKeyboardGhostPressedNotes],
  );
  const keyboardStudioKeyCodeToNoteMap = useMemo(() => {
    const mapping = new Map<string, string>();
    KEYBOARD_STUDIO_COMPUTER_KEY_CODES.forEach((code, index) => {
      const key = onscreenKeyboardKeys[index];
      if (key) mapping.set(code, key.note);
    });
    return mapping;
  }, [onscreenKeyboardKeys]);
  const [portfolioNavHereActive, setPortfolioNavHereActive] = useState(false);
  const setOrbitalPortfolioManualLock = useCallback(
    (next: boolean, source: string) => {
      const prev = orbitalPortfolioManualCameraLockRef.current;
      if (prev !== next) {
        shipLog(
          `[PORTENTRY] manualLock:${next ? "on" : "off"} source=${source}`,
          "info",
        );
      }
      orbitalPortfolioManualCameraLockRef.current = next;
    },
    [shipLog],
  );
  useEffect(() => {
    orbitalPortfolioVariantIndexRef.current = orbitalPortfolioVariantIndex;
  }, [orbitalPortfolioVariantIndex]);
  useEffect(() => {
    orbitalPortfolioThumbPageStartRef.current = orbitalPortfolioThumbPageStart;
  }, [orbitalPortfolioThumbPageStart]);
  useEffect(() => {
    orbitalPortfolioHasActiveFocusRef.current = orbitalPortfolioHasActiveFocus;
  }, [orbitalPortfolioHasActiveFocus]);
  useEffect(() => {
    orbitalPortfolioOrbitsEnabledRef.current = orbitalPortfolioOrbitsEnabled;
  }, [orbitalPortfolioOrbitsEnabled]);
  useEffect(() => {
    orbitalPortfolioFocusedCoreIdRef.current = orbitalPortfolioFocusedCoreId;
  }, [orbitalPortfolioFocusedCoreId]);
  useEffect(() => {
    orbitSignTuningRef.current = orbitSignTuning;
    // Apply key tuning controls immediately without waiting for next stream cycle.
    const now = performance.now();
    if (orbitSignTuning.continuousLoop) {
      moonTravelSignLoopHaltedRef.current = false;
      moonTravelSignPauseUntilRef.current = 0;
    }
    // Re-evaluate spawn timing right away so message timing changes feel live.
    moonTravelSignLastSpawnAtRef.current = Math.min(
      moonTravelSignLastSpawnAtRef.current,
      now + 90,
    );
  }, [orbitSignTuning]);
  useEffect(() => {
    viewerMemoriesEnabledRef.current = viewerMemoriesEnabled;
    const clearCurrentOrbitSigns = () => {
      const records = moonTravelSignsRef.current;
      records.forEach((record) => {
        const parent = record.object.parent;
        if (parent) parent.remove(record.object);
        record.material.dispose();
      });
      moonTravelSignsRef.current = [];
    };
    if (viewerMemoriesEnabled) {
      clearCurrentOrbitSigns();
      moonTravelSignPoolCursorRef.current = 0;
      moonTravelSignSequenceWrappedRef.current = false;
      moonTravelSignLaneCursorRef.current = 0;
      moonTravelSignPathCycleRef.current = {
        order: [0, 2, 4, 1, 3],
        index: 0,
        lastSlot: -1,
      };
      moonTravelSignLoopHaltedRef.current = false;
      moonTravelSignPauseUntilRef.current = 0;
      moonTravelSignLastSpawnAtRef.current = performance.now();
      moonMemoryManualModeRef.current = false;
      moonMemoryPlaybackPlayingRef.current = false;
      moonMemoryScrubRequestRef.current = null;
      moonMemoryScrubValueRef.current = 0;
      setMoonMemoryManualMode(false);
      setMoonMemoryPlaybackPlaying(false);
      setMoonMemoryScrubValue(0);
    } else {
      clearCurrentOrbitSigns();
      moonMemoryManualModeRef.current = false;
      moonMemoryPlaybackPlayingRef.current = false;
      moonMemoryScrubRequestRef.current = null;
      moonMemoryScrubValueRef.current = 0;
      setMoonMemoryManualMode(false);
      setMoonMemoryPlaybackPlaying(false);
      setMoonMemoryScrubValue(0);
    }
  }, [viewerMemoriesEnabled]);
  useEffect(() => {
    moonMemoryManualModeRef.current = moonMemoryManualMode;
  }, [moonMemoryManualMode]);
  useEffect(() => {
    moonMemoryPlaybackPlayingRef.current = moonMemoryPlaybackPlaying;
  }, [moonMemoryPlaybackPlaying]);
  useEffect(() => {
    moonMemoryScrubValueRef.current = moonMemoryScrubValue;
  }, [moonMemoryScrubValue]);
  useEffect(() => {
    if (orbitPhase !== "orbiting") {
      setMoonMemoryControlsVisible(false);
      return;
    }
    // Memories fly as soon as the moon orbit starts, so they are already on
    // screen while the drone arrives and laser-draws the overlay.
    setMoonMemoryControlsVisible(true);
    setViewerMemoriesEnabled(true);
    shipLog("Moon memories started with orbit", "orbit");
  }, [orbitPhase, shipLog]);
  const exportOrbitSignTuning = useCallback(() => {
    const payload = {
      timeBetweenMessagesSec: Number(
        orbitSignTuning.timeBetweenMessagesSec.toFixed(2),
      ),
      continuousLoop: !!orbitSignTuning.continuousLoop,
      waitAfterStreamSec: Number(orbitSignTuning.waitAfterStreamSec.toFixed(2)),
      travelSpeed: Number(orbitSignTuning.travelSpeed.toFixed(2)),
      lightIntensity: Number(orbitSignTuning.lightIntensity.toFixed(2)),
      startFontScale: Number(orbitSignTuning.startFontScale.toFixed(2)),
      endFontScale: Number(orbitSignTuning.endFontScale.toFixed(2)),
    };
    dlog("[ORBSIGN_SETTINGS]", payload);
    shipLog(`[ORBSIGN_SETTINGS] ${JSON.stringify(payload)}`, "info");
    try {
      void navigator.clipboard?.writeText(JSON.stringify(payload));
      shipLog("Orbit sign settings copied to clipboard", "info");
    } catch {
      // ignore clipboard failures
    }
  }, [orbitSignTuning, shipLog]);
  const skillsLatticeWorldAnchorRef = useRef<THREE.Vector3 | null>(null);
  const aboutMemorySquareWorldAnchorRef = useRef<THREE.Vector3 | null>(null);
  const aboutMemorySquareRootRef = useRef<THREE.Group | null>(null);
  const aboutParticleSwarmRef = useRef<AboutParticleSwarmHandle | null>(null);
  const aboutHydrateSwarmRef = useRef<AboutParticleSwarmHandle | null>(null);
  const aboutMjolnirRef = useRef<MjolnirRider | null>(null);
  /** Ends the autopilot's current trip; set once the navigation hook is ready. */
  const completeActiveNavigationRef = useRef<((reason: string) => void) | null>(
    null,
  );
  const aboutJourneyCameraDistSavedRef = useRef<{
    min: number;
    max: number;
  } | null>(null);
  const aboutJourneyAutopilotSuppressedRef = useRef(false);
  const aboutJourneyRef = useRef<AboutJourneyController | null>(null);
  const aboutJourneyPendingEntryRef = useRef(false);
  const aboutTramKeyUpHeldRef = useRef(false);
  const aboutTramKeyDownHeldRef = useRef(false);
  const aboutTramPointerUpHeldRef = useRef(false);
  const aboutTramPointerDownHeldRef = useRef(false);
  const [aboutTramHudVisible, setAboutTramHudVisible] = useState(false);
  const [aboutTramUpHeld, setAboutTramUpHeld] = useState(false);
  const [aboutTramDownHeld, setAboutTramDownHeld] = useState(false);
  const [aboutTramMomentumNorm, setAboutTramMomentumNorm] = useState(0);
  const [aboutTramCruiseEnabled, setAboutTramCruiseEnabled] = useState(false);
  const [aboutTramCruiseThresholdNorm, setAboutTramCruiseThresholdNorm] =
    useState(0.7);
  const [aboutTramCameraReversed, setAboutTramCameraReversed] = useState(false);
  const [aboutTramCameraMode, setAboutTramCameraMode] =
    useState<AboutTravelCameraMode>("forward");
  const aboutCrystalPathGroupRef = useRef<THREE.Group | null>(null);
  const aboutCrystalPathRef = useRef<THREE.CatmullRomCurve3 | null>(null);
  const aboutCrystalPanelMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const aboutCrystalPanelSeedsRef = useRef<
    Array<{
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
      reveal: number;
    }>
  >([]);
  const aboutCrystalPanelShatterRef = useRef<
    Array<{
      burstDirection: THREE.Vector3;
      tangentDirection: THREE.Vector3;
      normalDirection: THREE.Vector3;
      spinAxisPrimary: THREE.Vector3;
      spinAxisSecondary: THREE.Vector3;
      spinRatePrimary: number;
      spinRateSecondary: number;
      launchDelay: number;
      burstImpulse: number;
      driftPhase: number;
      driftAmount: number;
    }>
  >([]);
  const aboutCrystalPanelMatricesRef = useRef<THREE.Matrix4[]>([]);
  const aboutCrystalShatterUntilRef = useRef(0);
  const aboutCrystalDispersingStartedAtRef = useRef(0);
  const aboutCrystalShatterPhaseRef = useRef<AboutJourneyPhase>(
    AboutJourneyPhase.IDLE,
  );
  const aboutRetargetDispersalTimeoutRef = useRef<number | null>(null);
  const aboutCrystalSurgesRef = useRef<
    Array<{
      line: THREE.Line;
      positions: Float32Array;
      headT: number;
      speed: number;
      length: number;
    }>
  >([]);
  const navigationDistanceRef = useRef<number | null>(null);
  const aboutMemorySquareLabelRef = useRef<THREE.Object3D | null>(null);
  const aboutMemorySquarePendingEntryRef = useRef(false);
  const aboutMemorySquareActiveRef = useRef(false);
  const aboutMemorySquareNavIntentUntilRef = useRef(0);
  const aboutMemorySquarePrevNavTargetRef = useRef<string | null>(null);
  const aboutMemorySquareEntrySequenceRef = useRef<{
    active: boolean;
    raf: number | null;
  }>({ active: false, raf: null });
  const aboutCellSlotsRef = useRef<AboutCellSlot[]>([]);
  const aboutCellRecordsRef = useRef<AboutCellRecord[]>([]);
  const aboutCellAnimationRef = useRef<AboutCellAnimationRuntime>({
    phase: "assembledHold",
    phaseStartedAt: 0,
    phaseDurationMs: ABOUT_SWARM_ASSEMBLED_HOLD_MS,
    swarmDurationMs: ABOUT_SWARM_MIN_MS,
    active: false,
    initialized: false,
    lastTickMs: 0,
    distanceGateActive: false,
  });
  const aboutCellMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const aboutCellShaderMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const aboutCellRevealAttrRef = useRef<THREE.InstancedBufferAttribute | null>(
    null,
  );
  const aboutSlideTexturesRef = useRef<Array<THREE.Texture | null>>([
    null,
    null,
    null,
    null,
  ]);
  const aboutCellRafRef = useRef<number | null>(null);
  const aboutSwarmManualTriggerRef = useRef(false);
  const aboutSwarmManualReformRef = useRef(false);
  const aboutTileCoreMatsRef = useRef<THREE.MeshPhongMaterial[]>([]);
  const aboutTileEdgeLineMatsRef = useRef<THREE.LineBasicMaterial[]>([]);
  const aboutTileGridLineMatsRef = useRef<THREE.LineBasicMaterial[]>([]);
  const aboutTileContentMatsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const aboutTileContentRevealStartMsRef = useRef(0);
  const aboutTileContentRevealBlockStaggerMsRef = useRef(360);
  const aboutTileContentFadeStartMsRef = useRef(0);
  const aboutPanelSpinStyleRef = useRef<number[]>([0, 1, 0, 1]);
  const [aboutNavHereActive, setAboutNavHereActive] = useState(false);
  const [aboutExitConfirmIntent, setAboutExitConfirmIntent] =
    useState<AboutExitConfirmIntent | null>(null);
  const [aboutSkipCinematicPromptVisible, setAboutSkipCinematicPromptVisible] =
    useState(false);
  const [aboutRideMessageView, setAboutRideMessageView] =
    useState<AboutPathTravelMessage | null>(null);
  const aboutRideMessageOverlayRef = useRef<HTMLDivElement | null>(null);
  const [skillsNavHereActive, setSkillsNavHereActive] = useState(false);
  const [aboutSwarmTriggerVisible, setAboutSwarmTriggerVisible] =
    useState(false);
  const [aboutActiveSlideIndex, setAboutActiveSlideIndex] = useState(0);
  const aboutFrontSlotIndicesRef = useRef<number[]>([]);
  const aboutCellBaseColorsRef = useRef<THREE.Color[]>([]);
  const aboutCellTargetColorsRef = useRef<THREE.Color[]>([]);
  const aboutCellRevealAtMsRef = useRef<number[]>([]);
  const aboutSlideStartedAtRef = useRef(0);
  const aboutSlideAdvanceAfterReformRef = useRef(false);
  const aboutImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const aboutSlidePreparedIndexRef = useRef(-1);
  const aboutSlideReadyRef = useRef(false);
  const aboutSlidePreparePendingRef = useRef(false);
  const aboutDebugStateRef = useRef<{
    lastLogMs: number;
    lastCanShow: boolean | null;
    lastPhase: AboutSwarmPhase | null;
    lastPrepared: number;
    lastReady: boolean;
  }>({
    lastLogMs: 0,
    lastCanShow: null,
    lastPhase: null,
    lastPrepared: -1,
    lastReady: false,
  });

  useEffect(() => {
    type RideMessageRuntime = {
      path: THREE.CatmullRomCurve3 | null;
      pathLength: number;
      triggerDistances: number[];
      triggerStep: number;
      activeIndex: number;
    };

    type DispersalPanRuntime = {
      active: boolean;
      startedAt: number;
      durationMs: number;
      startCameraPos: THREE.Vector3;
      targetCameraPos: THREE.Vector3;
      startTarget: THREE.Vector3;
      targetTarget: THREE.Vector3;
    };

    const rideMessageRuntime: RideMessageRuntime = {
      path: null,
      pathLength: 1,
      triggerDistances: [],
      triggerStep: 1,
      activeIndex: -1,
    };

    const dispersalPanRuntime: DispersalPanRuntime = {
      active: false,
      startedAt: 0,
      durationMs: ABOUT_DISPERSAL_SUN_PAN_MS,
      startCameraPos: new THREE.Vector3(),
      targetCameraPos: new THREE.Vector3(),
      startTarget: new THREE.Vector3(),
      targetTarget: new THREE.Vector3(),
    };

    const disposeCrystalGroup = () => {
      const group = aboutCrystalPathGroupRef.current;
      if (!group) return;

      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = (
          mesh as { material?: THREE.Material | THREE.Material[] }
        ).material;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat.dispose());
        } else if (material) {
          material.dispose();
        }
      });

      if (group.parent) group.parent.remove(group);
      aboutCrystalPathGroupRef.current = null;
      aboutCrystalPathRef.current = null;
      aboutCrystalPanelMeshRef.current = null;
      aboutCrystalPanelSeedsRef.current = [];
      aboutCrystalPanelShatterRef.current = [];
      aboutCrystalPanelMatricesRef.current = [];
      aboutCrystalSurgesRef.current = [];
    };

    const hideRideMessageOverlay = () => {
      const overlay = aboutRideMessageOverlayRef.current;
      if (overlay) {
        overlay.style.opacity = "0";
      }
    };

    const disposeRideMessages = () => {
      rideMessageRuntime.path = null;
      rideMessageRuntime.pathLength = 1;
      rideMessageRuntime.triggerDistances = [];
      rideMessageRuntime.triggerStep = 1;
      rideMessageRuntime.activeIndex = -1;
      hideRideMessageOverlay();
      setAboutRideMessageView(null);
    };

    const buildRideMessages = (path: THREE.CatmullRomCurve3) => {
      disposeRideMessages();
      rideMessageRuntime.path = path;
      rideMessageRuntime.pathLength = Math.max(1, path.getLength());

      const count = aboutPathRideMessages.length;
      const step = rideMessageRuntime.pathLength / Math.max(1, count + 1);
      rideMessageRuntime.triggerStep = step;
      rideMessageRuntime.triggerDistances = Array.from(
        { length: count },
        (_, idx) => step * (idx + 1),
      );
    };

    const activateRideMessage = (index: number) => {
      if (rideMessageRuntime.activeIndex === index) return;
      rideMessageRuntime.activeIndex = index;
      setAboutRideMessageView(aboutPathRideMessages[index] ?? null);
    };

    // Once fully crystallized and not exploding, panel matrices don't change.
    let crystalMatricesStatic = false;
    const tempScale = new THREE.Vector3();
    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const deltaQuat = new THREE.Quaternion();
    const deltaQuatB = new THREE.Quaternion();

    const ensureCrystalGroup = () => {
      if (aboutCrystalPathGroupRef.current)
        return aboutCrystalPathGroupRef.current;
      const scene = sceneRef.current.scene;
      if (!scene) return null;
      const group = new THREE.Group();
      group.name = "AboutJourneyCrystalPathGroup";
      scene.add(group);
      aboutCrystalPathGroupRef.current = group;
      return group;
    };

    const buildCrystalPath = (path: THREE.CatmullRomCurve3) => {
      const group = ensureCrystalGroup();
      if (!group) return;

      while (group.children.length > 0) {
        const child = group.children.pop();
        if (!child) break;
        group.remove(child);
      }

      aboutCrystalPathRef.current = path;
      aboutCrystalPanelSeedsRef.current = [];
      aboutCrystalPanelShatterRef.current = [];
      aboutCrystalPanelMatricesRef.current = [];
      aboutCrystalSurgesRef.current = [];

      // Keep panel spacing close to the legacy loop's on longer routes.
      const segmentCount = THREE.MathUtils.clamp(
        Math.round(
          440 * ((path as { timing?: { lengthScale: number } }).timing?.lengthScale ?? 1),
        ),
        440,
        1400,
      );
      crystalMatricesStatic = false;
      const panelGeom = new THREE.PlaneGeometry(1, 1, 1, 1);
      // Unlit on purpose. The old physical glass material (transmission +
      // clearcoat) re-rendered the scene into a transmission buffer every
      // frame and, lit by every light in the scene, took a measured 2.7 s to
      // build its shader on the first ride frame. The panels read as flat
      // glowing glass anyway; brightness is driven through `color` below.
      const panelMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: true,
      });
      const panelMesh = new THREE.InstancedMesh(
        panelGeom,
        panelMat,
        segmentCount,
      );
      panelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      panelMesh.frustumCulled = false;
      panelMesh.renderOrder = 10;

      const up = new THREE.Vector3(0, 1, 0);
      const altUp = new THREE.Vector3(0, 0, 1);
      const tangent = new THREE.Vector3();
      const lateral = new THREE.Vector3();
      const normal = new THREE.Vector3();
      const p0 = new THREE.Vector3();
      const p1 = new THREE.Vector3();
      const mid = new THREE.Vector3();
      const basis = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      const color = new THREE.Color();
      const toCenter = new THREE.Vector3();
      const randomDir = new THREE.Vector3();
      const burstDir = new THREE.Vector3();
      const tangentDir = new THREE.Vector3();
      const normalDir = new THREE.Vector3();
      const spinAxisA = new THREE.Vector3();
      const spinAxisB = new THREE.Vector3();
      const crystalColorPalette = [
        new THREE.Color(0xff9f4a), // orange
        new THREE.Color(0xffc15e), // amber
        new THREE.Color(0x44d68a), // emerald
        new THREE.Color(0x30c7c9), // teal
        new THREE.Color(0x4c7dff), // sapphire
        new THREE.Color(0x8c52ff), // violet
        new THREE.Color(0xff5da8), // rose
      ];

      for (let i = 0; i < segmentCount; i++) {
        const t0 = i / segmentCount;
        const t1 = (i + 1) / segmentCount;
        path.getPointAt(t0, p0);
        path.getPointAt(t1, p1);
        tangent.subVectors(p1, p0).normalize();

        lateral.crossVectors(tangent, up);
        if (lateral.lengthSq() < 0.0001) {
          lateral.crossVectors(tangent, altUp);
        }
        lateral.normalize();
        normal.crossVectors(lateral, tangent).normalize();

        mid.lerpVectors(p0, p1, 0.5);
        basis.makeBasis(lateral, tangent, normal);
        quat.setFromRotationMatrix(basis);

        const segLen = Math.max(5, p0.distanceTo(p1));
        const width = THREE.MathUtils.lerp(44, 84, Math.random());
        aboutCrystalPanelSeedsRef.current.push({
          position: mid.clone(),
          quaternion: quat.clone(),
          scale: new THREE.Vector3(width, segLen * 1.22, 1),
          reveal: i / Math.max(1, segmentCount - 1),
        });

        // Seed violent shatter vectors inspired by the old About slide explosion.
        toCenter.copy(mid).normalize();
        if (toCenter.lengthSq() < 1e-6) {
          toCenter.set(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5,
          );
        }
        toCenter.normalize();
        randomDir
          .set(
            Math.sin(i * 2.13 + 0.71),
            Math.cos(i * 1.71 + 1.12),
            Math.sin(i * 3.07 + 2.04),
          )
          .normalize();
        burstDir
          .copy(toCenter)
          .multiplyScalar(0.68)
          .addScaledVector(randomDir, 0.92)
          .normalize();
        tangentDir.crossVectors(burstDir, randomDir);
        if (tangentDir.lengthSq() < 1e-6) {
          tangentDir.crossVectors(
            burstDir,
            Math.abs(burstDir.y) < 0.85 ? up : altUp,
          );
        }
        tangentDir.normalize();
        normalDir.crossVectors(burstDir, tangentDir).normalize();
        spinAxisA
          .set(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
          )
          .normalize();
        spinAxisB
          .set(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
          )
          .normalize();
        if (spinAxisA.lengthSq() < 1e-6) spinAxisA.set(0.47, 0.63, -0.62);
        if (spinAxisB.lengthSq() < 1e-6) spinAxisB.set(-0.28, 0.86, 0.42);
        aboutCrystalPanelShatterRef.current.push({
          burstDirection: burstDir.clone(),
          tangentDirection: tangentDir.clone(),
          normalDirection: normalDir.clone(),
          spinAxisPrimary: spinAxisA.clone(),
          spinAxisSecondary: spinAxisB.clone(),
          spinRatePrimary: THREE.MathUtils.lerp(3.8, 8.6, Math.random()),
          spinRateSecondary: THREE.MathUtils.lerp(2.4, 6.2, Math.random()),
          launchDelay: THREE.MathUtils.lerp(0, 0.22, Math.random()),
          burstImpulse: THREE.MathUtils.lerp(0.82, 1.28, Math.random()),
          driftPhase: Math.random() * Math.PI * 2,
          driftAmount: THREE.MathUtils.lerp(8, 28, Math.random()),
        });
        aboutCrystalPanelMatricesRef.current.push(new THREE.Matrix4());

        const paletteIndex =
          (Math.floor(i / 12) + Math.floor(Math.random() * 3)) %
          crystalColorPalette.length;
        color
          .copy(crystalColorPalette[paletteIndex] ?? new THREE.Color(0x4c7dff))
          .offsetHSL(THREE.MathUtils.randFloatSpread(0.02), 0, 0)
          .lerp(
            new THREE.Color(0xffffff),
            THREE.MathUtils.lerp(0.06, 0.18, Math.random()),
          );
        panelMesh.setColorAt(i, color);
      }
      panelMesh.instanceColor!.needsUpdate = true;
      group.add(panelMesh);
      aboutCrystalPanelMeshRef.current = panelMesh;

      const surgeCount = 5;
      const surgePointCount = 32;
      for (let i = 0; i < surgeCount; i++) {
        const positions = new Float32Array(surgePointCount * 3);
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const lineColor = new THREE.Color().setHSL(
          THREE.MathUtils.lerp(0.52, 0.74, Math.random()),
          0.88,
          THREE.MathUtils.lerp(0.56, 0.76, Math.random()),
        );
        const mat = new THREE.LineBasicMaterial({
          color: lineColor,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const line = new THREE.Line(geom, mat);
        line.frustumCulled = false;
        line.renderOrder = 12;
        line.visible = false;
        group.add(line);
        aboutCrystalSurgesRef.current.push({
          line,
          positions,
          headT: Math.random(),
          speed: THREE.MathUtils.lerp(0.055, 0.14, Math.random()),
          length: THREE.MathUtils.lerp(0.035, 0.082, Math.random()),
        });
      }
    };

    let raf = 0;
    let prevNow = performance.now();
    const tmp = new THREE.Vector3();
    const tmpTan = new THREE.Vector3();
    const tmpTarget = new THREE.Vector3();
    const tmpCameraToSun = new THREE.Vector3();
    const tmpLateral = new THREE.Vector3();
    const tmpPosBlend = new THREE.Vector3();
    const tmpTargetBlend = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - prevNow) / 1000);
      prevNow = now;

      aboutMjolnirRef.current?.update(
        dt,
        now / 1000,
        sceneRef.current.camera?.position,
      );

      const journey = aboutJourneyRef.current;
      const scene = sceneRef.current.scene;
      if (!journey || !scene) return;

      const path = journey.cosmicPath;
      const phase = journey.phase;
      const shouldShowCrystal =
        !!path &&
        (phase === AboutJourneyPhase.PATH_READY ||
          phase === AboutJourneyPhase.PATH_TRAVEL ||
          phase === AboutJourneyPhase.PATH_DISPERSING);

      if (!shouldShowCrystal) {
        const group = aboutCrystalPathGroupRef.current;
        if (group) group.visible = false;
        if (rideMessageRuntime.activeIndex >= 0) {
          disposeRideMessages();
        }
        return;
      }

      const group = ensureCrystalGroup();
      if (!group || !path) return;
      group.visible = true;

      if (
        aboutCrystalPathRef.current !== path ||
        !aboutCrystalPanelMeshRef.current
      ) {
        buildCrystalPath(path);
      }
      if (rideMessageRuntime.path !== path) {
        buildRideMessages(path);
      }

      const panelMesh = aboutCrystalPanelMeshRef.current;
      if (!panelMesh) return;
      const seeds = aboutCrystalPanelSeedsRef.current;
      const shatterSeeds = aboutCrystalPanelShatterRef.current;
      const matrices = aboutCrystalPanelMatricesRef.current;

      const crystalProgress = journey.pathCrystallizationActive
        ? journey.pathCrystallizationProgress
        : 1;
      if (
        phase === AboutJourneyPhase.PATH_DISPERSING &&
        aboutCrystalShatterPhaseRef.current !==
          AboutJourneyPhase.PATH_DISPERSING
      ) {
        aboutCrystalShatterUntilRef.current = now + ABOUT_RETARGET_SHATTER_MS;
        aboutCrystalDispersingStartedAtRef.current = now;

        const controls = sceneRef.current.controls;
        const camera = sceneRef.current.camera;
        if (controls && camera) {
          const controlsAny = controls as CameraControls & {
            getTarget?: (out: THREE.Vector3, receiveEndValue?: boolean) => void;
          };
          if (controlsAny.getTarget) {
            controlsAny.getTarget(dispersalPanRuntime.startTarget, false);
          } else {
            camera.getWorldDirection(tmpTarget);
            dispersalPanRuntime.startTarget
              .copy(camera.position)
              .addScaledVector(tmpTarget, 220);
          }
          dispersalPanRuntime.startCameraPos.copy(camera.position);

          const sunAnchor = sceneRef.current.sunLight;
          if (sunAnchor) {
            // After a hammer strike, keep watching the impact instead.
            dispersalPanRuntime.targetTarget.copy(
              journey.dispersalImpactPoint ?? sunAnchor.position,
            );
          } else {
            camera.getWorldDirection(tmpTarget);
            dispersalPanRuntime.targetTarget
              .copy(camera.position)
              .addScaledVector(tmpTarget, 360);
          }

          tmpCameraToSun
            .subVectors(
              dispersalPanRuntime.targetTarget,
              dispersalPanRuntime.startCameraPos,
            )
            .normalize();
          tmpLateral.crossVectors(tmpCameraToSun, worldUp);
          if (tmpLateral.lengthSq() < 1e-4) {
            tmpLateral.set(1, 0, 0);
          } else {
            tmpLateral.normalize();
          }
          dispersalPanRuntime.targetCameraPos
            .copy(dispersalPanRuntime.startCameraPos)
            .addScaledVector(tmpLateral, 52)
            .addScaledVector(worldUp, 14);
          dispersalPanRuntime.startedAt = now;
          // After a hammer strike the camera already faces the impact; no pan.
          dispersalPanRuntime.active = !journey.dispersalImpactPoint;
        } else {
          dispersalPanRuntime.active = false;
        }
      }
      if (
        phase !== AboutJourneyPhase.PATH_DISPERSING &&
        aboutCrystalShatterPhaseRef.current ===
          AboutJourneyPhase.PATH_DISPERSING
      ) {
        aboutCrystalDispersingStartedAtRef.current = 0;
        dispersalPanRuntime.active = false;
      }
      aboutCrystalShatterPhaseRef.current = phase;
      const shatterRemaining = Math.max(
        0,
        aboutCrystalShatterUntilRef.current - now,
      );
      const shatterActive = shatterRemaining > 0;
      const shatterT = shatterActive
        ? 1 - shatterRemaining / ABOUT_RETARGET_SHATTER_MS
        : 0;
      const dispersingActive = phase === AboutJourneyPhase.PATH_DISPERSING;
      const dispersingT = dispersingActive
        ? THREE.MathUtils.clamp(
            (now - aboutCrystalDispersingStartedAtRef.current) /
              ABOUT_CRYSTAL_DISPERSING_FADE_MS,
            0,
            1,
          )
        : 0;

      if (dispersingActive && dispersalPanRuntime.active) {
        const controls = sceneRef.current.controls;
        if (!controls) {
          dispersalPanRuntime.active = false;
        } else {
          const panT = THREE.MathUtils.clamp(
            (now - dispersalPanRuntime.startedAt) /
              Math.max(1, dispersalPanRuntime.durationMs),
            0,
            1,
          );
          const easedPan = panT * panT * (3 - 2 * panT);
          tmpPosBlend.lerpVectors(
            dispersalPanRuntime.startCameraPos,
            dispersalPanRuntime.targetCameraPos,
            easedPan,
          );
          tmpTargetBlend.lerpVectors(
            dispersalPanRuntime.startTarget,
            dispersalPanRuntime.targetTarget,
            easedPan,
          );

          controls.setLookAt(
            tmpPosBlend.x,
            tmpPosBlend.y,
            tmpPosBlend.z,
            tmpTargetBlend.x,
            tmpTargetBlend.y,
            tmpTargetBlend.z,
            false,
          );
        }
      }
      const explosionActive = shatterActive || dispersingActive;
      const panelMaterial = panelMesh.material as THREE.MeshBasicMaterial;
      const shatterTravelT = shatterActive ? Math.pow(shatterT, 0.82) : 0;
      const shatterFadeT = shatterActive
        ? THREE.MathUtils.clamp((shatterT - 0.66) / 0.34, 0, 1)
        : 0;
      const explosionTravelT = explosionActive
        ? Math.max(shatterTravelT, Math.pow(dispersingT, 0.72))
        : 0;
      const explosionFadeT = explosionActive
        ? Math.max(shatterFadeT, dispersingT)
        : 0;
      panelMaterial.opacity = explosionActive
        ? THREE.MathUtils.lerp(0.84, 0.0, explosionFadeT)
        : THREE.MathUtils.lerp(0.36, 0.74, crystalProgress);
      // Same glow ramp the emissive intensity used to follow, as a brightness.
      const panelGlow = THREE.MathUtils.lerp(
        explosionActive ? 0.7 : 0.26,
        explosionActive ? 1.45 : 0.84,
        explosionActive ? Math.min(1, explosionTravelT * 1.1) : crystalProgress,
      );
      panelMaterial.color.setScalar(0.55 + panelGlow * 0.45);

      const staticPose = !explosionActive && crystalProgress >= 1;
      for (
        let i = 0;
        i < seeds.length && !(staticPose && crystalMatricesStatic);
        i++
      ) {
        const seed = seeds[i];
        const shatterSeed = shatterSeeds[i];
        if (!seed || !shatterSeed) continue;
        const w = THREE.MathUtils.clamp(
          (crystalProgress - seed.reveal + 0.06) / 0.16,
          0,
          1,
        );
        const alpha = w * w * (3 - 2 * w);
        const shatterScale = explosionActive
          ? Math.max(0.01, alpha * (1 - explosionFadeT * 0.94))
          : Math.max(0.02, alpha);
        tempScale.copy(seed.scale).multiplyScalar(shatterScale);
        tempPos.copy(seed.position);
        tempQuat.copy(seed.quaternion);
        if (explosionActive) {
          const travelT = THREE.MathUtils.clamp(
            (shatterT - shatterSeed.launchDelay) /
              Math.max(0.001, 1 - shatterSeed.launchDelay),
            0,
            1,
          );
          const easedTravel = Math.max(
            Math.pow(travelT, 0.72),
            Math.pow(dispersingT, 0.72),
          );
          const primaryDist = THREE.MathUtils.lerp(
            0,
            520 * shatterSeed.burstImpulse,
            easedTravel,
          );
          const lateralDist =
            Math.sin(travelT * 9 + shatterSeed.driftPhase) *
            shatterSeed.driftAmount *
            (0.35 + easedTravel);
          const verticalDist =
            Math.cos(travelT * 5 + shatterSeed.driftPhase * 0.6) *
              shatterSeed.driftAmount *
              0.45 +
            easedTravel * easedTravel * 90;
          tempPos
            .addScaledVector(shatterSeed.burstDirection, primaryDist)
            .addScaledVector(shatterSeed.tangentDirection, lateralDist)
            .addScaledVector(shatterSeed.normalDirection, verticalDist);

          deltaQuat.setFromAxisAngle(
            shatterSeed.spinAxisPrimary,
            shatterSeed.spinRatePrimary * easedTravel,
          );
          deltaQuatB.setFromAxisAngle(
            shatterSeed.spinAxisSecondary,
            shatterSeed.spinRateSecondary * easedTravel * 0.85,
          );
          tempQuat.multiply(deltaQuat).multiply(deltaQuatB).normalize();
        }
        matrices[i].compose(tempPos, tempQuat, tempScale);
        panelMesh.setMatrixAt(i, matrices[i]);
      }
      if (!(staticPose && crystalMatricesStatic)) {
        panelMesh.instanceMatrix.needsUpdate = true;
        crystalMatricesStatic = staticPose;
      }

      if (phase === AboutJourneyPhase.PATH_TRAVEL) {
        const travelDist = journey.travelPathDistance;
        const fadeDistance = Math.max(
          40,
          rideMessageRuntime.triggerStep * 0.72,
        );
        const plateauDistance = Math.max(
          8,
          rideMessageRuntime.triggerStep * 0.22,
        );

        let bestIndex = -1;
        let bestOpacity = 0;
        for (let i = 0; i < rideMessageRuntime.triggerDistances.length; i++) {
          const trigger = rideMessageRuntime.triggerDistances[i] ?? 0;
          const delta = Math.abs(travelDist - trigger);
          if (delta > fadeDistance) continue;

          const t =
            delta <= plateauDistance
              ? 0
              : THREE.MathUtils.clamp(
                  (delta - plateauDistance) /
                    Math.max(0.001, fadeDistance - plateauDistance),
                  0,
                  1,
                );
          const opacity =
            delta <= plateauDistance ? 1 : 1 - t * t * (3 - 2 * t);
          if (opacity > bestOpacity) {
            bestOpacity = opacity;
            bestIndex = i;
          }
        }

        if (bestIndex !== rideMessageRuntime.activeIndex) {
          if (bestIndex >= 0) {
            activateRideMessage(bestIndex);
          } else if (rideMessageRuntime.activeIndex >= 0) {
            hideRideMessageOverlay();
            rideMessageRuntime.activeIndex = -1;
            setAboutRideMessageView(null);
          }
        }

        if (rideMessageRuntime.activeIndex >= 0) {
          const opacity = bestOpacity;
          const overlay = aboutRideMessageOverlayRef.current;
          if (overlay) {
            overlay.style.opacity = `${opacity}`;
          }
        }
      } else if (rideMessageRuntime.activeIndex >= 0) {
        hideRideMessageOverlay();
        rideMessageRuntime.activeIndex = -1;
        setAboutRideMessageView(null);
      }

      const surgeVisible =
        (crystalProgress >= 1 && phase === AboutJourneyPhase.PATH_TRAVEL) ||
        shatterActive;
      const surges = aboutCrystalSurgesRef.current;
      if (!surges.length) return;

      for (const surge of surges) {
        surge.line.visible = surgeVisible;
        if (!surgeVisible) continue;

        surge.headT = (surge.headT + surge.speed * dt) % 1;
        const pointCount = surge.positions.length / 3;
        for (let p = 0; p < pointCount; p++) {
          const trail = p / Math.max(1, pointCount - 1);
          const t = THREE.MathUtils.euclideanModulo(
            surge.headT - trail * surge.length,
            1,
          );
          path.getPointAt(t, tmp);
          path.getTangentAt(t, tmpTan).normalize();
          surge.positions[p * 3] = tmp.x;
          surge.positions[p * 3 + 1] =
            tmp.y - 8 + Math.sin(now * 0.003 + p * 0.5) * 1.8;
          surge.positions[p * 3 + 2] = tmp.z;
        }

        const geo = surge.line.geometry as THREE.BufferGeometry;
        const attr = geo.attributes.position as THREE.BufferAttribute;
        attr.needsUpdate = true;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      disposeRideMessages();
      disposeCrystalGroup();
    };
    // Stable for the scene's lifetime (content loads before mount), so this still runs once.
  }, [aboutPathRideMessages]);

  const recomputeAboutTramInput = useCallback(() => {
    const upHeld =
      aboutTramKeyUpHeldRef.current || aboutTramPointerUpHeldRef.current;
    const downHeld =
      aboutTramKeyDownHeldRef.current || aboutTramPointerDownHeldRef.current;
    setAboutTramUpHeld((prev) => (prev === upHeld ? prev : upHeld));
    setAboutTramDownHeld((prev) => (prev === downHeld ? prev : downHeld));

    const journey = aboutJourneyRef.current;
    if (!journey || journey.phase !== AboutJourneyPhase.PATH_TRAVEL) {
      journey?.setTravelInputDirection(0);
      return;
    }

    let nextDirection: -1 | 0 | 1 = 0;
    if (downHeld && journey.travelCruiseEnabled) {
      nextDirection = -1;
    } else if (upHeld !== downHeld) {
      nextDirection = upHeld ? 1 : -1;
    }
    journey.setTravelInputDirection(nextDirection);
  }, []);

  const releaseAllAboutTramInput = useCallback(() => {
    aboutTramKeyUpHeldRef.current = false;
    aboutTramKeyDownHeldRef.current = false;
    aboutTramPointerUpHeldRef.current = false;
    aboutTramPointerDownHeldRef.current = false;
    recomputeAboutTramInput();
  }, [recomputeAboutTramInput]);

  const setAboutTramPointerHold = useCallback(
    (direction: -1 | 1, held: boolean) => {
      if (direction > 0) {
        aboutTramPointerUpHeldRef.current = held;
      } else {
        aboutTramPointerDownHeldRef.current = held;
      }
      recomputeAboutTramInput();
    },
    [recomputeAboutTramInput],
  );

  const triggerAboutRetargetDispersal = useCallback((reason: string) => {
    const journey = aboutJourneyRef.current;
    if (!journey) return;
    setAboutSkipCinematicPromptVisible(false);
    const isPathPhase =
      journey.phase === AboutJourneyPhase.PATH_READY ||
      journey.phase === AboutJourneyPhase.PATH_TRAVEL;
    if (!isPathPhase) {
      journey.exit();
      return;
    }

    if (aboutRetargetDispersalTimeoutRef.current !== null) {
      window.clearTimeout(aboutRetargetDispersalTimeoutRef.current);
      aboutRetargetDispersalTimeoutRef.current = null;
    }

    const crystalVisible =
      !!aboutCrystalPanelMeshRef.current &&
      !!aboutCrystalPathGroupRef.current &&
      aboutCrystalPathGroupRef.current.visible;
    if (!crystalVisible) {
      journey.beginPathDispersal(reason);
      return;
    }

    const shatterMs = ABOUT_RETARGET_SHATTER_MS;
    aboutCrystalShatterUntilRef.current = performance.now() + shatterMs;
    journey.setTravelInputDirection(0);
    aboutRetargetDispersalTimeoutRef.current = window.setTimeout(() => {
      aboutRetargetDispersalTimeoutRef.current = null;
      journey.beginPathDispersal(reason);
    }, shatterMs);
  }, []);

  const dismissAboutSkipCinematicPrompt = useCallback(() => {
    setAboutSkipCinematicPromptVisible(false);
  }, []);

  const chooseAboutSkipCinematic = useCallback(
    (skip: boolean) => {
      if (skip) {
        aboutParticleSwarmRef.current?.forcePathFormationComplete();
        aboutJourneyRef.current?.skipCinematicToPathTravel();
      }
      dismissAboutSkipCinematicPrompt();
    },
    [dismissAboutSkipCinematicPrompt],
  );

  useEffect(() => {
    return () => {
      if (aboutRetargetDispersalTimeoutRef.current !== null) {
        window.clearTimeout(aboutRetargetDispersalTimeoutRef.current);
        aboutRetargetDispersalTimeoutRef.current = null;
      }
    };
  }, []);

  const toggleAboutTramCameraReverse = useCallback(() => {
    setAboutTramCameraReversed((prev) => {
      const next = !prev;
      aboutJourneyRef.current?.setTravelCameraReversed(next);
      return next;
    });
  }, []);

  const setAboutTramCameraModeWithSync = useCallback(
    (mode: AboutTravelCameraMode) => {
      setAboutTramCameraMode(mode);
      const journey = aboutJourneyRef.current;
      journey?.setTravelCameraMode(mode);
      if (mode === "free") {
        setAboutTramCameraReversed(false);
        journey?.setTravelCameraReversed(false);
      }
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!ABOUT_TRAM_HUD_ENABLED) return;
      const journey = aboutJourneyRef.current;
      if (!journey || journey.phase !== AboutJourneyPhase.PATH_TRAVEL) return;

      if (event.code === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (!aboutTramKeyUpHeldRef.current) {
          aboutTramKeyUpHeldRef.current = true;
          recomputeAboutTramInput();
        }
      } else if (event.code === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (!aboutTramKeyDownHeldRef.current) {
          aboutTramKeyDownHeldRef.current = true;
          recomputeAboutTramInput();
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!ABOUT_TRAM_HUD_ENABLED) return;
      if (event.code === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (aboutTramKeyUpHeldRef.current) {
          aboutTramKeyUpHeldRef.current = false;
          recomputeAboutTramInput();
        }
      } else if (event.code === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (aboutTramKeyDownHeldRef.current) {
          aboutTramKeyDownHeldRef.current = false;
          recomputeAboutTramInput();
        }
      }
    };

    const onPointerUp = () => {
      if (
        aboutTramPointerUpHeldRef.current ||
        aboutTramPointerDownHeldRef.current
      ) {
        aboutTramPointerUpHeldRef.current = false;
        aboutTramPointerDownHeldRef.current = false;
        recomputeAboutTramInput();
      }
    };

    const onWindowBlur = () => {
      releaseAllAboutTramInput();
    };

    const phaseSyncInterval = window.setInterval(() => {
      const journey = aboutJourneyRef.current;
      const inPathForming = journey?.phase === AboutJourneyPhase.PATH_FORMING;
      const inPathTravel = journey?.phase === AboutJourneyPhase.PATH_TRAVEL;
      if (!inPathForming && aboutSkipCinematicPromptVisible) {
        dismissAboutSkipCinematicPrompt();
      }
      const hudVisible = ABOUT_TRAM_HUD_ENABLED && inPathTravel;
      setAboutTramHudVisible((prev) =>
        prev === hudVisible ? prev : hudVisible,
      );
      if (hudVisible && journey) {
        const nextMomentum = journey.travelMomentumNormalized;
        setAboutTramMomentumNorm((prev) =>
          Math.abs(prev - nextMomentum) < 0.001 ? prev : nextMomentum,
        );
        const nextCruiseEnabled = journey.travelCruiseEnabled;
        setAboutTramCruiseEnabled((prev) =>
          prev === nextCruiseEnabled ? prev : nextCruiseEnabled,
        );
        const nextCruiseThreshold = journey.travelCruiseThresholdNormalized;
        setAboutTramCruiseThresholdNorm((prev) =>
          Math.abs(prev - nextCruiseThreshold) < 0.001
            ? prev
            : nextCruiseThreshold,
        );
        const nextCamRev = journey.travelCameraReversed;
        setAboutTramCameraReversed((prev) =>
          prev === nextCamRev ? prev : nextCamRev,
        );
        const nextCamMode = journey.travelCameraMode;
        setAboutTramCameraMode((prev) =>
          prev === nextCamMode ? prev : nextCamMode,
        );
      } else {
        setAboutTramMomentumNorm((prev) => (prev === 0 ? prev : 0));
        setAboutTramCruiseEnabled((prev) => (prev ? false : prev));
        setAboutTramCameraMode((prev) =>
          prev === "forward" ? prev : "forward",
        );
        setAboutTramCameraReversed((prev) => {
          if (!prev) return prev;
          journey?.setTravelCameraReversed(false);
          return false;
        });
        journey?.setTravelCameraMode("forward");
        releaseAllAboutTramInput();
      }
    }, 120);

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    window.addEventListener("pointercancel", onPointerUp, { capture: true });
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.clearInterval(phaseSyncInterval);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      window.removeEventListener("pointercancel", onPointerUp, {
        capture: true,
      });
      window.removeEventListener("blur", onWindowBlur);
      releaseAllAboutTramInput();
    };
  }, [
    aboutSkipCinematicPromptVisible,
    dismissAboutSkipCinematicPrompt,
    recomputeAboutTramInput,
    releaseAllAboutTramInput,
  ]);
  // About ride: hover and click Mjolnir while it hovers in front of the rider.
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hovered = false;

    const hitsMjolnir = (event: MouseEvent): boolean => {
      const journey = aboutJourneyRef.current;
      const mjolnir = aboutMjolnirRef.current;
      const renderer = rendererRef.current;
      const camera = sceneRef.current.camera;
      if (!journey?.awaitingGrab || !mjolnir || !renderer || !camera) {
        return false;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return mjolnir.hitTest(raycaster);
    };

    const setHovered = (next: boolean) => {
      if (next === hovered) return;
      hovered = next;
      aboutMjolnirRef.current?.setHovered(next);
      const canvas = rendererRef.current?.domElement;
      if (canvas) canvas.style.cursor = next ? "pointer" : "";
    };

    const onPointerMove = (event: PointerEvent) => {
      setHovered(hitsMjolnir(event));
    };
    const onClick = (event: MouseEvent) => {
      if (!hitsMjolnir(event)) return;
      // Keep the click from also selecting whatever is behind the hammer.
      event.preventDefault();
      event.stopImmediatePropagation();
      setHovered(false);
      aboutJourneyRef.current?.grabCompanion();
    };

    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("click", onClick, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("click", onClick, { capture: true });
    };
  }, []);

  const skillsSDPatrolStateRef = useRef<{ angle: number }>({
    angle: Math.PI * 0.25,
  });
  const moonTravelSignCatalog = useMemo(() => {
    const experience = (resumeData as { experience?: unknown }).experience;
    const entries = Array.isArray(experience)
      ? (experience as Array<Record<string, unknown>>)
      : [];
    const normalizeMemoryType = (value: unknown): JobMemoryType => {
      const raw = String(value ?? "")
        .trim()
        .toLowerCase();
      if (
        raw === "tech" ||
        raw === "code" ||
        raw === "memory" ||
        raw === "default"
      )
        return raw;
      return "default";
    };
    const catalog = new Map<string, { pool: JobMemoryEntry[] }>();
    entries.forEach((entry) => {
      const id = String(entry.id ?? "").toLowerCase();
      if (!id) return;
      const sequence = Array.isArray(entry.jobMemories)
        ? (entry.jobMemories as unknown[])
            .map((v) => {
              if (typeof v === "string") {
                const text = v.trim();
                if (!text) return null;
                return { text, type: "default" as JobMemoryType };
              }
              if (!v || typeof v !== "object") return null;
              const obj = v as { text?: unknown; type?: unknown };
              const text = String(obj.text ?? "").trim();
              if (!text) return null;
              return { text, type: normalizeMemoryType(obj.type) };
            })
            .filter((v): v is JobMemoryEntry => !!v)
        : [];
      const company = String(entry.company ?? "").trim();
      if (sequence.length > 0) catalog.set(id, { pool: sequence });
      else if (company)
        catalog.set(id, { pool: [{ text: company, type: "default" }] });
    });
    return catalog;
  }, []);
  const buildMoonTravelSignText = useCallback(
    (companyId: string) => {
      const id = companyId.toLowerCase();
      const record = moonTravelSignCatalog.get(id);
      const pool =
        moonTravelSignActiveCompanyRef.current === id &&
        moonTravelSignPoolRef.current.length > 0
          ? moonTravelSignPoolRef.current
          : (record?.pool ?? []);
      if (pool.length === 0) return null;
      const cursor = THREE.MathUtils.euclideanModulo(
        moonTravelSignPoolCursorRef.current,
        pool.length,
      );
      const item = pool[cursor] ?? null;
      const nextCursor = (cursor + 1) % pool.length;
      moonTravelSignPoolCursorRef.current = nextCursor;
      if (pool.length > 0 && nextCursor === 0) {
        moonTravelSignSequenceWrappedRef.current = true;
      }
      if (!item) return null;
      return {
        item,
        index: cursor,
      };
    },
    [moonTravelSignCatalog],
  );
  const skillsSDLockActiveRef = useRef(false);
  const skillsLatticeRootRef = useRef<THREE.Group | null>(null);
  const skillsLatticeNodesRef = useRef<SkillsLatticeNodeRecord[]>([]);
  const skillsLatticeLineMatsRef = useRef<THREE.LineBasicMaterial[]>([]);
  const skillsLatticeLineGroupsRef = useRef<SkillsLatticeLineGroup[]>([]);
  const skillsLatticeLinkSegmentsRef = useRef<SkillsLatticeLinkSegment[]>([]);
  const skillsLatticeArcRecordsRef = useRef<SkillsLatticeArcRecord[]>([]);
  const skillsLatticeFlowPointsRef = useRef<THREE.Points | null>(null);
  const skillsLatticeFlowMetaRef = useRef<SkillsLatticeFlowMeta[]>([]);
  const skillsLatticeEnvelopeRef = useRef<THREE.Mesh | null>(null);
  const skillsLatticeEnvelopeMatRef = useRef<THREE.MeshPhongMaterial | null>(
    null,
  );
  const skillsLatticeEnvelopeBasicMatRef =
    useRef<THREE.MeshBasicMaterial | null>(null);
  const skillsLatticeEnvelopeEdgeMatRef =
    useRef<THREE.LineBasicMaterial | null>(null);
  const skillsLatticeEnvelopeRadiusRef = useRef(0);
  const skillsLatticeEnvelopeInsideRef = useRef<boolean | null>(null);
  const skillsLatticeReturnViewRef = useRef<{
    cam: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const skillsLatticeHomeViewRef = useRef<{
    cam: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const skillsLatticeBeaconRef = useRef<THREE.Mesh | null>(null);
  const skillsLatticeBeaconMatRef = useRef<THREE.MeshPhongMaterial | null>(
    null,
  );
  const skillsLatticeBeaconEdgeMatRef = useRef<THREE.LineBasicMaterial | null>(
    null,
  );
  const skillsLatticeBeaconLabelRef = useRef<THREE.Object3D | null>(null);
  const skillsLatticeNodeLabelsRef = useRef<THREE.Object3D[]>([]);
  const skillsLatticeSystemActiveRef = useRef(false);
  const skillsLatticeCausticLightsRef = useRef<THREE.PointLight[]>([]);
  const externalCosmosLabelsHiddenForLatticeRef = useRef(false);
  const externalCosmosLabelsHiddenForAboutRef = useRef(false);
  const externalCosmosLabelsHiddenForPortfolioRef = useRef(false);
  const skillsLatticeRippleRef = useRef<{
    active: boolean;
    center: THREE.Vector3;
    startedAt: number;
  }>({
    active: false,
    center: new THREE.Vector3(),
    startedAt: 0,
  });
  const skillsLatticeSelectedNodeRef = useRef<SkillsLatticeNodeRecord | null>(
    null,
  );
  const skillsLegacyBodiesRef = useRef<THREE.Object3D[]>([]);
  const skillsLatticePendingEntryRef = useRef(false);
  const skillsLatticeActiveRef = useRef(false);
  const [skillsLatticeActive, setSkillsLatticeActive] = useState(false);
  const skillsLatticeEntrySequenceRef = useRef<{
    active: boolean;
    raf: number | null;
  }>({
    active: false,
    raf: null,
  });
  const skillsLatticePrevStateRef = useRef<{
    followingSpaceship: boolean;
    shipVisible: boolean;
    controlsEnabled: boolean;
  } | null>(null);
  const [skillsLatticeSelection, setSkillsLatticeSelection] = useState<{
    label: string;
    nodeType: "category" | "skill";
    category: string;
    path: string[];
    detailItems: string[];
  } | null>(null);
  const spaceshipCameraOffsetRef = useRef(
    new THREE.Vector3(0, FOLLOW_HEIGHT, FOLLOW_DISTANCE),
  );
  const cosmosIntroPlayedRef = useRef(false);
  const cosmosIntroCompletedRef = useRef(false);
  const introCameraPrealignedRef = useRef(false);

  const shipStagingModeRef = useRef(false);
  const shipStagingKeysRef = useRef<Record<string, boolean>>({
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    KeyR: false,
    KeyF: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    KeyQ: false,
    KeyE: false,
    ShiftLeft: false,
  });
  const shipCinematicRef = useRef<{
    active: boolean;
    phase: "orbit" | "approach" | "hover";
    startTime: number;
    duration: number;
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    controlPos: THREE.Vector3;
    controlPos2?: THREE.Vector3;
    flybyPoint?: THREE.Vector3;
    startQuat: THREE.Quaternion;
    endQuat: THREE.Quaternion;
    approachLookAt?: THREE.Vector3;
    lightsTriggered?: boolean;
    orbitStartTime?: number;
    orbitDuration?: number;
    orbitCenter?: THREE.Vector3;
    orbitRadius?: number;
    orbitStartAngle?: number;
    orbitEndAngle?: number;
    hoverStartTime?: number;
    hoverBasePos?: THREE.Vector3;
    hoverStartQuat?: THREE.Quaternion;
    spinStartOffset?: number;
    spinDuration?: number;
    spinTurns?: number;
    settleTargetPos?: THREE.Vector3;
    settleDuration?: number;
    cameraRetreatStartProgress?: number;
    cameraRetreatStartPos?: THREE.Vector3;
    cameraRetreatStartTarget?: THREE.Vector3;
  } | null>(null);
  // Ship UI phase (controls which buttons are visible)
  const [shipUIPhase, setShipUIPhase] = useState<ShipUIPhase>("hidden");
  // shipWanderIntervalRef removed — ship no longer wanders autonomously

  // Accumulated roll offset (radians), kept for nav orientation consistency.
  const shipRollOffsetRef = useRef<number>(0);

  const spaceshipLightsRef = useRef<THREE.PointLight[]>([]);
  const spaceshipEngineLightRef = useRef<THREE.PointLight | null>(null);
  const spaceshipPathRef = useRef<{
    currentIndex: number;
    progress: number;
    speed: number;
    targetSpeed: number;
    pauseTime: number;
    isPaused: boolean;
    rollSpeed: number;
    rollAmount: number;
    visitingMoon: boolean;
    moonVisitStartTime: number;
    moonVisitDuration: number;
    currentMoonTarget: THREE.Vector3 | null;
  }>({
    currentIndex: 0,
    progress: 0,
    speed: DEFAULT_SPACESHIP_PATH_SPEED,
    targetSpeed: DEFAULT_SPACESHIP_PATH_SPEED,
    pauseTime: 0,
    isPaused: false,
    rollSpeed: 0,
    rollAmount: 0,
    visitingMoon: false,
    moonVisitStartTime: 0,
    moonVisitDuration: DEFAULT_MOON_VISIT_DURATION, // 10 seconds
    currentMoonTarget: null,
  });

  // --- STAR DESTROYER refs ---
  const starDestroyerRef = useRef<THREE.Group | null>(null);
  const starDestroyerCruiserRef = useRef<StarDestroyerCruiser | null>(null);
  const starDestroyerMomentsRef = useRef<StarDestroyerMoments | null>(null);
  // SD configurator: always starts closed (open it from Console → Tools);
  // stable accessors for the panel.
  const [sdConfiguratorOpen, setSdConfiguratorOpen] = useState<boolean>(false);
  const openSdConfigurator = useCallback((open: boolean) => {
    writeSdConfiguratorOpen(open);
    setSdConfiguratorOpen(open);
  }, []);
  const getSdConfiguratorCamera = useCallback(
    () => sceneRef.current.camera as THREE.Camera | undefined,
    [],
  );
  const getSdConfiguratorMoments = useCallback(
    () => starDestroyerMomentsRef.current,
    [],
  );
  const getSdConfiguratorControls = useCallback(() => sceneRef.current.controls, []);
  const getSdConfiguratorDom = useCallback(
    () => rendererRef.current?.domElement,
    [],
  );
  // While the configurator is open the follow camera (and its idle sway) is
  // paused so the view holds still; restored on close.
  const sdConfiguratorFollowWasOnRef = useRef(false);
  /** Set once the intro camera has settled (and its view was recorded). */
  const sdIntroViewSettledRef = useRef(false);
  const freezeSdConfiguratorCamera = useCallback(() => {
    // Let the intro camera reach its real final pose before freezing, so the
    // recorded intro view is correct even if the configurator was left open.
    if (!sdIntroViewSettledRef.current) return;
    if (!followingSpaceshipRef.current) return;
    sdConfiguratorFollowWasOnRef.current = true;
    followingSpaceshipRef.current = false;
    setFollowingSpaceship(false);
  }, []);
  const releaseSdConfiguratorCamera = useCallback(() => {
    if (sdConfiguratorFollowWasOnRef.current) {
      followingSpaceshipRef.current = true;
      setFollowingSpaceship(true);
    }
    sdConfiguratorFollowWasOnRef.current = false;
  }, []);
  const starDestroyerDebugLastLogMsRef = useRef(0);
  const starDestroyerSkillsSnapPendingRef = useRef(false);
  const navMessageStateRef = useRef<{
    activeTarget: string | null;
    targetLabel: string | null;
    travelStartedAt: number;
    announcedLightspeed: boolean;
    lastDistance: number | null;
    lastTravelPhase: NavigationTravelPhase;
    arrivalAnnounced: boolean;
  }>({
    activeTarget: null,
    targetLabel: null,
    travelStartedAt: 0,
    announcedLightspeed: false,
    lastDistance: null,
    lastTravelPhase: "idle",
    arrivalAnnounced: false,
  });
  const experienceEndViewPendingRef = useRef(false);
  const previousNavigationTargetRef = useRef<string | null>(null);
  const measuredTravelSpeedRef = useRef(0);
  const measuredSpeedSampleRef = useRef<{
    t: number;
    pos: THREE.Vector3;
  } | null>(null);
  const navDistanceDerivedSpeedRef = useRef(0);
  const navDistanceSampleRef = useRef<{
    t: number;
    distance: number;
  } | null>(null);
  const telemetryLastNonZeroSpeedRef = useRef(0);
  const telemetryLastNonZeroAtRef = useRef(0);
  const [followingStarDestroyer, setFollowingStarDestroyer] = useState(false);
  const followingStarDestroyerRef = useRef(false);
  const shadowSDModeRef = useRef(false);
  const shadowSDLastTargetRef = useRef<THREE.Vector3 | null>(null);
  const shadowSDPrevControlLimitsRef = useRef<{
    minDistance: number;
    maxDistance: number;
  } | null>(null);
  const inspectFalconModeRef = useRef(false);
  const inspectFalconLastTargetRef = useRef<THREE.Vector3 | null>(null);
  const inspectFalconPrevStateRef = useRef<{
    followingSpaceship: boolean;
    insideShip: boolean;
    shipViewMode: "exterior" | "interior" | "cockpit";
    controlsMinDistance: number;
    controlsMaxDistance: number;
  } | null>(null);

  const formatNavTargetLabel = useCallback((targetId: string): string => {
    const company = resumeData.experience.find(
      (exp: any) => exp.id === targetId,
    );
    if (company) return company.navLabel || company.company || targetId;

    const known: Record<string, string> = {
      experience: "Experience",
      skills: "Skills",
      projects: "Projects",
      portfolio: "Portfolio",
      about: "About",
      home: "Home",
    };
    const lowered = targetId.toLowerCase();
    if (known[lowered]) return known[lowered];
    return targetId
      .replace(/-/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }, []);

  // Items ref to track orbital objects (moons, planets)
  const itemsRef = useRef<
    {
      mesh: THREE.Mesh;
      orbitSpeed: number;
      angle: number;
      distance: number;
      parent?: THREE.Object3D;
      detached?: boolean;
      originalParent?: THREE.Object3D;
      overlayMeshes?: THREE.Mesh[];
      overlayOffsets?: number[];
      overlayHeights?: number[];
    }[]
  >([]);

  // Ship Explore Mode — debug FPS camera to locate cockpit and other positions
  const [shipExploreMode, setShipExploreMode] = useState(false);
  const shipExploreModeRef = useRef(false);
  const shipExploreKeysRef = useRef<Record<string, boolean>>({
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    KeyQ: false,
    KeyE: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    ShiftLeft: false,
    ShiftRight: false,
  });
  const shipExploreCoordsRef = useRef<{
    local: [number, number, number];
    world: [number, number, number];
  }>({ local: [0, 0, 0], world: [0, 0, 0] });
  const [exploreCoords, setExploreCoords] = useState<{
    local: [number, number, number];
    world: [number, number, number];
  }>({ local: [0, 0, 0], world: [0, 0, 0] });
  const [exploreSavedPositions, setExploreSavedPositions] = useState<
    { label: string; local: [number, number, number] }[]
  >([]);

  // Manual flight control state
  const [manualFlightMode, setManualFlightMode] = useState(false);
  const manualFlightModeRef = useRef(false);
  const [keyboardUpdateTrigger, setKeyboardUpdateTrigger] = useState(0);
  const currentNavigationTargetRef = useRef<string | null>(null);
  const [invertControls, setInvertControls] = useState(false);
  const invertControlsRef = useRef(false);
  const [controlSensitivity, setControlSensitivity] = useState(
    DEFAULT_CONTROL_SENSITIVITY,
  ); // 0.1 to 2.0
  const controlSensitivityRef = useRef(DEFAULT_CONTROL_SENSITIVITY);
  const manualFlightRef = useRef<{
    velocity: THREE.Vector3;
    acceleration: number;
    maxSpeed: number;
    currentSpeed: number;
    pitch: number; // Rotation around X axis
    yaw: number; // Rotation around Y axis
    roll: number; // Rotation around Z axis
    targetPitch: number;
    targetYaw: number;
    targetRoll: number;
    isAccelerating: boolean;
    direction: { forward: number; right: number; up: number };
    turboStartTime: number;
    isTurboActive: boolean;
    isLightspeedActive: boolean;
  }>({
    velocity: new THREE.Vector3(),
    acceleration: 0,
    maxSpeed: 2.0,
    currentSpeed: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    targetPitch: 0,
    targetYaw: 0,
    targetRoll: 0,
    isAccelerating: false,
    direction: { forward: 0, right: 0, up: 0 },
    turboStartTime: 0,
    isTurboActive: false,
    isLightspeedActive: false,
  });

  // Keyboard state for manual controls
  const keyboardStateRef = useRef({
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    ShiftLeft: false,
    KeyQ: false, // Strafe left
    KeyE: false, // Strafe right
    KeyW: false, // Forward
    KeyS: false, // Backward
    KeyA: false, // Strafe left
    KeyD: false, // Strafe right
    KeyR: false, // Ascend
    KeyF: false, // Descend
    KeyX: false, // Brake
    KeyC: false, // Toggle cockpit
  });

  const [debugSnapToShip, setDebugSnapToShip] = useState(false);
  const debugSnapToShipRef = useRef(false);
  const startIntroSequenceRef = useRef<(() => void) | null>(null);
  const introStartQueuedRef = useRef(false);
  const introStartConsumedRef = useRef(false);
  const fastTrackConsumedRef = useRef(false);
  const cameraDriverTraceRef = useRef<string>("boot");
  const startupUiRevealTlRef = useRef<gsap.core.Timeline | null>(null);
  const runStartupUiRevealRef = useRef<(() => void) | null>(null);
  const startupDestinationsPanelRef = useRef<HTMLDivElement | null>(null);
  const startupConsoleButtonRef = useRef<HTMLButtonElement | null>(null);
  const startupMiniMapContainerRef = useRef<HTMLDivElement | null>(null);
  const [startupDestinationsVisible, setStartupDestinationsVisible] =
    useState(false);
  const [startupConsoleVisible, setStartupConsoleVisible] = useState(false);
  const [startupMiniMapVisible, setStartupMiniMapVisible] = useState(false);

  // Debug ship label state
  const [debugShipLabelMode, setDebugShipLabelMode] = useState(false);
  const debugShipLabelModeRef = useRef(false);
  const [debugShipLabel, setDebugShipLabel] =
    useState<ShipLabelTarget>("front");
  const debugShipLabelRef = useRef<ShipLabelTarget>("front");
  const [debugShipLabels, setDebugShipLabels] = useState<
    Partial<Record<ShipLabelTarget, ShipLabelInfo>>
  >({});
  const debugShipLabelsRef = useRef<
    Partial<Record<ShipLabelTarget, ShipLabelInfo>>
  >({});
  const debugHitMarkerRef = useRef<THREE.Mesh | null>(null);
  const debugShipLabelMarkersRef = useRef<THREE.Mesh[]>([]);
  const debugShipLabelMarksRef = useRef<
    Partial<Record<ShipLabelTarget, ShipLabelMark[]>>
  >({});
  const debugPointerDownRef = useRef<{
    x: number;
    y: number;
    t: number;
  } | null>(null);

  // Build navigation targets from resume data
  const navigationTargets = [
    {
      id: "experience",
      label: "Experience",
      type: "section" as const,
      icon: "◆",
    },
    { id: "skills", label: "Skills", type: "section" as const, icon: "◇" },
    {
      id: "about",
      label: "About",
      type: "section" as const,
      icon: "◎",
    },
    {
      id: "portfolio",
      label: "Portfolio",
      type: "section" as const,
      icon: "✦",
    },
    {
      id: ABOUT_MEMORY_SQUARE_NAV_ID,
      label: "Memory Squares",
      type: "section" as const,
      icon: "⊙",
    },
    {
      id: CAREER_GALLERY_NAV_ID,
      label: CAREER_GALLERY_NAV_LABEL,
      type: "section" as const,
      icon: "⬡",
    },
    ...resumeData.experience.map((exp) => ({
      id: exp.id,
      label: exp.navLabel || exp.company,
      type: "moon" as const,
      icon: "◦",
      parentId: "experience",
      startDate: exp.startDate,
      endDate: exp.endDate,
    })),
  ];

  // RULES
  // -----
  // - On moon visit, freeze only the current system so the camera can lock.
  // - Always capture the pre-visit moon orbit speed so exit can restore the
  //   exact prior state (moving vs. stopped, and original speed).
  // Centralized function to freeze orbital motion (call before ANY moon visit)
  // Defined early to be available for handleAutopilotNavigation
  const freezeOrbitalMotion = (moonMesh: THREE.Mesh) => {
    // Don't freeze if already frozen
    if (frozenOrbitalSpeedsRef.current) {
      vlog("🧊 Orbital motion already frozen - reusing frozen state");
      return;
    }

    const moonItemEntry = itemsRef.current.find((it) => it.mesh === moonMesh);
    if (!moonItemEntry) {
      vlog("⚠️ Could not find moon item entry");
      return;
    }

    vlog(`🧊 Freezing orbital motion for moon visit`);

    // Store the original speeds
    frozenOrbitalSpeedsRef.current = {
      parentPlanetOrbitSpeed: optionsRef.current.spaceOrbitSpeed,
      parentPlanetMoonOrbitSpeed: optionsRef.current.spaceMoonOrbitSpeed,
      moonOrbitSpeed: moonItemEntry.orbitSpeed,
      moonItemEntry: moonItemEntry,
    };

    vlog(
      `   Stored speeds: planet=${frozenOrbitalSpeedsRef.current.parentPlanetOrbitSpeed}, moonOrbit=${frozenOrbitalSpeedsRef.current.parentPlanetMoonOrbitSpeed}, thisMoon=${frozenOrbitalSpeedsRef.current.moonOrbitSpeed}`,
    );

    lastMoonOrbitSpeedRef.current = optionsRef.current.spaceMoonOrbitSpeed ?? 0;

    if (sceneRef.current.scene) {
      freezeSystemForMoon({
        moonMesh,
        items: itemsRef.current,
        scene: sceneRef.current.scene,
        frozenSystemStateRef,
        showOrbits: optionsRef.current.spaceShowOrbits !== false,
        vlog,
      });
    }

    // Freeze the speeds immediately
    if (onOptionsChange) {
      onOptionsChange({
        ...optionsRef.current,
        spaceMoonOrbitSpeed: 0,
      });
    }

    // Freeze this specific moon's orbit speed
    moonItemEntry.orbitSpeed = 0;

    vlog(`   ✅ All orbital motion frozen`);
  };

  // Autopilot navigation is handled by useNavigationSystem

  // Refs for cosmic systems
  const cameraDirectorRef = useRef<CosmosCameraDirector | null>(null);
  const focusedMoonRef = useRef<THREE.Mesh | null>(null);
  const tourGuideRef = useRef<CosmicTourGuide | null>(null);
  const navigationInterfaceRef = useRef<NavigationInterface | null>(null);
  const tourBuilderRef = useRef<TourDefinitionBuilder | null>(null);
  const planetsDataRef = useRef<Map<string, PlanetData>>(new Map());
  const enterMoonViewRef = useRef<
    | ((params: {
        moonMesh: THREE.Mesh;
        company: any;
        useFlight?: boolean;
      }) => void)
    | null
  >(null);
  const handleNavigationRef = useRef<
    ((target: string) => void | Promise<void>) | null
  >(null);

  // New navigation system refs
  const emitterRef = useRef(getOrbitalPositionEmitter());

  // Private setter for minDistance to make it easier to track where it's being set
  const setMinDistance = (value: number, reason?: string) => {
    if (sceneRef.current.controls) {
      sceneRef.current.controls.minDistance = value;
      if (reason) {
        vlog(`🔧 minDistance set to ${value} (${reason})`);
      }
    }
  };

  // Drag-to-rotate state for focused moon
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  // Track whether OrbitControls is actively being dragged by the user
  const controlsDraggingRef = useRef(false);
  // Store camera distance to focused moon when entering focus; used to detect zoom
  const focusedMoonCameraDistanceRef = useRef<number | null>(null);

  // Store original orbital speeds when focusing on a moon, so we can restore them on exit
  const frozenOrbitalSpeedsRef = useRef<{
    parentPlanetOrbitSpeed?: number;
    parentPlanetMoonOrbitSpeed?: number;
    moonOrbitSpeed?: number;
    moonItemEntry?: any; // Store the moon's item entry for speed restoration
  } | null>(null);
  const frozenSystemStateRef = useRef<FrozenSystemState | null>(null);
  const lastMoonOrbitSpeedRef = useRef<number | null>(null);
  const lastMoonSpinSpeedRef = useRef<number | null>(null);

  // Ref that stays true whenever moon orbit is active — used by pointer
  // interaction handlers to suppress moon-rotation drags and overlay-exit clicks.
  const orbitActiveRef = useRef(false);
  const pendingOrbitExitNavigationRef = useRef<{
    targetId: string;
    targetType: "section" | "moon";
    departure?: { moonCenter: THREE.Vector3; moonRadius: number };
  } | null>(null);

  const captureMoonDepartureContext = useCallback(() => {
    const moon = focusedMoonRef.current;
    if (!moon) return undefined;
    const moonCenter = new THREE.Vector3();
    moon.getWorldPosition(moonCenter);
    const geo = moon.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const moonRadius = (geo.boundingSphere?.radius ?? 30) * moon.scale.x;
    return { moonCenter, moonRadius };
  }, []);

  const ensureFalconTravelAudioNode = useCallback(() => {
    const camera = sceneRef.current.camera;
    if (!camera) return null;

    if (!falconTravelAudioListenerRef.current) {
      falconTravelAudioListenerRef.current = new THREE.AudioListener();
    }
    const listener = falconTravelAudioListenerRef.current;
    if (!attachAudioListenerToCamera(camera, listener)) return null;

    if (!falconTravelAudioRef.current) {
      falconTravelAudioRef.current = createPositionalAudio(listener, {
        // Keep Falcon cues anchored to listener/camera for readability,
        // even when the Falcon ship is visually far away.
        refDistance: 1,
        rolloffFactor: 0,
        maxDistance: 1,
      });
      falconTravelAudioRef.current.name = "FalconNavSfxCameraAnchored";
    }
    const positionalAudio = falconTravelAudioRef.current;
    if (positionalAudio.parent !== camera) {
      if (positionalAudio.parent)
        positionalAudio.parent.remove(positionalAudio);
      camera.add(positionalAudio);
    }
    return positionalAudio;
  }, []);

  const resumeFalconTravelAudioContext = useCallback(async () => {
    const listener = falconTravelAudioListenerRef.current;
    if (!listener) return;
    const ctx = listener.context;
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        // Browser policies may still block until a user gesture.
      }
    }
  }, []);

  const ensureOrbitalPortfolioToneAudioNode = useCallback(() => {
    const camera = sceneRef.current.camera;
    if (!falconTravelAudioListenerRef.current) {
      falconTravelAudioListenerRef.current = new THREE.AudioListener();
    }
    const listener = falconTravelAudioListenerRef.current;
    if (camera) {
      attachAudioListenerToCamera(camera, listener);
    }
    const runtime = orbitalPortfolioToneRuntimeRef.current;
    runtime.context = listener.context as AudioContext;
    if (runtime.context && !runtime.masterGain) {
      runtime.masterGain = runtime.context.createGain();
      runtime.masterGain.gain.value = THREE.MathUtils.clamp(
        overallVolume * SKILLS_LATTICE_TONE_MASTER_GAIN,
        0,
        0.09,
      );
      runtime.masterGain.connect(runtime.context.destination);
      if (ORBITAL_PORTFOLIO_DEBUG_LOGS) {
        shipLog(
          `[LATTICE-TONE] audio node created ctx=${runtime.context.state} gain=${runtime.masterGain.gain.value.toFixed(3)} volume=${overallVolume.toFixed(2)}`,
          "info",
        );
      }
    } else if (runtime.masterGain) {
      runtime.masterGain.gain.value = THREE.MathUtils.clamp(
        overallVolume * SKILLS_LATTICE_TONE_MASTER_GAIN,
        0,
        0.09,
      );
    }
    return runtime.context;
  }, [overallVolume, shipLog]);

  const resumeOrbitalPortfolioToneAudioContext = useCallback(async () => {
    const ctx = ensureOrbitalPortfolioToneAudioNode();
    if (!ctx) return;
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        // Browser policies may still block until a user gesture.
      }
    }
  }, [ensureOrbitalPortfolioToneAudioNode]);

  const playOrbitalPortfolioTone = useCallback((_freqHz: number) => {
    // Online keyboard/lattice synth audio removed by request.
  }, []);

  const getKeyboardStudioEngine = useCallback(() => {
    if (!keyboardStudioEngineRef.current) {
      keyboardStudioEngineRef.current = createKeyboardStudioEngine();
      keyboardStudioEngineRef.current.setMasterVolume(overallVolume);
    }
    return keyboardStudioEngineRef.current;
  }, [overallVolume]);
  const ensureOnscreenKeyboardAudioReady = useCallback(async () => {
    const engine = getKeyboardStudioEngine();
    await engine.ensureReady();
    engine.setMasterVolume(overallVolume);
    await engine.setSoundDesign(keyboardStudioSoundDesign);
    return engine;
  }, [getKeyboardStudioEngine, keyboardStudioSoundDesign, overallVolume]);
  const appendOnscreenKeyboardRecordedEvent = useCallback(
    (event: KeyboardRecordedNoteEvent) => {
      const normalized: KeyboardRecordedNoteEvent = {
        note: event.note,
        startMs: Math.max(0, Number(event.startMs) || 0),
        durationMs: Math.max(
          ONSCREEN_KEYBOARD_MIN_DURATION_MS,
          Number(event.durationMs) || 0,
        ),
        velocity: THREE.MathUtils.clamp(
          Number.isFinite(event.velocity)
            ? event.velocity
            : ONSCREEN_KEYBOARD_DEFAULT_VELOCITY,
          0.05,
          1,
        ),
      };
      const next = [
        ...onscreenKeyboardRecordedEventsRef.current,
        normalized,
      ].sort((a, b) => a.startMs - b.startMs);
      onscreenKeyboardRecordedEventsRef.current = next;
      setOnscreenKeyboardRecordedEvents(next);
    },
    [],
  );
  const trimKeyboardStudioEvents = useCallback(
    (events: KeyboardRecordedNoteEvent[]) => {
      if (events.length === 0) return [] as KeyboardRecordedNoteEvent[];
      const sorted = [...events]
        .map((event) => ({
          ...event,
          startMs: Math.max(0, Number(event.startMs) || 0),
          durationMs: Math.max(
            ONSCREEN_KEYBOARD_MIN_DURATION_MS,
            Number(event.durationMs) || 0,
          ),
        }))
        .sort((a, b) => a.startMs - b.startMs);
      const firstStart = sorted[0]?.startMs ?? 0;
      return sorted.map((event) => ({
        ...event,
        startMs: Math.max(0, event.startMs - firstStart),
      }));
    },
    [],
  );
  const previewKeyboardStudioControlFeedback = useCallback((note = "C5") => {
    const now = performance.now();
    if (now - keyboardStudioControlFeedbackLastAtRef.current < 70) return;
    keyboardStudioControlFeedbackLastAtRef.current = now;
    const engine = keyboardStudioEngineRef.current;
    if (!engine) return;
    engine.noteOn(note, 0.64);
    window.setTimeout(() => {
      keyboardStudioEngineRef.current?.noteOff(note);
    }, 120);
  }, []);
  const stopOnscreenKeyboardPlayback = useCallback(
    (resetTransport = true) => {
      if (resetTransport) {
        getKeyboardStudioEngine().stopPlayback();
      }
      setOnscreenKeyboardGhostPressedNotes([]);
      setOnscreenKeyboardPlaying(false);
    },
    [getKeyboardStudioEngine],
  );
  const finishOnscreenKeyboardRecordedNote = useCallback(
    (note: string, releaseAtMs: number) => {
      const active = onscreenKeyboardActiveNotesRef.current.get(note);
      if (!active) return;
      onscreenKeyboardActiveNotesRef.current.delete(note);
      const startMs = Math.max(
        0,
        active.startMs - onscreenKeyboardRecordStartRef.current,
      );
      const durationMs = Math.max(
        ONSCREEN_KEYBOARD_MIN_DURATION_MS,
        releaseAtMs - active.startMs,
      );
      appendOnscreenKeyboardRecordedEvent({
        note,
        startMs,
        durationMs,
        velocity: active.velocity,
      });
    },
    [appendOnscreenKeyboardRecordedEvent],
  );
  const startOnscreenKeyboardRecording = useCallback(async () => {
    await ensureOnscreenKeyboardAudioReady();
    stopOnscreenKeyboardPlayback();
    onscreenKeyboardRecordStartRef.current = performance.now();
    onscreenKeyboardActiveNotesRef.current.clear();
    onscreenKeyboardRecordedEventsRef.current = [];
    setOnscreenKeyboardRecordedEvents([]);
    onscreenKeyboardRecordingRef.current = true;
    setOnscreenKeyboardRecording(true);
  }, [ensureOnscreenKeyboardAudioReady, stopOnscreenKeyboardPlayback]);
  const stopOnscreenKeyboardRecording = useCallback(() => {
    if (!onscreenKeyboardRecordingRef.current) return;
    const releaseAtMs = performance.now();
    const activeNotes = Array.from(
      onscreenKeyboardActiveNotesRef.current.keys(),
    );
    activeNotes.forEach((note) =>
      finishOnscreenKeyboardRecordedNote(note, releaseAtMs),
    );
    onscreenKeyboardActiveNotesRef.current.clear();
    onscreenKeyboardRecordingRef.current = false;
    setOnscreenKeyboardRecording(false);
  }, [finishOnscreenKeyboardRecordedNote]);
  const playOnscreenKeyboardSequence = useCallback(
    async (events: KeyboardRecordedNoteEvent[]) => {
      const cleaned = events
        .map((event) => ({
          note: event.note,
          startMs: Math.max(0, Number(event.startMs) || 0),
          durationMs: Math.max(
            ONSCREEN_KEYBOARD_MIN_DURATION_MS,
            Number(event.durationMs) || 0,
          ),
          velocity: THREE.MathUtils.clamp(
            Number.isFinite(event.velocity)
              ? event.velocity
              : ONSCREEN_KEYBOARD_DEFAULT_VELOCITY,
            0.05,
            1,
          ),
        }))
        .filter(
          (event) =>
            Number.isFinite(event.startMs) && Number.isFinite(event.durationMs),
        )
        .sort((a, b) => a.startMs - b.startMs);
      if (cleaned.length === 0) return;
      const engine = await ensureOnscreenKeyboardAudioReady();
      stopOnscreenKeyboardRecording();
      stopOnscreenKeyboardPlayback();
      setOnscreenKeyboardPlaying(true);
      setOnscreenKeyboardGhostPressedNotes([]);
      await engine.playSequence(cleaned, {
        gain: 1,
        ghostPlayback: onscreenKeyboardGhostAutoplayRef.current,
        onStateChange: (playing) => setOnscreenKeyboardPlaying(playing),
        onNoteOn: (note) =>
          setOnscreenKeyboardGhostPressedNotes((prev) =>
            prev.includes(note) ? prev : [...prev, note],
          ),
        onNoteOff: (note) =>
          setOnscreenKeyboardGhostPressedNotes((prev) =>
            prev.filter((activeNote) => activeNote !== note),
          ),
      });
    },
    [
      ensureOnscreenKeyboardAudioReady,
      stopOnscreenKeyboardPlayback,
      stopOnscreenKeyboardRecording,
    ],
  );
  const playOnscreenKeyboardRecording = useCallback(() => {
    void playOnscreenKeyboardSequence(
      onscreenKeyboardRecordedEventsRef.current,
    );
  }, [playOnscreenKeyboardSequence]);
  const playOnscreenKeyboardAutoplay = useCallback(() => {
    const fallbackAutoplay: KeyboardRecordedNoteEvent[] = [
      { note: "C4", startMs: 0, durationMs: 460, velocity: 0.8 },
      { note: "E4", startMs: 360, durationMs: 460, velocity: 0.8 },
      { note: "G4", startMs: 720, durationMs: 460, velocity: 0.82 },
      { note: "C5", startMs: 1080, durationMs: 660, velocity: 0.85 },
      { note: "A4", startMs: 1840, durationMs: 420, velocity: 0.76 },
      { note: "G4", startMs: 2200, durationMs: 420, velocity: 0.76 },
      { note: "E4", startMs: 2560, durationMs: 420, velocity: 0.78 },
      { note: "D4", startMs: 2920, durationMs: 460, velocity: 0.8 },
      { note: "F4", startMs: 3360, durationMs: 420, velocity: 0.76 },
      { note: "A4", startMs: 3720, durationMs: 420, velocity: 0.8 },
      { note: "C5", startMs: 4080, durationMs: 560, velocity: 0.83 },
      { note: "B4", startMs: 4700, durationMs: 480, velocity: 0.8 },
      { note: "G4", startMs: 5220, durationMs: 540, velocity: 0.8 },
    ];
    const hasRecordedEvents =
      onscreenKeyboardRecordedEventsRef.current.length > 0;
    void playOnscreenKeyboardSequence(
      hasRecordedEvents
        ? onscreenKeyboardRecordedEventsRef.current
        : fallbackAutoplay,
    );
  }, [playOnscreenKeyboardSequence]);
  const buildKeyboardStudioBeatEvents = useCallback(() => {
    const base =
      KEYBOARD_STUDIO_BEAT_PATTERNS[keyboardStudioBeatPatternId] ??
      KEYBOARD_STUDIO_BEAT_PATTERNS.pulse;
    const tempoScale =
      96 / THREE.MathUtils.clamp(keyboardStudioBeatTempoBpm, 56, 180);
    return base.map((event) => ({
      ...event,
      startMs: Math.round(event.startMs * tempoScale),
      durationMs: Math.max(40, Math.round(event.durationMs * tempoScale)),
    }));
  }, [keyboardStudioBeatPatternId, keyboardStudioBeatTempoBpm]);
  const playKeyboardStudioBeatOneShot = useCallback(() => {
    const beatEvents = buildKeyboardStudioBeatEvents();
    void playOnscreenKeyboardSequence(beatEvents);
  }, [buildKeyboardStudioBeatEvents, playOnscreenKeyboardSequence]);
  const pressOnscreenKeyboardNote = useCallback(
    async (note: string) => {
      const engine = await ensureOnscreenKeyboardAudioReady();
      if (!engine) return;
      if (onscreenKeyboardPressedNotesRef.current.includes(note)) {
        // Repeated strike: cancel prior held voice before re-attacking.
        engine.noteOff(note);
        if (
          onscreenKeyboardRecordingRef.current &&
          onscreenKeyboardActiveNotesRef.current.has(note)
        ) {
          finishOnscreenKeyboardRecordedNote(note, performance.now());
        }
      }
      setOnscreenKeyboardPressedNotes((prev) =>
        prev.includes(note) ? prev : [...prev, note],
      );
      engine.noteOn(note, ONSCREEN_KEYBOARD_DEFAULT_VELOCITY);
      if (onscreenKeyboardRecordingRef.current) {
        onscreenKeyboardActiveNotesRef.current.set(note, {
          startMs: performance.now(),
          velocity: ONSCREEN_KEYBOARD_DEFAULT_VELOCITY,
        });
      }
    },
    [ensureOnscreenKeyboardAudioReady, finishOnscreenKeyboardRecordedNote],
  );
  const releaseOnscreenKeyboardNote = useCallback(
    (note: string) => {
      const engine = keyboardStudioEngineRef.current;
      setOnscreenKeyboardPressedNotes((prev) =>
        prev.filter((activeNote) => activeNote !== note),
      );
      if (engine) engine.noteOff(note);
      if (onscreenKeyboardRecordingRef.current) {
        finishOnscreenKeyboardRecordedNote(note, performance.now());
      } else {
        onscreenKeyboardActiveNotesRef.current.delete(note);
      }
    },
    [finishOnscreenKeyboardRecordedNote],
  );
  const releaseAllOnscreenKeyboardNotes = useCallback(() => {
    keyboardStudioPointerNoteRef.current.clear();
    keyboardStudioNotePointerCountRef.current.clear();
    keyboardStudioPressedCodesRef.current.clear();
    const activeNotes = [...onscreenKeyboardPressedNotesRef.current];
    activeNotes.forEach((note) => releaseOnscreenKeyboardNote(note));
    keyboardStudioEngineRef.current?.stopAll();
    setOnscreenKeyboardPressedNotes([]);
  }, [releaseOnscreenKeyboardNote]);
  const clearOnscreenKeyboardRecording = useCallback(() => {
    stopOnscreenKeyboardPlayback();
    stopOnscreenKeyboardRecording();
    releaseAllOnscreenKeyboardNotes();
    onscreenKeyboardActiveNotesRef.current.clear();
    onscreenKeyboardRecordedEventsRef.current = [];
    setOnscreenKeyboardRecordedEvents([]);
  }, [
    releaseAllOnscreenKeyboardNotes,
    stopOnscreenKeyboardPlayback,
    stopOnscreenKeyboardRecording,
  ]);
  const handleKeyboardKeyPointerDown = useCallback(
    (
      note: string,
      event: {
        preventDefault: () => void;
        pointerId: number;
        currentTarget: {
          setPointerCapture?: (pointerId: number) => void;
        };
      },
    ) => {
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // no-op
      }
      const pointerMap = keyboardStudioPointerNoteRef.current;
      const countMap = keyboardStudioNotePointerCountRef.current;
      const prevNote = pointerMap.get(event.pointerId);
      if (prevNote && prevNote !== note) {
        const prevCount = countMap.get(prevNote) ?? 0;
        const nextPrevCount = Math.max(0, prevCount - 1);
        if (nextPrevCount <= 0) {
          countMap.delete(prevNote);
          releaseOnscreenKeyboardNote(prevNote);
        } else {
          countMap.set(prevNote, nextPrevCount);
        }
      }
      pointerMap.set(event.pointerId, note);
      countMap.set(note, (countMap.get(note) ?? 0) + 1);
      void pressOnscreenKeyboardNote(note);
    },
    [pressOnscreenKeyboardNote, releaseOnscreenKeyboardNote],
  );
  const handleKeyboardKeyPointerUp = useCallback(
    (
      note: string,
      event: {
        preventDefault: () => void;
        pointerId: number;
        currentTarget: {
          releasePointerCapture?: (pointerId: number) => void;
        };
      },
    ) => {
      event.preventDefault();
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // no-op
      }
      const pointerMap = keyboardStudioPointerNoteRef.current;
      const countMap = keyboardStudioNotePointerCountRef.current;
      const trackedNote = pointerMap.get(event.pointerId) ?? note;
      pointerMap.delete(event.pointerId);
      const count = countMap.get(trackedNote) ?? 0;
      const nextCount = Math.max(0, count - 1);
      if (nextCount <= 0) {
        countMap.delete(trackedNote);
        releaseOnscreenKeyboardNote(trackedNote);
      } else {
        countMap.set(trackedNote, nextCount);
      }
    },
    [releaseOnscreenKeyboardNote],
  );
  useEffect(() => {
    if (keyboardStudioBeatLoopTimerRef.current !== null) {
      window.clearInterval(keyboardStudioBeatLoopTimerRef.current);
      keyboardStudioBeatLoopTimerRef.current = null;
    }
    if (
      !keyboardStudioEnabled ||
      !onscreenKeyboardPanelVisible ||
      !keyboardStudioBeatLoopEnabled
    ) {
      return () => {};
    }
    const beatEvents = buildKeyboardStudioBeatEvents();
    if (beatEvents.length === 0) return () => {};
    const totalMs = beatEvents.reduce(
      (maxMs, event) => Math.max(maxMs, event.startMs + event.durationMs),
      0,
    );
    const intervalMs = Math.max(320, totalMs + 120);
    void playOnscreenKeyboardSequence(beatEvents);
    keyboardStudioBeatLoopTimerRef.current = window.setInterval(() => {
      void playOnscreenKeyboardSequence(beatEvents);
    }, intervalMs);
    return () => {
      if (keyboardStudioBeatLoopTimerRef.current !== null) {
        window.clearInterval(keyboardStudioBeatLoopTimerRef.current);
        keyboardStudioBeatLoopTimerRef.current = null;
      }
    };
  }, [
    buildKeyboardStudioBeatEvents,
    keyboardStudioBeatLoopEnabled,
    keyboardStudioEnabled,
    onscreenKeyboardPanelVisible,
    playOnscreenKeyboardSequence,
  ]);
  const downloadOnscreenKeyboardBlob = useCallback(
    (filename: string, blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    },
    [],
  );
  const exportOnscreenKeyboardJson = useCallback(() => {
    const events = [...onscreenKeyboardRecordedEventsRef.current].sort(
      (a, b) => a.startMs - b.startMs,
    );
    const payload = {
      createdAt: new Date().toISOString(),
      root: "C3",
      keyCount: ONSCREEN_KEYBOARD_KEY_COUNT,
      events,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    downloadOnscreenKeyboardBlob("keyboard-recording.json", blob);
  }, [downloadOnscreenKeyboardBlob]);
  const exportOnscreenKeyboardMidi = useCallback(() => {
    const events = [...onscreenKeyboardRecordedEventsRef.current]
      .filter((event) => event.durationMs > 0)
      .sort((a, b) => a.startMs - b.startMs);
    if (events.length === 0) return;
    const blob = getKeyboardStudioEngine().exportMidiBlob(events);
    downloadOnscreenKeyboardBlob("keyboard-recording.mid", blob);
  }, [downloadOnscreenKeyboardBlob, getKeyboardStudioEngine]);
  const saveKeyboardStudioPreset = useCallback(() => {
    const trimmedName = keyboardStudioPresetName.trim();
    if (!trimmedName) return;
    const now = new Date().toISOString();
    const preset: KeyboardStudioPreset = {
      id: crypto.randomUUID(),
      name: trimmedName,
      source: "custom",
      createdAt: now,
      updatedAt: now,
      events: trimKeyboardStudioEvents([
        ...onscreenKeyboardRecordedEventsRef.current,
      ]),
      soundDesign: normalizeSoundDesign(keyboardStudioSoundDesign),
    };
    setKeyboardStudioPresets((prev) => [...prev, preset]);
    setKeyboardStudioSelectedPresetId(preset.id);
    setKeyboardStudioSelectedSource(preset.id);
    setKeyboardStudioPresetName("");
  }, [
    keyboardStudioPresetName,
    keyboardStudioSoundDesign,
    trimKeyboardStudioEvents,
  ]);
  const deleteKeyboardStudioPreset = useCallback(
    (presetId: string) => {
      setKeyboardStudioPresets((prev) =>
        prev.filter((preset) => preset.id !== presetId),
      );
      setKeyboardStudioBindings((prev) =>
        prev.filter((binding) => binding.presetId !== presetId),
      );
      if (keyboardStudioSelectedPresetId === presetId) {
        setKeyboardStudioSelectedPresetId("");
      }
    },
    [keyboardStudioSelectedPresetId],
  );
  const importKeyboardStudioPresetJson = useCallback(
    (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as {
          name?: string;
          events?: KeyboardRecordedNoteEvent[];
          soundDesign?: Partial<KeyboardStudioSoundDesign>;
        };
        if (!Array.isArray(parsed.events)) return;
        const now = new Date().toISOString();
        const preset: KeyboardStudioPreset = {
          id: crypto.randomUUID(),
          name:
            parsed.name?.trim() ||
            `Imported ${new Date().toLocaleTimeString()}`,
          source: "custom",
          createdAt: now,
          updatedAt: now,
          events: trimKeyboardStudioEvents(parsed.events),
          soundDesign: normalizeSoundDesign(parsed.soundDesign),
        };
        setKeyboardStudioPresets((prev) => [...prev, preset]);
        setKeyboardStudioSelectedSource(preset.id);
        setOnscreenKeyboardRecordedEvents([...preset.events]);
        onscreenKeyboardRecordedEventsRef.current = [...preset.events];
        setKeyboardStudioSoundDesign(preset.soundDesign);
      } catch {
        // no-op invalid json
      }
    },
    [trimKeyboardStudioEvents],
  );
  const setKeyboardStudioBindingPreset = useCallback(
    (eventId: KeyboardStudioEventBinding["eventId"], presetId: string) => {
      setKeyboardStudioBindings((prev) => {
        const existing = prev.find((binding) => binding.eventId === eventId);
        if (existing) {
          return prev.map((binding) =>
            binding.eventId === eventId ? { ...binding, presetId } : binding,
          );
        }
        return [...prev, { eventId, presetId, enabled: true, gain: 1 }];
      });
    },
    [],
  );
  const saveKeyboardStudioCurrentSettingsSlot = useCallback(() => {
    const name = window.prompt("Name this settings snapshot");
    if (!name || !name.trim()) return;
    const slot = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      soundDesign: normalizeSoundDesign(keyboardStudioSoundDesign),
    };
    setKeyboardStudioSavedSettings((prev) => {
      const merged = [slot, ...prev].slice(0, 10);
      return merged;
    });
    setKeyboardStudioSelectedSettingsId(slot.id);
  }, [keyboardStudioSoundDesign]);
  const loadKeyboardStudioSettingsSlot = useCallback(
    (slotId: string) => {
      const slot = keyboardStudioSavedSettings.find(
        (item) => item.id === slotId,
      );
      if (!slot) return;
      setKeyboardStudioSoundDesign(normalizeSoundDesign(slot.soundDesign));
      previewKeyboardStudioControlFeedback("A5");
    },
    [keyboardStudioSavedSettings, previewKeyboardStudioControlFeedback],
  );
  const deleteKeyboardStudioSettingsSlot = useCallback(
    (slotId: string) => {
      setKeyboardStudioSavedSettings((prev) =>
        prev.filter((slot) => slot.id !== slotId),
      );
      if (keyboardStudioSelectedSettingsId === slotId)
        setKeyboardStudioSelectedSettingsId("");
    },
    [keyboardStudioSelectedSettingsId],
  );
  useEffect(() => {
    const preset = allKeyboardStudioPresetOptions.find(
      (item) => item.id === keyboardStudioSelectedSource,
    );
    if (!preset) return;
    setKeyboardStudioSoundDesign(normalizeSoundDesign(preset.soundDesign));
    setOnscreenKeyboardRecordedEvents([...preset.events]);
    onscreenKeyboardRecordedEventsRef.current = [...preset.events];
    if (preset.source === "custom") {
      setKeyboardStudioPresetName(preset.name);
      setKeyboardStudioSelectedPresetId(preset.id);
    } else {
      setKeyboardStudioSelectedPresetId("");
    }
  }, [allKeyboardStudioPresetOptions, keyboardStudioSelectedSource]);
  useEffect(() => {
    const engine = keyboardStudioEngineRef.current;
    if (!engine) return;
    engine.setMasterVolume(overallVolume);
  }, [overallVolume]);
  useEffect(() => {
    const engine = keyboardStudioEngineRef.current;
    if (!engine) return;
    void engine.setSoundDesign(keyboardStudioSoundDesign);
  }, [keyboardStudioSoundDesign]);
  useEffect(() => {
    if (!keyboardStudioEnabled) return () => {};
    return onCosmosSoundEvent((event) => {
      setKeyboardStudioKnownEventIds((prev) =>
        prev.includes(event.id)
          ? prev
          : [...prev, event.id].sort((a, b) => a.localeCompare(b)),
      );
      const binding = keyboardStudioBindings.find(
        (candidate) => candidate.eventId === event.id && candidate.enabled,
      );
      if (!binding) return;
      const preset = allKeyboardStudioPresetOptions.find(
        (item) => item.id === binding.presetId,
      );
      if (!preset || preset.events.length === 0) return;
      const trimmedEvents = trimKeyboardStudioEvents(preset.events);
      if (trimmedEvents.length === 0) return;
      void ensureOnscreenKeyboardAudioReady().then(async (engine) => {
        await engine.setSoundDesign(preset.soundDesign);
        await engine.playSequence(trimmedEvents, {
          gain: binding.gain,
          ghostPlayback: false,
        });
      });
    });
  }, [
    allKeyboardStudioPresetOptions,
    ensureOnscreenKeyboardAudioReady,
    keyboardStudioBindings,
    keyboardStudioEnabled,
    trimKeyboardStudioEvents,
  ]);
  useEffect(() => {
    const handlePointerRelease = () => {
      releaseAllOnscreenKeyboardNotes();
    };
    window.addEventListener("pointerup", handlePointerRelease);
    window.addEventListener("blur", handlePointerRelease);
    return () => {
      window.removeEventListener("pointerup", handlePointerRelease);
      window.removeEventListener("blur", handlePointerRelease);
    };
  }, [releaseAllOnscreenKeyboardNotes]);
  useEffect(() => {
    const keyboardActive =
      keyboardStudioEnabled && onscreenKeyboardPanelVisible;
    if (!keyboardActive) {
      keyboardStudioPressedCodesRef.current.clear();
      releaseAllOnscreenKeyboardNotes();
      return () => {};
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const note = keyboardStudioKeyCodeToNoteMap.get(event.code);
      if (!note) return;
      event.preventDefault();
      event.stopPropagation();
      if (keyboardStudioPressedCodesRef.current.has(event.code)) return;
      keyboardStudioPressedCodesRef.current.add(event.code);
      void pressOnscreenKeyboardNote(note);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const note = keyboardStudioKeyCodeToNoteMap.get(event.code);
      if (!note) return;
      event.preventDefault();
      event.stopPropagation();
      keyboardStudioPressedCodesRef.current.delete(event.code);
      releaseOnscreenKeyboardNote(note);
    };
    const clearKeys = () => {
      keyboardStudioPressedCodesRef.current.clear();
      releaseAllOnscreenKeyboardNotes();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", clearKeys);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", clearKeys);
      clearKeys();
    };
  }, [
    keyboardStudioEnabled,
    keyboardStudioKeyCodeToNoteMap,
    onscreenKeyboardPanelVisible,
    pressOnscreenKeyboardNote,
    releaseAllOnscreenKeyboardNotes,
    releaseOnscreenKeyboardNote,
  ]);
  useEffect(
    () => () => {
      stopOnscreenKeyboardPlayback();
      releaseAllOnscreenKeyboardNotes();
      keyboardStudioEngineRef.current?.dispose();
      keyboardStudioEngineRef.current = null;
    },
    [releaseAllOnscreenKeyboardNotes, stopOnscreenKeyboardPlayback],
  );
  const beginOnscreenKeyboardDrag = useCallback(
    (event: {
      pointerId: number;
      clientX: number;
      clientY: number;
      button?: number;
      target?: EventTarget | null;
    }) => {
      if (event.button !== undefined && event.button !== 0) return;
      const targetElement =
        event.target instanceof HTMLElement ? event.target : null;
      if (
        targetElement &&
        ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "OPTION", "LABEL"].includes(
          targetElement.tagName,
        )
      ) {
        return;
      }
      onscreenKeyboardPanelDragRef.current = {
        active: true,
        pointerId: event.pointerId,
        offsetX: event.clientX - onscreenKeyboardPanelLayout.x,
        offsetY: event.clientY - onscreenKeyboardPanelLayout.y,
      };
    },
    [onscreenKeyboardPanelLayout.x, onscreenKeyboardPanelLayout.y],
  );
  const beginKeyboardStudioMainColumnResize = useCallback(
    (event: {
      button: number;
      pointerId: number;
      clientX: number;
      preventDefault: () => void;
      stopPropagation: () => void;
      currentTarget: { setPointerCapture: (pointerId: number) => void };
    }) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      keyboardStudioMainColumnResizeRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: keyboardStudioMainColumnWidth,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [keyboardStudioMainColumnWidth],
  );
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = onscreenKeyboardPanelDragRef.current;
      if (!drag?.active) return;
      if (event.buttons === 0) {
        onscreenKeyboardPanelDragRef.current = null;
        return;
      }
      const panelWidth = 980;
      const maxX = Math.max(8, window.innerWidth - panelWidth - 12);
      const maxY = Math.max(8, window.innerHeight - 160);
      const x = THREE.MathUtils.clamp(event.clientX - drag.offsetX, 8, maxX);
      const y = THREE.MathUtils.clamp(event.clientY - drag.offsetY, 8, maxY);
      setOnscreenKeyboardPanelLayout((prev) => ({
        ...prev,
        x,
        y,
      }));
    };
    const onResizeMove = (event: PointerEvent) => {
      const resize = keyboardStudioMainColumnResizeRef.current;
      if (!resize?.active) return;
      const nextWidth = resize.startWidth + (event.clientX - resize.startX);
      setKeyboardStudioMainColumnWidth(
        THREE.MathUtils.clamp(nextWidth, 420, 700),
      );
    };
    const stopDrag = () => {
      onscreenKeyboardPanelDragRef.current = null;
    };
    const stopResize = () => {
      keyboardStudioMainColumnResizeRef.current = null;
    };
    const onPointerUp = () => {
      if (!onscreenKeyboardPanelDragRef.current) return;
      stopDrag();
    };
    const onPointerCancel = () => {
      if (!onscreenKeyboardPanelDragRef.current) return;
      stopDrag();
    };
    const onWindowBlur = () => stopDrag();
    const onWindowBlurResize = () => stopResize();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    window.addEventListener("blur", onWindowBlurResize);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      window.removeEventListener("blur", onWindowBlurResize);
      stopDrag();
      stopResize();
    };
  }, []);

  const stopFalconNavSfxImmediate = useCallback(() => {
    if (falconTravelFadeTimeoutRef.current !== null) {
      window.clearTimeout(falconTravelFadeTimeoutRef.current);
      falconTravelFadeTimeoutRef.current = null;
    }
    const positionalAudio = falconTravelAudioRef.current;
    if (!positionalAudio) return;
    if (positionalAudio.isPlaying) positionalAudio.stop();
    falconActiveCueKindRef.current = null;
    positionalAudio.setVolume(
      THREE.MathUtils.clamp(overallVolume * falconSoundVolume, 0, 1),
    );
    debugLog("audio", "[falcon] cue stopped immediately");
  }, [debugLog, falconSoundVolume, overallVolume]);

  const playFalconNavSfx = useCallback(
    async (kind: FalconNavCueKind, forceRestart = false) => {
      if (!falconSoundEnabled) return;
      if (falconPendingCueKindRef.current === kind) return;
      const cueBuffers = falconNavCueBuffersRef.current;
      const buffer =
        kind === "moonTravel"
          ? (() => {
              const moonBuffers = cueBuffers.moonTravel;
              if (moonBuffers.length === 0) return null;
              const index = Math.floor(Math.random() * moonBuffers.length);
              return moonBuffers[index] ?? null;
            })()
          : cueBuffers[kind];
      if (!buffer) return;
      const positionalAudio = ensureFalconTravelAudioNode();
      if (!positionalAudio) return;
      if (positionalAudio.isPlaying) {
        const sameCueAsCurrent = falconActiveCueKindRef.current === kind;
        if (sameCueAsCurrent) {
          // Keep the original one-shot running across adjacent phases using same cue.
          return;
        }
        if (!forceRestart) return;
        positionalAudio.stop();
      }
      if (falconTravelFadeTimeoutRef.current !== null) {
        window.clearTimeout(falconTravelFadeTimeoutRef.current);
        falconTravelFadeTimeoutRef.current = null;
      }
      falconPendingCueKindRef.current = kind;
      await resumeFalconTravelAudioContext();
      try {
        // Non-looping one-shot cue for moon travel.
        playPositionalOneShot(
          positionalAudio,
          buffer,
          THREE.MathUtils.clamp(overallVolume * falconSoundVolume, 0, 1),
        );
        falconActiveCueKindRef.current = kind;
        debugLog("audio", `[falcon] ${kind} cue played`);
      } catch {
        debugLog("audio", `[falcon] ${kind} cue blocked`);
      } finally {
        if (falconPendingCueKindRef.current === kind) {
          falconPendingCueKindRef.current = null;
        }
      }
    },
    [
      debugLog,
      ensureFalconTravelAudioNode,
      falconSoundEnabled,
      falconSoundVolume,
      overallVolume,
      resumeFalconTravelAudioContext,
    ],
  );

  const { buildRotationHandlers, buildPointerHandlers } =
    usePointerInteractions({
      mountRef,
      focusedMoonRef,
      isDraggingRef,
      lastPointerRef,
      sceneRef,
      insideShipRef,
      orbitActiveRef,
    });

  const optionsRef = useCosmosOptions({
    options,
    sceneRef,
    frozenSystemStateRef,
  });

  const {
    currentNavigationTarget,
    navigationDistance,
    navigationETA,
    navigationTravelPhase,
    markTravelOverride,
    markMoonOrbitDepartureHandoff,
    navTurnActiveRef,
    settledViewTargetRef,
    handleAutopilotNavigation,
    initializeNavigationSystem,
    updateAutopilotNavigation,
    disposeNavigationSystem,
    completeActiveNavigation,
    onMoonOrbitArrivalRef,
    moonPrewarmRequestRef,
    tvPreviewControllerRef,
    tvPhase,
    dashcamControllerRef,
    dashcamPhase,
  } = useNavigationSystem({
    resumeData,
    emitterRef,
    spaceshipRef,
    sceneRef,
    followingSpaceshipRef,
    introCameraPrealignedRef,
    manualFlightModeRef,
    focusedMoonRef,
    exitFocusRequestRef,
    shipCinematicRef,
    insideShipRef,
    missionLog,
    vlog,
    shipLog,
    debugLog,
    enableTraceLogs: logNavTraceEnabled,
    enableDiagnosticLogs: logNavDiagEnabled,
    manualFlightRef,
    spaceshipPathRef,
    enterMoonViewRef,
    shipRollOffsetRef,
    optionsRef,
    followingStarDestroyerRef,
    setFollowingStarDestroyer,
    onMoonTravelIntent: ({ targetMoonId }) => {
      debugLog("nav", `Moon travel intent: ${targetMoonId}`);
      void playFalconNavSfx("moonTravel", true);
    },
    onMoonTravelNavigationStarted: ({ targetMoonId }) => {
      debugLog("nav", `Moon travel started: ${targetMoonId}`);
      void playFalconNavSfx("moonTravel", true);
    },
    onMoonTravelArrived: ({ targetMoonId }) => {
      debugLog("nav", `Moon travel arrived: ${targetMoonId}`);
      stopFalconNavSfxImmediate();
    },
    autopilotSuppressedRef: aboutJourneyAutopilotSuppressedRef,
    resolveSpecialSectionTarget: (targetId) => {
      if (targetId === "about") {
        const swarm = aboutParticleSwarmRef.current;
        if (swarm) {
          const center = swarm.group.position.clone();
          const shipPos = spaceshipRef.current?.position;
          const outward = new THREE.Vector3(0, 0, 1);
          if (shipPos) {
            outward.copy(shipPos).sub(center);
            outward.y *= 0.18;
            if (outward.lengthSq() < 1e-5) {
              outward.set(0.35, 0.05, 0.94);
            } else {
              outward.normalize();
            }
          }
          const standoff = 400;
          return center
            .addScaledVector(outward, standoff)
            .add(new THREE.Vector3(0, 20, 0));
        }
      }
      if (targetId === "skills") {
        const anchor = skillsLatticeWorldAnchorRef.current;
        if (!anchor) return null;
        const ship = spaceshipRef.current;
        if (!ship) {
          return anchor
            .clone()
            .add(new THREE.Vector3(0, 40, SKILLS_LATTICE_NAV_STANDOFF_DIST));
        }
        const outward = ship.position.clone().sub(anchor);
        if (outward.lengthSq() < 1e-5) outward.set(0, 0.1, 1);
        outward.normalize();
        return anchor
          .clone()
          .addScaledVector(outward, SKILLS_LATTICE_NAV_STANDOFF_DIST);
      }
      if (targetId === ABOUT_MEMORY_SQUARE_NAV_ID) {
        const anchor = aboutMemorySquareWorldAnchorRef.current;
        if (!anchor) return null;
        const approachNormal = new THREE.Vector3(0, 0, 1);
        const root = aboutMemorySquareRootRef.current;
        if (root) {
          const rootQ = new THREE.Quaternion();
          root.getWorldQuaternion(rootQ);
          approachNormal.applyQuaternion(rootQ).normalize();
        }
        return anchor
          .clone()
          .addScaledVector(
            approachNormal,
            ABOUT_MEMORY_SQUARE_NAV_STANDOFF_DIST,
          )
          .add(new THREE.Vector3(0, 54, 0));
      }
      if (targetId === CAREER_GALLERY_NAV_ID) {
        const anchor = CAREER_GALLERY_WORLD_ANCHOR;
        const ship = spaceshipRef.current;
        const outward = ship
          ? ship.position.clone().sub(anchor)
          : new THREE.Vector3(0, 0.1, 1);
        // Mostly horizontal approach.
        outward.y *= 0.25;
        if (outward.lengthSq() < 1e-5) outward.set(0, 0.1, 1);
        outward.normalize();
        return anchor
          .clone()
          .addScaledVector(outward, CAREER_GALLERY_NAV_STANDOFF_DIST);
      }
      if (targetId === "portfolio") {
        const anchor =
          orbitalPortfolioWorldAnchorRef.current ??
          ORBITAL_PORTFOLIO_WORLD_ANCHOR;
        const ship = spaceshipRef.current;
        if (!ship) {
          return anchor
            .clone()
            .add(
              new THREE.Vector3(
                0,
                ORBITAL_PORTFOLIO_NAV_VERTICAL_OFFSET,
                ORBITAL_PORTFOLIO_NAV_STANDOFF_DIST,
              ),
            );
        }
        const outward = ship.position.clone().sub(anchor);
        // Keep the approach mostly horizontal to avoid unnecessary dive/climb.
        outward.y *= 0.2;
        if (outward.lengthSq() < 1e-5) outward.set(0, 0.12, 1);
        outward.normalize();
        return anchor
          .clone()
          .addScaledVector(outward, ORBITAL_PORTFOLIO_NAV_STANDOFF_DIST)
          .add(new THREE.Vector3(0, ORBITAL_PORTFOLIO_NAV_VERTICAL_OFFSET, 0));
      }
      return null;
    },
    resolveSectionVisualCenter: (targetId) => {
      if (targetId === "about") {
        const swarm = aboutParticleSwarmRef.current;
        if (swarm) {
          return { center: swarm.group.position.clone(), radius: 220 };
        }
        return {
          center: ABOUT_PARTICLE_SWARM_WORLD_ANCHOR.clone(),
          radius: 220,
        };
      }
      if (targetId === "skills") {
        const anchor = skillsLatticeWorldAnchorRef.current;
        if (anchor) return { center: anchor.clone(), radius: 250 };
      }
      if (targetId === "portfolio") {
        const anchor =
          orbitalPortfolioWorldAnchorRef.current ??
          ORBITAL_PORTFOLIO_WORLD_ANCHOR;
        return { center: anchor.clone(), radius: 200 };
      }
      if (targetId === CAREER_GALLERY_NAV_ID) {
        return {
          center: CAREER_GALLERY_WORLD_ANCHOR.clone(),
          radius: CAREER_GALLERY_RADIUS,
        };
      }
      return null;
    },
  });

  completeActiveNavigationRef.current = completeActiveNavigation;

  useEffect(() => {
    currentNavigationTargetRef.current = currentNavigationTarget;
  }, [currentNavigationTarget]);

  useEffect(() => {
    const prevTarget = previousNavigationTargetRef.current;
    if (currentNavigationTarget === "experience") {
      experienceEndViewPendingRef.current = true;
    } else if (
      prevTarget === "experience" &&
      currentNavigationTarget !== "experience"
    ) {
      // Keep pending true after arrival so we can apply the final camera pose.
      experienceEndViewPendingRef.current = true;
    }
    previousNavigationTargetRef.current = currentNavigationTarget;
  }, [currentNavigationTarget]);

  useEffect(() => {
    if (!experienceEndViewPendingRef.current) return;
    if (currentNavigationTarget !== null) return;
    if (navigationDistance !== null) return;
    const controls = sceneRef.current.controls;
    if (!controls) return;

    settledViewTargetRef.current = EXPERIENCE_END_CAMERA_TARGET.clone();
    controls.setLookAt(
      EXPERIENCE_END_CAMERA_POSITION.x,
      EXPERIENCE_END_CAMERA_POSITION.y,
      EXPERIENCE_END_CAMERA_POSITION.z,
      EXPERIENCE_END_CAMERA_TARGET.x,
      EXPERIENCE_END_CAMERA_TARGET.y,
      EXPERIENCE_END_CAMERA_TARGET.z,
      true,
    );
    experienceEndViewPendingRef.current = false;
  }, [currentNavigationTarget, navigationDistance, settledViewTargetRef]);

  // Telemetry updates are driven by navigationDistance throttle (250ms)
  // so no separate pulse timer is needed.

  // Track actual ship movement speed from world-position deltas.
  // This catches every travel mode (autopilot/manual/cinematics/special sections)
  // so telemetry does not drop to zero while the ship is visibly moving.
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const ship = spaceshipRef.current;
      if (!ship) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const sample = measuredSpeedSampleRef.current;
      if (!sample) {
        measuredSpeedSampleRef.current = {
          t: now,
          pos: ship.position.clone(),
        };
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.max((now - sample.t) / 1000, 1 / 240);
      const dist = ship.position.distanceTo(sample.pos);
      sample.pos.copy(ship.position);
      sample.t = now;

      // Ignore long frame gaps (tab switch, breakpoint) to avoid false spikes.
      if (dt > 0.25) {
        measuredTravelSpeedRef.current = THREE.MathUtils.damp(
          measuredTravelSpeedRef.current,
          0,
          6,
          1 / 60,
        );
        raf = requestAnimationFrame(tick);
        return;
      }

      const instantaneousUnitsPerSecond = dist / dt;
      const clamped = THREE.MathUtils.clamp(
        instantaneousUnitsPerSecond,
        0,
        5000,
      );
      measuredTravelSpeedRef.current = THREE.MathUtils.lerp(
        measuredTravelSpeedRef.current,
        clamped,
        0.24,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      measuredSpeedSampleRef.current = null;
      measuredTravelSpeedRef.current = 0;
    };
  }, []);

  useEffect(() => {
    const navState = navMessageStateRef.current;

    // Orbit-exit handoff happens before a new currentNavigationTarget is set.
    // Emit this phase directly so there is no silent gap in user-facing phases.
    if (
      navigationTravelPhase === "orbit_departure_handoff" &&
      navState.lastTravelPhase !== "orbit_departure_handoff"
    ) {
      onScreenMessage("Departing current orbit");
      void playFalconNavSfx("changeOfDirection", true);
      navState.lastTravelPhase = "orbit_departure_handoff";
    }

    if (
      currentNavigationTarget &&
      navState.activeTarget !== currentNavigationTarget
    ) {
      const targetLabel = formatNavTargetLabel(currentNavigationTarget);
      navState.activeTarget = currentNavigationTarget;
      navState.targetLabel = targetLabel;
      navState.travelStartedAt = Date.now();
      navState.announcedLightspeed = false;
      navState.lastDistance = navigationDistance ?? null;
      navState.lastTravelPhase =
        navigationTravelPhase === "orbit_departure_handoff"
          ? "orbit_departure_handoff"
          : "idle";
      navState.arrivalAnnounced = false;
      navDistanceSampleRef.current = null;
      navDistanceDerivedSpeedRef.current = 0;

      onScreenMessage(`Navicomputer setting destination to "${targetLabel}"`);
      if (navigationDistance !== null) {
        onScreenMessage(
          `Destination acquired, distance ${navigationDistance.toFixed(0)}u`,
        );
      }
    }

    if (navState.activeTarget) {
      if (navigationTravelPhase !== navState.lastTravelPhase) {
        switch (navigationTravelPhase) {
          case "travel_override":
            onScreenMessage("Navigation override");
            void playFalconNavSfx("override", true);
            break;
          case "orbit_departure_handoff":
            onScreenMessage("Departing current orbit");
            void playFalconNavSfx("changeOfDirection", true);
            break;
          case "departure_clearance":
            onScreenMessage("Breaking from local orbit");
            void playFalconNavSfx("changeOfDirection", true);
            break;
          case "trajectory_alignment":
            onScreenMessage("Adjusting Falcon trajectory");
            void playFalconNavSfx("changeOfDirection", true);
            break;
          case "target_acquisition":
            onScreenMessage("Acquiring target lock");
            break;
          case "transit_cruise":
            onScreenMessage("Cruising toward destination");
            break;
          case "lightspeed_engaged":
            onScreenMessage("Engaging light speed");
            navState.announcedLightspeed = true;
            void playFalconNavSfx("speedOfLight", true);
            break;
          case "arrival_approach":
            onScreenMessage("Arriving at destination");
            break;
          case "arrived": {
            const label =
              navState.targetLabel ??
              formatNavTargetLabel(navState.activeTarget);
            const isPortfolioArrival =
              (navState.activeTarget ?? "").toLowerCase() === "portfolio";
            if (!navState.arrivalAnnounced) {
              onScreenMessage(`Arrived at ${label}`, {
                durationMs: isPortfolioArrival ? 2600 : 5000,
              });
              navState.arrivalAnnounced = true;
            }
            clearOnScreenTelemetry();
            navDistanceSampleRef.current = null;
            navDistanceDerivedSpeedRef.current = 0;
            telemetryLastNonZeroSpeedRef.current = 0;
            telemetryLastNonZeroAtRef.current = 0;
            navState.activeTarget = null;
            navState.targetLabel = null;
            navState.travelStartedAt = 0;
            navState.announcedLightspeed = false;
            navState.lastDistance = null;
            navState.lastTravelPhase = "idle";
            return;
          }
          default:
            break;
        }
        navState.lastTravelPhase = navigationTravelPhase;
      }
      // Navigation has finished; dismiss KPI strip immediately.
      if (!currentNavigationTarget && navigationDistance === null) {
        const label =
          navState.targetLabel ?? formatNavTargetLabel(navState.activeTarget);
        const isPortfolioArrival =
          (navState.activeTarget ?? "").toLowerCase() === "portfolio";
        if (!navState.arrivalAnnounced) {
          onScreenMessage(`Arrived at ${label}`, {
            durationMs: isPortfolioArrival ? 2600 : 5000,
          });
          navState.arrivalAnnounced = true;
        }
        clearOnScreenTelemetry();
        navDistanceSampleRef.current = null;
        navDistanceDerivedSpeedRef.current = 0;
        telemetryLastNonZeroSpeedRef.current = 0;
        telemetryLastNonZeroAtRef.current = 0;
        navState.activeTarget = null;
        navState.targetLabel = null;
        navState.travelStartedAt = 0;
        navState.announcedLightspeed = false;
        navState.lastDistance = null;
        navState.lastTravelPhase = "idle";
        return;
      }

      if (navigationDistance !== null) {
        const now = performance.now();
        const navSample = navDistanceSampleRef.current;
        if (!navSample) {
          navDistanceSampleRef.current = {
            t: now,
            distance: navigationDistance,
          };
        } else {
          const dt = Math.max((now - navSample.t) / 1000, 1 / 240);
          const deltaDist = Math.abs(navigationDistance - navSample.distance);
          navSample.t = now;
          navSample.distance = navigationDistance;
          const instantaneousUnitsPerSecond = deltaDist / dt;
          const clamped = THREE.MathUtils.clamp(
            instantaneousUnitsPerSecond,
            0,
            5000,
          );
          navDistanceDerivedSpeedRef.current = THREE.MathUtils.lerp(
            navDistanceDerivedSpeedRef.current,
            clamped,
            0.3,
          );
        }
      } else {
        // Some moon-route phases briefly report null distance while movement
        // still occurs. Keep speed latched through turbo/lightspeed windows
        // so telemetry does not momentarily collapse to 0.
        if (
          manualFlightRef.current.isLightspeedActive ||
          manualFlightRef.current.isTurboActive
        ) {
          navDistanceDerivedSpeedRef.current = Math.max(
            navDistanceDerivedSpeedRef.current,
            (manualFlightRef.current.currentSpeed || 0) * 60,
          );
        } else {
          navDistanceDerivedSpeedRef.current = THREE.MathUtils.damp(
            navDistanceDerivedSpeedRef.current,
            0,
            2.6,
            1 / 60,
          );
        }
      }
      // Normalize legacy frame-based speed values to units/second and
      // combine with measured world-space speed + nav-distance-derived speed
      // so telemetry stays accurate even when travel is camera-driven.
      const nominalSpeedPerSecond = Math.max(
        (spaceshipPathRef.current.speed || 0) * 60,
        (manualFlightRef.current.currentSpeed || 0) * 60,
      );
      const speedRaw = Math.max(
        nominalSpeedPerSecond,
        measuredTravelSpeedRef.current || 0,
        navDistanceDerivedSpeedRef.current || 0,
      );
      const nowPerf = performance.now();
      if (speedRaw > 1) {
        telemetryLastNonZeroSpeedRef.current = speedRaw;
        telemetryLastNonZeroAtRef.current = nowPerf;
      }
      const heldSpeed = (() => {
        if (
          !currentNavigationTarget ||
          (!manualFlightRef.current.isTurboActive &&
            !manualFlightRef.current.isLightspeedActive)
        ) {
          return 0;
        }
        const elapsed = nowPerf - telemetryLastNonZeroAtRef.current;
        if (elapsed >= 450) return 0;
        const t = 1 - elapsed / 450;
        return telemetryLastNonZeroSpeedRef.current * Math.max(0.15, t);
      })();
      const speed = speedRaw > 0.01 ? speedRaw : heldSpeed;
      const effectiveDistance =
        navigationDistance !== null
          ? navigationDistance
          : navState.lastDistance;
      setOnScreenTelemetry({
        distance: effectiveDistance,
        speed,
      });

      if (
        !navState.announcedLightspeed &&
        (manualFlightRef.current.isLightspeedActive ||
          navigationTravelPhase === "lightspeed_engaged")
      ) {
        onScreenMessage("Engaging light speed");
        navState.announcedLightspeed = true;
      }

      if (navigationDistance !== null) {
        navState.lastDistance = navigationDistance;
      }
      return;
    }

    if (!navState.activeTarget) {
      clearOnScreenTelemetry();
      telemetryLastNonZeroSpeedRef.current = 0;
      telemetryLastNonZeroAtRef.current = 0;
    }
  }, [
    currentNavigationTarget,
    navigationDistance,
    navigationTravelPhase,
    formatNavTargetLabel,
  ]);

  const stopOrbitalPortfolioToneSequence = useCallback(() => {
    const runtime = orbitalPortfolioToneRuntimeRef.current;
    if (ORBITAL_PORTFOLIO_DEBUG_LOGS) {
      shipLog(
        `[LATTICE-TONE] stop sequence notesPlayed=${runtime.debugNoteCounter}`,
        "info",
      );
    }
    runtime.enabled = false;
    runtime.nextEventAtMs = 0;
    runtime.noteIndex = 0;
    runtime.accentCoreIndex = -1;
    runtime.accentNodeLabel = "";
    runtime.accentColorHex = 0xc18bff;
    runtime.accentUntilAtMs = 0;
    runtime.debugNoteCounter = 0;
    runtime.activeVoices.forEach((voice) => {
      try {
        voice.oscMain.stop();
      } catch {
        // oscillator may already be stopped
      }
      try {
        voice.oscLayer.stop();
      } catch {
        // oscillator may already be stopped
      }
      try {
        voice.oscMain.disconnect();
        voice.oscLayer.disconnect();
        voice.mainGain.disconnect();
        voice.layerGain.disconnect();
        voice.filter.disconnect();
        voice.voiceGain.disconnect();
      } catch {
        // no-op disconnect guard
      }
    });
    runtime.activeVoices = [];
  }, [shipLog]);
  useEffect(
    () => () => {
      stopOrbitalPortfolioToneSequence();
    },
    [stopOrbitalPortfolioToneSequence],
  );

  const exitOrbitalPortfolio = useCallback(() => {
    const root = orbitalPortfolioRootRef.current;
    // Keep Portfolio world visible from outside; exiting only leaves
    // focused Portfolio interaction mode.
    if (root) root.visible = true;
    if (sceneRef.current.camera) {
      sceneRef.current.camera.layers.disable(ORBITAL_PORTFOLIO_LAYER);
    }
    stopOrbitalPortfolioToneSequence();
    const prev = orbitalPortfolioPrevStateRef.current;
    const beacon = orbitalPortfolioBeaconRef.current;
    if (beacon) beacon.visible = true;
    if (prev) {
      setFollowingSpaceship(prev.followingSpaceship);
      followingSpaceshipRef.current = prev.followingSpaceship;
      if (spaceshipRef.current) spaceshipRef.current.visible = prev.shipVisible;
      if (sceneRef.current.controls) {
        sceneRef.current.controls.enabled = prev.controlsEnabled;
        const controlsAny = sceneRef.current.controls as unknown as {
          minDistance?: number;
          maxDistance?: number;
        };
        if (typeof prev.controlsMinDistance === "number") {
          controlsAny.minDistance = prev.controlsMinDistance;
        }
        if (typeof prev.controlsMaxDistance === "number") {
          controlsAny.maxDistance = prev.controlsMaxDistance;
        }
      }
      if (sceneRef.current.camera) {
        sceneRef.current.camera.layers.mask = prev.cameraLayerMask;
      }
      orbitalPortfolioPrevStateRef.current = null;
    } else if (spaceshipRef.current) {
      spaceshipRef.current.visible = true;
      setFollowingSpaceship(true);
      followingSpaceshipRef.current = true;
    }
    orbitalPortfolioPlayingRef.current = true;
    orbitalPortfolioOrbitsEnabledRef.current = true;
    orbitalPortfolioAutoplayEnabledRef.current = false;
    setOrbitalPortfolioOrbitsEnabled(true);
    setOrbitalPortfolioAutoplayEnabled(false);
    setOrbitalPortfolioSearchQuery("");
    setOrbitalPortfolioYearFilter("all");
    setOrbitalPortfolioTechFilter("all");
    setOrbitalPortfolioFocusedCoreId("");
    setOrbitalRegistrySelectedCoreId("");
    setOrbitalRegistryPanelVisible(true);
    orbitalPortfolioFocusIndexRef.current = 0;
    setOrbitalPortfolioFocusIndex(0);
    orbitalPortfolioLastViewedRef.current = {
      focusIndex: null,
      variantIndex: 0,
      mediaIndex: 0,
    };
    setOrbitalPortfolioVariantIndex(0);
    setOrbitalPortfolioMediaIndex(0);
    setOrbitalPortfolioThumbPageStart(0);
    orbitalPortfolioPrevThumbPageStartRef.current = 0;
    orbitalPortfolioThumbSlideDirectionRef.current = null;
    setOrbitalPortfolioHasActiveFocus(false);
    orbitalPortfolioInspectedStationIndexRef.current = null;
    orbitalPortfolioInspectDistanceRef.current = null;
    orbitalPortfolioInspectStartedAtRef.current = 0;
    orbitalPortfolioCameraInitializedRef.current = false;
    orbitalPortfolioEntrySequenceRef.current.active = false;
    orbitalPortfolioPendingInspectRequestRef.current = null;
    orbitalPortfolioDebugDumpedRef.current = false;
    pendingOrbitalPortfolioEntryRef.current = false;
    orbitalPortfolioAwaitingArrivalRef.current = false;
    orbitalPortfolioSawTravelRef.current = false;
    setPortfolioNavHereActive(false);
    const scene = sceneRef.current.scene;
    if (scene) {
      externalCosmosLabelsHiddenForPortfolioRef.current = false;
      scene.traverse((obj) => {
        const maybeCss = obj as THREE.Object3D & {
          isCSS2DObject?: boolean;
          userData: Record<string, unknown>;
        };
        if (!maybeCss.isCSS2DObject) return;
        maybeCss.visible = true;
      });
    }
    if (sceneRef.current.camera) {
      sceneRef.current.camera.layers.enable(0);
    }
    orbitalPortfolioActiveRef.current = false;
    setOrbitalPortfolioActive(false);
  }, [stopOrbitalPortfolioToneSequence]);

  const enterOrbitalPortfolio = useCallback(() => {
    const camera = sceneRef.current.camera;
    const controls = sceneRef.current.controls;
    const root = orbitalPortfolioRootRef.current;
    if (!camera || !controls || !root) return;
    if (orbitalPortfolioActiveRef.current) return;
    if (!orbitalPortfolioReady) {
      vlog("⚠️ Orbital Portfolio is loading");
      return;
    }
    shipLog("[PORTENTRY] enterOrbitalPortfolio() invoked", "info");
    orbitalPortfolioPrevStateRef.current = {
      followingSpaceship: followingSpaceshipRef.current,
      shipVisible: spaceshipRef.current?.visible ?? true,
      controlsEnabled: controls.enabled,
      cameraLayerMask: camera.layers.mask,
      controlsMinDistance: (controls as unknown as { minDistance?: number })
        .minDistance,
      controlsMaxDistance: (controls as unknown as { maxDistance?: number })
        .maxDistance,
    };
    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    setInsideShip(false);
    insideShipRef.current = false;
    setShipViewMode("exterior");
    shipViewModeRef.current = "exterior";
    if (spaceshipRef.current) spaceshipRef.current.visible = false;
    const beacon = orbitalPortfolioBeaconRef.current;
    if (beacon) beacon.visible = false;
    controls.enabled = true;
    const controlsAny = controls as unknown as {
      minDistance?: number;
      maxDistance?: number;
      getTarget?: (out: THREE.Vector3) => void;
    };
    controlsAny.minDistance = 55;
    controlsAny.maxDistance = 2800;
    // Keep normal universe layer visible while enabling Portfolio layer,
    // so entry stays continuous without a black-space cutover.
    camera.layers.enable(0);
    camera.layers.enable(ORBITAL_PORTFOLIO_LAYER);
    root.visible = true;
    // Skills uses an explicit staged entry sequence. For Portfolio, preserve
    // the current camera state and let the per-frame damped solver glide
    // inward instead of doing a hard setLookAt jump.
    camera.getWorldPosition(orbitalPortfolioCameraPosRef.current);
    if (controlsAny.getTarget) {
      controlsAny.getTarget(orbitalPortfolioCameraTargetRef.current);
    } else {
      const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
      orbitalPortfolioCameraTargetRef.current
        .copy(orbitalPortfolioCameraPosRef.current)
        .addScaledVector(forward, 1200);
    }
    const anchor =
      orbitalPortfolioWorldAnchorRef.current ?? ORBITAL_PORTFOLIO_WORLD_ANCHOR;
    const cores = orbitalPortfolioCoresRef.current;
    const center = anchor.clone();
    if (cores.length > 0) {
      const avg = new THREE.Vector3();
      cores.forEach((core) => avg.add(core.centerLocal));
      avg.multiplyScalar(1 / cores.length);
      center.add(avg);
    }
    const seq = orbitalPortfolioEntrySequenceRef.current;
    seq.active = true;
    seq.startedAt = performance.now();
    seq.durationMs = 2600;
    seq.startCam.copy(orbitalPortfolioCameraPosRef.current);
    seq.startTarget.copy(orbitalPortfolioCameraTargetRef.current);
    seq.revealTarget.copy(center).add(new THREE.Vector3(0, 14, 0));
    seq.revealCam.copy(center).add(new THREE.Vector3(760, 340, 1080));
    seq.finalTarget.copy(center).add(new THREE.Vector3(0, 14, 0));
    seq.finalCam
      .copy(center)
      .add(new THREE.Vector3(420, 210, 620).multiplyScalar(2.05));
    shipLog(
      `[PORTENTRY] entrySequence:start durationMs=${seq.durationMs}`,
      "info",
    );
    orbitalPortfolioIgnoreManualUntilRef.current =
      seq.startedAt + seq.durationMs + 900;
    orbitalPortfolioAutoRef.current.lastAdvanceAt = performance.now();
    orbitalPortfolioAutoRef.current.pausedUntil = 0;
    orbitalPortfolioCameraDistanceRef.current = 2.05;
    orbitalPortfolioCameraDistanceTargetRef.current = 2.05;
    orbitalPortfolioCameraInitializedRef.current = true;
    orbitalPortfolioDebugDumpedRef.current = false;
    setOrbitalPortfolioManualLock(false, "enter-portfolio");
    pendingOrbitalPortfolioEntryRef.current = false;
    orbitalPortfolioAwaitingArrivalRef.current = false;
    orbitalPortfolioSawTravelRef.current = false;
    orbitalPortfolioPlayingRef.current = true;
    orbitalPortfolioOrbitsEnabledRef.current = true;
    orbitalPortfolioAutoplayEnabledRef.current = false;
    setOrbitalPortfolioOrbitsEnabled(true);
    setOrbitalPortfolioAutoplayEnabled(false);
    setOrbitalPortfolioSearchQuery("");
    setOrbitalPortfolioYearFilter("all");
    setOrbitalPortfolioTechFilter("all");
    setOrbitalRegistrySelectedCoreId(
      orbitalPortfolioCoreViewsRef.current[0]?.id ?? "",
    );
    orbitalPortfolioFocusIndexRef.current = 0;
    setOrbitalPortfolioFocusIndex(0);
    setOrbitalPortfolioHasActiveFocus(false);
    orbitalPortfolioLastViewedRef.current = {
      focusIndex: null,
      variantIndex: 0,
      mediaIndex: 0,
    };
    setOrbitalPortfolioVariantIndex(0);
    setOrbitalPortfolioMediaIndex(0);
    setOrbitalPortfolioThumbPageStart(0);
    orbitalPortfolioPrevThumbPageStartRef.current = 0;
    orbitalPortfolioThumbSlideDirectionRef.current = null;
    orbitalPortfolioInspectedStationIndexRef.current = null;
    orbitalPortfolioInspectDistanceRef.current = null;
    setPortfolioNavHereActive(true);
    const scene = sceneRef.current.scene;
    if (scene) {
      externalCosmosLabelsHiddenForPortfolioRef.current = true;
      scene.traverse((obj) => {
        const maybeCss = obj as THREE.Object3D & {
          isCSS2DObject?: boolean;
          userData: Record<string, unknown>;
        };
        if (!maybeCss.isCSS2DObject) return;
        if (maybeCss.userData?.orbitalPortfolioLabel) return;
        maybeCss.visible = false;
      });
    }
    ensureOrbitalPortfolioToneAudioNode();
    void resumeOrbitalPortfolioToneAudioContext();
    const toneRuntime = orbitalPortfolioToneRuntimeRef.current;
    toneRuntime.enabled = true;
    toneRuntime.noteIndex = 0;
    toneRuntime.motifIndex =
      Math.floor(Math.random() * SKILLS_LATTICE_TONE_MOTIFS_HZ.length) %
      Math.max(1, SKILLS_LATTICE_TONE_MOTIFS_HZ.length);
    toneRuntime.nextEventAtMs = performance.now() + seq.durationMs + 220;
    toneRuntime.accentCoreIndex = -1;
    toneRuntime.accentUntilAtMs = 0;
    toneRuntime.debugNoteCounter = 0;
    if (ORBITAL_PORTFOLIO_DEBUG_LOGS) {
      shipLog(
        `[LATTICE-TONE] start sequence in ${Math.max(0, toneRuntime.nextEventAtMs - performance.now()).toFixed(0)}ms motif=${toneRuntime.motifIndex} ctx=${toneRuntime.context?.state ?? "null"} vol=${overallVolume.toFixed(2)}`,
        "info",
      );
    }
    orbitalPortfolioActiveRef.current = true;
    setOrbitalPortfolioActive(true);
    vlog("✨ Entered Orbital Portfolio");
  }, [
    ensureOrbitalPortfolioToneAudioNode,
    overallVolume,
    orbitalPortfolioReady,
    resumeOrbitalPortfolioToneAudioContext,
    setOrbitalPortfolioManualLock,
    shipLog,
    vlog,
  ]);

  const exitOrbitalPortfolioInspectMode = useCallback(
    (options?: {
      resumeOrbits?: boolean;
      keepManualControl?: boolean;
      reason?: string;
    }) => {
      const resumeOrbits = options?.resumeOrbits ?? true;
      const keepManualControl = options?.keepManualControl ?? false;
      const hadInspectMode =
        orbitalPortfolioInspectedStationIndexRef.current !== null ||
        orbitalPortfolioManualCameraLockRef.current;
      const prevInspected = orbitalPortfolioInspectedStationIndexRef.current;
      orbitalPortfolioInspectedStationIndexRef.current = null;
      orbitalPortfolioInspectDistanceRef.current = null;
      orbitalPortfolioInspectStartedAtRef.current = 0;
      setOrbitalPortfolioManualLock(keepManualControl, "inspect-exit");
      setOrbitalPortfolioHasActiveFocus(false);
      if (resumeOrbits) {
        orbitalPortfolioStationsRef.current.forEach((station) => {
          station.orbitMotionBlend = Math.max(station.orbitMotionBlend, 0.7);
        });
        orbitalPortfolioPlayingRef.current = true;
        orbitalPortfolioAutoRef.current.lastAdvanceAt = performance.now();
        orbitalPortfolioAutoRef.current.pausedUntil = performance.now() + 400;
      }
      if (hadInspectMode && options?.reason) {
        shipLog(options.reason, "info");
      }
      if (ORBITAL_PORTFOLIO_STATE_DEBUG_LOGS) {
        shipLog(
          `[PORTSTATE] inspect-exit prevInspected=${prevInspected ?? "none"} resumeOrbits=${resumeOrbits ? 1 : 0} keepManual=${keepManualControl ? 1 : 0} playing=${orbitalPortfolioPlayingRef.current ? 1 : 0} manualLock=${orbitalPortfolioManualCameraLockRef.current ? 1 : 0}`,
          "info",
        );
      }
    },
    [setOrbitalPortfolioManualLock, shipLog],
  );

  const focusOrbitalPortfolioCore = useCallback(
    (coreId: string) => {
      const core = orbitalPortfolioCoresByIdRef.current.get(coreId);
      if (!core) return;
      const coreFocusZoomDistance = 1.52;
      const groups = orbitalPortfolioGroupsRef.current;
      const firstGroupIndexForCore = groups.findIndex(
        (group) => group.coreId === coreId,
      );
      setOrbitalPortfolioFocusedCoreId(coreId);
      setOrbitalRegistrySelectedCoreId(coreId);
      setOrbitalPortfolioManualLock(false, "focus-core");
      orbitalPortfolioInspectedStationIndexRef.current = null;
      orbitalPortfolioInspectDistanceRef.current = null;
      orbitalPortfolioInspectStartedAtRef.current = 0;
      if (firstGroupIndexForCore >= 0) {
        orbitalPortfolioFocusIndexRef.current = firstGroupIndexForCore;
        setOrbitalPortfolioFocusIndex(firstGroupIndexForCore);
        setOrbitalPortfolioVariantIndex(0);
        setOrbitalPortfolioMediaIndex(0);
        setOrbitalPortfolioThumbPageStart(0);
        orbitalPortfolioPrevThumbPageStartRef.current = 0;
        orbitalPortfolioThumbSlideDirectionRef.current = null;
      }
      orbitalPortfolioCameraDistanceTargetRef.current = coreFocusZoomDistance;
      orbitalPortfolioCameraDistanceRef.current = Math.min(
        orbitalPortfolioCameraDistanceRef.current,
        2.05,
      );
      setOrbitalPortfolioHasActiveFocus(true);
      orbitalPortfolioPlayingRef.current = true;
      orbitalPortfolioAutoRef.current.lastAdvanceAt = performance.now();
      orbitalPortfolioAutoRef.current.pausedUntil = performance.now() + 800;
      shipLog(`Core focus: ${core.title}`, "info");
    },
    [setOrbitalPortfolioManualLock, shipLog],
  );

  const goToOrbitalPortfolioSettledView = useCallback(() => {
    if (!orbitalPortfolioActiveRef.current) return;
    const controls = sceneRef.current.controls;
    if (!controls) return;

    const anchor =
      orbitalPortfolioWorldAnchorRef.current ?? ORBITAL_PORTFOLIO_WORLD_ANCHOR;
    const cores = orbitalPortfolioCoresRef.current;
    const center = anchor.clone();
    if (cores.length > 0) {
      const avg = new THREE.Vector3();
      cores.forEach((core) => avg.add(core.centerLocal));
      avg.multiplyScalar(1 / cores.length);
      center.add(avg);
    }
    const settledTarget = center.clone().add(new THREE.Vector3(0, 14, 0));
    const settledCam = center
      .clone()
      .add(new THREE.Vector3(420, 210, 620).multiplyScalar(2.05));

    orbitalPortfolioEntrySequenceRef.current.active = false;
    orbitalPortfolioPendingInspectRequestRef.current = null;
    orbitalPortfolioInspectedStationIndexRef.current = null;
    orbitalPortfolioInspectDistanceRef.current = null;
    orbitalPortfolioInspectStartedAtRef.current = 0;
    orbitalPortfolioCameraDistanceRef.current = 2.05;
    orbitalPortfolioCameraDistanceTargetRef.current = 2.05;
    orbitalPortfolioCameraInitializedRef.current = true;
    orbitalPortfolioCameraPosRef.current.copy(settledCam);
    orbitalPortfolioCameraTargetRef.current.copy(settledTarget);
    orbitalPortfolioPlayingRef.current = true;
    orbitalPortfolioAutoRef.current.lastAdvanceAt = performance.now();
    orbitalPortfolioAutoRef.current.pausedUntil = performance.now() + 450;
    setOrbitalPortfolioManualLock(false, "registry-home");
    setOrbitalPortfolioHasActiveFocus(false);
    setOrbitalPortfolioFocusedCoreId("");
    controls.setLookAt(
      settledCam.x,
      settledCam.y,
      settledCam.z,
      settledTarget.x,
      settledTarget.y,
      settledTarget.z,
      true,
    );
    shipLog("Portfolio view reset to home framing", "info");
  }, [setOrbitalPortfolioManualLock, shipLog]);

  const focusOrbitalPortfolioStation = useCallback(
    (
      stationIndex: number,
      mediaIndex?: number,
      options?: {
        autoplay?: boolean;
        variantIndex?: number;
        enforceCanonicalInspectDistance?: boolean;
      },
    ) => {
      const stations = orbitalPortfolioStationsRef.current;
      if (stations.length === 0) return;
      const next = THREE.MathUtils.clamp(stationIndex, 0, stations.length - 1);
      const station = stations[next];
      if (!station) return;
      const groups = orbitalPortfolioGroupsRef.current;
      const autoplayFocus = options?.autoplay === true;
      const stationChanged = next !== orbitalPortfolioFocusIndexRef.current;
      const nextGroup = groups[next];
      if (nextGroup?.coreId) {
        setOrbitalPortfolioFocusedCoreId(nextGroup.coreId);
        setOrbitalRegistrySelectedCoreId(nextGroup.coreId);
      }
      orbitalPortfolioFocusIndexRef.current = next;
      setOrbitalPortfolioFocusIndex(next);
      setOrbitalPortfolioHasActiveFocus(true);
      const variantCount = Math.max(1, groups[next]?.variants?.length ?? 1);
      const forcedVariant =
        typeof options?.variantIndex === "number" &&
        Number.isFinite(options.variantIndex)
          ? THREE.MathUtils.clamp(
              Math.floor(options.variantIndex),
              0,
              variantCount - 1,
            )
          : null;
      const nextVariantIndex =
        forcedVariant ??
        (stationChanged
          ? 0
          : THREE.MathUtils.clamp(
              orbitalPortfolioVariantIndexRef.current,
              0,
              variantCount - 1,
            ));
      setOrbitalPortfolioVariantIndex(nextVariantIndex);
      if (typeof mediaIndex === "number" && Number.isFinite(mediaIndex)) {
        const mediaCount = Math.max(
          1,
          groups[next]?.variants?.[nextVariantIndex]?.mediaItems?.length ?? 1,
        );
        const clampedMediaIndex = THREE.MathUtils.clamp(
          Math.floor(mediaIndex),
          0,
          mediaCount - 1,
        );
        setOrbitalPortfolioMediaIndex(clampedMediaIndex);
        setOrbitalPortfolioThumbPageStart(
          Math.floor(clampedMediaIndex / ORBITAL_PORTFOLIO_CARD_MAX_THUMBS) *
            ORBITAL_PORTFOLIO_CARD_MAX_THUMBS,
        );
        orbitalPortfolioThumbSlideDirectionRef.current = null;
      } else {
        setOrbitalPortfolioMediaIndex(0);
        setOrbitalPortfolioThumbPageStart(0);
        orbitalPortfolioThumbSlideDirectionRef.current = null;
      }
      if (autoplayFocus) {
        orbitalPortfolioInspectedStationIndexRef.current = null;
        orbitalPortfolioInspectDistanceRef.current = null;
        orbitalPortfolioInspectStartedAtRef.current = 0;
        setOrbitalPortfolioHasActiveFocus(false);
        orbitalPortfolioPlayingRef.current = true;
        setOrbitalPortfolioManualLock(false, "focus-station-autoplay");
        return;
      }

      if (orbitalPortfolioEntrySequenceRef.current.active) {
        orbitalPortfolioPendingInspectRequestRef.current = {
          stationIndex: next,
          mediaIndex,
          options,
        };
        shipLog(
          "[PORTENTRY] inspect request queued until entry sequence completes",
          "info",
        );
        return;
      }

      orbitalPortfolioInspectedStationIndexRef.current = next;
      orbitalPortfolioInspectStartedAtRef.current = performance.now();
      orbitalPortfolioPlayingRef.current = false;
      orbitalPortfolioAutoRef.current.pausedUntil = performance.now() + 12000;
      setOrbitalPortfolioManualLock(true, "focus-station-inspect");
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      if (!controls || !camera) return;
      const controlsAny = controls as unknown as {
        getTarget?: (out: THREE.Vector3) => void;
      };
      const useCanonicalInspectDistance =
        options?.enforceCanonicalInspectDistance === true;
      let inferredDistanceFromCurrentTarget: number | null = null;
      if (
        !useCanonicalInspectDistance &&
        orbitalPortfolioInspectDistanceRef.current === null &&
        controlsAny.getTarget
      ) {
        const currentTarget = new THREE.Vector3();
        controlsAny.getTarget(currentTarget);
        const raw = camera.position.distanceTo(currentTarget);
        if (
          raw >= ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE &&
          raw <= ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE
        ) {
          inferredDistanceFromCurrentTarget = raw;
        }
      }
      const plateWorld = new THREE.Vector3();
      station.plate.getWorldPosition(plateWorld);
      const plateQuat = new THREE.Quaternion();
      station.plate.getWorldQuaternion(plateQuat);
      const normal = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(plateQuat)
        .normalize();
      const savedDistance = orbitalPortfolioInspectDistanceRef.current;
      const canonicalInspectDistance = THREE.MathUtils.clamp(
        ORBITAL_PORTFOLIO_INSPECT_DEFAULT_DISTANCE *
          ORBITAL_PORTFOLIO_INSPECT_ZOOM_OUT_MULTIPLIER,
        ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE,
        ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE,
      );
      const hasValidSavedDistance =
        typeof savedDistance === "number" &&
        savedDistance >= ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE &&
        savedDistance <= ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE;
      let inspectDistance = canonicalInspectDistance;
      if (useCanonicalInspectDistance) {
        inspectDistance = canonicalInspectDistance;
      } else if (hasValidSavedDistance) {
        // Preserve the latest user framing without compounding zoom-out each click.
        inspectDistance = THREE.MathUtils.clamp(
          savedDistance,
          ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE,
          ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE,
        );
      } else if (typeof inferredDistanceFromCurrentTarget === "number") {
        inspectDistance = THREE.MathUtils.clamp(
          inferredDistanceFromCurrentTarget *
            ORBITAL_PORTFOLIO_INSPECT_ZOOM_OUT_MULTIPLIER,
          ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE,
          ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE,
        );
      }
      orbitalPortfolioInspectDistanceRef.current = inspectDistance;
      // Keep inspect framing straight-on to the slide face.
      const camPos = plateWorld
        .clone()
        .addScaledVector(normal, inspectDistance);
      const lookTarget = plateWorld.clone();
      controls.setLookAt(
        camPos.x,
        camPos.y,
        camPos.z,
        lookTarget.x,
        lookTarget.y,
        lookTarget.z,
        true,
      );
      if (ORBITAL_PORTFOLIO_STATE_DEBUG_LOGS) {
        shipLog(
          `[PORTSTATE] inspect-enter station=${next} lane=${station.orbitLane} dist=${inspectDistance.toFixed(1)} playing=${orbitalPortfolioPlayingRef.current ? 1 : 0} manualLock=${orbitalPortfolioManualCameraLockRef.current ? 1 : 0}`,
          "info",
        );
      }
      shipLog(`Portfolio inspect: sample ${next + 1}`, "info");
    },
    [setOrbitalPortfolioManualLock, shipLog],
  );

  const getFilteredOrbitalGroups = useCallback(() => {
    const groups = orbitalPortfolioGroupsRef.current;
    const query = orbitalPortfolioSearchQuery.trim().toLowerCase();
    return groups.filter((group) => {
      if (
        orbitalPortfolioYearFilter !== "all" &&
        String(group.year ?? "unknown") !== orbitalPortfolioYearFilter
      ) {
        return false;
      }
      if (
        orbitalPortfolioTechFilter !== "all" &&
        !group.technologies.some(
          (tech) =>
            tech.toLowerCase() === orbitalPortfolioTechFilter.toLowerCase(),
        )
      ) {
        return false;
      }
      if (!query) return true;
      const haystack =
        `${group.title} ${group.description ?? ""} ${group.technologies.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [
    orbitalPortfolioSearchQuery,
    orbitalPortfolioTechFilter,
    orbitalPortfolioYearFilter,
  ]);

  const stepOrbitalPortfolioSequence = useCallback(
    (direction: -1 | 1) => {
      const groups = orbitalPortfolioGroupsRef.current;
      if (groups.length === 0) return;
      const filtered = getFilteredOrbitalGroups();
      if (filtered.length === 0) return;
      const activeGroupId =
        groups[
          THREE.MathUtils.clamp(
            orbitalPortfolioFocusIndexRef.current,
            0,
            Math.max(0, groups.length - 1),
          )
        ]?.id;
      const flattened: Array<{
        groupId: string;
        variantIndex: number;
        mediaIndex: number;
      }> = [];
      filtered.forEach((group) => {
        const variants =
          group.variants.length > 0 ? group.variants : [{ mediaItems: [] }];
        variants.forEach((variant, variantIndex) => {
          const mediaCount = Math.max(1, variant.mediaItems?.length ?? 0);
          for (let mediaIndex = 0; mediaIndex < mediaCount; mediaIndex += 1) {
            flattened.push({ groupId: group.id, variantIndex, mediaIndex });
          }
        });
      });
      if (flattened.length === 0) return;
      const currentIndex = flattened.findIndex(
        (item) =>
          item.groupId === activeGroupId &&
          item.variantIndex === orbitalPortfolioVariantIndexRef.current &&
          item.mediaIndex === orbitalPortfolioMediaIndex,
      );
      const startIndex =
        currentIndex >= 0
          ? currentIndex
          : Math.max(
              0,
              flattened.findIndex((item) => item.groupId === activeGroupId),
            );
      const nextIndex =
        (((startIndex + direction) % flattened.length) + flattened.length) %
        flattened.length;
      const target = flattened[nextIndex];
      if (!target) return;
      const stationIndex = groups.findIndex(
        (group) => group.id === target.groupId,
      );
      if (stationIndex < 0) return;
      focusOrbitalPortfolioStation(stationIndex, target.mediaIndex, {
        variantIndex: target.variantIndex,
        enforceCanonicalInspectDistance: true,
      });
    },
    [
      focusOrbitalPortfolioStation,
      getFilteredOrbitalGroups,
      orbitalPortfolioMediaIndex,
    ],
  );

  const focusSkillsLatticeNode = useCallback(
    (node: SkillsLatticeNodeRecord, animate = true) => {
      skillsLatticeSelectedNodeRef.current = node;
      setSkillsLatticeSelection({
        label: node.label,
        nodeType: node.nodeType,
        category: node.category,
        path: node.path,
        detailItems: node.detailItems,
      });
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      if (!controls || !camera || !skillsLatticeActiveRef.current) return;
      const worldPos = new THREE.Vector3();
      node.mesh.getWorldPosition(worldPos);
      skillsLatticeRippleRef.current.active = true;
      skillsLatticeRippleRef.current.center.copy(worldPos);
      skillsLatticeRippleRef.current.startedAt = performance.now();
      const camPos = camera.position.clone();
      const dir = camPos.sub(worldPos).normalize();
      const nextCam = worldPos
        .clone()
        .addScaledVector(dir, 62)
        .add(new THREE.Vector3(0, 9, 0));
      controls.setLookAt(
        nextCam.x,
        nextCam.y,
        nextCam.z,
        worldPos.x,
        worldPos.y + 1.2,
        worldPos.z,
        animate,
      );
    },
    [],
  );

  const placeStarDestroyerNearSkills = useCallback(() => {
    if (!STAR_DESTROYER_SKILLS_HOLD) {
      starDestroyerSkillsSnapPendingRef.current = false;
      return;
    }
    const sd = starDestroyerRef.current;
    const anchor = skillsLatticeWorldAnchorRef.current;
    if (!sd || !anchor) {
      starDestroyerSkillsSnapPendingRef.current = true;
      return;
    }
    const a = skillsSDPatrolStateRef.current.angle;
    sd.position.set(
      anchor.x + Math.cos(a) * (SKILLS_SD_PATROL_RADIUS * 0.9),
      anchor.y + 96,
      anchor.z + Math.sin(a) * (SKILLS_SD_PATROL_RADIUS * 0.9),
    );
    const lookAtPos = new THREE.Vector3(
      anchor.x + Math.cos(a + 0.35) * SKILLS_SD_PATROL_RADIUS,
      anchor.y + 84,
      anchor.z + Math.sin(a + 0.35) * SKILLS_SD_PATROL_RADIUS,
    );
    const lookMat = new THREE.Matrix4().lookAt(
      sd.position,
      lookAtPos,
      new THREE.Vector3(0, 1, 0),
    );
    const q = new THREE.Quaternion().setFromRotationMatrix(lookMat);
    const forwardOffset = sd.userData?.forwardOffset as
      | THREE.Quaternion
      | undefined;
    if (forwardOffset) q.multiply(forwardOffset);
    sd.quaternion.copy(q);
    sd.visible = true;
    const readabilityKey = sd.userData.readabilityKey as
      | THREE.PointLight
      | undefined;
    const readabilityRim = sd.userData.readabilityRim as
      | THREE.PointLight
      | undefined;
    if (readabilityKey) readabilityKey.intensity = 1.1;
    if (readabilityRim) readabilityRim.intensity = 0.95;
    skillsSDLockActiveRef.current = true;
    starDestroyerSkillsSnapPendingRef.current = false;
    vlog(
      `🔺 SD snapped near Skills @ [${sd.position.x.toFixed(0)}, ${sd.position.y.toFixed(
        0,
      )}, ${sd.position.z.toFixed(0)}]`,
    );
    shipLog("SD repositioned near Skills", "info");
  }, [shipLog, vlog]);

  const setExternalCosmosLabelsHiddenForLattice = useCallback(
    (hidden: boolean) => {
      const scene = sceneRef.current.scene;
      if (!scene) return;
      if (externalCosmosLabelsHiddenForLatticeRef.current === hidden) return;
      externalCosmosLabelsHiddenForLatticeRef.current = hidden;
      // In lattice mode we now do per-label occlusion checks instead of
      // blanket hiding. Keep visibility restoration when mode ends.
      if (hidden) return;
      scene.traverse((obj) => {
        const maybeCss = obj as THREE.Object3D & {
          isCSS2DObject?: boolean;
          userData: Record<string, unknown>;
        };
        if (!maybeCss.isCSS2DObject) return;
        if (maybeCss.userData?.skillsLatticeLabel) return;
        maybeCss.visible = !hidden;
      });
    },
    [],
  );

  const setExternalCosmosLabelsHiddenForAbout = useCallback(
    (hidden: boolean) => {
      const scene = sceneRef.current.scene;
      if (!scene) return;
      if (externalCosmosLabelsHiddenForAboutRef.current === hidden) return;
      externalCosmosLabelsHiddenForAboutRef.current = hidden;
      scene.traverse((obj) => {
        const maybeCss = obj as THREE.Object3D & {
          isCSS2DObject?: boolean;
          userData: Record<string, unknown>;
        };
        if (!maybeCss.isCSS2DObject) return;
        if (maybeCss.userData?.aboutMemorySquareLabel) return;
        maybeCss.visible = !hidden;
      });
    },
    [],
  );

  const exitSkillsLattice = useCallback(
    (options?: { restoreShip?: boolean; clearSystem?: boolean }) => {
      const restoreShip = options?.restoreShip ?? true;
      const clearSystem = options?.clearSystem ?? true;
      const latticeBeacon = skillsLatticeBeaconRef.current;
      const camera = sceneRef.current.camera;
      const controls = sceneRef.current.controls;
      const entrySeq = skillsLatticeEntrySequenceRef.current;
      if (entrySeq.raf !== null) {
        cancelAnimationFrame(entrySeq.raf);
        entrySeq.raf = null;
      }
      stopOrbitalPortfolioToneSequence();
      entrySeq.active = false;
      skillsLatticeNodeLabelsRef.current.forEach((label) => {
        label.visible = false;
      });
      if (latticeBeacon) {
        latticeBeacon.visible = true;
        latticeBeacon.userData.sectionIndex = 2;
        latticeBeacon.userData.planetName = "Skills";
        latticeBeacon.userData.sectionId = "skills";
      }
      if (camera) camera.layers.disable(SKILLS_LATTICE_LAYER);
      if (restoreShip) {
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
        if (controls) controls.enabled = true;
        if (camera && controls && skillsLatticeReturnViewRef.current) {
          const view = skillsLatticeReturnViewRef.current;
          controls.setLookAt(
            view.cam.x,
            view.cam.y,
            view.cam.z,
            view.target.x,
            view.target.y,
            view.target.z,
            true,
          );
        }
      } else {
        setFollowingSpaceship(false);
        followingSpaceshipRef.current = false;
        if (spaceshipRef.current) spaceshipRef.current.visible = false;
        if (controls) controls.enabled = true;
      }
      skillsLegacyBodiesRef.current.forEach((obj) => {
        obj.visible = true;
      });
      skillsLatticePendingEntryRef.current = false;
      if (clearSystem) {
        skillsLatticePrevStateRef.current = null;
        skillsLatticeSystemActiveRef.current = false;
        setExternalCosmosLabelsHiddenForLattice(false);
      }
      skillsLatticeActiveRef.current = false;
      setSkillsLatticeActive(false);
      setSkillsNavHereActive(false);
      skillsLatticeRippleRef.current.active = false;
      skillsLatticeSelectedNodeRef.current = null;
      setSkillsLatticeSelection(null);
      skillsLatticeEnvelopeInsideRef.current = null;
      skillsLatticeReturnViewRef.current = null;
      skillsLatticeHomeViewRef.current = null;
      vlog("🧠 Skills lattice exited");
    },
    [
      setExternalCosmosLabelsHiddenForLattice,
      setSkillsNavHereActive,
      stopOrbitalPortfolioToneSequence,
      vlog,
    ],
  );

  const exitCareerGallery = useCallback(
    ({ restoreShip = true }: { restoreShip?: boolean } = {}) => {
      careerGalleryGlideCancelRef.current?.();
      careerGalleryGlideCancelRef.current = null;
      careerGalleryZoomDetachRef.current?.();
      careerGalleryZoomDetachRef.current = null;
      careerGalleryPendingEntryRef.current = false;
      const wasInside =
        careerGalleryActiveRef.current ||
        careerGalleryEnteringRef.current ||
        careerGalleryOutsideRef.current;
      careerGalleryActiveRef.current = false;
      careerGalleryEnteringRef.current = false;
      careerGalleryOutsideRef.current = false;
      setCareerGalleryActive(false);
      setCareerGalleryOutside(false);
      setCareerGallerySelection(null);
      careerGalleryRef.current?.setInteriorMode(false);
      // Shattered tiles come back for the next visit.
      careerGalleryRef.current?.restoreRetiredFaces();
      careerGalleryRef.current?.clearSkin();
      if (!wasInside) return;

      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera as
        | THREE.PerspectiveCamera
        | undefined;
      const snapshot = careerGallerySnapshotRef.current;
      careerGallerySnapshotRef.current = null;
      if (controls && camera && snapshot) {
        restoreGalleryControls(controls, camera, snapshot);
      }
      careerGalleryRef.current?.setShatterAttack(null);
      careerGalleryLasersRef.current?.clear();
      // Put the Falcon back where it was before parking in front of the camera.
      const savedShipPose = careerGalleryShipPoseRef.current;
      careerGalleryShipPoseRef.current = null;
      if (savedShipPose && spaceshipRef.current) {
        spaceshipRef.current.position.copy(savedShipPose.position);
        spaceshipRef.current.quaternion.copy(savedShipPose.quaternion);
      }
      if (restoreShip) {
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
      }
      vlog("🖼️ Career gallery exited");
    },
    [vlog],
  );

  const enterCareerGallery = useCallback(() => {
    if (careerGalleryActiveRef.current || careerGalleryEnteringRef.current) {
      return;
    }
    const gallery = careerGalleryRef.current;
    const controls = sceneRef.current.controls;
    const camera = sceneRef.current.camera as
      | THREE.PerspectiveCamera
      | undefined;
    if (!gallery || !controls || !camera) return;

    careerGalleryPendingEntryRef.current = false;
    careerGalleryEnteringRef.current = true;
    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    if (spaceshipRef.current) spaceshipRef.current.visible = false;
    // Coming from the outside view: keep the controls snapshot taken on
    // arrival, so exiting restores the pre-gallery camera.
    if (!careerGallerySnapshotRef.current) {
      careerGallerySnapshotRef.current = captureGalleryControls(controls, camera);
    }
    careerGalleryOutsideRef.current = false;
    setCareerGalleryOutside(false);
    gallery.clearFocus();
    gallery.clearSkin();
    gallery.setShatterAttack(null);
    careerGalleryLasersRef.current?.clear();
    gallery.setInteriorMode(true);

    const center = gallery.root.getWorldPosition(new THREE.Vector3());
    careerGalleryGlideCancelRef.current = runGalleryEntryGlide({
      controls,
      camera,
      center,
      durationMs: CAREER_GALLERY_ENTRY_GLIDE_MS,
      onDone: () => {
        careerGalleryGlideCancelRef.current = null;
        careerGalleryEnteringRef.current = false;
        careerGalleryActiveRef.current = true;
        setCareerGalleryActive(true);
        applyGalleryInteriorControls(controls);
        const dom = rendererRef.current?.domElement;
        if (dom) {
          careerGalleryZoomDetachRef.current = attachGalleryDolly(
            dom,
            controls,
            center,
            gallery.radius,
            gallery.radius * 0.6,
          );
        }
        shipLog(
          "Career Gallery — drag to look around, scroll to move, click a tile",
          "info",
        );
      },
    });
    vlog("🖼️ Entering career gallery");
  }, [shipLog, vlog]);

  // Career Gallery arrival: stop outside with the camera locked on the globe
  // (drag spins around it, click a tile for a quick reveal). "Enter Gallery"
  // glides inside.
  const arriveOutsideCareerGallery = useCallback(() => {
    if (
      careerGalleryActiveRef.current ||
      careerGalleryEnteringRef.current ||
      careerGalleryOutsideRef.current
    ) {
      return;
    }
    const gallery = careerGalleryRef.current;
    const controls = sceneRef.current.controls;
    const camera = sceneRef.current.camera as
      | THREE.PerspectiveCamera
      | undefined;
    if (!gallery || !controls || !camera) return;

    careerGalleryPendingEntryRef.current = false;
    careerGalleryOutsideRef.current = true;
    setCareerGalleryOutside(true);
    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    // The Falcon parks bottom-left in front of the camera (placed every frame
    // in the gallery effect) and shoots the images that fly out.
    const ship = spaceshipRef.current;
    if (ship) {
      careerGalleryShipPoseRef.current = {
        position: ship.position.clone(),
        quaternion: ship.quaternion.clone(),
      };
      ship.visible = true;
    }
    gallery.setShatterAttack((target, arriveInSeconds, bolts) => {
      const falcon = spaceshipRef.current;
      const lasers = careerGalleryLasersRef.current;
      if (!falcon || !lasers) return;
      falcon.updateMatrixWorld(true);
      lasers.fire(
        CAREER_GALLERY_SHIP_MUZZLES.map((muzzle) =>
          falcon.localToWorld(muzzle.clone()),
        ),
        target,
        arriveInSeconds,
        bolts,
      );
    });
    careerGallerySnapshotRef.current = captureGalleryControls(controls, camera);
    gallery.setInteriorMode(false);
    applyGalleryExteriorControls(
      controls,
      camera,
      gallery.root.getWorldPosition(new THREE.Vector3()),
      gallery.radius,
    );
    // The family photo loads across the globe first, then tiles turn into
    // portfolio screenshots one by one.
    gallery.showSkin(camera);
    shipLog(
      "Career Gallery — drag to spin around it, click a tile, or enter the gallery",
      "info",
    );
    vlog("🖼️ Arrived outside career gallery");
  }, [shipLog, vlog]);

  const enterSkillsLattice = useCallback(() => {
    if (skillsLatticeActiveRef.current) return;
    const latticeRoot = skillsLatticeRootRef.current;
    const latticeBeacon = skillsLatticeBeaconRef.current;
    const shellMat = skillsLatticeEnvelopeMatRef.current;
    const controls = sceneRef.current.controls;
    const camera = sceneRef.current.camera;
    if (!latticeRoot || !controls || !camera) return;
    if (shellMat) {
      // Start approach with an opaque outer shell; transparency is only enabled
      // once the camera is genuinely inside the shell.
      shellMat.side = THREE.FrontSide;
      shellMat.transparent = false;
      shellMat.depthWrite = true;
      shellMat.opacity = 1;
      shellMat.needsUpdate = true;
    }
    skillsLatticeEnvelopeInsideRef.current = false;

    skillsLatticePendingEntryRef.current = false;
    skillsLatticeNodeLabelsRef.current.forEach((label) => {
      label.visible = false;
    });
    if (
      !skillsLatticeSystemActiveRef.current ||
      !skillsLatticePrevStateRef.current
    ) {
      skillsLatticePrevStateRef.current = {
        followingSpaceship: followingSpaceshipRef.current,
        shipVisible: spaceshipRef.current?.visible ?? true,
        controlsEnabled: controls.enabled,
      };
    }
    skillsLatticeSystemActiveRef.current = true;
    setSkillsNavHereActive(true);
    setExternalCosmosLabelsHiddenForLattice(true);
    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    if (spaceshipRef.current) spaceshipRef.current.visible = false;
    skillsLegacyBodiesRef.current.forEach((obj) => {
      obj.visible = false;
    });
    placeStarDestroyerNearSkills();
    if (latticeBeacon) {
      latticeBeacon.visible = false;
      delete latticeBeacon.userData.sectionIndex;
      delete latticeBeacon.userData.planetName;
      delete latticeBeacon.userData.sectionId;
    }
    latticeRoot.visible = true;
    camera.layers.enable(SKILLS_LATTICE_LAYER);

    const latticePos = new THREE.Vector3();
    latticeRoot.getWorldPosition(latticePos);
    const startCam = camera.position.clone();
    const camDir = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const startTarget = startCam.clone().addScaledVector(camDir, 1200);
    skillsLatticeReturnViewRef.current = {
      cam: startCam.clone(),
      target: startTarget.clone(),
    };
    // Freeze controls at the current camera orientation so we do not snap
    // sideways to any prior ship-follow target before the lattice push begins.
    controls.setLookAt(
      startCam.x,
      startCam.y,
      startCam.z,
      startTarget.x,
      startTarget.y,
      startTarget.z,
      false,
    );

    // Compute a perpendicular view to the lattice category-node plane so the
    // full pentagram-like spread is visible in one clean framing.
    const worldCategoryPoints = skillsLatticeNodesRef.current
      .filter((n) => n.nodeType === "category")
      .map((n) => n.mesh.getWorldPosition(new THREE.Vector3()));
    const worldAllPoints = skillsLatticeNodesRef.current.map((n) =>
      n.mesh.getWorldPosition(new THREE.Vector3()),
    );

    const centroid = new THREE.Vector3();
    if (worldAllPoints.length > 0) {
      worldAllPoints.forEach((p) => centroid.add(p));
      centroid.multiplyScalar(1 / worldAllPoints.length);
    } else {
      centroid.copy(latticePos);
    }

    const planeNormal = new THREE.Vector3(0, 1, 0);
    if (worldCategoryPoints.length >= 3) {
      // Newell normal from ordered category ring points.
      const n = new THREE.Vector3();
      for (let i = 0; i < worldCategoryPoints.length; i += 1) {
        const a = worldCategoryPoints[i];
        const b = worldCategoryPoints[(i + 1) % worldCategoryPoints.length];
        n.x += (a.y - b.y) * (a.z + b.z);
        n.y += (a.z - b.z) * (a.x + b.x);
        n.z += (a.x - b.x) * (a.y + b.y);
      }
      if (n.lengthSq() > 1e-6) {
        planeNormal.copy(n.normalize());
      }
    }
    // Keep the camera on the same side we're currently on to avoid a hard flip.
    const toCam = startCam.clone().sub(centroid);
    if (planeNormal.dot(toCam) < 0) planeNormal.multiplyScalar(-1);

    // Fit all nodes in frame using projected in-plane radius.
    let maxInPlaneRadius = 1;
    const inPlane = new THREE.Vector3();
    worldAllPoints.forEach((p) => {
      inPlane.copy(p).sub(centroid);
      inPlane.addScaledVector(planeNormal, -inPlane.dot(planeNormal));
      maxInPlaneRadius = Math.max(maxInPlaneRadius, inPlane.length());
    });
    const fovRad = THREE.MathUtils.degToRad(
      (camera as THREE.PerspectiveCamera).fov || 45,
    );
    const fitDistance = (maxInPlaneRadius * 1.25) / Math.tan(fovRad * 0.5);
    const finalDistance = THREE.MathUtils.clamp(fitDistance, 150, 300);

    const revealCam = centroid
      .clone()
      .addScaledVector(planeNormal, finalDistance * 0.78);
    const revealTarget = centroid.clone().add(new THREE.Vector3(0, 2, 0));
    const finalCam = centroid
      .clone()
      .addScaledVector(planeNormal, finalDistance);
    const finalTarget = centroid.clone().add(new THREE.Vector3(0, 2, 0));
    const startedAt = performance.now();
    const durationMs = 7000;
    controls.enabled = false;
    const cam = new THREE.Vector3();
    const target = new THREE.Vector3();
    const smooth = (u: number) => u * u * (3 - 2 * u);
    const entrySeq = skillsLatticeEntrySequenceRef.current;
    if (entrySeq.raf !== null) {
      cancelAnimationFrame(entrySeq.raf);
      entrySeq.raf = null;
    }
    entrySeq.active = true;
    skillsLatticeHomeViewRef.current = null;

    const tick = () => {
      if (!skillsLatticeEntrySequenceRef.current.active) return;
      const t = THREE.MathUtils.clamp(
        (performance.now() - startedAt) / durationMs,
        0,
        1,
      );
      if (t < 0.38) {
        const u = t / 0.38;
        const s = 1 - Math.pow(1 - u, 2.6);
        cam.lerpVectors(startCam, revealCam, s);
        target.lerpVectors(startTarget, revealTarget, s);
      } else {
        const u = (t - 0.38) / 0.62;
        const s = smooth(u);
        cam.lerpVectors(revealCam, finalCam, s);
        target.lerpVectors(revealTarget, finalTarget, s);
      }
      controls.setLookAt(
        cam.x,
        cam.y,
        cam.z,
        target.x,
        target.y,
        target.z,
        false,
      );
      if (t >= 1) {
        skillsLatticeEntrySequenceRef.current.active = false;
        skillsLatticeEntrySequenceRef.current.raf = null;
        controls.enabled = true;
        skillsLatticeHomeViewRef.current = {
          cam: cam.clone(),
          target: target.clone(),
        };
        skillsLatticeActiveRef.current = true;
        setSkillsLatticeActive(true);
        const toneRuntime = orbitalPortfolioToneRuntimeRef.current;
        toneRuntime.enabled = true;
        toneRuntime.noteIndex = 0;
        toneRuntime.motifIndex =
          Math.floor(Math.random() * SKILLS_LATTICE_TONE_MOTIFS_HZ.length) %
          Math.max(1, SKILLS_LATTICE_TONE_MOTIFS_HZ.length);
        toneRuntime.nextEventAtMs = performance.now() + 160;
        toneRuntime.accentCoreIndex = -1;
        toneRuntime.accentNodeLabel = "";
        toneRuntime.accentColorHex = activeSkillsLatticeTonePreset.accentColor;
        toneRuntime.accentUntilAtMs = 0;
        toneRuntime.debugNoteCounter = 0;
        ensureOrbitalPortfolioToneAudioNode();
        void resumeOrbitalPortfolioToneAudioContext();
        if (ORBITAL_PORTFOLIO_DEBUG_LOGS) {
          shipLog(
            `[LATTICE-TONE] skills-entry armed nextIn=${Math.max(0, toneRuntime.nextEventAtMs - performance.now()).toFixed(0)}ms motif=${toneRuntime.motifIndex} ctx=${toneRuntime.context?.state ?? "null"}`,
            "info",
          );
        }
        skillsLatticeSelectedNodeRef.current = null;
        setSkillsLatticeSelection(null);
        vlog("🧠 Skills lattice entered");
        return;
      }
      skillsLatticeEntrySequenceRef.current.raf = requestAnimationFrame(tick);
    };
    skillsLatticeEntrySequenceRef.current.raf = requestAnimationFrame(tick);
  }, [
    activeSkillsLatticeTonePreset,
    ensureOrbitalPortfolioToneAudioNode,
    placeStarDestroyerNearSkills,
    resumeOrbitalPortfolioToneAudioContext,
    setExternalCosmosLabelsHiddenForLattice,
    setSkillsNavHereActive,
    shipLog,
    vlog,
  ]);

  const resumeSkillsLatticeInPlace = useCallback(() => {
    if (!skillsLatticeSystemActiveRef.current || skillsLatticeActiveRef.current)
      return;
    const latticeRoot = skillsLatticeRootRef.current;
    const latticeBeacon = skillsLatticeBeaconRef.current;
    const camera = sceneRef.current.camera;
    const controls = sceneRef.current.controls;
    if (!latticeRoot || !camera || !controls) return;
    if (latticeBeacon) {
      latticeBeacon.visible = false;
      delete latticeBeacon.userData.sectionIndex;
      delete latticeBeacon.userData.planetName;
      delete latticeBeacon.userData.sectionId;
    }
    latticeRoot.visible = true;
    camera.layers.enable(SKILLS_LATTICE_LAYER);
    setExternalCosmosLabelsHiddenForLattice(true);
    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    if (spaceshipRef.current) spaceshipRef.current.visible = false;
    controls.enabled = true;
    const controlsAny = controls as unknown as {
      getTarget?: (out: THREE.Vector3) => void;
    };
    const target = new THREE.Vector3();
    if (controlsAny.getTarget) {
      controlsAny.getTarget(target);
    } else {
      const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
      target.copy(camera.position).addScaledVector(forward, 1200);
    }
    skillsLatticeReturnViewRef.current = {
      cam: camera.position.clone(),
      target: target.clone(),
    };
    skillsLatticeHomeViewRef.current = {
      cam: camera.position.clone(),
      target,
    };
    skillsLatticeActiveRef.current = true;
    setSkillsLatticeActive(true);
    setSkillsNavHereActive(true);
  }, [setExternalCosmosLabelsHiddenForLattice, setSkillsNavHereActive]);

  const goToSkillsLatticeHomeView = useCallback(() => {
    const controls = sceneRef.current.controls;
    const homeView = skillsLatticeHomeViewRef.current;
    if (!controls || !homeView) return;
    controls.setLookAt(
      homeView.cam.x,
      homeView.cam.y,
      homeView.cam.z,
      homeView.target.x,
      homeView.target.y,
      homeView.target.z,
      true,
    );
    skillsLatticeSelectedNodeRef.current = null;
    setSkillsLatticeSelection(null);
  }, []);

  const cancelAboutMemorySquareEntrySequence = useCallback(() => {
    const seq = aboutMemorySquareEntrySequenceRef.current;
    if (seq.raf !== null) {
      cancelAnimationFrame(seq.raf);
      seq.raf = null;
    }
    seq.active = false;
  }, []);

  const enterAboutMemorySquare = useCallback(() => {
    if (
      aboutMemorySquareActiveRef.current ||
      aboutMemorySquareEntrySequenceRef.current.active
    ) {
      return;
    }
    const aboutRoot = aboutMemorySquareRootRef.current;
    const camera = sceneRef.current.camera;
    const controls = sceneRef.current.controls;
    if (!aboutRoot || !camera || !controls) return;

    aboutMemorySquarePendingEntryRef.current = false;
    aboutMemorySquareNavIntentUntilRef.current = 0;
    aboutMemorySquareActiveRef.current = true;
    setAboutNavHereActive(true);
    setExternalCosmosLabelsHiddenForAbout(true);
    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    if (spaceshipRef.current) spaceshipRef.current.visible = false;

    const center = new THREE.Vector3();
    aboutRoot.getWorldPosition(center);
    const rootQuat = new THREE.Quaternion();
    aboutRoot.getWorldQuaternion(rootQuat);
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(rootQuat)
      .normalize();
    const startCam = camera.position.clone();
    const startDir = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const startTarget = startCam.clone().addScaledVector(startDir, 1200);
    const finalCam = center
      .clone()
      .addScaledVector(normal, ABOUT_MEMORY_SQUARE_CAMERA_STOP_DIST)
      .add(new THREE.Vector3(0, 68, 0));
    const finalTarget = center.clone().add(new THREE.Vector3(0, 34, 0));
    const controlCam = startCam
      .clone()
      .lerp(finalCam, 0.5)
      .addScaledVector(normal, 180)
      .add(new THREE.Vector3(0, 260, 0));
    const controlTarget = startTarget
      .clone()
      .lerp(finalTarget, 0.5)
      .add(new THREE.Vector3(0, 90, 0));
    const startedAt = performance.now();
    const durationMs = 4300;
    const cam = new THREE.Vector3();
    const target = new THREE.Vector3();
    const smooth = (u: number) => u * u * (3 - 2 * u);
    const bezierPoint = (
      out: THREE.Vector3,
      a: THREE.Vector3,
      b: THREE.Vector3,
      c: THREE.Vector3,
      t: number,
    ) => {
      const omt = 1 - t;
      out.copy(a).multiplyScalar(omt * omt);
      out.addScaledVector(b, 2 * omt * t);
      out.addScaledVector(c, t * t);
    };
    const seq = aboutMemorySquareEntrySequenceRef.current;
    seq.active = true;
    controls.enabled = false;

    const tick = () => {
      const t = THREE.MathUtils.clamp(
        (performance.now() - startedAt) / durationMs,
        0,
        1,
      );
      const s = smooth(t);
      bezierPoint(cam, startCam, controlCam, finalCam, s);
      bezierPoint(target, startTarget, controlTarget, finalTarget, s);
      controls.setLookAt(
        cam.x,
        cam.y,
        cam.z,
        target.x,
        target.y,
        target.z,
        false,
      );
      if (t >= 1) {
        controls.enabled = true;
        seq.active = false;
        seq.raf = null;
        vlog("👨‍🚀 Memory Squares entered");
        shipLog(
          `ABOUTDBG arrival phase=${aboutCellAnimationRef.current.phase} prepared=${aboutSlidePreparedIndexRef.current + 1} ready=${aboutSlideReadyRef.current ? 1 : 0} mats=${aboutTileContentMatsRef.current.length} maps=${aboutTileContentMatsRef.current
            .slice(0, 4)
            .map((m) => (m?.map ? "1" : "0"))
            .join("")}`,
          "nav",
        );
        return;
      }
      seq.raf = requestAnimationFrame(tick);
    };
    seq.raf = requestAnimationFrame(tick);
  }, [setExternalCosmosLabelsHiddenForAbout, shipLog, vlog]);

  const handleExperienceCompanyNavigation = useCallback(
    async (companyId: string, skipAboutExitConfirm = false) => {
      if (!companyId) return;

      if (!skipAboutExitConfirm) {
        const aboutJourney = aboutJourneyRef.current;
        if (
          aboutJourney &&
          aboutJourney.phase !== AboutJourneyPhase.IDLE &&
          companyId !== "about"
        ) {
          setAboutExitConfirmIntent({
            source: "experience",
            targetId: companyId,
            targetType: "moon",
          });
          return;
        }
      }

      // Universal handoff: cancel/exit any in-flight cinematic before moon travel.
      interruptTransientTravelFlows(companyId, "moon");

      // If already orbiting this moon, ignore — don't re-trigger orbit.
      // Clicking the same moon you're hovering over should be a no-op.
      if (isOrbiting() && focusedMoonRef.current) {
        const focusedName = focusedMoonRef.current.userData?.planetName;
        if (focusedName) {
          const focusedId = focusedName.toLowerCase().replace(/\s+/g, "-");
          if (focusedId === companyId) {
            debugLog(
              "nav",
              `Ignored click on same moon "${companyId}" — already orbiting`,
            );
            return;
          }
        }
      }

      vlog(`🌙 Initiating moon navigation: ${companyId}`);

      // Exit orbit if currently orbiting (different moon)
      if (isOrbiting()) {
        markMoonOrbitDepartureHandoff(companyId);
        pendingOrbitExitNavigationRef.current = {
          targetId: companyId,
          targetType: "moon",
          departure: captureMoonDepartureContext(),
        };
        exitOrbit();
        setOrbitPhase("exiting");
        shipLog("Departing orbit — new destination", "orbit");
        return;
      }

      // Always use autopilot — ship flies to the moon, then moon view activates
      if (!manualFlightModeRef.current) {
        handleAutopilotNavigation(companyId, "moon");
        return;
      }

      vlog(`⚠️ Cannot navigate in manual flight mode`);
    },
    [
      vlog,
      interruptTransientTravelFlows,
      handleAutopilotNavigation,
      isOrbiting,
      exitOrbit,
      shipLog,
      debugLog,
      captureMoonDepartureContext,
      markMoonOrbitDepartureHandoff,
      triggerAboutRetargetDispersal,
    ],
  );

  const handleQuickNav = useCallback(
    (
      targetId: string,
      targetType: "section" | "moon",
      skipAboutExitConfirm = false,
    ) => {
      if (!skipAboutExitConfirm) {
        const aboutJourney = aboutJourneyRef.current;
        if (
          aboutJourney &&
          aboutJourney.phase !== AboutJourneyPhase.IDLE &&
          targetId !== "about"
        ) {
          setAboutExitConfirmIntent({ source: "quick", targetId, targetType });
          return;
        }
      }

      // Already past the trip into the About journey itself: selecting About
      // again does nothing (no new trip, no targeting monitor over the ride).
      // TRANSIT must pass: the cockpit nav and menu call beginTransit() first
      // and then route the trip through here.
      if (
        targetType === "section" &&
        targetId === "about" &&
        aboutJourneyRef.current &&
        aboutJourneyRef.current.phase > AboutJourneyPhase.TRANSIT
      ) {
        return;
      }

      interruptTransientTravelFlows(targetId, targetType);
      if (targetType === "section" && targetId === ABOUT_MEMORY_SQUARE_NAV_ID) {
        aboutMemorySquarePendingEntryRef.current = true;
        aboutMemorySquareActiveRef.current = false;
        aboutMemorySquareNavIntentUntilRef.current = performance.now() + 20000;
        setSkillsNavHereActive(false);
      } else if (targetType === "section" && targetId === "about") {
        dlog(
          `[handleQuickNav:about] setting up about journey — followShip=true, pending=true`,
        );
        dlog(
          `[handleQuickNav:about] aboutJourneyRef.current exists=${!!aboutJourneyRef.current}`,
        );
        setAboutNavHereActive(true);
        setSkillsNavHereActive(false);
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
        aboutJourneyPendingEntryRef.current = true;
        aboutJourneyRef.current?.beginTransit();
        dlog(
          `[handleQuickNav:about] after beginTransit — pendingEntry=${aboutJourneyPendingEntryRef.current}, phase=${aboutJourneyRef.current?.phase}`,
        );
      } else if (
        targetType === "section" &&
        (targetId === "skills" || targetId === SKILLS_LATTICE_NAV_ID)
      ) {
        setSkillsNavHereActive(true);
      } else if (
        targetType === "section" &&
        targetId !== ABOUT_MEMORY_SQUARE_NAV_ID
      ) {
        aboutMemorySquarePendingEntryRef.current = false;
        aboutMemorySquareActiveRef.current = false;
        aboutMemorySquareNavIntentUntilRef.current = 0;
        setAboutNavHereActive(false);
        if (targetId !== "skills" && targetId !== SKILLS_LATTICE_NAV_ID) {
          setSkillsNavHereActive(false);
        }
        setExternalCosmosLabelsHiddenForAbout(false);
        cancelAboutMemorySquareEntrySequence();
      }
      // Exit orbit if currently orbiting
      if (isOrbiting()) {
        markMoonOrbitDepartureHandoff(targetId, targetType);
        pendingOrbitExitNavigationRef.current = {
          targetId,
          targetType,
          departure: captureMoonDepartureContext(),
        };
        exitOrbit();
        setOrbitPhase("exiting");
        shipLog("Departing orbit — new destination", "orbit");
        return;
      }

      // Always use autopilot — ship is always engaged
      if (!manualFlightModeRef.current) {
        handleAutopilotNavigation(targetId, targetType);
        return;
      }
      // Fallback for manual flight mode
      const target =
        targetType === "moon" ? `experience-${targetId}` : targetId;
      if (handleNavigationRef.current) {
        handleNavigationRef.current(target);
      }
    },
    [
      handleAutopilotNavigation,
      interruptTransientTravelFlows,
      isOrbiting,
      exitOrbit,
      shipLog,
      captureMoonDepartureContext,
      cancelAboutMemorySquareEntrySequence,
      setExternalCosmosLabelsHiddenForAbout,
      setAboutNavHereActive,
      setSkillsNavHereActive,
      markMoonOrbitDepartureHandoff,
    ],
  );

  // Legacy left-panel hide/show logic removed — old CosmicNavigation
  // interface no longer exists. Navigation is handled by the new game UI.

  const appendSystemStatusLog = useCallback((message: string) => {
    setSystemStatusLogs((prev) => {
      const next = [...prev, message];
      return next.length > 8 ? next.slice(-8) : next;
    });
  }, []);

  // ── Orbit Debug Mode (F8 toggle) ─────────────────────────────────────────
  // Lets you nudge orbit camera/ship params live during orbit, then dump
  // final values to the ship terminal for copy-paste.
  useEffect(() => {
    let active = false;

    const STEP_SMALL = 0.02;
    const STEP_TILT = 0.3;

    const dumpValues = () => {
      const lines = [
        "══════ ORBIT DEBUG VALUES ══════",
        `ORBIT_ALTITUDE_MULT  = ${orbitDebug.altitudeMult.toFixed(3)}`,
        `ORBIT_CAM_BEHIND     = ${orbitDebug.camBehind.toFixed(3)}`,
        `ORBIT_CAM_ABOVE      = ${orbitDebug.camAbove.toFixed(3)}`,
        `ORBIT_CAM_PITCH_BLEND= ${orbitDebug.pitchBlend.toFixed(3)}`,
        `noseTilt             = ${orbitDebug.noseTilt.toFixed(2)}`,
        "════════════════════════════════",
      ];
      lines.forEach((l) => shipLog(l, "info"));
      dlog(lines.join("\n"));
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        active = !active;
        orbitDebug.active = active;
        if (active) {
          orbitDebug.reset();
          shipLog(
            "ORBIT DEBUG ON — W/S alt, A/D behind, Q/E above, R/F pitch, T/G tilt, F9 dump",
            "info",
          );
        } else {
          shipLog("ORBIT DEBUG OFF", "info");
        }
        return;
      }

      if (!active) return;

      if (e.key === "F9") {
        e.preventDefault();
        dumpValues();
        return;
      }

      const k = e.key.toLowerCase();
      let changed = true;

      switch (k) {
        case "w":
          orbitDebug.altitudeMult += STEP_SMALL;
          break;
        case "s":
          orbitDebug.altitudeMult = Math.max(
            0.05,
            orbitDebug.altitudeMult - STEP_SMALL,
          );
          break;
        case "a":
          orbitDebug.camBehind += STEP_SMALL;
          break;
        case "d":
          orbitDebug.camBehind = Math.max(
            0.05,
            orbitDebug.camBehind - STEP_SMALL,
          );
          break;
        case "q":
          orbitDebug.camAbove += STEP_SMALL;
          break;
        case "e":
          orbitDebug.camAbove = Math.max(0, orbitDebug.camAbove - STEP_SMALL);
          break;
        case "r":
          orbitDebug.pitchBlend = Math.min(
            1,
            orbitDebug.pitchBlend + STEP_SMALL,
          );
          break;
        case "f":
          orbitDebug.pitchBlend = Math.max(
            0,
            orbitDebug.pitchBlend - STEP_SMALL,
          );
          break;
        case "t":
          orbitDebug.noseTilt -= STEP_TILT;
          break;
        case "g":
          orbitDebug.noseTilt += STEP_TILT;
          break;
        default:
          changed = false;
      }

      if (changed) {
        e.preventDefault();
        debugLog(
          "orbitDbg",
          `alt=${orbitDebug.altitudeMult.toFixed(3)} behind=${orbitDebug.camBehind.toFixed(3)} above=${orbitDebug.camAbove.toFixed(3)} pitch=${orbitDebug.pitchBlend.toFixed(3)} tilt=${orbitDebug.noseTilt.toFixed(2)}`,
        );
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      orbitDebug.active = false;
    };
  }, [shipLog, debugLog]);

  const { initializeScene, setGlobalCleanup } = useThreeScene({
    mountRef,
    rendererRef,
    sceneRef,
    optionsRef,
    controlsDraggingRef,
    focusedMoonRef,
    isDraggingRef,
    focusedMoonCameraDistanceRef,
    exitFocusRequestRef,
    zoomExitThresholdRef,
  });

  const { updateOrbitSystem } = useOrbitSystem({
    sceneRef: sceneRef as MutableRefObject<{ camera?: THREE.Camera }>,
    focusedMoonRef,
    spaceshipRef,
    starDestroyerRef,
    insideShipRef,
    vlog,
  });

  const { startRenderLoop, stopRenderLoop } = useRenderLoop();

  // OWNERSHIP MAP
  // - useThreeScene: scene/camera/renderer lifecycle + cleanup
  // - useCosmosOptions: options sync into scene refs
  // - useCosmosLogs: console + mission logs
  // - useKeyboardControls/usePointerInteractions: input handlers
  // - useOrbitSystem: orbit updates + labels/halo
  // - useNavigationSystem: autopilot navigation + arrival handling
  // - useRenderLoop: animation loop + ship movement
  // - createMoonFocusController: moon enter/exit + overlays

  // ── Ship auto-engage on intro completion ──────────────
  // Event-driven auto-engage: listen for cinematic lifecycle events
  // and reveal startup UI exactly when hover is reached.
  useEffect(() => {
    if (shipUIPhase !== "hidden") return;
    let engaged = false;
    let hardTimeoutId: number | null = null;
    const engageShipAndRevealUI = (source: string) => {
      if (engaged) return;
      engaged = true;
      if (hardTimeoutId !== null) {
        window.clearTimeout(hardTimeoutId);
        hardTimeoutId = null;
      }
      dwarn(`[UI-SAFEGUARD] Ship UI engage source: ${source}`);
      setFollowingSpaceship(true);
      followingSpaceshipRef.current = true;
      setInsideShip(false);
      insideShipRef.current = false;
      setShipViewMode("exterior");
      shipViewModeRef.current = "exterior";
      setShipUIPhase("ship-engaged");
      runStartupUiRevealRef.current?.();
    };
    const armHardTimeout = () => {
      if (hardTimeoutId !== null) window.clearTimeout(hardTimeoutId);
      hardTimeoutId = window.setTimeout(() => {
        engageShipAndRevealUI("hard-timeout");
      }, 22000);
    };

    const unsubscribeHover = subscribeCosmosEvent(
      "ship:cinematic-hover",
      () => {
        engageShipAndRevealUI("event:ship-cinematic-hover");
      },
    );
    const unsubscribeStarted = subscribeCosmosEvent(
      "ship:cinematic-started",
      () => {
        armHardTimeout();
      },
    );
    const unsubscribeCameraCompleted = subscribeCosmosEvent(
      "intro:camera-completed",
      () => {
        armHardTimeout();
      },
    );

    // Late-subscription safety: if hover happened before this listener mounted,
    // promote immediately based on the current cinematic state snapshot.
    const currentCinematic = shipCinematicRef.current;
    if (currentCinematic?.phase === "hover") {
      engageShipAndRevealUI("state-snapshot:hover");
    } else if (
      currentCinematic &&
      !currentCinematic.active &&
      introCameraPrealignedRef.current
    ) {
      engageShipAndRevealUI("state-snapshot:prealigned-finished");
    }

    return () => {
      unsubscribeHover();
      unsubscribeStarted();
      unsubscribeCameraCompleted();
      if (hardTimeoutId !== null) {
        window.clearTimeout(hardTimeoutId);
      }
    };
  }, [shipUIPhase]);

  // ── Autonomous ship wander ─────────────────────────
  // startShipWander / stopShipWander removed — ship is always player-controlled

  // ── Ship control bar handlers ──────────────────────
  // handleUseShip / handleFreeExplore / handleSummonFalcon removed — ship auto-engages after intro

  // --- STAR DESTROYER escort handlers ---

  const stopFollowingStarDestroyer = useCallback(() => {
    setFollowingStarDestroyer(false);
    followingStarDestroyerRef.current = false;
    vlog("🔺 Disengaged from Star Destroyer escort");
  }, [vlog]);

  const engageShadowSD = useCallback(
    (source: "console" | "tool" | "system" = "system") => {
      const sd = starDestroyerRef.current;
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      if (!sd || !controls || !camera) {
        shipLog("shadowSD() unavailable — SD or camera not ready", "error");
        return false;
      }

      const sdPos = new THREE.Vector3();
      sd.getWorldPosition(sdPos);
      if (!shadowSDModeRef.current) {
        if (!shadowSDPrevControlLimitsRef.current) {
          shadowSDPrevControlLimitsRef.current = {
            minDistance: controls.minDistance,
            maxDistance: controls.maxDistance,
          };
        }
        // Cancel cinematic camera tweens so shadowSD has full control immediately.
        cameraDirectorRef.current?.stop();

        // Start fairly close to SD for a dramatic lock-on.
        const sdBack = new THREE.Vector3(0, 0, -1)
          .applyQuaternion(sd.quaternion)
          .normalize();
        const sdUp = new THREE.Vector3(0, 1, 0)
          .applyQuaternion(sd.quaternion)
          .normalize();
        const sdRight = new THREE.Vector3(1, 0, 0)
          .applyQuaternion(sd.quaternion)
          .normalize();
        camera.position
          .copy(sdPos)
          .addScaledVector(sdBack, 36)
          .addScaledVector(sdUp, 10)
          .addScaledVector(sdRight, 8);
      }

      shadowSDModeRef.current = true;
      shadowSDLastTargetRef.current = sdPos.clone();
      followingSpaceshipRef.current = false;
      setFollowingSpaceship(false);
      insideShipRef.current = false;
      setInsideShip(false);
      setShipViewMode("exterior");
      shipViewModeRef.current = "exterior";

      controls.enabled = true;
      controls.minDistance = 5;
      controls.maxDistance = 2200;
      controls.setLookAt(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        sdPos.x,
        sdPos.y,
        sdPos.z,
        false,
      );

      shipLog("shadowSD engaged — camera locked to Star Destroyer", "info");
      if (source === "console") {
        dlog("🔺 shadowSD engaged — camera now follows Star Destroyer");
        dlog("   Orbit drag to change angle, scroll to zoom");
      }
      return true;
    },
    [setFollowingSpaceship, setInsideShip, shipLog],
  );

  const disengageShadowSD = useCallback(
    (source: "console" | "tool" | "system" = "system") => {
      if (!shadowSDModeRef.current) {
        if (source === "console") {
          dlog("⚠️ unShadowSD() ignored — shadowSD not active");
        }
        return false;
      }

      shadowSDModeRef.current = false;
      shadowSDLastTargetRef.current = null;
      const controls = sceneRef.current.controls;
      const prev = shadowSDPrevControlLimitsRef.current;
      if (controls && prev) {
        controls.minDistance = prev.minDistance;
        controls.maxDistance = prev.maxDistance;
      }
      shadowSDPrevControlLimitsRef.current = null;

      shipLog("shadowSD disengaged", "info");
      if (source === "console") {
        dlog("🔺 unShadowSD complete — SD camera lock released");
      }
      return true;
    },
    [shipLog],
  );

  const engageInspectFalcon = useCallback(
    (source: "console" | "tool" | "system" = "tool") => {
      if (inspectFalconModeRef.current) {
        if (source === "console") {
          dlog("⚠️ inspectFalcon() ignored — Falcon inspect already active");
        }
        return false;
      }
      const falcon = spaceshipRef.current;
      const camera = sceneRef.current.camera;
      const controls = sceneRef.current.controls;
      if (!falcon || !camera || !controls) {
        if (source === "console") {
          dlog(
            "❌ inspectFalcon() unavailable — Falcon/camera/controls not ready",
          );
        }
        return false;
      }

      if (shadowSDModeRef.current) {
        disengageShadowSD("system");
      }

      inspectFalconPrevStateRef.current = {
        followingSpaceship: followingSpaceshipRef.current,
        insideShip: insideShipRef.current,
        shipViewMode: shipViewModeRef.current,
        controlsMinDistance: controls.minDistance,
        controlsMaxDistance: controls.maxDistance,
      };

      const falconPos = new THREE.Vector3();
      falcon.getWorldPosition(falconPos);

      inspectFalconModeRef.current = true;
      inspectFalconLastTargetRef.current = falconPos.clone();
      followingSpaceshipRef.current = false;
      setFollowingSpaceship(false);
      insideShipRef.current = false;
      setInsideShip(false);
      setShipViewMode("exterior");
      shipViewModeRef.current = "exterior";

      controls.enabled = true;
      controls.minDistance = 1;
      controls.maxDistance = 6000;
      controls.setLookAt(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        falconPos.x,
        falconPos.y,
        falconPos.z,
        false,
      );

      shipLog("inspectFalcon engaged — orbit camera locked to Falcon", "info");
      if (source === "console") {
        dlog("🛰️ inspectFalcon engaged — camera centered on Millennium Falcon");
        dlog("   Orbit drag to inspect sides, scroll to zoom");
      }
      return true;
    },
    [disengageShadowSD, setFollowingSpaceship, setInsideShip, shipLog],
  );

  const disengageInspectFalcon = useCallback(
    (source: "console" | "tool" | "system" = "system") => {
      if (!inspectFalconModeRef.current) {
        if (source === "console") {
          dlog("⚠️ exitInspectFalcon() ignored — inspect mode not active");
        }
        return false;
      }

      inspectFalconModeRef.current = false;
      inspectFalconLastTargetRef.current = null;
      const controls = sceneRef.current.controls;
      const prev = inspectFalconPrevStateRef.current;
      if (controls && prev) {
        controls.minDistance = prev.controlsMinDistance;
        controls.maxDistance = prev.controlsMaxDistance;
      }
      if (prev) {
        followingSpaceshipRef.current = prev.followingSpaceship;
        setFollowingSpaceship(prev.followingSpaceship);
        insideShipRef.current = prev.insideShip;
        setInsideShip(prev.insideShip);
        shipViewModeRef.current = prev.shipViewMode;
        setShipViewMode(prev.shipViewMode);
      }
      inspectFalconPrevStateRef.current = null;

      shipLog("inspectFalcon disengaged", "info");
      if (source === "console") {
        dlog("🛰️ exitInspectFalcon complete — Falcon inspect released");
      }
      return true;
    },
    [setFollowingSpaceship, setInsideShip, shipLog],
  );

  // Clicking the Star Destroyer just shows a friendly message (restarts on
  // each click; fades out on its own).
  // About: while Mjolnir hovers in its cross pose waiting to be grabbed, show
  // an on-screen hint to click it.
  const [mjolnirPromptVisible, setMjolnirPromptVisible] = useState(false);
  useEffect(() => {
    if (!sceneReady) return;
    let shown = false;
    const id = window.setInterval(() => {
      const waiting = !!aboutJourneyRef.current?.awaitingGrab;
      if (waiting !== shown) {
        shown = waiting;
        setMjolnirPromptVisible(waiting);
      }
    }, 200);
    return () => {
      window.clearInterval(id);
      setMjolnirPromptVisible(false);
    };
  }, [sceneReady]);

  const [sdFriendlyMessageKey, setSdFriendlyMessageKey] = useState(0);
  const sdFriendlyMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleStarDestroyerFriendlyClick = useCallback(() => {
    setSdFriendlyMessageKey((key) => key + 1);
    if (sdFriendlyMessageTimerRef.current) clearTimeout(sdFriendlyMessageTimerRef.current);
    sdFriendlyMessageTimerRef.current = setTimeout(() => {
      sdFriendlyMessageTimerRef.current = null;
      setSdFriendlyMessageKey(0);
    }, 3600);
  }, []);

  const terminalToolActions = useMemo<ShipTerminalToolAction[]>(() => {
    const invoke = (name: string, ...args: unknown[]) => {
      const registry = window as unknown as Record<string, unknown>;
      const fn = registry[name];
      if (typeof fn !== "function") {
        shipLog(`Tool unavailable: ${name}()`, "error");
        return;
      }
      try {
        (fn as (...fnArgs: unknown[]) => unknown)(...args);
      } catch {
        shipLog(`Tool failed: ${name}()`, "error");
      }
    };
    return [
      {
        id: "locate-falcon",
        label: "locateFalcon()",
        hint: "Beacon to Millennium Falcon",
        onRun: () => invoke("locateFalcon"),
      },
      {
        id: "inspect-falcon",
        label: "inspectFalcon()",
        hint: "Orbit/zoom inspect camera around Falcon",
        onRun: () => invoke("inspectFalcon"),
      },
      {
        id: "inspect-falcon-exit",
        label: "exitInspectFalcon()",
        hint: "Exit Falcon inspect mode",
        onRun: () => invoke("exitInspectFalcon"),
      },
      {
        id: "locate-sd",
        label: "locateSD()",
        hint: "Beacon to Star Destroyer",
        onRun: () => invoke("locateSD"),
      },
      {
        id: "shadow-sd",
        label: "shadowSD()",
        hint: "Lock camera to Star Destroyer",
        onRun: () => invoke("shadowSD"),
      },
      {
        id: "unshadow-sd",
        label: "unShadowSD()",
        hint: "Release SD camera lock",
        onRun: () => invoke("unShadowSD"),
      },
      {
        id: "sd-flyover",
        label: "sdFlyover()",
        hint: "Star Destroyer passes overhead from behind the view",
        onRun: () => invoke("sdFlyover"),
      },
      {
        // Universe backdrop
        id: "universe-realism",
        label: "universeRealism()",
        hint: "3D universe — cinematic realism",
        onRun: () => invoke("universeRealism"),
      },
      {
        id: "universe-vivid",
        label: "universeVivid()",
        hint: "3D universe — vivid sci-fi",
        onRun: () => invoke("universeVivid"),
      },
      {
        id: "universe-lightbox",
        label: "universeLightbox()",
        hint: "Old photo lightbox background",
        onRun: () => invoke("universeLightbox"),
      },
      {
        // SD configurator
        id: "sd-configurator",
        label: "sdConfigurator()",
        hint: "On-screen editor for the Star Destroyer fly-over path",
        onRun: () => invoke("sdConfigurator"),
      },
      {
        id: "sd-escort",
        label: "sdEscort()",
        hint: "Star Destroyer drops in beside the Falcon (best at lightspeed)",
        onRun: () => invoke("sdEscort"),
      },
      {
        id: "sd-status",
        label: "sdStatus()",
        hint: "Print SD status to console",
        onRun: () => invoke("sdStatus"),
      },
      {
        id: "sd-on",
        label: "sdAutonomyOn()",
        hint: "Enable SD autonomy",
        onRun: () => invoke("sdAutonomyOn"),
      },
      {
        id: "sd-off",
        label: "sdAutonomyOff()",
        hint: "Disable SD autonomy",
        onRun: () => invoke("sdAutonomyOff"),
      },
      {
        id: "send-sd",
        label: "sendSD(name)",
        hint: "Prompt for destination",
        onRun: () => {
          const name = window.prompt("Destination for sendSD(name):");
          if (!name) return;
          invoke("sendSD", name);
        },
      },
      {
        id: "debug-cam",
        label: "debugCamera()",
        hint: "Enter free debug camera mode",
        onRun: () => invoke("debugCamera"),
      },
      {
        id: "debug-cam-exit",
        label: "exitDebugCamera()",
        hint: "Exit debug camera mode",
        onRun: () => invoke("exitDebugCamera"),
      },
      {
        id: "toggle-orbit-sign-tuning",
        label: "toggleOrbitSignTuning()",
        hint: "Show/hide orbit memory tuning panel",
        onRun: () => {
          setShowOrbitSignTuningControls((prev) => {
            const next = !prev;
            shipLog(
              `Orbit sign tuning panel ${next ? "visible" : "hidden"}`,
              "info",
            );
            return next;
          });
        },
      },
      {
        id: "capture-camera-snapshot",
        label: "captureCameraSnapshot()",
        hint: "Copy camera snapshot JSON",
        onRun: () => invoke("captureCameraSnapshot"),
      },
      {
        id: "summon-moon-drone",
        label: "summonMoonDrone()",
        hint: "Re-summon drone during moon visit",
        onRun: () => {
          if (orbitPhase !== "orbiting" || !focusedMoonRef.current) {
            shipLog("summonMoonDrone() only works during moon visits", "error");
            return;
          }
          if (!overlayContent) {
            shipLog(
              "No moon visit content loaded yet for drone summon",
              "error",
            );
            return;
          }
          setDroneInspectMode(false);
          setDroneSummonNonce((prev) => prev + 1);
          shipLog("Moon drone summoned", "orbit");
        },
      },
      {
        id: "summon-moon-drone-inspect",
        label: "inspectMoonDrone()",
        hint: "Summon drone and keep it on screen",
        onRun: () => {
          if (orbitPhase !== "orbiting" || !focusedMoonRef.current) {
            shipLog(
              "inspectMoonDrone() only works during moon visits",
              "error",
            );
            return;
          }
          setDroneInspectMode(true);
          setDroneSummonNonce((prev) => prev + 1);
          shipLog("Moon drone inspect mode active", "orbit");
        },
      },
    ];
  }, [orbitPhase, overlayContent, shipLog]);

  const reattachCameraToFalcon = useCallback((smooth: boolean) => {
    const controls = sceneRef.current.controls;
    const ship = spaceshipRef.current;
    if (!controls || !ship) return;

    const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
    const camPos = ship.position
      .clone()
      .addScaledVector(behind, FOLLOW_DISTANCE);
    camPos.y += FOLLOW_HEIGHT;

    controls.enabled = true;
    controls.setLookAt(
      camPos.x,
      camPos.y,
      camPos.z,
      ship.position.x,
      ship.position.y,
      ship.position.z,
      smooth,
    );
  }, []);

  function interruptTransientTravelFlows(
    nextTargetId: string,
    nextTargetType: "section" | "moon",
  ): void {
    setAboutSkipCinematicPromptVisible(false);
    let restoredShip = false;
    let interrupted = false;
    if (nextTargetId !== ABOUT_MEMORY_SQUARE_NAV_ID) {
      if (
        aboutMemorySquarePendingEntryRef.current ||
        aboutMemorySquareEntrySequenceRef.current.active ||
        aboutMemorySquareActiveRef.current
      ) {
        interrupted = true;
      }
      aboutMemorySquarePendingEntryRef.current = false;
      aboutMemorySquareActiveRef.current = false;
      aboutMemorySquareNavIntentUntilRef.current = 0;
      setAboutNavHereActive(false);
      setExternalCosmosLabelsHiddenForAbout(false);
      cancelAboutMemorySquareEntrySequence();
    }
    if (nextTargetId !== "about") {
      const aboutJourney = aboutJourneyRef.current;
      if (aboutJourney && aboutJourney.phase !== AboutJourneyPhase.IDLE) {
        const shouldDisperseOnRetarget =
          aboutJourney.phase === AboutJourneyPhase.PATH_READY ||
          aboutJourney.phase === AboutJourneyPhase.PATH_TRAVEL;

        if (shouldDisperseOnRetarget) {
          triggerAboutRetargetDispersal("falcon-retarget");
          restoredShip = true;
          interrupted = true;
        } else {
          aboutJourney.exit();
          restoredShip = true;
          interrupted = true;
        }
      }
      aboutJourneyPendingEntryRef.current = false;
    }
    if (nextTargetId !== "skills" && nextTargetId !== SKILLS_LATTICE_NAV_ID) {
      setSkillsNavHereActive(false);
      skillsLatticePendingEntryRef.current = false;
      if (
        skillsLatticeEntrySequenceRef.current.active ||
        skillsLatticeActiveRef.current ||
        skillsLatticeSystemActiveRef.current
      ) {
        interrupted = true;
        exitSkillsLattice({ restoreShip: true, clearSystem: true });
        restoredShip = true;
      }
    }
    if (nextTargetId !== CAREER_GALLERY_NAV_ID) {
      careerGalleryPendingEntryRef.current = false;
      // Includes the outside view: its parked Falcon (bottom-left, locked to
      // the camera) must be released before the ship travels anywhere else.
      if (
        careerGalleryActiveRef.current ||
        careerGalleryEnteringRef.current ||
        careerGalleryOutsideRef.current
      ) {
        interrupted = true;
        exitCareerGallery({ restoreShip: true });
        restoredShip = true;
      }
    }
    if (
      nextTargetId !== "portfolio" &&
      nextTargetId !== ORBITAL_PORTFOLIO_NAV_ID
    ) {
      setPortfolioNavHereActive(false);
      pendingOrbitalPortfolioEntryRef.current = false;
      orbitalPortfolioAwaitingArrivalRef.current = false;
      orbitalPortfolioSawTravelRef.current = false;
      if (orbitalPortfolioEntrySequenceRef.current.active) interrupted = true;
      orbitalPortfolioEntrySequenceRef.current.active = false;
      if (orbitalPortfolioActiveRef.current) {
        interrupted = true;
        exitOrbitalPortfolio();
        restoredShip = true;
      }
    }
    if (restoredShip) {
      setFollowingSpaceship(true);
      followingSpaceshipRef.current = true;
      setInsideShip(false);
      insideShipRef.current = false;
      setShipViewMode("exterior");
      shipViewModeRef.current = "exterior";
      if (spaceshipRef.current) spaceshipRef.current.visible = true;
      // Ensure camera is immediately back on Falcon before the next leg.
      reattachCameraToFalcon(false);
    }
    if (interrupted) {
      markTravelOverride(nextTargetId, nextTargetType);
    }
  }

  // ── Cockpit destination navigation ─────────────────
  const handleCockpitNavigate = useCallback(
    (
      targetId: string,
      targetType: "section" | "moon",
      skipAboutExitConfirm = false,
    ) => {
      vlog(`🎯 Cockpit nav → ${targetType}: ${targetId}`);

      if (!skipAboutExitConfirm) {
        const aboutJourney = aboutJourneyRef.current;
        if (
          aboutJourney &&
          aboutJourney.phase !== AboutJourneyPhase.IDLE &&
          targetId !== "about"
        ) {
          setAboutExitConfirmIntent({
            source: "cockpit",
            targetId,
            targetType,
          });
          return;
        }
      }

      interruptTransientTravelFlows(targetId, targetType);
      if (targetId === CAREER_GALLERY_NAV_ID) {
        if (
          careerGalleryActiveRef.current ||
          careerGalleryEnteringRef.current ||
          careerGalleryOutsideRef.current
        ) {
          vlog("🖼️ Career gallery already active");
          return;
        }
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
        careerGalleryPendingEntryRef.current = true;
        const ship = spaceshipRef.current;
        const atGallery =
          !!ship &&
          ship.position.distanceTo(CAREER_GALLERY_WORLD_ANCHOR) <=
            CAREER_GALLERY_ARRIVAL_DIST;
        if (atGallery) {
          arriveOutsideCareerGallery();
        } else {
          handleQuickNav(CAREER_GALLERY_NAV_ID, "section", skipAboutExitConfirm);
          vlog("🖼️ Routing to Career Gallery — it will open on arrival");
        }
        return;
      }
      if (targetId === "skills" || targetId === SKILLS_LATTICE_NAV_ID) {
        setSkillsNavHereActive(true);
        if (skillsLatticeActiveRef.current) {
          vlog("🧠 Skills lattice already active");
          return;
        }
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
        const skillsAnchor = skillsLatticeWorldAnchorRef.current;
        const ship = spaceshipRef.current;
        const nearSkillsAnchor =
          !!skillsAnchor &&
          !!ship &&
          ship.position.distanceTo(skillsAnchor) <= SKILLS_LATTICE_ARRIVAL_DIST;
        const atSkills = nearSkillsAnchor;
        skillsLatticePendingEntryRef.current = true;
        starDestroyerSkillsSnapPendingRef.current = true;
        placeStarDestroyerNearSkills();
        if (atSkills) {
          enterSkillsLattice();
        } else {
          handleQuickNav("skills", "section", skipAboutExitConfirm);
          vlog("🧠 Routing to Skills — lattice will open on arrival");
        }
        return;
      }
      if (targetId === ABOUT_MEMORY_SQUARE_NAV_ID) {
        setAboutNavHereActive(true);
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        setInsideShip(false);
        insideShipRef.current = false;
        setShipViewMode("exterior");
        shipViewModeRef.current = "exterior";
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
        aboutMemorySquarePendingEntryRef.current = true;
        aboutMemorySquareActiveRef.current = false;
        aboutMemorySquareNavIntentUntilRef.current = performance.now() + 20000;
        const aboutAnchor = aboutMemorySquareWorldAnchorRef.current;
        const ship = spaceshipRef.current;
        const alreadyNearAbout =
          !!aboutAnchor &&
          !!ship &&
          ship.position.distanceTo(aboutAnchor) <=
            ABOUT_MEMORY_SQUARE_ENTRY_TRIGGER_DIST;
        if (alreadyNearAbout) {
          enterAboutMemorySquare();
        } else {
          handleQuickNav(
            ABOUT_MEMORY_SQUARE_NAV_ID,
            "section",
            skipAboutExitConfirm,
          );
          vlog("👨‍🚀 Routing to Memory Squares");
        }
        return;
      }
      if (targetId === "about") {
        // Ignore only once the journey itself is underway; during TRANSIT a
        // repeat click just re-sends the trip.
        if (
          aboutJourneyRef.current &&
          aboutJourneyRef.current.phase > AboutJourneyPhase.TRANSIT
        ) {
          return;
        }
        dlog(`[handleCockpitNavigate:about] setting up about journey`);
        setAboutNavHereActive(true);
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        setInsideShip(false);
        insideShipRef.current = false;
        setShipViewMode("exterior");
        shipViewModeRef.current = "exterior";
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
        aboutJourneyPendingEntryRef.current = true;
        aboutJourneyRef.current?.beginTransit();
        handleQuickNav("about", "section", skipAboutExitConfirm);
        dlog(
          `[handleCockpitNavigate:about] after — pending=${aboutJourneyPendingEntryRef.current} phase=${aboutJourneyRef.current?.phase}`,
        );
        return;
      }
      if (targetId === "portfolio" || targetId === ORBITAL_PORTFOLIO_NAV_ID) {
        trackEvent("portfolio_section_click", {
          target_type: "navigation",
          target_id: targetId,
          source: "cockpit_navigate",
        });
        setPortfolioNavHereActive(true);
        if (!orbitalPortfolioReady) {
          vlog("⚠️ Orbital Portfolio is loading");
          return;
        }
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        setInsideShip(false);
        insideShipRef.current = false;
        setShipViewMode("exterior");
        shipViewModeRef.current = "exterior";
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
        if (orbitalPortfolioActiveRef.current) {
          exitOrbitalPortfolio();
          return;
        }
        const portfolioAnchor = orbitalPortfolioWorldAnchorRef.current;
        const shipPos = spaceshipRef.current?.position;
        const nearPortfolioAnchor =
          !!portfolioAnchor &&
          !!shipPos &&
          shipPos.distanceTo(portfolioAnchor) <=
            ORBITAL_PORTFOLIO_NEAR_ANCHOR_DIST;
        const atPortfolio =
          currentNavigationTarget === "portfolio" &&
          navigationDistance === null &&
          nearPortfolioAnchor;
        if (atPortfolio) {
          pendingOrbitalPortfolioEntryRef.current = false;
          orbitalPortfolioAwaitingArrivalRef.current = false;
          orbitalPortfolioSawTravelRef.current = false;
          enterOrbitalPortfolio();
        } else {
          pendingOrbitalPortfolioEntryRef.current = true;
          orbitalPortfolioAwaitingArrivalRef.current = true;
          orbitalPortfolioSawTravelRef.current = false;
          handleQuickNav("portfolio", "section", skipAboutExitConfirm);
          vlog(
            "✨ Routing to Portfolio — Orbital Registry will open on arrival",
          );
        }
        return;
      }

      if (targetType === "moon") {
        void handleExperienceCompanyNavigation(targetId, skipAboutExitConfirm);
      } else {
        // Route section nav through the unified quick-nav path so orbit-exit
        // clearance/deferred navigation is always honored.
        handleQuickNav(targetId, "section", skipAboutExitConfirm);
      }
    },
    [
      currentNavigationTarget,
      navigationDistance,
      orbitalPortfolioReady,
      enterSkillsLattice,
      handleExperienceCompanyNavigation,
      handleQuickNav,
      placeStarDestroyerNearSkills,
      enterOrbitalPortfolio,
      interruptTransientTravelFlows,
      vlog,
    ],
  );

  const cancelAboutExitIntent = useCallback(() => {
    setAboutExitConfirmIntent(null);
  }, []);

  const confirmAboutExitIntent = useCallback(() => {
    const intent = aboutExitConfirmIntent;
    if (!intent) return;
    setAboutExitConfirmIntent(null);

    // Let the overlay unmount first so the click feels instant.
    window.requestAnimationFrame(() => {
      if (intent.source === "experience") {
        void handleExperienceCompanyNavigation(intent.targetId, true);
        return;
      }
      if (intent.source === "cockpit") {
        handleCockpitNavigate(intent.targetId, intent.targetType, true);
        return;
      }
      handleQuickNav(intent.targetId, intent.targetType, true);
    });
  }, [
    aboutExitConfirmIntent,
    handleCockpitNavigate,
    handleExperienceCompanyNavigation,
    handleQuickNav,
  ]);

  useEffect(() => {
    if (orbitalPortfolioActiveRef.current) return;
    if (!pendingOrbitalPortfolioEntryRef.current) return;
    if (!portfolioNavHereActive) return;
    if (!orbitalPortfolioReady) return;
    const ship = spaceshipRef.current;
    const anchor = orbitalPortfolioWorldAnchorRef.current;
    const nearAnchor =
      !!ship &&
      !!anchor &&
      ship.position.distanceTo(anchor) <= ORBITAL_PORTFOLIO_NEAR_ANCHOR_DIST;
    const arrivedByPhase =
      navigationTravelPhase === "arrived" && navigationDistance === null;
    const signature =
      `near=${nearAnchor ? 1 : 0}` +
      ` phaseArrived=${arrivedByPhase ? 1 : 0}` +
      ` await=${orbitalPortfolioAwaitingArrivalRef.current ? 1 : 0}` +
      ` sawTravel=${orbitalPortfolioSawTravelRef.current ? 1 : 0}` +
      ` navDist=${navigationDistance === null ? "null" : "active"}` +
      ` navTarget=${currentNavigationTarget ?? "none"}` +
      ` phase=${navigationTravelPhase ?? "none"}`;
    if (signature !== orbitalPortfolioEntryGateSignatureRef.current) {
      orbitalPortfolioEntryGateSignatureRef.current = signature;
      shipLog(`[PORTENTRY] gate ${signature}`, "info");
    }
    if (!nearAnchor && !arrivedByPhase) return;
    if (orbitalPortfolioAwaitingArrivalRef.current) {
      if (
        currentNavigationTarget === "portfolio" &&
        navigationDistance !== null
      ) {
        orbitalPortfolioSawTravelRef.current = true;
      }
      if (
        !(
          orbitalPortfolioSawTravelRef.current ||
          (navigationTravelPhase === "arrived" && navigationDistance === null)
        ) ||
        navigationDistance !== null
      ) {
        return;
      }
    } else if (navigationDistance !== null) {
      return;
    }
    pendingOrbitalPortfolioEntryRef.current = false;
    orbitalPortfolioAwaitingArrivalRef.current = false;
    orbitalPortfolioSawTravelRef.current = false;
    shipLog("[PORTENTRY] gate satisfied -> entering portfolio", "info");
    enterOrbitalPortfolio();
  }, [
    currentNavigationTarget,
    navigationDistance,
    navigationTravelPhase,
    portfolioNavHereActive,
    orbitalPortfolioReady,
    enterOrbitalPortfolio,
  ]);

  useEffect(() => {
    if (orbitalPortfolioActive) return;
    orbitalPortfolioStationsRef.current.forEach((station) => {
      station.label.visible = false;
      station.cardTitleMesh.visible = false;
      station.cardVariantTabs.forEach((tab) => {
        tab.mesh.visible = false;
        tab.frame.visible = false;
      });
      station.cardThumbMeshes.forEach((thumb) => {
        thumb.mesh.visible = false;
        thumb.frame.visible = false;
      });
      [...station.cardThumbNavMeshes, ...station.cardVariantTabNavMeshes].forEach((nav) => {
        nav.mesh.visible = false;
        nav.frame.visible = false;
      });
    });
  }, [orbitalPortfolioActive]);

  useEffect(() => {
    if (
      !skillsLatticePendingEntryRef.current ||
      skillsLatticeActiveRef.current
    ) {
      return;
    }
    const ship = spaceshipRef.current;
    const anchor = skillsLatticeWorldAnchorRef.current;
    const arrivedAtSkills =
      !!ship &&
      !!anchor &&
      ship.position.distanceTo(anchor) <= SKILLS_LATTICE_ENTRY_TRIGGER_DIST &&
      navigationDistance === null;
    if (arrivedAtSkills) {
      // Continuous handoff: lightspeed ends outside shell and immediately
      // transitions to non-ship glide into lattice (no artificial pause).
      setFollowingSpaceship(false);
      followingSpaceshipRef.current = false;
      if (spaceshipRef.current) spaceshipRef.current.visible = false;
      enterSkillsLattice();
    }
  }, [currentNavigationTarget, navigationDistance, enterSkillsLattice]);

  // Career Gallery arrival: stop outside once autopilot parks at the standoff.
  useEffect(() => {
    if (
      !careerGalleryPendingEntryRef.current ||
      careerGalleryActiveRef.current ||
      careerGalleryEnteringRef.current ||
      careerGalleryOutsideRef.current
    ) {
      return;
    }
    const ship = spaceshipRef.current;
    const arrived =
      !!ship &&
      ship.position.distanceTo(CAREER_GALLERY_WORLD_ANCHOR) <=
        CAREER_GALLERY_ENTRY_TRIGGER_DIST &&
      navigationDistance === null;
    if (arrived) arriveOutsideCareerGallery();
  }, [currentNavigationTarget, navigationDistance, arriveOutsideCareerGallery]);

  // Career Gallery per-frame animation (face swaps, hologram shader time).
  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    let last = performance.now();

    // Outside the gallery: the Falcon is placed in the camera's frame right
    // before each render (after the camera has moved), so it never lags or
    // jitters while the user spins around the globe.
    const scene = sceneRef.current.scene;
    const lasers = scene ? new FalconLaserBursts(scene) : null;
    careerGalleryLasersRef.current = lasers;
    const shipOffset = new THREE.Vector3();
    const shipFlip = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI,
    );
    // Hot air behind the engines (screen pass right after the scene render,
    // before bloom) and a rim light so the hull stands off the globe.
    const composer = composerRef.current;
    const heatPass = composer ? createHeatHazePass() : null;
    if (composer && heatPass) composer.insertPass(heatPass, 1);
    let rimLight: ShipRimLight | null = null;
    let rimShip: THREE.Object3D | null = null;
    let rimShown = false;
    const engineCenter = new THREE.Vector3();
    const engineLeft = new THREE.Vector3();
    const engineRight = new THREE.Vector3();
    const previousSceneBeforeRender = scene?.onBeforeRender;
    if (scene && previousSceneBeforeRender) {
      scene.onBeforeRender = function (...args) {
        const renderCamera = args[2] as THREE.PerspectiveCamera;
        const ship = spaceshipRef.current;
        const parked =
          careerGalleryOutsideRef.current &&
          !!ship &&
          renderCamera?.isPerspectiveCamera === true;
        if (ship && parked && rimShip !== ship) {
          rimLight?.dispose();
          rimLight = new ShipRimLight(ship);
          rimShip = ship;
          rimShown = false;
        }
        if (rimLight && rimShown !== parked) {
          rimLight.setVisible(parked);
          rimLight.setOnTop(parked);
          rimShown = parked;
        }
        if (heatPass) heatPass.enabled = parked;
        if (
          careerGalleryOutsideRef.current &&
          ship &&
          renderCamera?.isPerspectiveCamera
        ) {
          const t = performance.now() / 1000;
          // Rear toward us (model front is +Z, the camera looks down -Z).
          shipOffset
            .set(
              CAREER_GALLERY_SHIP_OFFSET.x + Math.sin(t * 0.6) * 0.02,
              CAREER_GALLERY_SHIP_OFFSET.y + Math.sin(t * 0.9) * 0.025,
              -CAREER_GALLERY_SHIP_OFFSET.z,
            )
            .applyQuaternion(renderCamera.quaternion);
          ship.position.copy(renderCamera.position).add(shipOffset);
          ship.quaternion.copy(renderCamera.quaternion).multiply(shipFlip);
          ship.updateMatrixWorld(true);

          // Center the haze on the engine grille, sized to its width on screen.
          if (heatPass) {
            const grille =
              (ship.userData.engineGlowPoints as THREE.Vector3[] | undefined) ?? [];
            if (grille.length > 0) {
              engineCenter.set(0, 0, 0);
              for (const point of grille) engineCenter.add(point);
              engineCenter.divideScalar(grille.length);
              engineLeft.copy(grille[0]);
              engineRight.copy(grille[grille.length - 1]);
            } else {
              engineCenter.set(0, 0, -6);
              engineLeft.set(-4, 0, -6);
              engineRight.set(4, 0, -6);
            }
            ship.localToWorld(engineCenter).project(renderCamera);
            ship.localToWorld(engineLeft).project(renderCamera);
            ship.localToWorld(engineRight).project(renderCamera);
            const width = Math.max(0.05, Math.abs(engineRight.x - engineLeft.x) * 0.5);
            const u = heatPass.uniforms;
            (u.uCenter.value as THREE.Vector2).set(
              engineCenter.x * 0.5 + 0.5,
              engineCenter.y * 0.5 + 0.5,
            );
            (u.uRadius.value as THREE.Vector2).set(
              width * 0.85,
              width * 0.85 * renderCamera.aspect * 0.7,
            );
            u.uStrength.value = CAREER_GALLERY_HEAT_STRENGTH;
            u.uTime.value = t;
          }
        }
        previousSceneBeforeRender.apply(this, args);
      };
    }

    // Interior drift state (see CAREER_GALLERY_DRIFT_RADII).
    let driftTime = 0;
    let driftRamp = 0;
    const driftPrevious = new THREE.Vector3();
    const driftNext = new THREE.Vector3();
    const driftTarget = new THREE.Vector3();
    const tau = Math.PI * 2;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const gallery = careerGalleryRef.current;
      const camera = sceneRef.current.camera as
        | THREE.PerspectiveCamera
        | undefined;
      if (!gallery || !camera) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      gallery.update(dt, camera);
      lasers?.update(dt, camera);
      careerGalleryShroudRef.current?.update(dt, camera);

      // Drift the interior viewpoint on a slow loop by moving the orbit target
      // (the camera rides 0.01 behind it), applying only the change each frame
      // so scroll-dolly and look-around keep working. Pauses while the user
      // drags (camera-controls action 0 = none) or a tile is open.
      const controls = sceneRef.current.controls;
      if (!careerGalleryActiveRef.current || !controls) {
        driftTime = 0;
        driftRamp = 0;
        driftPrevious.set(0, 0, 0);
        return;
      }
      if (controls.currentAction !== 0 || gallery.getFocusedIndex() !== null) {
        return;
      }
      driftTime += dt;
      driftRamp = Math.min(1, driftRamp + dt / CAREER_GALLERY_DRIFT_RAMP_S);
      const amplitude =
        gallery.radius *
        CAREER_GALLERY_DRIFT_RADII *
        THREE.MathUtils.smoothstep(driftRamp, 0, 1);
      driftNext.set(
        Math.sin((driftTime * tau) / 47) * amplitude,
        Math.sin((driftTime * tau) / 61) * amplitude * 0.35,
        Math.sin((driftTime * tau) / 53 + 1) * amplitude,
      );
      controls.getTarget(driftTarget).add(driftNext).sub(driftPrevious);
      controls.moveTo(driftTarget.x, driftTarget.y, driftTarget.z, false);
      driftPrevious.copy(driftNext);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (scene && previousSceneBeforeRender) {
        scene.onBeforeRender = previousSceneBeforeRender;
      }
      lasers?.dispose();
      careerGalleryLasersRef.current = null;
      if (composer && heatPass) {
        composer.removePass(heatPass);
        heatPass.dispose();
      }
      rimLight?.dispose();
    };
  }, [sceneReady]);

  // Career Gallery from outside: drag orbits the globe (camera-controls);
  // hover highlights a tile; a click (not a drag) flies its screenshot out,
  // holds it, and folds it back on its own.
  useEffect(() => {
    if (!careerGalleryOutside) return;
    const dom = rendererRef.current?.domElement;
    const camera = sceneRef.current.camera as THREE.PerspectiveCamera | undefined;
    const gallery = careerGalleryRef.current;
    if (!dom || !camera || !gallery) return;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pendingMove: PointerEvent | null = null;
    let hoverRaf = 0;
    let lastHover: number | null = null;
    let pressed: { x: number; y: number; t: number } | null = null;

    const pickAt = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return gallery.pickFace(raycaster);
    };
    const onPointerMove = (event: PointerEvent) => {
      pendingMove = event;
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        if (!pendingMove) return;
        const index = pickAt(pendingMove.clientX, pendingMove.clientY);
        if (index === lastHover) return;
        lastHover = index;
        gallery.setHovered(index);
        dom.style.cursor = index === null ? "" : "pointer";
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      pressed = { x: event.clientX, y: event.clientY, t: performance.now() };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pressed) return;
      const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
      const quick = performance.now() - pressed.t < 400;
      pressed = null;
      if (moved > 6 || !quick) return; // a spin-around drag, not a click
      const index = pickAt(event.clientX, event.clientY);
      if (index === null) return;
      gallery.flashFace(index);
    };
    // Keep canvas clicks from reaching the scene's planet click handler.
    const blockSceneClick = (event: MouseEvent) => {
      if (event.target === dom) event.stopPropagation();
    };

    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointerup", onPointerUp);
    window.addEventListener("click", blockSceneClick, true);
    return () => {
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("click", blockSceneClick, true);
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
      dom.style.cursor = "";
      gallery.setHovered(null);
      gallery.clearFocus();
    };
  }, [careerGalleryOutside]);

  // Career Gallery tiles: hover highlights edges; a click (not a drag) turns
  // toward the tile and reveals its full screenshot; Esc or clicking empty
  // space / the same tile closes it.
  useEffect(() => {
    if (!careerGalleryActive) return;
    const dom = rendererRef.current?.domElement;
    const camera = sceneRef.current.camera as THREE.PerspectiveCamera | undefined;
    const gallery = careerGalleryRef.current;
    if (!dom || !camera || !gallery) return;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pendingMove: PointerEvent | null = null;
    let hoverRaf = 0;
    let lastHover: number | null = null;
    let pressed: { x: number; y: number; t: number } | null = null;

    const pickAt = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return gallery.pickFace(raycaster);
    };
    const closeFocus = () => {
      gallery.clearFocus();
      setCareerGallerySelection(null);
    };

    const onPointerMove = (event: PointerEvent) => {
      pendingMove = event;
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        if (!pendingMove) return;
        const index = pickAt(pendingMove.clientX, pendingMove.clientY);
        if (index === lastHover) return;
        lastHover = index;
        gallery.setHovered(index);
        dom.style.cursor = index === null ? "" : "pointer";
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      pressed = { x: event.clientX, y: event.clientY, t: performance.now() };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pressed) return;
      const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
      const quick = performance.now() - pressed.t < 400;
      pressed = null;
      if (moved > 6 || !quick) return; // a look-around drag, not a click

      const index = pickAt(event.clientX, event.clientY);
      if (index === null || index === gallery.getFocusedIndex()) {
        closeFocus();
        return;
      }
      const info = gallery.focusFace(index);
      if (!info) return;
      setCareerGallerySelection(info);
      const controls = sceneRef.current.controls;
      if (controls) {
        const tile = gallery.getFaceWorldCentroid(index, new THREE.Vector3());
        lookFromToward(controls, tile);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFocus();
    };
    // Keep canvas clicks from reaching the scene's planet click handler
    // (which could navigate away) while inside the gallery.
    const blockSceneClick = (event: MouseEvent) => {
      if (event.target === dom) event.stopPropagation();
    };

    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("click", blockSceneClick, true);
    return () => {
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("click", blockSceneClick, true);
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
      dom.style.cursor = "";
      gallery.setHovered(null);
      closeFocus();
    };
  }, [careerGalleryActive]);

  useEffect(
    () => () => {
      careerGalleryGlideCancelRef.current?.();
      careerGalleryZoomDetachRef.current?.();
      careerGalleryRef.current?.dispose();
      careerGalleryRef.current = null;
      careerGalleryShroudRef.current?.dispose();
      careerGalleryShroudRef.current = null;
    },
    [],
  );

  // Sync navigationDistance to a ref for render-loop access.
  navigationDistanceRef.current = navigationDistance;

  // About particle swarm arrival detection is handled in the render loop
  // (aboutJourneyController.checkArrival) for frame-accurate timing.

  useEffect(() => {
    if (
      aboutMemorySquareActiveRef.current ||
      aboutMemorySquareEntrySequenceRef.current.active
    ) {
      return;
    }
    const ship = spaceshipRef.current;
    const anchor = aboutMemorySquareWorldAnchorRef.current;
    if (!ship || !anchor) return;
    const nearAbout =
      ship.position.distanceTo(anchor) <=
      ABOUT_MEMORY_SQUARE_ENTRY_TRIGGER_DIST;
    if (!nearAbout) return;
    const now = performance.now();
    const hasIntent =
      currentNavigationTarget === ABOUT_MEMORY_SQUARE_NAV_ID ||
      now <= aboutMemorySquareNavIntentUntilRef.current;
    if (!hasIntent || navigationDistance !== null) return;
    enterAboutMemorySquare();
  }, [currentNavigationTarget, navigationDistance, enterAboutMemorySquare]);

  useEffect(() => {
    const prev = aboutMemorySquarePrevNavTargetRef.current;
    if (
      prev === ABOUT_MEMORY_SQUARE_NAV_ID &&
      currentNavigationTarget === null &&
      !aboutMemorySquareActiveRef.current &&
      !aboutMemorySquareEntrySequenceRef.current.active &&
      performance.now() <= aboutMemorySquareNavIntentUntilRef.current
    ) {
      enterAboutMemorySquare();
    }
    aboutMemorySquarePrevNavTargetRef.current = currentNavigationTarget;
  }, [currentNavigationTarget, enterAboutMemorySquare]);

  useEffect(() => {
    if (currentNavigationTarget === ABOUT_MEMORY_SQUARE_NAV_ID) {
      aboutMemorySquareNavIntentUntilRef.current = performance.now() + 20000;
    }
  }, [currentNavigationTarget]);

  useEffect(() => {
    if (isLoading || !sceneReady) return;
    if (!introStartQueuedRef.current || introStartConsumedRef.current) return;

    if (FAST_TRACK_TARGET) {
      introStartConsumedRef.current = true;
      setCosmosIntroOverlayOpacity(0);
      const camera = sceneRef.current.camera;
      const controls = sceneRef.current.controls;
      if (camera) {
        camera.position.copy(INTRO_CAMERA_FINAL_POS);
      }
      if (controls) {
        const controlsAny = controls as unknown as {
          target?: THREE.Vector3;
          setTarget?: (x: number, y: number, z: number) => void;
        };
        if (controlsAny.setTarget) {
          controlsAny.setTarget(
            INTRO_CAMERA_FINAL_TARGET.x,
            INTRO_CAMERA_FINAL_TARGET.y,
            INTRO_CAMERA_FINAL_TARGET.z,
          );
        } else if (controlsAny.target) {
          controlsAny.target.copy(INTRO_CAMERA_FINAL_TARGET);
        }
        controls.update?.(0);
      }
      dwarn("[FAST_TRACK] Skipping intro sequence, positioning camera at home");
      setStartupDestinationsVisible(true);
      setStartupConsoleVisible(true);
      setStartupMiniMapVisible(true);
      return;
    }

    const startIntro = startIntroSequenceRef.current;
    if (!startIntro) return;
    let fadeRaf = 0;
    const fadeStartedAt = performance.now();
    const fadeDurationMs = 2000;
    const tickFade = () => {
      const t = THREE.MathUtils.clamp(
        (performance.now() - fadeStartedAt) / fadeDurationMs,
        0,
        1,
      );
      const ease = 1 - Math.pow(1 - t, 3);
      setCosmosIntroOverlayOpacity(THREE.MathUtils.lerp(1, 0, ease));
      if (t >= 1) {
        setCosmosIntroOverlayOpacity(0);
        if (CAMERA_TRACE_ENABLED) {
          shipLog("[CAMTRACE] intro fade completed (2s)", "info");
        }
        return;
      }
      fadeRaf = requestAnimationFrame(tickFade);
    };
    fadeRaf = requestAnimationFrame(tickFade);
    introStartConsumedRef.current = true;
    dwarn(
      "[PERF:intro] intro sequence STARTING (isLoading=false, sceneReady=true)",
    );
    if (CAMERA_TRACE_ENABLED) {
      shipLog("[CAMTRACE] invoking camera-intro start + fade start", "info");
    }
    startIntro();
    return () => {
      if (fadeRaf) cancelAnimationFrame(fadeRaf);
    };
  }, [isLoading, sceneReady, shipLog]);

  useEffect(() => {
    if (!FAST_TRACK_TARGET || fastTrackConsumedRef.current) return;
    if (isLoading || !sceneReady) return;
    const target = FAST_TRACK_TARGET;
    fastTrackConsumedRef.current = true;
    dwarn(`[FAST_TRACK] Navigating directly to: ${target}`);
    handleCockpitNavigate(target, "section");
  }, [isLoading, sceneReady, handleCockpitNavigate]);

  const clearStartupUiRevealTimeline = useCallback(() => {
    if (startupUiRevealTlRef.current) {
      startupUiRevealTlRef.current.kill();
      startupUiRevealTlRef.current = null;
    }
  }, []);

  const resetStartupUiReveal = useCallback(() => {
    clearStartupUiRevealTimeline();
    setStartupDestinationsVisible(false);
    setStartupConsoleVisible(false);
    setStartupMiniMapVisible(false);
  }, [clearStartupUiRevealTimeline]);

  const runStartupUiReveal = useCallback(() => {
    clearStartupUiRevealTimeline();
    setStartupDestinationsVisible(true);
    setStartupConsoleVisible(true);
    setStartupMiniMapVisible(true);

    let attempts = 0;
    const maxAttempts = 10;
    const tryAnimate = () => {
      const destinationsEl = startupDestinationsPanelRef.current;
      const consoleEl = startupConsoleButtonRef.current;
      const miniMapEl = startupMiniMapContainerRef.current;
      if (!destinationsEl || !consoleEl || !miniMapEl) {
        attempts++;
        if (attempts < maxAttempts) {
          window.requestAnimationFrame(tryAnimate);
          return;
        }
        // After max retries, DOM refs still not ready — state flags are
        // already true so elements will render with default visibility.
        dwarn(
          "[UI-SAFEGUARD] Startup UI refs unavailable after retries; elements visible via state flags",
        );
        return;
      }
      gsap.set(destinationsEl, { x: -200, opacity: 0 });
      gsap.set(consoleEl, { x: 200, opacity: 0 });
      gsap.set(miniMapEl, { x: 200, opacity: 0 });
      const revealEndAt = 1.2;
      const destinationsStartAt = 0.0;
      const consoleStartAt = 0.2;
      const miniMapStartAt = 0.4;
      const tl = gsap.timeline();
      tl.to(destinationsEl, {
        x: 0,
        opacity: 1,
        duration: revealEndAt - destinationsStartAt,
        ease: "elastic.out(1, 0.75)",
      })
        .to(
          consoleEl,
          {
            x: 0,
            opacity: 1,
            duration: revealEndAt - consoleStartAt,
            ease: "elastic.out(1, 0.75)",
          },
          consoleStartAt,
        )
        .to(
          miniMapEl,
          {
            x: 0,
            opacity: 1,
            duration: revealEndAt - miniMapStartAt,
            ease: "elastic.out(1, 0.75)",
          },
          miniMapStartAt,
        );
      startupUiRevealTlRef.current = tl;
    };
    window.requestAnimationFrame(tryAnimate);
  }, [clearStartupUiRevealTimeline]);
  runStartupUiRevealRef.current = runStartupUiReveal;

  useEffect(
    () => () => clearStartupUiRevealTimeline(),
    [clearStartupUiRevealTimeline],
  );

  // Watchdog: if the ship is engaged but startup UI flags are still false
  // after a short delay, force them on. Catches any edge case where the
  // reveal call was skipped or its state updates were lost.
  useEffect(() => {
    if (shipUIPhase !== "ship-engaged") return;
    const watchdog = window.setTimeout(() => {
      setStartupDestinationsVisible((prev) => {
        if (!prev)
          dwarn("[UI-SAFEGUARD] Watchdog forcing destinations visible");
        return true;
      });
      setStartupConsoleVisible((prev) => {
        if (!prev) dwarn("[UI-SAFEGUARD] Watchdog forcing console visible");
        return true;
      });
      setStartupMiniMapVisible((prev) => {
        if (!prev) dwarn("[UI-SAFEGUARD] Watchdog forcing minimap visible");
        return true;
      });
    }, 3000);
    return () => window.clearTimeout(watchdog);
  }, [shipUIPhase]);

  useEffect(() => {
    if (!CAMERA_TRACE_ENABLED) return;
    const intervalId = window.setInterval(() => {
      const camera = sceneRef.current.camera;
      const controls = sceneRef.current.controls;
      if (!camera) return;
      let driver = "free-controls";
      const cinematic = shipCinematicRef.current;
      if (isLoading) {
        driver = "loader";
      } else if (!sceneReady) {
        driver = "scene-init";
      } else if (orbitalPortfolioActiveRef.current) {
        driver = "orbital-portfolio-loop";
      } else if (
        aboutMemorySquareActiveRef.current ||
        aboutMemorySquareEntrySequenceRef.current.active
      ) {
        driver = "about-memory-square";
      } else if (
        skillsLatticeActiveRef.current ||
        skillsLatticeSystemActiveRef.current
      ) {
        driver = "skills-lattice";
      } else if (cinematic?.active) {
        driver = `ship-cinematic:${cinematic.phase}`;
      } else if (isOrbiting()) {
        driver = "moon-orbit-camera";
      } else if (manualFlightModeRef.current) {
        driver = "manual-flight";
      } else if (followingSpaceshipRef.current && insideShipRef.current) {
        driver = `ship-follow:${shipViewModeRef.current}`;
      } else if (followingSpaceshipRef.current) {
        driver = "ship-follow:exterior";
      }
      if (driver === cameraDriverTraceRef.current) return;
      cameraDriverTraceRef.current = driver;
      const target = new THREE.Vector3();
      const controlsAny = controls as unknown as {
        getTarget?: (out: THREE.Vector3) => void;
      };
      if (controlsAny?.getTarget) {
        controlsAny.getTarget(target);
      } else {
        target.copy(camera.position);
      }
      shipLog(
        `[CAMTRACE] driver=${driver} cam=[${camera.position.x.toFixed(1)},${camera.position.y.toFixed(1)},${camera.position.z.toFixed(1)}] target=[${target.x.toFixed(1)},${target.y.toFixed(1)},${target.z.toFixed(1)}] controls=${controls?.enabled ? 1 : 0}`,
        "info",
      );
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [isLoading, isOrbiting, sceneReady, shipLog]);

  const goToAboutSlide = useCallback(
    (direction: -1 | 1) => {
      if (aboutSlides.length === 0) return;
      setAboutActiveSlideIndex((prev) => {
        const total = aboutSlides.length;
        return (prev + direction + total) % total;
      });
    },
    [aboutSlides.length],
  );

  const stampAboutContentIntoCells = useCallback(() => {
    const revealAttr = aboutCellRevealAttrRef.current;
    if (!revealAttr) return;
    for (let i = 0; i < revealAttr.count; i += 1) {
      revealAttr.setX(i, 1);
    }
    revealAttr.needsUpdate = true;
  }, []);

  const resetAboutShardContentReveal = useCallback(() => {
    const revealAttr = aboutCellRevealAttrRef.current;
    if (!revealAttr) return;
    for (let i = 0; i < revealAttr.count; i += 1) {
      revealAttr.setX(i, 0);
    }
    revealAttr.needsUpdate = true;
  }, []);

  const triggerAboutSwarmBreakApart = useCallback(() => {
    const run = async () => {
      if (
        aboutSlidePreparedIndexRef.current !== aboutActiveSlideIndex ||
        !aboutSlideReadyRef.current
      ) {
        aboutSlideReadyRef.current = false;
        await prepareAboutSlide(aboutActiveSlideIndex);
        aboutSlidePreparedIndexRef.current = aboutActiveSlideIndex;
        aboutSlideReadyRef.current = true;
      }
      stampAboutContentIntoCells();
      aboutTileContentFadeStartMsRef.current = performance.now();
      aboutSwarmManualTriggerRef.current = true;
      const runtime = aboutCellAnimationRef.current;
      runtime.active = true;
      if (!runtime.initialized) {
        runtime.initialized = true;
        runtime.phase = "assembledHold";
        runtime.phaseStartedAt = performance.now();
        runtime.phaseDurationMs = 0;
        runtime.lastTickMs = performance.now();
      }
      vlog("🧩 About swarm: manual break-apart trigger");
    };
    void run();
  }, [vlog, stampAboutContentIntoCells, aboutActiveSlideIndex]);

  const triggerAboutSwarmReform = useCallback(() => {
    aboutSwarmManualReformRef.current = true;
    const runtime = aboutCellAnimationRef.current;
    runtime.active = true;
    if (!runtime.initialized) {
      runtime.initialized = true;
      runtime.phase = "swarm";
      runtime.phaseStartedAt = performance.now();
      runtime.phaseDurationMs = 0;
      runtime.lastTickMs = performance.now();
    }
    vlog("🧩 About swarm: manual reform trigger");
  }, [vlog]);

  async function prepareAboutSlide(slideIndex: number) {
    if (!aboutSlides.length) return;
    const slide =
      aboutSlides[
        ((slideIndex % aboutSlides.length) + aboutSlides.length) %
          aboutSlides.length
      ];
    const blocks = Array.from(
      { length: 4 },
      (_, i) =>
        slide.blocks[i] ?? {
          type: "text" as const,
          title: "Placeholder",
          body: "Content incoming.",
        },
    );
    const canvasSize = 384;
    const canvases = blocks.map((block, idx) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) return canvas;
      const blockPalette = [
        ["#12355a", "#1d6fa8"],
        ["#1a2a54", "#4f58a8"],
        ["#2b3554", "#7c4a9a"],
        ["#1c3c3e", "#2f8f7d"],
      ];
      const [bgA, bgB] = blockPalette[idx % blockPalette.length];
      const grad = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
      grad.addColorStop(0, bgA);
      grad.addColorStop(1, bgB);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      if (block.type === "image" && block.src) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, 0, canvasSize, canvasSize);
      } else {
        ctx.fillStyle = "#eff7ff";
        ctx.font = "700 36px Arial";
        ctx.fillText(block.title ?? "About", 26, 72, canvasSize - 52);
        ctx.fillStyle = "rgba(235,246,255,0.98)";
        ctx.font = "600 24px Arial";
        const lines = (block.body ?? "").split(" ");
        let line = "";
        let y = 128;
        lines.forEach((word) => {
          const probe = line ? `${line} ${word}` : word;
          const width = ctx.measureText(probe).width;
          if (width > canvasSize - 52 && line) {
            ctx.fillText(line, 26, y);
            y += 30;
            line = word;
          } else {
            line = probe;
          }
        });
        if (line) ctx.fillText(line, 26, y);
      }
      ctx.fillStyle = "rgba(255,255,255,0.86)";
      ctx.font = "700 26px Arial";
      ctx.fillText(`S${slideIndex + 1} • B${idx + 1}`, 24, canvasSize - 26);
      return canvas;
    });

    const applyCanvasesToSlideTextures = (
      inputCanvases: HTMLCanvasElement[],
    ) => {
      const contentMats = aboutTileContentMatsRef.current;
      const shaderMat = aboutCellShaderMaterialRef.current;
      const prevTextures = aboutSlideTexturesRef.current;
      const nextTextures: Array<THREE.Texture | null> = [
        null,
        null,
        null,
        null,
      ];
      for (let i = 0; i < Math.min(4, contentMats.length); i += 1) {
        const mat = contentMats[i];
        if (!mat) continue;
        const tex = new THREE.CanvasTexture(inputCanvases[i]);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        nextTextures[i] = tex;
        mat.map = tex;
        mat.opacity = 0;
        mat.needsUpdate = true;
      }
      if (shaderMat) {
        shaderMat.uniforms.uTile0.value = nextTextures[0];
        shaderMat.uniforms.uTile1.value = nextTextures[1];
        shaderMat.uniforms.uTile2.value = nextTextures[2];
        shaderMat.uniforms.uTile3.value = nextTextures[3];
        shaderMat.uniformsNeedUpdate = true;
      }
      prevTextures.forEach((tex) => tex?.dispose());
      aboutSlideTexturesRef.current = nextTextures;
    };

    // 1) Apply immediate placeholders/text so slides are visible on load.
    applyCanvasesToSlideTextures(canvases);

    await Promise.all(
      blocks.map(async (block, idx) => {
        if (block.type !== "image" || !block.src) return;
        const canvas = canvases[idx];
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        let img = aboutImageCacheRef.current.get(block.src);
        if (!img) {
          img = new Image();
          img.src = block.src;
          await new Promise<void>((resolve) => {
            img!.onload = () => resolve();
            img!.onerror = () => resolve();
          });
          aboutImageCacheRef.current.set(block.src, img);
        }
        const iw = Math.max(1, img.naturalWidth || canvasSize);
        const ih = Math.max(1, img.naturalHeight || canvasSize);
        const scale = Math.max(canvasSize / iw, canvasSize / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (canvasSize - dw) * 0.5;
        const dy = (canvasSize - dh) * 0.5;
        ctx.clearRect(0, 0, canvasSize, canvasSize);
        try {
          ctx.drawImage(img, dx, dy, dw, dh);
        } catch {
          // Keep fallback gradient/title when image decode fails.
        }
        ctx.fillStyle = "rgba(8,18,32,0.18)";
        ctx.fillRect(0, 0, canvasSize, canvasSize);
        ctx.fillStyle = "#f4fbff";
        ctx.font = "700 30px Arial";
        ctx.fillText(
          block.title ?? "Image",
          20,
          canvasSize - 28,
          canvasSize - 40,
        );
      }),
    );

    // 2) Re-apply with loaded image content once available.
    applyCanvasesToSlideTextures(canvases);

    const images = canvases.map(
      (canvas) =>
        canvas.getContext("2d")!.getImageData(0, 0, canvasSize, canvasSize)
          .data,
    );
    const targetColors = aboutCellTargetColorsRef.current;
    const revealAt = aboutCellRevealAtMsRef.current;
    const cellOrderNoise = (u: number, v: number) =>
      Math.abs(
        Math.sin((u * 12.9898 + v * 78.233 + slideIndex * 17.77) * 43758.5453),
      ) % 1;
    const pattern = slide.reveal?.pattern ?? "scanline";
    const blockStagger = Math.max(120, slide.reveal?.blockStaggerMs ?? 360);
    const cellReveal = Math.max(900, slide.reveal?.cellRevealMs ?? 1700);
    aboutTileContentRevealStartMsRef.current = performance.now();
    aboutTileContentRevealBlockStaggerMsRef.current = blockStagger;
    const slots = aboutCellSlotsRef.current;
    const baseColors = aboutCellBaseColorsRef.current;
    slots.forEach((slot, slotIdx) => {
      const blockIdx = THREE.MathUtils.clamp(slot.tileIndex, 0, 3);
      const px = THREE.MathUtils.clamp(
        Math.floor(slot.u * (canvasSize - 1)),
        0,
        canvasSize - 1,
      );
      const py = THREE.MathUtils.clamp(
        Math.floor((1 - slot.v) * (canvasSize - 1)),
        0,
        canvasSize - 1,
      );
      const p = (py * canvasSize + px) * 4;
      const data = images[blockIdx];
      const r = data[p] / 255;
      const g = data[p + 1] / 255;
      const b = data[p + 2] / 255;
      const target = targetColors[slotIdx] ?? new THREE.Color();
      target.setRGB(
        THREE.MathUtils.clamp(r * (slot.face === "front" ? 1.18 : 0.88), 0, 1),
        THREE.MathUtils.clamp(g * (slot.face === "front" ? 1.18 : 0.88), 0, 1),
        THREE.MathUtils.clamp(b * (slot.face === "front" ? 1.18 : 0.88), 0, 1),
      );
      targetColors[slotIdx] = target;

      let localOrder = slot.u;
      if (pattern === "center-out") {
        const dx = slot.u - 0.5;
        const dy = slot.v - 0.5;
        localOrder = THREE.MathUtils.clamp(
          Math.sqrt(dx * dx + dy * dy) / 0.7072,
          0,
          1,
        );
      } else if (pattern === "spiral") {
        const dx = slot.u - 0.5;
        const dy = slot.v - 0.5;
        const angle = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
        const radius = THREE.MathUtils.clamp(
          Math.sqrt(dx * dx + dy * dy) / 0.7072,
          0,
          1,
        );
        localOrder = (angle * 0.5 + radius * 0.5) % 1;
      } else if (pattern === "noise-cluster") {
        localOrder = cellOrderNoise(slot.u, slot.v);
      }
      revealAt[slotIdx] =
        slot.face === "front"
          ? blockIdx * blockStagger + localOrder * cellReveal
          : 0;
      if (!baseColors[slotIdx]) baseColors[slotIdx] = new THREE.Color(0x8cbcff);
    });
  }

  const ensureAboutSlidePrepared = useCallback(() => {
    if (aboutSlides.length === 0) return;
    if (aboutSlidePreparePendingRef.current) return;
    if (aboutTileContentMatsRef.current.length < 4) return;
    const hasAllMaps = aboutTileContentMatsRef.current
      .slice(0, 4)
      .every((m) => !!m?.map);
    const needsPrepare =
      aboutSlidePreparedIndexRef.current !== aboutActiveSlideIndex ||
      !aboutSlideReadyRef.current ||
      !hasAllMaps;
    if (!needsPrepare) return;
    shipLog(
      `ABOUTDBG prepare:start slide=${aboutActiveSlideIndex + 1} mats=${aboutTileContentMatsRef.current.length} maps=${hasAllMaps ? "yes" : "no"}`,
      "nav",
    );
    aboutSlidePreparePendingRef.current = true;
    aboutSlideReadyRef.current = false;
    void prepareAboutSlide(aboutActiveSlideIndex)
      .then(() => {
        aboutSlidePreparedIndexRef.current = aboutActiveSlideIndex;
        aboutSlideReadyRef.current = true;
        shipLog(
          `ABOUTDBG prepare:done slide=${aboutActiveSlideIndex + 1} maps=${aboutTileContentMatsRef.current
            .slice(0, 4)
            .map((m) => (m?.map ? "1" : "0"))
            .join("")}`,
          "nav",
        );
      })
      .finally(() => {
        aboutSlidePreparePendingRef.current = false;
      });
  }, [aboutSlides.length, aboutActiveSlideIndex, shipLog]);

  useEffect(() => {
    if (!sceneReady) {
      setAboutSwarmTriggerVisible(false);
      return;
    }
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const shouldShow =
        aboutMemorySquareActiveRef.current &&
        !aboutMemorySquareEntrySequenceRef.current.active &&
        !orbitalPortfolioActiveRef.current &&
        !skillsLatticeActiveRef.current;
      setAboutSwarmTriggerVisible((prev) =>
        prev === shouldShow ? prev : shouldShow,
      );
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setAboutSwarmTriggerVisible(false);
    };
  }, [sceneReady]);

  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    const falconPos = new THREE.Vector3();
    const prevFalconPos = new THREE.Vector3();
    const delta = new THREE.Vector3();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!inspectFalconModeRef.current) return;

      const falcon = spaceshipRef.current;
      const camera = sceneRef.current.camera;
      const controls = sceneRef.current.controls;
      if (!falcon || !camera || !controls) return;

      falcon.getWorldPosition(falconPos);
      const last = inspectFalconLastTargetRef.current;
      if (last) {
        prevFalconPos.copy(last);
        delta.copy(falconPos).sub(prevFalconPos);
        if (delta.lengthSq() > 1e-9) {
          camera.position.add(delta);
        }
      }

      controls.minDistance = 1;
      controls.maxDistance = 6000;
      controls.setLookAt(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        falconPos.x,
        falconPos.y,
        falconPos.z,
        false,
      );

      if (!inspectFalconLastTargetRef.current) {
        inspectFalconLastTargetRef.current = falconPos.clone();
      } else {
        inspectFalconLastTargetRef.current.copy(falconPos);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneReady]);

  useEffect(() => {
    if (!sceneReady || aboutSlides.length === 0) {
      return;
    }
    aboutSlideStartedAtRef.current = performance.now();
    aboutSlideAdvanceAfterReformRef.current = false;
    // Keep shard texture hidden in assembled mode; planes own the static slide display.
    resetAboutShardContentReveal();
    ensureAboutSlidePrepared();
  }, [
    sceneReady,
    aboutActiveSlideIndex,
    aboutSlides,
    resetAboutShardContentReveal,
    ensureAboutSlidePrepared,
  ]);

  useEffect(() => {
    if (!sceneReady || aboutSlides.length === 0) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (
        aboutSlidePreparedIndexRef.current !== aboutActiveSlideIndex ||
        !aboutSlideReadyRef.current ||
        !aboutTileContentMatsRef.current.slice(0, 4).every((m) => !!m?.map)
      ) {
        ensureAboutSlidePrepared();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    sceneReady,
    aboutSlides.length,
    aboutActiveSlideIndex,
    ensureAboutSlidePrepared,
  ]);

  useEffect(() => {
    if (!sceneReady) return;
    const tempMatrix = new THREE.Matrix4();
    const tempScale = new THREE.Vector3(1, 1, 1);
    const slotCenter = new THREE.Vector3();
    const toCenter = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const drift = new THREE.Vector3();
    const randomDir = new THREE.Vector3();
    const burstDir = new THREE.Vector3();
    const spinAxis = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const worldRight = new THREE.Vector3(1, 0, 0);
    const toTarget = new THREE.Vector3();
    const deltaQuat = new THREE.Quaternion();
    const deltaQuatB = new THREE.Quaternion();
    const targetQuat = new THREE.Quaternion();

    const shuffleSlotTargets = () => {
      const slots = aboutCellSlotsRef.current;
      const records = aboutCellRecordsRef.current;
      const targetOrder = Array.from({ length: slots.length }, (_, i) => i);
      for (let i = targetOrder.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = targetOrder[i];
        targetOrder[i] = targetOrder[j];
        targetOrder[j] = tmp;
      }
      records.forEach((rec, idx) => {
        rec.targetSlotIndex = targetOrder[idx] ?? idx;
      });
    };

    const setPhase = (phase: AboutSwarmPhase, now: number) => {
      const runtime = aboutCellAnimationRef.current;
      runtime.phase = phase;
      runtime.phaseStartedAt = now;
      if (phase === "assembledHold")
        runtime.phaseDurationMs = ABOUT_SWARM_ASSEMBLED_HOLD_MS;
      if (phase === "breakOut")
        runtime.phaseDurationMs = ABOUT_SWARM_BREAKOUT_MS;
      if (phase === "swarm") {
        runtime.swarmDurationMs = THREE.MathUtils.lerp(
          ABOUT_SWARM_MIN_MS,
          ABOUT_SWARM_MAX_MS,
          Math.random(),
        );
        runtime.phaseDurationMs = runtime.swarmDurationMs;
      }
      if (phase === "reform") runtime.phaseDurationMs = ABOUT_SWARM_REFORM_MS;
      if (phase === "settle") runtime.phaseDurationMs = ABOUT_SWARM_SETTLE_MS;
    };

    const updateGridLineVisibility = (phase: AboutSwarmPhase) => {
      let opacity = 0;
      let coreOpacity = 0;
      // Keep silhouette and grid hidden until reformation fully completes.
      if (phase === "assembledHold") {
        opacity = 0.42;
        coreOpacity = 0.2;
      }
      aboutTileGridLineMatsRef.current.forEach((mat) => {
        mat.opacity = opacity;
      });
      aboutTileEdgeLineMatsRef.current.forEach((mat) => {
        mat.opacity = opacity;
      });
      aboutTileCoreMatsRef.current.forEach((mat) => {
        mat.opacity = coreOpacity;
      });
    };

    const beginBreakOut = (now: number) => {
      const slots = aboutCellSlotsRef.current;
      const records = aboutCellRecordsRef.current;
      // Per breakout cycle, each of the 4 large panels randomly picks one spin style:
      // 0 = graceful twirl, 1 = aggressive tumble.
      aboutPanelSpinStyleRef.current = Array.from({ length: 4 }, () =>
        Math.random() < 0.5 ? 0 : 1,
      );
      slotCenter.set(0, 0, 0);
      slots.forEach((slot) => slotCenter.add(slot.worldPosition));
      slotCenter.multiplyScalar(1 / Math.max(1, slots.length));
      records.forEach((rec, idx) => {
        const slot = slots[rec.targetSlotIndex] ?? slots[idx];
        const sourceSlot = slots[rec.sourceSlotIndex] ?? slot;
        const panelIdx = THREE.MathUtils.clamp(sourceSlot.tileIndex, 0, 3);
        const panelSpinStyle = aboutPanelSpinStyleRef.current[panelIdx] ?? 0;
        const spinRateScale =
          panelSpinStyle === 1
            ? 3.2 + Math.random() * 2.5
            : 1.25 + Math.random() * 0.95;
        rec.position.copy(slot.worldPosition);
        rec.quaternion.copy(slot.worldQuaternion);
        rec.velocity.set(0, 0, 0);
        toCenter.subVectors(rec.position, slotCenter);
        const baseLen = Math.max(60, toCenter.length());
        if (toCenter.lengthSq() < 1e-6) {
          toCenter.set(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5,
          );
        }
        toCenter.normalize();
        randomDir.set(
          Math.sin(rec.pulsePhase * 2.13),
          Math.cos(rec.pulsePhase * 1.71),
          Math.sin(rec.pulsePhase * 3.07 + 1.2),
        );
        if (randomDir.lengthSq() < 1e-6) randomDir.set(0.35, -0.2, 0.9);
        randomDir.normalize();
        burstDir
          .copy(toCenter)
          .multiplyScalar(0.64)
          .addScaledVector(randomDir, 0.78)
          .normalize();
        rec.burstDirection.copy(burstDir);
        tangent.crossVectors(burstDir, randomDir);
        if (tangent.lengthSq() < 1e-6) {
          tangent.crossVectors(
            burstDir,
            Math.abs(burstDir.y) < 0.85 ? worldUp : worldRight,
          );
        }
        tangent.normalize();
        rec.velocity
          .copy(burstDir)
          .multiplyScalar(ABOUT_BREAK_IMPULSE * (0.58 + Math.random() * 0.52))
          .addScaledVector(tangent, ABOUT_BREAK_IMPULSE * 0.34)
          .addScaledVector(randomDir, ABOUT_BREAK_IMPULSE * 0.18)
          .multiplyScalar(baseLen / 180);
        rec.angularVelocity.set(
          (Math.random() * 2 - 1) * ABOUT_SPIN_MAX,
          (Math.random() * 2 - 1) * ABOUT_SPIN_MAX,
          (Math.random() * 2 - 1) * ABOUT_SPIN_MAX,
        );
        rec.spinAxisPrimary
          .set(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
          )
          .normalize();
        rec.spinAxisSecondary
          .set(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
          )
          .normalize();
        if (rec.spinAxisPrimary.lengthSq() < 1e-6)
          rec.spinAxisPrimary.set(0.47, 0.63, -0.62);
        if (rec.spinAxisSecondary.lengthSq() < 1e-6)
          rec.spinAxisSecondary.set(-0.28, 0.86, 0.42);
        rec.spinRatePrimary =
          (Math.random() * 2 - 1) * ABOUT_SPIN_MAX * spinRateScale;
        rec.spinRateSecondary =
          (Math.random() * 2 - 1) *
          ABOUT_SPIN_MAX *
          spinRateScale *
          (panelSpinStyle === 1 ? 0.9 : 0.72);
      });
      setPhase("breakOut", now);
    };

    const beginReform = (now: number) => {
      shuffleSlotTargets();
      setPhase("reform", now);
    };

    const tick = () => {
      aboutCellRafRef.current = requestAnimationFrame(tick);
      const runtime = aboutCellAnimationRef.current;
      const mesh = aboutCellMeshRef.current;
      const records = aboutCellRecordsRef.current;
      const slots = aboutCellSlotsRef.current;
      if (
        !runtime.active ||
        !runtime.initialized ||
        !mesh ||
        records.length === 0 ||
        slots.length === 0
      ) {
        return;
      }

      const now = performance.now();
      const dt = Math.min((now - runtime.lastTickMs) / 1000, 0.05);
      runtime.lastTickMs = now;

      const camera = sceneRef.current.camera;
      const anchor = aboutMemorySquareWorldAnchorRef.current;
      if (camera && anchor) {
        runtime.distanceGateActive =
          camera.position.distanceTo(anchor) > ABOUT_SWARM_DISTANCE_GATE;
      }

      const phaseElapsed = now - runtime.phaseStartedAt;
      const phaseT = THREE.MathUtils.clamp(
        phaseElapsed / Math.max(1, runtime.phaseDurationMs),
        0,
        1,
      );
      updateGridLineVisibility(runtime.phase);
      // In assembled mode, content planes own the visible slide;
      // hide instanced shards so they do not occlude the planes.
      mesh.visible = runtime.phase !== "assembledHold";
      const slideCount = Math.max(0, aboutSlides.length);

      const applyRecordMatrix = (
        idx: number,
        rec: AboutCellRecord,
        pulse = 1,
      ) => {
        const slot = slots[rec.targetSlotIndex] ?? slots[idx];
        tempScale.copy(slot.scale).multiplyScalar(pulse);
        tempMatrix.compose(rec.position, rec.quaternion, tempScale);
        mesh.setMatrixAt(idx, tempMatrix);
      };

      if (aboutSwarmManualTriggerRef.current) {
        aboutSwarmManualTriggerRef.current = false;
        beginBreakOut(now);
        return;
      }
      if (aboutSwarmManualReformRef.current) {
        aboutSwarmManualReformRef.current = false;
        beginReform(now);
        return;
      }

      if (runtime.distanceGateActive) {
        // Keep slide planes visible at long range; skip heavy shard motion work.
        const canShowSlidePlanes = aboutTileContentMatsRef.current.some(
          (mat) => !!mat?.map,
        );
        if (!canShowSlidePlanes) {
          ensureAboutSlidePrepared();
        }
        let distanceAlpha = 1;
        if (camera && anchor) {
          const d = camera.position.distanceTo(anchor);
          distanceAlpha = THREE.MathUtils.clamp(
            1 - (d - 7000) / 36000,
            0.24,
            1,
          );
        }
        aboutTileContentMatsRef.current.forEach((mat) => {
          if (!mat) return;
          mat.opacity = canShowSlidePlanes ? distanceAlpha : 0;
        });
        const dbg = aboutDebugStateRef.current;
        const nowMs = performance.now();
        const prepChanged =
          dbg.lastPrepared !== aboutSlidePreparedIndexRef.current ||
          dbg.lastReady !== aboutSlideReadyRef.current;
        const phaseChanged = dbg.lastPhase !== runtime.phase;
        const canShowChanged = dbg.lastCanShow !== canShowSlidePlanes;
        if (
          (prepChanged || phaseChanged || canShowChanged) &&
          nowMs - dbg.lastLogMs > 600
        ) {
          dbg.lastLogMs = nowMs;
          dbg.lastPhase = runtime.phase;
          dbg.lastCanShow = canShowSlidePlanes;
          dbg.lastPrepared = aboutSlidePreparedIndexRef.current;
          dbg.lastReady = aboutSlideReadyRef.current;
          shipLog(
            `ABOUTDBG far phase=${runtime.phase} canShow=${canShowSlidePlanes ? 1 : 0} alpha=${distanceAlpha.toFixed(2)} prepared=${aboutSlidePreparedIndexRef.current + 1} ready=${aboutSlideReadyRef.current ? 1 : 0} maps=${aboutTileContentMatsRef.current
              .slice(0, 4)
              .map((m) => (m?.map ? "1" : "0"))
              .join("")}`,
            "nav",
          );
        }
        return;
      }

      if (runtime.phase === "assembledHold") {
        // Auto random shatter disabled; About transitions are now user-driven.
      } else if (runtime.phase === "breakOut") {
        records.forEach((rec, idx) => {
          const sourceSlot = slots[rec.sourceSlotIndex] ?? slots[idx];
          const panelIdx = THREE.MathUtils.clamp(sourceSlot.tileIndex, 0, 3);
          const panelSpinStyle = aboutPanelSpinStyleRef.current[panelIdx] ?? 0;
          const spinPrimaryGain = panelSpinStyle === 1 ? 1.48 : 0.82;
          const spinSecondaryGain = panelSpinStyle === 1 ? 1.28 : 0.72;
          const pulse =
            1 + Math.sin(now * 0.001 + rec.pulsePhase) * 0.08 * phaseT;
          tempScale.setScalar(pulse);
          toCenter.subVectors(rec.position, slotCenter).normalize();
          spinAxis.copy(rec.angularVelocity);
          if (spinAxis.lengthSq() < 1e-6) spinAxis.set(0.31, 0.87, 0.39);
          spinAxis.normalize();
          tangent.crossVectors(toCenter, spinAxis);
          if (tangent.lengthSq() < 1e-6)
            tangent.crossVectors(toCenter, worldUp);
          tangent.normalize();
          rec.velocity.addScaledVector(
            rec.burstDirection,
            ABOUT_BREAK_IMPULSE * dt * 0.26,
          );
          rec.velocity.addScaledVector(
            toCenter,
            ABOUT_BREAK_IMPULSE * dt * 0.14,
          );
          rec.velocity.addScaledVector(
            tangent,
            ABOUT_BREAK_IMPULSE * dt * 0.17,
          );
          rec.velocity.multiplyScalar(0.986);
          rec.position.addScaledVector(rec.velocity, dt);
          rec.spinAxisPrimary
            .addScaledVector(rec.velocity, dt * 0.0022)
            .normalize();
          rec.spinAxisSecondary
            .addScaledVector(tangent, dt * 0.0065)
            .normalize();
          deltaQuat.setFromAxisAngle(
            rec.spinAxisPrimary,
            rec.spinRatePrimary * spinPrimaryGain * (1.15 + phaseT * 0.75) * dt,
          );
          deltaQuatB.setFromAxisAngle(
            rec.spinAxisSecondary,
            rec.spinRateSecondary *
              spinSecondaryGain *
              (0.95 + phaseT * 0.45) *
              dt,
          );
          rec.quaternion.multiply(deltaQuat).multiply(deltaQuatB).normalize();
          applyRecordMatrix(idx, rec, pulse);
        });
        if (phaseElapsed >= runtime.phaseDurationMs) {
          setPhase("swarm", now);
          return;
        }
      } else if (runtime.phase === "swarm") {
        records.forEach((rec, idx) => {
          const sourceSlot = slots[rec.sourceSlotIndex] ?? slots[idx];
          const panelIdx = THREE.MathUtils.clamp(sourceSlot.tileIndex, 0, 3);
          const panelSpinStyle = aboutPanelSpinStyleRef.current[panelIdx] ?? 0;
          const spinPrimaryGain = panelSpinStyle === 1 ? 1.22 : 0.74;
          const spinSecondaryGain = panelSpinStyle === 1 ? 1.06 : 0.66;
          const pulse = 1 + Math.sin(now * 0.0014 + rec.pulsePhase) * 0.1;
          tempScale.setScalar(pulse);
          drift.set(
            Math.sin(rec.position.y * 0.01 + now * 0.00065) * 15,
            Math.cos(rec.position.x * 0.009 + now * 0.0007) * 15,
            Math.sin(
              (rec.position.x + rec.position.y + rec.position.z) * 0.007 +
                now * 0.00045,
            ) * 15,
          );
          spinAxis.copy(rec.angularVelocity);
          if (spinAxis.lengthSq() < 1e-6) spinAxis.set(0.21, 0.93, -0.29);
          spinAxis.normalize();
          tangent.crossVectors(drift, spinAxis);
          if (tangent.lengthSq() < 1e-6)
            tangent.crossVectors(rec.velocity, spinAxis);
          if (tangent.lengthSq() < 1e-6)
            tangent.set(-rec.position.y, rec.position.x, rec.position.z * 0.25);
          tangent.normalize();
          rec.velocity.addScaledVector(drift, dt);
          rec.velocity.addScaledVector(tangent, dt * 8);
          rec.velocity.addScaledVector(rec.burstDirection, dt * 2.4);
          rec.velocity.multiplyScalar(0.992);
          rec.position.addScaledVector(rec.velocity, dt);
          rec.angularVelocity.multiplyScalar(0.996);
          const driftLen = drift.length();
          if (driftLen > 0.0001) {
            rec.angularVelocity.addScaledVector(drift, (dt * 0.16) / driftLen);
          }
          rec.spinAxisPrimary.addScaledVector(drift, dt * 0.0016).normalize();
          rec.spinAxisSecondary
            .addScaledVector(rec.velocity, dt * 0.0012)
            .normalize();
          const swarmWobble =
            0.7 + 0.3 * Math.sin(now * 0.0018 + rec.pulsePhase);
          deltaQuat.setFromAxisAngle(
            rec.spinAxisPrimary,
            rec.spinRatePrimary * spinPrimaryGain * swarmWobble * dt,
          );
          deltaQuatB.setFromAxisAngle(
            rec.spinAxisSecondary,
            rec.spinRateSecondary *
              spinSecondaryGain *
              (1.05 - 0.25 * swarmWobble) *
              dt,
          );
          rec.quaternion.multiply(deltaQuat).multiply(deltaQuatB).normalize();
          applyRecordMatrix(idx, rec, pulse);
        });
        if (phaseElapsed >= runtime.phaseDurationMs) {
          beginReform(now);
          return;
        }
      } else if (runtime.phase === "reform") {
        records.forEach((rec, idx) => {
          const sourceSlot = slots[rec.sourceSlotIndex] ?? slots[idx];
          const panelIdx = THREE.MathUtils.clamp(sourceSlot.tileIndex, 0, 3);
          const panelSpinStyle = aboutPanelSpinStyleRef.current[panelIdx] ?? 0;
          const reformProgress = phaseT;
          const freeSpinBlend = 1 - reformProgress;
          const attractionGain = THREE.MathUtils.lerp(
            0.52,
            1.02,
            reformProgress,
          );
          const reformSpinDecayPerFrame =
            panelSpinStyle === 1
              ? THREE.MathUtils.lerp(0.998, 0.968, reformProgress)
              : THREE.MathUtils.lerp(0.999, 0.972, reformProgress);
          const targetSlot = slots[rec.targetSlotIndex] ?? slots[idx];
          toTarget.subVectors(targetSlot.worldPosition, rec.position);
          spinAxis.copy(rec.spinAxisPrimary);
          if (spinAxis.lengthSq() < 1e-6) spinAxis.set(0.31, 0.77, -0.55);
          spinAxis.normalize();
          tangent.crossVectors(toTarget, spinAxis);
          if (tangent.lengthSq() < 1e-6)
            tangent.crossVectors(toTarget, worldUp);
          if (tangent.lengthSq() < 1e-6)
            tangent.set(-toTarget.y, toTarget.x, toTarget.z * 0.25);
          tangent.normalize();
          randomDir.set(
            Math.sin(rec.pulsePhase * 1.91 + now * 0.00115),
            Math.cos(rec.pulsePhase * 1.47 + now * 0.00131),
            Math.sin(rec.pulsePhase * 2.63 + now * 0.00107),
          );
          if (randomDir.lengthSq() < 1e-6) randomDir.set(0.36, -0.48, 0.8);
          randomDir.normalize();
          rec.velocity.addScaledVector(
            toTarget,
            ABOUT_REFORM_STIFFNESS * attractionGain * dt,
          );
          rec.velocity.addScaledVector(tangent, dt * 10.5 * freeSpinBlend);
          rec.velocity.addScaledVector(randomDir, dt * 6.8 * freeSpinBlend);
          rec.velocity.multiplyScalar(
            Math.pow(
              THREE.MathUtils.lerp(ABOUT_REFORM_DAMPING, 0.965, reformProgress),
              dt * 60,
            ),
          );
          rec.position.addScaledVector(rec.velocity, dt);
          rec.angularVelocity.multiplyScalar(0.92);
          rec.spinRatePrimary *= Math.pow(reformSpinDecayPerFrame, dt * 60);
          rec.spinRateSecondary *= Math.pow(reformSpinDecayPerFrame, dt * 60);
          rec.spinAxisPrimary
            .addScaledVector(rec.velocity, dt * 0.0017 * freeSpinBlend)
            .normalize();
          rec.spinAxisSecondary
            .addScaledVector(tangent, dt * 0.0026 * freeSpinBlend)
            .normalize();
          targetQuat.copy(targetSlot.worldQuaternion);
          rec.quaternion.slerp(
            targetQuat,
            THREE.MathUtils.clamp(
              dt *
                THREE.MathUtils.lerp(
                  0.85,
                  8.8,
                  reformProgress * reformProgress,
                ),
              0,
              1,
            ),
          );
          deltaQuat.setFromAxisAngle(
            rec.spinAxisPrimary,
            rec.spinRatePrimary * (0.55 + 0.95 * freeSpinBlend) * dt,
          );
          deltaQuatB.setFromAxisAngle(
            rec.spinAxisSecondary,
            rec.spinRateSecondary * (0.5 + 1.05 * freeSpinBlend) * dt,
          );
          rec.quaternion.multiply(deltaQuat).multiply(deltaQuatB).normalize();
          applyRecordMatrix(idx, rec, 1);
        });
        if (phaseElapsed >= runtime.phaseDurationMs) {
          setPhase("settle", now);
          return;
        }
      } else if (runtime.phase === "settle") {
        records.forEach((rec, idx) => {
          const targetSlot = slots[rec.targetSlotIndex] ?? slots[idx];
          rec.position.lerp(
            targetSlot.worldPosition,
            THREE.MathUtils.clamp(dt * 9, 0, 1),
          );
          rec.velocity.multiplyScalar(0.72);
          rec.quaternion.slerp(
            targetSlot.worldQuaternion,
            THREE.MathUtils.clamp(dt * 10, 0, 1),
          );
          applyRecordMatrix(idx, rec, 1);
        });
        if (phaseElapsed >= runtime.phaseDurationMs) {
          records.forEach((rec) => {
            rec.sourceSlotIndex = rec.targetSlotIndex;
          });
          resetAboutShardContentReveal();
          if (aboutSlideAdvanceAfterReformRef.current && slideCount > 0) {
            aboutSlideAdvanceAfterReformRef.current = false;
            const nextIndex = (aboutActiveSlideIndex + 1) % slideCount;
            setAboutActiveSlideIndex(nextIndex);
          }
          setPhase("assembledHold", now);
          return;
        }
      }

      if (runtime.phase === "assembledHold") {
        records.forEach((rec, idx) => {
          const targetSlot = slots[rec.targetSlotIndex] ?? slots[idx];
          rec.position.lerp(targetSlot.worldPosition, 0.22);
          rec.quaternion.slerp(targetSlot.worldQuaternion, 0.22);
          applyRecordMatrix(idx, rec, 1);
        });
        const canShowSlidePlanes = aboutTileContentMatsRef.current.some(
          (mat) => !!mat?.map,
        );
        let distanceAlpha = 1;
        if (camera && anchor) {
          const d = camera.position.distanceTo(anchor);
          distanceAlpha = THREE.MathUtils.clamp(
            1 - (d - 7000) / 36000,
            0.24,
            1,
          );
        }
        aboutTileContentMatsRef.current.forEach((mat) => {
          if (!mat) return;
          if (!canShowSlidePlanes) {
            mat.opacity = 0;
            return;
          }
          mat.opacity = distanceAlpha;
        });
        const dbg = aboutDebugStateRef.current;
        const nowMs = performance.now();
        const prepChanged =
          dbg.lastPrepared !== aboutSlidePreparedIndexRef.current ||
          dbg.lastReady !== aboutSlideReadyRef.current;
        const phaseChanged = dbg.lastPhase !== runtime.phase;
        const canShowChanged = dbg.lastCanShow !== canShowSlidePlanes;
        if (
          (prepChanged || phaseChanged || canShowChanged) &&
          nowMs - dbg.lastLogMs > 600
        ) {
          dbg.lastLogMs = nowMs;
          dbg.lastPhase = runtime.phase;
          dbg.lastCanShow = canShowSlidePlanes;
          dbg.lastPrepared = aboutSlidePreparedIndexRef.current;
          dbg.lastReady = aboutSlideReadyRef.current;
          shipLog(
            `ABOUTDBG near phase=${runtime.phase} canShow=${canShowSlidePlanes ? 1 : 0} alpha=${distanceAlpha.toFixed(2)} prepared=${aboutSlidePreparedIndexRef.current + 1} ready=${aboutSlideReadyRef.current ? 1 : 0} maps=${aboutTileContentMatsRef.current
              .slice(0, 4)
              .map((m) => (m?.map ? "1" : "0"))
              .join("")}`,
            "nav",
          );
        }
        // Static assembled display is driven by content planes; shard texture reveal
        // is enabled only during explode/reform for stamped-fragment effect.
      } else {
        // Hide planes immediately on explode/reform to avoid silhouette linger.
        aboutTileContentMatsRef.current.forEach((mat) => {
          if (mat) mat.opacity = 0;
        });
      }
      mesh.instanceMatrix.needsUpdate = true;
    };

    aboutCellRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (aboutCellRafRef.current !== null) {
        cancelAnimationFrame(aboutCellRafRef.current);
      }
      aboutCellRafRef.current = null;
    };
  }, [
    sceneReady,
    aboutSlides,
    aboutActiveSlideIndex,
    resetAboutShardContentReveal,
    ensureAboutSlidePrepared,
  ]);

  // Every CSS2D label in the universe: fades out while something is in the
  // way (planets, moons, gallery, lattice shell, ships), and moon names only
  // show near their planet. See labelVisibility.ts.
  useEffect(() => {
    if (!sceneReady) return;
    const scene = sceneRef.current.scene;
    if (!scene) return;
    const manager = new LabelVisibilityManager(scene);
    const spheres: SphereOccluder[] = [];
    const spherePool: SphereOccluder[] = [];
    const boxes: BoxOccluder[] = [];
    const systemCenter = new THREE.Vector3();
    const moonPosition = new THREE.Vector3();
    const worldScale = new THREE.Vector3();
    const nextSphere = (): SphereOccluder => {
      let sphere = spherePool[spheres.length];
      if (!sphere) {
        sphere = { center: new THREE.Vector3(), radius: 0 };
        spherePool.push(sphere);
      }
      sphere.owner = undefined;
      spheres.push(sphere);
      return sphere;
    };
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const camera = sceneRef.current.camera;
      if (!camera) return;
      const dt = Math.max(0, (now - last) / 1000);
      last = now;

      spheres.length = 0;
      let planetRadius = 0;
      let hasPlanet = false;
      for (const item of itemsRef.current) {
        const mesh = item.mesh;
        if (!mesh?.parent || !mesh.visible || !mesh.geometry) continue;
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
        const sphere = nextSphere();
        mesh.getWorldPosition(sphere.center);
        mesh.getWorldScale(worldScale);
        sphere.radius =
          (mesh.geometry.boundingSphere?.radius ?? 0) *
          Math.max(worldScale.x, worldScale.y, worldScale.z);
        sphere.owner = mesh;
        if (mesh.userData?.isMainPlanet) {
          hasPlanet = true;
          planetRadius = sphere.radius;
          systemCenter.copy(sphere.center);
        }
      }
      let systemRadius = planetRadius;
      if (hasPlanet) {
        for (const item of itemsRef.current) {
          if (!item.mesh?.userData?.isMoon) continue;
          item.mesh.getWorldPosition(moonPosition);
          systemRadius = Math.max(systemRadius, moonPosition.distanceTo(systemCenter));
        }
      }
      const gallery = careerGalleryRef.current;
      if (gallery?.root.parent && gallery.root.visible) {
        const sphere = nextSphere();
        gallery.root.getWorldPosition(sphere.center);
        sphere.radius = gallery.radius;
        sphere.owner = gallery.root;
      }
      const envelope = skillsLatticeEnvelopeRef.current;
      if (
        envelope?.parent &&
        skillsLatticeSystemActiveRef.current &&
        !skillsLatticeActiveRef.current
      ) {
        const sphere = nextSphere();
        envelope.getWorldPosition(sphere.center);
        sphere.radius = Math.max(1, skillsLatticeEnvelopeRadiusRef.current);
      }

      boxes.length = 0;
      if (spaceshipRef.current) boxes.push({ object: spaceshipRef.current });
      if (starDestroyerRef.current) boxes.push({ object: starDestroyerRef.current });

      manager.update(dt, {
        camera,
        spheres,
        boxes,
        hideAll: insideShipRef.current,
        moonSystem: hasPlanet ? { center: systemCenter, radius: systemRadius } : null,
        focusedMoon: focusedMoonRef.current,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      manager.dispose();
    };
  }, [sceneReady]);

  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    const shellCenter = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (
        !skillsLatticeSystemActiveRef.current ||
        skillsLatticeActiveRef.current
      )
        return;
      const camera = sceneRef.current.camera;
      const shell = skillsLatticeEnvelopeRef.current;
      const scene = sceneRef.current.scene;
      if (!camera || !shell || !scene) return;
      shell.getWorldPosition(shellCenter);
      const shellRadius = Math.max(1, skillsLatticeEnvelopeRadiusRef.current);
      const distance = camera.position.distanceTo(shellCenter);
      // (Labels behind the shell are hidden by the label visibility manager.)
      // Hysteresis: exit happens farther out; re-enter only once clearly back in.
      if (distance <= shellRadius * 1.03) {
        resumeSkillsLatticeInPlace();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneReady, resumeSkillsLatticeInPlace]);

  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    const labelWorld = new THREE.Vector3();
    const toLabel = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const occluders: THREE.Object3D[] = [];
    const occluderIds = new Set<string>();
    const addOccluder = (obj: THREE.Object3D | null | undefined) => {
      if (!obj) return;
      if (!obj.visible || obj.parent === null) return;
      if (!(obj instanceof THREE.Mesh)) return;
      if (occluderIds.has(obj.uuid)) return;
      occluderIds.add(obj.uuid);
      occluders.push(obj);
    };
    const addDescendantOccluders = (
      root: THREE.Object3D | null | undefined,
    ) => {
      if (!root || !root.visible || root.parent === null) return;
      root.traverse((obj) => addOccluder(obj));
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (orbitalPortfolioActiveRef.current) return;
      const camera = sceneRef.current.camera;
      const scene = sceneRef.current.scene;
      if (!camera || !scene) return;
      occluders.length = 0;
      occluderIds.clear();
      itemsRef.current.forEach((item) => addOccluder(item.mesh));
      // Include interior/elevator surfaces so labels do not bleed through walls.
      addDescendantOccluders(spaceshipRef.current);
      addDescendantOccluders(aboutMemorySquareRootRef.current);
      if (occluders.length === 0) return;
      scene.traverse((obj) => {
        const maybeObject = obj as THREE.Object3D & {
          isCSS2DObject?: boolean;
          userData: Record<string, unknown>;
        };
        const isCssLabel = !!maybeObject.isCSS2DObject;
        const isPortfolioHalo =
          !!maybeObject.userData?.orbitalPortfolioMediaHalo;
        if (!isCssLabel && !isPortfolioHalo) return;
        if (isPortfolioHalo) {
          maybeObject.getWorldPosition(labelWorld);
          toLabel.subVectors(labelWorld, camera.position);
          const haloDist = toLabel.length();
          if (haloDist < 0.001) {
            maybeObject.visible = true;
            return;
          }
          toLabel.multiplyScalar(1 / haloDist);
          raycaster.set(camera.position, toLabel);
          raycaster.near = 0.05;
          raycaster.far = Math.max(0.05, haloDist - 0.25);
          const haloHits = raycaster.intersectObjects(occluders, false);
          const haloBlocked = haloHits.some((h) => h.distance < haloDist - 0.3);
          maybeObject.visible = !haloBlocked;
          return;
        }
        const tracksPortfolioLabel =
          !!maybeObject.userData?.orbitalPortfolioLabel;
        const tracksAboutLabel = !!maybeObject.userData?.aboutMemorySquareLabel;
        if (!tracksPortfolioLabel && !tracksAboutLabel) return;
        if (maybeObject.userData?.orbitalPortfolioStationLabel) {
          maybeObject.visible = false;
          return;
        }
        maybeObject.getWorldPosition(labelWorld);
        const labelDist = labelWorld.distanceTo(camera.position);
        if (
          maybeObject.userData?.orbitalPortfolioCoreLabel &&
          labelDist > ORBITAL_PORTFOLIO_CORE_LABEL_MAX_DISTANCE
        ) {
          maybeObject.visible = false;
          return;
        }
        // Line of sight is handled by the label visibility manager.
        maybeObject.visible = true;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneReady]);

  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    let lastTickMs = performance.now();
    const worldNodePos = new THREE.Vector3();
    const flowPos = new THREE.Vector3();
    const selectedPos = new THREE.Vector3();
    const targetPos = new THREE.Vector3();
    const direct = new THREE.Vector3();
    const ortho = new THREE.Vector3();
    const bend = new THREE.Vector3();
    const arcPos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const flowColor = new THREE.Color();
    const shellCenter = new THREE.Vector3();
    const shellSpin = new THREE.Vector3(0.01, 0.016, 0.007);
    const shellQuat = new THREE.Quaternion();
    const shellForward = new THREE.Vector3();
    const shellRight = new THREE.Vector3();
    const shellUp = new THREE.Vector3();
    const sunDir = new THREE.Vector3();
    const toneAccentColor = new THREE.Color();
    const tick = () => {
      if (skillsLatticeActiveRef.current) {
        const nowMs = performance.now();
        const dt = Math.min((nowMs - lastTickMs) / 1000, 0.05);
        lastTickMs = nowMs;
        const t = nowMs * 0.001;
        const toneRuntime = orbitalPortfolioToneRuntimeRef.current;
        const selected = skillsLatticeSelectedNodeRef.current;
        const plasmaActive = !!selected;
        const categoryNodes = skillsLatticeNodesRef.current.filter(
          (n) => n.nodeType === "category",
        );
        if (toneRuntime.enabled && categoryNodes.length > 0) {
          if (toneRuntime.nextEventAtMs <= 0) {
            toneRuntime.nextEventAtMs = nowMs + 300;
          }
          if (nowMs >= toneRuntime.nextEventAtMs) {
            const motifs = SKILLS_LATTICE_TONE_MOTIFS_HZ;
            const motif =
              motifs[
                THREE.MathUtils.clamp(
                  toneRuntime.motifIndex,
                  0,
                  Math.max(0, motifs.length - 1),
                )
              ] ??
              motifs[0] ??
              [];
            if (toneRuntime.noteIndex >= motif.length) {
              toneRuntime.noteIndex = 0;
              toneRuntime.motifIndex =
                (toneRuntime.motifIndex + 1) % Math.max(1, motifs.length);
              toneRuntime.nextEventAtMs =
                nowMs +
                THREE.MathUtils.clamp(
                  skillsLatticeTonePhrasePauseMsRef.current,
                  0,
                  SKILLS_LATTICE_TONE_PHRASE_PAUSE_MAX_MS,
                );
              toneRuntime.accentCoreIndex = -1;
              toneRuntime.accentNodeLabel = "";
            } else {
              const freq = motif[toneRuntime.noteIndex] ?? 329.63;
              let accentIdx = Math.floor(
                Math.random() * Math.max(1, categoryNodes.length),
              );
              if (
                categoryNodes.length > 1 &&
                accentIdx === toneRuntime.accentCoreIndex
              ) {
                accentIdx =
                  (accentIdx +
                    1 +
                    Math.floor(Math.random() * (categoryNodes.length - 1))) %
                  categoryNodes.length;
              }
              const accentNode = categoryNodes[accentIdx];
              const preset = resolveSkillsLatticeTonePreset(
                skillsLatticeTonePresetIdRef.current,
              );
              toneRuntime.accentCoreIndex = accentIdx;
              toneRuntime.accentNodeLabel = accentNode?.label ?? "";
              toneRuntime.accentColorHex = preset.accentColor;
              toneRuntime.accentUntilAtMs =
                nowMs + SKILLS_LATTICE_TONE_NOTE_DURATION_MS;
              if (ORBITAL_PORTFOLIO_DEBUG_LOGS) {
                shipLog(
                  `[LATTICE-TONE] skills-queue motif=${toneRuntime.motifIndex} note=${toneRuntime.noteIndex} node=${toneRuntime.accentNodeLabel || accentIdx} freq=${freq.toFixed(2)} preset=${preset.id} ctx=${toneRuntime.context?.state ?? "null"}`,
                  "info",
                );
              }
              playOrbitalPortfolioTone(freq);
              toneRuntime.noteIndex += 1;
              toneRuntime.nextEventAtMs =
                nowMs + SKILLS_LATTICE_TONE_NOTE_STEP_MS;
            }
          }
        }
        const ripple = skillsLatticeRippleRef.current;
        const camera = sceneRef.current.camera;
        const shellMat = skillsLatticeEnvelopeMatRef.current;
        const shellEdgeMat = skillsLatticeEnvelopeEdgeMatRef.current;
        const shell = skillsLatticeEnvelopeRef.current;
        let latticeInternalsVisible = true;
        if (camera && shellMat && shellEdgeMat && shell) {
          if (shell.material !== shellMat) {
            shell.material = shellMat;
            shellMat.needsUpdate = true;
          }
          shell.rotation.x += dt * shellSpin.x;
          shell.rotation.y += dt * shellSpin.y;
          shell.rotation.z += dt * shellSpin.z;
          shell.getWorldPosition(shellCenter);
          const shellRadius = Math.max(
            1,
            skillsLatticeEnvelopeRadiusRef.current,
          );
          const distance = camera.position.distanceTo(shellCenter);
          if (distance > shellRadius * 1.14) {
            exitSkillsLattice({ restoreShip: false, clearSystem: false });
            raf = requestAnimationFrame(tick);
            return;
          }
          const insideT = THREE.MathUtils.clamp(
            (shellRadius * 0.94 - distance) / (shellRadius * 0.38),
            0,
            1,
          );
          const outsideT = 1 - insideT;
          const insideShell = insideT > 0.54;
          latticeInternalsVisible = insideShell;
          if (skillsLatticeEnvelopeInsideRef.current !== insideShell) {
            skillsLatticeEnvelopeInsideRef.current = insideShell;
            if (insideShell) {
              shellMat.side = THREE.BackSide;
              shellMat.transparent = true;
              shellMat.depthWrite = false;
            } else {
              shellMat.side = THREE.FrontSide;
              shellMat.transparent = false;
              shellMat.depthWrite = true;
              shellMat.opacity = 1;
            }
            shellMat.needsUpdate = true;
          }
          const pulse = 0.5 + 0.5 * Math.sin(t * 0.95);
          const sunLight = sceneRef.current.sunLight;
          let glintBoost = 0.12;
          if (sunLight) {
            shell.getWorldQuaternion(shellQuat);
            shellForward.set(0, 0, 1).applyQuaternion(shellQuat).normalize();
            shellRight.set(1, 0, 0).applyQuaternion(shellQuat).normalize();
            shellUp.set(0, 1, 0).applyQuaternion(shellQuat).normalize();
            sunDir.subVectors(sunLight.position, shellCenter).normalize();
            const a = Math.max(0, shellForward.dot(sunDir));
            const b = Math.max(0, shellRight.dot(sunDir));
            const c = Math.max(0, shellUp.dot(sunDir));
            glintBoost = 0.08 + a * 0.22 + b * 0.16 + c * 0.12;
          }
          if (insideShell) {
            shellMat.opacity = THREE.MathUtils.clamp(
              THREE.MathUtils.lerp(0.08, 0.22, 1 - outsideT) + pulse * 0.03,
              0.06,
              0.28,
            );
          }
          shellMat.emissive.setHSL(0.58 + pulse * 0.02, 0.55, 0.34);
          shellMat.emissiveIntensity = THREE.MathUtils.clamp(
            THREE.MathUtils.lerp(0.2, 0.58, outsideT) +
              pulse * 0.14 +
              glintBoost * 0.45,
            0.1,
            0.95,
          );
          shellEdgeMat.opacity = THREE.MathUtils.clamp(
            THREE.MathUtils.lerp(0.08, 0.4, outsideT) +
              pulse * 0.08 +
              glintBoost * 0.34,
            0.03,
            0.74,
          );
          shellEdgeMat.color.setHSL(
            0.58 + pulse * 0.04 + glintBoost * 0.03,
            0.76,
            0.7,
          );
          const caustics = skillsLatticeCausticLightsRef.current;
          if (caustics.length > 0) {
            const baseInt = insideShell ? 0.85 : 0.08;
            caustics.forEach((light, idx) => {
              const p0 = t * (0.3 + idx * 0.09);
              light.position.set(
                Math.cos(p0 * 1.3 + idx) * (40 + idx * 8),
                6 + Math.sin(p0 * 1.9 + idx * 0.7) * (18 + idx * 4),
                Math.sin(p0 * 1.15 + idx * 1.4) * (34 + idx * 10),
              );
              light.intensity =
                baseInt +
                (insideShell ? 0.45 : 0.06) *
                  (0.5 + 0.5 * Math.sin(t * 1.7 + idx * 1.3));
            });
          }
          const showNodeLabels = insideT > 0.55;
          skillsLatticeNodeLabelsRef.current.forEach((label) => {
            label.visible = showNodeLabels;
          });
        }
        let rippleRadius = -1;
        if (ripple.active) {
          const rt = THREE.MathUtils.clamp(
            (nowMs - ripple.startedAt) / 1200,
            0,
            1,
          );
          rippleRadius = rt * 90;
          if (rt >= 1) ripple.active = false;
        }
        skillsLatticeNodesRef.current.forEach((node) => {
          const toneAccentActive =
            toneRuntime.enabled &&
            node.nodeType === "category" &&
            node.label === toneRuntime.accentNodeLabel &&
            nowMs < toneRuntime.accentUntilAtMs;
          const toneAccentT = toneAccentActive
            ? 1 -
              THREE.MathUtils.clamp(
                (nowMs -
                  (toneRuntime.accentUntilAtMs -
                    SKILLS_LATTICE_TONE_NOTE_DURATION_MS)) /
                  Math.max(1, SKILLS_LATTICE_TONE_NOTE_DURATION_MS),
                0,
                1,
              )
            : 0;
          const pulse = 1 + Math.sin(t * 1.7 + node.phase) * 0.08;
          const isSelected = selected?.mesh === node.mesh;
          const isRelated =
            !selected ||
            (selected.nodeType === "category"
              ? node.category === selected.category
              : node.category === selected.category ||
                node.label === selected.label);
          const selectedBoost = isSelected ? 1.28 : isRelated ? 1.03 : 0.96;
          const toneBoost =
            node.nodeType === "category" ? toneAccentT * 0.4 : 0;
          node.mesh.scale.setScalar(node.baseScale * pulse * selectedBoost);
          if (toneBoost > 0) {
            node.mesh.scale.multiplyScalar(1 + toneBoost);
          }
          const bodyMat = node.mesh.material as THREE.MeshBasicMaterial;
          const baseNodeOpacity = node.nodeType === "category" ? 0.9 : 0.82;
          bodyMat.opacity = latticeInternalsVisible
            ? isRelated
              ? baseNodeOpacity + toneAccentT * 0.26
              : 0.2
            : 0;
          if (plasmaActive) {
            const baseColor =
              node.nodeType === "category"
                ? new THREE.Color(0x8fd3ff)
                : new THREE.Color(0xdaf1ff);
            const plasmaColor = new THREE.Color(0xc18bff);
            let plasmaMix = selected?.mesh === node.mesh ? 0.42 : 0;
            if (selected) {
              selected.mesh.getWorldPosition(selectedPos);
              node.mesh.getWorldPosition(worldNodePos);
              const d = worldNodePos.distanceTo(selectedPos);
              const bandRadius = ((t * 1.7) % 1) * 92;
              plasmaMix = Math.max(
                plasmaMix,
                Math.max(0, 1 - Math.abs(d - bandRadius) / 12) * 0.55,
              );
            }
            bodyMat.color.copy(baseColor).lerp(plasmaColor, plasmaMix);
          } else {
            bodyMat.color.set(
              node.nodeType === "category" ? 0x8fd3ff : 0xdaf1ff,
            );
          }
          if (toneAccentT > 0) {
            toneAccentColor.setHex(toneRuntime.accentColorHex);
            bodyMat.color.lerp(
              toneAccentColor,
              THREE.MathUtils.clamp(0.25 + toneAccentT * 0.55, 0, 1),
            );
          }
          if (node.halo?.material) {
            const hMat = node.halo.material as THREE.SpriteMaterial;
            const focusAlpha = isSelected ? 0.62 : isRelated ? 0.24 : 0.08;
            let rippleBoost = 0;
            if (ripple.active && rippleRadius >= 0) {
              node.mesh.getWorldPosition(worldNodePos);
              const d = worldNodePos.distanceTo(ripple.center);
              rippleBoost =
                Math.max(0, 1 - Math.abs(d - rippleRadius) / 14) * 0.42;
            }
            hMat.opacity = THREE.MathUtils.clamp(
              focusAlpha +
                Math.sin(t * 2.2 + node.phase) * 0.06 +
                rippleBoost +
                toneAccentT * 0.28,
              0.04,
              0.9,
            );
            if (!latticeInternalsVisible) hMat.opacity = 0;
          }
        });
        skillsLatticeLineGroupsRef.current.forEach((group, idx) => {
          const wave = 0.3 + 0.14 * Math.sin(t * 1.15 + idx * 0.68);
          const isRelated =
            !selected ||
            (group.kind === "ring"
              ? selected.nodeType === "category"
              : group.category === selected.category);
          const baseOpacity = isRelated ? wave : 0.08;
          const rippleBoost = ripple.active && rippleRadius >= 0 ? 0.12 : 0;
          group.material.opacity = latticeInternalsVisible
            ? THREE.MathUtils.clamp(baseOpacity + rippleBoost, 0.04, 0.9)
            : 0;
          if (plasmaActive) {
            const lineBase = group.kind === "ring" ? 0x66c6ff : 0x9ad9ff;
            const linePlasma = 0xce93ff;
            const lineMix =
              (isRelated ? 0.2 : 0.08) + 0.16 * Math.sin(t * 1.9 + idx * 0.55);
            group.material.color
              .set(lineBase)
              .lerp(new THREE.Color(linePlasma), lineMix);
          } else {
            group.material.color.set(
              group.kind === "ring" ? 0x66c6ff : 0x9ad9ff,
            );
          }
        });
        const flow = skillsLatticeFlowPointsRef.current;
        const flowMeta = skillsLatticeFlowMetaRef.current;
        const segs = skillsLatticeLinkSegmentsRef.current;
        if (flow && flowMeta.length > 0 && segs.length > 0) {
          const flowMat = flow.material as THREE.PointsMaterial;
          flowMat.opacity = latticeInternalsVisible
            ? plasmaActive
              ? 0.9
              : 0.78
            : 0;
          flowMat.size = plasmaActive ? 0.82 : 0.72;
          if (!latticeInternalsVisible) {
            const arcs = skillsLatticeArcRecordsRef.current;
            arcs.forEach((arc) => {
              const mat = arc.line.material as THREE.LineBasicMaterial;
              mat.opacity = 0;
              arc.line.visible = false;
            });
            raf = requestAnimationFrame(tick);
            return;
          }
          const attr = flow.geometry.getAttribute(
            "position",
          ) as THREE.BufferAttribute;
          const colorAttr = flow.geometry.getAttribute(
            "color",
          ) as THREE.BufferAttribute | null;
          for (let i = 0; i < flowMeta.length; i += 1) {
            const meta = flowMeta[i];
            const seg = segs[meta.segmentIndex % segs.length];
            const p = (t * meta.speed + meta.offset) % 1;
            flowPos.lerpVectors(seg.from, seg.to, p);
            attr.setXYZ(i, flowPos.x, flowPos.y, flowPos.z);
            if (colorAttr) {
              if (plasmaActive) {
                const hue = THREE.MathUtils.euclideanModulo(
                  meta.hue +
                    t * meta.hueDrift +
                    Math.sin(t * 1.5 + i * 0.37) * 0.03,
                  1,
                );
                flowColor.setHSL(hue, 0.85, 0.7);
              } else {
                flowColor.set(0xe8f6ff);
              }
              colorAttr.setXYZ(i, flowColor.r, flowColor.g, flowColor.b);
            }
          }
          attr.needsUpdate = true;
          if (colorAttr) colorAttr.needsUpdate = true;
        }
        const arcs = skillsLatticeArcRecordsRef.current;
        const sourceNode = selected;
        if (arcs.length > 0) {
          if (!plasmaActive || !sourceNode) {
            arcs.forEach((arc) => {
              const mat = arc.line.material as THREE.LineBasicMaterial;
              mat.opacity = THREE.MathUtils.damp(mat.opacity, 0, 7, 0.016);
              arc.line.visible = mat.opacity > 0.02;
            });
          } else {
            sourceNode.mesh.getWorldPosition(selectedPos);
            const nodes = skillsLatticeNodesRef.current;
            arcs.forEach((arc, idx) => {
              if (nodes.length === 0) return;
              const cycle = (t * arc.speed + arc.phase) % 1;
              if (cycle < 0.035 || arc.targetIndex >= nodes.length) {
                let pool = nodes;
                if (selected) {
                  pool = nodes.filter(
                    (n) =>
                      n.mesh !== sourceNode.mesh &&
                      (n.category === selected.category ||
                        n.label === selected.label),
                  );
                  if (pool.length === 0) {
                    pool = nodes.filter((n) => n.mesh !== sourceNode.mesh);
                  }
                }
                const pick =
                  pool[Math.floor(Math.random() * Math.max(1, pool.length))];
                const nextIdx = nodes.findIndex((n) => n.mesh === pick.mesh);
                arc.targetIndex = nextIdx >= 0 ? nextIdx : arc.targetIndex;
              }
              const targetNode = nodes[arc.targetIndex] ?? nodes[0];
              targetNode.mesh.getWorldPosition(targetPos);
              direct.subVectors(targetPos, selectedPos);
              const dist = Math.max(2, direct.length());
              direct.normalize();
              ortho.crossVectors(direct, up);
              if (ortho.lengthSq() < 0.0001) {
                ortho.set(1, 0, 0);
              } else {
                ortho.normalize();
              }
              bend.crossVectors(direct, ortho).normalize();
              for (let p = 0; p < arc.points.length / 3; p += 1) {
                const alpha = p / (arc.points.length / 3 - 1);
                arcPos.lerpVectors(selectedPos, targetPos, alpha);
                const envelope = Math.sin(alpha * Math.PI);
                const jitter =
                  Math.sin(
                    (alpha * 10 + t * 8 + idx * 1.2) * (1 + arc.sway * 0.22),
                  ) *
                  (0.8 + 0.2 * Math.sin(t * 13 + idx));
                const helix = Math.cos(alpha * 12 + t * 7 + idx * 0.8) * 0.45;
                arcPos.addScaledVector(ortho, envelope * jitter * arc.sway);
                arcPos.addScaledVector(
                  bend,
                  envelope * helix * arc.sway * 0.72,
                );
                arcPos.addScaledVector(
                  direct,
                  Math.sin(alpha * Math.PI * 5 + t * 16) * 0.06,
                );
                arc.points[p * 3] = arcPos.x;
                arc.points[p * 3 + 1] = arcPos.y;
                arc.points[p * 3 + 2] = arcPos.z;
              }
              const attr = arc.line.geometry.getAttribute(
                "position",
              ) as THREE.BufferAttribute;
              attr.needsUpdate = true;
              const mat = arc.line.material as THREE.LineBasicMaterial;
              const energy =
                0.35 +
                0.3 * Math.sin(t * 12 + idx * 2.1) +
                Math.min(0.35, dist / 140);
              mat.opacity = THREE.MathUtils.clamp(energy, 0.2, 0.9);
              mat.color.setHSL(
                (0.62 + 0.08 * Math.sin(t * 0.8 + idx)) % 1,
                0.8,
                0.72,
              );
              arc.line.visible = true;
            });
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneReady, exitSkillsLattice]);

  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    let lastMs = performance.now();
    let lastAnimStepMs = 0;
    let lastShellMs = lastMs;
    let nextPulseAt = lastMs + 1800 + Math.random() * 2400;
    let pulseEndAt = 0;
    let pulseStartAt = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);

      // Ambient envelope spin + shimmer — keeps the lattice alive from afar.
      // Uses MeshBasicMaterial so vertex colors are visible without scene lights.
      if (!skillsLatticeActiveRef.current) {
        const shell = skillsLatticeEnvelopeRef.current;
        const basicMat = skillsLatticeEnvelopeBasicMatRef.current;
        const shellEdgeMat = skillsLatticeEnvelopeEdgeMatRef.current;
        if (shell) {
          if (basicMat && shell.material !== basicMat) {
            shell.material = basicMat;
            basicMat.side = THREE.FrontSide;
            basicMat.transparent = false;
            basicMat.depthWrite = true;
          }
          const nowShell = performance.now();
          const shellDt = Math.min((nowShell - lastShellMs) / 1000, 0.05);
          lastShellMs = nowShell;
          shell.rotation.x += shellDt * 0.014;
          shell.rotation.y += shellDt * 0.022;
          shell.rotation.z += shellDt * 0.011;

          if (basicMat && shellEdgeMat) {
            const t = nowShell * 0.001;
            if (nowShell >= nextPulseAt) {
              pulseStartAt = nowShell;
              pulseEndAt = nowShell + 720 + Math.random() * 520;
              nextPulseAt = pulseEndAt + 2800 + Math.random() * 4200;
            }
            const pulseDur = Math.max(1, pulseEndAt - pulseStartAt);
            const pulseP =
              pulseEndAt > nowShell ? (nowShell - pulseStartAt) / pulseDur : 0;
            const periodic = 0.5 + 0.5 * Math.sin(t * 0.75);
            const pulse =
              pulseEndAt > nowShell ? Math.sin(pulseP * Math.PI) : 0;
            const boost = periodic * 0.22 + pulse * 0.95;
            shellEdgeMat.opacity = THREE.MathUtils.clamp(
              0.17 + boost * 0.24,
              0.12,
              0.5,
            );
            shellEdgeMat.color.setHSL(
              (0.57 + 0.03 * periodic + pulse * 0.04) % 1,
              0.82,
              0.7,
            );
          }
        }
      } else {
        lastShellMs = performance.now();
      }

      const beacon = skillsLatticeBeaconRef.current;
      const beaconMat = skillsLatticeBeaconMatRef.current;
      const edgeMat = skillsLatticeBeaconEdgeMatRef.current;
      if (!beacon || !beaconMat || !edgeMat) return;
      if (!beacon.visible) return;

      const now = performance.now();
      // Limit beacon animation updates to ~30fps to reduce load during
      // high-speed approach when the shell fills more of the screen.
      if (now - lastAnimStepMs < 33) return;
      lastAnimStepMs = now;
      const dt = Math.min((now - lastMs) / 1000, 0.05);
      lastMs = now;
      const t = now * 0.001;
      beacon.rotation.x += dt * 0.006;
      beacon.rotation.y += dt * 0.009;
      beacon.rotation.z += dt * 0.0045;

      if (now >= nextPulseAt) {
        pulseStartAt = now;
        pulseEndAt = now + 720 + Math.random() * 520;
        nextPulseAt = pulseEndAt + 2800 + Math.random() * 4200;
      }
      const pulseDur = Math.max(1, pulseEndAt - pulseStartAt);
      const pulseP = pulseEndAt > now ? (now - pulseStartAt) / pulseDur : 0;
      const periodic = 0.5 + 0.5 * Math.sin(t * 0.75);
      const pulse = pulseEndAt > now ? Math.sin(pulseP * Math.PI) : 0;
      const boost = periodic * 0.22 + pulse * 0.95;

      // Pulse brightness only; keep emissive hue neutral so panel colors stay distinct.
      const shimmerHue = 0.58 + 0.025 * Math.sin(t * 3.1) + pulse * 0.03;
      beaconMat.emissive.setHSL(shimmerHue % 1, 0.28, 0.22);
      beaconMat.emissiveIntensity = THREE.MathUtils.clamp(
        0.06 + boost * 0.22,
        0.05,
        0.34,
      );
      // Beacon remains clickable but visually hidden; outer shell carries visuals.
      edgeMat.opacity = 0;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneReady]);

  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    let last = performance.now();
    const desiredPos = new THREE.Vector3();
    const lookAtPos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const tick = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;
      const sd = starDestroyerRef.current;
      const anchor = skillsLatticeWorldAnchorRef.current;
      const skillsRouteActive = currentNavigationTargetRef.current === "skills";
      const holdNearSkills =
        STAR_DESTROYER_SKILLS_HOLD &&
        (skillsLatticeActiveRef.current || skillsRouteActive);
      if (sd && anchor && holdNearSkills) {
        if (!skillsSDLockActiveRef.current) {
          skillsSDLockActiveRef.current = true;
          const a0 = skillsSDPatrolStateRef.current.angle;
          sd.position.set(
            anchor.x + Math.cos(a0) * (SKILLS_SD_PATROL_RADIUS * 0.9),
            anchor.y + 96,
            anchor.z + Math.sin(a0) * (SKILLS_SD_PATROL_RADIUS * 0.9),
          );
          vlog("🔺 SD skills-lock engaged");
          shipLog("SD lock engaged (Skills)", "info");
        }
        sd.visible = true;
        skillsSDPatrolStateRef.current.angle += dt * SKILLS_SD_PATROL_SPEED;
        const a = skillsSDPatrolStateRef.current.angle;
        desiredPos.set(
          anchor.x + Math.cos(a) * SKILLS_SD_PATROL_RADIUS,
          anchor.y + 92 + Math.sin(a * 1.6) * 11,
          anchor.z + Math.sin(a) * SKILLS_SD_PATROL_RADIUS,
        );
        lookAtPos.set(
          anchor.x + Math.cos(a + 0.4) * SKILLS_SD_PATROL_RADIUS,
          anchor.y + 84,
          anchor.z + Math.sin(a + 0.4) * SKILLS_SD_PATROL_RADIUS,
        );
        sd.position.lerp(desiredPos, 0.028);
        const lookMat = new THREE.Matrix4().lookAt(sd.position, lookAtPos, up);
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
          lookMat,
        );
        const forwardOffset = sd.userData?.forwardOffset as
          | THREE.Quaternion
          | undefined;
        if (forwardOffset) targetQuat.multiply(forwardOffset);
        sd.quaternion.slerp(targetQuat, 0.02);
        const nowMs = performance.now();
        if (nowMs - starDestroyerDebugLastLogMsRef.current > 3200) {
          starDestroyerDebugLastLogMsRef.current = nowMs;
          vlog(
            `🔺 SD near Skills [${sd.position.x.toFixed(0)}, ${sd.position.y.toFixed(
              0,
            )}, ${sd.position.z.toFixed(0)}]`,
          );
        }
      } else {
        if (skillsSDLockActiveRef.current) {
          vlog("🔺 SD skills-lock released");
          shipLog("SD lock released", "info");
        }
        skillsSDLockActiveRef.current = false;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [navigationDistance, sceneReady, shipLog, vlog]);

  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cruiser = starDestroyerCruiserRef.current;
      if (!cruiser) return;

      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;

      // While Skills mode is actively pinning the SD to its scripted patrol,
      // skip cruiser autonomy updates to avoid two systems fighting over pose.
      if (skillsSDLockActiveRef.current) return;
      // Scripted moments own the pose while they run.
      if (starDestroyerMomentsRef.current?.isActive()) return;

      cruiser.update(dt);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneReady]);

  // Mirrors the travel phase for per-frame code (escort trigger).
  const navigationTravelPhaseRef = useRef(navigationTravelPhase);
  useEffect(() => {
    navigationTravelPhaseRef.current = navigationTravelPhase;
  }, [navigationTravelPhase]);

  // Star Destroyer moments: fly-over after the intro, and an escort on some
  // lightspeed trips. Posed right before the main render so it stays locked
  // to the moving Falcon without a frame of lag.
  useEffect(() => {
    if (!sceneReady) return;
    const scene = sceneRef.current.scene;
    if (!scene) return;
    let last = performance.now();
    let wasLightspeed = false;
    let escortCount = 0;
    let lastEscortAt = -Infinity;
    let flyoverTimer: ReturnType<typeof setTimeout> | null = null;

    const previousBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = function (...args) {
      const renderCamera = args[2] as THREE.Camera;
      const moments = starDestroyerMomentsRef.current;
      // Only on the main view (the targeting preview renders the scene too).
      if (moments && renderCamera === sceneRef.current.camera) {
        const now = performance.now();
        const dt = Math.max(0, (now - last) / 1000);
        last = now;
        const lightspeed = navigationTravelPhaseRef.current === "lightspeed_engaged";
        if (lightspeed && !wasLightspeed && !moments.isActive()) {
          const offCooldown = now - lastEscortAt > STAR_DESTROYER_ESCORT_COOLDOWN_MS;
          if (
            escortCount === 0 ||
            (offCooldown && Math.random() < STAR_DESTROYER_ESCORT_CHANCE)
          ) {
            moments.startEscort();
            escortCount += 1;
            lastEscortAt = now;
          }
        }
        wasLightspeed = lightspeed;
        moments.update(dt, {
          camera: renderCamera,
          ship: spaceshipRef.current,
          lightspeed,
        });
      }
      previousBeforeRender.apply(this, args);
    };

    const startFlyover = () => {
      const moments = starDestroyerMomentsRef.current;
      const camera = sceneRef.current.camera;
      if (!moments || !camera || moments.isActive()) return false;
      const info = moments.startFlyover(camera);
      shipLog(
        `SD fly-over: hull ${info.hullLength.toFixed(1)} long, start (${info.spec.startRight}, ${info.spec.startUp}, ${info.spec.startForward}), angle left ${info.spec.yawLeftDeg}° down ${info.spec.pitchDownDeg}°`,
        "info",
      );
      return true;
    };
    // The Falcon comes in first and stops (its hover); once the intro camera
    // has also finished turning, the Destroyer comes in.
    let flyoverScheduled = false;
    let settleRaf = 0;
    const waitForCameraToSettle = () => {
      const waitStart = performance.now();
      const lastForward = new THREE.Vector3();
      const forward = new THREE.Vector3();
      let hasLast = false;
      let lastAt = waitStart;
      let settledFor = 0;
      const check = (now: number) => {
        settleRaf = 0;
        // Skip if the visitor already set off somewhere.
        if (currentNavigationTargetRef.current) return;
        const camera = sceneRef.current.camera;
        if (camera) {
          camera.getWorldDirection(forward);
          const dt = Math.max(1e-3, (now - lastAt) / 1000);
          if (hasLast) {
            const turnRate = forward.angleTo(lastForward) / dt;
            settledFor =
              turnRate < STAR_DESTROYER_FLYOVER_SETTLED_TURN_RATE
                ? settledFor + dt * 1000
                : 0;
          }
          lastForward.copy(forward);
          hasLast = true;
        }
        lastAt = now;
        const waited = now - waitStart;
        if (waited > STAR_DESTROYER_FLYOVER_MAX_WAIT_MS || settledFor >= STAR_DESTROYER_FLYOVER_SETTLED_MS) {
          // SD configurator: remember the real intro view it starts from.
          sdIntroViewSettledRef.current = true;
          const introCamera = sceneRef.current.camera;
          const introControls = sceneRef.current.controls;
          if (introCamera && introControls) {
            recordSdIntroView(
              introCamera.getWorldPosition(new THREE.Vector3()),
              introControls.getTarget(new THREE.Vector3()),
            );
          }
          startFlyover();
          return;
        }
        settleRaf = requestAnimationFrame(check);
      };
      settleRaf = requestAnimationFrame(check);
    };
    const unsubscribeIntro = subscribeCosmosEvent("ship:cinematic-hover", () => {
      if (flyoverScheduled) return;
      flyoverScheduled = true;
      flyoverTimer = setTimeout(() => {
        flyoverTimer = null;
        waitForCameraToSettle();
      }, STAR_DESTROYER_FLYOVER_MIN_DELAY_MS);
    });

    // Console helpers for trying the moments on demand.
    const win = window as unknown as Record<string, unknown>;
    win.sdFlyover = () => startFlyover();
    // SD configurator
    win.sdConfigurator = () => openSdConfigurator(true);
    win.sdEscort = () => {
      const moments = starDestroyerMomentsRef.current;
      if (!moments || moments.isActive()) return false;
      moments.startEscort();
      return true;
    };

    return () => {
      unsubscribeIntro();
      if (flyoverTimer) clearTimeout(flyoverTimer);
      if (settleRaf) cancelAnimationFrame(settleRaf);
      scene.onBeforeRender = previousBeforeRender;
      delete win.sdFlyover;
      delete win.sdEscort;
      delete win.sdConfigurator; // SD configurator
    };
  }, [sceneReady]);

  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    const sdPos = new THREE.Vector3();
    const prevSdPos = new THREE.Vector3();
    const delta = new THREE.Vector3();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!shadowSDModeRef.current) return;

      const sd = starDestroyerRef.current;
      const camera = sceneRef.current.camera;
      const controls = sceneRef.current.controls;
      if (!sd || !camera || !controls) return;

      sd.getWorldPosition(sdPos);
      const last = shadowSDLastTargetRef.current;
      if (last) {
        prevSdPos.copy(last);
        delta.copy(sdPos).sub(prevSdPos);
        if (delta.lengthSq() > 1e-9) {
          camera.position.add(delta);
        }
      }

      controls.minDistance = 5;
      controls.maxDistance = 2200;
      controls.setLookAt(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        sdPos.x,
        sdPos.y,
        sdPos.z,
        false,
      );

      if (!shadowSDLastTargetRef.current) {
        shadowSDLastTargetRef.current = sdPos.clone();
      } else {
        shadowSDLastTargetRef.current.copy(sdPos);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneReady]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const pickNodeAtPointer = (clientX: number, clientY: number) => {
      const camera = sceneRef.current.camera;
      if (!camera || !skillsLatticeActiveRef.current) return null;
      const rect = mount.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.layers.set(SKILLS_LATTICE_LAYER);
      raycaster.setFromCamera(pointer, camera as THREE.Camera);
      const meshes = skillsLatticeNodesRef.current.map((n) => n.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) return null;
      const hitMesh = hits[0].object as THREE.Mesh;
      return (
        skillsLatticeNodesRef.current.find((n) => n.mesh === hitMesh) ?? null
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!skillsLatticeActiveRef.current) return;
      const node = pickNodeAtPointer(event.clientX, event.clientY);
      if (!node) return;
      focusSkillsLatticeNode(node, true);
      event.stopPropagation();
    };
    mount.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      mount.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
    };
  }, [focusSkillsLatticeNode]);

  useEffect(() => {
    return () => {
      skillsLatticePendingEntryRef.current = false;
      skillsLatticeActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading || !sceneReady) return;
    if (!ENABLE_POST_LOAD_COSMOS_MICRO_INTRO) {
      cosmosIntroPlayedRef.current = true;
      cosmosIntroCompletedRef.current = true;
      setCosmosIntroOverlayOpacity(0);
      if (CAMERA_TRACE_ENABLED) {
        shipLog("[CAMTRACE] post-load micro-intro disabled", "info");
      }
      return;
    }
    if (cosmosIntroPlayedRef.current) return;
    const ship = spaceshipRef.current;
    const controls = sceneRef.current.controls;
    const camera = sceneRef.current.camera;
    if (!ship || !controls || !camera) return;
    cosmosIntroPlayedRef.current = true;
    setCosmosIntroOverlayOpacity(0.42);

    const baseShipPos = ship.position.clone();
    const baseShipQuat = ship.quaternion.clone();
    const startCam = camera.position.clone();
    const startTarget = new THREE.Vector3();
    const controlsAny = controls as unknown as {
      getTarget?: (out: THREE.Vector3) => void;
    };
    if (controlsAny.getTarget) {
      controlsAny.getTarget(startTarget);
    } else {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      startTarget.copy(startCam).addScaledVector(dir, 30);
    }
    const endCam = startCam.clone().lerp(startTarget, 0.075);

    const durationMs = 2800;
    const startedAt = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const t = THREE.MathUtils.clamp(elapsed / durationMs, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      const bob = Math.sin(elapsed * 0.0017) * 0.18;
      const sway = Math.cos(elapsed * 0.0012) * 0.08;
      ship.position.set(
        baseShipPos.x + sway,
        baseShipPos.y + bob,
        baseShipPos.z,
      );
      ship.quaternion.slerp(baseShipQuat, 0.14);

      const camPos = new THREE.Vector3().lerpVectors(startCam, endCam, ease);
      controls.setLookAt(
        camPos.x,
        camPos.y,
        camPos.z,
        startTarget.x,
        startTarget.y,
        startTarget.z,
        false,
      );

      setCosmosIntroOverlayOpacity(THREE.MathUtils.lerp(0.42, 0, ease));
      if (t >= 1) {
        setCosmosIntroOverlayOpacity(0);
        cosmosIntroCompletedRef.current = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isLoading, sceneReady]);

  useEffect(() => {
    if (!orbitalPortfolioActive) return;
    let raf = 0;
    let last = performance.now();
    const camPos = new THREE.Vector3();
    const anchor = new THREE.Vector3();
    const lookAt = new THREE.Vector3();
    const matterFrom = new THREE.Vector3();
    const matterTo = new THREE.Vector3();
    const matterTarget = new THREE.Vector3();
    const matterPos = new THREE.Vector3();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      const root = orbitalPortfolioRootRef.current;
      if (!controls || !camera || !root) return;
      root.getWorldPosition(anchor);
      if (
        ORBITAL_PORTFOLIO_DEBUG_LOGS &&
        !orbitalPortfolioDebugDumpedRef.current
      ) {
        orbitalPortfolioDebugDumpedRef.current = true;
        const planeRows: string[] = [];
        const spriteRows: string[] = [];
        let meshCount = 0;
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          meshCount += 1;
          const geometryType = mesh.geometry?.type ?? "unknown";
          if (geometryType !== "PlaneGeometry") return;
          const mat = mesh.material as THREE.MeshBasicMaterial | undefined;
          if (!mat) return;
          if (planeRows.length >= 10) return;
          const colorHex =
            typeof mat.color?.getHexString === "function"
              ? mat.color.getHexString()
              : "n/a";
          planeRows.push(
            `${mesh.name || "(anon)"}|op=${mat.opacity.toFixed(2)}|map=${mat.map ? "y" : "n"}|col=#${colorHex}|vis=${mesh.visible ? "y" : "n"}`,
          );
        });
        root.traverse((obj) => {
          const sprite = obj as THREE.Sprite;
          if (!sprite.isSprite) return;
          const mat = sprite.material as THREE.SpriteMaterial | undefined;
          if (!mat) return;
          if (spriteRows.length >= 6) return;
          const colorHex =
            typeof mat.color?.getHexString === "function"
              ? mat.color.getHexString()
              : "n/a";
          spriteRows.push(
            `${sprite.name || "(anon)"}|op=${mat.opacity.toFixed(2)}|map=${mat.map ? "y" : "n"}|col=#${colorHex}|vis=${sprite.visible ? "y" : "n"}`,
          );
        });
        shipLog(
          `[PORTDBG] rootMeshes=${meshCount} planeSamples=${planeRows.length} spriteSamples=${spriteRows.length}`,
          "info",
        );
        if (planeRows.length > 0) {
          shipLog(`[PORTDBG] planes ${planeRows.join(" || ")}`, "info");
        }
        if (spriteRows.length > 0) {
          shipLog(`[PORTDBG] sprites ${spriteRows.join(" || ")}`, "info");
        }
      }
      const groups = orbitalPortfolioGroupsRef.current;
      const inspectedIndex = orbitalPortfolioInspectedStationIndexRef.current;
      const hasInspectContext = inspectedIndex !== null;
      let freezeCount = 0;
      let inspectedFreezeCount = 0;
      let laneFreezeCount = 0;
      let manualFreezeCount = 0;
      if (
        inspectedIndex !== null &&
        now - orbitalPortfolioInspectStartedAtRef.current >
          ORBITAL_PORTFOLIO_INSPECT_EXIT_GRACE_MS &&
        sceneRef.current.camera &&
        sceneRef.current.controls
      ) {
        const inspectedStation =
          orbitalPortfolioStationsRef.current[inspectedIndex];
        const controlsAny = sceneRef.current.controls as unknown as {
          getTarget?: (out: THREE.Vector3) => void;
        };
        if (inspectedStation && controlsAny.getTarget) {
          const controlTarget = new THREE.Vector3();
          controlsAny.getTarget(controlTarget);
          const cameraDistance =
            sceneRef.current.camera.position.distanceTo(controlTarget);
          const inspectedPlateWorld = new THREE.Vector3();
          inspectedStation.plate.getWorldPosition(inspectedPlateWorld);
          const targetDrift = controlTarget.distanceTo(inspectedPlateWorld);
          if (
            cameraDistance < ORBITAL_PORTFOLIO_INSPECT_EXIT_MIN_DISTANCE ||
            cameraDistance > ORBITAL_PORTFOLIO_INSPECT_EXIT_MAX_DISTANCE ||
            targetDrift > ORBITAL_PORTFOLIO_INSPECT_EXIT_TARGET_DRIFT
          ) {
            if (ORBITAL_PORTFOLIO_STATE_DEBUG_LOGS) {
              shipLog(
                `[PORTSTATE] inspect-auto-exit station=${inspectedIndex} camDist=${cameraDistance.toFixed(1)} drift=${targetDrift.toFixed(1)} graceMs=${(now - orbitalPortfolioInspectStartedAtRef.current).toFixed(0)}`,
                "info",
              );
            }
            exitOrbitalPortfolioInspectMode({
              resumeOrbits: true,
              keepManualControl: true,
              reason:
                "Portfolio inspect exited (camera moved out of close-up) — resuming orbit motion",
            });
          }
        }
      }
      if (groups.length > 0) {
        if (
          orbitalPortfolioPlayingRef.current &&
          orbitalPortfolioAutoplayEnabledRef.current &&
          now >= orbitalPortfolioAutoRef.current.pausedUntil &&
          now - orbitalPortfolioAutoRef.current.lastAdvanceAt >=
            orbitalPortfolioAutoRef.current.intervalMs
        ) {
          orbitalPortfolioAutoRef.current.lastAdvanceAt = now;
          const focus = THREE.MathUtils.clamp(
            orbitalPortfolioFocusIndexRef.current,
            0,
            groups.length - 1,
          );
          const group = groups[focus];
          const variants = group.variants;
          const currentVariant = THREE.MathUtils.clamp(
            orbitalPortfolioVariantIndex,
            0,
            Math.max(0, variants.length - 1),
          );
          const mediaCount = Math.max(
            1,
            variants[currentVariant]?.mediaItems?.length ?? 1,
          );
          let nextFocus = focus;
          let nextVariant = currentVariant;
          let nextMedia = orbitalPortfolioMediaIndex;
          if (orbitalPortfolioMediaIndex + 1 < mediaCount) {
            nextMedia = orbitalPortfolioMediaIndex + 1;
          } else if (currentVariant + 1 < variants.length) {
            nextVariant = currentVariant + 1;
            nextMedia = 0;
          } else {
            nextFocus = (focus + 1) % groups.length;
            nextVariant = 0;
            nextMedia = 0;
          }
          focusOrbitalPortfolioStation(nextFocus, nextMedia, {
            autoplay: true,
            variantIndex: nextVariant,
          });
        }
      }
      let nonFocusedPlateVisible = 0;
      let nonFocusedFrameVisible = 0;
      let nonFocusedWithoutTexture = 0;
      let haloThumbsMissingMap = 0;
      const stationDebugRows: string[] = [];
      const orbitMotionEnabled = orbitalPortfolioOrbitsEnabledRef.current;
      const inspectedStationIndex =
        orbitalPortfolioInspectedStationIndexRef.current;
      const inspectedOrbitKey =
        inspectedStationIndex !== null
          ? (() => {
              const inspected =
                orbitalPortfolioStationsRef.current[inspectedStationIndex];
              if (!inspected) return undefined;
              return `${inspected.coreId}|${inspected.plainIndex}|${inspected.ringIndex}`;
            })()
          : undefined;
      orbitalPortfolioStationsRef.current.forEach((station, idx) => {
        station.group.rotation.y += dt * 0.0;
        station.mediaHaloGroup.rotation.y -= dt * 0.0;
        station.mediaHaloGroup.rotation.x = 0;
        const isFocused =
          orbitalPortfolioHasActiveFocusRef.current &&
          idx === orbitalPortfolioFocusIndexRef.current;
        const isInspected =
          idx === orbitalPortfolioInspectedStationIndexRef.current;
        // Keep the currently visited card stable so camera-inspect never drifts.
        // Also freeze peers in the same orbit ring to prevent distracting
        // pass-through motion across the focused card while inspecting.
        const inInspectedOrbit =
          !!inspectedOrbitKey &&
          `${station.coreId}|${station.plainIndex}|${station.ringIndex}` ===
            inspectedOrbitKey;
        const lockStationOrbit =
          isInspected ||
          inInspectedOrbit ||
          (hasInspectContext &&
            isFocused &&
            orbitalPortfolioManualCameraLockRef.current);
        if (lockStationOrbit) {
          freezeCount += 1;
          if (isInspected) inspectedFreezeCount += 1;
          else if (inInspectedOrbit) laneFreezeCount += 1;
          else if (isFocused && orbitalPortfolioManualCameraLockRef.current)
            manualFreezeCount += 1;
        }
        const targetOrbitBlend =
          !orbitMotionEnabled || lockStationOrbit ? 0 : 1;
        station.orbitMotionBlend = THREE.MathUtils.damp(
          station.orbitMotionBlend,
          targetOrbitBlend,
          targetOrbitBlend > station.orbitMotionBlend ? 5.5 : 12,
          dt,
        );
        if (station.orbitMotionBlend > 0.0001) {
          station.orbitAngle +=
            ORBITAL_PORTFOLIO_STATION_ORBIT_SPEED *
            dt *
            station.orbitDirection *
            station.orbitMotionBlend;
        }
        const plainQuat = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          THREE.MathUtils.degToRad(station.plainAngle),
        );
        const localOrbit = new THREE.Vector3(
          Math.cos(station.orbitAngle) * station.orbitRadius,
          0,
          Math.sin(station.orbitAngle) * station.orbitRadius,
        ).applyQuaternion(plainQuat);
        station.group.position.copy(station.coreAnchorLocal).add(localOrbit);
        const straightenTarget = isInspected ? 0.96 : isFocused ? 0.06 : 0;
        const straightenDamping = isInspected ? 13.5 : 4.8;
        station.straightenBlend = THREE.MathUtils.damp(
          station.straightenBlend,
          straightenTarget,
          straightenDamping,
          dt,
        );
        morphPanelGeometry(
          station.platePositionAttr,
          station.plateCurvedPositions,
          station.plateFlatPositions,
          station.straightenBlend,
        );
        if (station.impactStartedAt > 0) {
          const elapsed = now - station.impactStartedAt;
          const tImpact = THREE.MathUtils.clamp(
            elapsed / Math.max(100, station.impactDurationMs),
            0,
            1,
          );
          const dentPulse = Math.sin(tImpact * Math.PI) * (1 - tImpact);
          const dentDepth = dentPulse * 6.8;
          const dentRadius = 22;
          const pinchStrength = dentPulse * 0.16;
          const rippleEnvelope = (1 - tImpact) * (1 - tImpact);
          const rippleFront = Math.min(
            station.rippleTravelMax,
            (elapsed / 1000) * station.rippleSpeed,
          );
          const attr = station.platePositionAttr;
          for (let v = 0; v < attr.count; v += 1) {
            const vx = attr.getX(v);
            const vy = attr.getY(v);
            const dx = vx - station.impactLocalPoint.x;
            const dy = vy - station.impactLocalPoint.y;
            const dist = Math.hypot(dx, dy);
            if (dist >= dentRadius) continue;
            const falloff = 1 - dist / dentRadius;
            const pinch = pinchStrength * falloff;
            attr.setX(v, vx - dx * pinch);
            attr.setY(v, vy - dy * pinch);
            const dz = -dentDepth * falloff * falloff;
            let rippleDz = 0;
            if (dist <= rippleFront + station.rippleWavelength * 1.2) {
              const wavePhase =
                ((dist - rippleFront) / Math.max(1, station.rippleWavelength)) *
                Math.PI *
                2;
              const waveFalloff = THREE.MathUtils.clamp(
                1 -
                  Math.abs(dist - rippleFront) /
                    (station.rippleWavelength * 1.25),
                0,
                1,
              );
              rippleDz =
                Math.sin(wavePhase) *
                station.rippleAmplitude *
                waveFalloff *
                rippleEnvelope;
            }
            attr.setZ(v, attr.getZ(v) + dz + rippleDz);
          }
          attr.needsUpdate = true;
        }
        morphPanelGeometry(
          station.framePositionAttr,
          station.frameCurvedPositions,
          station.frameFlatPositions,
          station.straightenBlend,
        );
        const frameMat = station.frame.material as THREE.MeshBasicMaterial;
        const plateMat = station.plate.material as THREE.MeshBasicMaterial;
        const hasTexture = Boolean(
          (station.plate.userData as { hasLoadedTexture?: boolean })
            .hasLoadedTexture,
        );
        frameMat.opacity = THREE.MathUtils.damp(
          frameMat.opacity,
          isFocused ? 0.22 : 0.1,
          8.5,
          dt,
        );
        plateMat.opacity = THREE.MathUtils.damp(
          plateMat.opacity,
          isFocused
            ? 0.98
            : hasTexture
              ? ORBITAL_PORTFOLIO_NONFOCUS_PLATE_OPACITY
              : 0.0,
          8.5,
          dt,
        );
        if (!isFocused) {
          if (plateMat.opacity > 0.08) nonFocusedPlateVisible += 1;
          if (frameMat.opacity > 0.04) nonFocusedFrameVisible += 1;
          if (!hasTexture) nonFocusedWithoutTexture += 1;
          if (stationDebugRows.length < 4) {
            stationDebugRows.push(
              `i${idx}: p=${plateMat.opacity.toFixed(2)} f=${frameMat.opacity.toFixed(2)} tex=${hasTexture ? "y" : "n"} map=${plateMat.map ? "y" : "n"}`,
            );
          }
        }
        const pulse = 0.6 + 0.4 * Math.sin(now * 0.0024 + station.pulsePhase);
        const haloMat = station.halo.material as THREE.SpriteMaterial;
        haloMat.opacity = (isFocused ? 0.34 : 0.1) * pulse;
        station.label.visible = isFocused;
        station.cardTitleMesh.visible = isFocused;
        station.cardVariantTabs.forEach((tab) => {
          const mat = tab.mesh.material as THREE.MeshBasicMaterial;
          const frameMat = tab.frame.material as THREE.MeshBasicMaterial;
          const hasVariant = tab.mesh.userData.hasVariant !== false;
          tab.mesh.visible = isFocused && hasVariant;
          tab.frame.visible = isFocused && hasVariant;
          const isActiveTab =
            Number(tab.mesh.userData.orbitalVariantIndex ?? tab.variantIndex) ===
            orbitalPortfolioVariantIndex;
          const hoverPulse =
            0.985 +
            0.015 *
              Math.sin(
                now * 0.004 + station.pulsePhase + tab.variantIndex * 0.9,
              );
          mat.opacity = isFocused ? 0.95 : 0;
          mat.color.setHex(isActiveTab ? 0x1d466d : 0x102742);
          frameMat.opacity = isFocused ? (isActiveTab ? 0.96 : 0.5) : 0;
          frameMat.color.setHex(isActiveTab ? 0xb4eeff : 0x69a9d6);
          const baseScale = isFocused ? (isActiveTab ? 1.03 : 0.97) : 0.9;
          tab.mesh.scale.setScalar(baseScale * (isFocused ? hoverPulse : 1));
          tab.frame.scale.copy(tab.mesh.scale);
        });
        station.cardThumbMeshes.forEach((thumb) => {
          const mat = thumb.mesh.material as THREE.MeshBasicMaterial;
          const frameMat = thumb.frame.material as THREE.MeshBasicMaterial;
          const hasMedia = thumb.mesh.userData.hasMedia !== false;
          const showThumb = thumb.mesh.userData.orbitalShowThumb !== false;
          thumb.mesh.visible = isFocused && showThumb && hasMedia;
          thumb.frame.visible = isFocused && showThumb && hasMedia;
          const mappedMediaIndex = Number(
            thumb.mesh.userData.orbitalMediaIndex ?? thumb.mediaIndex,
          );
          const isActiveMedia = mappedMediaIndex === orbitalPortfolioMediaIndex;
          mat.opacity = isFocused ? (isActiveMedia ? 1 : 0.93) : 0;
          mat.color.setHex(0xffffff);
          frameMat.opacity = isFocused ? (isActiveMedia ? 0.96 : 0.6) : 0;
          frameMat.color.setHex(isActiveMedia ? 0xd3f2ff : 0x79b5df);
          thumb.mesh.scale.setScalar(
            isFocused ? (isActiveMedia ? 1.05 : 0.96) : 0.9,
          );
          thumb.frame.scale.copy(thumb.mesh.scale);
          const baseX = Number(
            thumb.mesh.userData.orbitalBaseX ?? thumb.mesh.position.x,
          );
          const baseY = Number(
            thumb.mesh.userData.orbitalBaseY ?? thumb.mesh.position.y,
          );
          const meshSlideStartAt = Number(
            thumb.mesh.userData.orbitalThumbSlideStartAt ?? 0,
          );
          const meshSlideDuration = Math.max(
            1,
            Number(thumb.mesh.userData.orbitalThumbSlideDurationMs ?? 1),
          );
          const meshSlideFromX = Number(
            thumb.mesh.userData.orbitalThumbSlideFromX ?? 0,
          );
          let meshSlideOffsetX = 0;
          if (meshSlideStartAt > 0 && meshSlideFromX !== 0) {
            const t = THREE.MathUtils.clamp(
              (now - meshSlideStartAt) / meshSlideDuration,
              0,
              1,
            );
            const eased = 1 - (1 - t) * (1 - t) * (1 - t);
            meshSlideOffsetX = meshSlideFromX * (1 - eased);
            if (t >= 1) {
              thumb.mesh.userData.orbitalThumbSlideStartAt = 0;
              thumb.mesh.userData.orbitalThumbSlideFromX = 0;
            }
          }
          thumb.mesh.position.set(
            baseX + meshSlideOffsetX,
            baseY,
            thumb.mesh.position.z,
          );
          const frameBaseX = Number(
            thumb.frame.userData.orbitalBaseX ?? thumb.frame.position.x,
          );
          const frameBaseY = Number(
            thumb.frame.userData.orbitalBaseY ?? thumb.frame.position.y,
          );
          const frameSlideStartAt = Number(
            thumb.frame.userData.orbitalThumbSlideStartAt ?? 0,
          );
          const frameSlideDuration = Math.max(
            1,
            Number(thumb.frame.userData.orbitalThumbSlideDurationMs ?? 1),
          );
          const frameSlideFromX = Number(
            thumb.frame.userData.orbitalThumbSlideFromX ?? 0,
          );
          let frameSlideOffsetX = 0;
          if (frameSlideStartAt > 0 && frameSlideFromX !== 0) {
            const t = THREE.MathUtils.clamp(
              (now - frameSlideStartAt) / frameSlideDuration,
              0,
              1,
            );
            const eased = 1 - (1 - t) * (1 - t) * (1 - t);
            frameSlideOffsetX = frameSlideFromX * (1 - eased);
            if (t >= 1) {
              thumb.frame.userData.orbitalThumbSlideStartAt = 0;
              thumb.frame.userData.orbitalThumbSlideFromX = 0;
            }
          }
          thumb.frame.position.set(
            frameBaseX + frameSlideOffsetX,
            frameBaseY,
            thumb.frame.position.z,
          );
        });
        [...station.cardThumbNavMeshes, ...station.cardVariantTabNavMeshes].forEach((nav) => {
          const navMat = nav.mesh.material as THREE.MeshBasicMaterial;
          const navFrameMat = nav.frame.material as THREE.MeshBasicMaterial;
          const canMove = nav.mesh.userData.orbitalNavCanMove === true;
          const showNav = nav.mesh.userData.orbitalShowNav === true;
          const pressedUntil = Number(
            nav.mesh.userData.orbitalPressedUntil ?? 0,
          );
          const isPressed = pressedUntil > now;
          nav.mesh.visible = isFocused && showNav;
          nav.frame.visible = isFocused && showNav;
          navMat.opacity = isFocused
            ? canMove
              ? isPressed
                ? 1
                : 0.94
              : 0.34
            : 0;
          navFrameMat.opacity = isFocused
            ? canMove
              ? isPressed
                ? 0.96
                : 0.84
              : 0.24
            : 0;
          const targetScale = isFocused ? (isPressed ? 0.9 : 1) : 0.88;
          nav.mesh.scale.setScalar(targetScale);
          nav.frame.scale.setScalar(targetScale);
        });
        station.cardSlideNavMeshes.forEach((nav) => {
          const navMat = nav.mesh.material as THREE.MeshBasicMaterial;
          const navFrameMat = nav.frame.material as THREE.MeshBasicMaterial;
          const canMove = nav.mesh.userData.orbitalSlideCanMove === true;
          const pressedUntil = Number(
            nav.mesh.userData.orbitalPressedUntil ?? 0,
          );
          const isPressed = pressedUntil > now;
          nav.mesh.visible = isFocused && canMove;
          nav.frame.visible = isFocused && canMove;
          navMat.opacity = isFocused
            ? canMove
              ? isPressed
                ? 1
                : 0.94
              : 0.3
            : 0;
          navFrameMat.opacity = isFocused
            ? canMove
              ? isPressed
                ? 0.96
                : 0.84
              : 0.24
            : 0;
          const targetScale = isFocused ? (isPressed ? 0.9 : 1) : 0.88;
          nav.mesh.scale.setScalar(targetScale);
          nav.frame.scale.setScalar(targetScale);
        });
        station.mediaHaloGroup.visible = false;
        station.variantSatelliteGroup.visible = false;
        const targetScale = isFocused ? 2.35 : 1.1;
        station.group.scale.setScalar(
          THREE.MathUtils.damp(station.group.scale.x, targetScale, 7.4, dt),
        );
        if (station.impactStartedAt > 0) {
          const elapsed = now - station.impactStartedAt;
          const tImpact = THREE.MathUtils.clamp(
            elapsed / Math.max(100, station.impactDurationMs),
            0,
            1,
          );
          const impactMat = station.impactSprite
            .material as THREE.SpriteMaterial;
          station.impactSprite.visible = tImpact < 1;
          impactMat.opacity = (1 - tImpact) * (1 - tImpact) * 0.52;
          const impactScale = 8 + tImpact * 24;
          station.impactSprite.scale.setScalar(impactScale);
          if (tImpact >= 1) {
            station.impactStartedAt = -1;
            station.impactSprite.visible = false;
            impactMat.opacity = 0;
          }
        }
        const radialToCore = station.coreAnchorLocal
          .clone()
          .sub(station.group.position)
          .normalize();
        const worldUp = new THREE.Vector3(0, 1, 0);
        // Keep slide "top" aligned with world up so inspect view stays landscape.
        const projectedUp = worldUp
          .clone()
          .sub(radialToCore.clone().multiplyScalar(worldUp.dot(radialToCore)));
        const upright =
          projectedUp.lengthSq() > 1e-6
            ? projectedUp.normalize()
            : station.plainNormalLocal.clone().normalize();
        const right = new THREE.Vector3().crossVectors(upright, radialToCore);
        if (right.lengthSq() < 1e-8) {
          station.group.lookAt(station.coreAnchorLocal);
        } else {
          right.normalize();
          const correctedUp = new THREE.Vector3()
            .crossVectors(radialToCore, right)
            .normalize();
          const basis = new THREE.Matrix4().makeBasis(
            right,
            correctedUp,
            radialToCore,
          );
          station.group.quaternion.setFromRotationMatrix(basis);
        }
        station.mediaHaloGroup.children.forEach((child) => {
          const mesh = child as THREE.Mesh;
          const mat = mesh.material as THREE.MeshBasicMaterial | undefined;
          if (!mat) return;
          if (!mat.map && mat.opacity > 0.04) haloThumbsMissingMap += 1;
        });
      });
      if (
        ORBITAL_PORTFOLIO_STATE_DEBUG_LOGS &&
        now - orbitalPortfolioStateDebugLastLogAtRef.current >= 900
      ) {
        orbitalPortfolioStateDebugLastLogAtRef.current = now;
        const inspectedLaneForLog =
          inspectedIndex !== null
            ? orbitalPortfolioStationsRef.current[inspectedIndex]?.orbitLane
            : undefined;
        shipLog(
          `[PORTSTATE] focus=${orbitalPortfolioFocusIndexRef.current} inspected=${inspectedIndex ?? "none"} lane=${typeof inspectedLaneForLog === "number" ? inspectedLaneForLog : "none"} playing=${orbitalPortfolioPlayingRef.current ? 1 : 0} orbits=${orbitalPortfolioOrbitsEnabledRef.current ? 1 : 0} manualLock=${orbitalPortfolioManualCameraLockRef.current ? 1 : 0} frozen=${freezeCount} [inspected=${inspectedFreezeCount},lane=${laneFreezeCount},manual=${manualFreezeCount}]`,
          "info",
        );
      }
      if (
        ORBITAL_PORTFOLIO_DEBUG_LOGS &&
        now - orbitalPortfolioDebugLastLogAtRef.current >= 2200
      ) {
        orbitalPortfolioDebugLastLogAtRef.current = now;
        shipLog(
          `[PORTDBG] nonFocus plate>0.08=${nonFocusedPlateVisible} frame>0.04=${nonFocusedFrameVisible} nonFocusNoTex=${nonFocusedWithoutTexture} haloMissingMap=${haloThumbsMissingMap}`,
          "info",
        );
        if (stationDebugRows.length > 0) {
          shipLog(`[PORTDBG] ${stationDebugRows.join(" | ")}`, "info");
        }
      }
      const toneRuntime = orbitalPortfolioToneRuntimeRef.current;
      if (
        toneRuntime.enabled &&
        orbitalPortfolioActiveRef.current &&
        orbitalPortfolioCoresRef.current.length > 0
      ) {
        if (toneRuntime.nextEventAtMs <= 0) {
          toneRuntime.nextEventAtMs = now + 900;
        }
        if (now >= toneRuntime.nextEventAtMs) {
          const motifs = SKILLS_LATTICE_TONE_MOTIFS_HZ;
          const motif =
            motifs[
              THREE.MathUtils.clamp(
                toneRuntime.motifIndex,
                0,
                Math.max(0, motifs.length - 1),
              )
            ] ??
            motifs[0] ??
            [];
          if (toneRuntime.noteIndex >= motif.length) {
            toneRuntime.noteIndex = 0;
            toneRuntime.motifIndex =
              (toneRuntime.motifIndex + 1) % Math.max(1, motifs.length);
            toneRuntime.nextEventAtMs =
              now + SKILLS_LATTICE_TONE_PHRASE_PAUSE_MS;
          } else {
            const freq = motif[toneRuntime.noteIndex] ?? 329.63;
            const maxCoreSlots = Math.max(
              1,
              Math.min(5, orbitalPortfolioCoresRef.current.length),
            );
            toneRuntime.accentCoreIndex = toneRuntime.noteIndex % maxCoreSlots;
            toneRuntime.accentUntilAtMs =
              now + SKILLS_LATTICE_TONE_NOTE_DURATION_MS;
            if (ORBITAL_PORTFOLIO_DEBUG_LOGS) {
              shipLog(
                `[LATTICE-TONE] queue motif=${toneRuntime.motifIndex} note=${toneRuntime.noteIndex} core=${toneRuntime.accentCoreIndex} freq=${freq.toFixed(2)} ctx=${toneRuntime.context?.state ?? "null"}`,
                "info",
              );
            }
            playOrbitalPortfolioTone(freq);
            toneRuntime.noteIndex += 1;
            toneRuntime.nextEventAtMs = now + SKILLS_LATTICE_TONE_NOTE_STEP_MS;
          }
        }
      }
      orbitalPortfolioCoresRef.current.forEach((core, coreIndex) => {
        const accentT =
          toneRuntime.enabled &&
          coreIndex === toneRuntime.accentCoreIndex &&
          now < toneRuntime.accentUntilAtMs
            ? 1 -
              THREE.MathUtils.clamp(
                (now -
                  (toneRuntime.accentUntilAtMs -
                    SKILLS_LATTICE_TONE_NOTE_DURATION_MS)) /
                  Math.max(1, SKILLS_LATTICE_TONE_NOTE_DURATION_MS),
                0,
                1,
              )
            : 0;
        const glowMat = core.glow.material as THREE.MeshBasicMaterial;
        glowMat.opacity =
          0.2 +
          (0.5 + 0.5 * Math.sin(now * 0.0018 + coreIndex)) * 0.2 +
          accentT * 0.28;
        core.glow.scale.setScalar(1 + accentT * 0.32);
        core.nucleus.scale.setScalar(1 + accentT * 0.1);
        core.root.rotation.y += dt * 0.03;
        core.root.rotation.x = Math.sin(now * 0.00037 + coreIndex * 0.4) * 0.08;
        core.sliceGroup.rotation.y -= dt * 0.24;
        core.sliceGroup.rotation.z += dt * 0.11;
        core.sliceMats.forEach((mat, idx) => {
          const pulse =
            0.5 + 0.5 * Math.sin(now * 0.0021 + idx * 0.9 + coreIndex);
          mat.opacity = 0.2 + pulse * 0.28 + accentT * 0.2;
        });
        core.rayMats.forEach((mat, idx) => {
          const pulse =
            0.5 + 0.5 * Math.sin(now * 0.0017 + idx * 0.63 + coreIndex);
          mat.opacity = 0.12 + pulse * 0.2 + accentT * 0.16;
        });
        if (core.panelMat) {
          core.panelMat.opacity =
            0.12 + (0.5 + 0.5 * Math.sin(now * 0.0016)) * 0.02;
        }
        if (core.panelColorAttr && core.panelBaseColors) {
          const arr = core.panelColorAttr.array as Float32Array;
          const lum =
            0.86 + (0.5 + 0.5 * Math.sin(now * 0.0012 + coreIndex)) * 0.06;
          for (let i = 0; i < arr.length; i += 3) {
            const pulse =
              0.98 + 0.02 * Math.sin(now * 0.0019 + i * 0.0013 + coreIndex);
            arr[i] = core.panelBaseColors[i] * lum * pulse;
            arr[i + 1] = core.panelBaseColors[i + 1] * lum * pulse;
            arr[i + 2] = core.panelBaseColors[i + 2] * lum * pulse;
          }
          core.panelColorAttr.needsUpdate = true;
        }
      });
      if (orbitalPortfolioMatterGroupRef.current) {
        orbitalPortfolioMatterGroupRef.current.rotation.y += dt * 0.02;
      }
      const packets = orbitalPortfolioMatterPacketsRef.current;
      if (packets.length > 0 && orbitalPortfolioCoresRef.current.length > 0) {
        const pickRandomStationIndexForCore = (coreIndex: number): number => {
          const cores = orbitalPortfolioCoresRef.current;
          const stations = orbitalPortfolioStationsRef.current;
          if (stations.length === 0) return 0;
          const safeCoreIndex = THREE.MathUtils.clamp(
            coreIndex,
            0,
            Math.max(0, cores.length - 1),
          );
          const coreId = cores[safeCoreIndex]?.id;
          if (!coreId) return Math.floor(Math.random() * stations.length);
          const candidates: number[] = [];
          stations.forEach((station, stationIndex) => {
            if (station.coreId === coreId) candidates.push(stationIndex);
          });
          if (candidates.length === 0)
            return Math.floor(Math.random() * stations.length);
          return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
        };
        const randomTargetOffset = () =>
          new THREE.Vector2(
            (Math.random() - 0.5) * 52,
            (Math.random() - 0.5) * 28,
          );
        const randomMissOffset = () =>
          new THREE.Vector3(
            (Math.random() - 0.5) * 520,
            (Math.random() - 0.5) * 220 + 80,
            (Math.random() - 0.5) * 520,
          );
        const randomWillImpact = () => Math.random() >= 0.32;
        packets.forEach((packet, idx) => {
          packet.progress += dt * packet.speed;
          if (packet.progress >= 1) {
            const impactStation =
              orbitalPortfolioStationsRef.current[packet.targetStation];
            if (packet.willImpact && impactStation) {
              impactStation.impactStartedAt = now;
              const impactMat = impactStation.impactSprite
                .material as THREE.SpriteMaterial;
              const packetMat = packet.mesh.material as THREE.SpriteMaterial;
              impactMat.color.copy(packetMat.color);
              matterTo.set(packet.targetOffset.x, packet.targetOffset.y, 0.2);
              impactStation.plate.localToWorld(matterTo);
              impactStation.group.worldToLocal(matterTo);
              impactStation.impactLocalPoint.set(matterTo.x, matterTo.y);
              impactStation.impactSprite.position.set(
                matterTo.x,
                matterTo.y,
                1.38,
              );
              impactStation.impactSprite.scale.setScalar(8 + Math.random() * 4);
              impactStation.impactDurationMs = 2200 + Math.random() * 1200;
              impactStation.rippleAmplitude = 0.45 + Math.random() * 1.15;
              impactStation.rippleWavelength = 6.5 + Math.random() * 6;
              impactStation.rippleSpeed = 26 + Math.random() * 44;
              impactStation.rippleTravelMax = 12 + Math.random() * 18;
            }
            packet.progress = 0;
            packet.speed = 0.24 + Math.random() * 0.32;
            packet.sourceCoreIndex = Math.floor(
              Math.random() *
                Math.max(1, orbitalPortfolioCoresRef.current.length),
            );
            packet.targetStation = pickRandomStationIndexForCore(
              packet.sourceCoreIndex,
            );
            packet.targetOffset.copy(randomTargetOffset());
            packet.willImpact = randomWillImpact();
            packet.missOffset.copy(randomMissOffset());
            packet.phase = Math.random() * Math.PI * 2;
            packet.startOffset.set(
              (Math.random() - 0.5) * 10,
              (Math.random() - 0.5) * 10,
              (Math.random() - 0.5) * 10,
            );
          }
          const sourceCore =
            orbitalPortfolioCoresRef.current[
              THREE.MathUtils.clamp(
                packet.sourceCoreIndex,
                0,
                Math.max(0, orbitalPortfolioCoresRef.current.length - 1),
              )
            ];
          if (!sourceCore) return;
          sourceCore.root.getWorldPosition(matterFrom);
          if (packet.willImpact) {
            const targetStation =
              orbitalPortfolioStationsRef.current[packet.targetStation];
            if (!targetStation) return;
            matterTo.set(packet.targetOffset.x, packet.targetOffset.y, 0.2);
            targetStation.plate.localToWorld(matterTo);
            matterTarget.copy(matterTo);
          } else {
            matterTarget.copy(matterFrom).add(packet.missOffset);
          }
          matterPos
            .copy(matterFrom)
            .add(packet.startOffset)
            .lerp(matterTarget, packet.progress);
          const arc =
            Math.sin(packet.progress * Math.PI) * (8 + (idx % 5) * 1.4);
          matterPos.y += arc;
          const packetParent = packet.mesh.parent;
          if (packetParent) {
            packetParent.worldToLocal(packet.mesh.position.copy(matterPos));
          } else {
            packet.mesh.position.copy(matterPos);
          }
          const pmat = packet.mesh.material as THREE.SpriteMaterial;
          pmat.opacity =
            0.2 + (0.5 + 0.5 * Math.sin(now * 0.004 + packet.phase)) * 0.2;
        });
      }
      const hasFocusedCore =
        orbitalPortfolioHasActiveFocusRef.current &&
        !!orbitalPortfolioFocusedCoreIdRef.current;
      const focusCore = hasFocusedCore
        ? orbitalPortfolioCoresByIdRef.current.get(
            orbitalPortfolioFocusedCoreIdRef.current,
          )
        : null;
      const activeAnchor = (() => {
        if (focusCore) return focusCore.centerLocal.clone().add(anchor);
        const cores = orbitalPortfolioCoresRef.current;
        if (cores.length === 0) return anchor.clone();
        const center = new THREE.Vector3();
        cores.forEach((core) => {
          center.add(core.centerLocal);
        });
        center.multiplyScalar(1 / cores.length);
        return center.add(anchor);
      })();
      lookAt.copy(activeAnchor);
      const framingDistanceTarget = hasFocusedCore
        ? orbitalPortfolioCameraDistanceTargetRef.current
        : Math.max(orbitalPortfolioCameraDistanceTargetRef.current, 2.15);
      orbitalPortfolioCameraDistanceRef.current = THREE.MathUtils.damp(
        orbitalPortfolioCameraDistanceRef.current,
        framingDistanceTarget,
        8.5,
        dt,
      );
      const desiredCam = lookAt
        .clone()
        .add(
          new THREE.Vector3(420, 210, 620).multiplyScalar(
            orbitalPortfolioCameraDistanceRef.current,
          ),
        );
      const manualActive = orbitalPortfolioManualCameraLockRef.current;
      const controlsAny = controls as unknown as {
        getTarget?: (out: THREE.Vector3) => void;
      };
      const entrySeq = orbitalPortfolioEntrySequenceRef.current;
      if (!manualActive && entrySeq.active) {
        const t = THREE.MathUtils.clamp(
          (now - entrySeq.startedAt) / entrySeq.durationMs,
          0,
          1,
        );
        const cam = new THREE.Vector3();
        const target = new THREE.Vector3();
        if (t < 0.42) {
          const p = 1 - Math.pow(1 - t / 0.42, 2.3);
          cam.lerpVectors(entrySeq.startCam, entrySeq.revealCam, p);
          target.lerpVectors(entrySeq.startTarget, entrySeq.revealTarget, p);
        } else {
          const p = (t - 0.42) / 0.58;
          const smooth = p * p * (3 - 2 * p);
          cam.lerpVectors(entrySeq.revealCam, entrySeq.finalCam, smooth);
          target.lerpVectors(
            entrySeq.revealTarget,
            entrySeq.finalTarget,
            smooth,
          );
        }
        orbitalPortfolioCameraPosRef.current.copy(cam);
        orbitalPortfolioCameraTargetRef.current.copy(target);
        controls.setLookAt(
          cam.x,
          cam.y,
          cam.z,
          target.x,
          target.y,
          target.z,
          false,
        );
        if (t >= 1) {
          entrySeq.active = false;
          shipLog("[PORTENTRY] entrySequence:end", "info");
          if (ORBITAL_PORTFOLIO_DEBUG_LOGS) {
            const toneRuntime = orbitalPortfolioToneRuntimeRef.current;
            const toneGain =
              toneRuntime.masterGain &&
              Number.isFinite(toneRuntime.masterGain.gain.value)
                ? toneRuntime.masterGain.gain.value.toFixed(3)
                : "n/a";
            shipLog(
              `[LATTICE-TONE] post-entry enabled=${toneRuntime.enabled ? 1 : 0} nextIn=${Math.max(0, toneRuntime.nextEventAtMs - now).toFixed(0)}ms ctx=${toneRuntime.context?.state ?? "null"} gain=${toneGain}`,
              "info",
            );
          }
          // Suppress touchpad wheel/pointer residue right after arrival.
          orbitalPortfolioIgnoreManualUntilRef.current = now + 900;
          const pendingInspect =
            orbitalPortfolioPendingInspectRequestRef.current;
          if (pendingInspect) {
            orbitalPortfolioPendingInspectRequestRef.current = null;
            requestAnimationFrame(() => {
              focusOrbitalPortfolioStation(
                pendingInspect.stationIndex,
                pendingInspect.mediaIndex,
                pendingInspect.options,
              );
            });
          }
        }
        if (camera) {
          camera.getWorldPosition(camPos);
        }
        return;
      }
      if (manualActive) {
        camera.getWorldPosition(orbitalPortfolioCameraPosRef.current);
        if (controlsAny.getTarget) {
          controlsAny.getTarget(orbitalPortfolioCameraTargetRef.current);
        } else {
          orbitalPortfolioCameraTargetRef.current.copy(lookAt);
        }
      } else {
        if (!orbitalPortfolioCameraInitializedRef.current) {
          camera.getWorldPosition(orbitalPortfolioCameraPosRef.current);
          if (controlsAny.getTarget) {
            controlsAny.getTarget(orbitalPortfolioCameraTargetRef.current);
          } else {
            orbitalPortfolioCameraTargetRef.current.copy(lookAt);
          }
          orbitalPortfolioCameraInitializedRef.current = true;
        }
        const smooth = 1 - Math.exp(-dt * 4.2);
        orbitalPortfolioCameraPosRef.current.lerp(desiredCam, smooth);
        const desiredTarget = activeAnchor
          .clone()
          .add(new THREE.Vector3(0, 14, 0));
        orbitalPortfolioCameraTargetRef.current.lerp(desiredTarget, smooth);
        controls.setLookAt(
          orbitalPortfolioCameraPosRef.current.x,
          orbitalPortfolioCameraPosRef.current.y,
          orbitalPortfolioCameraPosRef.current.z,
          orbitalPortfolioCameraTargetRef.current.x,
          orbitalPortfolioCameraTargetRef.current.y,
          orbitalPortfolioCameraTargetRef.current.z,
          false,
        );
      }
      if (camera) {
        camera.getWorldPosition(camPos);
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [
    ensureOrbitalPortfolioToneAudioNode,
    playOrbitalPortfolioTone,
    resumeOrbitalPortfolioToneAudioContext,
    orbitalPortfolioActive,
    orbitalPortfolioMediaIndex,
    orbitalPortfolioVariantIndex,
    exitOrbitalPortfolioInspectMode,
    focusOrbitalPortfolioStation,
    shipLog,
  ]);

  // Ambient animation loop: runs when portfolio is built but NOT actively
  // entered, so cores pulse and stations revolve visibly from a distance.
  useEffect(() => {
    if (orbitalPortfolioActive || !orbitalPortfolioReady) return;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;
      orbitalPortfolioCoresRef.current.forEach((core, coreIndex) => {
        const glowMat = core.glow.material as THREE.MeshBasicMaterial;
        glowMat.opacity =
          0.2 + (0.5 + 0.5 * Math.sin(now * 0.0018 + coreIndex)) * 0.2;
        core.nucleus.scale.setScalar(1);
        core.root.rotation.y += dt * 0.03;
        core.root.rotation.x = Math.sin(now * 0.00037 + coreIndex * 0.4) * 0.08;
        core.sliceGroup.rotation.y -= dt * 0.24;
        core.sliceGroup.rotation.z += dt * 0.11;
        core.sliceMats.forEach((mat, idx) => {
          const pulse =
            0.5 + 0.5 * Math.sin(now * 0.0021 + idx * 0.9 + coreIndex);
          mat.opacity = 0.2 + pulse * 0.28;
        });
        core.rayMats.forEach((mat, idx) => {
          const pulse =
            0.5 + 0.5 * Math.sin(now * 0.0017 + idx * 0.63 + coreIndex);
          mat.opacity = 0.12 + pulse * 0.2;
        });
        if (core.panelMat) {
          core.panelMat.opacity =
            0.12 + (0.5 + 0.5 * Math.sin(now * 0.0016)) * 0.02;
        }
        if (core.panelColorAttr && core.panelBaseColors) {
          const arr = core.panelColorAttr.array as Float32Array;
          const lum =
            0.86 + (0.5 + 0.5 * Math.sin(now * 0.0012 + coreIndex)) * 0.06;
          for (let i = 0; i < arr.length; i += 3) {
            const pulse =
              0.98 + 0.02 * Math.sin(now * 0.0019 + i * 0.0013 + coreIndex);
            arr[i] = core.panelBaseColors[i] * lum * pulse;
            arr[i + 1] = core.panelBaseColors[i + 1] * lum * pulse;
            arr[i + 2] = core.panelBaseColors[i + 2] * lum * pulse;
          }
          core.panelColorAttr.needsUpdate = true;
        }
      });
      orbitalPortfolioStationsRef.current.forEach((station) => {
        if (station.orbitMotionBlend < 1) {
          station.orbitMotionBlend = THREE.MathUtils.damp(
            station.orbitMotionBlend,
            1,
            5.5,
            dt,
          );
        }
        station.orbitAngle +=
          ORBITAL_PORTFOLIO_STATION_ORBIT_SPEED *
          dt *
          station.orbitDirection *
          station.orbitMotionBlend;
        const plainQuat = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          THREE.MathUtils.degToRad(station.plainAngle),
        );
        const localOrbit = new THREE.Vector3(
          Math.cos(station.orbitAngle) * station.orbitRadius,
          0,
          Math.sin(station.orbitAngle) * station.orbitRadius,
        ).applyQuaternion(plainQuat);
        station.group.position.copy(station.coreAnchorLocal).add(localOrbit);
      });
      if (orbitalPortfolioMatterGroupRef.current) {
        orbitalPortfolioMatterGroupRef.current.rotation.y += dt * 0.02;
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [orbitalPortfolioActive, orbitalPortfolioReady]);

  useEffect(() => {
    if (!orbitalPortfolioActive) return;
    const stations = orbitalPortfolioStationsRef.current;
    const groups = orbitalPortfolioGroupsRef.current;
    if (stations.length === 0 || groups.length === 0) return;
    const focusIndex = THREE.MathUtils.clamp(
      orbitalPortfolioFocusIndexRef.current,
      0,
      stations.length - 1,
    );
    const station = stations[focusIndex];
    if (!station) return;
    const group = groups[focusIndex];
    const variantIndex = THREE.MathUtils.clamp(
      orbitalPortfolioVariantIndex,
      0,
      Math.max(0, (group?.variants?.length ?? 1) - 1),
    );
    const variant = group?.variants?.[variantIndex];
    const mediaItems = variant?.mediaItems ?? [];
    const mediaIndex = THREE.MathUtils.clamp(
      orbitalPortfolioMediaIndex,
      0,
      Math.max(0, mediaItems.length - 1),
    );
    const maxThumbPageStart = Math.max(
      0,
      mediaItems.length - ORBITAL_PORTFOLIO_CARD_MAX_THUMBS,
    );
    let thumbPageStart = THREE.MathUtils.clamp(
      orbitalPortfolioThumbPageStartRef.current,
      0,
      maxThumbPageStart,
    );
    const media = mediaItems[mediaIndex];
    const prevViewed = orbitalPortfolioLastViewedRef.current;
    const sameFocusedStation = prevViewed.focusIndex === focusIndex;
    const contentChangedOnFocusedStation =
      sameFocusedStation &&
      (prevViewed.variantIndex !== variantIndex ||
        prevViewed.mediaIndex !== mediaIndex);
    const shouldAutoAlignThumbPage =
      !sameFocusedStation || contentChangedOnFocusedStation;
    if (
      shouldAutoAlignThumbPage &&
      mediaItems.length > ORBITAL_PORTFOLIO_CARD_MAX_THUMBS &&
      (mediaIndex < thumbPageStart ||
        mediaIndex >= thumbPageStart + ORBITAL_PORTFOLIO_CARD_MAX_THUMBS)
    ) {
      thumbPageStart =
        Math.floor(mediaIndex / ORBITAL_PORTFOLIO_CARD_MAX_THUMBS) *
        ORBITAL_PORTFOLIO_CARD_MAX_THUMBS;
      thumbPageStart = THREE.MathUtils.clamp(
        thumbPageStart,
        0,
        maxThumbPageStart,
      );
    }
    if (thumbPageStart !== orbitalPortfolioThumbPageStartRef.current) {
      setOrbitalPortfolioThumbPageStart(thumbPageStart);
    }
    const thumbPageChanged =
      thumbPageStart !== orbitalPortfolioPrevThumbPageStartRef.current;
    const thumbSlideDirection = orbitalPortfolioThumbSlideDirectionRef.current;
    if (thumbPageChanged && thumbSlideDirection) {
      const slideFromX = thumbSlideDirection === "next" ? 7.6 : -7.6;
      const slideDurationMs = 230;
      const slideStartAt = performance.now();
      station.cardThumbMeshes.forEach((thumb) => {
        thumb.mesh.userData.orbitalThumbSlideFromX = slideFromX;
        thumb.frame.userData.orbitalThumbSlideFromX = slideFromX;
        thumb.mesh.userData.orbitalThumbSlideStartAt = slideStartAt;
        thumb.frame.userData.orbitalThumbSlideStartAt = slideStartAt;
        thumb.mesh.userData.orbitalThumbSlideDurationMs = slideDurationMs;
        thumb.frame.userData.orbitalThumbSlideDurationMs = slideDurationMs;
      });
    }
    if (thumbPageChanged) {
      orbitalPortfolioPrevThumbPageStartRef.current = thumbPageStart;
      orbitalPortfolioThumbSlideDirectionRef.current = null;
    }
    orbitalPortfolioLastViewedRef.current = {
      focusIndex,
      variantIndex,
      mediaIndex,
    };
    if (
      contentChangedOnFocusedStation &&
      orbitalPortfolioInspectedStationIndexRef.current === focusIndex
    ) {
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      if (controls && camera) {
        const plateWorld = new THREE.Vector3();
        station.plate.getWorldPosition(plateWorld);
        const plateQuat = new THREE.Quaternion();
        station.plate.getWorldQuaternion(plateQuat);
        const normal = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(plateQuat)
          .normalize();
        const savedDistance = orbitalPortfolioInspectDistanceRef.current;
        const inspectDistance =
          typeof savedDistance === "number" &&
          savedDistance >= ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE &&
          savedDistance <= ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE
            ? savedDistance
            : ORBITAL_PORTFOLIO_INSPECT_DEFAULT_DISTANCE;
        const camPos = plateWorld
          .clone()
          .addScaledVector(normal, inspectDistance);
        const lookTarget = plateWorld.clone();
        controls.setLookAt(
          camPos.x,
          camPos.y,
          camPos.z,
          lookTarget.x,
          lookTarget.y,
          lookTarget.z,
          true,
        );
      }
    }

    const assignGeneratedTextTexture = (
      mat: THREE.MeshBasicMaterial,
      texture: THREE.Texture | null,
    ) => {
      const prev = mat.map as THREE.Texture | null;
      if (prev?.userData?.orbitalGeneratedTextTexture) {
        prev.dispose();
      }
      if (texture) {
        texture.userData.orbitalGeneratedTextTexture = true;
      }
      mat.map = texture;
      mat.needsUpdate = true;
    };

    const titleMat = station.cardTitleMesh.material as THREE.MeshBasicMaterial;
    const titleKey = group?.id ?? "portfolio";
    if (station.cardTitleMesh.userData.orbitalTitleKey !== titleKey) {
      station.cardTitleMesh.userData.orbitalTitleKey = titleKey;
      const titleTexture = createDetailTexture([group?.title ?? "Portfolio"], {
        width: 1024,
        height: 128,
        bgColor: "rgba(0,0,0,0)",
        showLine: false,
        textColor: "rgba(234,246,255,0.98)",
        fontSize: 42,
        lineSpacing: 44,
        textAlign: "center",
        padding: 512,
        centerBlock: true,
        fontFamily: "Rajdhani, sans-serif",
        fontWeight: 700,
        crispUI: true,
      });
      assignGeneratedTextTexture(titleMat, titleTexture);
    }

    const variantsForStation = group?.variants ?? [];
    // More client sites than tab slots page one tab row at a time, and the
    // page always contains the active client site.
    const maxTabPageStart = Math.max(
      0,
      variantsForStation.length - ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS,
    );
    let tabPageStart = THREE.MathUtils.clamp(
      station.variantTabPageStart,
      0,
      maxTabPageStart,
    );
    if (
      variantIndex < tabPageStart ||
      variantIndex >= tabPageStart + ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS
    ) {
      tabPageStart = THREE.MathUtils.clamp(
        Math.floor(variantIndex / ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS) * ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS,
        0,
        maxTabPageStart,
      );
    }
    station.variantTabPageStart = tabPageStart;
    const showTabNav = variantsForStation.length > ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS;
    station.cardVariantTabNavMeshes.forEach((nav) => {
      const navMat = nav.mesh.material as THREE.MeshBasicMaterial;
      const navFrameMat = nav.frame.material as THREE.MeshBasicMaterial;
      const canMove =
        nav.direction === "prev"
          ? tabPageStart > 0
          : tabPageStart + ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS < variantsForStation.length;
      nav.mesh.visible = showTabNav;
      nav.frame.visible = showTabNav;
      nav.mesh.userData.orbitalStationIndex = focusIndex;
      nav.mesh.userData.orbitalPickKind = "tab-nav";
      nav.mesh.userData.orbitalTabNavDirection = nav.direction;
      nav.mesh.userData.orbitalShowNav = showTabNav;
      nav.mesh.userData.orbitalNavCanMove = canMove;
      navMat.opacity = canMove ? 0.94 : 0.34;
      navMat.color.setHex(canMove ? 0xe8f7ff : 0x80a4c3);
      navFrameMat.opacity = canMove ? 0.84 : 0.24;
      navFrameMat.color.setHex(canMove ? 0xa8deff : 0x587a96);
    });
    station.cardVariantTabs.forEach((tab) => {
      const tabMat = tab.mesh.material as THREE.MeshBasicMaterial;
      const mappedVariantIndex = tabPageStart + tab.variantIndex;
      const variantAtTab = variantsForStation[mappedVariantIndex];
      tab.mesh.userData.hasVariant = Boolean(variantAtTab);
      if (!variantAtTab) {
        assignGeneratedTextTexture(tabMat, null);
        tab.mesh.visible = false;
        tab.frame.visible = false;
        return;
      }
      if (tab.mesh.userData.orbitalVariantKey !== variantAtTab.id) {
        tab.mesh.userData.orbitalVariantKey = variantAtTab.id;
        const tabTexture = createDetailTexture([variantAtTab.title], {
          width: 420,
          height: 120,
          bgColor: "rgba(0,0,0,0)",
          showLine: false,
          textColor: "rgba(223,242,255,0.98)",
          fontSize: 28,
          lineSpacing: 30,
          textAlign: "center",
          padding: 210,
          centerBlock: true,
          fontFamily: "Rajdhani, sans-serif",
          fontWeight: 700,
          crispUI: true,
        });
        assignGeneratedTextTexture(tabMat, tabTexture);
      }
      tab.mesh.visible = true;
      tab.frame.visible = true;
      tab.mesh.userData.orbitalStationIndex = focusIndex;
      tab.mesh.userData.orbitalPickKind = "variant";
      tab.mesh.userData.orbitalVariantIndex = mappedVariantIndex;
    });

    const thumbLoader = new THREE.TextureLoader();
    const hideSingleThumbNoVariant =
      (group?.clientVariantCount ?? 0) === 0 && mediaItems.length <= 1;
    station.cardThumbMeshes.forEach((thumb) => {
      const thumbMat = thumb.mesh.material as THREE.MeshBasicMaterial;
      const mappedMediaIndex = thumbPageStart + thumb.mediaIndex;
      const mediaAtThumb = mediaItems[mappedMediaIndex];
      thumb.mesh.userData.orbitalShowThumb = !hideSingleThumbNoVariant;
      thumb.mesh.userData.hasMedia = Boolean(mediaAtThumb);
      thumb.mesh.userData.orbitalStationIndex = focusIndex;
      thumb.mesh.userData.orbitalPickKind = "thumb";
      thumb.mesh.userData.orbitalMediaIndex = mappedMediaIndex;
      if (!mediaAtThumb?.textureUrl) {
        thumb.mesh.visible = false;
        thumb.frame.visible = false;
        thumbMat.map = null;
        thumbMat.needsUpdate = true;
        return;
      }
      thumb.mesh.visible = !hideSingleThumbNoVariant;
      thumb.frame.visible = !hideSingleThumbNoVariant;
      const prevUrl = thumb.mesh.userData.orbitalThumbTextureUrl as
        | string
        | undefined;
      if (prevUrl === mediaAtThumb.textureUrl && thumbMat.map) return;
      thumb.mesh.userData.orbitalThumbTextureUrl = mediaAtThumb.textureUrl;
      thumbLoader.load(
        mediaAtThumb.textureUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = 8;
          thumbMat.map = tex;
          applyTextureForFitMode(tex, 7.7 / 4.7, mediaAtThumb.fit);
          thumbMat.needsUpdate = true;
        },
        undefined,
        () => undefined,
      );
    });
    const showThumbNav =
      !hideSingleThumbNoVariant &&
      mediaItems.length > ORBITAL_PORTFOLIO_CARD_MAX_THUMBS;
    station.cardThumbNavMeshes.forEach((nav) => {
      const navMat = nav.mesh.material as THREE.MeshBasicMaterial;
      const navFrameMat = nav.frame.material as THREE.MeshBasicMaterial;
      const canMove =
        nav.direction === "prev"
          ? thumbPageStart > 0
          : thumbPageStart + ORBITAL_PORTFOLIO_CARD_MAX_THUMBS <
            mediaItems.length;
      nav.mesh.visible = showThumbNav;
      nav.frame.visible = showThumbNav;
      nav.mesh.userData.orbitalStationIndex = focusIndex;
      nav.mesh.userData.orbitalPickKind = "thumb-nav";
      nav.mesh.userData.orbitalThumbNavDirection = nav.direction;
      nav.mesh.userData.orbitalShowNav = showThumbNav;
      nav.mesh.userData.orbitalNavCanMove = canMove;
      navMat.opacity = canMove ? 0.94 : 0.34;
      navMat.color.setHex(canMove ? 0xe8f7ff : 0x80a4c3);
      navFrameMat.opacity = canMove ? 0.84 : 0.24;
      navFrameMat.color.setHex(canMove ? 0xa8deff : 0x587a96);
    });
    const showSlideNav = false;
    station.cardSlideNavMeshes.forEach((nav) => {
      nav.mesh.visible = showSlideNav;
      nav.frame.visible = showSlideNav;
      nav.mesh.userData.orbitalStationIndex = focusIndex;
      nav.mesh.userData.orbitalPickKind = "slide-nav";
      nav.mesh.userData.orbitalSlideNavDirection = nav.direction;
      nav.mesh.userData.orbitalSlideCanMove = showSlideNav;
    });

    if (!media?.textureUrl) return;
    station.textureScrollNorm = 0;
    station.textureMaxOffsetY = 0;
    station.textureFitMode = media.fit ?? "cover";
    station.plate.userData.textureScrollNorm = 0;
    station.plate.userData.textureMaxOffsetY = 0;
    station.plate.userData.textureFitMode = station.textureFitMode;
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      media.textureUrl,
      (tex) => {
        if (cancelled) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        const plateMat = station.plate.material as THREE.MeshBasicMaterial;
        plateMat.map = tex;
        const maxOffsetY = applyTextureForFitMode(
          tex,
          72 / 42,
          station.textureFitMode,
          0,
        );
        station.textureMaxOffsetY = maxOffsetY;
        station.plate.userData.textureMaxOffsetY = maxOffsetY;
        station.plate.userData.hasLoadedTexture = true;
        plateMat.needsUpdate = true;
      },
      undefined,
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [
    orbitalPortfolioActive,
    orbitalPortfolioFocusIndex,
    orbitalPortfolioMediaIndex,
    orbitalPortfolioThumbPageStart,
    orbitalPortfolioVariantIndex,
  ]);

  useEffect(() => {
    if (!orbitalPortfolioActive) return;
    const noteManualIntent = () => {
      const now = performance.now();
      if (now < orbitalPortfolioIgnoreManualUntilRef.current) return;
      if (orbitalPortfolioEntrySequenceRef.current.active) return;
      setOrbitalPortfolioManualLock(true, "pointer-or-wheel");
    };
    const onPointerDown = () => noteManualIntent();
    const onWheel = (event: WheelEvent) => {
      noteManualIntent();
      if (!event.shiftKey) {
        if (orbitalPortfolioInspectedStationIndexRef.current !== null) {
          requestAnimationFrame(() => {
            const controls = sceneRef.current.controls;
            const camera = sceneRef.current.camera;
            if (!controls || !camera) return;
            const controlsAny = controls as unknown as {
              getTarget?: (out: THREE.Vector3) => void;
            };
            if (!controlsAny.getTarget) return;
            const target = new THREE.Vector3();
            controlsAny.getTarget(target);
            const raw = camera.position.distanceTo(target);
            if (
              raw >= ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE &&
              raw <= ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE
            ) {
              orbitalPortfolioInspectDistanceRef.current = raw;
            } else if (
              raw < ORBITAL_PORTFOLIO_INSPECT_EXIT_MIN_DISTANCE ||
              raw > ORBITAL_PORTFOLIO_INSPECT_EXIT_MAX_DISTANCE
            ) {
              exitOrbitalPortfolioInspectMode({
                resumeOrbits: true,
                keepManualControl: true,
                reason:
                  "Portfolio inspect exited (zoom limit reached) — resuming orbit motion",
              });
            }
          });
        }
        return;
      }
      const inspectedIndex = orbitalPortfolioInspectedStationIndexRef.current;
      if (inspectedIndex === null) return;
      const station = orbitalPortfolioStationsRef.current[inspectedIndex];
      if (!station) return;
      const plateMat = station.plate.material as
        | THREE.MeshBasicMaterial
        | undefined;
      const texture = plateMat?.map;
      if (!texture) return;
      const maxOffsetY = Math.max(
        0,
        Number(
          station.plate.userData.textureMaxOffsetY ??
            station.textureMaxOffsetY ??
            0,
        ),
      );
      if (maxOffsetY <= 0.0001) return;
      const prevNorm = THREE.MathUtils.clamp(
        Number(
          station.plate.userData.textureScrollNorm ??
            station.textureScrollNorm ??
            0,
        ),
        0,
        1,
      );
      const nextNorm = THREE.MathUtils.clamp(
        prevNorm + event.deltaY * 0.0011,
        0,
        1,
      );
      if (Math.abs(nextNorm - prevNorm) < 1e-4) return;
      station.textureScrollNorm = nextNorm;
      station.plate.userData.textureScrollNorm = nextNorm;
      const activeFitMode =
        (station.plate.userData.textureFitMode as
          | "contain"
          | "cover"
          | undefined) ?? station.textureFitMode;
      applyTextureForFitMode(texture, 72 / 42, activeFitMode, nextNorm);
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [
    orbitalPortfolioActive,
    exitOrbitalPortfolioInspectMode,
    setOrbitalPortfolioManualLock,
  ]);

  // Orbit horizon signage: readable glowing text that rides moon rotation.
  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    let last = performance.now();
    const moonCenter = new THREE.Vector3();
    const camToMoon = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const camForward = new THREE.Vector3();
    const camRight = new THREE.Vector3();
    const camUp = new THREE.Vector3();
    const moonCenterNdc = new THREE.Vector3();
    const moonTopNdc = new THREE.Vector3();
    const moonBottomNdc = new THREE.Vector3();
    const ndcPick = new THREE.Vector3();
    const rayNear = new THREE.Vector3();
    const rayFar = new THREE.Vector3();
    const rayDir = new THREE.Vector3();
    const rayToCenter = new THREE.Vector3();
    const camRightProbeNdc = new THREE.Vector3();
    const candidatePos = new THREE.Vector3();
    const candidateNdc = new THREE.Vector3();
    const activeSignNdc = new THREE.Vector3();
    const bestPos = new THREE.Vector3();
    const surfaceNormal = new THREE.Vector3();
    const arcMid = new THREE.Vector3();
    const signFromCamera = new THREE.Vector3();
    const cameraForwardTick = new THREE.Vector3();
    let spawnedSinceLastLog = 0;
    const detachAndClearSigns = () => {
      const records = moonTravelSignsRef.current;
      records.forEach((record) => {
        record.material.dispose();
        const parent = record.object.parent;
        if (parent) parent.remove(record.object);
      });
      moonTravelSignsRef.current = [];
    };
    const ensureSignGroup = () => {
      let group = moonTravelSignGroupRef.current;
      if (!group) {
        group = new THREE.Group();
        group.name = "MoonOrbitSigns";
        moonTravelSignGroupRef.current = group;
        sceneRef.current.scene?.add(group);
      }
      return group;
    };
    const nextPathSlot = () => {
      const state = moonTravelSignPathCycleRef.current;
      if (state.order.length !== 5 || state.index >= state.order.length) {
        // "Sprinkler" pattern: each 5-message cycle stays spaced apart,
        // but cycle orientation/order is randomized to avoid repetitive feel.
        const baseA = [0, 2, 4, 1, 3];
        const baseB = [4, 2, 0, 3, 1];
        const base = Math.random() < 0.5 ? baseA : baseB;
        const reversed = Math.random() < 0.5 ? [...base].reverse() : [...base];
        const rotateBy = Math.floor(Math.random() * reversed.length);
        const rotated = reversed.map(
          (_, idx) => reversed[(idx + rotateBy) % reversed.length] ?? 0,
        );
        // If first choice lands too close to previous lane, rotate once more.
        const first = rotated[0] ?? 0;
        if (state.lastSlot >= 0 && Math.abs(first - state.lastSlot) <= 1) {
          const adjusted = rotated.map(
            (_, idx) => rotated[(idx + 1) % rotated.length] ?? 0,
          );
          state.order = adjusted;
        } else {
          state.order = rotated;
        }
        state.index = 0;
      }
      const slot = state.order[state.index] ?? 2;
      state.index += 1;
      state.lastSlot = slot;
      return slot;
    };
    const spawnSign = (
      companyId: string,
      moonMesh: THREE.Mesh,
      moonRadius: number,
      options?: { forcedMemory?: JobMemoryEntry; forcedIndex?: number },
    ): MoonTravelSignRecord | null => {
      const record = moonTravelSignCatalog.get(companyId);
      if (!record) return null;
      const memorySelection =
        options?.forcedMemory && typeof options.forcedIndex === "number"
          ? {
              item: options.forcedMemory,
              index: THREE.MathUtils.clamp(
                Math.floor(options.forcedIndex),
                0,
                Math.max(0, record.pool.length - 1),
              ),
            }
          : buildMoonTravelSignText(companyId);
      if (!memorySelection) return null;
      const memory = memorySelection.item;
      const memoryIndex = memorySelection.index;
      const text = memory.text;
      const group = ensureSignGroup();
      if (!group) return null;
      const textureKey = `${memory.type}::${text}`;
      const textureCache = moonTravelSignTextureCacheRef.current;
      let tex = textureCache.get(textureKey) ?? null;
      if (tex) {
        // Most recently used goes last (Map keeps insertion order).
        textureCache.delete(textureKey);
        textureCache.set(textureKey, tex);
      } else {
        tex = createMoonTravelSignTexture(memory);
        textureCache.set(textureKey, tex);
        // Cap the cache as memories are added: free the oldest textures that
        // no memory on screen is using.
        if (textureCache.size > MOON_TRAVEL_SIGN_TEXTURE_CACHE_MAX) {
          const inUse = new Set(
            moonTravelSignsRef.current.map(
              (sign) => (sign.material as THREE.SpriteMaterial).map,
            ),
          );
          for (const [key, cached] of textureCache) {
            if (textureCache.size <= MOON_TRAVEL_SIGN_TEXTURE_CACHE_MAX) break;
            if (cached === tex || inUse.has(cached)) continue;
            cached.dispose();
            textureCache.delete(key);
          }
        }
      }
      const w = THREE.MathUtils.clamp(20 + text.length * 0.48, 20, 48);
      const baseScale = new THREE.Vector3(w, 6.2, 1);
      moonMesh.getWorldPosition(moonCenter);
      const cam = sceneRef.current.camera;
      if (!cam) return null;
      cam.getWorldDirection(camForward).normalize();
      camRight.crossVectors(camForward, up);
      if (camRight.lengthSq() < 1e-5) camRight.set(1, 0, 0);
      camRight.normalize();
      camUp.crossVectors(camRight, camForward).normalize();
      camToMoon.subVectors(cam.position, moonCenter).normalize();
      tangent.crossVectors(camUp, camToMoon);
      if (tangent.lengthSq() < 1e-5) tangent.set(1, 0, 0);
      tangent.normalize();
      const lanePattern = [-1, -0.5, 0, 0.5, 1] as const;
      const slot = nextPathSlot();
      const laneKey = lanePattern[slot] ?? 0;
      moonTravelSignLaneCursorRef.current += 1;
      moonCenterNdc.copy(moonCenter).project(cam);
      camRightProbeNdc.copy(moonCenter).add(camRight).project(cam);
      // Normalize lane direction to actual screen left/right.
      const screenRightSign = camRightProbeNdc.x >= moonCenterNdc.x ? 1 : -1;
      const laneScreen = laneKey * screenRightSign;
      // Camera-aware spawn: keep signs on visible upper/front moon area.
      const horizonDistance = moonRadius * (1.01 + Math.random() * 0.06);
      moonTopNdc
        .copy(moonCenter)
        .addScaledVector(camUp, moonRadius)
        .project(cam);
      moonBottomNdc
        .copy(moonCenter)
        .addScaledVector(camUp, -moonRadius)
        .project(cam);
      const moonNdcRadiusY = Math.max(
        0.02,
        Math.abs(moonTopNdc.y - moonBottomNdc.y) * 0.5,
      );
      const moonNdcRadiusX = Math.max(0.02, moonNdcRadiusY * 0.95);
      let bestScore = -Infinity;
      for (let attempt = 0; attempt < 14; attempt += 1) {
        // Pick a point on the projected, visible upper/front part of the moon disk.
        const pickX =
          moonCenterNdc.x +
          laneScreen * moonNdcRadiusX * 1.12 +
          (Math.random() - 0.5) * moonNdcRadiusX * 0.24;
        const pickY =
          moonCenterNdc.y + moonNdcRadiusY * (0.21 + Math.random() * 0.66);
        ndcPick.set(
          THREE.MathUtils.clamp(pickX, -0.86, 0.86),
          THREE.MathUtils.clamp(pickY, -0.72, 0.9),
          0,
        );
        rayNear.set(ndcPick.x, ndcPick.y, -1).unproject(cam);
        rayFar.set(ndcPick.x, ndcPick.y, 1).unproject(cam);
        rayDir.subVectors(rayFar, rayNear).normalize();
        // Ray/sphere intersection against the slightly expanded moon shell.
        rayToCenter.subVectors(cam.position, moonCenter);
        const b = rayToCenter.dot(rayDir);
        const c = rayToCenter.lengthSq() - horizonDistance * horizonDistance;
        const disc = b * b - c;
        if (disc > 0) {
          const s = Math.sqrt(disc);
          let tHit = -b - s;
          if (tHit <= 0) tHit = -b + s;
          if (tHit > 0) {
            candidatePos.copy(cam.position).addScaledVector(rayDir, tHit);
          } else {
            candidatePos
              .copy(moonCenter)
              .addScaledVector(camToMoon, horizonDistance)
              .addScaledVector(
                tangent,
                (Math.random() - 0.5) * moonRadius * 0.12,
              )
              .addScaledVector(
                camUp,
                moonRadius * (0.16 + Math.random() * 0.24),
              );
          }
        } else {
          candidatePos
            .copy(moonCenter)
            .addScaledVector(camToMoon, horizonDistance)
            .addScaledVector(tangent, (Math.random() - 0.5) * moonRadius * 0.12)
            .addScaledVector(camUp, moonRadius * (0.16 + Math.random() * 0.24));
        }
        candidateNdc.copy(candidatePos).project(cam);
        surfaceNormal.subVectors(candidatePos, moonCenter).normalize();
        const facing = surfaceNormal.dot(camToMoon);
        const visible =
          candidateNdc.z > -1 &&
          candidateNdc.z < 1 &&
          candidateNdc.x > -0.9 &&
          candidateNdc.x < 0.9 &&
          candidateNdc.y > moonCenterNdc.y + moonNdcRadiusY * 0.08 &&
          candidateNdc.y < moonCenterNdc.y + moonNdcRadiusY * 1.1 &&
          facing > 0.12;
        const score =
          (visible ? 120 : 0) +
          candidateNdc.y * 14 -
          Math.abs(candidateNdc.x - moonCenterNdc.x) * 6 +
          facing * 8;
        if (score > bestScore) {
          bestScore = score;
          bestPos.copy(candidatePos);
        }
        if (visible) break;
      }
      const worldPos = bestPos.clone();
      let signObject: THREE.Object3D;
      let signMaterial: THREE.Material;
      const tuning = orbitSignTuningRef.current;
      const lightMul = THREE.MathUtils.clamp(tuning.lightIntensity, 0, 3);
      let arcStart: THREE.Vector3 | undefined;
      let arcControl: THREE.Vector3 | undefined;
      let arcEnd: THREE.Vector3 | undefined;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.58 * lightMul,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      // Start tiny near horizon; it grows as it approaches viewer.
      sprite.scale.copy(baseScale).multiplyScalar(0.2 + Math.random() * 0.08);
      sprite.renderOrder = 900;
      signObject = sprite;
      signMaterial = mat;
      signObject.position.set(worldPos.x, worldPos.y, worldPos.z);
      signObject.userData.orbitSign = true;
      group.add(signObject);
      arcStart = worldPos.clone();
      arcEnd = cam.position
        .clone()
        .addScaledVector(camForward, -24 - Math.random() * 12)
        .addScaledVector(camUp, 4 + Math.random() * 8);
      arcMid
        .copy(arcStart)
        .lerp(cam.position, 0.52)
        .addScaledVector(camUp, 10 + Math.random() * 6)
        .addScaledVector(camRight, laneScreen * (8 + Math.random() * 4.5));
      arcControl = arcMid.clone();
      const drift = new THREE.Vector3(0, 0, 0);
      const signRecord: MoonTravelSignRecord = {
        object: signObject,
        material: signMaterial,
        ageMs: 0,
        ttlMs: 9000 + Math.random() * 2400,
        memoryIndex,
        velocity: drift,
        baseScale,
        arcStart,
        arcControl,
        arcEnd,
      };
      moonTravelSignsRef.current.push(signRecord);
      spawnedSinceLastLog += 1;
      if (MOON_ORBIT_SIGN_DEBUG_LOGS) {
        const p = signObject.position;
        shipLog(
          `[ORBSIGN] spawn "${text.slice(0, 42)}${text.length > 42 ? "..." : ""}" @ [${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}]`,
          "info",
        );
      }
      return signRecord;
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;
      const camTick = sceneRef.current.camera;
      const viewerWantsMemories = viewerMemoriesEnabledRef.current;
      const memoryManualMode = moonMemoryManualModeRef.current;
      const memoryPlaybackPlaying = moonMemoryPlaybackPlayingRef.current;
      const moonMesh = focusedMoonRef.current;
      const isOrbitSignageActive =
        orbitPhase === "orbiting" &&
        !!moonMesh &&
        !orbitalPortfolioActiveRef.current &&
        !skillsLatticeActiveRef.current &&
        !aboutMemorySquareActiveRef.current;
      if (
        MOON_ORBIT_SIGN_DEBUG_LOGS &&
        now - moonOrbitSignDebugLastLogAtRef.current > 2600
      ) {
        moonOrbitSignDebugLastLogAtRef.current = now;
        const moonIdDbg = moonMesh
          ? String((moonMesh.userData as { moonId?: unknown }).moonId ?? "n/a")
          : "none";
        shipLog(
          `[ORBSIGN] phase=${orbitPhase} active=${isOrbitSignageActive ? 1 : 0} moon=${moonIdDbg} signs=${moonTravelSignsRef.current.length} spawned=${spawnedSinceLastLog}`,
          "info",
        );
        spawnedSinceLastLog = 0;
      }
      if (isOrbitSignageActive && !viewerWantsMemories) {
        const records = moonTravelSignsRef.current;
        const survivors: MoonTravelSignRecord[] = [];
        records.forEach((record) => {
          const mat = record.material as THREE.Material & { opacity?: number };
          if (typeof mat.opacity === "number") {
            mat.opacity *= 0.72;
          }
          record.ageMs += dt * 1000 * 2.2;
          if (
            (typeof mat.opacity === "number" && mat.opacity <= 0.025) ||
            record.ageMs >= record.ttlMs
          ) {
            const parent = record.object.parent;
            if (parent) parent.remove(record.object);
            record.material.dispose();
          } else {
            survivors.push(record);
          }
        });
        moonTravelSignsRef.current = survivors;
        return;
      }
      if (!isOrbitSignageActive || !moonMesh) {
        if (moonTravelSignActiveCompanyRef.current) {
          moonTravelSignActiveCompanyRef.current = null;
          moonTravelSignPoolRef.current = [];
          moonTravelSignPoolCursorRef.current = 0;
          moonTravelSignSequenceWrappedRef.current = false;
          moonTravelSignLoopHaltedRef.current = false;
          moonTravelSignLaneCursorRef.current = 0;
          moonTravelSignPathCycleRef.current = {
            order: [0, 2, 4, 1, 3],
            index: 0,
            lastSlot: -1,
          };
          moonMemoryManualModeRef.current = false;
          moonMemoryPlaybackPlayingRef.current = false;
          moonMemoryScrubRequestRef.current = null;
          moonMemoryScrubValueRef.current = 0;
          setMoonMemoryManualMode(false);
          setMoonMemoryPlaybackPlaying(false);
          setMoonMemoryScrubValue(0);
          moonTravelSignPauseUntilRef.current = 0;
          detachAndClearSigns();
        }
        // Leaving the planet: never leave memories behind in the universe.
        if (moonTravelSignsRef.current.length > 0) detachAndClearSigns();
        return;
      }
      const moonIdRaw =
        String((moonMesh.userData as { moonId?: unknown }).moonId ?? "")
          .toLowerCase()
          .replace(/^moon-/, "") ||
        String((moonMesh.userData as { planetName?: unknown }).planetName ?? "")
          .toLowerCase()
          .replace(/\s+/g, "-");
      const activeCompanyId = moonIdRaw;
      if (!moonTravelSignCatalog.has(activeCompanyId)) return;
      if (moonTravelSignActiveCompanyRef.current !== activeCompanyId) {
        moonTravelSignActiveCompanyRef.current = activeCompanyId;
        moonTravelSignPoolRef.current =
          moonTravelSignCatalog.get(activeCompanyId)?.pool ?? [];
        moonTravelSignPoolCursorRef.current = 0;
        moonTravelSignSequenceWrappedRef.current = false;
        moonTravelSignLoopHaltedRef.current = false;
        moonTravelSignLaneCursorRef.current = 0;
        moonTravelSignPathCycleRef.current = {
          order: [0, 2, 4, 1, 3],
          index: 0,
          lastSlot: -1,
        };
        moonMemoryManualModeRef.current = false;
        moonMemoryPlaybackPlayingRef.current = false;
        moonMemoryScrubRequestRef.current = null;
        moonMemoryScrubValueRef.current = 0;
        setMoonMemoryManualMode(false);
        setMoonMemoryPlaybackPlaying(false);
        setMoonMemoryScrubValue(0);
        moonTravelSignLastSpawnAtRef.current = now;
        moonTravelSignPauseUntilRef.current = 0;
        detachAndClearSigns();
      }
      const geo = moonMesh.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const moonRadius = (geo.boundingSphere?.radius ?? 30) * moonMesh.scale.x;
      const tuning = orbitSignTuningRef.current;
      const travelSpeed = THREE.MathUtils.clamp(tuning.travelSpeed, 0, 6);
      const lightMul = THREE.MathUtils.clamp(tuning.lightIntensity, 0, 3);
      const startScaleMul = THREE.MathUtils.clamp(tuning.startFontScale, 0, 4);
      const endScaleMul = THREE.MathUtils.clamp(tuning.endFontScale, 0, 6);
      const intervalMs =
        THREE.MathUtils.clamp(tuning.timeBetweenMessagesSec, 0, 5) * 1000;
      const immediateMode = intervalMs <= 1;
      if (
        moonTravelSignPauseUntilRef.current > 0 &&
        now >= moonTravelSignPauseUntilRef.current
      ) {
        moonTravelSignPauseUntilRef.current = 0;
      }
      const canSpawnNow =
        !moonTravelSignLoopHaltedRef.current &&
        moonTravelSignPauseUntilRef.current <= 0;
      const scrubRequest = moonMemoryScrubRequestRef.current;
      if (memoryManualMode) {
        const pool = moonTravelSignPoolRef.current;
        if (pool.length > 0) {
          const maxValue = Math.max(0, pool.length - 0.001);
          let playhead = moonMemoryScrubValueRef.current;
          if (scrubRequest) {
            playhead = THREE.MathUtils.clamp(scrubRequest.value, 0, maxValue);
          }
          if (memoryPlaybackPlaying) {
            playhead += dt * THREE.MathUtils.clamp(travelSpeed, 0.15, 5) * 0.72;
          }
          if (orbitSignTuningRef.current.continuousLoop && pool.length > 1) {
            while (playhead < 0) playhead += pool.length;
            while (playhead > maxValue) playhead -= pool.length;
          } else {
            playhead = THREE.MathUtils.clamp(playhead, 0, maxValue);
            if (memoryPlaybackPlaying && playhead >= maxValue - 0.0001) {
              moonMemoryPlaybackPlayingRef.current = false;
              setMoonMemoryPlaybackPlaying(false);
            }
          }
          moonMemoryScrubValueRef.current = playhead;
          if (scrubRequest || memoryPlaybackPlaying) {
            setMoonMemoryScrubValue(playhead);
          }

          const lifetimeUnits = 3.35;
          const startIndex = Math.max(
            0,
            Math.floor(playhead - lifetimeUnits - 1),
          );
          const endIndex = Math.min(pool.length - 1, Math.ceil(playhead));
          const existingByIndex = new Map<number, MoonTravelSignRecord>();
          moonTravelSignsRef.current.forEach((record) => {
            existingByIndex.set(record.memoryIndex, record);
          });
          const keepIndices = new Set<number>();
          for (let idx = startIndex; idx <= endIndex; idx += 1) {
            const ageNorm = (playhead - idx) / lifetimeUnits;
            if (ageNorm < 0 || ageNorm > 1) continue;
            let activeRecord = existingByIndex.get(idx) ?? null;
            if (!activeRecord) {
              activeRecord = spawnSign(activeCompanyId, moonMesh, moonRadius, {
                forcedMemory: pool[idx],
                forcedIndex: idx,
              });
            }
            if (!activeRecord) continue;
            activeRecord.ageMs =
              activeRecord.ttlMs * THREE.MathUtils.clamp(ageNorm, 0, 0.995);
            keepIndices.add(activeRecord.memoryIndex);
          }

          const manualSurvivors: MoonTravelSignRecord[] = [];
          moonTravelSignsRef.current.forEach((record) => {
            if (keepIndices.has(record.memoryIndex)) {
              manualSurvivors.push(record);
              return;
            }
            const parent = record.object.parent;
            if (parent) parent.remove(record.object);
            record.material.dispose();
          });
          moonTravelSignsRef.current = manualSurvivors;
          moonTravelSignLastSpawnAtRef.current =
            now + Math.max(260, intervalMs * 0.9);
        }
        moonMemoryScrubRequestRef.current = null;
      }
      const allowAutoPlayback = !memoryManualMode;
      if (
        allowAutoPlayback &&
        canSpawnNow &&
        now >= moonTravelSignLastSpawnAtRef.current
      ) {
        let spawnedThisTick = 0;
        const maxPerTick = immediateMode ? 1 : 4;
        while (
          now >= moonTravelSignLastSpawnAtRef.current &&
          spawnedThisTick < maxPerTick
        ) {
          // Fire-and-forget: never block cadence on active-count saturation.
          while (
            moonTravelSignsRef.current.length >= MOON_TRAVEL_SIGN_MAX_ACTIVE
          ) {
            const oldest = moonTravelSignsRef.current.shift();
            if (!oldest) break;
            const parent = oldest.object.parent;
            if (parent) parent.remove(oldest.object);
            oldest.material.dispose();
          }
          spawnSign(activeCompanyId, moonMesh, moonRadius);
          if (!memoryManualMode) {
            moonMemoryScrubValueRef.current =
              moonTravelSignPoolCursorRef.current;
          }
          spawnedThisTick += 1;
          if (moonTravelSignSequenceWrappedRef.current) {
            moonTravelSignPauseUntilRef.current =
              now + Math.max(0, tuning.waitAfterStreamSec) * 1000;
            moonTravelSignSequenceWrappedRef.current = false;
            moonTravelSignLastSpawnAtRef.current =
              moonTravelSignPauseUntilRef.current;
            break;
          }
          if (immediateMode) {
            moonTravelSignLastSpawnAtRef.current = now;
            break;
          }
          moonTravelSignLastSpawnAtRef.current += intervalMs;
        }
      }
      const records = moonTravelSignsRef.current;
      const survivors: MoonTravelSignRecord[] = [];
      records.forEach((record) => {
        // Travel speed must affect already-spawned signs immediately (all modes).
        if (!memoryManualMode) {
          record.ageMs += dt * 1000 * travelSpeed;
        }
        const mat = record.material as THREE.Material & { opacity?: number };
        const spriteMat = record.material as THREE.SpriteMaterial;
        const t = THREE.MathUtils.clamp(
          record.ageMs / Math.max(record.ttlMs, 1),
          0,
          1,
        );
        // Force a deterministic behind->front crossover while still in view.
        // Stage A (early): behind drone text. Stage B (mid/late): pass through.
        const frontPass = t >= 0.28;
        record.object.renderOrder = frontPass ? 1700 : 900;
        spriteMat.depthTest = !frontPass;
        spriteMat.depthWrite = false;
        if (record.arcStart && record.arcControl && record.arcEnd) {
          const inv = 1 - t;
          record.object.position
            .copy(record.arcStart)
            .multiplyScalar(inv * inv)
            .addScaledVector(record.arcControl, 2 * inv * t)
            .addScaledVector(record.arcEnd, t * t);
          const approachScale =
            startScaleMul + (endScaleMul - startScaleMul) * t;
          record.object.scale
            .copy(record.baseScale)
            .multiplyScalar(approachScale);
        } else {
          record.object.position.addScaledVector(
            record.velocity,
            dt * 0.62 * travelSpeed,
          );
          const riseScaleT = THREE.MathUtils.clamp(t * 0.7, 0, 1);
          const riseScale =
            startScaleMul + (endScaleMul - startScaleMul) * riseScaleT;
          record.object.scale.copy(record.baseScale).multiplyScalar(riseScale);
        }
        const fadeIn = THREE.MathUtils.clamp(t / 0.15, 0, 1);
        // Fade over the last quarter so memories are gone as they pass by.
        const fadeOut = THREE.MathUtils.clamp((1 - t) / 0.25, 0, 1);
        if (typeof mat.opacity === "number") {
          if (memoryManualMode && !memoryPlaybackPlaying) {
            // Keep scrub previews readable while users drag gently through the flight path.
            mat.opacity = (0.22 + Math.max(fadeIn, 0.42) * 0.38) * lightMul;
          } else {
            mat.opacity = (0.06 + Math.min(fadeIn, fadeOut) * 0.42) * lightMul;
          }
        }
        let offscreenPast = false;
        let passedViewer = false;
        if (camTick) {
          activeSignNdc.copy(record.object.position).project(camTick);
          offscreenPast =
            activeSignNdc.z > 1.02 ||
            Math.abs(activeSignNdc.x) > 1.35 ||
            Math.abs(activeSignNdc.y) > 1.35;
          // Once it reaches the viewer it's done: don't let it linger huge
          // and slow right at the camera until its timer runs out.
          camTick.getWorldDirection(cameraForwardTick);
          passedViewer =
            t > 0.5 &&
            signFromCamera
              .subVectors(record.object.position, camTick.position)
              .dot(cameraForwardTick) < MOON_TRAVEL_SIGN_PASSED_VIEWER_DIST;
        }
        const shouldCull = !memoryManualMode;
        if (
          shouldCull &&
          (record.ageMs >= record.ttlMs || offscreenPast || passedViewer)
        ) {
          const parent = record.object.parent;
          if (parent) parent.remove(record.object);
          record.material.dispose();
        } else {
          survivors.push(record);
        }
      });
      moonTravelSignsRef.current = survivors;
      if (viewerWantsMemories && now - moonMemoryLastUiSyncAtRef.current > 70) {
        moonMemoryLastUiSyncAtRef.current = now;
        if (!memoryManualMode) {
          const latest = survivors[survivors.length - 1];
          if (latest) {
            const previewValue =
              latest.memoryIndex +
              THREE.MathUtils.clamp(
                latest.ageMs / Math.max(latest.ttlMs, 1),
                0,
                0.98,
              );
            moonMemoryScrubValueRef.current = previewValue;
          }
        }
        setMoonMemoryScrubValue(moonMemoryScrubValueRef.current);
      }
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      detachAndClearSigns();
      const group = moonTravelSignGroupRef.current;
      if (group) {
        const parent = group.parent;
        if (parent) parent.remove(group);
      }
      moonTravelSignGroupRef.current = null;
    };
  }, [buildMoonTravelSignText, moonTravelSignCatalog, orbitPhase, sceneReady]);

  // Free every cached memory texture when the scene goes away.
  useEffect(() => {
    const cache = moonTravelSignTextureCacheRef.current;
    return () => {
      cache.forEach((texture) => texture.dispose());
      cache.clear();
    };
  }, []);

  // ── Orbital portfolio screenshot inspect clicks ───────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const raycaster = new THREE.Raycaster();
    raycaster.layers.enable(PROJECT_SHOWCASE_CARD_LAYER);
    raycaster.layers.enable(ORBITAL_PORTFOLIO_LAYER);
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let downAt = 0;
    let pending: {
      stationIndex?: number;
      coreId?: string;
      mediaIndex?: number;
      variantIndex?: number;
      thumbNavDirection?: "prev" | "next";
      tabNavDirection?: "prev" | "next";
      slideNavDirection?: "prev" | "next";
      kind:
        | "plate"
        | "thumb"
        | "variant"
        | "core"
        | "thumb-nav"
        | "tab-nav"
        | "slide-nav";
    } | null = null;

    const pickPortfolioTarget = (
      clientX: number,
      clientY: number,
    ): {
      stationIndex?: number;
      coreId?: string;
      mediaIndex?: number;
      variantIndex?: number;
      thumbNavDirection?: "prev" | "next";
      tabNavDirection?: "prev" | "next";
      slideNavDirection?: "prev" | "next";
      kind:
        | "plate"
        | "thumb"
        | "variant"
        | "core"
        | "thumb-nav"
        | "tab-nav"
        | "slide-nav";
    } | null => {
      if (!orbitalPortfolioActiveRef.current) return null;
      const cam = sceneRef.current.camera;
      if (!cam) return null;
      const rect = mount.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, cam);
      const pickables: THREE.Object3D[] = [];
      orbitalPortfolioCorePickMeshesRef.current.forEach((coreMesh) => {
        coreMesh.userData.orbitalPickKind = "core";
        if (coreMesh.visible) pickables.push(coreMesh);
      });
      orbitalPortfolioStationsRef.current.forEach((station, stationIndex) => {
        station.plate.userData.orbitalStationIndex = stationIndex;
        station.plate.userData.orbitalPickKind = "plate";
        pickables.push(station.plate);
        station.cardVariantTabs.forEach((tab) => {
          tab.mesh.userData.orbitalStationIndex = stationIndex;
          tab.mesh.userData.orbitalPickKind = "variant";
          // The card update stores which client site the slot shows (tabs page).
          if (!Number.isFinite(Number(tab.mesh.userData.orbitalVariantIndex))) {
            tab.mesh.userData.orbitalVariantIndex = tab.variantIndex;
          }
          if (tab.mesh.visible) pickables.push(tab.mesh);
        });
        station.cardThumbMeshes.forEach((thumb) => {
          thumb.mesh.userData.orbitalStationIndex = stationIndex;
          thumb.mesh.userData.orbitalPickKind = "thumb";
          if (!Number.isFinite(Number(thumb.mesh.userData.orbitalMediaIndex))) {
            thumb.mesh.userData.orbitalMediaIndex = thumb.mediaIndex;
          }
          if (thumb.mesh.visible) pickables.push(thumb.mesh);
        });
        station.cardThumbNavMeshes.forEach((nav) => {
          nav.mesh.userData.orbitalStationIndex = stationIndex;
          nav.mesh.userData.orbitalPickKind = "thumb-nav";
          nav.mesh.userData.orbitalThumbNavDirection = nav.direction;
          if (nav.mesh.visible) pickables.push(nav.mesh);
        });
        station.cardVariantTabNavMeshes.forEach((nav) => {
          nav.mesh.userData.orbitalStationIndex = stationIndex;
          nav.mesh.userData.orbitalPickKind = "tab-nav";
          nav.mesh.userData.orbitalTabNavDirection = nav.direction;
          if (nav.mesh.visible) pickables.push(nav.mesh);
        });
        station.cardSlideNavMeshes.forEach((nav) => {
          nav.mesh.userData.orbitalStationIndex = stationIndex;
          nav.mesh.userData.orbitalPickKind = "slide-nav";
          nav.mesh.userData.orbitalSlideNavDirection = nav.direction;
          if (nav.mesh.visible) pickables.push(nav.mesh);
        });
      });
      const hits = raycaster.intersectObjects(pickables, false);
      if (hits.length === 0) return null;
      const hit = hits[0]?.object;
      if (!hit) return null;
      const stationIndex = Number(hit.userData?.orbitalStationIndex);
      const kind =
        (hit.userData?.orbitalPickKind as
          | "plate"
          | "thumb"
          | "variant"
          | "core"
          | "thumb-nav"
          | "tab-nav"
          | "slide-nav"
          | undefined) ?? "plate";
      if (kind === "core") {
        const coreId = String(hit.userData?.orbitalCoreId ?? "");
        if (!coreId) return null;
        return { coreId, kind: "core" };
      }
      if (!Number.isFinite(stationIndex)) return null;
      if (kind === "variant") {
        const variantIndex = Number(hit.userData?.orbitalVariantIndex);
        if (!Number.isFinite(variantIndex))
          return { stationIndex, kind: "plate" };
        return { stationIndex, variantIndex, kind: "variant" };
      }
      if (kind === "thumb") {
        const mediaIndex = Number(hit.userData?.orbitalMediaIndex);
        if (!Number.isFinite(mediaIndex))
          return { stationIndex, kind: "plate" };
        return { stationIndex, mediaIndex, kind: "thumb" };
      }
      if (kind === "thumb-nav") {
        const thumbNavDirection =
          hit.userData?.orbitalThumbNavDirection === "next" ? "next" : "prev";
        return { stationIndex, thumbNavDirection, kind: "thumb-nav" };
      }
      if (kind === "tab-nav") {
        const tabNavDirection =
          hit.userData?.orbitalTabNavDirection === "next" ? "next" : "prev";
        return { stationIndex, tabNavDirection, kind: "tab-nav" };
      }
      if (kind === "slide-nav") {
        const slideNavDirection =
          hit.userData?.orbitalSlideNavDirection === "next" ? "next" : "prev";
        return { stationIndex, slideNavDirection, kind: "slide-nav" };
      }
      return { stationIndex, kind: "plate" };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!orbitalPortfolioActiveRef.current) return;
      if (e.button !== 0 || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, input, select, textarea, a, iframe")) return;
      downX = e.clientX;
      downY = e.clientY;
      downAt = performance.now();
      pending = pickPortfolioTarget(e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!orbitalPortfolioActiveRef.current) return;
      if (!pending) return;
      const elapsed = performance.now() - downAt;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      const hit = pickPortfolioTarget(e.clientX, e.clientY);
      const same =
        !!hit &&
        (hit.stationIndex ?? -1) === (pending.stationIndex ?? -1) &&
        (hit.coreId ?? "") === (pending.coreId ?? "") &&
        (hit.mediaIndex ?? -1) === (pending.mediaIndex ?? -1) &&
        (hit.variantIndex ?? -1) === (pending.variantIndex ?? -1) &&
        hit.kind === pending.kind;
      if (elapsed <= 420 && moved <= 7 && same) {
        if (pending.kind === "core" && pending.coreId) {
          trackEvent("portfolio_moon_click", {
            moon_id: `core-${pending.coreId}`,
            portfolio_core_id: pending.coreId,
            kind: "core",
          });
          focusOrbitalPortfolioCore(pending.coreId);
        } else if (
          pending.kind === "variant" &&
          typeof pending.variantIndex === "number" &&
          typeof pending.stationIndex === "number"
        ) {
          const groups = orbitalPortfolioGroupsRef.current;
          const maxVariantIndex = Math.max(
            0,
            (groups[pending.stationIndex]?.variants?.length ?? 1) - 1,
          );
          focusOrbitalPortfolioStation(pending.stationIndex, 0);
          setOrbitalPortfolioVariantIndex(
            THREE.MathUtils.clamp(
              Math.floor(pending.variantIndex),
              0,
              maxVariantIndex,
            ),
          );
          setOrbitalPortfolioMediaIndex(0);
          setOrbitalPortfolioThumbPageStart(0);
        } else if (
          pending.kind === "thumb-nav" &&
          typeof pending.stationIndex === "number"
        ) {
          const groups = orbitalPortfolioGroupsRef.current;
          const focusStation = THREE.MathUtils.clamp(
            pending.stationIndex,
            0,
            Math.max(0, groups.length - 1),
          );
          const variantIndex = THREE.MathUtils.clamp(
            orbitalPortfolioVariantIndexRef.current,
            0,
            Math.max(0, (groups[focusStation]?.variants?.length ?? 1) - 1),
          );
          const mediaCount =
            groups[focusStation]?.variants?.[variantIndex]?.mediaItems
              ?.length ?? 0;
          const maxPageStart = Math.max(
            0,
            mediaCount - ORBITAL_PORTFOLIO_CARD_MAX_THUMBS,
          );
          const delta =
            pending.thumbNavDirection === "next"
              ? ORBITAL_PORTFOLIO_CARD_MAX_THUMBS
              : -ORBITAL_PORTFOLIO_CARD_MAX_THUMBS;
          const nextPageStart = THREE.MathUtils.clamp(
            orbitalPortfolioThumbPageStartRef.current + delta,
            0,
            maxPageStart,
          );
          orbitalPortfolioThumbSlideDirectionRef.current =
            pending.thumbNavDirection ?? null;
          setOrbitalPortfolioThumbPageStart(nextPageStart);
          const activeDirection = pending.thumbNavDirection;
          const station = orbitalPortfolioStationsRef.current[focusStation];
          station?.cardThumbNavMeshes.forEach((nav) => {
            if (nav.direction === activeDirection) {
              nav.mesh.userData.orbitalPressedUntil = performance.now() + 140;
            }
          });
        } else if (
          pending.kind === "tab-nav" &&
          typeof pending.stationIndex === "number"
        ) {
          const station = orbitalPortfolioStationsRef.current[pending.stationIndex];
          const variantCount =
            orbitalPortfolioGroupsRef.current[pending.stationIndex]?.variants
              ?.length ?? 0;
          if (station && variantCount > ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS) {
            const delta =
              pending.tabNavDirection === "next"
                ? ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS
                : -ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS;
            const nextPageStart = THREE.MathUtils.clamp(
              station.variantTabPageStart + delta,
              0,
              Math.max(0, variantCount - ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS),
            );
            if (nextPageStart !== station.variantTabPageStart) {
              station.variantTabPageStart = nextPageStart;
              setOrbitalPortfolioVariantIndex(nextPageStart);
              setOrbitalPortfolioMediaIndex(0);
              setOrbitalPortfolioThumbPageStart(0);
            }
            const activeDirection = pending.tabNavDirection;
            station.cardVariantTabNavMeshes.forEach((nav) => {
              if (nav.direction === activeDirection) {
                nav.mesh.userData.orbitalPressedUntil = performance.now() + 140;
              }
            });
          }
        } else if (
          pending.kind === "slide-nav" &&
          typeof pending.stationIndex === "number"
        ) {
          const direction = pending.slideNavDirection === "next" ? 1 : -1;
          stepOrbitalPortfolioSequence(direction);
          const station =
            orbitalPortfolioStationsRef.current[pending.stationIndex];
          const activeDirection = pending.slideNavDirection;
          station?.cardSlideNavMeshes.forEach((nav) => {
            if (nav.direction === activeDirection) {
              nav.mesh.userData.orbitalPressedUntil = performance.now() + 140;
            }
          });
        } else if (typeof pending.stationIndex === "number") {
          trackEvent("portfolio_moon_click", {
            moon_id: `station-${pending.stationIndex}`,
            portfolio_core_id: pending.coreId ?? null,
            kind: "station",
            station_index: pending.stationIndex,
            media_index: pending.mediaIndex ?? null,
          });
          focusOrbitalPortfolioStation(
            pending.stationIndex,
            pending.mediaIndex,
          );
        }
        e.stopPropagation();
      }
      pending = null;
    };

    mount.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    return () => {
      mount.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
    };
  }, [
    focusOrbitalPortfolioCore,
    focusOrbitalPortfolioStation,
    stepOrbitalPortfolioSequence,
  ]);

  // ── Skills lattice controls: Shift+drag to pan camera rig ────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const camPos = new THREE.Vector3();
    const targetPos = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const panOffset = new THREE.Vector3();

    const onPointerDown = (e: PointerEvent) => {
      if (!skillsLatticeActiveRef.current || !e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, input, select, textarea, a")) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || !skillsLatticeActiveRef.current) return;
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      if (!controls || !camera) return;

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      camPos.copy(camera.position);
      controls.getTarget(targetPos);
      camera.getWorldDirection(forward);
      right.crossVectors(forward, camera.up).normalize();
      up.copy(camera.up).normalize();
      const distance = camPos.distanceTo(targetPos);
      const panScale = Math.max(0.06, distance * 0.0016);
      panOffset
        .copy(right)
        .multiplyScalar(-dx * panScale)
        .addScaledVector(up, dy * panScale);

      camPos.add(panOffset);
      targetPos.add(panOffset);
      controls.setLookAt(
        camPos.x,
        camPos.y,
        camPos.z,
        targetPos.x,
        targetPos.y,
        targetPos.z,
        false,
      );
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const onPointerUp = () => {
      dragging = false;
    };

    mount.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    return () => {
      mount.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
    };
  }, [sceneReady]);

  // Update spaceship exterior lights
  useEffect(() => {
    debugShipLabelRef.current = debugShipLabel;
  }, [debugShipLabel]);

  useEffect(() => {
    debugShipLabelModeRef.current = debugShipLabelMode;
  }, [debugShipLabelMode]);

  useEffect(() => {
    debugShipLabelsRef.current = debugShipLabels;
  }, [debugShipLabels]);

  const getRandomEndPosNearPlanets = useCallback(() => {
    const camera = sceneRef.current.camera as
      | THREE.PerspectiveCamera
      | undefined;
    const cameraPos = camera?.position.clone() ?? new THREE.Vector3();
    const cameraDir = new THREE.Vector3(0, 0, 1);
    if (camera) {
      camera.getWorldDirection(cameraDir);
    }
    const cameraUp =
      camera?.up.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
    const cameraRight = new THREE.Vector3()
      .crossVectors(cameraDir, cameraUp)
      .normalize();

    const targets: Array<{ pos: THREE.Vector3; radius: number }> = [];
    const exp = planetsDataRef.current.get("experience")?.position;
    const skills = planetsDataRef.current.get("skills")?.position;
    const portfolio = planetsDataRef.current.get("portfolio")?.position;
    if (exp) targets.push({ pos: exp.clone(), radius: EXP_WANDER_RADIUS });
    if (skills)
      targets.push({ pos: skills.clone(), radius: SKILLS_WANDER_RADIUS });
    if (portfolio)
      targets.push({ pos: portfolio.clone(), radius: PROJ_WANDER_RADIUS });
    // Sun is centered at origin; keep a tighter band so it's in view.
    targets.push({
      pos: new THREE.Vector3(0, 0, 0),
      radius: SUN_WANDER_RADIUS,
    });

    if (targets.length === 0) {
      return new THREE.Vector3(
        (Math.random() - 0.5) * 1600,
        (Math.random() - 0.5) * 800,
        (Math.random() - 0.5) * 1600,
      );
    }

    const pick = targets[Math.floor(Math.random() * targets.length)];
    const inViewThreshold = 0.25;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const radius = pick.radius * (0.55 + Math.random() * 0.75);
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * radius,
        (Math.random() - 0.5) * (radius * 0.6),
        (Math.random() - 0.5) * radius,
      );
      const candidate = pick.pos.clone().add(offset);
      if (!camera) return candidate;

      const toCandidate = candidate.clone().sub(cameraPos).normalize();
      if (toCandidate.dot(cameraDir) > inViewThreshold) {
        return candidate;
      }
    }

    const forwardDistance = 700 + Math.random() * 700;
    const spread = 320 + Math.random() * 180;
    const fallback = cameraPos
      .clone()
      .add(cameraDir.clone().multiplyScalar(forwardDistance))
      .add(cameraRight.clone().multiplyScalar((Math.random() - 0.5) * spread))
      .add(
        cameraUp.clone().multiplyScalar((Math.random() - 0.5) * spread * 0.5),
      );

    return fallback.clone().lerp(pick.pos, 0.35);
  }, []);

  const resetShipLabels = useCallback(() => {
    if (!spaceshipRef.current) return;
    spaceshipRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        delete object.userData.debugSide;
      }
    });
    setDebugShipLabels({});
    debugShipLabelMarksRef.current = {};
    debugShipLabelMarkersRef.current.forEach((marker) => {
      marker.parent?.remove(marker);
      marker.geometry.dispose();
      if (Array.isArray(marker.material)) {
        marker.material.forEach((mat) => mat.dispose());
      } else {
        marker.material.dispose();
      }
    });
    debugShipLabelMarkersRef.current = [];
    if (debugHitMarkerRef.current) {
      debugHitMarkerRef.current.visible = false;
    }
  }, []);

  useEffect(() => {
    if (spaceshipLightsRef.current.length > 0) {
      // When inside the ship, turn off exterior lights completely —
      // they shine through the hull and add unwanted brightness.
      // When outside: 12 × 0.15 = 1.8 total additive — soft fill.
      const intensity = insideShip ? 0 : shipExteriorLights ? 0.15 : 0;
      spaceshipLightsRef.current.forEach((light) => {
        light.intensity = intensity;
      });
    }
  }, [shipExteriorLights, insideShip]);

  // Update spaceship interior lights — ONLY active when inside the ship.
  // When viewed from exterior, interior lights create a massive glow sphere
  // (each light has 4-unit range but ship is only 0.8 units long).
  // Cockpit gets moderate light (windshield lets some in); cabin is dimmer.
  useEffect(() => {
    if (spaceshipInteriorLightsRef.current.length > 0) {
      const on = insideShip && shipInteriorLights;
      const isCockpit = shipViewMode === "cockpit";
      // Keep interior illumination controlled; cabin should be notably dim.
      const intensity = on ? (isCockpit ? 0.2 : 0.05) : 0;
      spaceshipInteriorLightsRef.current.forEach((light) => {
        light.intensity = intensity;
      });
    }
  }, [shipInteriorLights, insideShip, shipViewMode]);

  useKeyboardControls({
    enabled: manualFlightMode,
    keyboardStateRef: keyboardStateRef as MutableRefObject<
      Record<string, boolean>
    >,
    setKeyboardUpdateTrigger,
  });

  useEffect(() => {
    const sceneSetup = initializeScene();
    if (!sceneSetup) return;

    const {
      scene,
      camera,
      renderer,
      controls,
      composer,
      labelRenderer,
      container,
      preventDefaultTouch,
      handleContextLost,
      handleContextRestored,
    } = sceneSetup;
    composerRef.current = composer;

    // clickable overlay registry (planes that should be raycast-targeted)
    const overlayClickables: THREE.Object3D[] = [];

    // (attachDetailOverlay removed — replaced by attachMultiNoteOverlays)
    const attachMultiNoteOverlays = attachMultiNoteOverlaysFactory({
      scene,
      overlayClickables,
      createDetailTexture,
      vlog,
    });
    // --- TEXTURES ---
    const rawTextureLoader = new THREE.TextureLoader();
    // Wrap TextureLoader.load so every texture is pre-uploaded to the GPU
    // via renderer.initTexture() as soon as it arrives. Without this,
    // Three.js defers the GPU upload until the texture is first rendered
    // in-frustum, causing frame stalls (see Three.js docs & forums).
    const textureLoader = {
      load: (
        url: string,
        onLoad?: (tex: THREE.Texture) => void,
        onProgress?: (event: ProgressEvent) => void,
        onError?: (event: unknown) => void,
      ) =>
        rawTextureLoader.load(
          url,
          (tex) => {
            renderer.initTexture(tex);
            onLoad?.(tex);
          },
          onProgress,
          onError,
        ),
    };

    const { starfield, skyfield } = createStarfieldMeshes(rawTextureLoader);
    // Universe backdrop: lightbox only in "lightbox" style; otherwise the 3D universe.
    const useLightbox = universeStyleRef.current === "lightbox";
    starfield.visible = spaceBackgroundVisible && useLightbox;
    skyfield.visible = spaceBackgroundVisible && useLightbox;
    starfieldMeshRef.current = starfield;
    skyfieldMeshRef.current = skyfield;
    scene.add(starfield);
    scene.add(skyfield);
    const universeBackdrop = new UniverseBackdrop(renderer, scene);
    universeBackdropRef.current = universeBackdrop;
    // Warp tunnel: same "at lightspeed" test as the legacy streaks, along the
    // Falcon's heading (its +Z).
    const universeTravelDirection = new THREE.Vector3();
    universeBackdrop.setTravelSource(() => {
      const ship = spaceshipRef.current;
      if (!ship) return null;
      return {
        active:
          !!manualFlightRef.current?.isLightspeedActive &&
          followingSpaceshipRef.current &&
          !insideShipRef.current &&
          shipViewModeRef.current === "exterior",
        direction: universeTravelDirection.set(0, 0, 1).applyQuaternion(ship.quaternion).normalize(),
      };
    });
    scene.userData.suppressLegacyLightspeedStreaks =
      spaceBackgroundVisible && universeStyleRef.current !== "lightbox";
    const initialUniverseStyle = universeStyleRef.current;
    if (spaceBackgroundVisible && initialUniverseStyle !== "lightbox") {
      universeBackdrop.setStyle(initialUniverseStyle);
    }

    // --- LIGHTING ---
    const { ambientLight, sunLight, fillLight, hemisphereLight } =
      createLighting(optionsRef.current);
    scene.add(ambientLight);
    scene.add(sunLight);
    scene.add(fillLight);
    scene.add(hemisphereLight);
    sceneRef.current.ambientLight = ambientLight;
    sceneRef.current.sunLight = sunLight;
    sceneRef.current.fillLight = fillLight;

    const { sunMesh, sunMaterial } = createSunMesh(rawTextureLoader);
    scene.add(sunMesh);
    sceneRef.current.sunMaterial = sunMaterial;

    // Hologram Drone display
    hologramDroneRef.current = new HologramDroneDisplay(scene, {
      droneVariant: MOON_VISIT_DRONE_VARIANT,
      oblivionDroneTemplate: oblivionDronePreloadedRef.current,
      droneAudioBuffers: oblivionDroneAudioBuffersRef.current ?? undefined,
      soundEnabled: droneSoundEnabled,
      soundVolume: droneSoundVolume,
      onAudioDebug: (msg) => {
        debugLog("drone", `[audio] ${msg}`);
        if (
          /buffers ready|failed|skipped|deferred|resumeAudioContext|setSoundEnabled/i.test(
            msg,
          )
        ) {
          shipLog(`[audio] ${msg}`, "info");
        }
      },
    });

    hologramDroneRef.current.setOnSeeDetails(() => {
      debugLog("drone", "See details clicked — transitioning to HTML layout");
      setMoonIntroComplete(true);
      setMoonHtmlVisible(true);
      // Fade out but keep the drawn card, so closing details restores it
      // without replaying the drone's fly-in and laser writing.
      hologramDroneRef.current?.setContentSuppressed(true);
    });

    // --- OBJECTS ---
    const items: OrbitItem[] = [];

    const orbitAnchors: OrbitAnchor[] = [];

    // Update items ref so it's accessible outside useFrame
    itemsRef.current = items;
    // clickable planet registry (used for raycasting planet clicks)
    const clickablePlanets: THREE.Object3D[] = [];

    // Sun Glow (Procedural Texture)
    const glowTexture = createSunGlowTexture();

    const spriteMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffaa00,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(SUN_GLOW_SPRITE_SIZE * 2.2, SUN_GLOW_SPRITE_SIZE * 2.2, 1);
    sunMesh.add(sprite);

    const haloMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffc27a,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const haloSprite = new THREE.Sprite(haloMaterial);
    haloSprite.scale.set(
      SUN_GLOW_SPRITE_SIZE * 4.2,
      SUN_GLOW_SPRITE_SIZE * 4.2,
      1,
    );
    sunMesh.add(haloSprite);

    const outerHaloMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffd6a8,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const outerHaloSprite = new THREE.Sprite(outerHaloMaterial);
    outerHaloSprite.scale.set(
      SUN_GLOW_SPRITE_SIZE * 7.4,
      SUN_GLOW_SPRITE_SIZE * 7.4,
      1,
    );
    sunMesh.add(outerHaloSprite);
    sceneRef.current.sunGlowMaterial = spriteMaterial;
    sunEnhancementsRef.current?.dispose();
    sunEnhancementsRef.current = new SunEnhancements(sunMesh, scene);

    // Keep the sun label-free; identity is already shown in the main HUD/nav.
    sunLabelRef.current = null;

    // 2. HELPER: Create Planet
    const createPlanet = createPlanetFactory({
      scene,
      textureLoader: rawTextureLoader,
      items,
      orbitAnchors,
      clickablePlanets,
    });

    // 3. PLANETS (Sections)
    const expPlanet = createPlanet(
      "Experience",
      EXPERIENCE_ORBIT,
      EXPERIENCE_RADIUS,
      0xff5533,
      scene,
      0.0002,
      1,
      "/textures/mars.jpg",
      undefined,
      {
        enabled: false,
      },
      {
        enabled: true,
        textureUrl:
          "https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/clouds/clouds.png",
        altitude: 0.0065,
        opacity: 0.5,
        rotationSpeed: -0.00012,
        segments: 72,
      },
    );

    // Skills no longer uses legacy planet/moon bodies.
    // The lattice itself is the only representation, anchored in deep space.
    const skillsAnchor = SKILLS_LATTICE_WORLD_ANCHOR.clone();
    skillsLatticeWorldAnchorRef.current = skillsAnchor.clone();

    // About memory square (Phase 1+2): a giant floating square destination
    // in primary universe deep space, used as the About travel anchor.
    const aboutAnchor = ABOUT_MEMORY_SQUARE_WORLD_ANCHOR.clone();
    aboutMemorySquareWorldAnchorRef.current = aboutAnchor.clone();
    const aboutSquareRoot = new THREE.Group();
    aboutSquareRoot.name = "AboutMemorySquare";
    aboutSquareRoot.visible = false;
    aboutSquareRoot.position.copy(aboutAnchor);
    const aboutSquareSize = 920;
    const aboutSquareDepth = 26;
    const aboutCellDepth = Math.max(4, aboutSquareDepth * 0.24);
    const aboutCellDivisions = ABOUT_CELL_GRID_DIVISIONS;
    const aboutBackCellDivisions = ABOUT_CELL_BACK_GRID_DIVISIONS;
    aboutTileCoreMatsRef.current = [];
    aboutTileGridLineMatsRef.current = [];
    aboutTileEdgeLineMatsRef.current = [];
    aboutTileContentMatsRef.current = [];
    const aboutTileGap = aboutSquareSize / 20;
    const aboutTileSpacing = aboutSquareSize + aboutTileGap;
    const createAboutTile = (
      x: number,
      y: number,
      z: number,
      tiltXDeg: number,
      tiltYDeg: number,
      tiltZDeg: number,
      tileIndex: number,
      slots: AboutCellSlot[],
    ) => {
      const tile = new THREE.Group();
      tile.position.set(x, y, z);
      tile.rotation.set(
        THREE.MathUtils.degToRad(tiltXDeg),
        THREE.MathUtils.degToRad(tiltYDeg),
        THREE.MathUtils.degToRad(tiltZDeg),
      );
      const coreMat = new THREE.MeshPhongMaterial({
        color: 0x2f4e80,
        emissive: 0x21406e,
        emissiveIntensity: 0.58,
        shininess: 72,
        specular: new THREE.Color(0x88a3cc),
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      aboutTileCoreMatsRef.current.push(coreMat);
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(
          aboutSquareSize,
          aboutSquareSize,
          aboutSquareDepth,
        ),
        coreMat,
      );
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(core.geometry),
        new THREE.LineBasicMaterial({
          color: 0x9fd1ff,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        }),
      );
      aboutTileEdgeLineMatsRef.current.push(
        edges.material as THREE.LineBasicMaterial,
      );
      tile.add(core, edges);
      tile.updateMatrix();
      const zf = aboutSquareDepth * 0.5 + aboutCellDepth * 0.5 + 0.8;
      const zb = -aboutSquareDepth * 0.5 - aboutCellDepth * 0.5 - 0.8;
      const half = aboutSquareSize * 0.5;
      const cellStep = aboutSquareSize / aboutCellDivisions;
      const backCellStep = aboutSquareSize / aboutBackCellDivisions;
      const rimCellThickness = Math.max(
        aboutCellDepth,
        Math.min(cellStep * 0.36, 22),
      );
      const rimDivisions = Math.max(
        6,
        Math.round(aboutSquareSize / Math.max(rimCellThickness, 18)),
      );
      const rimStep = aboutSquareSize / rimDivisions;
      const rimDepthDivisions = Math.max(
        2,
        Math.round(aboutSquareDepth / Math.max(aboutCellDepth, 5)),
      );
      const rimDepthStep = aboutSquareDepth / rimDepthDivisions;
      const tileQuat = new THREE.Quaternion()
        .setFromEuler(tile.rotation)
        .normalize();
      const pushSlot = (
        lx: number,
        ly: number,
        lz: number,
        sx: number,
        sy: number,
        sz: number,
        face: "front" | "back" | "rim",
        u = 0.5,
        v = 0.5,
      ) => {
        const localPos = new THREE.Vector3(lx, ly, lz);
        localPos.applyMatrix4(tile.matrix);
        const halfU = THREE.MathUtils.clamp(sx / aboutSquareSize, 0, 1) * 0.5;
        const halfV = THREE.MathUtils.clamp(sy / aboutSquareSize, 0, 1) * 0.5;
        const u0 = THREE.MathUtils.clamp(u - halfU, 0, 1);
        const v0 = THREE.MathUtils.clamp(v - halfV, 0, 1);
        const u1 = THREE.MathUtils.clamp(u + halfU, 0, 1);
        const v1 = THREE.MathUtils.clamp(v + halfV, 0, 1);
        slots.push({
          worldPosition: localPos,
          worldQuaternion: tileQuat.clone(),
          scale: new THREE.Vector3(sx, sy, sz),
          tileIndex,
          face,
          u,
          v,
          u0,
          v0,
          u1,
          v1,
          contentStrength: face === "front" ? 1 : face === "back" ? 0.82 : 0.68,
        });
      };
      const patternPoints: number[] = [];
      for (let i = 0; i <= aboutCellDivisions; i += 1) {
        const c = -half + i * cellStep;
        patternPoints.push(c, -half, zf + 0.16, c, half, zf + 0.16);
        patternPoints.push(-half, c, zf + 0.16, half, c, zf + 0.16);
      }
      const patternGeom = new THREE.BufferGeometry();
      patternGeom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(patternPoints, 3),
      );
      const patternMat = new THREE.LineBasicMaterial({
        color: 0x7fb9ff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      const patternLines = new THREE.LineSegments(patternGeom, patternMat);
      tile.add(patternLines);
      aboutTileGridLineMatsRef.current.push(patternMat);
      const contentPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(aboutSquareSize, aboutSquareSize),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          toneMapped: false,
          depthWrite: false,
          depthTest: true,
          blending: THREE.NormalBlending,
          side: THREE.DoubleSide,
        }),
      );
      contentPlane.position.set(0, 0, zf + aboutCellDepth * 1.2);
      contentPlane.frustumCulled = false;
      tile.add(contentPlane);
      aboutTileContentMatsRef.current[tileIndex] =
        contentPlane.material as THREE.MeshBasicMaterial;

      // Front surface (high detail)
      for (let row = 0; row < aboutCellDivisions; row += 1) {
        for (let col = 0; col < aboutCellDivisions; col += 1) {
          pushSlot(
            -half + (col + 0.5) * cellStep,
            -half + (row + 0.5) * cellStep,
            zf,
            cellStep,
            cellStep,
            aboutCellDepth,
            "front",
            (col + 0.5) / aboutCellDivisions,
            (row + 0.5) / aboutCellDivisions,
          );
        }
      }

      // Back surface (coarser cells)
      for (let row = 0; row < aboutBackCellDivisions; row += 1) {
        for (let col = 0; col < aboutBackCellDivisions; col += 1) {
          pushSlot(
            -half + (col + 0.5) * backCellStep,
            -half + (row + 0.5) * backCellStep,
            zb,
            backCellStep,
            backCellStep,
            aboutCellDepth,
            "back",
            (col + 0.5) / aboutBackCellDivisions,
            (row + 0.5) / aboutBackCellDivisions,
          );
        }
      }

      // Rim micro-cells for tile thickness reconstruction
      for (let i = 0; i < rimDivisions; i += 1) {
        const c = -half + (i + 0.5) * rimStep;
        const edgeU = (c + half) / aboutSquareSize;
        for (let d = 0; d < rimDepthDivisions; d += 1) {
          const z = -aboutSquareDepth * 0.5 + (d + 0.5) * rimDepthStep;
          // Keep rim cells within the tile silhouette so assembled shape stays clean.
          pushSlot(
            c,
            half - rimCellThickness * 0.5,
            z,
            rimStep,
            rimCellThickness,
            rimDepthStep,
            "rim",
            edgeU,
            0.98,
          );
          pushSlot(
            c,
            -half + rimCellThickness * 0.5,
            z,
            rimStep,
            rimCellThickness,
            rimDepthStep,
            "rim",
            edgeU,
            0.02,
          );
          pushSlot(
            -half + rimCellThickness * 0.5,
            c,
            z,
            rimCellThickness,
            rimStep,
            rimDepthStep,
            "rim",
            0.02,
            edgeU,
          );
          pushSlot(
            half - rimCellThickness * 0.5,
            c,
            z,
            rimCellThickness,
            rimStep,
            rimDepthStep,
            "rim",
            0.98,
            edgeU,
          );
        }
      }
      return tile;
    };
    // Four-square plate cluster: center + three raised wings with parallel orientation.
    const dishLift = aboutSquareSize * 0.048;
    const dishDepth = aboutSquareSize * 0.032;
    const centerZ = -dishDepth * 0.55;
    const outerZ = dishDepth;
    const aboutSlots: AboutCellSlot[] = [];
    const aboutTiles = [
      createAboutTile(0, 0, centerZ, -2.8, 0, 0, 0, aboutSlots),
      createAboutTile(
        -aboutTileSpacing,
        dishLift,
        outerZ,
        -2.8,
        0,
        0,
        1,
        aboutSlots,
      ),
      createAboutTile(
        aboutTileSpacing,
        dishLift,
        outerZ,
        -2.8,
        0,
        0,
        2,
        aboutSlots,
      ),
      createAboutTile(
        0,
        aboutTileSpacing + dishLift * 0.3,
        outerZ,
        -2.8,
        0,
        0,
        3,
        aboutSlots,
      ),
    ];
    aboutSquareRoot.add(...aboutTiles);
    aboutSquareRoot.updateWorldMatrix(true, true);
    aboutCellSlotsRef.current = aboutSlots;
    const aboutCellGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cellCount = aboutSlots.length;
    const uvRects = new Float32Array(cellCount * 4);
    const tileIndexArr = new Float32Array(cellCount);
    const revealArr = new Float32Array(cellCount);
    const strengthArr = new Float32Array(cellCount);
    aboutSlots.forEach((slot, idx) => {
      uvRects[idx * 4 + 0] = slot.u0;
      uvRects[idx * 4 + 1] = slot.v0;
      uvRects[idx * 4 + 2] = slot.u1;
      uvRects[idx * 4 + 3] = slot.v1;
      tileIndexArr[idx] = slot.tileIndex;
      revealArr[idx] = slot.face === "front" ? 0 : 1;
      strengthArr[idx] = slot.contentStrength;
    });
    aboutCellGeometry.setAttribute(
      "instanceUvRect",
      new THREE.InstancedBufferAttribute(uvRects, 4),
    );
    aboutCellGeometry.setAttribute(
      "instanceTileIndex",
      new THREE.InstancedBufferAttribute(tileIndexArr, 1),
    );
    const revealAttr = new THREE.InstancedBufferAttribute(revealArr, 1);
    aboutCellGeometry.setAttribute("instanceReveal", revealAttr);
    aboutCellRevealAttrRef.current = revealAttr;
    aboutCellGeometry.setAttribute(
      "instanceContentStrength",
      new THREE.InstancedBufferAttribute(strengthArr, 1),
    );

    const aboutCellMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTile0: { value: null },
        uTile1: { value: null },
        uTile2: { value: null },
        uTile3: { value: null },
        uBaseColor: { value: new THREE.Color(0x132a44) },
      },
      vertexShader: `
        attribute vec4 instanceUvRect;
        attribute float instanceTileIndex;
        attribute float instanceReveal;
        attribute float instanceContentStrength;
        varying vec2 vUv;
        varying vec4 vUvRect;
        varying float vTileIndex;
        varying float vReveal;
        varying float vContentStrength;
        void main() {
          vUv = uv;
          vUvRect = instanceUvRect;
          vTileIndex = instanceTileIndex;
          vReveal = instanceReveal;
          vContentStrength = instanceContentStrength;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTile0;
        uniform sampler2D uTile1;
        uniform sampler2D uTile2;
        uniform sampler2D uTile3;
        uniform vec3 uBaseColor;
        varying vec2 vUv;
        varying vec4 vUvRect;
        varying float vTileIndex;
        varying float vReveal;
        varying float vContentStrength;
        vec4 sampleTile(float idx, vec2 suv) {
          if (idx < 0.5) return texture2D(uTile0, suv);
          if (idx < 1.5) return texture2D(uTile1, suv);
          if (idx < 2.5) return texture2D(uTile2, suv);
          return texture2D(uTile3, suv);
        }
        void main() {
          vec2 suv = mix(vUvRect.xy, vUvRect.zw, vUv);
          vec4 texel = sampleTile(vTileIndex, suv);
          float reveal = clamp(vReveal, 0.0, 1.0);
          float strength = clamp(vContentStrength, 0.0, 1.0);
          vec3 revealed = mix(uBaseColor, texel.rgb, reveal * strength);
          gl_FragColor = vec4(revealed, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    aboutCellShaderMaterialRef.current = aboutCellMaterial;
    const aboutCells = new THREE.InstancedMesh(
      aboutCellGeometry,
      aboutCellMaterial,
      cellCount,
    );
    aboutCells.name = "AboutMemorySquareCells";
    aboutCells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    aboutCells.frustumCulled = false;
    const baseColor = new THREE.Color(0x132a44);
    aboutFrontSlotIndicesRef.current = [];
    aboutCellBaseColorsRef.current = aboutSlots.map(() => baseColor.clone());
    aboutCellTargetColorsRef.current = aboutSlots.map(() => baseColor.clone());
    aboutCellRevealAtMsRef.current = aboutSlots.map(() => 0);
    const tempMatrix = new THREE.Matrix4();
    const records: AboutCellRecord[] = aboutSlots.map((slot, idx) => {
      tempMatrix.compose(slot.worldPosition, slot.worldQuaternion, slot.scale);
      aboutCells.setMatrixAt(idx, tempMatrix);
      aboutCells.setColorAt(idx, baseColor);
      if (slot.face === "front") {
        aboutFrontSlotIndicesRef.current.push(idx);
      }
      return {
        position: slot.worldPosition.clone(),
        velocity: new THREE.Vector3(),
        quaternion: slot.worldQuaternion.clone(),
        angularVelocity: new THREE.Vector3(),
        burstDirection: new THREE.Vector3(0, 0, 1),
        spinAxisPrimary: new THREE.Vector3(0.53, 0.61, -0.59),
        spinAxisSecondary: new THREE.Vector3(-0.31, 0.88, 0.35),
        spinRatePrimary: 0,
        spinRateSecondary: 0,
        sourceSlotIndex: idx,
        targetSlotIndex: idx,
        pulsePhase: Math.random() * Math.PI * 2,
      };
    });
    aboutCells.instanceMatrix.needsUpdate = true;
    if (aboutCells.instanceColor) {
      aboutCells.instanceColor.needsUpdate = true;
    }
    aboutSquareRoot.add(aboutCells);
    aboutCellRecordsRef.current = records;
    aboutCellMeshRef.current = aboutCells;
    aboutCellAnimationRef.current = {
      phase: "assembledHold",
      phaseStartedAt: performance.now(),
      phaseDurationMs: ABOUT_SWARM_ASSEMBLED_HOLD_MS,
      swarmDurationMs: ABOUT_SWARM_MIN_MS,
      active: true,
      initialized: true,
      lastTickMs: performance.now(),
      distanceGateActive: false,
    };

    const aboutLabel = createLabel("About", "Memory Square");
    aboutLabel.userData.aboutMemorySquareLabel = true;
    aboutLabel.position.set(
      0,
      aboutSquareSize * 1.66,
      aboutSquareDepth * 0.5 + 10,
    );
    aboutSquareRoot.add(aboutLabel);
    aboutMemorySquareLabelRef.current = aboutLabel;
    scene.add(aboutSquareRoot);
    aboutMemorySquareRootRef.current = aboutSquareRoot;

    // 3b. ABOUT PARTICLE SWARM
    if (aboutParticleSwarmRef.current) {
      aboutParticleSwarmRef.current.dispose();
    }
    if (aboutMjolnirRef.current) {
      aboutMjolnirRef.current.dispose();
    }
    const mjolnir = new MjolnirRider();
    mjolnir.addTo(scene);
    aboutMjolnirRef.current = mjolnir;
    void mjolnir
      .load(new GLTFLoader(), MJOLNIR_MODEL_PATH)
      .then(() => mjolnir.warmUp(() => sceneRef.current.camera))
      .catch((err) => {
        console.warn("[About] Mjolnir failed to load; ride ends without it", err);
      });

    const swarm = createAboutParticleSwarm(ABOUT_PARTICLE_SWARM_WORLD_ANCHOR);
    scene.add(swarm.group);
    aboutParticleSwarmRef.current = swarm;
    if (rendererRef.current && sceneRef.current.camera) {
      swarm.compile(rendererRef.current, scene, sceneRef.current.camera);
    }

    // 3c. ABOUT JOURNEY CONTROLLER
    if (aboutJourneyRef.current) {
      aboutJourneyRef.current.dispose();
    }
    const shipFlyForward = new THREE.Vector3();
    const shipFlyLookAt = new THREE.Vector3();
    // Mjolnir's point-of-impact flash when it smashes the rail.
    const aboutImpactFlash = new ImpactFlash(scene);
    {
      const warmRenderer = rendererRef.current;
      const warmCamera = sceneRef.current.camera;
      if (warmRenderer && warmCamera) {
        aboutImpactFlash.warmUp(warmRenderer, warmCamera, scene);
      }
    }
    aboutJourneyRef.current = new AboutJourneyController({
      onRailImpact(point: THREE.Vector3) {
        aboutImpactFlash.trigger(point);
      },
      hideShip() {
        if (spaceshipRef.current) spaceshipRef.current.visible = false;
      },
      showShip() {
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
      },
      setShipPose(position: THREE.Vector3, forward: THREE.Vector3) {
        const ship = spaceshipRef.current;
        if (!ship) return;
        ship.visible = true;
        ship.position.copy(position);
        shipFlyForward.copy(forward);
        if (shipFlyForward.lengthSq() > 0.0001) {
          shipFlyForward.normalize();
          shipFlyLookAt.copy(position).add(shipFlyForward);
          ship.lookAt(shipFlyLookAt);
        }
      },
      setShipScale(multiplier: number) {
        spaceshipRef.current?.scale.setScalar(FALCON_SCALE * multiplier);
      },
      setFollowingSpaceship(v: boolean) {
        followingSpaceshipRef.current = v;
        setFollowingSpaceship(v);
      },
      setAutopilotSuppressed(v: boolean) {
        aboutJourneyAutopilotSuppressedRef.current = v;
        // The journey has taken the ship: finish the trip to About so the
        // autopilot doesn't resume it after the ride (slowly flying back) and
        // the targeting monitor doesn't stay up over the ride.
        if (v) completeActiveNavigationRef.current?.("about-journey-takeover");
      },
      onPathFormingStart() {
        // The skip-the-particle-path prompt is no longer offered: formation
        // is fast now, so the cinematic always plays.
      },
      getRideCompanion() {
        return aboutMjolnirRef.current;
      },
      disableControls() {
        const ctrl = sceneRef.current.controls;
        if (ctrl) ctrl.enabled = false;
      },
      enableControls() {
        const ctrl = sceneRef.current.controls;
        if (!ctrl) return;
        ctrl.enabled = true;
        const j = aboutJourneyRef.current;
        if (j && j.phase !== AboutJourneyPhase.IDLE) {
          if (!aboutJourneyCameraDistSavedRef.current) {
            aboutJourneyCameraDistSavedRef.current = {
              min: ctrl.minDistance,
              max: ctrl.maxDistance,
            };
          }
          ctrl.minDistance = ABOUT_JOURNEY_CAM_MIN_DIST;
          ctrl.maxDistance = ABOUT_JOURNEY_CAM_MAX_DIST;
        }
      },
      onPathDispersalStarted() {
        // The same swarm fades back in at the About anchor while the path
        // bursts, so nothing is built at the end of the ride.
      },
      onPathDispersalComplete() {
        const ctrl = sceneRef.current.controls;
        const saved = aboutJourneyCameraDistSavedRef.current;
        if (ctrl && saved) {
          ctrl.minDistance = saved.min;
          ctrl.maxDistance = saved.max;
          aboutJourneyCameraDistSavedRef.current = null;
        }
      },
      onAboutJourneyExit() {
        const ctrl = sceneRef.current.controls;
        const saved = aboutJourneyCameraDistSavedRef.current;
        if (ctrl && saved) {
          ctrl.minDistance = saved.min;
          ctrl.maxDistance = saved.max;
          aboutJourneyCameraDistSavedRef.current = null;
        }
        const hy = aboutHydrateSwarmRef.current;
        if (hy) {
          hy.dispose();
          aboutHydrateSwarmRef.current = null;
        }
      },
      getCamera() {
        return sceneRef.current.camera ?? null;
      },
      getControls() {
        return (sceneRef.current.controls as CameraControls) ?? null;
      },
      getShipPosition() {
        return spaceshipRef.current?.position.clone() ?? null;
      },
      getSwarmWorldPosition() {
        const s = aboutParticleSwarmRef.current;
        return s ? s.group.getWorldPosition(new THREE.Vector3()) : null;
      },
      vlog,
    });
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__aboutDebug = {
        journey: () => aboutJourneyRef.current,
        swarm: () => aboutParticleSwarmRef.current,
        hydrate: () => aboutHydrateSwarmRef.current,
        mjolnir: () => aboutMjolnirRef.current,
        camera: () => sceneRef.current.camera,
        renderer: () => rendererRef.current,
      };
    }

    // 4. MOONS
    const experienceJobs = Object.values(resumeData.experience).flat();
    const experienceCount = experienceJobs.length || 1;
    const experienceStartOffset = Math.PI * 0.15;
    const experienceMoonMeshes: THREE.Mesh[] = [];

    experienceJobs.forEach((job, i) => {
      const overlayTextureUrl =
        EXPERIENCE_MOON_OVERLAY_TEXTURE_BY_JOB_ID[job.id];
      const baseTextureUrl =
        EXPERIENCE_MOON_BASE_TEXTURES[i % EXPERIENCE_MOON_BASE_TEXTURES.length];

      // Job moons should be clickable with section index 2+i
      // (section 0 = hero+summary, section 1 = skills, sections 2+ = jobs)
      const moonMesh = createPlanet(
        job.company,
        EXP_MOON_ORBIT_BASE + i * EXP_MOON_ORBIT_STEP,
        EXP_MOON_RADIUS,
        0xffaadd,
        expPlanet,
        0.002 + Math.random() * 0.001,
        2 + i,
        baseTextureUrl,
        experienceStartOffset + (i * Math.PI * 2) / experienceCount,
        {
          enabled: false,
        },
        {
          enabled: true,
          textureUrl:
            "https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/clouds/clouds.png",
          altitude: 0.006,
          opacity: 0.42,
          rotationSpeed: -0.0001 - Math.random() * 0.00008,
          segments: 64,
        },
        {
          enabled: true,
          textureUrl: overlayTextureUrl,
          opacity: 0.5,
        },
      );

      const greyShades = [255, 220, 180, 140, 100, 60, 0];
      const makeRingInterpolator = () => {
        const v =
          greyShades[Math.floor(Math.random() * greyShades.length)] ?? 200;
        return (t: number) =>
          `rgba(${v},${v},${v},${Math.sqrt(Math.max(0, 1 - t))})`;
      };
      const ringCount = 3 + Math.floor(Math.random() * 7);
      const ringData = Array.from({ length: ringCount }, () => ({
        lat: (Math.random() - 0.5) * 180,
        lng: (Math.random() - 0.5) * 360,
        maxR: Math.random() * 20 + 3,
        propagationSpeed: (Math.random() - 0.5) * 20 + 1,
        repeatPeriod: Math.random() * 2000 + 200,
        colorInterpolator: makeRingInterpolator(),
      }));
      const moonRingsGlobe = new ThreeGlobe({
        waitForGlobeReady: false,
        animateIn: false,
      })
        .showGlobe(false)
        .showAtmosphere(false)
        .ringsData(ringData)
        .ringColor((d: any) => d.colorInterpolator)
        .ringMaxRadius("maxR")
        .ringPropagationSpeed("propagationSpeed")
        .ringRepeatPeriod("repeatPeriod");
      const ringsScale = EXP_MOON_RADIUS / moonRingsGlobe.getGlobeRadius();
      moonRingsGlobe.scale.setScalar(ringsScale);
      moonMesh.add(moonRingsGlobe as unknown as THREE.Object3D);

      experienceMoonMeshes.push(moonMesh);

      // Register moon with position emitter for tracking
      const moonId = `moon-${job.id}`;
      moonMesh.userData.moonId = moonId;
      emitterRef.current.registerObject(moonId, moonMesh, 16); // 60fps updates

      // Remove the rotation that might be causing visual issues
      // moon.rotation.x = Math.PI / 2;
    });

    // Route inputs for the About roller coaster. Nothing orbits, so world
    // positions captured here stay valid; Portfolio cores are built later and
    // are read when a path starts forming.
    {
      scene.updateMatrixWorld(true);
      const worldOf = (obj: THREE.Object3D) =>
        obj.getWorldPosition(new THREE.Vector3());
      const expPlanetCenter = worldOf(expPlanet);
      const moonBodies = experienceMoonMeshes.map((mesh) => ({
        center: worldOf(mesh),
        radius: EXP_MOON_RADIUS + ABOUT_ROUTE_MOON_CLEARANCE,
      }));

      // The legacy loop (Skills, Portfolio, Memory Squares and up to three
      // moons) sets the formation and ride durations the new route keeps.
      const legacyMoons: THREE.Vector3[] = [];
      const legacyPickCount = Math.min(3, moonBodies.length);
      for (let mi = 0; mi < legacyPickCount; mi++) {
        const idx = Math.floor((mi * moonBodies.length) / legacyPickCount);
        legacyMoons.push(moonBodies[idx].center);
      }
      // Measured on the original layout's coordinates, so formation and ride
      // pacing stay the same after destinations were spread farther apart.
      const referenceLength = legacyLoopLength(
        new THREE.Vector3(13723.38, 157.5, 5556.945),
        [
          new THREE.Vector3(13600, 220, -12000),
          new THREE.Vector3(1158.5, 157.5, 14760.375),
          new THREE.Vector3(-12000, 520, -13200),
          ...legacyMoons,
        ],
      );

      const skillsCenter = SKILLS_LATTICE_WORLD_ANCHOR.clone().add(
        new THREE.Vector3(0, 8, 0),
      );
      aboutJourneyRef.current?.setRouteConfigProvider(() => {
        const portfolioAnchor =
          orbitalPortfolioWorldAnchorRef.current ??
          ORBITAL_PORTFOLIO_WORLD_ANCHOR;
        const cores = orbitalPortfolioCoresRef.current ?? [];
        const portfolioColumns = Math.max(1, Math.ceil(Math.sqrt(cores.length)));
        // Ride order: the sun-and-planets (Experience) system, Skills,
        // Portfolio, Career Gallery, then back to About.
        const stops: RouteStop[] = [
          {
            // Straight over the planet, above the moons' plane, so the whole
            // system sweeps past beneath the rider.
            name: "Experience",
            center: expPlanetCenter.clone(),
            passRadius:
              EXP_MOON_ORBIT_BASE +
              EXP_MOON_ORBIT_STEP * moonBodies.length +
              600,
            passOffset: new THREE.Vector3(0, 480, 0),
          },
          {
            // Slow while inside the lattice; the view turns to the crystals.
            name: "Skills",
            center: skillsCenter.clone(),
            passRadius: 520,
            slowOuter: 650,
          },
          {
            // Level pass just above the cluster grid: clusters slide by
            // beneath instead of forcing detours through the pass.
            name: "Portfolio",
            center: portfolioAnchor.clone(),
            passOffset: new THREE.Vector3(0, 420, 0),
            passRadius: portfolioColumns * 1260 * 0.5 + 500,
          },
          {
            // Slow outside, far enough that the whole shell fits in view
            // (~R / sin(fov/2) ≈ 2.6R), then speed through the middle.
            name: "Career Gallery",
            center: CAREER_GALLERY_WORLD_ANCHOR.clone(),
            passRadius: CAREER_GALLERY_RADIUS * 1.4,
            slowInner: CAREER_GALLERY_RADIUS * 2.65,
            slowOuter: CAREER_GALLERY_RADIUS * 4.2,
          },
        ];
        const obstacles: RouteObstacle[] = [
          {
            center: new THREE.Vector3(0, 0, 0),
            radius: SUN_OBSTACLE_RADIUS + 900,
          },
          { center: expPlanetCenter, radius: EXPERIENCE_RADIUS + 220 },
          ...moonBodies,
          { center: ABOUT_MEMORY_SQUARE_WORLD_ANCHOR.clone(), radius: 820 },
          ...cores.map((core) => ({
            center: portfolioAnchor.clone().add(core.centerLocal),
            radius: 260,
          })),
        ];
        return { stops, obstacles, referenceLength };
      });
    }

    // Skills constellation lattice (unique skills representation)
    const skillsLatticeRoot = new THREE.Group();
    skillsLatticeRoot.name = "SkillsConstellationLattice";
    skillsLatticeRoot.position
      .copy(skillsAnchor)
      .add(new THREE.Vector3(0, 8, 0));
    skillsLatticeRoot.visible = true;
    // Cores are the top-level tech stack nodes (Admin → Portfolio → Tech stack).
    const categoryEntries = techStack;
    const categoryNodeRadius = 3.2;
    const skillNodeRadius = 1.25;
    const latticeRadius = 58;
    const latticeEnvelopeRadius = 396;
    const latticeNodes: SkillsLatticeNodeRecord[] = [];
    const latticeLinkSegments: SkillsLatticeLinkSegment[] = [];

    // Muted, larger outer "glass drone" shell around the lattice.
    const latticeEnvelopeGeometryBase = new THREE.IcosahedronGeometry(
      latticeEnvelopeRadius,
      1,
    );
    const latticeEnvelopeGeometry = latticeEnvelopeGeometryBase.index
      ? latticeEnvelopeGeometryBase.toNonIndexed()
      : latticeEnvelopeGeometryBase;
    const envelopePosAttr = latticeEnvelopeGeometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const envelopeColors = new Float32Array(envelopePosAttr.count * 3);
    const envelopePalette = [
      new THREE.Color(0x2f6fff), // electric cobalt
      new THREE.Color(0x27dcff), // neon cyan
      new THREE.Color(0x6f47ff), // strong violet
      new THREE.Color(0xdb43ff), // strong magenta
      new THREE.Color(0x28e0b7), // vivid teal
      new THREE.Color(0xffb13a), // stained-glass amber
    ];
    const envelopeWork = new THREE.Color();
    for (let i = 0; i < envelopePosAttr.count; i += 3) {
      // Keep each triangle on a single, visibly distinct hue.
      // Using coarse buckets creates larger perceived stained-glass regions.
      const bucket = Math.floor(i / 3 / 4) % envelopePalette.length;
      envelopeWork.copy(envelopePalette[bucket]);
      const hsl = { h: 0, s: 0, l: 0 };
      envelopeWork.getHSL(hsl);
      envelopeWork.setHSL(
        hsl.h,
        Math.min(1, hsl.s * 1.18),
        Math.min(0.74, hsl.l * 1.06),
      );
      const shadeJitter = 1.02 + Math.random() * 0.1;
      envelopeWork.multiplyScalar(shadeJitter);
      for (let v = 0; v < 3; v += 1) {
        const idx = (i + v) * 3;
        envelopeColors[idx] = envelopeWork.r;
        envelopeColors[idx + 1] = envelopeWork.g;
        envelopeColors[idx + 2] = envelopeWork.b;
      }
    }
    latticeEnvelopeGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(envelopeColors, 3),
    );
    const latticeEnvelope: THREE.Mesh<THREE.BufferGeometry, THREE.Material> =
      new THREE.Mesh(
        latticeEnvelopeGeometry,
        new THREE.MeshPhongMaterial({
          color: 0xffffff,
          vertexColors: true,
          flatShading: true,
          shininess: 90,
          specular: new THREE.Color(0xc9e8ff),
          emissive: 0x101828,
          emissiveIntensity: 0.08,
          transparent: false,
          opacity: 1,
          side: THREE.FrontSide,
          depthWrite: true,
        }),
      );
    (latticeEnvelope.material as THREE.MeshPhongMaterial).toneMapped = false;
    latticeEnvelope.renderOrder = 1;
    const latticeEnvelopeEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(latticeEnvelope.geometry),
      new THREE.LineBasicMaterial({
        color: 0xaed9ff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    latticeEnvelopeEdges.scale.setScalar(1.004);
    latticeEnvelope.add(latticeEnvelopeEdges);
    skillsLatticeRoot.add(latticeEnvelope);
    skillsLatticeEnvelopeRef.current = latticeEnvelope;
    skillsLatticeEnvelopeMatRef.current =
      latticeEnvelope.material as THREE.MeshPhongMaterial;
    const envelopeBasicMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: false,
      opacity: 1,
      side: THREE.FrontSide,
      depthWrite: true,
      toneMapped: false,
    });
    latticeEnvelope.material = envelopeBasicMat;
    skillsLatticeEnvelopeBasicMatRef.current = envelopeBasicMat;
    skillsLatticeEnvelopeEdgeMatRef.current =
      latticeEnvelopeEdges.material as THREE.LineBasicMaterial;
    skillsLatticeEnvelopeRadiusRef.current = latticeEnvelopeRadius;

    // Interior caustic-like drift lights (subtle, only noticeable inside).
    const causticLights: THREE.PointLight[] = [];
    const causticPalette = [0x6fc7ff, 0x9f86ff, 0x67e2d2];
    causticPalette.forEach((color, idx) => {
      const light = new THREE.PointLight(color, 0.2, 540, 2);
      light.position.set(0, 4 + idx * 3, 0);
      skillsLatticeRoot.add(light);
      causticLights.push(light);
    });
    skillsLatticeCausticLightsRef.current = causticLights;

    // Long-range beacon shell: visible from afar and clickable for Skills travel.
    const beaconGeom = latticeEnvelopeGeometry.clone();
    const beaconMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      vertexColors: true,
      flatShading: true,
      shininess: 96,
      specular: new THREE.Color(0xd9efff),
      emissive: 0x121a2a,
      emissiveIntensity: 0.1,
      transparent: true,
      opacity: 0,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    beaconMat.toneMapped = false;
    const skillsBeacon = new THREE.Mesh(beaconGeom, beaconMat);
    skillsBeacon.position.copy(skillsLatticeRoot.position);
    skillsBeacon.userData.sectionIndex = 2;
    skillsBeacon.userData.planetName = "Skills";
    skillsBeacon.userData.sectionId = "skills";
    skillsBeacon.renderOrder = 1;
    skillsBeacon.frustumCulled = false;
    const beaconEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(beaconGeom),
      new THREE.LineBasicMaterial({
        color: 0x8fcbff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    beaconEdges.scale.setScalar(1.004);
    skillsBeacon.add(beaconEdges);
    const beaconLabel = createLabel("Skills", "Constellation Lattice");
    beaconLabel.userData.skillsLatticeLabel = true;
    beaconLabel.position.set(0, latticeEnvelopeRadius * 0.82, 0);
    const labelEl = (beaconLabel as unknown as { element?: HTMLElement })
      .element;
    if (labelEl) {
      labelEl.style.pointerEvents = "none";
      labelEl.style.textShadow = "0 0 10px rgba(120,190,255,0.9)";
      const title = labelEl.firstElementChild as HTMLElement | null;
      if (title) {
        title.style.fontSize = "22px";
        title.style.letterSpacing = "1.5px";
      }
    }
    skillsBeacon.add(beaconLabel);
    scene.add(skillsBeacon);
    clickablePlanets.push(skillsBeacon);
    skillsLatticeBeaconRef.current = skillsBeacon;
    skillsLatticeBeaconMatRef.current = beaconMat;
    skillsLatticeBeaconEdgeMatRef.current =
      beaconEdges.material as THREE.LineBasicMaterial;
    skillsLatticeBeaconLabelRef.current = beaconLabel;

    // Orbital Registry Portfolio beacon + dedicated scene root
    const portfolioAnchor = ORBITAL_PORTFOLIO_WORLD_ANCHOR.clone();
    orbitalPortfolioWorldAnchorRef.current = portfolioAnchor.clone();
    // Keep Portfolio target clickable without rendering a visible outer shell.
    const portfolioBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(180, 18, 18),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    portfolioBeacon.position.copy(portfolioAnchor);
    portfolioBeacon.userData.sectionIndex = 4;
    portfolioBeacon.userData.planetName = "Portfolio";
    portfolioBeacon.userData.sectionId = "portfolio";
    const portfolioLabel = createLabel("Portfolio", "Orbital Registry");
    portfolioLabel.userData.orbitalPortfolioLabel = true;
    portfolioLabel.position.set(0, 170, 0);
    portfolioBeacon.add(portfolioLabel);
    scene.add(portfolioBeacon);
    clickablePlanets.push(portfolioBeacon);
    orbitalPortfolioBeaconRef.current = portfolioBeacon;

    const orbitalRoot = new THREE.Group();
    orbitalRoot.name = "OrbitalPortfolioRoot";
    orbitalRoot.position.copy(portfolioAnchor);
    orbitalRoot.visible = true;
    const orbitalBuild = portfolioCoreBuild;
    const orbitalGroups = orbitalBuild.groups;
    const orbitalCoreViews = orbitalBuild.cores;
    orbitalPortfolioGroupsRef.current = orbitalGroups;
    orbitalPortfolioCoreViewsRef.current = orbitalCoreViews;
    setOrbitalRegistrySelectedCoreId(orbitalCoreViews[0]?.id ?? "");
    setOrbitalPortfolioFocusedCoreId(orbitalCoreViews[0]?.id ?? "");
    const coreSpacing = 1260;
    const coreColumns = Math.max(
      1,
      Math.ceil(Math.sqrt(Math.max(1, orbitalCoreViews.length))),
    );
    const coreRecords: OrbitalPortfolioCoreRecord[] = [];
    const corePickMeshes: THREE.Mesh[] = [];
    const coreCardOccluders: THREE.Mesh[] = [];
    const outerRings: THREE.Line[] = [];
    const connectorLines: THREE.Line[] = [];
    const matterGroup = new THREE.Group();
    orbitalRoot.add(matterGroup);
    orbitalPortfolioMatterGroupRef.current = matterGroup;
    const createOrbitalHaloTexture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.25, "rgba(170,230,255,0.5)");
      grad.addColorStop(0.58, "rgba(80,180,220,0.16)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const orbitalHaloTexture = createOrbitalHaloTexture();
    const createImpactTexture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(255,255,255,0.96)");
      grad.addColorStop(0.32, "rgba(255,255,255,0.62)");
      grad.addColorStop(0.7, "rgba(255,255,255,0.12)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const impactTexture = createImpactTexture();

    orbitalCoreViews.forEach((coreView, coreIndex) => {
      const coreColor = new THREE.Color(coreView.coreColor);
      const nucleusColor = coreColor
        .clone()
        .lerp(new THREE.Color(0xffffff), 0.42);
      const glowColor = coreColor.clone().lerp(new THREE.Color(0xffffff), 0.18);
      const coreRow = Math.floor(coreIndex / coreColumns);
      const coreCol = coreIndex % coreColumns;
      const centerLocal = new THREE.Vector3(
        (coreCol - (coreColumns - 1) * 0.5) * coreSpacing,
        0,
        (coreRow -
          (Math.ceil(orbitalCoreViews.length / coreColumns) - 1) * 0.5) *
          coreSpacing,
      );

      const coreRoot = new THREE.Group();
      coreRoot.name = `OrbitalPortfolioCoreLattice-${coreView.id}`;
      coreRoot.position.copy(centerLocal);
      const coreNucleus = new THREE.Mesh(
        new THREE.SphereGeometry(17, 28, 28),
        new THREE.MeshBasicMaterial({
          color: nucleusColor,
          transparent: true,
          opacity: 0.88,
          toneMapped: false,
        }),
      );
      coreNucleus.userData.orbitalPickKind = "core";
      coreNucleus.userData.orbitalCoreId = coreView.id;
      corePickMeshes.push(coreNucleus);
      const coreGlow = new THREE.Mesh(
        new THREE.SphereGeometry(34, 20, 20),
        new THREE.MeshBasicMaterial({
          color: glowColor,
          transparent: true,
          opacity: 0.26,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      const coreCardOccluder = new THREE.Mesh(
        new THREE.SphereGeometry(48, 16, 16),
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          colorWrite: false,
          depthWrite: true,
          depthTest: true,
          toneMapped: false,
        }),
      );
      coreCardOccluder.renderOrder = -10;
      coreCardOccluder.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      coreCardOccluders.push(coreCardOccluder);
      coreRoot.add(coreCardOccluder);
      const shellColorAttr = null;
      const shellBaseColors = null;
      const slicePalette = [0x78e6ff, 0x88a2ff, 0xa9ffcf, 0xffa6f5, 0xffd084];
      const sliceGroup = new THREE.Group();
      const sliceMats: THREE.MeshBasicMaterial[] = [];
      for (let i = 0; i < slicePalette.length; i += 1) {
        const sliceMat = new THREE.MeshBasicMaterial({
          color: slicePalette[i],
          transparent: true,
          opacity: 0.38,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        });
        const slice = new THREE.Mesh(
          new THREE.TorusGeometry(30 + i * 2.2, 0.95, 10, 72),
          sliceMat,
        );
        slice.rotation.set(
          i * 0.46 + Math.PI * 0.13,
          i * 0.72 + Math.PI * 0.08,
          i * 0.34,
        );
        sliceGroup.add(slice);
        sliceMats.push(sliceMat);
      }
      const rayGroup = new THREE.Group();
      const rayMats: THREE.LineBasicMaterial[] = [];
      const rayCount = 16;
      for (let i = 0; i < rayCount; i += 1) {
        const a = (i / rayCount) * Math.PI * 2;
        const dir = new THREE.Vector3(
          Math.cos(a),
          Math.sin(i * 0.47) * 0.24,
          Math.sin(a),
        ).normalize();
        const rayMat = new THREE.LineBasicMaterial({
          color: slicePalette[i % slicePalette.length],
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        });
        const ray = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            dir.clone().multiplyScalar(36),
            dir.clone().multiplyScalar(78 + (i % 3) * 8),
          ]),
          rayMat,
        );
        rayGroup.add(ray);
        rayMats.push(rayMat);
      }
      coreRoot.add(coreNucleus, coreGlow, sliceGroup, rayGroup);
      const coreLabel = createLabel(coreView.title, "Orbital Core");
      coreLabel.userData.orbitalPortfolioLabel = true;
      coreLabel.userData.orbitalPortfolioCoreLabel = true;
      coreLabel.position.set(0, 72, 0);
      coreRoot.add(coreLabel);
      orbitalRoot.add(coreRoot);
      const coreRecord: OrbitalPortfolioCoreRecord = {
        id: coreView.id,
        title: coreView.title,
        centerLocal: centerLocal.clone(),
        root: coreRoot,
        nucleus: coreNucleus,
        glow: coreGlow,
        sliceGroup,
        sliceMats,
        rayMats,
        panelMat: null,
        panelColorAttr: shellColorAttr,
        panelBaseColors: shellBaseColors,
        outerOrbit: new THREE.Line(),
      };
      coreRecords.push(coreRecord);

      coreView.plains.forEach((plainView) => {
        const plainQuat = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          THREE.MathUtils.degToRad(plainView.angle),
        );
        plainView.rings.forEach((ringView, ringIndex) => {
          const radius = 130 + ringIndex * 62;
          const pts = Array.from({ length: 180 }, (_, i) => {
            const a = (i / 180) * Math.PI * 2;
            return new THREE.Vector3(
              Math.cos(a) * radius,
              0,
              Math.sin(a) * radius,
            )
              .applyQuaternion(plainQuat)
              .add(centerLocal);
          });
          const ringLine = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({
              color: new THREE.Color(ringView.orbitColor),
              transparent: true,
              opacity: ringIndex === 0 ? 0.65 : 0.35,
              depthWrite: false,
            }),
          );
          orbitalRoot.add(ringLine);
          if (ringIndex === plainView.rings.length - 1) {
            coreRecord.outerOrbit = ringLine;
            outerRings.push(ringLine);
          }
        });
      });
    });

    for (let i = 0; i < coreRecords.length - 1; i += 1) {
      const from = coreRecords[i]?.centerLocal;
      const to = coreRecords[i + 1]?.centerLocal;
      if (!from || !to) continue;
      const connector = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]),
        new THREE.LineBasicMaterial({
          color: 0x88d7ff,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }),
      );
      orbitalRoot.add(connector);
      connectorLines.push(connector);
    }

    const ringCountByKey = new Map<string, number>();
    const ringDirectionByKey = new Map<string, 1 | -1>();
    orbitalGroups.forEach((group) => {
      const key = `${group.coreId ?? "default"}|${group.plainIndex ?? 0}|${group.ringIndex ?? 0}`;
      ringCountByKey.set(key, (ringCountByKey.get(key) ?? 0) + 1);
    });
    const ringSlotCursor = new Map<string, number>();
    const coreById = new Map(
      coreRecords.map((core) => [core.id, core] as const),
    );
    const stationRecords: OrbitalPortfolioStationRecord[] = [];
    orbitalGroups.forEach((group, idx) => {
      const coreId = group.coreId ?? coreRecords[0]?.id ?? "core-default";
      const coreRecord = coreById.get(coreId);
      if (!coreRecord) return;
      const plainIndex = group.plainIndex ?? 0;
      const ringIndex = group.ringIndex ?? 0;
      const plainAngle = group.plainAngle ?? 0;
      const ringKey = `${coreId}|${plainIndex}|${ringIndex}`;
      const laneCount = Math.max(1, ringCountByKey.get(ringKey) ?? 1);
      const laneSlot = ringSlotCursor.get(ringKey) ?? 0;
      ringSlotCursor.set(ringKey, laneSlot + 1);
      const t = laneSlot / laneCount;
      const a = t * Math.PI * 2;
      const orbitRadius = 130 + ringIndex * 62;
      const orbitVerticalAmp = 20;
      if (!ringDirectionByKey.has(ringKey)) {
        ringDirectionByKey.set(ringKey, ringIndex % 2 === 0 ? 1 : -1);
      }
      const orbitDirection = ringDirectionByKey.get(ringKey) ?? 1;
      const plainQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        THREE.MathUtils.degToRad(plainAngle),
      );
      const stationGroup = new THREE.Group();
      const startLocalPos = new THREE.Vector3(
        Math.cos(a) * orbitRadius,
        0,
        Math.sin(a) * orbitRadius,
      )
        .applyQuaternion(plainQuat)
        .add(coreRecord.centerLocal);
      stationGroup.position.copy(startLocalPos);
      const lane = (idx % 2) as 0 | 1;
      stationGroup.userData.orbitalLane = lane;
      const ringGeo = new THREE.BufferGeometry().setFromPoints([
        coreRecord.centerLocal.clone(),
        stationGroup.position.clone(),
      ]);
      const ring = new THREE.Line(
        ringGeo,
        new THREE.LineBasicMaterial({
          color: new THREE.Color(group.orbitColor ?? "#62D8FF"),
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      ring.visible = false;
      const frameGeom = new THREE.PlaneGeometry(78, 48, 24, 1);
      const plateGeom = new THREE.PlaneGeometry(72, 42, 24, 1);
      const frame = new THREE.Mesh(
        frameGeom,
        new THREE.MeshBasicMaterial({
          color: 0xd8f3ff,
          transparent: true,
          opacity: 0.02,
          side: THREE.DoubleSide,
          toneMapped: false,
          depthWrite: false,
        }),
      );
      const plate = new THREE.Mesh(
        plateGeom,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.04,
          side: THREE.DoubleSide,
          toneMapped: false,
          depthWrite: false,
        }),
      );
      plate.userData.hasLoadedTexture = false;
      plate.userData.textureScrollNorm = 0;
      plate.userData.textureMaxOffsetY = 0;
      const framePosAttr = frameGeom.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      const platePosAttr = plateGeom.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      framePosAttr.setUsage(THREE.DynamicDrawUsage);
      platePosAttr.setUsage(THREE.DynamicDrawUsage);
      const frameFlatPositions = new Float32Array(
        framePosAttr.array as Float32Array,
      );
      const plateFlatPositions = new Float32Array(
        platePosAttr.array as Float32Array,
      );
      // Keep the original subtle curvature profile from the single-core version.
      const frameArc = 78 / 320;
      const plateArc = 72 / 320;
      const frameCurvedPositions = buildCurvedPanelPositions(
        frameFlatPositions,
        78,
        frameArc,
      );
      const plateCurvedPositions = buildCurvedPanelPositions(
        plateFlatPositions,
        72,
        plateArc,
      );
      morphPanelGeometry(
        framePosAttr,
        frameCurvedPositions,
        frameFlatPositions,
        0,
      );
      morphPanelGeometry(
        platePosAttr,
        plateCurvedPositions,
        plateFlatPositions,
        0,
      );
      frame.position.z = -0.8;
      stationGroup.add(frame, plate);
      const cardTitleMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
        toneMapped: false,
        depthWrite: false,
      });
      const cardTitleMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(62, 6),
        cardTitleMat,
      );
      cardTitleMesh.position.set(0, 28.5, 1.2);
      cardTitleMesh.visible = false;
      stationGroup.add(cardTitleMesh);

      const cardVariantTabs: Array<{
        mesh: THREE.Mesh;
        frame: THREE.Mesh;
        variantIndex: number;
      }> = [];
      const variantTabStartX = -24;
      const variantTabGap = 11.5;
      for (
        let variantIndex = 0;
        variantIndex < ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS;
        variantIndex += 1
      ) {
        const tabFrame = new THREE.Mesh(
          new THREE.PlaneGeometry(10.9, 3.9),
          new THREE.MeshBasicMaterial({
            color: 0x9adfff,
            transparent: true,
            opacity: 0.42,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        const tabMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(10.2, 3.15),
          new THREE.MeshBasicMaterial({
            color: 0x102742,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        tabFrame.position.set(
          variantTabStartX + variantIndex * variantTabGap,
          23.2,
          1.16,
        );
        tabMesh.position.set(
          variantTabStartX + variantIndex * variantTabGap,
          23.2,
          1.2,
        );
        tabFrame.visible = false;
        tabMesh.visible = false;
        stationGroup.add(tabFrame, tabMesh);
        cardVariantTabs.push({ mesh: tabMesh, frame: tabFrame, variantIndex });
      }

      const cardThumbMeshes: Array<{
        mesh: THREE.Mesh;
        frame: THREE.Mesh;
        mediaIndex: number;
      }> = [];
      const thumbStartX = -23;
      const thumbGap = 9.3;
      for (
        let mediaIndex = 0;
        mediaIndex < ORBITAL_PORTFOLIO_CARD_MAX_THUMBS;
        mediaIndex += 1
      ) {
        const thumbFrame = new THREE.Mesh(
          new THREE.PlaneGeometry(8.26, 5.26),
          new THREE.MeshBasicMaterial({
            color: 0x8ed4ff,
            transparent: true,
            opacity: 0.58,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        const thumbMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(7.7, 4.7),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        thumbFrame.position.set(
          thumbStartX + mediaIndex * thumbGap,
          -23.8,
          1.16,
        );
        thumbMesh.position.set(thumbStartX + mediaIndex * thumbGap, -23.8, 1.2);
        thumbFrame.visible = false;
        thumbMesh.visible = false;
        thumbFrame.userData.orbitalBaseX = thumbFrame.position.x;
        thumbFrame.userData.orbitalBaseY = thumbFrame.position.y;
        thumbMesh.userData.orbitalBaseX = thumbMesh.position.x;
        thumbMesh.userData.orbitalBaseY = thumbMesh.position.y;
        stationGroup.add(thumbFrame, thumbMesh);
        cardThumbMeshes.push({
          mesh: thumbMesh,
          frame: thumbFrame,
          mediaIndex,
        });
      }
      const createThumbNav = (
        direction: "prev" | "next",
        x: number,
        y = -23.8,
      ): {
        mesh: THREE.Mesh;
        frame: THREE.Mesh;
        direction: "prev" | "next";
      } => {
        const navFrame = new THREE.Mesh(
          new THREE.PlaneGeometry(2.7, 2.9),
          new THREE.MeshBasicMaterial({
            color: 0x0b0f18,
            transparent: true,
            opacity: 0.84,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        const navMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(2.4, 2.6),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.94,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        const arrowTexture = createDetailTexture(
          [direction === "prev" ? "‹" : "›"],
          {
            width: 256,
            height: 256,
            bgColor: "rgba(0,0,0,0)",
            showLine: false,
            textColor: "rgba(229,243,255,0.98)",
            fontSize: 162,
            lineSpacing: 168,
            textAlign: "center",
            padding: 128,
            centerBlock: true,
            fontFamily: "Rajdhani, sans-serif",
            fontWeight: 700,
            crispUI: true,
          },
        );
        navMesh.material.map = arrowTexture;
        navFrame.position.set(x, y, 1.16);
        navMesh.position.set(x, y, 1.2);
        navFrame.visible = false;
        navMesh.visible = false;
        stationGroup.add(navFrame, navMesh);
        return { mesh: navMesh, frame: navFrame, direction };
      };
      const cardThumbNavMeshes = [
        createThumbNav("prev", -31.2),
        createThumbNav("next", 31.2),
      ];
      // Same height as the tab row (y 23.2), just outside the first and last tab.
      const cardVariantTabNavMeshes = [
        createThumbNav("prev", -31.2, 23.2),
        createThumbNav("next", 31.2, 23.2),
      ];
      const createSlideNav = (
        direction: "prev" | "next",
        x: number,
      ): {
        mesh: THREE.Mesh;
        frame: THREE.Mesh;
        direction: "prev" | "next";
      } => {
        const navFrame = new THREE.Mesh(
          new THREE.PlaneGeometry(2.7, 2.9),
          new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.84,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        const navMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(2.4, 2.6),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        const arrowTexture = createDetailTexture(
          [direction === "prev" ? "‹" : "›"],
          {
            width: 256,
            height: 256,
            bgColor: "rgba(0,0,0,0)",
            showLine: false,
            textColor: "rgba(255,255,255,0.98)",
            fontSize: 170,
            lineSpacing: 168,
            textAlign: "center",
            padding: 128,
            centerBlock: true,
            fontFamily: "Rajdhani, sans-serif",
            fontWeight: 700,
            crispUI: true,
          },
        );
        navMesh.material.map = arrowTexture;
        navFrame.position.set(x, 0, 1.16);
        navMesh.position.set(x, 0, 1.2);
        navFrame.visible = false;
        navMesh.visible = false;
        stationGroup.add(navFrame, navMesh);
        return { mesh: navMesh, frame: navFrame, direction };
      };
      const cardSlideNavMeshes = [
        createSlideNav("prev", -38.6),
        createSlideNav("next", 38.6),
      ];
      const media = group.variants[0]?.mediaItems?.[0];
      if (media?.textureUrl) {
        textureLoader.load(
          media.textureUrl,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            const mat = plate.material as THREE.MeshBasicMaterial;
            mat.map = tex;
            const activeFitMode = media.fit ?? "cover";
            const maxOffsetY = applyTextureForFitMode(
              tex,
              72 / 42,
              activeFitMode,
              Number(plate.userData.textureScrollNorm) || 0,
            );
            plate.userData.textureMaxOffsetY = maxOffsetY;
            plate.userData.textureFitMode = activeFitMode;
            plate.userData.hasLoadedTexture = true;
            mat.needsUpdate = true;
          },
          undefined,
          () => undefined,
        );
      }
      const label = createLabel(group.title, "Portfolio Sample");
      label.userData.orbitalPortfolioLabel = true;
      label.userData.orbitalPortfolioStationLabel = true;
      label.position.set(0, 62, 0);
      label.visible = false;
      stationGroup.add(label);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: orbitalHaloTexture ?? undefined,
          color: 0x66ddff,
          transparent: true,
          opacity: 0.12,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        }),
      );
      halo.scale.setScalar(120);
      stationGroup.add(halo);
      const impactSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: impactTexture ?? undefined,
          color: new THREE.Color(group.orbitColor ?? "#66DDFF"),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        }),
      );
      impactSprite.visible = false;
      impactSprite.position.set(0, 0, 1.38);
      impactSprite.scale.set(8, 8, 1);
      stationGroup.add(impactSprite);
      const variantSatelliteGroup = new THREE.Group();
      // Intentionally left empty: orbiting globes around focused slides removed.
      stationGroup.add(variantSatelliteGroup);
      const mediaHaloGroup = new THREE.Group();
      mediaHaloGroup.userData.orbitalPortfolioMediaHalo = true;
      const mediaItems = (group.variants[0]?.mediaItems ?? []).slice(0, 10);
      mediaItems.forEach((item, mi) => {
        const ma = (mi / Math.max(1, mediaItems.length)) * Math.PI * 2;
        const thumbGeom = new THREE.PlaneGeometry(8, 5, 16, 1);
        const thumbPosAttr = thumbGeom.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        const thumbFlatPositions = new Float32Array(
          thumbPosAttr.array as Float32Array,
        );
        const thumbCurvedPositions = buildCurvedPanelPositions(
          thumbFlatPositions,
          8,
          Math.PI * 0.72,
        );
        morphPanelGeometry(
          thumbPosAttr,
          thumbCurvedPositions,
          thumbFlatPositions,
          0,
        );
        const thumb = new THREE.Mesh(
          thumbGeom,
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        if (item?.textureUrl) {
          textureLoader.load(
            item.textureUrl,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              const thumbMat = thumb.material as THREE.MeshBasicMaterial;
              thumbMat.map = tex;
              applyTextureForFitMode(tex, 8 / 5, item.fit);
              thumbMat.needsUpdate = true;
            },
            undefined,
            () => undefined,
          );
        }
        thumb.position.set(
          Math.cos(ma) * 37,
          Math.sin(ma * 2.1) * 3.5,
          Math.sin(ma) * 37,
        );
        thumb.lookAt(new THREE.Vector3(0, 0, 0));
        mediaHaloGroup.add(thumb);
      });
      stationGroup.add(mediaHaloGroup);
      orbitalRoot.add(stationGroup);
      stationRecords.push({
        index: idx,
        coreId,
        plainIndex,
        ringIndex,
        plainAngle,
        coreAnchorLocal: coreRecord.centerLocal.clone(),
        plainNormalLocal: new THREE.Vector3(0, 1, 0)
          .applyQuaternion(plainQuat)
          .normalize(),
        group: stationGroup,
        ring,
        plate,
        frame,
        platePositionAttr: platePosAttr,
        framePositionAttr: framePosAttr,
        plateFlatPositions,
        plateCurvedPositions,
        frameFlatPositions,
        frameCurvedPositions,
        straightenBlend: 0,
        label,
        halo,
        impactSprite,
        impactStartedAt: -1,
        impactDurationMs: 2600,
        impactLocalPoint: new THREE.Vector2(0, 0),
        rippleAmplitude: 0,
        rippleWavelength: 8,
        rippleSpeed: 38,
        rippleTravelMax: 18,
        mediaHaloGroup,
        variantSatelliteGroup,
        pulsePhase: Math.random() * Math.PI * 2,
        textureScrollNorm: 0,
        textureMaxOffsetY: 0,
        textureFitMode: media?.fit ?? "cover",
        cardTitleMesh,
        cardVariantTabs,
        cardVariantTabNavMeshes,
        variantTabPageStart: 0,
        cardThumbMeshes,
        cardThumbNavMeshes,
        cardSlideNavMeshes,
        orbitLane: lane as 0 | 1,
        orbitAngle: a,
        orbitDirection,
        orbitRadius,
        orbitVerticalAmp,
        orbitMotionBlend: 1,
      });
    });
    orbitalRoot.traverse((obj) => {
      // Render Portfolio content in normal universe view and in isolated
      // Portfolio mode.
      obj.layers.set(ORBITAL_PORTFOLIO_LAYER);
      obj.layers.enable(0);
    });
    // Keep depth-only occluders on the overlay/card layer.
    coreCardOccluders.forEach((occluder) => {
      occluder.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
    });
    // Render screenshot cards on the overlay layer so bright whites do not bloom-wash.
    stationRecords.forEach((station) => {
      station.plate.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      station.plate.layers.enable(0);
      station.plate.layers.enable(ORBITAL_PORTFOLIO_LAYER);
      station.frame.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      station.frame.layers.enable(0);
      station.frame.layers.enable(ORBITAL_PORTFOLIO_LAYER);
      station.cardTitleMesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      station.cardTitleMesh.layers.enable(0);
      station.cardTitleMesh.layers.enable(ORBITAL_PORTFOLIO_LAYER);
      station.impactSprite.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      station.impactSprite.layers.enable(0);
      station.impactSprite.layers.enable(ORBITAL_PORTFOLIO_LAYER);
      station.cardVariantTabs.forEach((tab) => {
        tab.frame.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        tab.frame.layers.enable(0);
        tab.frame.layers.enable(ORBITAL_PORTFOLIO_LAYER);
        tab.mesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        tab.mesh.layers.enable(0);
        tab.mesh.layers.enable(ORBITAL_PORTFOLIO_LAYER);
      });
      station.cardThumbMeshes.forEach((thumb) => {
        thumb.frame.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        thumb.frame.layers.enable(0);
        thumb.frame.layers.enable(ORBITAL_PORTFOLIO_LAYER);
        thumb.mesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        thumb.mesh.layers.enable(0);
        thumb.mesh.layers.enable(ORBITAL_PORTFOLIO_LAYER);
      });
      [...station.cardThumbNavMeshes, ...station.cardVariantTabNavMeshes].forEach((nav) => {
        nav.frame.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        nav.frame.layers.enable(0);
        nav.frame.layers.enable(ORBITAL_PORTFOLIO_LAYER);
        nav.mesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        nav.mesh.layers.enable(0);
        nav.mesh.layers.enable(ORBITAL_PORTFOLIO_LAYER);
      });
      station.cardSlideNavMeshes.forEach((nav) => {
        nav.frame.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        nav.frame.layers.enable(0);
        nav.frame.layers.enable(ORBITAL_PORTFOLIO_LAYER);
        nav.mesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        nav.mesh.layers.enable(0);
        nav.mesh.layers.enable(ORBITAL_PORTFOLIO_LAYER);
      });
      station.mediaHaloGroup.traverse((obj) => {
        obj.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        obj.layers.enable(0);
        obj.layers.enable(ORBITAL_PORTFOLIO_LAYER);
      });
    });
    scene.add(orbitalRoot);
    orbitalPortfolioRootRef.current = orbitalRoot;
    orbitalPortfolioStationsRef.current = stationRecords;
    orbitalPortfolioCoresRef.current = coreRecords;
    orbitalPortfolioCoresByIdRef.current = coreById;
    orbitalPortfolioCorePickMeshesRef.current = corePickMeshes;
    orbitalPortfolioConnectorLinesRef.current = connectorLines;
    orbitalPortfolioOuterRingsRef.current = outerRings;
    const pickRandomStationIndexForCore = (coreIndex: number): number => {
      const cores = coreRecords;
      const stations = stationRecords;
      if (stations.length === 0) return 0;
      const safeCoreIndex = THREE.MathUtils.clamp(
        coreIndex,
        0,
        Math.max(0, cores.length - 1),
      );
      const coreId = cores[safeCoreIndex]?.id;
      if (!coreId) return Math.floor(Math.random() * stations.length);
      const candidates: number[] = [];
      stations.forEach((station, stationIndex) => {
        if (station.coreId === coreId) candidates.push(stationIndex);
      });
      if (candidates.length === 0)
        return Math.floor(Math.random() * stations.length);
      return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
    };
    const matterPackets: OrbitalPortfolioMatterPacketRecord[] = [];
    const matterPalette = [0x9beaff, 0xa7b6ff, 0xb8ffd9, 0xffb8ef, 0xffe2b3];
    const packetCount = Math.max(16, coreRecords.length * 14);
    const randomTargetOffset = () =>
      new THREE.Vector2((Math.random() - 0.5) * 52, (Math.random() - 0.5) * 28);
    const randomMissOffset = () =>
      new THREE.Vector3(
        (Math.random() - 0.5) * 520,
        (Math.random() - 0.5) * 220 + 80,
        (Math.random() - 0.5) * 520,
      );
    const randomWillImpact = () => Math.random() >= 0.32;
    for (let i = 0; i < packetCount; i += 1) {
      const mat = new THREE.SpriteMaterial({
        color: matterPalette[i % matterPalette.length],
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      });
      const packetMesh = new THREE.Sprite(mat);
      packetMesh.scale.setScalar(5.2);
      packetMesh.renderOrder = 9;
      packetMesh.frustumCulled = false;
      packetMesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      packetMesh.position.set(0, 0, 0);
      matterGroup.add(packetMesh);
      const sourceCoreIndex = Math.floor(
        Math.random() * Math.max(1, coreRecords.length),
      );
      matterPackets.push({
        mesh: packetMesh,
        progress: Math.random(),
        speed: 0.26 + Math.random() * 0.3,
        sourceCoreIndex,
        targetStation: pickRandomStationIndexForCore(sourceCoreIndex),
        targetOffset: randomTargetOffset(),
        willImpact: randomWillImpact(),
        missOffset: randomMissOffset(),
        phase: Math.random() * Math.PI * 2,
        startOffset: new THREE.Vector3(
          (Math.random() - 0.5) * 11,
          (Math.random() - 0.5) * 11,
          (Math.random() - 0.5) * 11,
        ),
      });
    }
    orbitalPortfolioMatterPacketsRef.current = matterPackets;
    setOrbitalPortfolioReady(true);

    const categoryPositions = categoryEntries.map((_, idx) => {
      const a = (idx / Math.max(1, categoryEntries.length)) * Math.PI * 2;
      const y = Math.sin(idx * 0.9) * 6;
      return new THREE.Vector3(
        Math.cos(a) * latticeRadius,
        y,
        Math.sin(a) * latticeRadius,
      );
    });

    const categoryMat = new THREE.MeshBasicMaterial({
      color: 0x8fd3ff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const skillMat = new THREE.MeshBasicMaterial({
      color: 0xdaf1ff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const makeNodeHalo = (radius: number, color: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.35, "rgba(180,220,255,0.42)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(radius * 4.6);
      return sprite;
    };
    const latticeLineMats: THREE.LineBasicMaterial[] = [];
    const latticeLineGroups: SkillsLatticeLineGroup[] = [];

    const rawExperience = (resumeData as { experience?: unknown }).experience;
    const experienceEntries = (
      Array.isArray(rawExperience)
        ? rawExperience
        : Object.values(
            (rawExperience as Record<string, unknown[]>) ?? {},
          ).flat()
    ) as Array<{
      company?: string;
      navLabel?: string;
      positions?: Array<{ responsibilities?: string[] }>;
    }>;

    const findSkillEvidence = (skill: string): string[] => {
      const needle = skill.trim().toLowerCase();
      if (!needle) return [];
      const evidence: string[] = [];
      experienceEntries.forEach((entry) => {
        const company = entry.navLabel || entry.company || "Experience";
        const responsibilities = (entry.positions ?? []).flatMap(
          (position) => position.responsibilities ?? [],
        );
        const match = responsibilities.find((line) =>
          line.toLowerCase().includes(needle),
        );
        if (!match) return;
        const clipped = match.length > 86 ? `${match.slice(0, 83)}...` : match;
        evidence.push(`${company}: ${clipped}`);
      });
      return evidence.slice(0, 6);
    };

    const findCategoryEvidence = (skills: string[]): string[] => {
      const companies = new Set<string>();
      skills.forEach((skill) => {
        findSkillEvidence(skill).forEach((line) => {
          const company = line.split(":")[0]?.trim();
          if (company) companies.add(company);
        });
      });
      if (companies.size === 0) return [];
      return Array.from(companies)
        .slice(0, 6)
        .map((company) => `Used at ${company}`);
    };

    // Category ring links.
    {
      const linePoints: number[] = [];
      categoryPositions.forEach((pos, i) => {
        const next = categoryPositions[(i + 1) % categoryPositions.length];
        linePoints.push(pos.x, pos.y, pos.z, next.x, next.y, next.z);
        latticeLinkSegments.push({
          from: pos.clone(),
          to: next.clone(),
        });
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(linePoints, 3),
      );
      const lines = new THREE.LineSegments(
        geom,
        new THREE.LineBasicMaterial({
          color: 0x66c6ff,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        }),
      );
      const ringMat = lines.material as THREE.LineBasicMaterial;
      latticeLineMats.push(ringMat);
      latticeLineGroups.push({
        material: ringMat,
        kind: "ring",
      });
      skillsLatticeRoot.add(lines);
    }

    // Every name beneath a node, for evidence lookups and counts.
    const descendantNames = (node: TechStackTreeNode): string[] =>
      node.children.flatMap((child) => [child.name, ...descendantNames(child)]);

    categoryEntries.forEach((root, idx) => {
      const category = root.name;
      const branchNames = descendantNames(root);
      const cPos = categoryPositions[idx];
      const categoryNode = new THREE.Mesh(
        new THREE.IcosahedronGeometry(categoryNodeRadius, 1),
        categoryMat.clone(),
      );
      const categoryEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(categoryNode.geometry),
        new THREE.LineBasicMaterial({
          color: 0xeaf6ff,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
        }),
      );
      categoryEdges.scale.setScalar(1.012);
      categoryNode.add(categoryEdges);
      categoryNode.position.copy(cPos);
      categoryNode.userData.skillsNode = {
        label: category,
        nodeType: "category",
        category,
      };
      skillsLatticeRoot.add(categoryNode);
      const catHalo = makeNodeHalo(categoryNodeRadius, 0x8fd3ff);
      if (catHalo) {
        catHalo.position.copy(cPos);
        skillsLatticeRoot.add(catHalo);
      }
      latticeNodes.push({
        mesh: categoryNode,
        baseScale: 1,
        phase: idx * 1.73,
        label: category,
        nodeType: "category",
        category,
        depth: 1,
        path: [category],
        detailItems: [
          ...root.children.map((child) => child.name).slice(0, 8),
          ...findCategoryEvidence(branchNames),
        ],
        halo: catHalo ?? undefined,
        lineInfluence: idx,
      });

      const catLabel = createLabel(category, `${branchNames.length} skills`);
      catLabel.userData.skillsLatticeLabel = true;
      catLabel.position.set(cPos.x, cPos.y + 6.6, cPos.z);
      catLabel.visible = false;
      skillsLatticeRoot.add(catLabel);
      skillsLatticeNodeLabelsRef.current.push(catLabel);

      // All links in this branch share one line group, so selecting any node
      // in the branch lights the whole branch (as categories did before).
      const skillLinePoints: number[] = [];

      // Children orbit their parent. Depth 2 keeps the original ring around the
      // core; deeper levels use smaller rings tilted to face away from the
      // grandparent, so a branch fans outward instead of colliding with the
      // ring it hangs from.
      const placeChildren = (
        parent: TechStackTreeNode,
        parentPos: THREE.Vector3,
        grandparentPos: THREE.Vector3 | null,
        depth: number,
        parentPath: string[],
        orderSeed: number,
      ) => {
        const children = parent.children;
        if (children.length === 0) return;
        const orbitR =
          depth === 2
            ? 11 + Math.min(7, children.length * 0.7)
            : Math.max(3.2, 6.2 - (depth - 3) * 1.2) +
              Math.min(3, children.length * 0.35);
        // Plane for this ring: depth 2 is the lattice's horizontal plane;
        // deeper rings are perpendicular to the grandparent → parent direction
        // and pushed a little further out along it.
        const outward = grandparentPos
          ? parentPos.clone().sub(grandparentPos).normalize()
          : new THREE.Vector3(0, 1, 0);
        const axisA = new THREE.Vector3();
        const axisB = new THREE.Vector3();
        let ringCenter = parentPos.clone();
        if (depth === 2) {
          axisA.set(1, 0, 0);
          axisB.set(0, 0, 1);
        } else {
          const helper =
            Math.abs(outward.y) < 0.9
              ? new THREE.Vector3(0, 1, 0)
              : new THREE.Vector3(1, 0, 0);
          axisA.crossVectors(outward, helper).normalize();
          axisB.crossVectors(outward, axisA).normalize();
          ringCenter = parentPos.clone().addScaledVector(outward, orbitR * 0.55);
        }

        children.forEach((child, sIdx) => {
          const sa =
            (sIdx / Math.max(1, children.length)) * Math.PI * 2 + orderSeed * 0.35;
          const sPos =
            depth === 2
              ? new THREE.Vector3(
                  parentPos.x + Math.cos(sa) * orbitR,
                  parentPos.y + Math.sin(sa * 1.4) * 2.2,
                  parentPos.z + Math.sin(sa) * orbitR,
                )
              : ringCenter
                  .clone()
                  .addScaledVector(axisA, Math.cos(sa) * orbitR)
                  .addScaledVector(axisB, Math.sin(sa) * orbitR);
          const radius = skillNodeRadius * Math.pow(0.78, depth - 2);
          const skillNode = new THREE.Mesh(
            new THREE.OctahedronGeometry(radius, 0),
            skillMat.clone(),
          );
          const skillEdges = new THREE.LineSegments(
            new THREE.EdgesGeometry(skillNode.geometry),
            new THREE.LineBasicMaterial({
              color: 0xf4fbff,
              transparent: true,
              opacity: 0.75,
              depthWrite: false,
            }),
          );
          skillEdges.scale.setScalar(1.018);
          skillNode.add(skillEdges);
          skillNode.position.copy(sPos);
          skillNode.userData.skillsNode = {
            label: child.name,
            nodeType: "skill",
            category,
          };
          skillsLatticeRoot.add(skillNode);
          const skillHalo = makeNodeHalo(radius, 0xdaf1ff);
          if (skillHalo) {
            skillHalo.position.copy(sPos);
            skillsLatticeRoot.add(skillHalo);
          }
          const path = [...parentPath, child.name];
          const childNames = child.children.map((grandchild) => grandchild.name);
          const skillEvidence = findSkillEvidence(child.name);
          latticeNodes.push({
            mesh: skillNode,
            baseScale: 1,
            phase: idx * 2.13 + sIdx * 0.77 + depth * 0.31,
            label: child.name,
            nodeType: "skill",
            category,
            depth,
            path,
            detailItems: [
              path.slice(0, -1).join(" › "),
              ...(childNames.length ? [`Includes: ${childNames.join(", ")}`] : []),
              ...(skillEvidence.length
                ? skillEvidence
                : childNames.length
                  ? []
                  : ["No mapped evidence yet (add responsibilities with this skill term)."]),
            ],
            halo: skillHalo ?? undefined,
            lineInfluence: idx + sIdx * 0.15 + (depth - 2) * 0.05,
          });
          const skillLabel = createLabel(child.name);
          skillLabel.userData.skillsLatticeLabel = true;
          skillLabel.position.set(sPos.x, sPos.y + radius + 1.15, sPos.z);
          skillLabel.visible = false;
          skillsLatticeRoot.add(skillLabel);
          skillsLatticeNodeLabelsRef.current.push(skillLabel);
          skillLinePoints.push(parentPos.x, parentPos.y, parentPos.z, sPos.x, sPos.y, sPos.z);
          latticeLinkSegments.push({
            from: parentPos.clone(),
            to: sPos.clone(),
          });
          placeChildren(child, sPos, parentPos, depth + 1, path, orderSeed + sIdx + 1);
        });
      };
      placeChildren(root, cPos, null, 2, [category], idx);

      const skillGeom = new THREE.BufferGeometry();
      skillGeom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(skillLinePoints, 3),
      );
      const skillLines = new THREE.LineSegments(
        skillGeom,
        new THREE.LineBasicMaterial({
          color: 0x9ad9ff,
          transparent: true,
          opacity: 0.36,
          depthWrite: false,
        }),
      );
      const skillMatRef = skillLines.material as THREE.LineBasicMaterial;
      latticeLineMats.push(skillMatRef);
      latticeLineGroups.push({
        material: skillMatRef,
        kind: "skill",
        category,
      });
      skillsLatticeRoot.add(skillLines);
    });

    skillsLatticeRoot.traverse((obj) => {
      obj.layers.set(SKILLS_LATTICE_LAYER);
    });
    // Keep outer shell visible from normal universe camera (layer 0) while
    // internals remain gated behind SKILLS_LATTICE_LAYER.
    latticeEnvelope.layers.enable(0);
    latticeEnvelopeEdges.layers.enable(0);
    // Data packets flowing along lattice links.
    if (latticeLinkSegments.length > 0) {
      const flowCount = Math.min(320, latticeLinkSegments.length * 3);
      const flowPositions = new Float32Array(flowCount * 3);
      const flowColors = new Float32Array(flowCount * 3);
      const flowGeom = new THREE.BufferGeometry();
      flowGeom.setAttribute(
        "position",
        new THREE.BufferAttribute(flowPositions, 3),
      );
      flowGeom.setAttribute("color", new THREE.BufferAttribute(flowColors, 3));
      const flowMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.72,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        vertexColors: true,
      });
      const flowPoints = new THREE.Points(flowGeom, flowMat);
      flowPoints.layers.set(SKILLS_LATTICE_LAYER);
      flowPoints.renderOrder = 8;
      // Positions are updated every frame; disable frustum culling so packets
      // do not disappear/freeze visually when camera gets very close.
      flowPoints.frustumCulled = false;
      skillsLatticeRoot.add(flowPoints);
      const flowMeta: SkillsLatticeFlowMeta[] = [];
      const initialColor = new THREE.Color();
      for (let i = 0; i < flowCount; i += 1) {
        const hue = 0.56 + Math.random() * 0.28;
        initialColor.setHSL(hue, 0.84, 0.69);
        flowColors[i * 3] = initialColor.r;
        flowColors[i * 3 + 1] = initialColor.g;
        flowColors[i * 3 + 2] = initialColor.b;
        flowMeta.push({
          segmentIndex: Math.floor(Math.random() * latticeLinkSegments.length),
          offset: Math.random(),
          speed: 0.08 + Math.random() * 0.26,
          hue,
          hueDrift: 0.045 + Math.random() * 0.11,
        });
      }
      skillsLatticeFlowPointsRef.current = flowPoints;
      skillsLatticeFlowMetaRef.current = flowMeta;
    }
    // Plasma-style touch arcs that can lock on hover/selection.
    {
      const arcRecords: SkillsLatticeArcRecord[] = [];
      const arcCount = 9;
      const arcPointCount = 14;
      for (let i = 0; i < arcCount; i += 1) {
        const points = new Float32Array(arcPointCount * 3);
        const arcGeom = new THREE.BufferGeometry();
        arcGeom.setAttribute("position", new THREE.BufferAttribute(points, 3));
        const arcMat = new THREE.LineBasicMaterial({
          color: 0xb8c8ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const line = new THREE.Line(arcGeom, arcMat);
        line.layers.set(SKILLS_LATTICE_LAYER);
        line.renderOrder = 10;
        line.frustumCulled = false;
        line.visible = false;
        skillsLatticeRoot.add(line);
        arcRecords.push({
          line,
          points,
          targetIndex: Math.floor(
            Math.random() * Math.max(1, latticeNodes.length),
          ),
          phase: Math.random(),
          sway: 0.8 + Math.random() * 0.9,
          speed: 0.72 + Math.random() * 0.9,
        });
      }
      skillsLatticeArcRecordsRef.current = arcRecords;
    }
    scene.add(skillsLatticeRoot);
    skillsLatticeRootRef.current = skillsLatticeRoot;

    // --- CAREER GALLERY ---
    const careerGallery = new CareerGallery({
      items: collectPortfolioGalleryItems(portfolioCores),
      radius: CAREER_GALLERY_RADIUS,
      // Shown across the globe on arrival, then tiles turn into screenshots.
      skinUrl: "/images/career-gallery/family-skin.jpg",
    });
    careerGallery.root.position.copy(CAREER_GALLERY_WORLD_ANCHOR);
    const careerGalleryLabel = createLabel(
      CAREER_GALLERY_NAV_LABEL,
      "Hologram Archive",
    );
    careerGalleryLabel.position.set(0, CAREER_GALLERY_RADIUS + 70, 0);
    careerGallery.root.add(careerGalleryLabel);
    scene.add(careerGallery.root);
    careerGalleryRef.current = careerGallery;
    const careerGalleryShroud = new GalleryShroud(
      careerGallery.root.position,
      CAREER_GALLERY_RADIUS,
    );
    scene.add(careerGalleryShroud.group);
    careerGalleryShroudRef.current = careerGalleryShroud;
    if (IS_DEBUG) {
      (window as unknown as Record<string, unknown>).__careerGalleryStats = () =>
        careerGallery.getStats();
      (window as unknown as Record<string, unknown>).__careerGalleryTestPattern =
        () => careerGallery.applyOrientationTestPattern();
    }
    skillsLatticeNodesRef.current = latticeNodes;
    skillsLatticeLineMatsRef.current = latticeLineMats;
    skillsLatticeLineGroupsRef.current = latticeLineGroups;
    skillsLatticeLinkSegmentsRef.current = latticeLinkSegments;
    skillsLegacyBodiesRef.current = [];

    // Point-based starfield removed — the texture skyboxes (starfield +
    // skyfield) already provide a realistic backdrop that doesn't cluster
    // when the camera travels through the expanded universe.

    // --- SPACESHIP LOADING ---
    const loader = new GLTFLoader();
    (
      spaceshipGltfPromiseRef.current ??
      loadVehicleAsShip(loader, SHIP_MODEL_PATH)
    ).then(
      (gltf) => {
        const spaceship = gltf.scene;

        // Scale down the spaceship to be tiny compared to planets
        spaceship.scale.set(FALCON_SCALE, FALCON_SCALE, FALCON_SCALE);

        // Align model forward axis (model front is +Z; navigation lookAt uses -Z)
        spaceship.userData.forwardOffset = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, Math.PI, 0),
        );

        // Position it initially near the sun
        spaceship.position.set(
          FALCON_INITIAL_POS.x,
          FALCON_INITIAL_POS.y,
          FALCON_INITIAL_POS.z,
        );
        // Keep Falcon hidden until the intro pickup cinematic reveals it.
        spaceship.visible = false;

        // Cache rear blue engine-panel materials so render loop can drive
        // emissive intensity directly from ship speed.
        spaceship.updateMatrixWorld(true);
        const enginePanelMaterials: Array<{
          material: THREE.Material & {
            emissive?: THREE.Color;
            emissiveIntensity?: number;
            userData?: Record<string, unknown>;
          };
          baseEmissive: THREE.Color;
          baseIntensity: number;
        }> = [];
        const seenMaterialUuids = new Set<string>();
        spaceship.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh) || !obj.material) return;
          // Swapped-in vehicles don't have the Falcon's separate engine-panel
          // materials; don't let the speed boost pick up (and brighten) a
          // material that covers their whole body.
          if (!PLACEHOLDER_MODELS) return;
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry && !mesh.geometry.boundingSphere) {
            mesh.geometry.computeBoundingSphere();
          }
          const worldCenter = mesh.geometry?.boundingSphere
            ? mesh.geometry.boundingSphere.center
                .clone()
                .applyMatrix4(mesh.matrixWorld)
            : mesh.getWorldPosition(new THREE.Vector3());
          const localToShip = spaceship.worldToLocal(worldCenter.clone());
          const isRearSection = localToShip.z < -0.65;
          if (!isRearSection) return;
          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          mats.forEach((material) => {
            const mat = material as THREE.Material & {
              uuid?: string;
              emissive?: THREE.Color;
              emissiveIntensity?: number;
              userData?: Record<string, unknown>;
            };
            if (!mat.emissive) return;
            const e = mat.emissive;
            const isBlueEmissive =
              e.b > 0.08 && e.b > e.r * 1.2 && e.b > e.g * 1.15;
            if (!isBlueEmissive) return;
            if (seenMaterialUuids.has(mat.uuid)) return;
            seenMaterialUuids.add(mat.uuid);
            if (!mat.userData) mat.userData = {};
            const baseEmissive = e.clone();
            const baseIntensity =
              typeof mat.emissiveIntensity === "number"
                ? mat.emissiveIntensity
                : 1;
            mat.userData.engineBaseEmissive = baseEmissive.clone();
            mat.userData.engineBaseIntensity = baseIntensity;
            enginePanelMaterials.push({
              material: mat,
              baseEmissive,
              baseIntensity,
            });
          });
        });
        spaceship.userData.enginePanelMaterials = enginePanelMaterials;
        vlog(
          `🚀 Falcon engine panel mats detected: ${enginePanelMaterials.length}`,
        );

        // Subtle ambient light on the ship hull — just enough to see detail.
        // Ship is ~0.8 units long; distance 1.5 = ~2× ship length (tight glow).
        const shipLight = new THREE.PointLight(0x6699ff, 0.15, 1.5);
        spaceship.add(shipLight);

        // Create exterior lights (initially off)
        const exteriorLights: THREE.PointLight[] = [];
        const lightPositions = [
          // Top lights
          new THREE.Vector3(0, 2, 0), // Top center
          new THREE.Vector3(2, 1.5, 2), // Top front right
          new THREE.Vector3(-2, 1.5, 2), // Top front left
          new THREE.Vector3(2, 1.5, -2), // Top back right
          new THREE.Vector3(-2, 1.5, -2), // Top back left
          // Bottom lights
          new THREE.Vector3(0, -2, 0), // Bottom center
          new THREE.Vector3(2, -1.5, 2), // Bottom front right
          new THREE.Vector3(-2, -1.5, 2), // Bottom front left
          new THREE.Vector3(2, -1.5, -2), // Bottom back right
          new THREE.Vector3(-2, -1.5, -2), // Bottom back left
          // Side lights
          new THREE.Vector3(3, 0, 0), // Right side
          new THREE.Vector3(-3, 0, 0), // Left side
        ];

        lightPositions.forEach((pos) => {
          const light = new THREE.PointLight(0xffffff, 0, 3); // was 15, scaled to ship size
          light.position.copy(pos);
          spaceship.add(light);
          exteriorLights.push(light);
        });

        spaceshipLightsRef.current = exteriorLights;

        // Create dedicated engine light for boost effects.
        // Initial distance matches ENGINE_LIGHT_BASE_DIST (2); render loop updates it.
        const engineLight = new THREE.PointLight(0x6699ff, 0.8, 2);
        engineLight.position.set(0, 0, -4); // Back of ship (model space)
        spaceship.add(engineLight);
        spaceshipEngineLightRef.current = engineLight;

        // Swapped-in vehicles: the Falcon's light rig (hull glow + 12 exterior
        // point lights) washes them out, so turn it off and detach it from the
        // exterior-lights toggle. Give them a pair of forward headlights and an
        // engine glow behind that follows forward travel instead.
        if (!PLACEHOLDER_MODELS) {
          exteriorLights.forEach((light) => {
            light.intensity = 0;
          });
          spaceshipLightsRef.current = [];
          shipLight.intensity = 0;
          engineLight.position.set(0, 0.5, -9);
          engineLight.userData.distanceScale = 3;

          // Model front is +Z; the vehicle is fitted to ~14 units long.
          [-2.5, 2.5].forEach((x) => {
            const headlight = new THREE.SpotLight(
              0xfff2d6,
              2,
              12,
              Math.PI / 7,
              0.5,
              1.5,
            );
            headlight.position.set(x, 0, 7);
            const headlightTarget = new THREE.Object3D();
            headlightTarget.userData.isShipLightTarget = true;
            headlightTarget.position.set(x, -0.5, 30);
            spaceship.add(headlight, headlightTarget);
            headlight.target = headlightTarget;
          });

          const glowCanvas = document.createElement("canvas");
          glowCanvas.width = 128;
          glowCanvas.height = 128;
          const glowCtx = glowCanvas.getContext("2d");
          if (glowCtx) {
            const grad = glowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
            grad.addColorStop(0, "rgba(220, 240, 255, 1)");
            grad.addColorStop(0.25, "rgba(120, 180, 255, 0.85)");
            grad.addColorStop(1, "rgba(0, 0, 0, 0)");
            glowCtx.fillStyle = grad;
            glowCtx.fillRect(0, 0, 128, 128);
          }
          const glowTexture = new THREE.CanvasTexture(glowCanvas);
          glowTexture.colorSpace = THREE.SRGBColorSpace;
          // Stays in the scene at opacity 0 so its shader compiles during the
          // warmup rather than on the first frame of travel.
          // Soft glow sprites along the engine grille (found from its texture
          // rectangle at load), just behind the hull; a single sprite behind
          // the ship for vehicles without one. applyEngineGlow drives them.
          const grillePoints =
            (spaceship.userData.engineGlowPoints as THREE.Vector3[] | undefined) ?? [];
          const hasGrille = grillePoints.length > 0;
          const glowMaterial = new THREE.SpriteMaterial({
            map: glowTexture,
            color: 0x88bbff,
            opacity: 0,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          const glowSprites = (
            hasGrille
              ? grillePoints.map((point) => point.clone().add(new THREE.Vector3(0, 0, -0.35)))
              : [engineLight.position.clone()]
          ).map((position) => {
            const sprite = new THREE.Sprite(glowMaterial);
            const baseScale = hasGrille ? 2.6 : 6;
            sprite.position.copy(position);
            sprite.scale.setScalar(baseScale);
            sprite.userData.baseScale = baseScale;
            sprite.userData.baseOpacity = hasGrille ? 0.75 : 1;
            spaceship.add(sprite);
            return sprite;
          });
          engineLight.userData.glowSprites = glowSprites;
          engineLight.userData.glowSprite = glowSprites[0];
          vlog(`🔥 Engine glow: ${glowSprites.length} sprite(s) on ${hasGrille ? "grille" : "fallback"}`);

          if (SHIP_VARIANT === "bronco") {
            // ~3 car lengths behind (car is ~0.7 world units long).
            spaceship.userData.followCamera = { behind: 2, height: 0.35 };
          }
        }

        // Create interior lights (for cabin and cockpit)
        const interiorLights: THREE.PointLight[] = [];
        const interiorLightPositions = [
          new THREE.Vector3(0, 0.8, 0), // Center ceiling light
          new THREE.Vector3(1.5, 0.5, 1), // Cabin area (right front)
          new THREE.Vector3(0, 0.6, 3.5), // Cockpit area
          new THREE.Vector3(-1, 0.5, 0), // Left side
          new THREE.Vector3(1, 0.5, 0), // Right side
        ];

        interiorLightPositions.forEach((pos) => {
          const light = new THREE.PointLight(0xffd9b3, 0, 4); // Start OFF — useEffect won't catch async load
          light.position.copy(pos);
          spaceship.add(light);
          interiorLights.push(light);
        });

        spaceshipInteriorLightsRef.current = interiorLights;

        // The ship's lights live in their own always-visible rig that copies
        // the ship's transform every render. Many flows hide the ship; when
        // the lights were children, hiding it removed ~16 lights from the
        // scene and every lit shader recompiled (measured 0.3–1.8 s freezes
        // each time the ship hid or reappeared, e.g. the About ride).
        const shipLightRig = new THREE.Group();
        shipLightRig.name = "ShipLightRig";
        spaceship.children
          .filter(
            (child) =>
              (child as THREE.Light).isLight || child.userData.isShipLightTarget,
          )
          .forEach((child) => shipLightRig.add(child));
        scene.add(shipLightRig);
        const previousSceneBeforeRender = scene.onBeforeRender;
        scene.onBeforeRender = function (...args) {
          previousSceneBeforeRender.apply(this, args);
          spaceship.matrixWorld.decompose(
            shipLightRig.position,
            shipLightRig.quaternion,
            shipLightRig.scale,
          );
          shipLightRig.updateMatrixWorld(true);
        };

        scene.add(spaceship);
        spaceshipRef.current = spaceship;
        vlog("🚀 Spaceship loaded - ready for navigation");
        markSceneModelLoaded();

        // --- COCKPIT POSITION ---
        // Reference points from the ship-labeling system:
        //   cockpit exterior surface: [-6.20, 3.59, 7.13]  (right side, forward)
        //   right hull edge:          [-6.68, 2.86, 0.00]  (-X is starboard)
        //   front edge:               [-0.01, -0.28, 7.26] (+Z is forward)
        //
        // The cockpit tube protrudes right-forward from the disc.
        // Interior offset from surface: ~0.8 inward (+X), ~0.5 lower (seated
        // eye height), ~1.1 back from windshield (behind pilot chair).
        // NOTE: render loop multiplies these by ship.scale (0.5) during
        //       the local→world transformation.
        const cockpitCamLocal = new THREE.Vector3(-6.05, 3.16, 5.36);
        const cockpitLookLocal = new THREE.Vector3(-6.05, 3.16, 11.36); // forward through window
        spaceship.userData.cockpitCameraLocal = cockpitCamLocal;
        spaceship.userData.cockpitLookLocal = cockpitLookLocal;
        vlog(
          `✈️ Cockpit interior position: camera [${cockpitCamLocal.x.toFixed(1)}, ${cockpitCamLocal.y.toFixed(1)}, ${cockpitCamLocal.z.toFixed(1)}], look [${cockpitLookLocal.x.toFixed(1)}, ${cockpitLookLocal.y.toFixed(1)}, ${cockpitLookLocal.z.toFixed(1)}]`,
        );

        // Initialize navigation system
        initializeNavigationSystem(spaceship, scene);
      },
      () => {
        vlog("❌ Failed to load spaceship model");
        markSceneModelLoaded();
      },
    );

    // --- STAR DESTROYER LOADING ---
    loader.load(
      "/models/star-destroyer-2/star_wars_imperial_ii_star_destroyer.glb",
      (gltf) => {
        const model = gltf.scene;

        // Center the model at the group origin so position/rotation
        // are relative to the ship's geometric center.
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Wrap in a group for clean transforms
        const starDestroyer = new THREE.Group();
        starDestroyer.add(model);

        // Scale: 0.06 → ~44 world-units long (~6× larger than the Falcon)
        starDestroyer.scale.set(SD_SCALE, SD_SCALE, SD_SCALE);

        // Initial position — outer area of the system, above the orbital plane
        starDestroyer.position.set(
          SD_INITIAL_POS.x,
          SD_INITIAL_POS.y,
          SD_INITIAL_POS.z,
        );

        // Forward offset: the model's visual nose is at +Z after centering,
        // but lookAt faces -Z. Rotate 180° around Y so the nose leads.
        // (Same pattern as the Millennium Falcon.)
        starDestroyer.userData.forwardOffset =
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));

        // --- Lights ---
        // SD is ~4.4 units long at scale 0.006. Keep light distances proportional.
        // Engine glow (back of ship is +Z in centered local space)
        const engineLight = new THREE.PointLight(0x4488ff, 1.5, 8);
        engineLight.position.set(0, 0, 360);
        starDestroyer.add(engineLight);
        starDestroyer.userData.engineLight = engineLight;

        // Bridge tower light
        const bridgeLight = new THREE.PointLight(0xaaccff, 0.3, 5);
        bridgeLight.position.set(0, 260, 200);
        starDestroyer.add(bridgeLight);

        // Navigation lights (port=red, starboard=green)
        const portLight = new THREE.PointLight(0xff2200, 0.2, 4);
        portLight.position.set(-230, 80, 0);
        starDestroyer.add(portLight);

        const starboardLight = new THREE.PointLight(0x00ff22, 0.2, 4);
        starboardLight.position.set(230, 80, 0);
        starDestroyer.add(starboardLight);

        // Forward searchlight
        const forwardLight = new THREE.PointLight(0x88aaff, 0.3, 6);
        forwardLight.position.set(0, 40, -360);
        starDestroyer.add(forwardLight);

        // Readability light rig: keeps hull details visible when SD is
        // away from strong scene lights.
        const readabilityKey = new THREE.PointLight(0xe6efff, 0.22, 2200);
        readabilityKey.position.set(0, 120, -260);
        starDestroyer.add(readabilityKey);
        const readabilityRim = new THREE.PointLight(0x3f8dff, 0.2, 2200);
        readabilityRim.position.set(0, 90, 320);
        starDestroyer.add(readabilityRim);
        starDestroyer.userData.readabilityKey = readabilityKey;
        starDestroyer.userData.readabilityRim = readabilityRim;

        scene.add(starDestroyer);
        starDestroyerRef.current = starDestroyer;
        markSceneModelLoaded();

        // Initialize the cruiser AI
        const cruiser = new StarDestroyerCruiser(starDestroyer);
        starDestroyerCruiserRef.current = cruiser;
        // No random patrolling: the Destroyer only shows up in scripted
        // moments (fly-over after the intro, lightspeed escort) and is
        // parked out of view otherwise. sdAutonomyOn() in the console
        // still turns the old cruiser on for debugging.
        cruiser.setEnabled(false);
        const moments = new StarDestroyerMoments(starDestroyer);
        moments.park();
        starDestroyerMomentsRef.current = moments;
        if (starDestroyerSkillsSnapPendingRef.current) {
          placeStarDestroyerNearSkills();
        }

        // Register all planets and moons as visitable destinations.
        // getWorldPosition() is called live each frame so orbiting bodies
        // return their current position, not a stale snapshot.
        const sdDests: import("../StarDestroyerCruiser").SDDestination[] = [];
        scene.traverse((obj: any) => {
          if (obj.isMesh && obj.userData?.planetName) {
            const name = obj.userData.planetName as string;
            const mesh = obj as THREE.Mesh;
            sdDests.push({
              name,
              getWorldPosition: () => {
                const wp = new THREE.Vector3();
                mesh.getWorldPosition(wp);
                return wp;
              },
            });
          }
        });
        cruiser.setDestinations(sdDests);

        // Create hyperspace jump cone — a scene-level mesh (not parented
        // to the SD group, since the SD has scale 0.006 which would
        // make the cone invisible).  The cruiser positions/orients it
        // each frame and manages opacity fade-in/out.
        const coneGeo = new THREE.ConeGeometry(
          SD_CONE_RADIUS,
          SD_CONE_LENGTH,
          24,
          1,
          true,
        );
        // Default cone: tip at +Y, base at -Y.
        // Rotate so tip points along +Z (lookAt direction).
        coneGeo.rotateX(Math.PI / 2);
        // Shift so the narrow end (apex) is at origin (ship pos)
        // and the wide base extends along +Z toward the destination.
        coneGeo.translate(0, 0, SD_CONE_LENGTH / 2);

        // Per-vertex alpha: bright at the apex (ship), fading toward base (destination)
        const posAttr = coneGeo.getAttribute("position");
        const colors = new Float32Array(posAttr.count * 4);
        for (let i = 0; i < posAttr.count; i++) {
          const z = posAttr.getZ(i);
          // z ranges from 0 (apex/ship) to SD_CONE_LENGTH (base/destination)
          const t = z / SD_CONE_LENGTH; // 0 at ship, 1 at destination
          const alpha = 1 - t * t; // quadratic falloff — depletes toward destination
          colors[i * 4] = 0.3 + 0.4 * (1 - t); // R: blue-white at base
          colors[i * 4 + 1] = 0.5 + 0.3 * (1 - t); // G
          colors[i * 4 + 2] = 1.0; // B: always blue
          colors[i * 4 + 3] = alpha;
        }
        coneGeo.setAttribute("color", new THREE.BufferAttribute(colors, 4));

        const coneMat = new THREE.MeshBasicMaterial({
          color: 0x88bbff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
          vertexColors: true,
        });
        const jumpCone = new THREE.Mesh(coneGeo, coneMat);
        jumpCone.visible = false;
        jumpCone.renderOrder = 999; // render on top for additive glow
        scene.add(jumpCone);
        cruiser.setJumpCone(jumpCone);

        vlog(
          `🔺 Star Destroyer loaded — ${sdDests.length} destinations registered`,
        );
        shipLog("Star Destroyer online", "system");

        // Console commands for directing the Star Destroyer
        (window as any).sendSD = (name: string) => {
          if (!name) {
            const status = cruiser.getStatus();
            dlog("Usage: sendSD('planet or moon name')");
            dlog("Available destinations:", status.destinations.join(", "));
            return;
          }
          const ok = cruiser.sendTo(name);
          if (ok) {
            const s = cruiser.getStatus();
            dlog(`🔺 Star Destroyer dispatched to "${name}"`);
            dlog(
              `   State: ${s.hlState} | Speed: ${s.speed.toFixed(1)} | From: ${s.currentDest ?? "none"}`,
            );
            dlog(
              `   SD position:`,
              starDestroyerRef.current?.position
                .toArray()
                .map((n: number) => +n.toFixed(0)),
            );
          } else {
            const status = cruiser.getStatus();
            dlog(
              `❌ Destination "${name}" not found. Available:`,
              status.destinations.join(", "),
            );
          }
        };
        (window as any).sdStatus = () => {
          const s = cruiser.getStatus();
          dlog("=== STAR DESTROYER STATUS ===");
          dlog("  Autonomy enabled:", cruiser.isEnabled());
          dlog("  High-level state:", s.hlState);
          dlog("  Local state:", s.localState);
          dlog("  Speed:", s.speed.toFixed(1), "u/s");
          dlog("  Current system:", s.currentDest ?? "(none)");
          dlog("  Next destination:", s.nextDest ?? "(none)");
          dlog("  Local patrols:", s.localPatrols);
          dlog("  All destinations:", s.destinations.join(", "));
          return s;
        };
        (window as any).sdAutonomyOn = () => {
          cruiser.setEnabled(true);
          dlog("🔺 SD autonomy: ON");
          shipLog("SD autonomy enabled", "system");
        };
        (window as any).sdAutonomyOff = () => {
          cruiser.setEnabled(false);
          dlog("🔺 SD autonomy: OFF");
          shipLog("SD autonomy disabled", "system");
        };

        // ── Visual locate beacons ─────────────────────────────────
        // Console: locateFalcon()  or  locateSD()
        // Spawns a dramatic expanding ring + vertical pillar effect
        // at the ship's position that fades over a few seconds.
        const createLocateBeacon = (
          target: THREE.Object3D,
          color: THREE.ColorRepresentation,
          label: string,
        ) => {
          const wp = new THREE.Vector3();
          target.getWorldPosition(wp);

          const group = new THREE.Group();
          group.position.copy(wp);
          scene.add(group);

          // ── Vertical pillar (thin cylinder stretching up & down) ──
          const pillarHeight = 2000;
          const pillarGeo = new THREE.CylinderGeometry(
            2,
            2,
            pillarHeight,
            8,
            1,
            true,
          );
          const pillarMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const pillar = new THREE.Mesh(pillarGeo, pillarMat);
          group.add(pillar);

          // ── Expanding rings (3 staggered) ──
          const rings: {
            mesh: THREE.Mesh;
            mat: THREE.MeshBasicMaterial;
            delay: number;
          }[] = [];
          for (let i = 0; i < 3; i++) {
            const ringGeo = new THREE.TorusGeometry(20, 1.5, 8, 64);
            ringGeo.rotateX(Math.PI / 2); // flat horizontal
            const ringMat = new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: 0.8,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            group.add(ring);
            rings.push({ mesh: ring, mat: ringMat, delay: i * 0.4 });
          }

          // ── Central pulse sphere ──
          const pulseGeo = new THREE.SphereGeometry(8, 16, 16);
          const pulseMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const pulse = new THREE.Mesh(pulseGeo, pulseMat);
          group.add(pulse);

          // ── Animation ──
          const startTime = performance.now();
          const duration = 4000; // 4 seconds total

          const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = elapsed / duration; // 0 → 1

            if (t >= 1) {
              scene.remove(group);
              pillarGeo.dispose();
              pillarMat.dispose();
              pulseGeo.dispose();
              pulseMat.dispose();
              rings.forEach((r) => {
                r.mesh.geometry.dispose();
                r.mat.dispose();
              });
              return; // stop animation
            }

            // Track the ship's live position
            target.getWorldPosition(wp);
            group.position.copy(wp);

            // Pillar: fade out, slight vertical stretch
            pillarMat.opacity = 0.6 * (1 - t * t);
            pillar.scale.y = 1 + t * 0.5;

            // Rings: expand outward with staggered timing
            rings.forEach(({ mesh, mat, delay }) => {
              const rt = Math.max(
                0,
                (elapsed - delay * 1000) / (duration - delay * 1000),
              );
              const ringScale = 1 + rt * 25; // expand to 25× original
              mesh.scale.set(ringScale, ringScale, ringScale);
              mat.opacity = 0.8 * Math.max(0, 1 - rt * rt);
            });

            // Pulse: throb and fade
            const pulseScale = 1 + Math.sin(t * Math.PI * 6) * 0.4 * (1 - t);
            pulse.scale.set(pulseScale, pulseScale, pulseScale);
            pulseMat.opacity = 0.9 * (1 - t);

            requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);

          dlog(
            `🎯 ${label} located at [${wp.x.toFixed(0)}, ${wp.y.toFixed(0)}, ${wp.z.toFixed(0)}]`,
          );
        };

        (window as any).locateFalcon = () => {
          const falcon = spaceshipRef.current;
          if (!falcon) {
            dlog("❌ Falcon not loaded yet");
            return;
          }
          createLocateBeacon(falcon, 0x4499ff, "Millennium Falcon");
        };
        (window as any).inspectFalcon = () => {
          engageInspectFalcon("console");
        };
        (window as any).exitInspectFalcon = () => {
          disengageInspectFalcon("console");
        };

        (window as any).locateSD = () => {
          const sd = starDestroyerRef.current;
          if (!sd) {
            dlog("❌ Star Destroyer not loaded yet");
            return;
          }
          createLocateBeacon(sd, 0xff4422, "Star Destroyer");
        };
        (window as any).shadowSD = () => {
          engageShadowSD("console");
        };
        (window as any).unShadowSD = () => {
          disengageShadowSD("console");
        };

        // ── Debug Camera Mode ────────────────────────────────────────
        // Console: debugCamera()  — enter free-flight debug mode
        //          exitDebugCamera() — re-engage ship follow
        // Controls:
        //   WASD      — move forward/left/backward/right
        //   Q / E     — move down / up
        //   Shift     — 10x speed boost
        //   Ctrl      — 0.1x slow precision mode
        //   Mouse     — orbit (camera-controls native)
        //   Scroll    — zoom (camera-controls native)
        //   F9        — capture camera position to console
        //   Escape    — exit debug camera mode
        let debugCamActive = false;
        let debugCamRAF = 0;
        const debugKeys: Record<string, boolean> = {};
        const DEBUG_BASE_SPEED = 200; // units/sec — tune for universe scale

        const debugKeyDown = (e: KeyboardEvent) => {
          debugKeys[e.key.toLowerCase()] = true;
          if (e.key === "F9") {
            e.preventDefault();
            const cam = sceneRef.current.camera;
            if (!cam) return;
            const p = cam.position;
            const target = new THREE.Vector3();
            (sceneRef.current.controls as any)?.getTarget(target);
            dlog("═══════════════════════════════════════════════════");
            dlog("📷 DEBUG CAMERA — Position Capture");
            dlog("═══════════════════════════════════════════════════");
            dlog(
              `Camera position : { x: ${p.x.toFixed(1)}, y: ${p.y.toFixed(1)}, z: ${p.z.toFixed(1)} }`,
            );
            dlog(
              `Look-at target  : { x: ${target.x.toFixed(1)}, y: ${target.y.toFixed(1)}, z: ${target.z.toFixed(1)} }`,
            );
            dlog("");
            dlog("📋 Copy-paste for code:");
            dlog(
              `  camera: { x: ${p.x.toFixed(1)}, y: ${p.y.toFixed(1)}, z: ${p.z.toFixed(1)} }`,
            );
            dlog(
              `  target: { x: ${target.x.toFixed(1)}, y: ${target.y.toFixed(1)}, z: ${target.z.toFixed(1)} }`,
            );
            dlog(
              `  setLookAt(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}, ${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}, false);`,
            );
            dlog("═══════════════════════════════════════════════════");
          }
          if (e.key === "Escape" && debugCamActive) {
            e.preventDefault();
            (window as any).exitDebugCamera();
          }
        };
        const debugKeyUp = (e: KeyboardEvent) => {
          debugKeys[e.key.toLowerCase()] = false;
        };

        const debugCamLoop = () => {
          if (!debugCamActive) return;
          const cam = sceneRef.current.camera;
          const cc = sceneRef.current.controls;
          if (!cam || !cc) {
            debugCamRAF = requestAnimationFrame(debugCamLoop);
            return;
          }

          const dt = 1 / 60; // approximate
          let speed = DEBUG_BASE_SPEED;
          if (debugKeys["shift"]) speed *= 10;
          if (debugKeys["control"]) speed *= 0.1;
          const step = speed * dt;

          // Build movement vector in camera-local space
          const move = new THREE.Vector3();
          if (debugKeys["w"]) move.z -= step;
          if (debugKeys["s"]) move.z += step;
          if (debugKeys["a"]) move.x -= step;
          if (debugKeys["d"]) move.x += step;
          if (debugKeys["e"]) move.y += step;
          if (debugKeys["q"]) move.y -= step;

          if (move.lengthSq() > 0) {
            // Transform to world space using camera orientation
            move.applyQuaternion(cam.quaternion);
            // Move both camera and orbit target together (truck-style)
            const target = new THREE.Vector3();
            (cc as any).getTarget(target);
            const newCam = cam.position.clone().add(move);
            const newTarget = target.clone().add(move);
            (cc as any).setLookAt(
              newCam.x,
              newCam.y,
              newCam.z,
              newTarget.x,
              newTarget.y,
              newTarget.z,
              false,
            );
          }

          debugCamRAF = requestAnimationFrame(debugCamLoop);
        };

        (window as any).debugCamera = () => {
          if (debugCamActive) {
            dlog(
              "⚠️ Debug camera already active. Use exitDebugCamera() to exit.",
            );
            return;
          }
          debugCamActive = true;

          if (inspectFalconModeRef.current) {
            disengageInspectFalcon("system");
          }

          if (shadowSDModeRef.current) {
            disengageShadowSD("system");
          }

          // Disengage ship following
          followingSpaceshipRef.current = false;
          setFollowingSpaceship(false);
          insideShipRef.current = false;
          setInsideShip(false);

          // Unlock camera controls for free orbiting
          const cc = sceneRef.current.controls;
          if (cc) {
            cc.minDistance = 0.01;
            cc.maxDistance = 999999;
            cc.enabled = true;
          }

          // Start movement loop
          window.addEventListener("keydown", debugKeyDown);
          window.addEventListener("keyup", debugKeyUp);
          debugCamRAF = requestAnimationFrame(debugCamLoop);

          dlog("═══════════════════════════════════════════════════");
          dlog("🎥 DEBUG CAMERA MODE — ACTIVE");
          dlog("═══════════════════════════════════════════════════");
          dlog("  WASD        — fly forward/left/back/right");
          dlog("  Q / E       — descend / ascend");
          dlog("  Shift       — 10× speed boost");
          dlog("  Ctrl        — 0.1× precision mode");
          dlog("  Mouse drag  — orbit / look around");
          dlog("  Scroll      — zoom in/out");
          dlog("  F9          — 📷 capture position to console");
          dlog("  Escape      — exit debug mode");
          dlog("═══════════════════════════════════════════════════");
          dlog("  exitDebugCamera() — re-engage ship follow");
          dlog("═══════════════════════════════════════════════════");
        };

        (window as any).exitDebugCamera = () => {
          if (!debugCamActive) {
            dlog("⚠️ Debug camera not active.");
            return;
          }
          debugCamActive = false;
          cancelAnimationFrame(debugCamRAF);
          window.removeEventListener("keydown", debugKeyDown);
          window.removeEventListener("keyup", debugKeyUp);
          // Clear stuck keys
          Object.keys(debugKeys).forEach((k) => (debugKeys[k] = false));

          // Re-engage ship following
          followingSpaceshipRef.current = true;
          setFollowingSpaceship(true);
          setShipUIPhase("ship-engaged");

          // Snap camera behind ship
          const cc = sceneRef.current.controls;
          const ship = spaceshipRef.current;
          if (cc && ship) {
            const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(
              ship.quaternion,
            );
            const camPos = ship.position
              .clone()
              .addScaledVector(behind, FOLLOW_DISTANCE);
            camPos.y += FOLLOW_HEIGHT;
            cc.setLookAt(
              camPos.x,
              camPos.y,
              camPos.z,
              ship.position.x,
              ship.position.y,
              ship.position.z,
              true,
            );
          }

          dlog("✅ Debug camera exited — ship follow re-engaged");
        };
      },
      undefined,
      () => {
        vlog("❌ Failed to load Star Destroyer model");
        markSceneModelLoaded();
      },
    );

    // --- INTERACTION ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const debugHitMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffff66,
        emissive: 0xffee88,
        emissiveIntensity: 1.2,
      }),
    );
    debugHitMarker.visible = false;
    scene.add(debugHitMarker);
    debugHitMarkerRef.current = debugHitMarker;

    const { onPointerDownRotate, onPointerMoveRotate, onPointerUpRotate } =
      buildRotationHandlers({ raycaster, pointer, camera });

    const { enterMoonView, exitMoonView } = createMoonFocusController({
      scene,
      items,
      overlayClickables,
      attachMultiNoteOverlays,
      setContentLoading,
      setOverlayContent,
      vlog,
      sceneRef,
      focusedMoonRef,
      focusedMoonCameraDistanceRef,
      frozenOrbitalSpeedsRef,
      frozenSystemStateRef,
      optionsRef,
      onOptionsChange,
      isDraggingRef,
      cameraDirectorRef,
      setMinDistance,
      freezeOrbitalMotion,
      lastMoonOrbitSpeedRef,
      lastMoonSpinSpeedRef,
      getMoonPortfolio,
    });

    // Wrap enterMoonView so that when arriving via ship navigation
    // (useFlight: false) in 3rd-person exterior mode, the camera is
    // gently repositioned behind the ship for a good view of the moon.
    // The user's current view mode (cockpit, cabin, exterior) is preserved.
    enterMoonViewRef.current = async (params) => {
      // Reposition camera in exterior follow mode for a clean arrival view
      if (
        !params.useFlight &&
        !insideShipRef.current &&
        followingSpaceshipRef.current &&
        sceneRef.current.controls &&
        spaceshipRef.current
      ) {
        const cc = sceneRef.current.controls;
        const ship = spaceshipRef.current;
        const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(
          ship.quaternion,
        );
        const camPos = ship.position.clone().addScaledVector(behind, 50);
        camPos.y += 20;
        cc.setLookAt(
          camPos.x,
          camPos.y,
          camPos.z,
          ship.position.x,
          ship.position.y,
          ship.position.z,
          true,
        );
      }

      await enterMoonView(params);

      // When arriving via ship navigation, the camera is being
      // repositioned programmatically (setLookAt, moveTo). These
      // moves fire camera-controls "update" events which would
      // trip the zoom-exit handler (distance change > threshold).
      // Suppress zoom-exit detection for a settling period by
      // nulling the baseline — the handler falls back to
      // `base = currentDist`, making diff = 0.
      if (!params.useFlight) {
        focusedMoonCameraDistanceRef.current = null;
        setTimeout(() => {
          if (focusedMoonRef.current && sceneRef.current.camera) {
            const mw = new THREE.Vector3();
            focusedMoonRef.current.getWorldPosition(mw);
            focusedMoonCameraDistanceRef.current =
              sceneRef.current.camera.position.distanceTo(mw);
          }
        }, 2500);
      }
    };

    // ── Moon orbit arrival handler ─────────────────────────────────────────────
    // When the nav system reports arrival at a moon, we kick off the orbit
    // state machine instead of immediately entering the content overlay.
    // Content / drone will appear once orbit is established.
    onMoonOrbitArrivalRef.current = (moonMesh: THREE.Mesh, company: any) => {
      const ship = spaceshipRef.current;
      const name = company.navLabel || company.company;
      debugLog("orbit", `onMoonOrbitArrival fired for "${name}"`);
      if (!ship) {
        debugLog("orbit", "ABORT — spaceshipRef is null");
        return;
      }

      // Compute moon radius from its geometry bounding sphere
      const geo = moonMesh.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const moonRadius = (geo.boundingSphere?.radius ?? 30) * moonMesh.scale.x;
      debugLog(
        "orbit",
        `moonRadius=${moonRadius.toFixed(1)}, scale=${moonMesh.scale.x.toFixed(2)}`,
      );

      const shipPos = ship.position;
      const moonPos = new THREE.Vector3();
      moonMesh.getWorldPosition(moonPos);
      debugLog(
        "orbit",
        `ship=[${shipPos.x.toFixed(1)},${shipPos.y.toFixed(1)},${shipPos.z.toFixed(1)}]`,
      );
      debugLog(
        "orbit",
        `moon=[${moonPos.x.toFixed(1)},${moonPos.y.toFixed(1)},${moonPos.z.toFixed(1)}]`,
      );

      // Kick off orbit
      enterOrbit(moonMesh, moonRadius, ship);
      setOrbitPhase("hold");
      shipLog(`Orbit hold — ${name}`, "orbit");
      debugLog("orbit", "Phase → hold");

      // Slow moon self-rotation to 1/3 during orbit for a calm view
      const prevSpinSpeed = optionsRef.current.spaceMoonSpinSpeed ?? 0.1;
      optionsRef.current = {
        ...optionsRef.current,
        spaceMoonSpinSpeed: prevSpinSpeed / 3,
      };
      debugLog(
        "orbit",
        `Moon spin slowed: ${prevSpinSpeed.toFixed(3)} → ${(prevSpinSpeed / 3).toFixed(3)}`,
      );

      // Suppress zoom-exit detection while in orbit — camera moves continuously
      focusedMoonCameraDistanceRef.current = null;

      // When orbit is fully established, show drone content
      onOrbitEstablishedRef.current = () => {
        setOrbitPhase("orbiting");
        shipLog("Stable orbit established", "orbit");
        debugLog("orbit", "Phase → orbiting — calling enterMoonView");

        // Now trigger the content overlay via the old enterMoonView path
        enterMoonView({
          moonMesh,
          company,
          useFlight: false,
        });

        // Keep zoom-exit suppressed during orbiting
        focusedMoonCameraDistanceRef.current = null;
        debugLog("orbit", "enterMoonView called, zoom-exit suppressed");
      };

      // When orbit exit finishes, clean up
      orbitExitCompleteRef.current = () => {
        setOrbitPhase("idle");
        shipLog("Orbit departed", "orbit");
        debugLog("orbit", "Phase → idle (exit complete)");

        // Restore moon self-rotation to original speed
        optionsRef.current = {
          ...optionsRef.current,
          spaceMoonSpinSpeed: prevSpinSpeed,
        };
        debugLog("orbit", `Moon spin restored: ${prevSpinSpeed.toFixed(3)}`);

        // Fully exit moon focus — clears focusedMoonRef, overlayContent,
        // hides hologram drone, and restores frozen orbital motion.
        // Without this, the moon stays "focused" and can re-trigger orbit.
        exitMoonView();
        debugLog("orbit", "exitMoonView called — full cleanup");

        // Re-enable zoom-exit detection
        focusedMoonCameraDistanceRef.current = null;

        const pendingNav = pendingOrbitExitNavigationRef.current;
        pendingOrbitExitNavigationRef.current = null;
        if (pendingNav && !manualFlightModeRef.current) {
          debugLog(
            "orbit",
            `Running deferred nav after orbit exit: ${pendingNav.targetType}:${pendingNav.targetId}`,
          );
          handleAutopilotNavigation(
            pendingNav.targetId,
            pendingNav.targetType,
            pendingNav.departure,
          );
        }
      };
    };

    // freezeOrbitalMotion moved earlier in the file to avoid hoisting issues

    // --- COSMIC SYSTEMS INITIALIZATION ---
    // Initialize camera director for cinematic movements
    cameraDirectorRef.current = new CosmosCameraDirector(camera, controls);

    // Initialize tour builder
    tourBuilderRef.current = new TourDefinitionBuilder();

    // Register planet data for tours
    const registerPlanetData = () => {
      // Register Experience Planet
      const expPlanetData: PlanetData = {
        name: "Experience",
        position: expPlanet.position.clone(),
        data: resumeData.experience,
        moons: Object.values(resumeData.experience)
          .flat()
          .map((job, index) => ({
            name: job.company,
            position: new THREE.Vector3(
              expPlanet.position.x + (60 + index * 20) * Math.cos(index * 0.8),
              expPlanet.position.y + (index % 2 === 0 ? 10 : -10),
              expPlanet.position.z + (60 + index * 20) * Math.sin(index * 0.8),
            ),
            data: job,
          })),
      };

      // Register Skills Planet
      const skillsPlanetData: PlanetData = {
        name: "Skills",
        position: skillsAnchor.clone(),
        data: resumeData.skills,
        moons: Object.keys(resumeData.skills).map((category, index) => ({
          name: category,
          position: new THREE.Vector3(
            skillsAnchor.x + (70 + index * 15) * Math.cos(index * 1.2),
            skillsAnchor.y + (index % 2 === 0 ? 15 : -15),
            skillsAnchor.z + (70 + index * 15) * Math.sin(index * 1.2),
          ),
          data: (resumeData.skills as any)[category],
        })),
      };
      const portfolioPlanetData: PlanetData = {
        name: "Portfolio",
        position: ORBITAL_PORTFOLIO_WORLD_ANCHOR.clone(),
        data: portfolioCores,
      };

      tourBuilderRef.current?.registerPlanet("experience", expPlanetData);
      tourBuilderRef.current?.registerPlanet("skills", skillsPlanetData);
      tourBuilderRef.current?.registerPlanet("portfolio", portfolioPlanetData);

      planetsDataRef.current.set("experience", expPlanetData);
      planetsDataRef.current.set("skills", skillsPlanetData);
      planetsDataRef.current.set("portfolio", portfolioPlanetData);
    };

    registerPlanetData();

    // ── CAMERA DEBUG TOOL ──────────────────────────────────────────
    // Exposes window.captureCameraSnapshot(planetName?) to copy JSON with
    // camera/controls/mode context so a view can be reconstructed exactly.
    // Shift+F8 is a shortcut. __captureViewpoint is kept as an alias.
    (window as any).captureCameraSnapshot = (planetName?: string) => {
      const cam = sceneRef.current.camera;
      const cc = sceneRef.current.controls;
      if (!cam) {
        dlog("❌ No camera available");
        return;
      }

      const camPos = cam.position.clone();
      const orbitTarget = new THREE.Vector3();
      if (cc) (cc as any).getTarget?.(orbitTarget);
      const perspectiveCam =
        cam instanceof THREE.PerspectiveCamera ? cam : null;
      const controlsAny = cc as unknown as {
        minDistance?: number;
        maxDistance?: number;
        smoothTime?: number;
        draggingSmoothTime?: number;
        dollySpeed?: number;
      };
      const round = (n: number, digits = 3) =>
        Number.isFinite(n) ? Number(n.toFixed(digits)) : n;
      const asVec = (v: THREE.Vector3) => ({
        x: round(v.x),
        y: round(v.y),
        z: round(v.z),
      });
      const asQuat = (q: THREE.Quaternion) => ({
        x: round(q.x, 5),
        y: round(q.y, 5),
        z: round(q.z, 5),
        w: round(q.w, 5),
      });
      const snapshot = {
        schema: "resume-space-camera-snapshot-v1",
        capturedAtIso: new Date().toISOString(),
        camera: {
          position: asVec(camPos),
          quaternion: asQuat(cam.quaternion),
          up: asVec(cam.up),
          near: round(cam.near),
          far: round(cam.far),
          layersMask: cam.layers.mask,
          fov: perspectiveCam ? round(perspectiveCam.fov, 4) : undefined,
          zoom: round(cam.zoom, 4),
        },
        controls: {
          enabled: !!cc?.enabled,
          target: asVec(orbitTarget),
          minDistance:
            typeof controlsAny?.minDistance === "number"
              ? round(controlsAny.minDistance)
              : undefined,
          maxDistance:
            typeof controlsAny?.maxDistance === "number"
              ? round(controlsAny.maxDistance)
              : undefined,
          smoothTime:
            typeof controlsAny?.smoothTime === "number"
              ? round(controlsAny.smoothTime, 4)
              : undefined,
          draggingSmoothTime:
            typeof controlsAny?.draggingSmoothTime === "number"
              ? round(controlsAny.draggingSmoothTime, 4)
              : undefined,
          dollySpeed:
            typeof controlsAny?.dollySpeed === "number"
              ? round(controlsAny.dollySpeed, 4)
              : undefined,
        },
        appState: {
          currentNavigationTarget: currentNavigationTargetRef.current ?? null,
          followingSpaceship: followingSpaceshipRef.current,
          insideShip: insideShipRef.current,
          shipViewMode: shipViewModeRef.current,
          orbitalPortfolioActive: orbitalPortfolioActiveRef.current,
          orbitalPortfolioPlaying: orbitalPortfolioPlayingRef.current,
          skillsLatticeActive: skillsLatticeActiveRef.current,
          aboutMemorySquareActive: aboutMemorySquareActiveRef.current,
          navFlags: {
            portfolioNavHereActive,
            skillsNavHereActive,
            aboutNavHereActive,
          },
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: round(window.devicePixelRatio, 4),
        },
        renderer: {
          toneMappingExposure: rendererRef.current
            ? round(rendererRef.current.toneMappingExposure, 4)
            : undefined,
        },
      };

      const snapshotJson = JSON.stringify(snapshot, null, 2);
      dlog("[CAMERA_SNAPSHOT]", snapshot);
      try {
        void navigator.clipboard?.writeText(snapshotJson);
        shipLog("Camera snapshot copied to clipboard", "info");
      } catch {
        shipLog(
          "Camera snapshot capture complete (clipboard unavailable)",
          "info",
        );
      }

      // Gather all planets
      const planets: Array<{
        name: string;
        worldPos: THREE.Vector3;
        radius: number;
      }> = [];
      sceneRef.current.scene?.traverse((obj: any) => {
        if (obj.isMesh && obj.userData?.sectionId) {
          const wp = new THREE.Vector3();
          obj.getWorldPosition(wp);
          const geo = obj.geometry;
          const r =
            geo?.parameters?.radius ??
            (geo?.boundingSphere
              ? (geo.computeBoundingSphere(), geo.boundingSphere?.radius ?? 10)
              : 10);
          planets.push({
            name: obj.userData.sectionId,
            worldPos: wp,
            radius: r,
          });
        }
      });

      // If planetName provided, filter to it
      let targets = planets;
      if (planetName) {
        targets = planets.filter(
          (p) => p.name.toLowerCase() === planetName.toLowerCase(),
        );
      }

      dlog("═══════════════════════════════════════");
      dlog("📷 CAMERA VIEWPOINT CAPTURE");
      dlog("═══════════════════════════════════════");
      dlog(
        `Camera position: { x: ${camPos.x.toFixed(1)}, y: ${camPos.y.toFixed(1)}, z: ${camPos.z.toFixed(1)} }`,
      );
      dlog(
        `Orbit target:    { x: ${orbitTarget.x.toFixed(1)}, y: ${orbitTarget.y.toFixed(1)}, z: ${orbitTarget.z.toFixed(1)} }`,
      );

      if (targets.length === 0 && planets.length > 0) {
        // If no sectionId found, try planetName userData
        sceneRef.current.scene?.traverse((obj: any) => {
          if (obj.isMesh && obj.userData?.planetName) {
            const wp = new THREE.Vector3();
            obj.getWorldPosition(wp);
            const geo = obj.geometry;
            const r = geo?.parameters?.radius ?? 10;
            const pn = obj.userData.planetName as string;
            if (
              !planetName ||
              pn.toLowerCase().includes(planetName.toLowerCase())
            ) {
              targets.push({ name: pn, worldPos: wp, radius: r });
            }
          }
        });
      }

      // Also check planetsDataRef
      if (targets.length === 0) {
        planetsDataRef.current.forEach((data, key) => {
          if (
            !planetName ||
            key.toLowerCase().includes(planetName.toLowerCase())
          ) {
            targets.push({
              name: key,
              worldPos: data.position.clone(),
              radius: (data as any).radius ?? 20,
            });
          }
        });
      }

      for (const planet of targets) {
        const offset = camPos.clone().sub(planet.worldPos);
        const dist = camPos.distanceTo(planet.worldPos);
        // Compute spherical angles relative to the planet
        const theta = Math.atan2(offset.x, offset.z) * (180 / Math.PI); // azimuth
        const phi =
          Math.asin(
            Math.min(1, Math.max(-1, offset.y / Math.max(dist, 0.001))),
          ) *
          (180 / Math.PI); // elevation

        dlog(`\n🪐 Planet: ${planet.name}`);
        dlog(
          `   Planet world pos: { x: ${planet.worldPos.x.toFixed(1)}, y: ${planet.worldPos.y.toFixed(1)}, z: ${planet.worldPos.z.toFixed(1)} }`,
        );
        dlog(`   Planet radius: ${planet.radius.toFixed(1)}`);
        dlog(`   Camera distance: ${dist.toFixed(1)}`);
        dlog(
          `   Camera offset:   { x: ${offset.x.toFixed(1)}, y: ${offset.y.toFixed(1)}, z: ${offset.z.toFixed(1)} }`,
        );
        dlog(`   Azimuth: ${theta.toFixed(1)}°  Elevation: ${phi.toFixed(1)}°`);
        dlog(`   Distance / radius: ${(dist / planet.radius).toFixed(1)}x`);

        // Output a copy-pasteable viewpoint object
        dlog(`   📋 Viewpoint data:`);
        dlog(
          `   { offset: { x: ${offset.x.toFixed(1)}, y: ${offset.y.toFixed(1)}, z: ${offset.z.toFixed(1)} }, distance: ${dist.toFixed(1)}, azimuth: ${theta.toFixed(1)}, elevation: ${phi.toFixed(1)} }`,
        );
      }

      if (targets.length === 0) {
        dlog("\n⚠️ No planets found. Available planet names:");
        planets.forEach((p) => dlog(`   - ${p.name}`));
        dlog("   (Also try: 'experience', 'skills', 'projects', 'portfolio')");
      }
      dlog("═══════════════════════════════════════");
    };
    (window as any).__captureViewpoint = (planetName?: string) => {
      (window as any).captureCameraSnapshot(planetName);
    };

    // Keyboard shortcut: Shift+F8 to capture viewpoint
    const handleDebugKey = (e: KeyboardEvent) => {
      if (e.key === "F8" && e.shiftKey) {
        e.preventDefault();
        (window as any).captureCameraSnapshot();
      }
    };
    window.addEventListener("keydown", handleDebugKey);

    // Initialize tour guide with content display handler
    const handleContentDisplay = (waypoint: NavigationWaypoint) => {
      vlog(`🎬 Tour waypoint: ${waypoint.name}`);
      setTourWaypoint(waypoint.name);
      if (waypoint.narration) {
        vlog(`📖 ${waypoint.narration}`);
      }

      // If this is an experience moon waypoint, delegate to the same
      // experience-company navigation handler so camera travel and
      // right-pane content match an explicit moon click.
      // If this is an experience moon waypoint, finalize focus using the
      // same overlay/attach logic as clicking the moon (Tour already flew).
      if (waypoint.id && waypoint.id.startsWith("experience-moon-")) {
        try {
          const candidate =
            (waypoint.content && (waypoint.content as any).title) ||
            waypoint.name;
          const company = (resumeData.experience as any[]).find((c) => {
            if (!c) return false;
            const lname = (c.company || c.id || "").toLowerCase();
            return candidate
              .toLowerCase()
              .includes(lname.split(" ")[0] || lname);
          });
          if (company) {
            // locate moon mesh
            let moonMesh: THREE.Mesh | undefined;
            sceneRef.current.scene?.traverse((object) => {
              if (object instanceof THREE.Mesh && object.userData.planetName) {
                const pname = object.userData.planetName.toLowerCase();
                if (
                  pname.includes((company.id || "").toLowerCase()) ||
                  pname.includes((company.company || "").toLowerCase())
                ) {
                  moonMesh = object;
                }
              }
            });

            if (moonMesh) {
              setContentLoading(true);
              enterMoonView({ moonMesh, company, useFlight: false });
              return;
            }
          }
        } catch (e) {
          vlog("⚠️ Error finalizing tour waypoint");
        }
      }

      // Default: Show content without overlay blocking the view
      if (waypoint.content) {
        setOverlayContent(waypoint.content);
        setContentLoading(false);
      }
    };

    const handleProgressUpdate = (current: number, total: number) => {
      setTourProgress({ current, total });
    };

    tourGuideRef.current = new CosmicTourGuide(
      cameraDirectorRef.current,
      handleContentDisplay,
      handleProgressUpdate,
    );

    // Initialize navigation interface
    const handleNavigation = async (target: string) => {
      if (!cameraDirectorRef.current) return;
      if (target !== ABOUT_MEMORY_SQUARE_NAV_ID) {
        aboutMemorySquarePendingEntryRef.current = false;
        aboutMemorySquareActiveRef.current = false;
        aboutMemorySquareNavIntentUntilRef.current = 0;
        setAboutNavHereActive(false);
        setExternalCosmosLabelsHiddenForAbout(false);
        cancelAboutMemorySquareEntrySequence();
      }
      if (target !== "skills") {
        setSkillsNavHereActive(false);
      }

      // If a moon is currently focused, schedule exit so its orbit resumes before navigating
      if (focusedMoonRef.current) {
        exitFocusRequestRef.current = true;
      }

      // Any navigation cancels Star Destroyer escort
      if (followingStarDestroyerRef.current) {
        setFollowingStarDestroyer(false);
        followingStarDestroyerRef.current = false;
        vlog("🔺 Star Destroyer escort disengaged — navigating elsewhere");
      }
      if (shadowSDModeRef.current) {
        disengageShadowSD("system");
      }

      switch (target) {
        case "home":
          // Stop following spaceship if we were
          if (followingSpaceship) {
            setFollowingSpaceship(false);
            followingSpaceshipRef.current = false;
            if (sceneRef.current.controls)
              sceneRef.current.controls.enabled = true;
          }
          if (startIntroSequenceRef.current) {
            startIntroSequenceRef.current();
          } else {
            await cameraDirectorRef.current.systemOverview();
          }
          break;
        case "about":
          if (
            aboutJourneyRef.current &&
            aboutJourneyRef.current.phase > AboutJourneyPhase.TRANSIT
          ) {
            break;
          }
          setAboutNavHereActive(true);
          vlog("✨ About — routing to particle swarm...");
          if (!manualFlightModeRef.current) {
            setFollowingSpaceship(true);
            followingSpaceshipRef.current = true;
            setInsideShip(false);
            insideShipRef.current = false;
            setShipViewMode("exterior");
            shipViewModeRef.current = "exterior";
            if (spaceshipRef.current) spaceshipRef.current.visible = true;
            aboutJourneyPendingEntryRef.current = true;
            aboutJourneyRef.current?.beginTransit();
            handleQuickNav("about", "section");
          }
          break;
        case ABOUT_MEMORY_SQUARE_NAV_ID:
          setAboutNavHereActive(true);
          vlog("👨‍🚀 Memory Squares — routing to destination...");
          if (!manualFlightModeRef.current) {
            setFollowingSpaceship(true);
            followingSpaceshipRef.current = true;
            setInsideShip(false);
            insideShipRef.current = false;
            setShipViewMode("exterior");
            shipViewModeRef.current = "exterior";
            if (spaceshipRef.current) spaceshipRef.current.visible = true;
            aboutMemorySquarePendingEntryRef.current = true;
            aboutMemorySquareActiveRef.current = false;
            aboutMemorySquareNavIntentUntilRef.current =
              performance.now() + 20000;
            handleQuickNav(ABOUT_MEMORY_SQUARE_NAV_ID, "section");
          } else {
            aboutMemorySquarePendingEntryRef.current = false;
            aboutMemorySquareActiveRef.current = false;
            aboutMemorySquareNavIntentUntilRef.current = 0;
            setExternalCosmosLabelsHiddenForAbout(true);
            const aboutFocusObject =
              aboutMemorySquareRootRef.current ??
              (() => {
                const anchor = aboutMemorySquareWorldAnchorRef.current;
                if (!anchor) return null;
                const proxy = new THREE.Object3D();
                proxy.position.copy(anchor);
                return proxy;
              })();
            if (aboutFocusObject) {
              await cameraDirectorRef.current.focusPlanet(
                aboutFocusObject,
                ABOUT_MEMORY_SQUARE_CAMERA_STOP_DIST,
              );
            } else {
              await cameraDirectorRef.current.systemOverview();
            }
            setMinDistance(
              originalMinDistanceRef.current,
              "restore after about",
            );
          }
          break;
        case "experience":
        case "skills":
        case "portfolio": {
          if (target === "portfolio") {
            setPortfolioNavHereActive(true);
          }
          if (target === "skills") {
            setSkillsNavHereActive(true);
          }
          const planetLabel =
            target === "experience"
              ? "🌍 Experience"
              : target === "skills"
                ? "⚡ Skills"
                : "✨ Portfolio";
          vlog(
            target === "portfolio"
              ? `${planetLabel} — Routing to orbital registry...`
              : `${planetLabel} — Traveling to ${target} Planet...`,
          );

          // Always use autopilot — ship is always engaged
          if (!manualFlightModeRef.current) {
            // Use unified quick-nav path to ensure moon-exit clearance applies.
            handleQuickNav(target, "section");
            break;
          }

          if (target === "portfolio") {
            enterOrbitalPortfolio();
            break;
          }

          // Fallback: manual flight mode — direct camera
          if (target === "experience") {
            await cameraDirectorRef.current.focusPlanet(
              expPlanet,
              EXP_FOCUS_DIST,
            );
          } else {
            const skillsFocusObject =
              skillsLatticeBeaconRef.current ??
              skillsLatticeRootRef.current ??
              (() => {
                const anchor = skillsLatticeWorldAnchorRef.current;
                if (!anchor) return null;
                const proxy = new THREE.Object3D();
                proxy.position.copy(anchor);
                return proxy;
              })();
            if (skillsFocusObject) {
              await cameraDirectorRef.current.focusPlanet(
                skillsFocusObject,
                SKILLS_FOCUS_DIST,
              );
            }
          }
          setMinDistance(
            originalMinDistanceRef.current,
            `restore after ${target}`,
          );
          break;
        }
        default:
          // Handle tour actions
          if (target.startsWith("tour:")) {
            const tourType = target.replace("tour:", "");
            vlog(`🚀 Tour request from navigation: ${tourType}`);

            if (tourBuilderRef.current && tourGuideRef.current) {
              let tour;
              switch (tourType) {
                case "career-journey":
                  tour = tourBuilderRef.current.createCareerJourneyTour();
                  break;
                case "technical-deep-dive":
                  tour = tourBuilderRef.current.createTechnicalDeepDiveTour();
                  break;
                case "leadership-story":
                  tour = tourBuilderRef.current.createLeadershipStoryTour();
                  break;
              }

              if (tour) {
                vlog(
                  `✅ Starting tour: ${tour.title} with ${tour.waypoints.length} waypoints`,
                );
                // Resolve any experience-moon waypoint positions to live moon world positions
                const resolvedWaypoints = tour.waypoints.map((wp) => {
                  try {
                    if (wp.id && wp.id.startsWith("experience-moon-")) {
                      const candidate =
                        (wp.content && (wp.content as any).title) || wp.name;
                      let moonMesh: THREE.Mesh | undefined;
                      sceneRef.current.scene?.traverse((object) => {
                        if (
                          object instanceof THREE.Mesh &&
                          object.userData.planetName
                        ) {
                          const pname = (
                            object.userData.planetName || ""
                          ).toLowerCase();
                          if (
                            candidate &&
                            pname.includes(
                              (candidate || "").toLowerCase().split(" ")[0],
                            )
                          ) {
                            moonMesh = object as THREE.Mesh;
                          }
                        }
                      });

                      if (moonMesh) {
                        const worldPos = new THREE.Vector3();
                        moonMesh.getWorldPosition(worldPos);
                        const offset = new THREE.Vector3(80, 40, 60);
                        return {
                          ...wp,
                          target: {
                            ...wp.target,
                            lookAt: worldPos.clone(),
                            position: worldPos.clone().add(offset),
                          },
                        } as typeof wp;
                      }
                    }
                  } catch (e) {
                    vlog("⚠️ Error resolving waypoint to mesh");
                  }
                  return wp;
                });

                setTourActive(true);
                setOverlayContent(null);
                setContentLoading(false);
                tourGuideRef.current.startTour(resolvedWaypoints);
              } else {
                vlog(`❌ Failed to create tour`);
              }
            } else {
              vlog(`❌ Tour system not initialized`);
            }
          }
          // Handle experience company specific navigation
          else if (target.startsWith("experience-")) {
            const companyId = target.replace("experience-", "");
            await handleExperienceCompanyNavigation(companyId);
          }
          break;
      }
    };

    handleNavigationRef.current = handleNavigation;

    const { onPointerMove, onClick } = buildPointerHandlers({
      camera,
      raycaster,
      pointer,
      clickablePlanets,
      overlayClickables,
      handleNavigation,
      resumeData,
      exitFocusedMoon: exitMoonView,
      vlog,
      starDestroyerRef,
      onStarDestroyerClick: handleStarDestroyerFriendlyClick,
      insideShipRef,
      getHologramPanelClickables: () =>
        hologramDroneRef.current?.getInteractivePanelMeshes() ?? [],
      onHologramPanelPicked: (panelIndex) => {
        if (hologramDroneRef.current?.isTechBadgeIndex(panelIndex)) {
          hologramDroneRef.current.handleTechBadgeClick(panelIndex);
        } else {
          hologramDroneRef.current?.selectPanel(panelIndex);
        }
      },
      onHologramPanelHover: (panelIndex) => {
        hologramDroneRef.current?.setHoveredPanelIndex(panelIndex ?? null);
      },
      onHologramEmptyClick: () => {
        hologramDroneRef.current?.clearLockedSear();
      },
    });

    const onPointerMoveGlobal = (event: PointerEvent) => {
      if (orbitalPortfolioActiveRef.current || skillsLatticeActiveRef.current)
        return;
      onPointerMove(event);
    };
    const onClickGlobal = (event: MouseEvent) => {
      if (orbitalPortfolioActiveRef.current || skillsLatticeActiveRef.current)
        return;
      onClick(event);
    };
    const onPointerDownRotateGlobal = (event: PointerEvent) => {
      if (orbitalPortfolioActiveRef.current) return;
      onPointerDownRotate(event);
    };
    const onPointerMoveRotateGlobal = (event: PointerEvent) => {
      if (orbitalPortfolioActiveRef.current) return;
      onPointerMoveRotate(event);
    };
    const onPointerUpRotateGlobal = (event: PointerEvent) => {
      if (orbitalPortfolioActiveRef.current) return;
      onPointerUpRotate(event);
    };

    window.addEventListener("pointermove", onPointerMoveGlobal);
    window.addEventListener("click", onClickGlobal);
    // Add rotate handlers
    window.addEventListener("pointerdown", onPointerDownRotateGlobal);
    window.addEventListener("pointermove", onPointerMoveRotateGlobal);
    window.addEventListener("pointerup", onPointerUpRotateGlobal);

    const onDebugPointerMove = (event: PointerEvent) => {
      if (!debugShipLabelModeRef.current || !spaceshipRef.current) {
        if (debugHitMarkerRef.current) {
          debugHitMarkerRef.current.visible = false;
        }
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(
        spaceshipRef.current.children,
        true,
      );
      const hit = hits.find((entry) => entry.object instanceof THREE.Mesh);

      if (!hit || !(hit.object instanceof THREE.Mesh)) {
        if (debugHitMarkerRef.current) {
          debugHitMarkerRef.current.visible = false;
        }
        return;
      }

      if (debugHitMarkerRef.current) {
        debugHitMarkerRef.current.visible = true;
        debugHitMarkerRef.current.position.copy(hit.point);
      }
    };

    const applyDebugLabel = (event: PointerEvent) => {
      if (!debugShipLabelModeRef.current || !spaceshipRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(
        spaceshipRef.current.children,
        true,
      );
      const hit = hits.find((entry) => entry.object instanceof THREE.Mesh);
      if (!hit || !(hit.object instanceof THREE.Mesh)) return;

      event.preventDefault();
      event.stopPropagation();

      const mesh = hit.object as THREE.Mesh;
      const labelColorMap: Record<string, number> = {
        front: 0x00ffcc,
        rear: 0xffaa00,
        left: 0x6699ff,
        right: 0xff66cc,
        top: 0x66ff66,
        bottom: 0xff6666,
        cockpit: 0xc084ff,
      };
      const label = debugShipLabelRef.current;
      const labelColor = labelColorMap[label];
      const ship = spaceshipRef.current;
      if (!ship) return;
      const localPoint = ship.worldToLocal(hit.point.clone());
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 14, 14),
        new THREE.MeshStandardMaterial({
          color: labelColor,
          emissive: labelColor,
          emissiveIntensity: 1.4,
        }),
      );
      marker.position.copy(localPoint);
      marker.userData.debugLabel = label;
      marker.userData.debugLabelTarget = mesh.uuid;
      ship.add(marker);
      debugShipLabelMarkersRef.current.push(marker);

      const mark: ShipLabelMark = {
        label,
        meshName: mesh.name,
        meshUuid: mesh.uuid,
        localPoint: [localPoint.x, localPoint.y, localPoint.z],
      };
      const nextMarks = debugShipLabelMarksRef.current[label]
        ? [...(debugShipLabelMarksRef.current[label] as ShipLabelMark[]), mark]
        : [mark];
      debugShipLabelMarksRef.current = {
        ...debugShipLabelMarksRef.current,
        [label]: nextMarks,
      };
      setDebugShipLabels((prev) => ({
        ...prev,
        [label]: prev[label] || { name: mesh.name, uuid: mesh.uuid },
      }));

      dlog("SHIP_DEBUG_LABEL", {
        label,
        mesh: mesh.name,
        uuid: mesh.uuid,
        localPoint: mark.localPoint,
      });

      if (debugHitMarkerRef.current) {
        const markerMat = debugHitMarkerRef.current
          .material as THREE.MeshStandardMaterial;
        markerMat.color.setHex(labelColor);
        markerMat.emissive.setHex(labelColor);
      }
    };

    const onDebugPointerDown = (event: PointerEvent) => {
      if (!debugShipLabelModeRef.current) return;
      debugPointerDownRef.current = {
        x: event.clientX,
        y: event.clientY,
        t: performance.now(),
      };
    };

    const onDebugPointerUp = (event: PointerEvent) => {
      if (!debugShipLabelModeRef.current) return;
      const start = debugPointerDownRef.current;
      debugPointerDownRef.current = null;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 6) return;
      applyDebugLabel(event);
    };

    const dumpShipLabels = () => {
      if (!spaceshipRef.current) return;
      const ship = spaceshipRef.current;
      const labelEntries = Object.entries(debugShipLabelMarksRef.current);
      const marks: Array<{
        label: ShipLabelTarget;
        mesh: string;
        uuid: string;
        localPoint: [number, number, number];
        worldPoint: [number, number, number];
      }> = [];

      labelEntries.forEach(([label, entries]) => {
        (entries as ShipLabelMark[] | undefined)?.forEach((entry) => {
          const local = new THREE.Vector3(
            entry.localPoint[0],
            entry.localPoint[1],
            entry.localPoint[2],
          );
          const world = ship.localToWorld(local.clone());
          marks.push({
            label: label as ShipLabelTarget,
            mesh: entry.meshName,
            uuid: entry.meshUuid,
            localPoint: entry.localPoint,
            worldPoint: [world.x, world.y, world.z],
          });
        });
      });

      dlog("SHIP_DEBUG_LABELS", marks);
    };

    window.addEventListener("pointermove", onDebugPointerMove);
    window.addEventListener("pointerdown", onDebugPointerDown, true);
    window.addEventListener("pointerup", onDebugPointerUp, true);

    const onDebugLabelKey = (event: KeyboardEvent) => {
      if (event.code === "KeyJ" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        dumpShipLabels();
      }
    };

    window.addEventListener("keydown", onDebugLabelKey, { capture: true });

    // Initialize navigation interface
    if (container) {
      navigationInterfaceRef.current = new NavigationInterface(
        container,
        handleNavigation,
      );
      window.dispatchEvent(
        new CustomEvent("cosmicVolumeChange", {
          detail: { volume: overallVolume * backgroundMusicVolume },
        }),
      );
      window.dispatchEvent(
        new CustomEvent("cosmicAudioChange", {
          detail: { track: musicEnabled ? musicTrack : "" },
        }),
      );
      // Tour guide functionality removed for simplification
      // Populate experience submenu dynamically with all jobs
      try {
        const submenu = container.querySelector(
          ".experience-submenu",
        ) as HTMLElement | null;
        if (submenu) {
          // clear existing static items
          submenu.innerHTML = "";
          resumeData.experience.forEach((company) => {
            const id =
              (company.id as string) ||
              company.company.toLowerCase().replace(/\s+/g, "-");
            const btn = document.createElement("button");
            btn.className = "target-button submenu-item";
            btn.dataset.target = `experience-${id}`;
            btn.dataset.company = company.company;
            btn.textContent = `${company.company}`;
            btn.addEventListener("click", () => {
              // Delegate to handleNavigation so behavior is consistent
              handleNavigation(`experience-${id}`);
            });
            submenu.appendChild(btn);
          });
        }
      } catch (e) {
        vlog("⚠️ Failed to populate experience submenu");
      }
    }

    // --- ANIMATION LOOP ---
    dwarn(
      "[PERF:scene] startRenderLoop called — render loop begins while loading screen is still visible",
    );
    startRenderLoop({
      exitFocusRequestRef,
      exitMoonView,
      spaceshipRef,
      shipCinematicRef,
      shipStagingModeRef,
      shipStagingKeysRef,
      manualFlightModeRef,
      introCameraPrealignedRef,
      manualFlightRef,
      currentNavigationTargetRef,
      keyboardStateRef,
      controlSensitivityRef,
      invertControlsRef,
      followingSpaceshipRef,
      sceneRef,
      focusedMoonRef,
      spaceshipEngineLightRef,
      spaceshipCameraOffsetRef,
      shipViewModeRef,
      insideShipRef,
      debugSnapToShipRef,
      shipExploreModeRef,
      shipExploreKeysRef,
      shipExploreCoordsRef,
      shipRollOffsetRef,
      navTurnActiveRef,
      settledViewTargetRef,
      optionsRef,
      hologramDroneRef,
      starDestroyerCruiserRef,
      starDestroyerRef,
      followingStarDestroyerRef,
      gpuWarmupInProgressRef,
      loadingActiveRef,
      tvPreviewControllerRef,
      dashcamControllerRef,
      updateAutopilotNavigation,
      moonPrewarmRequestRef,
      updateMoonOrbit: updateOrbit,
      isMoonOrbiting: isOrbiting,
      updateOrbitSystem,
      renderer,
      items,
      orbitAnchors,
      camera,
      controls,
      composer,
      labelRenderer,
      scene,
      sunMesh,
      vlog,
      debugLog,
      aboutParticleSwarmRef,
      aboutHydrateSwarmRef,
      aboutJourneyRef,
      aboutJourneyPendingEntryRef,
      navigationDistanceRef,
    });

    // Trigger loading complete with camera animation
    const { startIntroSequence, cancelIntroSequence } =
      createIntroSequenceRunner({
        camera,
        controls,
        sceneRef,
        spaceshipRef,
        shipCinematicRef,
        manualFlightModeRef,
        setFollowingSpaceship,
        followingSpaceshipRef,
        introCameraPrealignedRef,
        setHudVisible: () => {}, // legacy — old HUD panels removed
        setShipExteriorLights,
        sunMesh,
        onIntroEvent: (event) => {
          if (event === "camera-intro started") {
            resetStartupUiReveal();
          }
          if (!CAMERA_TRACE_ENABLED) return;
          shipLog(`[CAMTRACE] ${event}`, "info");
        },
      });

    startIntroSequenceRef.current = startIntroSequence;

    setTimeout(() => {
      dwarn("[PERF:scene] setSceneReady(true) — scene init complete");
      setSceneReady(true);

      // Boot message in ship terminal
      shipLog("Systems online", "system");
      shipLog("Navigation ready — autopilot engaged", "nav");

      // Start the orbital position emitter for tracking moving objects
      emitterRef.current.start();

      introStartQueuedRef.current = true;
      if (CAMERA_TRACE_ENABLED) {
        shipLog("[CAMTRACE] intro queued after load", "info");
      }
    }, 100);

    // --- CLEANUP ---
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect =
        mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(
        mountRef.current.clientWidth,
        mountRef.current.clientHeight,
      );
      composer.setSize(
        mountRef.current.clientWidth,
        mountRef.current.clientHeight,
      );
      labelRenderer.setSize(
        mountRef.current.clientWidth,
        mountRef.current.clientHeight,
      );
    };

    window.addEventListener("resize", handleResize);

    const handleCameraSnapshot = () => {
      const currentCamera = sceneRef.current.camera as
        | THREE.PerspectiveCamera
        | undefined;
      const currentControls = sceneRef.current.controls as
        | { target?: THREE.Vector3 }
        | undefined;

      if (!currentCamera || !currentControls?.target) return;

      const snapshot = {
        position: {
          x: currentCamera.position.x,
          y: currentCamera.position.y,
          z: currentCamera.position.z,
        },
        target: {
          x: currentControls.target.x,
          y: currentControls.target.y,
          z: currentControls.target.z,
        },
        rotation: {
          x: currentCamera.rotation.x,
          y: currentCamera.rotation.y,
          z: currentCamera.rotation.z,
        },
        fov: currentCamera.fov,
        zoom: currentCamera.zoom,
        near: currentCamera.near,
        far: currentCamera.far,
      };

      dlog("CAMERA_SNAPSHOT", snapshot);
    };

    const handleSnapshotKey = (event: KeyboardEvent) => {
      if (event.code === "KeyL" && event.shiftKey) {
        handleCameraSnapshot();
      }
    };

    window.addEventListener("keydown", handleSnapshotKey);

    const handleShipSnapshot = () => {
      const ship = spaceshipRef.current;
      if (!ship) return;

      const snapshot = {
        position: {
          x: ship.position.x,
          y: ship.position.y,
          z: ship.position.z,
        },
        rotation: {
          x: ship.rotation.x,
          y: ship.rotation.y,
          z: ship.rotation.z,
        },
        quaternion: {
          x: ship.quaternion.x,
          y: ship.quaternion.y,
          z: ship.quaternion.z,
          w: ship.quaternion.w,
        },
        scale: {
          x: ship.scale.x,
          y: ship.scale.y,
          z: ship.scale.z,
        },
      };

      dlog("SHIP_SNAPSHOT", snapshot);
    };

    const handleShipStagingKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyM" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const next = !shipStagingModeRef.current;
        shipStagingModeRef.current = next;
        if (next) {
          if (shipCinematicRef.current) {
            shipCinematicRef.current.active = false;
          }
          setFollowingSpaceship(false);
          followingSpaceshipRef.current = false;
          setManualFlightMode(false);
          manualFlightModeRef.current = false;
        }

        Object.keys(shipStagingKeysRef.current).forEach((key) => {
          shipStagingKeysRef.current[key] = false;
        });

        dlog(
          `SHIP_STAGING_MODE ${next ? "ENABLED" : "DISABLED"} (WASD/RF move, arrows/QE rotate, Shift for faster).`,
        );
        return;
      }

      if (event.code === "KeyP" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        handleShipSnapshot();
        return;
      }

      if (
        shipStagingModeRef.current &&
        event.code in shipStagingKeysRef.current
      ) {
        event.preventDefault();
        event.stopPropagation();
        shipStagingKeysRef.current[event.code] = true;
      }
    };

    const handleShipStagingKeyUp = (event: KeyboardEvent) => {
      if (
        shipStagingModeRef.current &&
        event.code in shipStagingKeysRef.current
      ) {
        event.preventDefault();
        event.stopPropagation();
        shipStagingKeysRef.current[event.code] = false;
      }
    };

    window.addEventListener("keydown", handleShipStagingKeyDown, {
      capture: true,
    });
    window.addEventListener("keyup", handleShipStagingKeyUp, { capture: true });

    // ─── SHIP EXPLORE MODE ─────────────────────────────────────
    // Ctrl+Shift+` (backtick) toggles explore mode for cockpit identification.
    const handleExploreKeyDown = (e: KeyboardEvent) => {
      // Toggle with Ctrl+Shift+`
      if (e.ctrlKey && e.shiftKey && e.code === "Backquote") {
        e.preventDefault();
        const entering = !shipExploreModeRef.current;
        shipExploreModeRef.current = entering;
        setShipExploreMode(entering);

        if (entering && spaceshipRef.current) {
          // Teleport camera near the ship center
          const ship = spaceshipRef.current;
          const shipPos = new THREE.Vector3();
          ship.getWorldPosition(shipPos);
          if (sceneRef.current.controls) {
            const p = shipPos.clone().add(new THREE.Vector3(0, 1, 3));
            const t = shipPos.clone().add(new THREE.Vector3(0, 0, 5));
            sceneRef.current.controls.setLookAt(
              p.x,
              p.y,
              p.z,
              t.x,
              t.y,
              t.z,
              false,
            );
          }
          vlog(
            "🔍 Ship explore mode ACTIVATED — use WASD to move, mouse to look",
          );
        } else {
          vlog("🔍 Ship explore mode DEACTIVATED");
          // Restore near plane
          if (camera instanceof THREE.PerspectiveCamera) {
            camera.near = NEAR_OVERVIEW;
            camera.updateProjectionMatrix();
          }
        }
        return;
      }

      // Track keys while explore mode is active
      if (shipExploreModeRef.current) {
        if (e.code in shipExploreKeysRef.current) {
          shipExploreKeysRef.current[e.code] = true;
        }
      }
    };

    const handleExploreKeyUp = (e: KeyboardEvent) => {
      if (shipExploreModeRef.current) {
        if (e.code in shipExploreKeysRef.current) {
          shipExploreKeysRef.current[e.code] = false;
        }
      }
    };

    window.addEventListener("keydown", handleExploreKeyDown, { capture: true });
    window.addEventListener("keyup", handleExploreKeyUp, { capture: true });

    // Poll explore coords into React state for the overlay (4 Hz is enough)
    const explorePollInterval = setInterval(() => {
      if (shipExploreModeRef.current) {
        setExploreCoords({ ...shipExploreCoordsRef.current });
      }
    }, 250);
    // ─── END SHIP EXPLORE MODE ─────────────────────────────────

    const cleanup = () => {
      stopRenderLoop();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleShipStagingKeyDown, {
        capture: true,
      });
      window.removeEventListener("keyup", handleShipStagingKeyUp, {
        capture: true,
      });
      window.removeEventListener("keydown", handleSnapshotKey);
      window.removeEventListener("pointermove", onPointerMoveGlobal);
      window.removeEventListener("click", onClickGlobal);
      window.removeEventListener("pointerdown", onPointerDownRotateGlobal);
      window.removeEventListener("pointermove", onPointerMoveRotateGlobal);
      window.removeEventListener("pointerup", onPointerUpRotateGlobal);
      window.removeEventListener("pointermove", onDebugPointerMove);
      window.removeEventListener("pointerdown", onDebugPointerDown, true);
      window.removeEventListener("pointerup", onDebugPointerUp, true);
      window.removeEventListener("keydown", onDebugLabelKey, { capture: true });
      window.removeEventListener("keydown", handleDebugKey);
      window.removeEventListener("keydown", handleExploreKeyDown, {
        capture: true,
      });
      window.removeEventListener("keyup", handleExploreKeyUp, {
        capture: true,
      });
      clearInterval(explorePollInterval);
      delete (window as any).captureCameraSnapshot;
      delete (window as any).__captureViewpoint;

      cancelIntroSequence();

      // Stop orbital position emitter
      emitterRef.current.stop();

      // Cleanup navigation system
      disposeNavigationSystem();

      // Cleanup hologram drone
      if (hologramDroneRef.current) {
        hologramDroneRef.current.dispose();
        hologramDroneRef.current = null;
      }
      orbitalPortfolioRootRef.current = null;
      orbitalPortfolioBeaconRef.current = null;
      orbitalPortfolioWorldAnchorRef.current = null;
      orbitalPortfolioStationsRef.current = [];
      orbitalPortfolioGroupsRef.current = [];
      orbitalPortfolioCoresRef.current = [];
      orbitalPortfolioCoresByIdRef.current = new Map();
      orbitalPortfolioCoreViewsRef.current = [];
      orbitalPortfolioConnectorLinesRef.current = [];
      orbitalPortfolioMatterGroupRef.current = null;
      orbitalPortfolioMatterPacketsRef.current = [];
      orbitalPortfolioCorePickMeshesRef.current = [];
      orbitalPortfolioOuterRingsRef.current = [];
      starfieldMeshRef.current = null;
      skyfieldMeshRef.current = null;
      universeBackdropRef.current?.dispose(); // Universe backdrop
      universeBackdropRef.current = null;
      sunEnhancementsRef.current?.dispose();
      sunEnhancementsRef.current = null;
      orbitalPortfolioActiveRef.current = false;
      orbitalPortfolioPlayingRef.current = true;
      aboutMemorySquareRootRef.current = null;
      aboutMemorySquareLabelRef.current = null;
      if (aboutParticleSwarmRef.current) {
        aboutParticleSwarmRef.current.dispose();
        aboutParticleSwarmRef.current = null;
      }
      if (aboutHydrateSwarmRef.current) {
        aboutHydrateSwarmRef.current.dispose();
        aboutHydrateSwarmRef.current = null;
      }
      if (aboutJourneyRef.current) {
        aboutJourneyRef.current.dispose();
        aboutJourneyRef.current = null;
      }
      if (aboutMjolnirRef.current) {
        aboutMjolnirRef.current.dispose();
        aboutMjolnirRef.current = null;
      }
      aboutJourneyPendingEntryRef.current = false;
      aboutMemorySquareWorldAnchorRef.current = null;
      aboutMemorySquarePendingEntryRef.current = false;
      aboutMemorySquareActiveRef.current = false;
      aboutMemorySquareNavIntentUntilRef.current = 0;
      setAboutNavHereActive(false);
      setAboutSkipCinematicPromptVisible(false);
      setOrbitalPortfolioReady(false);
      setOrbitalPortfolioActive(false);
      setPortfolioNavHereActive(false);
      setSkillsNavHereActive(false);
      setExternalCosmosLabelsHiddenForAbout(false);
      cancelAboutMemorySquareEntrySequence();
      if (aboutCellRafRef.current !== null) {
        cancelAnimationFrame(aboutCellRafRef.current);
        aboutCellRafRef.current = null;
      }
      if (aboutCellMeshRef.current) {
        aboutCellMeshRef.current.geometry.dispose();
        const mat = aboutCellMeshRef.current.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
        aboutCellMeshRef.current = null;
      }
      aboutCellShaderMaterialRef.current = null;
      aboutCellRevealAttrRef.current = null;
      aboutSlideTexturesRef.current.forEach((tex) => tex?.dispose());
      aboutSlideTexturesRef.current = [null, null, null, null];
      aboutCellSlotsRef.current = [];
      aboutCellRecordsRef.current = [];
      aboutFrontSlotIndicesRef.current = [];
      aboutCellBaseColorsRef.current = [];
      aboutCellTargetColorsRef.current = [];
      aboutCellRevealAtMsRef.current = [];
      aboutCellAnimationRef.current.active = false;
      aboutCellAnimationRef.current.initialized = false;
      aboutSwarmManualTriggerRef.current = false;
      aboutSwarmManualReformRef.current = false;
      aboutSlideAdvanceAfterReformRef.current = false;
      aboutSlidePreparedIndexRef.current = -1;
      aboutSlideReadyRef.current = false;
      aboutSlidePreparePendingRef.current = false;
      aboutTileContentFadeStartMsRef.current = 0;
      aboutTileCoreMatsRef.current = [];
      aboutTileGridLineMatsRef.current = [];
      aboutTileEdgeLineMatsRef.current = [];
      aboutTileContentMatsRef.current.forEach((mat) => {
        if (!mat) return;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
      aboutTileContentMatsRef.current = [];
      skillsLatticeWorldAnchorRef.current = null;
      skillsLatticeRootRef.current = null;
      skillsLatticeNodesRef.current = [];
      skillsLatticeLineMatsRef.current = [];
      skillsLatticeLineGroupsRef.current = [];
      skillsLatticeLinkSegmentsRef.current = [];
      skillsLatticeArcRecordsRef.current = [];
      skillsLatticeFlowPointsRef.current = null;
      skillsLatticeFlowMetaRef.current = [];
      skillsLatticeEnvelopeRef.current = null;
      skillsLatticeEnvelopeMatRef.current = null;
      skillsLatticeEnvelopeEdgeMatRef.current = null;
      skillsLatticeEnvelopeRadiusRef.current = 0;
      skillsLatticeEnvelopeInsideRef.current = null;
      skillsLatticeBeaconRef.current = null;
      skillsLatticeBeaconMatRef.current = null;
      skillsLatticeBeaconEdgeMatRef.current = null;
      skillsLatticeBeaconLabelRef.current = null;
      skillsLatticeNodeLabelsRef.current = [];
      skillsLatticeSystemActiveRef.current = false;
      skillsLatticeCausticLightsRef.current = [];
      externalCosmosLabelsHiddenForLatticeRef.current = false;
      externalCosmosLabelsHiddenForAboutRef.current = false;
      externalCosmosLabelsHiddenForPortfolioRef.current = false;
      skillsLatticeRippleRef.current.active = false;
      skillsLatticeSelectedNodeRef.current = null;
      setSkillsLatticeSelection(null);
      setSkillsLatticeActive(false);
      skillsLegacyBodiesRef.current = [];

      // Remove touch event listeners
      renderer.domElement.removeEventListener(
        "touchstart",
        preventDefaultTouch,
      );
      renderer.domElement.removeEventListener("touchmove", preventDefaultTouch);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost as EventListener,
      );
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        handleContextRestored as EventListener,
      );

      if (container && container.parentElement) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }

      // Clean up Three.js resources
      renderer.dispose();
      rendererRef.current = null;
      composerRef.current = null;
      labelRenderer.domElement.remove();

      // Traverse and dispose scene objects to free memory
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          } else if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose());
          }
        }
      });

      if (debugHitMarkerRef.current) {
        debugHitMarkerRef.current.geometry.dispose();
        if (Array.isArray(debugHitMarkerRef.current.material)) {
          debugHitMarkerRef.current.material.forEach((mat) => mat.dispose());
        } else {
          debugHitMarkerRef.current.material.dispose();
        }
        debugHitMarkerRef.current = null;
      }
    };
    setGlobalCleanup(cleanup);

    return cleanup;
  }, []);

  const orbitingMoonNavTarget =
    orbitPhase === "orbiting"
      ? (() => {
          const moon = focusedMoonRef.current;
          if (!moon) return null;
          const moonId = String(
            (moon.userData as { moonId?: unknown }).moonId ?? "",
          )
            .toLowerCase()
            .replace(/^moon-/, "");
          if (moonId) return moonId;
          const fallback = String(
            (moon.userData as { planetName?: unknown }).planetName ?? "",
          )
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-");
          return fallback || null;
        })()
      : null;
  const navCurrentTargetResolved = aboutNavHereActive
    ? ABOUT_MEMORY_SQUARE_NAV_ID
    : portfolioNavHereActive
      ? "portfolio"
      : skillsNavHereActive
        ? "skills"
        : (orbitingMoonNavTarget ?? currentNavigationTarget);
  const activeMoonMemoryPool =
    orbitingMoonNavTarget && viewerMemoriesEnabled
      ? (moonTravelSignCatalog.get(orbitingMoonNavTarget)?.pool ?? [])
      : [];
  const activeMoonMemoryCount = activeMoonMemoryPool.length;
  const memoryScrubMaxValue = Math.max(0, activeMoonMemoryCount - 0.001);
  const clampedMoonMemoryScrubValue = THREE.MathUtils.clamp(
    moonMemoryScrubValue,
    0,
    memoryScrubMaxValue,
  );
  const queueMoonMemoryScrub = (value: number) => {
    if (!viewerMemoriesEnabled || activeMoonMemoryCount <= 0) return;
    const clamped = THREE.MathUtils.clamp(value, 0, memoryScrubMaxValue);
    moonMemoryManualModeRef.current = true;
    moonMemoryPlaybackPlayingRef.current = false;
    moonMemoryScrubValueRef.current = clamped;
    moonMemoryScrubRequestRef.current = { value: clamped };
    setMoonMemoryManualMode(true);
    setMoonMemoryPlaybackPlaying(false);
    setMoonMemoryScrubValue(clamped);
  };
  const toggleMoonMemoryPlayback = () => {
    if (!viewerMemoriesEnabled || activeMoonMemoryCount <= 0) return;
    const currentlyPlaying = moonMemoryManualModeRef.current
      ? moonMemoryPlaybackPlayingRef.current
      : viewerMemoriesEnabledRef.current;
    moonMemoryManualModeRef.current = true;
    setMoonMemoryManualMode(true);
    const nextPlaying = !currentlyPlaying;
    moonMemoryPlaybackPlayingRef.current = nextPlaying;
    setMoonMemoryPlaybackPlaying(nextPlaying);
    if (nextPlaying) {
      moonTravelSignLastSpawnAtRef.current = performance.now();
    }
  };
  const memoryPlaybackEngaged =
    viewerMemoriesEnabled &&
    (!moonMemoryManualMode || moonMemoryPlaybackPlaying);
  const renderUnifiedRegistryPanel = () => {
    if (!orbitalPortfolioActive) return null;
    const groups = orbitalPortfolioGroupsRef.current;
    const coreViewsBase = orbitalPortfolioCoreViewsRef.current;
    const activeGroup =
      !orbitalPortfolioHasActiveFocus || groups.length === 0
        ? null
        : groups[
            THREE.MathUtils.clamp(
              orbitalPortfolioFocusIndex,
              0,
              Math.max(0, groups.length - 1),
            )
          ];
    const variants = activeGroup?.variants ?? [];
    const activeVariant =
      variants[
        THREE.MathUtils.clamp(
          orbitalPortfolioVariantIndex,
          0,
          Math.max(0, variants.length - 1),
        )
      ];
    const mediaItems = activeVariant?.mediaItems ?? [];
    const activeMedia =
      mediaItems[
        THREE.MathUtils.clamp(
          orbitalPortfolioMediaIndex,
          0,
          Math.max(0, mediaItems.length - 1),
        )
      ];
    const query = orbitalPortfolioSearchQuery.trim().toLowerCase();
    const filteredGroups = groups.filter((group) => {
      if (
        orbitalPortfolioYearFilter !== "all" &&
        String(group.year ?? "unknown") !== orbitalPortfolioYearFilter
      ) {
        return false;
      }
      if (
        orbitalPortfolioTechFilter !== "all" &&
        !group.technologies.some(
          (tech) =>
            tech.toLowerCase() === orbitalPortfolioTechFilter.toLowerCase(),
        )
      ) {
        return false;
      }
      if (!query) return true;
      const haystack =
        `${group.title} ${group.description ?? ""} ${group.technologies.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
    const visibleCoreViews = coreViewsBase.filter((core) =>
      filteredGroups.some((group) => group.coreId === core.id),
    );
    const selectedCoreId =
      (orbitalRegistrySelectedCoreId &&
      visibleCoreViews.some((core) => core.id === orbitalRegistrySelectedCoreId)
        ? orbitalRegistrySelectedCoreId
        : visibleCoreViews[0]?.id) ?? "";
    const groupsForSelectedCore = filteredGroups.filter(
      (group) => group.coreId === selectedCoreId,
    );
    const orbitalRegistryPanelWidth = 430;
    const arrowsVisible =
      orbitalPortfolioInspectedStationIndexRef.current !== null;
    const titleMain = "Orbital Registry";
    const onPrev = () => stepOrbitalPortfolioSequence(-1);
    const onNext = () => stepOrbitalPortfolioSequence(1);

    return (
      <>
        <div
          style={{
            position: "fixed",
            right: 18,
            top: 78,
            zIndex: 1110,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: orbitalRegistryPanelWidth,
            transform: orbitalRegistryPanelVisible
              ? "translateX(0)"
              : `translateX(${orbitalRegistryPanelWidth + 24}px)`,
            opacity: orbitalRegistryPanelVisible ? 1 : 0,
            pointerEvents: orbitalRegistryPanelVisible ? "auto" : "none",
            transition: "transform 240ms ease, opacity 180ms ease",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(120, 220, 255, 0.5)",
              background:
                "linear-gradient(180deg, rgba(6, 16, 30, 0.9) 0%, rgba(4, 10, 22, 0.9) 100%)",
              color: "#dff5ff",
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: 1.2, color: "#92deff" }}>
              PORTFOLIO
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.05 }}>
              {titleMain}
            </div>
            <div
              style={{
                marginTop: 6,
                height: 1,
                background: "rgba(140, 220, 255, 0.28)",
              }}
            />
            <div
              style={{
                marginTop: 7,
                display: "flex",
                gap: 4,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={goToOrbitalPortfolioSettledView}
                style={{
                  padding: "4px 6px",
                  borderRadius: 8,
                  border: "1px solid rgba(170, 225, 255, 0.45)",
                  background: "rgba(8, 18, 34, 0.82)",
                  color: "#dff3ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Home
              </button>
              <button
                onClick={onPrev}
                style={{
                  padding: "4px 6px",
                  borderRadius: 8,
                  border: "1px solid rgba(170, 225, 255, 0.45)",
                  background: "rgba(8, 18, 34, 0.82)",
                  color: "#dff3ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Prev
              </button>
              <button
                onClick={onNext}
                style={{
                  padding: "4px 6px",
                  borderRadius: 8,
                  border: "1px solid rgba(170, 225, 255, 0.45)",
                  background: "rgba(8, 18, 34, 0.82)",
                  color: "#dff3ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Next
              </button>
              <button
                onClick={() => {
                  const next = !orbitalPortfolioOrbitsEnabledRef.current;
                  orbitalPortfolioOrbitsEnabledRef.current = next;
                  setOrbitalPortfolioOrbitsEnabled(next);
                }}
                style={{
                  padding: "4px 6px",
                  borderRadius: 8,
                  border: "1px solid rgba(170, 225, 255, 0.45)",
                  background: "rgba(8, 18, 34, 0.82)",
                  color: "#dff3ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {orbitalPortfolioOrbitsEnabled
                  ? "Stop Orbits"
                  : "Start Orbits"}
              </button>
              <button
                onClick={() => {
                  const next = !orbitalPortfolioAutoplayEnabledRef.current;
                  orbitalPortfolioAutoplayEnabledRef.current = next;
                  setOrbitalPortfolioAutoplayEnabled(next);
                  const now = performance.now();
                  orbitalPortfolioAutoRef.current.lastAdvanceAt = now;
                  if (next) {
                    focusOrbitalPortfolioStation(
                      orbitalPortfolioFocusIndexRef.current,
                      orbitalPortfolioMediaIndex,
                      {
                        autoplay: true,
                        variantIndex: orbitalPortfolioVariantIndexRef.current,
                      },
                    );
                  }
                }}
                style={{
                  padding: "4px 6px",
                  borderRadius: 8,
                  border: orbitalPortfolioAutoplayEnabled
                    ? "1px solid rgba(145, 232, 255, 0.88)"
                    : "1px solid rgba(170, 225, 255, 0.45)",
                  background: "rgba(8, 18, 34, 0.76)",
                  color: "#dff3ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {orbitalPortfolioAutoplayEnabled
                  ? "Auto-play On"
                  : "Auto-play Off"}
              </button>
              <button
                onClick={exitOrbitalPortfolio}
                style={{
                  padding: "4px 6px",
                  borderRadius: 8,
                  border: "1px solid rgba(255, 195, 160, 0.45)",
                  background: "rgba(28, 14, 10, 0.82)",
                  color: "#ffe2d5",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 11,
                  cursor: "pointer",
                  marginLeft: "auto",
                }}
              >
                Exit
              </button>
            </div>
            <div
              style={{
                marginTop: 7,
                fontSize: 12,
                color: "#d8f0ff",
                lineHeight: 1.35,
              }}
            >
              <div style={{ fontSize: 13, color: "#eaf8ff" }}>
                {activeGroup?.title ?? "No active selection"}
              </div>
              <div style={{ marginTop: 1, color: "rgba(170, 228, 255, 0.96)" }}>
                Core:{" "}
                {(activeGroup?.coreTitle ?? orbitalPortfolioFocusedCoreId) ||
                  "N/A"}
              </div>
              <div style={{ marginTop: 1, color: "rgba(210, 235, 255, 0.84)" }}>
                {(() => {
                  const category =
                    activeVariant?.technologies?.[0] ||
                    activeGroup?.technologies?.[0] ||
                    "Portfolio Sample";
                  return `Category: ${category}`;
                })()}
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <input
                value={orbitalPortfolioSearchQuery}
                onChange={(event) =>
                  setOrbitalPortfolioSearchQuery(event.currentTarget.value)
                }
                placeholder="Search title, description, technology..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "7px 9px",
                  borderRadius: 8,
                  border: "1px solid rgba(150, 220, 255, 0.42)",
                  background: "rgba(8, 18, 34, 0.78)",
                  color: "#e3f6ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 12,
                }}
              />
              <select
                value={orbitalPortfolioYearFilter}
                onChange={(event) =>
                  setOrbitalPortfolioYearFilter(event.currentTarget.value)
                }
                style={{
                  width: 94,
                  padding: "7px 6px",
                  borderRadius: 8,
                  border: "1px solid rgba(150, 220, 255, 0.42)",
                  background: "rgba(8, 18, 34, 0.78)",
                  color: "#e3f6ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 12,
                }}
              >
                <option value="all">All Years</option>
                {Array.from(
                  new Set(
                    groups.map((group) => String(group.year ?? "unknown")),
                  ),
                )
                  .sort((a, b) =>
                    a === "unknown"
                      ? 1
                      : b === "unknown"
                        ? -1
                        : b.localeCompare(a),
                  )
                  .map((year) => (
                    <option key={year} value={year}>
                      {year === "unknown" ? "Unknown" : year}
                    </option>
                  ))}
              </select>
              <select
                value={orbitalPortfolioTechFilter}
                onChange={(event) =>
                  setOrbitalPortfolioTechFilter(event.currentTarget.value)
                }
                style={{
                  width: 112,
                  padding: "7px 6px",
                  borderRadius: 8,
                  border: "1px solid rgba(150, 220, 255, 0.42)",
                  background: "rgba(8, 18, 34, 0.78)",
                  color: "#e3f6ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 12,
                }}
              >
                <option value="all">All Tech</option>
                {Array.from(
                  new Set(groups.flatMap((group) => group.technologies)),
                )
                  .sort((a, b) => a.localeCompare(b))
                  .map((tech) => (
                    <option key={tech} value={tech}>
                      {tech}
                    </option>
                  ))}
              </select>
            </div>

            <div
              style={{
                marginTop: 8,
                height: 206,
                borderRadius: 10,
                border: "1px solid rgba(155, 225, 255, 0.28)",
                background: "rgba(6, 10, 20, 0.84)",
                padding: "6px",
                display: "grid",
                gridTemplateColumns: "0.42fr 0.58fr",
                gap: 6,
              }}
            >
              {filteredGroups.length === 0 ? (
                <div
                  style={{
                    color: "rgba(182, 214, 236, 0.8)",
                    fontSize: 12,
                    padding: "8px 8px 10px",
                    gridColumn: "1 / span 2",
                  }}
                >
                  No matches for current filters.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      borderRadius: 8,
                      border: "1px solid rgba(145, 232, 255, 0.24)",
                      background: "rgba(8, 18, 34, 0.58)",
                      overflowY: "auto",
                      padding: 4,
                    }}
                  >
                    {visibleCoreViews.map((core) => {
                      const isSelected = core.id === selectedCoreId;
                      return (
                        <button
                          key={core.id}
                          onClick={() => {
                            setOrbitalRegistrySelectedCoreId(core.id);
                            focusOrbitalPortfolioCore(core.id);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            borderRadius: 7,
                            border: isSelected
                              ? "1px solid rgba(145, 232, 255, 0.92)"
                              : "1px solid rgba(145, 232, 255, 0.24)",
                            background: isSelected
                              ? "rgba(20, 58, 92, 0.84)"
                              : "rgba(8, 18, 34, 0.68)",
                            color: "#e8f7ff",
                            cursor: "pointer",
                            padding: "6px 7px",
                            marginBottom: 5,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {core.title}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      borderRadius: 8,
                      border: "1px solid rgba(145, 232, 255, 0.24)",
                      background: "rgba(8, 18, 34, 0.58)",
                      overflowY: "auto",
                      padding: 4,
                    }}
                  >
                    {groupsForSelectedCore.length === 0 ? (
                      <div
                        style={{
                          color: "rgba(182, 214, 236, 0.8)",
                          fontSize: 11,
                          padding: "6px 7px",
                        }}
                      >
                        No entries in this core.
                      </div>
                    ) : (
                      groupsForSelectedCore.map((group) => {
                        const isHere = group.id === activeGroup?.id;
                        return (
                          <button
                            key={group.id}
                            onClick={() => {
                              const groupIndex = groups.findIndex(
                                (item) => item.id === group.id,
                              );
                              if (groupIndex >= 0)
                                focusOrbitalPortfolioStation(groupIndex, 0);
                            }}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              borderRadius: 7,
                              border: isHere
                                ? "1px solid rgba(145, 232, 255, 0.92)"
                                : "1px solid rgba(145, 232, 255, 0.24)",
                              background: isHere
                                ? "rgba(20, 58, 92, 0.84)"
                                : "rgba(8, 18, 34, 0.68)",
                              color: "#e8f7ff",
                              cursor: "pointer",
                              padding: "6px 7px",
                              marginBottom: 5,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 6,
                              fontSize: 11,
                            }}
                          >
                            <span
                              style={{
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {group.title}
                            </span>
                            {group.clientVariantCount > 0 ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: isHere
                                    ? "#c0f2ff"
                                    : "rgba(180,220,245,0.72)",
                                  flexShrink: 0,
                                }}
                              >
                                {group.clientVariantCount}
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            <div
              style={{
                marginTop: 8,
                height: 118,
                borderRadius: 10,
                overflowY: "auto",
                border: "1px solid rgba(155, 225, 255, 0.28)",
                background: "rgba(6, 10, 20, 0.84)",
                padding: "8px 9px",
                fontSize: 12,
                lineHeight: 1.45,
                color: "#d7ebfa",
              }}
            >
              {activeMedia?.description ||
                activeVariant?.description ||
                activeGroup?.description ||
                "No description available for this portfolio item yet."}
            </div>
          </div>
        </div>

        {!orbitalRegistryPanelVisible && (
          <div
            style={{
              position: "fixed",
              right: -5,
              top: 184,
              zIndex: 1101,
              pointerEvents: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0,
              padding: "8px 5px 9px",
              borderRadius: 0,
              border: "none",
              background: "#000000",
              color: "#dff5ff",
              fontFamily: "'Rajdhani', sans-serif",
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "#9fdfff",
                opacity: 0.9,
                lineHeight: "100%",
              }}
            >
              Portfolio
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, lineHeight: "auto" }}>
              {titleMain}
            </span>
          </div>
        )}

        <button
          onClick={() => setOrbitalRegistryPanelVisible((prev) => !prev)}
          style={{
            position: "fixed",
            right: orbitalRegistryPanelVisible ? 447 : -1,
            top: 120,
            zIndex: 1102,
            width: 28,
            height: 56,
            borderRadius: "10px 0 0 10px",
            border: "1px solid rgba(120, 220, 255, 0.5)",
            background:
              "linear-gradient(180deg, rgba(6, 16, 30, 0.9) 0%, rgba(4, 10, 22, 0.9) 100%)",
            color: "#dff5ff",
            fontSize: 16,
            cursor: "pointer",
            transition: "right 240ms ease",
          }}
          title={
            orbitalRegistryPanelVisible
              ? `Hide ${titleMain}`
              : `Show ${titleMain}`
          }
        >
          {orbitalRegistryPanelVisible ? ">" : "<"}
        </button>

        {arrowsVisible && (
          <div
            style={{
              position: "fixed",
              left: "calc(100% - 285px)",
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 1102,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              pointerEvents: "auto",
            }}
          >
            <button
              onClick={onNext}
              style={{
                width: 28,
                height: 30,
                borderRadius: 8,
                border: "1px solid rgba(180, 220, 255, 0.5)",
                background: "rgba(0, 0, 0, 0.9)",
                color: "#ffffff",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
              }}
              title="Next portfolio slide"
            >
              ›
            </button>
            <button
              onClick={onPrev}
              style={{
                width: 28,
                height: 30,
                borderRadius: 8,
                border: "1px solid rgba(180, 220, 255, 0.5)",
                background: "rgba(0, 0, 0, 0.9)",
                color: "#ffffff",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
              }}
              title="Previous portfolio slide"
            >
              ‹
            </button>
          </div>
        )}

        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 18,
            transform: "translateX(-50%)",
            zIndex: 1102,
            pointerEvents: "none",
            padding: "7px 12px",
            borderRadius: 999,
            border: "1px solid rgba(145, 225, 255, 0.45)",
            background: "rgba(6, 14, 26, 0.78)",
            color: "rgba(226, 244, 255, 0.96)",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 12,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            boxShadow: "0 6px 18px rgba(2, 10, 18, 0.45)",
          }}
        >
          Wheel: Zoom | Shift + Wheel: Scroll Screenshot
        </div>
      </>
    );
  };

  return (
    <>
      {/* Show loader while scene is setting up */}
      {isLoading && (
        <CosmosLoader
          wordmark={profile.name.toUpperCase()}
          isSceneReady={criticalAssetsReady && droneGpuWarmupReady}
          loadingProgressHint={loaderProgressHint}
          loadingStageHint={loaderStageHint}
          onLoadingComplete={() => {
            setLoaderVisualComplete(true);
          }}
        />
      )}

      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          opacity: !isLoading && sceneReady ? 1 : 0,
          visibility: !isLoading && sceneReady ? "visible" : "hidden",
          transition: "opacity 1.5s ease-in-out, visibility 0s linear 0s",
        }}
      >
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
          {cosmosIntroOverlayOpacity > 0.001 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10035,
                pointerEvents: "none",
                background: `rgba(2, 4, 10, ${cosmosIntroOverlayOpacity.toFixed(3)})`,
              }}
            />
          )}
          <div
            ref={mountRef}
            className="width-full height-full"
            style={{
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          />
          {!isLoading && startupConsoleVisible && (
            <button
              ref={startupConsoleButtonRef}
              type="button"
              aria-label={
                consoleVisible ? "Hide ship terminal" : "Show ship terminal"
              }
              title={
                consoleVisible ? "Hide ship terminal" : "Show ship terminal"
              }
              onClick={() => {
                trackEvent("console_toggle", {
                  action: consoleVisible ? "hide" : "show",
                });
                setConsoleVisible((prev) => !prev);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                zIndex: 10002,
                borderRadius: 8,
                border: "1px solid rgba(122, 201, 255, 0.55)",
                background: "rgba(8, 20, 36, 0.84)",
                color: "rgba(192, 236, 255, 0.95)",
                padding: "6px 10px",
                boxShadow: "0 0 12px rgba(75, 163, 255, 0.2)",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 0.8,
                fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
                fontWeight: 700,
                lineHeight: 1.1,
                userSelect: "none",
                opacity: 0,
                transform: "translateX(200px)",
              }}
            >
              {consoleVisible ? "Hide Console" : "Show Console"}
            </button>
          )}
          {!isLoading &&
            orbitPhase === "orbiting" &&
            showOrbitSignTuningControls && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: 52,
                  right: 14,
                  zIndex: 10002,
                  width: 238,
                  borderRadius: 10,
                  border: "1px solid rgba(122, 201, 255, 0.45)",
                  background: "rgba(8, 18, 34, 0.86)",
                  color: "rgba(198, 236, 255, 0.95)",
                  boxShadow: "0 0 14px rgba(75, 163, 255, 0.18)",
                  padding: "8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
                }}
              >
                <div
                  style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8 }}
                >
                  ORBIT SIGN TUNING
                </div>
                {[
                  {
                    key: "timeBetweenMessagesSec",
                    label: "Time between messages",
                    min: 0,
                    max: 5,
                    step: 0.05,
                    value: orbitSignTuning.timeBetweenMessagesSec,
                    display: `${orbitSignTuning.timeBetweenMessagesSec.toFixed(2)}s`,
                  },
                  {
                    key: "waitAfterStreamSec",
                    label: "Wait after stream",
                    min: 0,
                    max: 20,
                    step: 0.25,
                    value: orbitSignTuning.waitAfterStreamSec,
                    display: `${orbitSignTuning.waitAfterStreamSec.toFixed(2)}s`,
                  },
                  {
                    key: "travelSpeed",
                    label: "Travel speed",
                    min: 0,
                    max: 6,
                    step: 0.05,
                    value: orbitSignTuning.travelSpeed,
                    display: `${orbitSignTuning.travelSpeed.toFixed(2)}x`,
                  },
                  {
                    key: "lightIntensity",
                    label: "Light intensity",
                    min: 0,
                    max: 3,
                    step: 0.02,
                    value: orbitSignTuning.lightIntensity,
                    display: orbitSignTuning.lightIntensity.toFixed(2),
                  },
                  {
                    key: "startFontScale",
                    label: "Start font size",
                    min: 0,
                    max: 4,
                    step: 0.01,
                    value: orbitSignTuning.startFontScale,
                    display: `${orbitSignTuning.startFontScale.toFixed(2)}x`,
                  },
                  {
                    key: "endFontScale",
                    label: "End font size",
                    min: 0,
                    max: 6,
                    step: 0.02,
                    value: orbitSignTuning.endFontScale,
                    display: `${orbitSignTuning.endFontScale.toFixed(2)}x`,
                  },
                ].map((row) => (
                  <label
                    key={row.key}
                    style={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 9,
                        letterSpacing: 0.4,
                      }}
                    >
                      <span>{row.label}</span>
                      <span>{row.display}</span>
                    </div>
                    <input
                      type="range"
                      min={row.min}
                      max={row.max}
                      step={row.step}
                      value={row.value}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setOrbitSignTuning((prev) => ({
                          ...prev,
                          [row.key]: next,
                        }));
                      }}
                      style={{ width: "100%" }}
                    />
                  </label>
                ))}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 10,
                    letterSpacing: 0.45,
                  }}
                >
                  <span>Continuous loop</span>
                  <input
                    type="checkbox"
                    checked={orbitSignTuning.continuousLoop}
                    onChange={(e) =>
                      setOrbitSignTuning((prev) => ({
                        ...prev,
                        continuousLoop: e.target.checked,
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={exportOrbitSignTuning}
                  style={{
                    marginTop: 2,
                    borderRadius: 7,
                    border: "1px solid rgba(132, 208, 255, 0.6)",
                    background: "rgba(10, 30, 54, 0.84)",
                    color: "rgba(212, 241, 255, 0.96)",
                    fontSize: 10,
                    letterSpacing: 0.7,
                    fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
                    fontWeight: 700,
                    padding: "6px 8px",
                    cursor: "pointer",
                  }}
                >
                  EXPORT + LOG SETTINGS
                </button>
              </div>
            )}
          {!isLoading &&
            orbitPhase === "orbiting" &&
            moonMemoryControlsVisible && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: 18,
                  transform: "translateX(-50%)",
                  zIndex: 10002,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minWidth: viewerMemoriesEnabled ? 420 : 0,
                  borderRadius: 10,
                  border: "1px solid rgba(136, 210, 255, 0.52)",
                  background: "rgba(8, 20, 34, 0.9)",
                  color: "rgba(214, 242, 255, 0.98)",
                  boxShadow: "0 0 16px rgba(76, 162, 255, 0.24)",
                  padding: viewerMemoriesEnabled ? "7px 10px" : "6px 10px",
                  fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
                  userSelect: "none",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={viewerMemoriesEnabled}
                    onChange={(e) => setViewerMemoriesEnabled(e.target.checked)}
                    style={{
                      width: 14,
                      height: 14,
                      cursor: "pointer",
                      accentColor: "#7fd8ff",
                    }}
                  />
                  Show my memories
                </label>
                {viewerMemoriesEnabled && (
                  <>
                    <button
                      type="button"
                      title={memoryPlaybackEngaged ? "Pause" : "Play"}
                      aria-label={memoryPlaybackEngaged ? "Pause" : "Play"}
                      onClick={toggleMoonMemoryPlayback}
                      disabled={activeMoonMemoryCount <= 0}
                      style={{
                        width: 26,
                        height: 20,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 5,
                        border: "1px solid rgba(143, 212, 255, 0.45)",
                        background: memoryPlaybackEngaged
                          ? "rgba(20, 44, 70, 0.9)"
                          : "rgba(10, 22, 37, 0.86)",
                        color: "rgba(226, 245, 255, 0.95)",
                        cursor:
                          activeMoonMemoryCount > 0 ? "pointer" : "not-allowed",
                        opacity: activeMoonMemoryCount > 0 ? 1 : 0.45,
                        fontSize: 12,
                        fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
                        fontWeight: 700,
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      {memoryPlaybackEngaged ? "||" : ">"}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={memoryScrubMaxValue}
                      step={0.01}
                      value={clampedMoonMemoryScrubValue}
                      disabled={activeMoonMemoryCount <= 0}
                      onChange={(e) => {
                        queueMoonMemoryScrub(Number(e.target.value));
                      }}
                      style={{
                        width: 220,
                        minWidth: 160,
                        accentColor: "#7fd8ff",
                        opacity: activeMoonMemoryCount > 0 ? 1 : 0.35,
                        cursor:
                          activeMoonMemoryCount > 0
                            ? "ew-resize"
                            : "not-allowed",
                      }}
                    />
                  </>
                )}
              </div>
            )}

          {/* Ship Explore Mode Overlay */}
          {shipExploreMode && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 99999,
                pointerEvents: "none",
                fontFamily: "'JetBrains Mono', 'Rajdhani', monospace",
              }}
            >
              {/* Top banner */}
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(255, 60, 60, 0.85)",
                  color: "#fff",
                  padding: "8px 24px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  pointerEvents: "auto",
                  zIndex: 100000,
                }}
              >
                SHIP EXPLORE MODE &nbsp;|&nbsp; Ctrl+Shift+` to exit
              </div>

              {/* Crosshair */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 20,
                  height: 20,
                  border: "2px solid rgba(0, 255, 150, 0.7)",
                  borderRadius: "50%",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 4,
                    height: 4,
                    background: "rgba(0, 255, 150, 0.9)",
                    borderRadius: "50%",
                  }}
                />
              </div>

              {/* Coordinates panel (bottom-left) */}
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  bottom: 16,
                  left: 16,
                  background: "rgba(0, 0, 0, 0.85)",
                  border: "1px solid rgba(0, 255, 150, 0.5)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  color: "#0f6",
                  fontSize: 13,
                  lineHeight: 1.8,
                  minWidth: 320,
                  pointerEvents: "auto",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    marginBottom: 6,
                    color: "#fff",
                  }}
                >
                  CAMERA POSITION (ship-local)
                </div>
                <div>
                  X:{" "}
                  <span style={{ color: "#ff6b6b" }}>
                    {exploreCoords.local[0].toFixed(2)}
                  </span>
                  &nbsp;&nbsp; Y:{" "}
                  <span style={{ color: "#51cf66" }}>
                    {exploreCoords.local[1].toFixed(2)}
                  </span>
                  &nbsp;&nbsp; Z:{" "}
                  <span style={{ color: "#339af0" }}>
                    {exploreCoords.local[2].toFixed(2)}
                  </span>
                </div>
                <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
                  World: [{exploreCoords.world[0]}, {exploreCoords.world[1]},{" "}
                  {exploreCoords.world[2]}]
                </div>
              </div>

              {/* Right panel — View + Mark + Log controls */}
              <div
                style={{
                  position: "absolute",
                  top: 55,
                  right: 16,
                  bottom: 16,
                  width: 260,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  pointerEvents: "auto",
                  overflowY: "auto",
                }}
              >
                {/* ── CONTROLS REFERENCE ── */}
                <div
                  style={{
                    background: "rgba(0,0,0,0.85)",
                    border: "1px solid rgba(255,200,50,0.5)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: "#ffd43b",
                    fontSize: 11,
                    lineHeight: 1.7,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 12,
                      marginBottom: 4,
                      color: "#fff",
                    }}
                  >
                    CONTROLS
                  </div>
                  <div>
                    <span style={{ color: "#aaa" }}>WASD</span> Move &nbsp;{" "}
                    <span style={{ color: "#aaa" }}>Q/E</span> Down/Up &nbsp;{" "}
                    <span style={{ color: "#aaa" }}>Shift</span> Fast
                  </div>
                  <div>
                    <span style={{ color: "#aaa" }}>Mouse drag</span> Look
                    around
                  </div>
                </div>

                {/* ── VIEW ALIGNMENT BUTTONS ── */}
                <div
                  style={{
                    background: "rgba(0,0,0,0.85)",
                    border: "1px solid rgba(100,200,255,0.5)",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 12,
                      marginBottom: 8,
                      color: "#fff",
                    }}
                  >
                    LOOK DIRECTION
                  </div>
                  {(() => {
                    const viewBtnStyle: React.CSSProperties = {
                      padding: "7px 8px",
                      background: "rgba(100,200,255,0.2)",
                      color: "#8ecfff",
                      border: "1px solid rgba(100,200,255,0.4)",
                      borderRadius: 5,
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                      fontSize: 11,
                      cursor: "pointer",
                      textTransform: "uppercase" as const,
                      flex: "1 1 auto",
                      textAlign: "center" as const,
                    };
                    const cam = sceneRef.current.camera;
                    // Helper: orient camera to look in a ship-local direction
                    const lookShipDir = (
                      localDir: [number, number, number],
                      e: React.MouseEvent,
                    ) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (
                        !cam ||
                        !spaceshipRef.current ||
                        !sceneRef.current.controls
                      )
                        return;
                      const ship = spaceshipRef.current;
                      const quat = new THREE.Quaternion();
                      ship.getWorldQuaternion(quat);
                      const dir = new THREE.Vector3(...localDir)
                        .applyQuaternion(quat)
                        .normalize();
                      const cc = sceneRef.current.controls!;
                      const t = cam.position.clone().addScaledVector(dir, 2);
                      cc.setTarget(t.x, t.y, t.z, false);
                    };
                    const stopEvt = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      e.preventDefault();
                    };
                    return (
                      <>
                        <div
                          style={{ display: "flex", gap: 4, marginBottom: 4 }}
                        >
                          <button
                            style={viewBtnStyle}
                            onMouseDown={stopEvt}
                            onClick={(e) => lookShipDir([0, 0, 1], e)}
                          >
                            Look Forward
                          </button>
                          <button
                            style={viewBtnStyle}
                            onMouseDown={stopEvt}
                            onClick={(e) => lookShipDir([0, 0, -1], e)}
                          >
                            Look Back
                          </button>
                        </div>
                        <div
                          style={{ display: "flex", gap: 4, marginBottom: 4 }}
                        >
                          <button
                            style={viewBtnStyle}
                            onMouseDown={stopEvt}
                            onClick={(e) => lookShipDir([-1, 0, 0], e)}
                          >
                            Look Right
                          </button>
                          <button
                            style={viewBtnStyle}
                            onMouseDown={stopEvt}
                            onClick={(e) => lookShipDir([1, 0, 0], e)}
                          >
                            Look Left
                          </button>
                        </div>
                        <div
                          style={{ display: "flex", gap: 4, marginBottom: 4 }}
                        >
                          <button
                            style={viewBtnStyle}
                            onMouseDown={stopEvt}
                            onClick={(e) => lookShipDir([0, 1, 0], e)}
                          >
                            Look Up
                          </button>
                          <button
                            style={viewBtnStyle}
                            onMouseDown={stopEvt}
                            onClick={(e) => lookShipDir([0, -1, 0], e)}
                          >
                            Look Down
                          </button>
                        </div>
                        <div
                          style={{ display: "flex", gap: 4, marginBottom: 4 }}
                        >
                          <button
                            style={{
                              ...viewBtnStyle,
                              background: "rgba(255, 180, 50, 0.3)",
                              color: "#ffcc66",
                              border: "1px solid rgba(255,180,50,0.5)",
                              flex: "1 1 100%",
                            }}
                            onMouseDown={stopEvt}
                            onClick={(e) => {
                              stopEvt(e);
                              if (!cam || !sceneRef.current.controls) return;
                              const lookDir = new THREE.Vector3();
                              cam.getWorldDirection(lookDir);
                              lookDir.negate();
                              const t = cam.position
                                .clone()
                                .addScaledVector(lookDir, 2);
                              sceneRef.current.controls!.setTarget(
                                t.x,
                                t.y,
                                t.z,
                                false,
                              );
                            }}
                          >
                            Turn Around
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            style={{
                              ...viewBtnStyle,
                              background: "rgba(0,255,150,0.2)",
                              color: "#0f6",
                              border: "1px solid rgba(0,255,150,0.4)",
                              flex: "1 1 100%",
                            }}
                            onMouseDown={stopEvt}
                            onClick={(e) => {
                              stopEvt(e);
                              if (!cam) return;
                              // Roll left: rotate camera's up vector around the look direction
                              const fwd = new THREE.Vector3();
                              cam.getWorldDirection(fwd);
                              const rollQuat =
                                new THREE.Quaternion().setFromAxisAngle(
                                  fwd,
                                  Math.PI / 36,
                                ); // 5° CCW
                              cam.up.applyQuaternion(rollQuat).normalize();
                            }}
                          >
                            Roll Left
                          </button>
                          <button
                            style={{
                              ...viewBtnStyle,
                              background: "rgba(0,255,150,0.2)",
                              color: "#0f6",
                              border: "1px solid rgba(0,255,150,0.4)",
                              flex: "1 1 100%",
                            }}
                            onMouseDown={stopEvt}
                            onClick={(e) => {
                              stopEvt(e);
                              if (!cam) return;
                              // Roll right: rotate camera's up vector around the look direction
                              const fwd = new THREE.Vector3();
                              cam.getWorldDirection(fwd);
                              const rollQuat =
                                new THREE.Quaternion().setFromAxisAngle(
                                  fwd,
                                  -Math.PI / 36,
                                ); // 5° CW
                              cam.up.applyQuaternion(rollQuat).normalize();
                            }}
                          >
                            Roll Right
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* ── MARK BUTTONS ── */}
                <div
                  style={{
                    background: "rgba(0,0,0,0.85)",
                    border: "1px solid rgba(180,130,255,0.5)",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 12,
                      marginBottom: 8,
                      color: "#fff",
                    }}
                  >
                    MARK POSITION
                  </div>
                  {(() => {
                    const markBtnBase: React.CSSProperties = {
                      padding: "7px 12px",
                      color: "#fff",
                      borderRadius: 6,
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                      fontSize: 12,
                      letterSpacing: 0.8,
                      cursor: "pointer",
                      textTransform: "uppercase" as const,
                      width: "100%",
                      textAlign: "center" as const,
                    };
                    return (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <button
                          style={{
                            ...markBtnBase,
                            background: "rgba(255,60,60,0.85)",
                            border: "2px solid rgba(255,100,100,0.7)",
                          }}
                          onClick={() => {
                            const coords = shipExploreCoordsRef.current.local;
                            setExploreSavedPositions((prev) => [
                              ...prev,
                              { label: "COCKPIT", local: [...coords] },
                            ]);
                            if (spaceshipRef.current) {
                              const cam = new THREE.Vector3(
                                coords[0],
                                coords[1],
                                coords[2],
                              );
                              const look = new THREE.Vector3(
                                coords[0],
                                coords[1],
                                coords[2] + 6,
                              );
                              spaceshipRef.current.userData.cockpitCameraLocal =
                                cam;
                              spaceshipRef.current.userData.cockpitLookLocal =
                                look;
                              vlog(
                                `COCKPIT MARKED at local [${coords[0]}, ${coords[1]}, ${coords[2]}]`,
                              );
                            }
                          }}
                        >
                          Mark Cockpit
                        </button>
                        <button
                          style={{
                            ...markBtnBase,
                            background: "rgba(50,150,255,0.85)",
                            border: "2px solid rgba(100,180,255,0.7)",
                          }}
                          onClick={() => {
                            const coords = shipExploreCoordsRef.current.local;
                            setExploreSavedPositions((prev) => [
                              ...prev,
                              { label: "CABIN", local: [...coords] },
                            ]);
                            vlog(
                              `CABIN MARKED at local [${coords[0]}, ${coords[1]}, ${coords[2]}]`,
                            );
                          }}
                        >
                          Mark Cabin
                        </button>
                        <button
                          style={{
                            ...markBtnBase,
                            background: "rgba(50,200,100,0.85)",
                            border: "2px solid rgba(100,220,150,0.7)",
                          }}
                          onClick={() => {
                            const coords = shipExploreCoordsRef.current.local;
                            setExploreSavedPositions((prev) => [
                              ...prev,
                              { label: "CUSTOM", local: [...coords] },
                            ]);
                            vlog(
                              `CUSTOM MARKED at local [${coords[0]}, ${coords[1]}, ${coords[2]}]`,
                            );
                          }}
                        >
                          Mark Custom
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* ── LOG TO CONSOLE ── */}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const positions = exploreSavedPositions;
                    const current = shipExploreCoordsRef.current;
                    dlog(
                      "\n%c═══ SHIP EXPLORE MODE — SAVED POSITIONS ═══",
                      "color: #ff6b6b; font-weight: bold; font-size: 14px;",
                    );
                    dlog(
                      "%cCurrent camera (ship-local):",
                      "color: #0f6; font-weight: bold;",
                      current.local,
                    );
                    dlog(
                      "%cCurrent camera (world):",
                      "color: #888;",
                      current.world,
                    );
                    dlog("");
                    positions.forEach((p) => {
                      const color =
                        p.label === "COCKPIT"
                          ? "#ff6b6b"
                          : p.label === "CABIN"
                            ? "#339af0"
                            : "#51cf66";
                      dlog(
                        `%c${p.label}:`,
                        `color: ${color}; font-weight: bold;`,
                        `new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2]})`,
                      );
                    });
                    dlog("");
                    dlog(
                      "%c── Copy-paste ready code ──",
                      "color: #ffd43b; font-weight: bold;",
                    );
                    const codeLines = [
                      "// ═══ Ship Explore Mode — Saved Positions ═══",
                      `// Generated at ${new Date().toISOString()}`,
                      `// Ship scale: ${spaceshipRef.current?.scale.x ?? "unknown"}`,
                      "",
                    ];
                    positions.forEach((p) => {
                      codeLines.push(`// ${p.label}`);
                      codeLines.push(
                        `const ${p.label.toLowerCase()}CamLocal = new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2]});`,
                      );
                      codeLines.push(
                        `const ${p.label.toLowerCase()}LookLocal = new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2] + 6});`,
                      );
                      codeLines.push("");
                    });
                    if (positions.length === 0) {
                      codeLines.push(
                        "// (no positions marked yet — current camera position below)",
                      );
                      codeLines.push(
                        `const currentLocal = new THREE.Vector3(${current.local[0]}, ${current.local[1]}, ${current.local[2]});`,
                      );
                    }
                    const codeStr = codeLines.join("\n");
                    dlog(codeStr);
                    dlog("%c═══ END ═══", "color: #ff6b6b; font-weight: bold;");
                    // Also try to copy to clipboard
                    navigator.clipboard.writeText(codeStr).then(
                      () =>
                        dlog(
                          "%cCopied to clipboard!",
                          "color: #0f6; font-weight: bold;",
                        ),
                      () =>
                        dlog(
                          "%cClipboard copy failed — please copy from above.",
                          "color: #ff0;",
                        ),
                    );
                  }}
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255, 200, 50, 0.9)",
                    color: "#000",
                    border: "2px solid rgba(255, 220, 100, 0.8)",
                    borderRadius: 8,
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: 1,
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  LOG ALL TO CONSOLE + COPY
                </button>
              </div>

              {/* Saved positions log (top-left) */}
              {exploreSavedPositions.length > 0 && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: 60,
                    left: 16,
                    background: "rgba(0, 0, 0, 0.85)",
                    border: "1px solid rgba(180, 130, 255, 0.5)",
                    borderRadius: 8,
                    padding: "12px 16px",
                    color: "#d0bfff",
                    fontSize: 12,
                    lineHeight: 1.8,
                    minWidth: 280,
                    maxHeight: 300,
                    overflowY: "auto",
                    pointerEvents: "auto",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      marginBottom: 6,
                      color: "#fff",
                    }}
                  >
                    SAVED POSITIONS
                  </div>
                  {exploreSavedPositions.map((pos, idx) => (
                    <div
                      key={idx}
                      style={{
                        borderBottom: "1px solid rgba(180,130,255,0.2)",
                        paddingBottom: 4,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          color:
                            pos.label === "COCKPIT"
                              ? "#ff6b6b"
                              : pos.label === "CABIN"
                                ? "#339af0"
                                : "#51cf66",
                        }}
                      >
                        {pos.label}
                      </span>
                      : [{pos.local[0]}, {pos.local[1]}, {pos.local[2]}]
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      // Copy all saved positions to clipboard as code
                      const code = exploreSavedPositions
                        .map(
                          (p) =>
                            `// ${p.label}: new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2]})`,
                        )
                        .join("\n");
                      navigator.clipboard.writeText(code).then(() => {
                        vlog("📋 Positions copied to clipboard!");
                      });
                    }}
                    style={{
                      marginTop: 8,
                      padding: "6px 14px",
                      background: "rgba(180, 130, 255, 0.3)",
                      color: "#d0bfff",
                      border: "1px solid rgba(180,130,255,0.5)",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 11,
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 600,
                    }}
                  >
                    Copy All to Clipboard
                  </button>
                </div>
              )}
            </div>
          )}

          <UserOnScreenMessages hideTelemetry={orbitalPortfolioActive} />
          <CosmicMiniMap3D
            visible={!isLoading && sceneReady && startupMiniMapVisible}
            containerRef={startupMiniMapContainerRef}
            initiallyMinified
            containerStyle={{
              opacity: 0,
              transform: "translateX(200px)",
            }}
            projectModeSignal={orbitalPortfolioActive}
            spaceshipRef={spaceshipRef}
            starDestroyerRef={starDestroyerRef}
            itemsRef={itemsRef}
            skillsAnchorRef={skillsLatticeWorldAnchorRef}
            aboutAnchorRef={aboutMemorySquareWorldAnchorRef}
            portfolioAnchorRef={orbitalPortfolioWorldAnchorRef}
            careerGalleryAnchorRef={careerGalleryWorldAnchorRef}
            currentNavigationTarget={currentNavigationTarget}
            onNavigateToTarget={handleCockpitNavigate}
            onCoordinatePing={(message) => shipLog(message, "info")}
          />

          {/* Ship Control Bar — hidden while Orbital Portfolio is active */}
          {!orbitalPortfolioActive && (
            <ShipControlBar
              phase={shipUIPhase}
              isFollowingSD={followingStarDestroyer}
              onDisengage={stopFollowingStarDestroyer}
            />
          )}

          {/* Ship Terminal — top-right CRT log + command input */}
          <ShipTerminal
            logs={shipLogs}
            debugLogs={debugLogs}
            debugLogTotal={debugLogTotal}
            toolActions={terminalToolActions}
            visible={consoleVisible}
            emitFalconLocation={emitFalconLocationLogs}
            emitSDLocation={emitSDLocationLogs}
            onEmitFalconLocationChange={setEmitFalconLocationLogs}
            onEmitSDLocationChange={setEmitSDLocationLogs}
            logCamTraceEnabled={logCamTraceEnabled}
            logAboutDebugEnabled={logAboutDebugEnabled}
            logNavTraceEnabled={logNavTraceEnabled}
            logNavDiagEnabled={logNavDiagEnabled}
            logAudioChannelEnabled={logAudioChannelEnabled}
            logDroneDebugEnabled={logDroneDebugEnabled}
            logNavDebugEnabled={logNavDebugEnabled}
            onLogCamTraceChange={(next) =>
              toggleLogChannel("CAMTRACE", next, setLogCamTraceEnabled)
            }
            onLogAboutDebugChange={(next) =>
              toggleLogChannel("ABOUTDBG", next, setLogAboutDebugEnabled)
            }
            onLogNavTraceChange={(next) =>
              toggleLogChannel("Nav trace", next, setLogNavTraceEnabled)
            }
            onLogNavDiagChange={(next) =>
              toggleLogChannel("Nav diagnostics", next, setLogNavDiagEnabled)
            }
            onLogAudioChannelChange={(next) =>
              toggleLogChannel("Audio", next, setLogAudioChannelEnabled)
            }
            onLogDroneDebugChange={(next) =>
              toggleLogChannel("DBG drone", next, setLogDroneDebugEnabled)
            }
            onLogNavDebugChange={(next) =>
              toggleLogChannel("DBG nav", next, setLogNavDebugEnabled)
            }
            onClearLog={() => {
              shipLogsRef.current = [];
              setShipLogs([]);
              debugLogsRef.current = [];
              setDebugLogs([]);
            }}
            onClose={() => setConsoleVisible(false)}
            onCommand={(cmd) => {
              shipLog(`$ ${cmd}`, "cmd");
              shipLog("Unknown command.", "error");
            }}
          />

          {/* Ship destination nav panel — left side (all ship modes) */}
          {startupDestinationsVisible && (
            <CockpitNavPanel
              panelRef={startupDestinationsPanelRef}
              targets={navigationTargets}
              currentTarget={navCurrentTargetResolved}
              isNavigating={navigationDistance !== null}
              onNavigate={handleCockpitNavigate}
              panelStyleOverride={{
                opacity: 0,
                transform: "translate(-200px, -50%)",
              }}
            />
          )}

          {sceneReady && (
            <button
              type="button"
              title="General settings"
              onClick={() => {
                setSettingsTab("general");
                setShowSoundSettingsModal(true);
              }}
              style={{
                position: "fixed",
                left: 16,
                bottom: 14,
                zIndex: 1111,
                width: 24,
                height: 24,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                border: "none",
                background: "transparent",
                color: "#d8ecff",
                cursor: "pointer",
                fontSize: 17,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ⚙
            </button>
          )}

          {sceneReady && showSoundSettingsModal && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 2147483000,
                background: "rgba(3, 8, 14, 0.52)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'Rajdhani', sans-serif",
              }}
            >
              <div
                style={{
                  width: 320,
                  borderRadius: 12,
                  border: "1px solid rgba(110, 210, 255, 0.42)",
                  background: "rgba(6, 14, 26, 0.94)",
                  color: "#d8eeff",
                  padding: "12px 14px",
                  boxShadow: "0 0 18px rgba(56, 160, 255, 0.24)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      letterSpacing: 0.6,
                      fontWeight: 700,
                    }}
                  >
                    General Settings
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSoundSettingsModal(false)}
                    style={{
                      border: "1px solid rgba(148, 210, 255, 0.46)",
                      background: "rgba(10, 22, 37, 0.86)",
                      color: "#d8eeff",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginBottom: 10,
                    borderBottom: "1px solid rgba(110, 210, 255, 0.24)",
                    paddingBottom: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSettingsTab("general")}
                    style={{
                      borderRadius: 6,
                      border: "1px solid rgba(148, 210, 255, 0.42)",
                      background:
                        settingsTab === "general"
                          ? "rgba(22, 56, 88, 0.92)"
                          : "rgba(10, 22, 37, 0.82)",
                      color: "#d8eeff",
                      padding: "3px 9px",
                      fontSize: 12,
                      letterSpacing: 0.35,
                      cursor: "pointer",
                    }}
                  >
                    General
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsTab("sound")}
                    style={{
                      borderRadius: 6,
                      border: "1px solid rgba(148, 210, 255, 0.42)",
                      background:
                        settingsTab === "sound"
                          ? "rgba(22, 56, 88, 0.92)"
                          : "rgba(10, 22, 37, 0.82)",
                      color: "#d8eeff",
                      padding: "3px 9px",
                      fontSize: 12,
                      letterSpacing: 0.35,
                      cursor: "pointer",
                    }}
                  >
                    Sound
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsTab("logs")}
                    style={{
                      borderRadius: 6,
                      border: "1px solid rgba(148, 210, 255, 0.42)",
                      background:
                        settingsTab === "logs"
                          ? "rgba(22, 56, 88, 0.92)"
                          : "rgba(10, 22, 37, 0.82)",
                      color: "#d8eeff",
                      padding: "3px 9px",
                      fontSize: 12,
                      letterSpacing: 0.35,
                      cursor: "pointer",
                    }}
                  >
                    Logs
                  </button>
                </div>
                {settingsTab === "sound" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      fontSize: 13,
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={droneSoundEnabled}
                          onChange={(event) =>
                            setDroneSoundEnabled(event.currentTarget.checked)
                          }
                        />
                        Drone Sounds
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          width: 162,
                        }}
                      >
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          list={SOUND_SLIDER_TICKS_ID}
                          value={Math.round(droneSoundVolume * 100)}
                          onChange={(event) =>
                            setDroneSoundVolume(
                              Number(event.currentTarget.value) / 100,
                            )
                          }
                          style={{ flex: 1 }}
                        />
                        <span style={{ minWidth: 40, textAlign: "right" }}>
                          {Math.round(droneSoundVolume * 100)}%
                        </span>
                      </span>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={falconSoundEnabled}
                          onChange={(event) =>
                            setFalconSoundEnabled(event.currentTarget.checked)
                          }
                        />
                        Falcon Sounds
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          width: 162,
                          opacity: falconSoundEnabled ? 1 : 0.55,
                        }}
                      >
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          list={SOUND_SLIDER_TICKS_ID}
                          value={Math.round(falconSoundVolume * 100)}
                          onChange={(event) =>
                            setFalconSoundVolume(
                              Number(event.currentTarget.value) / 100,
                            )
                          }
                          disabled={!falconSoundEnabled}
                          style={{ flex: 1 }}
                        />
                        <span style={{ minWidth: 40, textAlign: "right" }}>
                          {Math.round(falconSoundVolume * 100)}%
                        </span>
                      </span>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={musicEnabled}
                          onChange={(event) => {
                            const enabled = event.currentTarget.checked;
                            setMusicEnabled(enabled);
                            if (
                              enabled &&
                              !musicTrack &&
                              availableMusicTracks.length > 0
                            ) {
                              setMusicTrack(availableMusicTracks[0]);
                            }
                          }}
                        />
                        Background Music
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          width: 162,
                          opacity: musicEnabled ? 1 : 0.55,
                        }}
                      >
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          list={SOUND_SLIDER_TICKS_ID}
                          value={Math.round(backgroundMusicVolume * 100)}
                          onChange={(event) =>
                            setBackgroundMusicVolume(
                              Number(event.currentTarget.value) / 100,
                            )
                          }
                          disabled={!musicEnabled}
                          style={{ flex: 1 }}
                        />
                        <span style={{ minWidth: 40, textAlign: "right" }}>
                          {Math.round(backgroundMusicVolume * 100)}%
                        </span>
                      </span>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          letterSpacing: 0.55,
                          textTransform: "uppercase",
                          color: "rgba(176, 220, 255, 0.92)",
                        }}
                      >
                        Track
                      </span>
                      <select
                        value={musicTrack}
                        onChange={(event) =>
                          setMusicTrack(event.currentTarget.value)
                        }
                        disabled={availableMusicTracks.length === 0}
                        style={{
                          borderRadius: 6,
                          border: "1px solid rgba(148, 210, 255, 0.42)",
                          background: "rgba(10, 22, 37, 0.92)",
                          color: "#d8eeff",
                          padding: "6px 8px",
                          fontSize: 12,
                          fontFamily: "'Rajdhani', sans-serif",
                        }}
                      >
                        {availableMusicTracks.length === 0 ? (
                          <option value="">No tracks configured</option>
                        ) : (
                          availableMusicTracks.map((track) => (
                            <option key={track} value={track}>
                              {track}
                            </option>
                          ))
                        )}
                      </select>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 11,
                          letterSpacing: 0.55,
                          textTransform: "uppercase",
                          color: "rgba(176, 220, 255, 0.92)",
                        }}
                      >
                        <span>Overall Volume</span>
                        <span>{Math.round(overallVolume * 100)}%</span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        list={SOUND_SLIDER_TICKS_ID}
                        value={Math.round(overallVolume * 100)}
                        onChange={(event) =>
                          setOverallVolume(
                            Number(event.currentTarget.value) / 100,
                          )
                        }
                      />
                    </label>
                    <datalist id={SOUND_SLIDER_TICKS_ID}>
                      <option value="0" />
                      <option value="25" />
                      <option value="50" />
                      <option value="75" />
                      <option value="100" />
                    </datalist>
                  </div>
                )}
                {settingsTab === "logs" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      fontSize: 13,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(176, 220, 255, 0.92)",
                      }}
                    >
                      Enable noisy channels on demand.
                    </div>
                    {[
                      {
                        label: "Camera Trace ([CAMTRACE])",
                        checked: logCamTraceEnabled,
                        onChange: setLogCamTraceEnabled,
                      },
                      {
                        label: "About Debug (ABOUTDBG)",
                        checked: logAboutDebugEnabled,
                        onChange: setLogAboutDebugEnabled,
                      },
                      {
                        label: "Nav Trace (🧭 TRACE)",
                        checked: logNavTraceEnabled,
                        onChange: setLogNavTraceEnabled,
                      },
                      {
                        label: "Nav Diagnostics (🧪 NAVDIAG)",
                        checked: logNavDiagEnabled,
                        onChange: setLogNavDiagEnabled,
                      },
                      {
                        label: "Audio Channel ([audio])",
                        checked: logAudioChannelEnabled,
                        onChange: setLogAudioChannelEnabled,
                      },
                      {
                        label: "Drone Debug ([DBG:drone])",
                        checked: logDroneDebugEnabled,
                        onChange: setLogDroneDebugEnabled,
                      },
                      {
                        label: "Nav Debug ([DBG:nav])",
                        checked: logNavDebugEnabled,
                        onChange: setLogNavDebugEnabled,
                      },
                    ].map((item) => (
                      <label
                        key={item.label}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(event) =>
                            item.onChange(event.currentTarget.checked)
                          }
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                )}
                {settingsTab === "general" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      fontSize: 13,
                    }}
                  >
                    {onReloadUniverse && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowSoundSettingsModal(false);
                          onReloadUniverse();
                        }}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid rgba(145, 232, 255, 0.5)",
                          background: "rgba(8, 18, 34, 0.86)",
                          color: "#def5ff",
                          fontFamily: "'Rajdhani', sans-serif",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Reload Universe
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {skillsLatticeActive && skillsLatticeSelection && (
            <div
              style={{
                position: "fixed",
                right: 18,
                top: 108,
                width: 296,
                zIndex: 1120,
                borderRadius: 10,
                border: "1px solid rgba(110, 210, 255, 0.42)",
                background: "rgba(6, 14, 26, 0.86)",
                color: "#d8eeff",
                padding: "12px 12px 10px",
                fontFamily: "'Rajdhani', sans-serif",
                backdropFilter: "blur(6px)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1.4,
                  color: "#8fcfff",
                  marginBottom: 5,
                }}
              >
                SKILLS CONSTELLATION
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1.1,
                  color: "#f2f8ff",
                }}
              >
                {skillsLatticeSelection.label}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "rgba(180,220,255,0.92)",
                }}
              >
                {skillsLatticeSelection.nodeType === "category"
                  ? "Category"
                  : `In ${skillsLatticeSelection.path.slice(0, -1).join(" › ")}`}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={goToSkillsLatticeHomeView}
                  disabled={!skillsLatticeHomeViewRef.current}
                  style={{
                    padding: "5px 8px",
                    borderRadius: 8,
                    border: "1px solid rgba(145, 232, 255, 0.55)",
                    background: skillsLatticeHomeViewRef.current
                      ? "rgba(8, 18, 34, 0.82)"
                      : "rgba(8, 18, 34, 0.42)",
                    color: skillsLatticeHomeViewRef.current
                      ? "#dff3ff"
                      : "rgba(223,243,255,0.55)",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 11,
                    cursor: skillsLatticeHomeViewRef.current
                      ? "pointer"
                      : "default",
                  }}
                >
                  Skills Lattice Home
                </button>
              </div>
              <div
                style={{
                  marginTop: 9,
                  maxHeight: 180,
                  overflowY: "auto",
                  borderTop: "1px solid rgba(120,170,220,0.24)",
                  paddingTop: 8,
                  fontSize: 12,
                  lineHeight: 1.4,
                }}
              >
                {skillsLatticeSelection.detailItems.map((item) => (
                  <div key={item} style={{ marginBottom: 5, color: "#c6ddf5" }}>
                    - {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(careerGalleryActive || careerGalleryOutside) && (
            <button
              onClick={() => exitCareerGallery({ restoreShip: true })}
              style={{
                position: "fixed",
                right: 18,
                top: 72,
                zIndex: 1121,
                padding: "5px 8px",
                borderRadius: 8,
                border: "1px solid rgba(145, 232, 255, 0.55)",
                background: "rgba(8, 18, 34, 0.82)",
                color: "#dff3ff",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Exit Gallery
            </button>
          )}
          {mjolnirPromptVisible && (
            <div
              style={{
                position: "fixed",
                left: "50%",
                bottom: 90,
                transform: "translateX(-50%)",
                zIndex: 1250,
                padding: "10px 22px",
                borderRadius: 10,
                background: "rgba(8, 18, 34, 0.7)",
                border: "1px solid rgba(145, 232, 255, 0.45)",
                color: "#e6f6ff",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: 0.8,
                whiteSpace: "nowrap",
                pointerEvents: "none",
                textShadow: "0 0 12px rgba(120, 210, 255, 0.55)",
                animation: "mjolnirPromptPulse 2.2s ease-in-out infinite",
              }}
            >
              Click Mjolnir for a cosmic ride
              <style>{`@keyframes mjolnirPromptPulse {
                0%, 100% { opacity: 0.75; }
                50% { opacity: 1; }
              }`}</style>
            </div>
          )}
          {sdFriendlyMessageKey > 0 && (
            <div
              key={sdFriendlyMessageKey}
              style={{
                position: "fixed",
                left: "50%",
                top: "38%",
                transform: "translate(-50%, -50%)",
                zIndex: 1250,
                padding: "12px 22px",
                borderRadius: 10,
                background: "rgba(8, 18, 34, 0.72)",
                border: "1px solid rgba(145, 232, 255, 0.45)",
                color: "#e6f6ff",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: 0.6,
                textAlign: "center",
                pointerEvents: "none",
                textShadow: "0 0 12px rgba(120, 210, 255, 0.5)",
                animation: "sdFriendlyMessage 3.6s ease forwards",
              }}
            >
              Don't worry… he's friendly… but be careful!
              <style>{`@keyframes sdFriendlyMessage {
                0% { opacity: 0; transform: translate(-50%, -40%); }
                10% { opacity: 1; transform: translate(-50%, -50%); }
                80% { opacity: 1; transform: translate(-50%, -50%); }
                100% { opacity: 0; transform: translate(-50%, -56%); }
              }`}</style>
            </div>
          )}
          {/* SD configurator */}
          {sdConfiguratorOpen && sceneReady && sceneRef.current.scene && (
            <SdFlyoverConfigurator
              scene={sceneRef.current.scene}
              getCamera={getSdConfiguratorCamera}
              getControls={getSdConfiguratorControls}
              getDomElement={getSdConfiguratorDom}
              getMoments={getSdConfiguratorMoments}
              freezeCamera={freezeSdConfiguratorCamera}
              releaseCamera={releaseSdConfiguratorCamera}
              onClose={() => openSdConfigurator(false)}
            />
          )}
          {careerGalleryOutside && (
            <div
              style={{
                position: "fixed",
                left: "50%",
                bottom: 96,
                transform: "translateX(-50%)",
                zIndex: 1121,
                padding: "6px 16px",
                borderRadius: 8,
                background: "rgba(8, 18, 34, 0.6)",
                color: "#bfe6ff",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: 1,
                whiteSpace: "nowrap",
                pointerEvents: "none",
                textShadow: "0 0 10px rgba(120, 210, 255, 0.45)",
              }}
            >
              Click tiles to launch them
            </div>
          )}
          {careerGalleryOutside && CAREER_GALLERY_INTERIOR_ENABLED && (
            <button
              onClick={() => enterCareerGallery()}
              style={{
                position: "fixed",
                left: "50%",
                bottom: 42,
                transform: "translateX(-50%)",
                zIndex: 1121,
                padding: "10px 22px",
                borderRadius: 10,
                border: "1px solid rgba(145, 232, 255, 0.7)",
                background: "rgba(8, 18, 34, 0.85)",
                color: "#dff3ff",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                cursor: "pointer",
                boxShadow: "0 0 18px rgba(120, 210, 255, 0.35)",
              }}
            >
              Enter Gallery
            </button>
          )}
          {careerGalleryActive && (
            <CareerGalleryTitleCard
              selection={careerGallerySelection}
              onClose={() => {
                careerGalleryRef.current?.clearFocus();
                setCareerGallerySelection(null);
              }}
            />
          )}

          {skillsLatticeActive && (
            <button
              onClick={() =>
                exitSkillsLattice({ restoreShip: true, clearSystem: true })
              }
              style={{
                position: "fixed",
                right: 18,
                top: 72,
                zIndex: 1121,
                padding: "5px 8px",
                borderRadius: 8,
                border: "1px solid rgba(255, 195, 160, 0.45)",
                background: "rgba(28, 14, 10, 0.82)",
                color: "#ffe2d5",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Exit
            </button>
          )}

          {skillsLatticeActive && (
            <div
              style={{
                position: "fixed",
                left: "50%",
                bottom: 18,
                transform: "translateX(-50%)",
                zIndex: 1115,
                borderRadius: 8,
                border: "1px solid rgba(120, 170, 220, 0.3)",
                background: "rgba(6, 12, 22, 0.52)",
                color: "rgba(196, 224, 246, 0.72)",
                padding: "7px 12px",
                fontSize: 11,
                fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: 0.45,
                pointerEvents: "none",
                backdropFilter: "blur(4px)",
              }}
            >
              Hint: Shift click to pan, mouse wheel zoom in/out, click nodes to
              inspect
            </div>
          )}
          {keyboardStudioEnabled && !onscreenKeyboardPanelVisible && (
            <button
              type="button"
              onClick={() => {
                setOnscreenKeyboardPanelVisible(true);
                setOnscreenKeyboardPanelLayout((prev) => ({
                  ...prev,
                  lastOpen: Date.now(),
                }));
              }}
              style={{
                position: "fixed",
                left: onscreenKeyboardPanelLayout.x,
                top: onscreenKeyboardPanelLayout.y,
                zIndex: 1130,
                borderRadius: 10,
                border: "1px solid rgba(120, 210, 255, 0.48)",
                background: "rgba(6, 16, 32, 0.9)",
                color: "#d6efff",
                padding: "9px 12px",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                cursor: "pointer",
                backdropFilter: "blur(6px)",
              }}
            >
              Open Keyboard
            </button>
          )}
          {keyboardStudioEnabled && onscreenKeyboardPanelVisible && (
            <div
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              style={{
                position: "fixed",
                left: onscreenKeyboardPanelLayout.x,
                top: onscreenKeyboardPanelLayout.y,
                width: 980,
                maxWidth: "calc(100vw - 36px)",
                zIndex: 1130,
                borderRadius: 12,
                border: "1px solid rgba(110, 210, 255, 0.44)",
                background: "rgba(6, 14, 26, 0.87)",
                color: "#d8eeff",
                padding: "10px 10px 8px",
                fontFamily: "'Rajdhani', sans-serif",
                backdropFilter: "blur(8px)",
                boxShadow: "0 14px 32px rgba(0, 0, 0, 0.35)",
              }}
            >
              <div
                onPointerDown={(event) => {
                  beginOnscreenKeyboardDrag(event);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 6,
                  cursor: "move",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.4,
                      color: "#8fcfff",
                    }}
                  >
                    KEYBOARD RECORDER LAB
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(194, 228, 252, 0.92)",
                      marginTop: 1,
                    }}
                  >
                    3 Octaves (C3-B5) · {onscreenKeyboardRecordedEvents.length}{" "}
                    captured notes
                    {selectedKeyboardStudioPreset
                      ? ` · ${selectedKeyboardStudioPreset.name}`
                      : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() =>
                      setOnscreenKeyboardPanelCollapsed((prev) => {
                        const next = !prev;
                        setOnscreenKeyboardPanelLayout((layout) => ({
                          ...layout,
                          collapsed: next,
                        }));
                        return next;
                      })
                    }
                    style={{
                      borderRadius: 8,
                      border: "1px solid rgba(130, 190, 236, 0.5)",
                      background: "rgba(13, 30, 52, 0.88)",
                      color: "#d4ecff",
                      padding: "5px 8px",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {onscreenKeyboardPanelCollapsed ? "Expand" : "Collapse"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOnscreenKeyboardPanelVisible(false);
                      setOnscreenKeyboardPanelLayout((prev) => ({
                        ...prev,
                        lastOpen: Date.now(),
                      }));
                    }}
                    style={{
                      borderRadius: 8,
                      border: "1px solid rgba(200, 120, 120, 0.54)",
                      background: "rgba(46, 18, 24, 0.84)",
                      color: "#ffd8dc",
                      padding: "5px 8px",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
              {!onscreenKeyboardPanelCollapsed && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.5fr 1fr 0.9fr 0.9fr",
                      gap: 7,
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: 0.55,
                          textTransform: "uppercase",
                          color: "rgba(176, 220, 255, 0.9)",
                        }}
                      >
                        Sound Type / Instrument
                      </span>
                      <select
                        value={keyboardStudioSelectedSource}
                        onChange={(event) => {
                          setKeyboardStudioSelectedSource(
                            event.currentTarget.value,
                          );
                          previewKeyboardStudioControlFeedback("E5");
                        }}
                        style={{
                          borderRadius: 8,
                          border: "1px solid rgba(145, 215, 255, 0.5)",
                          background: "rgba(10, 24, 38, 0.9)",
                          color: "#d8eeff",
                          fontFamily: "'Rajdhani', sans-serif",
                          fontSize: 12,
                          padding: "6px 8px",
                        }}
                      >
                        <optgroup label="Keys & Pianos">
                          {KEYBOARD_STUDIO_FACTORY_PRESETS.filter((preset) =>
                            [
                              "factory-nebula-keys",
                              "factory-grand-piano",
                              "factory-electric-piano",
                              "factory-dream-keys",
                              "factory-cinematic-bell",
                            ].includes(preset.id),
                          ).map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Synth / Pads">
                          {KEYBOARD_STUDIO_FACTORY_PRESETS.filter((preset) =>
                            [
                              "factory-synth-pluck",
                              "factory-aurora-pad",
                              "factory-sunrise-lead",
                              "factory-voyager-ambient",
                              "factory-cosmic-choir",
                              "factory-solar-winds",
                              "factory-hyperdrive-whine",
                            ].includes(preset.id),
                          ).map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Instruments">
                          {KEYBOARD_STUDIO_FACTORY_PRESETS.filter((preset) =>
                            [
                              "factory-organ",
                              "factory-violin",
                              "factory-flute",
                              "factory-guitar",
                              "factory-sitar",
                              "factory-kalimba",
                            ].includes(preset.id),
                          ).map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Drums / Beats">
                          {KEYBOARD_STUDIO_FACTORY_PRESETS.filter((preset) =>
                            [
                              "factory-drum-kit",
                              "factory-808-kick",
                              "factory-deep-pulse",
                              "factory-neutron-pluck",
                            ].includes(preset.id),
                          ).map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="FX / Space">
                          {KEYBOARD_STUDIO_FACTORY_PRESETS.filter((preset) =>
                            [
                              "factory-laser-zap",
                              "factory-impact-boom",
                              "factory-spaceship-console",
                              "factory-glass-orbit",
                              "factory-ion-spark",
                              "factory-cinematic-chords",
                            ].includes(preset.id),
                          ).map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                        {keyboardStudioPresets.length > 0 && (
                          <option disabled value="__custom-sep__">
                            -- Saved Presets --
                          </option>
                        )}
                        {keyboardStudioPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      value={keyboardStudioPresetName}
                      onChange={(event) =>
                        setKeyboardStudioPresetName(event.currentTarget.value)
                      }
                      placeholder="Name your sound (e.g. InvestCloud Click)"
                      style={{
                        borderRadius: 8,
                        border: "1px solid rgba(130, 190, 236, 0.5)",
                        background: "rgba(10, 24, 38, 0.84)",
                        color: "#d8eeff",
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 12,
                        padding: "6px 8px",
                      }}
                    />
                    <button
                      type="button"
                      onClick={saveKeyboardStudioPreset}
                      disabled={
                        keyboardStudioPresetName.trim().length === 0 ||
                        onscreenKeyboardRecordedEvents.length === 0
                      }
                      style={{
                        borderRadius: 8,
                        border: "1px solid rgba(150, 255, 210, 0.5)",
                        background: "rgba(14, 54, 34, 0.92)",
                        color: "#dcffea",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        cursor:
                          keyboardStudioPresetName.trim().length === 0 ||
                          onscreenKeyboardRecordedEvents.length === 0
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          keyboardStudioPresetName.trim().length === 0 ||
                          onscreenKeyboardRecordedEvents.length === 0
                            ? 0.56
                            : 1,
                      }}
                    >
                      Save Named Sound
                    </button>
                  </div>
                  <div
                    style={{
                      marginBottom: 6,
                      fontSize: 11,
                      color: "rgba(184, 223, 252, 0.92)",
                      lineHeight: 1.35,
                    }}
                  >
                    1) Record a phrase, 2) Enter a name, 3) Click{" "}
                    <strong>Save Named Sound</strong>. Saved sounds appear in
                    the dropdown and can be bound to universe events.
                  </div>
                  <div
                    style={{
                      marginBottom: 6,
                      display: "grid",
                      gridTemplateColumns: "1.4fr auto auto auto",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <select
                      value={keyboardStudioSelectedSettingsId}
                      onChange={(event) =>
                        setKeyboardStudioSelectedSettingsId(
                          event.currentTarget.value,
                        )
                      }
                      style={{
                        borderRadius: 8,
                        border: "1px solid rgba(130, 190, 236, 0.5)",
                        background: "rgba(10, 24, 38, 0.9)",
                        color: "#d8eeff",
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 12,
                        padding: "6px 8px",
                      }}
                    >
                      <option value="">Saved Mixer Settings (up to 10)</option>
                      {keyboardStudioSavedSettings.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {slot.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={saveKeyboardStudioCurrentSettingsSlot}
                      style={{
                        borderRadius: 8,
                        border: "1px solid rgba(150, 255, 210, 0.5)",
                        background: "rgba(14, 54, 34, 0.9)",
                        color: "#dcffea",
                        padding: "6px 9px",
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Save Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!keyboardStudioSelectedSettingsId) return;
                        loadKeyboardStudioSettingsSlot(
                          keyboardStudioSelectedSettingsId,
                        );
                      }}
                      disabled={!keyboardStudioSelectedSettingsId}
                      style={{
                        borderRadius: 8,
                        border: "1px solid rgba(145, 215, 255, 0.5)",
                        background: "rgba(18, 42, 68, 0.9)",
                        color: "#e8f6ff",
                        padding: "6px 9px",
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: keyboardStudioSelectedSettingsId
                          ? "pointer"
                          : "not-allowed",
                        opacity: keyboardStudioSelectedSettingsId ? 1 : 0.55,
                      }}
                    >
                      Load Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!keyboardStudioSelectedSettingsId) return;
                        deleteKeyboardStudioSettingsSlot(
                          keyboardStudioSelectedSettingsId,
                        );
                      }}
                      disabled={!keyboardStudioSelectedSettingsId}
                      style={{
                        borderRadius: 8,
                        border: "1px solid rgba(220, 130, 130, 0.5)",
                        background: "rgba(56, 20, 24, 0.9)",
                        color: "#ffd8dc",
                        padding: "6px 9px",
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: keyboardStudioSelectedSettingsId
                          ? "pointer"
                          : "not-allowed",
                        opacity: keyboardStudioSelectedSettingsId ? 1 : 0.55,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `${keyboardStudioMainColumnWidth}px 10px minmax(250px, 1fr)`,
                      gap: 0,
                      alignItems: "start",
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ paddingRight: 8 }}>
                      <div
                        style={{
                          marginBottom: 6,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        {[
                          {
                            label: "Soft Pad",
                            sound: {
                              reverbMix: 0.42,
                              delayFeedback: 0.18,
                              drive: 0.04,
                              filterCutoff: 1800,
                            },
                          },
                          {
                            label: "Bright Bell",
                            sound: {
                              reverbMix: 0.32,
                              delayFeedback: 0.24,
                              drive: 0.08,
                              filterCutoff: 6200,
                            },
                          },
                          {
                            label: "Deep Bass",
                            sound: {
                              reverbMix: 0.06,
                              delayFeedback: 0.1,
                              drive: 0.34,
                              filterCutoff: 900,
                              sustain: 0.22,
                            },
                          },
                          {
                            label: "Solar Winds",
                            sound: {
                              reverbMix: 0.54,
                              delayFeedback: 0.44,
                              drive: 0.04,
                              filterCutoff: 1400,
                              release: 2.2,
                            },
                          },
                        ].map((macro) => (
                          <button
                            key={macro.label}
                            type="button"
                            onClick={() => {
                              setKeyboardStudioSoundDesign((prev) =>
                                normalizeSoundDesign({
                                  ...prev,
                                  ...macro.sound,
                                }),
                              );
                              previewKeyboardStudioControlFeedback("G5");
                            }}
                            style={{
                              borderRadius: 999,
                              border: "1px solid rgba(130, 190, 236, 0.5)",
                              background: "rgba(10, 24, 38, 0.88)",
                              color: "#d8eeff",
                              padding: "5px 10px",
                              fontFamily: "'Rajdhani', sans-serif",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {macro.label}
                          </button>
                        ))}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 7,
                          marginBottom: 6,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => void startOnscreenKeyboardRecording()}
                          disabled={
                            onscreenKeyboardRecording || onscreenKeyboardPlaying
                          }
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(160, 255, 195, 0.5)",
                            background: onscreenKeyboardRecording
                              ? "rgba(20, 66, 42, 0.95)"
                              : "rgba(12, 40, 26, 0.9)",
                            color: "#dcffea",
                            padding: "6px 10px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            cursor:
                              onscreenKeyboardRecording ||
                              onscreenKeyboardPlaying
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              onscreenKeyboardRecording ||
                              onscreenKeyboardPlaying
                                ? 0.6
                                : 1,
                          }}
                        >
                          Record
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            stopOnscreenKeyboardRecording();
                            stopOnscreenKeyboardPlayback();
                          }}
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(255, 180, 138, 0.52)",
                            background: "rgba(54, 26, 10, 0.9)",
                            color: "#ffe1cc",
                            padding: "6px 10px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            cursor: "pointer",
                          }}
                        >
                          Stop
                        </button>
                        <button
                          type="button"
                          onClick={playOnscreenKeyboardRecording}
                          disabled={onscreenKeyboardRecordedEvents.length === 0}
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(145, 215, 255, 0.55)",
                            background: "rgba(18, 42, 68, 0.9)",
                            color: "#e8f6ff",
                            padding: "6px 10px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            cursor:
                              onscreenKeyboardRecordedEvents.length === 0
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              onscreenKeyboardRecordedEvents.length === 0
                                ? 0.55
                                : 1,
                          }}
                        >
                          Play
                        </button>
                        <button
                          type="button"
                          onClick={playOnscreenKeyboardAutoplay}
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(178, 166, 255, 0.56)",
                            background: "rgba(34, 26, 66, 0.9)",
                            color: "#ebe5ff",
                            padding: "6px 10px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            cursor: "pointer",
                          }}
                        >
                          Autoplay
                        </button>
                        <button
                          type="button"
                          onClick={exportOnscreenKeyboardJson}
                          disabled={onscreenKeyboardRecordedEvents.length === 0}
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(138, 228, 255, 0.5)",
                            background: "rgba(14, 48, 62, 0.9)",
                            color: "#daf7ff",
                            padding: "6px 10px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            cursor:
                              onscreenKeyboardRecordedEvents.length === 0
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              onscreenKeyboardRecordedEvents.length === 0
                                ? 0.55
                                : 1,
                          }}
                        >
                          Export JSON
                        </button>
                        <button
                          type="button"
                          onClick={exportOnscreenKeyboardMidi}
                          disabled={onscreenKeyboardRecordedEvents.length === 0}
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(130, 220, 172, 0.5)",
                            background: "rgba(14, 52, 36, 0.9)",
                            color: "#d8ffe8",
                            padding: "6px 10px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            cursor:
                              onscreenKeyboardRecordedEvents.length === 0
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              onscreenKeyboardRecordedEvents.length === 0
                                ? 0.55
                                : 1,
                          }}
                        >
                          Export MIDI
                        </button>
                        <button
                          type="button"
                          onClick={clearOnscreenKeyboardRecording}
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(220, 150, 150, 0.52)",
                            background: "rgba(62, 26, 30, 0.9)",
                            color: "#ffe0e0",
                            padding: "6px 10px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            cursor: "pointer",
                          }}
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const raw = window.prompt("Paste preset JSON");
                            if (!raw) return;
                            importKeyboardStudioPresetJson(raw);
                          }}
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(150, 210, 255, 0.5)",
                            background: "rgba(12, 38, 58, 0.9)",
                            color: "#d8f1ff",
                            padding: "6px 10px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            cursor: "pointer",
                          }}
                        >
                          Import JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!keyboardStudioSelectedPresetId) return;
                            deleteKeyboardStudioPreset(
                              keyboardStudioSelectedPresetId,
                            );
                          }}
                          disabled={!keyboardStudioSelectedPresetId}
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(220, 130, 130, 0.52)",
                            background: "rgba(60, 22, 26, 0.9)",
                            color: "#ffd9dc",
                            padding: "6px 10px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            cursor: keyboardStudioSelectedPresetId
                              ? "pointer"
                              : "not-allowed",
                            opacity: keyboardStudioSelectedPresetId ? 1 : 0.55,
                          }}
                        >
                          Delete Preset
                        </button>
                      </div>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          marginBottom: 6,
                          fontSize: 12,
                          color: "rgba(194, 228, 252, 0.9)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={onscreenKeyboardGhostAutoplay}
                          onChange={(event) => {
                            setOnscreenKeyboardGhostAutoplay(
                              event.currentTarget.checked,
                            );
                            previewKeyboardStudioControlFeedback("E5");
                          }}
                        />
                        Ghost key animation during playback
                      </label>
                      <div
                        style={{
                          marginBottom: 6,
                          display: "grid",
                          gridTemplateColumns: "1.2fr 0.8fr 0.8fr auto",
                          gap: 7,
                          alignItems: "center",
                        }}
                      >
                        <select
                          value={keyboardStudioBeatPatternId}
                          onChange={(event) => {
                            setKeyboardStudioBeatPatternId(
                              event.currentTarget
                                .value as keyof typeof KEYBOARD_STUDIO_BEAT_PATTERNS,
                            );
                            previewKeyboardStudioControlFeedback("A4");
                          }}
                          style={{
                            borderRadius: 7,
                            border: "1px solid rgba(130, 190, 236, 0.5)",
                            background: "rgba(10, 22, 38, 0.9)",
                            color: "#d8eeff",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 12,
                            padding: "5px 8px",
                          }}
                        >
                          <option value="pulse">Beat: Pulse Drive</option>
                          <option value="orbit">Beat: Orbit Groove</option>
                          <option value="cinematic">
                            Beat: Cinematic Build
                          </option>
                        </select>
                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            fontSize: 11,
                            color: "rgba(194, 228, 252, 0.9)",
                          }}
                        >
                          <span>Tempo {keyboardStudioBeatTempoBpm} BPM</span>
                          <input
                            type="range"
                            min={56}
                            max={180}
                            step={1}
                            value={keyboardStudioBeatTempoBpm}
                            onChange={(event) => {
                              setKeyboardStudioBeatTempoBpm(
                                Number(event.currentTarget.value),
                              );
                              previewKeyboardStudioControlFeedback("F5");
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={playKeyboardStudioBeatOneShot}
                          style={{
                            borderRadius: 7,
                            border: "1px solid rgba(145, 215, 255, 0.55)",
                            background: "rgba(18, 42, 68, 0.9)",
                            color: "#e8f6ff",
                            padding: "6px 9px",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Play Beat
                        </button>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 11,
                            color: "rgba(194, 228, 252, 0.9)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={keyboardStudioBeatLoopEnabled}
                            onChange={(event) => {
                              setKeyboardStudioBeatLoopEnabled(
                                event.currentTarget.checked,
                              );
                              previewKeyboardStudioControlFeedback("B4");
                            }}
                          />
                          Beat Loop
                        </label>
                      </div>
                    </div>
                    <div
                      onPointerDown={beginKeyboardStudioMainColumnResize}
                      style={{
                        alignSelf: "stretch",
                        cursor: "col-resize",
                        borderRadius: 8,
                        border: "1px solid rgba(125, 182, 229, 0.3)",
                        background: "rgba(22, 44, 66, 0.45)",
                        width: 8,
                        marginTop: 2,
                      }}
                    />
                    <div
                      style={{
                        marginLeft: 8,
                        border: "1px solid rgba(105, 170, 220, 0.35)",
                        borderRadius: 8,
                        padding: "6px 7px",
                        background: "rgba(8, 20, 35, 0.6)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          letterSpacing: 0.6,
                          color: "#8fcfff",
                          marginBottom: 4,
                        }}
                      >
                        SETTINGS
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "rgba(184, 223, 252, 0.9)",
                          marginBottom: 6,
                        }}
                      >
                        Space=room, Echo=repeats, Warmth=tone, Punch=attack,
                        Motion=stereo, Tail=fade.
                      </div>
                      <div
                        style={{
                          marginBottom: 6,
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 7,
                          fontSize: 11,
                        }}
                      >
                        {[
                          {
                            label: "Space",
                            hint: "Room size and ambience.",
                            value: keyboardStudioSoundDesign.reverbMix,
                            min: 0,
                            max: 1,
                            step: 0.01,
                            update: (value: number) =>
                              setKeyboardStudioSoundDesign((prev) =>
                                normalizeSoundDesign({
                                  ...prev,
                                  reverbMix: value,
                                  reverbDecay: 1.6 + value * 7.2,
                                }),
                              ),
                          },
                          {
                            label: "Echo",
                            hint: "Repeats and feedback depth.",
                            value: keyboardStudioSoundDesign.delayFeedback,
                            min: 0,
                            max: 0.92,
                            step: 0.01,
                            update: (value: number) =>
                              setKeyboardStudioSoundDesign((prev) =>
                                normalizeSoundDesign({
                                  ...prev,
                                  delayFeedback: value,
                                  delayTime: 0.06 + value * 0.42,
                                }),
                              ),
                          },
                          {
                            label: "Warmth",
                            hint: "Dark/soft tonal color.",
                            value:
                              1 -
                              (keyboardStudioSoundDesign.filterCutoff - 100) /
                                11900,
                            min: 0,
                            max: 1,
                            step: 0.01,
                            update: (value: number) =>
                              setKeyboardStudioSoundDesign((prev) =>
                                normalizeSoundDesign({
                                  ...prev,
                                  filterCutoff: 12000 - value * 11200,
                                  sustain: 0.25 + value * 0.55,
                                }),
                              ),
                          },
                          {
                            label: "Punch",
                            hint: "Attack bite and drive.",
                            value: keyboardStudioSoundDesign.drive,
                            min: 0,
                            max: 1,
                            step: 0.01,
                            update: (value: number) =>
                              setKeyboardStudioSoundDesign((prev) =>
                                normalizeSoundDesign({
                                  ...prev,
                                  drive: value,
                                  attack: Math.max(0.001, 0.03 - value * 0.02),
                                }),
                              ),
                          },
                          {
                            label: "Motion",
                            hint: "Stereo movement and swirl.",
                            value: keyboardStudioSoundDesign.chorusDepth,
                            min: 0,
                            max: 1,
                            step: 0.01,
                            update: (value: number) =>
                              setKeyboardStudioSoundDesign((prev) =>
                                normalizeSoundDesign({
                                  ...prev,
                                  chorusDepth: value,
                                  chorusRate: 0.2 + value * 2.4,
                                  stereoWidth: 0.25 + value * 0.7,
                                }),
                              ),
                          },
                          {
                            label: "Tail",
                            hint: "How long notes fade out.",
                            value: keyboardStudioSoundDesign.release,
                            min: 0.05,
                            max: 6,
                            step: 0.01,
                            update: (value: number) =>
                              setKeyboardStudioSoundDesign((prev) =>
                                normalizeSoundDesign({
                                  ...prev,
                                  release: value,
                                }),
                              ),
                          },
                        ].map((slider) => (
                          <label
                            key={slider.label}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              color: "rgba(194, 228, 252, 0.9)",
                            }}
                          >
                            <span>
                              {slider.label}: {slider.value.toFixed(2)}
                            </span>
                            <input
                              type="range"
                              min={slider.min}
                              max={slider.max}
                              step={slider.step}
                              value={slider.value}
                              onChange={(event) => {
                                slider.update(
                                  Number(event.currentTarget.value),
                                );
                                previewKeyboardStudioControlFeedback("D5");
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      <div
                        style={{
                          border: "1px solid rgba(105, 170, 220, 0.35)",
                          borderRadius: 8,
                          padding: "6px 7px",
                          maxHeight: 190,
                          overflowY: "auto",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            letterSpacing: 0.6,
                            color: "#8fcfff",
                            marginBottom: 6,
                          }}
                        >
                          EVENT BINDINGS
                        </div>
                        {keyboardStudioKnownEventIds.map((eventId) => {
                          const binding = keyboardStudioBindings.find(
                            (item) => item.eventId === eventId,
                          );
                          return (
                            <div
                              key={eventId}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1.5fr 1fr auto",
                                gap: 6,
                                alignItems: "center",
                                marginBottom: 5,
                                fontSize: 11,
                                color: "#d6ecff",
                              }}
                            >
                              <span>{eventId}</span>
                              <select
                                value={binding?.presetId ?? ""}
                                onChange={(event) =>
                                  setKeyboardStudioBindingPreset(
                                    eventId,
                                    event.currentTarget.value,
                                  )
                                }
                                style={{
                                  borderRadius: 6,
                                  border: "1px solid rgba(130, 190, 236, 0.5)",
                                  background: "rgba(10, 22, 38, 0.85)",
                                  color: "#d6ecff",
                                  fontSize: 11,
                                  fontFamily: "'Rajdhani', sans-serif",
                                  padding: "3px 6px",
                                }}
                              >
                                <option value="">(none)</option>
                                {allKeyboardStudioPresetOptions.map(
                                  (preset) => (
                                    <option key={preset.id} value={preset.id}>
                                      {preset.name}
                                    </option>
                                  ),
                                )}
                              </select>
                              <label
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={binding?.enabled ?? false}
                                  onChange={(event) =>
                                    setKeyboardStudioBindings((prev) =>
                                      prev.some(
                                        (item) => item.eventId === eventId,
                                      )
                                        ? prev.map((item) =>
                                            item.eventId === eventId
                                              ? {
                                                  ...item,
                                                  enabled:
                                                    event.currentTarget.checked,
                                                }
                                              : item,
                                          )
                                        : event.currentTarget.checked
                                          ? [
                                              ...prev,
                                              {
                                                eventId,
                                                presetId: "",
                                                enabled: true,
                                                gain: 1,
                                              },
                                            ]
                                          : prev,
                                    )
                                  }
                                />
                                On
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: 152,
                      borderRadius: 8,
                      border: "1px solid rgba(116, 174, 226, 0.4)",
                      background:
                        "linear-gradient(180deg, rgba(10, 22, 38, 0.96) 0%, rgba(8, 18, 32, 0.95) 100%)",
                      overflow: "hidden",
                      userSelect: "none",
                    }}
                    onPointerLeave={(event) => {
                      if (event.buttons > 0) releaseAllOnscreenKeyboardNotes();
                    }}
                  >
                    {onscreenKeyboardKeys
                      .filter((key) => !key.isBlack)
                      .map((key) => {
                        const isPressed = onscreenKeyboardActiveNoteSet.has(
                          key.note,
                        );
                        const isGhost = onscreenKeyboardGhostNoteSet.has(
                          key.note,
                        );
                        return (
                          <button
                            key={key.note}
                            type="button"
                            onPointerDown={(event) =>
                              handleKeyboardKeyPointerDown(key.note, event)
                            }
                            onPointerUp={(event) =>
                              handleKeyboardKeyPointerUp(key.note, event)
                            }
                            onPointerCancel={(event) =>
                              handleKeyboardKeyPointerUp(key.note, event)
                            }
                            onLostPointerCapture={(event) =>
                              handleKeyboardKeyPointerUp(key.note, event)
                            }
                            onPointerLeave={(event) => {
                              if (event.buttons === 0)
                                handleKeyboardKeyPointerUp(key.note, event);
                            }}
                            style={{
                              position: "absolute",
                              left: `${(key.leftUnit / ONSCREEN_KEYBOARD_WHITE_KEY_COUNT) * 100}%`,
                              width: `${100 / ONSCREEN_KEYBOARD_WHITE_KEY_COUNT}%`,
                              top: 0,
                              bottom: 0,
                              borderRadius: "0 0 6px 6px",
                              border: "1px solid rgba(36, 62, 92, 0.7)",
                              borderTop: "1px solid rgba(134, 179, 226, 0.55)",
                              background: isPressed
                                ? isGhost
                                  ? "linear-gradient(180deg, #98b5ff 0%, #6384ff 100%)"
                                  : "linear-gradient(180deg, #f3fbff 0%, #a7deff 100%)"
                                : "linear-gradient(180deg, #f7fcff 0%, #dceaf8 100%)",
                              color: isPressed ? "#0b1f34" : "#56789b",
                              fontFamily: "'Rajdhani', sans-serif",
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: 0.3,
                              display: "flex",
                              alignItems: "flex-end",
                              justifyContent: "center",
                              paddingBottom: 7,
                              cursor: "pointer",
                              transform: isPressed
                                ? "translateY(2px)"
                                : "translateY(0px)",
                              transition:
                                "transform 90ms ease, background 120ms ease",
                            }}
                          >
                            {key.note}
                          </button>
                        );
                      })}
                    {onscreenKeyboardKeys
                      .filter((key) => key.isBlack)
                      .map((key) => {
                        const isPressed = onscreenKeyboardActiveNoteSet.has(
                          key.note,
                        );
                        const isGhost = onscreenKeyboardGhostNoteSet.has(
                          key.note,
                        );
                        return (
                          <button
                            key={key.note}
                            type="button"
                            onPointerDown={(event) =>
                              handleKeyboardKeyPointerDown(key.note, event)
                            }
                            onPointerUp={(event) =>
                              handleKeyboardKeyPointerUp(key.note, event)
                            }
                            onPointerCancel={(event) =>
                              handleKeyboardKeyPointerUp(key.note, event)
                            }
                            onLostPointerCapture={(event) =>
                              handleKeyboardKeyPointerUp(key.note, event)
                            }
                            onPointerLeave={(event) => {
                              if (event.buttons === 0)
                                handleKeyboardKeyPointerUp(key.note, event);
                            }}
                            style={{
                              position: "absolute",
                              left: `${(key.leftUnit / ONSCREEN_KEYBOARD_WHITE_KEY_COUNT) * 100}%`,
                              width: `${(100 / ONSCREEN_KEYBOARD_WHITE_KEY_COUNT) * 0.64}%`,
                              top: 0,
                              height: "62%",
                              borderRadius: "0 0 5px 5px",
                              border: "1px solid rgba(5, 10, 20, 0.92)",
                              background: isPressed
                                ? isGhost
                                  ? "linear-gradient(180deg, #8d90ff 0%, #4248d8 100%)"
                                  : "linear-gradient(180deg, #66dcff 0%, #1684b8 100%)"
                                : "linear-gradient(180deg, #1f2c45 0%, #0b1524 100%)",
                              color: "rgba(212, 236, 255, 0.9)",
                              fontFamily: "'Rajdhani', sans-serif",
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: 0.2,
                              display: "flex",
                              alignItems: "flex-end",
                              justifyContent: "center",
                              paddingBottom: 5,
                              cursor: "pointer",
                              transform: isPressed
                                ? "translateY(2px)"
                                : "translateY(0px)",
                              transition:
                                "transform 90ms ease, background 120ms ease",
                              zIndex: 2,
                            }}
                          >
                            {key.note}
                          </button>
                        );
                      })}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: "rgba(171, 212, 243, 0.82)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span>
                      Status:{" "}
                      {onscreenKeyboardRecording
                        ? "Recording"
                        : onscreenKeyboardPlaying
                          ? "Playing"
                          : "Idle"}
                    </span>
                    <span>
                      Press keys directly to perform. Autoplay uses recording if
                      available, otherwise demo melody.
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {aboutSwarmTriggerVisible && (
            <div
              style={{
                position: "fixed",
                left: "50%",
                bottom: 22,
                transform: "translateX(-50%)",
                zIndex: 1118,
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  pointerEvents: "none",
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(140, 195, 255, 0.45)",
                  background: "rgba(8, 18, 32, 0.78)",
                  color: "#d6ecff",
                  fontSize: 11,
                  fontFamily: "'Rajdhani', sans-serif",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                Slide {aboutSlides.length > 0 ? aboutActiveSlideIndex + 1 : 0}/
                {aboutSlides.length}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  goToAboutSlide(-1);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  pointerEvents: "auto",
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "1px solid rgba(150, 215, 255, 0.5)",
                  background:
                    "linear-gradient(180deg, rgba(16, 34, 58, 0.88) 0%, rgba(8, 18, 32, 0.9) 100%)",
                  color: "#d8eeff",
                  fontSize: 12,
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  boxShadow: "0 8px 20px rgba(4, 10, 20, 0.45)",
                  cursor: "pointer",
                }}
              >
                Prev Slide
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  goToAboutSlide(1);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  pointerEvents: "auto",
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "1px solid rgba(160, 255, 195, 0.5)",
                  background:
                    "linear-gradient(180deg, rgba(14, 50, 32, 0.88) 0%, rgba(8, 24, 16, 0.9) 100%)",
                  color: "#dafce9",
                  fontSize: 12,
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  boxShadow: "0 8px 20px rgba(4, 14, 10, 0.45)",
                  cursor: "pointer",
                }}
              >
                Next Slide
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  triggerAboutSwarmBreakApart();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  pointerEvents: "auto",
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "1px solid rgba(255, 180, 120, 0.55)",
                  background:
                    "linear-gradient(180deg, rgba(62, 30, 16, 0.9) 0%, rgba(34, 16, 8, 0.92) 100%)",
                  color: "#ffe4cf",
                  fontSize: 12,
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  boxShadow: "0 8px 20px rgba(20, 8, 2, 0.45)",
                  cursor: "pointer",
                }}
              >
                Explode
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  triggerAboutSwarmReform();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  pointerEvents: "auto",
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "1px solid rgba(160, 255, 195, 0.55)",
                  background:
                    "linear-gradient(180deg, rgba(14, 50, 32, 0.9) 0%, rgba(8, 24, 16, 0.92) 100%)",
                  color: "#dafce9",
                  fontSize: 12,
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  boxShadow: "0 8px 20px rgba(4, 14, 10, 0.45)",
                  cursor: "pointer",
                }}
              >
                Reform
              </button>
            </div>
          )}

          {renderUnifiedRegistryPanel()}

          {/* Unified TV Preview Panel with Target / Flight tab switcher */}
          <TargetPreviewTVPanel
            tvPhase={tvPhase}
            tvControllerRef={tvPreviewControllerRef}
            dashcamPhase={dashcamPhase}
            dashcamControllerRef={dashcamControllerRef}
          />

          {/* Spaceship HUD Interface */}
          <SpaceshipHUD
            userName={profile.name.toUpperCase()}
            userTitle={profile.title}
            shipMovementDebug={shipMovementDebug}
            onShipMovementDebugChange={setShipMovementDebug}
            shipMovementDebugPanel={
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    color: "#e8c547",
                    fontSize: 12,
                    fontFamily: "'Rajdhani', sans-serif",
                    letterSpacing: 0.6,
                  }}
                >
                  KEY COMBO HELP
                </div>
                <button
                  onClick={() =>
                    appendSystemStatusLog(
                      "Shift+L: Camera snapshot (CAMERA_SNAPSHOT).\nCaptures camera position, target, rotation, FOV, zoom, near/far.",
                    )
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(232, 197, 71, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#e8c547",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  Log Shift+L details
                </button>
                <button
                  onClick={() =>
                    appendSystemStatusLog(
                      "Shift+M: Toggle Ship Staging Mode.\nControls: WASD/RF move, arrows/QE rotate, Shift = faster.\nShift+P: Ship snapshot (SHIP_SNAPSHOT).",
                    )
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(100, 149, 237, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  Log Shift+M details
                </button>
                <button
                  onClick={() =>
                    appendSystemStatusLog(
                      "Shift+J: Dump Ship Labels (SHIP_DEBUG_LABELS).\nUse Label Ship mode + click to mark points, then Shift+J to log.",
                    )
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(120, 255, 170, 0.45)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#7dffb1",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  Log Shift+J details
                </button>
                <button
                  onClick={() => {
                    if (!spaceshipRef.current) return;
                    const ship = spaceshipRef.current;
                    if (shipCinematicRef.current) {
                      shipCinematicRef.current.active = false;
                      shipCinematicRef.current = null;
                    }
                    setFollowingSpaceship(false);
                    followingSpaceshipRef.current = false;
                    setManualFlightMode(false);
                    manualFlightModeRef.current = false;
                    setInsideShip(false);
                    insideShipRef.current = false;
                    setShipViewMode("exterior");
                    shipViewModeRef.current = "exterior";
                    const randomOffset = new THREE.Vector3(
                      (Math.random() - 0.5) * 1600,
                      (Math.random() - 0.5) * 800,
                      (Math.random() - 0.5) * 1600,
                    );
                    ship.position.copy(randomOffset);
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(100, 149, 237, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
                  }}
                >
                  Random Ship
                </button>
                <button
                  onClick={() => {
                    if (!spaceshipRef.current) return;
                    const ship = spaceshipRef.current;
                    if (shipCinematicRef.current) {
                      shipCinematicRef.current.active = false;
                      shipCinematicRef.current = null;
                    }
                    setFollowingSpaceship(false);
                    followingSpaceshipRef.current = false;
                    setManualFlightMode(false);
                    manualFlightModeRef.current = false;

                    const startPos = ship.position.clone();
                    const endPos = getRandomEndPosNearPlanets();
                    if (endPos.distanceTo(startPos) < 300) {
                      endPos.add(new THREE.Vector3(300, 150, -350));
                    }

                    const controlPos = startPos.clone().lerp(endPos, 0.5);
                    const distance = startPos.distanceTo(endPos);
                    const duration = THREE.MathUtils.clamp(
                      4000 * (distance / CINE_DURATION_DIVISOR),
                      3000,
                      9000,
                    );

                    shipCinematicRef.current = {
                      active: true,
                      phase: "approach",
                      startTime: performance.now(),
                      duration,
                      startPos: startPos.clone(),
                      controlPos,
                      endPos: endPos.clone(),
                      startQuat: ship.quaternion.clone(),
                      endQuat: ship.quaternion.clone(),
                    };
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(100, 149, 237, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
                  }}
                >
                  Random Straight
                </button>
                <button
                  onClick={() => {
                    if (!spaceshipRef.current) return;
                    const ship = spaceshipRef.current;
                    if (shipCinematicRef.current) {
                      shipCinematicRef.current.active = false;
                      shipCinematicRef.current = null;
                    }
                    setFollowingSpaceship(false);
                    followingSpaceshipRef.current = false;
                    setManualFlightMode(false);
                    manualFlightModeRef.current = false;

                    const startPos = ship.position.clone();
                    const endPos = getRandomEndPosNearPlanets();
                    if (endPos.distanceTo(startPos) < 300) {
                      endPos.add(new THREE.Vector3(-350, 120, 280));
                    }

                    const cameraDir = new THREE.Vector3();
                    sceneRef.current.camera?.getWorldDirection(cameraDir);
                    const cameraUp = new THREE.Vector3(0, 1, 0);
                    const cameraRight = new THREE.Vector3()
                      .crossVectors(cameraDir, cameraUp)
                      .normalize();

                    const controlPos = startPos
                      .clone()
                      .lerp(endPos, 0.45)
                      .add(
                        cameraRight.multiplyScalar((Math.random() - 0.5) * 200),
                      )
                      .add(
                        cameraUp.multiplyScalar((Math.random() - 0.5) * 160),
                      );
                    const controlPos2 = startPos
                      .clone()
                      .lerp(endPos, 0.75)
                      .add(
                        cameraRight.multiplyScalar((Math.random() - 0.5) * 180),
                      )
                      .add(
                        cameraUp.multiplyScalar((Math.random() - 0.5) * 140),
                      );

                    const distance = startPos.distanceTo(endPos);
                    const duration = THREE.MathUtils.clamp(
                      4500 * (distance / CINE_DURATION_DIVISOR),
                      3500,
                      10000,
                    );

                    shipCinematicRef.current = {
                      active: true,
                      phase: "approach",
                      startTime: performance.now(),
                      duration,
                      startPos: startPos.clone(),
                      controlPos,
                      controlPos2,
                      endPos: endPos.clone(),
                      startQuat: ship.quaternion.clone(),
                      endQuat: ship.quaternion.clone(),
                    };
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(100, 149, 237, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
                  }}
                >
                  Random Curved
                </button>
                <button
                  onClick={() => {
                    startIntroSequenceRef.current?.();
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(232, 197, 71, 0.6)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#e8c547",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
                  }}
                >
                  Home
                </button>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(232, 197, 71, 0.4)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#e8c547",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={debugSnapToShip}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setDebugSnapToShip(next);
                      debugSnapToShipRef.current = next;
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  Snap
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(100, 149, 237, 0.5)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={debugShipLabelMode}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setDebugShipLabelMode(next);
                      debugShipLabelModeRef.current = next;
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  Label Ship
                </label>
                <select
                  value={debugShipLabel}
                  onChange={(event) =>
                    setDebugShipLabel(event.target.value as ShipLabelTarget)
                  }
                  style={{
                    padding: "6px 8px",
                    borderRadius: 10,
                    border: "1px solid rgba(100, 149, 237, 0.5)",
                    background: "rgba(15,20,25,0.7)",
                    color: "#9ec2ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  <option value="front">
                    Front{debugShipLabels.front ? " ✓" : ""}
                  </option>
                  <option value="rear">
                    Rear{debugShipLabels.rear ? " ✓" : ""}
                  </option>
                  <option value="left">
                    Left{debugShipLabels.left ? " ✓" : ""}
                  </option>
                  <option value="right">
                    Right{debugShipLabels.right ? " ✓" : ""}
                  </option>
                  <option value="top">
                    Top{debugShipLabels.top ? " ✓" : ""}
                  </option>
                  <option value="bottom">
                    Bottom{debugShipLabels.bottom ? " ✓" : ""}
                  </option>
                  <option value="cockpit">
                    Cockpit{debugShipLabels.cockpit ? " ✓" : ""}
                  </option>
                </select>
                <button
                  onClick={() => resetShipLabels()}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255, 120, 120, 0.6)",
                    background: "rgba(30,10,10,0.7)",
                    color: "#ff8c8c",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    cursor: "pointer",
                  }}
                >
                  Reset Labels
                </button>
              </div>
            }
            consoleLogs={consoleLogs}
            consoleVisible={consoleVisible}
            onConsoleToggle={() => setConsoleVisible(!consoleVisible)}
            onConsoleCopy={() => {
              navigator.clipboard.writeText(consoleLogs.join("\n"));
            }}
            onConsoleClear={() => {
              setConsoleLogs([]);
              consoleLogsRef.current = [];
            }}
            missionControlLogs={missionControlLogs}
            onMissionControlLog={missionLog}
            onMissionControlClear={() => {
              setMissionControlLogs([]);
              missionControlLogsRef.current = [];
            }}
            onMissionControlCopy={() => {
              navigator.clipboard.writeText(missionControlLogs.join("\n"));
            }}
            systemStatusLogs={systemStatusLogs}
            onSystemStatusCopy={() => {
              navigator.clipboard.writeText(systemStatusLogs.join("\n"));
            }}
            onSystemStatusClear={() => {
              setSystemStatusLogs([]);
            }}
            tourActive={tourActive}
            tourWaypoint={tourWaypoint}
            tourProgress={tourProgress}
            onTourPrevious={() => tourGuideRef.current?.previousWaypoint()}
            onTourNext={() => tourGuideRef.current?.nextWaypoint()}
            onTourRestart={() => tourGuideRef.current?.restartTour()}
            onTourEnd={() => {
              tourGuideRef.current?.stopTour();
              setTourActive(false);
              setOverlayContent(null);
              setContentLoading(false);
              vlog("🛑 Tour ended");
            }}
            shipExteriorLights={shipExteriorLights}
            onShipExteriorLightsChange={setShipExteriorLights}
            shipInteriorLights={shipInteriorLights}
            onShipInteriorLightsChange={setShipInteriorLights}
            manualFlightMode={manualFlightMode}
            onManualFlightModeChange={(value) => {
              vlog(
                `🕹️ Flight mode changed to: ${value ? "MANUAL" : "AUTOPILOT"}`,
              );
              setManualFlightMode(value);
              manualFlightModeRef.current = value;

              // Reset manual flight state when switching modes
              if (value) {
                // Entering manual mode - reset physics
                vlog(`   Resetting flight physics for manual mode`);
                manualFlightRef.current.velocity.set(0, 0, 0);
                manualFlightRef.current.acceleration = 0;
                manualFlightRef.current.currentSpeed = 0;
                manualFlightRef.current.pitch = 0;
                manualFlightRef.current.yaw = 0;
                manualFlightRef.current.roll = 0;
                manualFlightRef.current.targetPitch = 0;
                manualFlightRef.current.targetYaw = 0;
                manualFlightRef.current.targetRoll = 0;
                manualFlightRef.current.isAccelerating = false;
                vlog("✋ Manual flight mode activated - Take control!");
              } else {
                // Returning to autopilot
                vlog(
                  "🤖 Autopilot engaged - Ship will resume autonomous flight",
                );
              }
            }}
            manualFlightSpeed={manualFlightRef.current.currentSpeed}
            manualFlightMaxSpeed={manualFlightRef.current.maxSpeed}
            keyboardState={keyboardStateRef.current}
            keyboardUpdateTrigger={keyboardUpdateTrigger}
            invertControls={invertControls}
            onInvertControlsChange={(value) => {
              setInvertControls(value);
              invertControlsRef.current = value;
            }}
            controlSensitivity={controlSensitivity}
            onControlSensitivityChange={(value) => {
              setControlSensitivity(value);
              controlSensitivityRef.current = value;
            }}
            onStopFollowing={() => {
              setFollowingSpaceship(false);
              followingSpaceshipRef.current = false;
              setInsideShip(false);
              insideShipRef.current = false;
              setShipViewMode("exterior");
              shipViewModeRef.current = "exterior";
              if (sceneRef.current.controls) {
                const cc = sceneRef.current.controls;
                cc.enabled = true;
                cc.minPolarAngle = 0;
                cc.maxPolarAngle = Math.PI;
                cc.minDistance = 0.01;
                cc.maxDistance = CONTROLS_MAX_DIST;
              }
              // Restore near clipping plane
              if (sceneRef.current.camera instanceof THREE.PerspectiveCamera) {
                sceneRef.current.camera.near = NEAR_DEFAULT;
                sceneRef.current.camera.updateProjectionMatrix();
              }
              vlog("🛑 Stopped following spaceship");
            }}
            navigationTargets={navigationTargets}
            onNavigate={handleQuickNav}
            currentTarget={navCurrentTargetResolved}
            navigationDistance={navigationDistance}
            navigationETA={navigationETA}
            isTransitioning={false}
            speed={0}
            content={null}
            contentLoading={false}
            cosmosOptions={options}
            onCosmosOptionsChange={(newOptions) => {
              // Pass the options change up to the parent component
              if (onOptionsChange) {
                onOptionsChange(newOptions);
              }
            }}
            onConsoleLog={(message) => {
              vlog(message);
            }}
            onContentAction={(action: string) => {
              vlog(`🎬 Content action received: ${action}`);

              // Handle different actions
              if (action.startsWith("tour:")) {
                const tourType = action.replace("tour:", "");
                vlog(`🔍 Tour type: ${tourType}`);
                vlog(`📦 tourBuilderRef exists: ${!!tourBuilderRef.current}`);
                vlog(`📦 tourGuideRef exists: ${!!tourGuideRef.current}`);

                if (tourBuilderRef.current && tourGuideRef.current) {
                  vlog(`🚀 Starting ${tourType} tour...`);
                  let tour;
                  switch (tourType) {
                    case "career-journey":
                      tour = tourBuilderRef.current.createCareerJourneyTour();
                      vlog(
                        `📋 Tour created with ${tour?.waypoints.length || 0} waypoints`,
                      );
                      break;
                    case "technical-deep-dive":
                      tour =
                        tourBuilderRef.current.createTechnicalDeepDiveTour();
                      break;
                    case "leadership-story":
                      tour = tourBuilderRef.current.createLeadershipStoryTour();
                      break;
                  }

                  if (tour) {
                    vlog(`✅ Tour object valid, starting...`);
                    // Resolve experience-moon targets to live world positions
                    const resolvedWaypoints = tour.waypoints.map((wp) => {
                      try {
                        if (wp.id && wp.id.startsWith("experience-moon-")) {
                          const candidate =
                            (wp.content && (wp.content as any).title) ||
                            wp.name;
                          let moonMesh: THREE.Mesh | undefined;
                          sceneRef.current.scene?.traverse((object) => {
                            if (
                              object instanceof THREE.Mesh &&
                              object.userData.planetName
                            ) {
                              const pname = (
                                object.userData.planetName || ""
                              ).toLowerCase();
                              if (
                                candidate &&
                                pname.includes(
                                  (candidate || "").toLowerCase().split(" ")[0],
                                )
                              ) {
                                moonMesh = object as THREE.Mesh;
                              }
                            }
                          });
                          if (moonMesh) {
                            const worldPos = new THREE.Vector3();
                            moonMesh.getWorldPosition(worldPos);
                            const offset = new THREE.Vector3(80, 40, 60);
                            return {
                              ...wp,
                              target: {
                                ...wp.target,
                                lookAt: worldPos.clone(),
                                position: worldPos.clone().add(offset),
                              },
                            } as typeof wp;
                          }
                        }
                      } catch (e) {
                        vlog("⚠️ Error resolving waypoint to mesh");
                      }
                      return wp;
                    });

                    setTourActive(true);
                    setOverlayContent(null);
                    setContentLoading(false);
                    tourGuideRef.current.startTour(resolvedWaypoints);
                    vlog(
                      `✨ Tour started: ${tour.title} (${tour.waypoints.length} waypoints)`,
                    );
                  } else {
                    vlog(`❌ Tour object is null or undefined`);
                  }
                } else {
                  vlog(`❌ Tour refs not initialized`);
                }
              } else if (action.startsWith("navigate:")) {
                const target = action.replace("navigate:", "");
                if (cameraDirectorRef.current) {
                  // If navigating away from a focused moon, restore it first
                  if (focusedMoonRef.current) {
                    exitFocusRequestRef.current = true;
                  }
                  switch (target) {
                    case "sun":
                    case "home":
                      setOverlayContent(null);
                      setContentLoading(false);
                      if (originalMinDistanceRef.current > 0) {
                        setMinDistance(
                          originalMinDistanceRef.current,
                          "restore on navigate home",
                        );
                      }
                      if (startIntroSequenceRef.current) {
                        startIntroSequenceRef.current();
                      } else {
                        cameraDirectorRef.current.systemOverview();
                      }
                      break;
                    case "experience":
                      const expData = planetsDataRef.current.get("experience");
                      if (expData) {
                        cameraDirectorRef.current.flyTo({
                          position: new THREE.Vector3(
                            expData.position.x + 300,
                            expData.position.y + 150,
                            expData.position.z + 200,
                          ),
                          lookAt: expData.position,
                          duration: 2,
                        });
                      }
                      break;
                    case "skills":
                      const skillsData = planetsDataRef.current.get("skills");
                      if (skillsData) {
                        cameraDirectorRef.current.flyTo({
                          position: new THREE.Vector3(
                            skillsData.position.x + 350,
                            skillsData.position.y + 150,
                            skillsData.position.z + 250,
                          ),
                          lookAt: skillsData.position,
                          duration: 2,
                        });
                      }
                      break;
                    case "portfolio":
                      const portfolioData =
                        planetsDataRef.current.get("portfolio");
                      if (portfolioData) {
                        cameraDirectorRef.current.flyTo({
                          position: new THREE.Vector3(
                            portfolioData.position.x + 420,
                            portfolioData.position.y + 210,
                            portfolioData.position.z + 530,
                          ),
                          lookAt: portfolioData.position,
                          duration: 2,
                        });
                      }
                      break;
                  }
                }
              } else if (action === "mode:free") {
                tourGuideRef.current?.stopTour();
              }
            }}
          />
        </div>
      </div>
      {overlayContent && moonHtmlVisible && (
        <div ref={moonHtmlLayoutRef}>
          <MoonOrbitHtmlLayout
            content={overlayContent}
            visible={moonHtmlVisible}
            closing={moonHtmlClosing}
            onClose={() => {
              if (moonHtmlCloseTimerRef.current !== null) return;
              setMoonHtmlClosing(true);
              // Bring the already-drawn drone card back as the details fade,
              // so it's there when they're gone; memories keep playing.
              hologramDroneRef.current?.setContentSuppressed(false);
              moonHtmlCloseTimerRef.current = window.setTimeout(() => {
                moonHtmlCloseTimerRef.current = null;
                setMoonHtmlClosing(false);
                setMoonHtmlVisible(false);
              }, MOON_HTML_CLOSE_MS);
            }}
          />
        </div>
      )}
      {aboutExitConfirmIntent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            background: "rgba(1, 7, 16, 0.62)",
            backdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(520px, 94vw)",
              borderRadius: 14,
              border: "1px solid rgba(126, 224, 255, 0.55)",
              background:
                "linear-gradient(180deg, rgba(5, 19, 37, 0.96), rgba(4, 11, 24, 0.94))",
              boxShadow: "0 20px 42px rgba(0, 0, 0, 0.45)",
              padding: "16px 16px 14px",
              color: "#d9f5ff",
              fontFamily: "'IBM Plex Mono', 'Fira Code', Consolas, monospace",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              Exit About Journey?
            </div>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.45,
                color: "#a8d9e8",
                marginBottom: 14,
              }}
            >
              This will disengage the current About flow, shatter active path
              crystals, and route to your selected destination.
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => cancelAboutExitIntent()}
                style={{
                  borderRadius: 8,
                  border: "1px solid rgba(127, 203, 225, 0.45)",
                  background: "rgba(9, 29, 48, 0.88)",
                  color: "#cfeaf4",
                  fontSize: 12,
                  padding: "7px 10px",
                  cursor: "pointer",
                }}
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => confirmAboutExitIntent()}
                style={{
                  borderRadius: 8,
                  border: "1px solid rgba(255, 178, 132, 0.7)",
                  background:
                    "linear-gradient(180deg, rgba(157, 82, 45, 0.95), rgba(103, 49, 26, 0.9))",
                  color: "#fff1e8",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "7px 10px",
                  cursor: "pointer",
                }}
              >
                Exit And Navigate
              </button>
            </div>
          </div>
        </div>
      )}
      {aboutSkipCinematicPromptVisible && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: "max(90px, calc(env(safe-area-inset-bottom) + 90px))",
            transform: "translateX(-50%)",
            zIndex: 1350,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(132, 220, 255, 0.5)",
              background:
                "linear-gradient(180deg, rgba(6, 20, 38, 0.86), rgba(4, 11, 24, 0.84))",
              boxShadow: "0 10px 28px rgba(0, 0, 0, 0.34)",
              backdropFilter: "blur(4px)",
              color: "#dcf7ff",
              fontFamily: "'IBM Plex Mono', 'Fira Code', Consolas, monospace",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontWeight: 700, letterSpacing: 0.2 }}>
              Skip particle path formation cinematic?
            </div>
            <button
              type="button"
              onClick={() => chooseAboutSkipCinematic(true)}
              style={{
                borderRadius: 7,
                border: "1px solid rgba(162, 255, 182, 0.78)",
                background:
                  "linear-gradient(180deg, rgba(50, 130, 80, 0.9), rgba(24, 80, 54, 0.84))",
                color: "#e7fff0",
                fontSize: 11,
                fontWeight: 700,
                padding: "5px 9px",
                cursor: "pointer",
              }}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => chooseAboutSkipCinematic(false)}
              style={{
                borderRadius: 7,
                border: "1px solid rgba(132, 208, 255, 0.62)",
                background: "rgba(9, 30, 52, 0.82)",
                color: "#daf4ff",
                fontSize: 11,
                fontWeight: 700,
                padding: "5px 9px",
                cursor: "pointer",
              }}
            >
              No
            </button>
          </div>
        </div>
      )}
      {aboutRideMessageView && (
        <div
          ref={aboutRideMessageOverlayRef}
          style={{
            position: "fixed",
            left: "50%",
            top: "34%",
            transform: "translate(-50%, -50%)",
            zIndex: 1340,
            pointerEvents: "none",
            opacity: 0,
            transition: "opacity 220ms ease-out",
            maxWidth: "min(72vw, 900px)",
            textAlign: "center",
            lineHeight: 1.14,
            letterSpacing: "0.15px",
            whiteSpace: "pre-line",
            color:
              aboutRideMessageView.fontColor ?? "rgba(242, 251, 255, 0.99)",
            textShadow:
              aboutRideMessageView.fontShadow ??
              "0px 0px 24px rgba(96, 203, 255, 0.58)",
            fontFamily:
              aboutRideMessageView.fontFamily &&
              aboutRideMessageView.fontFamily.length > 0
                ? aboutRideMessageView.fontFamily.join(", ")
                : "Oswald, Montserrat, Arial, sans-serif",
            fontSize: (() => {
              const declaredSizePx = Number.parseFloat(
                aboutRideMessageView.fontSize ?? "50",
              );
              return Number.isFinite(declaredSizePx)
                ? `${Math.round(declaredSizePx * 1.12)}px`
                : "56px";
            })(),
            fontWeight: 500,
          }}
        >
          {normalizeRideMessageText(aboutRideMessageView.textContent)}
        </div>
      )}
      {ABOUT_TRAM_HUD_ENABLED && aboutTramHudVisible && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 22,
            transform: "translateX(-50%)",
            zIndex: 1300,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 14,
              border: "1px solid rgba(107, 228, 255, 0.48)",
              background:
                "linear-gradient(180deg, rgba(7, 20, 38, 0.88), rgba(4, 11, 24, 0.86))",
              boxShadow: "0 8px 26px rgba(0, 0, 0, 0.35)",
              backdropFilter: "blur(6px)",
              fontFamily: "'IBM Plex Mono', 'Fira Code', Consolas, monospace",
            }}
          >
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setAboutTramPointerHold(1, true);
              }}
              onPointerUp={() => setAboutTramPointerHold(1, false)}
              onPointerLeave={() => setAboutTramPointerHold(1, false)}
              onPointerCancel={() => setAboutTramPointerHold(1, false)}
              style={{
                pointerEvents: "auto",
                minWidth: 32,
                height: 26,
                borderRadius: 7,
                border: aboutTramUpHeld
                  ? "1px solid rgba(162, 255, 182, 0.92)"
                  : "1px solid rgba(128, 219, 247, 0.55)",
                background: aboutTramUpHeld
                  ? "linear-gradient(180deg, rgba(56, 132, 82, 0.9), rgba(22, 80, 56, 0.85))"
                  : "linear-gradient(180deg, rgba(11, 35, 59, 0.86), rgba(8, 24, 45, 0.82))",
                color: "#e7f9ff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
              aria-label="Hold Arrow Up to move forward"
              title="Hold Arrow Up to move forward"
            >
              ↑
            </button>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setAboutTramPointerHold(-1, true);
              }}
              onPointerUp={() => setAboutTramPointerHold(-1, false)}
              onPointerLeave={() => setAboutTramPointerHold(-1, false)}
              onPointerCancel={() => setAboutTramPointerHold(-1, false)}
              style={{
                pointerEvents: "auto",
                minWidth: 32,
                height: 26,
                borderRadius: 7,
                border: aboutTramDownHeld
                  ? "1px solid rgba(255, 184, 149, 0.94)"
                  : "1px solid rgba(128, 219, 247, 0.55)",
                background: aboutTramDownHeld
                  ? "linear-gradient(180deg, rgba(154, 82, 47, 0.9), rgba(90, 46, 26, 0.85))"
                  : "linear-gradient(180deg, rgba(11, 35, 59, 0.86), rgba(8, 24, 45, 0.82))",
                color: "#e7f9ff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
              aria-label="Hold Arrow Down to reverse"
              title="Hold Arrow Down to reverse"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => toggleAboutTramCameraReverse()}
              disabled={aboutTramCameraMode !== "forward"}
              style={{
                pointerEvents: "auto",
                height: 26,
                borderRadius: 7,
                border: aboutTramCameraReversed
                  ? "1px solid rgba(255, 212, 144, 0.95)"
                  : "1px solid rgba(128, 219, 247, 0.55)",
                background: aboutTramCameraReversed
                  ? "linear-gradient(180deg, rgba(140, 97, 32, 0.9), rgba(84, 56, 18, 0.85))"
                  : "linear-gradient(180deg, rgba(11, 35, 59, 0.86), rgba(8, 24, 45, 0.82))",
                color: "#e7f9ff",
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: 0.1,
                padding: "0 8px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                opacity: aboutTramCameraMode === "forward" ? 1 : 0.5,
              }}
              aria-label="Toggle reverse camera orientation"
              title="Toggle reverse camera orientation"
            >
              {aboutTramCameraReversed ? "Camera: Reverse" : "Camera: Forward"}
            </button>
            <div
              style={{
                pointerEvents: "auto",
                display: "grid",
                gap: 2,
                padding: "2px 6px",
                borderRadius: 7,
                border: "1px solid rgba(128, 219, 247, 0.45)",
                background: "rgba(8, 24, 45, 0.55)",
                color: "#d9f5ff",
                fontSize: 10,
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="about-tram-camera-mode"
                  checked={aboutTramCameraMode === "forward"}
                  onChange={() => setAboutTramCameraModeWithSync("forward")}
                />
                Forward camera
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="about-tram-camera-mode"
                  checked={aboutTramCameraMode === "free"}
                  onChange={() => setAboutTramCameraModeWithSync("free")}
                />
                Free camera
              </label>
            </div>
            <div
              style={{
                minWidth: 194,
                display: "grid",
                gap: 3,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: "#a7dce9",
                  fontSize: 10,
                  letterSpacing: 0.25,
                }}
              >
                <span>Momentum</span>
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: 0.2,
                    color: aboutTramCruiseEnabled ? "#effbff" : "#84b5c4",
                    fontWeight: aboutTramCruiseEnabled ? 700 : 500,
                  }}
                >
                  Cruise
                </span>
              </div>
              <div
                style={{
                  position: "relative",
                  height: 10,
                  borderRadius: 999,
                  border: "1px solid rgba(128, 219, 247, 0.45)",
                  background: "rgba(5, 16, 31, 0.9)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${Math.round(aboutTramCruiseThresholdNorm * 100)}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    transform: "translateX(-1px)",
                    background: aboutTramCruiseEnabled
                      ? "rgba(255, 255, 255, 0.98)"
                      : "rgba(255, 255, 255, 0.85)",
                    boxShadow: aboutTramCruiseEnabled
                      ? "0 0 10px rgba(255, 255, 255, 0.65)"
                      : "none",
                    zIndex: 2,
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    height: "100%",
                    width: `${Math.round(aboutTramMomentumNorm * 100)}%`,
                    borderRadius: 999,
                    background:
                      "linear-gradient(90deg, rgba(84, 224, 133, 0.95) 0%, rgba(244, 227, 78, 0.95) 56%, rgba(255, 110, 74, 0.95) 100%)",
                    transition: "width 100ms linear",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                color: "#a7dce9",
                fontSize: 10,
                letterSpacing: 0.15,
                maxWidth: 190,
              }}
            >
              Tap nudges. Cruise engaged after white mark
            </div>
          </div>
        </div>
      )}
      <AboutJourneyDebugPanel
        enabled={IS_DEBUG_OVERLAYS}
        debugEnabled={IS_DEBUG_OVERLAYS}
        journeyRef={aboutJourneyRef}
        swarmRef={aboutParticleSwarmRef}
      />
      <DebugZoneOverlay enabled={IS_DEBUG_OVERLAYS} />
    </>
  );
}
