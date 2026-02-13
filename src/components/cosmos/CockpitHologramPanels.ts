import * as THREE from "three";
import type { OverlayContent } from "../CosmicContentOverlay";

// ═══════════════════════════════════════════════════════════════════
// CockpitHologramPanels — frosted glass holographic panels floating
// inside the cockpit, visible only in cockpit view (Variant 1)
// ═══════════════════════════════════════════════════════════════════

// ── Constants (all in ship-local unscaled space) ──────────────────
const CANVAS_W = 512;
const PADDING = 22;

const TEXT_COLOR = "#b0d8f0";
const ACCENT_COLOR = "#50c8ff";
const HEADER_BG = "rgba(8, 18, 38, 0.3)";
const SECTION_BG = "rgba(6, 14, 28, 0.25)";
const BORDER_COLOR = "rgba(80, 200, 255, 0.35)";

// Cockpit camera local position (unscaled)
const CAM_POS = new THREE.Vector3(-6.05, 3.16, 5.36);

// Panel world-unit width in ship-local space
const PANEL_LOCAL_WIDTH = 1.4;

// How far in front of the camera (local Z offset) to place panels
const BASE_DEPTH = 1.5; // closest panel
const DEPTH_STEP = 0.3; // each subsequent panel is further back

// Entry animation
const FLOAT_IN_DURATION = 0.8; // seconds per panel
const PANEL_STAGGER = 0.25; // delay between each panel's start

// ── Types ─────────────────────────────────────────────────────────

interface HoloPanel {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  localW: number;
  localH: number;
  targetPos: THREE.Vector3; // final position in ship-local space
  startPos: THREE.Vector3; // start position for fly-in
  revealTime: number;
  opacity: number;
  targetOpacity: number;
  isHeader: boolean;
  // Idle drift params (unique per panel)
  driftSeedX: number;
  driftSeedY: number;
  driftSpeedX: number;
  driftSpeedY: number;
  // Slight tilt
  tiltX: number;
  tiltY: number;
}

// ═══════════════════════════════════════════════════════════════════

export class CockpitHologramPanels {
  private rootGroup: THREE.Group;
  private panels: HoloPanel[] = [];
  private spaceship: THREE.Group | null = null;

  private active = false;
  private hiding = false;
  private hideProgress = 0;
  private showTime = 0;
  private idleTime = 0;

  constructor() {
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = "CockpitHoloPanels";
    this.rootGroup.visible = false;
  }

  // ── Show content ────────────────────────────────────────────────

  showContent(content: OverlayContent, spaceship: THREE.Group): void {
    this.clearPanels();
    this.spaceship = spaceship;
    this.active = true;
    this.hiding = false;
    this.hideProgress = 0;
    this.showTime = 0;
    this.idleTime = 0;

    // Attach rootGroup to ship so panels move/rotate with it
    spaceship.add(this.rootGroup);
    this.rootGroup.visible = true;

    this.buildPanels(content);
  }

  // ── Hide content ────────────────────────────────────────────────

  hideContent(): void {
    if (!this.active) return;
    this.hiding = true;
    this.hideProgress = 0;
  }

  // ── Per-frame update ────────────────────────────────────────────

  update(delta: number): void {
    if (!this.active) return;

    // ── Hiding ──
    if (this.hiding) {
      this.hideProgress += delta / 0.5;
      if (this.hideProgress >= 1) {
        this.active = false;
        this.rootGroup.visible = false;
        this.detachFromShip();
        this.clearPanels();
        return;
      }
      for (const panel of this.panels) {
        panel.material.opacity = panel.targetOpacity * (1 - this.hideProgress);
        // Drift backward during hide
        panel.mesh.position.lerpVectors(
          panel.targetPos,
          panel.startPos,
          this.hideProgress * 0.3,
        );
      }
      return;
    }

    this.showTime += delta;
    this.idleTime += delta;

    for (const panel of this.panels) {
      const elapsed = this.showTime - panel.revealTime;

      if (elapsed < 0) {
        // Not yet revealed
        panel.material.opacity = 0;
        panel.mesh.position.copy(panel.startPos);
        continue;
      }

      // Float-in animation
      const t = Math.min(1, elapsed / FLOAT_IN_DURATION);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      panel.mesh.position.lerpVectors(panel.startPos, panel.targetPos, eased);
      panel.material.opacity = panel.targetOpacity * eased;

      // Idle drift (subtle, unique per panel)
      if (t >= 1) {
        const driftX =
          Math.sin(this.idleTime * panel.driftSpeedX + panel.driftSeedX) * 0.008;
        const driftY =
          Math.sin(this.idleTime * panel.driftSpeedY + panel.driftSeedY) * 0.005;
        panel.mesh.position.x = panel.targetPos.x + driftX;
        panel.mesh.position.y = panel.targetPos.y + driftY;
      }

      // Keep tilt
      panel.mesh.rotation.x = panel.tiltX;
      panel.mesh.rotation.y = panel.tiltY;
    }
  }

