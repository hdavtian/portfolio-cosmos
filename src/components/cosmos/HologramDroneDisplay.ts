import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { OverlayContent, JobTechEntry } from "../CosmicContentOverlay";
import type { MoonPortfolioPayload } from "./moonPortfolioSelector";
import {
  HOLO_SIDE_OFFSET,
  HOLO_REF_DISTANCE,
} from "./scaleConfig";

const CANVAS_W = 768;
const PADDING = 28;
const BORDER_MARGIN = 6;

const TEXT_COLOR = "#8ab0c8";
const ACCENT_COLOR = "#2a9968";
const HEADER_BG = "rgba(2, 4, 8, 0.82)";
const SECTION_BG = "rgba(4, 10, 22, 0.78)";

const FLY_IN_DURATION = 1.2;
const BORDER_DRAW_DURATION = 1.6;
const CONTENT_FADE_DURATION = 0.5;
const LASER_STAGGER = 0.2;
const PRE_DRAW_WAIT_DURATION = 1.0;
const PRE_DRAW_SCAN_STEPS = 3;
const PRE_DRAW_SCAN_TURN_DURATION = 0.45;
const PRE_DRAW_SCAN_HOLD_DURATION = 0.5;
const SCAN_MAX_YAW = Math.PI * 0.36;
const SCAN_MAX_PITCH = Math.PI * 0.2;
const SCAN_MAX_ROLL = Math.PI * 0.22;
const DRONE_FACE_TRACK_YAW_OFFSET = Math.PI;
const POST_DRAW_HOLD_DURATION = 2.2;
const POST_DRAW_SCAN_TURN_MIN = 0.32;
const POST_DRAW_SCAN_TURN_MAX = 0.64;
const POST_DRAW_SCAN_HOLD_MIN = 0.28;
const POST_DRAW_SCAN_HOLD_MAX = 0.62;
// Keep this toggle centralized so disabling auto-exit is a one-line change
// when the drone should stay to draw additional items.
const AUTO_EXIT_AFTER_DRAW = true;
const POST_DRAW_DRONE_EXIT_DURATION = 0.55;
const PANELS_DOCK_DURATION = 0.38;
const CARD_CONTAINER_SHIFT_NDC_X = 0.08; // approx ~75px on 1920px wide view

const TECH_BADGE_TOP_NDC = 0.62;
const TECH_BADGE_WORLD_HEIGHT = 0.28;
const TECH_BADGE_GAP_PX = 7;
const TECH_BADGE_MIN_WORLD_WIDTH = 0.5;
const TECH_BADGE_MAX_WORLD_WIDTH = 2.8;
const TECH_BADGE_STAGGER = 0.14;
const TECH_BADGE_FLY_DURATION = 0.34;
const TECH_BADGE_TOTAL_DURATION_CAP = 2.0;
const TECH_BADGE_CONNECTOR_PULSE_SPEED = 2.8;
const TECH_BADGE_FONT_PX = 21;
const TECH_BADGE_PAD_X = 20;
const TECH_BADGE_PAD_Y = 10;
const TECH_BADGE_HOVER_INDEX_BASE = 10000;
const TECH_BADGE_HOVER_SPIN_DURATION = 0.55;
const TECH_BADGE_HOVER_SPIN_COOLDOWN_MS = 700;
const RULER_NDC_X = 0.965;
const RULER_COLOR = 0x2a9968;
const RULER_NOTCH_LEN_NDC = 0.016;
const RULER_LABEL_GAP_NDC = 0.008;
const SEAR_PREVIEW_TEXT_COLOR = "#f5c842";
const SEAR_LOCKED_TEXT_COLOR = "#ffaa20";
const SEAR_GLOW_COLOR_PREVIEW = "rgba(255, 200, 60, 0.18)";
const SEAR_GLOW_COLOR_LOCKED = "rgba(255, 160, 30, 0.35)";
const MINI_PORTFOLIO_TAB_INDEX_BASE = 20000;
const MINI_PORTFOLIO_CARD_INDEX_BASE = 21000;
const MINI_PORTFOLIO_PREVIEW_INDEX = 22000;
const MINI_PORTFOLIO_NAV_PREV_INDEX = 23000;
const MINI_PORTFOLIO_NAV_NEXT_INDEX = 23001;
const MINI_PORTFOLIO_DETAIL_INDEX = 23002;
const INTRO_CARD_INDEX = 25000;
const MINI_PORTFOLIO_MAX_CARDS = 8;
const MINI_PORTFOLIO_VISIBLE_CARD_SLOTS = 3;
const GUIDE_LINE_DRAW_DURATION = 0.95;
const NARRATIVE_VIEWPORT_CANVAS_H = 980;
// Responsive guide-line anchors from zone-exported column boundaries:
// 1) left edge of portfolio area, 2) left edge of job column, 3) left edge of tech column.
const GUIDE_LINE_X_FRACTIONS = [0.11302, 0.55365, 0.89219];
const LAYOUT_COL2_LEFT = 0.11302;
const LAYOUT_COL2_RIGHT = 0.55365;
const LAYOUT_COL3_LEFT = 0.55365;
const LAYOUT_COL3_RIGHT = 0.89219;
const LAYOUT_TOP = 0.02;
const LAYOUT_BOTTOM = 0.978;
const LAYOUT_LARGE_TOP = 0.03292;
const LAYOUT_LARGE_BOTTOM = 0.75281;
const LAYOUT_ROW2_TOP = 0.75281;
const LAYOUT_ROW2_BOTTOM = 0.97558;
const LAYOUT_THUMBS_LEFT = 0.11771;
const LAYOUT_THUMBS_RIGHT = 0.38906;
const LAYOUT_DESC_LEFT = 0.38906;
const LAYOUT_DESC_RIGHT = 0.54531;
const LAYOUT_GAP = 0.0065;

const BASE_SIDE_OFFSET = HOLO_SIDE_OFFSET;
const DRONE_FORWARD_RATIO = 0.3;
const REFERENCE_DISTANCE = HOLO_REF_DISTANCE;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.6;
const SCALE_POWER = 0.6;
const OBLIVION_DRONE_MODEL_PATH = "/models/oblivion-drone/oblivion_drone.glb";

export type DroneVisualVariant = "classic" | "oblivion";
export type DroneAudioBuffers = {
  activation?: AudioBuffer | null;
  transmission?: AudioBuffer | null;
  movement?: AudioBuffer[];
};
type HologramDroneDisplayOptions = {
  droneVariant?: DroneVisualVariant;
  oblivionDroneTemplate?: THREE.Object3D | null;
  droneAudioBuffers?: DroneAudioBuffers;
  soundEnabled?: boolean;
  soundVolume?: number;
  onAudioDebug?: (message: string) => void;
};

type TextPanel = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  contentCanvas: HTMLCanvasElement;
  displayCanvas: HTMLCanvasElement;
  displayCtx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  panelW: number;
  panelH: number;
  targetOpacity: number;
  revealTime: number;
  borderProgress: number;
  contentFade: number;
  borderComplete: boolean;
  isHeader: boolean;
  penX: number;
  penY: number;
  drawOffset: THREE.Vector3;
  drawOriginWorld: THREE.Vector3;
  dockScale: number;
  expandedScale: number;
  scrollOffset: number;
  maxScroll: number;
};

type LaserRig = {
  line: THREE.Line;
  lineMat: THREE.LineBasicMaterial;
  edgeA: THREE.Line;
  edgeAMat: THREE.LineBasicMaterial;
  edgeB: THREE.Line;
  edgeBMat: THREE.LineBasicMaterial;
  triangle: THREE.Mesh;
  triangleMat: THREE.MeshBasicMaterial;
  glow: THREE.Mesh;
};

type ScanAngles = {
  pitch: number;
  yaw: number;
  roll: number;
};

type ScanTurnPhase = "idle" | "turning" | "holding";

type TextLayoutRun = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font: string;
};

type TechBadgeRecord = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  connector: THREE.Line;
  connectorMat: THREE.LineBasicMaterial;
  revealTime: number;
  startWorld: THREE.Vector3;
  worldWidth: number;
  worldHeight: number;
  hoverSpinActive: boolean;
  hoverSpinProgress: number;
  hoverSpinAngle: number;
  lastSpinAtMs: number;
  launched: boolean;
  techEntry: JobTechEntry;
};

type MiniPortfolioTabRecord = {
  id: string;
  title: string;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
};

type MiniPortfolioCardRecord = {
  id: string;
  title: string;
  description?: string;
  technologies: string[];
  mediaItems: Array<{
    id: string;
    title: string;
    description?: string;
    textureUrl: string;
  }>;
  activeMediaIndex: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
};

type MiniPortfolioPreviewRecord = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
};

type MiniPortfolioNavRecord = {
  id: "prev" | "next";
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
};

type MiniPortfolioDetailRecord = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  scrollOffset: number;
  maxScroll: number;
};

type GuideLineRecord = {
  xFraction: number;
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
};

export class HologramDroneDisplay {
  private scene: THREE.Scene;
  private rootGroup: THREE.Group;
  private droneGroup: THREE.Group;
  private panelGroup: THREE.Group;
  private scannerLight: THREE.PointLight;
  private droneVariant: DroneVisualVariant;
  private oblivionDroneTemplate: THREE.Object3D | null;
  private requestedOblivionModel = false;

  private panels: TextPanel[] = [];
  private laserRigs: LaserRig[] = [];

  private active = false;
  private hiding = false;
  private hideProgress = 0;
  private flyInProgress = 0;
  private contentStartTime = 0;
  private idleTime = 0;
  private isOrbitMode = false;

  private drawFinished = false;
  private drawSequenceElapsed = 0;
  private drawEnabled = false;
  private inspectionMode = false;
  private waitingPostDrawHold = false;
  private postDrawLingerActive = false;
  private postDrawHoldElapsed = 0;
  private droneExitingAfterDraw = false;
  private droneExitProgress = 0;
  private preDrawScanTargets: ScanAngles[] = [];
  private postScanCurrent: ScanAngles = { pitch: 0, yaw: 0, roll: 0 };
  private postScanFrom: ScanAngles = { pitch: 0, yaw: 0, roll: 0 };
  private postScanTarget: ScanAngles = { pitch: 0, yaw: 0, roll: 0 };
  private postScanTurning = false;
  private postScanTurnElapsed = 0;
  private postScanTurnDuration = POST_DRAW_SCAN_TURN_MIN;
  private postScanHoldElapsed = 0;
  private postScanHoldDuration = POST_DRAW_SCAN_HOLD_MIN;
  private preDrawLastStepIndex = -1;
  private preDrawScanPhase: ScanTurnPhase = "idle";
  private thrusterGlowMats: THREE.MeshBasicMaterial[] = [];
  private previousDroneQuat: THREE.Quaternion | null = null;
  private smoothedTurnSpeed = 0;
  private scanCueListener: THREE.AudioListener | null = null;
  private activationAudio: THREE.PositionalAudio | null = null;
  private transmissionAudio: THREE.PositionalAudio | null = null;
  private movementAudio: THREE.PositionalAudio | null = null;
  private droneAudioBuffers: DroneAudioBuffers | null = null;
  private soundEnabled = true;
  private droneSoundVolume = 1;
  private onAudioDebug?: (message: string) => void;
  private attachedAudioCamera: THREE.Camera | null = null;
  private lastMovementCueTime = 0;
  private lastTransmissionCueTime = 0;
  private activationPlayedThisRun = false;
  private lastActivationAttemptTime = 0;
  private activationRetryUntilTime = 0;

  private dockingPanels = false;
  private panelsDocked = false;
  private panelDockProgress = 0;
  private activePanelIndex: number | null = null;
  private shouldDockPanels = true;

  private techBadges: TechBadgeRecord[] = [];
  private techSequenceElapsed = 0;
  private techSequenceTotalDuration = 0;
  private hoveredTechBadgeIndex: number | null = null;
  private lockedTechBadgeIndex: number | null = null;
  private panelTextRuns: TextLayoutRun[][] = [];
  private activeSearMatches: string[] = [];
  private searMode: "none" | "preview" | "locked" = "none";
  private rulerLine: THREE.Line | null = null;
  private rulerLineMat: THREE.LineBasicMaterial | null = null;
  private rulerNotches: THREE.Line[] = [];
  private rulerNotchMats: THREE.LineBasicMaterial[] = [];
  private rulerRevealActive = false;
  private rulerRevealProgress = 0;
  private moonPortfolio: MoonPortfolioPayload | null = null;
  private miniPortfolioTabs: MiniPortfolioTabRecord[] = [];
  private miniPortfolioCards: MiniPortfolioCardRecord[] = [];
  private activeMiniPortfolioTabIndex = 0;
  private activeMiniPortfolioCardIndex: number | null = null;
  private hoveredMiniPortfolioCardIndex: number | null = null;
  private hoveredMiniPortfolioPreview = false;
  private hoveredNarrativePanel = false;
  private hoveredMiniPortfolioDetail = false;
  private hoveredMiniPortfolioNav: "prev" | "next" | null = null;
  private miniPortfolioPreview: MiniPortfolioPreviewRecord | null = null;
  private miniPortfolioDetail: MiniPortfolioDetailRecord | null = null;
  private miniPortfolioNavButtons: MiniPortfolioNavRecord[] = [];
  private miniPortfolioCardPage = 0;
  private miniPortfolioImageCache = new Map<string, HTMLImageElement>();
  private miniPortfolioImageFailures = new Set<string>();
  private guideLines: GuideLineRecord[] = [];

  private introMode = false;
  private onSeeDetailsCallback: (() => void) | null = null;

  private flyStartPos = new THREE.Vector3();
  private flyEndPos = new THREE.Vector3();
  private targetWorldPos = new THREE.Vector3();
  private sideDir = new THREE.Vector3();

  private _tmpV = new THREE.Vector3();
  private _tmpV2 = new THREE.Vector3();
  private _tmpQ = new THREE.Quaternion();
  private _tmpQ2 = new THREE.Quaternion();
  private _tmpM = new THREE.Matrix4();
  private disposed = false;

  constructor(scene: THREE.Scene, options?: HologramDroneDisplayOptions) {
    this.scene = scene;
    this.droneVariant = options?.droneVariant ?? "classic";
    this.oblivionDroneTemplate = options?.oblivionDroneTemplate ?? null;
    this.droneAudioBuffers = options?.droneAudioBuffers ?? null;
    this.soundEnabled = options?.soundEnabled ?? false;
    this.droneSoundVolume = THREE.MathUtils.clamp(options?.soundVolume ?? 1, 0, 1);
    this.onAudioDebug = options?.onAudioDebug;
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = "HologramDroneRoot";
    this.rootGroup.visible = false;

    this.droneGroup = this.buildDroneForVariant();
    this.rootGroup.add(this.droneGroup);

    this.panelGroup = new THREE.Group();
    this.panelGroup.name = "HologramPanels";
    this.panelGroup.visible = false;

    this.scannerLight = new THREE.PointLight(0xff4d4d, 0, 12);
    // Add the light directly to the scene (not inside rootGroup) so it is
    // always counted by traverseVisible regardless of the drone's visibility.
    // Toggling rootGroup.visible would otherwise change NUM_POINT_LIGHTS,
    // forcing Three.js to recompile every MeshStandardMaterial shader.
    this.scene.add(this.scannerLight);

    this.scene.add(this.rootGroup);
    this.scene.add(this.panelGroup);
    this.cacheThrusterGlows();
    this.audioDebug(
      `init soundEnabled=${this.soundEnabled} activation=${!!this.droneAudioBuffers?.activation} transmission=${!!this.droneAudioBuffers?.transmission} movement=${this.droneAudioBuffers?.movement?.length ?? 0}`,
    );

  }

