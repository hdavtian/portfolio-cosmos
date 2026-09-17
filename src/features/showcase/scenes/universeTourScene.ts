import type * as THREE from "three";
import type { SceneContext, ScenePointer, ShowcaseScene, ThreeModule } from "./types";

// A tour of the cinematic universe with lightspeed jumps between worlds. The
// 3D universe backdrop (sky, 100k stars, galaxies and its warp tunnel) and the
// sun's surface, corona and flares are imported as-is from the cinematic app
// (read-only). The planets and the flight itself are built here: the camera
// drifts around a world, then jumps to lightspeed toward the next one.

const PLANETS: Array<{ texture: string; radius: number; orbit: number; tilt?: number; ring?: boolean }> = [
  { texture: "mercury.jpg", radius: 70, orbit: 2600 },
  { texture: "venus.jpg", radius: 110, orbit: 4300 },
  { texture: "earth.jpg", radius: 120, orbit: 6400 },
  { texture: "mars.jpg", radius: 90, orbit: 8800 },
  { texture: "jupiter.jpg", radius: 320, orbit: 12500 },
  { texture: "saturn.jpg", radius: 270, orbit: 17000, ring: true, tilt: 0.45 },
  { texture: "uranus.jpg", radius: 190, orbit: 21000, tilt: 1.2 },
  { texture: "neptune.jpg", radius: 180, orbit: 25000 },
];
const SUN_STOP_RADIUS = 240;

/** Seconds spent drifting around a world before the next jump. */
const CRUISE_SECONDS = 11;
/** Jump duration grows with distance, within these bounds. */
const JUMP_MIN_SECONDS = 3.2;
const JUMP_MAX_SECONDS = 6;
/** Part of the jump spent at lightspeed (between spool-up and drop-out). */
const WARP_START = 0.12;
const WARP_END = 0.84;
/** Loading counts as done after this long even if textures are still coming. */
const READY_TIMEOUT_SECONDS = 8;

