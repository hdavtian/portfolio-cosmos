import type * as THREE from "three";
import type { SceneData, ScenePointer, ShowcaseScene, ThreeModule } from "./types";

// A preview of the cinematic Orbital Portfolio, rebuilt as its own module from
// the orbital code in ResumeSpace3D.tsx (which stays untouched): each core is a
// glowing nucleus with spinning slices and rays, its projects orbit as
// screenshot cards on the planes and rings set in the admin, and matter packets
// fly from cores to cards and flash on impact.

const CORE_SPACING = 820;
const RING_BASE_RADIUS = 130;
const RING_STEP = 62;
const ORBIT_SPEED = 0.16;
const CARD_WIDTH = 72;
const CARD_HEIGHT = 42;
/** Screenshots downscaled to this width off the main thread. */
const CARD_TEXTURE_WIDTH = 512;
const MAX_CONCURRENT_LOADS = 4;
/** Cards with a screenshot before the scene counts as ready. */
const READY_CARDS = 16;
const READY_TIMEOUT_SECONDS = 10;
/** How long the camera stays with a core before drifting to the next. */
const CORE_DWELL_SECONDS = 14;

interface CoreRecord {
  center: THREE.Vector3;
  slices: THREE.Group;
  glow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  phase: number;
}

interface CardRecord {
  entryId: string;
  /** Ids the page may use for this card: the entry and its client sites. */
  ids: Set<string>;
  core: number;
  group: THREE.Group;
  plate: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  frame: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  flash: THREE.Sprite;
  flashAt: number;
  angle: number;
  radius: number;
  direction: 1 | -1;
  plane: THREE.Quaternion;
  imageUrl: string | null;
  loaded: boolean;
}

interface Packet {
  sprite: THREE.Sprite;
  core: number;
  card: number;
  progress: number;
  speed: number;
  impact: boolean;
  miss: THREE.Vector3;
}

const haloTexture = (THREE: ThreeModule) => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.25, "rgba(170,230,255,0.5)");
  gradient.addColorStop(0.58, "rgba(80,180,220,0.16)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const labelSprite = (THREE: ThreeModule, text: string, color: string) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `800 56px "Barlow Condensed", Oswald, Impact, sans-serif`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text.toUpperCase()).width) + 32;
  canvas.width = width;
  canvas.height = 80;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#eefbff";
  ctx.fillText(text.toUpperCase(), 16, 42);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.9 }));
  sprite.scale.set((width / 80) * 22, 22, 1);
  return sprite;
};

