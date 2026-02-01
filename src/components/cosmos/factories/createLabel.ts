/**
 * createLabel - Factory for creating CSS2D labels for celestial bodies
 * Extracted from ResumeSpace3D.tsx
 */

import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

export interface LabelConfig {
  text: string;
  subtext?: string;
  fontSize?: number;
  subtextFontSize?: number;
  color?: string;
  fontFamily?: string;
  textShadow?: string;
  opacity?: number;
}

/**
 * Create a CSS2D label for a celestial body
 */
export function createLabel(config: LabelConfig): CSS2DObject {
  const {
    text,
    subtext,
    fontSize = 16,
    subtextFontSize = 10,
    color = "rgba(255, 255, 255, 0.9)",
    fontFamily = "Cinzel, serif",
    textShadow = "0 0 10px #000",
    opacity = 1.0,
  } = config;

  const div = document.createElement("div");
  div.className = "space-label";
  div.style.color = color;
  div.style.fontFamily = fontFamily;
  div.style.textShadow = textShadow;
  div.style.textAlign = "center";
  div.style.pointerEvents = "auto";
  div.style.cursor = "pointer";
  div.style.opacity = opacity.toString();

  // Prevent wheel events on labels from triggering browser zoom
  div.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    { passive: false },
  );

  const title = document.createElement("div");
  title.textContent = text;
  title.style.fontSize = `${fontSize}px`;
  title.style.fontWeight = "bold";
  div.appendChild(title);

  if (subtext) {
    const sub = document.createElement("div");
    sub.textContent = subtext;
    sub.style.fontSize = `${subtextFontSize}px`;
    sub.style.opacity = "0.8";
    div.appendChild(sub);
  }

  return new CSS2DObject(div);
}
