import type * as THREE from "three";
import type { SceneData, SceneJob, ScenePointer, ShowcaseScene, ThreeModule } from "./types";

// A job moon from the cinematic Experience system, rebuilt as its own module
// with the cinematic app as reference (untouched). The camera orbits the
// moon while the job's memories rise off its horizon and fly past; then the
// details open: Matrix rain washes over the view and the job's card resolves
// (company, dates, roles, intro and tech), before the memories start again.

const JOB_ID = "investcloud";
const MOON_RADIUS = 60;
/** Same textures the cinematic moons use. */
const MOON_TEXTURES: Record<string, string> = {
  investcloud: "/textures/custom-planet-textures/investcloud.jpg",
  rpa: "/textures/custom-planet-textures/texture4-rpa.jpg",
  boingo: "/textures/custom-planet-textures/boingo.jpg",
  "capital-group": "/textures/custom-planet-textures/capitalgroup.jpg",
  murad: "/textures/custom-planet-textures/murad.jpg",
  unitedlayer: "/textures/custom-planet-textures/unitedlayer.jpg",
  stormscape: "/textures/custom-planet-textures/stormscape.jpg",
};

const ORBIT_DISTANCE = 270;
const MEMORY_INTERVAL_SECONDS = 1.7;
const MEMORY_LIFETIME_SECONDS = 6.5;
/** Wait after the last memory before the details open. */
const MEMORIES_TAIL_SECONDS = 3.5;
const DETAILS_SECONDS = 17;
const MATRIX_FPS = 20;
const MATRIX_COLUMN_PX = 20;

type MemoryType = "default" | "tech" | "code" | "memory";

const MEMORY_STYLES: Record<MemoryType, { font: string; glow: string; stroke: string; fill: string; box?: boolean }> = {
  default: { font: "700 {s}px Rajdhani, 'Segoe UI', sans-serif", glow: "rgba(94,214,255,0.55)", stroke: "rgba(120,196,228,0.86)", fill: "rgba(200,236,248,0.9)" },
  tech: { font: "700 {s}px Rajdhani, 'Segoe UI', sans-serif", glow: "rgba(106,220,255,0.62)", stroke: "rgba(148,226,255,0.92)", fill: "rgba(220,246,255,0.95)" },
  code: { font: "700 {s}px 'JetBrains Mono', Consolas, monospace", glow: "rgba(255,255,255,0.25)", stroke: "rgba(245,245,245,0.9)", fill: "rgba(255,255,255,0.98)", box: true },
  memory: { font: "700 {s}px 'Segoe Script', 'Brush Script MT', cursive", glow: "rgba(255,220,90,0.58)", stroke: "rgba(244,206,92,0.85)", fill: "rgba(255,238,164,0.95)" },
};

const memoryTexture = (THREE: ThreeModule, text: string, type: MemoryType) => {
  const style = MEMORY_STYLES[type] ?? MEMORY_STYLES.default;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  let size = 60;
  do {
    ctx.font = style.font.replace("{s}", String(size));
    size -= 2;
  } while (ctx.measureText(text).width > canvas.width * 0.9 && size > 30);
  const width = ctx.measureText(text).width;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (style.box) {
    const w = width + 48;
    ctx.fillStyle = "rgba(8,8,10,0.94)";
    ctx.strokeStyle = "rgba(235,235,235,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect((canvas.width - w) / 2, 34, w, 92, 16);
    ctx.fill();
    ctx.stroke();
  }
  ctx.shadowColor = style.glow;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 3;
  ctx.strokeStyle = style.stroke;
  ctx.fillStyle = style.fill;
  ctx.strokeText(text, canvas.width / 2, 82);
  ctx.fillText(text, canvas.width / 2, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: Math.max(1.5, (width + 60) / canvas.height) };
};

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

