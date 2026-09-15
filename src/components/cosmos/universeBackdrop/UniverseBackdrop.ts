import * as THREE from "three";

/**
 * A truly 3D universe backdrop, replacing the photo "lightbox" spheres.
 *
 *  1. Sky: Milky Way band, dust lanes, nebula clouds and a dense far star
 *     field, generated procedurally from the view direction (no tiling or
 *     pole stretching) and baked ONCE into a cubemap used as scene.background
 *     (per-frame cost: one texture lookup).
 *  2. 3D stars: ~100k points at real positions through and around the
 *     universe (parallax as you travel), realistic brightness falloff,
 *     stellar colors and a subtle twinkle. One draw call.
 *  3. Anomalies: distant galaxies, nebulae and a black hole as camera-facing
 *     shader cards far from the destinations.
 *  4. Near-space dust: faint specks wrapping around the camera for a sense
 *     of motion.
 *
 * Two looks share the same shaders (only uniforms change, so switching
 * compiles nothing): "realism" (cinematic, restrained) and "vivid" (sci-fi).
 *
 * Self-contained: to remove it, delete this folder and the lines marked
 * "Universe backdrop" in ResumeSpace3D.tsx.
 */

export type UniverseStyle = "lightbox" | "realism" | "vivid";
type BackdropStyle = Exclude<UniverseStyle, "lightbox">;

const STORAGE_KEY = "universeBackdrop.style.v1";

export const readStoredUniverseStyle = (): UniverseStyle => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "lightbox" || value === "realism" || value === "vivid") return value;
  } catch {
    // Storage unavailable: use the default.
  }
  return "realism";
};

export const writeStoredUniverseStyle = (style: UniverseStyle): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // Storage unavailable: the choice just won't persist.
  }
};

type StyleSettings = {
  skyBase: THREE.Color;
  milkyWayColor: THREE.Color;
  milkyWayStrength: number;
  dustLaneStrength: number;
  nebulaA: THREE.Color;
  nebulaB: THREE.Color;
  nebulaC: THREE.Color;
  nebulaStrength: number;
  farStarStrength: number;
  /** 0 = white stars, 1 = full stellar color. */
  starSaturation: number;
  starBrightness: number;
  starCount: number;
  anomalyStrength: number;
  anomalyA: THREE.Color;
  anomalyB: THREE.Color;
};

const STYLES: Record<BackdropStyle, StyleSettings> = {
  realism: {
    skyBase: new THREE.Color(0.0035, 0.0045, 0.008),
    milkyWayColor: new THREE.Color(0.62, 0.58, 0.52),
    milkyWayStrength: 0.42,
    dustLaneStrength: 0.85,
    nebulaA: new THREE.Color(0.42, 0.14, 0.12),
    nebulaB: new THREE.Color(0.1, 0.18, 0.34),
    nebulaC: new THREE.Color(0.3, 0.26, 0.32),
    nebulaStrength: 0.22,
    farStarStrength: 0.75,
    starSaturation: 0.35,
    starBrightness: 1,
    starCount: 90_000,
    anomalyStrength: 0.55,
    anomalyA: new THREE.Color(1.0, 0.88, 0.72),
    anomalyB: new THREE.Color(0.55, 0.68, 1.0),
  },
  vivid: {
    skyBase: new THREE.Color(0.008, 0.004, 0.018),
    milkyWayColor: new THREE.Color(0.62, 0.48, 0.95),
    milkyWayStrength: 0.62,
    dustLaneStrength: 0.6,
    nebulaA: new THREE.Color(0.95, 0.16, 0.62),
    nebulaB: new THREE.Color(0.08, 0.78, 0.9),
    nebulaC: new THREE.Color(0.52, 0.22, 1.0),
    nebulaStrength: 0.7,
    farStarStrength: 0.9,
    starSaturation: 1,
    starBrightness: 1.15,
    starCount: 110_000,
    anomalyStrength: 1,
    anomalyA: new THREE.Color(1.0, 0.45, 0.85),
    anomalyB: new THREE.Color(0.35, 0.95, 1.0),
  },
};

