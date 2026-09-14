import * as THREE from "three";
import type { CosmicPathCurve } from "./cosmicRoute";

/**
 * GPU particle stream for the About cosmic path.
 *
 * The route is baked once per visit into a float texture (evenly spaced by
 * arc length). Each particle only stores fixed random seeds; the vertex
 * shader derives where it is from a handful of uniforms, so forming, holding
 * and bursting cost no per-particle CPU work regardless of particle count.
 */

const PATH_TEXTURE_SAMPLES = 4096;
const TRAIL_RADIUS = 35;
/** Particles per unit of legacy path length (10,400 over the legacy loop). */
const HOLD_PARTICLES_AT_REFERENCE = 10_400;
const MIN_PARTICLES = 10_400;
const MAX_PARTICLES = 36_000;
const PARTICLE_MIN_SPEED = 0.6;
const PARTICLE_MAX_SPEED = 1.4;
const POINT_SIZE = 4;

const PROFILE_DWELL_MIN_MS = 7000;
const PROFILE_DWELL_MAX_MS = 16000;
const PROFILE_BLEND_MS = 1800;

const BURST_SPEED_MIN = 260;
const BURST_SPEED_MAX = 760;
const BURST_DRAG = 0.055;
/** Seconds for the burst wave to run from the rider around to the far side. */
const BURST_WAVE_SECONDS = 2.2;
const BURST_FADE_RATE = 0.45;
const BURST_SEED_MIN = 0.4;
const BURST_SEED_MAX = 2.8;
const BURST_VISIBLE_FLOOR = 0.05;
const BURST_DURATION_S =
  BURST_WAVE_SECONDS +
  Math.log(BURST_SEED_MAX / BURST_VISIBLE_FLOOR) / BURST_FADE_RATE;

// Pulse profiles for the completed path (same values as the original CPU version).
// [mode(0 avg / 1 max), timeA, spatialA, phaseA, timeB, spatialB, phaseB,
//  surgeTime, surgeSpatial, surgePhase, surgePow, surgeWeight,
//  sizeBase, sizeAmp, brightnessBase, brightnessAmp, saturationBase, saturationAmp]
const PULSE_PROFILES: number[][] = [
  [0, 2.1, 34, 0.1, 2.9, 47, 1.7, 0.22, 12, 0, 6, 0.1, 0.98, 0.56, 0.5, 0.22, 0.7, 0.14],
  [1, 5.8, 86, 0.5, 7.4, 126, 2.3, 0.5, 26, 1.2, 3.2, 0.22, 0.92, 0.92, 0.5, 0.32, 0.72, 0.2],
  [0, 1.35, 28, 0.2, 1.9, 42, 2.9, 0.16, 8, 0.7, 9, 0.35, 0.95, 0.48, 0.48, 0.2, 0.68, 0.12],
];
export const PULSE_PROFILE_NAMES = ["Majestic Wave", "Conduit Surge", "Subtle Glow"];

