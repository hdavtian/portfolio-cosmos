import * as THREE from "three";
import type { CosmicPathCurve } from "./cosmicRoute";

/**
 * Mjolnir riding the About cosmic rail. It overtakes the rider from behind,
 * leads just ahead of the camera, and at the end of the loop climbs, dives
 * and smashes into the rail to set off the shatter.
 *
 * Motion is smooth and follows the rail: the hammer faces where it is going,
 * banks into curves and streams a glowing trail. Lit from its own textures
 * (no scene lights, so no shader recompiles).
 */

const MODEL_SIZE = 36;
/** Height above the rail centerline (the camera rides at 30). */
const RIDE_HEIGHT = 22;
const LEAD_DISTANCE = 170;
const FLY_IN_DELAY_S = 0.5;
const FLY_IN_START_DISTANCE = -110;
const FLY_IN_SECONDS = 2.4;
const STRIKE_DISTANCE = 950;
const STRIKE_SECONDS = 1.8;
const STRIKE_PEAK = 520;
/** Share of the strike spent climbing before the dive. */
const STRIKE_RISE = 0.58;
const RECOIL_SECONDS = 1.2;
const SELF_ILLUMINATION = 0.75;

/** How quickly the hammer's heading follows its direction of travel. */
const HEADING_DAMP = 10;
/** Bank angle per rad/s of turn, and the cap. */
const BANK_PER_TURN_RATE = 0.35;
const BANK_MAX = 0.9;
const BANK_DAMP = 4;
const BOB_AMPLITUDE = 1.6;

const TRAIL_POINTS = 40;
const TRAIL_WIDTH = MODEL_SIZE * 0.6;
/** Pale lavender-white, so the vapor doesn't read like the cyan path below. */
const TRAIL_COLOR = new THREE.Color(0.82, 0.78, 1);

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

type Mode = "hidden" | "warm" | "flyIn" | "ride" | "strike" | "recoil";

