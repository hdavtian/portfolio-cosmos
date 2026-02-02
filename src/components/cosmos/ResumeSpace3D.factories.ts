import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

type OrbitItem = {
  mesh: THREE.Mesh;
  orbitSpeed: number;
  angle: number;
  distance: number;
  parent?: THREE.Object3D;
  detached?: boolean;
  originalParent?: THREE.Object3D;
  overlayMeshes?: THREE.Mesh[];
  overlayOffsets?: number[];
  overlayHeights?: number[];
};

type OrbitAnchor = { anchor: THREE.Object3D; parent: THREE.Object3D };

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

export const createDetailTexture = (
  lines: string[],
  options?: {
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
  },
): THREE.CanvasTexture => {
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
};

export const createAuroraHaloTexture = (): THREE.CanvasTexture => {
  // Create a horizontally-elongated soft halo using an elliptical radial gradient
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw several layered elliptical gradients for a soft aurora band
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // We'll draw into a scaled context to create an elliptical radial gradient
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
};

export const createRingHaloTexture = (): THREE.CanvasTexture => {
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
};

export const createSunGlowTexture = (): THREE.CanvasTexture => {
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
  return new THREE.CanvasTexture(canvas);
};

export const createStarField = (starsCount = 15000): THREE.Points => {
  const starsGeometry = new THREE.BufferGeometry();
  const posArray = new Float32Array(starsCount * 3);

  for (let i = 0; i < starsCount * 3; i += 3) {
    // Create more evenly distributed stars in spherical coordinates
    const radius = 2000 + Math.random() * 4000; // Stars at varying depths
    const theta = Math.random() * Math.PI * 2; // Azimuth angle
    const phi = Math.acos(2 * Math.random() - 1); // Polar angle (ensures even distribution)

    posArray[i] = radius * Math.sin(phi) * Math.cos(theta); // x
    posArray[i + 1] = radius * Math.sin(phi) * Math.sin(theta); // y
    posArray[i + 2] = radius * Math.cos(phi); // z
  }

  starsGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(posArray, 3),
  );
  const starsMaterial = new THREE.PointsMaterial({
    size: 1.5,
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: false, // Keep consistent size regardless of camera distance
  });
  return new THREE.Points(starsGeometry, starsMaterial);
};

export const createStarfieldMeshes = (
  textureLoader: THREE.TextureLoader,
): { starfield: THREE.Mesh; skyfield: THREE.Mesh } => {
  // Background - Large distant starfield (skybox approach)
  // Create a much larger sphere to avoid visible sphere edge on zoom out
  const starTexture = textureLoader.load("/textures/8k_stars.jpg");
  const starGeo = new THREE.SphereGeometry(8000, 64, 64); // Much larger sphere
  const starMat = new THREE.MeshBasicMaterial({
    map: starTexture,
    side: THREE.BackSide,
    toneMapped: false,
    color: new THREE.Color(1.2, 1.2, 1.2), // Brightened to 120%
  });
  const starfield = new THREE.Mesh(starGeo, starMat);

  // Inner layer: Secondary star layer for depth
  const skyTexture = textureLoader.load("/textures/stars.jpg");
  const skyGeo = new THREE.SphereGeometry(7800, 64, 64); // Much larger sphere
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
    toneMapped: false,
    transparent: true,
    opacity: 0.3,
    color: new THREE.Color(0.8, 0.9, 1.0), // Blue tint
  });
  const skyfield = new THREE.Mesh(skyGeo, skyMat);

  return { starfield, skyfield };
};

export const createSunMesh = (
  textureLoader: THREE.TextureLoader,
): { sunMesh: THREE.Mesh; sunMaterial: THREE.MeshBasicMaterial } => {
  // Sun mesh (visual center object)
  const sunGeometry = new THREE.SphereGeometry(60, 32, 32);
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  });
  const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  sunMesh.position.set(0, 0, 0);

  // Try to apply a sun texture to preserve detail
  try {
    textureLoader.load("/textures/sun.jpg", (tex) => {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      sunMaterial.map = tex;
      sunMaterial.needsUpdate = true;
    });
  } catch {}

  return { sunMesh, sunMaterial };
};