/** The job's card, drawn once: company, place and dates, roles, intro, tech. */
const detailsTexture = (THREE: ThreeModule, job: SceneJob) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d")!;
  const pad = 64;
  const inner = canvas.width - pad * 2;

  ctx.fillStyle = "rgba(3, 12, 10, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(110, 255, 190, 0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  // Corner brackets.
  ctx.strokeStyle = "rgba(160, 255, 210, 0.95)";
  ctx.lineWidth = 5;
  for (const [x, y, dx, dy] of [
    [14, 14, 1, 1],
    [canvas.width - 14, 14, -1, 1],
    [14, canvas.height - 14, 1, -1],
    [canvas.width - 14, canvas.height - 14, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * 60, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * 60);
    ctx.stroke();
  }

  let y = pad + 20;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(120, 255, 190, 0.8)";
  ctx.font = "600 26px 'JetBrains Mono', Consolas, monospace";
  ctx.fillText(`> ${[job.location, `${job.startDate ?? ""} – ${job.endDate ?? "present"}`].filter(Boolean).join("  ·  ").toUpperCase()}`, pad, y);
  y += 56;

  ctx.fillStyle = "#eafff4";
  ctx.font = "900 112px 'Barlow Condensed', Oswald, Impact, sans-serif";
  for (const line of wrap(ctx, job.company.toUpperCase(), inner)) {
    ctx.fillText(line, pad, y);
    y += 104;
  }
  y += 18;

  ctx.font = "600 30px 'JetBrains Mono', Consolas, monospace";
  for (const position of job.positions.slice(0, 4)) {
    ctx.fillStyle = "#b8ffd9";
    ctx.fillText(position.title, pad, y);
    ctx.fillStyle = "rgba(160, 230, 200, 0.6)";
    ctx.font = "500 24px 'JetBrains Mono', Consolas, monospace";
    ctx.fillText(`${position.startDate ?? ""} – ${position.endDate ?? ""}`, pad, y + 40);
    ctx.font = "600 30px 'JetBrains Mono', Consolas, monospace";
    y += 86;
  }
  y += 12;

  if (job.droneIntroText) {
    ctx.fillStyle = "rgba(225, 245, 236, 0.9)";
    ctx.font = "500 34px Rajdhani, 'Segoe UI', sans-serif";
    for (const line of wrap(ctx, job.droneIntroText, inner).slice(0, 7)) {
      ctx.fillText(line, pad, y);
      y += 44;
    }
    y += 28;
  }

  // Tech chips.
  ctx.font = "600 24px 'JetBrains Mono', Consolas, monospace";
  let x = pad;
  for (const label of job.tech) {
    const w = ctx.measureText(label).width + 36;
    if (x + w > canvas.width - pad) {
      x = pad;
      y += 58;
    }
    if (y > canvas.height - pad - 50) break;
    ctx.strokeStyle = "rgba(120, 255, 190, 0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, 44);
    ctx.fillStyle = "#c9ffe3";
    ctx.fillText(label, x + 18, y + 10);
    x += w + 14;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: canvas.width / canvas.height };
};

interface Memory {
  sprite: THREE.Sprite;
  age: number;
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
  width: number;
}