const MODE_FORMING = 0;
const MODE_HOLD = 1;
const MODE_BURST = 2;

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>

  uniform highp sampler2D uPath;
  uniform float uSamples;
  uniform float uLength;
  uniform float uSpatialLength;
  uniform float uMode;
  uniform float uFormTime;
  uniform float uHeadDist;
  uniform float uHeadSpeed;
  uniform float uEmitRate;
  uniform float uHoldTime;
  uniform float uCrystal;
  uniform float uElapsed;
  uniform float uHeadGlowDist;
  uniform float uProfileA[18];
  uniform float uProfileB[18];
  uniform float uProfileBlend;
  uniform float uBurstTime;
  uniform float uBurstOriginDist;
  uniform float uBurstWaveSpeed;
  uniform float uPointScale;

  attribute vec4 aSeed;   // hold distance (0..1), speed, burst seed size, hue
  attribute vec4 aSpread; // angle, forming radius, hold radius, emit order
  attribute vec4 aBurst;  // random dir xyz, speed

  varying vec3 vColor;
  varying float vFade;

  vec3 samplePath(float dist) {
    float u = fract(dist / uLength) * uSamples;
    float i0 = floor(u);
    float f = u - i0;
    int a = int(mod(i0, uSamples));
    int b = int(mod(i0 + 1.0, uSamples));
    vec3 p0 = texelFetch(uPath, ivec2(a, 0), 0).xyz;
    vec3 p1 = texelFetch(uPath, ivec2(b, 0), 0).xyz;
    return mix(p0, p1, f);
  }

  float holdPulse(float p[18], float t) {
    float waveA = sin(uElapsed * p[1] - t * p[2] + p[3]) * 0.5 + 0.5;
    float waveB = sin(uElapsed * p[4] - t * p[5] + p[6]) * 0.5 + 0.5;
    float base = p[0] > 0.5 ? max(waveA, waveB) : (waveA + waveB) * 0.5;
    float surgeRaw = sin(uElapsed * p[7] - t * p[8] + p[9]) * 0.5 + 0.5;
    return clamp(base + pow(surgeRaw, p[10]) * p[11], 0.0, 1.0);
  }

  vec3 hsl2rgb(vec3 hsl) {
    vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
    return hsl.z + c * (rgb - 0.5);
  }

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }

  void main() {
    float dist;
    float radius;
    float angle;
    vFade = 1.0;

    if (uMode < 0.5) {
      // Stream out of the swarm toward the head; particles that overtake the
      // head start over from the origin.
      float emitAt = aSpread.w / uEmitRate;
      float age = uFormTime - emitAt;
      if (age < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
      }
      dist = mod(age * aSeed.y * uHeadSpeed, max(uHeadDist, 1.0));
      float st = dist / uSpatialLength;
      angle = aSpread.x + uElapsed * 1.5 + st * 8.0;
      radius = aSpread.y * (0.3 + 0.35 * sin(uElapsed * 4.0 + aSpread.w * 0.3) + 0.5);
      float headProximity = 1.0 - min(1.0, abs(dist - uHeadDist) / uHeadGlowDist);
      float shimmer = sin(uElapsed * 6.0 + st * 40.0) * 0.5 + 0.5;
      float hue = fract(aSeed.w + st * 0.15 + uElapsed * 0.01);
      vColor = hsl2rgb(vec3(hue, 0.7 + headProximity * 0.25,
        0.55 + headProximity * 0.35 + shimmer * 0.1));
    } else {
      dist = aSeed.x * uLength;
      float st = dist / uSpatialLength;
      angle = aSpread.x + st * 1.8;
      float settle = 1.0 - exp(-uHoldTime * (5.0 + 17.0 * uCrystal));
      radius = mix(aSpread.z, ${TRAIL_RADIUS.toFixed(1)} * 0.12, settle);
      float pulseA = holdPulse(uProfileA, st);
      float pulseB = holdPulse(uProfileB, st);
      float pulse = mix(pulseB, pulseA, uProfileBlend);
      float shimmer = sin(uElapsed * 6.0 + st * 40.0) * 0.5 + 0.5;
      float hue = fract(aSeed.w + st * 0.15 + uElapsed * 0.01);
      vColor = hsl2rgb(vec3(hue,
        uProfileA[16] + pulse * uProfileA[17],
        uProfileA[14] + pulse * uProfileA[15] + shimmer * 0.08));
    }

    vec3 position = samplePath(dist) +
      vec3(cos(angle) * radius, sin(angle) * radius, cos(angle + 1.57) * radius);

    if (uMode > 1.5) {
      // Burst wave runs outward from the rider along the rail in both directions.
      float along = abs(dist - uBurstOriginDist);
      along = min(along, uLength - along);
      float tau = max(0.0, uBurstTime - along / uBurstWaveSpeed);
      if (tau > 0.0) {
        vec3 tangent = normalize(samplePath(dist + uLength / uSamples) - samplePath(dist));
        vec3 dir = normalize(aBurst.xyz + tangent * 0.9);
        position += dir * aBurst.w * (1.0 - exp(-${BURST_DRAG} * tau)) / ${BURST_DRAG};
        float seedSize = aSeed.z * exp(-${BURST_FADE_RATE} * tau);
        vFade = smoothstep(${BURST_VISIBLE_FLOOR}, 0.45, seedSize);
        // Brief white-hot flash as the wave passes, cooling into color.
        float flash = exp(-tau * 3.2);
        vColor = mix(vColor, vec3(1.0), flash * 0.65) * (1.0 + flash * 0.8);
      }
    }

    vColor = srgbToLinear(clamp(vColor, 0.0, 1.0)) * (vFade > 0.0 ? 1.0 : 0.0);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = vFade <= 0.001 ? 0.0 : ${POINT_SIZE.toFixed(1)} * (uPointScale / -mvPosition.z);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying vec3 vColor;
  varying float vFade;
  void main() {
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(vColor * vFade, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface AboutPathParticlesFrame {
  loopCompleteEdge: boolean;
  burstCompleteEdge: boolean;
}

export interface AboutPathParticlesDebug {
  particleCount: number;
  headT: number;
  complete: boolean;
  hold: boolean;
  profileIndex: number;
  nextProfileSwitchInMs: number;
}

export class AboutPathParticles {
  readonly points: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private pathTexture: THREE.DataTexture | null = null;
  private curve: CosmicPathCurve | null = null;
  private count = 0;
  private mode = MODE_FORMING;
  private formTime = 0;
  private complete = false;
  private holdTime = 0;
  private burstTime = 0;
  private burstEndSignaled = false;
  private profileIndex = 0;
  private prevProfileIndex = 0;
  private blendStartedAt = 0;
  private blendUntil = 0;
  private switchAt = 0;
  private readonly drawSize = new THREE.Vector2();

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPath: { value: null },
        uSamples: { value: PATH_TEXTURE_SAMPLES },
        uLength: { value: 1 },
        uSpatialLength: { value: 1 },
        uMode: { value: MODE_FORMING },
        uFormTime: { value: 0 },
        uHeadDist: { value: 0 },
        uHeadSpeed: { value: 1 },
        uEmitRate: { value: 1 },
        uHoldTime: { value: 0 },
        uCrystal: { value: 0 },
        uElapsed: { value: 0 },
        uHeadGlowDist: { value: 1 },
        uProfileA: { value: PULSE_PROFILES[0].slice() },
        uProfileB: { value: PULSE_PROFILES[0].slice() },
        uProfileBlend: { value: 1 },
        uBurstTime: { value: 0 },
        uBurstOriginDist: { value: 0 },
        uBurstWaveSpeed: { value: 1 },
        uPointScale: { value: 1 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = "AboutPathParticles";
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.visible = false;
    this.points.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(this.drawSize);
      this.material.uniforms.uPointScale.value = this.drawSize.y * 0.5;
    };
    this.allocate(MIN_PARTICLES);
  }

  /** Builds the particle buffers once per capacity so a path start never allocates. */
  private allocate(count: number): void {
    this.count = count;
    const seed = new Float32Array(count * 4);
    const spread = new Float32Array(count * 4);
    const burst = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const i4 = i * 4;
      seed[i4] = (i + Math.random() * 0.35) / count;
      seed[i4 + 1] =
        PARTICLE_MIN_SPEED + Math.random() * (PARTICLE_MAX_SPEED - PARTICLE_MIN_SPEED);
      seed[i4 + 2] = BURST_SEED_MIN + Math.random() * (BURST_SEED_MAX - BURST_SEED_MIN);
      seed[i4 + 3] = Math.random();
      spread[i4] = Math.random() * Math.PI * 2;
      spread[i4 + 1] = Math.sqrt(Math.random()) * TRAIL_RADIUS;
      spread[i4 + 2] = Math.pow(Math.random(), 0.6) * TRAIL_RADIUS;
      spread[i4 + 3] = i;
      burst[i4] = Math.random() - 0.5;
      burst[i4 + 1] = Math.random() - 0.5;
      burst[i4 + 2] = Math.random() - 0.5;
      burst[i4 + 3] = BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN);
    }
    // Shuffle emit order so the stream isn't sorted by hold slot.
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = spread[i * 4 + 3];
      spread[i * 4 + 3] = spread[j * 4 + 3];
      spread[j * 4 + 3] = tmp;
    }
    for (const name of ["position", "aSeed", "aSpread", "aBurst"]) {
      this.geometry.deleteAttribute(name);
    }
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    );
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    this.geometry.setAttribute("aSpread", new THREE.BufferAttribute(spread, 4));
    this.geometry.setAttribute("aBurst", new THREE.BufferAttribute(burst, 4));
    this.geometry.setDrawRange(0, count);
  }

  /** Bakes the route and starts forming. `origin` is the points' world position. */
  begin(curve: CosmicPathCurve, origin: THREE.Vector3): void {
    const { timing } = curve;
    this.curve = curve;
    const wanted = THREE.MathUtils.clamp(
      Math.round((HOLD_PARTICLES_AT_REFERENCE * timing.length) / timing.referenceLength),
      MIN_PARTICLES,
      MAX_PARTICLES,
    );
    if (wanted > this.count) this.allocate(wanted);
    this.geometry.setDrawRange(0, wanted);

    const data = new Float32Array(PATH_TEXTURE_SAMPLES * 4);
    const point = new THREE.Vector3();
    for (let i = 0; i < PATH_TEXTURE_SAMPLES; i++) {
      curve.getPointAt(i / PATH_TEXTURE_SAMPLES, point).sub(origin);
      data[i * 4] = point.x;
      data[i * 4 + 1] = point.y;
      data[i * 4 + 2] = point.z;
      data[i * 4 + 3] = 1;
    }
    this.pathTexture?.dispose();
    const texture = new THREE.DataTexture(
      data,
      PATH_TEXTURE_SAMPLES,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.pathTexture = texture;

    const u = this.material.uniforms;
    u.uPath.value = texture;
    u.uLength.value = timing.length;
    u.uSpatialLength.value = timing.referenceLength;
    u.uHeadSpeed.value = timing.headSpeed;
    u.uHeadGlowDist.value = timing.referenceLength / 15;
    // Fill the stream within about two thirds of the formation time.
    u.uEmitRate.value = wanted / Math.max(1, timing.formSeconds * 0.65);
    u.uBurstWaveSpeed.value = timing.length / 2 / BURST_WAVE_SECONDS;

    this.mode = MODE_FORMING;
    this.formTime = 0;
    this.complete = false;
    this.holdTime = 0;
    this.burstTime = 0;
    this.burstEndSignaled = false;
    this.points.visible = true;
  }

  /** True while a route is baked and still on screen. */
  get active(): boolean {
    return this.curve !== null && this.points.visible;
  }

  forceComplete(): void {
    if (!this.curve) return;
    this.formTime = this.curve.timing.formSeconds;
    this.complete = true;
  }

  /** Starts the burst wave from `originT` (0..1 along the route). */
  burst(originT: number): void {
    if (!this.curve || this.mode === MODE_BURST) return;
    if (this.mode === MODE_FORMING) this.startHold();
    this.mode = MODE_BURST;
    this.burstTime = 0;
    this.burstEndSignaled = false;
    this.material.uniforms.uBurstOriginDist.value =
      THREE.MathUtils.euclideanModulo(originT, 1) * this.curve.timing.length;
  }

  private startHold(): void {
    this.mode = MODE_HOLD;
    this.holdTime = 0;
    const now = performance.now();
    this.profileIndex = Math.floor(Math.random() * PULSE_PROFILES.length);
    this.prevProfileIndex = this.profileIndex;
    this.blendStartedAt = now;
    this.blendUntil = now;
    this.switchAt = now + this.randomDwell();
  }

  private randomDwell(): number {
    return PROFILE_DWELL_MIN_MS + Math.random() * (PROFILE_DWELL_MAX_MS - PROFILE_DWELL_MIN_MS);
  }

  /**
   * `holding` is true once the journey leaves PATH_FORMING (the stream stops
   * and the loop locks into the pulsing crystal beam).
   */
  update(
    dt: number,
    elapsed: number,
    holding: boolean,
    crystalProgress: number,
  ): AboutPathParticlesFrame {
    const frame = { loopCompleteEdge: false, burstCompleteEdge: false };
    if (!this.curve || !this.points.visible) return frame;
    const u = this.material.uniforms;
    const { timing } = this.curve;

    if (!this.complete) {
      this.formTime += dt;
      if (this.formTime * timing.headSpeed >= timing.length) {
        this.complete = true;
        frame.loopCompleteEdge = true;
      }
    }
    if (holding && this.complete && this.mode === MODE_FORMING) this.startHold();

    if (this.mode !== MODE_FORMING) {
      this.holdTime += dt;
      const now = performance.now();
      if (now >= this.switchAt) {
        this.prevProfileIndex = this.profileIndex;
        this.profileIndex =
          (this.profileIndex + 1 + Math.floor(Math.random() * (PULSE_PROFILES.length - 1))) %
          PULSE_PROFILES.length;
        this.blendStartedAt = now;
        this.blendUntil = now + PROFILE_BLEND_MS;
        this.switchAt = now + this.randomDwell();
      }
      const blend =
        now < this.blendUntil && this.prevProfileIndex !== this.profileIndex
          ? THREE.MathUtils.smootherstep(
              (now - this.blendStartedAt) / (this.blendUntil - this.blendStartedAt),
              0,
              1,
            )
          : 1;
      (u.uProfileA.value as number[]).splice(0, 18, ...PULSE_PROFILES[this.profileIndex]);
      (u.uProfileB.value as number[]).splice(0, 18, ...PULSE_PROFILES[this.prevProfileIndex]);
      u.uProfileBlend.value = blend;
    }

    if (this.mode === MODE_BURST) {
      this.burstTime += dt;
      if (!this.burstEndSignaled && this.burstTime >= BURST_DURATION_S) {
        this.burstEndSignaled = true;
        frame.burstCompleteEdge = true;
        this.points.visible = false;
      }
    }

    u.uMode.value = this.mode;
    u.uFormTime.value = this.formTime;
    u.uHeadDist.value = Math.min(timing.length, this.formTime * timing.headSpeed);
    u.uHoldTime.value = this.holdTime;
    u.uCrystal.value = THREE.MathUtils.clamp(crystalProgress, 0, 1);
    u.uElapsed.value = elapsed;
    u.uBurstTime.value = this.burstTime;
    return frame;
  }

  /** Hides the stream and drops the baked route (keeps the particle buffers). */
  reset(): void {
    this.curve = null;
    this.points.visible = false;
    this.mode = MODE_FORMING;
    this.pathTexture?.dispose();
    this.pathTexture = null;
    this.material.uniforms.uPath.value = null;
  }

  /** Renders once off-screen-equivalent so the program links before first use. */
  compile(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const wasVisible = this.points.visible;
    this.points.visible = true;
    void renderer.compileAsync(this.points, camera, scene).finally(() => {
      this.points.visible = wasVisible;
    });
  }

  getDebugState(): AboutPathParticlesDebug {
    const length = this.curve?.timing.length ?? 1;
    const headSpeed = this.curve?.timing.headSpeed ?? 1;
    return {
      particleCount: this.geometry.drawRange.count,
      headT: Math.min(1, (this.formTime * headSpeed) / length),
      complete: this.complete,
      hold: this.mode !== MODE_FORMING,
      profileIndex: this.profileIndex,
      nextProfileSwitchInMs: Math.max(0, this.switchAt - performance.now()),
    };
  }

  dispose(): void {
    this.pathTexture?.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