const MAX_STARS = 110_000;
const STAR_MIN_RADIUS = 6_000;
const STAR_MAX_RADIUS = 50_000;
/** Share of stars concentrated toward the galactic plane (matches the sky band). */
const STAR_PLANE_SHARE = 0.45;
const DUST_COUNT = 1_400;
const DUST_BOX = 700;
/** Sky cubemap face size: one-time bake cost scales with this squared. */
const SKY_CUBE_SIZE = 768;
/** Galactic plane normal: the Milky Way band sits across this. */
const GALACTIC_NORMAL = new THREE.Vector3(0.28, 0.9, -0.33).normalize();

// ── Shared GLSL ───────────────────────────────────────────────────────────
const NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
          mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
          mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * valueNoise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      amplitude *= 0.5;
    }
    return value;
  }
`;

// ── Sky (baked into a cubemap) ────────────────────────────────────────────
const skyVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const skyFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uBase;
  uniform vec3 uMilkyWayColor;
  uniform float uMilkyWayStrength;
  uniform float uDustLaneStrength;
  uniform vec3 uNebulaA;
  uniform vec3 uNebulaB;
  uniform vec3 uNebulaC;
  uniform float uNebulaStrength;
  uniform float uFarStarStrength;
  uniform vec3 uGalacticNormal;
  varying vec3 vDirection;
  ${NOISE_GLSL}

  // Tiny, dense far stars: one candidate per cell of a fine 3D grid.
  float farStars(vec3 d, float scale, float threshold) {
    vec3 p = d * scale;
    vec3 cell = floor(p);
    float h = hash13(cell);
    if (h < threshold) return 0.0;
    vec3 jitter = vec3(hash13(cell + 11.0), hash13(cell + 23.0), hash13(cell + 37.0));
    vec3 starPos = cell + 0.2 + 0.6 * jitter;
    float dist = length(p - starPos);
    float brightness = pow((h - threshold) / (1.0 - threshold), 3.0);
    return brightness * smoothstep(0.09, 0.0, dist);
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDirection);
    vec3 color = uBase;

    // Milky Way: a soft band around the galactic plane, clumpy, with dark
    // dust lanes down its middle.
    float planeDist = dot(d, uGalacticNormal);
    float band = exp(-pow(planeDist / 0.2, 2.0));
    float core = exp(-pow(planeDist / 0.07, 2.0));
    float clumps = fbm(d * 3.2 + 4.0);
    float fine = fbm(d * 11.0 + 17.0);
    float glow = band * (0.35 + 0.9 * clumps) * (0.6 + 0.5 * fine) + core * 0.6 * clumps;
    float lanes = smoothstep(0.45, 0.75, fbm(d * 6.5 + 31.0)) * exp(-pow(planeDist / 0.1, 2.0));
    glow *= 1.0 - uDustLaneStrength * lanes;
    color += uMilkyWayColor * glow * uMilkyWayStrength * 0.12;

    // Nebula clouds: large soft structures, colored by a second field.
    float cloud = fbm(d * 1.8 + 50.0);
    cloud = smoothstep(0.48, 0.85, cloud);
    float wisps = fbm(d * 7.0 + 71.0);
    float hueField = fbm(d * 1.3 + 90.0);
    vec3 nebula = mix(mix(uNebulaA, uNebulaB, smoothstep(0.35, 0.6, hueField)), uNebulaC,
                      smoothstep(0.55, 0.8, wisps));
    color += nebula * cloud * (0.45 + 0.8 * wisps) * uNebulaStrength * 0.1;

    // Dense far star field, a bit denser along the band.
    float stars = farStars(d, 380.0, 0.985 - band * 0.012) + farStars(d, 900.0, 0.994 - band * 0.004) * 0.6;
    vec3 starTint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.75), hash13(floor(d * 380.0) + 5.0));
    color += starTint * stars * uFarStarStrength * 0.55;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Sky dome radius: inside the camera's far plane (90k), outside everything else. */
const SKY_DOME_RADIUS = 40_000;

const domeVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const domeFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform samplerCube uSky;
  varying vec3 vDirection;
  void main() {
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(textureCube(uSky, normalize(vDirection)).rgb, 1.0);
  }
`;

