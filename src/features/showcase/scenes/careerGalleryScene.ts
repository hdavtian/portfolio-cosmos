import type { SceneData, ScenePointer, ShowcaseScene, ThreeModule } from "./types";

/** Tiles showing a screenshot before the scene counts as ready. */
const READY_FACES = 70;
/** Show whatever has loaded by then rather than keep visitors waiting. */
const READY_TIMEOUT_SECONDS = 14;

/**
 * The cinematic site's Career Gallery seen from inside. The CareerGallery class
 * is imported as-is from the Three.js app (not modified); this scene supplies
 * the camera and portfolio images.
 */
export async function createCareerGalleryScene(THREE: ThreeModule, data: SceneData): Promise<ShowcaseScene> {
  const { CareerGallery } = await import("../../../components/cosmos/careerGallery/CareerGallery");

  const items = data.projects.flatMap((project) =>
    project.detailMedia
      .filter((media) => media.image)
      .map((media) => ({
        url: media.image as string,
        title: project.title,
        subtitle: [project.category, project.year].filter(Boolean).join(" · "),
        year: project.year,
      })),
  );

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 1, 4000);
  const gallery = new CareerGallery({ items });
  gallery.setInteriorMode(true);
  scene.add(gallery.root);

  const targetFaces = Math.min(READY_FACES, items.length);
  const look = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  let elapsed = 0;
  let loadingDone = targetFaces === 0;

  return {
    scene,
    camera,
    progress() {
      if (loadingDone) return 1;
      const faces = gallery.getStats().facesWithImage;
      const value = Math.min(1, faces / Math.max(1, targetFaces));
      if (value >= 1 || elapsed > READY_TIMEOUT_SECONDS) loadingDone = true;
      return loadingDone ? 1 : value;
    },
    update(dt: number, pointer: ScenePointer) {
      elapsed += dt;
      // A slow look around from the centre, nudged by the pointer.
      yaw += dt * 0.035;
      const targetPitch = Math.sin(elapsed * 0.07) * 0.18 - pointer.y * 0.25;
      pitch += (targetPitch - pitch) * (1 - Math.exp(-2 * dt));
      const lookYaw = yaw + pointer.x * 0.35;
      look.set(Math.sin(lookYaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(lookYaw) * Math.cos(pitch));
      camera.position.set(0, 0, 0);
      camera.lookAt(look);
      // Also while preloading: the gallery loads its screenshots from update().
      gallery.update(dt, camera);
    },
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      gallery.dispose();
    },
  };
}
