import * as THREE from "three";
import type { OverlayContent } from "../CosmicContentOverlay";
import {
  HOLO_PANEL_WIDTH,
  HOLO_SIDE_OFFSET,
  HOLO_REF_DISTANCE,
} from "./scaleConfig";

// ═══════════════════════════════════════════════════════════════════
// HologramDroneDisplay — a geometric probe that projects holographic
// text panels near a focused moon (Variant 3)
// ═══════════════════════════════════════════════════════════════════

// ── Constants ─────────────────────────────────────────────────────
const CANVAS_W = 768;
const BASE_PANEL_WORLD_WIDTH = HOLO_PANEL_WIDTH; // world-unit width at reference distance
const PADDING = 28; // canvas-pixel padding inside panels
const BORDER_MARGIN = 6; // canvas-pixel inset for border rect

const TEXT_COLOR = "#8ab0c8";
const ACCENT_COLOR = "#2a9968";
const HEADER_BG = "rgba(2, 4, 8, 0.82)";
const SECTION_BG = "rgba(4, 10, 22, 0.78)";

const FLY_IN_DURATION = 1.2;
const BORDER_DRAW_DURATION = 1.6; // seconds to trace the full border
const CONTENT_FADE_DURATION = 0.5; // seconds for text to fade in after border
const PANEL_STAGGER = 0.9; // seconds between each panel reveal start

const BASE_SIDE_OFFSET = HOLO_SIDE_OFFSET; // world units to the right of the moon at reference dist
const DRONE_FORWARD_RATIO = 0.3; // drone: 30% from moon toward camera
const REFERENCE_DISTANCE = HOLO_REF_DISTANCE; // camera distance at which base sizes are correct
const MIN_SCALE = 0.85; // don't shrink panels below 85% even when very close
const MAX_SCALE = 1.6; // don't grow panels beyond 160% even when very far
const SCALE_POWER = 0.6; // sub-linear scaling — panels grow gently, not 1:1 with distance

// ── Types ─────────────────────────────────────────────────────────

interface TextPanel {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  contentCanvas: HTMLCanvasElement; // pre-rendered text (no border/bg)
  displayCanvas: HTMLCanvasElement; // composited output (updated per frame)
  displayCtx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  panelW: number; // world units
  panelH: number; // world units
  targetOpacity: number;
  revealTime: number;
  borderProgress: number;
  contentFade: number;
  borderComplete: boolean;
  isHeader: boolean;
  penX: number;
  penY: number;
}

// ═══════════════════════════════════════════════════════════════════

export class HologramDroneDisplay {
  private scene: THREE.Scene;
  private droneGroup: THREE.Group;
  private panelGroup: THREE.Group;
  private rootGroup: THREE.Group;
  private panels: TextPanel[] = [];
  private laserLine: THREE.Line;
  private laserMaterial: THREE.LineBasicMaterial;
  private laserGlow: THREE.Mesh; // small sphere at laser tip
  private scannerLight: THREE.PointLight;

  // Animation state
  private active = false;
  private flyInProgress = 0;
  private contentStartTime = 0;
  private flyStartPos = new THREE.Vector3();
  private flyEndPos = new THREE.Vector3();
  private targetWorldPos = new THREE.Vector3();
  private hiding = false;
  private hideProgress = 0;
  private idleTime = 0;
  private sideDir = new THREE.Vector3();
  private isOrbitMode = false; // true when showing content during moon orbit

  // Temps
  private _tmpV = new THREE.Vector3();
  private _tmpV2 = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = "HologramDroneRoot";
    this.rootGroup.visible = false;

    this.droneGroup = this.buildDrone();
    this.rootGroup.add(this.droneGroup);

    this.panelGroup = new THREE.Group();
    this.panelGroup.name = "HologramPanels";
    this.rootGroup.add(this.panelGroup);

    // Laser beam
    this.laserMaterial = new THREE.LineBasicMaterial({
      color: 0x4fffb0,
      transparent: true,
      opacity: 0,
    });
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.laserLine = new THREE.Line(laserGeo, this.laserMaterial);
    this.laserLine.frustumCulled = false;
    this.rootGroup.add(this.laserLine);

