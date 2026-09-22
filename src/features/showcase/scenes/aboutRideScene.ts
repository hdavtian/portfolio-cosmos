import type * as THREE from "three";
import type { SceneData, ScenePointer, ShowcaseScene, ThreeModule } from "./types";

// A lite version of the cinematic About ride. The route builder and the GPU
// particle stream are imported as-is from the cinematic app (read-only); the
// landmarks the ride passes are light stand-ins built here: the Experience
// planet and moons, the Skills crystals, the Portfolio cores and the Career
// Gallery shell, around a sun. The camera rides the beam like the cinematic
// "invisible tram", then the beam bursts and a new route forms.

/** Same cruising speed as the cinematic ride (units / second). */
const RIDE_SPEED = 980;
const RIDE_CAMERA_HEIGHT = 110;
/** How far ahead on the route the rider looks (0..1 of the loop). */
const LOOK_AHEAD_T = 0.012;
/** Below this route speed the view turns toward the stop being passed. */
const STOP_LOOK_FULL_SPEED = 0.45;
const STOP_LOOK_NONE_SPEED = 1;
/** Seconds the crystal beam holds after the ride has looped, before bursting. */
const BURST_AFTER_LOOP_SECONDS = 1.5;

// Layout, spread like the cinematic universe.
const ABOUT_ORIGIN: [number, number, number] = [13723, 157, 5557];
const EXPERIENCE_CENTER: [number, number, number] = [-10500, 0, 5200];
const SKILLS_CENTER: [number, number, number] = [13600, 220, -12000];
const PORTFOLIO_CENTER: [number, number, number] = [1158, 157, 14760];
const GALLERY_CENTER: [number, number, number] = [-12000, 520, -13200];
const SUN_RADIUS = 1400;
const PLANET_RADIUS = 520;
const MOON_ORBIT_BASE = 1000;
const MOON_ORBIT_STEP = 260;
const MOON_COUNT = 6;
const CORE_SPACING = 1260;
const GALLERY_RADIUS = 900;

