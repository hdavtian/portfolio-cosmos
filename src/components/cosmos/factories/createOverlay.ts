/**
 * createOverlay - Factory for creating text overlay planes
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

export interface OverlayTextureOptions {
  width?: number;
  height?: number;
  bgColor?: string;
  lineColor?: string;
  textColor?: string;
  showLine?: boolean;
  fontSize?: number;
  lineSpacing?: number;
  textAlign?: CanvasTextAlign;
  padding?: number;
}

/**
 * Create a canvas texture with text lines for overlay display
 */
export function createDetailTexture(
  lines: string[],
  options: OverlayTextureOptions = {},
): THREE.CanvasTexture {
  const {
    width = 512,
    height = 256,
    bgColor = "rgba(0,0,0,0)",
    lineColor = "rgba(100,150,255,0.4)",
    textColor = "rgba(230,235,245,0.86)",
    showLine = false,
    fontSize = 20,
    lineSpacing = 24,
    textAlign = "left",
    padding = 24,
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Optional guide line
  if (showLine) {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding + fontSize);
    ctx.lineTo(width - padding, padding + fontSize);
    ctx.stroke();
  }

  // Text
  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px "Cinzel", serif`;
  ctx.textAlign = textAlign;
  ctx.textBaseline = "top";

  const startX = textAlign === "center" ? width / 2 : padding;
  let y = padding;

  lines.forEach((line) => {
    ctx.fillText(line, startX, y);
    y += lineSpacing;
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

/**
 * Create a title overlay plane above a planet
 */
export interface TitleOverlayConfig {
  planetMesh: THREE.Mesh;
  lines: string[];
  scene: THREE.Scene;
  opacity?: number;
  textureOptions?: OverlayTextureOptions;
}

export function createTitleOverlay(config: TitleOverlayConfig): THREE.Mesh {
  const { planetMesh, lines, scene, opacity = 0.88, textureOptions } = config;

  const size =
    ((planetMesh.geometry as THREE.SphereGeometry).parameters
      .radius as number) || 5;

  const titleTex = createDetailTexture(lines, {
    width: 1024,
    height: 256,
    textColor: "rgba(230,235,245,0.86)",
    showLine: true,
    fontSize: 26,
    lineSpacing: 28,
    textAlign: "left",
    padding: 48,
    ...textureOptions,
  });

  const aspectT = (titleTex.image as any)?.width
    ? (titleTex.image as any).width / (titleTex.image as any).height
    : 4;
  const planeHT = size * 1.2;
  const planeWT = planeHT * aspectT;

  const geoT = new THREE.PlaneGeometry(planeWT, planeHT);
  const matT = new THREE.MeshBasicMaterial({
    map: titleTex,
    transparent: true,
    opacity,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  const meshT = new THREE.Mesh(geoT, matT);
  const worldPosT = new THREE.Vector3();
  planetMesh.getWorldPosition(worldPosT);

  meshT.position.set(
    worldPosT.x,
    worldPosT.y + size + size * 0.03,
    worldPosT.z,
  );

  meshT.userData.isTitleOverlay = true;
  meshT.userData.planeWidth = planeWT;
  meshT.userData.planeHeight = planeHT;
  meshT.userData.isDetailOverlay = true;
  meshT.userData.isOverlay = true;
  meshT.raycast = () => {}; // Disable raycasting
  meshT.renderOrder = 0;

  scene.add(meshT);

  return meshT;
}

/**
 * Create a bullet-style note overlay near a planet
 */
export interface BulletOverlayConfig {
  planetMesh: THREE.Mesh;
  text: string;
  index: number;
  totalCount: number;
  scene: THREE.Scene;
  radiusOffset?: number;
  opacity?: number;
  clickable?: boolean;
}

export function createBulletOverlay(config: BulletOverlayConfig): THREE.Mesh {
  const {
    planetMesh,
    text,
    index,
    totalCount,
    scene,
    radiusOffset = 1.5,
    opacity = 0.75,
    clickable = true,
  } = config;

  const size =
    ((planetMesh.geometry as THREE.SphereGeometry).parameters
      .radius as number) || 5;

  const bulletText = `- ${text}`;
  const textTex = createDetailTexture([bulletText], {
    width: 512,
    height: 128,
    bgColor: "rgba(0,0,0,0)",
    showLine: false,
    fontSize: 16,
    textAlign: "left",
    padding: 16,
  });

  const aspect = (textTex.image as any)?.width
    ? (textTex.image as any).width / (textTex.image as any).height
    : 4;
  const planeH = size * 0.6;
  const planeW = planeH * aspect;

  const geo = new THREE.PlaneGeometry(planeW, planeH);
  const mat = new THREE.MeshBasicMaterial({
    map: textTex,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);

  // Position around the planet
  const angleStep = (Math.PI * 2) / totalCount;
  const angle = index * angleStep;
  const radiusH = size * radiusOffset;

  const worldPos = new THREE.Vector3();
  planetMesh.getWorldPosition(worldPos);

  mesh.position.set(
    worldPos.x + Math.cos(angle) * radiusH,
    worldPos.y,
    worldPos.z + Math.sin(angle) * radiusH,
  );

  mesh.userData.isBulletOverlay = true;
  mesh.userData.planeWidth = planeW;
  mesh.userData.planeHeight = planeH;
  mesh.userData.isDetailOverlay = true;

  if (!clickable) {
    mesh.userData.isOverlay = true;
    mesh.raycast = () => {};
  }

  mesh.renderOrder = 1;

  scene.add(mesh);

  return mesh;
}