// ── 3D stars ──────────────────────────────────────────────────────────────
const starVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 aColor;
  attribute float aMagnitude;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSaturation;
  uniform float uBrightness;
  varying vec3 vColor;
  varying float vIntensity;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float dist = max(1.0, -mvPosition.z);
    // Nearer stars read a little larger and brighter (parallax cue).
    float nearBoost = clamp(9000.0 / dist, 0.7, 2.2);
    float twinkle = 0.86 + 0.14 * sin(uTime * (0.6 + aPhase * 1.4) + aPhase * 40.0);
    vIntensity = aMagnitude * twinkle * uBrightness * clamp(nearBoost, 0.8, 1.6);
    gl_PointSize = clamp((0.9 + aMagnitude * 2.6) * nearBoost, 1.0, 5.0) * uPixelRatio;
    float grey = dot(aColor, vec3(0.299, 0.587, 0.114));
    vColor = mix(vec3(grey), aColor, uSaturation);
    #include <logdepthbuf_vertex>
  }
`;

const starFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying vec3 vColor;
  varying float vIntensity;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    float core = smoothstep(0.5, 0.0, r);
    float falloff = core * core;
    // Kept just under the bloom threshold except the brightest few.
    gl_FragColor = vec4(vColor * falloff * vIntensity * 0.85, 1.0);
  }
`;

// ── Near-space dust ───────────────────────────────────────────────────────
const dustVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform vec3 uCamera;
  uniform float uBox;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    // Wrap each speck into a box that moves with the camera.
    vec3 local = mod(position - uCamera + uBox * 0.5, uBox) - uBox * 0.5;
    vec4 mvPosition = viewMatrix * vec4(uCamera + local, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float dist = length(local);
    vAlpha = (1.0 - smoothstep(uBox * 0.2, uBox * 0.5, dist)) * smoothstep(2.0, 12.0, dist);
    gl_PointSize = clamp(90.0 / max(dist, 1.0), 1.0, 3.0) * uPixelRatio;
    #include <logdepthbuf_vertex>
  }
`;

const dustFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uStrength;
  varying float vAlpha;
  void main() {
    #include <logdepthbuf_fragment>
    float r = length(gl_PointCoord - 0.5);
    float soft = smoothstep(0.5, 0.1, r);
    gl_FragColor = vec4(vec3(0.7, 0.78, 0.9) * soft * vAlpha * uStrength * 0.25, 1.0);
  }
`;

// ── Anomalies (camera-facing cards) ───────────────────────────────────────
const anomalyVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const anomalyFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform int uKind; // 0 galaxy, 1 nebula, 2 black hole
  uniform float uSeed;
  uniform float uTilt;
  uniform float uTime;
  uniform float uStrength;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = (vUv - 0.5) * 2.0;
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    if (uKind == 0) {
      // Spiral galaxy seen at a tilt.
      vec2 q = vec2(p.x, p.y / uTilt);
      float r = length(q);
      float angle = atan(q.y, q.x);
      float arms = pow(0.5 + 0.5 * cos(2.0 * angle - log(r + 0.02) * 4.2 + uSeed * 6.28), 3.0);
      float noise = fbm(vec3(q * 4.0, uSeed * 10.0));
      float disk = exp(-r * 3.2) * (0.35 + 0.9 * arms * (0.5 + noise));
      float bulge = exp(-r * 14.0);
      color = mix(uColorB, uColorA, clamp(bulge * 2.0 + (1.0 - r), 0.0, 1.0)) * (disk + bulge * 1.4);
      alpha = clamp((disk + bulge) * 1.2, 0.0, 1.0) * smoothstep(1.0, 0.7, r);
    } else if (uKind == 1) {
      // Nebula: layered noise with a soft, irregular edge.
      float r = length(p);
      vec3 s = vec3(p * 1.6, uSeed * 13.0);
      float cloud = fbm(s + fbm(s * 1.5) * 1.2);
      float edge = smoothstep(1.0, 0.25, r + (cloud - 0.5) * 0.6);
      float density = smoothstep(0.35, 0.8, cloud) * edge;
      color = mix(uColorA, uColorB, smoothstep(0.4, 0.75, fbm(s * 2.3 + 5.0))) * density;
      alpha = density;
    } else {
      // Black hole: dark core, tilted accretion disk brighter on one side,
      // thin photon ring.
      float r = length(p);
      vec2 q = vec2(p.x, p.y / 0.32);
      float rd = length(q);
      float angle = atan(q.y, q.x);
      float doppler = 1.0 + 0.7 * cos(angle - 0.4);
      float swirl = fbm(vec3(rd * 6.0 - uTime * 0.05, angle * 2.0, uSeed));
      float disk = exp(-pow((rd - 0.55) / 0.22, 2.0)) * doppler * (0.5 + swirl);
      float ring = exp(-pow((r - 0.2) / 0.018, 2.0)) * 1.4;
      float halo = exp(-r * 5.0) * 0.25;
      color = mix(uColorA, uColorB, 0.3) * (disk + ring + halo);
      float core = 1.0 - smoothstep(0.15, 0.19, r);
      alpha = clamp(disk + ring + halo, 0.0, 1.0) * smoothstep(1.0, 0.8, r);
      color *= 1.0 - core;
      alpha = max(alpha, core * smoothstep(1.0, 0.8, r));
    }
    gl_FragColor = vec4(color * uStrength, alpha * uStrength);
  }
