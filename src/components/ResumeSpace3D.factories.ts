import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

export const createLabel = (text: string, subtext?: string): CSS2DObject => {
  const div = document.createElement("div");
  div.className = "space-label";
  div.style.color = "rgba(255, 255, 255, 0.9)";
  div.style.fontFamily = "Cinzel, serif";
  div.style.textShadow = "0 0 10px #000";
  div.style.textAlign = "center";
  div.style.pointerEvents = "auto";
  div.style.cursor = "pointer";

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
  title.style.fontSize = "16px";
  title.style.fontWeight = "bold";
  div.appendChild(title);

  if (subtext) {
    const sub = document.createElement("div");
    sub.textContent = subtext;
    sub.style.fontSize = "10px";
    sub.style.opacity = "0.8";
    div.appendChild(sub);
  }

  return new CSS2DObject(div);
};
