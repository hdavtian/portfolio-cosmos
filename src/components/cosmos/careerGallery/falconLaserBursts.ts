import * as THREE from "three";

/**
 * Star Wars style laser bursts from the Falcon's cannons. A small pool of
 * glowing bolts (one shared box geometry and additive material) plus impact
 * flashes; bolts are timed to land exactly when requested.
 */

const BURST_BOLTS = 4;
const BURST_STAGGER_S = 0.08;
const POOL_SIZE = 12;
/** Red blaster bolts, bright enough to bloom. */
const BOLT_COLOR = new THREE.Color(1.0, 0.22, 0.14).multiplyScalar(2.4);
/** Bolt length as a share of the whole shot distance. */
const BOLT_LENGTH_FRACTION = 0.12;
/** Bolt thickness per unit of distance to the camera (keeps it thin on screen). */
const BOLT_THICKNESS_PER_DISTANCE = 0.0045;
/** Later bolts spray around the target by this share of the shot distance. */
const BURST_SPREAD = 0.012;
const IMPACT_SECONDS = 0.35;
/** Impact flash size per unit of distance to the camera. */
const IMPACT_SIZE_PER_DISTANCE = 0.05;

type Bolt = {
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  end: THREE.Vector3;
  delay: number;
  duration: number;
  age: number;
  active: boolean;
};

type Impact = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  age: number;
  size: number;
  active: boolean;
};

const createImpactTexture = (): THREE.Texture | null => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,140,110,0.9)");
  grad.addColorStop(1, "rgba(255,40,20,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export class FalconLaserBursts {
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material = new THREE.MeshBasicMaterial({
    color: BOLT_COLOR,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly impactTexture = createImpactTexture();
  private readonly bolts: Bolt[] = [];
  private readonly impacts: Impact[] = [];
  private readonly head = new THREE.Vector3();
  private readonly tail = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly spread = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.group.name = "FalconLaserBursts";
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 22;
      mesh.visible = false;
      this.group.add(mesh);
      this.bolts.push({
        mesh,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        delay: 0,
        duration: 1,
        age: 0,
        active: false,
      });
      const material = new THREE.SpriteMaterial({
        map: this.impactTexture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 23;
      sprite.visible = false;
      this.group.add(sprite);
      this.impacts.push({ sprite, material, age: 0, size: 1, active: false });
    }
    scene.add(this.group);
  }

  /** Fires a burst from the muzzles; the first bolt lands after `arriveInSeconds`. */
  fire(muzzles: THREE.Vector3[], target: THREE.Vector3, arriveInSeconds: number): void {
    if (muzzles.length === 0) return;
    for (let i = 0; i < BURST_BOLTS; i++) {
      const bolt = this.bolts.find((candidate) => !candidate.active);
      if (!bolt) return;
      bolt.start.copy(muzzles[i % muzzles.length]);
      const spread = i === 0 ? 0 : bolt.start.distanceTo(target) * BURST_SPREAD;
      bolt.end
        .copy(target)
        .add(
          this.spread
            .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            .multiplyScalar(2 * spread),
        );
      bolt.delay = i * BURST_STAGGER_S;
      bolt.duration = Math.max(0.12, arriveInSeconds);
      bolt.age = 0;
      bolt.active = true;
      bolt.mesh.visible = false;
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    for (const bolt of this.bolts) {
      if (!bolt.active) continue;
      bolt.age += dt;
      const flight = bolt.age - bolt.delay;
      if (flight < 0) continue;
      const u = flight / bolt.duration;
      if (u >= 1) {
        bolt.active = false;
        bolt.mesh.visible = false;
        this.spawnImpact(bolt.end, camera);
        continue;
      }
      const shotLength = bolt.start.distanceTo(bolt.end);
      this.direction.subVectors(bolt.end, bolt.start).normalize();
      this.head.lerpVectors(bolt.start, bolt.end, u);
      this.tail
        .copy(this.head)
        .addScaledVector(this.direction, -Math.min(shotLength * BOLT_LENGTH_FRACTION, u * shotLength));
      const mesh = bolt.mesh;
      mesh.position.addVectors(this.head, this.tail).multiplyScalar(0.5);
      mesh.lookAt(bolt.end);
      const thickness = Math.max(
        0.004,
        camera.position.distanceTo(mesh.position) * BOLT_THICKNESS_PER_DISTANCE,
      );
      mesh.scale.set(thickness, thickness, Math.max(0.001, this.head.distanceTo(this.tail)));
      mesh.visible = true;
    }

    for (const impact of this.impacts) {
      if (!impact.active) continue;
      impact.age += dt;
      const u = impact.age / IMPACT_SECONDS;
      if (u >= 1) {
        impact.active = false;
        impact.sprite.visible = false;
        continue;
      }
      impact.material.opacity = 1 - u;
      impact.sprite.scale.setScalar(impact.size * (0.6 + u * 1.8));
    }
  }

  private spawnImpact(at: THREE.Vector3, camera: THREE.Camera): void {
    const impact = this.impacts.find((candidate) => !candidate.active);
    if (!impact) return;
    impact.active = true;
    impact.age = 0;
    impact.size = camera.position.distanceTo(at) * IMPACT_SIZE_PER_DISTANCE;
    impact.sprite.position.copy(at);
    impact.sprite.visible = true;
  }

  /** Stops any bolts or flashes in flight. */
  clear(): void {
    for (const bolt of this.bolts) {
      bolt.active = false;
      bolt.mesh.visible = false;
    }
    for (const impact of this.impacts) {
      impact.active = false;
      impact.sprite.visible = false;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    for (const impact of this.impacts) impact.material.dispose();
    this.impactTexture?.dispose();
  }
}
