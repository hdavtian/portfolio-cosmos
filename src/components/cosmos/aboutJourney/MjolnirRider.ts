import * as THREE from "three";
import type { CosmicPathCurve } from "./cosmicRoute";

/**
 * Mjolnir on the About cosmic rail.
 *
 * 1. arrive  — shoots in from far down the rail straight at the rider, dives
 *              under the rail and swoops up to hover in front, upright like a
 *              cross, facing the rider.
 * 2. hover   — waits there, clickable.
 * 3. dock    — on click it glides in close, as if the rider caught hold of the
 *              handle, and settles back with a soft bounce.
 * 4. ride    — leads just ahead, still upright as a "T", its head and the top
 *              of the shaft in view, pulling the rider.
 * 5. strike  — at the end of the loop it climbs, dives and smashes the rail.
 *
 * Lit from its own textures (no scene lights, so no shader recompiles).
 */

const MODEL_SIZE = 36;
const SELF_ILLUMINATION = 0.75;

const ARRIVE_SECONDS = 3.8;
const ARRIVE_START_DISTANCE = 2600;
const ARRIVE_START_LIFT = 90;
/** Low point of the arc, well below the camera's view. */
const ARRIVE_DIVE_LIFT = -260;
/** How close it is (along the rail) when it pops back up. */
const ARRIVE_DIVE_DISTANCE = 140;
/** Share of the arrival spent racing in and arcing down out of view. */
const ARRIVE_DIVE_AT = 0.55;
/** Share of the arrival after which it turns upright into the cross pose. */
const ARRIVE_UPRIGHT_FROM = 0.7;

/** Hover pose: close in front of the camera, at eye level (camera rides at 30). */
const HOVER_DISTANCE = 60;
const HOVER_LIFT = 30;

const DOCK_SECONDS = 2.4;
/** Share of the dock after which it tilts from the "T" into the pulling pose. */
const DOCK_TILT_FROM = 0.3;
/** How much closer than its riding spot it comes (handle toward the rider). */
const DOCK_OVERSHOOT = 22;

/**
 * Pulling pose, placed in the rider's own frame each ride tick so it can
 * never lag: this far ahead along the travel direction, this far below eye
 * level, nearly horizontal and tilted slightly up, head leading.
 */
const RIDE_AHEAD = 44;
const RIDE_BELOW = 13;
const RIDE_PITCH_UP = 0.2;
const RIDE_TRAIL_STRENGTH = 0.3;
/** Rail-space equivalents of the riding spot, where the strike takes over. */
const RIDE_DISTANCE = RIDE_AHEAD;
const RIDE_LIFT = HOVER_LIFT - RIDE_BELOW;

const STRIKE_DISTANCE = 950;
const STRIKE_SECONDS = 1.8;
const STRIKE_PEAK = 520;
/** Share of the strike spent climbing before the dive. */
const STRIKE_RISE = 0.58;
const RECOIL_SECONDS = 1.2;

const HEADING_DAMP = 8;
const POSE_DAMP = 6;
/** Bank angle per rad/s of turn, and the cap. */
const BANK_PER_TURN_RATE = 0.35;
const BANK_MAX = 0.6;
const BANK_DAMP = 4;
const BOB_AMPLITUDE = 1.2;

const TRAIL_POINTS = 40;
const TRAIL_WIDTH = MODEL_SIZE * 0.6;
/** Pale lavender-white, so the vapor doesn't read like the cyan path below. */
const TRAIL_COLOR = new THREE.Color(0.82, 0.78, 1);

const UP = new THREE.Vector3(0, 1, 0);
/** Rolls the upright hammer about its handle so its head reads as a "T". */
const T_ROLL = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 0, 1),
  Math.PI / 2,
);
const ORIGIN = new THREE.Vector3();

