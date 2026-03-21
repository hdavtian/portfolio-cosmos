import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import resumeData from "../../data/resume.json";
import legacyWebsites from "../../data/legacyWebsites.json";
import portfolioCores from "../../data/portfolioCores.json";
import aboutDeck from "../../data/aboutDeck.json";
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
  createSunMesh,
  createSunGlowTexture,
} from "./ResumeSpace3D.factories";
import { type OrbitAnchor, type OrbitItem } from "./ResumeSpace3D.orbital";
import {
  freezeSystemForMoon,
  type FrozenSystemState,
} from "./ResumeSpace3D.systemFreeze";
import type { ResumeSpace3DProps, SceneRef } from "./ResumeSpace3D.types";
// Import our new cosmic systems
import {
  CosmosCameraDirector,
  COSMIC_AUDIO_TRACKS,
  CosmicTourGuide,
  NavigationInterface,
  type NavigationWaypoint,
} from "../CosmicNavigation";
import type { OverlayContent } from "../CosmicContentOverlay";
import {
  TourDefinitionBuilder,
  type PlanetData,
} from "../TourDefinitionBuilder";
import SpaceshipHUD from "../ui/SpaceshipHUD";
import ShipControlBar, { type ShipUIPhase } from "../ui/ShipControlBar";
import CockpitNavPanel from "../ui/CockpitNavPanel";
import ShipTerminal, { type ShipTerminalToolAction } from "../ui/ShipTerminal";
import UserOnScreenMessages from "../ui/UserOnScreenMessages";
import CosmicMiniMap3D from "../ui/CosmicMiniMap3D";
import {
  clearOnScreenTelemetry,
  onScreenMessage,
  setOnScreenTelemetry,
} from "../ui/onScreenMessaging";
import {
  HologramDroneDisplay,
  type DroneAudioBuffers,
  type DroneVisualVariant,
} from "./HologramDroneDisplay";
// CockpitHologramPanels kept for potential future use
import { getOrbitalPositionEmitter } from "../OrbitalPositionEmitter";
import { StarDestroyerCruiser } from "../StarDestroyerCruiser";
import { useCosmosLogs } from "./hooks/useCosmosLogs";
import { useCosmosOptions } from "./hooks/useCosmosOptions";
import { useKeyboardControls } from "./hooks/useKeyboardControls";
import { usePointerInteractions } from "./hooks/usePointerInteractions";
import { useThreeScene } from "./hooks/useThreeScene";
import { useOrbitSystem } from "./hooks/useOrbitSystem";
import { createMoonFocusController } from "./ResumeSpace3D.focusController";
import { useMoonOrbit, type OrbitPhase } from "./hooks/useMoonOrbit";
import { useNavigationSystem } from "./hooks/useNavigationSystem";
import { useRenderLoop } from "./hooks/useRenderLoop";
import { createIntroSequenceRunner } from "./introSequence";
import {
  attachAudioListenerToCamera,
  createPositionalAudio,
  playPositionalOneShot,
} from "./audio/threeAudioUtils";
import {
  SUN_GLOW_SPRITE_SIZE,
  SUN_LABEL_Y,
  EXPERIENCE_ORBIT,
  EXPERIENCE_RADIUS,
  EXP_MOON_ORBIT_BASE,
  EXP_MOON_ORBIT_STEP,
  EXP_MOON_RADIUS,
  FALCON_SCALE,
  FALCON_INITIAL_POS,
  SD_SCALE,
  SD_INITIAL_POS,
  SD_CONE_LENGTH,
  SD_CONE_RADIUS,
  NEAR_DEFAULT,
  NEAR_OVERVIEW,
  CONTROLS_MAX_DIST,
  CAMERA_FAR,
  FOLLOW_DISTANCE,
  FOLLOW_HEIGHT,
  EXP_WANDER_RADIUS,
  SKILLS_WANDER_RADIUS,
  PROJ_WANDER_RADIUS,
  SUN_WANDER_RADIUS,
  SKYFIELD_RADIUS,
  EXP_FOCUS_DIST,
  SKILLS_FOCUS_DIST,
  CINE_DURATION_DIVISOR,
  orbitDebug,
} from "./scaleConfig";
import {
  buildPortfolioCoreViews,
  type PortfolioCoreView,
  type PortfolioGroupView,
} from "./portfolioData";

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

const PROJECT_SHOWCASE_NAV_ID = "project-showcase";
const PROJECT_SHOWCASE_LAYER = 2;
const ORBITAL_PORTFOLIO_NAV_ID = "orbital-portfolio";
const ORBITAL_PORTFOLIO_LAYER = 4;
const ORBITAL_PORTFOLIO_DEBUG_LOGS = true;
const ORBITAL_PORTFOLIO_NONFOCUS_PLATE_OPACITY = 0.74;
const ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS = 5;
const ORBITAL_PORTFOLIO_CARD_MAX_THUMBS = 6;
const ORBITAL_PORTFOLIO_STATION_ORBIT_SPEED = 0.16;
const ORBITAL_PORTFOLIO_INSPECT_DEFAULT_DISTANCE = 148;
const ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE = 70;
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
const MOON_ORBIT_SIGN_DEBUG_LOGS = false;
// Card layer stays on the overlay pass to avoid bloom/tonemapping washout.
const PROJECT_SHOWCASE_CARD_LAYER = 1;
const SKILLS_LATTICE_LAYER = 3;
const PROJECT_SHOWCASE_MIN_ANGLE_PERCENT = 0;
const PROJECT_SHOWCASE_MAX_ANGLE_PERCENT = 100;
const PROJECT_SHOWCASE_DEFAULT_ANGLE_PERCENT = 25;
const PROJECT_SHOWCASE_SHOW_IMAGE_MANIPULATION_CONTROLS = false;
const PROJECT_SHOWCASE_NAV_STOP_BACK_OFFSET = 15;
const PROJECT_SHOWCASE_USE_NEBULA_REALM = false;
const PROJECT_SHOWCASE_MODEL_PATH = "/models/projects-scene/spaceship_corridor.glb";
const PROJECT_SHOWCASE_TEXTURE_BASE_PATH = "/models/projects-scene/textures";
const OBLIVION_DRONE_MODEL_PATH = "/models/oblivion-drone/oblivion_drone.glb";
const OBLIVION_DRONE_AUDIO_PATHS = {
  activation: "/models/oblivion-drone/199938__drzhnn__01-activation.wav",
  transmission: "/models/oblivion-drone/199939__drzhnn__08-data-transmission.wav",
  movement: [
    "/models/oblivion-drone/199941__drzhnn__06-blip.wav",
    "/models/oblivion-drone/199942__drzhnn__05-klaxon.wav",
    "/models/oblivion-drone/199940__drzhnn__07-confirmation.wav",
    "/models/oblivion-drone/199935__drzhnn__04-blip.wav",
  ],
} as const;
const FALCON_MOON_TRAVEL_SFX_PATH =
  "/audio/falcon/falcon-moon-travel.mp4";
const FALCON_MOON_TRAVEL_DEFAULT_VOLUME = 0.68;
const FALCON_MOON_TRAVEL_FADE_OUT_MS = 520;
const PROJECT_SHOWCASE_NEBULA_JPG_PATH =
  "/models/alternate-universe/starmap_16k.jpg";
const PROJECT_SHOWCASE_NEAR_ANCHOR_DIST = 420;
const ORBITAL_PORTFOLIO_WORLD_ANCHOR = new THREE.Vector3(1324, 180, 16869);
const ORBITAL_PORTFOLIO_NEAR_ANCHOR_DIST = 900;
const ENABLE_POST_LOAD_COSMOS_MICRO_INTRO = false;
const CAMERA_TRACE_ENABLED = true;
const SKILLS_LATTICE_NAV_ID = "skills-lattice";
// Recenter deep-space destinations so the universe extent remains sun-centered.
const SKILLS_LATTICE_WORLD_ANCHOR = new THREE.Vector3(13600, 220, -12000);
const ABOUT_MEMORY_SQUARE_WORLD_ANCHOR = new THREE.Vector3(-12000, 520, -13200);
const ABOUT_MEMORY_SQUARE_NAV_STANDOFF_DIST = 4200;
const ABOUT_MEMORY_SQUARE_ENTRY_TRIGGER_DIST = 4550;
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
const SKILLS_LATTICE_NAV_STANDOFF_DIST = 1200;
const SKILLS_LATTICE_ENTRY_TRIGGER_DIST = 1800;
const SKILLS_SD_PATROL_RADIUS = 150;
const SKILLS_SD_PATROL_SPEED = 0.03;
const PROJECT_SHOWCASE_FILTER_OPTIONS = [
  "Angular",
  "C#",
  "Java",
  "JavaScript",
  "TypeScript",
  "React",
  "Node",
] as const;
const PROJECT_SHOWCASE_MAX_MEDIA_ITEMS = 12;
const PROJECT_SHOWCASE_THUMBS_PER_PAGE = 4;
const DEFAULT_BACKGROUND_MUSIC_TRACK = Object.keys(COSMIC_AUDIO_TRACKS)[0] ?? "";
const EXPERIENCE_MOON_TEXTURE_BY_JOB_ID: Record<string, string> = {
  investcloud: "/textures/custom-planet-textures/investcloud.jpg",
  rpa: "/textures/custom-planet-textures/texture4-rpa.jpg",
  boingo: "/textures/custom-planet-textures/boingo.jpg",
  "capital-group": "/textures/custom-planet-textures/capitalgroup.jpg",
  murad: "/textures/custom-planet-textures/murad.jpg",
  unitedlayer: "/textures/custom-planet-textures/unitedlayer.jpg",
  stormscape: "/textures/custom-planet-textures/stormscape.jpg",
};

type ShowcaseMediaEntry = {
  id: string;
  type?: "image" | "video" | "youtube";
  image?: string;
  videoUrl?: string;
  thumbnail?: string;
  youtubeUrl?: string;
  title?: string;
  description?: string;
  fit?: "contain" | "cover";
};

type ShowcaseEntry = {
  id: string;
  title: string;
  image: string;
  description?: string;
  technologies?: string[];
  year?: number | null;
  fit?: "contain" | "cover";
  galleryMedia?: ShowcaseMediaEntry[];
  clientVariants?: ShowcaseClientVariant[];
};

type ShowcaseClientVariant = {
  id: string;
  title: string;
  image?: string;
  description?: string;
  technologies?: string[];
  year?: number | null;
  fit?: "contain" | "cover";
  galleryMedia?: ShowcaseMediaEntry[];
};

type ShowcaseResolvedMediaItem = {
  id: string;
  type: "image" | "video" | "youtube";
  title: string;
  description?: string;
  fit: "contain" | "cover";
  textureUrl: string;
  videoUrl?: string;
  youtubeUrl?: string;
  youtubeEmbedUrl?: string;
  variantIndex?: number;
  variantTitle?: string;
  variantDescription?: string;
  variantTechnologies?: string[];
  variantYear?: number | null;
};

type ShowcaseThumbnailHitTarget = {
  mesh: THREE.Mesh;
  type: "media" | "prev" | "next" | "variant";
  mediaIndex?: number;
  variantIndex?: number;
};

type ShowcasePanelRecord = {
  group: THREE.Group;
  runPos: number;
  entry: ShowcaseEntry;
  fitMode: "contain" | "cover";
  inwardRotationY: number;
  frontFacingRotationY: number;
  cantSign: -1 | 1;
  focusBlend: number;
  frameMat: THREE.MeshBasicMaterial;
  imageMesh: THREE.Mesh;
  imageMat: THREE.MeshBasicMaterial;
  texture: THREE.Texture | null;
  baseRepeat: THREE.Vector2;
  baseOffset: THREE.Vector2;
  zoom: number;
  panX: number;
  panY: number;
  clientVariants: ShowcaseClientVariant[];
  activeVariantIndex: number;
  setActiveVariant: (variantIndex: number) => void;
  mediaItems: ShowcaseResolvedMediaItem[];
  activeMediaIndex: number;
  setActiveMedia: (mediaIndex: number) => void;
  mediaFadeStartMs: number;
  mediaFadeDurationMs: number;
  setThumbnailPageStart: (pageStart: number) => void;
  triggerThumbnailNavPress: (direction: "prev" | "next") => void;
  thumbnailPageStart: number;
  thumbnailHitTargets: ShowcaseThumbnailHitTarget[];
  thumbnailFrameMats: THREE.MeshBasicMaterial[];
  thumbnailImageMats: Array<THREE.MeshBasicMaterial | undefined>;
  detailMat: THREE.MeshBasicMaterial;
  detailTexture: THREE.Texture | null;
  detailMesh: THREE.Mesh | null;
  detailScrollThumbMesh: THREE.Mesh | null;
  detailAllLines: string[];
  detailVisibleLines: number;
  detailScrollOffset: number;
  detailScrollMax: number;
  updateDetailTexture: () => void;
  techBadgeRoot: THREE.Group | null;
  techBadgeFx: Array<{
    mat: THREE.MeshBasicMaterial;
    baseOpacity: number;
    phase: number;
    baseColor: THREE.Color;
  }>;
};

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
  const image = texture.image as { width?: number; height?: number } | undefined;
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
  const image = texture.image as { width?: number; height?: number } | undefined;
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

const createMoonTravelSignTexture = (entry: JobMemoryEntry): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  const text = String(entry?.text ?? "");
  const type = entry?.type ?? "default";
  const normalized = String(text ?? "")
    .replace(/\s*•\s*/g, " • ")
    .replace(/\s+/g, " ")
    .trim();
  const splitForLines = () => {
    if (normalized.length <= 48) return [normalized];
    const parts = normalized.split(" • ").map((p) => p.trim()).filter(Boolean);
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
    const widest = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
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
  const startY = canvas.height * 0.5 - ((lines.length - 1) * lineGap) * 0.5;
  const widestLine = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
  if (style.drawBackdrop) {
    // For code-style memories, make the box hug text like fit-content with light padding.
    const padX = Math.max(24, fontSize * 0.34);
    const padY = Math.max(14, fontSize * 0.2);
    const textTop = startY - fontSize * 0.62;
    const textBottom = startY + (lines.length - 1) * lineGap + fontSize * 0.62;
    const w = Math.min(canvas.width - 24, widestLine + padX * 2);
    const h = Math.min(canvas.height - 24, textBottom - textTop + padY * 2);
    const left = THREE.MathUtils.clamp(x - w * 0.5, 12, canvas.width - w - 12);
    const top = THREE.MathUtils.clamp(textTop - padY, 12, canvas.height - h - 12);
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

const extractYouTubeVideoId = (input?: string): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
};

const toYouTubeEmbedUrl = (videoId: string) =>
  `https://www.youtube.com/embed/${videoId}`;

const toYouTubeThumbnailUrl = (videoId: string) =>
  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

const resolveShowcaseMediaItems = (
  entry: ShowcaseEntry,
  opts?: { variant?: ShowcaseClientVariant; variantIndex?: number },
): ShowcaseResolvedMediaItem[] => {
  const variant = opts?.variant;
  const variantIndex = opts?.variantIndex;
  const baseId = variant?.id || entry.id;
  const baseTitle = variant?.title || entry.title;
  const baseDescription = variant?.description || entry.description;
  const baseFit = variant?.fit ?? entry.fit;
  const baseImage = variant?.image || entry.image;
  const sourceGalleryMedia = variant?.galleryMedia ?? entry.galleryMedia ?? [];
  const primary: ShowcaseMediaEntry = {
    id: `${baseId}-main`,
    type: "image",
    image: baseImage,
    title: baseTitle,
    description: baseDescription,
    fit: baseFit,
  };
  const candidates = [primary, ...sourceGalleryMedia].slice(
    0,
    PROJECT_SHOWCASE_MAX_MEDIA_ITEMS,
  );
  const resolved: ShowcaseResolvedMediaItem[] = [];
  candidates.forEach((item, index) => {
    const itemType =
      item.type === "youtube" || item.youtubeUrl
        ? "youtube"
        : item.type === "video" || item.videoUrl
          ? "video"
          : "image";
    if (itemType === "youtube") {
      const videoId = extractYouTubeVideoId(item.youtubeUrl);
      if (!videoId) return;
      const textureUrl = item.thumbnail || toYouTubeThumbnailUrl(videoId);
      resolved.push({
        id: item.id || `${baseId}-youtube-${index}`,
        type: "youtube",
        title: item.title || "YouTube Video",
        description: item.description,
        fit: item.fit ?? "cover",
        textureUrl,
        youtubeUrl: item.youtubeUrl,
        youtubeEmbedUrl: toYouTubeEmbedUrl(videoId),
        variantIndex,
        variantTitle: variant?.title,
        variantDescription: variant?.description,
        variantTechnologies: variant?.technologies,
        variantYear: variant?.year,
      });
      return;
    }
    if (itemType === "video") {
      if (!item.videoUrl) return;
      resolved.push({
        id: item.id || `${baseId}-video-${index}`,
        type: "video",
        title: item.title || "Video",
        description: item.description,
        fit: item.fit ?? "cover",
        textureUrl: item.thumbnail || baseImage,
        videoUrl: item.videoUrl,
        variantIndex,
        variantTitle: variant?.title,
        variantDescription: variant?.description,
        variantTechnologies: variant?.technologies,
        variantYear: variant?.year,
      });
      return;
    }
    if (!item.image) return;
    resolved.push({
      id: item.id || `${baseId}-image-${index}`,
      type: "image",
      title: item.title || baseTitle,
      description: item.description || baseDescription,
      fit: item.fit ?? baseFit ?? "contain",
      textureUrl: item.image,
      variantIndex,
      variantTitle: variant?.title,
      variantDescription: variant?.description,
      variantTechnologies: variant?.technologies,
      variantYear: variant?.year,
    });
  });
  if (resolved.length === 0) {
    resolved.push({
      id: `${baseId}-fallback`,
      type: "image",
      title: baseTitle,
      description: baseDescription,
      fit: baseFit ?? "contain",
      textureUrl: baseImage,
      variantIndex,
      variantTitle: variant?.title,
      variantDescription: variant?.description,
      variantTechnologies: variant?.technologies,
      variantYear: variant?.year,
    });
  }
  return resolved;
};

const wrapTextLines = (input: string, maxCharsPerLine = 54): string[] => {
  const text = (input || "").trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = word;
  });
  if (line) lines.push(line);
  return lines;
};

type SkillsLatticeNodeRecord = {
  mesh: THREE.Mesh;
  baseScale: number;
  phase: number;
  label: string;
  nodeType: "category" | "skill";
  category: string;
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

type AboutSwarmPhase = "assembledHold" | "breakOut" | "swarm" | "reform" | "settle";

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
}: ResumeSpace3DProps) {
  const aboutDeckData = aboutDeck as AboutDeckData;
  const aboutSlides = aboutDeckData.aboutDeck.slides;
  // EXPORT SURFACE
  // Props: options, onOptionsChange
  // Emits: onOptionsChange (options sync)
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
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
    shipLog,
    shipLogs,
    shipLogsRef,
    setShipLogs,
    debugLog,
    debugLogs,
    debugLogsRef,
    setDebugLogs,
    debugLogTotal,
  } = useCosmosLogs();
  const [emitFalconLocationLogs, setEmitFalconLocationLogs] = useState(false);
  const [emitSDLocationLogs, setEmitSDLocationLogs] = useState(false);
  const emitFalconLocationLogsRef = useRef(false);
  const emitSDLocationLogsRef = useRef(false);
  useEffect(() => {
    emitFalconLocationLogsRef.current = emitFalconLocationLogs;
  }, [emitFalconLocationLogs]);
  useEffect(() => {
    emitSDLocationLogsRef.current = emitSDLocationLogs;
  }, [emitSDLocationLogs]);

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
  const [droneSoundEnabled, setDroneSoundEnabled] = useState(true);
  const [droneSoundVolume, setDroneSoundVolume] = useState(0.35);
  const [falconSoundEnabled, setFalconSoundEnabled] = useState(true);
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
  const [settingsTab, setSettingsTab] = useState<"sound">("sound");
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
        // During orbit, anchor the drone above the ship rather than beside the moon
        const ship = spaceshipRef.current;
        const anchor = (orbitPhase === "orbiting" && ship)
          ? ship.position.clone()
          : undefined;
        if (droneInspectMode) {
          debugLog("drone", `showInspectMode called — orbitPhase=${orbitPhase}, anchor=${anchor ? `[${anchor.x.toFixed(0)},${anchor.y.toFixed(0)},${anchor.z.toFixed(0)}]` : "none"}, moonPos=[${moonWorldPos.x.toFixed(0)},${moonWorldPos.y.toFixed(0)},${moonWorldPos.z.toFixed(0)}]`);
          drone.showInspectMode(moonWorldPos, cam, anchor);
        } else if (overlayContent) {
          debugLog("drone", `showContent called — orbitPhase=${orbitPhase}, anchor=${anchor ? `[${anchor.x.toFixed(0)},${anchor.y.toFixed(0)},${anchor.z.toFixed(0)}]` : "none"}, moonPos=[${moonWorldPos.x.toFixed(0)},${moonWorldPos.y.toFixed(0)},${moonWorldPos.z.toFixed(0)}]`);
          drone.showContent(overlayContent, moonWorldPos, cam, anchor);
        }
      } else {
        debugLog("drone", `useEffect: missing moon=${!!moon} cam=${!!cam}`);
      }
    } else {
      // On orbit exit / destination switch, remove drone + panels immediately
      // to avoid any visible trailing frame during departure.
      drone.hideContentImmediate();
      if (droneInspectMode) setDroneInspectMode(false);
    }
  }, [overlayContent, orbitPhase, droneSummonNonce, droneInspectMode]);

  const [shipMovementDebug, setShipMovementDebug] = useState(false);
  const [systemStatusLogs, setSystemStatusLogs] = useState<string[]>([]);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [loaderVisualComplete, setLoaderVisualComplete] = useState(false);
  const [criticalAssetsReady, setCriticalAssetsReady] = useState(false);
  const [spaceBackgroundVisible, setSpaceBackgroundVisible] = useState(true);
  const starfieldMeshRef = useRef<THREE.Mesh | null>(null);
  const skyfieldMeshRef = useRef<THREE.Mesh | null>(null);

  // Tour state
  const [tourActive, setTourActive] = useState(false);
  const [tourWaypoint, setTourWaypoint] = useState<string>("");
  const [tourProgress, setTourProgress] = useState({ current: 0, total: 0 });
  const [navTelemetryPulse, setNavTelemetryPulse] = useState(0);

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

  useEffect(() => {
    if (!sceneReady || !criticalAssetsReady) return;
    if (droneGpuWarmupDoneRef.current) return;
    const renderer = rendererRef.current;
    const template = oblivionDronePreloadedRef.current;
    const liveScene = sceneRef.current.scene as THREE.Scene | undefined;
    const liveCamera = sceneRef.current.camera as THREE.Camera | undefined;
    if (!renderer || !template || !liveScene || !liveCamera) return;
    droneGpuWarmupDoneRef.current = true;

    const compileRenderer = renderer as THREE.WebGLRenderer & {
      compileAsync?: (scene: THREE.Scene, camera: THREE.Camera) => Promise<void>;
    };

    const warmupContent: OverlayContent = {
      title: "Warmup",
      description: "Compile drone paths",
      enableDroneCardDock: true,
      sections: [
        {
          id: "warmup-overview",
          title: "Overview",
          type: "text",
          content:
            "Synthetic overlay content used only to compile drone panel materials before the first moon visit.",
        },
        {
          id: "warmup-details",
          title: "Details",
          type: "text",
          content:
            "This includes multiline body text to exercise body-panel, border trace, and canvas texture paths under orbit mode.",
        },
        {
          id: "warmup-tech",
          title: "Tech",
          type: "skills",
          content: ["Three.js", "CanvasTexture", "Orbit"],
        },
      ],
    };

    const warmup = async () => {
      let warmupDrone: HologramDroneDisplay | null = null;
      try {
        const warmupStart = performance.now();
        debugLog("drone", "[warmup] priming live drone render path");
        warmupDrone = new HologramDroneDisplay(liveScene, {
          droneVariant: MOON_VISIT_DRONE_VARIANT,
          oblivionDroneTemplate: template,
          soundEnabled: false,
        });
        const camForward = liveCamera.getWorldDirection(new THREE.Vector3()).normalize();
        const warmMoonPos = liveCamera.position
          .clone()
          .addScaledVector(camForward, 28);
        const warmAnchor = liveCamera.position
          .clone()
          .addScaledVector(camForward, 24)
          .add(new THREE.Vector3(0, -1, 0));
        warmupDrone.showContent(
          warmupContent,
          warmMoonPos,
          liveCamera,
          warmAnchor,
        );
        // Advance through fly-in + pre-draw so compile includes active drone UI materials.
        for (let i = 0; i < 360; i += 1) {
          warmupDrone.update(1 / 60, liveCamera);
        }
        const compileStart = performance.now();
        if (typeof compileRenderer.compileAsync === "function") {
          await compileRenderer.compileAsync(liveScene, liveCamera);
        } else {
          compileRenderer.compile(liveScene, liveCamera);
        }
        const compileMs = performance.now() - compileStart;
        // Force one base render while warmup drone content is present so first
        // user-facing drone activation does not pay texture/program upload cost.
        const renderStart = performance.now();
        renderer.render(liveScene, liveCamera);
        const renderMs = performance.now() - renderStart;
        debugLog(
          "drone",
          `[warmup] live render prime complete compile=${compileMs.toFixed(1)}ms render=${renderMs.toFixed(1)}ms total=${(performance.now() - warmupStart).toFixed(1)}ms`,
        );
      } catch {
        debugLog("drone", "[warmup] live render prime skipped");
      } finally {
        warmupDrone?.hideContentImmediate();
        warmupDrone?.dispose();
      }
    };

    void warmup();
  }, [sceneReady, criticalAssetsReady, debugLog]);

  useEffect(() => {
    if (!sceneReady) return;
    const unlockAudio = () => {
      void hologramDroneRef.current?.resumeAudioContext();
      const camera = sceneRef.current.camera;
      if (camera) {
        if (!falconTravelAudioListenerRef.current) {
          falconTravelAudioListenerRef.current = new THREE.AudioListener();
        }
        attachAudioListenerToCamera(camera, falconTravelAudioListenerRef.current);
      }
      const ctx = falconTravelAudioListenerRef.current?.context;
      if (ctx && ctx.state !== "running") {
        void ctx.resume().catch(() => {});
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
  }, [sceneReady]);

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
      falconMoonTravelBufferRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const gltfPreloader = new GLTFLoader();
    const texturePreloader = new THREE.TextureLoader();
    const audioPreloader = new THREE.AudioLoader();

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

    const preloadCriticalAssets = async () => {
      try {
        const [trenchGltf, , , oblivionDroneGltf, activationBuffer, transmissionBuffer, falconMoonTravelBuffer, ...movementBuffers] = await Promise.all([
          gltfPreloader.loadAsync(PROJECT_SHOWCASE_MODEL_PATH),
          gltfPreloader.loadAsync("/models/spaceship/scene.gltf"),
          gltfPreloader.loadAsync("/models/star-destroyer/scene.gltf"),
          gltfPreloader.loadAsync(OBLIVION_DRONE_MODEL_PATH),
          loadAudioSafe(OBLIVION_DRONE_AUDIO_PATHS.activation),
          loadAudioSafe(OBLIVION_DRONE_AUDIO_PATHS.transmission),
          loadAudioSafe(FALCON_MOON_TRAVEL_SFX_PATH),
          ...OBLIVION_DRONE_AUDIO_PATHS.movement.map((url) => loadAudioSafe(url)),
        ]);

        if (!cancelled) {
          // Inject drone model/audio as soon as they resolve; do not block on
          // unrelated texture/music warmups.
          oblivionDronePreloadedRef.current = (oblivionDroneGltf as { scene: THREE.Object3D }).scene;
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
          falconMoonTravelBufferRef.current = falconMoonTravelBuffer;
          debugLog(
            "drone",
            `[audio] buffers ready activation=${!!activationBuffer} transmission=${!!transmissionBuffer} movement=${oblivionDroneAudioBuffersRef.current.movement?.length ?? 0}`,
          );
          debugLog(
            "audio",
            `[falcon] moon-travel preload ready=${!!falconMoonTravelBuffer}`,
          );
        }

        const trenchTextureKeys = new Set<string>();
        trenchGltf.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!(mesh as any).isMesh || !mesh.material) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((mat) => {
            const m = mat as THREE.MeshStandardMaterial;
            if (m.name) trenchTextureKeys.add(m.name);
          });
        });

        const trenchTextureJobs: Promise<THREE.Texture | null>[] = [];
        trenchTextureKeys.forEach((key) => {
          const basePath = `${PROJECT_SHOWCASE_TEXTURE_BASE_PATH}/${key}_diffuse`;
          trenchTextureJobs.push((async () => {
            const exts = ["jpeg", "jpg", "png"];
            for (const ext of exts) {
              const tex = await loadTextureSafe(`${basePath}.${ext}`);
              if (tex) return tex;
            }
            return null;
          })());
        });

        const showcaseImageJobs = (legacyWebsites as ShowcaseEntry[])
          .filter((entry) => (entry as { published?: boolean }).published !== false)
          .flatMap((entry) => {
            const variants =
              (entry.clientVariants ?? []).filter((variant) => !!variant?.title) ?? [];
            const items =
              variants.length > 0
                ? variants.flatMap((variant, variantIndex) =>
                    resolveShowcaseMediaItems(entry, { variant, variantIndex }),
                  )
                : resolveShowcaseMediaItems(entry);
            return items.map((item) => loadTextureSafe(item.textureUrl));
          });
        const moonTextureWarmupJobs = Array.from(
          new Set(Object.values(EXPERIENCE_MOON_TEXTURE_BY_JOB_ID)),
        ).map((textureUrl) => loadTextureSafe(textureUrl));

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
                probe.addEventListener("canplaythrough", onReady, { once: true });
                probe.addEventListener("loadeddata", onReady, { once: true });
                probe.addEventListener("error", onError, { once: true });
                probe.load();
              });
              return true;
            } catch {
              return false;
            }
          });

        await Promise.all([
          ...trenchTextureJobs,
          ...showcaseImageJobs,
          ...moonTextureWarmupJobs,
          ...musicTrackWarmupJobs,
        ]);
        if (!cancelled) {
          projectShowcasePreloadedGltfRef.current = trenchGltf as { scene: THREE.Group };
        }
      } finally {
        if (!cancelled) setCriticalAssetsReady(true);
      }
    };

    preloadCriticalAssets();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (starfieldMeshRef.current) {
      starfieldMeshRef.current.visible = spaceBackgroundVisible;
    }
    if (skyfieldMeshRef.current) {
      skyfieldMeshRef.current.visible = spaceBackgroundVisible;
    }
  }, [spaceBackgroundVisible]);

  useEffect(() => {
    if (loaderVisualComplete && criticalAssetsReady) {
      setIsLoading(false);
    }
  }, [loaderVisualComplete, criticalAssetsReady]);

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
  const projectShowcaseRootRef = useRef<THREE.Group | null>(null);
  const [projectShowcaseReady, setProjectShowcaseReady] = useState(false);
  const [projectShowcaseActive, setProjectShowcaseActive] = useState(false);
  const [projectShowcasePlaying, setProjectShowcasePlaying] = useState(false);
  const [cosmosIntroOverlayOpacity, setCosmosIntroOverlayOpacity] = useState(0);
  const [projectShowcaseEntryOverlayOpacity, setProjectShowcaseEntryOverlayOpacity] =
    useState(0);
  const [projectShowcaseLeverValue, setProjectShowcaseLeverValue] = useState(0);
  const [projectShowcaseAnglePercent, setProjectShowcaseAnglePercentState] =
    useState(PROJECT_SHOWCASE_DEFAULT_ANGLE_PERCENT);
  const [projectShowcaseFocusIndex, setProjectShowcaseFocusIndex] = useState(0);
  const [, setProjectShowcaseViewportTick] = useState(0);
  const projectShowcaseActiveRef = useRef(false);
  const projectShowcasePlayingRef = useRef(false);
  const projectShowcaseLeverValueRef = useRef(0);
  const projectShowcaseAnglePercentRef = useRef(
    PROJECT_SHOWCASE_DEFAULT_ANGLE_PERCENT,
  );
  const projectShowcaseLeverDraggingRef = useRef(false);
  const projectShowcaseLeverFlickRef = useRef(0);
  const projectShowcaseVelocityRef = useRef(0);
  const projectShowcaseJumpTargetRef = useRef<number | null>(null);
  const projectShowcaseForcedFocusIndexRef = useRef<number | null>(null);
  const projectShowcaseLeverRectRef = useRef<DOMRect | null>(null);
  const projectShowcaseLeverLastSampleRef = useRef<{
    value: number;
    t: number;
  } | null>(null);
  const projectShowcaseWheelLastInputAtRef = useRef(0);
  const projectShowcaseFocusIndexRef = useRef(0);
  const projectShowcaseLastTickRef = useRef<number | null>(null);
  const projectShowcasePanelsRef = useRef<ShowcasePanelRecord[]>([]);
  const projectShowcasePreloadedGltfRef = useRef<{ scene: THREE.Group } | null>(null);
  const oblivionDronePreloadedRef = useRef<THREE.Object3D | null>(null);
  const oblivionDroneAudioBuffersRef = useRef<DroneAudioBuffers | null>(null);
  const falconMoonTravelBufferRef = useRef<AudioBuffer | null>(null);
  const falconTravelAudioListenerRef = useRef<THREE.AudioListener | null>(null);
  const falconTravelAudioRef = useRef<THREE.PositionalAudio | null>(null);
  const falconTravelFadeTimeoutRef = useRef<number | null>(null);
  const droneGpuWarmupDoneRef = useRef(false);
  const projectShowcaseTrackRef = useRef<{
    axis: "x" | "z";
    minRun: number;
    maxRun: number;
    centerCross: number;
    cameraHeight: number;
    lookAhead: number;
    speed: number;
    cullHalfWindow: number;
  } | null>(null);
  const projectShowcaseFloorPulseMatsRef = useRef<
    Array<{ mat: THREE.MeshBasicMaterial; runT: number }>
  >([]);
  const projectShowcaseRunPosRef = useRef(0);
  const projectShowcasePrevControlsEnabledRef = useRef(true);
  const pendingProjectShowcaseEntryRef = useRef(false);
  const projectShowcaseAwaitingProjectsArrivalRef = useRef(false);
  const projectShowcaseSawProjectsTravelRef = useRef(false);
  const projectShowcaseEntrySequenceRef = useRef<{
    active: boolean;
    raf: number | null;
  }>({ active: false, raf: null });
  const projectShowcaseExitSequenceRef = useRef<{
    active: boolean;
    raf: number | null;
  }>({ active: false, raf: null });
  const projectShowcaseQueuedNavRef = useRef<{
    targetId: string;
    targetType: "section" | "moon";
  } | null>(null);
  const projectShowcaseWorldAnchorRef = useRef<THREE.Vector3 | null>(null);
  const orbitalPortfolioWorldAnchorRef = useRef<THREE.Vector3 | null>(null);
  const orbitalPortfolioRootRef = useRef<THREE.Group | null>(null);
  const orbitalPortfolioBeaconRef = useRef<THREE.Mesh | null>(null);
  const orbitalPortfolioStationsRef = useRef<OrbitalPortfolioStationRecord[]>([]);
  const orbitalPortfolioGroupsRef = useRef<PortfolioGroupView[]>([]);
  const orbitalPortfolioCoresRef = useRef<OrbitalPortfolioCoreRecord[]>([]);
  const orbitalPortfolioCoresByIdRef = useRef<Map<string, OrbitalPortfolioCoreRecord>>(
    new Map(),
  );
  const orbitalPortfolioCoreViewsRef = useRef<PortfolioCoreView[]>([]);
  const orbitalPortfolioConnectorLinesRef = useRef<THREE.Line[]>([]);
  const orbitalPortfolioMatterGroupRef = useRef<THREE.Group | null>(null);
  const orbitalPortfolioMatterPacketsRef = useRef<OrbitalPortfolioMatterPacketRecord[]>([]);
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
  const moonTravelSignTextureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  const [orbitSignTuning, setOrbitSignTuning] = useState<OrbitSignTuning>({
    timeBetweenMessagesSec: 1.8,
    continuousLoop: true,
    waitAfterStreamSec: 60,
    travelSpeed: 0.9,
    lightIntensity: 1.7,
    startFontScale: 0.1,
    endFontScale: 1.86,
  });
  const orbitSignTuningRef = useRef<OrbitSignTuning>(orbitSignTuning);
  const [showOrbitSignTuningControls, setShowOrbitSignTuningControls] = useState(false);
  const [viewerMemoriesEnabled, setViewerMemoriesEnabled] = useState(false);
  const viewerMemoriesEnabledRef = useRef(false);
  const [moonMemoryManualMode, setMoonMemoryManualMode] = useState(false);
  const moonMemoryManualModeRef = useRef(false);
  const [moonMemoryPlaybackPlaying, setMoonMemoryPlaybackPlaying] = useState(false);
  const moonMemoryPlaybackPlayingRef = useRef(false);
  const [moonMemoryScrubValue, setMoonMemoryScrubValue] = useState(0);
  const moonMemoryScrubValueRef = useRef(0);
  const moonMemoryLastUiSyncAtRef = useRef(0);
  const moonMemoryScrubRequestRef = useRef<{ value: number } | null>(null);
  const moonOrbitSignDebugLastLogAtRef = useRef(0);
  const [orbitalPortfolioReady, setOrbitalPortfolioReady] = useState(false);
  const [orbitalPortfolioActive, setOrbitalPortfolioActive] = useState(false);
  const orbitalPortfolioActiveRef = useRef(false);
  const [orbitalPortfolioPlaying, setOrbitalPortfolioPlaying] = useState(true);
  const orbitalPortfolioPlayingRef = useRef(true);
  const [orbitalPortfolioOrbitsEnabled, setOrbitalPortfolioOrbitsEnabled] = useState(true);
  const orbitalPortfolioOrbitsEnabledRef = useRef(true);
  const [orbitalPortfolioAutoplayEnabled, setOrbitalPortfolioAutoplayEnabled] =
    useState(false);
  const orbitalPortfolioAutoplayEnabledRef = useRef(false);
  const [orbitalPortfolioFocusIndex, setOrbitalPortfolioFocusIndex] = useState(0);
  const orbitalPortfolioFocusIndexRef = useRef(0);
  const [orbitalPortfolioHasActiveFocus, setOrbitalPortfolioHasActiveFocus] = useState(true);
  const orbitalPortfolioHasActiveFocusRef = useRef(true);
  const [orbitalPortfolioVariantIndex, setOrbitalPortfolioVariantIndex] = useState(0);
  const orbitalPortfolioVariantIndexRef = useRef(0);
  const [orbitalPortfolioMediaIndex, setOrbitalPortfolioMediaIndex] = useState(0);
  const [orbitalPortfolioThumbPageStart, setOrbitalPortfolioThumbPageStart] = useState(0);
  const orbitalPortfolioThumbPageStartRef = useRef(0);
  const orbitalPortfolioPrevThumbPageStartRef = useRef(0);
  const orbitalPortfolioThumbSlideDirectionRef = useRef<"prev" | "next" | null>(null);
  const [orbitalPortfolioSearchQuery, setOrbitalPortfolioSearchQuery] = useState("");
  const [orbitalPortfolioYearFilter, setOrbitalPortfolioYearFilter] = useState("all");
  const [orbitalPortfolioTechFilter, setOrbitalPortfolioTechFilter] = useState("all");
  const [orbitalPortfolioFocusedCoreId, setOrbitalPortfolioFocusedCoreId] = useState("");
  const orbitalPortfolioFocusedCoreIdRef = useRef("");
  const [orbitalRegistryExpandedCoreIds, setOrbitalRegistryExpandedCoreIds] = useState<
    Record<string, boolean>
  >({});
  const [orbitalRegistryPanelVisible, setOrbitalRegistryPanelVisible] = useState(true);
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
  const orbitalPortfolioInspectedStationIndexRef = useRef<number | null>(null);
  const orbitalPortfolioInspectDistanceRef = useRef<number | null>(null);
  const orbitalPortfolioInspectStartedAtRef = useRef(0);
  const orbitalPortfolioDebugLastLogAtRef = useRef(0);
  const orbitalPortfolioStateDebugLastLogAtRef = useRef(0);
  const orbitalPortfolioDebugDumpedRef = useRef(false);
  const orbitalPortfolioPrevStateRef = useRef<{
    followingSpaceship: boolean;
    shipVisible: boolean;
    controlsEnabled: boolean;
    cameraLayerMask: number;
    controlsMinDistance?: number;
    controlsMaxDistance?: number;
  } | null>(null);
  const [portfolioNavHereActive, setPortfolioNavHereActive] = useState(false);
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
    moonTravelSignLastSpawnAtRef.current = Math.min(moonTravelSignLastSpawnAtRef.current, now + 90);
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
  const exportOrbitSignTuning = useCallback(() => {
    const payload = {
      timeBetweenMessagesSec: Number(orbitSignTuning.timeBetweenMessagesSec.toFixed(2)),
      continuousLoop: !!orbitSignTuning.continuousLoop,
      waitAfterStreamSec: Number(orbitSignTuning.waitAfterStreamSec.toFixed(2)),
      travelSpeed: Number(orbitSignTuning.travelSpeed.toFixed(2)),
      lightIntensity: Number(orbitSignTuning.lightIntensity.toFixed(2)),
      startFontScale: Number(orbitSignTuning.startFontScale.toFixed(2)),
      endFontScale: Number(orbitSignTuning.endFontScale.toFixed(2)),
    };
    console.log("[ORBSIGN_SETTINGS]", payload);
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
  const aboutCellRevealAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  const aboutSlideTexturesRef = useRef<Array<THREE.Texture | null>>([null, null, null, null]);
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
  const [projectsNavHereActive, setProjectsNavHereActive] = useState(false);
  const [skillsNavHereActive, setSkillsNavHereActive] = useState(false);
  const [aboutSwarmTriggerVisible, setAboutSwarmTriggerVisible] = useState(false);
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
  const skillsSDPatrolStateRef = useRef<{ angle: number }>({ angle: Math.PI * 0.25 });
  const moonTravelSignCatalog = useMemo(() => {
    const experience = (resumeData as { experience?: unknown }).experience;
    const entries = Array.isArray(experience)
      ? (experience as Array<Record<string, unknown>>)
      : [];
    const normalizeMemoryType = (value: unknown): JobMemoryType => {
      const raw = String(value ?? "").trim().toLowerCase();
      if (raw === "tech" || raw === "code" || raw === "memory" || raw === "default") return raw;
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
      else if (company) catalog.set(id, { pool: [{ text: company, type: "default" }] });
    });
    return catalog;
  }, []);
  const buildMoonTravelSignText = useCallback(
    (companyId: string) => {
      const id = companyId.toLowerCase();
      const record = moonTravelSignCatalog.get(id);
      const pool =
        moonTravelSignActiveCompanyRef.current === id && moonTravelSignPoolRef.current.length > 0
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
  const projectShowcaseNebulaRootRef = useRef<THREE.Object3D | null>(null);
  const skillsLatticeRootRef = useRef<THREE.Group | null>(null);
  const skillsLatticeNodesRef = useRef<SkillsLatticeNodeRecord[]>([]);
  const skillsLatticeLineMatsRef = useRef<THREE.LineBasicMaterial[]>([]);
  const skillsLatticeLineGroupsRef = useRef<SkillsLatticeLineGroup[]>([]);
  const skillsLatticeLinkSegmentsRef = useRef<SkillsLatticeLinkSegment[]>([]);
  const skillsLatticeArcRecordsRef = useRef<SkillsLatticeArcRecord[]>([]);
  const skillsLatticeFlowPointsRef = useRef<THREE.Points | null>(null);
  const skillsLatticeFlowMetaRef = useRef<SkillsLatticeFlowMeta[]>([]);
  const skillsLatticeEnvelopeRef = useRef<THREE.Mesh | null>(null);
  const skillsLatticeEnvelopeMatRef = useRef<THREE.MeshPhongMaterial | null>(null);
  const skillsLatticeEnvelopeEdgeMatRef = useRef<THREE.LineBasicMaterial | null>(null);
  const skillsLatticeEnvelopeRadiusRef = useRef(0);
  const skillsLatticeEnvelopeInsideRef = useRef<boolean | null>(null);
  const skillsLatticeBeaconRef = useRef<THREE.Mesh | null>(null);
  const skillsLatticeBeaconMatRef = useRef<THREE.MeshPhongMaterial | null>(null);
  const skillsLatticeBeaconEdgeMatRef = useRef<THREE.LineBasicMaterial | null>(null);
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
  const skillsLatticeSelectedNodeRef = useRef<SkillsLatticeNodeRecord | null>(null);
  const skillsLegacyBodiesRef = useRef<THREE.Object3D[]>([]);
  const skillsLatticePendingEntryRef = useRef(false);
  const skillsLatticeActiveRef = useRef(false);
  const [skillsLatticeActive, setSkillsLatticeActive] = useState(false);
  const skillsLatticePrevStateRef = useRef<{
    followingSpaceship: boolean;
    shipVisible: boolean;
    controlsEnabled: boolean;
  } | null>(null);
  const projectShowcaseNebulaDebugLastLogMsRef = useRef(0);
  const projectShowcaseNebulaDebugLastAlphaBucketRef = useRef(-1);
  const [skillsLatticeSelection, setSkillsLatticeSelection] = useState<{
    label: string;
    nodeType: "category" | "skill";
    category: string;
    detailItems: string[];
  } | null>(null);
  const projectShowcaseAngleIntroRef = useRef<{
    raf: number | null;
  }>({ raf: null });
  const projectShowcasePrevStateRef = useRef<{
    followingSpaceship: boolean;
    shipVisible: boolean;
  } | null>(null);
  const spaceshipCameraOffsetRef = useRef(
    new THREE.Vector3(0, FOLLOW_HEIGHT, FOLLOW_DISTANCE),
  );
  const cosmosIntroPlayedRef = useRef(false);
  const cosmosIntroCompletedRef = useRef(false);


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
  const starDestroyerDebugLastLogMsRef = useRef(0);
  const starDestroyerSkillsSnapPendingRef = useRef(false);
  const shipTelemetryLastLogMsRef = useRef(0);
  const navMessageStateRef = useRef<{
    activeTarget: string | null;
    targetLabel: string | null;
    travelStartedAt: number;
    announcedLightspeed: boolean;
    lastDistance: number | null;
  }>({
    activeTarget: null,
    targetLabel: null,
    travelStartedAt: 0,
    announcedLightspeed: false,
    lastDistance: null,
  });
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

  const formatNavTargetLabel = useCallback(
    (targetId: string): string => {
      const company = resumeData.experience.find((exp: any) => exp.id === targetId);
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
    },
    [],
  );

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
    KeyW: false, KeyA: false, KeyS: false, KeyD: false,
    KeyQ: false, KeyE: false,
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    ShiftLeft: false, ShiftRight: false,
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
  const cameraDriverTraceRef = useRef<string>("boot");
  const startupUiRevealTlRef = useRef<gsap.core.Timeline | null>(null);
  const startupDestinationsPanelRef = useRef<HTMLDivElement | null>(null);
  const startupConsoleButtonRef = useRef<HTMLButtonElement | null>(null);
  const startupMiniMapContainerRef = useRef<HTMLDivElement | null>(null);
  const [startupDestinationsVisible, setStartupDestinationsVisible] = useState(false);
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
      icon: "🚀",
    },
    { id: "skills", label: "Skills", type: "section" as const, icon: "🧠" },
    {
      id: "projects",
      label: "Projects",
      type: "section" as const,
      icon: "🪐",
    },
    {
      id: "portfolio",
      label: "Portfolio",
      type: "section" as const,
      icon: "✨",
    },
    {
      id: "about",
      label: "About",
      type: "section" as const,
      icon: "👨‍🚀",
    },
    { id: "home", label: "Home", type: "section" as const, icon: "☀️" },
    ...resumeData.experience.map((exp) => ({
      id: exp.id,
      label: exp.navLabel || exp.company,
      type: "moon" as const,
      icon: "🌕",
      parentId: "experience",
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

    lastMoonOrbitSpeedRef.current =
      optionsRef.current.spaceMoonOrbitSpeed ?? 0;

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
    const ship = spaceshipRef.current;
    const camera = sceneRef.current.camera;
    if (!ship || !camera) return null;

    if (!falconTravelAudioListenerRef.current) {
      falconTravelAudioListenerRef.current = new THREE.AudioListener();
    }
    const listener = falconTravelAudioListenerRef.current;
    if (!attachAudioListenerToCamera(camera, listener)) return null;

    if (!falconTravelAudioRef.current) {
      falconTravelAudioRef.current = createPositionalAudio(listener, {
        refDistance: 22,
        rolloffFactor: 1.1,
        maxDistance: 2200,
      });
      falconTravelAudioRef.current.name = "FalconMoonTravelSfx";
    }
    const positionalAudio = falconTravelAudioRef.current;
    if (positionalAudio.parent !== ship) {
      if (positionalAudio.parent) positionalAudio.parent.remove(positionalAudio);
      ship.add(positionalAudio);
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

  const fadeOutFalconMoonTravelSfx = useCallback((durationMs = FALCON_MOON_TRAVEL_FADE_OUT_MS) => {
    const positionalAudio = falconTravelAudioRef.current;
    if (!positionalAudio?.isPlaying) return;
    const gainNode = positionalAudio.gain?.gain;
    const listener = falconTravelAudioListenerRef.current;
    if (!gainNode || !listener) {
      positionalAudio.stop();
      return;
    }

    if (falconTravelFadeTimeoutRef.current !== null) {
      window.clearTimeout(falconTravelFadeTimeoutRef.current);
      falconTravelFadeTimeoutRef.current = null;
    }
    const now = listener.context.currentTime;
    const fadeSeconds = Math.max(0.05, durationMs / 1000);
    gainNode.cancelScheduledValues(now);
    gainNode.setValueAtTime(gainNode.value, now);
    gainNode.linearRampToValueAtTime(0.0001, now + fadeSeconds);
    falconTravelFadeTimeoutRef.current = window.setTimeout(() => {
      const activeAudio = falconTravelAudioRef.current;
      if (!activeAudio) return;
      if (activeAudio.isPlaying) activeAudio.stop();
      activeAudio.setVolume(
        THREE.MathUtils.clamp(
          overallVolume * falconSoundVolume,
          0,
          1,
        ),
      );
      falconTravelFadeTimeoutRef.current = null;
      debugLog("audio", "[falcon] moon-travel cue faded out");
    }, Math.ceil(durationMs + 40));
  }, [debugLog, falconSoundVolume, overallVolume]);

  const playFalconMoonTravelSfx = useCallback(async (forceRestart = false) => {
    if (!falconSoundEnabled) return;
    const buffer = falconMoonTravelBufferRef.current;
    if (!buffer) return;
    const positionalAudio = ensureFalconTravelAudioNode();
    if (!positionalAudio) return;
    if (!forceRestart && positionalAudio.isPlaying) return;
    if (falconTravelFadeTimeoutRef.current !== null) {
      window.clearTimeout(falconTravelFadeTimeoutRef.current);
      falconTravelFadeTimeoutRef.current = null;
    }
    await resumeFalconTravelAudioContext();
    try {
      // Non-looping one-shot cue for moon travel.
      playPositionalOneShot(
        positionalAudio,
        buffer,
        THREE.MathUtils.clamp(
          overallVolume * falconSoundVolume,
          0,
          1,
        ),
      );
      debugLog("audio", "[falcon] moon-travel cue played");
    } catch {
      debugLog("audio", "[falcon] moon-travel cue blocked");
    }
  }, [
    debugLog,
    ensureFalconTravelAudioNode,
    falconSoundEnabled,
    falconSoundVolume,
    overallVolume,
    resumeFalconTravelAudioContext,
  ]);

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
    navTurnActiveRef,
    settledViewTargetRef,
    handleAutopilotNavigation,
    initializeNavigationSystem,
    updateAutopilotNavigation,
    disposeNavigationSystem,
    onMoonOrbitArrivalRef,
  } = useNavigationSystem({
    resumeData,
    emitterRef,
    spaceshipRef,
    sceneRef,
    followingSpaceshipRef,
    manualFlightModeRef,
    focusedMoonRef,
    exitFocusRequestRef,
    shipCinematicRef,
    insideShipRef,
    missionLog,
    vlog,
    shipLog,
    debugLog,
    manualFlightRef,
    spaceshipPathRef,
    enterMoonViewRef,
    shipRollOffsetRef,
    optionsRef,
    followingStarDestroyerRef,
    setFollowingStarDestroyer,
    onMoonTravelIntent: ({ targetMoonId }) => {
      debugLog("nav", `Moon travel intent: ${targetMoonId}`);
      void playFalconMoonTravelSfx(false);
    },
    onMoonTravelNavigationStarted: ({ targetMoonId }) => {
      debugLog("nav", `Moon travel started: ${targetMoonId}`);
      void playFalconMoonTravelSfx(false);
    },
    onMoonTravelArrived: ({ targetMoonId }) => {
      debugLog("nav", `Moon travel arrived: ${targetMoonId}`);
      fadeOutFalconMoonTravelSfx();
    },
    resolveSpecialSectionTarget: (targetId) => {
      if (targetId === "projects") {
        const rootAnchor = projectShowcaseWorldAnchorRef.current;
        const track = projectShowcaseTrackRef.current;
        if (!rootAnchor || !track) {
          return rootAnchor ? rootAnchor.clone() : null;
        }
        const run = track.minRun + 10;
        const sway = Math.sin(run * 0.025) * 1.2;
        const travelAxis =
          track.axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        const crossAxis =
          track.axis === "z" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1);
        const trenchCam =
          track.axis === "z"
            ? new THREE.Vector3(
                rootAnchor.x + track.centerCross + sway,
                rootAnchor.y + track.cameraHeight,
                rootAnchor.z + run,
              )
            : new THREE.Vector3(
                rootAnchor.x + run,
                rootAnchor.y + track.cameraHeight,
                rootAnchor.z + track.centerCross + sway,
              );
        const finalApproachDist = track.lookAhead * 6.4;
        return trenchCam
          .clone()
          .addScaledVector(travelAxis, -finalApproachDist)
          .addScaledVector(crossAxis, 1.1)
          .add(new THREE.Vector3(0, 14, 0));
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
      if (targetId === "about") {
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
          .addScaledVector(approachNormal, ABOUT_MEMORY_SQUARE_NAV_STANDOFF_DIST)
          .add(new THREE.Vector3(0, 54, 0));
      }
      if (targetId === "portfolio") {
        const anchor = orbitalPortfolioWorldAnchorRef.current;
        if (!anchor) return null;
        return anchor
          .clone()
          .add(new THREE.Vector3(420, 210, 530));
      }
      return null;
    },
  });

  useEffect(() => {
    currentNavigationTargetRef.current = currentNavigationTarget;
  }, [currentNavigationTarget]);

  // Keep speed telemetry responsive during active navigation, even when
  // navigationDistance/state updates are sparse for a short phase window.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        !navMessageStateRef.current.activeTarget &&
        !currentNavigationTargetRef.current
      ) {
        return;
      }
      setNavTelemetryPulse((prev) => (prev + 1) % 1000000);
    }, 120);
    return () => window.clearInterval(timer);
  }, []);

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
      const clamped = THREE.MathUtils.clamp(instantaneousUnitsPerSecond, 0, 5000);
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
      navDistanceSampleRef.current = null;
      navDistanceDerivedSpeedRef.current = 0;

      onScreenMessage(`Navicomputer setting destination to "${targetLabel}"`);
      if (navigationDistance !== null) {
        onScreenMessage(
          `Destination acquired, distance ${navigationDistance.toFixed(0)}u`,
        );
      }
      onScreenMessage("Adjusting Falcon trajectory");
    }

    if (navState.activeTarget) {
      // Navigation has finished; dismiss KPI strip immediately.
      if (!currentNavigationTarget && navigationDistance === null) {
        const label = navState.targetLabel ?? formatNavTargetLabel(navState.activeTarget);
        onScreenMessage(`Arrived at ${label}`);
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
        return;
      }
      if (navigationDistance !== null) {
        const now = performance.now();
        const navSample = navDistanceSampleRef.current;
        if (!navSample) {
          navDistanceSampleRef.current = { t: now, distance: navigationDistance };
        } else {
          const dt = Math.max((now - navSample.t) / 1000, 1 / 240);
          const deltaDist = Math.abs(navigationDistance - navSample.distance);
          navSample.t = now;
          navSample.distance = navigationDistance;
          const instantaneousUnitsPerSecond = deltaDist / dt;
          const clamped = THREE.MathUtils.clamp(instantaneousUnitsPerSecond, 0, 5000);
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
        navigationDistance !== null ? navigationDistance : navState.lastDistance;
      setOnScreenTelemetry({
        distance: effectiveDistance,
        speed,
      });

      if (!navState.announcedLightspeed && manualFlightRef.current.isLightspeedActive) {
        onScreenMessage("Engaging light speed");
        navState.announcedLightspeed = true;
      }

      if (
        navigationDistance !== null &&
        navState.lastDistance !== null &&
        navState.lastDistance >= 420 &&
        navigationDistance < 420
      ) {
        onScreenMessage("Arriving to destination");
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
    formatNavTargetLabel,
    navTelemetryPulse,
  ]);

  const setProjectShowcaseFocus = useCallback((index: number) => {
    const panels = projectShowcasePanelsRef.current;
    if (panels.length === 0) return;
    const safeIndex = THREE.MathUtils.clamp(index, 0, panels.length - 1);
    const previousIndex = projectShowcaseFocusIndexRef.current;
    projectShowcaseFocusIndexRef.current = safeIndex;
    if (previousIndex !== safeIndex) {
      panels[safeIndex]?.setActiveVariant(0);
    }
    setProjectShowcaseFocusIndex(safeIndex);
  }, []);

  const setProjectShowcaseRunPosition = useCallback((runPos: number) => {
    projectShowcaseRunPosRef.current = runPos;
    const panels = projectShowcasePanelsRef.current;
    if (panels.length === 0) return;
    const track = projectShowcaseTrackRef.current;
    const minRun = track ? track.minRun + 10 : -Infinity;
    const maxRun = track ? track.maxRun - 10 : Infinity;

    const forcedIndex = projectShowcaseForcedFocusIndexRef.current;
    if (forcedIndex !== null) {
      setProjectShowcaseFocus(forcedIndex);
    } else {
      // Find nearest panel by true panel centers for stable highlight timing.
      let bestIndex = 0;
      let bestDist = Infinity;
      panels.forEach((panel, idx) => {
        const panelCenter = THREE.MathUtils.clamp(panel.runPos, minRun, maxRun);
        const d = Math.abs(panelCenter - runPos);
        if (d < bestDist) {
          bestDist = d;
          bestIndex = idx;
        }
      });
      setProjectShowcaseFocus(bestIndex);
    }

    if (!track) return;
    const halfWindow = track.cullHalfWindow;
    panels.forEach((panel) => {
      panel.group.visible = Math.abs(panel.runPos - runPos) <= halfWindow;
    });
  }, [setProjectShowcaseFocus]);

  const setProjectShowcaseLever = useCallback((value: number) => {
    const clamped = THREE.MathUtils.clamp(value, -1, 1);
    projectShowcaseLeverValueRef.current = clamped;
    setProjectShowcaseLeverValue(clamped);
  }, []);

  const setProjectShowcaseAnglePercent = useCallback((value: number) => {
    const clamped = THREE.MathUtils.clamp(
      value,
      PROJECT_SHOWCASE_MIN_ANGLE_PERCENT,
      PROJECT_SHOWCASE_MAX_ANGLE_PERCENT,
    );
    projectShowcaseAnglePercentRef.current = clamped;
    setProjectShowcaseAnglePercentState(clamped);
  }, []);

  function applyProjectShowcaseNebulaFade(alphaValue: number) {
    const nebulaRoot = projectShowcaseNebulaRootRef.current;
    if (!nebulaRoot) return;
    const alpha = THREE.MathUtils.clamp(alphaValue, 0, 1);
    nebulaRoot.visible = alpha > 0.001;
    nebulaRoot.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!(mesh as any).isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        const m = mat as THREE.Material & {
          transparent?: boolean;
          opacity?: number;
          userData?: Record<string, unknown>;
        };
        const base = Number((m.userData?.nebulaBaseOpacity as number) ?? 1);
        m.transparent = true;
        m.opacity = base * alpha;
      });
    });
    const alphaBucket = Math.round(alpha * 10);
    if (alphaBucket !== projectShowcaseNebulaDebugLastAlphaBucketRef.current) {
      projectShowcaseNebulaDebugLastAlphaBucketRef.current = alphaBucket;
      vlog(
        `🌌 Nebula fade alpha=${alpha.toFixed(2)} visible=${nebulaRoot.visible ? "yes" : "no"}`,
      );
    }
  }

  const getFocusedProjectShowcasePanel = useCallback(() => {
    const panels = projectShowcasePanelsRef.current;
    if (panels.length === 0) return null;
    const idx = THREE.MathUtils.clamp(
      projectShowcaseFocusIndexRef.current,
      0,
      panels.length - 1,
    );
    return panels[idx];
  }, []);

  const bumpProjectShowcaseViewportTick = useCallback(() => {
    setProjectShowcaseViewportTick((v) => v + 1);
  }, []);

  const applyProjectShowcasePanelViewport = useCallback(
    (panel: ShowcasePanelRecord) => {
      const texture = panel.texture;
      if (!texture) return;

      const baseRepeatX = panel.baseRepeat.x;
      const baseRepeatY = panel.baseRepeat.y;
      const zoom = THREE.MathUtils.clamp(panel.zoom, 1, 4);
      panel.zoom = zoom;
      const repX = baseRepeatX / zoom;
      const repY = baseRepeatY / zoom;
      const minPanX = -panel.baseOffset.x;
      const maxPanX = (1 - repX) - panel.baseOffset.x;
      const minPanY = -panel.baseOffset.y;
      const maxPanY = (1 - repY) - panel.baseOffset.y;
      panel.panX = THREE.MathUtils.clamp(panel.panX, minPanX, maxPanX);
      panel.panY = THREE.MathUtils.clamp(panel.panY, minPanY, maxPanY);

      texture.repeat.set(repX, repY);
      texture.offset.set(
        panel.baseOffset.x + panel.panX,
        panel.baseOffset.y + panel.panY,
      );
      texture.needsUpdate = true;
    },
    [],
  );

  const resetProjectShowcasePanelViewport = useCallback(
    (index?: number) => {
      const panels = projectShowcasePanelsRef.current;
      if (panels.length === 0) return;
      const safeIndex =
        index ??
        THREE.MathUtils.clamp(
          projectShowcaseFocusIndexRef.current,
          0,
          panels.length - 1,
        );
      const panel = panels[safeIndex];
      if (projectShowcasePlayingRef.current) {
        projectShowcasePlayingRef.current = false;
        setProjectShowcasePlaying(false);
      }
      panel.zoom = 1;
      panel.panX = 0;
      panel.panY = 0;
      applyProjectShowcasePanelViewport(panel);
      bumpProjectShowcaseViewportTick();
    },
    [applyProjectShowcasePanelViewport, bumpProjectShowcaseViewportTick],
  );

  const nudgeProjectShowcasePanelViewport = useCallback(
    (xDir: -1 | 0 | 1, yDir: -1 | 0 | 1) => {
      const panel = getFocusedProjectShowcasePanel();
      if (!panel || !panel.texture) return;
      if (projectShowcasePlayingRef.current) {
        projectShowcasePlayingRef.current = false;
        setProjectShowcasePlaying(false);
      }
      const zoom = THREE.MathUtils.clamp(panel.zoom, 1, 4);
      const repX = panel.baseRepeat.x / zoom;
      const repY = panel.baseRepeat.y / zoom;
      const panRangeX = Math.max(0, 1 - repX);
      const panRangeY = Math.max(0, 1 - repY);
      const stepX = Math.max(panRangeX * 0.14, 0.008);
      const stepY = Math.max(panRangeY * 0.14, 0.008);
      panel.panX += xDir * stepX;
      panel.panY += yDir * stepY;
      applyProjectShowcasePanelViewport(panel);
      bumpProjectShowcaseViewportTick();
    },
    [
      getFocusedProjectShowcasePanel,
      applyProjectShowcasePanelViewport,
      bumpProjectShowcaseViewportTick,
    ],
  );

  const setProjectShowcasePanelZoom = useCallback(
    (zoom: number) => {
      const panel = getFocusedProjectShowcasePanel();
      if (!panel || !panel.texture) return;
      if (projectShowcasePlayingRef.current) {
        projectShowcasePlayingRef.current = false;
        setProjectShowcasePlaying(false);
      }
      const prevZoom = THREE.MathUtils.clamp(panel.zoom, 1, 4);
      const nextZoom = THREE.MathUtils.clamp(zoom, 1, 4);
      const prevRepX = panel.baseRepeat.x / prevZoom;
      const prevRepY = panel.baseRepeat.y / prevZoom;
      const nextRepX = panel.baseRepeat.x / nextZoom;
      const nextRepY = panel.baseRepeat.y / nextZoom;
      // Keep zoom centered on the current viewport center.
      panel.panX += (prevRepX - nextRepX) * 0.5;
      panel.panY += (prevRepY - nextRepY) * 0.5;
      panel.zoom = nextZoom;
      applyProjectShowcasePanelViewport(panel);
      bumpProjectShowcaseViewportTick();
    },
    [
      getFocusedProjectShowcasePanel,
      applyProjectShowcasePanelViewport,
      bumpProjectShowcaseViewportTick,
    ],
  );

  const updateProjectShowcaseLeverFromClientY = useCallback(
    (clientY: number, rect: DOMRect) => {
      const centerY = rect.top + rect.height * 0.5;
      const normalized = (centerY - clientY) / Math.max(1, rect.height * 0.5);
      setProjectShowcaseLever(normalized);
      return THREE.MathUtils.clamp(normalized, -1, 1);
    },
    [setProjectShowcaseLever],
  );

  const startProjectShowcaseLeverDrag = useCallback(
    (clientY: number, rect: DOMRect) => {
      if (projectShowcasePlayingRef.current) {
        projectShowcasePlayingRef.current = false;
        setProjectShowcasePlaying(false);
      }
      projectShowcaseJumpTargetRef.current = null;
      projectShowcaseForcedFocusIndexRef.current = null;
      projectShowcaseLeverDraggingRef.current = true;
      projectShowcaseLeverFlickRef.current = 0;
      const value = updateProjectShowcaseLeverFromClientY(clientY, rect);
      projectShowcaseLeverLastSampleRef.current = {
        value,
        t: performance.now(),
      };
    },
    [updateProjectShowcaseLeverFromClientY],
  );

  const moveProjectShowcaseLeverDrag = useCallback(
    (clientY: number, rect: DOMRect) => {
      if (!projectShowcaseLeverDraggingRef.current) return;
      const value = updateProjectShowcaseLeverFromClientY(clientY, rect);
      const now = performance.now();
      const sample = projectShowcaseLeverLastSampleRef.current;
      if (sample) {
        const dt = Math.max((now - sample.t) / 1000, 1 / 240);
        const dv = value - sample.value;
        projectShowcaseLeverFlickRef.current = THREE.MathUtils.clamp(
          dv / dt,
          -4,
          4,
        );
      }
      projectShowcaseLeverLastSampleRef.current = { value, t: now };
    },
    [updateProjectShowcaseLeverFromClientY],
  );

  const endProjectShowcaseLeverDrag = useCallback(() => {
    if (!projectShowcaseLeverDraggingRef.current) return;
    projectShowcaseLeverDraggingRef.current = false;
    projectShowcaseLeverLastSampleRef.current = null;
    const track = projectShowcaseTrackRef.current;
    if (track) {
      const maxManualSpeed = track.speed * 2.4;
      const impulse = projectShowcaseLeverFlickRef.current * track.speed * 0.15;
      projectShowcaseVelocityRef.current = THREE.MathUtils.clamp(
        projectShowcaseVelocityRef.current + impulse,
        -maxManualSpeed,
        maxManualSpeed,
      );
    }
    projectShowcaseLeverFlickRef.current = 0;
    setProjectShowcaseLever(0);
  }, [setProjectShowcaseLever]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!projectShowcaseLeverDraggingRef.current) return;
      const rect = projectShowcaseLeverRectRef.current;
      if (!rect) return;
      moveProjectShowcaseLeverDrag(e.clientY, rect);
      e.preventDefault();
    };
    const onPointerUp = () => {
      endProjectShowcaseLeverDrag();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [endProjectShowcaseLeverDrag, moveProjectShowcaseLeverDrag]);

  // ── Project showcase movement: wheel-first tunnel control ────────────────
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      // Preserve Shift+wheel image manipulation flow.
      if (e.shiftKey) return;
      if (!projectShowcaseActiveRef.current) return;
      const track = projectShowcaseTrackRef.current;
      if (!track) return;

      // Wheel interaction takes over from autoplay immediately.
      if (projectShowcasePlayingRef.current) {
        projectShowcasePlayingRef.current = false;
        setProjectShowcasePlaying(false);
      }
      projectShowcaseJumpTargetRef.current = null;
      projectShowcaseForcedFocusIndexRef.current = null;
      projectShowcaseLeverDraggingRef.current = false;
      projectShowcaseLeverFlickRef.current = 0;
      projectShowcaseLeverLastSampleRef.current = null;

      // Reversed mapping per UX request:
      // Wheel down => move backward, wheel up => move forward.
      const direction = e.deltaY > 0 ? -1 : 1;
      const notchStrength = THREE.MathUtils.clamp(Math.abs(e.deltaY) / 120, 0.2, 4);
      const aggressiveBoost = THREE.MathUtils.lerp(
        1,
        13.5,
        THREE.MathUtils.clamp((notchStrength - 1) / 3, 0, 1),
      );
      // Single notch is ~50% gentler, while aggressive/rapid wheel input ramps harder.
      const impulseFactor =
        0.725 * Math.pow(notchStrength, 1.65) * aggressiveBoost;
      const maxManualSpeed =
        track.speed *
        THREE.MathUtils.lerp(
          11.4,
          270,
          THREE.MathUtils.clamp((notchStrength - 1) / 3, 0, 1),
        );
      const impulse = direction * track.speed * impulseFactor;
      projectShowcaseVelocityRef.current = THREE.MathUtils.clamp(
        projectShowcaseVelocityRef.current + impulse,
        -maxManualSpeed,
        maxManualSpeed,
      );
      projectShowcaseWheelLastInputAtRef.current = performance.now();

      // Kick the throttle lever immediately; loop inertia will continue animating it.
      const leverImpulse =
        direction *
        THREE.MathUtils.clamp(0.22 + Math.pow(notchStrength, 0.85) * 0.3, 0.22, 1);
      setProjectShowcaseLever(leverImpulse);

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [setProjectShowcaseLever]);

  const exitProjectShowcase = useCallback(() => {
    if (projectShowcaseAngleIntroRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseAngleIntroRef.current.raf);
      projectShowcaseAngleIntroRef.current.raf = null;
    }
    if (projectShowcaseExitSequenceRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseExitSequenceRef.current.raf);
      projectShowcaseExitSequenceRef.current.raf = null;
    }
    projectShowcaseExitSequenceRef.current.active = false;
    projectShowcaseQueuedNavRef.current = null;
    if (projectShowcaseEntrySequenceRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseEntrySequenceRef.current.raf);
      projectShowcaseEntrySequenceRef.current.raf = null;
    }
    projectShowcaseEntrySequenceRef.current.active = false;
    setProjectShowcaseEntryOverlayOpacity(0);
    const showcaseRoot = projectShowcaseRootRef.current;
    if (showcaseRoot) {
      showcaseRoot.visible = false;
    }
    if (sunLabelRef.current) {
      sunLabelRef.current.visible = true;
    }
    if (sceneRef.current.camera) {
      sceneRef.current.camera.layers.disable(PROJECT_SHOWCASE_LAYER);
    }
    if (sceneRef.current.controls) {
      sceneRef.current.controls.enabled =
        projectShowcasePrevControlsEnabledRef.current;
    }

    const prev = projectShowcasePrevStateRef.current;
    if (prev) {
      setFollowingSpaceship(prev.followingSpaceship);
      followingSpaceshipRef.current = prev.followingSpaceship;
      if (spaceshipRef.current) {
        spaceshipRef.current.visible = prev.shipVisible;
      }
      projectShowcasePrevStateRef.current = null;
    } else if (spaceshipRef.current) {
      spaceshipRef.current.visible = true;
    }

    projectShowcaseActiveRef.current = false;
    setProjectShowcaseActive(false);
    setProjectsNavHereActive(false);
    projectShowcasePlayingRef.current = true;
    setProjectShowcasePlaying(true);
    projectShowcaseVelocityRef.current = 0;
    projectShowcaseJumpTargetRef.current = null;
    projectShowcaseForcedFocusIndexRef.current = null;
    projectShowcaseLeverDraggingRef.current = false;
    projectShowcaseLeverFlickRef.current = 0;
    projectShowcaseLeverLastSampleRef.current = null;
    setProjectShowcaseLever(0);
    projectShowcaseLastTickRef.current = null;
    pendingProjectShowcaseEntryRef.current = false;
    projectShowcaseAwaitingProjectsArrivalRef.current = false;
    projectShowcaseSawProjectsTravelRef.current = false;
    vlog("🛰️ Project Showcase exited");
  }, [setProjectShowcaseLever, setProjectsNavHereActive, vlog]);

  const enterProjectShowcase = useCallback(() => {
    if (projectShowcaseAngleIntroRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseAngleIntroRef.current.raf);
      projectShowcaseAngleIntroRef.current.raf = null;
    }
    if (projectShowcaseExitSequenceRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseExitSequenceRef.current.raf);
      projectShowcaseExitSequenceRef.current.raf = null;
    }
    projectShowcaseExitSequenceRef.current.active = false;
    projectShowcaseQueuedNavRef.current = null;
    if (projectShowcaseEntrySequenceRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseEntrySequenceRef.current.raf);
      projectShowcaseEntrySequenceRef.current.raf = null;
    }
    projectShowcaseEntrySequenceRef.current.active = false;
    const showcaseRoot = projectShowcaseRootRef.current;
    const controls = sceneRef.current.controls;
    const camera = sceneRef.current.camera;
    if (!showcaseRoot || !controls || !camera) {
      vlog("⚠️ Project Showcase is not ready yet");
      return;
    }

    if (projectShowcaseActiveRef.current) return;

    projectShowcasePrevStateRef.current = {
      followingSpaceship: followingSpaceshipRef.current,
      shipVisible: spaceshipRef.current?.visible ?? true,
    };

    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    setInsideShip(false);
    insideShipRef.current = false;
    setShipViewMode("exterior");
    shipViewModeRef.current = "exterior";
    if (spaceshipRef.current) spaceshipRef.current.visible = false;

    showcaseRoot.visible = true;
    if (sunLabelRef.current) {
      sunLabelRef.current.visible = false;
    }

    projectShowcasePrevControlsEnabledRef.current = controls.enabled;
    controls.enabled = false;
    camera.layers.enable(PROJECT_SHOWCASE_LAYER);

    const track = projectShowcaseTrackRef.current;
    if (track) {
      const startRun = track.minRun + 10;
      setProjectShowcaseRunPosition(startRun);
      projectShowcaseLastTickRef.current = performance.now();
    }
    projectShowcasePlayingRef.current = false;
    setProjectShowcasePlaying(false);
    projectShowcaseVelocityRef.current = 0;
    projectShowcaseJumpTargetRef.current = null;
    projectShowcaseForcedFocusIndexRef.current = null;
    projectShowcaseLeverDraggingRef.current = false;
    projectShowcaseLeverFlickRef.current = 0;
    projectShowcaseLeverLastSampleRef.current = null;
    setProjectShowcaseLever(0);

    projectShowcaseActiveRef.current = true;
    setProjectShowcaseActive(true);
    setProjectsNavHereActive(true);
    setProjectShowcaseRunPosition(projectShowcaseRunPosRef.current);
    pendingProjectShowcaseEntryRef.current = false;
    projectShowcaseAwaitingProjectsArrivalRef.current = false;
    projectShowcaseSawProjectsTravelRef.current = false;
    startProjectShowcaseAngleIntroSequence();
    vlog("🛰️ Entered Project Showcase");
  }, [
    setProjectShowcaseLever,
    setProjectShowcaseRunPosition,
    setProjectsNavHereActive,
    vlog,
  ]);

  const toggleProjectShowcasePlayback = useCallback(() => {
    const next = !projectShowcasePlayingRef.current;
    projectShowcasePlayingRef.current = next;
    setProjectShowcasePlaying(next);
    if (next) {
      projectShowcaseVelocityRef.current = 0;
      projectShowcaseJumpTargetRef.current = null;
      projectShowcaseForcedFocusIndexRef.current = null;
      setProjectShowcaseLever(0);
    }
  }, [setProjectShowcaseLever]);

  const exitOrbitalPortfolio = useCallback(() => {
    const root = orbitalPortfolioRootRef.current;
    if (root) root.visible = false;
    if (sceneRef.current.camera) {
      sceneRef.current.camera.layers.disable(ORBITAL_PORTFOLIO_LAYER);
    }
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
    setOrbitalPortfolioPlaying(true);
    setOrbitalPortfolioOrbitsEnabled(true);
    setOrbitalPortfolioAutoplayEnabled(false);
    setOrbitalPortfolioSearchQuery("");
    setOrbitalPortfolioYearFilter("all");
    setOrbitalPortfolioTechFilter("all");
    setOrbitalPortfolioFocusedCoreId("");
    setOrbitalRegistryExpandedCoreIds({});
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
    orbitalPortfolioDebugDumpedRef.current = false;
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
  }, []);

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
    };
    controlsAny.minDistance = 55;
    controlsAny.maxDistance = 2800;
    camera.layers.disableAll();
    camera.layers.enable(ORBITAL_PORTFOLIO_LAYER);
    root.visible = true;
    const anchor = orbitalPortfolioWorldAnchorRef.current ?? ORBITAL_PORTFOLIO_WORLD_ANCHOR;
    controls.setLookAt(
      anchor.x + 620,
      anchor.y + 280,
      anchor.z + 820,
      anchor.x,
      anchor.y + 24,
      anchor.z,
      true,
    );
    orbitalPortfolioAutoRef.current.lastAdvanceAt = performance.now();
    orbitalPortfolioAutoRef.current.pausedUntil = 0;
    orbitalPortfolioCameraDistanceRef.current = 1.55;
    orbitalPortfolioCameraDistanceTargetRef.current = 1.55;
    orbitalPortfolioCameraInitializedRef.current = false;
    orbitalPortfolioDebugDumpedRef.current = false;
    orbitalPortfolioManualCameraLockRef.current = false;
    orbitalPortfolioPlayingRef.current = true;
    orbitalPortfolioOrbitsEnabledRef.current = true;
    orbitalPortfolioAutoplayEnabledRef.current = false;
    setOrbitalPortfolioPlaying(true);
    setOrbitalPortfolioOrbitsEnabled(true);
    setOrbitalPortfolioAutoplayEnabled(false);
    setOrbitalPortfolioSearchQuery("");
    setOrbitalPortfolioYearFilter("all");
    setOrbitalPortfolioTechFilter("all");
    {
      const collapsedState: Record<string, boolean> = {};
      orbitalPortfolioCoreViewsRef.current.forEach((core) => {
        collapsedState[core.id] = false;
      });
      setOrbitalRegistryExpandedCoreIds(collapsedState);
    }
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
    orbitalPortfolioActiveRef.current = true;
    setOrbitalPortfolioActive(true);
    vlog("✨ Entered Orbital Portfolio");
  }, [orbitalPortfolioReady, vlog]);

  const toggleOrbitalPortfolioPlayback = useCallback(() => {
    const next = !orbitalPortfolioPlayingRef.current;
    orbitalPortfolioPlayingRef.current = next;
    setOrbitalPortfolioPlaying(next);
    if (next) {
      orbitalPortfolioInspectedStationIndexRef.current = null;
      orbitalPortfolioInspectDistanceRef.current = null;
      orbitalPortfolioInspectStartedAtRef.current = 0;
      orbitalPortfolioAutoRef.current.lastAdvanceAt = performance.now();
      orbitalPortfolioManualCameraLockRef.current = false;
    } else {
      orbitalPortfolioAutoRef.current.pausedUntil = performance.now() + 10000;
    }
  }, []);

  const exitOrbitalPortfolioInspectMode = useCallback(
    (options?: { resumeOrbits?: boolean; keepManualControl?: boolean; reason?: string }) => {
      const resumeOrbits = options?.resumeOrbits ?? true;
      const keepManualControl = options?.keepManualControl ?? false;
      const hadInspectMode =
        orbitalPortfolioInspectedStationIndexRef.current !== null ||
        orbitalPortfolioManualCameraLockRef.current;
      const prevInspected = orbitalPortfolioInspectedStationIndexRef.current;
      orbitalPortfolioInspectedStationIndexRef.current = null;
      orbitalPortfolioInspectDistanceRef.current = null;
      orbitalPortfolioInspectStartedAtRef.current = 0;
      orbitalPortfolioManualCameraLockRef.current = keepManualControl;
      setOrbitalPortfolioHasActiveFocus(false);
      if (resumeOrbits) {
        orbitalPortfolioStationsRef.current.forEach((station) => {
          station.orbitMotionBlend = Math.max(station.orbitMotionBlend, 0.7);
        });
        orbitalPortfolioPlayingRef.current = true;
        setOrbitalPortfolioPlaying(true);
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
    [shipLog],
  );

  const focusOrbitalPortfolioCore = useCallback(
    (coreId: string) => {
      const core = orbitalPortfolioCoresByIdRef.current.get(coreId);
      if (!core) return;
      setOrbitalPortfolioFocusedCoreId(coreId);
      orbitalPortfolioManualCameraLockRef.current = false;
      orbitalPortfolioInspectedStationIndexRef.current = null;
      orbitalPortfolioInspectDistanceRef.current = null;
      orbitalPortfolioInspectStartedAtRef.current = 0;
      setOrbitalPortfolioHasActiveFocus(false);
      orbitalPortfolioPlayingRef.current = true;
      setOrbitalPortfolioPlaying(true);
      orbitalPortfolioAutoRef.current.lastAdvanceAt = performance.now();
      orbitalPortfolioAutoRef.current.pausedUntil = performance.now() + 800;
      shipLog(`Core focus: ${core.title}`, "info");
    },
    [shipLog],
  );

  const focusOrbitalPortfolioStation = useCallback(
    (
      stationIndex: number,
      mediaIndex?: number,
      options?: { autoplay?: boolean; variantIndex?: number },
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
      }
      orbitalPortfolioFocusIndexRef.current = next;
      setOrbitalPortfolioFocusIndex(next);
      setOrbitalPortfolioHasActiveFocus(true);
      const variantCount = Math.max(1, groups[next]?.variants?.length ?? 1);
      const forcedVariant =
        typeof options?.variantIndex === "number" && Number.isFinite(options.variantIndex)
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
      orbitalPortfolioInspectedStationIndexRef.current = next;
      orbitalPortfolioInspectStartedAtRef.current = performance.now();
      if (autoplayFocus) {
        orbitalPortfolioPlayingRef.current = true;
        setOrbitalPortfolioPlaying(true);
      } else {
        orbitalPortfolioPlayingRef.current = false;
        setOrbitalPortfolioPlaying(false);
        orbitalPortfolioAutoRef.current.pausedUntil = performance.now() + 12000;
      }
      orbitalPortfolioManualCameraLockRef.current = true;
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      if (!controls || !camera) return;
      const controlsAny = controls as unknown as {
        getTarget?: (out: THREE.Vector3) => void;
      };
      if (orbitalPortfolioInspectDistanceRef.current === null && controlsAny.getTarget) {
        const currentTarget = new THREE.Vector3();
        controlsAny.getTarget(currentTarget);
        const raw = camera.position.distanceTo(currentTarget);
        if (
          raw >= ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE &&
          raw <= ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE
        ) {
          orbitalPortfolioInspectDistanceRef.current = raw;
        }
      }
      const plateWorld = new THREE.Vector3();
      station.plate.getWorldPosition(plateWorld);
      const plateQuat = new THREE.Quaternion();
      station.plate.getWorldQuaternion(plateQuat);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(plateQuat).normalize();
      const savedDistance = orbitalPortfolioInspectDistanceRef.current;
      const inspectDistance =
        typeof savedDistance === "number" &&
        savedDistance >= ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE &&
        savedDistance <= ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE
          ? savedDistance
          : ORBITAL_PORTFOLIO_INSPECT_DEFAULT_DISTANCE;
      orbitalPortfolioInspectDistanceRef.current = inspectDistance;
      // Keep inspect framing straight-on to the slide face.
      const camPos = plateWorld.clone().addScaledVector(normal, inspectDistance);
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
    [shipLog],
  );

  function startProjectShowcaseAngleIntroSequence() {
    if (projectShowcaseAngleIntroRef.current.raf !== null) {
      cancelAnimationFrame(projectShowcaseAngleIntroRef.current.raf);
      projectShowcaseAngleIntroRef.current.raf = null;
    }
    // Start immediately at wall-parallel and open angle while moving.
    setProjectShowcaseAnglePercent(0);
    projectShowcasePlayingRef.current = true;
    setProjectShowcasePlaying(true);

    const angleAnimMs = 1100;
    const startedAt = performance.now();
    const tick = () => {
      if (!projectShowcaseActiveRef.current) {
        projectShowcaseAngleIntroRef.current.raf = null;
        return;
      }
      const elapsed = performance.now() - startedAt;
      if (elapsed >= angleAnimMs) {
        setProjectShowcaseAnglePercent(50);
        projectShowcaseAngleIntroRef.current.raf = null;
        return;
      }
      const t = THREE.MathUtils.clamp(elapsed / angleAnimMs, 0, 1);
      const eased = t * t * (3 - 2 * t);
      setProjectShowcaseAnglePercent(THREE.MathUtils.lerp(0, 50, eased));
      projectShowcaseAngleIntroRef.current.raf = requestAnimationFrame(tick);
    };
    projectShowcaseAngleIntroRef.current.raf = requestAnimationFrame(tick);
  }

  const startProjectShowcaseEntrySequence = useCallback(() => {
    if (projectShowcaseActiveRef.current) return;
    if (projectShowcaseEntrySequenceRef.current.active) return;
    const showcaseRoot = projectShowcaseRootRef.current;
    const controls = sceneRef.current.controls;
    const camera = sceneRef.current.camera;
    const track = projectShowcaseTrackRef.current;
    if (!showcaseRoot || !controls || !camera || !track) {
      enterProjectShowcase();
      return;
    }

    pendingProjectShowcaseEntryRef.current = false;
    projectShowcaseAwaitingProjectsArrivalRef.current = false;
    projectShowcaseSawProjectsTravelRef.current = false;
    projectShowcaseEntrySequenceRef.current.active = true;
    setProjectShowcaseEntryOverlayOpacity(0);
    showcaseRoot.visible = true;
    camera.layers.enable(PROJECT_SHOWCASE_LAYER);
    controls.enabled = false;
    setFollowingSpaceship(false);
    followingSpaceshipRef.current = false;
    setFollowingStarDestroyer(false);
    followingStarDestroyerRef.current = false;
    setInsideShip(false);
    insideShipRef.current = false;
    setShipViewMode("exterior");
    shipViewModeRef.current = "exterior";
    if (shipCinematicRef.current) {
      shipCinematicRef.current.active = false;
    }

    const rootPos = new THREE.Vector3();
    showcaseRoot.getWorldPosition(rootPos);
    const run = track.minRun + 10;
    const sway = Math.sin(run * 0.025) * 1.2;
    const travelAxis =
      track.axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const crossAxis =
      track.axis === "z" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1);
    const trenchCam = new THREE.Vector3();
    const trenchTarget = new THREE.Vector3();
    if (track.axis === "z") {
      trenchCam.set(
        rootPos.x + track.centerCross + sway,
        rootPos.y + track.cameraHeight,
        rootPos.z + run,
      );
      trenchTarget.set(
        rootPos.x + track.centerCross,
        rootPos.y + track.cameraHeight - 0.3,
        rootPos.z + run + track.lookAhead,
      );
    } else {
      trenchCam.set(
        rootPos.x + run,
        rootPos.y + track.cameraHeight,
        rootPos.z + track.centerCross + sway,
      );
      trenchTarget.set(
        rootPos.x + run + track.lookAhead,
        rootPos.y + track.cameraHeight - 0.3,
        rootPos.z + track.centerCross,
      );
    }

    const startCam = camera.position.clone();
    const startTarget = new THREE.Vector3();
    const controlsAny = controls as unknown as {
      getTarget?: (out: THREE.Vector3) => void;
    };
    if (controlsAny.getTarget) {
      controlsAny.getTarget(startTarget);
    } else {
      const fallbackDir = new THREE.Vector3();
      camera.getWorldDirection(fallbackDir);
      startTarget.copy(startCam).addScaledVector(fallbackDir, 24);
    }

    // Road-to-horizon style final: long, mostly level approach from behind.
    const finalApproachDist = track.lookAhead * 5.8;
    const approachCam = trenchCam
      .clone()
      .addScaledVector(travelAxis, -finalApproachDist)
      .addScaledVector(crossAxis, 1.2)
      .add(new THREE.Vector3(0, 14.0, 0));
    const approachTarget = trenchTarget
      .clone()
      .addScaledVector(travelAxis, -finalApproachDist * 0.26)
      .addScaledVector(crossAxis, 0.45)
      .add(new THREE.Vector3(0, 8.2, 0));
    // Hold a higher approach line so entry can descend like a carrier landing.
    const horizonY = Math.max(startCam.y, trenchCam.y + 13.2);
    approachCam.y = horizonY;
    approachTarget.y = horizonY - 1.2;

    const ship = spaceshipRef.current;
    if (ship) ship.visible = true;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const smoothstep = (t: number) => t * t * (3 - 2 * t);
    const durationMs = 4400;
    const phaseSplit = 0.84;
    const startedAt = performance.now();
    const tempCam = new THREE.Vector3();
    const tempTarget = new THREE.Vector3();
    vlog("🎬 Project Showcase entry sequence start");
    const tick = () => {
      if (!projectShowcaseEntrySequenceRef.current.active) return;
      const elapsed = performance.now() - startedAt;
      const t = THREE.MathUtils.clamp(elapsed / durationMs, 0, 1);
      if (t < phaseSplit) {
        const p = easeOutCubic(t / phaseSplit);
        tempCam.lerpVectors(startCam, approachCam, p);
        tempTarget.lerpVectors(startTarget, approachTarget, p);
      } else {
        const p = smoothstep((t - phaseSplit) / (1 - phaseSplit));
        tempCam.lerpVectors(approachCam, trenchCam, p);
        tempTarget.lerpVectors(approachTarget, trenchTarget, p);
      }
      controls.setLookAt(
        tempCam.x,
        tempCam.y,
        tempCam.z,
        tempTarget.x,
        tempTarget.y,
        tempTarget.z,
        false,
      );

      if (ship) {
        const shipForward = tempTarget.clone().sub(tempCam).normalize();
        const shipPos = tempCam
          .clone()
          .addScaledVector(shipForward, 8.4)
          .add(new THREE.Vector3(0, -1.8, 0));
        const glideNoseDown = THREE.MathUtils.lerp(-0.28, -0.06, t);
        const shipAim = shipPos
          .clone()
          .addScaledVector(shipForward, 18)
          .add(new THREE.Vector3(0, -glideNoseDown, 0));
        ship.position.copy(shipPos);
        const lookMat = new THREE.Matrix4();
        lookMat.lookAt(shipPos, shipAim, new THREE.Vector3(0, 1, 0));
        ship.quaternion.setFromRotationMatrix(lookMat);
        const forwardOffset = ship.userData?.forwardOffset as
          | THREE.Quaternion
          | undefined;
        if (forwardOffset) ship.quaternion.multiply(forwardOffset);
      }

      const nebulaFade = THREE.MathUtils.clamp((t - 0.06) / 0.58, 0, 1);
      applyProjectShowcaseNebulaFade(nebulaFade);

      if (t >= 1) {
        vlog("🎬 Project Showcase entry sequence complete");
        applyProjectShowcaseNebulaFade(1);
        enterProjectShowcase();
        setProjectShowcaseEntryOverlayOpacity(0);
        projectShowcaseEntrySequenceRef.current.active = false;
        projectShowcaseEntrySequenceRef.current.raf = null;
        return;
      }
      projectShowcaseEntrySequenceRef.current.raf = requestAnimationFrame(tick);
    };

    projectShowcaseEntrySequenceRef.current.raf = requestAnimationFrame(tick);
  }, [
    enterProjectShowcase,
    setFollowingStarDestroyer,
    setProjectShowcaseEntryOverlayOpacity,
  ]);

  const startProjectShowcaseExitSequence = useCallback(
    (targetId: string, targetType: "section" | "moon") => {
      projectShowcaseQueuedNavRef.current = { targetId, targetType };
      if (projectShowcaseExitSequenceRef.current.active) return true;
      if (!projectShowcaseActiveRef.current) return false;

      const showcaseRoot = projectShowcaseRootRef.current;
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      const track = projectShowcaseTrackRef.current;
      if (!showcaseRoot || !controls || !camera || !track) {
        exitProjectShowcase();
        return false;
      }

      if (projectShowcaseEntrySequenceRef.current.raf !== null) {
        cancelAnimationFrame(projectShowcaseEntrySequenceRef.current.raf);
        projectShowcaseEntrySequenceRef.current.raf = null;
      }
      projectShowcaseEntrySequenceRef.current.active = false;
      projectShowcaseExitSequenceRef.current.active = true;
      setFollowingSpaceship(false);
      followingSpaceshipRef.current = false;
      setInsideShip(false);
      insideShipRef.current = false;
      setShipViewMode("exterior");
      shipViewModeRef.current = "exterior";
      if (shipCinematicRef.current) {
        shipCinematicRef.current.active = false;
      }

      projectShowcasePlayingRef.current = false;
      setProjectShowcasePlaying(false);
      projectShowcaseVelocityRef.current = 0;
      projectShowcaseJumpTargetRef.current = null;

      const rootPos = new THREE.Vector3();
      showcaseRoot.getWorldPosition(rootPos);
      const startCam = camera.position.clone();
      const startTarget = new THREE.Vector3();
      const controlsAny = controls as unknown as {
        getTarget?: (out: THREE.Vector3) => void;
      };
      if (controlsAny.getTarget) {
        controlsAny.getTarget(startTarget);
      } else {
        startTarget
          .copy(startCam)
          .add(track.axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0))
          .add(new THREE.Vector3(0, -1.2, 0));
      }
      const flightDir = startTarget.clone().sub(startCam).normalize();
      if (flightDir.lengthSq() < 1e-4) {
        flightDir.copy(track.axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0));
      }

      const pullUpCam = startCam
        .clone()
        .addScaledVector(flightDir, track.lookAhead * 0.95)
        .add(new THREE.Vector3(0, 12, 0));
      const pullUpTarget = startTarget
        .clone()
        .addScaledVector(flightDir, track.lookAhead * 1.8)
        .add(new THREE.Vector3(0, 2, 0));
      const jumpCam = pullUpCam
        .clone()
        .addScaledVector(flightDir, track.lookAhead * 2.35)
        .add(new THREE.Vector3(0, 10, 0));
      const jumpTarget = jumpCam
        .clone()
        .addScaledVector(flightDir, track.lookAhead * 2.5)
        .add(new THREE.Vector3(0, 1, 0));
      const ship = spaceshipRef.current;
      if (ship) ship.visible = true;
      applyProjectShowcaseNebulaFade(1);

      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
      const smoothstep = (t: number) => t * t * (3 - 2 * t);
      const durationMs = 2400;
      const split = 0.62;
      const startedAt = performance.now();
      const tempCam = new THREE.Vector3();
      const tempTarget = new THREE.Vector3();
      vlog("🎬 Project Showcase exit sequence start");
      const tick = () => {
        if (!projectShowcaseExitSequenceRef.current.active) return;
        const elapsed = performance.now() - startedAt;
        const t = THREE.MathUtils.clamp(elapsed / durationMs, 0, 1);
        if (t < split) {
          const p = easeOutCubic(t / split);
          tempCam.lerpVectors(startCam, pullUpCam, p);
          tempTarget.lerpVectors(startTarget, pullUpTarget, p);
        } else {
          const p = smoothstep((t - split) / (1 - split));
          tempCam.lerpVectors(pullUpCam, jumpCam, p);
          tempTarget.lerpVectors(pullUpTarget, jumpTarget, p);
        }
        controls.setLookAt(
          tempCam.x,
          tempCam.y,
          tempCam.z,
          tempTarget.x,
          tempTarget.y,
          tempTarget.z,
          false,
        );
        if (ship) {
          const shipForward = tempTarget.clone().sub(tempCam).normalize();
          const shipPos = tempCam
            .clone()
            .addScaledVector(shipForward, 8.8)
            .add(new THREE.Vector3(0, -2.0, 0));
          const climbNoseUp = THREE.MathUtils.lerp(1.4, 5.2, t);
          const shipAim = shipPos
            .clone()
            .addScaledVector(shipForward, 18)
            .add(new THREE.Vector3(0, climbNoseUp, 0));
          ship.position.copy(shipPos);
          const lookMat = new THREE.Matrix4();
          lookMat.lookAt(shipPos, shipAim, new THREE.Vector3(0, 1, 0));
          ship.quaternion.setFromRotationMatrix(lookMat);
          const forwardOffset = ship.userData?.forwardOffset as
            | THREE.Quaternion
            | undefined;
          if (forwardOffset) ship.quaternion.multiply(forwardOffset);
        }

        if (t >= 1) {
          projectShowcaseExitSequenceRef.current.active = false;
          projectShowcaseExitSequenceRef.current.raf = null;
          const queued = projectShowcaseQueuedNavRef.current;
          projectShowcaseQueuedNavRef.current = null;
          exitProjectShowcase();
          setProjectShowcaseEntryOverlayOpacity(0);
          if (queued) {
            setFollowingSpaceship(true);
            followingSpaceshipRef.current = true;
            if (!manualFlightModeRef.current) {
              handleAutopilotNavigation(queued.targetId, queued.targetType);
            } else {
              const fallbackTarget =
                queued.targetType === "moon"
                  ? `experience-${queued.targetId}`
                  : queued.targetId;
              handleNavigationRef.current?.(fallbackTarget);
            }
          }
          vlog("🎬 Project Showcase exit sequence complete");
          return;
        }
        projectShowcaseExitSequenceRef.current.raf = requestAnimationFrame(tick);
      };

      projectShowcaseExitSequenceRef.current.raf = requestAnimationFrame(tick);
      return true;
    },
    [
      exitProjectShowcase,
      handleAutopilotNavigation,
      setProjectShowcaseEntryOverlayOpacity,
      vlog,
    ],
  );

  const focusSkillsLatticeNode = useCallback(
    (node: SkillsLatticeNodeRecord, animate = true) => {
      skillsLatticeSelectedNodeRef.current = node;
      setSkillsLatticeSelection({
        label: node.label,
        nodeType: node.nodeType,
        category: node.category,
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
      const nextCam = worldPos.clone().addScaledVector(dir, 62).add(new THREE.Vector3(0, 9, 0));
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
    const lookMat = new THREE.Matrix4().lookAt(sd.position, lookAtPos, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(lookMat);
    const forwardOffset = sd.userData?.forwardOffset as THREE.Quaternion | undefined;
    if (forwardOffset) q.multiply(forwardOffset);
    sd.quaternion.copy(q);
    sd.visible = true;
    const readabilityKey = sd.userData.readabilityKey as THREE.PointLight | undefined;
    const readabilityRim = sd.userData.readabilityRim as THREE.PointLight | undefined;
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

  const setExternalCosmosLabelsHiddenForLattice = useCallback((hidden: boolean) => {
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
  }, []);

  const setExternalCosmosLabelsHiddenForAbout = useCallback((hidden: boolean) => {
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
  }, []);

  const exitSkillsLattice = useCallback((options?: {
    restoreShip?: boolean;
    clearSystem?: boolean;
  }) => {
    const restoreShip = options?.restoreShip ?? true;
    const clearSystem = options?.clearSystem ?? true;
    const latticeRoot = skillsLatticeRootRef.current;
    const latticeBeacon = skillsLatticeBeaconRef.current;
    const camera = sceneRef.current.camera;
    const controls = sceneRef.current.controls;
    if (latticeRoot) latticeRoot.visible = false;
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
    const prev = skillsLatticePrevStateRef.current;
    if (restoreShip && prev) {
      setFollowingSpaceship(prev.followingSpaceship);
      followingSpaceshipRef.current = prev.followingSpaceship;
      if (spaceshipRef.current) {
        spaceshipRef.current.visible = prev.shipVisible;
      }
      if (controls) controls.enabled = prev.controlsEnabled;
    } else if (restoreShip) {
      setFollowingSpaceship(true);
      followingSpaceshipRef.current = true;
      if (spaceshipRef.current) spaceshipRef.current.visible = true;
      if (controls) controls.enabled = true;
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
    vlog("🧠 Skills lattice exited");
  }, [setExternalCosmosLabelsHiddenForLattice, setSkillsNavHereActive, vlog]);

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
    if (!skillsLatticeSystemActiveRef.current || !skillsLatticePrevStateRef.current) {
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
    const worldAllPoints = skillsLatticeNodesRef.current
      .map((n) => n.mesh.getWorldPosition(new THREE.Vector3()));

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

    const revealCam = centroid.clone().addScaledVector(planeNormal, finalDistance * 0.78);
    const revealTarget = centroid.clone().add(new THREE.Vector3(0, 2, 0));
    const finalCam = centroid.clone().addScaledVector(planeNormal, finalDistance);
    const finalTarget = centroid.clone().add(new THREE.Vector3(0, 2, 0));
    const startedAt = performance.now();
    const durationMs = 7000;
    controls.enabled = false;
    const cam = new THREE.Vector3();
    const target = new THREE.Vector3();
    const smooth = (u: number) => u * u * (3 - 2 * u);

    const tick = () => {
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
      controls.setLookAt(cam.x, cam.y, cam.z, target.x, target.y, target.z, false);
      if (t >= 1) {
        controls.enabled = true;
        skillsLatticeActiveRef.current = true;
        setSkillsLatticeActive(true);
        skillsLatticeSelectedNodeRef.current = null;
        setSkillsLatticeSelection(null);
        vlog("🧠 Skills lattice entered");
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [placeStarDestroyerNearSkills, setExternalCosmosLabelsHiddenForLattice, setSkillsNavHereActive, vlog]);

  const resumeSkillsLatticeInPlace = useCallback(() => {
    if (!skillsLatticeSystemActiveRef.current || skillsLatticeActiveRef.current) return;
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
    skillsLatticeActiveRef.current = true;
    setSkillsLatticeActive(true);
    setSkillsNavHereActive(true);
  }, [setExternalCosmosLabelsHiddenForLattice, setSkillsNavHereActive]);

  const cancelAboutMemorySquareEntrySequence = useCallback(() => {
    const seq = aboutMemorySquareEntrySequenceRef.current;
    if (seq.raf !== null) {
      cancelAnimationFrame(seq.raf);
      seq.raf = null;
    }
    seq.active = false;
  }, []);

  const enterAboutMemorySquare = useCallback(() => {
    if (aboutMemorySquareActiveRef.current || aboutMemorySquareEntrySequenceRef.current.active) {
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
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQuat).normalize();
    const startCam = camera.position.clone();
    const startDir = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const startTarget = startCam.clone().addScaledVector(startDir, 1200);
    const finalCam = center.clone()
      .addScaledVector(normal, ABOUT_MEMORY_SQUARE_CAMERA_STOP_DIST)
      .add(new THREE.Vector3(0, 68, 0));
    const finalTarget = center.clone().add(new THREE.Vector3(0, 34, 0));
    const controlCam = startCam.clone()
      .lerp(finalCam, 0.5)
      .addScaledVector(normal, 180)
      .add(new THREE.Vector3(0, 260, 0));
    const controlTarget = startTarget.clone()
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
      controls.setLookAt(cam.x, cam.y, cam.z, target.x, target.y, target.z, false);
      if (t >= 1) {
        controls.enabled = true;
        seq.active = false;
        seq.raf = null;
        vlog("👨‍🚀 About memory square entered");
        shipLog(
          `ABOUTDBG arrival phase=${aboutCellAnimationRef.current.phase} prepared=${aboutSlidePreparedIndexRef.current + 1} ready=${aboutSlideReadyRef.current ? 1 : 0} mats=${aboutTileContentMatsRef.current.length} maps=${
            aboutTileContentMatsRef.current.slice(0, 4).map((m) => (m?.map ? "1" : "0")).join("")
          }`,
          "nav",
        );
        return;
      }
      seq.raf = requestAnimationFrame(tick);
    };
    seq.raf = requestAnimationFrame(tick);
  }, [setExternalCosmosLabelsHiddenForAbout, shipLog, vlog]);

  const getProjectShowcaseStopRunForIndex = useCallback((index: number) => {
    const panels = projectShowcasePanelsRef.current;
    if (panels.length === 0) return 0;
    const safeIndex = THREE.MathUtils.clamp(index, 0, panels.length - 1);
    const track = projectShowcaseTrackRef.current;
    const minRun = track ? track.minRun + 10 : -Infinity;
    const maxRun = track ? track.maxRun - 10 : Infinity;
    const current = panels[safeIndex].runPos;
    const prev = safeIndex > 0 ? panels[safeIndex - 1].runPos : undefined;
    const next =
      safeIndex < panels.length - 1 ? panels[safeIndex + 1].runPos : undefined;
    const lowerBound =
      prev !== undefined ? (prev + current) * 0.5 + 0.02 : minRun;
    const upperBound =
      next !== undefined ? (current + next) * 0.5 - 0.02 : maxRun;
    return THREE.MathUtils.clamp(
      current - PROJECT_SHOWCASE_NAV_STOP_BACK_OFFSET,
      Math.max(minRun, lowerBound),
      Math.min(maxRun, upperBound),
    );
  }, []);

  const stepProjectShowcaseFocus = useCallback(
    (direction: -1 | 1) => {
      const panels = projectShowcasePanelsRef.current;
      if (panels.length === 0) return;
      projectShowcaseJumpTargetRef.current = null;
      const current = projectShowcaseFocusIndexRef.current;
      const next =
        (current + direction + panels.length) % panels.length;
      projectShowcaseForcedFocusIndexRef.current = next;
      setProjectShowcaseFocus(next);
      setProjectShowcaseRunPosition(getProjectShowcaseStopRunForIndex(next));
    },
    [
      getProjectShowcaseStopRunForIndex,
      setProjectShowcaseFocus,
      setProjectShowcaseRunPosition,
    ],
  );

  const jumpProjectShowcaseToIndex = useCallback(
    (index: number) => {
      const panels = projectShowcasePanelsRef.current;
      if (panels.length === 0) return;
      const safeIndex = THREE.MathUtils.clamp(index, 0, panels.length - 1);
      projectShowcasePlayingRef.current = false;
      setProjectShowcasePlaying(false);
      projectShowcaseVelocityRef.current = 0;
      projectShowcaseJumpTargetRef.current = null;
      projectShowcaseLeverDraggingRef.current = false;
      projectShowcaseLeverFlickRef.current = 0;
      projectShowcaseLeverLastSampleRef.current = null;
      setProjectShowcaseLever(0);
      projectShowcaseForcedFocusIndexRef.current = safeIndex;
      projectShowcaseJumpTargetRef.current =
        getProjectShowcaseStopRunForIndex(safeIndex);
    },
    [getProjectShowcaseStopRunForIndex, setProjectShowcaseLever],
  );

  const handleExperienceCompanyNavigation = useCallback(
    async (companyId: string) => {
      if (!companyId) return;

      // When launched from About context, force a clean handoff back to normal
      // flight mode before routing to moon destinations.
      aboutMemorySquarePendingEntryRef.current = false;
      aboutMemorySquareActiveRef.current = false;
      aboutMemorySquareNavIntentUntilRef.current = 0;
      setAboutNavHereActive(false);
      setProjectsNavHereActive(false);
      setExternalCosmosLabelsHiddenForAbout(false);
      cancelAboutMemorySquareEntrySequence();
      setFollowingSpaceship(true);
      followingSpaceshipRef.current = true;
      setInsideShip(false);
      insideShipRef.current = false;
      setShipViewMode("exterior");
      shipViewModeRef.current = "exterior";
      if (spaceshipRef.current) spaceshipRef.current.visible = true;
      setSkillsNavHereActive(false);

      if (startProjectShowcaseExitSequence(companyId, "moon")) {
        return;
      }

      // If already orbiting this moon, ignore — don't re-trigger orbit.
      // Clicking the same moon you're hovering over should be a no-op.
      if (isOrbiting() && focusedMoonRef.current) {
        const focusedName = focusedMoonRef.current.userData?.planetName;
        if (focusedName) {
          const focusedId = focusedName.toLowerCase().replace(/\s+/g, "-");
          if (focusedId === companyId) {
            debugLog("nav", `Ignored click on same moon "${companyId}" — already orbiting`);
            return;
          }
        }
      }

      vlog(`🌙 Initiating moon navigation: ${companyId}`);

      // Exit orbit if currently orbiting (different moon)
      if (isOrbiting()) {
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
      handleAutopilotNavigation,
      isOrbiting,
      exitOrbit,
      shipLog,
      debugLog,
      captureMoonDepartureContext,
      startProjectShowcaseExitSequence,
      setExternalCosmosLabelsHiddenForAbout,
      cancelAboutMemorySquareEntrySequence,
      setAboutNavHereActive,
      setSkillsNavHereActive,
    ],
  );

  const handleQuickNav = useCallback(
    (targetId: string, targetType: "section" | "moon") => {
      if (targetType === "section" && targetId === "about") {
        aboutMemorySquarePendingEntryRef.current = true;
        aboutMemorySquareActiveRef.current = false;
        aboutMemorySquareNavIntentUntilRef.current = performance.now() + 20000;
        setProjectsNavHereActive(false);
        setSkillsNavHereActive(false);
      } else if (targetType === "section" && targetId === "projects") {
        setProjectsNavHereActive(true);
        setSkillsNavHereActive(false);
      } else if (targetType === "section" && (targetId === "skills" || targetId === SKILLS_LATTICE_NAV_ID)) {
        setSkillsNavHereActive(true);
        setProjectsNavHereActive(false);
      } else if (targetType === "section" && targetId !== "about") {
        aboutMemorySquarePendingEntryRef.current = false;
        aboutMemorySquareActiveRef.current = false;
        aboutMemorySquareNavIntentUntilRef.current = 0;
        setAboutNavHereActive(false);
        if (targetId !== "projects") {
          setProjectsNavHereActive(false);
        }
        if (targetId !== "skills" && targetId !== SKILLS_LATTICE_NAV_ID) {
          setSkillsNavHereActive(false);
        }
        setExternalCosmosLabelsHiddenForAbout(false);
        cancelAboutMemorySquareEntrySequence();
      }
      if (startProjectShowcaseExitSequence(targetId, targetType)) {
        return;
      }
      // Exit orbit if currently orbiting
      if (isOrbiting()) {
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
      isOrbiting,
      exitOrbit,
      shipLog,
      captureMoonDepartureContext,
      startProjectShowcaseExitSequence,
      cancelAboutMemorySquareEntrySequence,
      setExternalCosmosLabelsHiddenForAbout,
      setAboutNavHereActive,
      setProjectsNavHereActive,
      setSkillsNavHereActive,
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
      console.log(lines.join("\n"));
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        active = !active;
        orbitDebug.active = active;
        if (active) {
          orbitDebug.reset();
          shipLog("ORBIT DEBUG ON — W/S alt, A/D behind, Q/E above, R/F pitch, T/G tilt, F9 dump", "info");
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
        case "w": orbitDebug.altitudeMult += STEP_SMALL; break;
        case "s": orbitDebug.altitudeMult = Math.max(0.05, orbitDebug.altitudeMult - STEP_SMALL); break;
        case "a": orbitDebug.camBehind += STEP_SMALL; break;
        case "d": orbitDebug.camBehind = Math.max(0.05, orbitDebug.camBehind - STEP_SMALL); break;
        case "q": orbitDebug.camAbove += STEP_SMALL; break;
        case "e": orbitDebug.camAbove = Math.max(0, orbitDebug.camAbove - STEP_SMALL); break;
        case "r": orbitDebug.pitchBlend = Math.min(1, orbitDebug.pitchBlend + STEP_SMALL); break;
        case "f": orbitDebug.pitchBlend = Math.max(0, orbitDebug.pitchBlend - STEP_SMALL); break;
        case "t": orbitDebug.noseTilt -= STEP_TILT; break;
        case "g": orbitDebug.noseTilt += STEP_TILT; break;
        default: changed = false;
      }

      if (changed) {
        e.preventDefault();
        debugLog("orbitDbg",
          `alt=${orbitDebug.altitudeMult.toFixed(3)} behind=${orbitDebug.camBehind.toFixed(3)} above=${orbitDebug.camAbove.toFixed(3)} pitch=${orbitDebug.pitchBlend.toFixed(3)} tilt=${orbitDebug.noseTilt.toFixed(2)}`
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
  // When the intro cinematic reaches "hover", auto-engage ship mode
  // (no more choice between "Use Falcon" / "Freely Explore").
  useEffect(() => {
    if (shipUIPhase !== "hidden") return;
    const check = setInterval(() => {
      if (
        shipCinematicRef.current?.active &&
        shipCinematicRef.current.phase === "hover"
      ) {
        clearInterval(check);
        // Auto-engage the ship — same as the old handleUseShip path
        // Keep cinematic hover active so the Falcon continues a subtle
        // motion after entering frame, instead of freezing immediately.
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        setInsideShip(false);
        insideShipRef.current = false;
        setShipViewMode("exterior");
        shipViewModeRef.current = "exterior";
        setShipUIPhase("ship-engaged");

        // Keep camera fixed at intro settle while Falcon performs pickup
        // approach. Avoid auto-follow snap here; handoff happens later.
      }
    }, 500);
    return () => clearInterval(check);
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
        console.log("🔺 shadowSD engaged — camera now follows Star Destroyer");
        console.log("   Orbit drag to change angle, scroll to zoom");
      }
      return true;
    },
    [setFollowingSpaceship, setInsideShip, shipLog],
  );

  const disengageShadowSD = useCallback(
    (source: "console" | "tool" | "system" = "system") => {
      if (!shadowSDModeRef.current) {
        if (source === "console") {
          console.log("⚠️ unShadowSD() ignored — shadowSD not active");
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
        console.log("🔺 unShadowSD complete — SD camera lock released");
      }
      return true;
    },
    [shipLog],
  );

  const handleStarDestroyerClick = useCallback(() => {
    // Only allow when aboard the Falcon
    if (!followingSpaceshipRef.current && !insideShipRef.current) {
      vlog("🔺 Must be aboard the Falcon to escort the Star Destroyer");
      return;
    }
    if (!starDestroyerRef.current || !spaceshipRef.current) return;

    // Cancel any active cinematic or navigation
    if (shipCinematicRef.current) {
      shipCinematicRef.current.active = false;
    }

    setFollowingStarDestroyer(true);
    followingStarDestroyerRef.current = true;
    vlog("🔺 Engaging Star Destroyer escort — matching course and speed");
  }, [vlog]);

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
      { id: "locate-falcon", label: "locateFalcon()", hint: "Beacon to Millennium Falcon", onRun: () => invoke("locateFalcon") },
      { id: "locate-sd", label: "locateSD()", hint: "Beacon to Star Destroyer", onRun: () => invoke("locateSD") },
      { id: "shadow-sd", label: "shadowSD()", hint: "Lock camera to Star Destroyer", onRun: () => invoke("shadowSD") },
      { id: "unshadow-sd", label: "unShadowSD()", hint: "Release SD camera lock", onRun: () => invoke("unShadowSD") },
      { id: "sd-status", label: "sdStatus()", hint: "Print SD status to console", onRun: () => invoke("sdStatus") },
      { id: "sd-on", label: "sdAutonomyOn()", hint: "Enable SD autonomy", onRun: () => invoke("sdAutonomyOn") },
      { id: "sd-off", label: "sdAutonomyOff()", hint: "Disable SD autonomy", onRun: () => invoke("sdAutonomyOff") },
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
      { id: "debug-cam", label: "debugCamera()", hint: "Enter free debug camera mode", onRun: () => invoke("debugCamera") },
      { id: "debug-cam-exit", label: "exitDebugCamera()", hint: "Exit debug camera mode", onRun: () => invoke("exitDebugCamera") },
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
            shipLog("No moon visit content loaded yet for drone summon", "error");
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
            shipLog("inspectMoonDrone() only works during moon visits", "error");
            return;
          }
          setDroneInspectMode(true);
          setDroneSummonNonce((prev) => prev + 1);
          shipLog("Moon drone inspect mode active", "orbit");
        },
      },
    ];
  }, [orbitPhase, overlayContent, shipLog]);

  // ── Cockpit destination navigation ─────────────────
  const handleCockpitNavigate = useCallback(
    (targetId: string, targetType: "section" | "moon") => {
      vlog(`🎯 Cockpit nav → ${targetType}: ${targetId}`);
      if (targetId !== "about") {
        aboutMemorySquarePendingEntryRef.current = false;
        aboutMemorySquareActiveRef.current = false;
        aboutMemorySquareNavIntentUntilRef.current = 0;
        setAboutNavHereActive(false);
        setExternalCosmosLabelsHiddenForAbout(false);
        cancelAboutMemorySquareEntrySequence();
      }
      if (targetId !== "projects" && targetId !== PROJECT_SHOWCASE_NAV_ID) {
        setProjectsNavHereActive(false);
      }
      if (targetId !== "portfolio" && targetId !== ORBITAL_PORTFOLIO_NAV_ID) {
        setPortfolioNavHereActive(false);
      }
      if (targetId !== "skills" && targetId !== SKILLS_LATTICE_NAV_ID) {
        setSkillsNavHereActive(false);
      }
      if (targetId !== "skills" && targetId !== SKILLS_LATTICE_NAV_ID) {
        skillsLatticePendingEntryRef.current = false;
      }
      const leavingSkillsLattice =
        (skillsLatticeActiveRef.current || skillsLatticeSystemActiveRef.current) &&
        targetId !== "skills";
      if (leavingSkillsLattice) {
        exitSkillsLattice({ restoreShip: true, clearSystem: true });
        // Ensure autopilot can start immediately for non-Projects targets too.
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        setInsideShip(false);
        insideShipRef.current = false;
        setShipViewMode("exterior");
        shipViewModeRef.current = "exterior";
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
      }
      if (
        orbitalPortfolioActiveRef.current &&
        targetId !== "portfolio" &&
        targetId !== ORBITAL_PORTFOLIO_NAV_ID
      ) {
        exitOrbitalPortfolio();
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        setInsideShip(false);
        insideShipRef.current = false;
        setShipViewMode("exterior");
        shipViewModeRef.current = "exterior";
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
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
          handleQuickNav("skills", "section");
          vlog("🧠 Routing to Skills — lattice will open on arrival");
        }
        return;
      }
      if (targetId === "about") {
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
        const alreadyNearAbout = !!aboutAnchor
          && !!ship
          && ship.position.distanceTo(aboutAnchor) <= ABOUT_MEMORY_SQUARE_ENTRY_TRIGGER_DIST;
        if (alreadyNearAbout) {
          enterAboutMemorySquare();
        } else {
          handleQuickNav("about", "section");
          vlog("👨‍🚀 Routing to About memory square");
        }
        return;
      }
      if (targetId === "projects" || targetId === PROJECT_SHOWCASE_NAV_ID) {
        setProjectsNavHereActive(true);
        if (!projectShowcaseReady) {
          vlog("⚠️ Project Showcase is loading");
          return;
        }
        setFollowingSpaceship(true);
        followingSpaceshipRef.current = true;
        setInsideShip(false);
        insideShipRef.current = false;
        setShipViewMode("exterior");
        shipViewModeRef.current = "exterior";
        if (spaceshipRef.current) spaceshipRef.current.visible = true;
        if (projectShowcaseActiveRef.current) {
          exitProjectShowcase();
          return;
        }

        const trenchAnchor = projectShowcaseWorldAnchorRef.current;
        const shipPos = spaceshipRef.current?.position;
        const nearTrenchAnchor =
          !!trenchAnchor &&
          !!shipPos &&
          shipPos.distanceTo(trenchAnchor) <= PROJECT_SHOWCASE_NEAR_ANCHOR_DIST;
        const atProjects =
          currentNavigationTarget === "projects" &&
          navigationDistance === null &&
          nearTrenchAnchor;
        if (atProjects) {
          projectShowcaseAwaitingProjectsArrivalRef.current = false;
          projectShowcaseSawProjectsTravelRef.current = false;
          pendingProjectShowcaseEntryRef.current = true;
          startProjectShowcaseEntrySequence();
        } else {
          pendingProjectShowcaseEntryRef.current = true;
          projectShowcaseAwaitingProjectsArrivalRef.current = true;
          projectShowcaseSawProjectsTravelRef.current = false;
          handleQuickNav("projects", "section");
          vlog("🛰️ Routing to Projects — Project Showcase will open on arrival");
        }
        return;
      }
      if (targetId === "portfolio" || targetId === ORBITAL_PORTFOLIO_NAV_ID) {
        setPortfolioNavHereActive(true);
        if (!orbitalPortfolioReady) {
          vlog("⚠️ Orbital Portfolio is loading");
          return;
        }
        if (projectShowcaseActiveRef.current) {
          exitProjectShowcase();
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
          shipPos.distanceTo(portfolioAnchor) <= ORBITAL_PORTFOLIO_NEAR_ANCHOR_DIST;
        const atPortfolio =
          currentNavigationTarget === "portfolio" &&
          navigationDistance === null &&
          nearPortfolioAnchor;
        if (atPortfolio) {
          enterOrbitalPortfolio();
        } else {
          handleQuickNav("portfolio", "section");
          vlog("✨ Routing to Portfolio — Orbital Registry will open on arrival");
        }
        return;
      }

      if (targetType === "moon") {
        handleExperienceCompanyNavigation(targetId);
      } else {
        // Route section nav through the unified quick-nav path so orbit-exit
        // clearance/deferred navigation is always honored.
        handleQuickNav(targetId, "section");
      }
    },
    [
      currentNavigationTarget,
      navigationDistance,
      projectShowcaseReady,
      orbitalPortfolioReady,
      enterSkillsLattice,
      handleExperienceCompanyNavigation,
      handleQuickNav,
      placeStarDestroyerNearSkills,
      startProjectShowcaseEntrySequence,
      exitSkillsLattice,
      exitProjectShowcase,
      enterOrbitalPortfolio,
      exitOrbitalPortfolio,
      setExternalCosmosLabelsHiddenForAbout,
      setAboutNavHereActive,
      setProjectsNavHereActive,
      setPortfolioNavHereActive,
      setSkillsNavHereActive,
      vlog,
    ],
  );

  useEffect(() => {
    if (
      !pendingProjectShowcaseEntryRef.current ||
      projectShowcaseActiveRef.current ||
      projectShowcaseEntrySequenceRef.current.active
    ) {
      return;
    }

    if (projectShowcaseAwaitingProjectsArrivalRef.current) {
      if (currentNavigationTarget === "projects" && navigationDistance !== null) {
        projectShowcaseSawProjectsTravelRef.current = true;
      }
      if (
        projectShowcaseSawProjectsTravelRef.current &&
        navigationDistance === null
      ) {
        startProjectShowcaseEntrySequence();
      }
      return;
    }

    if (navigationDistance === null) {
      startProjectShowcaseEntrySequence();
    }
  }, [
    currentNavigationTarget,
    navigationDistance,
    startProjectShowcaseEntrySequence,
  ]);

  useEffect(() => {
    if (orbitalPortfolioActiveRef.current) return;
    if (!portfolioNavHereActive) return;
    if (!orbitalPortfolioReady) return;
    if (currentNavigationTarget !== "portfolio") return;
    if (navigationDistance !== null) return;
    const ship = spaceshipRef.current;
    const anchor = orbitalPortfolioWorldAnchorRef.current;
    const arrived =
      !!ship &&
      !!anchor &&
      ship.position.distanceTo(anchor) <= ORBITAL_PORTFOLIO_NEAR_ANCHOR_DIST;
    if (!arrived) return;
    enterOrbitalPortfolio();
  }, [
    currentNavigationTarget,
    navigationDistance,
    portfolioNavHereActive,
    orbitalPortfolioReady,
    enterOrbitalPortfolio,
  ]);

  useEffect(() => {
    if (!skillsLatticePendingEntryRef.current || skillsLatticeActiveRef.current) {
      return;
    }
    const ship = spaceshipRef.current;
    const anchor = skillsLatticeWorldAnchorRef.current;
    const arrivedAtSkills = !!ship
      && !!anchor
      && ship.position.distanceTo(anchor) <= SKILLS_LATTICE_ENTRY_TRIGGER_DIST
      && navigationDistance === null;
    if (arrivedAtSkills) {
      // Continuous handoff: lightspeed ends outside shell and immediately
      // transitions to non-ship glide into lattice (no artificial pause).
      setFollowingSpaceship(false);
      followingSpaceshipRef.current = false;
      if (spaceshipRef.current) spaceshipRef.current.visible = false;
      enterSkillsLattice();
    }
  }, [currentNavigationTarget, navigationDistance, enterSkillsLattice]);

  useEffect(() => {
    if (
      aboutMemorySquareActiveRef.current
      || aboutMemorySquareEntrySequenceRef.current.active
    ) {
      return;
    }
    const ship = spaceshipRef.current;
    const anchor = aboutMemorySquareWorldAnchorRef.current;
    if (!ship || !anchor) return;
    const nearAbout = ship.position.distanceTo(anchor) <= ABOUT_MEMORY_SQUARE_ENTRY_TRIGGER_DIST;
    if (!nearAbout) return;
    const now = performance.now();
    const hasIntent =
      currentNavigationTarget === "about" || now <= aboutMemorySquareNavIntentUntilRef.current;
    if (!hasIntent || navigationDistance !== null) return;
    enterAboutMemorySquare();
  }, [currentNavigationTarget, navigationDistance, enterAboutMemorySquare]);

  useEffect(() => {
    const prev = aboutMemorySquarePrevNavTargetRef.current;
    if (
      prev === "about"
      && currentNavigationTarget === null
      && !aboutMemorySquareActiveRef.current
      && !aboutMemorySquareEntrySequenceRef.current.active
      && performance.now() <= aboutMemorySquareNavIntentUntilRef.current
    ) {
      enterAboutMemorySquare();
    }
    aboutMemorySquarePrevNavTargetRef.current = currentNavigationTarget;
  }, [currentNavigationTarget, enterAboutMemorySquare]);

  useEffect(() => {
    if (currentNavigationTarget === "about") {
      aboutMemorySquareNavIntentUntilRef.current = performance.now() + 20000;
    }
  }, [currentNavigationTarget]);

  useEffect(() => {
    if (isLoading || !sceneReady) return;
    if (!introStartQueuedRef.current || introStartConsumedRef.current) return;
    const startIntro = startIntroSequenceRef.current;
    if (!startIntro) return;
    let fadeRaf = 0;
    setCosmosIntroOverlayOpacity(0.42);
    const fadeStartedAt = performance.now();
    const fadeDurationMs = 2000;
    const tickFade = () => {
      const t = THREE.MathUtils.clamp(
        (performance.now() - fadeStartedAt) / fadeDurationMs,
        0,
        1,
      );
      const ease = 1 - Math.pow(1 - t, 3);
      setCosmosIntroOverlayOpacity(THREE.MathUtils.lerp(0.42, 0, ease));
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
    if (CAMERA_TRACE_ENABLED) {
      shipLog("[CAMTRACE] invoking camera-intro start + fade start", "info");
    }
    startIntro();
    return () => {
      if (fadeRaf) cancelAnimationFrame(fadeRaf);
    };
  }, [isLoading, sceneReady, shipLog]);

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

    const rafId = window.requestAnimationFrame(() => {
      const destinationsEl = startupDestinationsPanelRef.current;
      const consoleEl = startupConsoleButtonRef.current;
      const miniMapEl = startupMiniMapContainerRef.current;
      if (!destinationsEl || !consoleEl || !miniMapEl) return;
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
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [clearStartupUiRevealTimeline]);

  useEffect(() => () => clearStartupUiRevealTimeline(), [clearStartupUiRevealTimeline]);

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
      } else if (projectShowcaseActiveRef.current) {
        driver = "project-showcase-loop";
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

  const goToAboutSlide = useCallback((direction: -1 | 1) => {
    if (aboutSlides.length === 0) return;
    setAboutActiveSlideIndex((prev) => {
      const total = aboutSlides.length;
      return (prev + direction + total) % total;
    });
  }, [aboutSlides.length]);

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
        aboutSlidePreparedIndexRef.current !== aboutActiveSlideIndex
        || !aboutSlideReadyRef.current
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
    const slide = aboutSlides[((slideIndex % aboutSlides.length) + aboutSlides.length) % aboutSlides.length];
    const blocks = Array.from({ length: 4 }, (_, i) => slide.blocks[i] ?? {
      type: "text" as const,
      title: "Placeholder",
      body: "Content incoming.",
    });
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

    const applyCanvasesToSlideTextures = (inputCanvases: HTMLCanvasElement[]) => {
      const contentMats = aboutTileContentMatsRef.current;
      const shaderMat = aboutCellShaderMaterialRef.current;
      const prevTextures = aboutSlideTexturesRef.current;
      const nextTextures: Array<THREE.Texture | null> = [null, null, null, null];
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

    await Promise.all(blocks.map(async (block, idx) => {
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
      ctx.fillText(block.title ?? "Image", 20, canvasSize - 28, canvasSize - 40);
    }));

    // 2) Re-apply with loaded image content once available.
    applyCanvasesToSlideTextures(canvases);

    const images = canvases.map((canvas) => canvas.getContext("2d")!.getImageData(0, 0, canvasSize, canvasSize).data);
    const targetColors = aboutCellTargetColorsRef.current;
    const revealAt = aboutCellRevealAtMsRef.current;
    const cellOrderNoise = (u: number, v: number) =>
      Math.abs(Math.sin((u * 12.9898 + v * 78.233 + slideIndex * 17.77) * 43758.5453)) % 1;
    const pattern = slide.reveal?.pattern ?? "scanline";
    const blockStagger = Math.max(120, slide.reveal?.blockStaggerMs ?? 360);
    const cellReveal = Math.max(900, slide.reveal?.cellRevealMs ?? 1700);
    aboutTileContentRevealStartMsRef.current = performance.now();
    aboutTileContentRevealBlockStaggerMsRef.current = blockStagger;
    const slots = aboutCellSlotsRef.current;
    const baseColors = aboutCellBaseColorsRef.current;
    slots.forEach((slot, slotIdx) => {
      const blockIdx = THREE.MathUtils.clamp(slot.tileIndex, 0, 3);
      const px = THREE.MathUtils.clamp(Math.floor(slot.u * (canvasSize - 1)), 0, canvasSize - 1);
      const py = THREE.MathUtils.clamp(Math.floor((1 - slot.v) * (canvasSize - 1)), 0, canvasSize - 1);
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
        localOrder = THREE.MathUtils.clamp(Math.sqrt(dx * dx + dy * dy) / 0.7072, 0, 1);
      } else if (pattern === "spiral") {
        const dx = slot.u - 0.5;
        const dy = slot.v - 0.5;
        const angle = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
        const radius = THREE.MathUtils.clamp(Math.sqrt(dx * dx + dy * dy) / 0.7072, 0, 1);
        localOrder = (angle * 0.5 + radius * 0.5) % 1;
      } else if (pattern === "noise-cluster") {
        localOrder = cellOrderNoise(slot.u, slot.v);
      }
      revealAt[slotIdx] = slot.face === "front"
        ? blockIdx * blockStagger + localOrder * cellReveal
        : 0;
      if (!baseColors[slotIdx]) baseColors[slotIdx] = new THREE.Color(0x8cbcff);
    });
  }

  const ensureAboutSlidePrepared = useCallback(() => {
    if (aboutSlides.length === 0) return;
    if (aboutSlidePreparePendingRef.current) return;
    if (aboutTileContentMatsRef.current.length < 4) return;
    const hasAllMaps = aboutTileContentMatsRef.current.slice(0, 4).every((m) => !!m?.map);
    const needsPrepare =
      aboutSlidePreparedIndexRef.current !== aboutActiveSlideIndex
      || !aboutSlideReadyRef.current
      || !hasAllMaps;
    if (!needsPrepare) return;
    shipLog(
      `ABOUTDBG prepare:start slide=${aboutActiveSlideIndex + 1} mats=${aboutTileContentMatsRef.current.length} maps=${hasAllMaps ? "yes" : "no"}`,
      "nav",
    );
    aboutSlidePreparePendingRef.current = true;
    aboutSlideReadyRef.current = false;
    void prepareAboutSlide(aboutActiveSlideIndex).then(() => {
      aboutSlidePreparedIndexRef.current = aboutActiveSlideIndex;
      aboutSlideReadyRef.current = true;
      shipLog(
        `ABOUTDBG prepare:done slide=${aboutActiveSlideIndex + 1} maps=${
          aboutTileContentMatsRef.current.slice(0, 4).map((m) => (m?.map ? "1" : "0")).join("")
        }`,
        "nav",
      );
    }).finally(() => {
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
        aboutMemorySquareActiveRef.current
        && !aboutMemorySquareEntrySequenceRef.current.active
        && !projectShowcaseActiveRef.current
        && !orbitalPortfolioActiveRef.current
        && !skillsLatticeActiveRef.current;
      setAboutSwarmTriggerVisible((prev) => (prev === shouldShow ? prev : shouldShow));
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setAboutSwarmTriggerVisible(false);
    };
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
        aboutSlidePreparedIndexRef.current !== aboutActiveSlideIndex
        || !aboutSlideReadyRef.current
        || !aboutTileContentMatsRef.current.slice(0, 4).every((m) => !!m?.map)
      ) {
        ensureAboutSlidePrepared();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sceneReady, aboutSlides.length, aboutActiveSlideIndex, ensureAboutSlidePrepared]);

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
      if (phase === "assembledHold") runtime.phaseDurationMs = ABOUT_SWARM_ASSEMBLED_HOLD_MS;
      if (phase === "breakOut") runtime.phaseDurationMs = ABOUT_SWARM_BREAKOUT_MS;
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
      aboutPanelSpinStyleRef.current = Array.from({ length: 4 }, () => (Math.random() < 0.5 ? 0 : 1));
      slotCenter.set(0, 0, 0);
      slots.forEach((slot) => slotCenter.add(slot.worldPosition));
      slotCenter.multiplyScalar(1 / Math.max(1, slots.length));
      records.forEach((rec, idx) => {
        const slot = slots[rec.targetSlotIndex] ?? slots[idx];
        const sourceSlot = slots[rec.sourceSlotIndex] ?? slot;
        const panelIdx = THREE.MathUtils.clamp(sourceSlot.tileIndex, 0, 3);
        const panelSpinStyle = aboutPanelSpinStyleRef.current[panelIdx] ?? 0;
        const spinRateScale = panelSpinStyle === 1
          ? (3.2 + Math.random() * 2.5)
          : (1.25 + Math.random() * 0.95);
        rec.position.copy(slot.worldPosition);
        rec.quaternion.copy(slot.worldQuaternion);
        rec.velocity.set(0, 0, 0);
        toCenter.subVectors(rec.position, slotCenter);
        const baseLen = Math.max(60, toCenter.length());
        if (toCenter.lengthSq() < 1e-6) {
          toCenter.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
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
          .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
          .normalize();
        rec.spinAxisSecondary
          .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
          .normalize();
        if (rec.spinAxisPrimary.lengthSq() < 1e-6) rec.spinAxisPrimary.set(0.47, 0.63, -0.62);
        if (rec.spinAxisSecondary.lengthSq() < 1e-6) rec.spinAxisSecondary.set(-0.28, 0.86, 0.42);
        rec.spinRatePrimary = (Math.random() * 2 - 1) * ABOUT_SPIN_MAX * spinRateScale;
        rec.spinRateSecondary = (Math.random() * 2 - 1)
          * ABOUT_SPIN_MAX
          * spinRateScale
          * (panelSpinStyle === 1 ? 0.9 : 0.72);
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
        !runtime.active
        || !runtime.initialized
        || !mesh
        || records.length === 0
        || slots.length === 0
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
      const phaseT = THREE.MathUtils.clamp(phaseElapsed / Math.max(1, runtime.phaseDurationMs), 0, 1);
      updateGridLineVisibility(runtime.phase);
      // In assembled mode, content planes own the visible slide;
      // hide instanced shards so they do not occlude the planes.
      mesh.visible = runtime.phase !== "assembledHold";
      const slideCount = Math.max(0, aboutSlides.length);

      const applyRecordMatrix = (idx: number, rec: AboutCellRecord, pulse = 1) => {
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
        const canShowSlidePlanes = aboutTileContentMatsRef.current.some((mat) => !!mat?.map);
        if (!canShowSlidePlanes) {
          ensureAboutSlidePrepared();
        }
        let distanceAlpha = 1;
        if (camera && anchor) {
          const d = camera.position.distanceTo(anchor);
          distanceAlpha = THREE.MathUtils.clamp(1 - (d - 7000) / 36000, 0.24, 1);
        }
        aboutTileContentMatsRef.current.forEach((mat) => {
          if (!mat) return;
          mat.opacity = canShowSlidePlanes ? distanceAlpha : 0;
        });
        const dbg = aboutDebugStateRef.current;
        const nowMs = performance.now();
        const prepChanged =
          dbg.lastPrepared !== aboutSlidePreparedIndexRef.current
          || dbg.lastReady !== aboutSlideReadyRef.current;
        const phaseChanged = dbg.lastPhase !== runtime.phase;
        const canShowChanged = dbg.lastCanShow !== canShowSlidePlanes;
        if ((prepChanged || phaseChanged || canShowChanged) && nowMs - dbg.lastLogMs > 600) {
          dbg.lastLogMs = nowMs;
          dbg.lastPhase = runtime.phase;
          dbg.lastCanShow = canShowSlidePlanes;
          dbg.lastPrepared = aboutSlidePreparedIndexRef.current;
          dbg.lastReady = aboutSlideReadyRef.current;
          shipLog(
            `ABOUTDBG far phase=${runtime.phase} canShow=${canShowSlidePlanes ? 1 : 0} alpha=${distanceAlpha.toFixed(2)} prepared=${aboutSlidePreparedIndexRef.current + 1} ready=${aboutSlideReadyRef.current ? 1 : 0} maps=${
              aboutTileContentMatsRef.current.slice(0, 4).map((m) => (m?.map ? "1" : "0")).join("")
            }`,
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
          const pulse = 1 + Math.sin(now * 0.001 + rec.pulsePhase) * 0.08 * phaseT;
          tempScale.setScalar(pulse);
          toCenter.subVectors(rec.position, slotCenter).normalize();
          spinAxis.copy(rec.angularVelocity);
          if (spinAxis.lengthSq() < 1e-6) spinAxis.set(0.31, 0.87, 0.39);
          spinAxis.normalize();
          tangent.crossVectors(toCenter, spinAxis);
          if (tangent.lengthSq() < 1e-6) tangent.crossVectors(toCenter, worldUp);
          tangent.normalize();
          rec.velocity.addScaledVector(rec.burstDirection, ABOUT_BREAK_IMPULSE * dt * 0.26);
          rec.velocity.addScaledVector(toCenter, ABOUT_BREAK_IMPULSE * dt * 0.14);
          rec.velocity.addScaledVector(tangent, ABOUT_BREAK_IMPULSE * dt * 0.17);
          rec.velocity.multiplyScalar(0.986);
          rec.position.addScaledVector(rec.velocity, dt);
          rec.spinAxisPrimary.addScaledVector(rec.velocity, dt * 0.0022).normalize();
          rec.spinAxisSecondary.addScaledVector(tangent, dt * 0.0065).normalize();
          deltaQuat.setFromAxisAngle(
            rec.spinAxisPrimary,
            rec.spinRatePrimary * spinPrimaryGain * (1.15 + phaseT * 0.75) * dt,
          );
          deltaQuatB.setFromAxisAngle(
            rec.spinAxisSecondary,
            rec.spinRateSecondary * spinSecondaryGain * (0.95 + phaseT * 0.45) * dt,
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
            Math.sin(rec.position.y * 0.010 + now * 0.00065) * 15,
            Math.cos(rec.position.x * 0.009 + now * 0.0007) * 15,
            Math.sin((rec.position.x + rec.position.y + rec.position.z) * 0.007 + now * 0.00045) * 15,
          );
          spinAxis.copy(rec.angularVelocity);
          if (spinAxis.lengthSq() < 1e-6) spinAxis.set(0.21, 0.93, -0.29);
          spinAxis.normalize();
          tangent.crossVectors(drift, spinAxis);
          if (tangent.lengthSq() < 1e-6) tangent.crossVectors(rec.velocity, spinAxis);
          if (tangent.lengthSq() < 1e-6) tangent.set(-rec.position.y, rec.position.x, rec.position.z * 0.25);
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
          rec.spinAxisSecondary.addScaledVector(rec.velocity, dt * 0.0012).normalize();
          const swarmWobble = 0.7 + 0.3 * Math.sin(now * 0.0018 + rec.pulsePhase);
          deltaQuat.setFromAxisAngle(
            rec.spinAxisPrimary,
            rec.spinRatePrimary * spinPrimaryGain * swarmWobble * dt,
          );
          deltaQuatB.setFromAxisAngle(
            rec.spinAxisSecondary,
            rec.spinRateSecondary * spinSecondaryGain * (1.05 - 0.25 * swarmWobble) * dt,
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
          const attractionGain = THREE.MathUtils.lerp(0.52, 1.02, reformProgress);
          const reformSpinDecayPerFrame = panelSpinStyle === 1
            ? THREE.MathUtils.lerp(0.998, 0.968, reformProgress)
            : THREE.MathUtils.lerp(0.999, 0.972, reformProgress);
          const targetSlot = slots[rec.targetSlotIndex] ?? slots[idx];
          toTarget.subVectors(targetSlot.worldPosition, rec.position);
          spinAxis.copy(rec.spinAxisPrimary);
          if (spinAxis.lengthSq() < 1e-6) spinAxis.set(0.31, 0.77, -0.55);
          spinAxis.normalize();
          tangent.crossVectors(toTarget, spinAxis);
          if (tangent.lengthSq() < 1e-6) tangent.crossVectors(toTarget, worldUp);
          if (tangent.lengthSq() < 1e-6) tangent.set(-toTarget.y, toTarget.x, toTarget.z * 0.25);
          tangent.normalize();
          randomDir.set(
            Math.sin(rec.pulsePhase * 1.91 + now * 0.00115),
            Math.cos(rec.pulsePhase * 1.47 + now * 0.00131),
            Math.sin(rec.pulsePhase * 2.63 + now * 0.00107),
          );
          if (randomDir.lengthSq() < 1e-6) randomDir.set(0.36, -0.48, 0.8);
          randomDir.normalize();
          rec.velocity.addScaledVector(toTarget, ABOUT_REFORM_STIFFNESS * attractionGain * dt);
          rec.velocity.addScaledVector(tangent, dt * 10.5 * freeSpinBlend);
          rec.velocity.addScaledVector(randomDir, dt * 6.8 * freeSpinBlend);
          rec.velocity.multiplyScalar(Math.pow(THREE.MathUtils.lerp(ABOUT_REFORM_DAMPING, 0.965, reformProgress), dt * 60));
          rec.position.addScaledVector(rec.velocity, dt);
          rec.angularVelocity.multiplyScalar(0.92);
          rec.spinRatePrimary *= Math.pow(reformSpinDecayPerFrame, dt * 60);
          rec.spinRateSecondary *= Math.pow(reformSpinDecayPerFrame, dt * 60);
          rec.spinAxisPrimary.addScaledVector(rec.velocity, dt * 0.0017 * freeSpinBlend).normalize();
          rec.spinAxisSecondary.addScaledVector(tangent, dt * 0.0026 * freeSpinBlend).normalize();
          targetQuat.copy(targetSlot.worldQuaternion);
          rec.quaternion.slerp(
            targetQuat,
            THREE.MathUtils.clamp(dt * THREE.MathUtils.lerp(0.85, 8.8, reformProgress * reformProgress), 0, 1),
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
          rec.position.lerp(targetSlot.worldPosition, THREE.MathUtils.clamp(dt * 9, 0, 1));
          rec.velocity.multiplyScalar(0.72);
          rec.quaternion.slerp(targetSlot.worldQuaternion, THREE.MathUtils.clamp(dt * 10, 0, 1));
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
        const canShowSlidePlanes = aboutTileContentMatsRef.current.some((mat) => !!mat?.map);
        let distanceAlpha = 1;
        if (camera && anchor) {
          const d = camera.position.distanceTo(anchor);
          distanceAlpha = THREE.MathUtils.clamp(1 - (d - 7000) / 36000, 0.24, 1);
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
          dbg.lastPrepared !== aboutSlidePreparedIndexRef.current
          || dbg.lastReady !== aboutSlideReadyRef.current;
        const phaseChanged = dbg.lastPhase !== runtime.phase;
        const canShowChanged = dbg.lastCanShow !== canShowSlidePlanes;
        if ((prepChanged || phaseChanged || canShowChanged) && nowMs - dbg.lastLogMs > 600) {
          dbg.lastLogMs = nowMs;
          dbg.lastPhase = runtime.phase;
          dbg.lastCanShow = canShowSlidePlanes;
          dbg.lastPrepared = aboutSlidePreparedIndexRef.current;
          dbg.lastReady = aboutSlideReadyRef.current;
          shipLog(
            `ABOUTDBG near phase=${runtime.phase} canShow=${canShowSlidePlanes ? 1 : 0} alpha=${distanceAlpha.toFixed(2)} prepared=${aboutSlidePreparedIndexRef.current + 1} ready=${aboutSlideReadyRef.current ? 1 : 0} maps=${
              aboutTileContentMatsRef.current.slice(0, 4).map((m) => (m?.map ? "1" : "0")).join("")
            }`,
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

  useEffect(() => {
    if (!sceneReady) return;
    let raf = 0;
    const shellCenter = new THREE.Vector3();
    const labelWorld = new THREE.Vector3();
    const toLabel = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!skillsLatticeSystemActiveRef.current || skillsLatticeActiveRef.current) return;
      const camera = sceneRef.current.camera;
      const shell = skillsLatticeEnvelopeRef.current;
      const scene = sceneRef.current.scene;
      if (!camera || !shell || !scene) return;
      shell.getWorldPosition(shellCenter);
      const shellRadius = Math.max(1, skillsLatticeEnvelopeRadiusRef.current);
      const distance = camera.position.distanceTo(shellCenter);
      // Occlude external CSS2D labels only when the shell blocks line-of-sight.
      if (externalCosmosLabelsHiddenForLatticeRef.current) {
        scene.traverse((obj) => {
          const maybeCss = obj as THREE.Object3D & {
            isCSS2DObject?: boolean;
            userData: Record<string, unknown>;
          };
          if (!maybeCss.isCSS2DObject) return;
          if (maybeCss.userData?.skillsLatticeLabel) return;
          maybeCss.getWorldPosition(labelWorld);
          toLabel.subVectors(labelWorld, camera.position);
          const labelDist = toLabel.length();
          if (labelDist < 0.001) {
            maybeCss.visible = true;
            return;
          }
          toLabel.multiplyScalar(1 / labelDist);
          raycaster.set(camera.position, toLabel);
          raycaster.near = 0.01;
          raycaster.far = labelDist;
          const hits = raycaster.intersectObject(shell, true);
          const blocked = hits.some((h) => h.distance < labelDist - 0.25);
          maybeCss.visible = !blocked;
        });
      }
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
    const tick = () => {
      if (skillsLatticeActiveRef.current) {
        const nowMs = performance.now();
        const dt = Math.min((nowMs - lastTickMs) / 1000, 0.05);
        lastTickMs = nowMs;
        const t = nowMs * 0.001;
        const selected = skillsLatticeSelectedNodeRef.current;
        const plasmaActive = !!selected;
        const ripple = skillsLatticeRippleRef.current;
        const camera = sceneRef.current.camera;
        const shellMat = skillsLatticeEnvelopeMatRef.current;
        const shellEdgeMat = skillsLatticeEnvelopeEdgeMatRef.current;
        const shell = skillsLatticeEnvelopeRef.current;
        let latticeInternalsVisible = true;
        if (camera && shellMat && shellEdgeMat && shell) {
          shell.rotation.x += dt * shellSpin.x;
          shell.rotation.y += dt * shellSpin.y;
          shell.rotation.z += dt * shellSpin.z;
          shell.getWorldPosition(shellCenter);
          const shellRadius = Math.max(1, skillsLatticeEnvelopeRadiusRef.current);
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
            THREE.MathUtils.lerp(0.2, 0.58, outsideT) + pulse * 0.14 + glintBoost * 0.45,
            0.1,
            0.95,
          );
          shellEdgeMat.opacity = THREE.MathUtils.clamp(
            THREE.MathUtils.lerp(0.08, 0.4, outsideT) + pulse * 0.08 + glintBoost * 0.34,
            0.03,
            0.74,
          );
          shellEdgeMat.color.setHSL(0.58 + pulse * 0.04 + glintBoost * 0.03, 0.76, 0.7);
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
                baseInt + (insideShell ? 0.45 : 0.06) * (0.5 + 0.5 * Math.sin(t * 1.7 + idx * 1.3));
            });
          }
          const showNodeLabels = insideT > 0.55;
          skillsLatticeNodeLabelsRef.current.forEach((label) => {
            label.visible = showNodeLabels;
          });
        }
        let rippleRadius = -1;
        if (ripple.active) {
          const rt = THREE.MathUtils.clamp((nowMs - ripple.startedAt) / 1200, 0, 1);
          rippleRadius = rt * 90;
          if (rt >= 1) ripple.active = false;
        }
        skillsLatticeNodesRef.current.forEach((node) => {
          const pulse = 1 + Math.sin(t * 1.7 + node.phase) * 0.08;
          const isSelected = selected?.mesh === node.mesh;
          const isRelated = !selected
            || (selected.nodeType === "category"
              ? node.category === selected.category
              : node.category === selected.category || node.label === selected.label);
          const selectedBoost = isSelected ? 1.28 : isRelated ? 1.03 : 0.96;
          node.mesh.scale.setScalar(node.baseScale * pulse * selectedBoost);
          const bodyMat = node.mesh.material as THREE.MeshBasicMaterial;
          const baseNodeOpacity = node.nodeType === "category" ? 0.9 : 0.82;
          bodyMat.opacity = latticeInternalsVisible ? (isRelated ? baseNodeOpacity : 0.2) : 0;
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
              plasmaMix = Math.max(plasmaMix, Math.max(0, 1 - Math.abs(d - bandRadius) / 12) * 0.55);
            }
            bodyMat.color.copy(baseColor).lerp(plasmaColor, plasmaMix);
          } else {
            bodyMat.color.set(node.nodeType === "category" ? 0x8fd3ff : 0xdaf1ff);
          }
          if (node.halo?.material) {
            const hMat = node.halo.material as THREE.SpriteMaterial;
            const focusAlpha = isSelected ? 0.62 : isRelated ? 0.24 : 0.08;
            let rippleBoost = 0;
            if (ripple.active && rippleRadius >= 0) {
              node.mesh.getWorldPosition(worldNodePos);
              const d = worldNodePos.distanceTo(ripple.center);
              rippleBoost = Math.max(0, 1 - Math.abs(d - rippleRadius) / 14) * 0.42;
            }
            hMat.opacity = THREE.MathUtils.clamp(
              focusAlpha + Math.sin(t * 2.2 + node.phase) * 0.06 + rippleBoost,
              0.04,
              0.9,
            );
            if (!latticeInternalsVisible) hMat.opacity = 0;
          }
        });
        skillsLatticeLineGroupsRef.current.forEach((group, idx) => {
          const wave = 0.3 + 0.14 * Math.sin(t * 1.15 + idx * 0.68);
          const isRelated = !selected
            || (group.kind === "ring"
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
            const lineMix = (isRelated ? 0.2 : 0.08) + 0.16 * Math.sin(t * 1.9 + idx * 0.55);
            group.material.color.set(lineBase).lerp(new THREE.Color(linePlasma), lineMix);
          } else {
            group.material.color.set(group.kind === "ring" ? 0x66c6ff : 0x9ad9ff);
          }
        });
        const flow = skillsLatticeFlowPointsRef.current;
        const flowMeta = skillsLatticeFlowMetaRef.current;
        const segs = skillsLatticeLinkSegmentsRef.current;
        if (flow && flowMeta.length > 0 && segs.length > 0) {
          const flowMat = flow.material as THREE.PointsMaterial;
          flowMat.opacity = latticeInternalsVisible ? (plasmaActive ? 0.9 : 0.78) : 0;
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
          const attr = flow.geometry.getAttribute("position") as THREE.BufferAttribute;
          const colorAttr = flow.geometry.getAttribute("color") as THREE.BufferAttribute | null;
          for (let i = 0; i < flowMeta.length; i += 1) {
            const meta = flowMeta[i];
            const seg = segs[meta.segmentIndex % segs.length];
            const p = (t * meta.speed + meta.offset) % 1;
            flowPos.lerpVectors(seg.from, seg.to, p);
            attr.setXYZ(i, flowPos.x, flowPos.y, flowPos.z);
            if (colorAttr) {
              if (plasmaActive) {
                const hue = THREE.MathUtils.euclideanModulo(
                  meta.hue + t * meta.hueDrift + Math.sin(t * 1.5 + i * 0.37) * 0.03,
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
                      n.mesh !== sourceNode.mesh
                      && (n.category === selected.category || n.label === selected.label),
                  );
                  if (pool.length === 0) {
                    pool = nodes.filter((n) => n.mesh !== sourceNode.mesh);
                  }
                }
                const pick = pool[Math.floor(Math.random() * Math.max(1, pool.length))];
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
                const alpha = p / ((arc.points.length / 3) - 1);
                arcPos.lerpVectors(selectedPos, targetPos, alpha);
                const envelope = Math.sin(alpha * Math.PI);
                const jitter =
                  Math.sin((alpha * 10 + t * 8 + idx * 1.2) * (1 + arc.sway * 0.22))
                  * (0.8 + 0.2 * Math.sin(t * 13 + idx));
                const helix =
                  Math.cos(alpha * 12 + t * 7 + idx * 0.8) * 0.45;
                arcPos.addScaledVector(ortho, envelope * jitter * arc.sway);
                arcPos.addScaledVector(bend, envelope * helix * arc.sway * 0.72);
                arcPos.addScaledVector(direct, Math.sin(alpha * Math.PI * 5 + t * 16) * 0.06);
                arc.points[p * 3] = arcPos.x;
                arc.points[p * 3 + 1] = arcPos.y;
                arc.points[p * 3 + 2] = arcPos.z;
              }
              const attr = arc.line.geometry.getAttribute("position") as THREE.BufferAttribute;
              attr.needsUpdate = true;
              const mat = arc.line.material as THREE.LineBasicMaterial;
              const energy = 0.35 + 0.3 * Math.sin(t * 12 + idx * 2.1) + Math.min(0.35, dist / 140);
              mat.opacity = THREE.MathUtils.clamp(energy, 0.2, 0.9);
              mat.color.setHSL((0.62 + 0.08 * Math.sin(t * 0.8 + idx)) % 1, 0.8, 0.72);
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
    let nextPulseAt = lastMs + 1800 + Math.random() * 2400;
    let pulseEndAt = 0;
    let pulseStartAt = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
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
      beaconMat.emissiveIntensity = THREE.MathUtils.clamp(0.06 + boost * 0.22, 0.05, 0.34);
      edgeMat.opacity = THREE.MathUtils.clamp(0.17 + boost * 0.24, 0.12, 0.5);
      edgeMat.color.setHSL((0.57 + 0.03 * periodic + pulse * 0.04) % 1, 0.82, 0.7);
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
      const holdNearSkills = skillsLatticeActiveRef.current || skillsRouteActive;
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
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);
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

      cruiser.update(dt);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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
      return skillsLatticeNodesRef.current.find((n) => n.mesh === hitMesh) ?? null;
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
      mount.removeEventListener("pointerdown", onPointerDown, { capture: true });
    };
  }, [focusSkillsLatticeNode]);

  useEffect(() => {
    if (!PROJECT_SHOWCASE_USE_NEBULA_REALM || isLoading || !sceneReady) return;
    let raf = 0;
    const tick = () => {
      const sceneCtx = sceneRef.current;
      const ship = spaceshipRef.current;
      const camera = sceneCtx?.camera;
      if (!sceneCtx || !ship || !camera) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const nebulaRoot = projectShowcaseNebulaRootRef.current;
      if (nebulaRoot?.visible) {
        const nebulaCenterOffset = nebulaRoot.userData?.nebulaCenterOffset as
          | THREE.Vector3
          | undefined;
        nebulaRoot.position.copy(camera.position);
        if (nebulaCenterOffset) {
          nebulaRoot.position.sub(nebulaCenterOffset);
        }
      }

      const shouldFadeDuringOutboundTravel =
        pendingProjectShowcaseEntryRef.current &&
        !projectShowcaseActiveRef.current &&
        !projectShowcaseEntrySequenceRef.current.active &&
        !projectShowcaseExitSequenceRef.current.active;
      const shouldFadeDuringReturnTravel =
        !pendingProjectShowcaseEntryRef.current &&
        !projectShowcaseActiveRef.current &&
        !projectShowcaseEntrySequenceRef.current.active &&
        !projectShowcaseExitSequenceRef.current.active &&
        currentNavigationTarget === "projects" &&
        navigationDistance !== null;

      if (shouldFadeDuringOutboundTravel || shouldFadeDuringReturnTravel) {
        const distFromKnownCenter = ship.position.length();
        const fadeStart = SKYFIELD_RADIUS * 0.9;
        const fadeEnd = SKYFIELD_RADIUS * 1.18;
        const realmAlpha = THREE.MathUtils.clamp(
          (distFromKnownCenter - fadeStart) / Math.max(1, fadeEnd - fadeStart),
          0,
          1,
        );
        applyProjectShowcaseNebulaFade(realmAlpha);
        if (realmAlpha > 0.001) {
          camera.layers.enable(PROJECT_SHOWCASE_LAYER);
        }
        const now = performance.now();
        if (now - projectShowcaseNebulaDebugLastLogMsRef.current > 2600) {
          projectShowcaseNebulaDebugLastLogMsRef.current = now;
          const nebulaVisible = projectShowcaseNebulaRootRef.current?.visible ?? false;
          vlog(
            `🌌 Nebula travel dbg: dist=${distFromKnownCenter.toFixed(0)} alpha=${realmAlpha.toFixed(
              2,
            )} camLayer=${camera.layers.isEnabled(PROJECT_SHOWCASE_LAYER) ? "on" : "off"} visible=${nebulaVisible ? "yes" : "no"}`,
          );
        }
      } else if (
        !projectShowcaseActiveRef.current &&
        !projectShowcaseEntrySequenceRef.current.active
      ) {
        applyProjectShowcaseNebulaFade(0);
        camera.layers.disable(PROJECT_SHOWCASE_LAYER);
      }

      const nowMs = performance.now();
      if (nowMs - shipTelemetryLastLogMsRef.current >= 1000) {
        shipTelemetryLastLogMsRef.current = nowMs;
        const wantsFalcon = emitFalconLocationLogsRef.current;
        const wantsSD = emitSDLocationLogsRef.current;
        if (wantsFalcon || wantsSD) {
          const sd = starDestroyerRef.current;
          const shipPos = ship.position;
          const sdPos = sd?.position;
          const sdDist = sdPos ? shipPos.distanceTo(sdPos) : null;
          const parts: string[] = [];
          if (wantsFalcon) {
            parts.push(
              `Falcon [${shipPos.x.toFixed(0)}, ${shipPos.y.toFixed(0)}, ${shipPos.z.toFixed(0)}]`,
            );
          }
          if (wantsSD) {
            parts.push(
              `SD ${sdPos
                ? `[${sdPos.x.toFixed(0)}, ${sdPos.y.toFixed(0)}, ${sdPos.z.toFixed(0)}]`
                : "[not-loaded]"}`,
            );
          }
          if (wantsFalcon && wantsSD && sdDist !== null) {
            parts.push(`d=${sdDist.toFixed(0)}`);
          }
          shipLog(`TELEM ${parts.join(" | ")}`, "info");
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [currentNavigationTarget, isLoading, navigationDistance, sceneReady]);

  useEffect(() => {
    return () => {
      if (projectShowcaseEntrySequenceRef.current.raf !== null) {
        cancelAnimationFrame(projectShowcaseEntrySequenceRef.current.raf);
        projectShowcaseEntrySequenceRef.current.raf = null;
      }
      if (projectShowcaseExitSequenceRef.current.raf !== null) {
        cancelAnimationFrame(projectShowcaseExitSequenceRef.current.raf);
        projectShowcaseExitSequenceRef.current.raf = null;
      }
      if (projectShowcaseAngleIntroRef.current.raf !== null) {
        cancelAnimationFrame(projectShowcaseAngleIntroRef.current.raf);
        projectShowcaseAngleIntroRef.current.raf = null;
      }
      projectShowcaseEntrySequenceRef.current.active = false;
      projectShowcaseExitSequenceRef.current.active = false;
      projectShowcaseQueuedNavRef.current = null;
      projectShowcaseAwaitingProjectsArrivalRef.current = false;
      projectShowcaseSawProjectsTravelRef.current = false;
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
      ship.position.set(baseShipPos.x + sway, baseShipPos.y + bob, baseShipPos.z);
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
    if (!projectShowcaseActive) return;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const controls = sceneRef.current.controls;
      const camera = sceneRef.current.camera;
      const track = projectShowcaseTrackRef.current;
      const showcaseRoot = projectShowcaseRootRef.current;
      if (!controls || !camera || !track || !showcaseRoot) return;
      if (projectShowcaseExitSequenceRef.current.active) return;

      const now = performance.now();
      const last = projectShowcaseLastTickRef.current ?? now;
      const dt = Math.min((now - last) / 1000, 0.08);
      projectShowcaseLastTickRef.current = now;

      const endPad = 10;
      const minRun = track.minRun + endPad;
      const maxRun = track.maxRun - endPad;
      const loopLen = Math.max(1, maxRun - minRun);
      const currentRun = projectShowcaseRunPosRef.current;
      const jumpTarget = projectShowcaseJumpTargetRef.current;

      if (jumpTarget !== null) {
        const normalizedCurrent = THREE.MathUtils.euclideanModulo(
          currentRun - minRun,
          loopLen,
        ) + minRun;
        const normalizedTarget = THREE.MathUtils.euclideanModulo(
          jumpTarget - minRun,
          loopLen,
        ) + minRun;
        const forwardDist =
          normalizedTarget >= normalizedCurrent
            ? normalizedTarget - normalizedCurrent
            : normalizedTarget + loopLen - normalizedCurrent;
        const backwardDist =
          normalizedCurrent >= normalizedTarget
            ? normalizedCurrent - normalizedTarget
            : normalizedCurrent + loopLen - normalizedTarget;
        const goForward = forwardDist <= backwardDist;
        const remaining = Math.min(forwardDist, backwardDist);
        // Two-phase profile: keep a fast clip while far, then brake near target.
        const cruiseSpeed = track.speed * 25;
        const minApproachSpeed = track.speed * 0.14;
        const brakeDistance = 1.7;
        let dynamicSpeed = cruiseSpeed;
        if (remaining < brakeDistance) {
          const t = THREE.MathUtils.clamp(remaining / brakeDistance, 0, 1);
          const eased = t * t * (3 - 2 * t);
          dynamicSpeed = THREE.MathUtils.lerp(
            minApproachSpeed,
            cruiseSpeed,
            eased,
          );
        }
        const step = Math.min(remaining, dynamicSpeed * dt);
        let nextRun = normalizedCurrent + (goForward ? step : -step);
        if (nextRun > maxRun) nextRun -= loopLen;
        if (nextRun < minRun) nextRun += loopLen;
        setProjectShowcaseRunPosition(nextRun);
        if (remaining < 0.18) {
          const direction = goForward ? 1 : -1;
          const edgeGuard = 0.28;
          const nearEdge =
            normalizedTarget <= minRun + edgeGuard ||
            normalizedTarget >= maxRun - edgeGuard;
          const settleRun = nearEdge
            ? normalizedTarget
            : THREE.MathUtils.clamp(
                normalizedTarget + direction * 0.05,
                minRun,
                maxRun,
              );
          setProjectShowcaseRunPosition(settleRun);
          projectShowcaseJumpTargetRef.current = null;
          // Small opposite impulse gives a "heavy shuttle" settle bounce.
          projectShowcaseVelocityRef.current = nearEdge
            ? 0
            : -direction * track.speed * 0.12;
          setProjectShowcaseLever(0);
        }
      } else {
        const maxManualSpeed = track.speed * 11.4;
        let targetVelocity = 0;
        if (projectShowcasePlayingRef.current) {
          targetVelocity = track.speed * 0.75;
        } else if (projectShowcaseLeverDraggingRef.current) {
          const lever = projectShowcaseLeverValueRef.current;
          // Non-linear response: fine near center, stronger at extremes.
          const shapedLever =
            Math.sign(lever) * Math.pow(Math.abs(lever), 1.35);
          targetVelocity = shapedLever * maxManualSpeed;
        }
        const wheelRecent =
          performance.now() - projectShowcaseWheelLastInputAtRef.current < 620;
        const velocitySmooth = projectShowcaseLeverDraggingRef.current
          ? 20
          : wheelRecent
            ? 1.8
            : 7.5;
        projectShowcaseVelocityRef.current = THREE.MathUtils.damp(
          projectShowcaseVelocityRef.current,
          targetVelocity,
          velocitySmooth,
          dt,
        );

        if (Math.abs(projectShowcaseVelocityRef.current) > 0.002) {
          let nextRun =
            projectShowcaseRunPosRef.current + projectShowcaseVelocityRef.current * dt;
          if (nextRun > maxRun) {
            nextRun = minRun;
          } else if (nextRun < minRun) {
            nextRun = maxRun;
          }
          setProjectShowcaseRunPosition(nextRun);
        } else if (
          !projectShowcasePlayingRef.current &&
          !projectShowcaseLeverDraggingRef.current
        ) {
          projectShowcaseForcedFocusIndexRef.current = null;
        }

        // Mirror current motion on the throttle UI while coasting/stopping.
        if (!projectShowcaseLeverDraggingRef.current) {
          const derivedLever = THREE.MathUtils.clamp(
            projectShowcaseVelocityRef.current / Math.max(track.speed * 6.5, 0.0001),
            -1,
            1,
          );
          if (
            Math.abs(derivedLever - projectShowcaseLeverValueRef.current) > 0.02
          ) {
            setProjectShowcaseLever(derivedLever);
          }
        }
      }

      const focusIndex = THREE.MathUtils.clamp(
        projectShowcaseFocusIndexRef.current,
        0,
        Math.max(0, projectShowcasePanelsRef.current.length - 1),
      );
      const angleT = THREE.MathUtils.clamp(
        projectShowcaseAnglePercentRef.current /
          (PROJECT_SHOWCASE_MAX_ANGLE_PERCENT -
            PROJECT_SHOWCASE_MIN_ANGLE_PERCENT),
        0,
        1,
      );
      projectShowcasePanelsRef.current.forEach((panel, idx) => {
        const target = idx === focusIndex ? 1 : 0;
        panel.focusBlend = THREE.MathUtils.damp(panel.focusBlend, target, 8, dt);
        const toFrontDelta = Math.atan2(
          Math.sin(panel.frontFacingRotationY - panel.inwardRotationY),
          Math.cos(panel.frontFacingRotationY - panel.inwardRotationY),
        );
        panel.group.rotation.y =
          panel.inwardRotationY +
          toFrontDelta * angleT;
        panel.group.scale.setScalar(1);
        panel.frameMat.opacity = 0.22 + panel.focusBlend * 0.26;
        const fadeElapsedMs = now - panel.mediaFadeStartMs;
        if (fadeElapsedMs < panel.mediaFadeDurationMs) {
          panel.imageMat.opacity = THREE.MathUtils.clamp(
            fadeElapsedMs / Math.max(panel.mediaFadeDurationMs, 1),
            0,
            1,
          );
        } else if (panel.imageMat.opacity < 1) {
          panel.imageMat.opacity = 1;
        }
        if (panel.techBadgeRoot) {
          panel.techBadgeRoot.visible =
            idx === focusIndex && panel.group.visible && panel.techBadgeFx.length > 0;
        }
        // Subtle vertical shimmer over tech badges (top-to-bottom feel via phase offsets).
        panel.techBadgeFx.forEach((fx) => {
          const shimmer = 0.5 + 0.5 * Math.sin(now * 0.00125 - fx.phase);
          fx.mat.opacity = fx.baseOpacity * (0.8 + shimmer * 0.24);
          fx.mat.color.copy(fx.baseColor).lerp(new THREE.Color(0x8fe7ff), shimmer * 0.28);
        });
      });
      // Floor lane pulses: travel from forward to aft, looped.
      const floorPulseRecords = projectShowcaseFloorPulseMatsRef.current;
      if (floorPulseRecords.length > 0) {
        // Keep original travel speed, but introduce an idle gap between runs.
        const pulseRunMs = 4445;
        const pulseGapMs = 4200;
        const pulseCycleMs = pulseRunMs + pulseGapMs;
        const cycleMs = now % pulseCycleMs;
        const pulseActive = cycleMs < pulseRunMs;
        const pulseProgress = THREE.MathUtils.clamp(cycleMs / pulseRunMs, 0, 1);
        const pulseCenter = 1 - pulseProgress;
        const pulseTrailCenter = (pulseCenter + 0.42) % 1;
        const pulseWidth = 0.09;
        const pulseFalloff = pulseWidth * pulseWidth;
        floorPulseRecords.forEach(({ mat, runT }) => {
          if (!pulseActive) {
            mat.opacity = 0.08;
            mat.color.set(0x2ccfff);
            return;
          }
          const d1 = Math.min(Math.abs(runT - pulseCenter), 1 - Math.abs(runT - pulseCenter));
          const d2 = Math.min(
            Math.abs(runT - pulseTrailCenter),
            1 - Math.abs(runT - pulseTrailCenter),
          );
          const i1 = Math.exp(-(d1 * d1) / pulseFalloff);
          const i2 = Math.exp(-(d2 * d2) / pulseFalloff) * 0.74;
          const intensity = Math.max(i1, i2);
          mat.opacity = 0.12 + intensity * 0.72;
          mat.color.set(intensity > 0.45 ? 0xbdf6ff : 0x38d8ff);
        });
      }

      const run = projectShowcaseRunPosRef.current;
      const sway = Math.sin(run * 0.025) * 1.2;
      const rootPos = new THREE.Vector3();
      showcaseRoot.getWorldPosition(rootPos);
      if (track.axis === "z") {
        const camX = rootPos.x + track.centerCross + sway;
        const camY = rootPos.y + track.cameraHeight;
        const camZ = rootPos.z + run;
        controls.setLookAt(
          camX,
          camY,
          camZ,
          rootPos.x + track.centerCross,
          rootPos.y + track.cameraHeight - 0.3,
          rootPos.z + run + track.lookAhead,
          false,
        );
      } else {
        const camX = rootPos.x + run;
        const camY = rootPos.y + track.cameraHeight;
        const camZ = rootPos.z + track.centerCross + sway;
        controls.setLookAt(
          camX,
          camY,
          camZ,
          rootPos.x + run + track.lookAhead,
          rootPos.y + track.cameraHeight - 0.3,
          rootPos.z + track.centerCross,
          false,
        );
      }
    };

    tick();
    return () => cancelAnimationFrame(raf);
  }, [projectShowcaseActive, setProjectShowcaseRunPosition]);

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
      if (ORBITAL_PORTFOLIO_DEBUG_LOGS && !orbitalPortfolioDebugDumpedRef.current) {
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
        const inspectedStation = orbitalPortfolioStationsRef.current[inspectedIndex];
        const controlsAny = sceneRef.current.controls as unknown as {
          getTarget?: (out: THREE.Vector3) => void;
        };
        if (inspectedStation && controlsAny.getTarget) {
          const controlTarget = new THREE.Vector3();
          controlsAny.getTarget(controlTarget);
          const cameraDistance = sceneRef.current.camera.position.distanceTo(controlTarget);
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
      const inspectedStationIndex = orbitalPortfolioInspectedStationIndexRef.current;
      const inspectedOrbitKey =
        inspectedStationIndex !== null
          ? (() => {
              const inspected = orbitalPortfolioStationsRef.current[inspectedStationIndex];
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
        const isInspected = idx === orbitalPortfolioInspectedStationIndexRef.current;
        // Keep the currently visited card stable so camera-inspect never drifts.
        // Also freeze peers in the same orbit ring to prevent distracting
        // pass-through motion across the focused card while inspecting.
        const inInspectedOrbit =
          !!inspectedOrbitKey &&
          `${station.coreId}|${station.plainIndex}|${station.ringIndex}` === inspectedOrbitKey;
        const lockStationOrbit =
          isInspected ||
          inInspectedOrbit ||
          (hasInspectContext && isFocused && orbitalPortfolioManualCameraLockRef.current);
        if (lockStationOrbit) {
          freezeCount += 1;
          if (isInspected) inspectedFreezeCount += 1;
          else if (inInspectedOrbit) laneFreezeCount += 1;
          else if (isFocused && orbitalPortfolioManualCameraLockRef.current) manualFreezeCount += 1;
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
                ((dist - rippleFront) / Math.max(1, station.rippleWavelength)) * Math.PI * 2;
              const waveFalloff = THREE.MathUtils.clamp(
                1 - Math.abs(dist - rippleFront) / (station.rippleWavelength * 1.25),
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
          (station.plate.userData as { hasLoadedTexture?: boolean }).hasLoadedTexture,
        );
        frameMat.opacity = THREE.MathUtils.damp(
          frameMat.opacity,
          isFocused ? 0.22 : 0.1,
          8.5,
          dt,
        );
        plateMat.opacity = THREE.MathUtils.damp(
          plateMat.opacity,
          isFocused ? 0.98 : hasTexture ? ORBITAL_PORTFOLIO_NONFOCUS_PLATE_OPACITY : 0.0,
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
          const isActiveTab = tab.variantIndex === orbitalPortfolioVariantIndex;
          const hoverPulse =
            0.985 + 0.015 * Math.sin(now * 0.004 + station.pulsePhase + tab.variantIndex * 0.9);
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
          thumb.mesh.visible = isFocused && hasMedia;
          thumb.frame.visible = isFocused && hasMedia;
          const mappedMediaIndex = Number(thumb.mesh.userData.orbitalMediaIndex ?? thumb.mediaIndex);
          const isActiveMedia = mappedMediaIndex === orbitalPortfolioMediaIndex;
          mat.opacity = isFocused ? (isActiveMedia ? 1 : 0.93) : 0;
          mat.color.setHex(0xffffff);
          frameMat.opacity = isFocused ? (isActiveMedia ? 0.96 : 0.6) : 0;
          frameMat.color.setHex(isActiveMedia ? 0xd3f2ff : 0x79b5df);
          thumb.mesh.scale.setScalar(isFocused ? (isActiveMedia ? 1.05 : 0.96) : 0.9);
          thumb.frame.scale.copy(thumb.mesh.scale);
          const baseX = Number(thumb.mesh.userData.orbitalBaseX ?? thumb.mesh.position.x);
          const baseY = Number(thumb.mesh.userData.orbitalBaseY ?? thumb.mesh.position.y);
          const meshSlideStartAt = Number(thumb.mesh.userData.orbitalThumbSlideStartAt ?? 0);
          const meshSlideDuration = Math.max(
            1,
            Number(thumb.mesh.userData.orbitalThumbSlideDurationMs ?? 1),
          );
          const meshSlideFromX = Number(thumb.mesh.userData.orbitalThumbSlideFromX ?? 0);
          let meshSlideOffsetX = 0;
          if (meshSlideStartAt > 0 && meshSlideFromX !== 0) {
            const t = THREE.MathUtils.clamp((now - meshSlideStartAt) / meshSlideDuration, 0, 1);
            const eased = 1 - (1 - t) * (1 - t) * (1 - t);
            meshSlideOffsetX = meshSlideFromX * (1 - eased);
            if (t >= 1) {
              thumb.mesh.userData.orbitalThumbSlideStartAt = 0;
              thumb.mesh.userData.orbitalThumbSlideFromX = 0;
            }
          }
          thumb.mesh.position.set(baseX + meshSlideOffsetX, baseY, thumb.mesh.position.z);
          const frameBaseX = Number(thumb.frame.userData.orbitalBaseX ?? thumb.frame.position.x);
          const frameBaseY = Number(thumb.frame.userData.orbitalBaseY ?? thumb.frame.position.y);
          const frameSlideStartAt = Number(thumb.frame.userData.orbitalThumbSlideStartAt ?? 0);
          const frameSlideDuration = Math.max(
            1,
            Number(thumb.frame.userData.orbitalThumbSlideDurationMs ?? 1),
          );
          const frameSlideFromX = Number(thumb.frame.userData.orbitalThumbSlideFromX ?? 0);
          let frameSlideOffsetX = 0;
          if (frameSlideStartAt > 0 && frameSlideFromX !== 0) {
            const t = THREE.MathUtils.clamp((now - frameSlideStartAt) / frameSlideDuration, 0, 1);
            const eased = 1 - (1 - t) * (1 - t) * (1 - t);
            frameSlideOffsetX = frameSlideFromX * (1 - eased);
            if (t >= 1) {
              thumb.frame.userData.orbitalThumbSlideStartAt = 0;
              thumb.frame.userData.orbitalThumbSlideFromX = 0;
            }
          }
          thumb.frame.position.set(frameBaseX + frameSlideOffsetX, frameBaseY, thumb.frame.position.z);
        });
        station.cardThumbNavMeshes.forEach((nav) => {
          const navMat = nav.mesh.material as THREE.MeshBasicMaterial;
          const navFrameMat = nav.frame.material as THREE.MeshBasicMaterial;
          const canMove = nav.mesh.userData.orbitalNavCanMove === true;
          const showNav = nav.mesh.userData.orbitalShowNav === true;
          const pressedUntil = Number(nav.mesh.userData.orbitalPressedUntil ?? 0);
          const isPressed = pressedUntil > now;
          nav.mesh.visible = isFocused && showNav;
          nav.frame.visible = isFocused && showNav;
          navMat.opacity = isFocused ? (canMove ? (isPressed ? 1 : 0.94) : 0.34) : 0;
          navFrameMat.opacity = isFocused ? (canMove ? (isPressed ? 0.96 : 0.84) : 0.24) : 0;
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
          const impactMat = station.impactSprite.material as THREE.SpriteMaterial;
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
        const radialToCore = station.coreAnchorLocal.clone().sub(station.group.position).normalize();
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
          const correctedUp = new THREE.Vector3().crossVectors(radialToCore, right).normalize();
          const basis = new THREE.Matrix4().makeBasis(right, correctedUp, radialToCore);
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
      orbitalPortfolioCoresRef.current.forEach((core, coreIndex) => {
        const glowMat = core.glow.material as THREE.MeshBasicMaterial;
        glowMat.opacity = 0.2 + (0.5 + 0.5 * Math.sin(now * 0.0018 + coreIndex)) * 0.2;
        core.root.rotation.y += dt * 0.03;
        core.root.rotation.x = Math.sin(now * 0.00037 + coreIndex * 0.4) * 0.08;
        core.sliceGroup.rotation.y -= dt * 0.24;
        core.sliceGroup.rotation.z += dt * 0.11;
        core.sliceMats.forEach((mat, idx) => {
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.0021 + idx * 0.9 + coreIndex);
          mat.opacity = 0.2 + pulse * 0.28;
        });
        core.rayMats.forEach((mat, idx) => {
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.0017 + idx * 0.63 + coreIndex);
          mat.opacity = 0.12 + pulse * 0.2;
        });
        if (core.panelMat) {
          core.panelMat.opacity = 0.12 + (0.5 + 0.5 * Math.sin(now * 0.0016)) * 0.02;
        }
        if (core.panelColorAttr && core.panelBaseColors) {
          const arr = core.panelColorAttr.array as Float32Array;
          const lum = 0.86 + (0.5 + 0.5 * Math.sin(now * 0.0012 + coreIndex)) * 0.06;
          for (let i = 0; i < arr.length; i += 3) {
            const pulse = 0.98 + 0.02 * Math.sin(now * 0.0019 + i * 0.0013 + coreIndex);
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
          if (candidates.length === 0) return Math.floor(Math.random() * stations.length);
          return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
        };
        const randomTargetOffset = () =>
          new THREE.Vector2((Math.random() - 0.5) * 52, (Math.random() - 0.5) * 28);
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
            const impactStation = orbitalPortfolioStationsRef.current[packet.targetStation];
            if (packet.willImpact && impactStation) {
              impactStation.impactStartedAt = now;
              const impactMat = impactStation.impactSprite.material as THREE.SpriteMaterial;
              const packetMat = packet.mesh.material as THREE.SpriteMaterial;
              impactMat.color.copy(packetMat.color);
              matterTo.set(packet.targetOffset.x, packet.targetOffset.y, 0.2);
              impactStation.plate.localToWorld(matterTo);
              impactStation.group.worldToLocal(matterTo);
              impactStation.impactLocalPoint.set(matterTo.x, matterTo.y);
              impactStation.impactSprite.position.set(matterTo.x, matterTo.y, 1.38);
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
              Math.random() * Math.max(1, orbitalPortfolioCoresRef.current.length),
            );
            packet.targetStation = pickRandomStationIndexForCore(packet.sourceCoreIndex);
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
            const targetStation = orbitalPortfolioStationsRef.current[packet.targetStation];
            if (!targetStation) return;
            matterTo.set(packet.targetOffset.x, packet.targetOffset.y, 0.2);
            targetStation.plate.localToWorld(matterTo);
            matterTarget.copy(matterTo);
          } else {
            matterTarget.copy(matterFrom).add(packet.missOffset);
          }
          matterPos.copy(matterFrom).add(packet.startOffset).lerp(matterTarget, packet.progress);
          const arc = Math.sin(packet.progress * Math.PI) * (8 + (idx % 5) * 1.4);
          matterPos.y += arc;
          const packetParent = packet.mesh.parent;
          if (packetParent) {
            packetParent.worldToLocal(packet.mesh.position.copy(matterPos));
          } else {
            packet.mesh.position.copy(matterPos);
          }
          const pmat = packet.mesh.material as THREE.SpriteMaterial;
          pmat.opacity = 0.2 + (0.5 + 0.5 * Math.sin(now * 0.004 + packet.phase)) * 0.2;
        });
      }
      const focusCore =
        orbitalPortfolioCoresByIdRef.current.get(orbitalPortfolioFocusedCoreIdRef.current) ??
        orbitalPortfolioCoresRef.current[0];
      const activeAnchor =
        focusCore?.centerLocal.clone().add(anchor) ?? anchor.clone();
      lookAt.copy(activeAnchor);
      orbitalPortfolioCameraDistanceRef.current = THREE.MathUtils.damp(
        orbitalPortfolioCameraDistanceRef.current,
        orbitalPortfolioCameraDistanceTargetRef.current,
        8.5,
        dt,
      );
      const desiredCam = lookAt
        .clone()
        .add(
          new THREE.Vector3(380, 190, 540).multiplyScalar(
            orbitalPortfolioCameraDistanceRef.current,
          ),
        );
      const manualActive = orbitalPortfolioManualCameraLockRef.current;
      const controlsAny = controls as unknown as {
        getTarget?: (out: THREE.Vector3) => void;
      };
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
        const desiredTarget = activeAnchor.clone().add(new THREE.Vector3(0, 10, 0));
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
    orbitalPortfolioActive,
    orbitalPortfolioMediaIndex,
    orbitalPortfolioVariantIndex,
    exitOrbitalPortfolioInspectMode,
    focusOrbitalPortfolioStation,
  ]);

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
      (prevViewed.variantIndex !== variantIndex || prevViewed.mediaIndex !== mediaIndex);
    const shouldAutoAlignThumbPage = !sameFocusedStation || contentChangedOnFocusedStation;
    if (
      shouldAutoAlignThumbPage &&
      mediaItems.length > ORBITAL_PORTFOLIO_CARD_MAX_THUMBS &&
      (mediaIndex < thumbPageStart ||
        mediaIndex >= thumbPageStart + ORBITAL_PORTFOLIO_CARD_MAX_THUMBS)
    ) {
      thumbPageStart =
        Math.floor(mediaIndex / ORBITAL_PORTFOLIO_CARD_MAX_THUMBS) *
        ORBITAL_PORTFOLIO_CARD_MAX_THUMBS;
      thumbPageStart = THREE.MathUtils.clamp(thumbPageStart, 0, maxThumbPageStart);
    }
    if (thumbPageStart !== orbitalPortfolioThumbPageStartRef.current) {
      setOrbitalPortfolioThumbPageStart(thumbPageStart);
    }
    const thumbPageChanged = thumbPageStart !== orbitalPortfolioPrevThumbPageStartRef.current;
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
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(plateQuat).normalize();
        const savedDistance = orbitalPortfolioInspectDistanceRef.current;
        const inspectDistance =
          typeof savedDistance === "number" &&
          savedDistance >= ORBITAL_PORTFOLIO_INSPECT_MIN_REASONABLE_DISTANCE &&
          savedDistance <= ORBITAL_PORTFOLIO_INSPECT_MAX_REASONABLE_DISTANCE
            ? savedDistance
            : ORBITAL_PORTFOLIO_INSPECT_DEFAULT_DISTANCE;
        const camPos = plateWorld.clone().addScaledVector(normal, inspectDistance);
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
    station.cardVariantTabs.forEach((tab) => {
      const tabMat = tab.mesh.material as THREE.MeshBasicMaterial;
      const variantAtTab = variantsForStation[tab.variantIndex];
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
      tab.mesh.userData.orbitalVariantIndex = tab.variantIndex;
    });

    const thumbLoader = new THREE.TextureLoader();
    station.cardThumbMeshes.forEach((thumb) => {
      const thumbMat = thumb.mesh.material as THREE.MeshBasicMaterial;
      const mappedMediaIndex = thumbPageStart + thumb.mediaIndex;
      const mediaAtThumb = mediaItems[mappedMediaIndex];
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
      thumb.mesh.visible = true;
      thumb.frame.visible = true;
      const prevUrl = thumb.mesh.userData.orbitalThumbTextureUrl as string | undefined;
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
    const showThumbNav = mediaItems.length > ORBITAL_PORTFOLIO_CARD_MAX_THUMBS;
    station.cardThumbNavMeshes.forEach((nav) => {
      const navMat = nav.mesh.material as THREE.MeshBasicMaterial;
      const navFrameMat = nav.frame.material as THREE.MeshBasicMaterial;
      const canMove =
        nav.direction === "prev"
          ? thumbPageStart > 0
          : thumbPageStart + ORBITAL_PORTFOLIO_CARD_MAX_THUMBS < mediaItems.length;
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
        const maxOffsetY = applyTextureForFitMode(tex, 72 / 42, station.textureFitMode, 0);
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
      orbitalPortfolioManualCameraLockRef.current = true;
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
      const plateMat = station.plate.material as THREE.MeshBasicMaterial | undefined;
      const texture = plateMat?.map;
      if (!texture) return;
      const maxOffsetY = Math.max(
        0,
        Number(station.plate.userData.textureMaxOffsetY ?? station.textureMaxOffsetY ?? 0),
      );
      if (maxOffsetY <= 0.0001) return;
      const prevNorm = THREE.MathUtils.clamp(
        Number(station.plate.userData.textureScrollNorm ?? station.textureScrollNorm ?? 0),
        0,
        1,
      );
      const nextNorm = THREE.MathUtils.clamp(prevNorm + event.deltaY * 0.0011, 0, 1);
      if (Math.abs(nextNorm - prevNorm) < 1e-4) return;
      station.textureScrollNorm = nextNorm;
      station.plate.userData.textureScrollNorm = nextNorm;
      const activeFitMode =
        (station.plate.userData.textureFitMode as "contain" | "cover" | undefined) ??
        station.textureFitMode;
      applyTextureForFitMode(texture, 72 / 42, activeFitMode, nextNorm);
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [orbitalPortfolioActive, exitOrbitalPortfolioInspectMode]);

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
        const rotated = reversed.map((_, idx) => reversed[(idx + rotateBy) % reversed.length] ?? 0);
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
      let tex = moonTravelSignTextureCacheRef.current.get(textureKey) ?? null;
      if (!tex) {
        tex = createMoonTravelSignTexture(memory);
        moonTravelSignTextureCacheRef.current.set(textureKey, tex);
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
      moonTopNdc.copy(moonCenter).addScaledVector(camUp, moonRadius).project(cam);
      moonBottomNdc.copy(moonCenter).addScaledVector(camUp, -moonRadius).project(cam);
      const moonNdcRadiusY = Math.max(0.02, Math.abs(moonTopNdc.y - moonBottomNdc.y) * 0.5);
      const moonNdcRadiusX = Math.max(0.02, moonNdcRadiusY * 0.95);
      let bestScore = -Infinity;
      for (let attempt = 0; attempt < 14; attempt += 1) {
        // Pick a point on the projected, visible upper/front part of the moon disk.
        const pickX =
          moonCenterNdc.x +
          (laneScreen * moonNdcRadiusX * 1.12) +
          (Math.random() - 0.5) * moonNdcRadiusX * 0.24;
        const pickY =
          moonCenterNdc.y +
          moonNdcRadiusY * (0.21 + Math.random() * 0.66);
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
              .addScaledVector(tangent, (Math.random() - 0.5) * moonRadius * 0.12)
              .addScaledVector(camUp, moonRadius * (0.16 + Math.random() * 0.24));
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
      signObject = sprite;
      signMaterial = mat;
      signObject.position.set(
        worldPos.x,
        worldPos.y,
        worldPos.z,
      );
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
        !projectShowcaseActiveRef.current &&
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
      const intervalMs = THREE.MathUtils.clamp(tuning.timeBetweenMessagesSec, 0, 5) * 1000;
      const immediateMode = intervalMs <= 1;
      if (moonTravelSignPauseUntilRef.current > 0 && now >= moonTravelSignPauseUntilRef.current) {
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
          const startIndex = Math.max(0, Math.floor(playhead - lifetimeUnits - 1));
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
            activeRecord.ageMs = activeRecord.ttlMs * THREE.MathUtils.clamp(ageNorm, 0, 0.995);
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
          moonTravelSignLastSpawnAtRef.current = now + Math.max(260, intervalMs * 0.9);
        }
        moonMemoryScrubRequestRef.current = null;
      }
      const allowAutoPlayback = !memoryManualMode;
      if (allowAutoPlayback && canSpawnNow && now >= moonTravelSignLastSpawnAtRef.current) {
        let spawnedThisTick = 0;
        const maxPerTick = immediateMode ? 1 : 4;
        while (
          now >= moonTravelSignLastSpawnAtRef.current &&
          spawnedThisTick < maxPerTick
        ) {
          // Fire-and-forget: never block cadence on active-count saturation.
          while (moonTravelSignsRef.current.length >= MOON_TRAVEL_SIGN_MAX_ACTIVE) {
            const oldest = moonTravelSignsRef.current.shift();
            if (!oldest) break;
            const parent = oldest.object.parent;
            if (parent) parent.remove(oldest.object);
            oldest.material.dispose();
          }
          spawnSign(activeCompanyId, moonMesh, moonRadius);
          if (!memoryManualMode) {
            moonMemoryScrubValueRef.current = moonTravelSignPoolCursorRef.current;
          }
          spawnedThisTick += 1;
          if (moonTravelSignSequenceWrappedRef.current) {
            moonTravelSignPauseUntilRef.current =
              now + Math.max(0, tuning.waitAfterStreamSec) * 1000;
            moonTravelSignSequenceWrappedRef.current = false;
            moonTravelSignLastSpawnAtRef.current = moonTravelSignPauseUntilRef.current;
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
        const t = THREE.MathUtils.clamp(record.ageMs / Math.max(record.ttlMs, 1), 0, 1);
        if (record.arcStart && record.arcControl && record.arcEnd) {
          const inv = 1 - t;
          record.object.position
            .copy(record.arcStart)
            .multiplyScalar(inv * inv)
            .addScaledVector(record.arcControl, 2 * inv * t)
            .addScaledVector(record.arcEnd, t * t);
          const approachScale = startScaleMul + (endScaleMul - startScaleMul) * t;
          record.object.scale.copy(record.baseScale).multiplyScalar(approachScale);
        } else {
          record.object.position.addScaledVector(record.velocity, dt * 0.62 * travelSpeed);
          const riseScaleT = THREE.MathUtils.clamp(t * 0.7, 0, 1);
          const riseScale = startScaleMul + (endScaleMul - startScaleMul) * riseScaleT;
          record.object.scale.copy(record.baseScale).multiplyScalar(riseScale);
        }
        const fadeIn = THREE.MathUtils.clamp(t / 0.15, 0, 1);
        const fadeOut = THREE.MathUtils.clamp((1 - t) / 0.1, 0, 1);
        if (typeof mat.opacity === "number") {
          if (memoryManualMode && !memoryPlaybackPlaying) {
            // Keep scrub previews readable while users drag gently through the flight path.
            mat.opacity = (0.22 + Math.max(fadeIn, 0.42) * 0.38) * lightMul;
          } else {
            mat.opacity = (0.06 + Math.min(fadeIn, fadeOut) * 0.42) * lightMul;
          }
        }
        let offscreenPast = false;
        if (camTick) {
          activeSignNdc.copy(record.object.position).project(camTick);
          offscreenPast =
            activeSignNdc.z > 1.02 ||
            Math.abs(activeSignNdc.x) > 1.35 ||
            Math.abs(activeSignNdc.y) > 1.35;
        }
        const shouldCull = !memoryManualMode;
        if (shouldCull && (record.ageMs >= record.ttlMs || offscreenPast)) {
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
              THREE.MathUtils.clamp(latest.ageMs / Math.max(latest.ttlMs, 1), 0, 0.98);
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
    let pending:
      | {
          stationIndex?: number;
          coreId?: string;
          mediaIndex?: number;
          variantIndex?: number;
          thumbNavDirection?: "prev" | "next";
          kind: "plate" | "thumb" | "variant" | "core" | "thumb-nav";
        }
      | null = null;

    const pickPortfolioTarget = (
      clientX: number,
      clientY: number,
    ):
      | {
          stationIndex?: number;
          coreId?: string;
          mediaIndex?: number;
          variantIndex?: number;
          thumbNavDirection?: "prev" | "next";
          kind: "plate" | "thumb" | "variant" | "core" | "thumb-nav";
        }
      | null => {
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
          tab.mesh.userData.orbitalVariantIndex = tab.variantIndex;
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
          | undefined) ??
        "plate";
      if (kind === "core") {
        const coreId = String(hit.userData?.orbitalCoreId ?? "");
        if (!coreId) return null;
        return { coreId, kind: "core" };
      }
      if (!Number.isFinite(stationIndex)) return null;
      if (kind === "variant") {
        const variantIndex = Number(hit.userData?.orbitalVariantIndex);
        if (!Number.isFinite(variantIndex)) return { stationIndex, kind: "plate" };
        return { stationIndex, variantIndex, kind: "variant" };
      }
      if (kind === "thumb") {
        const mediaIndex = Number(hit.userData?.orbitalMediaIndex);
        if (!Number.isFinite(mediaIndex)) return { stationIndex, kind: "plate" };
        return { stationIndex, mediaIndex, kind: "thumb" };
      }
      if (kind === "thumb-nav") {
        const thumbNavDirection =
          hit.userData?.orbitalThumbNavDirection === "next" ? "next" : "prev";
        return { stationIndex, thumbNavDirection, kind: "thumb-nav" };
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
            groups[focusStation]?.variants?.[variantIndex]?.mediaItems?.length ?? 0;
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
          orbitalPortfolioThumbSlideDirectionRef.current = pending.thumbNavDirection ?? null;
          setOrbitalPortfolioThumbPageStart(nextPageStart);
          const activeDirection = pending.thumbNavDirection;
          const station = orbitalPortfolioStationsRef.current[focusStation];
          station?.cardThumbNavMeshes.forEach((nav) => {
            if (nav.direction === activeDirection) {
              nav.mesh.userData.orbitalPressedUntil = performance.now() + 140;
            }
          });
        } else if (typeof pending.stationIndex === "number") {
          focusOrbitalPortfolioStation(pending.stationIndex, pending.mediaIndex);
        }
        e.stopPropagation();
      }
      pending = null;
    };

    mount.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    return () => {
      mount.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
    };
  }, [focusOrbitalPortfolioCore, focusOrbitalPortfolioStation]);

  // ── Project showcase thumbnail clicks (in-trench carousel) ───────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
    const pointer = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      if (!projectShowcaseActiveRef.current || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, input, select, textarea, a, iframe")) return;
      const cam = sceneRef.current.camera;
      if (!cam) return;
      const isHierarchyVisible = (obj: THREE.Object3D | null | undefined) => {
        let current: THREE.Object3D | null | undefined = obj;
        while (current) {
          if (!current.visible) return false;
          current = current.parent;
        }
        return true;
      };
      const hitTargets = projectShowcasePanelsRef.current.flatMap((panel) =>
        panel.group.visible
          ? panel.thumbnailHitTargets
              .filter((target) => isHierarchyVisible(target.mesh))
              .map((target) => ({ panel, target }))
          : [],
      );
      if (hitTargets.length === 0) return;
      const rect = mount.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, cam);
      const hits = raycaster.intersectObjects(
        hitTargets.map((ht) => ht.target.mesh),
        false,
      );
      if (hits.length === 0) return;
      const hitMesh = hits[0].object as THREE.Mesh;
      const hit = hitTargets.find((ht) => ht.target.mesh === hitMesh);
      if (!hit) return;
      const { panel, target: hitTarget } = hit;
      if (projectShowcasePlayingRef.current) {
        projectShowcasePlayingRef.current = false;
        setProjectShowcasePlaying(false);
      }
      if (hitTarget.type === "media" && typeof hitTarget.mediaIndex === "number") {
        panel.setActiveMedia(hitTarget.mediaIndex);
      } else if (
        hitTarget.type === "variant" &&
        typeof hitTarget.variantIndex === "number"
      ) {
        panel.setActiveVariant(hitTarget.variantIndex);
      } else if (hitTarget.type === "prev") {
        panel.triggerThumbnailNavPress("prev");
        panel.setThumbnailPageStart(
          panel.thumbnailPageStart - PROJECT_SHOWCASE_THUMBS_PER_PAGE,
        );
      } else if (hitTarget.type === "next") {
        panel.triggerThumbnailNavPress("next");
        panel.setThumbnailPageStart(
          panel.thumbnailPageStart + PROJECT_SHOWCASE_THUMBS_PER_PAGE,
        );
      }
      bumpProjectShowcaseViewportTick();
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    mount.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      mount.removeEventListener("pointerdown", onPointerDown, { capture: true });
    };
  }, [bumpProjectShowcaseViewportTick]);

  // ── Project showcase image controls: Shift+drag / Shift+wheel ─────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let dragging = false;
    let activePanel: ShowcasePanelRecord | null = null;
    let lastX = 0;
    let lastY = 0;
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
    const pointer = new THREE.Vector2();

    const getInteractivePanelAtPointer = (
      clientX: number,
      clientY: number,
    ): ShowcasePanelRecord | null => {
      if (!projectShowcaseActiveRef.current) return null;
      const cam = sceneRef.current.camera;
      if (!cam) return null;
      const panels = projectShowcasePanelsRef.current.filter(
        (panel) => panel.fitMode === "cover" && !!panel.texture && panel.group.visible,
      );
      if (panels.length === 0) return null;
      const rect = mount.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, cam);
      const hits = raycaster.intersectObjects(
        panels.map((panel) => panel.imageMesh),
        false,
      );
      if (hits.length === 0) return null;
      const hitObj = hits[0].object;
      return panels.find((panel) => panel.imageMesh === hitObj) ?? null;
    };

    const pauseShowcasePlayback = () => {
      if (!projectShowcasePlayingRef.current) return;
      projectShowcasePlayingRef.current = false;
      setProjectShowcasePlaying(false);
      projectShowcaseJumpTargetRef.current = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, input, select, textarea, a")) return;
      const panel = getInteractivePanelAtPointer(e.clientX, e.clientY);
      if (!panel) return;
      pauseShowcasePlayback();
      dragging = true;
      activePanel = panel;
      lastX = e.clientX;
      lastY = e.clientY;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const panel = activePanel;
      if (!panel) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const zoom = THREE.MathUtils.clamp(panel.zoom, 1, 4);
      const repX = panel.baseRepeat.x / zoom;
      const repY = panel.baseRepeat.y / zoom;
      const rangeX = Math.max(0, 1 - repX);
      const rangeY = Math.max(0, 1 - repY);
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      panel.panX += (dx / width) * rangeX * 1.3;
      panel.panY += (dy / height) * rangeY * 1.3;
      applyProjectShowcasePanelViewport(panel);
      bumpProjectShowcaseViewportTick();
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const onPointerUp = () => {
      dragging = false;
      activePanel = null;
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      const panel = getInteractivePanelAtPointer(e.clientX, e.clientY);
      if (!panel) return;
      pauseShowcasePlayback();
      const zoomDir = e.deltaY < 0 ? 1 : -1;
      setProjectShowcasePanelZoom(panel.zoom + zoomDir * 0.12);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    mount.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    mount.addEventListener("wheel", onWheel, { passive: false, capture: true });

    return () => {
      mount.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      mount.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [
    applyProjectShowcasePanelViewport,
    bumpProjectShowcaseViewportTick,
    setProjectShowcasePanelZoom,
  ]);

  // ── Project showcase detail pane scroll (wheel on description) ─────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
    const pointer = new THREE.Vector2();

    const onWheel = (e: WheelEvent) => {
      if (!projectShowcaseActiveRef.current || e.shiftKey) return;
      // Wheel now primarily drives tunnel movement. Use Alt+wheel for
      // explicit description scrolling when needed.
      if (!e.altKey) return;
      const cam = sceneRef.current.camera;
      if (!cam) return;
      const rect = mount.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, cam);
      const details = projectShowcasePanelsRef.current
        .filter((panel) => panel.group.visible && !!panel.detailMesh)
        .map((panel) => ({
          panel,
          mesh: panel.detailMesh as THREE.Mesh,
        }));
      if (details.length === 0) return;
      const hits = raycaster.intersectObjects(
        details.map((d) => d.mesh),
        false,
      );
      if (hits.length === 0) return;
      const hitMesh = hits[0].object as THREE.Mesh;
      const hit = details.find((d) => d.mesh === hitMesh);
      if (!hit) return;
      const panel = hit.panel;
      if (panel.detailScrollMax <= 0) return;
      const delta = e.deltaY > 0 ? 1 : -1;
      const nextOffset = THREE.MathUtils.clamp(
        panel.detailScrollOffset + delta,
        0,
        panel.detailScrollMax,
      );
      if (nextOffset === panel.detailScrollOffset) return;
      panel.detailScrollOffset = nextOffset;
      panel.updateDetailTexture();
      bumpProjectShowcaseViewportTick();
      e.preventDefault();
      e.stopPropagation();
    };

    mount.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      mount.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [bumpProjectShowcaseViewportTick]);

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
      mount.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointermove", onPointerMove, { capture: true });
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
    const projects = planetsDataRef.current.get("projects")?.position;
    const portfolio = planetsDataRef.current.get("portfolio")?.position;
    if (exp) targets.push({ pos: exp.clone(), radius: EXP_WANDER_RADIUS });
    if (skills) targets.push({ pos: skills.clone(), radius: SKILLS_WANDER_RADIUS });
    if (projects) targets.push({ pos: projects.clone(), radius: PROJ_WANDER_RADIUS });
    if (portfolio) targets.push({ pos: portfolio.clone(), radius: PROJ_WANDER_RADIUS });
    // Sun is centered at origin; keep a tighter band so it's in view.
    targets.push({ pos: new THREE.Vector3(0, 0, 0), radius: SUN_WANDER_RADIUS });

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
      const intensity = insideShip ? 0 : (shipExteriorLights ? 0.15 : 0);
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
    const textureLoader = new THREE.TextureLoader();

    const { starfield, skyfield } = createStarfieldMeshes(textureLoader);
    starfield.visible = spaceBackgroundVisible;
    skyfield.visible = spaceBackgroundVisible;
    starfieldMeshRef.current = starfield;
    skyfieldMeshRef.current = skyfield;
    scene.add(starfield);
    scene.add(skyfield);

    // --- LIGHTING ---
    const { ambientLight, sunLight, fillLight } = createLighting(
      optionsRef.current,
    );
    scene.add(ambientLight);
    scene.add(sunLight);
    scene.add(fillLight);
    sceneRef.current.ambientLight = ambientLight;
    sceneRef.current.sunLight = sunLight;
    sceneRef.current.fillLight = fillLight;

    const { sunMesh, sunMaterial } = createSunMesh(textureLoader);
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
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(SUN_GLOW_SPRITE_SIZE, SUN_GLOW_SPRITE_SIZE, 1);
    sunMesh.add(sprite);
    sceneRef.current.sunGlowMaterial = spriteMaterial;

    // Sun Labels (Restored)
    const sunLabel = createLabel(
      resumeData.personal.name,
      resumeData.personal.title,
    );
    sunLabel.position.set(0, SUN_LABEL_Y, 0);
    sunMesh.add(sunLabel);
    sunLabelRef.current = sunLabel;

    // 2. HELPER: Create Planet
    const createPlanet = createPlanetFactory({
      scene,
      textureLoader,
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
        new THREE.BoxGeometry(aboutSquareSize, aboutSquareSize, aboutSquareDepth),
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
      const rimCellThickness = Math.max(aboutCellDepth, Math.min(cellStep * 0.36, 22));
      const rimDivisions = Math.max(6, Math.round(aboutSquareSize / Math.max(rimCellThickness, 18)));
      const rimStep = aboutSquareSize / rimDivisions;
      const rimDepthDivisions = Math.max(2, Math.round(aboutSquareDepth / Math.max(aboutCellDepth, 5)));
      const rimDepthStep = aboutSquareDepth / rimDepthDivisions;
      const tileQuat = new THREE.Quaternion().setFromEuler(tile.rotation).normalize();
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
          contentStrength: face === "front" ? 1 : (face === "back" ? 0.82 : 0.68),
        });
      };
      const patternPoints: number[] = [];
      for (let i = 0; i <= aboutCellDivisions; i += 1) {
        const c = -half + i * cellStep;
        patternPoints.push(c, -half, zf + 0.16, c, half, zf + 0.16);
        patternPoints.push(-half, c, zf + 0.16, half, c, zf + 0.16);
      }
      const patternGeom = new THREE.BufferGeometry();
      patternGeom.setAttribute("position", new THREE.Float32BufferAttribute(patternPoints, 3));
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
          depthTest: false,
          blending: THREE.NormalBlending,
          side: THREE.DoubleSide,
        }),
      );
      contentPlane.position.set(0, 0, zf + aboutCellDepth * 1.2);
      contentPlane.renderOrder = 120;
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
      createAboutTile(-aboutTileSpacing, dishLift, outerZ, -2.8, 0, 0, 1, aboutSlots),
      createAboutTile(aboutTileSpacing, dishLift, outerZ, -2.8, 0, 0, 2, aboutSlots),
      createAboutTile(0, aboutTileSpacing + dishLift * 0.3, outerZ, -2.8, 0, 0, 3, aboutSlots),
    ];
    aboutSquareRoot.add(
      ...aboutTiles,
    );
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
      depthTest: false,
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
    aboutCells.renderOrder = 130;
    const baseColor = new THREE.Color(0x132a44);
    aboutFrontSlotIndicesRef.current = [];
    aboutCellBaseColorsRef.current = aboutSlots.map(() => baseColor.clone());
    aboutCellTargetColorsRef.current = aboutSlots.map(() => baseColor.clone());
    aboutCellRevealAtMsRef.current = aboutSlots.map(() => 0);
    const tempMatrix = new THREE.Matrix4();
    const records: AboutCellRecord[] = aboutSlots.map((slot, idx) => {
      tempMatrix.compose(
        slot.worldPosition,
        slot.worldQuaternion,
        slot.scale,
      );
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
    aboutLabel.position.set(0, aboutSquareSize * 1.66, aboutSquareDepth * 0.5 + 10);
    aboutSquareRoot.add(aboutLabel);
    scene.add(aboutSquareRoot);
    aboutMemorySquareRootRef.current = aboutSquareRoot;

    // 4. MOONS
    const experienceJobs = Object.values(resumeData.experience).flat();
    const experienceCount = experienceJobs.length || 1;
    const experienceStartOffset = Math.PI * 0.15;

    experienceJobs.forEach((job, i) => {
      const textureUrl = EXPERIENCE_MOON_TEXTURE_BY_JOB_ID[job.id];

      // Job moons should be clickable with section index 2+i
      // (section 0 = hero+summary, section 1 = skills, sections 2+ = jobs)
      const moonMesh = createPlanet(
        job.company,
        EXP_MOON_ORBIT_BASE + i * EXP_MOON_ORBIT_STEP,
        EXP_MOON_RADIUS,
        0xffaadd,
        expPlanet,
        0.002 + Math.random() * 0.001,
        2 + i, // Make job moons clickable with correct section index
        textureUrl,
        experienceStartOffset + (i * Math.PI * 2) / experienceCount,
      );

      // Register moon with position emitter for tracking
      const moonId = `moon-${job.id}`;
      moonMesh.userData.moonId = moonId;
      emitterRef.current.registerObject(moonId, moonMesh, 16); // 60fps updates

      // Remove the rotation that might be causing visual issues
      // moon.rotation.x = Math.PI / 2;
    });

    // Skills constellation lattice (unique skills representation)
    const skillsLatticeRoot = new THREE.Group();
    skillsLatticeRoot.name = "SkillsConstellationLattice";
    skillsLatticeRoot.position.copy(skillsAnchor).add(new THREE.Vector3(0, 8, 0));
    skillsLatticeRoot.visible = false;
    const categoryEntries = Object.entries(resumeData.skills) as Array<
      [string, string[]]
    >;
    const categoryNodeRadius = 3.2;
    const skillNodeRadius = 1.25;
    const latticeRadius = 58;
    const latticeEnvelopeRadius = 396;
    const latticeNodes: SkillsLatticeNodeRecord[] = [];
    const latticeLinkSegments: SkillsLatticeLinkSegment[] = [];

    // Muted, larger outer "glass drone" shell around the lattice.
    const latticeEnvelopeGeometry = new THREE.IcosahedronGeometry(latticeEnvelopeRadius, 1)
      .toNonIndexed();
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
      const bucket = Math.floor((i / 3) / 4) % envelopePalette.length;
      envelopeWork.copy(envelopePalette[bucket]);
      const hsl = { h: 0, s: 0, l: 0 };
      envelopeWork.getHSL(hsl);
      envelopeWork.setHSL(hsl.h, Math.min(1, hsl.s * 1.18), Math.min(0.74, hsl.l * 1.06));
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
    const latticeEnvelope = new THREE.Mesh(
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
    skillsLatticeEnvelopeMatRef.current = latticeEnvelope.material as THREE.MeshPhongMaterial;
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
      transparent: false,
      opacity: 1,
      side: THREE.FrontSide,
      depthWrite: true,
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
        opacity: 0.23,
        depthWrite: false,
      }),
    );
    beaconEdges.scale.setScalar(1.004);
    skillsBeacon.add(beaconEdges);
    const beaconLabel = createLabel("Skills", "Constellation Lattice");
    beaconLabel.userData.skillsLatticeLabel = true;
    beaconLabel.position.set(0, latticeEnvelopeRadius * 0.82, 0);
    const labelEl = (beaconLabel as unknown as { element?: HTMLElement }).element;
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
    skillsLatticeBeaconEdgeMatRef.current = beaconEdges.material as THREE.LineBasicMaterial;
    skillsLatticeBeaconLabelRef.current = beaconLabel;

    // Orbital Registry Portfolio beacon + dedicated scene root
    const portfolioAnchor = ORBITAL_PORTFOLIO_WORLD_ANCHOR.clone();
    orbitalPortfolioWorldAnchorRef.current = portfolioAnchor.clone();
    const portfolioBeacon = new THREE.Mesh(
      new THREE.IcosahedronGeometry(190, 1),
      new THREE.MeshPhongMaterial({
        color: 0x61d8ff,
        emissive: 0x112c44,
        emissiveIntensity: 0.46,
        shininess: 90,
        specular: new THREE.Color(0xc8efff),
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
      }),
    );
    portfolioBeacon.position.copy(portfolioAnchor);
    portfolioBeacon.userData.sectionIndex = 4;
    portfolioBeacon.userData.planetName = "Portfolio";
    portfolioBeacon.userData.sectionId = "portfolio";
    const portfolioBeaconEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(portfolioBeacon.geometry),
      new THREE.LineBasicMaterial({
        color: 0xb8eeff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    portfolioBeaconEdges.scale.setScalar(1.008);
    portfolioBeacon.add(portfolioBeaconEdges);
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
    orbitalRoot.visible = false;
    const orbitalBuild = buildPortfolioCoreViews(
      portfolioCores as Array<{
        core: string;
        coreColor?: string;
        plains: Array<{
          angle: number;
          items: Array<{
            orbitColor?: string;
            items?: Array<{
              id: string;
              title: string;
              image: string;
              description?: string;
              technologies?: string[];
              year?: number | null;
              fit?: "contain" | "cover";
              galleryMedia?: Array<{
                id: string;
                type?: "image" | "video" | "youtube";
                image?: string;
                videoUrl?: string;
                thumbnail?: string;
                youtubeUrl?: string;
                title?: string;
                description?: string;
                fit?: "contain" | "cover";
              }>;
              clientVariants?: Array<{
                id: string;
                title: string;
                image?: string;
                description?: string;
                technologies?: string[];
                year?: number | null;
                fit?: "contain" | "cover";
                galleryMedia?: Array<{
                  id: string;
                  type?: "image" | "video" | "youtube";
                  image?: string;
                  videoUrl?: string;
                  thumbnail?: string;
                  youtubeUrl?: string;
                  title?: string;
                  description?: string;
                  fit?: "contain" | "cover";
                }>;
              }>;
              published?: boolean;
            }>;
          }>;
        }>;
      }>,
    );
    const orbitalGroups = orbitalBuild.groups;
    const orbitalCoreViews = orbitalBuild.cores;
    orbitalPortfolioGroupsRef.current = orbitalGroups;
    orbitalPortfolioCoreViewsRef.current = orbitalCoreViews;
    const expandedState: Record<string, boolean> = {};
    orbitalCoreViews.forEach((core) => {
      expandedState[core.id] = false;
    });
    setOrbitalRegistryExpandedCoreIds(expandedState);
    setOrbitalPortfolioFocusedCoreId(orbitalCoreViews[0]?.id ?? "");
    const coreSpacing = 1260;
    const coreColumns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, orbitalCoreViews.length))));
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
      const nucleusColor = coreColor.clone().lerp(new THREE.Color(0xffffff), 0.42);
      const glowColor = coreColor.clone().lerp(new THREE.Color(0xffffff), 0.18);
      const coreRow = Math.floor(coreIndex / coreColumns);
      const coreCol = coreIndex % coreColumns;
      const centerLocal = new THREE.Vector3(
        (coreCol - (coreColumns - 1) * 0.5) * coreSpacing,
        0,
        (coreRow - (Math.ceil(orbitalCoreViews.length / coreColumns) - 1) * 0.5) * coreSpacing,
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
      const latticeShellGeometry = new THREE.IcosahedronGeometry(46, 1).toNonIndexed();
      const shellPalette = [0x2f6fff, 0x27dcff, 0x6f47ff, 0xdb43ff, 0x28e0b7, 0xffb13a];
      const shellPosAttr = latticeShellGeometry.getAttribute("position") as THREE.BufferAttribute;
      const shellColorAttr = new THREE.BufferAttribute(
        new Float32Array(shellPosAttr.count * 3),
        3,
      );
      const shellBaseColors = new Float32Array(shellPosAttr.count * 3);
      const shellColor = new THREE.Color();
      for (let i = 0; i < shellPosAttr.count; i += 3) {
        const bucket = Math.floor((i / 3) / 4) % shellPalette.length;
        shellColor.setHex(shellPalette[bucket]);
        const tint = 0.82 + (((i / 3) % 5) * 0.03);
        shellColor.multiplyScalar(tint);
        for (let v = 0; v < 3; v += 1) {
          const bi = (i + v) * 3;
          shellBaseColors[bi] = shellColor.r;
          shellBaseColors[bi + 1] = shellColor.g;
          shellBaseColors[bi + 2] = shellColor.b;
          shellColorAttr.array[bi] = shellColor.r;
          shellColorAttr.array[bi + 1] = shellColor.g;
          shellColorAttr.array[bi + 2] = shellColor.b;
        }
      }
      latticeShellGeometry.setAttribute("color", shellColorAttr);
      const latticeShell = new THREE.Mesh(
        latticeShellGeometry,
        new THREE.MeshPhongMaterial({
          color: 0xffffff,
          flatShading: true,
          shininess: 90,
          specular: new THREE.Color(0xc9e8ff),
          emissive: 0x101828,
          emissiveIntensity: 0.08,
          vertexColors: true,
          transparent: true,
          opacity: 0.16,
          side: THREE.FrontSide,
          depthWrite: false,
        }),
      );
      const latticeEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(latticeShellGeometry),
        new THREE.LineBasicMaterial({
          color: 0xaed9ff,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      );
      latticeEdges.scale.setScalar(1.004);
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
        const dir = new THREE.Vector3(Math.cos(a), Math.sin(i * 0.47) * 0.24, Math.sin(a))
          .normalize();
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
      coreRoot.add(coreNucleus, coreGlow, latticeShell, latticeEdges, sliceGroup, rayGroup);
      const coreLabel = createLabel(coreView.title, "Orbital Core");
      coreLabel.userData.orbitalPortfolioLabel = true;
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
        panelMat: latticeShell.material as THREE.MeshPhongMaterial,
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
            return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)
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
    const coreById = new Map(coreRecords.map((core) => [core.id, core] as const));
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
      const startLocalPos = new THREE.Vector3(Math.cos(a) * orbitRadius, 0, Math.sin(a) * orbitRadius)
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
      const framePosAttr = frameGeom.getAttribute("position") as THREE.BufferAttribute;
      const platePosAttr = plateGeom.getAttribute("position") as THREE.BufferAttribute;
      framePosAttr.setUsage(THREE.DynamicDrawUsage);
      platePosAttr.setUsage(THREE.DynamicDrawUsage);
      const frameFlatPositions = new Float32Array(framePosAttr.array as Float32Array);
      const plateFlatPositions = new Float32Array(platePosAttr.array as Float32Array);
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
      morphPanelGeometry(framePosAttr, frameCurvedPositions, frameFlatPositions, 0);
      morphPanelGeometry(platePosAttr, plateCurvedPositions, plateFlatPositions, 0);
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
      stationGroup.add(cardTitleMesh);

      const cardVariantTabs: Array<{ mesh: THREE.Mesh; frame: THREE.Mesh; variantIndex: number }> = [];
      const variantTabStartX = -24;
      const variantTabGap = 11.5;
      for (let variantIndex = 0; variantIndex < ORBITAL_PORTFOLIO_CARD_MAX_VARIANT_TABS; variantIndex += 1) {
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
        stationGroup.add(tabFrame, tabMesh);
        cardVariantTabs.push({ mesh: tabMesh, frame: tabFrame, variantIndex });
      }

      const cardThumbMeshes: Array<{ mesh: THREE.Mesh; frame: THREE.Mesh; mediaIndex: number }> = [];
      const thumbStartX = -23;
      const thumbGap = 9.3;
      for (let mediaIndex = 0; mediaIndex < ORBITAL_PORTFOLIO_CARD_MAX_THUMBS; mediaIndex += 1) {
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
        thumbFrame.position.set(thumbStartX + mediaIndex * thumbGap, -23.8, 1.16);
        thumbMesh.position.set(thumbStartX + mediaIndex * thumbGap, -23.8, 1.2);
        thumbFrame.userData.orbitalBaseX = thumbFrame.position.x;
        thumbFrame.userData.orbitalBaseY = thumbFrame.position.y;
        thumbMesh.userData.orbitalBaseX = thumbMesh.position.x;
        thumbMesh.userData.orbitalBaseY = thumbMesh.position.y;
        stationGroup.add(thumbFrame, thumbMesh);
        cardThumbMeshes.push({ mesh: thumbMesh, frame: thumbFrame, mediaIndex });
      }
      const createThumbNav = (
        direction: "prev" | "next",
        x: number,
      ): { mesh: THREE.Mesh; frame: THREE.Mesh; direction: "prev" | "next" } => {
        const navFrame = new THREE.Mesh(
          new THREE.PlaneGeometry(5.4, 5.8),
          new THREE.MeshBasicMaterial({
            color: 0x9adfff,
            transparent: true,
            opacity: 0.84,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        const navMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(4.8, 5.2),
          new THREE.MeshBasicMaterial({
            color: 0xe8f7ff,
            transparent: true,
            opacity: 0.94,
            side: THREE.DoubleSide,
            toneMapped: false,
            depthWrite: false,
          }),
        );
        const arrowTexture = createDetailTexture([direction === "prev" ? "‹" : "›"], {
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
        });
        navMesh.material.map = arrowTexture;
        navFrame.position.set(x, -23.8, 1.16);
        navMesh.position.set(x, -23.8, 1.2);
        stationGroup.add(navFrame, navMesh);
        return { mesh: navMesh, frame: navFrame, direction };
      };
      const cardThumbNavMeshes = [
        createThumbNav("prev", -31.2),
        createThumbNav("next", 31.2),
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
      label.position.set(0, 62, 0);
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
      const mediaItems = (group.variants[0]?.mediaItems ?? []).slice(0, 10);
      mediaItems.forEach((item, mi) => {
        const ma = (mi / Math.max(1, mediaItems.length)) * Math.PI * 2;
        const thumbGeom = new THREE.PlaneGeometry(8, 5, 16, 1);
        const thumbPosAttr = thumbGeom.getAttribute("position") as THREE.BufferAttribute;
        const thumbFlatPositions = new Float32Array(
          thumbPosAttr.array as Float32Array,
        );
        const thumbCurvedPositions = buildCurvedPanelPositions(
          thumbFlatPositions,
          8,
          Math.PI * 0.72,
        );
        morphPanelGeometry(thumbPosAttr, thumbCurvedPositions, thumbFlatPositions, 0);
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
        thumb.position.set(Math.cos(ma) * 37, Math.sin(ma * 2.1) * 3.5, Math.sin(ma) * 37);
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
        plainNormalLocal: new THREE.Vector3(0, 1, 0).applyQuaternion(plainQuat).normalize(),
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
        cardThumbMeshes,
        cardThumbNavMeshes,
        orbitLane: lane as 0 | 1,
        orbitAngle: a,
        orbitDirection,
        orbitRadius,
        orbitVerticalAmp,
        orbitMotionBlend: 1,
      });
    });
    orbitalRoot.traverse((obj) => obj.layers.set(ORBITAL_PORTFOLIO_LAYER));
    // Keep depth-only occluders on the overlay/card layer.
    coreCardOccluders.forEach((occluder) => {
      occluder.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
    });
    // Render screenshot cards on the overlay layer so bright whites do not bloom-wash.
    stationRecords.forEach((station) => {
      station.plate.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      station.frame.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      station.cardTitleMesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      station.impactSprite.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      station.cardVariantTabs.forEach((tab) => {
        tab.frame.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        tab.mesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      });
      station.cardThumbMeshes.forEach((thumb) => {
        thumb.frame.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        thumb.mesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      });
      station.cardThumbNavMeshes.forEach((nav) => {
        nav.frame.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        nav.mesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
      });
      station.mediaHaloGroup.traverse((obj) => obj.layers.set(PROJECT_SHOWCASE_CARD_LAYER));
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
      const safeCoreIndex = THREE.MathUtils.clamp(coreIndex, 0, Math.max(0, cores.length - 1));
      const coreId = cores[safeCoreIndex]?.id;
      if (!coreId) return Math.floor(Math.random() * stations.length);
      const candidates: number[] = [];
      stations.forEach((station, stationIndex) => {
        if (station.coreId === coreId) candidates.push(stationIndex);
      });
      if (candidates.length === 0) return Math.floor(Math.random() * stations.length);
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
      const sourceCoreIndex = Math.floor(Math.random() * Math.max(1, coreRecords.length));
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
        : Object.values((rawExperience as Record<string, unknown[]>) ?? {}).flat()
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
        const match = responsibilities.find((line) => line.toLowerCase().includes(needle));
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

    categoryEntries.forEach(([category, skills], idx) => {
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
        detailItems: [...skills.slice(0, 8), ...findCategoryEvidence(skills)],
        halo: catHalo ?? undefined,
        lineInfluence: idx,
      });

      const catLabel = createLabel(category, `${skills.length} skills`);
      catLabel.userData.skillsLatticeLabel = true;
      catLabel.position.set(cPos.x, cPos.y + 6.6, cPos.z);
      catLabel.visible = false;
      skillsLatticeRoot.add(catLabel);
      skillsLatticeNodeLabelsRef.current.push(catLabel);

      const skillLinePoints: number[] = [];
      const skillOrbitR = 11 + Math.min(7, skills.length * 0.7);
      skills.forEach((skill, sIdx) => {
        const sa = (sIdx / Math.max(1, skills.length)) * Math.PI * 2 + idx * 0.35;
        const sPos = new THREE.Vector3(
          cPos.x + Math.cos(sa) * skillOrbitR,
          cPos.y + Math.sin(sa * 1.4) * 2.2,
          cPos.z + Math.sin(sa) * skillOrbitR,
        );
        const skillNode = new THREE.Mesh(
          new THREE.OctahedronGeometry(skillNodeRadius, 0),
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
          label: skill,
          nodeType: "skill",
          category,
        };
        skillsLatticeRoot.add(skillNode);
        const skillHalo = makeNodeHalo(skillNodeRadius, 0xdaf1ff);
        if (skillHalo) {
          skillHalo.position.copy(sPos);
          skillsLatticeRoot.add(skillHalo);
        }
        const skillEvidence = findSkillEvidence(skill);
        latticeNodes.push({
          mesh: skillNode,
          baseScale: 1,
          phase: idx * 2.13 + sIdx * 0.77,
          label: skill,
          nodeType: "skill",
          category,
          detailItems: skillEvidence.length
            ? [category, ...skillEvidence]
            : [category, "No mapped evidence yet (add responsibilities with this skill term)."],
          halo: skillHalo ?? undefined,
          lineInfluence: idx + sIdx * 0.15,
        });
        const skillLabel = createLabel(skill);
        skillLabel.userData.skillsLatticeLabel = true;
        skillLabel.position.set(sPos.x, sPos.y + 2.4, sPos.z);
        skillLabel.visible = false;
        skillsLatticeRoot.add(skillLabel);
        skillsLatticeNodeLabelsRef.current.push(skillLabel);
        skillLinePoints.push(cPos.x, cPos.y, cPos.z, sPos.x, sPos.y, sPos.z);
        latticeLinkSegments.push({
          from: cPos.clone(),
          to: sPos.clone(),
        });
      });
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
          targetIndex: Math.floor(Math.random() * Math.max(1, latticeNodes.length)),
          phase: Math.random(),
          sway: 0.8 + Math.random() * 0.9,
          speed: 0.72 + Math.random() * 0.9,
        });
      }
      skillsLatticeArcRecordsRef.current = arcRecords;
    }
    scene.add(skillsLatticeRoot);
    skillsLatticeRootRef.current = skillsLatticeRoot;
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
    loader.load(
      "/models/spaceship/scene.gltf",
      (gltf) => {
        const spaceship = gltf.scene;

        // Scale down the spaceship to be tiny compared to planets
        spaceship.scale.set(FALCON_SCALE, FALCON_SCALE, FALCON_SCALE);

        // Align model forward axis (model front is +Z; navigation lookAt uses -Z)
        spaceship.userData.forwardOffset = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, Math.PI, 0),
        );

        // Position it initially near the sun
        spaceship.position.set(FALCON_INITIAL_POS.x, FALCON_INITIAL_POS.y, FALCON_INITIAL_POS.z);
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
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry && !mesh.geometry.boundingSphere) {
            mesh.geometry.computeBoundingSphere();
          }
          const worldCenter = mesh.geometry?.boundingSphere
            ? mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld)
            : mesh.getWorldPosition(new THREE.Vector3());
          const localToShip = spaceship.worldToLocal(worldCenter.clone());
          const isRearSection = localToShip.z < -0.65;
          if (!isRearSection) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
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
              e.b > 0.08 &&
              e.b > e.r * 1.2 &&
              e.b > e.g * 1.15;
            if (!isBlueEmissive) return;
            if (seenMaterialUuids.has(mat.uuid)) return;
            seenMaterialUuids.add(mat.uuid);
            if (!mat.userData) mat.userData = {};
            const baseEmissive = e.clone();
            const baseIntensity =
              typeof mat.emissiveIntensity === "number" ? mat.emissiveIntensity : 1;
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
        vlog(`🚀 Falcon engine panel mats detected: ${enginePanelMaterials.length}`);

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

        scene.add(spaceship);
        spaceshipRef.current = spaceship;
        vlog("🚀 Spaceship loaded - ready for navigation");

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
        vlog(`✈️ Cockpit interior position: camera [${cockpitCamLocal.x.toFixed(1)}, ${cockpitCamLocal.y.toFixed(1)}, ${cockpitCamLocal.z.toFixed(1)}], look [${cockpitLookLocal.x.toFixed(1)}, ${cockpitLookLocal.y.toFixed(1)}, ${cockpitLookLocal.z.toFixed(1)}]`);

        // Initialize navigation system
        initializeNavigationSystem(spaceship, scene);
      },
      undefined,
      () => {
        vlog("❌ Failed to load spaceship model");
      },
    );

    // --- STAR DESTROYER LOADING ---
    loader.load(
      "/models/star-destroyer/scene.gltf",
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
        starDestroyer.position.set(SD_INITIAL_POS.x, SD_INITIAL_POS.y, SD_INITIAL_POS.z);

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

        // Initialize the cruiser AI
        const cruiser = new StarDestroyerCruiser(starDestroyer);
        starDestroyerCruiserRef.current = cruiser;
        // SD autonomy is enabled by default on universe startup.
        // Scripted systems (e.g. Skills lock) temporarily override pose.
        cruiser.setEnabled(true);
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
        const coneGeo = new THREE.ConeGeometry(SD_CONE_RADIUS, SD_CONE_LENGTH, 24, 1, true);
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
          const alpha = 1 - t * t;       // quadratic falloff — depletes toward destination
          colors[i * 4] = 0.3 + 0.4 * (1 - t);   // R: blue-white at base
          colors[i * 4 + 1] = 0.5 + 0.3 * (1 - t); // G
          colors[i * 4 + 2] = 1.0;                  // B: always blue
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

        vlog(`🔺 Star Destroyer loaded — ${sdDests.length} destinations registered`);
        shipLog("Star Destroyer online", "system");

        // Console commands for directing the Star Destroyer
        (window as any).sendSD = (name: string) => {
          if (!name) {
            const status = cruiser.getStatus();
            console.log("Usage: sendSD('planet or moon name')");
            console.log("Available destinations:", status.destinations.join(", "));
            return;
          }
          const ok = cruiser.sendTo(name);
          if (ok) {
            const s = cruiser.getStatus();
            console.log(`🔺 Star Destroyer dispatched to "${name}"`);
            console.log(`   State: ${s.hlState} | Speed: ${s.speed.toFixed(1)} | From: ${s.currentDest ?? "none"}`);
            console.log(`   SD position:`, starDestroyerRef.current?.position.toArray().map((n: number) => +n.toFixed(0)));
          } else {
            const status = cruiser.getStatus();
            console.log(`❌ Destination "${name}" not found. Available:`, status.destinations.join(", "));
          }
        };
        (window as any).sdStatus = () => {
          const s = cruiser.getStatus();
          console.log("=== STAR DESTROYER STATUS ===");
          console.log("  Autonomy enabled:", cruiser.isEnabled());
          console.log("  High-level state:", s.hlState);
          console.log("  Local state:", s.localState);
          console.log("  Speed:", s.speed.toFixed(1), "u/s");
          console.log("  Current system:", s.currentDest ?? "(none)");
          console.log("  Next destination:", s.nextDest ?? "(none)");
          console.log("  Local patrols:", s.localPatrols);
          console.log("  All destinations:", s.destinations.join(", "));
          return s;
        };
        (window as any).sdAutonomyOn = () => {
          cruiser.setEnabled(true);
          console.log("🔺 SD autonomy: ON");
          shipLog("SD autonomy enabled", "system");
        };
        (window as any).sdAutonomyOff = () => {
          cruiser.setEnabled(false);
          console.log("🔺 SD autonomy: OFF");
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
          const pillarGeo = new THREE.CylinderGeometry(2, 2, pillarHeight, 8, 1, true);
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
          const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; delay: number }[] = [];
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
              pillarGeo.dispose(); pillarMat.dispose();
              pulseGeo.dispose(); pulseMat.dispose();
              rings.forEach((r) => { r.mesh.geometry.dispose(); r.mat.dispose(); });
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
              const rt = Math.max(0, (elapsed - delay * 1000) / (duration - delay * 1000));
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

          console.log(`🎯 ${label} located at [${wp.x.toFixed(0)}, ${wp.y.toFixed(0)}, ${wp.z.toFixed(0)}]`);
        };

        (window as any).locateFalcon = () => {
          const falcon = spaceshipRef.current;
          if (!falcon) { console.log("❌ Falcon not loaded yet"); return; }
          createLocateBeacon(falcon, 0x4499ff, "Millennium Falcon");
        };

        (window as any).locateSD = () => {
          const sd = starDestroyerRef.current;
          if (!sd) { console.log("❌ Star Destroyer not loaded yet"); return; }
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
            console.log("═══════════════════════════════════════════════════");
            console.log("📷 DEBUG CAMERA — Position Capture");
            console.log("═══════════════════════════════════════════════════");
            console.log(`Camera position : { x: ${p.x.toFixed(1)}, y: ${p.y.toFixed(1)}, z: ${p.z.toFixed(1)} }`);
            console.log(`Look-at target  : { x: ${target.x.toFixed(1)}, y: ${target.y.toFixed(1)}, z: ${target.z.toFixed(1)} }`);
            console.log("");
            console.log("📋 Copy-paste for code:");
            console.log(`  camera: { x: ${p.x.toFixed(1)}, y: ${p.y.toFixed(1)}, z: ${p.z.toFixed(1)} }`);
            console.log(`  target: { x: ${target.x.toFixed(1)}, y: ${target.y.toFixed(1)}, z: ${target.z.toFixed(1)} }`);
            console.log(`  setLookAt(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}, ${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}, false);`);
            console.log("═══════════════════════════════════════════════════");
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
          if (!cam || !cc) { debugCamRAF = requestAnimationFrame(debugCamLoop); return; }

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
              newCam.x, newCam.y, newCam.z,
              newTarget.x, newTarget.y, newTarget.z,
              false,
            );
          }

          debugCamRAF = requestAnimationFrame(debugCamLoop);
        };

        (window as any).debugCamera = () => {
          if (debugCamActive) {
            console.log("⚠️ Debug camera already active. Use exitDebugCamera() to exit.");
            return;
          }
          debugCamActive = true;

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

          console.log("═══════════════════════════════════════════════════");
          console.log("🎥 DEBUG CAMERA MODE — ACTIVE");
          console.log("═══════════════════════════════════════════════════");
          console.log("  WASD        — fly forward/left/back/right");
          console.log("  Q / E       — descend / ascend");
          console.log("  Shift       — 10× speed boost");
          console.log("  Ctrl        — 0.1× precision mode");
          console.log("  Mouse drag  — orbit / look around");
          console.log("  Scroll      — zoom in/out");
          console.log("  F9          — 📷 capture position to console");
          console.log("  Escape      — exit debug mode");
          console.log("═══════════════════════════════════════════════════");
          console.log("  exitDebugCamera() — re-engage ship follow");
          console.log("═══════════════════════════════════════════════════");
        };

        (window as any).exitDebugCamera = () => {
          if (!debugCamActive) {
            console.log("⚠️ Debug camera not active.");
            return;
          }
          debugCamActive = false;
          cancelAnimationFrame(debugCamRAF);
          window.removeEventListener("keydown", debugKeyDown);
          window.removeEventListener("keyup", debugKeyUp);
          // Clear stuck keys
          Object.keys(debugKeys).forEach(k => debugKeys[k] = false);

          // Re-engage ship following
          followingSpaceshipRef.current = true;
          setFollowingSpaceship(true);
          setShipUIPhase("ship-engaged");

          // Snap camera behind ship
          const cc = sceneRef.current.controls;
          const ship = spaceshipRef.current;
          if (cc && ship) {
            const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
            const camPos = ship.position.clone().addScaledVector(behind, FOLLOW_DISTANCE);
            camPos.y += FOLLOW_HEIGHT;
            cc.setLookAt(
              camPos.x, camPos.y, camPos.z,
              ship.position.x, ship.position.y, ship.position.z,
              true,
            );
          }

          console.log("✅ Debug camera exited — ship follow re-engaged");
        };
      },
      undefined,
      () => {
        vlog("❌ Failed to load Star Destroyer model");
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
          camPos.x, camPos.y, camPos.z,
          ship.position.x, ship.position.y, ship.position.z,
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

    // --- PROJECT SHOWCASE (Trench Run) ---
    const onProjectShowcaseLoadError = () => {
      projectShowcaseRootRef.current = null;
      projectShowcaseWorldAnchorRef.current = null;
      if (projectShowcaseNebulaRootRef.current) {
        scene.remove(projectShowcaseNebulaRootRef.current);
        projectShowcaseNebulaRootRef.current = null;
      }
      setProjectShowcaseReady(false);
      vlog("⚠️ Failed to load Project Showcase trench model");
    };
    const onProjectShowcaseLoaded = (gltf: { scene: THREE.Group }) => {
        const showcaseRoot = new THREE.Group();
        showcaseRoot.name = "ProjectShowcaseRoot";
        showcaseRoot.visible = false;
        const trenchWorldAnchor = new THREE.Vector3(-9800, 420, 7800);
        showcaseRoot.position.copy(trenchWorldAnchor).add(new THREE.Vector3(0, -36, 0));

        const trench = gltf.scene;
        const trenchDiffuseCache = new Map<string, THREE.Texture>();
        const trenchDiffusePending = new Map<
          string,
          THREE.MeshStandardMaterial[]
        >();
        const ensureTrenchDiffuseMap = (mat: THREE.MeshStandardMaterial) => {
          if (mat.map || !mat.name) return;
          const key = mat.name;
          const cached = trenchDiffuseCache.get(key);
          if (cached) {
            mat.map = cached;
            mat.needsUpdate = true;
            return;
          }
          const pending = trenchDiffusePending.get(key);
          if (pending) {
            pending.push(mat);
            return;
          }
          trenchDiffusePending.set(key, [mat]);

          const basePath = `${PROJECT_SHOWCASE_TEXTURE_BASE_PATH}/${key}_diffuse`;
          const exts = ["jpeg", "jpg", "png"];
          const tryLoad = (idx: number) => {
            if (idx >= exts.length) {
              trenchDiffusePending.delete(key);
              return;
            }
            textureLoader.load(
              `${basePath}.${exts[idx]}`,
              (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                trenchDiffuseCache.set(key, texture);
                const waiters = trenchDiffusePending.get(key) ?? [];
                waiters.forEach((waitMat) => {
                  waitMat.map = texture;
                  waitMat.needsUpdate = true;
                });
                trenchDiffusePending.delete(key);
              },
              undefined,
              () => tryLoad(idx + 1),
            );
          };
          tryLoad(0);
        };

        trench.traverse((obj) => {
          const o = obj as THREE.Object3D & {
            isMesh?: boolean;
            isLight?: boolean;
            name?: string;
            visible?: boolean;
            material?: THREE.Material | THREE.Material[];
          };
          const name = (o.name || "").toLowerCase();

          // Disable embedded source lights and cinematic FX props.
          if (o.isLight) {
            o.visible = false;
            return;
          }

          if (!o.isMesh) return;
          if (
            name.includes("xwing") ||
            name.includes("tie") ||
            name.includes("fighter") ||
            name.includes("turret") ||
            name.includes("laser") ||
            name.includes("blaster") ||
            name.includes("bolt") ||
            name.includes("beam") ||
            name.includes("explosion") ||
            name.includes("sun")
          ) {
            o.visible = false;
            return;
          }

          // Keep original PBR materials and do minimal normalization only.
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((mat) => {
            const src = mat as THREE.MeshStandardMaterial & {
              emissive?: THREE.Color;
              emissiveMap?: THREE.Texture | null;
              emissiveIntensity?: number;
              map?: THREE.Texture | null;
              metalness?: number;
              roughness?: number;
              color?: THREE.Color;
              toneMapped?: boolean;
              vertexColors?: boolean;
            };
            if (src.map) src.map.colorSpace = THREE.SRGBColorSpace;
            if (src.emissiveMap) src.emissiveMap.colorSpace = THREE.SRGBColorSpace;
            if (typeof src.metalness === "number") {
              src.metalness = Math.min(src.metalness, 0.22);
            }
            if (typeof src.roughness === "number") {
              src.roughness = Math.max(src.roughness, 0.62);
            }
            if (typeof src.emissiveIntensity === "number") {
              src.emissiveIntensity = Math.min(src.emissiveIntensity, 0.35);
            }
            // This asset carries vertex colors that tint surfaces cyan in our pipeline.
            src.vertexColors = false;
            if (src.color) src.color.set(0xffffff);
            src.side = THREE.DoubleSide;
            ensureTrenchDiffuseMap(src);
            src.needsUpdate = true;
          });
        });

        // Normalize model scale so first-pass placement is predictable.
        const trenchBounds = new THREE.Box3().setFromObject(trench);
        const trenchSize = trenchBounds.getSize(new THREE.Vector3());
        const trenchMaxDim = Math.max(trenchSize.x, trenchSize.y, trenchSize.z, 1);
        const desiredMaxDim = 420;
        const trenchScale = desiredMaxDim / trenchMaxDim;
        trench.scale.setScalar(trenchScale);
        trenchBounds.setFromObject(trench);
        const trenchSizeScaled = trenchBounds.getSize(new THREE.Vector3());
        const trenchCenter = trenchBounds.getCenter(new THREE.Vector3());
        trench.position.sub(trenchCenter);
        showcaseRoot.add(trench);

        // Isolate trench rendering/lighting from the main cosmos sun.
        showcaseRoot.traverse((obj) => {
          obj.layers.set(PROJECT_SHOWCASE_LAYER);
        });

        // Add a depth-only copy of trench geometry on the card layer so
        // showcase cards are naturally occluded by tunnel walls from outside.
        const trenchCardOccluder = trench.clone(true);
        const trenchCardOccluderMat = new THREE.MeshBasicMaterial({
          color: 0x000000,
          side: THREE.DoubleSide,
        });
        trenchCardOccluderMat.colorWrite = false;
        trenchCardOccluderMat.depthWrite = true;
        trenchCardOccluderMat.depthTest = true;
        trenchCardOccluder.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!(mesh as any).isMesh) return;
          mesh.material = trenchCardOccluderMat;
          mesh.renderOrder = -250;
          mesh.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
        });
        showcaseRoot.add(trenchCardOccluder);

        const showcaseAmbient = new THREE.AmbientLight(0xffffff, 0.38);
        const showcaseKey = new THREE.DirectionalLight(0xdde8ff, 1.0);
        showcaseKey.position.set(70, 110, 50);
        const showcaseRim = new THREE.DirectionalLight(0x8db8ff, 0.32);
        showcaseRim.position.set(-80, 30, -40);
        showcaseAmbient.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseKey.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseRim.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseRoot.add(showcaseAmbient, showcaseKey, showcaseRim);

        const publishedShowcase = (legacyWebsites as ShowcaseEntry[]).filter(
          (entry) => (entry as { published?: boolean }).published !== false,
        );

        const runAxis: "x" | "z" =
          trenchSizeScaled.z >= trenchSizeScaled.x ? "z" : "x";
        const trenchForward =
          runAxis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        const trenchLateral =
          runAxis === "z" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1);
        // Trench-realm sun source: a strong angled key + beam into trench.
        const showcaseSun = new THREE.DirectionalLight(0xffe6c1, 1.85);
        showcaseSun.position.copy(
          trenchForward
            .clone()
            .multiplyScalar(-340)
            .add(trenchLateral.clone().multiplyScalar(150))
            .add(new THREE.Vector3(0, 220, 0)),
        );
        const showcaseSunTarget = new THREE.Object3D();
        showcaseSunTarget.position.copy(
          trenchForward.clone().multiplyScalar(280).add(new THREE.Vector3(0, 22, 0)),
        );
        const showcaseSunBeam = new THREE.SpotLight(
          0xfff1d8,
          2.35,
          2800,
          Math.PI / 7.2,
          0.58,
          1.2,
        );
        showcaseSunBeam.position.copy(
          trenchForward
            .clone()
            .multiplyScalar(-460)
            .add(trenchLateral.clone().multiplyScalar(160))
            .add(new THREE.Vector3(0, 250, 0)),
        );
        const showcaseSunBeamTarget = new THREE.Object3D();
        showcaseSunBeamTarget.position.copy(
          trenchForward.clone().multiplyScalar(220).add(new THREE.Vector3(0, 4, 0)),
        );
        showcaseSun.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseSunTarget.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseSunBeam.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseSunBeamTarget.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseSun.target = showcaseSunTarget;
        showcaseSunBeam.target = showcaseSunBeamTarget;
        showcaseRoot.add(
          showcaseSunTarget,
          showcaseSun,
          showcaseSunBeamTarget,
          showcaseSunBeam,
        );
        // Keep trench well away from Projects planet so entry can be a true long final.
        showcaseRoot.position
          .copy(trenchWorldAnchor)
          .addScaledVector(trenchForward, 860)
          .addScaledVector(trenchLateral, 95)
          .add(new THREE.Vector3(0, -36, 0));
        if (PROJECT_SHOWCASE_USE_NEBULA_REALM) {
          textureLoader.load(
            PROJECT_SHOWCASE_NEBULA_JPG_PATH,
            (nebulaTexture) => {
              nebulaTexture.colorSpace = THREE.SRGBColorSpace;
              nebulaTexture.mapping = THREE.EquirectangularReflectionMapping;
              nebulaTexture.wrapS = THREE.RepeatWrapping;
              nebulaTexture.wrapT = THREE.ClampToEdgeWrapping;
              nebulaTexture.needsUpdate = true;

              const domeRadius = CAMERA_FAR * 0.48;
              const nebulaGeo = new THREE.SphereGeometry(domeRadius, 96, 64);
              const nebulaMat = new THREE.MeshBasicMaterial({
                map: nebulaTexture,
                color: 0xffffff,
                side: THREE.BackSide,
                transparent: true,
                opacity: 1,
                depthWrite: false,
              });
              nebulaMat.toneMapped = false;
              nebulaMat.userData = nebulaMat.userData || {};
              nebulaMat.userData.nebulaBaseOpacity = 1;

              const nebulaRoot = new THREE.Mesh(nebulaGeo, nebulaMat);
              nebulaRoot.name = "ProjectShowcaseNebulaRealm";
              nebulaRoot.layers.set(PROJECT_SHOWCASE_LAYER);
              nebulaRoot.frustumCulled = false;
              nebulaRoot.renderOrder = -1000;
              nebulaRoot.rotation.y = Math.PI * 0.1;

              scene.add(nebulaRoot);
              projectShowcaseNebulaRootRef.current = nebulaRoot;
              applyProjectShowcaseNebulaFade(0);
              vlog(
                `🌌 Project showcase JPG sky loaded radius=${domeRadius.toFixed(
                  0,
                )} path=${PROJECT_SHOWCASE_NEBULA_JPG_PATH}`,
              );
            },
            undefined,
            () => {
              vlog(
                "⚠️ Project showcase JPG sky failed — using default cosmos outside trench",
              );
            },
          );
        }
        const runLength =
          runAxis === "z" ? trenchSizeScaled.z : trenchSizeScaled.x;
        const trenchWidth =
          runAxis === "z" ? trenchSizeScaled.x : trenchSizeScaled.z;
        const floorPulseRecords: Array<{ mat: THREE.MeshBasicMaterial; runT: number }> = [];
        const floorPulseGroup = new THREE.Group();
        const floorPulseSegments = 24;
        const floorPulseStep = runLength / floorPulseSegments;
        const floorPulseLength = floorPulseStep * 0.82;
        const floorPulseWidth = THREE.MathUtils.clamp(trenchWidth * 0.038, 0.95, 1.75);
        // Lift above floor so pulses are visible and not buried by geometry.
        const floorPulseYOffset = -trenchSizeScaled.y * 0.438;
        const floorPulseLateral = trenchWidth * 0.286;
        for (let lane = -1; lane <= 1; lane += 2) {
          for (let i = 0; i < floorPulseSegments; i += 1) {
            const seg = new THREE.Mesh(
              new THREE.PlaneGeometry(floorPulseLength, floorPulseWidth),
              new THREE.MeshBasicMaterial({
                color: 0x22cfff,
                transparent: true,
                opacity: 0.18,
                side: THREE.DoubleSide,
                depthWrite: false,
                toneMapped: false,
                blending: THREE.AdditiveBlending,
              }),
            );
            seg.rotation.x = -Math.PI * 0.5;
            seg.renderOrder = 42;
            const runPos = -runLength * 0.5 + floorPulseStep * (i + 0.5);
            if (runAxis === "z") {
              seg.position.set(lane * floorPulseLateral, floorPulseYOffset, runPos);
            } else {
              seg.position.set(runPos, floorPulseYOffset, lane * floorPulseLateral);
            }
            floorPulseGroup.add(seg);
            floorPulseRecords.push({
              mat: seg.material as THREE.MeshBasicMaterial,
              runT: (i + 0.5) / floorPulseSegments,
            });
          }
        }
        floorPulseGroup.layers.set(PROJECT_SHOWCASE_LAYER);
        showcaseRoot.add(floorPulseGroup);
        projectShowcaseFloorPulseMatsRef.current = floorPulseRecords;
        // Nudge the entire showcase module up slightly for better composition.
        const panelY =
          THREE.MathUtils.clamp(trenchSizeScaled.y * 0.015, 2.2, 5.4) + 0.35;
        const panelWidth = THREE.MathUtils.clamp(trenchWidth * 0.2304, 9.072, 13.536);
          const panelHeight = panelWidth * (9 / 16) * 1.25;
        const panelSpacing = THREE.MathUtils.clamp(
          runLength / Math.max(6, publishedShowcase.length + 2),
          18,
          36,
        );
        const runStart = -((publishedShowcase.length - 1) * panelSpacing) / 2;
        const panelRecords: ShowcasePanelRecord[] = [];

        publishedShowcase.forEach((entry, index) => {
          const side = index % 2 === 0 ? -1 : 1;
          const panelGroup = new THREE.Group();
          const runPos = runStart + index * panelSpacing;
          const clientVariants =
            (entry.clientVariants ?? []).filter((variant) => !!variant?.title) ?? [];
          const mediaItems =
            clientVariants.length > 0
              ? clientVariants.flatMap((variant, variantIndex) =>
                  resolveShowcaseMediaItems(entry, { variant, variantIndex }),
                )
              : resolveShowcaseMediaItems(entry);
          const panelHasAnyThumbStrip =
            clientVariants.length > 0
              ? clientVariants.some((_, variantIndex) =>
                  mediaItems.filter((item) => item.variantIndex === variantIndex).length > 1,
                )
              : mediaItems.length > 1;
          const initialVariantMediaCount =
            clientVariants.length > 0
              ? mediaItems.filter((item) => item.variantIndex === 0).length
              : mediaItems.length;
          const hasGalleryMedia = initialVariantMediaCount > 1;
          const panelVerticalOffset = hasGalleryMedia ? -0.2 : 0;
          if (runAxis === "z") {
            panelGroup.position.set(
              0,
              panelY + panelVerticalOffset,
              runPos,
            );
          } else {
            panelGroup.position.set(
              runPos,
              panelY + panelVerticalOffset,
              0,
            );
          }
          // Keep inward-facing baseline; user controls extra readable cant via slider.
          let inwardRotationY = 0;
          let frontFacingRotationY = 0;
          let cantSign: -1 | 1 = 1;
          if (runAxis === "z") {
            inwardRotationY = side < 0 ? Math.PI / 2 : -Math.PI / 2;
            // Plane front normal points toward -Z (toward incoming camera travel).
            frontFacingRotationY = Math.PI;
            cantSign = side < 0 ? 1 : -1;
          } else {
            inwardRotationY = side < 0 ? 0 : Math.PI;
            // Plane front normal points toward -X when traveling +X.
            frontFacingRotationY = Math.PI / 2;
            cantSign = side < 0 ? -1 : 1;
          }
          panelGroup.rotation.y = inwardRotationY;

          const frame = new THREE.Mesh(
            new THREE.PlaneGeometry(panelWidth * 1.015, panelHeight * 1.015),
            new THREE.MeshBasicMaterial({
              color: 0x72c6ff,
              transparent: true,
              opacity: 0.22,
              side: THREE.DoubleSide,
            }),
          );
          const frameMat = frame.material as THREE.MeshBasicMaterial;
          frame.position.z = -0.15;

          const imageMat = new THREE.MeshBasicMaterial({
            color: 0xb8b8b8,
            transparent: true,
            opacity: 1,
            side: THREE.FrontSide,
            toneMapped: false,
          });
          const imagePlane = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            imageMat,
          );
          const fitMode = mediaItems[0]?.fit ?? entry.fit ?? "contain";
          const panelRecord: ShowcasePanelRecord = {
            group: panelGroup,
            runPos,
            entry,
            fitMode,
            inwardRotationY,
            frontFacingRotationY,
            cantSign,
            focusBlend: 0,
            frameMat,
            imageMesh: imagePlane,
            imageMat,
            texture: null,
            baseRepeat: new THREE.Vector2(1, 1),
            baseOffset: new THREE.Vector2(0, 0),
            zoom: 1,
            panX: 0,
            panY: 0,
            clientVariants,
            activeVariantIndex: 0,
            setActiveVariant: () => {},
            mediaItems,
            activeMediaIndex: 0,
            setActiveMedia: () => {},
            mediaFadeStartMs: -Infinity,
            mediaFadeDurationMs: 240,
            setThumbnailPageStart: () => {},
            triggerThumbnailNavPress: () => {},
            thumbnailPageStart: 0,
            thumbnailHitTargets: [],
            thumbnailFrameMats: [],
            thumbnailImageMats: [],
            detailMat: new THREE.MeshBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 1,
              toneMapped: false,
              side: THREE.DoubleSide,
            }),
            detailTexture: null,
            detailMesh: null,
            detailScrollThumbMesh: null,
            detailAllLines: [],
            detailVisibleLines: 0,
            detailScrollOffset: 0,
            detailScrollMax: 0,
            updateDetailTexture: () => {},
            techBadgeRoot: null,
            techBadgeFx: [],
          };
          const applyImageFit = (
            imageAspect?: number,
            texture?: THREE.Texture,
            nextFitMode?: "contain" | "cover",
          ) => {
            const activeFitMode = nextFitMode ?? panelRecord.fitMode;
            if (!imageAspect || !Number.isFinite(imageAspect) || imageAspect <= 0) {
              imagePlane.scale.set(panelWidth, panelHeight, 1);
              if (texture) {
                panelRecord.baseRepeat.set(1, 1);
                panelRecord.baseOffset.set(0, 0);
                texture.repeat.copy(panelRecord.baseRepeat);
                texture.offset.copy(panelRecord.baseOffset);
                texture.needsUpdate = true;
              }
              return;
            }
            const frameAspect = panelWidth / panelHeight;
            let displayWidth = panelWidth;
            let displayHeight = panelHeight;
            if (activeFitMode === "cover") {
              // Cover mode uses UV crop in a fixed viewport, which gives us
              // CSS-like overflow:hidden behavior and a stable base for pan/zoom.
              displayWidth = panelWidth;
              displayHeight = panelHeight;
              if (texture) {
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                if (imageAspect > frameAspect) {
                  const visibleX = frameAspect / imageAspect;
                  panelRecord.baseRepeat.set(visibleX, 1);
                  panelRecord.baseOffset.set((1 - visibleX) * 0.5, 0);
                } else {
                  const visibleY = imageAspect / frameAspect;
                  panelRecord.baseRepeat.set(1, visibleY);
                  // Top-align cover images when vertical crop is applied.
                  panelRecord.baseOffset.set(0, 1 - visibleY);
                }
                texture.repeat.copy(panelRecord.baseRepeat);
                texture.offset.copy(panelRecord.baseOffset);
                texture.needsUpdate = true;
              }
            } else {
              if (texture) {
                panelRecord.baseRepeat.set(1, 1);
                panelRecord.baseOffset.set(0, 0);
                texture.repeat.copy(panelRecord.baseRepeat);
                texture.offset.copy(panelRecord.baseOffset);
                texture.needsUpdate = true;
              }
              if (imageAspect > frameAspect) {
                displayWidth = panelWidth;
                displayHeight = panelWidth / imageAspect;
              } else {
                displayHeight = panelHeight;
                displayWidth = panelHeight * imageAspect;
              }
            }
            imagePlane.scale.set(displayWidth, displayHeight, 1);
          };
          applyImageFit();
          const detailWidth = panelWidth * 0.44;
          const stripWidth = panelWidth + detailWidth;
          const detailTextureOpts = {
            // Match the narrower detail panel aspect to avoid stretched typography.
            width: 800,
            height: 1024,
            bgColor: "rgba(8, 20, 34, 0.58)",
            lineColor: "rgba(120, 180, 255, 0.75)",
            textColor: "rgba(228, 240, 255, 0.96)",
            showLine: true,
            fontSize: 25,
            lineSpacing: 33,
            textAlign: "left" as const,
            padding: 44,
          };
          const updateDetailTexture = () => {
            panelRecord.detailVisibleLines = Math.max(
              1,
              Math.floor(
                (detailTextureOpts.height - detailTextureOpts.padding * 2) /
                  detailTextureOpts.lineSpacing,
              ),
            );
            panelRecord.detailScrollMax = Math.max(
              0,
              panelRecord.detailAllLines.length - panelRecord.detailVisibleLines,
            );
            panelRecord.detailScrollOffset = THREE.MathUtils.clamp(
              panelRecord.detailScrollOffset,
              0,
              panelRecord.detailScrollMax,
            );
            const visibleLines = panelRecord.detailAllLines.slice(
              panelRecord.detailScrollOffset,
              panelRecord.detailScrollOffset + panelRecord.detailVisibleLines,
            );
            panelRecord.detailTexture?.dispose();
            panelRecord.detailTexture = createDetailTexture(
              visibleLines,
              detailTextureOpts,
            );
            panelRecord.detailMat.map = panelRecord.detailTexture;
            panelRecord.detailMat.needsUpdate = true;
            const thumb = panelRecord.detailScrollThumbMesh;
            if (!thumb) return;
            const hasOverflow = panelRecord.detailScrollMax > 0;
            detailScrollTrack.visible = hasOverflow;
            thumb.visible = hasOverflow;
            if (!hasOverflow) return;
            const ratio =
              panelRecord.detailVisibleLines /
              Math.max(panelRecord.detailAllLines.length, panelRecord.detailVisibleLines);
            const trackHeight = 0.78;
            const thumbHeight = THREE.MathUtils.clamp(trackHeight * ratio, 0.16, 0.78);
            thumb.scale.y = thumbHeight;
            const t =
              panelRecord.detailScrollOffset / Math.max(panelRecord.detailScrollMax, 1);
            thumb.position.y = THREE.MathUtils.lerp(
              trackHeight * 0.5 - thumbHeight * 0.5,
              -trackHeight * 0.5 + thumbHeight * 0.5,
              t,
            );
          };
          panelRecord.updateDetailTexture = updateDetailTexture;
          const setPanelDetailForMedia = (media: ShowcaseResolvedMediaItem) => {
            const mediaLabel =
              media.type === "youtube"
                ? "▶ Video (YouTube)"
                : media.type === "video"
                  ? "▶ Video"
                  : "▣ Image";
            const detailDescription =
              media.description ||
              media.variantDescription ||
              entry.description ||
              "";
            const detailTechs =
              panelRecord.clientVariants.length > 0
                ? panelRecord.clientVariants[panelRecord.activeVariantIndex]
                    ?.technologies || entry.technologies || []
                : entry.technologies || [];
            const detailYear =
              media.variantYear ?? entry.year;
            const descriptionLines = wrapTextLines(
              detailDescription,
              34,
            );
            panelRecord.detailAllLines = [
              media.variantTitle || media.title || entry.title,
              mediaLabel,
              "",
              ...descriptionLines,
              ...(detailYear ? ["", `Year: ${detailYear}`] : []),
            ].filter((line) => line !== undefined);
            panelRecord.detailScrollOffset = 0;
            updateDetailTexture();
            updateTechBadges(detailTechs);
          };

          const techBadgeRoot = new THREE.Group();
          const imageSeamX = side < 0 ? -panelWidth * 0.5 : panelWidth * 0.5;
          const imageInward = side < 0 ? 1 : -1;
          techBadgeRoot.position.set(imageSeamX, 0, 0.16);
          techBadgeRoot.visible = false;
          techBadgeRoot.renderOrder = 160;
          panelRecord.techBadgeRoot = techBadgeRoot;
          const techBadgeMeshes: THREE.Mesh[] = [];
          const clearTechBadges = () => {
            panelRecord.techBadgeFx = [];
            techBadgeMeshes.forEach((mesh) => {
              if (mesh.material) {
                const mat = mesh.material as THREE.MeshBasicMaterial;
                if (mat.map) mat.map.dispose();
                mat.dispose();
              }
              mesh.geometry.dispose();
              techBadgeRoot.remove(mesh);
            });
            techBadgeMeshes.length = 0;
          };
          const updateTechBadges = (techs: string[]) => {
            clearTechBadges();
            const list = (techs || []).filter(Boolean).slice(0, 5);
            techBadgeRoot.visible = list.length > 0;
            if (list.length === 0) return;
            const badgeWidth = panelWidth * 0.085;
            const badgeHeight = panelHeight * 0.05;
            const badgeGap = badgeHeight * 0.32;
            const stackHeight =
              list.length * badgeHeight + Math.max(0, list.length - 1) * badgeGap;
            const startY = stackHeight * 0.5 - badgeHeight * 0.5;
            // Overlap 25% into description side; rest remains on image side.
            const badgeX = imageInward * badgeWidth * 0.25;

            list.forEach((tech, idx) => {
              const y = startY - idx * (badgeHeight + badgeGap);
              const badgeTex = createDetailTexture([tech.toUpperCase()], {
                width: 1024,
                height: 224,
                bgColor: "rgba(0, 0, 0, 0.96)",
                lineColor: "rgba(255, 255, 255, 0.92)",
                textColor: "rgba(255, 255, 255, 0.98)",
                showLine: false,
                fontSize: 92,
                fontFamily: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
                fontWeight: 700,
                lineSpacing: 102,
                textAlign: "center" as const,
                padding: 18,
                centerBlock: true,
                crispUI: true,
              });
              const badge = new THREE.Mesh(
                new THREE.PlaneGeometry(badgeWidth, badgeHeight),
                new THREE.MeshBasicMaterial({
                  map: badgeTex,
                  transparent: true,
                  opacity: 0.92,
                  side: THREE.DoubleSide,
                  toneMapped: false,
                  depthWrite: false,
                  depthTest: false,
                }),
              );
              badge.position.set(badgeX, y, 0.02);
              badge.renderOrder = 164;
              const badgeFrame = new THREE.Mesh(
                new THREE.PlaneGeometry(badgeWidth * 1.05, badgeHeight * 1.08),
                new THREE.MeshBasicMaterial({
                  color: 0xffffff,
                  transparent: true,
                  opacity: 0.62,
                  side: THREE.DoubleSide,
                  toneMapped: false,
                  depthWrite: false,
                  depthTest: false,
                }),
              );
              badgeFrame.position.set(badgeX, y, 0.01);
              badgeFrame.renderOrder = 163;
              techBadgeRoot.add(badgeFrame);
              techBadgeRoot.add(badge);
              techBadgeMeshes.push(badgeFrame, badge);
              panelRecord.techBadgeFx.push({
                mat: badge.material as THREE.MeshBasicMaterial,
                baseOpacity: 0.92,
                phase: idx * 0.55,
                baseColor: new THREE.Color(0xffffff),
              });
            });
          };

          const tabsRoot = new THREE.Group();
          const showVariantTabs = panelRecord.clientVariants.length > 1;
          const categoryBarHeight = panelHeight * 0.09;
          const tabRowHeight = panelHeight * 0.098;
          const tabAreaHeight = categoryBarHeight + tabRowHeight;
          const tabAreaCenterX = side < 0 ? -detailWidth * 0.5 : detailWidth * 0.5;
          tabsRoot.position.set(
            tabAreaCenterX,
            panelHeight * 0.5 + tabAreaHeight * 0.5,
            0.03,
          );
          tabsRoot.renderOrder = 120;
          tabsRoot.visible = showVariantTabs;
          const categoryGlass = new THREE.Mesh(
            new THREE.PlaneGeometry(stripWidth, categoryBarHeight),
            new THREE.MeshBasicMaterial({
              color: 0x214f7a,
              transparent: true,
              opacity: 0.88,
              side: THREE.FrontSide,
              depthWrite: false,
              depthTest: true,
              toneMapped: false,
            }),
          );
          categoryGlass.position.y = tabRowHeight * 0.5;
          categoryGlass.renderOrder = 120;
          tabsRoot.add(categoryGlass);
          const categoryFrame = new THREE.Mesh(
            new THREE.PlaneGeometry(stripWidth * 1.01, categoryBarHeight * 1.04),
            new THREE.MeshBasicMaterial({
              color: 0x39d7ff,
              transparent: true,
              opacity: 0.34,
              side: THREE.FrontSide,
              depthWrite: false,
              depthTest: true,
              toneMapped: false,
            }),
          );
          categoryFrame.position.copy(categoryGlass.position);
          categoryFrame.position.z = -0.01;
          categoryFrame.renderOrder = 121;
          tabsRoot.add(categoryFrame);
          const categoryLabelTex = createDetailTexture(
            [
              `${entry.title.toUpperCase()}  •  ${panelRecord.clientVariants.length} PROJECTS`,
            ],
            {
              // Match very wide title-bar aspect to avoid narrow/tall glyph distortion.
              width: 4096,
              height: 128,
              bgColor: "rgba(0,0,0,0)",
              lineColor: "rgba(0,0,0,0)",
              textColor: "rgba(172, 229, 255, 0.96)",
              showLine: false,
              fontSize: 32,
              fontFamily: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
              fontWeight: 600,
              lineSpacing: 40,
              textAlign: "left" as const,
              padding: 36,
              centerBlock: true,
              crispUI: true,
            },
          );
          const categoryLabel = new THREE.Mesh(
            new THREE.PlaneGeometry(stripWidth * 0.965, categoryBarHeight * 0.66),
            new THREE.MeshBasicMaterial({
              map: categoryLabelTex,
              transparent: true,
              opacity: 0.98,
              side: THREE.FrontSide,
              depthWrite: false,
              depthTest: true,
              toneMapped: false,
            }),
          );
          categoryLabel.position.copy(categoryGlass.position);
          categoryLabel.position.z = 0.02;
          categoryLabel.renderOrder = 122;
          tabsRoot.add(categoryLabel);

          const tabsGlass = new THREE.Mesh(
            new THREE.PlaneGeometry(stripWidth, tabRowHeight),
            new THREE.MeshBasicMaterial({
              color: 0x1f3f64,
              transparent: true,
              opacity: 0.86,
              side: THREE.FrontSide,
              depthWrite: false,
              depthTest: true,
              toneMapped: false,
            }),
          );
          tabsGlass.position.y = -categoryBarHeight * 0.5;
          tabsGlass.renderOrder = 123;
          tabsRoot.add(tabsGlass);

          const tabPaddingX = stripWidth * 0.03;
          const tabGap = stripWidth * 0.007;
          const tabWidths = panelRecord.clientVariants.map((variant) =>
            THREE.MathUtils.clamp(
              panelWidth * 0.085 + variant.title.length * panelWidth * 0.0065,
              panelWidth * 0.11,
              panelWidth * 0.24,
            ),
          );
          const tabStartX = -stripWidth * 0.5 + tabPaddingX;
          const tabFrameMats: THREE.MeshBasicMaterial[] = [];
          const tabFillMats: THREE.MeshBasicMaterial[] = [];
          const tabLabelMats: THREE.MeshBasicMaterial[] = [];
          const updateVariantTabVisualState = () => {
            tabFrameMats.forEach((mat, tabIndex) => {
              const active = tabIndex === panelRecord.activeVariantIndex;
              mat.opacity = active ? 0.98 : 0.72;
              mat.color.set(active ? 0xeaf7ff : 0x8fd3ff);
            });
            tabFillMats.forEach((mat, tabIndex) => {
              const active = tabIndex === panelRecord.activeVariantIndex;
              mat.opacity = active ? 0.94 : 0.86;
              mat.color.set(active ? 0x3f668f : 0x2c4d70);
            });
            tabLabelMats.forEach((mat, tabIndex) => {
              const active = tabIndex === panelRecord.activeVariantIndex;
              mat.opacity = active ? 1 : 0.94;
            });
          };

          panelRecord.clientVariants.forEach((variant, variantIndex) => {
            const tabGroup = new THREE.Group();
            const widthBefore = tabWidths
              .slice(0, variantIndex)
              .reduce((sum, w) => sum + w, 0);
            const x =
              tabStartX + widthBefore + variantIndex * tabGap + tabWidths[variantIndex] * 0.5;
            tabGroup.position.set(x, -categoryBarHeight * 0.5, 0.04);
            const tabFill = new THREE.Mesh(
              new THREE.PlaneGeometry(tabWidths[variantIndex] * 0.982, tabRowHeight * 0.72),
              new THREE.MeshBasicMaterial({
                color: 0x2c4d70,
                transparent: true,
                opacity: 0.86,
                side: THREE.FrontSide,
                depthWrite: false,
                depthTest: true,
                toneMapped: false,
              }),
            );
            tabFill.position.z = 0.004;
            tabFill.renderOrder = 130 + variantIndex * 3;
            const tabFrame = new THREE.Mesh(
              new THREE.PlaneGeometry(tabWidths[variantIndex] * 0.992, tabRowHeight * 0.76),
              new THREE.MeshBasicMaterial({
                color: 0x8fd3ff,
                transparent: true,
                opacity: 0.72,
                side: THREE.FrontSide,
                depthWrite: false,
                depthTest: true,
                toneMapped: false,
              }),
            );
            tabFrame.position.z = 0.01;
            tabFrame.renderOrder = 131 + variantIndex * 3;
            tabFillMats.push(tabFill.material as THREE.MeshBasicMaterial);
            tabFrameMats.push(tabFrame.material as THREE.MeshBasicMaterial);
            const tabLabelTex = createDetailTexture([variant.title], {
              // Keep texture ratio close to tab geometry ratio to prevent stretch.
              width: 1536,
              height: 320,
              bgColor: "rgba(0,0,0,0)",
              lineColor: "rgba(0,0,0,0)",
              textColor: "rgba(235, 244, 255, 0.96)",
              showLine: false,
              fontSize: 108,
              fontFamily: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
              fontWeight: 500,
              lineSpacing: 120,
              textAlign: "center" as const,
              padding: 24,
              centerBlock: true,
              crispUI: true,
            });
            const tabLabel = new THREE.Mesh(
              new THREE.PlaneGeometry(tabWidths[variantIndex] * 0.93, tabRowHeight * 0.44),
              new THREE.MeshBasicMaterial({
                map: tabLabelTex,
                transparent: true,
                opacity: 0.98,
                side: THREE.FrontSide,
                depthWrite: false,
                depthTest: true,
                toneMapped: false,
              }),
            );
            tabLabelMats.push(tabLabel.material as THREE.MeshBasicMaterial);
            tabLabel.position.z = 0.012;
            tabLabel.renderOrder = 132 + variantIndex * 3;
            tabGroup.add(tabFill);
            tabGroup.add(tabFrame);
            tabGroup.add(tabLabel);
            tabsRoot.add(tabGroup);
            panelRecord.thumbnailHitTargets.push({
              mesh: tabLabel,
              type: "variant",
              variantIndex,
            });
          });
          updateVariantTabVisualState();

          const thumbnailRoot = new THREE.Group();
          const stripHeight = panelHeight * 0.28;
          const stripCenterX = side < 0 ? -detailWidth * 0.5 : detailWidth * 0.5;
          thumbnailRoot.position.set(
            stripCenterX,
            -(panelHeight * 0.5 + stripHeight * 0.5),
            0.02,
          );
          const stripGlass = new THREE.Mesh(
            new THREE.PlaneGeometry(stripWidth, stripHeight),
            new THREE.MeshBasicMaterial({
              color: 0x0e223b,
              transparent: true,
              opacity: 0.72,
              side: THREE.DoubleSide,
            }),
          );
          thumbnailRoot.add(stripGlass);
          thumbnailRoot.visible = hasGalleryMedia;
          const stripFrame = new THREE.Mesh(
            new THREE.PlaneGeometry(stripWidth * 1.015, stripHeight * 1.07),
            new THREE.MeshBasicMaterial({
              color: 0x39d7ff,
              transparent: true,
              opacity: 0.32,
              side: THREE.DoubleSide,
            }),
          );
          stripFrame.position.z = -0.02;
          thumbnailRoot.add(stripFrame);

          const arrowTextureOpts = {
            width: 256,
            height: 256,
            bgColor: "rgba(10, 16, 28, 0.86)",
            lineColor: "rgba(145, 205, 255, 0.55)",
            textColor: "rgba(229, 241, 255, 0.96)",
            showLine: false,
            fontSize: 138,
            lineSpacing: 140,
            textAlign: "center" as const,
            padding: 32,
          };
          const prevArrowTex = createDetailTexture(["‹"], arrowTextureOpts);
          const nextArrowTex = createDetailTexture(["›"], arrowTextureOpts);
          const createArrowButton = (
            tex: THREE.Texture,
            x: number,
            action: "prev" | "next",
          ) => {
            const mesh = new THREE.Mesh(
              new THREE.PlaneGeometry(stripHeight * 0.4, stripHeight * 0.56),
              new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                opacity: 0.94,
                side: THREE.DoubleSide,
              }),
            );
            mesh.position.set(x, 0, 0.05);
            thumbnailRoot.add(mesh);
            panelRecord.thumbnailHitTargets.push({ mesh, type: action });
            return mesh;
          };
          const prevArrowMesh = createArrowButton(
            prevArrowTex,
            -stripWidth * 0.46,
            "prev",
          );
          const nextArrowMesh = createArrowButton(
            nextArrowTex,
            stripWidth * 0.46,
            "next",
          );

          const thumbSlotsWidthNarrow = stripWidth * 0.56;
          const thumbWidth = thumbSlotsWidthNarrow / PROJECT_SHOWCASE_THUMBS_PER_PAGE - 0.08;
          const thumbHeight = stripHeight * 0.66;
          const thumbGap = 0.08;
          const thumbStep = thumbWidth + thumbGap;
          const thumbSlideDuration = 0.34;
          const thumbBaseY = 0;
          const thumbBaseZ = 0.06;
          const thumbOffsetStart =
            -((PROJECT_SHOWCASE_THUMBS_PER_PAGE - 1) * thumbStep) / 2;
          const thumbGroups: THREE.Group[] = [];
          const thumbIndexByGroup = new Map<THREE.Group, number>();
          const thumbFrameByMediaIndex = new Map<number, THREE.MeshBasicMaterial>();
          const thumbImageByMediaIndex = new Map<number, THREE.MeshBasicMaterial>();
          const activeArrowColor = new THREE.Color(0xdff4ff);
          const disabledArrowColor = new THREE.Color(0x8caec9);
          const getVariantMediaIndices = () => {
            if (panelRecord.clientVariants.length === 0) {
              return panelRecord.mediaItems.map((_, idx) => idx);
            }
            return panelRecord.mediaItems
              .map((item, idx) =>
                item.variantIndex === panelRecord.activeVariantIndex ? idx : -1,
              )
              .filter((idx) => idx >= 0);
          };

          mediaItems.forEach((mediaItem, mediaIndex) => {
            const thumbGroup = new THREE.Group();
            const thumbFrame = new THREE.Mesh(
              new THREE.PlaneGeometry(thumbWidth + 0.05, thumbHeight + 0.05),
              new THREE.MeshBasicMaterial({
                color: 0x88cfff,
                transparent: true,
                opacity: 0.26,
                side: THREE.DoubleSide,
              }),
            );
            const thumbImageMat = new THREE.MeshBasicMaterial({
              color: 0x95acc8,
              transparent: true,
              opacity: 0.88,
              side: THREE.DoubleSide,
            });
            const thumbImage = new THREE.Mesh(
              new THREE.PlaneGeometry(thumbWidth, thumbHeight),
              thumbImageMat,
            );
            thumbImage.position.z = 0.01;
            const applyThumbCoverTopLeftFit = (
              imageAspect?: number,
              texture?: THREE.Texture,
            ) => {
              if (!imageAspect || !Number.isFinite(imageAspect) || imageAspect <= 0) {
                if (texture) {
                  texture.repeat.set(1, 1);
                  texture.offset.set(0, 0);
                  texture.needsUpdate = true;
                }
                return;
              }
              const frameAspect = thumbWidth / thumbHeight;
              if (!texture) return;
              texture.wrapS = THREE.ClampToEdgeWrapping;
              texture.wrapT = THREE.ClampToEdgeWrapping;
              if (imageAspect > frameAspect) {
                const visibleX = frameAspect / imageAspect;
                texture.repeat.set(visibleX, 1);
                texture.offset.set(0, 0);
              } else {
                const visibleY = imageAspect / frameAspect;
                texture.repeat.set(1, visibleY);
                texture.offset.set(0, 1 - visibleY);
              }
              texture.needsUpdate = true;
            };
            textureLoader.load(
              mediaItem.textureUrl,
              (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.anisotropy = Math.min(
                  8,
                  rendererRef.current?.capabilities.getMaxAnisotropy?.() ?? 1,
                );
                thumbImageMat.map = texture;
                thumbImageMat.color.set(0xffffff);
                const img = texture.image as
                  | { width?: number; height?: number }
                  | undefined;
                const imgAspect =
                  img?.width && img?.height ? img.width / img.height : undefined;
                applyThumbCoverTopLeftFit(imgAspect, texture);
                thumbImageMat.needsUpdate = true;
              },
              undefined,
              () => {
                thumbImageMat.color.set(0x5c6a86);
                thumbImageMat.needsUpdate = true;
              },
            );
            thumbGroup.add(thumbFrame, thumbImage);
            thumbnailRoot.add(thumbGroup);
            thumbGroups.push(thumbGroup);
            thumbIndexByGroup.set(thumbGroup, mediaIndex);
            panelRecord.thumbnailFrameMats.push(
              thumbFrame.material as THREE.MeshBasicMaterial,
            );
            panelRecord.thumbnailImageMats[mediaIndex] = thumbImageMat;
            thumbFrameByMediaIndex.set(mediaIndex, thumbFrame.material as THREE.MeshBasicMaterial);
            thumbImageByMediaIndex.set(mediaIndex, thumbImageMat);
            panelRecord.thumbnailHitTargets.push({
              mesh: thumbImage,
              type: "media",
              mediaIndex,
            });
          });

          const updateThumbnailLayout = ({
            animate = false,
            previousPageStart,
          }: {
            animate?: boolean;
            previousPageStart?: number;
          } = {}) => {
            const variantMediaIndices = getVariantMediaIndices();
            const maxPageStart = Math.max(
              0,
              variantMediaIndices.length - PROJECT_SHOWCASE_THUMBS_PER_PAGE,
            );
            const beforePageStart =
              typeof previousPageStart === "number"
                ? THREE.MathUtils.clamp(previousPageStart, 0, maxPageStart)
                : panelRecord.thumbnailPageStart;
            panelRecord.thumbnailPageStart = THREE.MathUtils.clamp(
              panelRecord.thumbnailPageStart,
              0,
              maxPageStart,
            );
            const pageEnd =
              panelRecord.thumbnailPageStart + PROJECT_SHOWCASE_THUMBS_PER_PAGE;
            thumbGroups.forEach((group) => {
              const mediaIndex = thumbIndexByGroup.get(group) ?? -1;
              const filteredPosition = variantMediaIndices.indexOf(mediaIndex);
              const wasVisible =
                filteredPosition >= beforePageStart &&
                filteredPosition < beforePageStart + PROJECT_SHOWCASE_THUMBS_PER_PAGE;
              const willBeVisible =
                filteredPosition >= panelRecord.thumbnailPageStart && filteredPosition < pageEnd;
              const shouldAnimate = animate && beforePageStart !== panelRecord.thumbnailPageStart;
              const currentSlot = filteredPosition - beforePageStart;
              const nextSlot = filteredPosition - panelRecord.thumbnailPageStart;
              const fromX = thumbOffsetStart + currentSlot * thumbStep;
              const toX = thumbOffsetStart + nextSlot * thumbStep;
              const frameMat = thumbFrameByMediaIndex.get(mediaIndex);
              const imageMat = thumbImageByMediaIndex.get(mediaIndex);
              if (filteredPosition < 0 || (!wasVisible && !willBeVisible)) {
                group.visible = false;
                return;
              }
              group.visible = true;
              if (!shouldAnimate) {
                group.position.set(toX, thumbBaseY, thumbBaseZ);
                group.scale.set(1, 1, 1);
                return;
              }
              gsap.killTweensOf(group.position);
              gsap.killTweensOf(group.scale);
              if (frameMat) gsap.killTweensOf(frameMat);
              if (imageMat) gsap.killTweensOf(imageMat);
              group.position.set(fromX, thumbBaseY, thumbBaseZ);
              gsap.to(group.position, {
                x: toX,
                duration: thumbSlideDuration,
                ease: "power3.out",
              });
              if (!wasVisible && willBeVisible) {
                group.scale.set(0.92, 0.92, 1);
                gsap.to(group.scale, {
                  x: 1,
                  y: 1,
                  duration: thumbSlideDuration,
                  ease: "power2.out",
                });
              } else if (wasVisible && !willBeVisible) {
                gsap.to(group.scale, {
                  x: 0.92,
                  y: 0.92,
                  duration: thumbSlideDuration,
                  ease: "power2.out",
                  onComplete: () => {
                    if (!willBeVisible) group.visible = false;
                    group.scale.set(1, 1, 1);
                  },
                });
              }
            });
            const showNav =
              variantMediaIndices.length > PROJECT_SHOWCASE_THUMBS_PER_PAGE;
            prevArrowMesh.visible = showNav;
            nextArrowMesh.visible = showNav;
            const prevEnabled = panelRecord.thumbnailPageStart > 0;
            const nextEnabled =
              panelRecord.thumbnailPageStart + PROJECT_SHOWCASE_THUMBS_PER_PAGE <
              variantMediaIndices.length;
            const prevMat = prevArrowMesh.material as THREE.MeshBasicMaterial;
            const nextMat = nextArrowMesh.material as THREE.MeshBasicMaterial;
            prevMat.opacity = prevEnabled ? 0.96 : 0.36;
            nextMat.opacity = nextEnabled ? 0.96 : 0.36;
            prevMat.color.copy(prevEnabled ? activeArrowColor : disabledArrowColor);
            nextMat.color.copy(nextEnabled ? activeArrowColor : disabledArrowColor);
          };

          const updateThumbnailVisualState = () => {
            panelRecord.thumbnailFrameMats.forEach((mat, mediaIndex) => {
              const active = mediaIndex === panelRecord.activeMediaIndex;
              mat.opacity = active ? 0.9 : 0.26;
              mat.color.set(active ? 0xeaf7ff : 0x88cfff);
              const imageMat = panelRecord.thumbnailImageMats[mediaIndex];
              if (imageMat) {
                imageMat.opacity = active ? 1 : 0.88;
              }
            });
          };

          let mediaLoadNonce = 0;
          const videoCache = new Map<
            number,
            { video: HTMLVideoElement; texture: THREE.VideoTexture }
          >();
          const setActiveMedia = (mediaIndex: number) => {
            const variantMediaIndices = getVariantMediaIndices();
            if (variantMediaIndices.length === 0) return;
            const safeMediaIndex = THREE.MathUtils.clamp(
              variantMediaIndices.includes(mediaIndex)
                ? mediaIndex
                : variantMediaIndices[0],
              variantMediaIndices[0],
              variantMediaIndices[variantMediaIndices.length - 1],
            );
            const media = panelRecord.mediaItems[safeMediaIndex];
            if (!media) return;
            const mediaChanged = safeMediaIndex !== panelRecord.activeMediaIndex;
            panelRecord.activeMediaIndex = safeMediaIndex;
            panelRecord.fitMode = media.fit;
            panelRecord.zoom = 1;
            panelRecord.panX = 0;
            panelRecord.panY = 0;
            if (
              variantMediaIndices.indexOf(panelRecord.activeMediaIndex) <
                panelRecord.thumbnailPageStart ||
              variantMediaIndices.indexOf(panelRecord.activeMediaIndex) >=
                panelRecord.thumbnailPageStart + PROJECT_SHOWCASE_THUMBS_PER_PAGE
            ) {
              panelRecord.thumbnailPageStart =
                Math.floor(
                  variantMediaIndices.indexOf(panelRecord.activeMediaIndex) /
                    PROJECT_SHOWCASE_THUMBS_PER_PAGE,
                ) * PROJECT_SHOWCASE_THUMBS_PER_PAGE;
            }
            updateThumbnailLayout();
            updateThumbnailVisualState();
            setPanelDetailForMedia(media);
            const loadNonce = ++mediaLoadNonce;
            const startMainMediaFade = () => {
              if (!mediaChanged) return;
              panelRecord.mediaFadeStartMs = performance.now();
              imageMat.opacity = 0;
              imageMat.needsUpdate = true;
            };
            videoCache.forEach(({ video }, idx) => {
              if (idx !== safeMediaIndex) {
                video.pause();
              }
            });
            if (media.type === "video" && media.videoUrl) {
              let record = videoCache.get(safeMediaIndex);
              if (!record) {
                const video = document.createElement("video");
                video.src = media.videoUrl;
                video.crossOrigin = "anonymous";
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                video.preload = "auto";
                const texture = new THREE.VideoTexture(video);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                record = { video, texture };
                videoCache.set(safeMediaIndex, record);
              }
              imageMat.map = record.texture;
              imageMat.color.set(0xffffff);
              panelRecord.texture = record.texture;
              const startPlayback = () => {
                if (loadNonce !== mediaLoadNonce) return;
                startMainMediaFade();
                record?.video.play().catch(() => {});
                const vw = record?.video.videoWidth || 16;
                const vh = record?.video.videoHeight || 9;
                applyImageFit(vw / Math.max(1, vh), record?.texture, media.fit);
                imageMat.needsUpdate = true;
              };
              if (record.video.readyState >= 1) {
                startPlayback();
              } else {
                record.video.onloadedmetadata = startPlayback;
                record.video.load();
              }
              return;
            }
            textureLoader.load(
              media.textureUrl,
              (texture) => {
                if (loadNonce !== mediaLoadNonce) return;
                startMainMediaFade();
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.anisotropy = Math.min(
                  8,
                  rendererRef.current?.capabilities.getMaxAnisotropy?.() ?? 1,
                );
                imageMat.map = texture;
                imageMat.color.set(0xffffff);
                panelRecord.texture = texture;
                const img = texture.image as
                  | { width?: number; height?: number }
                  | undefined;
                const imgAspect =
                  img?.width && img?.height ? img.width / img.height : undefined;
                applyImageFit(imgAspect, texture, media.fit);
                imageMat.needsUpdate = true;
              },
              undefined,
              () => {
                if (loadNonce !== mediaLoadNonce) return;
                startMainMediaFade();
                panelRecord.texture = null;
                imageMat.map = null;
                imageMat.color.set(0x5c6a86);
                panelRecord.baseRepeat.set(1, 1);
                panelRecord.baseOffset.set(0, 0);
                imageMat.needsUpdate = true;
              },
            );
          };
          panelRecord.setActiveMedia = setActiveMedia;
          panelRecord.setActiveVariant = (variantIndex: number) => {
            if (panelRecord.clientVariants.length === 0) return;
            const safeVariantIndex = THREE.MathUtils.clamp(
              variantIndex,
              0,
              panelRecord.clientVariants.length - 1,
            );
            panelRecord.activeVariantIndex = safeVariantIndex;
            updateVariantTabVisualState();
            const variantMediaIndices = getVariantMediaIndices();
            thumbnailRoot.visible = variantMediaIndices.length > 1;
            panelRecord.thumbnailPageStart = 0;
            if (variantMediaIndices.length > 0) {
              panelRecord.setActiveMedia(variantMediaIndices[0]);
            } else {
              updateThumbnailLayout();
              updateThumbnailVisualState();
              bumpProjectShowcaseViewportTick();
            }
          };
          panelRecord.setThumbnailPageStart = (pageStart: number) => {
            const variantMediaIndices = getVariantMediaIndices();
            const maxPageStart = Math.max(
              0,
              variantMediaIndices.length - PROJECT_SHOWCASE_THUMBS_PER_PAGE,
            );
            const previousPageStart = panelRecord.thumbnailPageStart;
            panelRecord.thumbnailPageStart = THREE.MathUtils.clamp(
              pageStart,
              0,
              maxPageStart,
            );
            updateThumbnailLayout({ animate: true, previousPageStart });
            updateThumbnailVisualState();
            bumpProjectShowcaseViewportTick();
          };
          panelRecord.triggerThumbnailNavPress = (direction: "prev" | "next") => {
            const variantMediaIndices = getVariantMediaIndices();
            const maxPageStart = Math.max(
              0,
              variantMediaIndices.length - PROJECT_SHOWCASE_THUMBS_PER_PAGE,
            );
            const canPrev = panelRecord.thumbnailPageStart > 0;
            const canNext = panelRecord.thumbnailPageStart < maxPageStart;
            const isPrev = direction === "prev";
            const mesh = isPrev ? prevArrowMesh : nextArrowMesh;
            const mat = mesh.material as THREE.MeshBasicMaterial;
            const canMove = isPrev ? canPrev : canNext;
            gsap.killTweensOf(mesh.scale);
            gsap.killTweensOf(mat);
            gsap.fromTo(
              mesh.scale,
              { x: 1, y: 1, z: 1 },
              {
                x: canMove ? 0.9 : 0.96,
                y: canMove ? 0.9 : 0.96,
                z: 1,
                duration: 0.11,
                ease: "power2.out",
                yoyo: true,
                repeat: 1,
              },
            );
            gsap.fromTo(
              mat,
              { opacity: canMove ? 1 : 0.42 },
              {
                opacity: canMove ? 0.86 : 0.30,
                duration: 0.11,
                ease: "power2.out",
                yoyo: true,
                repeat: 1,
              },
            );
          };
          updateThumbnailLayout();
          updateThumbnailVisualState();

          panelGroup.add(frame);
          panelGroup.add(imagePlane);
          panelGroup.add(techBadgeRoot);
          const detailMat = panelRecord.detailMat;
          const detailHeight = panelHeight;
          const detailPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(detailWidth, detailHeight),
            detailMat,
          );
          panelRecord.detailMesh = detailPlane;
          detailPlane.position.set(
            side < 0
              ? -(panelWidth * 0.5 + detailWidth * 0.5)
              : panelWidth * 0.5 + detailWidth * 0.5,
            0,
            -0.02,
          );
          const detailScrollTrack = new THREE.Mesh(
            new THREE.PlaneGeometry(0.032, 0.78),
            new THREE.MeshBasicMaterial({
              color: 0x2f5c82,
              transparent: true,
              opacity: 0.5,
              side: THREE.DoubleSide,
            }),
          );
          detailScrollTrack.position.set(
            detailPlane.position.x + (side < 0 ? -1 : 1) * (detailWidth * 0.46),
            0,
            detailPlane.position.z + 0.012,
          );
          const detailScrollThumb = new THREE.Mesh(
            new THREE.PlaneGeometry(0.034, 0.28),
            new THREE.MeshBasicMaterial({
              color: 0xb8e3ff,
              transparent: true,
              opacity: 0.9,
              side: THREE.DoubleSide,
            }),
          );
          detailScrollThumb.position.set(
            detailScrollTrack.position.x,
            detailScrollTrack.position.y,
            detailScrollTrack.position.z + 0.01,
          );
          panelRecord.detailScrollThumbMesh = detailScrollThumb;
          const detailFrame = new THREE.Mesh(
            new THREE.PlaneGeometry(detailWidth * 1.015, detailHeight * 1.015),
            new THREE.MeshBasicMaterial({
              color: 0x8cd3ff,
              transparent: true,
              opacity: 0.2,
              side: THREE.DoubleSide,
            }),
          );
          detailFrame.position.copy(detailPlane.position);
          detailFrame.position.z -= 0.04;
          const extraTopHeight = showVariantTabs ? tabAreaHeight : 0;
          const stripContribution = panelHasAnyThumbStrip ? stripHeight : 0;
          const moduleFrame = new THREE.Mesh(
            new THREE.PlaneGeometry(
              stripWidth * 1.015,
              (detailHeight + stripContribution + extraTopHeight) * 1.01,
            ),
            new THREE.MeshBasicMaterial({
              color: 0x39d7ff,
              transparent: true,
              opacity: 0.24,
              side: THREE.DoubleSide,
            }),
          );
          moduleFrame.position.set(
            stripCenterX,
            (extraTopHeight - stripContribution) * 0.5,
            -0.06,
          );
          panelGroup.add(detailPlane);
          panelGroup.add(detailFrame);
          panelGroup.add(detailScrollTrack);
          panelGroup.add(detailScrollThumb);
          panelGroup.add(tabsRoot);
          panelGroup.add(thumbnailRoot);
          panelGroup.add(moduleFrame);
          if (panelRecord.clientVariants.length > 0) {
            panelRecord.setActiveVariant(0);
          } else {
            panelRecord.setActiveMedia(0);
          }
          // Render cards in the overlay layer so they bypass HDR bloom/tonemapping.
          panelGroup.traverse((child) => {
            child.layers.set(PROJECT_SHOWCASE_CARD_LAYER);
          });
          showcaseRoot.add(panelGroup);
          panelRecords.push(panelRecord);
        });

        projectShowcasePanelsRef.current = panelRecords;
        const edgeRunPadding = Math.max(14, panelSpacing * 0.9);
        const minRun = runStart - edgeRunPadding;
        const maxRun =
          runStart + (publishedShowcase.length - 1) * panelSpacing + edgeRunPadding;
        projectShowcaseTrackRef.current = {
          axis: runAxis,
          minRun,
          maxRun,
          centerCross: 0,
          cameraHeight: panelY,
          lookAhead: THREE.MathUtils.clamp(panelSpacing * 1.9, 22, 48),
          speed: THREE.MathUtils.clamp(panelSpacing * 0.1625, 2.5, 5.5),
          cullHalfWindow: THREE.MathUtils.clamp(panelSpacing * 4.4, 70, 130),
        };
        const initialRun = minRun + 10;
        projectShowcaseRunPosRef.current = initialRun;
        setProjectShowcaseRunPosition(initialRun);
        setProjectShowcaseFocus(0);

        scene.add(showcaseRoot);
        projectShowcaseRootRef.current = showcaseRoot;
        projectShowcaseWorldAnchorRef.current = showcaseRoot.position.clone();
        setProjectShowcaseReady(true);
        vlog("🛰️ Project Showcase trench loaded");
    };
    const preloadedProjectShowcase = projectShowcasePreloadedGltfRef.current;
    if (preloadedProjectShowcase) {
      onProjectShowcaseLoaded(preloadedProjectShowcase);
      projectShowcasePreloadedGltfRef.current = null;
    } else {
      loader.load(
        PROJECT_SHOWCASE_MODEL_PATH,
        (gltf) => onProjectShowcaseLoaded(gltf as { scene: THREE.Group }),
        undefined,
        onProjectShowcaseLoadError,
      );
    }

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
      debugLog("orbit", `moonRadius=${moonRadius.toFixed(1)}, scale=${moonMesh.scale.x.toFixed(2)}`);

      const shipPos = ship.position;
      const moonPos = new THREE.Vector3();
      moonMesh.getWorldPosition(moonPos);
      debugLog("orbit", `ship=[${shipPos.x.toFixed(1)},${shipPos.y.toFixed(1)},${shipPos.z.toFixed(1)}]`);
      debugLog("orbit", `moon=[${moonPos.x.toFixed(1)},${moonPos.y.toFixed(1)},${moonPos.z.toFixed(1)}]`);

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
      debugLog("orbit", `Moon spin slowed: ${prevSpinSpeed.toFixed(3)} → ${(prevSpinSpeed / 3).toFixed(3)}`);

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
      const projectsAnchor =
        projectShowcaseWorldAnchorRef.current ?? new THREE.Vector3(-9800, 420, 7800);
      const projectsPlanetData: PlanetData = {
        name: "Projects",
        position: projectsAnchor.clone(),
        data: legacyWebsites,
      };
      const portfolioPlanetData: PlanetData = {
        name: "Portfolio",
        position: ORBITAL_PORTFOLIO_WORLD_ANCHOR.clone(),
        data: portfolioCores,
      };

      tourBuilderRef.current?.registerPlanet("experience", expPlanetData);
      tourBuilderRef.current?.registerPlanet("skills", skillsPlanetData);
      tourBuilderRef.current?.registerPlanet("projects", projectsPlanetData);
      tourBuilderRef.current?.registerPlanet("portfolio", portfolioPlanetData);

      planetsDataRef.current.set("experience", expPlanetData);
      planetsDataRef.current.set("skills", skillsPlanetData);
      planetsDataRef.current.set("projects", projectsPlanetData);
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
        console.log("❌ No camera available");
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
          projectShowcaseActive: projectShowcaseActiveRef.current,
          orbitalPortfolioActive: orbitalPortfolioActiveRef.current,
          orbitalPortfolioPlaying: orbitalPortfolioPlayingRef.current,
          skillsLatticeActive: skillsLatticeActiveRef.current,
          aboutMemorySquareActive: aboutMemorySquareActiveRef.current,
          navFlags: {
            projectsNavHereActive,
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
      console.log("[CAMERA_SNAPSHOT]", snapshot);
      try {
        void navigator.clipboard?.writeText(snapshotJson);
        shipLog("Camera snapshot copied to clipboard", "info");
      } catch {
        shipLog("Camera snapshot capture complete (clipboard unavailable)", "info");
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
          planets.push({ name: obj.userData.sectionId, worldPos: wp, radius: r });
        }
      });

      // If planetName provided, filter to it
      let targets = planets;
      if (planetName) {
        targets = planets.filter(
          (p) => p.name.toLowerCase() === planetName.toLowerCase(),
        );
      }

      console.log("═══════════════════════════════════════");
      console.log("📷 CAMERA VIEWPOINT CAPTURE");
      console.log("═══════════════════════════════════════");
      console.log(
        `Camera position: { x: ${camPos.x.toFixed(1)}, y: ${camPos.y.toFixed(1)}, z: ${camPos.z.toFixed(1)} }`,
      );
      console.log(
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
          if (!planetName || key.toLowerCase().includes(planetName.toLowerCase())) {
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
          ) * (180 / Math.PI); // elevation

        console.log(`\n🪐 Planet: ${planet.name}`);
        console.log(
          `   Planet world pos: { x: ${planet.worldPos.x.toFixed(1)}, y: ${planet.worldPos.y.toFixed(1)}, z: ${planet.worldPos.z.toFixed(1)} }`,
        );
        console.log(`   Planet radius: ${planet.radius.toFixed(1)}`);
        console.log(`   Camera distance: ${dist.toFixed(1)}`);
        console.log(
          `   Camera offset:   { x: ${offset.x.toFixed(1)}, y: ${offset.y.toFixed(1)}, z: ${offset.z.toFixed(1)} }`,
        );
        console.log(`   Azimuth: ${theta.toFixed(1)}°  Elevation: ${phi.toFixed(1)}°`);
        console.log(
          `   Distance / radius: ${(dist / planet.radius).toFixed(1)}x`,
        );

        // Output a copy-pasteable viewpoint object
        console.log(`   📋 Viewpoint data:`);
        console.log(
          `   { offset: { x: ${offset.x.toFixed(1)}, y: ${offset.y.toFixed(1)}, z: ${offset.z.toFixed(1)} }, distance: ${dist.toFixed(1)}, azimuth: ${theta.toFixed(1)}, elevation: ${phi.toFixed(1)} }`,
        );
      }

      if (targets.length === 0) {
        console.log("\n⚠️ No planets found. Available planet names:");
        planets.forEach((p) => console.log(`   - ${p.name}`));
        console.log("   (Also try: 'experience', 'skills', 'projects', 'portfolio')");
      }
      console.log("═══════════════════════════════════════");
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
      if (target !== "about") {
        aboutMemorySquarePendingEntryRef.current = false;
        aboutMemorySquareActiveRef.current = false;
        aboutMemorySquareNavIntentUntilRef.current = 0;
        setAboutNavHereActive(false);
        setExternalCosmosLabelsHiddenForAbout(false);
        cancelAboutMemorySquareEntrySequence();
      }
      if (target !== "projects") {
        setProjectsNavHereActive(false);
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
          setAboutNavHereActive(true);
          vlog("👨‍🚀 About — routing to memory square...");
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
            aboutMemorySquareNavIntentUntilRef.current = performance.now() + 20000;
            handleQuickNav("about", "section");
          } else {
            aboutMemorySquarePendingEntryRef.current = false;
            aboutMemorySquareActiveRef.current = false;
            aboutMemorySquareNavIntentUntilRef.current = 0;
            setExternalCosmosLabelsHiddenForAbout(true);
            const aboutFocusObject =
              aboutMemorySquareRootRef.current
              ?? (() => {
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
        case "projects":
        case "portfolio": {
          if (target === "projects") {
            setProjectsNavHereActive(true);
          }
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
                : target === "portfolio"
                  ? "✨ Portfolio"
                  : "💡 Projects";
          vlog(
            target === "projects"
              ? `${planetLabel} — Routing to trench destination...`
              : target === "portfolio"
                ? `${planetLabel} — Routing to orbital registry...`
              : `${planetLabel} — Traveling to ${target} Planet...`,
          );

          // Always use autopilot — ship is always engaged
          if (!manualFlightModeRef.current) {
            // Use unified quick-nav path to ensure moon-exit clearance applies.
            handleQuickNav(target, "section");
            break;
          }

          if (target === "projects") {
            pendingProjectShowcaseEntryRef.current = true;
            projectShowcaseAwaitingProjectsArrivalRef.current = false;
            projectShowcaseSawProjectsTravelRef.current = false;
            startProjectShowcaseEntrySequence();
            break;
          }
          if (target === "portfolio") {
            enterOrbitalPortfolio();
            break;
          }

          // Fallback: manual flight mode — direct camera
          if (target === "experience") {
            await cameraDirectorRef.current.focusPlanet(expPlanet, EXP_FOCUS_DIST);
          } else {
            const skillsFocusObject =
              skillsLatticeBeaconRef.current
              ?? skillsLatticeRootRef.current
              ?? (() => {
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
      onStarDestroyerClick: handleStarDestroyerClick,
      insideShipRef,
      getHologramPanelClickables: () =>
        hologramDroneRef.current?.getInteractivePanelMeshes() ?? [],
      onHologramPanelPicked: (panelIndex) => {
        hologramDroneRef.current?.selectPanel(panelIndex);
      },
    });

    const onPointerMoveGlobal = (event: PointerEvent) => {
      if (
        projectShowcaseActiveRef.current ||
        orbitalPortfolioActiveRef.current ||
        skillsLatticeActiveRef.current
      )
        return;
      onPointerMove(event);
    };
    const onClickGlobal = (event: MouseEvent) => {
      if (
        projectShowcaseActiveRef.current ||
        orbitalPortfolioActiveRef.current ||
        skillsLatticeActiveRef.current
      )
        return;
      onClick(event);
    };
    const onPointerDownRotateGlobal = (event: PointerEvent) => {
      if (projectShowcaseActiveRef.current || orbitalPortfolioActiveRef.current) return;
      onPointerDownRotate(event);
    };
    const onPointerMoveRotateGlobal = (event: PointerEvent) => {
      if (projectShowcaseActiveRef.current || orbitalPortfolioActiveRef.current) return;
      onPointerMoveRotate(event);
    };
    const onPointerUpRotateGlobal = (event: PointerEvent) => {
      if (projectShowcaseActiveRef.current || orbitalPortfolioActiveRef.current) return;
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

      console.log("SHIP_DEBUG_LABEL", {
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

      console.log("SHIP_DEBUG_LABELS", marks);
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
    startRenderLoop({
      exitFocusRequestRef,
      exitMoonView,
      spaceshipRef,
      shipCinematicRef,
      shipStagingModeRef,
      shipStagingKeysRef,
      manualFlightModeRef,
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
      updateAutopilotNavigation,
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
        setHudVisible: () => {},  // legacy — old HUD panels removed
        setShipExteriorLights,
        sunMesh,
        onIntroEvent: (event) => {
          if (event === "camera-intro started") {
            resetStartupUiReveal();
          } else if (event === "camera-intro completed") {
            runStartupUiReveal();
          }
          if (!CAMERA_TRACE_ENABLED) return;
          shipLog(`[CAMTRACE] ${event}`, "info");
        },
      });

    startIntroSequenceRef.current = startIntroSequence;

    setTimeout(() => {
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

      console.log("CAMERA_SNAPSHOT", snapshot);
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

      console.log("SHIP_SNAPSHOT", snapshot);
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

        console.log(
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
            sceneRef.current.controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false);
          }
          vlog("🔍 Ship explore mode ACTIVATED — use WASD to move, mouse to look");
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
      window.removeEventListener("keydown", handleExploreKeyDown, { capture: true });
      window.removeEventListener("keyup", handleExploreKeyUp, { capture: true });
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

      projectShowcaseRootRef.current = null;
      projectShowcaseWorldAnchorRef.current = null;
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
      orbitalPortfolioActiveRef.current = false;
      orbitalPortfolioPlayingRef.current = true;
      aboutMemorySquareRootRef.current = null;
      aboutMemorySquareWorldAnchorRef.current = null;
      aboutMemorySquarePendingEntryRef.current = false;
      aboutMemorySquareActiveRef.current = false;
      aboutMemorySquareNavIntentUntilRef.current = 0;
      setAboutNavHereActive(false);
      setProjectsNavHereActive(false);
      setOrbitalPortfolioReady(false);
      setOrbitalPortfolioActive(false);
      setOrbitalPortfolioPlaying(true);
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
      projectShowcaseNebulaRootRef.current = null;
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
      projectShowcasePanelsRef.current = [];
      projectShowcaseFloorPulseMatsRef.current = [];
      projectShowcaseTrackRef.current = null;


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

  const focusedProjectShowcasePanel =
    projectShowcasePanelsRef.current[projectShowcaseFocusIndex] ?? null;
  const projectShowcaseNavEntries = projectShowcasePanelsRef.current.map(
    (panel) => panel.entry,
  );
  const projectShowcaseNavRows = [
    ...projectShowcaseNavEntries.map((entry, index) => ({
      key: `${entry.id}-${index}`,
      title: `${index + 1}. ${entry.title}`,
      index,
    })),
  ];
  const orbitingMoonNavTarget =
    orbitPhase === "orbiting"
      ? (() => {
          const moon = focusedMoonRef.current;
          if (!moon) return null;
          const moonId = String((moon.userData as { moonId?: unknown }).moonId ?? "")
            .toLowerCase()
            .replace(/^moon-/, "");
          if (moonId) return moonId;
          const fallback = String((moon.userData as { planetName?: unknown }).planetName ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-");
          return fallback || null;
        })()
      : null;
  const navCurrentTargetResolved = aboutNavHereActive
    ? "about"
    : projectsNavHereActive
      ? "projects"
      : portfolioNavHereActive
        ? "portfolio"
        : skillsNavHereActive
          ? "skills"
          : orbitingMoonNavTarget ?? currentNavigationTarget;
  const focusedProjectShowcaseHasCoverCrop =
    focusedProjectShowcasePanel?.fitMode === "cover" &&
    ((focusedProjectShowcasePanel.baseRepeat.x ?? 1) < 0.999 ||
      (focusedProjectShowcasePanel.baseRepeat.y ?? 1) < 0.999);
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
    viewerMemoriesEnabled && (!moonMemoryManualMode || moonMemoryPlaybackPlaying);

  return (
    <>
      <style>{`
        .project-showcase-nav-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .project-showcase-nav-scroll::-webkit-scrollbar-track {
          background: rgba(10, 16, 28, 0.72);
          border-radius: 6px;
        }
        .project-showcase-nav-scroll::-webkit-scrollbar-thumb {
          background: rgba(110, 165, 230, 0.72);
          border-radius: 6px;
          border: 1px solid rgba(160, 200, 255, 0.25);
        }
      `}</style>
      {/* Show loader while scene is setting up */}
      {isLoading && (
        <CosmosLoader
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
          transition: "opacity 1.5s ease-in-out",
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
          {projectShowcaseEntryOverlayOpacity > 0.001 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10040,
                pointerEvents: "none",
                background: `radial-gradient(ellipse at 50% 42%, rgba(8, 16, 30, ${(
                  projectShowcaseEntryOverlayOpacity * 0.32
                ).toFixed(3)}), rgba(2, 5, 12, ${projectShowcaseEntryOverlayOpacity.toFixed(
                  3,
                )}) 82%)`,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 72,
              }}
            >
              <div
                style={{
                  color: "rgba(193, 215, 255, 0.9)",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  fontSize: 13,
                  textTransform: "uppercase",
                  textShadow: "0 0 14px rgba(80, 130, 220, 0.42)",
                  opacity: THREE.MathUtils.clamp(
                    projectShowcaseEntryOverlayOpacity * 1.4,
                    0,
                    1,
                  ),
                }}
              >
                Entering Project Showcase
              </div>
            </div>
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
              aria-label={consoleVisible ? "Hide ship terminal" : "Show ship terminal"}
              title={consoleVisible ? "Hide ship terminal" : "Show ship terminal"}
              onClick={() => setConsoleVisible((prev) => !prev)}
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
          {!isLoading && orbitPhase === "orbiting" && showOrbitSignTuningControls && (
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
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8 }}>
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
                <label key={row.key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
          {!isLoading && orbitPhase === "orbiting" && (
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
                      cursor: activeMoonMemoryCount > 0 ? "pointer" : "not-allowed",
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
                      cursor: activeMoonMemoryCount > 0 ? "ew-resize" : "not-allowed",
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
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#fff" }}>
                  CAMERA POSITION (ship-local)
                </div>
                <div>
                  X: <span style={{ color: "#ff6b6b" }}>{exploreCoords.local[0].toFixed(2)}</span>
                  &nbsp;&nbsp;
                  Y: <span style={{ color: "#51cf66" }}>{exploreCoords.local[1].toFixed(2)}</span>
                  &nbsp;&nbsp;
                  Z: <span style={{ color: "#339af0" }}>{exploreCoords.local[2].toFixed(2)}</span>
                </div>
                <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
                  World: [{exploreCoords.world[0]}, {exploreCoords.world[1]}, {exploreCoords.world[2]}]
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
                <div style={{
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,200,50,0.5)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#ffd43b",
                  fontSize: 11,
                  lineHeight: 1.7,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: "#fff" }}>CONTROLS</div>
                  <div><span style={{ color: "#aaa" }}>WASD</span> Move &nbsp; <span style={{ color: "#aaa" }}>Q/E</span> Down/Up &nbsp; <span style={{ color: "#aaa" }}>Shift</span> Fast</div>
                  <div><span style={{ color: "#aaa" }}>Mouse drag</span> Look around</div>
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
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#fff" }}>LOOK DIRECTION</div>
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
                    const lookShipDir = (localDir: [number, number, number], e: React.MouseEvent) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (!cam || !spaceshipRef.current || !sceneRef.current.controls) return;
                      const ship = spaceshipRef.current;
                      const quat = new THREE.Quaternion();
                      ship.getWorldQuaternion(quat);
                      const dir = new THREE.Vector3(...localDir).applyQuaternion(quat).normalize();
                      const cc = sceneRef.current.controls!;
                      const t = cam.position.clone().addScaledVector(dir, 2);
                      cc.setTarget(t.x, t.y, t.z, false);
                    };
                    const stopEvt = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); };
                    return (
                      <>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([0, 0, 1], e)}>Look Forward</button>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([0, 0, -1], e)}>Look Back</button>
                        </div>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([-1, 0, 0], e)}>Look Right</button>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([1, 0, 0], e)}>Look Left</button>
                        </div>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([0, 1, 0], e)}>Look Up</button>
                          <button style={viewBtnStyle} onMouseDown={stopEvt} onClick={(e) => lookShipDir([0, -1, 0], e)}>Look Down</button>
                        </div>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          <button
                            style={{ ...viewBtnStyle, background: "rgba(255, 180, 50, 0.3)", color: "#ffcc66", border: "1px solid rgba(255,180,50,0.5)", flex: "1 1 100%" }}
                            onMouseDown={stopEvt}
                            onClick={(e) => {
                              stopEvt(e);
                              if (!cam || !sceneRef.current.controls) return;
                              const lookDir = new THREE.Vector3();
                              cam.getWorldDirection(lookDir);
                              lookDir.negate();
                              const t = cam.position.clone().addScaledVector(lookDir, 2);
                              sceneRef.current.controls!.setTarget(t.x, t.y, t.z, false);
                            }}
                          >
                            Turn Around
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            style={{ ...viewBtnStyle, background: "rgba(0,255,150,0.2)", color: "#0f6", border: "1px solid rgba(0,255,150,0.4)", flex: "1 1 100%" }}
                            onMouseDown={stopEvt}
                            onClick={(e) => {
                              stopEvt(e);
                              if (!cam) return;
                              // Roll left: rotate camera's up vector around the look direction
                              const fwd = new THREE.Vector3();
                              cam.getWorldDirection(fwd);
                              const rollQuat = new THREE.Quaternion().setFromAxisAngle(fwd, Math.PI / 36); // 5° CCW
                              cam.up.applyQuaternion(rollQuat).normalize();
                            }}
                          >
                            Roll Left
                          </button>
                          <button
                            style={{ ...viewBtnStyle, background: "rgba(0,255,150,0.2)", color: "#0f6", border: "1px solid rgba(0,255,150,0.4)", flex: "1 1 100%" }}
                            onMouseDown={stopEvt}
                            onClick={(e) => {
                              stopEvt(e);
                              if (!cam) return;
                              // Roll right: rotate camera's up vector around the look direction
                              const fwd = new THREE.Vector3();
                              cam.getWorldDirection(fwd);
                              const rollQuat = new THREE.Quaternion().setFromAxisAngle(fwd, -Math.PI / 36); // 5° CW
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
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#fff" }}>MARK POSITION</div>
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
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button
                          style={{ ...markBtnBase, background: "rgba(255,60,60,0.85)", border: "2px solid rgba(255,100,100,0.7)" }}
                          onClick={() => {
                            const coords = shipExploreCoordsRef.current.local;
                            setExploreSavedPositions((prev) => [...prev, { label: "COCKPIT", local: [...coords] }]);
                            if (spaceshipRef.current) {
                              const cam = new THREE.Vector3(coords[0], coords[1], coords[2]);
                              const look = new THREE.Vector3(coords[0], coords[1], coords[2] + 6);
                              spaceshipRef.current.userData.cockpitCameraLocal = cam;
                              spaceshipRef.current.userData.cockpitLookLocal = look;
                              vlog(`COCKPIT MARKED at local [${coords[0]}, ${coords[1]}, ${coords[2]}]`);
                            }
                          }}
                        >Mark Cockpit</button>
                        <button
                          style={{ ...markBtnBase, background: "rgba(50,150,255,0.85)", border: "2px solid rgba(100,180,255,0.7)" }}
                          onClick={() => {
                            const coords = shipExploreCoordsRef.current.local;
                            setExploreSavedPositions((prev) => [...prev, { label: "CABIN", local: [...coords] }]);
                            vlog(`CABIN MARKED at local [${coords[0]}, ${coords[1]}, ${coords[2]}]`);
                          }}
                        >Mark Cabin</button>
                        <button
                          style={{ ...markBtnBase, background: "rgba(50,200,100,0.85)", border: "2px solid rgba(100,220,150,0.7)" }}
                          onClick={() => {
                            const coords = shipExploreCoordsRef.current.local;
                            setExploreSavedPositions((prev) => [...prev, { label: "CUSTOM", local: [...coords] }]);
                            vlog(`CUSTOM MARKED at local [${coords[0]}, ${coords[1]}, ${coords[2]}]`);
                          }}
                        >Mark Custom</button>
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
                    console.log("\n%c═══ SHIP EXPLORE MODE — SAVED POSITIONS ═══", "color: #ff6b6b; font-weight: bold; font-size: 14px;");
                    console.log("%cCurrent camera (ship-local):", "color: #0f6; font-weight: bold;", current.local);
                    console.log("%cCurrent camera (world):", "color: #888;", current.world);
                    console.log("");
                    positions.forEach((p) => {
                      const color = p.label === "COCKPIT" ? "#ff6b6b" : p.label === "CABIN" ? "#339af0" : "#51cf66";
                      console.log(`%c${p.label}:`, `color: ${color}; font-weight: bold;`, `new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2]})`);
                    });
                    console.log("");
                    console.log("%c── Copy-paste ready code ──", "color: #ffd43b; font-weight: bold;");
                    const codeLines = [
                      "// ═══ Ship Explore Mode — Saved Positions ═══",
                      `// Generated at ${new Date().toISOString()}`,
                      `// Ship scale: ${spaceshipRef.current?.scale.x ?? "unknown"}`,
                      "",
                    ];
                    positions.forEach((p) => {
                      codeLines.push(`// ${p.label}`);
                      codeLines.push(`const ${p.label.toLowerCase()}CamLocal = new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2]});`);
                      codeLines.push(`const ${p.label.toLowerCase()}LookLocal = new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2] + 6});`);
                      codeLines.push("");
                    });
                    if (positions.length === 0) {
                      codeLines.push("// (no positions marked yet — current camera position below)");
                      codeLines.push(`const currentLocal = new THREE.Vector3(${current.local[0]}, ${current.local[1]}, ${current.local[2]});`);
                    }
                    const codeStr = codeLines.join("\n");
                    console.log(codeStr);
                    console.log("%c═══ END ═══", "color: #ff6b6b; font-weight: bold;");
                    // Also try to copy to clipboard
                    navigator.clipboard.writeText(codeStr).then(
                      () => console.log("%cCopied to clipboard!", "color: #0f6; font-weight: bold;"),
                      () => console.log("%cClipboard copy failed — please copy from above.", "color: #ff0;"),
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
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#fff" }}>
                    SAVED POSITIONS
                  </div>
                  {exploreSavedPositions.map((pos, idx) => (
                    <div key={idx} style={{ borderBottom: "1px solid rgba(180,130,255,0.2)", paddingBottom: 4, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: pos.label === "COCKPIT" ? "#ff6b6b" : pos.label === "CABIN" ? "#339af0" : "#51cf66" }}>
                        {pos.label}
                      </span>
                      : [{pos.local[0]}, {pos.local[1]}, {pos.local[2]}]
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      // Copy all saved positions to clipboard as code
                      const code = exploreSavedPositions
                        .map((p) => `// ${p.label}: new THREE.Vector3(${p.local[0]}, ${p.local[1]}, ${p.local[2]})`)
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

          {/* Ship Control Bar — hidden while Project Showcase is active */}
          <UserOnScreenMessages hideTelemetry={orbitalPortfolioActive} />
          <CosmicMiniMap3D
            visible={!isLoading && sceneReady && startupMiniMapVisible}
            containerRef={startupMiniMapContainerRef}
            initiallyMinified
            containerStyle={{
              opacity: 0,
              transform: "translateX(200px)",
            }}
            projectModeSignal={projectShowcaseActive || orbitalPortfolioActive}
            spaceshipRef={spaceshipRef}
            starDestroyerRef={starDestroyerRef}
            itemsRef={itemsRef}
            skillsAnchorRef={skillsLatticeWorldAnchorRef}
            aboutAnchorRef={aboutMemorySquareWorldAnchorRef}
            projectsAnchorRef={projectShowcaseWorldAnchorRef}
            portfolioAnchorRef={orbitalPortfolioWorldAnchorRef}
            currentNavigationTarget={currentNavigationTarget}
            onNavigateToTarget={handleCockpitNavigate}
            onCoordinatePing={(message) => shipLog(message, "info")}
          />

          {/* Ship Control Bar — hidden while Project Showcase is active */}
          {!projectShowcaseActive && !orbitalPortfolioActive && (
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
            onClearLog={() => {
              shipLogsRef.current = [];
              setShipLogs([]);
            }}
            onClose={() => setConsoleVisible(false)}
            onCommand={(cmd) => {
              shipLog(`$ ${cmd}`, "cmd");
              // Command execution will be wired later
            }}
            onClearDebug={() => {
              debugLogsRef.current = [];
              setDebugLogs([]);
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
                setSettingsTab("sound");
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

          {sceneReady && (
            <div
              style={{
                position: "fixed",
                left: 48,
                bottom: 14,
                zIndex: 1110,
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 9,
                border: "1px solid rgba(135, 188, 246, 0.4)",
                background: "rgba(6, 14, 26, 0.78)",
                color: "#d8ecff",
                padding: "7px 10px",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 12,
              }}
            >
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={spaceBackgroundVisible}
                  onChange={(event) =>
                    setSpaceBackgroundVisible(event.currentTarget.checked)
                  }
                />
                Space Background
              </label>
              <span
                title="Helps reduce motion discomfort by hiding moving/parallax star imagery and using a plain black background."
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: "1px solid rgba(160, 215, 255, 0.65)",
                  color: "#c7eaff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  lineHeight: 1,
                  cursor: "help",
                  userSelect: "none",
                }}
              >
                ?
              </span>
            </div>
          )}

          {sceneReady && showSoundSettingsModal && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 1125,
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
                  <span style={{ fontSize: 14, letterSpacing: 0.6, fontWeight: 700 }}>
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
                        onChange={(event) => setMusicTrack(event.currentTarget.value)}
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
                          setOverallVolume(Number(event.currentTarget.value) / 100)
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
                  : `Skill in ${skillsLatticeSelection.category}`}
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
              Hint: Shift click to pan, mouse wheel zoom in/out, click nodes to inspect
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
                Slide {aboutSlides.length > 0 ? aboutActiveSlideIndex + 1 : 0}/{aboutSlides.length}
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

          {orbitalPortfolioActive &&
            (() => {
              const groups = orbitalPortfolioGroupsRef.current;
              const coreViews = orbitalPortfolioCoreViewsRef.current;
              const activeGroup = orbitalPortfolioHasActiveFocus
                ? groups[
                    THREE.MathUtils.clamp(
                      orbitalPortfolioFocusIndex,
                      0,
                      Math.max(0, groups.length - 1),
                    )
                  ]
                : null;
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
                    (tech) => tech.toLowerCase() === orbitalPortfolioTechFilter.toLowerCase(),
                  )
                ) {
                  return false;
                }
                if (!query) return true;
                const haystack =
                  `${group.title} ${group.description ?? ""} ${group.technologies.join(" ")}`.toLowerCase();
                return haystack.includes(query);
              });
              const orbitalRegistryPanelWidth = 430;
              return (
                <div
                  style={{
                    position: "fixed",
                    right: 18,
                    top: 78,
                    zIndex: 1101,
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
                      Orbital Registry
                    </div>
                    <div style={{ marginTop: 4, fontSize: 14, color: "#eaf8ff" }}>
                      {activeGroup?.title ?? "No active selection"}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 12, color: "rgba(170, 228, 255, 0.96)" }}>
                      Core: {(activeGroup?.coreTitle ?? orbitalPortfolioFocusedCoreId) || "N/A"}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 12, color: "rgba(210, 235, 255, 0.84)" }}>
                      {(() => {
                        const category =
                          activeVariant?.technologies?.[0] ||
                          activeGroup?.technologies?.[0] ||
                          "Portfolio Sample";
                        return `Category: ${category}`;
                      })()}
                    </div>

                    <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                      <button
                        onClick={() => {
                          const groups = orbitalPortfolioGroupsRef.current;
                          if (groups.length === 0) return;
                          const query = orbitalPortfolioSearchQuery.trim().toLowerCase();
                          const filtered = groups.filter((group) => {
                            if (
                              orbitalPortfolioYearFilter !== "all" &&
                              String(group.year ?? "unknown") !== orbitalPortfolioYearFilter
                            ) {
                              return false;
                            }
                            if (
                              orbitalPortfolioTechFilter !== "all" &&
                              !group.technologies.some(
                                (tech) => tech.toLowerCase() === orbitalPortfolioTechFilter.toLowerCase(),
                              )
                            ) {
                              return false;
                            }
                            if (!query) return true;
                            const haystack = `${group.title} ${group.description ?? ""} ${group.technologies.join(" ")}`.toLowerCase();
                            return haystack.includes(query);
                          });
                          const activeId = groups[orbitalPortfolioFocusIndexRef.current]?.id;
                          const inFilteredIdx = filtered.findIndex((group) => group.id === activeId);
                          const base = inFilteredIdx >= 0 ? inFilteredIdx : 0;
                          const target = filtered[(base - 1 + filtered.length) % filtered.length];
                          if (!target) return;
                          const next = groups.findIndex((group) => group.id === target.id);
                          if (next >= 0) focusOrbitalPortfolioStation(next, 0);
                        }}
                        style={{
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(170, 225, 255, 0.45)",
                          background: "rgba(8, 18, 34, 0.82)",
                          color: "#dff3ff",
                          fontFamily: "'Rajdhani', sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        Prev
                      </button>
                      <button
                        onClick={toggleOrbitalPortfolioPlayback}
                        style={{
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(170, 225, 255, 0.45)",
                          background: "rgba(8, 18, 34, 0.82)",
                          color: "#dff3ff",
                          fontFamily: "'Rajdhani', sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        {orbitalPortfolioPlaying ? "Pause" : "Play"}
                      </button>
                      <button
                        onClick={() => {
                          const groups = orbitalPortfolioGroupsRef.current;
                          if (groups.length === 0) return;
                          const query = orbitalPortfolioSearchQuery.trim().toLowerCase();
                          const filtered = groups.filter((group) => {
                            if (
                              orbitalPortfolioYearFilter !== "all" &&
                              String(group.year ?? "unknown") !== orbitalPortfolioYearFilter
                            ) {
                              return false;
                            }
                            if (
                              orbitalPortfolioTechFilter !== "all" &&
                              !group.technologies.some(
                                (tech) => tech.toLowerCase() === orbitalPortfolioTechFilter.toLowerCase(),
                              )
                            ) {
                              return false;
                            }
                            if (!query) return true;
                            const haystack = `${group.title} ${group.description ?? ""} ${group.technologies.join(" ")}`.toLowerCase();
                            return haystack.includes(query);
                          });
                          const activeId = groups[orbitalPortfolioFocusIndexRef.current]?.id;
                          const inFilteredIdx = filtered.findIndex((group) => group.id === activeId);
                          const base = inFilteredIdx >= 0 ? inFilteredIdx : -1;
                          const target = filtered[(base + 1 + filtered.length) % filtered.length];
                          if (!target) return;
                          const next = groups.findIndex((group) => group.id === target.id);
                          if (next >= 0) focusOrbitalPortfolioStation(next, 0);
                        }}
                        style={{
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(170, 225, 255, 0.45)",
                          background: "rgba(8, 18, 34, 0.82)",
                          color: "#dff3ff",
                          fontFamily: "'Rajdhani', sans-serif",
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
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(170, 225, 255, 0.45)",
                          background: "rgba(8, 18, 34, 0.82)",
                          color: "#dff3ff",
                          fontFamily: "'Rajdhani', sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        {orbitalPortfolioOrbitsEnabled ? "Stop Orbits" : "Start Orbits"}
                      </button>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: "1px solid rgba(170, 225, 255, 0.35)",
                          background: "rgba(8, 18, 34, 0.76)",
                          color: "#dff3ff",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={orbitalPortfolioAutoplayEnabled}
                          onChange={(event) => {
                            const next = event.currentTarget.checked;
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
                        />
                        Auto-play
                      </label>
                      <button
                        onClick={exitOrbitalPortfolio}
                        style={{
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(255, 195, 160, 0.45)",
                          background: "rgba(28, 14, 10, 0.82)",
                          color: "#ffe2d5",
                          fontFamily: "'Rajdhani', sans-serif",
                          cursor: "pointer",
                          marginLeft: "auto",
                        }}
                      >
                        Exit
                      </button>
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
                        onChange={(event) => setOrbitalPortfolioSearchQuery(event.currentTarget.value)}
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
                        onChange={(event) => setOrbitalPortfolioYearFilter(event.currentTarget.value)}
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
                          .sort((a, b) => (a === "unknown" ? 1 : b === "unknown" ? -1 : b.localeCompare(a)))
                          .map((year) => (
                            <option key={year} value={year}>
                              {year === "unknown" ? "Unknown" : year}
                            </option>
                          ))}
                      </select>
                      <select
                        value={orbitalPortfolioTechFilter}
                        onChange={(event) => setOrbitalPortfolioTechFilter(event.currentTarget.value)}
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
                        overflowY: "auto",
                        border: "1px solid rgba(155, 225, 255, 0.28)",
                        background: "rgba(6, 10, 20, 0.84)",
                        padding: "6px 6px 4px",
                      }}
                    >
                      {filteredGroups.length === 0 ? (
                        <div
                          style={{
                            color: "rgba(182, 214, 236, 0.8)",
                            fontSize: 12,
                            padding: "8px 8px 10px",
                          }}
                        >
                          No matches for current filters.
                        </div>
                      ) : (
                        coreViews.map((core) => {
                          const groupsForCore = filteredGroups.filter(
                            (group) => group.coreId === core.id,
                          );
                          if (groupsForCore.length === 0) return null;
                          const isExpanded =
                            orbitalRegistryExpandedCoreIds[core.id] ?? true;
                          const submenuMaxHeight = Math.max(56, groupsForCore.length * 42 + 10);
                          return (
                            <div key={core.id} style={{ marginBottom: 6 }}>
                              <button
                                onClick={() => {
                                  setOrbitalRegistryExpandedCoreIds((prev) => ({
                                    ...prev,
                                    [core.id]: !(prev[core.id] ?? true),
                                  }));
                                  focusOrbitalPortfolioCore(core.id);
                                }}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  borderRadius: 8,
                                  border: "1px solid rgba(145, 232, 255, 0.34)",
                                  background: "rgba(10, 28, 44, 0.78)",
                                  color: "#e8f7ff",
                                  cursor: "pointer",
                                  padding: "7px 8px",
                                  marginBottom: 4,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                  fontWeight: 700,
                                }}
                              >
                                <span>{core.title}</span>
                                <span
                                  style={{
                                    display: "inline-block",
                                    transition: "transform 180ms ease",
                                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                  }}
                                >
                                  {">"}
                                </span>
                              </button>
                              <div
                                style={{
                                  overflow: "hidden",
                                  maxHeight: isExpanded ? submenuMaxHeight : 0,
                                  opacity: isExpanded ? 1 : 0,
                                  transition:
                                    "max-height 220ms ease, opacity 180ms ease, padding 220ms ease",
                                  paddingLeft: isExpanded ? 12 : 0,
                                  borderLeft: "1px solid rgba(145, 232, 255, 0.2)",
                                  marginLeft: 6,
                                }}
                              >
                                {groupsForCore.map((group) => {
                                  const isHere = group.id === activeGroup?.id;
                                  const groupIndex = groups.findIndex((item) => item.id === group.id);
                                  return (
                                    <button
                                      key={group.id}
                                      onClick={() => {
                                        if (groupIndex >= 0)
                                          focusOrbitalPortfolioStation(groupIndex, 0);
                                      }}
                                      style={{
                                        width: "100%",
                                        textAlign: "left",
                                        borderRadius: 8,
                                        border: isHere
                                          ? "1px solid rgba(145, 232, 255, 0.92)"
                                          : "1px solid rgba(145, 232, 255, 0.24)",
                                        background: isHere
                                          ? "rgba(20, 58, 92, 0.84)"
                                          : "rgba(8, 18, 34, 0.68)",
                                        color: "#e8f7ff",
                                        cursor: "pointer",
                                        padding: "7px 8px 7px 12px",
                                        marginBottom: 6,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 8,
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
                                          title={`${group.clientVariantCount} client variant${group.clientVariantCount === 1 ? "" : "s"} (from legacy data)`}
                                          style={{
                                            fontSize: 11,
                                            color: isHere ? "#c0f2ff" : "rgba(180,220,245,0.72)",
                                            flexShrink: 0,
                                          }}
                                        >
                                          {group.clientVariantCount}
                                        </span>
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
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
              );
            })()}
          {orbitalPortfolioActive && (
            !orbitalRegistryPanelVisible && (
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
                <span style={{ fontSize: 10, color: "#9fdfff", opacity: 0.9, lineHeight: "100%" }}>Portfolio</span>
                <span style={{ fontSize: 10, fontWeight: 700, lineHeight: "auto" }}>
                  Orbital Registry
                </span>
              </div>
            )
          )}
          {orbitalPortfolioActive && (
            <button
              onClick={() => setOrbitalRegistryPanelVisible((prev) => !prev)}
              style={{
                position: "fixed",
                // Keep the toggle flush with the registry panel edge in both states.
                right: orbitalRegistryPanelVisible ? 448 : 0,
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
              title={orbitalRegistryPanelVisible ? "Hide Orbital Registry" : "Show Orbital Registry"}
            >
              {orbitalRegistryPanelVisible ? ">" : "<"}
            </button>
          )}
          {orbitalPortfolioActive && (
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
          )}
          {projectShowcaseActive && (
            <>
              <div
              style={{
                position: "fixed",
                right: 18,
                top: 96,
                zIndex: 1100,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "flex-end",
                width: 332,
                maxWidth: 332,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignSelf: "flex-start",
                }}
              >
                <button
                  onClick={() => stepProjectShowcaseFocus(-1)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(200, 220, 255, 0.35)",
                    background: "rgba(10, 12, 20, 0.75)",
                    color: "#e8ebff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                  }}
                >
                  Prev
                </button>
                <button
                  onClick={toggleProjectShowcasePlayback}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(200, 220, 255, 0.35)",
                    background: "rgba(10, 12, 20, 0.75)",
                    color: "#e8ebff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                  }}
                >
                  {projectShowcasePlaying ? "Pause" : "Play"}
                </button>
                <button
                  onClick={() => stepProjectShowcaseFocus(1)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(200, 220, 255, 0.35)",
                    background: "rgba(10, 12, 20, 0.75)",
                    color: "#e8ebff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                  }}
                >
                  Next
                </button>
              </div>
              <div
                style={{
                  width: "100%",
                  padding: "8px 10px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(114, 198, 255, 0.3)",
                  background: "rgba(7, 13, 24, 0.84)",
                  color: "#c7e9ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  display: "flex",
                  gap: 10,
                  alignItems: "stretch",
                  minHeight: 290,
                }}
              >
                <div
                  style={{
                    width: 74,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                    flexShrink: 0,
                    padding: "8px 8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(114, 198, 255, 0.3)",
                    background: "rgba(7, 13, 24, 0.84)",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      color: "#d9e6ff",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: 10,
                      letterSpacing: 0.4,
                    }}
                  >
                    <span>THROTTLE</span>
                    <span>{(projectShowcaseLeverValue * 100).toFixed(0)}%</span>
                  </div>
                  <div
                    onPointerDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      projectShowcaseLeverRectRef.current = rect;
                      startProjectShowcaseLeverDrag(e.clientY, rect);
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    style={{
                      position: "relative",
                      width: 16,
                      height: 232,
                      borderRadius: 12,
                      border: "1px solid rgba(160, 205, 255, 0.42)",
                      background:
                        "linear-gradient(180deg, rgba(22,40,58,0.95) 0%, rgba(10,18,28,0.9) 100%)",
                      cursor: "ns-resize",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: -19,
                        top: 6,
                        display: "flex",
                        flexDirection: "column-reverse",
                        alignItems: "center",
                        gap: 1,
                        fontSize: 8,
                        lineHeight: 1,
                        color: "rgba(168, 231, 255, 0.8)",
                        fontFamily: "'Rajdhani', sans-serif",
                        fontWeight: 700,
                        pointerEvents: "none",
                      }}
                    >
                      {"FORWARD".split("").map((ch, idx) => (
                        <span key={`forward-${idx}`}>{ch}</span>
                      ))}
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        left: -19,
                        bottom: 6,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 1,
                        fontSize: 8,
                        lineHeight: 1,
                        color: "rgba(255, 198, 164, 0.8)",
                        fontFamily: "'Rajdhani', sans-serif",
                        fontWeight: 700,
                        pointerEvents: "none",
                      }}
                    >
                      {"REVERSE".split("").map((ch, idx) => (
                        <span key={`reverse-${idx}`}>{ch}</span>
                      ))}
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        left: 2,
                        right: 2,
                        top: "50%",
                        height: 1,
                        background: "rgba(160, 200, 255, 0.45)",
                      }}
                    />
                    {[0, -8, 8].map((offset) => (
                      <div
                        key={offset}
                        style={{
                          position: "absolute",
                          left: 2,
                          right: 2,
                          top: `calc(50% + ${offset}px)`,
                          height: 1,
                          background:
                            offset === 0
                              ? "rgba(202, 234, 255, 0.68)"
                              : "rgba(160, 200, 255, 0.36)",
                        }}
                      />
                    ))}
                    <div
                      style={{
                        position: "absolute",
                        left: -3,
                        right: -3,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: "1px solid rgba(220, 235, 255, 0.65)",
                        background:
                          "radial-gradient(circle at 30% 30%, rgba(180,220,255,0.95) 0%, rgba(96,154,210,0.95) 35%, rgba(30,64,94,0.98) 100%)",
                        boxShadow: "0 2px 8px rgba(5, 10, 16, 0.5)",
                        top: `${50 - projectShowcaseLeverValue * 40}%`,
                        transform: "translateY(-50%)",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      padding: "6px 8px 8px",
                      borderRadius: 8,
                      border: "1px solid rgba(126, 184, 245, 0.35)",
                      background: "rgba(8, 14, 24, 0.72)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(171, 214, 255, 0.88)",
                        fontSize: 10,
                        letterSpacing: 0.8,
                        fontWeight: 700,
                      }}
                    >
                      FILTERS
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      {PROJECT_SHOWCASE_FILTER_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          style={{
                            padding: "4px 7px",
                            borderRadius: 999,
                            border: "1px solid rgba(120, 165, 225, 0.4)",
                            background:
                              "linear-gradient(180deg, rgba(15,26,44,0.92) 0%, rgba(9,16,30,0.9) 100%)",
                            color: "#d7e9ff",
                            cursor: "pointer",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.35,
                            lineHeight: 1.1,
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    className="project-showcase-nav-scroll"
                    style={{
                      flex: 1,
                      minHeight: 188,
                      maxHeight: 230,
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 6,
                      paddingRight: 4,
                      scrollbarWidth: "thin",
                      scrollbarColor:
                        "rgba(110, 165, 230, 0.7) rgba(10, 16, 28, 0.72)",
                    }}
                  >
                    {projectShowcaseNavRows.map((row) => {
                      const active = row.index === projectShowcaseFocusIndex;
                      return (
                        <button
                          key={row.key}
                          onClick={() => {
                            if (row.index < 0) return;
                            jumpProjectShowcaseToIndex(row.index);
                          }}
                          style={{
                            padding: "5px 7px",
                            borderRadius: 6,
                            border: active
                              ? "1px solid rgba(155, 220, 255, 0.78)"
                              : "1px solid rgba(120, 165, 225, 0.32)",
                            background: active
                              ? "rgba(34, 92, 140, 0.88)"
                              : "rgba(10, 16, 28, 0.78)",
                            color: active ? "#ecf6ff" : "#c5dcff",
                            cursor: "pointer",
                            textAlign: "left",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: 10,
                            fontWeight: active ? 700 : 600,
                            letterSpacing: 0.32,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            minHeight: 24,
                            maxWidth: "100%",
                          }}
                          title={row.title}
                        >
                          {row.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {PROJECT_SHOWCASE_SHOW_IMAGE_MANIPULATION_CONTROLS &&
                focusedProjectShowcaseHasCoverCrop && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(130, 170, 255, 0.35)",
                    background: "rgba(8, 12, 20, 0.75)",
                    color: "#c8d8ff",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 11,
                    lineHeight: 1.3,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, letterSpacing: 0.35 }}>
                    IMAGE CONTROLS
                  </div>
                  <div style={{ opacity: 0.9 }}>
                    Cover image is cropped. Use arrows and zoom slider.
                  </div>
                  <div style={{ opacity: 0.78 }}>
                    Shift+Drag pan • Shift+Wheel zoom
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 4,
                    }}
                  >
                    {[
                      { label: "↖", dx: -1 as const, dy: 1 as const },
                      { label: "↑", dx: 0 as const, dy: 1 as const },
                      { label: "↗", dx: 1 as const, dy: 1 as const },
                      { label: "←", dx: -1 as const, dy: 0 as const },
                      { label: "•", dx: 0 as const, dy: 0 as const },
                      { label: "→", dx: 1 as const, dy: 0 as const },
                      { label: "↙", dx: -1 as const, dy: -1 as const },
                      { label: "↓", dx: 0 as const, dy: -1 as const },
                      { label: "↘", dx: 1 as const, dy: -1 as const },
                    ].map((dir) => (
                      <button
                        key={dir.label}
                        onClick={() => {
                          if (dir.dx === 0 && dir.dy === 0) {
                            resetProjectShowcasePanelViewport();
                            return;
                          }
                          nudgeProjectShowcasePanelViewport(dir.dx, dir.dy);
                        }}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid rgba(190, 215, 255, 0.35)",
                          background:
                            dir.dx === 0 && dir.dy === 0
                              ? "rgba(24, 60, 86, 0.85)"
                              : "rgba(10, 12, 20, 0.75)",
                          color: "#e8ebff",
                          cursor: "pointer",
                          fontSize: 12,
                          fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 700,
                        }}
                      >
                        {dir.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Zoom</span>
                      <span>
                        {(focusedProjectShowcasePanel?.zoom ?? 1).toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={4}
                      step={0.01}
                      value={focusedProjectShowcasePanel?.zoom ?? 1}
                      onChange={(e) =>
                        setProjectShowcasePanelZoom(Number(e.target.value))
                      }
                    />
                  </div>
                  <button
                    onClick={() => resetProjectShowcasePanelViewport()}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(200, 220, 255, 0.35)",
                      background: "rgba(10, 12, 20, 0.75)",
                      color: "#e8ebff",
                      cursor: "pointer",
                      fontSize: 11,
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                      letterSpacing: 0.35,
                    }}
                  >
                    Reset View
                  </button>
                </div>
              )}
              <div
                style={{
                  width: "100%",
                  padding: "8px 10px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(114, 198, 255, 0.3)",
                  background: "rgba(7, 13, 24, 0.84)",
                  color: "#d9e6ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>IMAGE ANGLE</span>
                  <span>{projectShowcaseAnglePercent.toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={PROJECT_SHOWCASE_MIN_ANGLE_PERCENT}
                  max={PROJECT_SHOWCASE_MAX_ANGLE_PERCENT}
                  step={1}
                  value={projectShowcaseAnglePercent}
                  onChange={(e) =>
                    setProjectShowcaseAnglePercent(Number(e.target.value))
                  }
                />
              </div>
            </div>
            </>
          )}

          {/* Spaceship HUD Interface */}
          <SpaceshipHUD
            userName="HARMA DAVTIAN"
            userTitle="Lead Full Stack Engineer"
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
                    case "projects":
                      const projectsData =
                        planetsDataRef.current.get("projects");
                      if (projectsData) {
                        cameraDirectorRef.current.flyTo({
                          position: new THREE.Vector3(
                            projectsData.position.x + 400,
                            projectsData.position.y + 200,
                            projectsData.position.z + 300,
                          ),
                          lookAt: projectsData.position,
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

    </>
  );
}
