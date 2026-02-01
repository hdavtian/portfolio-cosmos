/**
 * Procedural texture generators for space effects
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";
import type { TextureOptions } from "../types";

/**
 * Create aurora halo texture - horizontally-elongated soft halo
 */
export function createAuroraHaloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw several layered elliptical gradients for a soft aurora band
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Draw into a scaled context to create an elliptical radial gradient
    for (let layer = 0; layer < 4; layer++) {
      const maxRadius = 160 - layer * 24;
      ctx.save();
      // scale X to stretch horizontally
      const scaleX = 1.6 - layer * 0.12;
      ctx.translate(cx, cy);
      ctx.scale(scaleX, 1);
      const grad = ctx.createRadialGradient(
        0,
        0,
        maxRadius * 0.12,
        0,
        0,
        maxRadius,
      );
      const alphaBase = 0.06 + layer * 0.02;
      grad.addColorStop(0, `rgba(180,230,255,${alphaBase * 0.15})`);
      grad.addColorStop(0.4, `rgba(140,200,255,${alphaBase * 0.9})`);
      grad.addColorStop(0.7, `rgba(80,160,255,${alphaBase * 0.4})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, maxRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Add a few soft wisps for texture
    for (let i = 0; i < 6; i++) {
      const y = cy + (i - 3) * 8 + Math.random() * 6;
      ctx.save();
      ctx.globalAlpha = 0.12 + Math.random() * 0.06;
      ctx.fillStyle = `rgba(180,230,255,0.5)`;
      ctx.fillRect(40, y - 6, canvas.width - 80, 12);
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.premultiplyAlpha = true;
  (tex as any).encoding = (THREE as any).sRGBEncoding;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Create ring halo texture - multiple soft concentric rings
 */
export function createRingHaloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Draw multiple soft rings with radial gradients
    for (let i = 0; i < 3; i++) {
      const inner = 48 + i * 12;
      const outer = 68 + i * 18;
      const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      const opacity = 0.45 - i * 0.12;
      grad.addColorStop(0, `rgba(120,180,255,${opacity})`);
      grad.addColorStop(0.5, `rgba(100,160,230,${opacity * 1.1})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.premultiplyAlpha = true;
  (tex as any).encoding = (THREE as any).sRGBEncoding;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Create core glow texture - warm center glow
 */
export function createCoreGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const cx = 32;
    const cy = 32;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 32);
    grad.addColorStop(0, "rgba(255,255,230,1)");
    grad.addColorStop(0.5, "rgba(255,200,150,0.7)");
    grad.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Create sun glow texture - procedural gradient for sun sprite
 */
export function createSunGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 200, 100, 1)");
    gradient.addColorStop(0.2, "rgba(255, 150, 50, 0.8)");
    gradient.addColorStop(0.5, "rgba(255, 100, 0, 0.2)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Create detail texture - canvas-based text overlay for planets/moons
 */
export function createDetailTexture(
  lines: string[],
  options?: TextureOptions,
): THREE.CanvasTexture {
  const width = options?.width || 1024;
  const height = options?.height || 512;
  const bgColor = options?.bgColor || "rgba(0,0,0,0)";
  const lineColor = options?.lineColor || "rgba(180,220,255,0.9)";
  const textColor = options?.textColor || "rgba(220,240,255,0.95)";
  const showLine = options?.showLine ?? true;
  const fontSize = options?.fontSize ?? 28;
  const lineSpacing = options?.lineSpacing ?? Math.round(fontSize * 1.4);
  const textAlign = options?.textAlign ?? ("left" as CanvasTextAlign);
  const padding = options?.padding ?? 64;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Transparent background (so texture can be blended onto sphere)
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Optionally draw a subtle horizontal guide line (centered)
  if (showLine) {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const y = height * 0.5;
    ctx.moveTo(40, y);
    ctx.lineTo(width - 40, y);
    ctx.stroke();
  }

  // Render text lines with a monospace/techy font
  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = textAlign;
  lines.forEach((line, i) => {
    const x = textAlign === "left" ? padding : width / 2;
    ctx.fillText(line, x, padding + i * lineSpacing);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
