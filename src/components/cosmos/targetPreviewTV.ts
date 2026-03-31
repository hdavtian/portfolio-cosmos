import * as THREE from "three";

// ─── TV Panel Phase Machine ─────────────────────────────────────────────────

export type TVPhase =
  | "hidden"
  | "intro"
  | "static_pre"
  | "live_feed"
  | "outro_terminator";

const TV_WIDTH = 320;
const TV_HEIGHT = 240;

const INTRO_MS = 420;
const STATIC_BURST_MS = 200;
const STATIC_GAP_MS = 130;
const OUTRO_MS = 1500;

// ─── Controller interface ───────────────────────────────────────────────────

export interface TVPreviewController {
  readonly phase: TVPhase;
  setPhaseCallback(cb: ((phase: TVPhase) => void) | null): void;
  begin(params: {
    targetPosition: THREE.Vector3;
    targetRadius: number;
    targetId: string;
    routeKind: "moon" | "section";
  }): void;
  update(
    deltaMs: number,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
  ): void;
  setCanvas(canvas: HTMLCanvasElement | null): void;
  fadeOut(): void;
  dispose(): void;
}

export { TV_WIDTH, TV_HEIGHT };

// ─── Factory ────────────────────────────────────────────────────────────────

export function createTVPreviewController(): TVPreviewController {
  let phase: TVPhase = "hidden";
  let phaseStart = 0;
  let seed = 0;
  let phaseCallback: ((p: TVPhase) => void) | null = null;

  const targetPos = new THREE.Vector3();
  let targetRadius = 60;
  let routeKind: "moon" | "section" = "section";

  const previewCam = new THREE.PerspectiveCamera(
    40,
    TV_WIDTH / TV_HEIGHT,
    1,
    80000,
  );

  let rt: THREE.WebGLRenderTarget | null = null;

  // Dedicated preview lighting — added to scene during live_feed,
  // positioned near the preview camera so the target is always lit.
  const previewKeyLight = new THREE.PointLight(0xffffff, 2.5, 0, 1.2);
  previewKeyLight.name = "TVPreviewKeyLight";
  const previewFillLight = new THREE.PointLight(0x8ec8ff, 1.2, 0, 1.5);
  previewFillLight.name = "TVPreviewFillLight";
  const previewAmbient = new THREE.AmbientLight(0xffffff, 0.6);
  previewAmbient.name = "TVPreviewAmbient";
  let lightsInScene = false;

  let orbitAngle = 0;
  let orbitPitchBase = 0.2;

  let ctx: CanvasRenderingContext2D | null = null;
  const pixBuf = new Uint8Array(TV_WIDTH * TV_HEIGHT * 4);

  let burstTotal = 1;
  let frameTick = 0;

  // ── Internal helpers ─────────────────────────────────────────────────────

  function removeLightsFromScene(scene: THREE.Scene) {
    if (lightsInScene) {
      scene.remove(previewKeyLight);
      scene.remove(previewFillLight);
      scene.remove(previewAmbient);
      lightsInScene = false;
    }
  }

  function setPhase(p: TVPhase) {
    if (p === phase) return;
    phase = p;
    phaseStart = performance.now();
    phaseCallback?.(p);
  }

  function addScanlines(alpha = 0.08) {
    if (!ctx) return;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = 0; y < TV_HEIGHT; y += 3) {
      ctx.fillRect(0, y, TV_WIDTH, 1);
    }
  }

  function addCRTTint() {
    if (!ctx) return;
    ctx.fillStyle =
      routeKind === "moon"
        ? "rgba(0,255,100,0.03)"
        : "rgba(80,160,255,0.04)";
    ctx.fillRect(0, 0, TV_WIDTH, TV_HEIGHT);
  }

  function drawStatic(intensity = 1) {
    if (!ctx) return;
    const img = ctx.createImageData(TV_WIDTH, TV_HEIGHT);
    const d = img.data;
    let s = (seed + (performance.now() | 0)) | 0;
    for (let i = 0; i < d.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = ((s >> 16) & 0xff) * intensity;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    addScanlines(0.15);
  }

  function drawTerminatorOutro(progress: number) {
    if (!ctx) return;

    // Phase 1 (0→0.3): rapid static bursts
    if (progress < 0.3) {
      const burstCycle = (progress * 12) % 1;
      if (burstCycle < 0.45) {
        drawStatic(0.35 + progress * 1.5);
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, TV_WIDTH, TV_HEIGHT);
      }
      return;
    }

    // Phase 2 (0.3→0.88): black + contracting red circle
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, TV_WIDTH, TV_HEIGHT);

    const circleT = Math.min((progress - 0.3) / 0.58, 1);
    const maxR = Math.min(TV_WIDTH, TV_HEIGHT) * 0.35;
    const minR = 2;
    const eased =
      circleT < 0.5
        ? 2 * circleT * circleT
        : 1 - Math.pow(-2 * circleT + 2, 2) / 2;
    const r = maxR - (maxR - minR) * eased;

    const pulse = 0.8 + 0.2 * Math.sin(progress * 28);
    ctx.strokeStyle = `rgba(255,25,15,${pulse})`;
    ctx.lineWidth = r > 10 ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(TV_WIDTH / 2, TV_HEIGHT / 2, Math.max(r, 1.5), 0, Math.PI * 2);
    ctx.stroke();

    if (r > 6) {
      ctx.strokeStyle = `rgba(255,80,55,${pulse * 0.35})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(TV_WIDTH / 2, TV_HEIGHT / 2, r * 0.78, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Small crosshair inside the circle
    if (r < maxR * 0.6) {
      const chR = Math.min(r * 0.5, 8);
      ctx.strokeStyle = `rgba(255,40,30,${pulse * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(TV_WIDTH / 2 - chR, TV_HEIGHT / 2);
      ctx.lineTo(TV_WIDTH / 2 + chR, TV_HEIGHT / 2);
      ctx.moveTo(TV_WIDTH / 2, TV_HEIGHT / 2 - chR);
      ctx.lineTo(TV_WIDTH / 2, TV_HEIGHT / 2 + chR);
      ctx.stroke();
    }

    // Phase 3 (0.88→1.0): fade to black
    if (progress > 0.88) {
      const fadeT = (progress - 0.88) / 0.12;
      ctx.fillStyle = `rgba(0,0,0,${fadeT})`;
      ctx.fillRect(0, 0, TV_WIDTH, TV_HEIGHT);
    }

    addScanlines(0.1);
  }

  function updateOrbitCamera(deltaMs: number) {
    const speed = 0.65;
    orbitAngle += (deltaMs / 1000) * speed;
    const pitch = orbitPitchBase + Math.sin(orbitAngle * 0.3) * 0.18;
    const dist = Math.max(targetRadius * 2.8, 120);

    const camX = targetPos.x + Math.cos(orbitAngle) * Math.cos(pitch) * dist;
    const camY = targetPos.y + Math.sin(pitch) * dist * 0.6;
    const camZ = targetPos.z + Math.sin(orbitAngle) * Math.cos(pitch) * dist;

    previewCam.position.set(camX, camY, camZ);
    previewCam.lookAt(targetPos);

    // Key light rides with the camera so the target face is always lit
    previewKeyLight.position.set(camX, camY, camZ);

    // Fill light opposite the camera for softer shadow fill
    const fillX = targetPos.x - Math.cos(orbitAngle) * dist * 0.6;
    const fillY = targetPos.y + dist * 0.4;
    const fillZ = targetPos.z - Math.sin(orbitAngle) * dist * 0.6;
    previewFillLight.position.set(fillX, fillY, fillZ);
  }

  function blitRTToCanvas(renderer: THREE.WebGLRenderer) {
    if (!rt || !ctx) return;
    renderer.readRenderTargetPixels(rt, 0, 0, TV_WIDTH, TV_HEIGHT, pixBuf);

    const img = ctx.createImageData(TV_WIDTH, TV_HEIGHT);
    for (let y = 0; y < TV_HEIGHT; y++) {
      const src = (TV_HEIGHT - 1 - y) * TV_WIDTH * 4;
      const dst = y * TV_WIDTH * 4;
      for (let x = 0; x < TV_WIDTH * 4; x++) {
        img.data[dst + x] = pixBuf[src + x];
      }
    }
    ctx.putImageData(img, 0, 0);
    addScanlines();
    addCRTTint();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  function setPhaseCallback(cb: ((phase: TVPhase) => void) | null) {
    phaseCallback = cb;
  }

  function setCanvas(c: HTMLCanvasElement | null) {
    if (c) {
      c.width = TV_WIDTH;
      c.height = TV_HEIGHT;
      ctx = c.getContext("2d");
    } else {
      ctx = null;
    }
  }

  function begin(params: {
    targetPosition: THREE.Vector3;
    targetRadius: number;
    targetId: string;
    routeKind: "moon" | "section";
  }) {
    targetPos.copy(params.targetPosition);
    targetRadius = params.targetRadius || 60;
    routeKind = params.routeKind;
    seed = (Date.now() ^ (params.targetId.length * 7919)) | 0;

    let s = seed | 0;
    const rng = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    orbitAngle = rng() * Math.PI * 2;
    orbitPitchBase = 0.15 + rng() * 0.25;
    frameTick = 0;
    burstTotal = 1 + (seed & 1);

    if (!rt) {
      rt = new THREE.WebGLRenderTarget(TV_WIDTH, TV_HEIGHT, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });
    }

    setPhase("intro");
  }

  function update(
    deltaMs: number,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
  ) {
    if (phase === "hidden") return;

    const elapsed = performance.now() - phaseStart;

    switch (phase) {
      case "intro": {
        const fade = Math.min(elapsed / INTRO_MS, 1);
        drawStatic(0.35 + fade * 0.65);
        if (elapsed >= INTRO_MS) setPhase("static_pre");
        break;
      }

      case "static_pre": {
        const cycleDur = STATIC_BURST_MS + STATIC_GAP_MS;
        const cycle = elapsed % cycleDur;
        if (cycle < STATIC_BURST_MS) {
          drawStatic(0.45 + Math.sin(elapsed * 0.015) * 0.3);
        } else if (ctx) {
          ctx.fillStyle = "#080808";
          ctx.fillRect(0, 0, TV_WIDTH, TV_HEIGHT);
          addScanlines(0.2);
        }
        if (Math.floor(elapsed / cycleDur) >= burstTotal) {
          setPhase("live_feed");
        }
        break;
      }

      case "live_feed": {
        updateOrbitCamera(deltaMs);
        frameTick++;
        if (frameTick % 2 === 0 && rt) {
          // Inject preview lights for this render only
          if (!lightsInScene) {
            scene.add(previewKeyLight);
            scene.add(previewFillLight);
            scene.add(previewAmbient);
            lightsInScene = true;
          }

          const prevRT = renderer.getRenderTarget();
          const prevAC = renderer.autoClear;
          renderer.setRenderTarget(rt);
          renderer.autoClear = true;
          renderer.render(scene, previewCam);
          renderer.setRenderTarget(prevRT);
          renderer.autoClear = prevAC;
          blitRTToCanvas(renderer);

          // Remove preview lights so they don't affect the main scene
          scene.remove(previewKeyLight);
          scene.remove(previewFillLight);
          scene.remove(previewAmbient);
          lightsInScene = false;
        }
        break;
      }

      case "outro_terminator": {
        removeLightsFromScene(scene);
        const progress = Math.min(elapsed / OUTRO_MS, 1);
        drawTerminatorOutro(progress);
        if (progress >= 1) setPhase("hidden");
        break;
      }
    }
  }

  function fadeOut() {
    if (phase !== "hidden" && phase !== "outro_terminator") {
      setPhase("outro_terminator");
    }
  }

  function dispose() {
    if (rt) {
      rt.dispose();
      rt = null;
    }
    setPhase("hidden");
    ctx = null;
  }

  return {
    get phase() {
      return phase;
    },
    setPhaseCallback,
    begin,
    update,
    setCanvas,
    fadeOut,
    dispose,
  };
}