export async function createJobMoonScene(THREE: ThreeModule, data: SceneData): Promise<ShowcaseScene> {
  const job = data.jobs.find((entry) => entry.slug === JOB_ID) ?? data.jobs[0];
  if (!job) throw new Error("No experience to show");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 20000);
  scene.add(camera);
  const disposables: Array<{ dispose: () => void }> = [];

  // Stars.
  const starPositions = new Float32Array(2500 * 3);
  for (let i = 0; i < 2500; i += 1) {
    const direction = new THREE.Vector3().randomDirection().multiplyScalar(6000 + Math.random() * 4000);
    starPositions.set([direction.x, direction.y, direction.z], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xd6e6ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.75 });
  scene.add(new THREE.Points(starGeometry, starMaterial));
  disposables.push(starGeometry, starMaterial);

  // The moon, lit from a distant sun.
  let textureReady = false;
  const moonMaterial = new THREE.MeshStandardMaterial({ color: 0x6a7280, roughness: 0.95 });
  const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 64, 48);
  const moon = new THREE.Mesh(moonGeometry, moonMaterial);
  scene.add(moon);
  disposables.push(moonMaterial, moonGeometry);
  new THREE.TextureLoader().load(
    MOON_TEXTURES[job.slug] ?? MOON_TEXTURES.investcloud,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      moonMaterial.map = texture;
      moonMaterial.color.set(0xffffff);
      moonMaterial.needsUpdate = true;
      disposables.push(texture);
      textureReady = true;
    },
    undefined,
    () => {
      textureReady = true;
    },
  );
  const sunLight = new THREE.DirectionalLight(0xfff2e0, 2.6);
  sunLight.position.set(-600, 260, 420);
  scene.add(sunLight, new THREE.AmbientLight(0x31405a, 0.7));
  const haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 128;
  const haloCtx = haloCanvas.getContext("2d")!;
  const haloGradient = haloCtx.createRadialGradient(64, 64, 20, 64, 64, 64);
  haloGradient.addColorStop(0, "rgba(140,200,255,0.5)");
  haloGradient.addColorStop(0.5, "rgba(90,160,255,0.12)");
  haloGradient.addColorStop(1, "rgba(0,0,0,0)");
  haloCtx.fillStyle = haloGradient;
  haloCtx.fillRect(0, 0, 128, 128);
  const haloTexture = new THREE.CanvasTexture(haloCanvas);
  const haloMaterial = new THREE.SpriteMaterial({ map: haloTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 });
  const halo = new THREE.Sprite(haloMaterial);
  halo.scale.setScalar(MOON_RADIUS * 3.6);
  moon.add(halo);
  disposables.push(haloTexture, haloMaterial);

  // Memories.
  const memoryPool = job.memories.length > 0 ? job.memories : [{ type: "default", text: job.company }];
  const memoryTextures = memoryPool.map((memory) => memoryTexture(THREE, memory.text, (memory.type as MemoryType) in MEMORY_STYLES ? (memory.type as MemoryType) : "default"));
  memoryTextures.forEach(({ texture }) => disposables.push(texture));
  const memories: Memory[] = [];
  const lanes = [-1, -0.5, 0, 0.5, 1];

  // Matrix rain: a camera-locked plane with a canvas redrawn at 20 fps.
  const matrixCanvas = document.createElement("canvas");
  matrixCanvas.width = 960;
  matrixCanvas.height = 540;
  const matrixCtx = matrixCanvas.getContext("2d")!;
  const columns = Math.floor(matrixCanvas.width / MATRIX_COLUMN_PX) + 1;
  const drops = Array.from({ length: columns }, () => Math.random() * -40);
  const columnColors = Array.from({ length: columns }, () => `hsl(${140 + Math.floor(Math.random() * 40)} 80% ${50 + Math.floor(Math.random() * 20)}%)`);
  const glyphs = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>/{}[]=+*";
  const matrixTexture = new THREE.CanvasTexture(matrixCanvas);
  matrixTexture.colorSpace = THREE.SRGBColorSpace;
  const matrixMaterial = new THREE.MeshBasicMaterial({ map: matrixTexture, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const matrixPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matrixMaterial);
  matrixPlane.renderOrder = 2000;
  matrixPlane.visible = false;
  camera.add(matrixPlane);
  disposables.push(matrixTexture, matrixMaterial, matrixPlane.geometry);
  let matrixClock = 0;
  const drawMatrix = () => {
    matrixCtx.fillStyle = "rgba(2, 8, 6, 0.12)";
    matrixCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    matrixCtx.font = `600 ${MATRIX_COLUMN_PX - 4}px 'JetBrains Mono', monospace`;
    drops.forEach((drop, i) => {
      matrixCtx.fillStyle = Math.random() < 0.04 ? "#eafff2" : columnColors[i];
      matrixCtx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], i * MATRIX_COLUMN_PX, drop * MATRIX_COLUMN_PX);
      drops[i] = drop * MATRIX_COLUMN_PX > matrixCanvas.height && Math.random() > 0.965 ? 0 : drop + 1;
    });
    matrixTexture.needsUpdate = true;
  };

  // The details card, camera-locked on the right.
  const details = detailsTexture(THREE, job);
  const detailsMaterial = new THREE.MeshBasicMaterial({ map: details.texture, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const detailsPlane = new THREE.Mesh(new THREE.PlaneGeometry(details.aspect, 1), detailsMaterial);
  detailsPlane.renderOrder = 2100;
  detailsPlane.visible = false;
  camera.add(detailsPlane);
  disposables.push(details.texture, detailsMaterial, detailsPlane.geometry);

  let phase: "memories" | "details" = "memories";
  let phaseTime = 0;
  let spawnClock = MEMORY_INTERVAL_SECONDS;
  let spawned = 0;
  let orbitAngle = 0.6;
  let viewWidth = 1;
  let viewHeight = 1;

  const camForward = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  const spawnMemory = () => {
    const index = spawned % memoryPool.length;
    spawned += 1;
    const { texture, aspect } = memoryTextures[index];
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 900;
    scene.add(sprite);
    camera.getWorldDirection(camForward);
    camRight.crossVectors(camForward, camera.up).normalize();
    camUp.crossVectors(camRight, camForward).normalize();
    const lane = lanes[(index * 2) % lanes.length];
    // Rise from just above the horizon facing the viewer, arc up and past.
    const toCamera = camera.position.clone().sub(moon.position).normalize();
    const start = moon.position
      .clone()
      .addScaledVector(toCamera, MOON_RADIUS * 0.35)
      .addScaledVector(camUp, MOON_RADIUS * 0.95)
      .addScaledVector(camRight, lane * MOON_RADIUS * 0.8);
    const end = camera.position
      .clone()
      .addScaledVector(camForward, 70)
      .addScaledVector(camRight, lane * 60 + (lane === 0 ? 35 : 0))
      .addScaledVector(camUp, 40 + Math.random() * 30);
    const control = start.clone().lerp(end, 0.45).addScaledVector(camUp, 70);
    memories.push({ sprite, age: 0, start, control, end, width: 70 + Math.min(1, aspect / 6) * 50 });
  };

  const setPhase = (next: typeof phase) => {
    phase = next;
    phaseTime = 0;
    if (next === "memories") {
      spawned = 0;
      spawnClock = MEMORY_INTERVAL_SECONDS;
    }
  };

  const clearMemories = () => {
    memories.forEach(({ sprite }) => {
      sprite.removeFromParent();
      sprite.material.dispose();
    });
    memories.length = 0;
  };

  return {
    scene,
    camera,
    progress: () => (textureReady ? 1 : 0.5),
    update(dt: number, pointer: ScenePointer, visible: boolean) {
      const step = Math.min(dt, 0.1);
      if (!visible) return;
      phaseTime += step;

      moon.rotation.y += step * 0.03;
      orbitAngle += step * 0.035;
      camera.position.set(Math.cos(orbitAngle) * ORBIT_DISTANCE, 55 - pointer.y * 30, Math.sin(orbitAngle) * ORBIT_DISTANCE);
      // Frame the moon in the right half of the view, clear of the list.
      camera.lookAt(moon.position);
      camera.getWorldDirection(camForward);
      camRight.crossVectors(camForward, camera.up).normalize();
      lookTarget.copy(moon.position).addScaledVector(camRight, -48 - pointer.x * 24);
      camera.lookAt(lookTarget);

      if (phase === "memories") {
        spawnClock += step;
        if (spawned < memoryPool.length && spawnClock >= MEMORY_INTERVAL_SECONDS) {
          spawnClock = 0;
          spawnMemory();
        }
        if (spawned >= memoryPool.length && memories.length === 0 && spawnClock > MEMORIES_TAIL_SECONDS) {
          setPhase("details");
        }
      } else if (phaseTime > DETAILS_SECONDS) {
        setPhase("memories");
      }

      for (let i = memories.length - 1; i >= 0; i -= 1) {
        const memory = memories[i];
        memory.age += step;
        const t = memory.age / MEMORY_LIFETIME_SECONDS;
        if (t >= 1) {
          memory.sprite.removeFromParent();
          memory.sprite.material.dispose();
          memories.splice(i, 1);
          continue;
        }
        const inv = 1 - t;
        memory.sprite.position
          .copy(memory.start)
          .multiplyScalar(inv * inv)
          .addScaledVector(memory.control, 2 * inv * t)
          .addScaledVector(memory.end, t * t);
        const scale = 1 + t * 2.4;
        // The texture is 1024x160; text is centred, so height follows width.
        memory.sprite.scale.set(memory.width * scale, memory.width * scale * (160 / 1024), 1);
        const fadeIn = Math.min(1, t / 0.15);
        const fadeOut = Math.min(1, (1 - t) / 0.25);
        memory.sprite.material.opacity = 0.1 + Math.min(fadeIn, fadeOut) * 0.85;
      }

      // Details: rain washes in, the card resolves, both fade before the loop.
      const inDetails = phase === "details";
      const rainTarget = inDetails ? (phaseTime < DETAILS_SECONDS - 2 ? 0.55 : 0) : 0;
      matrixMaterial.opacity += (rainTarget - matrixMaterial.opacity) * (1 - Math.exp(-2.5 * step));
      matrixPlane.visible = matrixMaterial.opacity > 0.01;
      if (matrixPlane.visible) {
        matrixClock += step;
        if (matrixClock >= 1 / MATRIX_FPS) {
          matrixClock = 0;
          drawMatrix();
        }
      }
      const cardTarget = inDetails && phaseTime > 1.4 && phaseTime < DETAILS_SECONDS - 1.6 ? 1 : 0;
      detailsMaterial.opacity += (cardTarget - detailsMaterial.opacity) * (1 - Math.exp(-3 * step));
      detailsPlane.visible = detailsMaterial.opacity > 0.01;
      if (detailsPlane.visible) {
        // A little glitch while it resolves.
        const jitter = detailsMaterial.opacity < 0.9 && Math.random() < 0.3 ? (Math.random() - 0.5) * 0.02 : 0;
        const height = viewHeight * 0.64;
        detailsPlane.scale.set(height, height * (0.4 + 0.6 * Math.min(1, detailsMaterial.opacity * 1.4)), 1);
        detailsPlane.position.set(viewWidth * 0.22 + jitter * viewWidth, 0, -10);
      }
      if (inDetails && memories.length > 0) clearMemories();
    },
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      // Size of the view at the camera-locked planes' distance (10).
      viewHeight = 2 * 10 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      viewWidth = viewHeight * camera.aspect;
      matrixPlane.scale.set(viewWidth, viewHeight, 1);
      matrixPlane.position.set(0, 0, -10);
    },
    dispose() {
      clearMemories();
      disposables.forEach((item) => item.dispose());
    },
  };
}