export const createLighting = (options: { spaceSunIntensity?: number }) => {
  // Match original site: very dim ambient + strong point light with decay + fill light
  const ambientLight = new THREE.AmbientLight(
    new THREE.Color(0.13, 0.13, 0.13),
    0.5,
  );

  const sunLight = new THREE.PointLight(
    new THREE.Color(1.0, 1.0, 1.0),
    (options.spaceSunIntensity || 2.5) * 4, // Multiply by 4 to match original's 10.0 default
    1000, // Distance
    0.5, // Decay for physical light falloff
  );
  sunLight.position.set(0, 0, 0);
  sunLight.castShadow = false;

  // Fill light for ambient illumination (matches original)
  const fillLight = new THREE.PointLight(
    new THREE.Color(0.2, 0.4, 1.0),
    2.0,
    100,
    1,
  );
  fillLight.position.set(50, 50, -100);

  return { ambientLight, sunLight, fillLight };
};

export const createCoreHaloTexture = (): THREE.CanvasTexture => {
  const coreCanvas = document.createElement("canvas");
  coreCanvas.width = 64;
  coreCanvas.height = 64;
  const coreCtx = coreCanvas.getContext("2d");
  if (coreCtx) {
    const cx = 32;
    const cy = 32;
    const grad = coreCtx.createRadialGradient(cx, cy, 0, cx, cy, 32);
    grad.addColorStop(0, "rgba(255,255,230,1)");
    grad.addColorStop(0.5, "rgba(255,200,150,0.7)");
    grad.addColorStop(1, "rgba(255,0,0,0)");
    coreCtx.fillStyle = grad;
    coreCtx.fillRect(0, 0, 64, 64);
  }
  const coreTexture = new THREE.CanvasTexture(coreCanvas);
  coreTexture.minFilter = THREE.LinearFilter;
  coreTexture.magFilter = THREE.LinearFilter;
  return coreTexture;
};

export const createOrbitRing = (params: {
  name: string;
  parent: THREE.Object3D;
  isMainOrbit: boolean;
  orbitContainer: THREE.Object3D;
  ellipsePath: THREE.Curve<THREE.Vector3>;
  tubeRadius: number;
  systemId?: string;
}): THREE.Mesh => {
  const {
    name,
    parent,
    isMainOrbit,
    orbitContainer,
    ellipsePath,
    tubeRadius,
    systemId,
  } = params;

  const ringGeometry = new THREE.TubeGeometry(
    ellipsePath,
    256,
    tubeRadius,
    12,
    true,
  );

  // Distinct orbit colors: main planets around the sun vs. moons around planets
  let ringColorHex: number = 0x444466;
  if (isMainOrbit) {
    switch ((name || "").toLowerCase()) {
      case "experience":
        ringColorHex = 0xe8c547; // gold
        break;
      case "skills":
        ringColorHex = 0x33a8ff; // cyan
        break;
      case "projects":
        ringColorHex = 0x9933ff; // purple
        break;
      default:
        ringColorHex = 0x666a80; // neutral
    }
  } else {
    const parentName = (
      (parent as any)?.userData?.planetName || ""
    ).toLowerCase();
    if (parentName.includes("experience")) {
      ringColorHex = 0xff9966; // warm for moons of Experience
    } else if (parentName.includes("skills")) {
      ringColorHex = 0x66ccff; // cool for moons of Skills
    } else if (parentName.includes("projects")) {
      ringColorHex = 0xcc99ff; // pastel for moons of Projects
    } else {
      ringColorHex = 0x556070;
    }
  }

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: ringColorHex,
    transparent: true,
    // Further mute brightness so orbits don't dominate the scene
    opacity: isMainOrbit ? 0.08 : 0.05,
    side: THREE.DoubleSide,
  });
  const orbit = new THREE.Mesh(ringGeometry, ringMaterial);
  orbit.userData.isOrbitLine = true; // Mark for visibility control
  if (systemId) {
    orbit.userData.orbitSystemId = systemId;
  }
  orbitContainer.add(orbit);

  return orbit;
};

