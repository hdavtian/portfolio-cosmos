import * as THREE from "three";
import CameraControls from "camera-controls";
import type { CareerGalleryItem } from "./CareerGallery";

/**
 * Camera helpers for the Career Gallery interior: glide to the shell's
 * center, look-around-only controls with field-of-view zoom, and exact
 * restoration of the previous controls on exit.
 */

export type GalleryControlsSnapshot = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  smoothTime: number;
  azimuthRotateSpeed: number;
  polarRotateSpeed: number;
  mouseButtons: CameraControls["mouseButtons"];
  touches: CameraControls["touches"];
};

// Camera sits at the center; the orbit target is this far in front of it, so
// "orbiting" the target is effectively turning the head.
const LOOK_TARGET_OFFSET = 0.01;
/** Wheel travel per unit of wheel delta, as a fraction of the shell radius. */
const DOLLY_SPEED = 0.0011;

export const captureGalleryControls = (
  controls: CameraControls,
  camera: THREE.PerspectiveCamera,
): GalleryControlsSnapshot => ({
  position: controls.getPosition(new THREE.Vector3()),
  target: controls.getTarget(new THREE.Vector3()),
  fov: camera.fov,
  enabled: controls.enabled,
  minDistance: controls.minDistance,
  maxDistance: controls.maxDistance,
  smoothTime: controls.smoothTime,
  azimuthRotateSpeed: controls.azimuthRotateSpeed,
  polarRotateSpeed: controls.polarRotateSpeed,
  mouseButtons: { ...controls.mouseButtons },
  touches: { ...controls.touches },
});

export const restoreGalleryControls = (
  controls: CameraControls,
  camera: THREE.PerspectiveCamera,
  snapshot: GalleryControlsSnapshot,
): void => {
  controls.minDistance = snapshot.minDistance;
  controls.maxDistance = snapshot.maxDistance;
  controls.smoothTime = snapshot.smoothTime;
  controls.azimuthRotateSpeed = snapshot.azimuthRotateSpeed;
  controls.polarRotateSpeed = snapshot.polarRotateSpeed;
  Object.assign(controls.mouseButtons, snapshot.mouseButtons);
  Object.assign(controls.touches, snapshot.touches);
  camera.fov = snapshot.fov;
  camera.updateProjectionMatrix();
  controls.enabled = true;
  const { position: p, target: t } = snapshot;
  controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, true);
};

/** Look-around only: drag rotates the view, wheel/right/middle do nothing. */
export const applyGalleryInteriorControls = (controls: CameraControls): void => {
  controls.minDistance = LOOK_TARGET_OFFSET;
  controls.maxDistance = LOOK_TARGET_OFFSET;
  controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
  controls.mouseButtons.middle = CameraControls.ACTION.NONE;
  controls.mouseButtons.right = CameraControls.ACTION.NONE;
  controls.mouseButtons.wheel = CameraControls.ACTION.NONE;
  controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
  controls.touches.two = CameraControls.ACTION.NONE;
  controls.touches.three = CameraControls.ACTION.NONE;
  // Negative speeds make dragging feel like turning your head, not orbiting.
  controls.azimuthRotateSpeed = -0.35;
  controls.polarRotateSpeed = -0.35;
  controls.smoothTime = 0.35;
  controls.enabled = true;
};

/** Smoothly turn the head (camera stays where it is) toward a world point. */
export const lookFromToward = (
  controls: CameraControls,
  worldPoint: THREE.Vector3,
): void => {
  const origin = controls.getPosition(new THREE.Vector3());
  const dir = worldPoint.clone().sub(origin);
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();
  const target = origin.clone().addScaledVector(dir, LOOK_TARGET_OFFSET);
  controls.setLookAt(
    origin.x,
    origin.y,
    origin.z,
    target.x,
    target.y,
    target.z,
    true,
  );
};

