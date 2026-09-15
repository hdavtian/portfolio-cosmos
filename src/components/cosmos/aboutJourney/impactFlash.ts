import * as THREE from "three";

/**
 * Mjolnir's point-of-impact explosion, on one camera-facing card driven by a
 * noise shader (so it's never a clean circle): a churning fireball with a
 * torn, turbulent edge; jagged branching lightning crackling outward; a
 * broken, uneven shockwave; and embers flung along jets, cooling as they
 * fade. Seeded per strike so each impact looks different. No lights.
 */

const DURATION_S = 1.6;
/** Card size (world units) at full expansion. */
const CARD_SIZE = 1800;

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
  uniform float uTime;  // 0..1 over the explosion
  uniform float uSeed;
  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.07 + vec2(3.1, 1.7);
      a *= 0.5;
    }
    return v;
  }
  // Ridged noise: thin bright creases, good for lightning.
  float ridged(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 4; i++) {
      float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
      v += a * n * n;
      p = p * 2.2 + vec2(5.2, 1.3);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float angle = atan(p.y, p.x);
    float t = uTime;
    vec2 seed = vec2(uSeed * 17.0, uSeed * 31.0);

    // Turbulence that distorts every layer so nothing is round.
    vec2 warp = vec2(fbm(p * 3.0 + seed + t * 2.0), fbm(p * 3.0 - seed + t * 1.7)) - 0.5;
    vec2 q = p + warp * 0.35;
    float rq = length(q);
    // Angular lumps: the blast bulges out unevenly.
    float lumps = fbm(vec2(angle * 2.5, uSeed * 9.0)) * 0.6 + fbm(vec2(angle * 7.0, uSeed * 3.0)) * 0.25;

    // Fireball: grows fast, then churns and breaks up.
    float grow = 1.0 - pow(1.0 - min(1.0, t / 0.35), 3.0);
    float fireRadius = (0.1 + 0.32 * grow) * (0.7 + lumps);
    float churn = fbm(q * 6.0 + seed - t * 3.0);
    float fire = smoothstep(fireRadius, fireRadius * 0.35, rq + (churn - 0.5) * 0.18);
    float fireFade = 1.0 - smoothstep(0.25, 0.85, t);
    float heat = fire * (0.55 + 0.9 * churn) * fireFade;
    vec3 fireColor = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.85, 0.55), smoothstep(0.35, 0.95, heat));
    fireColor = mix(fireColor, vec3(1.0, 1.0, 1.0), smoothstep(0.9, 1.4, heat) * (1.0 - t));
    // White-hot flash at the very start.
    float flash = exp(-t * 14.0) * smoothstep(0.35, 0.0, rq);

    // Lightning: jagged bright creases radiating out, flickering, strongest early.
    float bolts = ridged(vec2(angle * 3.0 + uSeed * 20.0, rq * 4.0 - t * 6.0) + warp * 2.0);
    float boltMask = pow(bolts, 9.0) * smoothstep(0.95, 0.15, r) * smoothstep(0.05, 0.12, r);
    float flicker = step(0.35, hash12(vec2(floor(t * 28.0), uSeed * 100.0)));
    float lightning = boltMask * flicker * exp(-t * 3.2) * 3.0;

    // Shockwave: an uneven ring that breaks into pieces as it expands.
    float ringRadius = 0.12 + 0.85 * (1.0 - pow(1.0 - t, 2.2));
    float ringWobble = (fbm(vec2(angle * 4.0, uSeed * 5.0 + t)) - 0.5) * 0.16;
    float ringDist = abs(rq - ringRadius - ringWobble);
    float ringBreak = smoothstep(0.35, 0.65, fbm(vec2(angle * 6.0 + uSeed * 11.0, t * 2.0)));
    float ring = exp(-pow(ringDist / (0.02 + 0.03 * t), 2.0)) * ringBreak * (1.0 - t) * 0.9;

    // Embers: sparks thrown outward along ragged jets, cooling as they fly.
    vec2 cell = floor(vec2(angle * 18.0 / 6.2831853, rq * 26.0 - t * 22.0) + seed);
    float ember = step(0.93, hash12(cell)) * smoothstep(0.08, 0.95, rq) * (1.0 - smoothstep(0.55, 1.0, t));
    vec3 emberColor = mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 0.35, 0.05), t);

    vec3 color = fireColor * heat * 1.6
      + vec3(0.75, 0.85, 1.0) * lightning
      + vec3(0.7, 0.8, 1.0) * ring
      + emberColor * ember * 1.4
      + vec3(1.0) * flash * 2.2;
    // Soft outer fade so the card edge never shows.
    color *= smoothstep(1.0, 0.8, r);
    float alpha = clamp(max(max(heat, lightning), max(ring, max(ember, flash))), 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

export class ImpactFlash {
  readonly group = new THREE.Group();
  private readonly card: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private startedAt = -1;

  constructor(scene: THREE.Scene) {
    this.card = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_SIZE, CARD_SIZE),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uTime: { value: 0 }, uSeed: { value: Math.random() } },
      }),
    );
    this.card.name = "MjolnirImpactExplosion";
    this.card.frustumCulled = false;
    this.card.renderOrder = 60;
    // Face the camera and advance the explosion just before drawing.
    this.card.onBeforeRender = (_renderer, _scene, camera) => {
      this.card.quaternion.copy(camera.quaternion);
      this.card.updateMatrixWorld();
      this.animate();
    };
    this.group.add(this.card);
    this.group.name = "MjolnirImpactFlash";
    this.group.visible = false;
    scene.add(this.group);
  }

  trigger(point: THREE.Vector3): void {
    this.group.position.copy(point);
    this.card.material.uniforms.uSeed.value = Math.random();
    this.startedAt = performance.now();
    this.group.visible = true;
    this.animate();
  }

  private animate(): void {
    if (this.startedAt < 0) return;
    const t = (performance.now() - this.startedAt) / 1000 / DURATION_S;
    if (t >= 1) {
      this.startedAt = -1;
      this.group.visible = false;
      return;
    }
    this.card.material.uniforms.uTime.value = t;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.card.geometry.dispose();
    this.card.material.dispose();
  }
}