`;

type AnomalyDef = {
  kind: 0 | 1 | 2;
  direction: THREE.Vector3;
  distance: number;
  size: number;
  tilt: number;
  seed: number;
  colors: "a" | "b" | "mixed";
};

/** Far from destinations (which sit within ~34k of the sun). */
const ANOMALIES: AnomalyDef[] = [
  { kind: 0, direction: new THREE.Vector3(-0.6, 0.55, -0.58), distance: 46_000, size: 9_000, tilt: 0.45, seed: 0.21, colors: "mixed" },
  { kind: 0, direction: new THREE.Vector3(0.7, -0.35, 0.62), distance: 47_000, size: 5_500, tilt: 0.8, seed: 0.67, colors: "mixed" },
  { kind: 1, direction: new THREE.Vector3(0.2, 0.35, 0.92), distance: 44_000, size: 16_000, tilt: 1, seed: 0.13, colors: "a" },
  { kind: 1, direction: new THREE.Vector3(-0.85, -0.2, 0.48), distance: 45_000, size: 12_000, tilt: 1, seed: 0.58, colors: "b" },
  { kind: 1, direction: new THREE.Vector3(0.55, 0.7, -0.45), distance: 45_000, size: 10_000, tilt: 1, seed: 0.91, colors: "mixed" },
  { kind: 2, direction: new THREE.Vector3(-0.25, -0.62, -0.74), distance: 43_000, size: 7_000, tilt: 1, seed: 0.37, colors: "mixed" },
];

export class UniverseBackdrop {
  readonly group = new THREE.Group();
  private readonly renderer: THREE.WebGLRenderer;
  private style: BackdropStyle | null = null;
  /**
   * The baked sky, drawn on a large camera-following sphere. (Using the
   * cubemap as scene.background hid every 3D object with this renderer
   * setup, so it's drawn as the first opaque object instead.)
   */
  private readonly skyDome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

  private readonly skyTarget = new THREE.WebGLCubeRenderTarget(SKY_CUBE_SIZE, {
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
  });
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly skyMesh: THREE.Mesh;
  private readonly skyScene = new THREE.Scene();
  private readonly skyCamera: THREE.CubeCamera;

  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly dust: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly anomalies: Array<{
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    def: AnomalyDef;
  }> = [];

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.group.name = "UniverseBackdrop";

    // Sky bake setup.
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uBase: { value: new THREE.Color() },
        uMilkyWayColor: { value: new THREE.Color() },
        uMilkyWayStrength: { value: 0 },
        uDustLaneStrength: { value: 0 },
        uNebulaA: { value: new THREE.Color() },
        uNebulaB: { value: new THREE.Color() },
        uNebulaC: { value: new THREE.Color() },
        uNebulaStrength: { value: 0 },
        uFarStarStrength: { value: 0 },
        uGalacticNormal: { value: GALACTIC_NORMAL.clone() },
      },
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMaterial);
    this.skyScene.add(this.skyMesh);
    this.skyCamera = new THREE.CubeCamera(0.1, 100, this.skyTarget);

    // Sky dome: samples the baked cubemap by direction; follows the camera so
    // it always reads as infinitely far away.
    const domeMaterial = new THREE.ShaderMaterial({
      vertexShader: domeVertexShader,
      fragmentShader: domeFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      uniforms: { uSky: { value: this.skyTarget.texture } },
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), domeMaterial);
    this.skyDome.name = "UniverseSkyDome";
    this.skyDome.scale.setScalar(SKY_DOME_RADIUS);
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -1000;
    this.skyDome.onBeforeRender = (_renderer, _scene, camera) => {
      camera.getWorldPosition(this.skyDome.position);
      this.skyDome.updateMatrixWorld();
    };
    this.group.add(this.skyDome);

    this.stars = this.buildStars();
    this.dust = this.buildDust();
    this.group.add(this.stars, this.dust);
    this.buildAnomalies();

    this.group.visible = false;
    scene.add(this.group);
  }

  /** Show the 3D universe in a given look (re-bakes the sky only when it changes). */
  setStyle(style: BackdropStyle): void {
    const settings = STYLES[style];
    if (this.style !== style) {
      this.style = style;
      const u = this.skyMaterial.uniforms;
      (u.uBase.value as THREE.Color).copy(settings.skyBase);
      (u.uMilkyWayColor.value as THREE.Color).copy(settings.milkyWayColor);
      u.uMilkyWayStrength.value = settings.milkyWayStrength;
      u.uDustLaneStrength.value = settings.dustLaneStrength;
      (u.uNebulaA.value as THREE.Color).copy(settings.nebulaA);
      (u.uNebulaB.value as THREE.Color).copy(settings.nebulaB);
      (u.uNebulaC.value as THREE.Color).copy(settings.nebulaC);
      u.uNebulaStrength.value = settings.nebulaStrength;
      u.uFarStarStrength.value = settings.farStarStrength;
      this.bakeSky();

      const s = this.stars.material.uniforms;
      s.uSaturation.value = settings.starSaturation;
      s.uBrightness.value = settings.starBrightness;
      this.stars.geometry.setDrawRange(0, Math.min(MAX_STARS, settings.starCount));

      for (const { mesh, def } of this.anomalies) {
        const a = mesh.material.uniforms;
        a.uStrength.value = settings.anomalyStrength;
        const first = def.colors === "b" ? settings.nebulaB : def.colors === "a" ? settings.nebulaA : settings.anomalyA;
        const second = def.colors === "b" ? settings.nebulaC : def.colors === "a" ? settings.nebulaC : settings.anomalyB;
        (a.uColorA.value as THREE.Color).copy(first);
        (a.uColorB.value as THREE.Color).copy(second);
      }
    }
    this.group.visible = true;
  }

  /** Hide everything (the lightbox is in use, or the background is off). */
  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.hide();
    this.group.removeFromParent();
    this.skyTarget.dispose();
    this.skyMaterial.dispose();
    this.skyMesh.geometry.dispose();
    this.skyDome.geometry.dispose();
    this.skyDome.material.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    this.dust.geometry.dispose();
    this.dust.material.dispose();
    for (const { mesh } of this.anomalies) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  private bakeSky(): void {
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    this.skyCamera.update(renderer, this.skyScene);
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
  }

  private buildStars(): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const positions = new Float32Array(MAX_STARS * 3);
    const colors = new Float32Array(MAX_STARS * 3);
    const magnitudes = new Float32Array(MAX_STARS);
    const phases = new Float32Array(MAX_STARS);
    const direction = new THREE.Vector3();
    const color = new THREE.Color();
    // Stellar colors from hot blue to cool red, weighted toward sun-like stars.
    const palette = [
      { color: new THREE.Color(0.62, 0.72, 1.0), weight: 0.08 },
      { color: new THREE.Color(0.8, 0.86, 1.0), weight: 0.16 },
      { color: new THREE.Color(1.0, 0.98, 0.95), weight: 0.3 },
      { color: new THREE.Color(1.0, 0.9, 0.72), weight: 0.24 },
      { color: new THREE.Color(1.0, 0.76, 0.52), weight: 0.14 },
      { color: new THREE.Color(1.0, 0.6, 0.45), weight: 0.08 },
    ];
    const pickColor = () => {
      let roll = Math.random();
      for (const entry of palette) {
        roll -= entry.weight;
        if (roll <= 0) return entry.color;
      }
      return palette[2].color;
    };
    const tangent = new THREE.Vector3().crossVectors(GALACTIC_NORMAL, new THREE.Vector3(1, 0, 0)).normalize();
    const bitangent = new THREE.Vector3().crossVectors(GALACTIC_NORMAL, tangent).normalize();

    for (let i = 0; i < MAX_STARS; i++) {
      if (Math.random() < STAR_PLANE_SHARE) {
        // Concentrated toward the galactic plane.
        const angle = Math.random() * Math.PI * 2;
        const offset = (Math.random() + Math.random() - 1) * 0.18;
        direction
          .copy(tangent)
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(bitangent, Math.sin(angle))
          .addScaledVector(GALACTIC_NORMAL, offset)
          .normalize();
      } else {
        direction.randomDirection();
      }
      const radius = THREE.MathUtils.lerp(STAR_MIN_RADIUS, STAR_MAX_RADIUS, Math.pow(Math.random(), 0.7));
      positions.set([direction.x * radius, direction.y * radius, direction.z * radius], i * 3);
      color.copy(pickColor());
      colors.set([color.r, color.g, color.b], i * 3);
      // Many faint stars, few bright ones.
      magnitudes[i] = 0.18 + Math.pow(Math.random(), 7) * 1.1;
      phases[i] = Math.random();
    }
    // Shuffle-free draw range: lower counts just draw fewer (already random).
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aMagnitude", new THREE.BufferAttribute(magnitudes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), STAR_MAX_RADIUS);

    const material = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uSaturation: { value: 0.35 },
        uBrightness: { value: 1 },
      },
    });
    const stars = new THREE.Points(geometry, material);
    stars.name = "UniverseStars";
    stars.frustumCulled = false;
    stars.renderOrder = -900;
    stars.onBeforeRender = (renderer) => {
      material.uniforms.uTime.value = performance.now() / 1000;
      material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    };
    return stars;
  }

  private buildDust(): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const positions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      positions.set(
        [(Math.random() - 0.5) * DUST_BOX, (Math.random() - 0.5) * DUST_BOX, (Math.random() - 0.5) * DUST_BOX],
        i * 3,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.ShaderMaterial({
      vertexShader: dustVertexShader,
      fragmentShader: dustFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uCamera: { value: new THREE.Vector3() },
        uBox: { value: DUST_BOX },
        uPixelRatio: { value: 1 },
        uStrength: { value: 1 },
      },
    });
    const dust = new THREE.Points(geometry, material);
    dust.name = "UniverseDust";
    dust.frustumCulled = false;
    dust.renderOrder = -800;
    dust.onBeforeRender = (renderer, _scene, camera) => {
      camera.getWorldPosition(material.uniforms.uCamera.value as THREE.Vector3);
      material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    };
    return dust;
  }

  private buildAnomalies(): void {
    for (const def of ANOMALIES) {
      const material = new THREE.ShaderMaterial({
        vertexShader: anomalyVertexShader,
        fragmentShader: anomalyFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: def.kind === 2 ? THREE.NormalBlending : THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: {
          uKind: { value: def.kind },
          uSeed: { value: def.seed },
          uTilt: { value: def.tilt },
          uTime: { value: 0 },
          uStrength: { value: 1 },
          uColorA: { value: new THREE.Color(1, 1, 1) },
          uColorB: { value: new THREE.Color(1, 1, 1) },
        },
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(def.size, def.size), material);
      mesh.name = `UniverseAnomaly_${def.kind}`;
      mesh.position.copy(def.direction.clone().normalize().multiplyScalar(def.distance));
      mesh.frustumCulled = false;
      mesh.renderOrder = -850;
      // Always face the viewer.
      mesh.onBeforeRender = (_renderer, _scene, camera) => {
        mesh.quaternion.copy(camera.quaternion);
        mesh.updateMatrixWorld();
        material.uniforms.uTime.value = performance.now() / 1000;
      };
      this.group.add(mesh);
      this.anomalies.push({ mesh, def });
    }
  }
}
