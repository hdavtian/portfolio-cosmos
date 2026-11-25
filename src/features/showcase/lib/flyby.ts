import type * as THREE from "three";

type ThreeModule = typeof import("three");

/**
 * HD-12: the freighter that now and then flies past over whatever scene is
 * showing, in the quick peek and the slow tour. It is the same ship model the
 * Universe flies (loaded late, a few seconds after the first scene shows, and
 * shared with the Universe through the browser cache). If the model can't be
 * loaded, an original ship built from plain geometry stands in (buildShip).
 *
 * It has its own small scene, camera and renderer, drawing on its own
 * transparent canvas laid over the scene layer, so no scene had to change.
 * That canvas sits outside the toned layer: the ship keeps its own colors
 * and its blue engine whatever tone the scene is in. It only draws while a
 * pass is flying.
 */

export interface Flyby {
  /** Starts loading the ship model (once); passes wait until it is in. */
  preload(): void;
  /** Starts a pass now, unless one is already flying or the ship isn't ready. */
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

/** The stand-in ship, about 6 units across, nose along -Z. */
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

/** The real ship: the same model the Universe flies, shared through the browser cache. */
const SHIP_MODEL_URL = "/models/falcon2/falcon2.glb";
/** The ship's length, in the fly-by's units (the passes are laid out for this). */
const SHIP_SIZE = 7;
/** Imported engines can be authored very bright; capped so the grille stays readable. */
const MAX_EMISSIVE = 1.2;

/** Loads and prepares the model the way the Universe does: fitted, centered, gear up. */
async function loadShipModel(THREE: ThreeModule) {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(SHIP_MODEL_URL);
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(SHIP_SIZE / Math.max(size.x, size.y, size.z, 0.0001));
  box.setFromObject(model);
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const engines: Array<{ material: THREE.MeshStandardMaterial; base: number }> = [];
  model.traverse((object) => {
    // Always in flight here: no landing gear.
    if (/landing[\s_]*gear/i.test(object.name)) object.visible = false;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const standard = material as THREE.MeshStandardMaterial;
      if (!standard.isMeshStandardMaterial) continue;
      standard.emissiveIntensity = Math.min(standard.emissiveIntensity, MAX_EMISSIVE);
      // The hull's emissive map is black except the engine grille.
      if (standard.emissiveMap) engines.push({ material: standard, base: standard.emissiveIntensity });
    }
  });
  const ship = new THREE.Group();
  ship.add(model);
  box.setFromObject(ship);
  // The model's nose is +Z, so the engines are at the back, -Z.
  return { ship, engines, rearZ: box.min.z };
}

/*
 * Flight. A ship this heavy doesn't follow a curve drawn through points: it
 * holds a steady cruise speed along its heading and changes heading only at a
 * limited turn rate, so it flies straight lines and wide arcs. It banks into
 * each turn by the coordinated-turn angle, atan(turn rate x speed / g), eased
 * in and out, and pitches only gently. Passes are set up in camera space
 * (camera at the origin, looking down -Z), so they read the same over every
 * scene, and mirrored left/right at random.
 */
interface Pass {
  position: THREE.Vector3;
  heading: THREE.Vector3;
  /** Cruise speed, units per second. */
  speed: number;
  /** Turn rate (radians/second about world up; positive turns left) over time. */
  yawRate: (t: number) => number;
  /** Pitch rate (radians/second; positive noses up) over time. */
  pitchRate: (t: number) => number;
}

/** "g" for the bank angle: tuned so a 0.5 rad/s turn at speed 50 banks about 40 degrees. */
const BANK_G = 30;
const MAX_BANK = 1.0;

const smooth = (from: number, to: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - from) / Math.max(1e-6, to - from)));
  return x * x * (3 - 2 * x);
};
/** A rate that eases in at `from`, holds, and eases out after `to`. */
const turn = (rate: number, from: number, to: number) => (t: number) =>
  rate * smooth(from, from + 0.7, t) * (1 - smooth(to, to + 0.7, t));
const none = () => 0;

type PassKind = "flyover" | "overShoulder" | "passBy" | "bankAway" | "climbOut";
const PASSES: PassKind[] = ["flyover", "overShoulder", "passBy", "bankAway", "climbOut"];

function makePass(THREE: ThreeModule, kind: PassKind): Pass {
  const side = Math.random() < 0.5 ? 1 : -1;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x * side, y, z);
  switch (kind) {
    case "flyover":
      // Across the view at mid distance, easing into a gentle curve away.
      return {
        position: v(-75, rand(-3, 9), -60),
        heading: v(1, 0.02, -0.12).normalize(),
        speed: 46,
        yawRate: turn(side * 0.14, 1.0, 3.5),
        pitchRate: none,
      };
    case "overShoulder":
      // From behind the viewer, out over their shoulder and away, then a
      // banked turn as it recedes.
      return {
        position: v(9, 4, 16),
        heading: v(-0.14, -0.05, -1).normalize(),
        speed: 52,
        yawRate: turn(side * 0.42, 1.0, 4),
        pitchRate: none,
      };
    case "passBy": {
      // Far off, coming at the viewer, and roaring past close to one side.
      const position = v(-6, -1, -260);
      return {
        position,
        heading: v(18, 5, 20).sub(position).normalize(),
        speed: 68,
        yawRate: turn(side * 0.1, 2.6, 5),
        pitchRate: turn(0.05, 2.6, 5),
      };
    }
    case "bankAway":
      // In from one side heading slightly toward the viewer, then a hard
      // banked turn that carries it away into the distance.
      return {
        position: v(-60, -3, -75),
        heading: v(1, 0.04, 0.35).normalize(),
        speed: 50,
        yawRate: turn(side * 0.55, 0.6, 4.5),
        pitchRate: turn(0.04, 0.6, 3),
      };
    default:
      // Low on one side, climbing across the view and out of the top, leveling a little.
      return {
        position: v(-50, -32, -75),
        heading: v(0.8, 0.42, -0.25).normalize(),
        speed: 50,
        yawRate: turn(-side * 0.08, 0.5, 3),
        pitchRate: turn(-0.06, 0.8, 3),
      };
  }
}