// Soft, wispy vapor: feathered edges, flowing noise, billowing toward the tail.
const trailVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const trailFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uStrength;
  uniform vec3 uColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < 4; k++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    #include <logdepthbuf_fragment>
    float along = vUv.x;               // 0 at the hammer, 1 at the tail
    float across = (vUv.y - 0.5) * 2.0;
    float spread = mix(0.35, 1.0, along);
    float body = exp(-pow(across / spread, 2.0) * 2.2);
    vec2 flow = vec2(along * 7.0 - uTime * 2.4, across * 1.6 + uTime * 0.35);
    float gas = smoothstep(0.38, 0.85, fbm(flow) + 0.25 * (1.0 - along));
    float fade = pow(1.0 - along, 1.3) * smoothstep(0.0, 0.06, along);
    float alpha = body * gas * fade * uStrength * 0.55;
    gl_FragColor = vec4(uColor * alpha, 1.0);
    #include <colorspace_fragment>
  }
`;

// Bow-shock haze: a thin paraboloid shell just ahead of the head, opening back
// around it like an umbrella. It only glows at grazing angles (rim), so the
// part in front of the head stays clear and the head keeps its real colors.
const HAZE_APEX = MODEL_SIZE * 0.64;
const HAZE_LENGTH = MODEL_SIZE * 0.55;
const HAZE_RADIUS = MODEL_SIZE * 0.5;
const HAZE_COLOR = new THREE.Color(0.86, 0.84, 1);

const hazeVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uTime;
  uniform float uWobble;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying float vAngle;
  void main() {
    vUv = uv;
    vAngle = atan(position.y, position.x);
    // Ripple the shell so it never reads as a clean geometric dome.
    float ripple =
      sin(position.z * 0.35 + uTime * 3.1 + vAngle * 3.0) * 0.6 +
      sin(position.z * 0.9 - uTime * 2.3 + vAngle * 5.0) * 0.4;
    vec3 displaced = position + normal * ripple * uWobble;
    vNormalView = normalMatrix * normal;
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    vViewPosition = mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;

const hazeFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uStrength;
  uniform vec3 uColor;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying float vAngle;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < 3; k++) {
      v += a * noise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 viewDir = normalize(-vViewPosition);
    float edge = 1.0 - abs(dot(normalize(vNormalView), viewDir));
    // Glow toward grazing angles but fade out right at the silhouette, so
    // there's no crisp outline.
    float rim = pow(edge, 1.6) * (1.0 - smoothstep(0.78, 1.0, edge));
    float along = vUv.y;               // 0 at the apex, 1 at the open end
    // Seamless around the shell (angle as a circle), drifting backward.
    vec2 flow = vec2(
      cos(vAngle) * 2.5 + along * 2.0 - uTime * 2.4,
      sin(vAngle) * 2.5 + along * 1.3 + uTime * 0.4
    );
    float dust = smoothstep(0.45, 0.9, fbm(flow));
    float fade =
      smoothstep(0.05, 0.35, along) * (1.0 - smoothstep(0.5, 1.0, along));
    float alpha = rim * dust * fade * uStrength * 1.1;
    gl_FragColor = vec4(uColor * alpha, 1.0);
    #include <colorspace_fragment>
  }
`;

type Mode = "hidden" | "warm" | "arrive" | "hover" | "dock" | "ride" | "strike" | "recoil";

type GltfLoaderLike = {
  loadAsync(url: string): Promise<{ scene: THREE.Object3D }>;
};

const easeOutBack = (v: number) => {
  const c = 1.1;
  return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2);
};

const easeInOutCubic = (v: number) =>
  v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;