export async function createOrbitalPortfolioScene(THREE: ThreeModule, data: SceneData): Promise<ShowcaseScene> {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03050a, 0.00042);
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 8000);
  const root = new THREE.Group();
  scene.add(root);
  const disposables: Array<{ dispose: () => void }> = [];
  const halo = haloTexture(THREE);
  disposables.push(halo);

  const { cores: seeds, entries: published } = data.portfolio;
  const mediaUrl = (mediaId: string | null | undefined) => (mediaId ? (data.portfolio.media[mediaId]?.url ?? "") : "");
  const columns = Math.max(1, Math.ceil(Math.sqrt(seeds.length)));
  const rows = Math.ceil(seeds.length / columns);
  const cores: CoreRecord[] = [];
  const cards: CardRecord[] = [];
  const sliceColors = [0x78e6ff, 0x88a2ff, 0xa9ffcf, 0xffa6f5, 0xffd084];

  // Stars behind everything.
  const starPositions = new Float32Array(2200 * 3);
  for (let i = 0; i < 2200; i += 1) {
    const direction = new THREE.Vector3().randomDirection().multiplyScalar(2600 + Math.random() * 2000);
    starPositions.set([direction.x, direction.y, direction.z], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0xbfd9ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false }),
  );
  scene.add(stars);
  disposables.push(starGeometry, stars.material);

  const frameGeometry = new THREE.PlaneGeometry(CARD_WIDTH + 6, CARD_HEIGHT + 6);
  const plateGeometry = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);
  const nucleusGeometry = new THREE.SphereGeometry(17, 28, 28);
  const glowGeometry = new THREE.SphereGeometry(34, 20, 20);
  disposables.push(frameGeometry, plateGeometry, nucleusGeometry, glowGeometry);

  seeds.forEach((seed, coreIndex) => {
    const color = new THREE.Color(seed.color ?? "#8fd3ff");
    const center = new THREE.Vector3(
      (coreIndex % columns - (columns - 1) / 2) * CORE_SPACING,
      Math.sin(coreIndex * 1.3) * 60,
      (Math.floor(coreIndex / columns) - (rows - 1) / 2) * CORE_SPACING,
    );
    const coreRoot = new THREE.Group();
    coreRoot.position.copy(center);

    const nucleus = new THREE.Mesh(
      nucleusGeometry,
      new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.42), transparent: true, opacity: 0.88 }),
    );
    const glow = new THREE.Mesh(
      glowGeometry,
      new THREE.MeshBasicMaterial({
        color: color.clone().lerp(new THREE.Color(0xffffff), 0.18),
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: halo, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glowSprite.scale.setScalar(150);
    disposables.push(nucleus.material, glow.material, glowSprite.material);

    const slices = new THREE.Group();
    sliceColors.forEach((sliceColor, i) => {
      const geometry = new THREE.TorusGeometry(30 + i * 2.2, 0.95, 10, 72);
      const material = new THREE.MeshBasicMaterial({
        color: sliceColor,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const slice = new THREE.Mesh(geometry, material);
      slice.rotation.set(i * 0.46 + Math.PI * 0.13, i * 0.72 + Math.PI * 0.08, i * 0.34);
      slices.add(slice);
      disposables.push(geometry, material);
    });

    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const direction = new THREE.Vector3(Math.cos(a), Math.sin(i * 0.47) * 0.24, Math.sin(a)).normalize();
      const geometry = new THREE.BufferGeometry().setFromPoints([
        direction.clone().multiplyScalar(36),
        direction.clone().multiplyScalar(78 + (i % 3) * 8),
      ]);
      const material = new THREE.LineBasicMaterial({ color: sliceColors[i % sliceColors.length], transparent: true, opacity: 0.22, depthWrite: false });
      coreRoot.add(new THREE.Line(geometry, material));
      disposables.push(geometry, material);
    }

    const label = labelSprite(THREE, seed.name, `#${color.getHexString()}`);
    label.position.set(0, 86, 0);
    disposables.push(label.material, label.material.map!);

    coreRoot.add(nucleus, glow, glowSprite, slices, label);
    root.add(coreRoot);
    cores.push({ center, slices, glow, phase: coreIndex * 1.7 });

    // Rings and the project cards orbiting on them.
    seed.planes.forEach((plain, planeIndex) => {
      const plane = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(plain.angle));
      plain.rings.forEach((ring, ringIndex) => {
        // The entries placed on this ring of this plane.
        const entries = published.filter(
          (entry) =>
            entry.coreSlug === seed.slug && entry.placement.plane === planeIndex && entry.placement.ring === ringIndex,
        );
        const radius = RING_BASE_RADIUS + ringIndex * RING_STEP;
        const points = Array.from({ length: 160 }, (_, i) => {
          const a = (i / 160) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius).applyQuaternion(plane).add(center);
        });
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(ring.orbitColor ?? "#62d8ff"),
          transparent: true,
          opacity: entries.length > 0 ? 0.5 : 0.18,
          depthWrite: false,
        });
        root.add(new THREE.LineLoop(geometry, material));
        disposables.push(geometry, material);

        entries.forEach((entry, slot) => {
          const group = new THREE.Group();
          const frame = new THREE.Mesh(
            frameGeometry,
            new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xd8f3ff), 0.6), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
          );
          frame.position.z = -0.8;
          const plate = new THREE.Mesh(
            plateGeometry,
            new THREE.MeshBasicMaterial({ color: 0x0b1420, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
          );
          const flash = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: halo, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          flash.scale.setScalar(26);
          flash.position.z = 1.4;
          group.add(frame, plate, flash);
          root.add(group);
          disposables.push(frame.material, plate.material, flash.material);

          const imageUrl =
            mediaUrl(entry.mediaId) ||
            entry.clientVariants.map((variant) => mediaUrl(variant.mediaId)).find(Boolean) ||
            null;
          cards.push({
            entryId: entry.slug,
            ids: new Set([entry.slug, ...entry.clientVariants.map((variant) => variant.slug)]),
            core: coreIndex,
            group,
            plate,
            frame,
            flash,
            flashAt: -10,
            angle: (slot / Math.max(1, entries.length)) * Math.PI * 2,
            radius,
            direction: ringIndex % 2 === 0 ? 1 : -1,
            plane,
            imageUrl,
            loaded: false,
          });
        });
      });
    });
  });

  // Screenshots: decoded and downscaled off the main thread, a few at a time.
  let disposed = false;
  let inFlight = 0;
  let loadedCount = 0;
  const queue = cards.filter((card) => card.imageUrl);
  const pump = () => {
    while (!disposed && inFlight < MAX_CONCURRENT_LOADS && queue.length > 0) {
      const card = queue.shift()!;
      inFlight += 1;
      void fetch(card.imageUrl!)
        .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
        .then((blob) => createImageBitmap(blob, { resizeWidth: CARD_TEXTURE_WIDTH, resizeQuality: "medium", imageOrientation: "flipY" }))
        .then((bitmap) => {
          if (disposed) {
            bitmap.close();
            return;
          }
          const texture = new THREE.Texture(bitmap);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          // Cover-fit the top of the screenshot into the card.
          const cardAspect = CARD_WIDTH / CARD_HEIGHT;
          const imageAspect = bitmap.width / Math.max(1, bitmap.height);
          if (imageAspect < cardAspect) {
            texture.repeat.set(1, imageAspect / cardAspect);
            texture.offset.set(0, 1 - imageAspect / cardAspect);
          } else {
            texture.repeat.set(cardAspect / imageAspect, 1);
            texture.offset.set((1 - cardAspect / imageAspect) / 2, 0);
          }
          card.plate.material.map = texture;
          card.plate.material.color.set(0xffffff);
          card.plate.material.opacity = 0.95;
          card.plate.material.needsUpdate = true;
          card.loaded = true;
          loadedCount += 1;
          disposables.push(texture, { dispose: () => bitmap.close() });
        })
        .catch(() => {
          // The card stays a dark panel.
        })
        .finally(() => {
          inFlight -= 1;
          pump();
        });
    }
  };
  pump();

  // Matter packets from cores to cards.
  const packets: Packet[] = [];
  const packetColors = [0x9beaff, 0xa7b6ff, 0xb8ffd9, 0xffb8ef, 0xffe2b3];
  const randomCardFor = (core: number) => {
    const options = cards.map((card, index) => (card.core === core ? index : -1)).filter((index) => index >= 0);
    return options.length ? options[Math.floor(Math.random() * options.length)] : Math.floor(Math.random() * Math.max(1, cards.length));
  };
  for (let i = 0; i < Math.max(16, cores.length * 12); i += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: halo, color: packetColors[i % packetColors.length], transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sprite.scale.setScalar(9);
    root.add(sprite);
    disposables.push(sprite.material);
    const core = Math.floor(Math.random() * Math.max(1, cores.length));
    packets.push({
      sprite,
      core,
      card: randomCardFor(core),
      progress: Math.random(),
      speed: 0.26 + Math.random() * 0.3,
      impact: Math.random() >= 0.32,
      miss: new THREE.Vector3((Math.random() - 0.5) * 520, (Math.random() - 0.5) * 220 + 80, (Math.random() - 0.5) * 520),
    });
  }

  let time = 0;
  let focusCore = 0;
  let dwell = 0;
  let focusCardIndex: number | null = null;
  let azimuth = 0.4;
  const cameraTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  let cameraPlaced = false;
  const readyTarget = Math.min(READY_CARDS, queue.length + loadedCount);

  const cardWorld = (card: CardRecord, out: THREE.Vector3) =>
    out.set(Math.cos(card.angle) * card.radius, 0, Math.sin(card.angle) * card.radius).applyQuaternion(card.plane).add(cores[card.core].center);

  return {
    scene,
    camera,
    progress() {
      if (readyTarget === 0) return 1;
      if (time > READY_TIMEOUT_SECONDS) return 1;
      return Math.min(1, loadedCount / readyTarget);
    },
    update(dt: number, pointer: ScenePointer, visible: boolean) {
      time += dt;
      if (!visible) return;

      cores.forEach((core) => {
        core.slices.rotation.y -= dt * 0.24;
        core.slices.rotation.z += dt * 0.11;
        core.glow.scale.setScalar(1 + Math.sin(time * 1.3 + core.phase) * 0.06);
      });

      cards.forEach((card, index) => {
        card.angle += ORBIT_SPEED * dt * card.direction * (index === focusCardIndex ? 0.15 : 1);
        cardWorld(card, card.group.position);
        // Cards face outward from their core, like the cinematic registry.
        scratch.copy(card.group.position).multiplyScalar(2).sub(cores[card.core].center);
        card.group.lookAt(scratch);
        const sinceFlash = time - card.flashAt;
        card.flash.material.opacity = sinceFlash < 1.2 ? (1 - sinceFlash / 1.2) * 0.9 : 0;
        const lit = index === focusCardIndex;
        card.frame.material.opacity += ((lit ? 0.72 : 0.35) - card.frame.material.opacity) * (1 - Math.exp(-6 * dt));
      });

      packets.forEach((packet) => {
        packet.progress += dt * packet.speed;
        if (packet.progress >= 1) {
          const target = cards[packet.card];
          if (packet.impact && target) target.flashAt = time;
          packet.progress = 0;
          packet.speed = 0.24 + Math.random() * 0.32;
          packet.core = Math.floor(Math.random() * Math.max(1, cores.length));
          packet.card = randomCardFor(packet.core);
          packet.impact = Math.random() >= 0.32;
        }
        const core = cores[packet.core];
        const card = cards[packet.card];
        if (!core || !card) return;
        from.copy(core.center);
        if (packet.impact) to.copy(card.group.position);
        else to.copy(core.center).add(packet.miss);
        packet.sprite.position.lerpVectors(from, to, packet.progress);
        packet.sprite.position.y += Math.sin(packet.progress * Math.PI) * 40;
        packet.sprite.material.opacity = Math.sin(packet.progress * Math.PI) * 0.8;
      });

      // Camera: wander between cores, or fly to the card of the project open
      // on the page.
      if (focusCardIndex !== null && cards[focusCardIndex]) {
        const card = cards[focusCardIndex];
        const coreCenter = cores[card.core].center;
        const outward = scratch.copy(card.group.position).sub(coreCenter).normalize();
        desired.copy(card.group.position).addScaledVector(outward, 170).add(new THREE.Vector3(pointer.x * 40, 26 - pointer.y * 30, 0));
        desiredLook.copy(card.group.position);
      } else if (cores.length > 0) {
        dwell += dt;
        if (dwell > CORE_DWELL_SECONDS) {
          dwell = 0;
          focusCore = (focusCore + 1) % cores.length;
        }
        azimuth += dt * 0.08;
        const center = cores[focusCore].center;
        const angle = azimuth + pointer.x * 1.1;
        const elevation = 0.38 - pointer.y * 0.45;
        desired.set(
          center.x + Math.cos(angle) * Math.cos(elevation) * 560,
          center.y + Math.sin(elevation) * 560,
          center.z + Math.sin(angle) * Math.cos(elevation) * 560,
        );
        desiredLook.copy(center);
      }
      if (!cameraPlaced) {
        cameraTarget.copy(desired);
        lookTarget.copy(desiredLook);
        cameraPlaced = true;
      }
      const ease = 1 - Math.exp(-(focusCardIndex !== null ? 1.6 : 0.6) * dt);
      cameraTarget.lerp(desired, ease);
      lookTarget.lerp(desiredLook, ease);
      camera.position.copy(cameraTarget);
      camera.lookAt(lookTarget);
    },
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    setFocusProject(projectId: string | null) {
      const index = projectId ? cards.findIndex((card) => card.ids.has(projectId)) : -1;
      focusCardIndex = index >= 0 ? index : null;
      if (focusCardIndex !== null) {
        focusCore = cards[focusCardIndex].core;
        dwell = 0;
      }
    },
    dispose() {
      disposed = true;
      disposables.forEach((item) => item.dispose());
    },
  };
}