export async function createUniverseTourScene(
  THREE: ThreeModule,
  _data: unknown,
  context: SceneContext,
): Promise<ShowcaseScene> {
  const [{ UniverseBackdrop }, { SunEnhancements }, { createSunMesh, createSunGlowTexture }, { SUN_GLOW_SPRITE_SIZE }] =
    await Promise.all([
      import("../../../components/cosmos/universeBackdrop/UniverseBackdrop"),
      import("../../../components/cosmos/celestial/SunEnhancements"),
      import("../../../components/cosmos/ResumeSpace3D.factories"),
      import("../../../components/cosmos/scaleConfig"),
    ]);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 5, 120000);
  const baseFov = camera.fov;
  const disposables: Array<{ dispose: () => void }> = [];

  const backdrop = new UniverseBackdrop(context.renderer, scene);
  const travelDirection = new THREE.Vector3(0, 0, -1);
  let warping = false;
  backdrop.setTravelSource(() => ({ active: warping, direction: travelDirection }));
  backdrop.setStyle("realism");

  // Sun, as the cinematic app builds it, with its glow sprites and effects.
  const loader = new THREE.TextureLoader();
  const { sunMesh, sunMaterial } = createSunMesh(loader);
  const glowTexture = createSunGlowTexture();
  disposables.push(sunMesh.geometry, sunMaterial, glowTexture);
  (
    [
      [0xffaa00, 2.2, 1],
      [0xffc27a, 4.2, 0.9],
      [0xffd6a8, 7.4, 0.52],
    ] as const
  ).forEach(([color, scale, opacity]) => {
    const material = new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(SUN_GLOW_SPRITE_SIZE * scale, SUN_GLOW_SPRITE_SIZE * scale, 1);
    sunMesh.add(sprite);
    disposables.push(material);
  });
  scene.add(sunMesh);
  const sunEffects = new SunEnhancements(sunMesh, scene);
  scene.add(new THREE.PointLight(0xfff1dc, 2.6, 0, 0), new THREE.AmbientLight(0x2a3346, 0.55));

  // Planets on their orbits, textures loading progressively.
  let texturesLoaded = 0;
  const planets = PLANETS.map((def, index) => {
    const angle = index * 2.4 + Math.random() * 0.6;
    const material = new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 0.92, metalness: 0 });
    const geometry = new THREE.SphereGeometry(def.radius, 48, 32);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(Math.cos(angle) * def.orbit, Math.sin(index * 1.3) * 180, Math.sin(angle) * def.orbit);
    mesh.rotation.z = def.tilt ?? 0.2;
    disposables.push(material, geometry);
    loader.load(
      `/textures/${def.texture}`,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        disposables.push(texture);
        texturesLoaded += 1;
      },
      undefined,
      () => {
        texturesLoaded += 1;
      },
    );
    if (def.ring) {
      const ringGeometry = new THREE.RingGeometry(def.radius * 1.35, def.radius * 2.3, 96);
      const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0xd9c7a2,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      loader.load("/textures/saturn_ring.png", (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        ringMaterial.map = texture;
        ringMaterial.alphaMap = texture;
        ringMaterial.color.set(0xffffff);
        ringMaterial.needsUpdate = true;
        disposables.push(texture);
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      mesh.add(ring);
      disposables.push(ringGeometry, ringMaterial);
    }
    scene.add(mesh);
    return { mesh, radius: def.radius };
  });
  const stops = [{ mesh: sunMesh, radius: SUN_STOP_RADIUS }, ...planets];

  // Flight: cruise around a stop, then jump to lightspeed toward another.
  type Phase = { kind: "cruise"; stop: number; time: number } | { kind: "jump"; from: number; to: number; time: number; duration: number };
  let current = 2 + Math.floor(Math.random() * (stops.length - 2));
  let phase: Phase = { kind: "cruise", stop: current, time: 0 };
  let orbitAngle = Math.random() * Math.PI * 2;
  let elapsed = 0;

  const viewDistance = (radius: number) => radius * 5.5 + 260;
  const cruisePose = (stop: number, angle: number, out: THREE.Vector3) => {
    const { mesh, radius } = stops[stop];
    const distance = viewDistance(radius);
    return out.set(Math.cos(angle) * distance, radius * 1.1 + 60, Math.sin(angle) * distance).add(mesh.position);
  };
  const pickNext = (from: number) => {
    let next = from;
    while (next === from) next = Math.floor(Math.random() * stops.length);
    return next;
  };

  const position = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const smoothedLook = new THREE.Vector3();
  const jumpStart = new THREE.Vector3();
  const jumpEnd = new THREE.Vector3();
  const offset = new THREE.Vector3();
  let placed = false;
  const occluders = () => planets.map(({ mesh, radius }) => ({ center: mesh.position, radius }));

  return {
    scene,
    camera,
    progress() {
      if (elapsed > READY_TIMEOUT_SECONDS) return 1;
      return Math.min(1, texturesLoaded / PLANETS.length);
    },
    update(dt: number, pointer: ScenePointer, visible: boolean) {
      const step = Math.min(dt, 0.1);
      elapsed += step;
      if (!visible) return;

      planets.forEach(({ mesh }, index) => {
        mesh.rotation.y += step * (0.05 + index * 0.004);
      });

      let lookBlend = 1 - Math.exp(-2 * step);
      if (phase.kind === "cruise") {
        phase.time += step;
        orbitAngle += step * 0.045;
        cruisePose(phase.stop, orbitAngle, position);
        lookTarget.copy(stops[phase.stop].mesh.position);
        warping = false;
        if (phase.time > CRUISE_SECONDS) {
          const to = pickNext(phase.stop);
          jumpStart.copy(position);
          const distance = stops[to].mesh.position.distanceTo(position);
          phase = {
            kind: "jump",
            from: phase.stop,
            to,
            time: 0,
            duration: THREE.MathUtils.clamp(distance / 5000, JUMP_MIN_SECONDS, JUMP_MAX_SECONDS),
          };
        }
      } else {
        phase.time += step;
        const t = Math.min(1, phase.time / phase.duration);
        // Arrive on the side of the destination facing where we came from.
        offset.copy(jumpStart).sub(stops[phase.to].mesh.position);
        const arrivalAngle = Math.atan2(offset.z, offset.x);
        cruisePose(phase.to, arrivalAngle, jumpEnd);
        // Slow spool-up, almost all distance covered at lightspeed, gentle drop-out.
        const eased = THREE.MathUtils.smootherstep(t, WARP_START * 0.6, WARP_END + 0.08);
        position.lerpVectors(jumpStart, jumpEnd, eased);
        travelDirection.copy(jumpEnd).sub(jumpStart).normalize();
        warping = t > WARP_START && t < WARP_END;
        lookTarget.copy(stops[phase.to].mesh.position);
        lookBlend = 1 - Math.exp(-(t < WARP_START ? 3 : 5) * step);
        if (t >= 1) {
          orbitAngle = arrivalAngle;
          current = phase.to;
          phase = { kind: "cruise", stop: current, time: 0 };
        }
      }

      if (!placed) {
        smoothedLook.copy(lookTarget);
        placed = true;
      }
      smoothedLook.lerp(lookTarget, lookBlend);
      camera.position.copy(position);
      camera.lookAt(smoothedLook);
      // Pointer glances around a little.
      camera.rotateY(-pointer.x * 0.35);
      camera.rotateX(-pointer.y * 0.2);

      const fov = baseFov + (warping ? 6 : 0);
      if (Math.abs(camera.fov - fov) > 0.02) {
        camera.fov += (fov - camera.fov) * (1 - Math.exp(-4.5 * step));
        camera.updateProjectionMatrix();
      }

      sunEffects.update(step, camera, occluders);
    },
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      backdrop.dispose();
      sunEffects.dispose();
      disposables.forEach((item) => item.dispose());
    },
  };
}