export const createPlanetFactory = (deps: {
  scene: THREE.Scene;
  textureLoader: THREE.TextureLoader;
  items: OrbitItem[];
  orbitAnchors: OrbitAnchor[];
  clickablePlanets: THREE.Object3D[];
  auroraTexture: THREE.Texture;
  ringTexture: THREE.Texture;
  coreTexture: THREE.Texture;
}) => {
  const {
    scene,
    textureLoader,
    items,
    orbitAnchors,
    clickablePlanets,
    auroraTexture,
    ringTexture,
    coreTexture,
  } = deps;

  return (
    name: string,
    distance: number,
    size: number,
    color: number,
    parent: THREE.Object3D,
    orbitSpeed = 0.1,
    sectionIndex?: number,
    textureUrl?: string,
  ): THREE.Mesh => {
    // Orbit Path - Render as smooth ellipses instead of segmented torus rings
    // Make rings thinner: main orbits slightly thicker than moon orbits
    const isMainOrbit = parent === scene; // scene-centered orbits (around Sun)
    let orbitContainer: THREE.Object3D = parent;
    if (!isMainOrbit && (parent as any)?.userData) {
      const parentData = (parent as any).userData as Record<string, any>;
      if (!parentData.orbitAnchor) {
        const anchor = new THREE.Group();
        anchor.name = `${parentData.planetName || "planet"}-orbit-anchor`;
        parent.add(anchor);
        parentData.orbitAnchor = anchor;
        orbitAnchors.push({ anchor, parent });
      }
      orbitContainer = parentData.orbitAnchor as THREE.Object3D;
    }
    const tubeRadius = isMainOrbit ? 0.12 : 0.08;
    const systemId = isMainOrbit
      ? name.toLowerCase()
      : (
          (parent as any)?.userData?.systemId ||
          (parent as any)?.userData?.planetName ||
          ""
        )
          .toString()
          .toLowerCase();
    const orbitEllipseRatio = isMainOrbit ? 0.85 : 0.9; // Z radius ratio for oval shape
    const ellipseCurve = new THREE.EllipseCurve(
      0,
      0,
      distance,
      distance * orbitEllipseRatio,
      0,
      Math.PI * 2,
      false,
      0,
    );
    const ellipsePoints = ellipseCurve.getPoints(256);
    const ellipsePath = new THREE.CatmullRomCurve3(
      ellipsePoints.map((p) => new THREE.Vector3(p.x, 0, p.y)),
      true,
      "centripetal",
    );
    createOrbitRing({
      name,
      parent,
      isMainOrbit,
      orbitContainer,
      ellipsePath,
      tubeRadius,
      systemId,
    });

    // Planet Mesh - Use MeshStandardMaterial for physically-based rendering (matches original)
    const planetGeometry = new THREE.SphereGeometry(size, 32, 32);
    const planetMaterial = new THREE.MeshStandardMaterial({
      color: textureUrl ? 0xffffff : color,
      map: textureUrl ? textureLoader.load(textureUrl) : null,
      emissive: new THREE.Color(0.0, 0.0, 0.0), // Will change on hover
      metalness: 0.05,
      roughness: 1.0,
    });
    const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
    // Store original color for hover effect
    planetMesh.userData.originalEmissive = new THREE.Color(0x000000);
    planetMesh.userData.hoverStartTime = 0; // Track when hover started for flash effect
    planetMesh.userData.lastFlashAt = 0; // last time a flash occurred (ms)
    planetMesh.userData.flashActive = false; // whether flash is currently animating
    planetMesh.userData.flashStrength = 0.6; // multiplier for flash intensity
    // Track hover counts to limit super-flashes: do a super flash every 4 or 5 distinct hovers
    planetMesh.userData.hoverCount = 0;
    planetMesh.userData.superEvery = Math.random() < 0.5 ? 4 : 5;
    planetMesh.userData.lastSuperFlashAt = 0;
    planetMesh.userData.isPointerOver = false; // track enter/leave transitions
    // Disable shadows for GPU compatibility
    planetMesh.castShadow = false;
    planetMesh.receiveShadow = false;

    // Add multi-layer halo effect for hover (only for clickable planets)
    if (sectionIndex !== undefined) {
      // Generate random properties for this planet's halo (within 50% variance)
      const sizeVariance = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
      const speedVariance = 0.75 + Math.random() * 0.5; // 0.75 to 1.25

      // Generate random halo color - vibrant colors in cool/warm spectrum
      const hue = Math.random(); // 0 to 1
      let haloColor: THREE.Color;
      if (hue < 0.33) {
        // Cool blues/cyans
        haloColor = new THREE.Color().setHSL(
          0.5 + Math.random() * 0.15,
          0.7 + Math.random() * 0.3,
          0.6,
        );
      } else if (hue < 0.66) {
        // Purples/magentas
        haloColor = new THREE.Color().setHSL(
          0.75 + Math.random() * 0.15,
          0.6 + Math.random() * 0.3,
          0.55,
        );
      } else {
        // Warm oranges/yellows/greens
        haloColor = new THREE.Color().setHSL(
          0.15 + Math.random() * 0.25,
          0.7 + Math.random() * 0.3,
          0.55,
        );
      }

      // Store random properties
      planetMesh.userData.haloSizeVariance = sizeVariance;
      planetMesh.userData.haloSpeedVariance = speedVariance;
      planetMesh.userData.haloColor = haloColor;

      // Create sprite-based halo layers (aurora, ring, core)
      const auroraMaterial = new THREE.SpriteMaterial({
        map: auroraTexture,
        color: haloColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const auroraSprite = new THREE.Sprite(auroraMaterial);
      auroraSprite.scale.set(
        size * 4 * sizeVariance,
        size * 4 * sizeVariance,
        1,
      );
      auroraSprite.position.set(0, 0, 0);
      planetMesh.add(auroraSprite);

      const ringMaterial = new THREE.SpriteMaterial({
        map: ringTexture,
        color: haloColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ringSprite = new THREE.Sprite(ringMaterial);
      ringSprite.scale.set(
        size * 2.6 * sizeVariance,
        size * 2.6 * sizeVariance,
        1,
      );
      ringSprite.position.set(0, 0, 0);
      planetMesh.add(ringSprite);

      const coreMaterial = new THREE.SpriteMaterial({
        map: coreTexture,
        color: new THREE.Color(1, 0.95, 0.85),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const coreSprite = new THREE.Sprite(coreMaterial);
      coreSprite.scale.set(size * 1.2, size * 1.2, 1);
      coreSprite.position.set(0, 0, 0);
      planetMesh.add(coreSprite);

      planetMesh.userData.auroraSprite = auroraSprite;
      planetMesh.userData.ringSprite = ringSprite;
      planetMesh.userData.coreSprite = coreSprite;
      planetMesh.userData.auroraTargetOpacity = 0;
      planetMesh.userData.ringTargetOpacity = 0;
      planetMesh.userData.coreTargetOpacity = 0;
      planetMesh.userData.hasHaloLayers = true;
    }

    // Start position
    const startAngle = Math.random() * Math.PI * 2;
    planetMesh.position.x = Math.cos(startAngle) * distance;
    planetMesh.position.z = Math.sin(startAngle) * distance;

    orbitContainer.add(planetMesh);

    // Add to animation lists
    items.push({
      mesh: planetMesh,
      orbitSpeed,
      angle: startAngle,
      distance,
      parent: orbitContainer,
    });

    // Label
    const label = createLabel(name);
    label.position.set(0, size + 10, 0);
    planetMesh.add(label);

    // Interaction data - merge with existing userData to preserve haloSprite
    planetMesh.userData = {
      ...planetMesh.userData,
      isPlanet: true,
      sectionIndex,
      planetName: name,
      isMoon: parent !== scene,
      isMainPlanet: parent === scene,
      systemId,
      orbitEllipseRatio,
      orbitUsesAnchor: orbitContainer !== parent,
    };

    // Add to clickable array if it has a section
    if (sectionIndex !== undefined) {
      clickablePlanets.push(planetMesh);
      console.log(
        `✅ Added clickable planet: "${name}" (sectionIndex: ${sectionIndex})`,
        {
          hasHaloLayers: !!planetMesh.userData.hasHaloLayers,
          haloColor: planetMesh.userData.haloColor,
          haloSize: planetMesh.userData.haloSizeVariance,
          haloSpeed: planetMesh.userData.haloSpeedVariance,
          position: planetMesh.position,
          size: size,
        },
      );
    } else {
      console.log(`ℹ️ Created non-clickable planet: "${name}"`);
    }

    return planetMesh;
  };
};

export const attachMultiNoteOverlaysFactory = (deps: {
  scene: THREE.Scene;
  overlayClickables: THREE.Object3D[];
  createDetailTexture: typeof createDetailTexture;
  vlog: (message: string) => void;
}) => {
  const { scene, overlayClickables, createDetailTexture, vlog } = deps;

  return (
    planetMesh: THREE.Mesh,
    overlayDefs: Array<
      string | { type?: string; text?: string; lines?: string[] }
    >,
    options?: { radiusOffset?: number; opacity?: number },
  ): THREE.Mesh[] => {
    // Remove existing overlays if present
    const existing = planetMesh.userData.detailOverlays as
      | THREE.Mesh[]
      | undefined;
    if (existing && existing.length) {
      existing.forEach((o) => {
        if (o.parent) o.parent.remove(o);
        const idx = overlayClickables.indexOf(o);
        if (idx >= 0) overlayClickables.splice(idx, 1);
        try {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (o.material as THREE.Material).dispose();
        } catch (e) {
          // ignore
        }
      });
    }

    const size =
      ((planetMesh.geometry as THREE.SphereGeometry).parameters
        .radius as number) || 5;
    const centerWorld = new THREE.Vector3();
    planetMesh.getWorldPosition(centerWorld);

    const overlays: THREE.Mesh[] = [];
    overlayDefs.forEach((note, idx) => {
      // normalize def to object form
      const def =
        typeof note === "string" ? { type: "general", text: note } : note;
      // Title overlay: placed above planet and does not rotate with planet
      if (def.type === "title" || def.lines) {
        const lines = def.lines || [planetMesh.userData.planetName || ""];
        const titleTex = createDetailTexture(lines, {
          width: 1024,
          height: 256,
          // Transparent backdrop; restore guide line under title for clarity
          textColor: "rgba(230,235,245,0.86)",
          showLine: true,
          fontSize: 26,
          lineSpacing: 28,
          textAlign: "left",
          padding: 48,
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
          // Tone down brightness slightly to reduce bloom/glow
          opacity: options?.opacity ?? 0.88,
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
        meshT.userData.isOverlay = true; // Mark as overlay so raycaster ignores it
        meshT.raycast = () => {}; // Disable raycasting for this overlay - clicks pass through
        meshT.renderOrder = 0; // Use default render order to respect depth
        scene.add(meshT);
        overlays.push(meshT);
        // store as planet title overlay reference
        planetMesh.userData.titleOverlay = meshT;
        return; // continue to next def
      }

      // Small texture for general note (bullet-style)
      const bulletText = `- ${def.text || ""}`;
      const textTex = createDetailTexture([bulletText], {
        width: 512,
        height: 128,
        bgColor: "rgba(0,0,0,0)",
        showLine: false,
        // Softer cyan to avoid overbright glow
        textColor: "rgba(180,220,240,0.82)",
        fontSize: 20,
        lineSpacing: 26,
        textAlign: "left",
        padding: 48,
      });

      const aspect = (textTex.image as any)?.width
        ? (textTex.image as any).width / (textTex.image as any).height
        : 4;
      const planeH = size * 0.4; // small panel height
      const planeW = planeH * aspect;
      const geo = new THREE.PlaneGeometry(planeW, planeH);
      const mat = new THREE.MeshBasicMaterial({
        map: textTex,
        transparent: true,
        opacity: options?.opacity ?? 0.9,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);

      // For general overlays: create bullet panels that will slide out under the title
      const elev = 0.02 * size; // small lift above surface while hidden
      const radialOffset = options?.radiusOffset ?? 0.02 * size;

      // mark as bullet overlay and track stacking index
      mesh.userData.isBulletOverlay = true;
      mesh.userData.bulletIndex = overlays.filter(
        (o) => !(o.userData && o.userData.isTitleOverlay),
      ).length;
      mesh.userData.radiusOffset = radialOffset;
      mesh.userData.elev = elev;
      mesh.userData.planeHeight = planeH;
      mesh.userData.planeWidth = planeW;
      mesh.userData.slideDir = Math.random() < 0.5 ? -1 : 1;
      mesh.userData.slideProgress = 0; // 0 = hidden at moon, 1 = slid out under title

      // start at planet center (hidden) and slide out toward title position when active
      mesh.position.set(centerWorld.x, centerWorld.y + elev, centerWorld.z);

      // keep overlays horizontal and readable (no tilt)
      mesh.rotation.x = 0;
      mesh.rotation.z = 0;

      mesh.userData.isDetailOverlay = true;
      mesh.userData.isOverlay = true; // Mark as overlay so raycaster ignores it
      mesh.raycast = () => {}; // Disable raycasting for this overlay - clicks pass through
      mesh.renderOrder = 0; // Use default render order to respect depth

      scene.add(mesh);
      overlays.push(mesh);
      // Debug: log initial overlay parameters for InvestCloud
      try {
        const pname = planetMesh.userData?.planetName as string | undefined;
        if (pname && pname.toLowerCase().includes("investcloud")) {
          try {
            const pos = mesh.position.clone().toArray();
            vlog(
              `INVESTCLOUD_OVERLAY_INIT ${idx} ${JSON.stringify({
                theta: mesh.userData.theta,
                angularSpeed: mesh.userData.angularSpeed,
                inclination: mesh.userData.inclination,
                radiusOffset: mesh.userData.radiusOffset,
                elev: mesh.userData.elev,
                position: pos,
              })}`,
            );
          } catch (e) {
            vlog(`INVESTCLOUD_OVERLAY_INIT ${idx} (log error)`);
          }
        }
      } catch (e) {
        // ignore
      }
    });

    planetMesh.userData.detailOverlays = overlays;
    return overlays;
  };
};
