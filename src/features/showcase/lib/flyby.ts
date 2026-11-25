import type * as THREE from "three";

type ThreeModule = typeof import("three");

/**
 * HD-12: a freighter that now and then flies past over whatever scene is
 * showing, in the quick peek and the slow tour. It is an original ship in the
 * spirit of the classic battered space freighter (a disc hull, a cockpit pod
 * out to one side, split cargo prongs at the front, a blue engine strip),
 * built from plain geometry, so there is no model file and no license.
 *
 * It has its own small scene, camera and renderer, drawing on its own
 * transparent canvas laid over the scene layer, so no scene had to change.
 * That canvas sits outside the toned layer: the ship keeps its own colors
 * and its blue engine whatever tone the scene is in. It only draws while a
 * pass is flying.
 */

export interface Flyby {
  /** Starts a pass now, unless one is already flying. */
  launch(): void;
  /** Whether a pass is on screen. */
  readonly flying: boolean;
  update(dt: number): void;
  /** Draws the ship on its canvas (and clears it once a pass is over). */
  render(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** The ship, about 6 units across, nose along -Z. */
function buildShip(THREE: ThreeModule) {
  const ship = new THREE.Group();
  const hullMaterial = new THREE.MeshStandardMaterial({ color: "#b9b6ae", roughness: 0.72, metalness: 0.25, flatShading: true });
  const panelMaterial = new THREE.MeshStandardMaterial({ color: "#8f8b83", roughness: 0.8, metalness: 0.2, flatShading: true });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#4b4944", roughness: 0.9, metalness: 0.3, flatShading: true });
  const rustMaterial = new THREE.MeshStandardMaterial({ color: "#8a5a3c", roughness: 0.95, metalness: 0.1, flatShading: true });

  // The disc: a low, wide hull, slightly domed top and bottom.
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.1, 0.55, 40, 1), hullMaterial);
  ship.add(disc);
  for (const side of [1, -1]) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.9, 40, 8, 0, Math.PI * 2, 0, Math.PI / 2), hullMaterial);
    dome.scale.set(1, 0.16, 1);
    dome.rotation.x = side === 1 ? 0 : Math.PI;
    dome.position.y = side * 0.27;
    ship.add(dome);
  }
  // A ring of darker trim round the rim, and raised plating on top.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.09, 6, 48), darkMaterial);
  rim.rotation.x = Math.PI / 2;
  ship.add(rim);
  for (let index = 0; index < 26; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = rand(0.8, 2.6);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(rand(0.25, 0.7), rand(0.05, 0.14), rand(0.2, 0.6)),
      Math.random() < 0.2 ? rustMaterial : Math.random() < 0.5 ? panelMaterial : darkMaterial,
    );
    plate.position.set(Math.cos(angle) * radius, 0.5 - radius * 0.07, Math.sin(angle) * radius);
    plate.rotation.y = -angle + rand(-0.4, 0.4);
    ship.add(plate);
  }

  // Split cargo prongs at the front, a gap between them.
  for (const side of [1, -1]) {
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 2.4), panelMaterial);
    prong.position.set(side * 0.72, 0, -3.3);
    ship.add(prong);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.3, 0.4), darkMaterial);
    tip.position.set(side * 0.72, 0, -4.55);
    ship.add(tip);
  }

  // The cockpit pod, out on the right on a short neck, its canopy lit.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.8, 10), hullMaterial);
  neck.rotation.x = Math.PI / 2;
  neck.position.set(2.75, 0, -1.6);
  ship.add(neck);
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), hullMaterial);
  pod.scale.set(1, 0.9, 1.15);
  pod.position.set(2.75, 0, -2.55);
  ship.add(pod);
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshStandardMaterial({ color: "#2a3b4a", emissive: "#7fd3ff", emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.6 }),
  );
  canopy.rotation.x = -Math.PI / 2;
  canopy.position.set(2.75, 0.02, -2.95);
  ship.add(canopy);

  // A dish on top, offset, and a turret below.
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.12, 0.18, 14), darkMaterial);
  dish.position.set(-1.2, 0.72, -0.6);
  dish.rotation.z = 0.3;
  ship.add(dish);
  const turret = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), panelMaterial);
  turret.scale.y = 0.6;
  turret.position.set(0.2, -0.45, 0.2);
  ship.add(turret);

  // The engine strip along the back edge, glowing blue.
  const engineMaterial = new THREE.MeshBasicMaterial({ color: "#8fe0ff" });
  const engine = new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.13, 6, 32, Math.PI * 0.62), engineMaterial);
  engine.rotation.x = Math.PI / 2;
  engine.rotation.z = Math.PI / 2 - Math.PI * 0.31;
  engine.position.y = 0.02;
  ship.add(engine);

  return { ship, engineMaterial };
}

/** A soft round glow, drawn once on a canvas (a sprite without a texture is a square). */
function glowTexture(THREE: ThreeModule) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(220, 245, 255, 1)");
    gradient.addColorStop(0.3, "rgba(120, 210, 255, 0.55)");
    gradient.addColorStop(1, "rgba(60, 160, 255, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The kinds of pass, as points in camera space (camera at the origin looking
 * down -Z), so they read the same over every scene.
 */
type PassKind = "cross" | "overShoulder" | "headOn" | "climb" | "weave";
const PASSES: PassKind[] = ["cross", "overShoulder", "headOn", "climb", "weave"];

