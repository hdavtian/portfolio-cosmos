import * as THREE from "three";

// ─── Dashcam Phase Machine ──────────────────────────────────────────────────

export type DashcamPhase =
  | "hidden"
  | "intro"
  | "static_pre"
  | "live_feed"
  | "outro_terminator";

const DC_WIDTH = 320;
const DC_HEIGHT = 240;

const INTRO_MS = 480;
const STATIC_BURST_MS = 180;
const STATIC_GAP_MS = 140;
const OUTRO_MS = 1400;

// ─── Controller interface ───────────────────────────────────────────────────

export interface DashcamController {
  readonly phase: DashcamPhase;
  setPhaseCallback(cb: ((phase: DashcamPhase) => void) | null): void;
  begin(params: { ship: THREE.Object3D }): void;
  update(
    deltaMs: number,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
  ): void;
  setCanvas(canvas: HTMLCanvasElement | null): void;
  fadeOut(): void;
  dispose(): void;
}

export { DC_WIDTH, DC_HEIGHT };

// Ship-local camera placement: above the hull near the nose,
// looking forward so the hood is partially visible at the frame bottom.
const _localOffset = new THREE.Vector3(0, 0.4, 0.8);
const _lookDir = new THREE.Vector3(0, -0.04, 1).normalize();
const _tempV = new THREE.Vector3();
const _tempV2 = new THREE.Vector3();

// ─── Factory ────────────────────────────────────────────────────────────────

