import * as THREE from "three";

/**
 * Cinematic sun: boiling surface, shimmering corona with occasional solar
 * flares (prominence arcs), and a lens flare that fades when something
 * passes in front of the sun. No lights are added (no shader recompiles).
 */

export type SunOccluder = { center: THREE.Vector3; radius: number };

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

// ── Boiling surface (thin shell over the textured sun) ────────────────────
const surfaceVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNormalObject;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  void main() {
    vNormalObject = normalize(position);
    vNormalView = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;

const surfaceFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  varying vec3 vNormalObject;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  ${NOISE_GLSL}
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalObject);
    float t = uTime * 0.04;
    // Granulation cells boiling over time, plus larger slow-moving blotches.
    float cells = fbm(n * 9.0 + vec3(t, t * 0.7, -t * 0.5));
    float blotches = fbm(n * 2.5 - vec3(t * 0.3));
    float heat = smoothstep(0.35, 0.8, cells) * 0.7 + blotches * 0.5;
    float ndv = max(dot(normalize(vNormalView), normalize(vViewPosition)), 0.0);
    float limb = pow(ndv, 0.45); // limb darkening
    vec3 color = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.9, 0.55), heat) * limb;
    gl_FragColor = vec4(color * 0.55, 1.0);
  }
`;

// ── Corona + flares (camera-facing card) ──────────────────────────────────
const coronaVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const coronaFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uDiskRadius; // sun radius in card half-size units
  uniform float uFlareAngle;
  uniform float uFlareLife;  // 0..1 over the flare's lifetime (0 = none)
  uniform float uFlareSize;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float angle = atan(p.y, p.x);
    float rs = uDiskRadius;
    float t = uTime * 0.05;

    // Streamers: angular noise that drifts, stretched outward.
    vec3 dir = vec3(cos(angle), sin(angle), 0.0);
    float streamers = fbm(dir * 2.6 + vec3(0.0, 0.0, t) + vec3(r * 1.5));
    streamers = pow(smoothstep(0.3, 0.85, streamers), 2.0);
    float outside = smoothstep(rs * 0.92, rs * 1.02, r);
    float falloff = exp(-(r - rs) / (rs * 0.55));
    float corona = outside * falloff * (0.35 + 1.1 * streamers);
    // Soft inner glow hugging the limb.
    corona += exp(-abs(r - rs) / (rs * 0.06)) * 0.6;
    vec3 color = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.86, 0.6), streamers) * corona;

    // Solar flare: a glowing plasma loop rising off the limb.
    if (uFlareLife > 0.0) {
      float grow = smoothstep(0.0, 0.35, uFlareLife);
      float fade = 1.0 - smoothstep(0.65, 1.0, uFlareLife);
      vec2 limbPoint = vec2(cos(uFlareAngle), sin(uFlareAngle)) * rs;
      float loopRadius = uFlareSize * rs * (0.4 + 0.6 * grow);
      vec2 loopCenter = limbPoint * (1.0 + loopRadius / rs * 0.35);
      float ringDist = abs(length(p - loopCenter) - loopRadius);
      float thickness = rs * 0.035 * (1.0 + fbm(vec3(p * 8.0, t * 4.0)));
      float loop = exp(-pow(ringDist / thickness, 2.0)) * smoothstep(rs * 0.98, rs * 1.05, r);
      float filaments = 0.6 + 0.8 * fbm(vec3(p * 14.0, t * 6.0));
      color += vec3(1.0, 0.5, 0.12) * loop * filaments * grow * fade * 1.6;
    }

    float alpha = clamp(max(color.r, max(color.g, color.b)), 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

// Distances in radii: corona card size, flare timing (seconds).
const CORONA_CARD_RADII = 5;
const FLARE_MIN_GAP_S = 8;
const FLARE_MAX_GAP_S = 15;
const FLARE_DURATION_S = 6;

// Lens flare: ghosts along the line from the sun through the screen center.
type Ghost = { t: number; size: number; color: THREE.Color; texture: "disc" | "ring"; opacity: number };
// Kept small and faint so they read as a subtle optical artifact.
const GHOSTS: Ghost[] = [
  { t: 0.22, size: 0.035, color: new THREE.Color(1.0, 0.7, 0.35), texture: "disc", opacity: 0.16 },
  { t: 0.42, size: 0.018, color: new THREE.Color(0.6, 1.0, 0.7), texture: "disc", opacity: 0.14 },
  { t: 0.62, size: 0.05, color: new THREE.Color(0.55, 0.7, 1.0), texture: "ring", opacity: 0.08 },
  { t: 0.82, size: 0.025, color: new THREE.Color(1.0, 0.55, 0.8), texture: "disc", opacity: 0.12 },
  { t: 1.05, size: 0.07, color: new THREE.Color(0.7, 0.85, 1.0), texture: "ring", opacity: 0.06 },
  { t: 1.3, size: 0.04, color: new THREE.Color(1.0, 0.85, 0.5), texture: "disc", opacity: 0.1 },
];
/** Lens-flare sprites sit this far in front of the camera. */
const FLARE_PLANE_DISTANCE = 2;

const makeCanvasTexture = (draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.Texture => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export class SunEnhancements {
  readonly group = new THREE.Group();
  private readonly sun: THREE.Object3D;
  private readonly radius: number;
  private readonly surface: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly corona: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly flareGroup = new THREE.Group();
  private readonly ghostSprites: Array<{ sprite: THREE.Sprite; ghost: Ghost }> = [];
  private readonly glare: THREE.Sprite;
  private readonly textures: THREE.Texture[] = [];
  private time = 0;
  private flareTimer = 3;
  private flareAge = -1;
  private visibility = 0;
  private frame = 0;
  private occluded = false;
  private readonly sunWorld = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly toSun = new THREE.Vector3();
  private readonly toCenter = new THREE.Vector3();
  private readonly spritePosition = new THREE.Vector3();

  constructor(sun: THREE.Mesh, scene: THREE.Scene) {
    this.sun = sun;
    const geometry = sun.geometry as THREE.SphereGeometry;
    this.radius = geometry.parameters?.radius ?? 100;

    this.surface = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 1.004, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: surfaceVertexShader,
        fragmentShader: surfaceFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uTime: { value: 0 } },
      }),
    );
    this.surface.name = "SunSurface";
    sun.add(this.surface);

    const cardSize = this.radius * 2 * CORONA_CARD_RADII;
    this.corona = new THREE.Mesh(
      new THREE.PlaneGeometry(cardSize, cardSize),
      new THREE.ShaderMaterial({
        vertexShader: coronaVertexShader,
        fragmentShader: coronaFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uDiskRadius: { value: 1 / CORONA_CARD_RADII },
          uFlareAngle: { value: 0 },
          uFlareLife: { value: 0 },
          uFlareSize: { value: 0.5 },
        },
      }),
    );
    this.corona.name = "SunCorona";
    this.corona.frustumCulled = false;
    this.corona.renderOrder = 5;
    this.group.add(this.corona);

    // Lens flare sprites (screen-space; always drawn on top).
    const disc = makeCanvasTexture((ctx, size) => {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(0.55, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
    const ring = makeCanvasTexture((ctx, size) => {
      // Soft, wide band rather than a crisp ring.
      const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.55, "rgba(255,255,255,0.22)");
      g.addColorStop(0.75, "rgba(255,255,255,0.3)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
    const star = makeCanvasTexture((ctx, size) => {
      const c = size / 2;
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, "rgba(255,250,235,1)");
      g.addColorStop(0.12, "rgba(255,220,170,0.6)");
      g.addColorStop(1, "rgba(255,180,120,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate((i * Math.PI) / 6);
        const ray = ctx.createLinearGradient(-c, 0, c, 0);
        ray.addColorStop(0, "rgba(255,220,180,0)");
        ray.addColorStop(0.5, `rgba(255,235,210,${i % 3 === 0 ? 0.7 : 0.3})`);
        ray.addColorStop(1, "rgba(255,220,180,0)");
        ctx.fillStyle = ray;
        ctx.fillRect(-c, -1.2, size, 2.4);
        ctx.restore();
      }
    });
    this.textures.push(disc, ring, star);

    for (const ghost of GHOSTS) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: ghost.texture === "ring" ? ring : disc,
          color: ghost.color,
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      sprite.renderOrder = 2000;
      sprite.frustumCulled = false;
      this.flareGroup.add(sprite);
      this.ghostSprites.push({ sprite, ghost });
    }
    this.glare = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: star,
        color: new THREE.Color(1.0, 0.92, 0.8),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.glare.renderOrder = 2001;
    this.glare.frustumCulled = false;
    this.flareGroup.add(this.glare);
    this.flareGroup.name = "SunLensFlare";
    this.group.add(this.flareGroup);

    this.group.name = "SunEnhancements";
    scene.add(this.group);
  }

  /** Once per frame with the main camera; occluders are checked every few frames. */
  update(dt: number, camera: THREE.PerspectiveCamera, getOccluders: () => SunOccluder[]): void {
    const step = Math.min(dt, 0.1);
    this.time += step;
    this.frame += 1;
    this.sun.getWorldPosition(this.sunWorld);
    camera.getWorldPosition(this.cameraPosition);

    this.surface.material.uniforms.uTime.value = this.time;

    // Corona card faces the camera at the sun.
    this.corona.position.copy(this.sunWorld);
    this.corona.quaternion.copy(camera.quaternion);
    const cu = this.corona.material.uniforms;
    cu.uTime.value = this.time;

    // Flares: occasional plasma loops.
    if (this.flareAge < 0) {
      this.flareTimer -= step;
      if (this.flareTimer <= 0) {
        this.flareAge = 0;
        cu.uFlareAngle.value = Math.random() * Math.PI * 2;
        cu.uFlareSize.value = 0.3 + Math.random() * 0.45;
      }
    } else {
      this.flareAge += step;
      if (this.flareAge >= FLARE_DURATION_S) {
        this.flareAge = -1;
        this.flareTimer = FLARE_MIN_GAP_S + Math.random() * (FLARE_MAX_GAP_S - FLARE_MIN_GAP_S);
      }
    }
    cu.uFlareLife.value = this.flareAge < 0 ? 0 : this.flareAge / FLARE_DURATION_S;

    this.updateLensFlare(step, camera, getOccluders);
  }

  private updateLensFlare(step: number, camera: THREE.PerspectiveCamera, getOccluders: () => SunOccluder[]): void {
    this.projected.copy(this.sunWorld).project(camera);
    const inFront = this.projected.z > -1 && this.projected.z < 1;
    const onScreen = inFront && Math.abs(this.projected.x) < 1.15 && Math.abs(this.projected.y) < 1.15;

    if (onScreen && this.frame % 3 === 0) {
      this.occluded = this.isOccluded(getOccluders());
    }
    const target = onScreen && !this.occluded ? 1 : 0;
    this.visibility += (target - this.visibility) * (1 - Math.exp(-(target > this.visibility ? 6 : 10) * step));
    if (this.visibility < 0.003) {
      this.flareGroup.visible = false;
      return;
    }
    this.flareGroup.visible = true;

    // Stronger when the sun is near the middle of the view.
    const centered = 1 - Math.min(1, Math.hypot(this.projected.x, this.projected.y) / 1.2);
    const strength = this.visibility * (0.35 + 0.65 * centered);
    const viewHeight = 2 * FLARE_PLANE_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

    const place = (ndcX: number, ndcY: number, sprite: THREE.Sprite, sizeShare: number) => {
      this.spritePosition.set(ndcX, ndcY, 0.5).unproject(camera);
      this.toCenter.subVectors(this.spritePosition, this.cameraPosition).normalize();
      sprite.position.copy(this.cameraPosition).addScaledVector(this.toCenter, FLARE_PLANE_DISTANCE);
      sprite.scale.setScalar(viewHeight * sizeShare);
    };

    // The starburst glare sprite looked pasted-on (hard disc over the sun),
    // so it stays hidden; the sun's own glow, corona and flares carry it.
    this.glare.visible = false;
    for (const { sprite, ghost } of this.ghostSprites) {
      const k = 1 - 2 * ghost.t;
      place(this.projected.x * k, this.projected.y * k, sprite, ghost.size);
      (sprite.material as THREE.SpriteMaterial).opacity = strength * ghost.opacity;
    }
  }

  /** Line of sight from the camera to the sun's center, tested against spheres. */
  private isOccluded(occluders: SunOccluder[]): boolean {
    this.toSun.subVectors(this.sunWorld, this.cameraPosition);
    const length = this.toSun.length();
    if (length < 1e-3) return false;
    this.toSun.divideScalar(length);
    for (const { center, radius } of occluders) {
      this.toCenter.subVectors(center, this.cameraPosition);
      const along = this.toCenter.dot(this.toSun);
      if (along <= 0 || along >= length) continue;
      if (this.toCenter.lengthSq() - along * along < radius * radius) return true;
    }
    return false;
  }

  dispose(): void {
    this.surface.removeFromParent();
    this.surface.geometry.dispose();
    this.surface.material.dispose();
    this.group.removeFromParent();
    this.corona.geometry.dispose();
    this.corona.material.dispose();
    for (const { sprite } of this.ghostSprites) (sprite.material as THREE.Material).dispose();
    (this.glare.material as THREE.Material).dispose();
    for (const texture of this.textures) texture.dispose();
  }
}
