import { useEffect, useLayoutEffect, useRef } from "react";
import type { ShowcaseProject } from "../lib/useShowcaseProjects";

export type SceneLoadState =
  | { phase: "idle" }
  | { phase: "loading"; progress: number }
  | { phase: "ready" }
  | { phase: "failed" };

interface GalleryBackdropProps {
  projects: ShowcaseProject[];
  onState: (state: SceneLoadState) => void;
}

/** Tiles showing a screenshot before the scene counts as ready. */
const READY_FACES = 70;
/** Show whatever has loaded by then rather than keep visitors waiting. */
const READY_TIMEOUT_MS = 14000;

/**
 * The cinematic site's Career Gallery, seen from inside, as the showcase
 * background. The gallery class is imported as-is from the Three.js app (not
 * modified); this component only supplies a camera, a renderer and the
 * portfolio images, and reports loading progress for the loader bar.
 */
export function GalleryBackdrop({ projects, onState }: GalleryBackdropProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onStateRef = useRef(onState);
  // Build once projects exist; later data changes do not rebuild the scene.
  const hasProjects = projects.length > 0;
  const projectsRef = useRef(projects);
  useLayoutEffect(() => {
    onStateRef.current = onState;
    projectsRef.current = projects;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasProjects) return;
    let disposed = false;
    let cleanup = () => {};
    onStateRef.current({ phase: "loading", progress: 0 });

    void Promise.all([import("three"), import("../../../components/cosmos/careerGallery/CareerGallery")])
      .then(([THREE, { CareerGallery }]) => {
        if (disposed) return;

        const items = projectsRef.current.flatMap((project) =>
          project.detailMedia
            .filter((media) => media.image)
            .map((media) => ({
              url: media.image as string,
              title: project.title,
              subtitle: [project.category, project.year].filter(Boolean).join(" · "),
              year: project.year,
            })),
        );

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x03050a, 1);
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(72, 1, 1, 4000);
        const gallery = new CareerGallery({ items });
        gallery.setInteriorMode(true);
        scene.add(gallery.root);

        const resize = () => {
          const { clientWidth, clientHeight } = host;
          renderer.setSize(clientWidth, clientHeight, false);
          camera.aspect = clientWidth / Math.max(1, clientHeight);
          camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();

        // A slow look around from the centre, nudged by the pointer.
        const pointer = { x: 0, y: 0 };
        const onPointerMove = (event: PointerEvent) => {
          pointer.x = event.clientX / window.innerWidth - 0.5;
          pointer.y = event.clientY / window.innerHeight - 0.5;
        };
        window.addEventListener("pointermove", onPointerMove, { passive: true });

        const look = new THREE.Vector3();
        let yaw = 0;
        let pitch = 0;
        let elapsed = 0;
        let ready = false;
        let reportedPercent = -1;
        let frame = 0;
        let last = performance.now();
        const targetFaces = Math.min(READY_FACES, items.length);

        const render = (now: number) => {
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          elapsed += dt;

          yaw += dt * 0.035;
          const targetPitch = Math.sin(elapsed * 0.07) * 0.18 - pointer.y * 0.25;
          pitch += (targetPitch - pitch) * (1 - Math.exp(-2 * dt));
          const lookYaw = yaw + pointer.x * 0.35;
          look.set(Math.sin(lookYaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(lookYaw) * Math.cos(pitch));
          camera.position.set(0, 0, 0);
          camera.lookAt(look);

          gallery.update(dt, camera);
          renderer.render(scene, camera);

          if (!ready) {
            const stats = gallery.getStats();
            const progress = targetFaces > 0 ? Math.min(1, stats.facesWithImage / targetFaces) : 1;
            if (progress >= 1 || elapsed * 1000 > READY_TIMEOUT_MS) {
              ready = true;
              onStateRef.current({ phase: "ready" });
            } else if (Math.round(progress * 100) !== reportedPercent) {
              // Only when the percentage changes, not every frame.
              reportedPercent = Math.round(progress * 100);
              onStateRef.current({ phase: "loading", progress });
            }
          }
          frame = requestAnimationFrame(render);
        };

        const onVisibility = () => {
          cancelAnimationFrame(frame);
          if (!document.hidden) {
            last = performance.now();
            frame = requestAnimationFrame(render);
          }
        };
        document.addEventListener("visibilitychange", onVisibility);
        frame = requestAnimationFrame(render);

        cleanup = () => {
          cancelAnimationFrame(frame);
          document.removeEventListener("visibilitychange", onVisibility);
          window.removeEventListener("pointermove", onPointerMove);
          observer.disconnect();
          gallery.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => {
        if (!disposed) onStateRef.current({ phase: "failed" });
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [hasProjects]);

  return <div ref={hostRef} className="showcase-gallery__canvas" aria-hidden="true" />;
}
