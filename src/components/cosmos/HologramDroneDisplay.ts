import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { OverlayContent } from "../CosmicContentOverlay";
import {
  HOLO_PANEL_WIDTH,
  HOLO_SIDE_OFFSET,
  HOLO_REF_DISTANCE,
} from "./scaleConfig";

const CANVAS_W = 768;
const BASE_PANEL_WORLD_WIDTH = HOLO_PANEL_WIDTH;
const PADDING = 28;
const BORDER_MARGIN = 6;

const TEXT_COLOR = "#8ab0c8";
const ACCENT_COLOR = "#2a9968";
const HEADER_BG = "rgba(2, 4, 8, 0.82)";
const SECTION_BG = "rgba(4, 10, 22, 0.78)";

const FLY_IN_DURATION = 1.2;
const BORDER_DRAW_DURATION = 1.6;
const CONTENT_FADE_DURATION = 0.5;
const PANEL_STAGGER = 0.18;
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
  private onAudioDebug?: (message: string) => void;
  private attachedAudioCamera: THREE.Camera | null = null;
  private lastMovementCueTime = 0;
  private lastTransmissionCueTime = 0;
  private activationPlayedThisRun = false;
  private lastActivationAttemptTime = 0;

  private dockingPanels = false;
  private panelsDocked = false;
  private panelDockProgress = 0;
  private activePanelIndex: number | null = null;
  private shouldDockPanels = true;

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
    this.soundEnabled = options?.soundEnabled ?? true;
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
    this.droneGroup.add(this.scannerLight);

    this.scene.add(this.rootGroup);
    this.scene.add(this.panelGroup);
    this.cacheThrusterGlows();
    this.audioDebug(
      `init soundEnabled=${this.soundEnabled} activation=${!!this.droneAudioBuffers?.activation} transmission=${!!this.droneAudioBuffers?.transmission} movement=${this.droneAudioBuffers?.movement?.length ?? 0}`,
    );

    if (this.droneVariant === "oblivion" && !this.oblivionDroneTemplate) {
      this.requestOblivionDroneModel();
    }
  }

  setDroneVariant(
    droneVariant: DroneVisualVariant,
    oblivionDroneTemplate?: THREE.Object3D | null,
  ): void {
    this.droneVariant = droneVariant;
    if (oblivionDroneTemplate) this.oblivionDroneTemplate = oblivionDroneTemplate;
    if (this.droneVariant === "oblivion" && !this.oblivionDroneTemplate) {
      this.requestOblivionDroneModel();
    }
    this.rebuildDroneGroup();
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
    if (!this.oblivionDroneTemplate) return null;
    const group = new THREE.Group();
    group.name = "HologramDrone";

    const model = this.oblivionDroneTemplate.clone(true);
    model.name = "OblivionDroneModel";

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
    return group;
  }

  private rebuildDroneGroup(): void {
    if (this.disposed) return;
    const nextGroup = this.buildDroneForVariant();
    this.droneGroup.remove(this.scannerLight);
    this.rootGroup.remove(this.droneGroup);
    this.disposeObject3D(this.droneGroup);
    this.droneGroup = nextGroup;
    this.droneGroup.add(this.scannerLight);
    if (this.activationAudio) this.droneGroup.add(this.activationAudio);
    if (this.transmissionAudio) this.droneGroup.add(this.transmissionAudio);
    if (this.movementAudio) this.droneGroup.add(this.movementAudio);
    this.rootGroup.add(this.droneGroup);
    this.cacheThrusterGlows();
    this.previousDroneQuat = null;
  }

  private requestOblivionDroneModel(): void {
    if (this.requestedOblivionModel || this.oblivionDroneTemplate || this.disposed) return;
    this.requestedOblivionModel = true;
    const loader = new GLTFLoader();
    loader.load(
      OBLIVION_DRONE_MODEL_PATH,
      (gltf) => {
        if (this.disposed) return;
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
      audio.setVolume(volume);
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
    if (orbitAnchor) {
      distScale = 0.3;
      const camUp = camera.up.clone().normalize();
      const camRight = new THREE.Vector3()
        .crossVectors(camera.getWorldDirection(new THREE.Vector3()), camUp)
        .normalize();
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
    this.flyStartPos.copy(camera.position).addScaledVector(forward, 15).add(new THREE.Vector3(0, 8, 0));
    return distScale;
  }

  showContent(
    content: OverlayContent,
    moonWorldPos: THREE.Vector3,
    camera: THREE.Camera,
    orbitAnchor?: THREE.Vector3,
  ): void {
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
    this.dockingPanels = false;
    this.panelsDocked = false;
    this.panelDockProgress = 0;
    this.activePanelIndex = null;
    this.shouldDockPanels = content.enableDroneCardDock === true;

    this.rootGroup.visible = true;
    this.panelGroup.visible = true;
    this.droneGroup.visible = true;
    this.droneGroup.position.set(0, 0, 0);
    this.droneGroup.rotation.set(0, 0, 0);
    this.droneGroup.scale.setScalar(0);
    this.previousDroneQuat = null;
    this.smoothedTurnSpeed = 0;
    this.resetInquisitiveScanState();

    const distScale = this.prepareDronePlacement(moonWorldPos, camera, orbitAnchor);

    this.buildTextPanels(content, camera, distScale);
    this.ensureLaserRigCount(this.panels.length);
    this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0));

    this.rootGroup.position.copy(this.flyStartPos);
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
  }

  hideContent(): void {
    if (!this.active) return;
    this.hiding = true;
    this.hideProgress = 0;
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
    if (this.activationAudio?.isPlaying) this.activationAudio.stop();
    if (this.transmissionAudio?.isPlaying) this.transmissionAudio.stop();
    if (this.movementAudio?.isPlaying) this.movementAudio.stop();
    for (const rig of this.laserRigs) {
      this.setLaserRigOpacity(rig, 0);
    }
    this.clearPanels();
    this.previousDroneQuat = null;
    this.smoothedTurnSpeed = 0;
    this.activationPlayedThisRun = false;
  }

  getInteractivePanelMeshes(): THREE.Object3D[] {
    if (!this.active || !this.panelsDocked) return [];
    return this.panels.map((panel) => panel.mesh);
  }

  selectPanel(panelIndex: number): void {
    if (!this.active || !this.panelsDocked) return;
    if (panelIndex < 0 || panelIndex >= this.panels.length) return;
    this.activePanelIndex = this.activePanelIndex === panelIndex ? null : panelIndex;
  }

  update(delta: number, camera: THREE.Camera): void {
    if (!this.active) return;
    this.ensureDroneAudio(camera);

    if (this.hiding) {
      this.hideProgress += delta / 0.6;
      const s = Math.max(0, 1 - this.hideProgress);
      for (const panel of this.panels) panel.material.opacity = panel.targetOpacity * s;
      this.droneGroup.scale.setScalar(s);
      this.scannerLight.intensity = 2 * s;
      this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0.7 * s));
      if (this.hideProgress >= 1) {
        this.active = false;
        this.rootGroup.visible = false;
        this.panelGroup.visible = false;
        this.clearPanels();
      }
      return;
    }

    if (this.flyInProgress < 1) {
      this.flyInProgress = Math.min(1, this.flyInProgress + delta / FLY_IN_DURATION);
      const t = 1 - Math.pow(1 - this.flyInProgress, 3);
      this.rootGroup.position.lerpVectors(this.flyStartPos, this.flyEndPos, t);
      this.droneGroup.scale.setScalar(t);
      for (const panel of this.panels) panel.material.opacity = 0;
      this.scannerLight.intensity = 0;
      this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0));
      if (this.flyInProgress >= 1 && !this.activationPlayedThisRun) {
        const now = performance.now();
        if (now - this.lastActivationAttemptTime > 280) {
          this.lastActivationAttemptTime = now;
          this.activationPlayedThisRun = this.playActivationSound();
        }
      }
      return;
    }

    this.idleTime += delta;
    this.drawSequenceElapsed += delta;
    this.drawEnabled = this.drawSequenceElapsed >= this.preDrawScanTotalDuration();
    if (this.drawEnabled && !this.droneExitingAfterDraw) {
      this.contentStartTime += delta;
    }

    const hoverScale = this.isOrbitMode ? 0.015 : 1.0;
    const hoverY = Math.sin(this.idleTime * 1.8) * 0.15 * hoverScale;
    const hoverX = Math.sin(this.idleTime * 1.1 + 1) * 0.05 * hoverScale;
    this.rootGroup.position.copy(this.flyEndPos);
    this.rootGroup.position.y += hoverY;
    this.rootGroup.position.x += hoverX;

    const ring = this.droneGroup.getObjectByName("droneRing");
    if (ring) ring.rotation.z += delta * 2.5;

    const lookTarget = this._tmpV.copy(camera.position);
    lookTarget.y = this.rootGroup.position.y;
    this.droneGroup.lookAt(lookTarget);

    let scanAngles: ScanAngles = { pitch: 0, yaw: 0, roll: 0 };
    if (this.inspectionMode || this.postDrawLingerActive) {
      scanAngles = this.updatePostDrawScan(delta);
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
      this.updateThrusterGlow(delta);
      return;
    }

    if (!this.dockingPanels && !this.panelsDocked) {
      for (const panel of this.panels) {
        panel.mesh.position.copy(this.rootGroup.position).add(panel.drawOffset);
      }
    }

    const laserTargets: Array<{ panelIndex: number; target: THREE.Vector3 }> = [];
    let anyDrawing = false;
    if (this.drawEnabled && !this.drawFinished) {
      for (let i = 0; i < this.panels.length; i += 1) {
        const panel = this.panels[i];
        const elapsed = this.contentStartTime - panel.revealTime;
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

    this.ensureLaserRigCount(this.panels.length);
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
      this.laserRigs.forEach((rig) => this.dimLaserRig(rig, delta));
      this.scannerLight.intensity = Math.max(0, this.scannerLight.intensity - delta * 2);
    }

    if (this.waitingPostDrawHold && !this.droneExitingAfterDraw) {
      this.postDrawHoldElapsed += delta;
      if (this.postDrawHoldElapsed >= POST_DRAW_HOLD_DURATION) {
        this.waitingPostDrawHold = false;
        if (AUTO_EXIT_AFTER_DRAW) {
          this.droneExitingAfterDraw = true;
          this.droneExitProgress = 0;
        }
      }
    }

    if (this.droneExitingAfterDraw) {
      this.droneExitProgress = Math.min(
        1,
        this.droneExitProgress + delta / POST_DRAW_DRONE_EXIT_DURATION,
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

    this.updateThrusterGlow(delta);

    const dockDepth = Math.max(12, camera.position.distanceTo(this.flyEndPos) * 0.52);
    if (this.shouldDockPanels && this.dockingPanels) {
      this.panelDockProgress = Math.min(1, this.panelDockProgress + delta / PANELS_DOCK_DURATION);
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
      }
    } else if (this.shouldDockPanels && this.panelsDocked) {
      for (let i = 0; i < this.panels.length; i += 1) {
        const panel = this.panels[i];
        const isActive = this.activePanelIndex === i;
        const targetPos = isActive
          ? this.getFocusTarget(camera, dockDepth)
          : this.getDockTarget(i, camera, dockDepth);
        const targetScale = isActive ? panel.expandedScale : panel.dockScale;
        const posLerp = 1 - Math.exp(-delta * 14);
        const scaleLerp = 1 - Math.exp(-delta * 16);
        panel.mesh.position.lerp(targetPos, posLerp);
        const nextScale =
          panel.mesh.scale.x + (targetScale - panel.mesh.scale.x) * scaleLerp;
        panel.mesh.scale.setScalar(nextScale);
        panel.mesh.renderOrder = isActive ? 1400 : 1000 + i;
      }
    }

    for (const panel of this.panels) {
      panel.mesh.quaternion.copy(camera.quaternion);
      panel.material.opacity = panel.targetOpacity;
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
      ctx.globalAlpha = panel.contentFade;
      ctx.drawImage(contentCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }
    panel.texture.needsUpdate = true;
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
    const panelDataList: { title: string; lines: string[]; isHeader: boolean }[] = [];
    panelDataList.push({
      title: content.title,
      lines: [content.subtitle || "", content.description || ""].filter(Boolean),
      isHeader: true,
    });

    for (const section of content.sections) {
      const sectionLines = Array.isArray(section.content)
        ? section.content
        : section.content.split("\n\n• ").filter(Boolean);
      const cleanLines = sectionLines.map((line) => line.replace(/^• /, ""));
      const dateStr = section.data?.startDate
        ? `${section.data.startDate} – ${section.data.endDate || "Present"}`
        : "";
      panelDataList.push({
        title: dateStr ? `${section.title}  [${dateStr}]` : section.title,
        lines: cleanLines,
        isHeader: false,
      });
    }

    const panelWorldWidth = BASE_PANEL_WORLD_WIDTH * distScale;
    const droneToCamera = this._tmpV.subVectors(camera.position, this.flyEndPos).normalize();
    const panelGap = this.isOrbitMode ? 1.2 * distScale : 0.8 * distScale;

    const panelHeights: number[] = [];
    const canvasHeights: number[] = [];
    for (const data of panelDataList) {
      const canvasH = this.measureContentHeight(data.title, data.lines, data.isHeader);
      canvasHeights.push(canvasH);
      panelHeights.push(panelWorldWidth * (canvasH / CANVAS_W));
    }

    const totalHeight =
      panelHeights.reduce((sum, h) => sum + h, 0) + panelGap * (panelHeights.length - 1);
    const totalWidth =
      panelHeights.reduce((sum) => sum + panelWorldWidth, 0) +
      panelGap * (panelHeights.length - 1);

    const camUp = this.isOrbitMode
      ? camera.up.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
    const camRight = this.isOrbitMode
      ? new THREE.Vector3()
          .crossVectors(camera.getWorldDirection(new THREE.Vector3()), camUp)
          .normalize()
      : new THREE.Vector3();

    let yAccum = totalHeight * 0.2;
    let xAccum = -totalWidth / 2 - totalWidth * 0.15;

    for (let i = 0; i < panelDataList.length; i += 1) {
      const data = panelDataList[i];
      const canvasH = canvasHeights[i];
      const panelH = panelHeights[i];

      const contentCanvas = this.createContentCanvas(
        data.title,
        data.lines,
        data.isHeader,
        CANVAS_W,
        canvasH,
      );
      const displayCanvas = document.createElement("canvas");
      displayCanvas.width = CANVAS_W;
      displayCanvas.height = canvasH;
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
      mesh.userData.hologramPanelIndex = i;
      mesh.renderOrder = 1000 + i;
      const material = mesh.material as THREE.MeshBasicMaterial;
      // Keep panels behind the drone so the drone remains visually in front.
      const forwardPush = droneToCamera.clone().multiplyScalar(-2.6 * distScale);
      const drawOffset = new THREE.Vector3();
      if (this.isOrbitMode) {
        const xCenter = xAccum + panelWorldWidth / 2;
        xAccum += panelWorldWidth + panelGap;
        drawOffset.copy(forwardPush).addScaledVector(camRight, xCenter);
      } else {
        const yOff = yAccum - panelH / 2;
        yAccum -= panelH + panelGap;
        drawOffset.set(forwardPush.x, yOff, forwardPush.z);
      }

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
        panelH,
        targetOpacity: 0.94,
        revealTime: i * PANEL_STAGGER,
        borderProgress: 0,
        contentFade: 0,
        borderComplete: false,
        isHeader: data.isHeader,
        penX: BORDER_MARGIN,
        penY: BORDER_MARGIN,
        drawOffset,
        drawOriginWorld: mesh.position.clone(),
        dockScale: 0.28,
        expandedScale: 0.78,
      });
    }
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
  ): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    const titleSize = isHeader ? 38 : 30;
    ctx.font = `bold ${titleSize}px Rajdhani, sans-serif`;
    ctx.fillStyle = isHeader ? "#6aa8c0" : ACCENT_COLOR;
    ctx.textBaseline = "top";

    let y = PADDING;
    const titleLines = this.wrapText(ctx, title, w - 2 * PADDING);
    for (const tl of titleLines) {
      ctx.fillText(tl, PADDING, y);
      y += titleSize + 6;
    }

    y += 8;
    ctx.fillStyle = ACCENT_COLOR;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(PADDING, y, w - 2 * PADDING, 2);
    ctx.globalAlpha = 1;
    y += 16;

    ctx.font = "22px Rajdhani, sans-serif";
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
        y += 28;
      }
      y += 6;
    }

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
    this.clearPanels();
    this.ensureLaserRigCount(0);
    this.scene.remove(this.rootGroup);
    this.scene.remove(this.panelGroup);
    this.disposeObject3D(this.droneGroup);
  }

  isActive(): boolean {
    return this.active;
  }
}
