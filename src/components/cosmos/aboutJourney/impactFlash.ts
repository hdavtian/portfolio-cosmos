import * as THREE from "three";

/**
 * "Atomic" point-of-impact flash for Mjolnir smashing the rail: a white-hot
 * core that swells and fades to blue-white, a wide warm halo, and a shockwave
 * ring racing outward. Glowing sprites only (no lights, no recompiles); it
 * animates itself each frame while visible.
 */

const DURATION_S = 1.3;
const CORE_MAX = 260;
const HALO_MAX = 900;
const RING_MAX = 1400;

const makeTexture = (draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.Texture => {
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

export class ImpactFlash {
  readonly group = new THREE.Group();
  private readonly core: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly ring: THREE.Sprite;
  private readonly textures: THREE.Texture[] = [];
  private startedAt = -1;

  constructor(scene: THREE.Scene) {
    const glow = makeTexture((ctx, size) => {
      const c = size / 2;
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(220,235,255,0.85)");
      g.addColorStop(0.6, "rgba(140,180,255,0.25)");
      g.addColorStop(1, "rgba(80,120,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
    const ring = makeTexture((ctx, size) => {
      const c = size / 2;
      const g = ctx.createRadialGradient(c, c, c * 0.55, c, c, c);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.7, "rgba(200,225,255,0.8)");
      g.addColorStop(0.85, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
    this.textures.push(glow, ring);

    const material = (map: THREE.Texture, color: THREE.Color) =>
      new THREE.SpriteMaterial({
        map,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    // Colors above 1 so the bloom pass catches the flash.
    this.core = new THREE.Sprite(material(glow, new THREE.Color(2.4, 2.5, 2.8)));
    this.halo = new THREE.Sprite(material(glow, new THREE.Color(1.6, 1.1, 0.7)));
    this.ring = new THREE.Sprite(material(ring, new THREE.Color(1.3, 1.6, 2.2)));
    for (const sprite of [this.halo, this.ring, this.core]) {
      sprite.frustumCulled = false;
      sprite.renderOrder = 60;
      this.group.add(sprite);
    }
    this.group.name = "MjolnirImpactFlash";
    this.group.visible = false;
    // The core animates the whole flash just before it draws.
    this.core.onBeforeRender = () => this.animate();
    scene.add(this.group);
  }

  trigger(point: THREE.Vector3): void {
    this.group.position.copy(point);
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
    // Core: near-instant flash, quick swell, then fades.
    const coreIn = Math.min(1, t / 0.04);
    const coreOut = 1 - THREE.MathUtils.smoothstep(t, 0.12, 0.7);
    this.core.scale.setScalar(CORE_MAX * (0.4 + 0.6 * Math.sqrt(Math.min(1, t / 0.2))));
    (this.core.material as THREE.SpriteMaterial).opacity = coreIn * coreOut;
    // Halo: broad warm light that lingers a bit longer.
    const haloOut = 1 - THREE.MathUtils.smoothstep(t, 0.1, 0.95);
    this.halo.scale.setScalar(HALO_MAX * (0.5 + 0.5 * Math.min(1, t / 0.35)));
    (this.halo.material as THREE.SpriteMaterial).opacity = Math.min(1, t / 0.05) * haloOut * 0.75;
    // Shockwave ring: races out and thins.
    const ringT = Math.min(1, t / 0.75);
    this.ring.scale.setScalar(RING_MAX * (0.1 + 0.9 * (1 - Math.pow(1 - ringT, 3))));
    (this.ring.material as THREE.SpriteMaterial).opacity = (1 - ringT) * 0.9;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const sprite of [this.core, this.halo, this.ring]) (sprite.material as THREE.Material).dispose();
    for (const texture of this.textures) texture.dispose();
  }
}