const createGlowTexture = (): THREE.Texture | null => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(170,215,255,0.7)");
  grad.addColorStop(0.55, "rgba(90,150,255,0.18)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export class MjolnirRider {
  readonly root = new THREE.Group();
  /** World position of the hammer, updated every frame it is visible. */
  readonly position = new THREE.Vector3();
  private readonly model = new THREE.Group();
  private readonly glow: THREE.Sprite;
  private readonly pickSphere: THREE.Mesh;
  private readonly haze: THREE.Mesh;
  private readonly hazeMaterial: THREE.ShaderMaterial;
  private hazeLevel = 0;
  private readonly trail: THREE.Mesh;
  private readonly trailMaterial: THREE.ShaderMaterial;
  private readonly trailPositions: Float32Array;
  private readonly trailHistory: THREE.Vector3[] = [];
  private loaded = false;
  private mode: Mode = "hidden";
  private time = 0;
  private warmFrames = 0;
  private warmCamera: (() => THREE.Camera | null | undefined) | null = null;
  private path: CosmicPathCurve | null = null;
  private riderT = 0;
  private sign: 1 | -1 = 1;
  private hovered = false;
  private onReady: (() => void) | null = null;
  private onDocked: (() => void) | null = null;
  private onImpact: ((impactT: number, point: THREE.Vector3) => void) | null = null;
  private hasHeading = false;
  private bank = 0;
  private currentDistance = RIDE_DISTANCE;
  private strikeFromDistance = RIDE_DISTANCE;
  private readonly heading = new THREE.Vector3(0, 0, 1);
  private readonly prevHeading = new THREE.Vector3();
  private readonly prevPosition = new THREE.Vector3();
  private readonly railPoint = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly motion = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly basisX = new THREE.Vector3();
  private readonly basisY = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly crossQuat = new THREE.Quaternion();
  private readonly poseQuat = new THREE.Quaternion();
  /** Rider's camera position and smoothed travel direction, set by the ride. */
  private readonly riderCameraPosition = new THREE.Vector3();
  private readonly riderForward = new THREE.Vector3(0, 0, 1);
  /** While riding, the ride tick updates the hammer in the same frame as the camera. */
  private driven = false;
  private readonly dockStartPosition = new THREE.Vector3();
  private readonly ridePosition = new THREE.Vector3();
  private readonly rideQuat = new THREE.Quaternion();

  constructor() {
    this.root.name = "AboutMjolnir";
    this.root.visible = false;
    this.root.add(this.model);

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowTexture(),
        color: 0x9fd0ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.glow.scale.setScalar(45);
    this.root.add(this.glow);

    // Paraboloid shell: apex ahead of the head (+Z), opening back around it.
    const hazeProfile: THREE.Vector2[] = [];
    const hazeSteps = 16;
    for (let i = 0; i <= hazeSteps; i++) {
      const s = i / hazeSteps;
      hazeProfile.push(new THREE.Vector2(HAZE_RADIUS * Math.sqrt(s), -s * HAZE_LENGTH));
    }
    const hazeGeometry = new THREE.LatheGeometry(hazeProfile, 40);
    hazeGeometry.rotateX(Math.PI / 2);
    hazeGeometry.translate(0, 0, HAZE_APEX);
    this.hazeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uStrength: { value: 0 },
        uColor: { value: HAZE_COLOR.clone() },
        uWobble: { value: HAZE_RADIUS * 0.12 },
      },
      vertexShader: hazeVertexShader,
      fragmentShader: hazeFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.haze = new THREE.Mesh(hazeGeometry, this.hazeMaterial);
    this.haze.name = "AboutMjolnirHaze";
    this.haze.frustumCulled = false;
    this.haze.visible = false;
    this.model.add(this.haze);

    // Invisible, generous click target (raycasts ignore visibility).
    this.pickSphere = new THREE.Mesh(
      new THREE.SphereGeometry(MODEL_SIZE * 0.75, 12, 8),
      new THREE.MeshBasicMaterial(),
    );
    this.pickSphere.visible = false;
    this.root.add(this.pickSphere);

    // Camera-facing ribbon of recent positions, rebuilt each frame in world space.
    this.trailPositions = new Float32Array(TRAIL_POINTS * 2 * 3);
    const trailUvs = new Float32Array(TRAIL_POINTS * 2 * 2);
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const u = i / (TRAIL_POINTS - 1);
      trailUvs.set([u, 0, u, 1], i * 4);
    }
    const indices: number[] = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute("uv", new THREE.BufferAttribute(trailUvs, 2));
    geometry.setIndex(indices);
    this.trailMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uStrength: { value: 0 },
        uColor: { value: TRAIL_COLOR.clone() },
      },
      vertexShader: trailVertexShader,
      fragmentShader: trailFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.trail = new THREE.Mesh(geometry, this.trailMaterial);
    this.trail.name = "AboutMjolnirTrail";
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    for (let i = 0; i < TRAIL_POINTS; i++) this.trailHistory.push(new THREE.Vector3());
  }

  /** The trail lives in world space, so it's added next to the root. */
  addTo(scene: THREE.Object3D): void {
    scene.add(this.root);
    scene.add(this.trail);
  }

  async load(loader: GltfLoaderLike, url: string): Promise<void> {
    const gltf = await loader.loadAsync(url);
    const source = gltf.scene;
    source.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(source);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // The handle runs along the longest axis; the head is the biggest part.
    const axis = new THREE.Vector3();
    if (size.x >= size.y && size.x >= size.z) axis.set(1, 0, 0);
    else if (size.y >= size.z) axis.set(0, 1, 0);
    else axis.set(0, 0, 1);
    let headCenter: THREE.Vector3 | null = null;
    let headVolume = 0;
    const meshBox = new THREE.Box3();
    source.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshBox.setFromObject(mesh);
      const s = meshBox.getSize(new THREE.Vector3());
      const volume = s.x * s.y * s.z;
      if (volume > headVolume) {
        headVolume = volume;
        headCenter = meshBox.getCenter(new THREE.Vector3());
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        const mat = material as THREE.MeshStandardMaterial;
        if (!mat.isMeshStandardMaterial || !mat.map) return;
        mat.emissive = new THREE.Color(0xffffff);
        mat.emissiveMap = mat.map;
        mat.emissiveIntensity = SELF_ILLUMINATION;
      });
    });
    if (headCenter && (headCenter as THREE.Vector3).clone().sub(center).dot(axis) < 0) {
      axis.negate();
    }

    // Pivot: centered, scaled, head pointing along +Z.
    const pivot = new THREE.Group();
    source.position.sub(center);
    pivot.add(source);
    pivot.scale.setScalar(MODEL_SIZE / Math.max(size.x, size.y, size.z, 1e-6));
    pivot.quaternion.setFromUnitVectors(axis, new THREE.Vector3(0, 0, 1));
    this.model.add(pivot);
    this.loaded = true;
  }

  /**
   * Draws the hammer, glow and trail for a couple of tiny frames in front of
   * the camera. Pre-compiling isn't enough: the scene renders through the
   * bloom pipeline, which needs its own shader variants, and those only get
   * built by a real draw. Do this while the loader still covers the screen.
   */
  warmUp(getCamera: () => THREE.Camera | null | undefined): void {
    if (!this.loaded || this.mode !== "hidden") return;
    this.warmCamera = getCamera;
    this.warmFrames = 2;
    this.mode = "warm";
  }

  /** Flies in from far down the rail and hovers in front of the rider. */
  arrive(path: CosmicPathCurve, riderT: number, onReady: () => void): boolean {
    if (!this.loaded) return false;
    this.path = path;
    this.riderT = riderT;
    this.sign = 1;
    this.mode = "arrive";
    this.time = 0;
    this.onReady = onReady;
    this.hasHeading = false;
    this.bank = 0;
    this.hovered = false;
    this.model.scale.setScalar(1);
    this.model.rotation.set(0, 0, 0);
    this.root.visible = false;
    this.trail.visible = false;
    return true;
  }

  /** True while it hovers in front of the rider, waiting to be clicked. */
  get awaitingGrab(): boolean {
    return this.mode === "hover";
  }

  hitTest(raycaster: THREE.Raycaster): boolean {
    if (this.mode !== "hover") return false;
    return raycaster.intersectObject(this.pickSphere, false).length > 0;
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered && this.mode === "hover";
  }

  /** Rider grabbed it: dock, then call `onDocked` to start pulling. */
  dock(onDocked: () => void): boolean {
    if (this.mode !== "hover") return false;
    this.mode = "dock";
    this.time = 0;
    this.dockStartPosition.copy(this.root.position);
    this.hovered = false;
    this.onDocked = onDocked;
    return true;
  }

  setRider(riderT: number, sign: 1 | -1): void {
    this.riderT = riderT;
    this.sign = sign;
  }

  /** The rider's camera position and (smoothed) travel direction. */
  setRiderFrame(cameraPosition: THREE.Vector3, forward: THREE.Vector3): void {
    this.riderCameraPosition.copy(cameraPosition);
    if (forward.lengthSq() > 1e-6) this.riderForward.copy(forward).normalize();
  }

  /** True while the ride tick drives updates (the scene loop then skips it). */
  setDriven(driven: boolean): void {
    this.driven = driven;
  }

  /** Returns false if the hammer isn't riding, so the caller ends the ride itself. */
  startStrike(onImpact: (impactT: number, point: THREE.Vector3) => void): boolean {
    if (!this.path || this.mode !== "ride") return false;
    this.mode = "strike";
    this.time = 0;
    // Lets go of the rider: the strike runs on its own along the rail.
    this.driven = false;
    this.strikeFromDistance = RIDE_DISTANCE;
    this.onImpact = onImpact;
    this.root.visible = true;
    return true;
  }

  hide(): void {
    this.mode = "hidden";
    this.driven = false;
    this.path = null;
    this.onReady = null;
    this.onDocked = null;
    this.onImpact = null;
    this.hovered = false;
    this.root.visible = false;
    this.trail.visible = false;
  }

  update(
    dt: number,
    elapsed: number,
    cameraPosition?: THREE.Vector3,
    source: "scene" | "ride" = "scene",
  ): void {
    // While riding, only the ride tick may move it (same frame as the camera).
    if (this.driven && source !== "ride") return;
    if (this.mode === "warm") {
      this.runWarmFrame();
      return;
    }
    const path = this.path;
    if (this.mode === "hidden" || !path || dt <= 0) return;
    this.time += dt;
    const length = path.timing.length;

    let distance = this.currentDistance;
    let lift = RIDE_LIFT;
    let glowOpacity = 0.22;
    let glowScale = 45;
    let modelScale = 1;
    let tumble = 0;
    let trailStrength = 1;
    let hazeStrength = 0;
    /** "motion": face where it's moving; "rail": face down the rail; "pose": use poseQuat. */
    let facing: "motion" | "rail" | "pose" = "motion";
    let banking = true;
    /** Set when the mode positions the hammer itself (rider frame, not the rail). */
    let placed = false;

    if (this.mode === "arrive") {
      const u = THREE.MathUtils.clamp(this.time / ARRIVE_SECONDS, 0, 1);
      if (u < ARRIVE_DIVE_AT) {
        // Races in and arcs down, dropping out of view below the rail.
        const a = u / ARRIVE_DIVE_AT;
        distance = THREE.MathUtils.lerp(
          ARRIVE_START_DISTANCE,
          ARRIVE_DIVE_DISTANCE,
          1 - Math.pow(1 - a, 2),
        );
        lift = THREE.MathUtils.lerp(ARRIVE_START_LIFT, ARRIVE_DIVE_LIFT, a * a);
      } else {
        // Pops up close in front and settles gently.
        const b = (u - ARRIVE_DIVE_AT) / (1 - ARRIVE_DIVE_AT);
        distance = THREE.MathUtils.lerp(
          ARRIVE_DIVE_DISTANCE,
          HOVER_DISTANCE,
          THREE.MathUtils.smoothstep(b, 0, 1),
        );
        lift = THREE.MathUtils.lerp(ARRIVE_DIVE_LIFT, HOVER_LIFT, easeOutBack(b));
      }
      glowOpacity = 0.3;
      if (u >= ARRIVE_UPRIGHT_FROM) {
        this.computeCrossQuat(path, length);
        facing = "pose";
        this.poseQuat.copy(this.root.quaternion).slerp(
          this.crossQuat,
          THREE.MathUtils.smoothstep(u, ARRIVE_UPRIGHT_FROM, 1),
        );
        banking = false;
      }
      trailStrength = 1 - THREE.MathUtils.smoothstep(u, 0.85, 1);
      if (u >= 1) {
        this.mode = "hover";
        this.time = 0;
        const onReady = this.onReady;
        this.onReady = null;
        onReady?.();
      }
    } else if (this.mode === "hover") {
      distance = HOVER_DISTANCE;
      lift = HOVER_LIFT + Math.sin(elapsed * 1.4) * BOB_AMPLITUDE * 1.5;
      this.computeCrossQuat(path, length);
      facing = "pose";
      this.poseQuat.copy(this.root.quaternion).slerp(
        this.crossQuat,
        1 - Math.exp(-POSE_DAMP * dt),
      );
      banking = false;
      // A slow pulse invites a click; brighter while hovered.
      glowOpacity = (this.hovered ? 0.55 : 0.3) + 0.12 * Math.sin(elapsed * 2.6);
      glowScale = this.hovered ? 70 : 55;
      trailStrength = 0;
    } else if (this.mode === "dock") {
      const u = THREE.MathUtils.clamp(this.time / DOCK_SECONDS, 0, 1);
      // Comes in closer than its riding spot (the rider takes the handle),
      // then settles back with a soft bounce.
      let ahead: number;
      if (u < 0.55) {
        ahead = RIDE_AHEAD - DOCK_OVERSHOOT * easeInOutCubic(u / 0.55);
      } else {
        const v = (u - 0.55) / 0.45;
        ahead =
          RIDE_AHEAD - DOCK_OVERSHOOT * Math.cos(v * Math.PI * 1.5) * Math.exp(-3.5 * v);
      }
      this.computeRideFrame(ahead);
      this.root.position.lerpVectors(
        this.dockStartPosition,
        this.ridePosition,
        easeInOutCubic(Math.min(1, u / 0.55)),
      );
      placed = true;
      // Tilts from the upright "T" into the pulling pose, ready to go.
      this.computeCrossQuat(path, length);
      facing = "pose";
      this.poseQuat
        .copy(this.crossQuat)
        .slerp(this.rideQuat, THREE.MathUtils.smoothstep(u, DOCK_TILT_FROM, 1));
      banking = false;
      trailStrength = 0;
      // The hover glow fades out as the rider takes hold.
      glowOpacity = 0.3 * (1 - THREE.MathUtils.smoothstep(u, 0, 0.5));
      if (u >= 1) {
        this.mode = "ride";
        this.time = 0;
        const onDocked = this.onDocked;
        this.onDocked = null;
        onDocked?.();
      }
    } else if (this.mode === "ride") {
      // Locked to the rider's frame: steady, no bob, never behind the rider.
      distance = RIDE_DISTANCE;
      this.computeRideFrame(RIDE_AHEAD);
      this.root.position.copy(this.ridePosition);
      placed = true;
      facing = "pose";
      this.poseQuat.copy(this.rideQuat);
      banking = false;
      trailStrength = RIDE_TRAIL_STRENGTH;
      // No halo while pulling: the sprite sits at the model's center, inside
      // the head, and tinted the head blue while the shaft stayed natural.
      glowOpacity = 0;
      hazeStrength = 1;
    } else if (this.mode === "strike") {
      const u = THREE.MathUtils.clamp(this.time / STRIKE_SECONDS, 0, 1);
      distance = THREE.MathUtils.lerp(
        this.strikeFromDistance,
        STRIKE_DISTANCE,
        THREE.MathUtils.smoothstep(u, 0, 1),
      );
      if (u < STRIKE_RISE) {
        const r = u / STRIKE_RISE;
        lift = RIDE_LIFT + STRIKE_PEAK * (1 - Math.pow(1 - r, 2));
      } else {
        const d = (u - STRIKE_RISE) / (1 - STRIKE_RISE);
        lift = (RIDE_LIFT + STRIKE_PEAK) * (1 - Math.pow(d, 2.4));
      }
      glowOpacity = 0.3 + 0.5 * u;
      glowScale = 45 + 70 * u;
      trailStrength = 1.3;
      hazeStrength = 1 - THREE.MathUtils.smoothstep(u, 0.5, 0.9);
      if (u >= 1) {
        this.placeOnRail(path, length, STRIKE_DISTANCE, 0);
        const impactT = THREE.MathUtils.euclideanModulo(
          this.riderT + (this.sign * STRIKE_DISTANCE) / length,
          1,
        );
        const onImpact = this.onImpact;
        this.onImpact = null;
        this.mode = "recoil";
        this.time = 0;
        onImpact?.(impactT, this.railPoint.clone());
        return;
      }
    } else if (this.mode === "recoil") {
      // Rebounds off the rail with one slow tumble, then fades out.
      const u = THREE.MathUtils.clamp(this.time / RECOIL_SECONDS, 0, 1);
      distance = STRIKE_DISTANCE - 60 * THREE.MathUtils.smoothstep(u, 0, 1);
      lift = 90 * Math.sin(Math.PI * Math.min(1, u * 1.15));
      tumble = THREE.MathUtils.smoothstep(u, 0, 1) * Math.PI * 1.2;
      glowOpacity = 1 - u;
      glowScale = 420 * (1 - u * 0.6);
      modelScale = 1 - THREE.MathUtils.smoothstep(u, 0.55, 1);
      trailStrength = 1 - u;
      if (u >= 1) {
        this.hide();
        return;
      }
    }

    this.currentDistance = distance;
    if (!placed) {
      this.placeOnRail(path, length, distance, lift);
    } else {
      this.tangent.copy(this.riderForward);
    }

    // Heading follows the actual direction of travel; falls back to the rail
    // tangent while barely moving.
    this.motion.subVectors(this.root.position, this.prevPosition);
    const moved = this.hasHeading ? this.motion.length() : 0;
    const wanted =
      facing === "motion" && moved > 0.5 ? this.motion.divideScalar(moved) : this.tangent;
    if (!this.hasHeading) {
      this.heading.copy(wanted);
      this.hasHeading = true;
      for (const point of this.trailHistory) point.copy(this.root.position);
    }
    this.prevHeading.copy(this.heading);
    this.heading.lerp(wanted, 1 - Math.exp(-HEADING_DAMP * dt)).normalize();
    this.prevPosition.copy(this.root.position);

    if (facing === "pose") {
      this.root.quaternion.copy(this.poseQuat);
    } else {
      this.headingToQuat(this.heading, this.root.quaternion);
    }

    // Bank into turns: roll against the yaw rate around world up.
    let bankTarget = 0;
    if (banking) {
      const yawRate =
        Math.atan2(
          this.tmp.crossVectors(this.prevHeading, this.heading).dot(UP),
          this.prevHeading.dot(this.heading),
        ) / dt;
      bankTarget = THREE.MathUtils.clamp(-yawRate * BANK_PER_TURN_RATE, -BANK_MAX, BANK_MAX);
    }
    this.bank += (bankTarget - this.bank) * (1 - Math.exp(-BANK_DAMP * dt));

    this.position.copy(this.root.position);
    this.model.rotation.set(tumble, 0, this.bank);
    this.model.scale.setScalar(Math.max(0.001, modelScale));

    const glowMaterial = this.glow.material as THREE.SpriteMaterial;
    glowMaterial.opacity = THREE.MathUtils.clamp(glowOpacity, 0, 1);
    this.glow.scale.setScalar(glowScale);
    // Eases in as it starts pulling, out as it lets go.
    this.hazeLevel += (hazeStrength - this.hazeLevel) * (1 - Math.exp(-4 * dt));
    this.hazeMaterial.uniforms.uStrength.value = this.hazeLevel;
    this.hazeMaterial.uniforms.uTime.value = elapsed;
    this.haze.visible = this.hazeLevel > 0.01;
    this.root.visible = true;

    this.trailMaterial.uniforms.uTime.value = elapsed;
    this.updateTrail(cameraPosition, trailStrength * modelScale);
  }

  /** Upright (head up), broad side facing back down the rail toward the rider. */
  private computeCrossQuat(path: CosmicPathCurve, length: number) {
    path.getTangentAt(
      THREE.MathUtils.euclideanModulo(this.riderT + (this.sign * HOVER_DISTANCE) / length, 1),
      this.tmp,
    );
    this.basisY.copy(this.tmp).multiplyScalar(-this.sign);
    this.basisY.y = 0;
    if (this.basisY.lengthSq() < 1e-6) this.basisY.set(0, 0, 1);
    this.basisY.normalize();
    this.basisX.crossVectors(this.basisY, UP).normalize();
    this.matrix.makeBasis(this.basisX, this.basisY, UP);
    this.crossQuat.setFromRotationMatrix(this.matrix).multiply(T_ROLL);
  }

  /** Pulling pose in the rider's frame, `ahead` units along the travel direction. */
  private computeRideFrame(ahead: number) {
    this.ridePosition
      .copy(this.riderCameraPosition)
      .addScaledVector(this.riderForward, ahead)
      .addScaledVector(UP, -RIDE_BELOW);
    this.tmp
      .copy(this.riderForward)
      .addScaledVector(UP, Math.tan(RIDE_PITCH_UP))
      .normalize();
    this.headingToQuat(this.tmp, this.rideQuat);
    this.rideQuat.multiply(T_ROLL);
  }

  /** Quaternion that points local +Z (the head) along `dir`, keeping world up. */
  private headingToQuat(dir: THREE.Vector3, out: THREE.Quaternion) {
    const up = Math.abs(dir.y) > 0.999 ? this.side.set(0, 0, 1) : UP;
    this.matrix.lookAt(dir, ORIGIN, up);
    out.setFromRotationMatrix(this.matrix);
  }

  private runWarmFrame(): void {
    const camera = this.warmCamera?.();
    if (camera && this.warmFrames > 0) {
      camera.getWorldDirection(this.tmp);
      this.root.position.copy(camera.position).addScaledVector(this.tmp, 60);
      this.model.scale.setScalar(0.02);
      this.glow.scale.setScalar(0.5);
      this.haze.visible = true;
      this.root.visible = true;
      for (const point of this.trailHistory) point.copy(this.root.position);
      this.updateTrail(camera.position, 0.01);
      this.warmFrames--;
      return;
    }
    this.mode = "hidden";
    this.warmCamera = null;
    this.model.scale.setScalar(1);
    this.glow.scale.setScalar(45);
    this.haze.visible = false;
    this.root.visible = false;
    this.trail.visible = false;
  }

  /** Shifts the position history and rebuilds the camera-facing ribbon. */
  private updateTrail(cameraPosition: THREE.Vector3 | undefined, strength: number): void {
    const history = this.trailHistory;
    const last = history.pop()!;
    // Start the trail at the handle end, behind the head.
    last.copy(this.root.position).addScaledVector(this.heading, -MODEL_SIZE * 0.45);
    history.unshift(last);

    for (let i = 0; i < TRAIL_POINTS; i++) {
      const point = history[i];
      const next = history[Math.min(TRAIL_POINTS - 1, i + 1)];
      const prev = history[Math.max(0, i - 1)];
      this.tmp.subVectors(prev, next);
      if (this.tmp.lengthSq() < 1e-6) this.tmp.copy(this.heading);
      if (cameraPosition) {
        this.side.subVectors(cameraPosition, point).cross(this.tmp);
      } else {
        this.side.crossVectors(this.tmp, UP);
      }
      if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
      const fade = 1 - i / (TRAIL_POINTS - 1);
      // Narrow at the hammer, billowing wider as the vapor trails off.
      this.side.normalize().multiplyScalar(TRAIL_WIDTH * 0.5 * (0.35 + 0.9 * (1 - fade)));
      const v = i * 6;
      this.trailPositions[v] = point.x + this.side.x;
      this.trailPositions[v + 1] = point.y + this.side.y;
      this.trailPositions[v + 2] = point.z + this.side.z;
      this.trailPositions[v + 3] = point.x - this.side.x;
      this.trailPositions[v + 4] = point.y - this.side.y;
      this.trailPositions[v + 5] = point.z - this.side.z;
    }
    this.trailMaterial.uniforms.uStrength.value = THREE.MathUtils.clamp(strength, 0, 1.5);
    (this.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.trail.visible = true;
  }

  private placeOnRail(path: CosmicPathCurve, length: number, distance: number, lift: number) {
    const t = THREE.MathUtils.euclideanModulo(this.riderT + (this.sign * distance) / length, 1);
    path.getPointAt(t, this.railPoint);
    path.getTangentAt(t, this.tangent).multiplyScalar(this.sign).normalize();
    this.root.position.copy(this.railPoint).addScaledVector(UP, lift);
  }

  dispose(): void {
    for (const object of [this.root, this.trail]) {
      object.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = mesh.material
          ? Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
          : [];
        materials.forEach((material) => {
          const mat = material as THREE.MeshStandardMaterial;
          mat.map?.dispose();
          mat.dispose();
        });
      });
      object.removeFromParent();
    }
  }
}
