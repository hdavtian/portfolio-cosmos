import * as THREE from "three";

/**
 * A nebula cocoon around the Career Gallery with ion-storm light pulses.
 *
 * From afar the globe sits inside a dense, slowly swirling cloud (layered
 * camera-facing cards placed just in front of it, so nearer objects still
 * occlude it correctly). The cloud thins as the camera approaches and is
 * fully gone well before arrival; cards are hidden entirely once clear, so
 * there's no cost up close. Every few seconds a soft flash lights a random
 * spot inside the cloud.
 */

/** Fully shrouded beyond this many gallery radii; fully clear inside REVEAL_NEAR. */
const REVEAL_FAR_RADII = 9;
const REVEAL_NEAR_RADII = 4.5;
const MAX_OPACITY = 0.94;

type CardDef = {
  /** Depth in front of the gallery center, in radii (toward the camera). */
  depth: number;
  /** Lateral offset in radii (camera right / up). */
  right: number;
  up: number;
  size: number; // radii
  seed: number;
};

const CARDS: CardDef[] = [
  { depth: 1.25, right: 0, up: 0, size: 3.6, seed: 0.13 },
  { depth: 1.55, right: 0.55, up: -0.3, size: 2.8, seed: 0.41 },
  { depth: 1.05, right: -0.6, up: 0.35, size: 3.0, seed: 0.72 },
  { depth: 1.8, right: -0.2, up: -0.55, size: 2.4, seed: 0.88 },
  { depth: 0.9, right: 0.35, up: 0.6, size: 2.6, seed: 0.29 },
];

// Warm amber-gold and deep crimson, distinct from the universe's teal/pink
// nebulae, with electric blue-white ion pulses.
const COLOR_A = new THREE.Color(0.52, 0.3, 0.08);
const COLOR_B = new THREE.Color(0.38, 0.06, 0.1);
const PULSE_COLOR = new THREE.Color(0.62, 0.82, 1.0);
const PULSE_MIN_GAP_S = 2.2;
const PULSE_MAX_GAP_S = 5.5;

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uPulseColor;
  uniform float uPulse;
  uniform vec2 uPulseUv;
  varying vec2 vUv;

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

  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float t = uTime * 0.03;
    vec2 swirl = vec2(sin(t + uSeed * 6.0), cos(t * 0.7 + uSeed * 3.0)) * 0.18;
    vec3 s = vec3(p * 1.4 + swirl, uSeed * 11.0 + t * 0.5);
    float cloud = fbm(s + fbm(s * 1.7 + t * 0.3) * 1.3);
    float edge = smoothstep(1.0, 0.3, r + (cloud - 0.5) * 0.5);
    float density = smoothstep(0.28, 0.72, cloud) * edge;
    vec3 color = mix(uColorA, uColorB, smoothstep(0.35, 0.7, fbm(s * 2.1 + 3.0)));
    color *= 0.35 + 0.65 * density;
    // Ion-storm pulse: light blooming from inside the cloud.
    float glow = exp(-length(p - uPulseUv) * 3.2) * uPulse;
    color += uPulseColor * glow * (0.4 + density) * 1.3;
    float alpha = clamp(density * uOpacity + glow * 0.25 * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

type Card = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  def: CardDef;
};

export class GalleryShroud {
  readonly group = new THREE.Group();
  private readonly center: THREE.Vector3;
  private readonly radius: number;
  private readonly cards: Card[] = [];
  private time = 0;
  private nextPulseIn = 1.5;
  private pulseCard = 0;
  private pulseAge = 99;
  private pulseDouble = false;
  private readonly toCamera = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();

  constructor(center: THREE.Vector3, radius: number) {
    this.center = center.clone();
    this.radius = radius;
    this.group.name = "CareerGalleryShroud";
    for (const def of CARDS) {
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: def.seed },
          uOpacity: { value: MAX_OPACITY },
          uColorA: { value: COLOR_A.clone() },
          uColorB: { value: COLOR_B.clone() },
          uPulseColor: { value: PULSE_COLOR.clone() },
          uPulse: { value: 0 },
          uPulseUv: { value: new THREE.Vector2() },
        },
      });
      const size = def.size * radius;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
      mesh.name = "CareerGalleryShroudCard";
      // After the gallery's own tiles (which are transparent, renderOrder 0).
      mesh.renderOrder = 30;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.cards.push({ mesh, def });
    }
  }

  /** Call once per frame with the main camera. */
  update(dt: number, camera: THREE.Camera): void {
    const step = Math.min(dt, 0.1);
    this.time += step;
    camera.getWorldPosition(this.cameraPosition);
    const distance = this.cameraPosition.distanceTo(this.center);
    const reveal = THREE.MathUtils.smoothstep(
      distance,
      this.radius * REVEAL_NEAR_RADII,
      this.radius * REVEAL_FAR_RADII,
    );
    const opacity = reveal * MAX_OPACITY;
    const shown = opacity > 0.005;
    this.group.visible = shown;
    if (!shown) return;

    // Frame facing the camera: cards sit between the camera and the globe.
    this.toCamera.subVectors(this.cameraPosition, this.center).normalize();
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);

    // Ion-storm pulses: a quick flash (sometimes a double flicker), then decay.
    this.nextPulseIn -= step;
    if (this.nextPulseIn <= 0) {
      this.nextPulseIn = PULSE_MIN_GAP_S + Math.random() * (PULSE_MAX_GAP_S - PULSE_MIN_GAP_S);
      this.pulseCard = Math.floor(Math.random() * this.cards.length);
      this.pulseAge = 0;
      this.pulseDouble = Math.random() < 0.4;
      const uv = this.cards[this.pulseCard].mesh.material.uniforms.uPulseUv.value as THREE.Vector2;
      uv.set((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9);
    }
    this.pulseAge += step;
    const age = this.pulseAge;
    let pulse = Math.min(1, age / 0.06) * Math.exp(-Math.max(0, age - 0.06) * 4.5);
    if (this.pulseDouble && age > 0.22) {
      const second = age - 0.22;
      pulse = Math.max(pulse, Math.min(1, second / 0.05) * Math.exp(-Math.max(0, second - 0.05) * 5) * 0.8);
    }

    this.cards.forEach((card, index) => {
      const { mesh, def } = card;
      mesh.position
        .copy(this.center)
        .addScaledVector(this.toCamera, def.depth * this.radius)
        .addScaledVector(this.right, def.right * this.radius)
        .addScaledVector(this.up, def.up * this.radius);
      mesh.quaternion.copy(camera.quaternion);
      const u = mesh.material.uniforms;
      u.uTime.value = this.time;
      u.uOpacity.value = opacity;
      u.uPulse.value = index === this.pulseCard ? pulse : 0;
    });
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const { mesh } of this.cards) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
