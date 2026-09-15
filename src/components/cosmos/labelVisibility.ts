import * as THREE from "three";

/**
 * One place that decides how visible every CSS2D label in the universe is.
 *
 * CSS2D labels are HTML laid over the canvas, so nothing in the 3D scene can
 * hide them by itself. Every few frames each label's line of sight is tested
 * against cheap stand-in shapes for the things that can block it (spheres
 * for planets, moons and the Career Gallery; oriented boxes for ships), and
 * labels fade out while blocked.
 *
 * It also declutters: from afar only destination names show; moon names fade
 * in as the camera approaches their planet's system.
 *
 * Mode code (Portfolio, Skills lattice, About) still owns `label.visible`;
 * this only drives `element.style.opacity` for labels that are visible.
 */

export type SphereOccluder = {
  center: THREE.Vector3;
  radius: number;
  /** Labels attached to this object never count it as blocking them. */
  owner?: THREE.Object3D;
};

export type BoxOccluder = {
  object: THREE.Object3D;
};

export type LabelVisibilityContext = {
  camera: THREE.Camera;
  spheres: SphereOccluder[];
  boxes: BoxOccluder[];
  /** Hide every label (e.g. while inside the ship). */
  hideAll: boolean;
  /** Center and radius of the planet system whose moon names fade in when near. */
  moonSystem: { center: THREE.Vector3; radius: number } | null;
  /** While a moon is focused, the other moon names dim and blur. */
  focusedMoon: THREE.Object3D | null;
};

type LabelObject = THREE.Object3D & { isCSS2DObject?: boolean; element?: HTMLElement };

type LabelState = {
  opacity: number;
  occluded: boolean;
  appliedOpacity: string;
  appliedFilter: string;
};

/** Re-collect the scene's labels this often (frames). */
const RESCAN_FRAMES = 45;
/** Test line of sight this often (frames); opacity still eases every frame. */
const OCCLUSION_FRAMES = 2;
/** Seconds-ish time constant of the fade. */
const FADE_RATE = 10;
/** Shrinks stand-in shapes a little so grazing lines don't flicker labels. */
const SPHERE_MARGIN = 0.94;
const BOX_MARGIN = 0.88;
/** Moon names: fully shown within this many system radii, gone beyond FAR. */
const MOON_NEAR_SYSTEM_RADII = 2.2;
const MOON_FAR_SYSTEM_RADII = 3.6;
const MOON_MIN_NEAR_DISTANCE = 2600;
const FOCUSED_OTHER_MOON_OPACITY = 0.35;

const isEffectivelyVisible = (object: THREE.Object3D): boolean => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
};

export class LabelVisibilityManager {
  private labels: LabelObject[] = [];
  private readonly states = new WeakMap<LabelObject, LabelState>();
  private frame = 0;
  private readonly labelWorld = new THREE.Vector3();
  private readonly toLabel = new THREE.Vector3();
  private readonly toCenter = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly inverse = new THREE.Matrix4();
  private readonly hit = new THREE.Vector3();
  private readonly localCamera = new THREE.Vector3();
  private readonly localLabel = new THREE.Vector3();
  private readonly localBoxes = new WeakMap<THREE.Object3D, THREE.Box3>();

  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(dt: number, context: LabelVisibilityContext): void {
    if (this.frame % RESCAN_FRAMES === 0) this.collectLabels();
    const testOcclusion = this.frame % OCCLUSION_FRAMES === 0;
    this.frame += 1;

    const cameraPosition = context.camera.getWorldPosition(this.toCenter).clone();
    const boxes = testOcclusion ? this.prepareBoxes(context.boxes) : [];
    const ease = 1 - Math.exp(-FADE_RATE * Math.min(dt, 0.1));

    for (const label of this.labels) {
      const element = label.element;
      if (!element) continue;
      let state = this.states.get(label);
      if (!state) {
        state = { opacity: 1, occluded: false, appliedOpacity: "", appliedFilter: "" };
        this.states.set(label, state);
      }
      // Hidden by its mode: nothing to draw; let it reappear at full strength.
      if (!label.parent || !isEffectivelyVisible(label)) {
        state.opacity = 1;
        continue;
      }

      label.getWorldPosition(this.labelWorld);
      if (testOcclusion) {
        state.occluded =
          context.hideAll ||
          this.blockedBySphere(cameraPosition, label, context.spheres) ||
          this.blockedByBox(cameraPosition, boxes);
      }

      let target = state.occluded ? 0 : 1;
      let filter = "";
      if (target > 0 && this.isMoonLabel(label)) {
        target *= this.moonProximity(cameraPosition, context.moonSystem);
        const focused = context.focusedMoon;
        if (focused && label.parent !== focused) {
          target *= FOCUSED_OTHER_MOON_OPACITY;
          filter = "blur(2px)";
        }
      }

      state.opacity += (target - state.opacity) * ease;
      if (Math.abs(state.opacity - target) < 0.004) state.opacity = target;
      const opacity = state.opacity < 0.02 ? "0" : state.opacity.toFixed(2);
      if (opacity !== state.appliedOpacity) {
        element.style.opacity = opacity;
        state.appliedOpacity = opacity;
      }
      if (filter !== state.appliedFilter) {
        element.style.filter = filter;
        state.appliedFilter = filter;
      }
    }
  }