const shuffle = <T>(items: T[]): T[] => {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const glowTexture = (THREE: ThreeModule) => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.2, "rgba(255,240,210,0.6)");
  gradient.addColorStop(0.5, "rgba(255,190,120,0.16)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export async function createAboutRideScene(THREE: ThreeModule, data: SceneData): Promise<ShowcaseScene> {
  const [{ buildCosmicRoute, legacyLoopLength, routeSpeedAt }, { AboutPathParticles }] = await Promise.all([
    import("../../../components/cosmos/aboutJourney/cosmicRoute"),
    import("../../../components/cosmos/aboutJourney/AboutPathParticles"),
  ]);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03050a, 0.000028);
  const camera = new THREE.PerspectiveCamera(62, 1, 2, 90000);
  const disposables: Array<{ dispose: () => void }> = [];
  const glow = glowTexture(THREE);
  disposables.push(glow);
  const v = (xyz: [number, number, number]) => new THREE.Vector3(...xyz);

  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };
  const glowSprite = (color: THREE.ColorRepresentation, size: number, opacity: number) => {
    const sprite = new THREE.Sprite(
      track(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    sprite.scale.setScalar(size);
    return sprite;
  };

  // Stars.
  const starCount = 4000;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const direction = new THREE.Vector3().randomDirection().multiplyScalar(50000 + Math.random() * 30000);
    starPositions.set([direction.x, direction.y, direction.z], i * 3);
  }
  const starGeometry = track(new THREE.BufferGeometry());
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  scene.add(
    new THREE.Points(
      starGeometry,
      track(new THREE.PointsMaterial({ color: 0xcfe2ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false })),
    ),
  );

  // Sun.
  const sun = new THREE.Mesh(track(new THREE.SphereGeometry(SUN_RADIUS, 48, 48)), track(new THREE.MeshBasicMaterial({ color: 0xffd9a0 })));
  sun.add(glowSprite(0xffb46a, SUN_RADIUS * 9, 0.85));
  scene.add(sun);
  scene.add(new THREE.PointLight(0xfff0dd, 2.4, 0, 0), new THREE.AmbientLight(0x38465e, 0.9));

  // Experience: planet with moons.
  const experienceCenter = v(EXPERIENCE_CENTER);
  const planet = new THREE.Mesh(
    track(new THREE.SphereGeometry(PLANET_RADIUS, 40, 40)),
    track(new THREE.MeshStandardMaterial({ color: 0x3f7fb8, roughness: 0.8 })),
  );
  planet.position.copy(experienceCenter);
  planet.add(glowSprite(0x6fc3ff, PLANET_RADIUS * 5, 0.5));
  scene.add(planet);
  const moonGeometry = track(new THREE.SphereGeometry(120, 24, 24));
  const moons = Array.from({ length: MOON_COUNT }, (_, i) => {
    const radius = MOON_ORBIT_BASE + i * MOON_ORBIT_STEP;
    const moon = new THREE.Mesh(moonGeometry, track(new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55 + i * 0.05, 0.2, 0.55), roughness: 0.95 })));
    moon.add(glowSprite(0x9fd8ff, 700, 0.18));
    scene.add(moon);
    const orbit = new THREE.LineLoop(
      track(
        new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 128 }, (_, k) => {
            const a = (k / 128) * Math.PI * 2;
            return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius).add(experienceCenter);
          }),
        ),
      ),
      track(new THREE.LineBasicMaterial({ color: 0x6fb6e8, transparent: true, opacity: 0.25 })),
    );
    scene.add(orbit);
    return { moon, radius, angle: Math.random() * Math.PI * 2, speed: 0.05 / (1 + i * 0.3) };
  });

  // Skills: a cluster of crystals.
  const skillsCenter = v(SKILLS_CENTER);
  const crystals = new THREE.Group();
  crystals.position.copy(skillsCenter);
  const crystalGeometry = track(new THREE.OctahedronGeometry(60, 0));
  const branches = data.techStack.length > 0 ? data.techStack : Array.from({ length: 8 }, () => null);
  branches.forEach((_, i) => {
    const direction = new THREE.Vector3().randomDirection();
    const crystal = new THREE.Mesh(
      crystalGeometry,
      track(new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((i / branches.length) * 0.8, 0.7, 0.66), wireframe: true, transparent: true, opacity: 0.85 })),
    );
    crystal.position.copy(direction.multiplyScalar(220 + Math.random() * 220));
    crystal.add(glowSprite(0x9ff0ff, 320, 0.4));
    crystals.add(crystal);
  });
  scene.add(crystals);

  // Portfolio: the published cores on a grid.
  const portfolioCenter = v(PORTFOLIO_CENTER);
  const cores = data.portfolio.cores.length > 0 ? data.portfolio.cores : [{ name: "Portfolio", color: "#8fd3ff" }];
  const columns = Math.max(1, Math.ceil(Math.sqrt(cores.length)));
  const rows = Math.ceil(cores.length / columns);
  const coreGeometry = track(new THREE.SphereGeometry(60, 24, 24));
  const sliceGeometry = track(new THREE.TorusGeometry(110, 3, 8, 64));
  const coreGroups = cores.map((seed, index) => {
    const color = new THREE.Color(seed.color ?? "#8fd3ff");
    const group = new THREE.Group();
    group.position.set(
      (index % columns - (columns - 1) / 2) * CORE_SPACING,
      0,
      (Math.floor(index / columns) - (rows - 1) / 2) * CORE_SPACING,
    ).add(portfolioCenter);
    group.add(new THREE.Mesh(coreGeometry, track(new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.42) }))));
    group.add(glowSprite(color, 520, 0.6));
    const slices = new THREE.Group();
    for (let i = 0; i < 3; i += 1) {
      const slice = new THREE.Mesh(
        sliceGeometry,
        track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })),
      );
      slice.rotation.set(i * 0.9 + 0.4, i * 0.6, 0);
      slices.add(slice);
    }
    group.add(slices);
    scene.add(group);
    return { group, slices };
  });

  // Career Gallery: a faint wire shell.
  const galleryCenter = v(GALLERY_CENTER);
  const shell = new THREE.Mesh(
    track(new THREE.IcosahedronGeometry(GALLERY_RADIUS, 3)),
    track(new THREE.MeshBasicMaterial({ color: 0x7fe8ff, wireframe: true, transparent: true, opacity: 0.22 })),
  );
  shell.position.copy(galleryCenter);
  shell.add(glowSprite(0x7fe8ff, GALLERY_RADIUS * 3, 0.25));
  scene.add(shell);

  // The route and its particle stream.
  const origin = v(ABOUT_ORIGIN);
  const stops = [
    {
      name: "Experience",
      center: experienceCenter,
      passRadius: MOON_ORBIT_BASE + MOON_ORBIT_STEP * MOON_COUNT + 600,
      passOffset: new THREE.Vector3(0, 480, 0),
    },
    { name: "Skills", center: skillsCenter, passRadius: 520, slowOuter: 650 },
    {
      name: "Portfolio",
      center: portfolioCenter,
      passOffset: new THREE.Vector3(0, 420, 0),
      passRadius: columns * CORE_SPACING * 0.5 + 500,
    },
    {
      name: "Career Gallery",
      center: galleryCenter,
      passRadius: GALLERY_RADIUS * 1.4,
      slowInner: GALLERY_RADIUS * 2.65,
      slowOuter: GALLERY_RADIUS * 4.2,
    },
  ];
  const obstacles = [
    { center: new THREE.Vector3(), radius: SUN_RADIUS + 900 },
    { center: experienceCenter, radius: PLANET_RADIUS + 220 },
    ...coreGroups.map(({ group }) => ({ center: group.position.clone(), radius: 260 })),
  ];
  const referenceLength = legacyLoopLength(origin, stops.map((stop) => stop.center));

  const particles = new AboutPathParticles();
  particles.points.position.copy(origin);
  scene.add(particles.points);

  let curve = buildCosmicRoute({ origin, stops, obstacles, referenceLength });
  let rideT = 0;
  let travelled = 0;
  let loopedFor = -1;
  let bursting = false;
  const beginRoute = (order: typeof stops) => {
    curve = buildCosmicRoute({ origin, stops: order, obstacles, referenceLength });
    particles.begin(curve, origin);
    travelled = 0;
    loopedFor = -1;
    bursting = false;
  };
  beginRoute(stops);

  let elapsed = 0;
  const riderPosition = new THREE.Vector3();
  const lookAhead = new THREE.Vector3();
  const stopLook = new THREE.Vector3();
  const look = new THREE.Vector3();
  const smoothedLook = new THREE.Vector3();
  let lookPlaced = false;
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3();

  return {
    scene,
    camera,
    progress: () => 1,
    update(dt: number, pointer: ScenePointer, visible: boolean) {
      // Keep large preload steps from skipping the ride ahead.
      const step = Math.min(dt, 0.1);
      elapsed += step;

      const frame = particles.update(step, elapsed, true, 1);
      if (frame.burstCompleteEdge) beginRoute([stops[0], ...shuffle(stops.slice(1))]);
      if (!visible) return;

      moons.forEach((entry) => {
        entry.angle += entry.speed * step;
        entry.moon.position.set(Math.cos(entry.angle) * entry.radius, 0, Math.sin(entry.angle) * entry.radius).add(experienceCenter);
      });
      crystals.rotation.y += step * 0.05;
      coreGroups.forEach(({ slices }) => {
        slices.rotation.y -= step * 0.24;
        slices.rotation.z += step * 0.11;
      });
      shell.rotation.y += step * 0.02;

      if (bursting) return;

      // Ride the beam: slower through stops, faster between them.
      const { timing } = curve;
      const speed = RIDE_SPEED * routeSpeedAt(timing, rideT);
      travelled += speed * step;
      rideT = Math.min(1, travelled / timing.length);
      if (rideT >= 1 && loopedFor < 0) loopedFor = 0;
      if (loopedFor >= 0) {
        loopedFor += step;
        if (loopedFor > BURST_AFTER_LOOP_SECONDS) {
          bursting = true;
          particles.burst(0);
        }
      }

      const t = Math.min(rideT, 0.9999);
      curve.getPointAt(t, riderPosition);
      curve.getPointAt(Math.min(0.9999, t + LOOK_AHEAD_T), lookAhead);

      // Near a stop, turn the view toward what's being passed.
      const routeSpeed = routeSpeedAt(timing, t);
      const turn = THREE.MathUtils.clamp(
        (STOP_LOOK_NONE_SPEED - routeSpeed) / (STOP_LOOK_NONE_SPEED - STOP_LOOK_FULL_SPEED),
        0,
        1,
      );
      let nearest = timing.stopCenters[0];
      let nearestDistance = Infinity;
      for (const center of timing.stopCenters) {
        const distance = center.distanceToSquared(riderPosition);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = center;
        }
      }
      stopLook.copy(nearest ?? lookAhead);
      look.copy(lookAhead).lerp(stopLook, turn * 0.6);

      // Pointer steering looks around a little.
      side.copy(lookAhead).sub(riderPosition).normalize().cross(up).normalize();
      const lookDistance = look.distanceTo(riderPosition);
      look.addScaledVector(side, pointer.x * lookDistance * 0.5).addScaledVector(up, -pointer.y * lookDistance * 0.35);

      if (!lookPlaced) {
        smoothedLook.copy(look);
        lookPlaced = true;
      }
      smoothedLook.lerp(look, 1 - Math.exp(-2.2 * step));
      camera.position.copy(riderPosition).addScaledVector(up, RIDE_CAMERA_HEIGHT);
      camera.lookAt(smoothedLook);
    },
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      particles.dispose();
      disposables.forEach((item) => item.dispose());
    },
  };
}
