import * as THREE from "three";
import type { OverlayContent } from "../CosmicContentOverlay";
import {
  HOLO_PANEL_WIDTH,
  HOLO_SIDE_OFFSET,
  HOLO_REF_DISTANCE,
} from "./scaleConfig";

const CANVAS_W = 768;
const BASE_PANEL_WORLD_WIDTH = HOLO_PANEL_WIDTH;
const PADDING = 28;
const BORDER_MARGIN = 6;

const TEXT_COLOR = "#8ab0c8";
const ACCENT_COLOR = "#2a9968";
const HEADER_BG = "rgba(2, 4, 8, 0.82)";
const SECTION_BG = "rgba(4, 10, 22, 0.78)";

const FLY_IN_DURATION = 1.2;
const BORDER_DRAW_DURATION = 1.6;
const CONTENT_FADE_DURATION = 0.5;
const PANEL_STAGGER = 0;
const POST_DRAW_DRONE_EXIT_DURATION = 0.55;
const PANELS_DOCK_DURATION = 0.38;

const BASE_SIDE_OFFSET = HOLO_SIDE_OFFSET;
const DRONE_FORWARD_RATIO = 0.3;
const REFERENCE_DISTANCE = HOLO_REF_DISTANCE;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.6;
const SCALE_POWER = 0.6;

type TextPanel = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  contentCanvas: HTMLCanvasElement;
  displayCanvas: HTMLCanvasElement;
  displayCtx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  panelW: number;
  panelH: number;
  targetOpacity: number;
  revealTime: number;
  borderProgress: number;
  contentFade: number;
  borderComplete: boolean;
  isHeader: boolean;
  penX: number;
  penY: number;
  drawOffset: THREE.Vector3;
  drawOriginWorld: THREE.Vector3;
  dockScale: number;
  expandedScale: number;
};

type LaserRig = {
  line: THREE.Line;
  lineMat: THREE.LineBasicMaterial;
  edgeA: THREE.Line;
  edgeAMat: THREE.LineBasicMaterial;
  edgeB: THREE.Line;
  edgeBMat: THREE.LineBasicMaterial;
  triangle: THREE.Mesh;
  triangleMat: THREE.MeshBasicMaterial;
  glow: THREE.Mesh;
};

export class HologramDroneDisplay {
  private scene: THREE.Scene;
  private rootGroup: THREE.Group;
  private droneGroup: THREE.Group;
  private panelGroup: THREE.Group;
  private scannerLight: THREE.PointLight;

  private panels: TextPanel[] = [];
  private laserRigs: LaserRig[] = [];

  private active = false;
  private hiding = false;
  private hideProgress = 0;
  private flyInProgress = 0;
  private contentStartTime = 0;
  private idleTime = 0;
  private isOrbitMode = false;

  private drawFinished = false;
  private droneExitingAfterDraw = false;
  private droneExitProgress = 0;

  private dockingPanels = false;
  private panelsDocked = false;
  private panelDockProgress = 0;
  private activePanelIndex: number | null = null;

  private flyStartPos = new THREE.Vector3();
  private flyEndPos = new THREE.Vector3();
  private targetWorldPos = new THREE.Vector3();
  private sideDir = new THREE.Vector3();

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
    this.panelGroup.visible = false;

    this.scannerLight = new THREE.PointLight(0x4fffb0, 0, 12);
    this.droneGroup.add(this.scannerLight);