export function createDashcamController(): DashcamController {
  let phase: DashcamPhase = "hidden";
  let phaseStart = 0;
  let seed = 0;
  let phaseCallback: ((p: DashcamPhase) => void) | null = null;

  let shipRef: THREE.Object3D | null = null;

  const dashcamCam = new THREE.PerspectiveCamera(
    68,
    DC_WIDTH / DC_HEIGHT,
    0.05,
    80000,
  );
  dashcamCam.layers.enableAll();

  let rt: THREE.WebGLRenderTarget | null = null;

  const dcAmbient = new THREE.AmbientLight(0xffffff, 1.0);
  dcAmbient.name = "DashcamAmbient";
  dcAmbient.layers.enableAll();
  let lightsInScene = false;

  let ctx: CanvasRenderingContext2D | null = null;
  const pixBuf = new Uint8Array(DC_WIDTH * DC_HEIGHT * 4);

  let ghostCanvas: HTMLCanvasElement | null = null;
  let ghostCtx: CanvasRenderingContext2D | null = null;

  let burstTotal = 1;
  let frameTick = 0;

  let nextGlitchAt = 0;
  let glitchEndAt = 0;
  let liveFeedStartTime = 0;
  let frameCount = 0;

  // ── Internal helpers ───────────────────────────────────────────────────

  function removeLightsFromScene(scene: THREE.Scene) {
    if (lightsInScene) {
      scene.remove(dcAmbient);
      lightsInScene = false;
    }
  }

  function setPhaseInternal(p: DashcamPhase) {
    if (p === phase) return;
    phase = p;
    phaseStart = performance.now();
    if (p === "live_feed") {
      liveFeedStartTime = performance.now();
      frameCount = 0;
      nextGlitchAt = performance.now() + 2500 + Math.random() * 6000;
      glitchEndAt = 0;
    }
    phaseCallback?.(p);
  }

  function addScanlines(alpha = 0.08) {
    if (!ctx) return;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = 0; y < DC_HEIGHT; y += 3) {
      ctx.fillRect(0, y, DC_WIDTH, 1);
    }
  }

  function addCRTTint() {
    if (!ctx) return;
    ctx.fillStyle = "rgba(255,180,60,0.03)";
    ctx.fillRect(0, 0, DC_WIDTH, DC_HEIGHT);
  }

  function drawStatic(intensity = 1) {
    if (!ctx) return;
    const img = ctx.createImageData(DC_WIDTH, DC_HEIGHT);
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
    if (progress < 0.3) {
      const burstCycle = (progress * 12) % 1;
      if (burstCycle < 0.45) {
        drawStatic(0.35 + progress * 1.5);
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, DC_WIDTH, DC_HEIGHT);
      }
      return;
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, DC_WIDTH, DC_HEIGHT);

    const circleT = Math.min((progress - 0.3) / 0.58, 1);
    const maxR = Math.min(DC_WIDTH, DC_HEIGHT) * 0.35;
    const minR = 2;
    const eased =
      circleT < 0.5
        ? 2 * circleT * circleT
        : 1 - Math.pow(-2 * circleT + 2, 2) / 2;
    const r = maxR - (maxR - minR) * eased;

    const pulse = 0.8 + 0.2 * Math.sin(progress * 28);
    ctx.strokeStyle = `rgba(255,160,30,${pulse})`;
    ctx.lineWidth = r > 10 ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(DC_WIDTH / 2, DC_HEIGHT / 2, Math.max(r, 1.5), 0, Math.PI * 2);
    ctx.stroke();

    if (r > 6) {
      ctx.strokeStyle = `rgba(255,120,40,${pulse * 0.35})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(DC_WIDTH / 2, DC_HEIGHT / 2, r * 0.78, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (r < maxR * 0.6) {
      const chR = Math.min(r * 0.5, 8);
      ctx.strokeStyle = `rgba(255,140,40,${pulse * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(DC_WIDTH / 2 - chR, DC_HEIGHT / 2);
      ctx.lineTo(DC_WIDTH / 2 + chR, DC_HEIGHT / 2);
      ctx.moveTo(DC_WIDTH / 2, DC_HEIGHT / 2 - chR);
      ctx.lineTo(DC_WIDTH / 2, DC_HEIGHT / 2 + chR);
      ctx.stroke();
    }

    if (progress > 0.88) {
      const fadeT = (progress - 0.88) / 0.12;
      ctx.fillStyle = `rgba(0,0,0,${fadeT})`;
      ctx.fillRect(0, 0, DC_WIDTH, DC_HEIGHT);
    }

    addScanlines(0.1);
  }

  function drawInterferenceOverlay() {
    if (!ctx) return;
    let s = (performance.now() | 0) ^ seed;
    const rng = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < 6; i++) {
      const y = rng() * DC_HEIGHT;
      const h = 1 + rng() * 4;
      const v = Math.floor(rng() * 100);
      ctx.fillStyle = `rgba(${v + 30},${v + 10},${v},0.35)`;
      ctx.fillRect(0, y, DC_WIDTH, h);
    }
    ctx.fillStyle = "rgba(200,180,140,0.08)";
    ctx.fillRect(0, 0, DC_WIDTH, DC_HEIGHT);
  }

  function drawFlightCamOnline(elapsed: number) {
    if (!ctx) return;
    const FLASH_MS = 550;
    if (elapsed > FLASH_MS) return;
    const t = elapsed / FLASH_MS;
    const alpha =
      t < 0.12 ? t / 0.12 : t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
    const wipeY = t * DC_HEIGHT * 1.4;
    const cx = DC_WIDTH / 2;
    const cy = DC_HEIGHT / 2;

    ctx.save();
    ctx.globalAlpha = alpha * 0.92;

    const barH = 26;
    const barY = cy - barH / 2;
    if (barY < wipeY) {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, barY, DC_WIDTH, Math.min(barH, wipeY - barY));
    }

    if (cy < wipeY) {
      ctx.strokeStyle = "rgba(255,180,60,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(12, cy - 9);
      ctx.lineTo(DC_WIDTH * 0.25, cy - 9);
      ctx.moveTo(DC_WIDTH * 0.75, cy - 9);
      ctx.lineTo(DC_WIDTH - 12, cy - 9);
      ctx.moveTo(12, cy + 9);
      ctx.lineTo(DC_WIDTH * 0.25, cy + 9);
      ctx.moveTo(DC_WIDTH * 0.75, cy + 9);
      ctx.lineTo(DC_WIDTH - 12, cy + 9);
      ctx.stroke();

      ctx.fillStyle = "rgb(255,190,70)";
      ctx.font = "bold 13px 'Rajdhani', 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FLIGHT CAM ONLINE", cx, cy);
    }

    ctx.restore();
  }

  function drawFrameCounter() {
    if (!ctx) return;
    frameCount++;
    const now = new Date();
    const ts =
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0") +
      ":" +
      String(now.getSeconds()).padStart(2, "0") +
      ":" +
      String(frameCount % 100).padStart(2, "0");

    ctx.save();
    ctx.font = "9px 'Courier New', monospace";
    ctx.textBaseline = "bottom";

    ctx.fillStyle = "rgba(200,180,140,0.45)";
    ctx.textAlign = "left";
    ctx.fillText(ts, 6, DC_HEIGHT - 5);

    const pulse = 0.4 + 0.3 * Math.sin(performance.now() * 0.005);
    ctx.fillStyle = `rgba(255,160,30,${pulse})`;
    ctx.beginPath();
    ctx.arc(DC_WIDTH - 17, DC_HEIGHT - 9, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,160,30,${pulse * 0.85})`;
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText("REC", DC_WIDTH - 24, DC_HEIGHT - 4);

    ctx.restore();
  }

  function updateDashcamCamera() {
    if (!shipRef) return;
    _tempV.copy(_localOffset).applyQuaternion(shipRef.quaternion);
    dashcamCam.position.copy(shipRef.position).add(_tempV);
    _tempV2
      .copy(_lookDir)
      .applyQuaternion(shipRef.quaternion)
      .multiplyScalar(200);
    _tempV2.add(dashcamCam.position);
    dashcamCam.lookAt(_tempV2);
  }

  function blitRTToCanvas(renderer: THREE.WebGLRenderer) {
    if (!rt || !ctx) return;
    renderer.readRenderTargetPixels(rt, 0, 0, DC_WIDTH, DC_HEIGHT, pixBuf);

    const img = (ghostCtx ?? ctx).createImageData(DC_WIDTH, DC_HEIGHT);
    for (let y = 0; y < DC_HEIGHT; y++) {
      const src = (DC_HEIGHT - 1 - y) * DC_WIDTH * 4;
      const dst = y * DC_WIDTH * 4;
      for (let x = 0; x < DC_WIDTH * 4; x++) {
        img.data[dst + x] = pixBuf[src + x];
      }
    }

    if (ghostCtx && ghostCanvas) {
      ghostCtx.putImageData(img, 0, 0);
      ctx.fillStyle = "rgba(0,0,0,0.82)";
      ctx.fillRect(0, 0, DC_WIDTH, DC_HEIGHT);
      ctx.drawImage(ghostCanvas, 0, 0);
    } else {
      ctx.putImageData(img, 0, 0);
    }

    addScanlines();
    addCRTTint();
  }

  // ── Public API ─────────────────────────────────────────────────────────

  function setPhaseCallback(cb: ((phase: DashcamPhase) => void) | null) {
    phaseCallback = cb;
  }

  function setCanvas(c: HTMLCanvasElement | null) {
    if (c) {
      c.width = DC_WIDTH;
      c.height = DC_HEIGHT;
      ctx = c.getContext("2d");
      ghostCanvas = document.createElement("canvas");
      ghostCanvas.width = DC_WIDTH;
      ghostCanvas.height = DC_HEIGHT;
      ghostCtx = ghostCanvas.getContext("2d");
    } else {
      ctx = null;
      ghostCanvas = null;
      ghostCtx = null;
    }
  }

  function begin(params: { ship: THREE.Object3D }) {
    shipRef = params.ship;
    seed = (Date.now() ^ 39173) | 0;
    frameTick = 0;
    burstTotal = 1 + (seed & 1);
    frameCount = 0;
    nextGlitchAt = 0;
    glitchEndAt = 0;
    liveFeedStartTime = 0;

    if (!rt) {
      rt = new THREE.WebGLRenderTarget(DC_WIDTH, DC_HEIGHT, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });
    }

    setPhaseInternal("intro");
  }

  function update(
    deltaMs: number,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
  ) {
    if (phase === "hidden") return;
    void deltaMs;

    const elapsed = performance.now() - phaseStart;

    switch (phase) {
      case "intro": {
        const fade = Math.min(elapsed / INTRO_MS, 1);
        drawStatic(0.35 + fade * 0.65);
        if (elapsed >= INTRO_MS) setPhaseInternal("static_pre");
        break;
      }

      case "static_pre": {
        const cycleDur = STATIC_BURST_MS + STATIC_GAP_MS;
        const cycle = elapsed % cycleDur;
        if (cycle < STATIC_BURST_MS) {
          drawStatic(0.45 + Math.sin(elapsed * 0.015) * 0.3);
        } else if (ctx) {
          ctx.fillStyle = "#080808";
          ctx.fillRect(0, 0, DC_WIDTH, DC_HEIGHT);
          addScanlines(0.2);
        }
        if (Math.floor(elapsed / cycleDur) >= burstTotal) {
          setPhaseInternal("live_feed");
        }
        break;
      }

      case "live_feed": {
        if (!ctx) break; // inactive tab — skip rendering
        updateDashcamCamera();
        frameTick++;

        if (frameTick % 2 === 0 && rt) {
          if (!lightsInScene) {
            scene.add(dcAmbient);
            lightsInScene = true;
          }

          const prevRT = renderer.getRenderTarget();
          const prevAC = renderer.autoClear;
          renderer.setRenderTarget(rt);
          renderer.autoClear = true;
          renderer.render(scene, dashcamCam);
          renderer.setRenderTarget(prevRT);
          renderer.autoClear = prevAC;
          blitRTToCanvas(renderer);

          scene.remove(dcAmbient);
          lightsInScene = false;
        }

        // Signal interference bursts
        const nowMs = performance.now();
        if (nowMs < glitchEndAt) {
          drawInterferenceOverlay();
        } else if (nowMs >= nextGlitchAt && nextGlitchAt > 0) {
          glitchEndAt = nowMs + 40 + Math.random() * 80;
          nextGlitchAt = nowMs + 4000 + Math.random() * 8000;
        }

        // "FLIGHT CAM ONLINE" flash on entry
        const lfElapsed = performance.now() - liveFeedStartTime;
        if (lfElapsed < 600) {
          drawFlightCamOnline(lfElapsed);
        }

        drawFrameCounter();
        break;
      }

      case "outro_terminator": {
        removeLightsFromScene(scene);
        const progress = Math.min(elapsed / OUTRO_MS, 1);
        drawTerminatorOutro(progress);
        if (progress >= 1) setPhaseInternal("hidden");
        break;
      }
    }
  }

  function fadeOut() {
    if (phase !== "hidden" && phase !== "outro_terminator") {
      setPhaseInternal("outro_terminator");
    }
  }

  function dispose() {
    if (rt) {
      rt.dispose();
      rt = null;
    }
    setPhaseInternal("hidden");
    ctx = null;
    ghostCanvas = null;
    ghostCtx = null;
    shipRef = null;
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