    // Laser tip glow sphere
    const glowGeo = new THREE.SphereGeometry(0.18, 10, 10);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4fffb0,
      transparent: true,
      opacity: 0,
    });
    this.laserGlow = new THREE.Mesh(glowGeo, glowMat);
    this.rootGroup.add(this.laserGlow);

    // Scanner point light
    this.scannerLight = new THREE.PointLight(0x4fffb0, 0, 12);
    this.droneGroup.add(this.scannerLight);

    scene.add(this.rootGroup);
  }

  // ── Drone geometry ──────────────────────────────────────────────

  private buildDrone(): THREE.Group {
    const group = new THREE.Group();
    group.name = "HologramDrone";

    const bodyGeo = new THREE.OctahedronGeometry(0.45, 0);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x8899aa,
      metalness: 0.8,
      roughness: 0.25,
      emissive: 0x112233,
      emissiveIntensity: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1, 0.7, 1);
    group.add(body);

    const ringGeo = new THREE.TorusGeometry(0.65, 0.04, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x4fffb0,
      emissive: 0x4fffb0,
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.name = "droneRing";
    group.add(ring);

    const eyeGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x4fffb0,
      emissive: 0x4fffb0,
      emissiveIntensity: 1.0,
    });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.y = -0.35;
    group.add(eye);

    const antGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6);
    const antMat = new THREE.MeshStandardMaterial({
      color: 0xaabbcc,
      metalness: 0.9,
      roughness: 0.2,
    });
    const antenna = new THREE.Mesh(antGeo, antMat);
    antenna.position.y = 0.45;
    group.add(antenna);

    const tipGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      emissive: 0xff4444,
      emissiveIntensity: 0.8,
    });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = 0.63;
    group.add(tip);

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const thrusterGeo = new THREE.BoxGeometry(0.08, 0.06, 0.15);
      const thrusterMat = new THREE.MeshStandardMaterial({
        color: 0x556677,
        metalness: 0.7,
        roughness: 0.3,
      });
      const thruster = new THREE.Mesh(thrusterGeo, thrusterMat);
      thruster.position.set(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
      thruster.rotation.y = -angle;
      group.add(thruster);
    }

    return group;
  }

  // ── Show / Hide ─────────────────────────────────────────────────

  showContent(
    content: OverlayContent,
    moonWorldPos: THREE.Vector3,
    camera: THREE.Camera,
    /** Optional: anchor point for orbit mode (e.g. ship position above moon) */
    orbitAnchor?: THREE.Vector3,
  ): void {
    this.clearPanels();
    this.active = true;
    this.hiding = false;
    this.hideProgress = 0;
    this.flyInProgress = 0;
    this.contentStartTime = 0;
    this.idleTime = 0;
    this.droneGroup.scale.setScalar(0);
    this.laserMaterial.opacity = 0;
    (this.laserGlow.material as THREE.MeshBasicMaterial).opacity = 0;
    this.scannerLight.intensity = 0;

    this.targetWorldPos.copy(moonWorldPos);
    this.isOrbitMode = !!orbitAnchor;

    // Compute side direction: camera-right projected to horizontal plane
    const moonToCamera = this._tmpV.subVectors(camera.position, moonWorldPos);
    const dist = moonToCamera.length();
    const forward = moonToCamera.clone().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    this.sideDir.crossVectors(forward, worldUp).normalize();
    // If degenerate, pick arbitrary side
    if (this.sideDir.lengthSq() < 0.01) {
      this.sideDir.set(1, 0, 0);
    }

    // Scale factor: panels grow/shrink sub-linearly with camera distance
    // Using pow(ratio, 0.6) so doubling the distance only grows panels ~52%
    const rawRatio = dist / REFERENCE_DISTANCE;
    let distScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.pow(rawRatio, SCALE_POWER)));

    let endPos: THREE.Vector3;
    if (orbitAnchor) {
      // Orbit mode: camera is close — use a moderate fixed scale
      distScale = 0.3;

      // Position drone above the ship using camera's "up" direction (outward from moon).
      // This keeps the drone visually above the ship regardless of camera roll.
      const camUp = camera.up.clone().normalize();
      const camRight = new THREE.Vector3()
        .crossVectors(camera.getWorldDirection(new THREE.Vector3()), camUp)
        .normalize();

      endPos = orbitAnchor
        .clone()
        .addScaledVector(camUp, 6)     // above the ship in camera's "up"
        .addScaledVector(camRight, 3);  // slightly to the right
    } else {
      // Standard mode: near moon, offset to the side + slightly toward camera + above
      const sideOffset = BASE_SIDE_OFFSET * distScale;
      endPos = moonWorldPos
        .clone()
        .addScaledVector(forward, dist * DRONE_FORWARD_RATIO)
        .addScaledVector(this.sideDir, sideOffset)
        .add(new THREE.Vector3(0, 5 * distScale, 0));
    }
    this.flyEndPos.copy(endPos);

    // Fly-in start: behind/above camera
    this.flyStartPos
      .copy(camera.position)
      .addScaledVector(forward, 15)
      .add(new THREE.Vector3(0, 8, 0));

    // Build panels
    this.buildTextPanels(content, camera, distScale);

    this.rootGroup.visible = true;
    this.rootGroup.position.copy(this.flyStartPos);
  }

  hideContent(): void {
    if (!this.active) return;
    this.hiding = true;
    this.hideProgress = 0;
  }

  // ── Per-frame update ────────────────────────────────────────────

  update(delta: number, camera: THREE.Camera): void {
    if (!this.active) return;

    // ── Hiding ──
    if (this.hiding) {
      this.hideProgress += delta / 0.6;
      if (this.hideProgress >= 1) {
        this.active = false;
        this.rootGroup.visible = false;
        this.clearPanels();
        return;
      }
      const s = 1 - this.hideProgress;
      for (const panel of this.panels) {
        panel.material.opacity = panel.targetOpacity * s;
      }
      this.droneGroup.scale.setScalar(s);
      this.laserMaterial.opacity = 0.7 * s;
      (this.laserGlow.material as THREE.MeshBasicMaterial).opacity = 0.6 * s;
      this.scannerLight.intensity = 2 * s;
      return;
    }

    // ── Fly-in ──
    if (this.flyInProgress < 1) {
      this.flyInProgress += delta / FLY_IN_DURATION;
      if (this.flyInProgress > 1) this.flyInProgress = 1;
      const t = 1 - Math.pow(1 - this.flyInProgress, 3);
      this.rootGroup.position.lerpVectors(this.flyStartPos, this.flyEndPos, t);
      this.droneGroup.scale.setScalar(t);
      for (const panel of this.panels) panel.material.opacity = 0;
      this.laserMaterial.opacity = 0;
      (this.laserGlow.material as THREE.MeshBasicMaterial).opacity = 0;
      this.scannerLight.intensity = 0;
      return;
    }

    // ── Content phase ──
    this.contentStartTime += delta;
    this.idleTime += delta;

    // Idle hover — much gentler in orbit mode (close camera)
    const hoverScale = this.isOrbitMode ? 0.015 : 1.0;
    const hoverY = Math.sin(this.idleTime * 1.8) * 0.15 * hoverScale;
    const hoverX = Math.sin(this.idleTime * 1.1 + 1) * 0.05 * hoverScale;
    this.rootGroup.position.copy(this.flyEndPos);
    this.rootGroup.position.y += hoverY;
    this.rootGroup.position.x += hoverX;

    // Spin ring
    const ring = this.droneGroup.getObjectByName("droneRing");
    if (ring) ring.rotation.z += delta * 2.5;

    // Drone faces camera
    const lookTarget = this._tmpV.copy(camera.position);
    lookTarget.y = this.rootGroup.position.y;
    this.droneGroup.lookAt(lookTarget);

    // Billboard panels toward camera
    for (const panel of this.panels) {
      if (this.isOrbitMode) {
        // During orbit the camera is rolled — copy its quaternion so panels
        // always appear screen-aligned (upright in the camera's view).
        panel.mesh.quaternion.copy(camera.quaternion);
      } else {
        panel.mesh.lookAt(camera.position);
      }
    }

    // ── Animate panels (border draw → content fade) ──
    let laserTargetWorld: THREE.Vector3 | null = null;
    let anyDrawing = false;

    for (const panel of this.panels) {
      const elapsed = this.contentStartTime - panel.revealTime;
      if (elapsed < 0) {
        panel.material.opacity = 0;
        continue;
      }

      // Border drawing phase
      if (!panel.borderComplete) {
        anyDrawing = true;
        panel.borderProgress = Math.min(1, elapsed / BORDER_DRAW_DURATION);
        this.redrawPanel(panel);
        panel.material.opacity = panel.targetOpacity;

        if (panel.borderProgress >= 1) {
          panel.borderComplete = true;
        }

        // Compute laser target = pen position on panel surface
        laserTargetWorld = this.getPenWorldPos(panel);
        continue;
      }

      // Content fade phase
      const fadeElapsed = elapsed - BORDER_DRAW_DURATION;
      if (panel.contentFade < 1) {
        anyDrawing = true;
        panel.contentFade = Math.min(1, fadeElapsed / CONTENT_FADE_DURATION);
        this.redrawPanel(panel);

        // Laser stays at panel center during fade
        laserTargetWorld = this._tmpV2.copy(panel.mesh.position);
        this.panelGroup.localToWorld(laserTargetWorld);
      }

      panel.material.opacity = panel.targetOpacity;
    }

    // ── Update laser ──
    const laserPositions = this.laserLine.geometry.attributes
      .position as THREE.BufferAttribute;

    if (laserTargetWorld && anyDrawing) {
      // Drone world pos (scanner eye = bottom of drone)
      const droneWorld = this._tmpV.copy(this.droneGroup.position);
      this.rootGroup.localToWorld(droneWorld);
      droneWorld.y -= 0.35;

      // Laser endpoints in rootGroup local space
      const startLocal = this.rootGroup.worldToLocal(droneWorld.clone());
      const endLocal = this.rootGroup.worldToLocal(laserTargetWorld.clone());

      laserPositions.setXYZ(0, startLocal.x, startLocal.y, startLocal.z);
      laserPositions.setXYZ(1, endLocal.x, endLocal.y, endLocal.z);
      laserPositions.needsUpdate = true;

      // Pulse laser
      const pulse = 0.5 + Math.sin(this.idleTime * 4) * 0.15;
      this.laserMaterial.opacity = pulse;
      (this.laserGlow.material as THREE.MeshBasicMaterial).opacity = pulse * 0.8;
      this.laserGlow.position.copy(endLocal);
      this.scannerLight.intensity = 1.5 + Math.sin(this.idleTime * 4) * 0.5;
    } else {
      // No active drawing — dim laser
      this.laserMaterial.opacity = Math.max(0, this.laserMaterial.opacity - delta * 1.5);
      (this.laserGlow.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        (this.laserGlow.material as THREE.MeshBasicMaterial).opacity - delta * 1.5,
      );
      this.scannerLight.intensity = Math.max(0, this.scannerLight.intensity - delta * 2);
    }
  }

  // ── Redraw panel display canvas ─────────────────────────────────

  private redrawPanel(panel: TextPanel): void {
    const { displayCtx: ctx, canvasW, canvasH, contentCanvas, isHeader } = panel;

    // Clear
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Background
    ctx.fillStyle = isHeader ? HEADER_BG : SECTION_BG;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Scan lines
    ctx.fillStyle = "rgba(79, 255, 176, 0.015)";
    for (let y = 0; y < canvasH; y += 4) {
      ctx.fillRect(0, y, canvasW, 2);
    }

    // Draw border up to borderProgress
    const pen = this.drawBorderTrace(ctx, panel.borderProgress, canvasW, canvasH);
    panel.penX = pen.x;
    panel.penY = pen.y;

    // If border complete, composite content with fade
    if (panel.borderComplete && panel.contentFade > 0) {
      ctx.globalAlpha = panel.contentFade;
      ctx.drawImage(contentCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }

    panel.texture.needsUpdate = true;
  }

  // ── Trace border progressively ──────────────────────────────────

  private drawBorderTrace(
    ctx: CanvasRenderingContext2D,
    progress: number,
    w: number,
    h: number,
  ): { x: number; y: number } {
    const m = BORDER_MARGIN;
    const iw = w - 2 * m;
    const ih = h - 2 * m;
    const perimeter = 2 * (iw + ih);
    const len = progress * perimeter;

    ctx.save();
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(m, m);

    let penX = m;
    let penY = m;

    // Top
    const topLen = Math.min(len, iw);
    penX = m + topLen;
    ctx.lineTo(penX, penY);

    // Right
    if (len > iw) {
      const rightLen = Math.min(len - iw, ih);
      penY = m + rightLen;
      ctx.lineTo(penX, penY);
    }

    // Bottom (right to left)
    if (len > iw + ih) {
      const bottomLen = Math.min(len - iw - ih, iw);
      penX = m + iw - bottomLen;
      ctx.lineTo(penX, penY);
    }

    // Left (bottom to top)
    if (len > 2 * iw + ih) {
      const leftLen = Math.min(len - 2 * iw - ih, ih);
      penY = m + ih - leftLen;
      ctx.lineTo(penX, penY);
    }

    ctx.stroke();
    ctx.restore();

    // Glow at pen tip
    const grad = ctx.createRadialGradient(penX, penY, 0, penX, penY, 16);
    grad.addColorStop(0, "rgba(42, 153, 104, 0.7)");
    grad.addColorStop(0.4, "rgba(42, 153, 104, 0.18)");
    grad.addColorStop(1, "rgba(42, 153, 104, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(penX - 16, penY - 16, 32, 32);

    return { x: penX, y: penY };
  }

  // ── Get pen position in world space ─────────────────────────────

  private getPenWorldPos(panel: TextPanel): THREE.Vector3 {
    // Map canvas coords to local mesh coords
    const lx = (panel.penX / panel.canvasW - 0.5) * panel.panelW;
    const ly = (0.5 - panel.penY / panel.canvasH) * panel.panelH;
    const local = new THREE.Vector3(lx, ly, 0);
    // Panel mesh is in panelGroup; transform to world
    panel.mesh.localToWorld(local);
    return local;
  }

  // ── Build text panels ───────────────────────────────────────────

  private buildTextPanels(content: OverlayContent, camera: THREE.Camera, distScale: number = 1): void {
    const panelDataList: { title: string; lines: string[]; isHeader: boolean }[] = [];

    const panelWorldWidth = BASE_PANEL_WORLD_WIDTH * distScale;

    // Header
    panelDataList.push({
      title: content.title,
      lines: [content.subtitle || "", content.description || ""].filter(Boolean),
      isHeader: true,
    });

    // Sections
    for (const section of content.sections) {
      const sectionLines = Array.isArray(section.content)
        ? section.content
        : section.content.split("\n\n• ").filter(Boolean);
      const cleanLines = sectionLines.map((l) => l.replace(/^• /, ""));
      const dateStr = section.data?.startDate
        ? `${section.data.startDate} – ${section.data.endDate || "Present"}`
        : "";
      panelDataList.push({
        title: dateStr ? `${section.title}  [${dateStr}]` : section.title,
        lines: cleanLines,
        isHeader: false,
      });
    }

    // Direction from drone toward camera for forward push
    const droneToCamera = this._tmpV
      .subVectors(camera.position, this.flyEndPos)
      .normalize();

    // Wider gap in orbit mode to prevent heavy overlap at close range
    const panelGap = this.isOrbitMode ? 1.2 * distScale : 0.8 * distScale;

    // ── First pass: measure all panel heights ──────────────────────
    const panelHeights: number[] = [];
    const canvasHeights: number[] = [];
    for (const data of panelDataList) {
      const canvasH = this.measureContentHeight(data.title, data.lines, data.isHeader);
      canvasHeights.push(canvasH);
      panelHeights.push(panelWorldWidth * (canvasH / CANVAS_W));
    }

    // Total stack height — used to vertically position the stack (non-orbit).
    const totalHeight = panelHeights.reduce((sum, h) => sum + h, 0) + panelGap * (panelHeights.length - 1);

    // In orbit mode: lay panels side-by-side left → right using camera's right vector.
    // In normal mode: stack top → bottom using world-Y.
    const panelWidths = panelHeights.map(() => panelWorldWidth); // all same width
    const totalWidth = panelWidths.reduce((s, w) => s + w, 0) + panelGap * (panelWidths.length - 1);

    // Camera basis vectors for orbit layout
    const camUp = this.isOrbitMode ? camera.up.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const camRight = this.isOrbitMode
      ? new THREE.Vector3().crossVectors(
          camera.getWorldDirection(new THREE.Vector3()),
          camUp,
        ).normalize()
      : new THREE.Vector3(); // unused in normal mode

    let yAccum = totalHeight * 0.2; // vertical accumulator (normal mode)
    let xAccum = -totalWidth / 2 - totalWidth * 0.15; // shift 15% left of center

    for (let i = 0; i < panelDataList.length; i++) {
      const data = panelDataList[i];
      const canvasH = canvasHeights[i];
      const panelH = panelHeights[i];

      // Create content canvas (text only, no bg/border)
      const contentCanvas = this.createContentCanvas(
        data.title,
        data.lines,
        data.isHeader,
        CANVAS_W,
        canvasH,
      );

      // Display canvas (composited, updated per frame)
      const displayCanvas = document.createElement("canvas");
      displayCanvas.width = CANVAS_W;
      displayCanvas.height = canvasH;
      const displayCtx = displayCanvas.getContext("2d")!;

      const texture = new THREE.CanvasTexture(displayCanvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const geo = new THREE.PlaneGeometry(panelWorldWidth, panelH);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);

      const forwardPush = droneToCamera.clone().multiplyScalar(3 * distScale);

      if (this.isOrbitMode) {
        // Side-by-side: offset along camera-right, vertically centered
        const xCenter = xAccum + panelWorldWidth / 2;
        xAccum += panelWorldWidth + panelGap;
        const pos = forwardPush.clone()
          .addScaledVector(camRight, xCenter);  // left → right
        mesh.position.copy(pos);
      } else {
        // Normal vertical stack
        const yOff = yAccum - panelH / 2;
        yAccum -= panelH + panelGap;
        mesh.position.set(forwardPush.x, yOff, forwardPush.z);
      }

      this.panelGroup.add(mesh);
      this.panels.push({
        mesh,
        material: mat,
        texture,
        contentCanvas,
        displayCanvas,
        displayCtx,
        canvasW: CANVAS_W,
        canvasH,
        panelW: panelWorldWidth,
        panelH,
        targetOpacity: 0.94,
        revealTime: i * PANEL_STAGGER,
        borderProgress: 0,
        contentFade: 0,
        borderComplete: false,
        isHeader: data.isHeader,
        penX: BORDER_MARGIN,
        penY: BORDER_MARGIN,
      });
    }
  }

  // ── Measure content height ──────────────────────────────────────

  private measureContentHeight(
    title: string,
    lines: string[],
    isHeader: boolean,
  ): number {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = 10;
    const ctx = canvas.getContext("2d")!;

    const titleSize = isHeader ? 38 : 30;
    ctx.font = `bold ${titleSize}px Rajdhani, sans-serif`;
    let y = PADDING;
    const titleLines = this.wrapText(ctx, title, CANVAS_W - 2 * PADDING);
    y += titleLines.length * (titleSize + 6);
    y += 24; // divider gap

    ctx.font = "22px Rajdhani, sans-serif";
    for (const line of lines) {
      const wrapped = this.wrapText(ctx, line, CANVAS_W - 2 * PADDING - 30);
      y += wrapped.length * 28 + 6;
    }

    y += PADDING;
    return Math.max(y, 80); // minimum height
  }

  // ── Create content canvas (text only) ───────────────────────────

  private createContentCanvas(
    title: string,
    lines: string[],
    isHeader: boolean,
    w: number,
    h: number,
  ): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    // Title
    const titleSize = isHeader ? 38 : 30;
    ctx.font = `bold ${titleSize}px Rajdhani, sans-serif`;
    ctx.fillStyle = isHeader ? "#6aa8c0" : ACCENT_COLOR;
    ctx.textBaseline = "top";

    let y = PADDING;
    const titleLines = this.wrapText(ctx, title, w - 2 * PADDING);
    for (const tl of titleLines) {
      ctx.fillText(tl, PADDING, y);
      y += titleSize + 6;
    }

    // Divider
    y += 8;
    ctx.fillStyle = ACCENT_COLOR;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(PADDING, y, w - 2 * PADDING, 2);
    ctx.globalAlpha = 1;
    y += 16;

    // Body
    ctx.font = "22px Rajdhani, sans-serif";
    ctx.fillStyle = TEXT_COLOR;
    for (const line of lines) {
      const wrapped = this.wrapText(ctx, line, w - 2 * PADDING - 30);
      for (const wl of wrapped) {
        if (y > h - PADDING) break;
        ctx.fillStyle = ACCENT_COLOR;
        ctx.globalAlpha = 0.6;
        ctx.fillText("▸", PADDING, y);
        ctx.globalAlpha = 1;
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText(wl, PADDING + 22, y);
        y += 28;
      }
      y += 6;
    }

    return canvas;
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }

  private clearPanels(): void {
    for (const panel of this.panels) {
      panel.material.dispose();
      panel.mesh.geometry.dispose();
      panel.texture.dispose();
      this.panelGroup.remove(panel.mesh);
    }
    this.panels = [];
  }

  dispose(): void {
    this.clearPanels();
    this.scene.remove(this.rootGroup);
    this.droneGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      if ((obj as THREE.Mesh).material) {
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.laserLine.geometry.dispose();
    this.laserMaterial.dispose();
    this.laserGlow.geometry.dispose();
    (this.laserGlow.material as THREE.Material).dispose();
  }

  isActive(): boolean {
    return this.active;
  }
}
