import * as THREE from "three";
import { ShipRimLight } from "./careerGallery/falconHeatAndRim";
import { FALCON_SCALE } from "./scaleConfig";

/**
 * Scripted Star Destroyer appearances. Nothing waits for them and they never
 * take control of the camera.
 *
 *  - Fly-over: after the Falcon arrives from the intro and the camera settles,
 *    the Destroyer travels a straight line described by a FlyoverSpec
 *    (relative to the camera at the start), crawling while its hull fills the
 *    view, then speeding away. The spec can be tuned live with the SD
 *    configurator (sdConfigurator/); "default" is derived from the constants
 *    below.
 *  - Escort: during some lightspeed trips it drops in beside the Falcon,
 *    holds formation while the jump lasts, then jumps away ahead.
 *
 * Between moments it is parked far out of view. It stays `visible` (it
 * carries point lights; changing the light count recompiles every lit
 * shader), so parking is done by position. Extra looks (engine glow sprites,
 * rim outline) are light-free.
 */

type Phase = "parked" | "flyover" | "preview" | "escort_in" | "escort_hold" | "escort_out";

export type StarDestroyerMomentsFrame = {
  camera: THREE.Camera;
  ship: THREE.Object3D | null;
  /** True while the Falcon is at lightspeed. */
  lightspeed: boolean;
};

/**
 * A fly-over path, relative to the camera when it starts: its position, its
 * horizontal forward (flattened), its horizontal right, and world up.
 */
export type FlyoverSpec = {
  /** Hull center at the start, in world units along the camera frame. */
  startRight: number;
  startUp: number;
  startForward: number;
  /** Line direction: turned left of the camera's forward, then tilted down. */
  yawLeftDeg: number;
  pitchDownDeg: number;
  /** Roll around the ship's own length. */
  bankDeg: number;
  /** Total distance travelled along the line. */
  lineLength: number;
  /** Distance covered at a steady crawl, over crawlSeconds. */
  crawlDistance: number;
  crawlSeconds: number;
  /** Then the rest of the line, speeding up smoothly, over exitSeconds. */
  exitSeconds: number;
};

export type FlyoverAnchor = {
  origin: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
};

export type FlyoverInfo = {
  hullLength: number;
  spec: FlyoverSpec;
};