    this.scene.add(this.rootGroup);
    this.scene.add(this.panelGroup);
  }

  private buildDrone(): THREE.Group {
    const group = new THREE.Group();
    group.name = "HologramDrone";

    const body = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      new THREE.MeshStandardMaterial({
        color: 0x8899aa,
        metalness: 0.8,
        roughness: 0.25,
        emissive: 0x112233,
        emissiveIntensity: 0.3,
      }),
    );
    body.scale.set(1, 0.7, 1);
    group.add(body);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.04, 8, 32),
      new THREE.MeshStandardMaterial({
        color: 0x4fffb0,
        emissive: 0x4fffb0,
        emissiveIntensity: 0.5,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.8,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.name = "droneRing";
    group.add(ring);

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0x4fffb0,
        emissive: 0x4fffb0,
        emissiveIntensity: 1.0,
      }),
    );
    eye.position.y = -0.35;
    group.add(eye);

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6),
      new THREE.MeshStandardMaterial({
        color: 0xaabbcc,
        metalness: 0.9,
        roughness: 0.2,
      }),
    );
    antenna.position.y = 0.45;
    group.add(antenna);

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff4444,
        emissive: 0xff4444,
        emissiveIntensity: 0.8,
      }),
    );
    tip.position.y = 0.63;
    group.add(tip);

    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2;
      const thruster = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.06, 0.15),
        new THREE.MeshStandardMaterial({
          color: 0x556677,
          metalness: 0.7,
          roughness: 0.3,
        }),
      );
      thruster.position.set(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
      thruster.rotation.y = -angle;
      group.add(thruster);
    }

    return group;
  }

  private createLaserRig(): LaserRig {
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x4fffb0,
      transparent: true,
      opacity: 0,
    });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      lineMat,
    );
    line.frustumCulled = false;

    const edgeAMat = new THREE.LineBasicMaterial({
      color: 0x66ffd2,
      transparent: true,
      opacity: 0,
    });
    const edgeA = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      edgeAMat,
    );
    edgeA.frustumCulled = false;

    const edgeBMat = new THREE.LineBasicMaterial({
      color: 0x66ffd2,
      transparent: true,
      opacity: 0,
    });
    const edgeB = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      edgeBMat,
    );
    edgeB.frustumCulled = false;

    const triGeo = new THREE.BufferGeometry();
    triGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Array(9).fill(0), 3),
    );
    const triangleMat = new THREE.MeshBasicMaterial({
      color: 0x8cffe3,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const triangle = new THREE.Mesh(triGeo, triangleMat);
    triangle.frustumCulled = false;

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0x4fffb0,
        transparent: true,
        opacity: 0,
      }),
    );
    glow.frustumCulled = false;

    this.rootGroup.add(line, edgeA, edgeB, triangle, glow);
    return { line, lineMat, edgeA, edgeAMat, edgeB, edgeBMat, triangle, triangleMat, glow };
  }

  private ensureLaserRigCount(count: number): void {
    while (this.laserRigs.length < count) {
      this.laserRigs.push(this.createLaserRig());
    }
    while (this.laserRigs.length > count) {
      const rig = this.laserRigs.pop();
      if (!rig) break;
      this.rootGroup.remove(rig.line, rig.edgeA, rig.edgeB, rig.triangle, rig.glow);
      rig.line.geometry.dispose();
      rig.edgeA.geometry.dispose();
      rig.edgeB.geometry.dispose();
      rig.triangle.geometry.dispose();
      rig.lineMat.dispose();
      rig.edgeAMat.dispose();
      rig.edgeBMat.dispose();
      rig.triangleMat.dispose();
      (rig.glow.material as THREE.Material).dispose();
      rig.glow.geometry.dispose();
    }
  }

  private setLaserRigOpacity(rig: LaserRig, alpha: number): void {
    rig.lineMat.opacity = alpha;
    rig.edgeAMat.opacity = alpha * 0.78;
    rig.edgeBMat.opacity = alpha * 0.78;
    rig.triangleMat.opacity = alpha * 0.22;
    (rig.glow.material as THREE.MeshBasicMaterial).opacity = alpha * 0.8;
  }

  private updateLaserRig(
    rig: LaserRig,
    startLocal: THREE.Vector3,
    endLocal: THREE.Vector3,
    camera: THREE.Camera,
    pulse: number,
  ): void {
    const linePositions = rig.line.geometry.attributes.position as THREE.BufferAttribute;
    linePositions.setXYZ(0, startLocal.x, startLocal.y, startLocal.z);
    linePositions.setXYZ(1, endLocal.x, endLocal.y, endLocal.z);
    linePositions.needsUpdate = true;

    const sideLocal = this._tmpV
      .subVectors(this.rootGroup.worldToLocal(camera.position.clone()), startLocal)
      .cross(this._tmpV2.subVectors(endLocal, startLocal))
      .normalize();
    if (sideLocal.lengthSq() < 1e-4) sideLocal.set(0, 1, 0);
    const spread = Math.min(1.15, Math.max(0.2, startLocal.distanceTo(endLocal) * 0.06));
    const endA = endLocal.clone().addScaledVector(sideLocal, spread);
    const endB = endLocal.clone().addScaledVector(sideLocal, -spread);

    const edgeAAttr = rig.edgeA.geometry.attributes.position as THREE.BufferAttribute;
    edgeAAttr.setXYZ(0, startLocal.x, startLocal.y, startLocal.z);
    edgeAAttr.setXYZ(1, endA.x, endA.y, endA.z);
    edgeAAttr.needsUpdate = true;

    const edgeBAttr = rig.edgeB.geometry.attributes.position as THREE.BufferAttribute;
    edgeBAttr.setXYZ(0, startLocal.x, startLocal.y, startLocal.z);
    edgeBAttr.setXYZ(1, endB.x, endB.y, endB.z);
    edgeBAttr.needsUpdate = true;

    const triAttr = rig.triangle.geometry.attributes.position as THREE.BufferAttribute;
    triAttr.setXYZ(0, startLocal.x, startLocal.y, startLocal.z);
    triAttr.setXYZ(1, endA.x, endA.y, endA.z);
    triAttr.setXYZ(2, endB.x, endB.y, endB.z);
    triAttr.needsUpdate = true;

    this.setLaserRigOpacity(rig, pulse);
    rig.glow.position.copy(endLocal);
  }

  private dimLaserRig(rig: LaserRig, delta: number): void {
    rig.lineMat.opacity = Math.max(0, rig.lineMat.opacity - delta * 1.5);
    rig.edgeAMat.opacity = Math.max(0, rig.edgeAMat.opacity - delta * 1.8);
    rig.edgeBMat.opacity = Math.max(0, rig.edgeBMat.opacity - delta * 1.8);
    rig.triangleMat.opacity = Math.max(0, rig.triangleMat.opacity - delta * 1.2);
    const glowMat = rig.glow.material as THREE.MeshBasicMaterial;
    glowMat.opacity = Math.max(0, glowMat.opacity - delta * 1.5);
  }

  showContent(
    content: OverlayContent,
    moonWorldPos: THREE.Vector3,
    camera: THREE.Camera,
    orbitAnchor?: THREE.Vector3,
  ): void {
    this.clearPanels();
    this.active = true;
    this.hiding = false;
    this.hideProgress = 0;
    this.flyInProgress = 0;
    this.contentStartTime = 0;
    this.idleTime = 0;
    this.drawFinished = false;
    this.droneExitingAfterDraw = false;
    this.droneExitProgress = 0;
    this.dockingPanels = false;
    this.panelsDocked = false;
    this.panelDockProgress = 0;
    this.activePanelIndex = null;

    this.rootGroup.visible = true;
    this.panelGroup.visible = true;
    this.droneGroup.visible = true;
    this.droneGroup.position.set(0, 0, 0);
    this.droneGroup.rotation.set(0, 0, 0);
    this.droneGroup.scale.setScalar(0);

    this.targetWorldPos.copy(moonWorldPos);
    this.isOrbitMode = !!orbitAnchor;

    const moonToCamera = this._tmpV.subVectors(camera.position, moonWorldPos);
    const dist = moonToCamera.length();
    const forward = moonToCamera.clone().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    this.sideDir.crossVectors(forward, worldUp).normalize();
    if (this.sideDir.lengthSq() < 0.01) this.sideDir.set(1, 0, 0);

    const rawRatio = dist / REFERENCE_DISTANCE;
    let distScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.pow(rawRatio, SCALE_POWER)));

    let endPos: THREE.Vector3;
    if (orbitAnchor) {
      distScale = 0.3;
      const camUp = camera.up.clone().normalize();
      const camRight = new THREE.Vector3()
        .crossVectors(camera.getWorldDirection(new THREE.Vector3()), camUp)
        .normalize();
      endPos = orbitAnchor
        .clone()
        .addScaledVector(camUp, 6)
        .addScaledVector(camRight, 3);
    } else {
      const sideOffset = BASE_SIDE_OFFSET * distScale;
      endPos = moonWorldPos
        .clone()
        .addScaledVector(forward, dist * DRONE_FORWARD_RATIO)
        .addScaledVector(this.sideDir, sideOffset)
        .add(new THREE.Vector3(0, 5 * distScale, 0));
    }
    this.flyEndPos.copy(endPos);

    this.flyStartPos.copy(camera.position).addScaledVector(forward, 15).add(new THREE.Vector3(0, 8, 0));

    this.buildTextPanels(content, camera, distScale);
    this.ensureLaserRigCount(this.panels.length);
    this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0));

    this.rootGroup.position.copy(this.flyStartPos);
  }

  hideContent(): void {
    if (!this.active) return;
    this.hiding = true;
    this.hideProgress = 0;
  }

  getInteractivePanelMeshes(): THREE.Object3D[] {
    if (!this.active || !this.panelsDocked) return [];
    return this.panels.map((panel) => panel.mesh);
  }

  selectPanel(panelIndex: number): void {
    if (!this.active || !this.panelsDocked) return;
    if (panelIndex < 0 || panelIndex >= this.panels.length) return;
    this.activePanelIndex = this.activePanelIndex === panelIndex ? null : panelIndex;
  }

  update(delta: number, camera: THREE.Camera): void {
    if (!this.active) return;

    if (this.hiding) {
      this.hideProgress += delta / 0.6;
      const s = Math.max(0, 1 - this.hideProgress);
      for (const panel of this.panels) panel.material.opacity = panel.targetOpacity * s;
      this.droneGroup.scale.setScalar(s);
      this.scannerLight.intensity = 2 * s;
      this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0.7 * s));
      if (this.hideProgress >= 1) {
        this.active = false;
        this.rootGroup.visible = false;
        this.panelGroup.visible = false;
        this.clearPanels();
      }
      return;
    }

    if (this.flyInProgress < 1) {
      this.flyInProgress = Math.min(1, this.flyInProgress + delta / FLY_IN_DURATION);
      const t = 1 - Math.pow(1 - this.flyInProgress, 3);
      this.rootGroup.position.lerpVectors(this.flyStartPos, this.flyEndPos, t);
      this.droneGroup.scale.setScalar(t);
      for (const panel of this.panels) panel.material.opacity = 0;
      this.scannerLight.intensity = 0;
      this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0));
      return;
    }

    this.contentStartTime += delta;
    this.idleTime += delta;

    const hoverScale = this.isOrbitMode ? 0.015 : 1.0;
    const hoverY = Math.sin(this.idleTime * 1.8) * 0.15 * hoverScale;
    const hoverX = Math.sin(this.idleTime * 1.1 + 1) * 0.05 * hoverScale;
    this.rootGroup.position.copy(this.flyEndPos);
    this.rootGroup.position.y += hoverY;
    this.rootGroup.position.x += hoverX;

    const ring = this.droneGroup.getObjectByName("droneRing");
    if (ring) ring.rotation.z += delta * 2.5;

    const lookTarget = this._tmpV.copy(camera.position);
    lookTarget.y = this.rootGroup.position.y;
    this.droneGroup.lookAt(lookTarget);

    if (!this.dockingPanels && !this.panelsDocked) {
      for (const panel of this.panels) {
        panel.mesh.position.copy(this.rootGroup.position).add(panel.drawOffset);
      }
    }

    const laserTargets: THREE.Vector3[] = [];
    let anyDrawing = false;
    if (!this.drawFinished) {
      for (const panel of this.panels) {
        const elapsed = this.contentStartTime - panel.revealTime;
        if (elapsed < 0) {
          panel.material.opacity = 0;
          continue;
        }

        if (!panel.borderComplete) {
          anyDrawing = true;
          panel.borderProgress = Math.min(1, elapsed / BORDER_DRAW_DURATION);
          this.redrawPanel(panel);
          panel.material.opacity = panel.targetOpacity;
          if (panel.borderProgress >= 1) panel.borderComplete = true;
          laserTargets.push(this.getPenWorldPos(panel));
          continue;
        }

        const fadeElapsed = elapsed - BORDER_DRAW_DURATION;
        if (panel.contentFade < 1) {
          anyDrawing = true;
          panel.contentFade = Math.min(1, fadeElapsed / CONTENT_FADE_DURATION);
          this.redrawPanel(panel);
          laserTargets.push(panel.mesh.position.clone());
        }

        panel.material.opacity = panel.targetOpacity;
      }
    }

    const allPanelsRendered =
      this.panels.length > 0 &&
      this.panels.every((panel) => panel.borderComplete && panel.contentFade >= 1);
    if (allPanelsRendered && !this.drawFinished) {
      this.drawFinished = true;
      this.droneExitingAfterDraw = true;
      this.droneExitProgress = 0;
      this.dockingPanels = true;
      this.panelDockProgress = 0;
      for (const panel of this.panels) {
        panel.drawOriginWorld.copy(panel.mesh.position);
      }
    }

    const droneWorld = this._tmpV.copy(this.droneGroup.position);
    this.rootGroup.localToWorld(droneWorld);
    droneWorld.y -= 0.35;
    const startLocal = this.rootGroup.worldToLocal(droneWorld.clone());
    const pulse = 0.5 + Math.sin(this.idleTime * 4) * 0.15;

    this.ensureLaserRigCount(Math.max(this.panels.length, laserTargets.length));
    if (laserTargets.length > 0 && anyDrawing) {
      for (let i = 0; i < this.laserRigs.length; i += 1) {
        const rig = this.laserRigs[i];
        const target = laserTargets[i];
        if (!target) {
          this.dimLaserRig(rig, delta);
          continue;
        }
        const endLocal = this.rootGroup.worldToLocal(target.clone());
        this.updateLaserRig(rig, startLocal, endLocal, camera, pulse);
      }
      this.scannerLight.intensity = 1.5 + Math.sin(this.idleTime * 4) * 0.5;
    } else {
      this.laserRigs.forEach((rig) => this.dimLaserRig(rig, delta));
      this.scannerLight.intensity = Math.max(0, this.scannerLight.intensity - delta * 2);
    }

    if (this.droneExitingAfterDraw) {
      this.droneExitProgress = Math.min(
        1,
        this.droneExitProgress + delta / POST_DRAW_DRONE_EXIT_DURATION,
      );
      const eased = 1 - Math.pow(1 - this.droneExitProgress, 3);
      const fade = 1 - eased;
      this.droneGroup.position.set(eased * 2.2, eased * 2.5, -eased * 3.2);
      this.droneGroup.scale.setScalar(Math.max(0, 1 - eased * 1.2));
      this.scannerLight.intensity *= fade;
      this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, rig.lineMat.opacity * fade));
      if (this.droneExitProgress >= 1) {
        this.droneExitingAfterDraw = false;
        this.droneGroup.visible = false;
        this.laserRigs.forEach((rig) => this.setLaserRigOpacity(rig, 0));
      }
    }

    const dockDepth = Math.max(12, camera.position.distanceTo(this.flyEndPos) * 0.52);
    if (this.dockingPanels) {
      this.panelDockProgress = Math.min(1, this.panelDockProgress + delta / PANELS_DOCK_DURATION);
      const t = 1 - Math.pow(1 - this.panelDockProgress, 3);
      for (let i = 0; i < this.panels.length; i += 1) {
        const panel = this.panels[i];
        const dockTarget = this.getDockTarget(i, camera, dockDepth);
        panel.mesh.position.lerpVectors(panel.drawOriginWorld, dockTarget, t);
        panel.mesh.scale.setScalar(1 + (panel.dockScale - 1) * t);
      }
      if (this.panelDockProgress >= 1) {
        this.dockingPanels = false;
        this.panelsDocked = true;
      }
    } else if (this.panelsDocked) {
      for (let i = 0; i < this.panels.length; i += 1) {
        const panel = this.panels[i];
        const isActive = this.activePanelIndex === i;
        const targetPos = isActive
          ? this.getFocusTarget(camera, dockDepth)
          : this.getDockTarget(i, camera, dockDepth);
        const targetScale = isActive ? panel.expandedScale : panel.dockScale;
        const posLerp = 1 - Math.exp(-delta * 14);
        const scaleLerp = 1 - Math.exp(-delta * 16);
        panel.mesh.position.lerp(targetPos, posLerp);
        const nextScale =
          panel.mesh.scale.x + (targetScale - panel.mesh.scale.x) * scaleLerp;
        panel.mesh.scale.setScalar(nextScale);
        panel.mesh.renderOrder = isActive ? 1400 : 1000 + i;
      }
    }

    for (const panel of this.panels) {
      panel.mesh.quaternion.copy(camera.quaternion);
      panel.material.opacity = panel.targetOpacity;
    }
  }

  private ndcToWorld(
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
    depth: number,
  ): THREE.Vector3 {
    const projected = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
    const dir = projected.sub(camera.position).normalize();
    return camera.position.clone().addScaledVector(dir, depth);
  }

  private getDockTarget(index: number, camera: THREE.Camera, depth: number): THREE.Vector3 {
    const cols = Math.min(3, Math.max(1, this.panels.length));
    const row = Math.floor(index / cols);
    const col = index % cols;
    const ndcX = -0.78 + col * 0.2;
    const ndcY = 0.58 - row * 0.18;
    return this.ndcToWorld(ndcX, ndcY, camera, depth);
  }

  private getFocusTarget(camera: THREE.Camera, depth: number): THREE.Vector3 {
    return this.ndcToWorld(-0.55, -0.08, camera, depth);
  }

  private redrawPanel(panel: TextPanel): void {
    const { displayCtx: ctx, canvasW, canvasH, contentCanvas, isHeader } = panel;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = isHeader ? HEADER_BG : SECTION_BG;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = "rgba(79, 255, 176, 0.015)";
    for (let y = 0; y < canvasH; y += 4) ctx.fillRect(0, y, canvasW, 2);
    const pen = this.drawBorderTrace(ctx, panel.borderProgress, canvasW, canvasH);
    panel.penX = pen.x;
    panel.penY = pen.y;
    if (panel.borderComplete && panel.contentFade > 0) {
      ctx.globalAlpha = panel.contentFade;
      ctx.drawImage(contentCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }
    panel.texture.needsUpdate = true;
  }

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
    const topLen = Math.min(len, iw);
    penX = m + topLen;
    ctx.lineTo(penX, penY);
    if (len > iw) {
      const rightLen = Math.min(len - iw, ih);
      penY = m + rightLen;
      ctx.lineTo(penX, penY);
    }
    if (len > iw + ih) {
      const bottomLen = Math.min(len - iw - ih, iw);
      penX = m + iw - bottomLen;
      ctx.lineTo(penX, penY);
    }
    if (len > 2 * iw + ih) {
      const leftLen = Math.min(len - 2 * iw - ih, ih);
      penY = m + ih - leftLen;
      ctx.lineTo(penX, penY);
    }
    ctx.stroke();
    ctx.restore();

    const grad = ctx.createRadialGradient(penX, penY, 0, penX, penY, 16);
    grad.addColorStop(0, "rgba(42, 153, 104, 0.7)");
    grad.addColorStop(0.4, "rgba(42, 153, 104, 0.18)");
    grad.addColorStop(1, "rgba(42, 153, 104, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(penX - 16, penY - 16, 32, 32);
    return { x: penX, y: penY };
  }

  private getPenWorldPos(panel: TextPanel): THREE.Vector3 {
    const lx = (panel.penX / panel.canvasW - 0.5) * panel.panelW;
    const ly = (0.5 - panel.penY / panel.canvasH) * panel.panelH;
    const local = new THREE.Vector3(lx, ly, 0);
    panel.mesh.localToWorld(local);
    return local;
  }

  private buildTextPanels(
    content: OverlayContent,
    camera: THREE.Camera,
    distScale: number = 1,
  ): void {
    const panelDataList: { title: string; lines: string[]; isHeader: boolean }[] = [];
    panelDataList.push({
      title: content.title,
      lines: [content.subtitle || "", content.description || ""].filter(Boolean),
      isHeader: true,
    });

    for (const section of content.sections) {
      const sectionLines = Array.isArray(section.content)
        ? section.content
        : section.content.split("\n\n• ").filter(Boolean);
      const cleanLines = sectionLines.map((line) => line.replace(/^• /, ""));
      const dateStr = section.data?.startDate
        ? `${section.data.startDate} – ${section.data.endDate || "Present"}`
        : "";
      panelDataList.push({
        title: dateStr ? `${section.title}  [${dateStr}]` : section.title,
        lines: cleanLines,
        isHeader: false,
      });
    }

    const panelWorldWidth = BASE_PANEL_WORLD_WIDTH * distScale;
    const droneToCamera = this._tmpV.subVectors(camera.position, this.flyEndPos).normalize();
    const panelGap = this.isOrbitMode ? 1.2 * distScale : 0.8 * distScale;

    const panelHeights: number[] = [];
    const canvasHeights: number[] = [];
    for (const data of panelDataList) {
      const canvasH = this.measureContentHeight(data.title, data.lines, data.isHeader);
      canvasHeights.push(canvasH);
      panelHeights.push(panelWorldWidth * (canvasH / CANVAS_W));
    }

    const totalHeight =
      panelHeights.reduce((sum, h) => sum + h, 0) + panelGap * (panelHeights.length - 1);
    const totalWidth =
      panelHeights.reduce((sum) => sum + panelWorldWidth, 0) +
      panelGap * (panelHeights.length - 1);

    const camUp = this.isOrbitMode
      ? camera.up.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
    const camRight = this.isOrbitMode
      ? new THREE.Vector3()
          .crossVectors(camera.getWorldDirection(new THREE.Vector3()), camUp)
          .normalize()
      : new THREE.Vector3();

    let yAccum = totalHeight * 0.2;
    let xAccum = -totalWidth / 2 - totalWidth * 0.15;

    for (let i = 0; i < panelDataList.length; i += 1) {
      const data = panelDataList[i];
      const canvasH = canvasHeights[i];
      const panelH = panelHeights[i];

      const contentCanvas = this.createContentCanvas(
        data.title,
        data.lines,
        data.isHeader,
        CANVAS_W,
        canvasH,
      );
      const displayCanvas = document.createElement("canvas");
      displayCanvas.width = CANVAS_W;
      displayCanvas.height = canvasH;
      const displayCtx = displayCanvas.getContext("2d")!;

      const texture = new THREE.CanvasTexture(displayCanvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(panelWorldWidth, panelH),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.userData.hologramPanelIndex = i;
      const material = mesh.material as THREE.MeshBasicMaterial;
      const forwardPush = droneToCamera.clone().multiplyScalar(3 * distScale);
      const drawOffset = new THREE.Vector3();
      if (this.isOrbitMode) {
        const xCenter = xAccum + panelWorldWidth / 2;
        xAccum += panelWorldWidth + panelGap;
        drawOffset.copy(forwardPush).addScaledVector(camRight, xCenter);
      } else {
        const yOff = yAccum - panelH / 2;
        yAccum -= panelH + panelGap;
        drawOffset.set(forwardPush.x, yOff, forwardPush.z);
      }

      mesh.position.copy(this.flyEndPos).add(drawOffset);
      this.panelGroup.add(mesh);
      this.panels.push({
        mesh,
        material,
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
        drawOffset,
        drawOriginWorld: mesh.position.clone(),
        dockScale: 0.28,
        expandedScale: 0.78,
      });
    }
  }

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
    y += 24;

    ctx.font = "22px Rajdhani, sans-serif";
    for (const line of lines) {
      const wrapped = this.wrapText(ctx, line, CANVAS_W - 2 * PADDING - 30);
      y += wrapped.length * 28 + 6;
    }

    y += PADDING;
    return Math.max(y, 80);
  }

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

    y += 8;
    ctx.fillStyle = ACCENT_COLOR;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(PADDING, y, w - 2 * PADDING, 2);
    ctx.globalAlpha = 1;
    y += 16;

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

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
  }

  private clearPanels(): void {
    for (const panel of this.panels) {
      panel.material.dispose();
      panel.mesh.geometry.dispose();
      panel.texture.dispose();
      this.panelGroup.remove(panel.mesh);
    }
    this.panels = [];
    this.activePanelIndex = null;
    this.panelsDocked = false;
    this.dockingPanels = false;
  }

  dispose(): void {
    this.clearPanels();
    this.ensureLaserRigCount(0);
    this.scene.remove(this.rootGroup);
    this.scene.remove(this.panelGroup);
    this.droneGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      if ((obj as THREE.Mesh).material) {
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }

  isActive(): boolean {
    return this.active;
  }
}