function passPoints(THREE: ThreeModule, kind: PassKind): { points: THREE.Vector3[]; seconds: number } {
  const side = Math.random() < 0.5 ? 1 : -1;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x * side, y, z);
  switch (kind) {
    case "cross":
      // Across the screen at mid distance, dipping and banking.
      return {
        points: [v(-60, rand(-4, 6), -55), v(-18, rand(-6, 2), -40), v(14, rand(0, 8), -38), v(70, rand(-2, 8), -60)],
        seconds: rand(2.6, 3.4),
      };
    case "overShoulder":
      // From behind the viewer, over the shoulder, away into the scene.
      return {
        points: [v(8, 4, 12), v(5, 1, -6), v(-2, -1, -40), v(-10, 3, -140)],
        seconds: rand(2.6, 3.2),
      };
    case "headOn":
      // Far off, straight at the viewer, then a hard peel away past one side.
      return {
        points: [v(-4, 2, -170), v(-1, 0, -60), v(5, -2, -16), v(30, -8, 10)],
        seconds: rand(2.4, 3),
      };
    case "climb":
      // Low on one side, climbing steeply across and out of the top.
      return {
        points: [v(-40, -26, -60), v(-10, -12, -46), v(10, 6, -44), v(30, 34, -70)],
        seconds: rand(2.6, 3.2),
      };
    default:
      // Close and fast, weaving left and right as it goes.
      return {
        points: [v(-50, 0, -34), v(-20, 5, -26), v(-2, -4, -24), v(18, 4, -26), v(55, -2, -36)],
        seconds: rand(2.4, 3),
      };
  }
}

export function createFlyby(THREE: ThreeModule, canvas: HTMLCanvasElement): Flyby {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  let drawn = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 600);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2418, 1.1));
  const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
  key.position.set(-30, 40, 20);
  scene.add(key);
  const rimLight = new THREE.DirectionalLight(0x86c8ff, 1.2);
  rimLight.position.set(30, -10, -40);
  scene.add(rimLight);

  const { ship, engineMaterial } = buildShip(THREE);
  scene.add(ship);
  ship.visible = false;

  // Engine glow and a short trail of fading glows behind it.
  const glow = glowTexture(THREE);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flare.scale.setScalar(4.5);
  scene.add(flare);
  const trail = Array.from({ length: 10 }, (_, index) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 * (1 - index / 10) }),
    );
    sprite.scale.setScalar(3 * (1 - index / 12));
    scene.add(sprite);
    return sprite;
  });
  const history: THREE.Vector3[] = [];
  const hideAll = () => {
    ship.visible = false;
    flare.visible = false;
    for (const sprite of trail) sprite.visible = false;
  };
  hideAll();

  let curve: THREE.CatmullRomCurve3 | null = null;
  let seconds = 3;
  let t = 0;
  let lastRoll = 0;
  const point = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const previousTangent = new THREE.Vector3();
  const rear = new THREE.Vector3();

  return {
    get flying() {
      return curve !== null;
    },
    launch() {
      if (curve) return;
      const pass = passPoints(THREE, PASSES[Math.floor(Math.random() * PASSES.length)]);
      curve = new THREE.CatmullRomCurve3(pass.points, false, "centripetal");
      seconds = pass.seconds;
      t = 0;
      lastRoll = 0;
      history.length = 0;
      curve.getTangentAt(0, previousTangent);
      ship.visible = true;
      flare.visible = true;
    },
    update(dt: number) {
      if (!curve) return;
      t += dt / seconds;
      if (t >= 1) {
        curve = null;
        hideAll();
        return;
      }
      // A gentle ease so it surges in and out rather than sliding.
      const u = t < 0.5 ? 2 * t * t * 0.4 + t * 0.6 : 1 - (2 * (1 - t) * (1 - t) * 0.4 + (1 - t) * 0.6);
      curve.getPointAt(u, point);
      curve.getPointAt(Math.min(1, u + 0.01), ahead);
      curve.getTangentAt(u, tangent);
      ship.position.copy(point);
      // lookAt aims an object's +Z; the ship is modeled nose along -Z.
      ship.lookAt(ahead);
      ship.rotateY(Math.PI);
      // Bank into the turn: roll follows how fast the heading swings sideways,
      // plus a small weave of its own.
      const swing = (tangent.x - previousTangent.x) / Math.max(1e-4, dt);
      previousTangent.copy(tangent);
      const targetRoll = THREE.MathUtils.clamp(-swing * 0.35, -1.1, 1.1) + Math.sin(t * Math.PI * 3) * 0.18;
      lastRoll += (targetRoll - lastRoll) * (1 - Math.exp(-6 * dt));
      ship.rotateZ(lastRoll);
      // The engine strip sits at the back (+Z in the ship's frame).
      rear.set(0, 0, 3.1).applyQuaternion(ship.quaternion).add(point);
      flare.position.copy(rear);
      const pulse = 0.85 + Math.random() * 0.3;
      flare.scale.setScalar(4.5 * pulse);
      engineMaterial.color.setHSL(0.54, 0.9, 0.72 + 0.1 * pulse);
      history.unshift(rear.clone());
      if (history.length > trail.length * 2) history.length = trail.length * 2;
      trail.forEach((sprite, index) => {
        const at = history[index * 2];
        sprite.visible = Boolean(at);
        if (at) sprite.position.copy(at);
      });
    },
    render() {
      if (!curve) {
        // Leave nothing behind after a pass; then stay idle.
        if (drawn) {
          renderer.clear();
          drawn = false;
        }
        return;
      }
      renderer.render(scene, camera);
      drawn = true;
    },
    resize(width: number, height: number) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      scene.traverse((object) => {
        const mesh = object as { geometry?: { dispose(): void }; material?: { dispose(): void } };
        mesh.geometry?.dispose?.();
        mesh.material?.dispose?.();
      });
      glow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