/** Far below the universe and past the camera's far plane. */
const PARK_POSITION = new THREE.Vector3(0, -120_000, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** The Falcon model is fitted to 14 units before FALCON_SCALE (~0.7 long). */
const FALCON_LENGTH = 14 * FALCON_SCALE;
/**
 * True size of the Destroyer in its moments: this many Falcon lengths
 * (~8.5 units). Big next to the Falcon, a speck next to a moon (~60 across)
 * or Experience (~210). Its huge look in the fly-over comes from passing
 * close to the camera, not from scaling it up.
 */
const SD_LENGTH_FALCONS = 12;

/**
 * The built-in fly-over, tuned in the SD configurator from the recorded intro
 * view (exported preset "default").
 */
const DEFAULT_FLYOVER_SPEC: FlyoverSpec = {
  startRight: 9.906,
  startUp: 2.962,
  startForward: 4.952,
  yawLeftDeg: 48.91,
  pitchDownDeg: 4.13,
  bankDeg: 0,
  lineLength: 108.43,
  crawlDistance: 16.39,
  crawlSeconds: 26,
  exitSeconds: 16,
};

// ── Constants for the earlier formula-derived spec (reference only) ─────
/**
 * How big the hull looks: the gap between the camera and the belly (where
 * the path crosses above the camera) is chosen so the hull's width spans
 * this many screen widths at that distance.
 */
const FLYOVER_SCREEN_WIDTHS = 9;
const FLYOVER_MIN_BELLY_GAP = 0.3;
const FLYOVER_OVERHEAD_SECONDS = 26;
const FLYOVER_EXIT_SECONDS = 16;
/** Start with the nose just past the top edge of the view. */
const FLYOVER_TOP_EDGE_MARGIN = 1.04;
/** The dive reaches the center of the view this many hull lengths ahead. */
const FLYOVER_AIM_AHEAD_LENGTHS = 2.5;
const FLYOVER_END_AHEAD_LENGTHS = 12;
/** Diagonal crossing: side offsets in hull lengths at the start and at the aim point. */
const FLYOVER_START_SIDE_LENGTHS = 0.2;
const FLYOVER_AIM_SIDE_LENGTHS = 0.8;
/** Which way it cuts across the view: -1 = toward the left, 1 = toward the right. */
const FLYOVER_DIRECTION = -1;
/** Shifts the whole path down by this many hull heights. */
const FLYOVER_LOWER_HEIGHTS = 0.1;
/** Turns the heading this far left of the camera's forward (radians). */
const FLYOVER_YAW_LEFT = 0.2;
const FLYOVER_BANK = 0;

/** Escort: formation spot relative to the Falcon (its +Z is forward). */
const ESCORT_AHEAD = 10;
const ESCORT_SIDE = 6;
const ESCORT_ABOVE = 1.5;
const ESCORT_IN_SECONDS = 1.6;
const ESCORT_IN_FROM_BEHIND = 420;
const ESCORT_MAX_HOLD_SECONDS = 6;
const ESCORT_OUT_SECONDS = 0.9;
const ESCORT_OUT_DISTANCE = 3200;

/** Engine glow sprites across the rear of the hull. */
const ENGINE_GLOW_COUNT = 3;
const ENGINE_GLOW_COLOR = 0x9cc8ff;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const createGlowTexture = (): THREE.Texture | null => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(235,245,255,1)");
  grad.addColorStop(0.3, "rgba(140,190,255,0.8)");
  grad.addColorStop(1, "rgba(40,90,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/** Total seconds a spec takes. */
export const flyoverDuration = (spec: FlyoverSpec): number =>
  Math.max(0, spec.crawlSeconds) + Math.max(0, spec.exitSeconds);

/** Distance along the line at time t: steady crawl, then a smooth push to the end. */
export const flyoverDistanceAt = (spec: FlyoverSpec, t: number): number => {
  const crawl = Math.max(1e-3, spec.crawlSeconds);
  const exit = Math.max(1e-3, spec.exitSeconds);
  const speed = spec.crawlDistance / crawl;
  if (t <= crawl) return speed * Math.max(0, t);
  const tb = Math.min(t - crawl, exit);
  const remaining = spec.lineLength - spec.crawlDistance - speed * exit;
  const accel = Math.max(0, remaining) / Math.pow(exit, 3);
  return speed * (crawl + tb) + accel * tb * tb * tb;
};

/** Camera frame a spec is relative to (flattened forward, horizontal right, world up). */
export const captureFlyoverAnchor = (camera: THREE.Camera): FlyoverAnchor => {
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const forward = camera.getWorldDirection(new THREE.Vector3());
  forward.y *= 0.3;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize();
  return { origin, forward, right, up: WORLD_UP.clone() };
};

/** World-space start point (hull center at t = 0). */
export const flyoverStartPoint = (
  anchor: FlyoverAnchor,
  spec: FlyoverSpec,
  out = new THREE.Vector3(),
): THREE.Vector3 =>
  out
    .copy(anchor.origin)
    .addScaledVector(anchor.right, spec.startRight)
    .addScaledVector(anchor.up, spec.startUp)
    .addScaledVector(anchor.forward, spec.startForward);

/** World-space unit direction of travel. */
export const flyoverDirection = (
  anchor: FlyoverAnchor,
  spec: FlyoverSpec,
  out = new THREE.Vector3(),
): THREE.Vector3 => {
  const yaw = THREE.MathUtils.degToRad(spec.yawLeftDeg);
  const pitch = THREE.MathUtils.degToRad(spec.pitchDownDeg);
  out.copy(anchor.forward).applyAxisAngle(anchor.up, yaw).normalize();
  return out.multiplyScalar(Math.cos(pitch)).addScaledVector(anchor.up, -Math.sin(pitch)).normalize();
};

export class StarDestroyerMoments {
  private readonly sd: THREE.Group;
  private readonly baseScale: number;
  private readonly forwardOffset: THREE.Quaternion;
  /** Hull bounds in the Destroyer's own (unscaled group) space. */
  private readonly localSize = new THREE.Vector3(1, 1, 1);
  private readonly localMin = new THREE.Vector3();
  private readonly localCenter = new THREE.Vector3();
  private phase: Phase = "parked";
  private phaseTime = 0;

  // Running fly-over.
  private flyAnchor: FlyoverAnchor | null = null;
  private flySpec: FlyoverSpec | null = null;

  private escortAlong = 0;

  private readonly rim: ShipRimLight;
  private readonly glowTexture = createGlowTexture();
  private readonly glowMaterial: THREE.SpriteMaterial;
  private readonly glowSprites: THREE.Sprite[] = [];

  private readonly shipForward = new THREE.Vector3();
  private readonly shipUp = new THREE.Vector3();
  private readonly shipRight = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly lookMatrix = new THREE.Matrix4();
  private readonly bankQuat = new THREE.Quaternion();
  private readonly localForwardAxis = new THREE.Vector3(0, 0, 1);
  private readonly cameraPosition = new THREE.Vector3();
  private readonly localCamera = new THREE.Vector3();
  private readonly inverseWorld = new THREE.Matrix4();
  private readonly direction = new THREE.Vector3();

  constructor(sd: THREE.Group) {
    this.sd = sd;
    this.baseScale = sd.scale.x;
    this.forwardOffset =
      (sd.userData.forwardOffset as THREE.Quaternion | undefined)?.clone() ??
      new THREE.Quaternion();
    this.measureHull();

    // Outline so the dark hull reads against space (no lights involved).
    this.rim = new ShipRimLight(sd);

    // Soft blue engine glow across the rear. The pose convention (lookAt,
    // then forwardOffset) puts the nose at local +Z, so the rear is min Z.
    this.glowMaterial = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: ENGINE_GLOW_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const glowSize = this.localSize.x * 0.16;
    for (let i = 0; i < ENGINE_GLOW_COUNT; i++) {
      const sprite = new THREE.Sprite(this.glowMaterial);
      const across = i / Math.max(1, ENGINE_GLOW_COUNT - 1) - 0.5;
      sprite.position.set(
        this.localCenter.x + across * this.localSize.x * 0.32,
        this.localCenter.y + this.localSize.y * 0.05,
        this.localMin.z - this.localSize.z * 0.01,
      );
      sprite.scale.setScalar(glowSize * (i === 1 ? 1.25 : 1));
      sprite.name = "StarDestroyerEngineGlow";
      sd.add(sprite);
      this.glowSprites.push(sprite);
    }
  }

  isActive(): boolean {
    return this.phase !== "parked";
  }

  /** World length of the hull at its true size. */
  getHullLength(): number {
    return FALCON_LENGTH * SD_LENGTH_FALCONS;
  }

  park(): void {
    this.phase = "parked";
    this.phaseTime = 0;
    this.flyAnchor = null;
    this.flySpec = null;
    this.sd.position.copy(PARK_POSITION);
    this.sd.scale.setScalar(this.baseScale);
    this.setLook(0, false);
  }

  /** The built-in fly-over (tuned in the SD configurator from the intro view). */
  getDefaultFlyoverSpec(_camera?: THREE.Camera): FlyoverSpec {
    return { ...DEFAULT_FLYOVER_SPEC };
  }

  /**
   * The earlier formula-derived fly-over (kept for reference; unused): nose
   * entering at the top edge, diving toward the view's center at a slight
   * diagonal, sized to pass close enough to fill the screen.
   */
  deriveFlyoverSpecFromConstants(camera: THREE.Camera): FlyoverSpec {
    const anchor = captureFlyoverAnchor(camera);
    const forward = anchor.forward.clone().applyAxisAngle(WORLD_UP, FLYOVER_YAW_LEFT).normalize();
    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize();
    const side = FLYOVER_DIRECTION;

    const scale = this.trueScale();
    const length = this.localSize.z * scale;
    const width = this.localSize.x * scale;
    const height = this.localSize.y * scale;
    const halfHeight = height * 0.5;
    const halfLength = length * 0.5;

    const perspective = camera as THREE.PerspectiveCamera;
    const vFov = THREE.MathUtils.degToRad(perspective.isPerspectiveCamera ? perspective.fov : 45);
    const aspect = perspective.isPerspectiveCamera ? perspective.aspect : 16 / 9;
    const screenWidthPerDistance = 2 * Math.tan(vFov / 2) * aspect;
    const bellyGap = Math.max(
      FLYOVER_MIN_BELLY_GAP,
      width / (screenWidthPerDistance * FLYOVER_SCREEN_WIDTHS),
    );
    const baseHeight = halfHeight + bellyGap;
    const aimAlong = Math.max(1, length * FLYOVER_AIM_AHEAD_LENGTHS);
    const alongEnd = length * FLYOVER_END_AHEAD_LENGTHS;
    const lower = height * FLYOVER_LOWER_HEIGHTS;
    const heightAt = (along: number) => baseHeight * (1 - along / aimAlong) - lower;

    // Nose just past the top edge; always fully ahead of the camera.
    const tanHalf = Math.tan(vFov / 2) * FLYOVER_TOP_EDGE_MARGIN;
    const minStart = halfLength * 1.15;
    let alongStart = minStart;
    const step = Math.max(0.01, length * 0.02);
    for (let a = minStart; a < alongEnd; a += step) {
      const noseAlong = a + halfLength;
      if (heightAt(noseAlong) - halfHeight <= tanHalf * noseAlong) {
        alongStart = Math.max(minStart, a - step);
        break;
      }
    }

    const sideStart = -side * length * FLYOVER_START_SIDE_LENGTHS;
    const sideAim = side * length * FLYOVER_AIM_SIDE_LENGTHS;
    const sideAt = (along: number) =>
      THREE.MathUtils.lerp(sideStart, sideAim, (along - alongStart) / Math.max(1e-6, aimAlong - alongStart));
    const pointAt = (along: number) =>
      anchor.origin
        .clone()
        .addScaledVector(forward, along)
        .addScaledVector(right, sideAt(along))
        .addScaledVector(WORLD_UP, heightAt(along));

    const start = pointAt(alongStart);
    const end = pointAt(alongEnd);
    const lineLength = start.distanceTo(end);
    const direction = end.clone().sub(start).normalize();
    const relative = start.clone().sub(anchor.origin);
    const horizontal = new THREE.Vector3(direction.x, 0, direction.z).normalize();
    const yawLeft = Math.atan2(-horizontal.dot(anchor.right), horizontal.dot(anchor.forward));
    const alongToLine = lineLength / Math.max(1e-6, alongEnd - alongStart);
    const round = (value: number, digits = 3) => Number(value.toFixed(digits));

    return {
      startRight: round(relative.dot(anchor.right)),
      startUp: round(relative.y),
      startForward: round(relative.dot(anchor.forward)),
      yawLeftDeg: round(THREE.MathUtils.radToDeg(yawLeft), 2),
      pitchDownDeg: round(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(-direction.y, -1, 1))), 2),
      bankDeg: round(THREE.MathUtils.radToDeg(FLYOVER_BANK), 2),
      lineLength: round(lineLength, 2),
      crawlDistance: round(length * 1.2 * alongToLine, 2),
      crawlSeconds: FLYOVER_OVERHEAD_SECONDS,
      exitSeconds: FLYOVER_EXIT_SECONDS,
    };
  }

  /** Run a fly-over (the default for this camera unless a spec is given). */
  startFlyover(camera: THREE.Camera, spec?: FlyoverSpec): FlyoverInfo {
    const resolved = spec ?? this.getDefaultFlyoverSpec(camera);
    this.flyAnchor = captureFlyoverAnchor(camera);
    this.flySpec = { ...resolved };
    this.phase = "flyover";
    this.phaseTime = 0;
    this.sd.scale.setScalar(this.trueScale());
    this.poseOnFlyover(this.flyAnchor, this.flySpec, 0);
    return { hullLength: this.getHullLength(), spec: this.flySpec };
  }

  /** Configurator: hold the ship for manual posing (no autonomy, no escort). */
  beginPreview(): void {
    this.phase = "preview";
    this.phaseTime = 0;
    this.sd.scale.setScalar(this.trueScale());
    this.setLook(1, true);
  }

  /** Configurator: pose the ship on a spec's line at time t. */
  posePreview(anchor: FlyoverAnchor, spec: FlyoverSpec, t: number): void {
    if (this.phase !== "preview") return;
    this.poseOnFlyover(anchor, spec, t);
  }

  endPreview(): void {
    if (this.phase === "preview") this.park();
  }

  /** Drop out of lightspeed beside the Falcon. */
  startEscort(): void {
    this.phase = "escort_in";
    this.phaseTime = 0;
    this.escortAlong = -ESCORT_IN_FROM_BEHIND;
    this.sd.scale.setScalar(this.trueScale());
  }

  /** Call right before the main render (after the camera and ship moved). */
  update(dt: number, frame: StarDestroyerMomentsFrame): void {
    if (this.phase === "parked" || this.phase === "preview") return;
    this.phaseTime += Math.min(dt, 0.1);

    if (this.phase === "flyover") {
      const anchor = this.flyAnchor;
      const spec = this.flySpec;
      if (!anchor || !spec) {
        this.park();
        return;
      }
      const t = this.phaseTime;
      this.poseOnFlyover(anchor, spec, t);
      this.liftClearOfCamera(frame.camera);
      const total = flyoverDuration(spec);
      // Fade the extra glow out as it gets small in the distance.
      this.setLook(1 - THREE.MathUtils.smoothstep(t / Math.max(1e-3, total), 0.85, 1), true);
      if (t >= total) this.park();
      return;
    }

    const ship = frame.ship;
    if (!ship) {
      this.park();
      return;
    }
    this.shipForward.set(0, 0, 1).applyQuaternion(ship.quaternion).normalize();
    this.shipUp.set(0, 1, 0).applyQuaternion(ship.quaternion).normalize();
    this.shipRight.crossVectors(this.shipUp, this.shipForward).normalize();

    if (this.phase === "escort_in") {
      const u = Math.min(1, this.phaseTime / ESCORT_IN_SECONDS);
      this.escortAlong = THREE.MathUtils.lerp(-ESCORT_IN_FROM_BEHIND, ESCORT_AHEAD, easeOutCubic(u));
      if (u >= 1) this.enter("escort_hold");
    } else if (this.phase === "escort_hold") {
      this.escortAlong = ESCORT_AHEAD;
      if (!frame.lightspeed || this.phaseTime >= ESCORT_MAX_HOLD_SECONDS) this.enter("escort_out");
    } else if (this.phase === "escort_out") {
      const u = Math.min(1, this.phaseTime / ESCORT_OUT_SECONDS);
      this.escortAlong = ESCORT_AHEAD + ESCORT_OUT_DISTANCE * u * u * u;
      if (u >= 1) {
        this.park();
        return;
      }
    }

    this.sd.position
      .copy(ship.position)
      .addScaledVector(this.shipForward, this.escortAlong)
      .addScaledVector(this.shipRight, ESCORT_SIDE)
      .addScaledVector(this.shipUp, ESCORT_ABOVE);
    this.aim(this.shipForward, this.shipUp);
    this.setLook(this.phase === "escort_out" ? 1 : 0.8, true);
  }

  dispose(): void {
    this.rim.dispose();
    for (const sprite of this.glowSprites) sprite.removeFromParent();
    this.glowMaterial.dispose();
    this.glowTexture?.dispose();
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** Group scale that makes the hull SD_LENGTH_FALCONS Falcon lengths long. */
  private trueScale(): number {
    return this.getHullLength() / Math.max(1e-6, this.localSize.z);
  }

  private poseOnFlyover(anchor: FlyoverAnchor, spec: FlyoverSpec, t: number): void {
    flyoverDirection(anchor, spec, this.direction);
    flyoverStartPoint(anchor, spec, this.sd.position).addScaledVector(
      this.direction,
      flyoverDistanceAt(spec, t),
    );
    this.aim(this.direction, WORLD_UP);
    this.bankQuat.setFromAxisAngle(this.localForwardAxis, THREE.MathUtils.degToRad(spec.bankDeg));
    this.sd.quaternion.multiply(this.bankQuat);
  }

  /**
   * The camera must never be inside the hull: test it against the hull's box
   * (plus a small margin) in the ship's own space and, if inside, lift the
   * ship until the belly clears it.
   */
  private liftClearOfCamera(camera: THREE.Camera): void {
    camera.getWorldPosition(this.cameraPosition);
    this.sd.updateMatrixWorld(true);
    this.inverseWorld.copy(this.sd.matrixWorld).invert();
    this.localCamera.copy(this.cameraPosition).applyMatrix4(this.inverseWorld);
    const scale = this.sd.scale.x;
    const margin = FLYOVER_MIN_BELLY_GAP / Math.max(1e-6, scale);
    const min = this.localMin;
    const size = this.localSize;
    const c = this.localCamera;
    if (
      c.x > min.x - margin && c.x < min.x + size.x + margin &&
      c.z > min.z - margin && c.z < min.z + size.z + margin &&
      c.y > min.y - margin && c.y < min.y + size.y + margin
    ) {
      this.sd.position.y += (c.y - (min.y - margin)) * scale;
    }
  }

  /** Measures the hull in the group's own space (before its scale). */
  private measureHull(): void {
    this.sd.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(this.sd.matrixWorld).invert();
    const box = new THREE.Box3();
    const meshBox = new THREE.Box3();
    const meshToLocal = new THREE.Matrix4();
    this.sd.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const geometryBox = mesh.geometry.boundingBox;
      if (!geometryBox) return;
      meshToLocal.multiplyMatrices(toLocal, mesh.matrixWorld);
      box.union(meshBox.copy(geometryBox).applyMatrix4(meshToLocal));
    });
    if (box.isEmpty()) return;
    box.getSize(this.localSize);
    box.getCenter(this.localCenter);
    this.localMin.copy(box.min);
  }

  /** Nose along `forward` (same convention as the cruiser: lookAt then forwardOffset). */
  private aim(forward: THREE.Vector3, up: THREE.Vector3): void {
    this.lookTarget.copy(this.sd.position).add(forward);
    this.lookMatrix.lookAt(this.sd.position, this.lookTarget, up);
    this.sd.quaternion.setFromRotationMatrix(this.lookMatrix).multiply(this.forwardOffset);
  }

  /** Engine glow, rim outline and brighter fill while on screen. */
  private setLook(amount: number, shown: boolean): void {
    const engine = this.sd.userData.engineLight as THREE.PointLight | undefined;
    if (engine) engine.intensity = 0.5 + amount * 8;
    const key = this.sd.userData.readabilityKey as THREE.PointLight | undefined;
    const rim = this.sd.userData.readabilityRim as THREE.PointLight | undefined;
    if (key) key.intensity = 0.22 + amount * 1.6;
    if (rim) rim.intensity = 0.2 + amount * 1.3;
    this.glowMaterial.opacity = amount * 0.9;
    this.rim.setVisible(shown);
  }
}