/** Glides the camera into the shell's center. Returns a cancel function. */
export const runGalleryEntryGlide = ({
  controls,
  camera,
  center,
  durationMs,
  onDone,
}: {
  controls: CameraControls;
  camera: THREE.PerspectiveCamera;
  center: THREE.Vector3;
  durationMs: number;
  onDone: () => void;
}): (() => void) => {
  const startPos = camera.position.clone();
  const startTarget = controls.getTarget(new THREE.Vector3());
  const lookDir = center.clone().sub(startPos);
  if (lookDir.lengthSq() < 1e-6) lookDir.set(0, 0, -1);
  lookDir.normalize();
  const endTarget = center.clone().addScaledVector(lookDir, LOOK_TARGET_OFFSET);

  // Let setLookAt reach the center without distance clamping.
  controls.enabled = false;
  controls.minDistance = 0;
  controls.maxDistance = Infinity;

  const start = performance.now();
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  let raf = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    const t = Math.min(1, (performance.now() - start) / Math.max(1, durationMs));
    const eased = t * t * (3 - 2 * t);
    pos.lerpVectors(startPos, center, eased);
    target.lerpVectors(startTarget, endTarget, Math.min(1, eased * 1.4));
    controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, false);
    if (t < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      onDone();
    }
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
};

/**
 * Wheel moves the viewer forward/backward along the look direction, staying
 * within `maxOffset` of the shell's center, which gives a sense of scale.
 * Returns a detach function.
 */
export const attachGalleryDolly = (
  dom: HTMLElement,
  controls: CameraControls,
  center: THREE.Vector3,
  radius: number,
  maxOffset: number,
): (() => void) => {
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    controls.getPosition(position);
    controls.getTarget(target);
    direction.subVectors(target, position);
    if (direction.lengthSq() < 1e-12) return;
    direction.normalize();
    // Scroll up (negative delta) moves forward.
    position.addScaledVector(direction, -event.deltaY * radius * DOLLY_SPEED);
    const offset = position.clone().sub(center);
    if (offset.length() > maxOffset) {
      position.copy(center).addScaledVector(offset.normalize(), maxOffset);
    }
    target.copy(position).addScaledVector(direction, LOOK_TARGET_OFFSET);
    controls.setLookAt(
      position.x,
      position.y,
      position.z,
      target.x,
      target.y,
      target.z,
      true,
    );
  };
  dom.addEventListener("wheel", onWheel, { passive: false });
  return () => dom.removeEventListener("wheel", onWheel);
};

const IMAGE_URL_RE = /\.(jpe?g|png|gif|webp)$/i;

/**
 * Every screenshot referenced in the portfolio data, with the project title,
 * company (the portfolio core) and year it belongs to.
 */
export const collectPortfolioGalleryItems = (cores: unknown): CareerGalleryItem[] => {
  const byUrl = new Map<string, CareerGalleryItem>();
  type Context = { company?: string; title?: string; year?: number | null };

  const add = (url: string, title: string, context: Context) => {
    if (!IMAGE_URL_RE.test(url) || byUrl.has(url)) return;
    const year = context.year ?? null;
    // Some projects are titled after their company; don't repeat it.
    const company =
      context.company && context.company.trim().toLowerCase() !== title.trim().toLowerCase()
        ? context.company
        : undefined;
    byUrl.set(url, {
      url,
      title,
      subtitle: [company, year].filter(Boolean).join(" · "),
      year,
    });
  };

  const visit = (node: unknown, context: Context) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, context));
      return;
    }
    if (typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const next: Context = { ...context };
    if (typeof record.core === "string") next.company = record.core;
    if (typeof record.year === "number") next.year = record.year;
    // Gallery media items carry short captions; keep the project title.
    const isMediaItem = record.type === "image";
    if (typeof record.title === "string" && !isMediaItem) next.title = record.title;
    if (typeof record.image === "string") {
      add(record.image, next.title ?? "Untitled project", next);
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== "image" && child && typeof child === "object") visit(child, next);
    }
  };

  visit(cores, {});
  return Array.from(byUrl.values());
};