/** A pass ends once the ship has been seen and has left the view (or after this long). */
const PASS_MAX_SECONDS = 8;

export function createFlyby(THREE: ThreeModule, canvas: HTMLCanvasElement): Flyby {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  // Filmic response, so the hull keeps its contrast instead of washing out.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  let drawn = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 800);
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x1a1610, 0.45));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
  key.position.set(-30, 45, 25);
  scene.add(key);
  const rimLight = new THREE.DirectionalLight(0x86c8ff, 1.4);
  rimLight.position.set(35, -10, -45);
  scene.add(rimLight);

  // The body flies; the ship inside it is the real model once loaded, or
  // the built one if the model can't be had.
  const body = new THREE.Group();
  body.visible = false;
  scene.add(body);
  let engines: Array<{ material: THREE.MeshStandardMaterial; base: number }> = [];
  let builtEngine: THREE.MeshBasicMaterial | null = null;
  let rearZ = -SHIP_SIZE / 2;
  let ready = false;
  let loading = false;
  const useBuiltShip = () => {
    const { ship, engineMaterial } = buildShip(THREE);
    // The built ship's nose is -Z; turn it to match the model (+Z).
    ship.rotation.y = Math.PI;
    ship.scale.setScalar(SHIP_SIZE / 9.6);
    body.add(ship);
    builtEngine = engineMaterial;
    rearZ = -3.1 * (SHIP_SIZE / 9.6);
    ready = true;
  };

  // Engine glow and a short trail of fading glows behind it.
  const glow = glowTexture(THREE);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(flare);
  const trail = Array.from({ length: 10 }, (_, index) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 * (1 - index / 10) }),
    );
    sprite.scale.setScalar(2.6 * (1 - index / 12));
    scene.add(sprite);
    return sprite;
  });
  const history: THREE.Vector3[] = [];
  const hideAll = () => {
    body.visible = false;
    flare.visible = false;
    for (const sprite of trail) sprite.visible = false;
  };
  hideAll();

  let pass: Pass | null = null;
  let elapsed = 0;
  let seen = false;
  let bank = 0;
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const rear = new THREE.Vector3();
  const projected = new THREE.Vector3();

  return {
    get flying() {
      return pass !== null;
    },
    preload() {
      if (loading || ready) return;
      loading = true;
      loadShipModel(THREE)
        .then((loaded) => {
          body.add(loaded.ship);
          engines = loaded.engines;
          rearZ = loaded.rearZ;
          ready = true;
        })
        .catch(useBuiltShip);
    },
    launch() {
      if (pass || !ready) return;
      pass = makePass(THREE, PASSES[Math.floor(Math.random() * PASSES.length)]);
      elapsed = 0;
      seen = false;
      bank = 0;
      history.length = 0;
      body.visible = true;
      flare.visible = true;
    },
    update(dt: number) {
      if (!pass) return;
      elapsed += dt;
      // Turn and pitch at the pass's rates, then fly on at cruise speed.
      const yawRate = pass.yawRate(elapsed);
      pass.heading.applyAxisAngle(worldUp, yawRate * dt);
      right.crossVectors(pass.heading, worldUp).normalize();
      pass.heading.applyAxisAngle(right, pass.pitchRate(elapsed) * dt).normalize();
      pass.position.addScaledVector(pass.heading, pass.speed * dt);

      // Nose along the heading, banked into the turn (right wing down for a
      // right turn), eased so the roll never snaps.
      const targetBank = THREE.MathUtils.clamp(Math.atan((-yawRate * pass.speed) / BANK_G), -MAX_BANK, MAX_BANK);
      bank += (targetBank - bank) * (1 - Math.exp(-3 * dt));
      body.position.copy(pass.position);
      ahead.copy(pass.position).add(pass.heading);
      body.lookAt(ahead);
      body.rotateZ(bank);

      // Done once it has been on screen and has left it.
      projected.copy(pass.position).project(camera);
      const inView = projected.z < 1 && Math.abs(projected.x) < 1.15 && Math.abs(projected.y) < 1.15 && pass.position.z < 0;
      if (inView) seen = true;
      if ((seen && !inView) || elapsed > PASS_MAX_SECONDS) {
        pass = null;
        hideAll();
        return;
      }

      // Engines: the grille brightens and flickers, a flare and trail behind.
      const pulse = 0.85 + Math.random() * 0.3;
      for (const engine of engines) engine.material.emissiveIntensity = engine.base * (1.2 + 0.6 * pulse);
      builtEngine?.color.setHSL(0.54, 0.9, 0.72 + 0.1 * pulse);
      rear.set(0, 0, rearZ).applyQuaternion(body.quaternion).add(pass.position);
      flare.position.copy(rear);
      flare.scale.setScalar(3.2 * pulse);
      history.unshift(rear.clone());
      if (history.length > trail.length * 2) history.length = trail.length * 2;
      trail.forEach((sprite, index) => {
        const at = history[index * 2];
        sprite.visible = Boolean(at);
        if (at) sprite.position.copy(at);
      });
    },
    render() {
      if (!pass) {
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
        const mesh = object as { geometry?: { dispose(): void }; material?: { dispose(): void } | Array<{ dispose(): void }> };
        mesh.geometry?.dispose?.();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material?.dispose?.();
      });
      glow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