  // ── Build panels ────────────────────────────────────────────────

  private buildPanels(content: OverlayContent): void {
    const panelDataList: { title: string; lines: string[]; isHeader: boolean }[] =
      [];

    // Header panel
    panelDataList.push({
      title: content.title,
      lines: [content.subtitle || "", content.description || ""].filter(Boolean),
      isHeader: true,
    });

    // Section panels
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

    const total = panelDataList.length;

    // Layout: panels arranged in a slight arc in front of the cockpit camera
    // Header centered at top, section panels below fanning out
    for (let i = 0; i < total; i++) {
      const data = panelDataList[i];

      // Measure content and create canvas
      const canvasH = this.measureHeight(data.title, data.lines, data.isHeader);
      const localH = PANEL_LOCAL_WIDTH * (canvasH / CANVAS_W);

      const canvas = this.createPanelCanvas(
        data.title,
        data.lines,
        data.isHeader,
        CANVAS_W,
        canvasH,
      );
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const geo = new THREE.PlaneGeometry(PANEL_LOCAL_WIDTH, localH);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);

      // Position in ship-local space
      const targetPos = this.computePanelPosition(i, total, localH);
      const startPos = targetPos.clone();
      startPos.z -= 0.8; // start behind (deeper into cockpit)

      mesh.position.copy(startPos);

      // Slight tilt for holographic depth feel
      const tiltX = (Math.random() - 0.5) * 0.06; // ±3°
      const tiltY = (i === 0 ? 0 : (Math.random() - 0.5) * 0.1); // header faces straight
      mesh.rotation.x = tiltX;
      mesh.rotation.y = tiltY;

      this.rootGroup.add(mesh);
      this.panels.push({
        mesh,
        material: mat,
        texture,
        canvas,
        localW: PANEL_LOCAL_WIDTH,
        localH,
        targetPos,
        startPos,
        revealTime: i * PANEL_STAGGER,
        opacity: 0,
        targetOpacity: data.isHeader ? 0.88 : 0.82,
        isHeader: data.isHeader,
        driftSeedX: Math.random() * Math.PI * 2,
        driftSeedY: Math.random() * Math.PI * 2,
        driftSpeedX: 0.8 + Math.random() * 0.6,
        driftSpeedY: 1.0 + Math.random() * 0.5,
        tiltX,
        tiltY,
      });
    }
  }

  // ── Compute panel position in ship-local space ──────────────────

  private computePanelPosition(
    index: number,
    _total: number,
    panelH: number,
  ): THREE.Vector3 {
    // All positions relative to cockpit camera
    const depth = BASE_DEPTH + index * DEPTH_STEP;

    if (index === 0) {
      // Header: centered, slightly above eye level
      return new THREE.Vector3(
        CAM_POS.x,
        CAM_POS.y + 0.35,
        CAM_POS.z + depth,
      );
    }

    // Section panels: fan out below, alternating left/right
    const row = index; // 1-based row
    const side = row % 2 === 1 ? -1 : 1; // alternate sides
    const xSpread = 0.4 + (row - 1) * 0.15; // increasing spread
    const yDrop = -0.1 - row * (panelH * 0.6 + 0.08); // stack downward

    return new THREE.Vector3(
      CAM_POS.x + side * xSpread,
      CAM_POS.y + 0.35 + yDrop,
      CAM_POS.z + depth,
    );
  }

  // ── Measure content height ──────────────────────────────────────

  private measureHeight(
    title: string,
    lines: string[],
    isHeader: boolean,
  ): number {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = 10;
    const ctx = canvas.getContext("2d")!;

    const titleSize = isHeader ? 32 : 26;
    ctx.font = `bold ${titleSize}px Rajdhani, sans-serif`;
    let y = PADDING;
    const titleLines = this.wrapText(ctx, title, CANVAS_W - 2 * PADDING);
    y += titleLines.length * (titleSize + 5);
    y += 18; // divider

    ctx.font = "19px Rajdhani, sans-serif";
    for (const line of lines) {
      const wrapped = this.wrapText(ctx, line, CANVAS_W - 2 * PADDING - 24);
      y += wrapped.length * 24 + 5;
    }
    y += PADDING;
    return Math.max(y, 70);
  }

  // ── Create panel canvas (frosted glass hologram look) ───────────

  private createPanelCanvas(
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

    // Frosted glass background
    ctx.fillStyle = isHeader ? HEADER_BG : SECTION_BG;
    ctx.fillRect(0, 0, w, h);

    // Subtle horizontal gradient overlay for depth
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(80, 200, 255, 0.03)");
    grad.addColorStop(0.5, "rgba(80, 200, 255, 0.0)");
    grad.addColorStop(1, "rgba(80, 200, 255, 0.02)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Very faint scan lines
    ctx.fillStyle = "rgba(80, 200, 255, 0.008)";
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }

    // Border — thin glowing line
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 1.5;
    const r = 6; // corner radius
    this.roundRect(ctx, 3, 3, w - 6, h - 6, r);
    ctx.stroke();

    // Corner accents (small bright marks at corners)
    const cornerLen = 16;
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(3, 3 + cornerLen);
    ctx.lineTo(3, 3);
    ctx.lineTo(3 + cornerLen, 3);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(w - 3 - cornerLen, 3);
    ctx.lineTo(w - 3, 3);
    ctx.lineTo(w - 3, 3 + cornerLen);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(3, h - 3 - cornerLen);
    ctx.lineTo(3, h - 3);
    ctx.lineTo(3 + cornerLen, h - 3);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(w - 3 - cornerLen, h - 3);
    ctx.lineTo(w - 3, h - 3);
    ctx.lineTo(w - 3, h - 3 - cornerLen);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Title
    const titleSize = isHeader ? 32 : 26;
    ctx.font = `bold ${titleSize}px Rajdhani, sans-serif`;
    ctx.fillStyle = isHeader ? "#7ec8e8" : ACCENT_COLOR;
    ctx.textBaseline = "top";

    let y = PADDING;
    const titleLines = this.wrapText(ctx, title, w - 2 * PADDING);
    for (const tl of titleLines) {
      ctx.fillText(tl, PADDING, y);
      y += titleSize + 5;
    }

    // Divider
    y += 6;
    ctx.fillStyle = ACCENT_COLOR;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(PADDING, y, w - 2 * PADDING, 1);
    ctx.globalAlpha = 1;
    y += 12;

    // Body
    ctx.font = "19px Rajdhani, sans-serif";
    ctx.fillStyle = TEXT_COLOR;
    for (const line of lines) {
      const wrapped = this.wrapText(ctx, line, w - 2 * PADDING - 24);
      for (const wl of wrapped) {
        if (y > h - PADDING) break;
        ctx.fillStyle = ACCENT_COLOR;
        ctx.globalAlpha = 0.45;
        ctx.fillText("▸", PADDING, y);
        ctx.globalAlpha = 1;
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText(wl, PADDING + 18, y);
        y += 24;
      }
      y += 5;
    }

    return canvas;
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

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
      this.rootGroup.remove(panel.mesh);
    }
    this.panels = [];
  }

  private detachFromShip(): void {
    if (this.spaceship && this.rootGroup.parent === this.spaceship) {
      this.spaceship.remove(this.rootGroup);
    }
  }

  dispose(): void {
    this.clearPanels();
    this.detachFromShip();
  }

  isActive(): boolean {
    return this.active;
  }
}