type GltfLoaderLike = {
  loadAsync(url: string): Promise<{ scene: THREE.Object3D }>;
};

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
  private readonly trail: THREE.Mesh;
  private readonly trailPositions: Float32Array;
  private readonly trailMaterial: THREE.ShaderMaterial;
  private readonly trailHistory: THREE.Vector3[] = [];
  private loaded = false;
  private mode: Mode = "hidden";
  private time = 0;
  private warmFrames = 0;
  private warmCamera: (() => THREE.Camera | null | undefined) | null = null;
  private path: CosmicPathCurve | null = null;
  private riderT = 0;
  private sign = 1;
  private currentDistance = LEAD_DISTANCE;
  private strikeFromDistance = LEAD_DISTANCE;
  private onImpact: ((impactT: number, point: THREE.Vector3) => void) | null = null;
  private hasHeading = false;
  private bank = 0;
  private readonly heading = new THREE.Vector3(0, 0, 1);
  private readonly prevPosition = new THREE.Vector3();
  private readonly railPoint = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly motion = new THREE.Vector3();
  private readonly prevHeading = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

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

    // Pivot: centered, scaled, head pointing along +Z (the flight direction).
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

  startRide(path: CosmicPathCurve, riderT: number, sign: 1 | -1): void {
    if (!this.loaded) return;
    this.path = path;
    this.riderT = riderT;
    this.sign = sign;
    this.mode = "flyIn";
    this.time = 0;
    this.currentDistance = FLY_IN_START_DISTANCE;
    this.hasHeading = false;
    this.bank = 0;
    this.model.scale.setScalar(1);
    this.model.rotation.set(0, 0, 0);
    this.root.visible = false;
    this.trail.visible = false;
  }

  setRider(riderT: number, sign: 1 | -1): void {
    this.riderT = riderT;
    this.sign = sign;
  }

  /** Returns false if the hammer isn't riding, so the caller ends the ride itself. */
  startStrike(onImpact: (impactT: number, point: THREE.Vector3) => void): boolean {
    if (!this.path || (this.mode !== "ride" && this.mode !== "flyIn")) return false;
    this.mode = "strike";
    this.time = 0;
    this.strikeFromDistance = this.currentDistance;
    this.onImpact = onImpact;
    this.root.visible = true;
    return true;
  }

  hide(): void {
    this.mode = "hidden";
    this.path = null;
    this.onImpact = null;
    this.root.visible = false;
    this.trail.visible = false;
  }

  update(dt: number, elapsed: number, cameraPosition?: THREE.Vector3): void {
    if (this.mode === "warm") {
      this.runWarmFrame();
      return;
    }
    const path = this.path;
    if (this.mode === "hidden" || !path || dt <= 0) return;
    this.time += dt;
    const length = path.timing.length;

    let distance = this.currentDistance;
    let lift = RIDE_HEIGHT + Math.sin(elapsed * 1.3) * BOB_AMPLITUDE;
    let glowOpacity = 0.22;
    let glowScale = 45;
    let modelScale = 1;
    let tumble = 0;
    let trailStrength = 1;

    if (this.mode === "flyIn") {
      if (this.time < FLY_IN_DELAY_S) return;
      const u = THREE.MathUtils.clamp((this.time - FLY_IN_DELAY_S) / FLY_IN_SECONDS, 0, 1);
      const eased = 1 - Math.pow(1 - u, 3);
      distance = THREE.MathUtils.lerp(FLY_IN_START_DISTANCE, LEAD_DISTANCE, eased);
      lift += (1 - eased) * 16;
      if (u >= 1) {
        this.mode = "ride";
        this.time = 0;
      }
    } else if (this.mode === "ride") {
      distance = LEAD_DISTANCE;
    } else if (this.mode === "strike") {
      const u = THREE.MathUtils.clamp(this.time / STRIKE_SECONDS, 0, 1);
      distance = THREE.MathUtils.lerp(
        this.strikeFromDistance,
        STRIKE_DISTANCE,
        THREE.MathUtils.smoothstep(u, 0, 1),
      );
      if (u < STRIKE_RISE) {
        const r = u / STRIKE_RISE;
        lift = RIDE_HEIGHT + STRIKE_PEAK * (1 - Math.pow(1 - r, 2));
      } else {
        const d = (u - STRIKE_RISE) / (1 - STRIKE_RISE);
        lift = (RIDE_HEIGHT + STRIKE_PEAK) * (1 - Math.pow(d, 2.4));
      }
      glowOpacity = 0.3 + 0.5 * u;
      glowScale = 45 + 70 * u;
      trailStrength = 1.3;
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
    this.placeOnRail(path, length, distance, lift);

    // Heading follows the actual direction of travel (rail travel, climb and
    // dive alike); falls back to the rail tangent while the rider is stopped.
    this.motion.subVectors(this.root.position, this.prevPosition);
    const moved = this.hasHeading ? this.motion.length() : 0;
    const wanted = moved > 0.5 ? this.motion.divideScalar(moved) : this.tangent;
    if (!this.hasHeading) {
      this.heading.copy(wanted);
      this.hasHeading = true;
      for (const point of this.trailHistory) point.copy(this.root.position);
    }
    this.prevHeading.copy(this.heading);
    this.heading.lerp(wanted, 1 - Math.exp(-HEADING_DAMP * dt)).normalize();
    this.prevPosition.copy(this.root.position);

    // Bank into turns: roll against the yaw rate around world up.
    const yawRate =
      Math.atan2(
        this.tmp.crossVectors(this.prevHeading, this.heading).dot(THREE.Object3D.DEFAULT_UP),
        this.prevHeading.dot(this.heading),
      ) / dt;
    const bankTarget = THREE.MathUtils.clamp(-yawRate * BANK_PER_TURN_RATE, -BANK_MAX, BANK_MAX);
    this.bank += (bankTarget - this.bank) * (1 - Math.exp(-BANK_DAMP * dt));

    this.position.copy(this.root.position);
    this.lookTarget.copy(this.position).add(this.heading);
    this.root.lookAt(this.lookTarget);
    this.model.rotation.set(tumble, 0, this.bank);
    this.model.scale.setScalar(Math.max(0.001, modelScale));

    const glowMaterial = this.glow.material as THREE.SpriteMaterial;
    glowMaterial.opacity = THREE.MathUtils.clamp(glowOpacity, 0, 1);
    this.glow.scale.setScalar(glowScale);
    this.root.visible = true;

    this.trailMaterial.uniforms.uTime.value = elapsed;
    this.updateTrail(cameraPosition, trailStrength * modelScale);
  }

  private runWarmFrame(): void {
    const camera = this.warmCamera?.();
    if (camera && this.warmFrames > 0) {
      camera.getWorldDirection(this.tmp);
      this.root.position.copy(camera.position).addScaledVector(this.tmp, 60);
      this.model.scale.setScalar(0.02);
      this.glow.scale.setScalar(0.5);
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
        this.side.crossVectors(this.tmp, THREE.Object3D.DEFAULT_UP);
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
    this.root.position.copy(this.railPoint).addScaledVector(THREE.Object3D.DEFAULT_UP, lift);
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