  dispose(): void {
    for (const label of this.labels) {
      if (!label.element) continue;
      label.element.style.opacity = "";
      label.element.style.filter = "";
    }
    this.labels = [];
  }

  private collectLabels(): void {
    const found: LabelObject[] = [];
    this.scene.traverse((object) => {
      const label = object as LabelObject;
      if (label.isCSS2DObject && label.element) found.push(label);
    });
    this.labels = found;
  }

  private isMoonLabel(label: LabelObject): boolean {
    return !!label.parent?.userData?.isMoon;
  }

  private moonProximity(
    cameraPosition: THREE.Vector3,
    system: LabelVisibilityContext["moonSystem"],
  ): number {
    if (!system) return 1;
    const near = Math.max(MOON_MIN_NEAR_DISTANCE, system.radius * MOON_NEAR_SYSTEM_RADII);
    const far = Math.max(near * 1.4, system.radius * MOON_FAR_SYSTEM_RADII);
    const distance = cameraPosition.distanceTo(system.center);
    return 1 - THREE.MathUtils.smoothstep(distance, near, far);
  }

  private blockedBySphere(
    cameraPosition: THREE.Vector3,
    label: LabelObject,
    spheres: SphereOccluder[],
  ): boolean {
    this.toLabel.subVectors(this.labelWorld, cameraPosition);
    const length = this.toLabel.length();
    if (length < 1e-3) return false;
    this.toLabel.divideScalar(length);
    for (const sphere of spheres) {
      if (sphere.owner && label.parent === sphere.owner) continue;
      const radius = sphere.radius * SPHERE_MARGIN;
      const radiusSq = radius * radius;
      this.toCenter.subVectors(sphere.center, cameraPosition);
      const centerDistSq = this.toCenter.lengthSq();
      // Viewer inside the shape (e.g. inside the gallery): it doesn't hide things.
      if (centerDistSq < radiusSq) continue;
      // Label inside the shape (it belongs to it): not hidden by its own shell.
      if (this.labelWorld.distanceToSquared(sphere.center) < radiusSq) continue;
      const along = this.toCenter.dot(this.toLabel);
      if (along <= 0 || along >= length) continue;
      if (centerDistSq - along * along < radiusSq) return true;
    }
    return false;
  }

  private prepareBoxes(boxes: BoxOccluder[]): Array<{ object: THREE.Object3D; box: THREE.Box3 }> {
    const prepared: Array<{ object: THREE.Object3D; box: THREE.Box3 }> = [];
    for (const { object } of boxes) {
      if (!object.parent || !isEffectivelyVisible(object)) continue;
      const box = this.localBoxFor(object);
      if (box && !box.isEmpty()) prepared.push({ object, box });
    }
    return prepared;
  }

  /** The object's bounds in its own space, measured once. */
  private localBoxFor(object: THREE.Object3D): THREE.Box3 | null {
    const cached = this.localBoxes.get(object);
    if (cached) return cached;
    object.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(object.matrixWorld).invert();
    const box = new THREE.Box3();
    const meshBox = new THREE.Box3();
    const meshToLocal = new THREE.Matrix4();
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (mesh.name === "ShipRimLight") return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const geometryBox = mesh.geometry.boundingBox;
      if (!geometryBox) return;
      meshToLocal.multiplyMatrices(toLocal, mesh.matrixWorld);
      box.union(meshBox.copy(geometryBox).applyMatrix4(meshToLocal));
    });
    if (box.isEmpty()) return null;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).multiplyScalar(BOX_MARGIN);
    box.setFromCenterAndSize(center, size);
    this.localBoxes.set(object, box);
    return box;
  }

  private blockedByBox(
    cameraPosition: THREE.Vector3,
    boxes: Array<{ object: THREE.Object3D; box: THREE.Box3 }>,
  ): boolean {
    for (const { object, box } of boxes) {
      this.inverse.copy(object.matrixWorld).invert();
      this.localCamera.copy(cameraPosition).applyMatrix4(this.inverse);
      if (box.containsPoint(this.localCamera)) continue;
      this.localLabel.copy(this.labelWorld).applyMatrix4(this.inverse);
      if (box.containsPoint(this.localLabel)) continue;
      const localLength = this.localCamera.distanceTo(this.localLabel);
      if (localLength < 1e-6) continue;
      this.ray.origin.copy(this.localCamera);
      this.ray.direction.subVectors(this.localLabel, this.localCamera).divideScalar(localLength);
      const hit = this.ray.intersectBox(box, this.hit);
      if (hit && hit.distanceTo(this.localCamera) < localLength) return true;
    }
    return false;
  }
}