  setDroneVariant(
    droneVariant: DroneVisualVariant,
    oblivionDroneTemplate?: THREE.Object3D | null,
  ): void {
    const variantChanged = this.droneVariant !== droneVariant;
    const templateChanged = oblivionDroneTemplate && this.oblivionDroneTemplate !== oblivionDroneTemplate;
    this.droneVariant = droneVariant;
    if (oblivionDroneTemplate) this.oblivionDroneTemplate = oblivionDroneTemplate;
    if (this.droneVariant === "oblivion" && !this.oblivionDroneTemplate) {
      this.requestOblivionDroneModel();
    }
    if (variantChanged || templateChanged) {
      this.rebuildDroneGroup();
    }
  }

  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    this.audioDebug(`setSoundEnabled(${enabled})`);
    if (enabled) void this.resumeAudioContext();
    if (!enabled) {
      this.activationAudio?.stop();
      this.transmissionAudio?.stop();
      this.movementAudio?.stop();
    }
  }

  setSoundVolume(volume: number): void {
    this.droneSoundVolume = THREE.MathUtils.clamp(volume, 0, 1);
    this.activationAudio?.setVolume(0.45 * this.droneSoundVolume);
    this.transmissionAudio?.setVolume(0.36 * this.droneSoundVolume);
    this.movementAudio?.setVolume(0.32 * this.droneSoundVolume);
    this.audioDebug(`setSoundVolume(${this.droneSoundVolume.toFixed(2)})`);
  }

  setDroneAudioBuffers(buffers: DroneAudioBuffers | null): void {
    this.droneAudioBuffers = buffers;
    this.audioDebug(
      `setDroneAudioBuffers activation=${!!buffers?.activation} transmission=${!!buffers?.transmission} movement=${buffers?.movement?.length ?? 0}`,
    );
  }

  async resumeAudioContext(): Promise<void> {
    if (!this.scanCueListener) {
      this.scanCueListener = new THREE.AudioListener();
      this.audioDebug("created AudioListener in resumeAudioContext()");
    }
    const ctx = this.scanCueListener.context;
    this.audioDebug(`resumeAudioContext state(before)=${ctx.state}`);
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        // Browser may still block until an explicit user gesture.
      }
    }
    this.audioDebug(`resumeAudioContext state(after)=${ctx.state}`);
  }

  private audioDebug(message: string): void {
    this.onAudioDebug?.(message);
  }

  private isAudioPlaybackAllowed(): boolean {
    return this.active && this.rootGroup.visible && this.droneGroup.visible;
  }

  private stopAllDroneAudio(): void {
    if (this.activationAudio?.isPlaying) this.activationAudio.stop();
    if (this.transmissionAudio?.isPlaying) this.transmissionAudio.stop();
    if (this.movementAudio?.isPlaying) this.movementAudio.stop();
  }

  private tryPlayActivationWithRetry(): void {
    if (this.activationPlayedThisRun) return;
    const now = performance.now();
    if (now > this.activationRetryUntilTime) return;
    if (now - this.lastActivationAttemptTime <= 280) return;
    this.lastActivationAttemptTime = now;
    this.activationPlayedThisRun = this.playActivationSound();
  }

  private buildDroneForVariant(): THREE.Group {
    if (this.droneVariant === "oblivion") {
      const oblivion = this.buildOblivionDrone();
      if (oblivion) return oblivion;
    }
    return this.buildClassicDrone();
  }

  private buildClassicDrone(): THREE.Group {
    const group = new THREE.Group();
    group.name = "HologramDrone";

    const body = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      new THREE.MeshStandardMaterial({
        color: 0x8899aa,
        metalness: 0.8,
        roughness: 0.25,
        emissive: 0x112233,
        emissiveIntensity: 0.3,
      }),
    );
    body.scale.set(1, 0.7, 1);
    group.add(body);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.04, 8, 32),
      new THREE.MeshStandardMaterial({
        color: 0x4fffb0,
        emissive: 0x4fffb0,
        emissiveIntensity: 0.5,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.8,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.name = "droneRing";
    group.add(ring);

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0x4fffb0,
        emissive: 0x4fffb0,
        emissiveIntensity: 1.0,
      }),
    );
    eye.position.y = -0.35;
    group.add(eye);

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6),
      new THREE.MeshStandardMaterial({
        color: 0xaabbcc,
        metalness: 0.9,
        roughness: 0.2,
      }),
    );
    antenna.position.y = 0.45;
    group.add(antenna);

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff4444,
        emissive: 0xff4444,
        emissiveIntensity: 0.8,
      }),
    );
    tip.position.y = 0.63;
    group.add(tip);

    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2;
      const thruster = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.06, 0.15),
        new THREE.MeshStandardMaterial({
          color: 0x556677,
          metalness: 0.7,
          roughness: 0.3,
        }),
      );
      thruster.position.set(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
      thruster.rotation.y = -angle;
      group.add(thruster);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0xff5f4d,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        }),
      );
      glow.userData.isDroneThrusterGlow = true;
      glow.position.copy(thruster.position).multiplyScalar(1.04);
      group.add(glow);
    }

    this.configureDroneVisualLayer(group);
    return group;
  }

  private buildOblivionDrone(): THREE.Group | null {
    const _bStart = performance.now();
    if (!this.oblivionDroneTemplate) return null;
    const group = new THREE.Group();
    group.name = "HologramDrone";

    const model = this.oblivionDroneTemplate.clone(true);
    model.name = "OblivionDroneModel";

    // Deep-clone geometry and materials so this instance is fully
    // independent from the template. Without this, clone(true)
    // shares geometry/material references — and disposeObject3D
    // on a previous clone would release GPU buffers that the
    // template (and future clones) still depend on.
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        if (mesh.geometry) mesh.geometry = mesh.geometry.clone();
        if (mesh.material) {
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map((m) => m.clone())
            : mesh.material.clone();
        }
      }
    });

    // Normalize imported drone size so flight behavior matches existing offsets.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (Number.isFinite(maxDim) && maxDim > 0.0001) {
      const scale = 1.5 / maxDim;
      model.scale.setScalar(scale);
      box.setFromObject(model);
    }

    const center = box.getCenter(new THREE.Vector3());
    if (center.lengthSq() > 0) model.position.sub(center);
    model.position.y += 0.1;
    group.add(model);

    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2;
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0xff6a56,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
      );
      glow.userData.isDroneThrusterGlow = true;
      glow.position.set(Math.cos(angle) * 0.5, -0.18, Math.sin(angle) * 0.5);
      group.add(glow);
    }

    this.configureDroneVisualLayer(group);
    console.warn(`[PERF:drone] buildOblivionDrone took ${(performance.now() - _bStart).toFixed(1)}ms`);
    return group;
  }

  private rebuildDroneGroup(): void {
    if (this.disposed) return;
    const _rbStart = performance.now();
    const nextGroup = this.buildDroneForVariant();
    this.rootGroup.remove(this.droneGroup);
    this.disposeObject3D(this.droneGroup);
    this.droneGroup = nextGroup;
    if (this.activationAudio) this.droneGroup.add(this.activationAudio);
    if (this.transmissionAudio) this.droneGroup.add(this.transmissionAudio);
    if (this.movementAudio) this.droneGroup.add(this.movementAudio);
    this.rootGroup.add(this.droneGroup);
    this.cacheThrusterGlows();
    this.previousDroneQuat = null;
    console.warn(`[PERF:drone] rebuildDroneGroup took ${(performance.now() - _rbStart).toFixed(1)}ms`);
  }

  private requestOblivionDroneModel(): void {
    if (this.requestedOblivionModel || this.oblivionDroneTemplate || this.disposed) return;
    this.requestedOblivionModel = true;
    const loader = new GLTFLoader();
    loader.load(
      OBLIVION_DRONE_MODEL_PATH,
      (gltf) => {
        if (this.disposed) return;
        if (this.oblivionDroneTemplate) return;
        this.oblivionDroneTemplate = gltf.scene;
        if (this.droneVariant === "oblivion") this.rebuildDroneGroup();
      },
      undefined,
      () => {
        // Keep classic drone as fallback when model load fails.
      },
    );
  }

  private disposeObject3D(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const maybeMesh = obj as THREE.Mesh;
      if (maybeMesh.geometry) maybeMesh.geometry.dispose();
      if (maybeMesh.material) {
        const mat = maybeMesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }

  private configureDroneVisualLayer(root: THREE.Object3D): void {
    root.traverse((obj) => {
      obj.renderOrder = 1300;
      const maybeMesh = obj as THREE.Mesh;
      if (!maybeMesh.material) return;
      const mats = Array.isArray(maybeMesh.material)
        ? maybeMesh.material
        : [maybeMesh.material];
      mats.forEach((mat) => {
        mat.depthTest = true;
        mat.depthWrite = true;
        if (this.droneVariant === "oblivion") {
          mat.transparent = false;
          mat.opacity = 1;
          mat.alphaTest = 0;
        }
      });
    });
  }

  private cacheThrusterGlows(): void {
    this.thrusterGlowMats = [];
    this.droneGroup.traverse((obj) => {
      if (!obj.userData?.isDroneThrusterGlow) return;
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial | undefined;
      if (mat) this.thrusterGlowMats.push(mat);
    });
  }

  private updateThrusterGlow(delta: number): void {
    const worldQ = this.droneGroup.getWorldQuaternion(this._tmpQ2);
    if (!this.previousDroneQuat) this.previousDroneQuat = worldQ.clone();
    const angleDelta = this.previousDroneQuat.angleTo(worldQ);
    const turnSpeed = angleDelta / Math.max(delta, 1 / 240);
    this.previousDroneQuat.copy(worldQ);
    this.smoothedTurnSpeed += (turnSpeed - this.smoothedTurnSpeed) * 0.16;

    const pulse = 0.55 + 0.45 * Math.sin(this.idleTime * 6.8);
    const intensityBoost = this.droneExitingAfterDraw ? 0.28 : 0;
    const glowAlpha = THREE.MathUtils.clamp(
      0.16 + this.smoothedTurnSpeed * 0.24 + intensityBoost,
      0.1,
      0.95,
    );
    for (const mat of this.thrusterGlowMats) {
      mat.opacity = glowAlpha * pulse;
    }
  }

  private ensureDroneAudio(camera: THREE.Camera): void {
    if (!this.scanCueListener) {
      this.scanCueListener = new THREE.AudioListener();
    }
    if (this.attachedAudioCamera !== camera) {
      this.attachedAudioCamera?.remove(this.scanCueListener);
      camera.add(this.scanCueListener);
      this.attachedAudioCamera = camera;
      this.audioDebug("attached AudioListener to camera");
    }
    if (!this.scanCueListener) return;
    const createAudio = (volume: number) => {
      const audio = new THREE.PositionalAudio(this.scanCueListener!);
      audio.setRefDistance(26);
      audio.setRolloffFactor(0.72);
      audio.setDistanceModel("inverse");
      audio.setMaxDistance(360);
      audio.setVolume(volume * this.droneSoundVolume);
      return audio;
    };
    if (!this.activationAudio) {
      this.activationAudio = createAudio(0.45);
      this.droneGroup.add(this.activationAudio);
      this.audioDebug("created activation positional audio");
    }
    if (!this.transmissionAudio) {
      this.transmissionAudio = createAudio(0.36);
      this.droneGroup.add(this.transmissionAudio);
      this.audioDebug("created transmission positional audio");
    }
    if (!this.movementAudio) {
      this.movementAudio = createAudio(0.32);
      this.droneGroup.add(this.movementAudio);
      this.audioDebug("created movement positional audio");
    }
  }

  private playActivationSound(): boolean {
    if (!this.isAudioPlaybackAllowed()) {
      this.audioDebug("playActivationSound skipped: drone not in audible visible state");
      return false;
    }
    if (!this.soundEnabled || !this.activationAudio) {
      this.audioDebug(
        `playActivationSound skipped soundEnabled=${this.soundEnabled} hasAudio=${!!this.activationAudio}`,
      );
      return false;
    }
    const buffer = this.droneAudioBuffers?.activation;
    if (!buffer) {
      this.audioDebug("playActivationSound skipped: no activation buffer");
      return false;
    }
    const ctxState = this.scanCueListener?.context.state ?? "none";
    if (ctxState !== "running") {
      void this.resumeAudioContext();
      this.audioDebug(`playActivationSound deferred ctx=${ctxState}`);
      return false;
    }
    try {
      if (this.activationAudio.isPlaying) this.activationAudio.stop();
      this.activationAudio.setBuffer(buffer);
      this.activationAudio.play();
      this.audioDebug(
        `playActivationSound ok ctx=${this.scanCueListener?.context.state ?? "none"}`,
      );
      return true;
    } catch {
      this.audioDebug(
        `playActivationSound failed ctx=${this.scanCueListener?.context.state ?? "none"}`,
      );
      return false;
    }
  }

  private playTransmissionSound(): void {
    if (!this.isAudioPlaybackAllowed()) {
      this.audioDebug("playTransmissionSound skipped: drone not in audible visible state");
      return;
    }
    if (!this.soundEnabled || !this.transmissionAudio) return;
    const buffer = this.droneAudioBuffers?.transmission;
    if (!buffer) {
      this.audioDebug("playTransmissionSound skipped: no transmission buffer");
      return;
    }
    const now = performance.now();
    if (now - this.lastTransmissionCueTime < 520) return;
    this.lastTransmissionCueTime = now;
    try {
      if (this.transmissionAudio.isPlaying) this.transmissionAudio.stop();
      this.transmissionAudio.setBuffer(buffer);
      this.transmissionAudio.play();
      this.audioDebug(
        `playTransmissionSound ok ctx=${this.scanCueListener?.context.state ?? "none"}`,
      );
    } catch {
      this.audioDebug(
        `playTransmissionSound failed ctx=${this.scanCueListener?.context.state ?? "none"}`,
      );
    }
  }

  private playMovementSound(): void {
    if (!this.isAudioPlaybackAllowed()) {
      this.audioDebug("playMovementSound skipped: drone not in audible visible state");
      return;
    }
    if (!this.soundEnabled || !this.movementAudio) return;
    const pool = this.droneAudioBuffers?.movement ?? [];
    if (pool.length === 0) {
      this.audioDebug("playMovementSound skipped: movement pool empty");
      return;
    }
    const now = performance.now();
    if (now - this.lastMovementCueTime < 140) return;
    this.lastMovementCueTime = now;
    const idx = Math.floor(Math.random() * pool.length);
    const buffer = pool[idx];
    if (!buffer) return;
    try {
      if (this.movementAudio.isPlaying) this.movementAudio.stop();
      this.movementAudio.setBuffer(buffer);
      this.movementAudio.play();
      this.audioDebug(
        `playMovementSound ok idx=${idx} ctx=${this.scanCueListener?.context.state ?? "none"}`,
      );
    } catch {
      this.audioDebug(
        `playMovementSound failed idx=${idx} ctx=${this.scanCueListener?.context.state ?? "none"}`,
      );
    }
  }

  private randomScanAngles(scale: number = 1): ScanAngles {
    return {
      pitch: (Math.random() * 2 - 1) * SCAN_MAX_PITCH * scale,
      yaw: (Math.random() * 2 - 1) * SCAN_MAX_YAW * scale,
      roll: (Math.random() * 2 - 1) * SCAN_MAX_ROLL * scale,
    };
  }

  private resetInquisitiveScanState(): void {
    this.preDrawScanTargets = Array.from(
      { length: PRE_DRAW_SCAN_STEPS },
      () => this.randomScanAngles(1),
    );
    this.postScanCurrent = { pitch: 0, yaw: 0, roll: 0 };
    this.postScanFrom = { pitch: 0, yaw: 0, roll: 0 };
    this.postScanTarget = this.randomScanAngles(1.05);
    this.postScanTurning = false;
    this.postScanTurnElapsed = 0;
    this.postScanTurnDuration = POST_DRAW_SCAN_TURN_MIN;
    this.postScanHoldElapsed = 0;
    this.postScanHoldDuration = POST_DRAW_SCAN_HOLD_MIN;
    this.preDrawLastStepIndex = -1;
    this.preDrawScanPhase = "idle";
  }

  private preDrawScanTotalDuration(): number {
    return (
      PRE_DRAW_WAIT_DURATION +
      PRE_DRAW_SCAN_STEPS * (PRE_DRAW_SCAN_TURN_DURATION + PRE_DRAW_SCAN_HOLD_DURATION)
    );
  }

  private getPreDrawScanStepIndex(elapsed: number): number {
    if (elapsed < PRE_DRAW_WAIT_DURATION) return -1;
    const seg = PRE_DRAW_SCAN_TURN_DURATION + PRE_DRAW_SCAN_HOLD_DURATION;
    const step = Math.floor((elapsed - PRE_DRAW_WAIT_DURATION) / seg);
    return THREE.MathUtils.clamp(step, 0, PRE_DRAW_SCAN_STEPS - 1);
  }

  private getPreDrawScanAngles(elapsed: number): ScanAngles {
    if (elapsed < PRE_DRAW_WAIT_DURATION) {
      return { pitch: 0, yaw: 0, roll: 0 };
    }
    const t = elapsed - PRE_DRAW_WAIT_DURATION;
    const seg = PRE_DRAW_SCAN_TURN_DURATION + PRE_DRAW_SCAN_HOLD_DURATION;
    const step = Math.floor(t / seg);
    if (step >= PRE_DRAW_SCAN_STEPS) {
      this.preDrawScanPhase = "holding";
      return this.preDrawScanTargets[PRE_DRAW_SCAN_STEPS - 1] ?? {
        pitch: 0,
        yaw: 0,
        roll: 0,
      };
    }

    const localT = t - step * seg;
    const from =
      step === 0
        ? { pitch: 0, yaw: 0, roll: 0 }
        : this.preDrawScanTargets[step - 1] ?? { pitch: 0, yaw: 0, roll: 0 };
    const to = this.preDrawScanTargets[step] ?? from;
    if (localT <= PRE_DRAW_SCAN_TURN_DURATION) {
      this.preDrawScanPhase = "turning";
      const u = THREE.MathUtils.clamp(localT / PRE_DRAW_SCAN_TURN_DURATION, 0, 1);
      return {
        pitch: THREE.MathUtils.lerp(from.pitch, to.pitch, u),
        yaw: THREE.MathUtils.lerp(from.yaw, to.yaw, u),
        roll: THREE.MathUtils.lerp(from.roll, to.roll, u),
      };
    }
    this.preDrawScanPhase = "holding";
    return to;
  }

  private updatePostDrawScan(delta: number): ScanAngles {
    if (this.postScanTurning) {
      this.postScanTurnElapsed += delta;
      const u = THREE.MathUtils.clamp(
        this.postScanTurnElapsed / Math.max(this.postScanTurnDuration, 0.0001),
        0,
        1,
      );
      this.postScanCurrent = {
        pitch: THREE.MathUtils.lerp(this.postScanFrom.pitch, this.postScanTarget.pitch, u),
        yaw: THREE.MathUtils.lerp(this.postScanFrom.yaw, this.postScanTarget.yaw, u),
        roll: THREE.MathUtils.lerp(this.postScanFrom.roll, this.postScanTarget.roll, u),
      };
      if (u >= 1) {
        this.postScanTurning = false;
        this.postScanHoldElapsed = 0;
        this.postScanHoldDuration = THREE.MathUtils.lerp(
          POST_DRAW_SCAN_HOLD_MIN,
          POST_DRAW_SCAN_HOLD_MAX,
          Math.random(),
        );
      }
      return this.postScanCurrent;
    }

    this.postScanHoldElapsed += delta;
    if (this.postScanHoldElapsed >= this.postScanHoldDuration) {
      this.postScanFrom = { ...this.postScanCurrent };
      this.postScanTarget = this.randomScanAngles(1.15);
      this.postScanTurnElapsed = 0;
      this.postScanTurnDuration = THREE.MathUtils.lerp(
        POST_DRAW_SCAN_TURN_MIN,
        POST_DRAW_SCAN_TURN_MAX,
        Math.random(),
      );
      this.postScanTurning = true;
      this.playMovementSound();
    }
    return this.postScanCurrent;
  }

  private createLaserRig(): LaserRig {
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xff4040,
      transparent: true,
      opacity: 0,
    });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      lineMat,
    );
    line.frustumCulled = false;
    line.renderOrder = 1120;

    const edgeAMat = new THREE.LineBasicMaterial({
      color: 0xff7a7a,
      transparent: true,
      opacity: 0,
    });
    const edgeA = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      edgeAMat,
    );
    edgeA.frustumCulled = false;
    edgeA.renderOrder = 1110;

    const edgeBMat = new THREE.LineBasicMaterial({
      color: 0xff7a7a,
      transparent: true,
      opacity: 0,
    });
    const edgeB = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      edgeBMat,
    );
    edgeB.frustumCulled = false;
    edgeB.renderOrder = 1110;

    const triGeo = new THREE.BufferGeometry();
    triGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Array(9).fill(0), 3),
    );
    const triangleMat = new THREE.MeshBasicMaterial({
      color: 0xff6666,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const triangle = new THREE.Mesh(triGeo, triangleMat);
    triangle.frustumCulled = false;
    triangle.renderOrder = 1100;

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xff4d4d,
        transparent: true,
        opacity: 0,
      }),
    );
    glow.frustumCulled = false;
    glow.renderOrder = 1130;

    this.rootGroup.add(line, edgeA, edgeB, triangle, glow);
    return { line, lineMat, edgeA, edgeAMat, edgeB, edgeBMat, triangle, triangleMat, glow };
  }

  private ensureLaserRigCount(count: number): void {
    while (this.laserRigs.length < count) {
      this.laserRigs.push(this.createLaserRig());
    }
    while (this.laserRigs.length > count) {
      const rig = this.laserRigs.pop();
      if (!rig) break;
      this.rootGroup.remove(rig.line, rig.edgeA, rig.edgeB, rig.triangle, rig.glow);
      rig.line.geometry.dispose();
      rig.edgeA.geometry.dispose();
      rig.edgeB.geometry.dispose();
      rig.triangle.geometry.dispose();
      rig.lineMat.dispose();
      rig.edgeAMat.dispose();
      rig.edgeBMat.dispose();
      rig.triangleMat.dispose();
      (rig.glow.material as THREE.Material).dispose();
      rig.glow.geometry.dispose();
    }
  }

  private setLaserRigOpacity(rig: LaserRig, alpha: number): void {
    rig.lineMat.opacity = alpha;
    rig.edgeAMat.opacity = alpha * 0.78;
    rig.edgeBMat.opacity = alpha * 0.78;
    rig.triangleMat.opacity = alpha * 0.22;
    (rig.glow.material as THREE.MeshBasicMaterial).opacity = alpha * 0.8;
  }

  private updateLaserRig(
    rig: LaserRig,
    startLocal: THREE.Vector3,
    endLocal: THREE.Vector3,
    camera: THREE.Camera,
    pulse: number,
  ): void {
    const linePositions = rig.line.geometry.attributes.position as THREE.BufferAttribute;
    linePositions.setXYZ(0, startLocal.x, startLocal.y, startLocal.z);
    linePositions.setXYZ(1, endLocal.x, endLocal.y, endLocal.z);
    linePositions.needsUpdate = true;

    const sideLocal = this._tmpV
      .subVectors(this.rootGroup.worldToLocal(camera.position.clone()), startLocal)
      .cross(this._tmpV2.subVectors(endLocal, startLocal))
      .normalize();
    if (sideLocal.lengthSq() < 1e-4) sideLocal.set(0, 1, 0);
    const spread = Math.min(1.6, Math.max(0.32, startLocal.distanceTo(endLocal) * 0.09));
    const endA = endLocal.clone().addScaledVector(sideLocal, spread);
    const endB = endLocal.clone().addScaledVector(sideLocal, -spread);

    const edgeAAttr = rig.edgeA.geometry.attributes.position as THREE.BufferAttribute;
    edgeAAttr.setXYZ(0, startLocal.x, startLocal.y, startLocal.z);
    edgeAAttr.setXYZ(1, endA.x, endA.y, endA.z);
    edgeAAttr.needsUpdate = true;

    const edgeBAttr = rig.edgeB.geometry.attributes.position as THREE.BufferAttribute;
    edgeBAttr.setXYZ(0, startLocal.x, startLocal.y, startLocal.z);
    edgeBAttr.setXYZ(1, endB.x, endB.y, endB.z);
    edgeBAttr.needsUpdate = true;

    const triAttr = rig.triangle.geometry.attributes.position as THREE.BufferAttribute;
    triAttr.setXYZ(0, startLocal.x, startLocal.y, startLocal.z);
    triAttr.setXYZ(1, endA.x, endA.y, endA.z);
    triAttr.setXYZ(2, endB.x, endB.y, endB.z);
    triAttr.needsUpdate = true;

    this.setLaserRigOpacity(rig, pulse);
    rig.glow.position.copy(endLocal);
  }

  private dimLaserRig(rig: LaserRig, delta: number): void {
    rig.lineMat.opacity = Math.max(0, rig.lineMat.opacity - delta * 1.5);
    rig.edgeAMat.opacity = Math.max(0, rig.edgeAMat.opacity - delta * 1.8);
    rig.edgeBMat.opacity = Math.max(0, rig.edgeBMat.opacity - delta * 1.8);
    rig.triangleMat.opacity = Math.max(0, rig.triangleMat.opacity - delta * 1.2);
    const glowMat = rig.glow.material as THREE.MeshBasicMaterial;
    glowMat.opacity = Math.max(0, glowMat.opacity - delta * 1.5);
  }

  private prepareDronePlacement(
    moonWorldPos: THREE.Vector3,
    camera: THREE.Camera,
    orbitAnchor?: THREE.Vector3,
  ): number {
    this.targetWorldPos.copy(moonWorldPos);
    this.isOrbitMode = !!orbitAnchor;

    const moonToCamera = this._tmpV.subVectors(camera.position, moonWorldPos);
    const dist = moonToCamera.length();
    const forward = moonToCamera.clone().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    this.sideDir.crossVectors(forward, worldUp).normalize();
    if (this.sideDir.lengthSq() < 0.01) this.sideDir.set(1, 0, 0);

    const rawRatio = dist / REFERENCE_DISTANCE;
    let distScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.pow(rawRatio, SCALE_POWER)));

    let endPos: THREE.Vector3;
    let orbitCamUp: THREE.Vector3 | null = null;
    let orbitCamRight: THREE.Vector3 | null = null;
    if (orbitAnchor) {
      distScale = 0.3;
      const camUp = camera.up.clone().normalize();
      const camRight = new THREE.Vector3()
        .crossVectors(camera.getWorldDirection(new THREE.Vector3()), camUp)
        .normalize();
      orbitCamUp = camUp;
      orbitCamRight = camRight;
      endPos = orbitAnchor
        .clone()
        .addScaledVector(camUp, 6)
        .addScaledVector(camRight, 3);
    } else {
      const sideOffset = BASE_SIDE_OFFSET * distScale;
      endPos = moonWorldPos
        .clone()
        .addScaledVector(forward, dist * DRONE_FORWARD_RATIO)
        .addScaledVector(this.sideDir, sideOffset)
        .add(new THREE.Vector3(0, 5 * distScale, 0));
    }
    this.flyEndPos.copy(endPos);
    if (orbitAnchor) {
      // In orbit mode, start from an on-screen offset near the destination so
      // the entry animation is visible immediately (not from behind camera).
      const camForward = camera.getWorldDirection(new THREE.Vector3()).normalize();
      const camUp = orbitCamUp ?? camera.up.clone().normalize();
      const camRight = orbitCamRight
        ?? new THREE.Vector3().crossVectors(camForward, camUp).normalize();
      this.flyStartPos
        .copy(endPos)
        .addScaledVector(camRight, -2.8)
        .addScaledVector(camUp, 2.2)
        .addScaledVector(camForward, -4.5);
    } else {
      this.flyStartPos
        .copy(camera.position)
        .addScaledVector(forward, 15)
        .add(new THREE.Vector3(0, 8, 0));
    }
    return distScale;
  }

  showContent(
    content: OverlayContent,
    moonWorldPos: THREE.Vector3,
    camera: THREE.Camera,
    orbitAnchor?: THREE.Vector3,
  ): void {
    const _scStart = performance.now();
    this.clearPanels();
    this.active = true;
    this.hiding = false;
    this.hideProgress = 0;
    this.flyInProgress = 0;
    this.contentStartTime = 0;
    this.drawSequenceElapsed = 0;
    this.drawEnabled = false;
    this.inspectionMode = false;
    this.idleTime = 0;
    this.drawFinished = false;
    this.waitingPostDrawHold = false;
    this.postDrawLingerActive = false;
    this.postDrawHoldElapsed = 0;
    this.droneExitingAfterDraw = false;
    this.droneExitProgress = 0;
    this.activationPlayedThisRun = false;
    this.activationRetryUntilTime = performance.now() + 8000;
    this.dockingPanels = false;
    this.panelsDocked = false;
    this.panelDockProgress = 0;
    this.activePanelIndex = null;
    // Keep moon drone text panels where they are initially drawn.
    // Do not run post-draw dock/focus repositioning.
    this.shouldDockPanels = false;
    this.moonPortfolio = content.moonPortfolio ?? null;
    this.activeMiniPortfolioTabIndex = 0;
    this.activeMiniPortfolioCardIndex = null;
    this.hoveredMiniPortfolioCardIndex = null;
    this.hoveredMiniPortfolioPreview = false;
    this.hoveredNarrativePanel = false;
    this.hoveredMiniPortfolioDetail = false;
    this.hoveredMiniPortfolioNav = null;
    this.miniPortfolioCardPage = 0;

    this.rootGroup.visible = true;
    this.panelGroup.visible = true;
    this.droneGroup.visible = true;
    this.droneGroup.position.set(0, 0, 0);
    this.droneGroup.rotation.set(0, 0, 0);
    this.droneGroup.scale.setScalar(0);
    this.previousDroneQuat = null;
    this.smoothedTurnSpeed = 0;
    this.resetInquisitiveScanState();
    const _scPlaceStart = performance.now();
    const distScale = this.prepareDronePlacement(moonWorldPos, camera, orbitAnchor);
    const _scBuildStart = performance.now();
    this.buildTextPanels(content, camera, distScale);
    this.buildGuideLines();
    this.buildTechBadges(content);
    this.buildMiniPortfolio(content);
    const _scLaserStart = performance.now();
    this.ensureLaserRigCount(Math.max(1, this.panels.length));
    this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0));
    this.rootGroup.position.copy(this.flyStartPos);
    this.scannerLight.position.copy(this.rootGroup.position);
    console.warn(
      `[PERF:drone] showContent total=${(performance.now() - _scStart).toFixed(1)}ms` +
      ` clear+setup=${(_scPlaceStart - _scStart).toFixed(1)}ms` +
      ` placement=${(_scBuildStart - _scPlaceStart).toFixed(1)}ms` +
      ` buildTextPanels=${(_scLaserStart - _scBuildStart).toFixed(1)}ms` +
      ` lasers=${(performance.now() - _scLaserStart).toFixed(1)}ms`
    );
  }

  showInspectMode(
    moonWorldPos: THREE.Vector3,
    camera: THREE.Camera,
    orbitAnchor?: THREE.Vector3,
  ): void {
    this.clearPanels();
    this.ensureLaserRigCount(0);
    this.active = true;
    this.inspectionMode = true;
    this.hiding = false;
    this.hideProgress = 0;
    this.flyInProgress = 0;
    this.contentStartTime = 0;
    this.drawSequenceElapsed = 0;
    this.drawEnabled = false;
    this.idleTime = 0;
    this.drawFinished = false;
    this.waitingPostDrawHold = false;
    this.postDrawLingerActive = false;
    this.postDrawHoldElapsed = 0;
    this.droneExitingAfterDraw = false;
    this.droneExitProgress = 0;
    this.activationPlayedThisRun = false;
    this.activationRetryUntilTime = performance.now() + 8000;
    this.dockingPanels = false;
    this.panelsDocked = false;
    this.panelDockProgress = 0;
    this.activePanelIndex = null;
    this.shouldDockPanels = false;

    this.rootGroup.visible = true;
    this.panelGroup.visible = false;
    this.droneGroup.visible = true;
    this.droneGroup.position.set(0, 0, 0);
    this.droneGroup.rotation.set(0, 0, 0);
    this.droneGroup.scale.setScalar(0);
    this.previousDroneQuat = null;
    this.smoothedTurnSpeed = 0;
    this.resetInquisitiveScanState();

    this.prepareDronePlacement(moonWorldPos, camera, orbitAnchor);
    this.rootGroup.position.copy(this.flyStartPos);
    this.scannerLight.position.copy(this.rootGroup.position);
  }

  setOnSeeDetails(cb: (() => void) | null): void {
    this.onSeeDetailsCallback = cb;
  }

  showIntroCard(
    content: OverlayContent,
    moonWorldPos: THREE.Vector3,
    camera: THREE.Camera,
    orbitAnchor?: THREE.Vector3,
  ): void {
    this.clearPanels();
    this.clearIntroCard();
    this.active = true;
    this.introMode = true;
    this.hiding = false;
    this.hideProgress = 0;
    this.flyInProgress = 0;
    this.contentStartTime = 0;
    this.drawSequenceElapsed = 0;
    this.drawEnabled = false;
    this.inspectionMode = false;
    this.idleTime = 0;
    this.drawFinished = false;
    this.waitingPostDrawHold = false;
    this.postDrawLingerActive = false;
    this.postDrawHoldElapsed = 0;
    this.droneExitingAfterDraw = false;
    this.droneExitProgress = 0;
    this.activationPlayedThisRun = false;
    this.activationRetryUntilTime = performance.now() + 8000;
    this.dockingPanels = false;
    this.panelsDocked = false;
    this.panelDockProgress = 0;
    this.activePanelIndex = null;
    this.shouldDockPanels = false;

    this.rootGroup.visible = true;
    this.panelGroup.visible = true;
    this.droneGroup.visible = true;
    this.droneGroup.position.set(0, 0, 0);
    this.droneGroup.rotation.set(0, 0, 0);
    this.droneGroup.scale.setScalar(0);
    this.previousDroneQuat = null;
    this.smoothedTurnSpeed = 0;
    this.resetInquisitiveScanState();

    this.prepareDronePlacement(moonWorldPos, camera, orbitAnchor);
    this.buildIntroCardPanel(content, camera);
    this.ensureLaserRigCount(1);
    this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0));
    this.rootGroup.position.copy(this.flyStartPos);
    this.scannerLight.position.copy(this.rootGroup.position);
  }

  private buildIntroCardPanel(content: OverlayContent, camera: THREE.Camera): void {
    this.panelTextRuns = [];
    const introText = content.droneIntroText || content.description || "";
    const lines: string[] = [];
    if (content.subtitle) lines.push(content.subtitle);
    lines.push("");
    lines.push(introText);
    lines.push("");
    lines.push("\u25B6  SEE DETAILS");

    const depth = Math.max(11, camera.position.distanceTo(this.flyEndPos) * 0.52);
    const frust = this.getCameraFrustumSizeAtDepth(camera, depth);
    const panelWorldWidth = frust.w * 0.28;

    const contentHeight = this.measureContentHeight(content.title, lines, false);
    const canvasH = contentHeight;
    const panelWorldHeight = panelWorldWidth * (canvasH / CANVAS_W);

    const contentCanvas = this.createContentCanvas(
      content.title,
      lines,
      false,
      CANVAS_W,
      canvasH,
      0,
    );
    const displayCanvas = document.createElement("canvas");
    displayCanvas.width = CANVAS_W;
    displayCanvas.height = canvasH;
    const displayCtx = displayCanvas.getContext("2d")!;

    const texture = new THREE.CanvasTexture(displayCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(panelWorldWidth, panelWorldHeight),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.userData.hologramPanelIndex = INTRO_CARD_INDEX;
    mesh.renderOrder = 1000;
    const material = mesh.material as THREE.MeshBasicMaterial;

    const centerWorld = this.ndcToWorldOnViewPlane(0, 0, camera, depth);
    const drawOffset = centerWorld.clone().sub(this.flyEndPos);
    mesh.position.copy(this.flyEndPos).add(drawOffset);
    this.panelGroup.add(mesh);

    this.panels.push({
      mesh,
      material,
      texture,
      contentCanvas,
      displayCanvas,
      displayCtx,
      canvasW: CANVAS_W,
      canvasH,
      panelW: panelWorldWidth,
      panelH: panelWorldHeight,
      targetOpacity: 0.94,
      revealTime: 0,
      borderProgress: 0,
      contentFade: 0,
      borderComplete: false,
      isHeader: false,
      penX: BORDER_MARGIN,
      penY: BORDER_MARGIN,
      drawOffset,
      drawOriginWorld: mesh.position.clone(),
      dockScale: 1,
      expandedScale: 1,
      scrollOffset: 0,
      maxScroll: 0,
    });
  }

  private clearIntroCard(): void {
    this.introMode = false;
  }

  hideContent(): void {
    if (!this.active) return;
    this.hiding = true;
    this.hideProgress = 0;
    this.stopAllDroneAudio();
  }

  hideContentImmediate(): void {
    if (!this.active) return;
    this.active = false;
    this.hiding = false;
    this.hideProgress = 0;
    this.droneExitingAfterDraw = false;
    this.droneExitProgress = 0;
    this.waitingPostDrawHold = false;
    this.postDrawLingerActive = false;
    this.postDrawHoldElapsed = 0;
    this.inspectionMode = false;
    this.dockingPanels = false;
    this.panelsDocked = false;
    this.panelDockProgress = 0;
    this.activePanelIndex = null;
    this.rootGroup.visible = false;
    this.panelGroup.visible = false;
    this.droneGroup.visible = false;
    this.scannerLight.intensity = 0;
    this.stopAllDroneAudio();
    for (const rig of this.laserRigs) {
      this.setLaserRigOpacity(rig, 0);
    }
    this.clearPanels();
    this.clearIntroCard();
    this.previousDroneQuat = null;
    this.smoothedTurnSpeed = 0;
    this.activationPlayedThisRun = false;
    this.activationRetryUntilTime = 0;
  }

  getInteractivePanelMeshes(): THREE.Object3D[] {
    const result: THREE.Object3D[] = [];
    if (this.active && this.introMode && this.drawFinished) {
      for (const panel of this.panels) result.push(panel.mesh);
      return result;
    }
    if (this.active && this.panelsDocked) {
      for (const panel of this.panels) result.push(panel.mesh);
    }
    if (this.active && this.drawFinished && this.techBadges.length > 0) {
      for (const badge of this.techBadges) result.push(badge.mesh);
    }
    if (this.active && this.drawFinished) {
      for (const tab of this.miniPortfolioTabs) result.push(tab.mesh);
      for (const card of this.miniPortfolioCards) {
        if (card.mesh.visible) result.push(card.mesh);
      }
      if (this.miniPortfolioPreview) result.push(this.miniPortfolioPreview.mesh);
      if (this.miniPortfolioDetail) result.push(this.miniPortfolioDetail.mesh);
      for (const nav of this.miniPortfolioNavButtons) result.push(nav.mesh);
    }
    return result;
  }

  getPanelTextures(): THREE.CanvasTexture[] {
    const textures = this.panels.map((panel) => panel.texture);
    for (const badge of this.techBadges) textures.push(badge.texture);
    for (const tab of this.miniPortfolioTabs) textures.push(tab.texture);
    for (const card of this.miniPortfolioCards) textures.push(card.texture);
    if (this.miniPortfolioPreview) textures.push(this.miniPortfolioPreview.texture);
    if (this.miniPortfolioDetail) textures.push(this.miniPortfolioDetail.texture);
    for (const nav of this.miniPortfolioNavButtons) textures.push(nav.texture);
    return textures;
  }

  getPanelGroup(): THREE.Group {
    return this.panelGroup;
  }

  selectPanel(panelIndex: number): void {
    if (panelIndex === INTRO_CARD_INDEX) {
      if (this.introMode && this.onSeeDetailsCallback) {
        this.onSeeDetailsCallback();
      }
      return;
    }
    if (panelIndex === MINI_PORTFOLIO_DETAIL_INDEX) {
      return;
    }
    if (panelIndex === MINI_PORTFOLIO_NAV_PREV_INDEX) {
      this.shiftMiniPortfolioPage(-1);
      return;
    }
    if (panelIndex === MINI_PORTFOLIO_NAV_NEXT_INDEX) {
      this.shiftMiniPortfolioPage(1);
      return;
    }
    if (panelIndex === MINI_PORTFOLIO_PREVIEW_INDEX) {
      if (
        this.activeMiniPortfolioCardIndex !== null &&
        this.activeMiniPortfolioCardIndex >= 0 &&
        this.activeMiniPortfolioCardIndex < this.miniPortfolioCards.length
      ) {
        const card = this.miniPortfolioCards[this.activeMiniPortfolioCardIndex];
        card.activeMediaIndex =
          (card.activeMediaIndex + 1) % Math.max(1, card.mediaItems.length);
        this.refreshMiniPortfolioCardVisuals();
      }
      return;
    }
    if (panelIndex >= MINI_PORTFOLIO_CARD_INDEX_BASE) {
      const cardIndex = panelIndex - MINI_PORTFOLIO_CARD_INDEX_BASE;
      if (cardIndex >= 0 && cardIndex < this.miniPortfolioCards.length) {
        const pageStart = this.miniPortfolioCardPage * MINI_PORTFOLIO_VISIBLE_CARD_SLOTS;
        const pageEnd = pageStart + MINI_PORTFOLIO_VISIBLE_CARD_SLOTS;
        if (cardIndex < pageStart || cardIndex >= pageEnd) return;
        const card = this.miniPortfolioCards[cardIndex];
        if (this.activeMiniPortfolioCardIndex === cardIndex) {
          card.activeMediaIndex = (card.activeMediaIndex + 1) % Math.max(1, card.mediaItems.length);
          this.redrawMiniPortfolioCard(card, true, this.hoveredMiniPortfolioCardIndex === cardIndex);
        } else {
          this.activeMiniPortfolioCardIndex = cardIndex;
          this.refreshMiniPortfolioCardVisuals();
        }
      }
      return;
    }
    if (panelIndex >= MINI_PORTFOLIO_TAB_INDEX_BASE) {
      const tabIndex = panelIndex - MINI_PORTFOLIO_TAB_INDEX_BASE;
      if (tabIndex >= 0 && tabIndex < this.miniPortfolioTabs.length) {
        this.activeMiniPortfolioTabIndex = tabIndex;
        this.activeMiniPortfolioCardIndex = null;
        this.rebuildMiniPortfolioCards();
      }
      return;
    }
    if (!this.active || !this.panelsDocked) return;
    if (panelIndex < 0 || panelIndex >= this.panels.length) return;
    this.activePanelIndex = this.activePanelIndex === panelIndex ? null : panelIndex;
  }

  setHoveredPanelIndex(panelIndex: number | null): void {
    if (panelIndex === MINI_PORTFOLIO_NAV_PREV_INDEX || panelIndex === MINI_PORTFOLIO_NAV_NEXT_INDEX) {
      this.hoveredNarrativePanel = false;
      this.hoveredMiniPortfolioNav = panelIndex === MINI_PORTFOLIO_NAV_PREV_INDEX ? "prev" : "next";
      this.refreshMiniPortfolioNavVisuals();
      return;
    }
    if (this.hoveredMiniPortfolioNav) {
      this.hoveredMiniPortfolioNav = null;
      this.refreshMiniPortfolioNavVisuals();
    }
    if (panelIndex === MINI_PORTFOLIO_DETAIL_INDEX) {
      this.hoveredNarrativePanel = false;
      this.hoveredMiniPortfolioDetail = true;
      this.refreshMiniPortfolioDetailVisual();
      return;
    }
    if (this.hoveredMiniPortfolioDetail) {
      this.hoveredMiniPortfolioDetail = false;
      this.refreshMiniPortfolioDetailVisual();
    }
    if (panelIndex === MINI_PORTFOLIO_PREVIEW_INDEX) {
      this.hoveredNarrativePanel = false;
      this.hoveredMiniPortfolioPreview = true;
      this.refreshMiniPortfolioPreviewVisual();
      return;
    }
    if (this.hoveredMiniPortfolioPreview) {
      this.hoveredMiniPortfolioPreview = false;
      this.refreshMiniPortfolioPreviewVisual();
    }
    if (panelIndex !== null && panelIndex >= MINI_PORTFOLIO_CARD_INDEX_BASE) {
      this.hoveredNarrativePanel = false;
      const cardIdx = panelIndex - MINI_PORTFOLIO_CARD_INDEX_BASE;
      this.hoveredMiniPortfolioCardIndex =
        cardIdx >= 0 && cardIdx < this.miniPortfolioCards.length ? cardIdx : null;
      this.refreshMiniPortfolioCardVisuals();
      return;
    }
    if (this.hoveredMiniPortfolioCardIndex !== null) {
      this.hoveredMiniPortfolioCardIndex = null;
      this.refreshMiniPortfolioCardVisuals();
    }
    const oldHover = this.hoveredTechBadgeIndex;
    this.hoveredNarrativePanel = panelIndex === 0;
    if (panelIndex !== null && panelIndex >= TECH_BADGE_HOVER_INDEX_BASE) {
      const badgeIdx = panelIndex - TECH_BADGE_HOVER_INDEX_BASE;
      if (badgeIdx >= 0 && badgeIdx < this.techBadges.length) {
        this.hoveredTechBadgeIndex = badgeIdx;
        if (oldHover !== badgeIdx) {
          const badge = this.techBadges[badgeIdx];
          const nowMs = performance.now();
          if (nowMs - badge.lastSpinAtMs >= TECH_BADGE_HOVER_SPIN_COOLDOWN_MS) {
            badge.hoverSpinActive = true;
            badge.hoverSpinProgress = 0;
            badge.hoverSpinAngle = 0;
            badge.lastSpinAtMs = nowMs;
          }
          if (this.lockedTechBadgeIndex === null) {
            this.applySearHighlight(badge.techEntry.highlightMatches, "preview");
          }
        }
        return;
      }
    }
    this.hoveredTechBadgeIndex = null;
    if (oldHover !== null && this.lockedTechBadgeIndex === null) {
      this.clearSearHighlight();
    }
  }

  handleTechBadgeClick(panelIndex: number): void {
    if (panelIndex < TECH_BADGE_HOVER_INDEX_BASE) return;
    const badgeIdx = panelIndex - TECH_BADGE_HOVER_INDEX_BASE;
    if (badgeIdx < 0 || badgeIdx >= this.techBadges.length) return;

    if (this.lockedTechBadgeIndex === badgeIdx) {
      this.clearSearHighlight();
      return;
    }
    this.lockedTechBadgeIndex = badgeIdx;
    const badge = this.techBadges[badgeIdx];
    this.applySearHighlight(badge.techEntry.highlightMatches, "locked");
  }

  clearLockedSear(): void {
    if (this.lockedTechBadgeIndex !== null) {
      this.clearSearHighlight();
    }
  }

  isTechBadgeIndex(panelIndex: number): boolean {
    return (
      panelIndex >= TECH_BADGE_HOVER_INDEX_BASE &&
      panelIndex < MINI_PORTFOLIO_TAB_INDEX_BASE
    );
  }

  handleScroll(deltaY: number): boolean {
    let consumed = false;
    const activePanel = this.panels[0];
    if (this.hoveredNarrativePanel && activePanel && activePanel.maxScroll > 0) {
      const prev = activePanel.scrollOffset;
      const next = THREE.MathUtils.clamp(prev + deltaY * 0.55, 0, activePanel.maxScroll);
      if (Math.abs(next - prev) > 0.01) {
        activePanel.scrollOffset = next;
        this.redrawPanel(activePanel, false);
        consumed = true;
      }
    }
    if (this.hoveredMiniPortfolioDetail && this.miniPortfolioDetail && this.miniPortfolioDetail.maxScroll > 0) {
      const prev = this.miniPortfolioDetail.scrollOffset;
      const next = THREE.MathUtils.clamp(prev + deltaY * 0.55, 0, this.miniPortfolioDetail.maxScroll);
      if (Math.abs(next - prev) > 0.01) {
        this.miniPortfolioDetail.scrollOffset = next;
        this.refreshMiniPortfolioDetailVisual();
        consumed = true;
      }
    }
    return consumed;
  }

  private _droneUpdateCount = 0;
  update(delta: number, camera: THREE.Camera): void {
    if (!this.active) return;
    const _uStart = performance.now();
    this._droneUpdateCount++;
    // Large first-frame delta after a main-thread hitch can skip animation phases.
    // Clamp simulation step so fly-in/scan timing remains visible and stable.
    const dt = Math.min(delta, 0.05);
    this.ensureDroneAudio(camera);
    if (!this.droneGroup.visible) this.stopAllDroneAudio();

    if (this.hiding) {
      this.hideProgress += dt / 0.6;
      const s = Math.max(0, 1 - this.hideProgress);
      for (const panel of this.panels) panel.material.opacity = panel.targetOpacity * s;
      this.droneGroup.scale.setScalar(s);
      this.scannerLight.intensity = 2 * s;
      this.stopAllDroneAudio();
      this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0.7 * s));
      if (this.hideProgress >= 1) {
        this.active = false;
        this.rootGroup.visible = false;
        this.panelGroup.visible = false;
        this.clearPanels();
        this.clearIntroCard();
      }
      this.scannerLight.position.copy(this.rootGroup.position);
      return;
    }

    if (this.flyInProgress < 1) {
      this.flyInProgress = Math.min(1, this.flyInProgress + dt / FLY_IN_DURATION);
      const t = 1 - Math.pow(1 - this.flyInProgress, 3);
      this.rootGroup.position.lerpVectors(this.flyStartPos, this.flyEndPos, t);
      this.droneGroup.scale.setScalar(t);
      for (const panel of this.panels) panel.material.opacity = 0;
      this.scannerLight.intensity = 0;
      this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0));
      if (this.flyInProgress >= 1) this.tryPlayActivationWithRetry();
      this.scannerLight.position.copy(this.rootGroup.position);
      return;
    }

    this.tryPlayActivationWithRetry();

    this.idleTime += dt;
    this.drawSequenceElapsed += dt;
    this.drawEnabled = this.drawSequenceElapsed >= this.preDrawScanTotalDuration();
    if (this.drawEnabled && !this.droneExitingAfterDraw) {
      this.contentStartTime += dt;
    }

    const hoverScale = this.isOrbitMode ? 0.015 : 1.0;
    const hoverY = Math.sin(this.idleTime * 1.8) * 0.15 * hoverScale;
    const hoverX = Math.sin(this.idleTime * 1.1 + 1) * 0.05 * hoverScale;
    this.rootGroup.position.copy(this.flyEndPos);
    this.rootGroup.position.y += hoverY;
    this.rootGroup.position.x += hoverX;
    this.scannerLight.position.copy(this.rootGroup.position);

    const ring = this.droneGroup.getObjectByName("droneRing");
    if (ring) ring.rotation.z += dt * 2.5;

    const lookTarget = this._tmpV.copy(camera.position);
    lookTarget.y = this.rootGroup.position.y;
    this.droneGroup.lookAt(lookTarget);

    let scanAngles: ScanAngles = { pitch: 0, yaw: 0, roll: 0 };
    if (this.inspectionMode || this.postDrawLingerActive) {
      scanAngles = this.updatePostDrawScan(dt);
    } else if (!this.drawEnabled) {
      scanAngles = this.getPreDrawScanAngles(this.drawSequenceElapsed);
      const stepIndex = this.getPreDrawScanStepIndex(this.drawSequenceElapsed);
      if (
        this.preDrawScanPhase === "turning" &&
        stepIndex >= 0 &&
        stepIndex !== this.preDrawLastStepIndex
      ) {
        this.preDrawLastStepIndex = stepIndex;
        this.playMovementSound();
      }
    } else if (this.preDrawScanTargets.length > 0) {
      scanAngles = this.preDrawScanTargets[this.preDrawScanTargets.length - 1];
    }
    this._tmpQ.setFromEuler(
      new THREE.Euler(scanAngles.pitch, scanAngles.yaw, scanAngles.roll, "YXZ"),
    );
    this.droneGroup.quaternion.multiply(this._tmpQ);

    if (this.inspectionMode) {
      this.scannerLight.intensity = 0.9 + Math.sin(this.idleTime * 2.6) * 0.2;
      this.updateThrusterGlow(dt);
      return;
    }

    if (!this.dockingPanels && !this.panelsDocked) {
      for (const panel of this.panels) {
        panel.mesh.position.copy(this.rootGroup.position).add(panel.drawOffset);
      }
    }

    const laserTargets: Array<{ panelIndex: number; target: THREE.Vector3 }> = [];
    let anyDrawing = false;
    const guideDuration = this.guideLines.length * GUIDE_LINE_DRAW_DURATION;
    const guideProgress = guideDuration > 0 ? Math.min(1, this.contentStartTime / guideDuration) : 1;
    const guideLaserTarget = this.updateGuideLines(camera, guideProgress);
    if (guideLaserTarget) {
      anyDrawing = true;
      laserTargets.push({ panelIndex: 0, target: guideLaserTarget });
    }
    if (this.drawEnabled && !this.drawFinished) {
      for (let i = 0; i < this.panels.length; i += 1) {
        const panel = this.panels[i];
        const elapsed = this.contentStartTime - guideDuration - panel.revealTime;
        if (elapsed < 0) {
          panel.material.opacity = 0;
          continue;
        }

        if (!panel.borderComplete) {
          anyDrawing = true;
          panel.borderProgress = Math.min(1, elapsed / BORDER_DRAW_DURATION);
          this.redrawPanel(panel);
          panel.material.opacity = panel.targetOpacity;
          if (panel.borderProgress >= 1) panel.borderComplete = true;
          if (this.contentStartTime >= LASER_STAGGER * i) {
            laserTargets.push({ panelIndex: i, target: this.getPenWorldPos(panel) });
          }
          continue;
        }

        const fadeElapsed = elapsed - BORDER_DRAW_DURATION;
        if (panel.contentFade < 1) {
          anyDrawing = true;
          const nextFade = Math.min(1, fadeElapsed / CONTENT_FADE_DURATION);
          panel.contentFade = nextFade;
          this.redrawPanel(panel, nextFade < 1);
          if (this.contentStartTime >= LASER_STAGGER * i) {
            laserTargets.push({ panelIndex: i, target: panel.mesh.position.clone() });
          }
        }

        panel.material.opacity = panel.targetOpacity;
      }
    } else if (!this.drawEnabled) {
      for (const panel of this.panels) panel.material.opacity = 0;
    }

    const allPanelsRendered =
      this.drawEnabled &&
      this.panels.length > 0 &&
      this.panels.every((panel) => panel.borderComplete && panel.contentFade >= 1);
    if (allPanelsRendered && !this.drawFinished) {
      // One final redraw without pen glow so no residual circular stamp remains.
      for (const panel of this.panels) this.redrawPanel(panel, false);
      this.drawFinished = true;
      this.postDrawLingerActive = true;
      this.waitingPostDrawHold = true;
      this.postDrawHoldElapsed = 0;
      if (this.shouldDockPanels) {
        this.dockingPanels = true;
        this.panelDockProgress = 0;
        for (const panel of this.panels) {
          panel.drawOriginWorld.copy(panel.mesh.position);
        }
      }
    }

    if (laserTargets.length > 0) {
      const targetWorld = laserTargets[0].target;
      const droneWorldForTrack = this._tmpV2.copy(this.droneGroup.position);
      this.rootGroup.localToWorld(droneWorldForTrack);
      this._tmpM.lookAt(droneWorldForTrack, targetWorld, new THREE.Vector3(0, 1, 0));
      const desiredWorldQ = this._tmpQ2.setFromRotationMatrix(this._tmpM);
      // Model-forward correction: during engraving, rotate so the drone "face"
      // (X/light/001 side) points at the writing target instead of its back.
      this._tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), DRONE_FACE_TRACK_YAW_OFFSET);
      desiredWorldQ.multiply(this._tmpQ);
      // Use a stronger world-space slerp so the face reliably points to text.
      const currentWorldQ = this.droneGroup.getWorldQuaternion(this._tmpQ);
      currentWorldQ.slerp(desiredWorldQ, 0.24);
      const parentWorldQ = this.rootGroup.getWorldQuaternion(this._tmpQ2);
      const localQ = parentWorldQ.invert().multiply(currentWorldQ);
      this.droneGroup.quaternion.copy(localQ);
    }

    const droneWorld = this._tmpV.copy(this.droneGroup.position);
    this.rootGroup.localToWorld(droneWorld);
    droneWorld.y -= 0.35;
    const startLocal = this.rootGroup.worldToLocal(droneWorld.clone());
    const pulse = 0.5 + Math.sin(this.idleTime * 4) * 0.15;

    this.ensureLaserRigCount(Math.max(1, this.panels.length));
    if (laserTargets.length > 0 && anyDrawing) {
      this.playTransmissionSound();
      for (let i = 0; i < this.laserRigs.length; i += 1) {
        const rig = this.laserRigs[i];
        const entry = laserTargets.find((item) => item.panelIndex === i);
        if (!entry) {
          // Turn a panel's laser off immediately once that panel is done writing.
          this.setLaserRigOpacity(rig, 0);
          continue;
        }
        const endLocal = this.rootGroup.worldToLocal(entry.target.clone());
        this.updateLaserRig(rig, startLocal, endLocal, camera, pulse);
      }
      this.scannerLight.intensity = 1.5 + Math.sin(this.idleTime * 4) * 0.5;
    } else {
      if (this.transmissionAudio?.isPlaying) this.transmissionAudio.stop();
      this.laserRigs.forEach((rig) => this.dimLaserRig(rig, dt));
      this.scannerLight.intensity = Math.max(0, this.scannerLight.intensity - dt * 2);
    }

    if (this.waitingPostDrawHold && !this.droneExitingAfterDraw) {
      const techDone = this.techBadges.length === 0 ||
        this.techSequenceElapsed >= this.computeTechSequenceTotalDuration();
      this.postDrawHoldElapsed += dt;
      if (this.postDrawHoldElapsed >= POST_DRAW_HOLD_DURATION && techDone) {
        this.waitingPostDrawHold = false;
        if (AUTO_EXIT_AFTER_DRAW && !this.introMode) {
          this.droneExitingAfterDraw = true;
          this.droneExitProgress = 0;
        }
      }
    }

    if (this.droneExitingAfterDraw) {
      this.droneExitProgress = Math.min(
        1,
        this.droneExitProgress + dt / POST_DRAW_DRONE_EXIT_DURATION,
      );
      const eased = 1 - Math.pow(1 - this.droneExitProgress, 3);
      const fade = 1 - eased;
      this.droneGroup.position.set(eased * 2.2, eased * 2.5, -eased * 3.2);
      this.droneGroup.scale.setScalar(Math.max(0, 1 - eased * 1.2));
      this.scannerLight.intensity *= fade;
      this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, rig.lineMat.opacity * fade));
      if (this.droneExitProgress >= 1) {
        this.droneExitingAfterDraw = false;
        this.postDrawLingerActive = false;
        this.droneGroup.visible = false;
        this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0));
      }
    }

    if (this.drawFinished && this.techBadges.length > 0) {
      this.updateTechBadges(dt, camera);
    }
    if (this.drawFinished && this.introMode && this.panels.length > 0) {
      // Keep intro CTA animation alive after draw completes.
      this.redrawPanel(this.panels[0], false);
    }
    if (this.drawFinished) {
      this.updateMiniPortfolioLayout(camera, dt);
    }

    this.updateThrusterGlow(dt);

    const dockDepth = Math.max(12, camera.position.distanceTo(this.flyEndPos) * 0.52);
    if (this.shouldDockPanels && this.dockingPanels) {
      this.panelDockProgress = Math.min(1, this.panelDockProgress + dt / PANELS_DOCK_DURATION);
      const t = 1 - Math.pow(1 - this.panelDockProgress, 3);
      for (let i = 0; i < this.panels.length; i += 1) {
        const panel = this.panels[i];
        const dockTarget = this.getDockTarget(i, camera, dockDepth);
        panel.mesh.position.lerpVectors(panel.drawOriginWorld, dockTarget, t);
        panel.mesh.scale.setScalar(1 + (panel.dockScale - 1) * t);
      }
      if (this.panelDockProgress >= 1) {
        this.dockingPanels = false;
        this.panelsDocked = true;
        // Auto-focus the first docked card so it behaves like an initial click.
        if (this.activePanelIndex === null && this.panels.length > 0) {
          this.activePanelIndex = 0;
        }
      }
    } else if (this.shouldDockPanels && this.panelsDocked) {
      for (let i = 0; i < this.panels.length; i += 1) {
        const panel = this.panels[i];
        const isActive = this.activePanelIndex === i;
        const targetPos = isActive
          ? this.getFocusTarget(camera, dockDepth)
          : this.getDockTarget(i, camera, dockDepth);
        const targetScale = isActive ? panel.expandedScale : panel.dockScale;
        const posLerp = 1 - Math.exp(-dt * 14);
        const scaleLerp = 1 - Math.exp(-dt * 16);
        panel.mesh.position.lerp(targetPos, posLerp);
        const nextScale =
          panel.mesh.scale.x + (targetScale - panel.mesh.scale.x) * scaleLerp;
        panel.mesh.scale.setScalar(nextScale);
        panel.mesh.renderOrder = isActive ? 1400 : 1000 + i;
      }
    }

    for (const panel of this.panels) {
      panel.mesh.quaternion.copy(camera.quaternion);
      const guideDuration = this.guideLines.length * GUIDE_LINE_DRAW_DURATION;
      panel.material.opacity =
        this.drawEnabled && this.contentStartTime >= guideDuration
          ? panel.targetOpacity
          : 0;
    }

    const _uMs = performance.now() - _uStart;
    if (_uMs > 10) {
      console.warn(`[PERF:drone] update #${this._droneUpdateCount} took ${_uMs.toFixed(1)}ms`);
    }
  }

  private ndcToWorld(
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
    depth: number,
  ): THREE.Vector3 {
    const projected = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
    const dir = projected.sub(camera.position).normalize();
    return camera.position.clone().addScaledVector(dir, depth);
  }

  private clearGuideLines(): void {
    for (const guide of this.guideLines) {
      guide.material.dispose();
      guide.line.geometry.dispose();
      this.panelGroup.remove(guide.line);
    }
    this.guideLines = [];
  }

  private buildGuideLines(): void {
    this.clearGuideLines();
    for (const xFraction of GUIDE_LINE_X_FRACTIONS) {
      const mat = new THREE.LineBasicMaterial({
        color: 0x2a9968,
        transparent: true,
        opacity: 0.72,
        depthTest: false,
        depthWrite: false,
      });
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]);
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 6000;
      line.frustumCulled = false;
      this.panelGroup.add(line);
      this.guideLines.push({ xFraction, line, material: mat });
    }
  }

  private updateGuideLines(camera: THREE.Camera, progress: number): THREE.Vector3 | null {
    if (this.guideLines.length === 0) return null;
    const depth = Math.max(11, camera.position.distanceTo(this.flyEndPos) * 0.52);
    const topNdc = 0.82;
    const bottomNdc = -0.9;
    const stagedProgress = progress * this.guideLines.length;
    let activeTarget: THREE.Vector3 | null = null;
    for (let i = 0; i < this.guideLines.length; i += 1) {
      const localProgress = THREE.MathUtils.clamp(stagedProgress - i, 0, 1);
      const ndcX = THREE.MathUtils.clamp(this.guideLines[i].xFraction, 0, 1) * 2 - 1;
      const start = this.ndcToWorldOnViewPlane(ndcX, topNdc, camera, depth);
      const fullEnd = this.ndcToWorldOnViewPlane(ndcX, bottomNdc, camera, depth);
      const end = start.clone().lerp(fullEnd, localProgress);
      const pos = this.guideLines[i].line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, start.x, start.y, start.z);
      pos.setXYZ(1, end.x, end.y, end.z);
      pos.needsUpdate = true;
      this.guideLines[i].line.visible = localProgress > 0.001 && this.drawEnabled;
      if (localProgress > 0 && localProgress < 1) {
        activeTarget = end;
      }
    }
    return activeTarget;
  }

  // Maps NDC onto a camera-facing plane at fixed depth.
  // This keeps alignment stable across Y positions in perspective mode.
  private ndcToWorldOnViewPlane(
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
    depth: number,
  ): THREE.Vector3 {
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera;
      const halfH = depth * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const halfW = halfH * cam.aspect;
      const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, forward).normalize();
      const center = camera.position.clone().addScaledVector(forward, depth);
      return center
        .addScaledVector(right, ndcX * halfW)
        .addScaledVector(up, ndcY * halfH);
    }
    return this.ndcToWorld(ndcX, ndcY, camera, depth);
  }

  private getDockTarget(index: number, camera: THREE.Camera, depth: number): THREE.Vector3 {
    // Card-deck cascade: top-left anchor, each next card shifts down-right.
    const ndcX = -0.8 + index * 0.065 + CARD_CONTAINER_SHIFT_NDC_X;
    const ndcY = 0.62 - index * 0.08;
    return this.ndcToWorld(ndcX, ndcY, camera, depth);
  }

  private getFocusTarget(camera: THREE.Camera, depth: number): THREE.Vector3 {
    return this.ndcToWorld(-0.55 + CARD_CONTAINER_SHIFT_NDC_X, -0.08, camera, depth);
  }

  private redrawPanel(panel: TextPanel, showPenGlow: boolean = true): void {
    const { displayCtx: ctx, canvasW, canvasH, contentCanvas, isHeader } = panel;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = isHeader ? HEADER_BG : SECTION_BG;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = "rgba(79, 255, 176, 0.015)";
    for (let y = 0; y < canvasH; y += 4) ctx.fillRect(0, y, canvasW, 2);
    const pen = this.drawBorderTrace(
      ctx,
      panel.borderProgress,
      canvasW,
      canvasH,
      showPenGlow,
    );
    panel.penX = pen.x;
    panel.penY = pen.y;
    if (panel.borderComplete && panel.contentFade > 0) {
      const panelIdx = this.panels.indexOf(panel);
      if (panelIdx >= 0 && this.searMode !== "none") {
        this.renderSearOverlay(ctx, panelIdx);
      }
      ctx.globalAlpha = panel.contentFade;
      ctx.drawImage(contentCanvas, 0, -panel.scrollOffset);
      ctx.globalAlpha = 1;
      if (panelIdx >= 0) {
        this.renderIntroSeeDetailsCta(ctx, panel, panelIdx);
      }
      if (panelIdx >= 0 && this.searMode !== "none") {
        this.renderSearOverlay(ctx, panelIdx);
      }
    }
    panel.texture.needsUpdate = true;
  }

  private renderIntroSeeDetailsCta(
    ctx: CanvasRenderingContext2D,
    panel: TextPanel,
    panelIndex: number,
  ): void {
    if (!this.introMode) return;
    if (panel.mesh.userData.hologramPanelIndex !== INTRO_CARD_INDEX) return;

    const runs = this.panelTextRuns[panelIndex];
    if (!runs || runs.length === 0) return;
    const run = runs.find((r) => r.text.toUpperCase().includes("SEE DETAILS"));
    if (!run) return;

    const y = run.y - panel.scrollOffset;
    if (y + run.h < BORDER_MARGIN || y > panel.canvasH - BORDER_MARGIN) return;

    // Gentle pulse/fade that stays within the established HUD palette.
    const pulse = 0.5 + 0.5 * Math.sin(this.idleTime * 4.8);
    const boxX = Math.max(BORDER_MARGIN + 3, run.x - 26);
    const boxY = y - 2;
    const boxW = Math.min(panel.canvasW - boxX - BORDER_MARGIN - 3, run.w + 46);
    const boxH = Math.max(24, run.h - 3);

    ctx.save();
    ctx.fillStyle = `rgba(42, 153, 104, ${0.12 + pulse * 0.16})`;
    ctx.strokeStyle = `rgba(138, 176, 200, ${0.34 + pulse * 0.42})`;
    ctx.lineWidth = 1.35;
    ctx.shadowColor = "rgba(42, 153, 104, 0.65)";
    ctx.shadowBlur = 8 + pulse * 10;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.font = run.font;
    ctx.textBaseline = "top";
    ctx.globalAlpha = 0.8 + pulse * 0.2;
    ctx.fillStyle = "#d9fff0";
    ctx.shadowColor = "rgba(42, 153, 104, 0.8)";
    ctx.shadowBlur = 10 + pulse * 8;
    ctx.fillText(run.text, run.x, y);
    ctx.restore();
  }

  private drawBorderTrace(
    ctx: CanvasRenderingContext2D,
    progress: number,
    w: number,
    h: number,
    showPenGlow: boolean,
  ): { x: number; y: number } {
    const m = BORDER_MARGIN;
    const iw = w - 2 * m;
    const ih = h - 2 * m;
    const perimeter = 2 * (iw + ih);
    const len = progress * perimeter;

    ctx.save();
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(m, m);

    let penX = m;
    let penY = m;
    const topLen = Math.min(len, iw);
    penX = m + topLen;
    ctx.lineTo(penX, penY);
    if (len > iw) {
      const rightLen = Math.min(len - iw, ih);
      penY = m + rightLen;
      ctx.lineTo(penX, penY);
    }
    if (len > iw + ih) {
      const bottomLen = Math.min(len - iw - ih, iw);
      penX = m + iw - bottomLen;
      ctx.lineTo(penX, penY);
    }
    if (len > 2 * iw + ih) {
      const leftLen = Math.min(len - 2 * iw - ih, ih);
      penY = m + ih - leftLen;
      ctx.lineTo(penX, penY);
    }
    ctx.stroke();
    ctx.restore();

    if (showPenGlow) {
      const grad = ctx.createRadialGradient(penX, penY, 0, penX, penY, 16);
      grad.addColorStop(0, "rgba(42, 153, 104, 0.7)");
      grad.addColorStop(0.4, "rgba(42, 153, 104, 0.18)");
      grad.addColorStop(1, "rgba(42, 153, 104, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(penX - 16, penY - 16, 32, 32);
    }
    return { x: penX, y: penY };
  }

  private getPenWorldPos(panel: TextPanel): THREE.Vector3 {
    const lx = (panel.penX / panel.canvasW - 0.5) * panel.panelW;
    const ly = (0.5 - panel.penY / panel.canvasH) * panel.panelH;
    const local = new THREE.Vector3(lx, ly, 0);
    panel.mesh.localToWorld(local);
    return local;
  }

  private buildTextPanels(
    content: OverlayContent,
    camera: THREE.Camera,
    distScale: number = 1,
  ): void {
    void distScale;
    this.panelTextRuns = [];
    const lines: string[] = [];
    if (content.subtitle) lines.push(content.subtitle);
    if (content.description) lines.push(content.description);
    for (const section of content.sections) {
      const dateStr = section.data?.startDate
        ? `${section.data.startDate} – ${section.data.endDate || "Present"}`
        : "";
      lines.push(dateStr ? `${section.title}  [${dateStr}]` : section.title);
      const sectionLines = Array.isArray(section.content)
        ? section.content
        : section.content.split("\n\n• ").filter(Boolean);
      lines.push(...sectionLines.map((line) => line.replace(/^• /, "")));
    }
    const depth = Math.max(11, camera.position.distanceTo(this.flyEndPos) * 0.52);
    const frust = this.getCameraFrustumSizeAtDepth(camera, depth);
    const col3WidthFraction = Math.max(
      0.08,
      LAYOUT_COL3_RIGHT - LAYOUT_COL3_LEFT - LAYOUT_GAP * 2,
    );
    const col3HeightFraction = Math.max(
      0.2,
      LAYOUT_BOTTOM - LAYOUT_TOP - LAYOUT_GAP * 2,
    );
    const panelWorldWidth = col3WidthFraction * frust.w;
    const panelWorldHeight = col3HeightFraction * frust.h;
    const contentHeight = this.measureContentHeight(content.title, lines, false);
    const viewportCanvasH = this.isOrbitMode
      ? Math.min(
        NARRATIVE_VIEWPORT_CANVAS_H,
        Math.max(320, Math.round(CANVAS_W * (panelWorldHeight / Math.max(0.01, panelWorldWidth)))),
      )
      : contentHeight;
    const panelH = panelWorldHeight;
    const contentCanvas = this.createContentCanvas(
      content.title,
      lines,
      false,
      CANVAS_W,
      contentHeight,
      0,
    );
    const displayCanvas = document.createElement("canvas");
    displayCanvas.width = CANVAS_W;
    displayCanvas.height = viewportCanvasH;
    const displayCtx = displayCanvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(displayCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(panelWorldWidth, panelH),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.userData.hologramPanelIndex = 0;
    mesh.renderOrder = 1000;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const narrativeCenterX = ((LAYOUT_COL3_LEFT + LAYOUT_COL3_RIGHT) * 0.5) * 2 - 1;
    const narrativeCenterY = (1 - 2 * ((LAYOUT_TOP + LAYOUT_BOTTOM) * 0.5));
    const narrativeTarget = this.ndcToWorldOnViewPlane(
      narrativeCenterX,
      narrativeCenterY,
      camera,
      depth,
    );
    const drawOffset = narrativeTarget.clone().sub(this.flyEndPos);
    mesh.position.copy(this.flyEndPos).add(drawOffset);
    this.panelGroup.add(mesh);
    this.panels.push({
      mesh,
      material,
      texture,
      contentCanvas,
      displayCanvas,
      displayCtx,
      canvasW: CANVAS_W,
      canvasH: viewportCanvasH,
      panelW: panelWorldWidth,
      panelH,
      targetOpacity: 0.94,
      revealTime: 0,
      borderProgress: 0,
      contentFade: 0,
      borderComplete: false,
      isHeader: false,
      penX: BORDER_MARGIN,
      penY: BORDER_MARGIN,
      drawOffset,
      drawOriginWorld: mesh.position.clone(),
      dockScale: 0.28,
      expandedScale: 0.78,
      scrollOffset: 0,
      maxScroll: Math.max(0, contentHeight - viewportCanvasH),
    });
  }

  private measureContentHeight(
    title: string,
    lines: string[],
    isHeader: boolean,
  ): number {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = 10;
    const ctx = canvas.getContext("2d")!;

    const titleSize = isHeader ? 38 : 30;
    ctx.font = `bold ${titleSize}px Rajdhani, sans-serif`;
    let y = PADDING;
    const titleLines = this.wrapText(ctx, title, CANVAS_W - 2 * PADDING);
    y += titleLines.length * (titleSize + 6);
    y += 24;

    ctx.font = "22px Rajdhani, sans-serif";
    for (const line of lines) {
      const wrapped = this.wrapText(ctx, line, CANVAS_W - 2 * PADDING - 30);
      y += wrapped.length * 28 + 6;
    }

    y += PADDING;
    return Math.max(y, 80);
  }

  private createContentCanvas(
    title: string,
    lines: string[],
    isHeader: boolean,
    w: number,
    h: number,
    panelIndex: number,
  ): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    const runs: TextLayoutRun[] = [];
    const titleSize = isHeader ? 38 : 30;
    const titleFont = `bold ${titleSize}px Rajdhani, sans-serif`;
    ctx.font = titleFont;
    ctx.fillStyle = isHeader ? "#6aa8c0" : ACCENT_COLOR;
    ctx.textBaseline = "top";

    let y = PADDING;
    const titleLines = this.wrapText(ctx, title, w - 2 * PADDING);
    for (const tl of titleLines) {
      ctx.fillText(tl, PADDING, y);
      const tw = ctx.measureText(tl).width;
      runs.push({ text: tl, x: PADDING, y, w: tw, h: titleSize + 6, font: titleFont });
      y += titleSize + 6;
    }

    y += 8;
    ctx.fillStyle = ACCENT_COLOR;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(PADDING, y, w - 2 * PADDING, 2);
    ctx.globalAlpha = 1;
    y += 16;

    const bodyFont = "22px Rajdhani, sans-serif";
    ctx.font = bodyFont;
    ctx.fillStyle = TEXT_COLOR;
    for (const line of lines) {
      const wrapped = this.wrapText(ctx, line, w - 2 * PADDING - 30);
      for (const wl of wrapped) {
        if (y > h - PADDING) break;
        ctx.fillStyle = ACCENT_COLOR;
        ctx.globalAlpha = 0.6;
        ctx.fillText("▸", PADDING, y);
        ctx.globalAlpha = 1;
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText(wl, PADDING + 22, y);
        const tw = ctx.measureText(wl).width;
        runs.push({ text: wl, x: PADDING + 22, y, w: tw, h: 28, font: bodyFont });
        y += 28;
      }
      y += 6;
    }

    while (this.panelTextRuns.length <= panelIndex) this.panelTextRuns.push([]);
    this.panelTextRuns[panelIndex] = runs;
    return canvas;
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
  }

  private clearPanels(): void {
    for (const panel of this.panels) {
      panel.material.dispose();
      panel.mesh.geometry.dispose();
      panel.texture.dispose();
      this.panelGroup.remove(panel.mesh);
    }
    this.panels = [];
    this.activePanelIndex = null;
    this.panelsDocked = false;
    this.dockingPanels = false;
    this.clearTechBadges();
    this.clearMiniPortfolio();
    this.clearGuideLines();
    this.panelTextRuns = [];
    this.activeSearMatches = [];
    this.searMode = "none";
  }

  private clearMiniPortfolio(): void {
    for (const tab of this.miniPortfolioTabs) {
      tab.material.dispose();
      tab.mesh.geometry.dispose();
      tab.texture.dispose();
      this.panelGroup.remove(tab.mesh);
    }
    this.miniPortfolioTabs = [];
    for (const card of this.miniPortfolioCards) {
      card.material.dispose();
      card.mesh.geometry.dispose();
      card.texture.dispose();
      this.panelGroup.remove(card.mesh);
    }
    this.miniPortfolioCards = [];
    this.activeMiniPortfolioTabIndex = 0;
    this.activeMiniPortfolioCardIndex = null;
    this.hoveredMiniPortfolioCardIndex = null;
    this.hoveredMiniPortfolioPreview = false;
    this.hoveredMiniPortfolioDetail = false;
    this.hoveredMiniPortfolioNav = null;
    this.miniPortfolioCardPage = 0;
    if (this.miniPortfolioPreview) {
      this.miniPortfolioPreview.material.dispose();
      this.miniPortfolioPreview.mesh.geometry.dispose();
      this.miniPortfolioPreview.texture.dispose();
      this.panelGroup.remove(this.miniPortfolioPreview.mesh);
      this.miniPortfolioPreview = null;
    }
    if (this.miniPortfolioDetail) {
      this.miniPortfolioDetail.material.dispose();
      this.miniPortfolioDetail.mesh.geometry.dispose();
      this.miniPortfolioDetail.texture.dispose();
      this.panelGroup.remove(this.miniPortfolioDetail.mesh);
      this.miniPortfolioDetail = null;
    }
    for (const nav of this.miniPortfolioNavButtons) {
      nav.material.dispose();
      nav.mesh.geometry.dispose();
      nav.texture.dispose();
      this.panelGroup.remove(nav.mesh);
    }
    this.miniPortfolioNavButtons = [];
    this.miniPortfolioImageCache.clear();
    this.miniPortfolioImageFailures.clear();
  }

  private buildMiniPortfolio(content: OverlayContent): void {
    this.clearMiniPortfolio();
    const moonPortfolio = content.moonPortfolio;
    if (!moonPortfolio || moonPortfolio.tabs.length === 0) return;
    this.moonPortfolio = moonPortfolio;
    moonPortfolio.tabs.forEach((tab, tabIndex) => {
      const texture = new THREE.CanvasTexture(
        this.createMiniTabCanvas(tab.title, tabIndex === this.activeMiniPortfolioTabIndex),
      );
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.32), material);
      mesh.userData.hologramPanelIndex = MINI_PORTFOLIO_TAB_INDEX_BASE + tabIndex;
      mesh.renderOrder = 2200 + tabIndex;
      this.panelGroup.add(mesh);
      this.miniPortfolioTabs.push({
        id: tab.id,
        title: tab.title,
        mesh,
        material,
        texture,
      });
    });
    this.rebuildMiniPortfolioCards();
  }

  private rebuildMiniPortfolioCards(): void {
    for (const card of this.miniPortfolioCards) {
      card.material.dispose();
      card.mesh.geometry.dispose();
      card.texture.dispose();
      this.panelGroup.remove(card.mesh);
    }
    this.miniPortfolioCards = [];
    const moonPortfolio = this.moonPortfolio;
    if (!moonPortfolio) return;
    const tab = moonPortfolio.tabs[this.activeMiniPortfolioTabIndex];
    if (!tab) return;
    tab.cards.slice(0, MINI_PORTFOLIO_MAX_CARDS).forEach((cardData, cardIndex) => {
      const mediaItems = cardData.mediaItems.map((media) => ({
        id: media.id,
        title: media.title,
        description: media.description,
        textureUrl: media.textureUrl,
      }));
      const texture = new THREE.CanvasTexture(
        this.createMiniCardCanvas(cardData.title, mediaItems[0], false, false),
      );
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.42), material);
      mesh.userData.hologramPanelIndex = MINI_PORTFOLIO_CARD_INDEX_BASE + cardIndex;
      mesh.renderOrder = 2300 + cardIndex;
      this.panelGroup.add(mesh);
      this.miniPortfolioCards.push({
        id: cardData.id,
        title: cardData.title,
        description: cardData.description,
        technologies: cardData.technologies,
        mediaItems,
        activeMediaIndex: 0,
        mesh,
        material,
        texture,
      });
    });
    this.miniPortfolioCardPage = 0;
    this.activeMiniPortfolioCardIndex = this.miniPortfolioCards.length > 0 ? 0 : null;
    this.refreshMiniPortfolioTabVisuals();
    this.refreshMiniPortfolioCardVisuals();
    this.buildMiniPortfolioPreview();
    this.buildMiniPortfolioDetail();
    this.buildMiniPortfolioNavButtons();
    this.refreshMiniPortfolioNavVisuals();
    this.refreshMiniPortfolioDetailVisual();
  }

  private refreshMiniPortfolioTabVisuals(): void {
    this.miniPortfolioTabs.forEach((tab, tabIndex) => {
      const canvas = this.createMiniTabCanvas(
        tab.title,
        tabIndex === this.activeMiniPortfolioTabIndex,
      );
      tab.texture.image = canvas;
      tab.texture.needsUpdate = true;
    });
  }

  private refreshMiniPortfolioCardVisuals(): void {
    this.miniPortfolioCards.forEach((card, cardIndex) => {
      this.redrawMiniPortfolioCard(
        card,
        cardIndex === this.activeMiniPortfolioCardIndex,
        cardIndex === this.hoveredMiniPortfolioCardIndex,
      );
    });
    this.refreshMiniPortfolioPreviewVisual();
    this.refreshMiniPortfolioDetailVisual();
    this.refreshMiniPortfolioNavVisuals();
  }

  private redrawMiniPortfolioCard(
    card: MiniPortfolioCardRecord,
    isActive: boolean,
    isHovered: boolean,
  ): void {
    const media = card.mediaItems[Math.max(0, card.activeMediaIndex)] ?? null;
    const canvas = this.createMiniCardCanvas(card.title, media, isActive, isHovered);
    card.texture.image = canvas;
    card.texture.needsUpdate = true;
  }

  private createMiniTabCanvas(title: string, active: boolean): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 560;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = active ? "rgba(12, 56, 42, 0.88)" : "rgba(4, 14, 22, 0.76)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = active ? "#5df2bf" : "rgba(93, 242, 191, 0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    ctx.font = "bold 34px Rajdhani, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillStyle = active ? "#9fffe0" : "#7cb9d2";
    ctx.fillText(title, 22, canvas.height / 2 + 1);
    return canvas;
  }

  private createMiniCardCanvas(
    title: string,
    media: MiniPortfolioCardRecord["mediaItems"][number] | null,
    active: boolean,
    hovered: boolean,
  ): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 440;
    const ctx = canvas.getContext("2d")!;
    const bg = active ? "#081e2d" : "#071725";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = hovered ? "#9cfde0" : active ? "#5df2bf" : "rgba(93, 242, 191, 0.5)";
    ctx.lineWidth = hovered ? 3 : 2;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

    ctx.fillStyle = "#0e2e3f";
    ctx.fillRect(18, 18, canvas.width - 36, 260);
    ctx.strokeStyle = "rgba(93, 242, 191, 0.45)";
    ctx.strokeRect(18, 18, canvas.width - 36, 260);

    if (media?.textureUrl) {
      const cached = this.miniPortfolioImageCache.get(media.textureUrl);
      const imageReady = !!cached &&
        cached.complete &&
        cached.naturalWidth > 0 &&
        cached.naturalHeight > 0;
      if (imageReady) {
        const targetX = 22;
        const targetY = 22;
        const targetW = canvas.width - 44;
        const targetH = 252;
        const imageAspect = Math.max(0.0001, cached.width / Math.max(1, cached.height));
        const targetAspect = targetW / targetH;
        let srcW = cached.width;
        let srcH = cached.height;
        let srcX = 0;
        let srcY = 0;
        if (imageAspect > targetAspect) {
          srcW = Math.floor(cached.height * targetAspect);
          srcX = Math.floor((cached.width - srcW) * 0.5);
        } else {
          srcH = Math.floor(cached.width / targetAspect);
          srcY = Math.floor((cached.height - srcH) * 0.5);
        }
        ctx.save();
        ctx.filter = "saturate(1.15) contrast(1.08)";
        ctx.drawImage(
          cached,
          srcX,
          srcY,
          srcW,
          srcH,
          targetX,
          targetY,
          targetW,
          targetH,
        );
        ctx.restore();
      } else if (this.miniPortfolioImageFailures.has(media.textureUrl)) {
        ctx.fillStyle = "#9ad9ff";
        ctx.font = "22px Rajdhani, sans-serif";
        ctx.fillText("Image unavailable", 28, 44);
      } else {
        this.requestMiniPortfolioImage(media.textureUrl);
        ctx.fillStyle = "#9ad9ff";
        ctx.font = "22px Rajdhani, sans-serif";
        ctx.fillText("Loading image...", 28, 44);
      }
    }
    ctx.fillStyle = "#97f0d4";
    ctx.font = "bold 34px Rajdhani, sans-serif";
    ctx.fillText(title, 20, 308);
    if (media?.title) {
      ctx.fillStyle = "#7cb9d2";
      ctx.font = "22px Rajdhani, sans-serif";
      ctx.fillText(media.title, 20, 342);
    }
    if (active) {
      ctx.fillStyle = "#9fffe0";
      ctx.font = "20px Rajdhani, sans-serif";
      ctx.fillText("Click card to cycle media", 20, 388);
    }
    return canvas;
  }

  private buildMiniPortfolioPreview(): void {
    if (this.miniPortfolioPreview) {
      this.miniPortfolioPreview.material.dispose();
      this.miniPortfolioPreview.mesh.geometry.dispose();
      this.miniPortfolioPreview.texture.dispose();
      this.panelGroup.remove(this.miniPortfolioPreview.mesh);
      this.miniPortfolioPreview = null;
    }
    const texture = new THREE.CanvasTexture(this.createMiniPreviewCanvas(false));
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.7), material);
    mesh.userData.hologramPanelIndex = MINI_PORTFOLIO_PREVIEW_INDEX;
    mesh.renderOrder = 2450;
    this.panelGroup.add(mesh);
    this.miniPortfolioPreview = { mesh, material, texture };
    this.refreshMiniPortfolioPreviewVisual();
  }

  private refreshMiniPortfolioPreviewVisual(): void {
    if (!this.miniPortfolioPreview) return;
    const canvas = this.createMiniPreviewCanvas(this.hoveredMiniPortfolioPreview);
    this.miniPortfolioPreview.texture.image = canvas;
    this.miniPortfolioPreview.texture.needsUpdate = true;
  }

  private buildMiniPortfolioDetail(): void {
    if (this.miniPortfolioDetail) {
      this.miniPortfolioDetail.material.dispose();
      this.miniPortfolioDetail.mesh.geometry.dispose();
      this.miniPortfolioDetail.texture.dispose();
      this.panelGroup.remove(this.miniPortfolioDetail.mesh);
    }
    const initialDetail = this.createMiniDetailCanvas(false, 0);
    const texture = new THREE.CanvasTexture(initialDetail.canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.28, 2.52), material);
    mesh.userData.hologramPanelIndex = MINI_PORTFOLIO_DETAIL_INDEX;
    mesh.renderOrder = 2442;
    this.panelGroup.add(mesh);
    this.miniPortfolioDetail = {
      mesh,
      material,
      texture,
      scrollOffset: 0,
      maxScroll: initialDetail.maxScroll,
    };
  }

  private buildMiniPortfolioNavButtons(): void {
    for (const nav of this.miniPortfolioNavButtons) {
      nav.material.dispose();
      nav.mesh.geometry.dispose();
      nav.texture.dispose();
      this.panelGroup.remove(nav.mesh);
    }
    this.miniPortfolioNavButtons = [];
    const mk = (id: "prev" | "next", panelIndex: number) => {
      const texture = new THREE.CanvasTexture(this.createMiniNavCanvas(id, false, true));
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), material);
      mesh.userData.hologramPanelIndex = panelIndex;
      mesh.renderOrder = 2443;
      this.panelGroup.add(mesh);
      this.miniPortfolioNavButtons.push({ id, mesh, material, texture });
    };
    mk("prev", MINI_PORTFOLIO_NAV_PREV_INDEX);
    mk("next", MINI_PORTFOLIO_NAV_NEXT_INDEX);
  }

  private shiftMiniPortfolioPage(direction: -1 | 1): void {
    if (this.miniPortfolioCards.length <= MINI_PORTFOLIO_VISIBLE_CARD_SLOTS) return;
    const maxPage = Math.max(
      0,
      Math.ceil(this.miniPortfolioCards.length / MINI_PORTFOLIO_VISIBLE_CARD_SLOTS) - 1,
    );
    const nextPage = THREE.MathUtils.clamp(this.miniPortfolioCardPage + direction, 0, maxPage);
    if (nextPage === this.miniPortfolioCardPage) return;
    this.miniPortfolioCardPage = nextPage;
    const start = nextPage * MINI_PORTFOLIO_VISIBLE_CARD_SLOTS;
    const end = Math.min(this.miniPortfolioCards.length, start + MINI_PORTFOLIO_VISIBLE_CARD_SLOTS);
    if (
      this.activeMiniPortfolioCardIndex === null ||
      this.activeMiniPortfolioCardIndex < start ||
      this.activeMiniPortfolioCardIndex >= end
    ) {
      this.activeMiniPortfolioCardIndex = start;
    }
    this.refreshMiniPortfolioCardVisuals();
    this.refreshMiniPortfolioNavVisuals();
    this.refreshMiniPortfolioDetailVisual();
    this.refreshMiniPortfolioPreviewVisual();
  }

  private refreshMiniPortfolioNavVisuals(): void {
    const maxPage = Math.max(
      0,
      Math.ceil(this.miniPortfolioCards.length / MINI_PORTFOLIO_VISIBLE_CARD_SLOTS) - 1,
    );
    const canPrev = this.miniPortfolioCardPage > 0;
    const canNext = this.miniPortfolioCardPage < maxPage;
    for (const nav of this.miniPortfolioNavButtons) {
      const hovered = this.hoveredMiniPortfolioNav === nav.id;
      const enabled = nav.id === "prev" ? canPrev : canNext;
      nav.texture.image = this.createMiniNavCanvas(nav.id, hovered, enabled);
      nav.texture.needsUpdate = true;
      nav.mesh.visible = this.miniPortfolioCards.length > MINI_PORTFOLIO_VISIBLE_CARD_SLOTS;
    }
  }

  private createMiniNavCanvas(
    direction: "prev" | "next",
    hovered: boolean,
    enabled: boolean,
  ): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 180;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = enabled ? "rgba(4, 14, 22, 0.84)" : "rgba(4, 14, 22, 0.42)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = enabled
      ? hovered ? "#b4ffe8" : "#5df2bf"
      : "rgba(93, 242, 191, 0.26)";
    ctx.lineWidth = hovered ? 4 : 3;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    ctx.fillStyle = enabled ? "#97f0d4" : "rgba(151, 240, 212, 0.38)";
    ctx.font = "bold 82px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(direction === "prev" ? "‹" : "›", canvas.width / 2, canvas.height / 2 + 3);
    return canvas;
  }

  private refreshMiniPortfolioDetailVisual(): void {
    if (!this.miniPortfolioDetail) return;
    const detail = this.createMiniDetailCanvas(
      this.hoveredMiniPortfolioDetail,
      this.miniPortfolioDetail.scrollOffset,
    );
    this.miniPortfolioDetail.maxScroll = detail.maxScroll;
    this.miniPortfolioDetail.scrollOffset = THREE.MathUtils.clamp(
      this.miniPortfolioDetail.scrollOffset,
      0,
      this.miniPortfolioDetail.maxScroll,
    );
    this.miniPortfolioDetail.texture.image = detail.canvas;
    this.miniPortfolioDetail.texture.needsUpdate = true;
  }

  private createMiniDetailCanvas(
    hovered: boolean,
    scrollOffset: number,
  ): { canvas: HTMLCanvasElement; maxScroll: number } {
    const viewportW = 780;
    const viewportH = 600;
    const contentCanvas = document.createElement("canvas");
    contentCanvas.width = viewportW;
    contentCanvas.height = 2200;
    const contentCtx = contentCanvas.getContext("2d")!;
    const card =
      this.activeMiniPortfolioCardIndex !== null
        ? this.miniPortfolioCards[this.activeMiniPortfolioCardIndex] ?? null
        : null;
    const media = card?.mediaItems[Math.max(0, card.activeMediaIndex)] ?? null;
    contentCtx.fillStyle = "#071725";
    contentCtx.fillRect(0, 0, viewportW, contentCanvas.height);
    contentCtx.strokeStyle = hovered ? "#b4ffe8" : "#5df2bf";
    contentCtx.lineWidth = 3;
    contentCtx.strokeRect(5, 5, viewportW - 10, contentCanvas.height - 10);
    let y = 24;
    contentCtx.fillStyle = "#9fffe0";
    contentCtx.font = "bold 44px Rajdhani, sans-serif";
    contentCtx.fillText(card?.title ?? "Select a portfolio item", 24, y);
    y += 54;
    if (media?.title) {
      contentCtx.fillStyle = "#7cb9d2";
      contentCtx.font = "30px Rajdhani, sans-serif";
      contentCtx.fillText(media.title, 24, y);
      y += 42;
    }
    const body = (media?.description || card?.description || "No portfolio notes yet.").trim();
    contentCtx.fillStyle = "#8ab0c8";
    contentCtx.font = "28px Rajdhani, sans-serif";
    for (const line of this.wrapText(contentCtx, body, viewportW - 56)) {
      contentCtx.fillText(line, 24, y);
      y += 34;
    }
    y += 16;
    if (card?.technologies?.length) {
      contentCtx.fillStyle = "#97f0d4";
      contentCtx.font = "bold 30px Rajdhani, sans-serif";
      contentCtx.fillText("Tech Stack", 24, y);
      y += 36;
      contentCtx.fillStyle = "#8ab0c8";
      contentCtx.font = "26px Rajdhani, sans-serif";
      for (const tech of card.technologies) {
        contentCtx.fillText(`▸ ${tech}`, 24, y);
        y += 30;
      }
    }
    y += 10;
    contentCtx.fillStyle = "#b4ffe8";
    contentCtx.font = "24px Rajdhani, sans-serif";
    contentCtx.fillText("Use wheel while hovering here to scroll details", 24, y);
    const finalH = Math.min(contentCanvas.height, Math.max(viewportH, y + 28));
    const display = document.createElement("canvas");
    display.width = viewportW;
    display.height = viewportH;
    const displayCtx = display.getContext("2d")!;
    displayCtx.fillStyle = "#071725";
    displayCtx.fillRect(0, 0, viewportW, viewportH);
    const maxScroll = Math.max(0, finalH - viewportH);
    const yOffset = THREE.MathUtils.clamp(scrollOffset, 0, maxScroll);
    displayCtx.drawImage(contentCanvas, 0, -yOffset);
    return { canvas: display, maxScroll };
  }

  private createMiniPreviewCanvas(hovered: boolean): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 740;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#071725";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = hovered ? "#b4ffe8" : "#5df2bf";
    ctx.lineWidth = hovered ? 4 : 3;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    const card =
      this.activeMiniPortfolioCardIndex !== null
        ? this.miniPortfolioCards[this.activeMiniPortfolioCardIndex] ?? null
        : null;
    const media = card?.mediaItems[Math.max(0, card.activeMediaIndex)] ?? null;
    const imageX = 24;
    const imageY = 24;
    const imageW = canvas.width - 48;
    const imageH = 550;
    ctx.fillStyle = "#0f2d3d";
    ctx.fillRect(imageX, imageY, imageW, imageH);
    if (media?.textureUrl) {
      const cached = this.miniPortfolioImageCache.get(media.textureUrl);
      const imageReady = !!cached &&
        cached.complete &&
        cached.naturalWidth > 0 &&
        cached.naturalHeight > 0;
      if (imageReady) {
        const imageAspect = Math.max(0.0001, cached.width / Math.max(1, cached.height));
        const targetAspect = imageW / imageH;
        let srcW = cached.width;
        let srcH = cached.height;
        let srcX = 0;
        let srcY = 0;
        if (imageAspect > targetAspect) {
          srcW = Math.floor(cached.height * targetAspect);
          srcX = Math.floor((cached.width - srcW) * 0.5);
        } else {
          srcH = Math.floor(cached.width / targetAspect);
          srcY = Math.floor((cached.height - srcH) * 0.5);
        }
        ctx.save();
        ctx.filter = "saturate(1.2) contrast(1.1)";
        ctx.drawImage(cached, srcX, srcY, srcW, srcH, imageX, imageY, imageW, imageH);
        ctx.restore();
      } else if (this.miniPortfolioImageFailures.has(media.textureUrl)) {
        ctx.fillStyle = "#9ad9ff";
        ctx.font = "28px Rajdhani, sans-serif";
        ctx.fillText("Image unavailable", imageX + 20, imageY + 40);
      } else {
        this.requestMiniPortfolioImage(media.textureUrl);
        ctx.fillStyle = "#9ad9ff";
        ctx.font = "28px Rajdhani, sans-serif";
        ctx.fillText("Loading preview...", imageX + 20, imageY + 40);
      }
    } else {
      ctx.fillStyle = "#9ad9ff";
      ctx.font = "28px Rajdhani, sans-serif";
      ctx.fillText("No media for this project", imageX + 20, imageY + 40);
    }
    const title = card?.title ?? "Select a project card";
    ctx.fillStyle = "#97f0d4";
    ctx.font = "bold 44px Rajdhani, sans-serif";
    ctx.fillText(title, 28, 620);
    const subtitle = media?.title ?? "";
    if (subtitle) {
      ctx.fillStyle = "#7cb9d2";
      ctx.font = "26px Rajdhani, sans-serif";
      ctx.fillText(subtitle, 28, 660);
    }
    ctx.fillStyle = "#b4ffe8";
    ctx.font = "24px Rajdhani, sans-serif";
    ctx.fillText("Click preview or selected card to cycle images", 28, 702);
    return canvas;
  }

  private requestMiniPortfolioImage(url: string): void {
    if (!url || this.miniPortfolioImageCache.has(url) || this.miniPortfolioImageFailures.has(url)) {
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        this.miniPortfolioImageCache.delete(url);
        this.miniPortfolioImageFailures.add(url);
        this.refreshMiniPortfolioCardVisuals();
        return;
      }
      this.miniPortfolioImageCache.set(url, img);
      this.refreshMiniPortfolioCardVisuals();
    };
    img.onerror = () => {
      this.miniPortfolioImageCache.delete(url);
      this.miniPortfolioImageFailures.add(url);
      this.refreshMiniPortfolioCardVisuals();
    };
    img.src = url;
    this.miniPortfolioImageCache.set(url, img);
  }

  private updateMiniPortfolioLayout(camera: THREE.Camera, dt: number): void {
    if (this.miniPortfolioTabs.length === 0 && this.miniPortfolioCards.length === 0) return;
    const depth = Math.max(11, camera.position.distanceTo(this.flyEndPos) * 0.52);
    const frust = this.getCameraFrustumSizeAtDepth(camera, depth);
    const toNdcX = (fraction: number) => fraction * 2 - 1;
    const toNdcY = (fraction: number) => 1 - fraction * 2;
    const portfolioLeft = toNdcX(LAYOUT_COL2_LEFT + LAYOUT_GAP);
    const portfolioRight = toNdcX(LAYOUT_COL2_RIGHT - LAYOUT_GAP);
    const largeTop = toNdcY(LAYOUT_LARGE_TOP + LAYOUT_GAP);
    const largeBottom = toNdcY(LAYOUT_LARGE_BOTTOM - LAYOUT_GAP);
    const thumbsLeft = toNdcX(LAYOUT_THUMBS_LEFT + LAYOUT_GAP);
    const thumbsRight = toNdcX(LAYOUT_THUMBS_RIGHT - LAYOUT_GAP);
    const descLeft = toNdcX(LAYOUT_DESC_LEFT + LAYOUT_GAP);
    const descRight = toNdcX(LAYOUT_DESC_RIGHT - LAYOUT_GAP);
    const row2Top = toNdcY(LAYOUT_ROW2_TOP + LAYOUT_GAP);
    const row2Bottom = toNdcY(LAYOUT_ROW2_BOTTOM - LAYOUT_GAP);
    const center = (a: number, b: number) => (a + b) * 0.5;
    const fitScale = (
      mesh: THREE.Mesh,
      targetNdcW: number,
      targetNdcH: number,
      uniformBoost: number = 1,
    ) => {
      const geometry = mesh.geometry as THREE.PlaneGeometry;
      const baseW = geometry.parameters.width as number;
      const baseH = geometry.parameters.height as number;
      const targetWorldW = Math.max(0.01, targetNdcW) * (frust.w * 0.5);
      const targetWorldH = Math.max(0.01, targetNdcH) * (frust.h * 0.5);
      const uniform = Math.min(targetWorldW / baseW, targetWorldH / baseH) * uniformBoost;
      mesh.scale.setScalar(Math.max(0.05, uniform));
    };

    const tabStartX = thumbsLeft;
    this.miniPortfolioTabs.forEach((tab, index) => {
      const tabNdcW = Math.min(
        0.13,
        Math.max(0.06, (thumbsRight - thumbsLeft) / Math.max(1, this.miniPortfolioTabs.length)),
      );
      const tabNdcH = Math.max(0.028, (row2Top - row2Bottom) * 0.18);
      const target = this.ndcToWorldOnViewPlane(
        tabStartX + tabNdcW * 0.5 + index * (tabNdcW + 0.008),
        row2Top - tabNdcH * 0.65,
        camera,
        depth,
      );
      tab.mesh.position.lerp(target, 1 - Math.exp(-dt * 12));
      tab.mesh.quaternion.copy(camera.quaternion);
      fitScale(tab.mesh, tabNdcW, tabNdcH);
    });
    const pageStart = this.miniPortfolioCardPage * MINI_PORTFOLIO_VISIBLE_CARD_SLOTS;
    const pageEnd = pageStart + MINI_PORTFOLIO_VISIBLE_CARD_SLOTS;
    const thumbsUsableTop = row2Top - Math.max(0.03, (row2Top - row2Bottom) * 0.22);
    const thumbsUsableBottom = row2Bottom;
    const thumbsAreaW = Math.max(0.06, thumbsRight - thumbsLeft);
    const thumbsAreaH = Math.max(0.06, thumbsUsableTop - thumbsUsableBottom);
    const slotGap = Math.min(0.012, thumbsAreaW * 0.06);
    const slotW = (thumbsAreaW - slotGap * (MINI_PORTFOLIO_VISIBLE_CARD_SLOTS - 1))
      / MINI_PORTFOLIO_VISIBLE_CARD_SLOTS;
    this.miniPortfolioCards.forEach((card, index) => {
      const inPage = index >= pageStart && index < pageEnd;
      card.mesh.visible = inPage;
      if (!inPage) return;
      const isActive = index === this.activeMiniPortfolioCardIndex;
      const slot = index - pageStart;
      const x = thumbsLeft + slotW * 0.5 + slot * (slotW + slotGap);
      const y = center(thumbsUsableTop, thumbsUsableBottom);
      const target = this.ndcToWorldOnViewPlane(x, y, camera, depth);
      card.mesh.position.lerp(target, 1 - Math.exp(-dt * 12));
      card.mesh.quaternion.copy(camera.quaternion);
      fitScale(card.mesh, slotW, thumbsAreaH, isActive ? 1.02 : 0.92);
      card.mesh.renderOrder = isActive ? 2399 : 2300 + index;
    });
    if (this.miniPortfolioPreview) {
      const previewNdcW = Math.max(0.12, portfolioRight - portfolioLeft);
      const previewNdcH = Math.max(0.14, largeTop - largeBottom);
      const previewTarget = this.ndcToWorldOnViewPlane(
        center(portfolioLeft, portfolioRight),
        center(largeTop, largeBottom),
        camera,
        depth,
      );
      this.miniPortfolioPreview.mesh.position.lerp(
        previewTarget,
        1 - Math.exp(-dt * 10),
      );
      this.miniPortfolioPreview.mesh.quaternion.copy(camera.quaternion);
      fitScale(this.miniPortfolioPreview.mesh, previewNdcW, previewNdcH, 0.98);
    }
    if (this.miniPortfolioDetail) {
      const detailNdcW = Math.max(0.08, descRight - descLeft);
      const detailNdcH = Math.max(0.08, row2Top - row2Bottom);
      const detailTarget = this.ndcToWorldOnViewPlane(
        center(descLeft, descRight),
        center(row2Top, row2Bottom),
        camera,
        depth,
      );
      this.miniPortfolioDetail.mesh.position.lerp(detailTarget, 1 - Math.exp(-dt * 12));
      this.miniPortfolioDetail.mesh.quaternion.copy(camera.quaternion);
      fitScale(this.miniPortfolioDetail.mesh, detailNdcW, detailNdcH, 0.98);
    }
    for (const nav of this.miniPortfolioNavButtons) {
      const navPad = Math.min(0.02, thumbsAreaW * 0.05);
      const navX = nav.id === "prev" ? thumbsLeft - navPad : thumbsRight + navPad;
      const navTarget = this.ndcToWorldOnViewPlane(
        navX,
        center(thumbsUsableTop, thumbsUsableBottom),
        camera,
        depth,
      );
      nav.mesh.position.lerp(navTarget, 1 - Math.exp(-dt * 14));
      nav.mesh.quaternion.copy(camera.quaternion);
      fitScale(nav.mesh, 0.022, 0.05);
    }
  }

  // ─── Tech Badges ──────────────────────────────────────────────────

  private clearTechBadges(): void {
    for (const b of this.techBadges) {
      b.material.dispose();
      b.mesh.geometry.dispose();
      b.texture.dispose();
      b.connectorMat.dispose();
      b.connector.geometry.dispose();
      this.panelGroup.remove(b.mesh);
      this.panelGroup.remove(b.connector);
    }
    this.techBadges = [];
    this.techSequenceElapsed = 0;
    this.techSequenceTotalDuration = 0;
    this.hoveredTechBadgeIndex = null;
    this.lockedTechBadgeIndex = null;
    this.rulerRevealActive = false;
    this.rulerRevealProgress = 0;
    this.clearRuler();
  }

  private clearRuler(): void {
    if (this.rulerLine) {
      this.rulerLineMat?.dispose();
      this.rulerLine.geometry.dispose();
      this.panelGroup.remove(this.rulerLine);
      this.rulerLine = null;
      this.rulerLineMat = null;
    }
    for (const n of this.rulerNotches) {
      n.geometry.dispose();
      this.panelGroup.remove(n);
    }
    for (const m of this.rulerNotchMats) m.dispose();
    this.rulerNotches = [];
    this.rulerNotchMats = [];
  }

  private buildTechBadges(content: OverlayContent): void {
    const tech = content.jobTech ?? [];
    if (tech.length === 0) return;

    const droneWorldPos = this._tmpV.copy(this.droneGroup.position);
    this.rootGroup.localToWorld(droneWorldPos);
    const startWorld = droneWorldPos.clone();

    const totalStagger = TECH_BADGE_STAGGER * (tech.length - 1) + TECH_BADGE_FLY_DURATION;
    this.techSequenceTotalDuration = Math.min(totalStagger, TECH_BADGE_TOTAL_DURATION_CAP);
    const effectiveStagger = tech.length > 1
      ? Math.min(TECH_BADGE_STAGGER, (this.techSequenceTotalDuration - TECH_BADGE_FLY_DURATION) / (tech.length - 1))
      : 0;

    for (let i = 0; i < tech.length; i++) {
      const entry = tech[i];
      const { canvas, worldWidth, worldHeight } = this.createTechBadgeCanvas(entry.label);
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(worldWidth, worldHeight),
        material,
      );
      mesh.userData.hologramPanelIndex = TECH_BADGE_HOVER_INDEX_BASE + i;
      mesh.renderOrder = 2000 + i;
      mesh.position.copy(startWorld);
      mesh.scale.setScalar(0.01);
      this.panelGroup.add(mesh);

      const connectorGeo = new THREE.BufferGeometry().setFromPoints([
        startWorld.clone(),
        startWorld.clone(),
      ]);
      const connectorMat = new THREE.LineBasicMaterial({
        color: 0x2a9968,
        transparent: true,
        opacity: 0,
      });
      const connector = new THREE.Line(connectorGeo, connectorMat);
      connector.renderOrder = 1999;
      this.panelGroup.add(connector);

      this.techBadges.push({
        mesh,
        material,
        texture,
        connector,
        connectorMat,
        revealTime: i * effectiveStagger,
        startWorld: startWorld.clone(),
        worldWidth,
        worldHeight,
        hoverSpinActive: false,
        hoverSpinProgress: 0,
        hoverSpinAngle: 0,
        lastSpinAtMs: 0,
        launched: false,
        techEntry: entry,
      });
    }
  }

  private createTechBadgeCanvas(
    label: string,
  ): { canvas: HTMLCanvasElement; worldWidth: number; worldHeight: number } {
    const canvas = document.createElement("canvas");
    const tmpCtx = canvas.getContext("2d")!;
    tmpCtx.font = `bold ${TECH_BADGE_FONT_PX}px Rajdhani, sans-serif`;
    const metrics = tmpCtx.measureText(label);
    const textW = metrics.width;

    const canvasW = Math.ceil(textW + TECH_BADGE_PAD_X * 2);
    const canvasH = Math.ceil(TECH_BADGE_FONT_PX + TECH_BADGE_PAD_Y * 2);
    canvas.width = canvasW;
    canvas.height = canvasH;

    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(4, 14, 22, 0.72)";
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.55;
    ctx.strokeRect(1, 1, canvasW - 2, canvasH - 2);
    ctx.globalAlpha = 1;

    for (let row = 0; row < canvasH; row += 4) {
      ctx.fillStyle = "rgba(42, 153, 104, 0.025)";
      ctx.fillRect(0, row, canvasW, 2);
    }

    ctx.font = `bold ${TECH_BADGE_FONT_PX}px Rajdhani, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#88dda8";
    ctx.fillText(label, TECH_BADGE_PAD_X, canvasH / 2 + 1);

    const aspect = canvasW / canvasH;
    const worldHeight = TECH_BADGE_WORLD_HEIGHT;
    let worldWidth = worldHeight * aspect;
    worldWidth = Math.max(TECH_BADGE_MIN_WORLD_WIDTH, Math.min(TECH_BADGE_MAX_WORLD_WIDTH, worldWidth));

    return { canvas, worldWidth, worldHeight };
  }

  private getCameraFrustumSizeAtDepth(camera: THREE.Camera, depth: number): { w: number; h: number } {
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera;
      const halfH = depth * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      return { w: halfH * cam.aspect * 2, h: halfH * 2 };
    }
    return { w: 20, h: 20 };
  }

  private getTechBadgeTarget(
    index: number,
    camera: THREE.Camera,
    depth: number,
  ): THREE.Vector3 {
    const frust = this.getCameraFrustumSizeAtDepth(camera, depth);
    const viewportH = Math.max(1, window.innerHeight || 1080);
    const gapNdc = (TECH_BADGE_GAP_PX / viewportH) * 2;
    let yTopNdc = TECH_BADGE_TOP_NDC;
    for (let j = 0; j < index; j++) {
      const prev = this.techBadges[j];
      yTopNdc -= prev.worldHeight / (frust.h / 2);
      yTopNdc -= gapNdc;
    }
    const badge = this.techBadges[index];
    const badgeHeightNdc = badge.worldHeight / (frust.h / 2);
    const yNdc = yTopNdc - badgeHeightNdc * 0.5;

    const badgeNdcW = badge.worldWidth / (frust.w / 2);
    const badgeRightNdc = RULER_NDC_X - RULER_NOTCH_LEN_NDC - RULER_LABEL_GAP_NDC;
    const centerX = badgeRightNdc - badgeNdcW * 0.5;

    return this.ndcToWorldOnViewPlane(centerX, yNdc, camera, depth);
  }

  private updateTechBadges(dt: number, camera: THREE.Camera): void {
    if (this.techBadges.length === 0) return;
    this.techSequenceElapsed += dt;

    const depth = Math.max(12, camera.position.distanceTo(this.flyEndPos) * 0.52);
    let allLanded = true;
    const droneWorldNow = this._tmpV.copy(this.droneGroup.position);
    this.rootGroup.localToWorld(droneWorldNow);
    for (let i = 0; i < this.techBadges.length; i++) {
      const badge = this.techBadges[i];
      const elapsed = this.techSequenceElapsed - badge.revealTime;
      if (elapsed < 0) {
        allLanded = false;
        continue;
      }

      if (!badge.launched) {
        badge.startWorld.copy(droneWorldNow);
        badge.mesh.position.copy(droneWorldNow);
        badge.launched = true;
      }

      const t = Math.min(1, elapsed / TECH_BADGE_FLY_DURATION);
      if (t < 1) allLanded = false;
      const eased = 1 - Math.pow(1 - t, 3);

      const target = this.getTechBadgeTarget(i, camera, depth);
      badge.mesh.position.lerpVectors(badge.startWorld, target, eased);
      badge.mesh.scale.setScalar(eased);
      badge.material.opacity = eased * 0.94;

      const isLocked = this.lockedTechBadgeIndex === i;
      if (isLocked) {
        badge.material.opacity = 1.0;
      }

      const positions = badge.connector.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, badge.startWorld.x, badge.startWorld.y, badge.startWorld.z);
      positions.setXYZ(1, badge.mesh.position.x, badge.mesh.position.y, badge.mesh.position.z);
      positions.needsUpdate = true;

      const pulse = 0.18 + Math.sin(this.techSequenceElapsed * TECH_BADGE_CONNECTOR_PULSE_SPEED + i * 0.6) * 0.12;
      badge.connectorMat.opacity = eased * pulse;

      badge.mesh.quaternion.copy(camera.quaternion);
      if (badge.hoverSpinActive) {
        badge.hoverSpinProgress += dt / TECH_BADGE_HOVER_SPIN_DURATION;
        if (badge.hoverSpinProgress >= 1) {
          badge.hoverSpinActive = false;
          badge.hoverSpinProgress = 0;
          badge.hoverSpinAngle = 0;
        } else {
          badge.hoverSpinAngle = badge.hoverSpinProgress * Math.PI * 2;
        }
      }
      if (badge.hoverSpinAngle !== 0) {
        this._tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), badge.hoverSpinAngle);
        badge.mesh.quaternion.multiply(this._tmpQ);
      }
    }

    if (allLanded) {
      if (!this.rulerRevealActive && this.rulerRevealProgress === 0) {
        this.rulerRevealActive = true;
      }
      if (this.rulerRevealActive) {
        this.rulerRevealProgress = Math.min(1, this.rulerRevealProgress + dt / 0.42);
        if (this.rulerRevealProgress >= 1) this.rulerRevealActive = false;
      }
      this.buildRuler(camera, depth);
    } else {
      this.clearRuler();
    }

    if (this.rulerLine && this.rulerLineMat) {
      const rulerPulse = 0.25 + Math.sin(this.techSequenceElapsed * 1.6) * 0.1;
      this.rulerLineMat.opacity = rulerPulse;
      for (const nm of this.rulerNotchMats) {
        nm.opacity = rulerPulse + 0.15;
      }
    }
  }

  private computeTechSequenceTotalDuration(): number {
    if (this.techBadges.length === 0) return 0;
    const last = this.techBadges[this.techBadges.length - 1];
    return last.revealTime + TECH_BADGE_FLY_DURATION;
  }

  private buildRuler(camera: THREE.Camera, depth: number): void {
    if (this.techBadges.length === 0) {
      this.clearRuler();
      return;
    }

    const first = this.techBadges[0];
    const last = this.techBadges[this.techBadges.length - 1];
    const frust = this.getCameraFrustumSizeAtDepth(camera, depth);
    const firstTarget = this.getTechBadgeTarget(0, camera, depth);
    const lastTarget = this.getTechBadgeTarget(this.techBadges.length - 1, camera, depth);
    const firstNdc = firstTarget.clone().project(camera);
    const lastNdc = lastTarget.clone().project(camera);
    const firstHalfNdc = (first.worldHeight / (frust.h / 2)) * 0.55;
    const lastHalfNdc = (last.worldHeight / (frust.h / 2)) * 0.55;

    const rulerTop = this.ndcToWorldOnViewPlane(
      RULER_NDC_X,
      firstNdc.y + firstHalfNdc,
      camera,
      depth,
    );
    const rulerBottom = this.ndcToWorldOnViewPlane(
      RULER_NDC_X,
      lastNdc.y - lastHalfNdc,
      camera,
      depth,
    );
    const rulerCurrentEnd = rulerTop.clone().lerp(rulerBottom, this.rulerRevealProgress);

    if (!this.rulerLine || !this.rulerLineMat) {
      this.rulerLineMat = new THREE.LineBasicMaterial({
        color: RULER_COLOR,
        transparent: true,
        opacity: 0.55,
      });
      const rulerGeo = new THREE.BufferGeometry().setFromPoints([rulerTop, rulerCurrentEnd]);
      this.rulerLine = new THREE.Line(rulerGeo, this.rulerLineMat);
      this.rulerLine.renderOrder = 1998;
      this.panelGroup.add(this.rulerLine);
    } else {
      const rulerPos = this.rulerLine.geometry.attributes.position as THREE.BufferAttribute;
      rulerPos.setXYZ(0, rulerTop.x, rulerTop.y, rulerTop.z);
      rulerPos.setXYZ(1, rulerCurrentEnd.x, rulerCurrentEnd.y, rulerCurrentEnd.z);
      rulerPos.needsUpdate = true;
    }

    if (this.rulerNotches.length !== this.techBadges.length) {
      for (const n of this.rulerNotches) {
        n.geometry.dispose();
        this.panelGroup.remove(n);
      }
      for (const m of this.rulerNotchMats) m.dispose();
      this.rulerNotches = [];
      this.rulerNotchMats = [];
      for (let i = 0; i < this.techBadges.length; i++) {
        const notchMat = new THREE.LineBasicMaterial({
          color: RULER_COLOR,
          transparent: true,
          opacity: 0.7,
        });
        const notchGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(),
        ]);
        const notch = new THREE.Line(notchGeo, notchMat);
        notch.renderOrder = 1998;
        this.panelGroup.add(notch);
        this.rulerNotches.push(notch);
        this.rulerNotchMats.push(notchMat);
      }
    }

    for (let i = 0; i < this.techBadges.length; i++) {
      const target = this.getTechBadgeTarget(i, camera, depth);
      const targetNdc = target.clone().project(camera);
      const notchT = i / Math.max(1, this.techBadges.length - 1);
      const notchStart = this.ndcToWorldOnViewPlane(
        RULER_NDC_X,
        targetNdc.y,
        camera,
        depth,
      );
      const notchEnd = this.ndcToWorldOnViewPlane(
        RULER_NDC_X - RULER_NOTCH_LEN_NDC,
        targetNdc.y,
        camera,
        depth,
      );

      const notch = this.rulerNotches[i];
      const notchPos = notch.geometry.attributes.position as THREE.BufferAttribute;
      notchPos.setXYZ(0, notchStart.x, notchStart.y, notchStart.z);
      notchPos.setXYZ(1, notchEnd.x, notchEnd.y, notchEnd.z);
      notchPos.needsUpdate = true;
      notch.visible = this.rulerRevealProgress >= notchT;
    }
  }

  // ─── Sear Highlighting ────────────────────────────────────────────

  private applySearHighlight(matches: string[], mode: "preview" | "locked"): void {
    this.activeSearMatches = matches;
    this.searMode = mode;
    for (const panel of this.panels) {
      if (panel.contentFade >= 1) this.redrawPanel(panel, false);
    }
  }

  private clearSearHighlight(): void {
    this.activeSearMatches = [];
    this.searMode = "none";
    this.lockedTechBadgeIndex = null;
    for (const panel of this.panels) {
      if (panel.contentFade >= 1) this.redrawPanel(panel, false);
    }
  }

  private renderSearOverlay(
    ctx: CanvasRenderingContext2D,
    panelIndex: number,
  ): void {
    if (this.searMode === "none" || this.activeSearMatches.length === 0) return;
    const runs = this.panelTextRuns[panelIndex];
    if (!runs) return;

    const isLocked = this.searMode === "locked";
    const textColor = isLocked ? SEAR_LOCKED_TEXT_COLOR : SEAR_PREVIEW_TEXT_COLOR;
    const glowColor = isLocked ? SEAR_GLOW_COLOR_LOCKED : SEAR_GLOW_COLOR_PREVIEW;

    for (const run of runs) {
      const textLower = run.text.toLowerCase();
      for (const match of this.activeSearMatches) {
        const matchLower = match.toLowerCase();
        let startIdx = 0;
        while (true) {
          const idx = textLower.indexOf(matchLower, startIdx);
          if (idx === -1) break;
          ctx.font = run.font;
          const preW = ctx.measureText(run.text.substring(0, idx)).width;
          const matchStr = run.text.substring(idx, idx + match.length);
          const matchW = ctx.measureText(matchStr).width;
          const rx = run.x + preW;
          const ry = run.y - 2;
          const rh = run.h;

          ctx.save();
          const grad = ctx.createLinearGradient(rx, ry, rx, ry + rh);
          grad.addColorStop(0, glowColor);
          grad.addColorStop(0.3, "rgba(0,0,0,0)");
          grad.addColorStop(0.7, "rgba(0,0,0,0)");
          grad.addColorStop(1, glowColor);
          ctx.fillStyle = grad;
          ctx.fillRect(rx - 3, ry, matchW + 6, rh);

          if (isLocked) {
            ctx.shadowColor = "#ff9520";
            ctx.shadowBlur = 10;
          } else {
            ctx.shadowColor = "#f5c842";
            ctx.shadowBlur = 6;
          }
          ctx.fillStyle = textColor;
          ctx.textBaseline = "top";
          ctx.fillText(matchStr, rx, run.y);

          if (isLocked) {
            ctx.shadowBlur = 18;
            ctx.shadowColor = "rgba(255, 140, 20, 0.5)";
            ctx.globalAlpha = 0.35;
            ctx.fillText(matchStr, rx, run.y);
            ctx.globalAlpha = 1;
          }
          ctx.restore();

          startIdx = idx + match.length;
        }
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    const cleanupAudio = (audio: THREE.PositionalAudio | null) => {
      if (!audio) return;
      if (audio.isPlaying) audio.stop();
      this.droneGroup.remove(audio);
      audio.disconnect();
    };
    cleanupAudio(this.activationAudio);
    cleanupAudio(this.transmissionAudio);
    cleanupAudio(this.movementAudio);
    this.activationAudio = null;
    this.transmissionAudio = null;
    this.movementAudio = null;
    if (this.scanCueListener && this.attachedAudioCamera) {
      this.attachedAudioCamera.remove(this.scanCueListener);
      this.attachedAudioCamera = null;
    }
    this.clearTechBadges();
    this.clearPanels();
    this.ensureLaserRigCount(0);
    this.scene.remove(this.rootGroup);
    this.scene.remove(this.panelGroup);
    this.scene.remove(this.scannerLight);
    this.disposeObject3D(this.droneGroup);
  }

  isActive(): boolean {
    return this.active;
  }

  isDroneVisible(): boolean {
    return this.active && this.rootGroup.visible && this.droneGroup.visible;
  }
}
