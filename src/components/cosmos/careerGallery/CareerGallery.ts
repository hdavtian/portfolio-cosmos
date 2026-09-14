import * as THREE from "three";

/**
 * Career Gallery: a 320-face icosahedral hologram shell whose faces show the
 * career's portfolio screenshots. Each face periodically glitches and
 * cross-fades to another screenshot (never one already showing), or to a
 * randomly colored blank, so the shell keeps changing like a screensaver.
 * Viewed from its center once the visitor enters.
 *
 * Hovering a face highlights its edges; clicking it dims the rest of the
 * shell and reveals the full, uncropped screenshot bleeding out of the tile.
 *
 * Images are decoded and downscaled off the main thread (createImageBitmap)
 * and only a few load at a time, so filling the shell never stalls a frame.
 */

export type CareerGalleryItem = {
  url: string;
  title: string;
  subtitle: string;
  year: number | null;
};

export type CareerGalleryFocusInfo = CareerGalleryItem & { faceIndex: number };

export type CareerGalleryOptions = {
  items: CareerGalleryItem[];
  radius?: number;
};

type LoadedImage = {
  texture: THREE.Texture;
  bitmap: ImageBitmap;
  aspect: number;
  users: number;
};

type FaceState = {
  index: number;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  localCentroid: THREE.Vector3;
  currentUrl: string | null;
  nextUrl: string | null;
  transitionT: number;
  transitioning: boolean;
  /** Seconds until this face becomes eligible for its next swap. */
  holdRemaining: number;
  hover: number;
  dim: number;
  focus: number;
};

// IcosahedronGeometry detail 2 → 320 triangular faces: from the center you
// see many more (smaller) tiles at once.
const DETAIL = 2;
/** Longest edge of a tile image (keeps tall full-page captures small). */
const TILE_IMAGE_MAX_EDGE = 512;
/** Longest edge of the full image revealed on click. */
const FOCUS_IMAGE_MAX_EDGE = 2048;
const MAX_CONCURRENT_LOADS = 3;
const TRANSITION_SECONDS = 1.6;
const MIN_HOLD_SECONDS = 4;
const MAX_HOLD_SECONDS = 11;
/** Chance a filled tile goes blank at its next swap (frees its screenshot). */
const BLANK_CHANCE = 0.12;
const MIN_BLANK_SECONDS = 3;
const MAX_BLANK_SECONDS = 9;
/** Marks a face transitioning to blank rather than to another image. */
const BLANK = "__blank__";
const TEXTURE_POOL_LIMIT = 90;
/** Beyond this camera distance the faces stop swapping images (saves work). */
const ACTIVE_CYCLE_DISTANCE = 4000;
const REVEAL_SECONDS = 0.9;

const HOLO_TINT = new THREE.Color(0.55, 0.9, 1.0);
const HOVER_EDGE = new THREE.Color(1.0, 0.82, 0.42);

// The renderer uses a logarithmic depth buffer; custom shaders must include
// the logdepthbuf chunks or their depth won't match the rest of the scene and
// the faces fail the depth test (invisible).
const faceVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 bary;
  varying vec2 vUv;
  varying vec3 vBary;
  varying float vViewDistance;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vBary = bary;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    vViewDistance = length(mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;

const faceFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uTexA;
  uniform sampler2D uTexB;
  uniform float uHasA;
  uniform float uHasB;
  uniform float uAspectA;
  uniform float uAspectB;
  uniform float uFaceAspect;
  uniform float uMix;
  uniform float uGlitch;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uHover;
  uniform float uDim;
  uniform float uFocus;
  uniform vec3 uTint;
  uniform vec3 uHoverEdge;
  uniform vec3 uBlankColor;
  // Inside-only depth cues (uInterior eases 0 -> 1 on entering).
  uniform float uInterior;
  uniform vec3 uCenter;
  uniform vec3 uLightDir;
  uniform vec3 uHazeColor;
  uniform float uHazeNear;
  uniform float uHazeFar;
  varying vec2 vUv;
  varying vec3 vBary;
  varying float vViewDistance;
  varying vec3 vWorldPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Cover-fit the image into the face's bounding box, anchored to the top of
  // the image (tall full-page screenshots keep their header visible).
  vec2 coverUv(vec2 uv, float imgAspect) {
    vec2 s = vec2(1.0);
    if (imgAspect > uFaceAspect) {
      s.x = uFaceAspect / imgAspect;
    } else {
      s.y = imgAspect / uFaceAspect;
    }
    // The face UV basis is built for viewing from the center (verified with
    // an orientation test pattern).
    float u = (uv.x - 0.5) * s.x + 0.5;
    // Textures are uploaded with flipY = false, so t = 0 is the image top.
    float t = (1.0 - uv.y) * s.y;
    return vec2(u, t);
  }

  vec3 sampleHolo(sampler2D tex, vec2 uv, float imgAspect, float shift) {
    vec2 c = coverUv(uv, imgAspect);
    float r = texture2D(tex, c + vec2(shift, 0.0)).r;
    float g = texture2D(tex, c).g;
    float b = texture2D(tex, c - vec2(shift, 0.0)).b;
    return vec3(r, g, b);
  }

  void main() {
    #include <logdepthbuf_fragment>
    float time = uTime + uSeed * 17.0;
    float calm = 1.0 - uFocus;
    float glitch = uGlitch * calm;

    // Horizontal slice jitter + chromatic split while glitching.
    float slice = floor(vUv.y * 38.0);
    float jitter = (hash(vec2(slice, floor(time * 24.0))) - 0.5) * 0.08 * glitch;
    vec2 uv = vec2(vUv.x + jitter, vUv.y);
    float shift = (0.0012 + 0.014 * glitch) * calm;

    vec3 a = sampleHolo(uTexA, uv, uAspectA, shift) * uHasA;
    vec3 b = sampleHolo(uTexB, uv, uAspectB, shift) * uHasB;
    float presence = mix(uHasA, uHasB, uMix);
    vec3 col = mix(a, b, uMix);
    // Blank tiles are a colored hologram panel with a soft vertical shimmer.
    float shimmer = 0.85 + 0.15 * sin(vUv.y * 90.0 - time * 1.6);
    col += uBlankColor * shimmer * (1.0 - presence);

    // Hologram treatment: subtle at rest (images stay readable), stronger
    // while a face is glitching, and off entirely for the focused tile.
    float scanDepth = (0.05 + 0.2 * glitch) * calm;
    float scan = (1.0 - scanDepth) + scanDepth * sin(vUv.y * 260.0 + time * 4.0);
    col = mix(col, col * uTint + uTint * 0.04, (0.16 + 0.3 * glitch) * calm) * scan;
    float flicker = 1.0 - (0.03 * hash(vec2(floor(time * 12.0), uSeed))) * calm;
    col *= flicker;

    // Static noise: faint on blank faces, stronger during transitions.
    float n = hash(vUv * vec2(420.0, 260.0) + floor(time * 30.0));
    float staticAmt = ((1.0 - presence) * 0.1 + glitch * 0.18) * calm;
    col += uTint * n * staticAmt;

    // Thin glowing triangle edges; gold and a bit thicker while hovered.
    float edge = min(vBary.x, min(vBary.y, vBary.z));
    float edgeWidth = 0.005 + 0.012 * uHover;
    float edgeGlow = 1.0 - smoothstep(0.0, edgeWidth, edge);
    vec3 edgeColor = mix(uTint, uHoverEdge, uHover);
    col += edgeColor * edgeGlow * (0.26 + 0.25 * glitch + 0.9 * uHover);

    // Inside the shell: a soft directional light across its curve (brighter on
    // one side, dimmer on the other) and atmospheric falloff, so farther tiles
    // sink into a faint haze. Both show the viewer they're inside a round space.
    vec3 outward = normalize(vWorldPosition - uCenter);
    float lit = 0.62 + 0.38 * smoothstep(-0.9, 0.9, dot(outward, uLightDir));
    float haze = smoothstep(uHazeNear, uHazeFar, vViewDistance) * 0.6;
    float focusKeep = 1.0 - uFocus;
    col = mix(col, col * lit, uInterior * focusKeep);
    col = mix(col, uHazeColor, haze * uInterior * focusKeep);

    // Everything except the focused tile fades back.
    col *= 1.0 - 0.72 * uDim;

    // Tiles are opaque, so bright things outside the shell (the sun, glowing
    // space) can't show through and wash out whites.
    float alpha = uOpacity * mix(0.82, 1.0, max(presence, edgeGlow));
    alpha *= 1.0 - 0.45 * uDim;
    // Cap brightness just under the bloom threshold so white pages stay
    // legible instead of flaring.
    gl_FragColor = vec4(min(col, vec3(0.84)), alpha);
  }
`;

const revealVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const revealFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uTex;
  uniform float uReveal;
  uniform float uTime;
  uniform float uPlaneAspect;
  uniform vec3 uTint;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    #include <logdepthbuf_fragment>
    // Radial reveal from the tile's center with a noisy hologram front, so
    // the full image appears to bleed out past the tile's edges.
    vec2 c = (vUv - 0.5) * vec2(uPlaneAspect, 1.0);
    float r = length(c) / (0.5 * length(vec2(uPlaneAspect, 1.0)));
    float n = hash(floor(vUv * vec2(80.0, 80.0)) + floor(uTime * 22.0));
    float front = uReveal * 1.3;
    float d = r + (n - 0.5) * 0.14;
    float mask = 1.0 - smoothstep(front - 0.1, front, d);
    float band = smoothstep(front - 0.16, front - 0.02, d) * mask;

    // Textures are uploaded with flipY = false, so t = 0 is the image top.
    vec3 img = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y)).rgb;
    float scan = 0.97 + 0.03 * sin(vUv.y * 900.0 + uTime * 5.0);
    // Keep bright (mostly white) screenshots under the scene's bloom
    // threshold so they stay legible instead of blowing out into glow.
    vec3 col = img * scan * 0.78 + uTint * band * 0.55;

    float border = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float borderGlow = 1.0 - smoothstep(0.0, 0.004, border);
    col += uTint * borderGlow * 0.45;

    gl_FragColor = vec4(min(col, vec3(0.8)), mask);
  }
`;

let placeholderTexture: THREE.DataTexture | null = null;
const getPlaceholderTexture = () => {
  if (!placeholderTexture) {
    placeholderTexture = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
    );
    placeholderTexture.needsUpdate = true;
  }
  return placeholderTexture;
};

const randomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);

/** A muted random hologram color for blank tiles (dim, so it never blooms). */
const randomBlankColor = (out: THREE.Color = new THREE.Color()) =>
  out.setHSL(Math.random(), randomBetween(0.45, 0.7), randomBetween(0.2, 0.32));

const shuffle = <T,>(items: T[]): T[] => {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Builds one face's geometry: its 3 vertices, barycentric coords for the edge
 * glow, and UVs projected onto the face plane (normalized to its bounding
 * box).
 */
const buildFaceGeometry = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
  const centroid = a.clone().add(b).add(c).divideScalar(3);
  const inward = centroid.clone().negate().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  let right = new THREE.Vector3().crossVectors(up, inward);
  if (right.lengthSq() < 1e-6) right = new THREE.Vector3(1, 0, 0);
  right.normalize();
  const faceUp = new THREE.Vector3().crossVectors(inward, right).normalize();

  const pts = [a, b, c].map((p) => {
    const d = p.clone().sub(centroid);
    return new THREE.Vector2(d.dot(right), d.dot(faceUp));
  });
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      pts.flatMap((p) => [(p.x - minX) / w, (p.y - minY) / h]),
      2,
    ),
  );
  geometry.setAttribute(
    "bary",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3),
  );
  geometry.computeBoundingSphere();
  return { geometry, faceAspect: w / h, centroid };
};

/**
 * Decode + downscale off the main thread, then wrap as a texture. The first
 * decode reads the size so the longest edge can be capped without distorting
 * tall full-page captures.
 */
const loadBitmapTexture = async (url: string, maxEdge: number) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const blob = await response.blob();
  const full = await createImageBitmap(blob, { imageOrientation: "none" });
  const scale = Math.min(1, maxEdge / Math.max(full.width, full.height));
  let bitmap = full;
  if (scale < 1) {
    bitmap = await createImageBitmap(full, {
      resizeWidth: Math.max(1, Math.round(full.width * scale)),
      resizeHeight: Math.max(1, Math.round(full.height * scale)),
      resizeQuality: "medium",
    });
    full.close();
  }
  const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, bitmap, aspect: bitmap.width / Math.max(1, bitmap.height) };
};

export class CareerGallery {
  readonly root: THREE.Group;
  readonly radius: number;

  private readonly shell: THREE.Group;
  private readonly edges: THREE.LineSegments;
  private readonly faces: FaceState[] = [];
  private readonly faceMeshes: THREE.Object3D[] = [];
  private readonly items = new Map<string, CareerGalleryItem>();
  private readonly imageUrls: string[];
  private bag: string[] = [];
  private readonly pool = new Map<string, LoadedImage>();
  private readonly failedUrls = new Set<string>();
  private inFlight = 0;
  private time = 0;
  private interior = false;
  private disposed = false;

  private hoveredIndex: number | null = null;
  private focusedIndex: number | null = null;
  private focusToken = 0;
  private readonly reveal: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private revealProgress = 0;
  private revealTarget = 0;
  private revealImage: { texture: THREE.Texture; bitmap: ImageBitmap; aspect: number } | null =
    null;
  private lastRevealIndex: number | null = null;
  private lastCamera: THREE.PerspectiveCamera | null = null;
  private revealLoadError: string | null = null;
  /** Outside view: the reveal folds back on its own after a short hold. */
  private flashActive = false;
  private flashHoldUntil: number | null = null;
  /** Dark dome just outside the shell that makes the inside feel enclosed. */
  private readonly interiorDome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private interiorLevel = 0;
  /** Faint dust drifting inside the shell: parallax gives the space depth. */
  private readonly interiorDust: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  private readonly tmpWorld = new THREE.Vector3();
  private readonly tmpVec = new THREE.Vector3();

  constructor({ items, radius = 396 }: CareerGalleryOptions) {
    this.radius = radius;
    for (const item of items) {
      if (item.url && !this.items.has(item.url)) this.items.set(item.url, item);
    }
    this.imageUrls = Array.from(this.items.keys());

    this.root = new THREE.Group();
    this.root.name = "CareerGallery";
    this.shell = new THREE.Group();
    this.root.add(this.shell);

    const ico = new THREE.IcosahedronGeometry(radius, DETAIL).toNonIndexed();
    const pos = ico.getAttribute("position");
    const baseMaterial = new THREE.ShaderMaterial({
      vertexShader: faceVertexShader,
      fragmentShader: faceFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        uTexA: { value: getPlaceholderTexture() },
        uTexB: { value: getPlaceholderTexture() },
        uHasA: { value: 0 },
        uHasB: { value: 0 },
        uAspectA: { value: 1 },
        uAspectB: { value: 1 },
        uFaceAspect: { value: 1 },
        uMix: { value: 0 },
        uGlitch: { value: 0 },
        uTime: { value: 0 },
        uSeed: { value: 0 },
        uOpacity: { value: 1 },
        uHover: { value: 0 },
        uDim: { value: 0 },
        uFocus: { value: 0 },
        uTint: { value: HOLO_TINT.clone() },
        uHoverEdge: { value: HOVER_EDGE.clone() },
        uBlankColor: { value: new THREE.Color() },
        uInterior: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        // Light from above and slightly to one side of the shell.
        uLightDir: { value: new THREE.Vector3(0.35, 0.85, 0.4).normalize() },
        uHazeColor: { value: new THREE.Color(0.03, 0.05, 0.1) },
        // From the drifting viewpoint tiles are ~0.7R to ~1.3R away.
        uHazeNear: { value: radius * 0.75 },
        uHazeFar: { value: radius * 1.45 },
      },
    });

    for (let i = 0; i < pos.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
      const { geometry, faceAspect, centroid } = buildFaceGeometry(a, b, c);
      // Clones share the compiled program (same shader source).
      const material = baseMaterial.clone();
      material.uniforms.uFaceAspect.value = faceAspect;
      material.uniforms.uSeed.value = Math.random();
      material.uniforms.uTint.value = HOLO_TINT.clone();
      material.uniforms.uHoverEdge.value = HOVER_EDGE.clone();
      material.uniforms.uBlankColor.value = randomBlankColor();
      const index = i / 3;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `CareerGalleryFace_${index}`;
      mesh.userData.careerGalleryFaceIndex = index;
      this.shell.add(mesh);
      this.faceMeshes.push(mesh);
      this.faces.push({
        index,
        mesh,
        localCentroid: centroid,
        currentUrl: null,
        nextUrl: null,
        transitionT: 0,
        transitioning: false,
        holdRemaining: randomBetween(0, 1.5),
        hover: 0,
        dim: 0,
        focus: 0,
      });
    }
    baseMaterial.dispose();

    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(radius * 1.002, DETAIL)),
      new THREE.LineBasicMaterial({
        color: 0x9fe4ff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.shell.add(this.edges);
    ico.dispose();

    this.reveal = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: revealVertexShader,
        fragmentShader: revealFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          uTex: { value: getPlaceholderTexture() },
          uReveal: { value: 0 },
          uTime: { value: 0 },
          uPlaneAspect: { value: 1 },
          uTint: { value: HOLO_TINT.clone() },
        },
      }),
    );
    this.reveal.name = "CareerGalleryReveal";
    this.reveal.renderOrder = 20;
    this.reveal.frustumCulled = false;
    // Stays in the scene (fully transparent) so its shader compiles during
    // the loader warmup rather than on the first click.
    this.root.add(this.reveal);

    // Inside, the universe behind the tiles is hidden by a dark dome with a
    // faint lat/long grid, so the shell reads as an enclosed, curved space
    // while the screenshots stay bright. Not part of the spinning shell.
    this.interiorDome = new THREE.Mesh(
      new THREE.SphereGeometry(radius * INTERIOR_DOME_RADII, 64, 40),
      new THREE.ShaderMaterial({
        vertexShader: interiorDomeVertexShader,
        fragmentShader: interiorDomeFragmentShader,
        transparent: true,
        // Writes depth so the starfield, sun and planets behind it are hidden
        // no matter what order they draw in; the tiles are closer and pass.
        depthWrite: true,
        side: THREE.BackSide,
        toneMapped: false,
        uniforms: { uLevel: { value: 0 } },
      }),
    );
    this.interiorDome.name = "CareerGalleryInteriorDome";
    this.interiorDome.renderOrder = -5;
    this.interiorDome.frustumCulled = false;
    this.interiorDome.visible = false;
    this.root.add(this.interiorDome);

    // Dust specks filling the inside of the shell. Near ones sweep past faster
    // than far ones as the viewer turns or moves, which reads as depth.
    const dustPositions = new Float32Array(INTERIOR_DUST_COUNT * 3);
    const dustSeeds = new Float32Array(INTERIOR_DUST_COUNT);
    const dustRadius = radius * INTERIOR_DUST_RADII;
    for (let i = 0; i < INTERIOR_DUST_COUNT; i++) {
      // Uniform in the sphere's volume.
      const r = dustRadius * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      dustPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      dustPositions[i * 3 + 1] = r * Math.cos(phi);
      dustPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      dustSeeds[i] = Math.random();
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute("aSeed", new THREE.BufferAttribute(dustSeeds, 1));
    const dustMaterial = new THREE.ShaderMaterial({
      vertexShader: interiorDustVertexShader,
      fragmentShader: interiorDustFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uLevel: { value: 0 },
        uDrift: { value: radius * 0.03 },
        uSize: { value: radius * 0.006 },
        uPointScale: { value: 1 },
      },
    });
    this.interiorDust = new THREE.Points(dustGeometry, dustMaterial);
    this.interiorDust.name = "CareerGalleryInteriorDust";
    this.interiorDust.renderOrder = -4;
    this.interiorDust.frustumCulled = false;
    this.interiorDust.visible = false;
    const drawSize = new THREE.Vector2();
    this.interiorDust.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(drawSize);
      dustMaterial.uniforms.uPointScale.value = drawSize.y * 0.5;
    };
    this.root.add(this.interiorDust);
  }

  /** Snapshot of loading/cycling state, for debugging. */
  getStats() {
    const camera = this.lastCamera;
    const revealWorld = this.reveal.getWorldPosition(new THREE.Vector3());
    let revealInFront: number | null = null;
    let revealDistance: number | null = null;
    if (camera) {
      const forward = camera.getWorldDirection(new THREE.Vector3());
      const toReveal = revealWorld.clone().sub(camera.position);
      revealDistance = Math.round(toReveal.length());
      revealInFront = Number(forward.dot(toReveal.normalize()).toFixed(2));
    }
    const urls = this.faces
      .map((face) => face.currentUrl)
      .filter((url): url is string => !!url);
    return {
      reveal: {
        target: this.revealTarget,
        progress: Number(this.revealProgress.toFixed(2)),
        hasImage: !!this.revealImage,
        loadError: this.revealLoadError,
        scale: [Math.round(this.reveal.scale.x), Math.round(this.reveal.scale.y)],
        distance: revealDistance,
        facingDot: revealInFront,
      },
      imageUrls: this.imageUrls.length,
      inFlight: this.inFlight,
      texturesReady: this.pool.size,
      failed: this.failedUrls.size,
      failedSample: Array.from(this.failedUrls).slice(0, 5),
      facesWithImage: urls.length,
      facesBlank: this.faces.length - urls.length,
      duplicateImages: urls.length - new Set(urls).size,
      facesTransitioning: this.faces.filter((face) => face.transitioning).length,
      hovered: this.hoveredIndex,
      focused: this.focusedIndex,
      interior: this.interior,
      time: Number(this.time.toFixed(1)),
    };
  }

  /** Setting interior mode tones the outer wireframe down for the inside view. */
  setInteriorMode(inside: boolean): void {
    this.interior = inside;
    (this.edges.material as THREE.LineBasicMaterial).opacity = inside ? 0.06 : 0.28;
    if (!inside) {
      this.setHovered(null);
      this.clearFocus();
    }
  }

  /** Index of the face under the ray, or null. */
  pickFace(raycaster: THREE.Raycaster): number | null {
    const hit = raycaster.intersectObjects(this.faceMeshes, false)[0];
    const index = hit?.object.userData.careerGalleryFaceIndex;
    return typeof index === "number" ? index : null;
  }

  setHovered(index: number | null): void {
    this.hoveredIndex = index;
  }

  getFocusedIndex(): number | null {
    return this.focusedIndex;
  }

  /** World-space center of a face (the shell rotates, so this changes). */
  getFaceWorldCentroid(index: number, out: THREE.Vector3): THREE.Vector3 {
    const face = this.faces[index];
    if (!face) return out.set(0, 0, 0);
    return face.mesh.localToWorld(out.copy(face.localCentroid));
  }

  /**
   * Focus a face: dim the rest, hold its current image, and reveal the full
   * screenshot. Returns the image's project info, or null if the face is
   * still blank.
   */
  focusFace(index: number): CareerGalleryFocusInfo | null {
    const face = this.faces[index];
    const url = face?.currentUrl;
    if (!face || !url) return null;

    this.focusedIndex = index;
    this.focusToken += 1;
    this.flashActive = false;
    this.flashHoldUntil = null;
    const token = this.focusToken;
    this.revealTarget = 0;
    this.revealProgress = 0;
    this.revealLoadError = null;
    this.releaseRevealImage();

    loadBitmapTexture(url, FOCUS_IMAGE_MAX_EDGE)
      .then((image) => {
        if (this.disposed || token !== this.focusToken) {
          image.texture.dispose();
          image.bitmap.close();
          return;
        }
        this.revealImage = image;
        const u = this.reveal.material.uniforms;
        u.uTex.value = image.texture;
        u.uPlaneAspect.value = image.aspect;
        this.revealTarget = 1;
      })
      .catch((error: unknown) => {
        // Keep the focused tile highlighted even if the full image fails.
        this.revealLoadError = error instanceof Error ? error.message : String(error);
      });

    const item = this.items.get(url);
    return {
      url,
      title: item?.title ?? "Untitled project",
      subtitle: item?.subtitle ?? "",
      year: item?.year ?? null,
      faceIndex: index,
    };
  }

  clearFocus(): void {
    if (this.focusedIndex === null) return;
    this.focusedIndex = null;
    this.focusToken += 1;
    this.revealTarget = 0;
    this.flashActive = false;
    this.flashHoldUntil = null;
  }

  /**
   * Outside view: fly the tile's screenshot out toward the viewer, hold it for
   * a few seconds, then fold it back on its own (no buttons).
   */
  flashFace(index: number): CareerGalleryFocusInfo | null {
    const info = this.focusFace(index);
    if (info) this.flashActive = true;
    return info;
  }

  /**
   * Debug: paint an orientation test pattern on every tile (through the same
   * flipY=false texture path as the screenshots) and stop cycling, so a
   * screenshot shows exactly how tile images are oriented.
   */
  applyOrientationTestPattern(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1b2a44";
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "#ff3355";
    ctx.fillRect(0, 0, 140, 140); // red square = image top-left corner
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 64px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TOP", 256, 90);
    ctx.textAlign = "left";
    ctx.fillText("LEFT →", 20, 290);
    const texture = new THREE.Texture(canvas);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this.imageUrls.length = 0;
    for (const face of this.faces) {
      const u = face.mesh.material.uniforms;
      u.uTexA.value = texture;
      u.uAspectA.value = 1;
      u.uHasA.value = 1;
      u.uHasB.value = 0;
      u.uMix.value = 0;
      u.uGlitch.value = 0;
      face.transitioning = false;
    }
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (this.disposed) return;
    this.lastCamera = camera;
    const step = Math.min(dt, 0.1);
    this.time += step;
    const focused = this.focusedIndex;

    // The dark interior dome fades in while inside, out on leaving.
    this.interiorLevel +=
      ((this.interior ? 1 : 0) - this.interiorLevel) * (1 - Math.exp(-2.5 * step));
    this.interiorDome.material.uniforms.uLevel.value = this.interiorLevel;
    this.interiorDome.visible = this.interiorLevel > 0.005;
    this.interiorDust.material.uniforms.uLevel.value = this.interiorLevel;
    this.interiorDust.material.uniforms.uTime.value = this.time;
    this.interiorDust.visible = this.interiorDome.visible;

    // Slow spin about the vertical axis only (tilting would gradually turn
    // the tiles sideways/upside down); hold still while a tile is focused.
    if (focused === null) {
      this.shell.rotation.y += step * (this.interior ? 0.012 : 0.02);
    }

    this.root.getWorldPosition(this.tmpWorld);
    const cycling =
      this.interior ||
      camera.position.distanceTo(this.tmpWorld) < this.radius + ACTIVE_CYCLE_DISTANCE;
    const ease = 1 - Math.exp(-10 * step);

    for (const face of this.faces) {
      const u = face.mesh.material.uniforms;
      u.uTime.value = this.time;

      face.hover += ((face.index === this.hoveredIndex ? 1 : 0) - face.hover) * ease;
      face.dim += ((focused !== null && face.index !== focused ? 1 : 0) - face.dim) * ease;
      face.focus += ((face.index === focused ? 1 : 0) - face.focus) * ease;
      u.uHover.value = face.hover;
      u.uDim.value = face.dim;
      u.uFocus.value = face.focus;
      u.uInterior.value = this.interiorLevel;
      (u.uCenter.value as THREE.Vector3).copy(this.tmpWorld);

      if (face.transitioning) {
        face.transitionT = Math.min(1, face.transitionT + step / TRANSITION_SECONDS);
        const t = face.transitionT;
        u.uMix.value = THREE.MathUtils.smoothstep(t, 0.25, 0.85);
        u.uGlitch.value = Math.pow(Math.sin(Math.PI * t), 0.6);
        if (t >= 1) this.finishTransition(face);
        continue;
      }

      // The focused tile keeps its image until focus clears.
      if (!cycling || face.index === focused || this.imageUrls.length === 0) continue;
      face.holdRemaining -= step;
      const due = face.holdRemaining <= 0;
      if (due && face.nextUrl === null && this.inFlight < MAX_CONCURRENT_LOADS) {
        this.requestNextImage(face);
      }
    }

    this.updateReveal(step, camera);
  }

  private updateReveal(step: number, camera: THREE.PerspectiveCamera): void {
    const u = this.reveal.material.uniforms;
    const dir = this.revealTarget > this.revealProgress ? 1 : -1;
    this.revealProgress = THREE.MathUtils.clamp(
      this.revealProgress + (dir * step) / REVEAL_SECONDS,
      0,
      1,
    );
    u.uReveal.value = THREE.MathUtils.smoothstep(this.revealProgress, 0, 1);
    u.uTime.value = this.time;
    if (this.revealProgress <= 0 && this.revealTarget === 0) {
      this.releaseRevealImage();
    }
    // Outside flash: hold the fully revealed image, then fold it back.
    if (this.flashActive && this.focusedIndex !== null && this.revealProgress >= 1) {
      if (this.flashHoldUntil === null) {
        this.flashHoldUntil = this.time + FLASH_HOLD_SECONDS;
      } else if (this.time >= this.flashHoldUntil) {
        this.clearFocus();
      }
    }

    const focused = this.focusedIndex;
    if (focused === null && this.revealProgress <= 0) return;
    const anchorIndex = focused ?? this.lastRevealIndex;
    if (anchorIndex === null) return;
    this.lastRevealIndex = anchorIndex;

    const centroid = this.getFaceWorldCentroid(anchorIndex, this.tmpVec);
    this.root.getWorldPosition(this.tmpWorld);
    const eased = u.uReveal.value as number;
    let worldPos: THREE.Vector3;
    if (this.interior) {
      // Float the full image just inside its tile, facing the viewer, sized
      // to fit comfortably in the view.
      const toTile = centroid.sub(this.tmpWorld);
      worldPos = this.tmpWorld.clone().addScaledVector(toTile, 0.9);
    } else {
      // Outside: the image flies out of its tile toward the viewer.
      worldPos = centroid.clone().lerp(camera.position, EXTERIOR_REVEAL_TRAVEL * eased);
    }
    this.reveal.position.copy(this.root.worldToLocal(worldPos.clone()));
    this.reveal.lookAt(camera.position);

    const distance = Math.max(1, camera.position.distanceTo(worldPos));
    const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const aspect = u.uPlaneAspect.value as number;
    // Outside it grows as it flies out; inside it's shown at full size.
    let height = viewHeight * (this.interior ? 0.72 : 0.22 + 0.5 * eased);
    let width = height * aspect;
    const maxWidth = viewHeight * camera.aspect * 0.62;
    if (width > maxWidth) {
      width = maxWidth;
      height = width / aspect;
    }
    this.reveal.scale.set(width, height, 1);
  }

  private releaseRevealImage(): void {
    if (!this.revealImage) return;
    this.reveal.material.uniforms.uTex.value = getPlaceholderTexture();
    this.revealImage.texture.dispose();
    this.revealImage.bitmap.close();
    this.revealImage = null;
  }

  /** Next screenshot that isn't already on (or heading to) another tile. */
  private nextFromBag(): string | null {
    const shown = new Set<string>();
    for (const face of this.faces) {
      if (face.currentUrl) shown.add(face.currentUrl);
      if (face.nextUrl && face.nextUrl !== BLANK) shown.add(face.nextUrl);
    }
    for (let guard = 0; guard < this.imageUrls.length * 2; guard += 1) {
      if (this.bag.length === 0) this.bag = shuffle(this.imageUrls);
      const url = this.bag.pop() ?? null;
      if (url && !this.failedUrls.has(url) && !shown.has(url)) return url;
    }
    return null;
  }

  private requestNextImage(face: FaceState): void {
    // Occasionally let a filled tile go blank, freeing its screenshot for
    // another tile. With more tiles than screenshots, blanks are what keep
    // the mosaic from repeating images.
    if (face.currentUrl !== null && Math.random() < BLANK_CHANCE) {
      this.beginBlankTransition(face);
      return;
    }
    const url = this.nextFromBag();
    if (!url) {
      if (face.currentUrl !== null) {
        this.beginBlankTransition(face);
      } else {
        face.holdRemaining = randomBetween(MIN_BLANK_SECONDS, MAX_BLANK_SECONDS);
      }
      return;
    }
    face.nextUrl = url;

    const ready = this.pool.get(url);
    if (ready) {
      ready.users += 1;
      this.beginTransition(face, url, ready);
      return;
    }

    this.inFlight += 1;
    loadBitmapTexture(url, TILE_IMAGE_MAX_EDGE)
      .then(({ texture, bitmap, aspect }) => {
        this.inFlight -= 1;
        if (this.disposed) {
          texture.dispose();
          bitmap.close();
          return;
        }
        const entry: LoadedImage = { texture, bitmap, aspect, users: 1 };
        this.pool.set(url, entry);
        this.beginTransition(face, url, entry);
      })
      .catch(() => {
        this.inFlight -= 1;
        this.failedUrls.add(url);
        face.nextUrl = null;
        face.holdRemaining = randomBetween(0.2, 1);
      });
  }

  private beginTransition(face: FaceState, url: string, image: LoadedImage): void {
    const u = face.mesh.material.uniforms;
    u.uTexB.value = image.texture;
    u.uAspectB.value = image.aspect;
    u.uHasB.value = 1;
    u.uMix.value = 0;
    face.nextUrl = url;
    face.transitionT = 0;
    face.transitioning = true;
  }

  private beginBlankTransition(face: FaceState): void {
    const u = face.mesh.material.uniforms;
    // Each time a tile goes blank it picks a fresh color.
    randomBlankColor(u.uBlankColor.value as THREE.Color);
    u.uTexB.value = getPlaceholderTexture();
    u.uHasB.value = 0;
    u.uMix.value = 0;
    face.nextUrl = BLANK;
    face.transitionT = 0;
    face.transitioning = true;
  }

  private finishTransition(face: FaceState): void {
    const u = face.mesh.material.uniforms;
    const previousUrl = face.currentUrl;
    const goingBlank = face.nextUrl === BLANK;
    u.uTexA.value = u.uTexB.value;
    u.uAspectA.value = u.uAspectB.value;
    u.uHasA.value = goingBlank ? 0 : 1;
    u.uTexB.value = getPlaceholderTexture();
    u.uHasB.value = 0;
    u.uMix.value = 0;
    u.uGlitch.value = 0;
    face.currentUrl = goingBlank ? null : face.nextUrl;
    face.nextUrl = null;
    face.transitioning = false;
    face.holdRemaining = goingBlank
      ? randomBetween(MIN_BLANK_SECONDS, MAX_BLANK_SECONDS)
      : randomBetween(MIN_HOLD_SECONDS, MAX_HOLD_SECONDS);
    if (previousUrl) this.releaseImage(previousUrl);
  }

  private releaseImage(url: string): void {
    const entry = this.pool.get(url);
    if (!entry) return;
    entry.users = Math.max(0, entry.users - 1);
    if (entry.users > 0 || this.pool.size <= TEXTURE_POOL_LIMIT) return;
    entry.texture.dispose();
    entry.bitmap.close();
    this.pool.delete(url);
  }

  dispose(): void {
    this.disposed = true;
    for (const face of this.faces) {
      face.mesh.geometry.dispose();
      face.mesh.material.dispose();
    }
    this.edges.geometry.dispose();
    (this.edges.material as THREE.Material).dispose();
    this.reveal.geometry.dispose();
    this.reveal.material.dispose();
    this.interiorDome.geometry.dispose();
    this.interiorDome.material.dispose();
    this.interiorDust.geometry.dispose();
    this.interiorDust.material.dispose();
    this.releaseRevealImage();
    this.pool.forEach((entry) => {
      entry.texture.dispose();
      entry.bitmap.close();
    });
    this.pool.clear();
    this.root.removeFromParent();
  }
}

/** Outside flash: seconds the revealed image holds before folding back. */
const FLASH_HOLD_SECONDS = 3.5;
/** Outside flash: share of the way from its tile to the camera the image flies. */
const EXTERIOR_REVEAL_TRAVEL = 0.55;
/** Interior dome radius, in shell radii (just beyond the tiles and edges). */
const INTERIOR_DOME_RADII = 1.35;
/** Dust specks inside the shell, filling this share of its radius. */
const INTERIOR_DUST_COUNT = 2000;
const INTERIOR_DUST_RADII = 0.92;

const interiorDustVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uTime;
  uniform float uDrift;
  uniform float uSize;
  uniform float uPointScale;
  uniform float uLevel;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    // Each speck drifts slowly on its own small loop.
    float phase = aSeed * 6.2831853;
    vec3 drift = vec3(
      sin(uTime * 0.07 + phase),
      sin(uTime * 0.05 + phase * 1.7),
      cos(uTime * 0.06 + phase * 2.3)
    ) * uDrift;
    vec4 mvPosition = modelViewMatrix * vec4(position + drift, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float depth = max(-mvPosition.z, 1.0);
    gl_PointSize = clamp(uSize * uPointScale / depth, 1.0, 9.0);
    // Gentle twinkle; closer specks a little brighter.
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed) + phase * 3.0);
    vAlpha = uLevel * twinkle * clamp(1.8 - depth / (uDrift * 40.0), 0.25, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const interiorDustFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying float vAlpha;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 c = gl_PointCoord - 0.5;
    float soft = 1.0 - smoothstep(0.1, 0.5, length(c));
    gl_FragColor = vec4(vec3(0.62, 0.78, 1.0) * soft * vAlpha * 0.35, 1.0);
  }
`;

const interiorDomeVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const interiorDomeFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uLevel;
  varying vec3 vDirection;

  // Distance to the nearest grid line (0 on a line, 0.5 halfway between).
  float lineDistance(float value) {
    return abs(fract(value + 0.5) - 0.5);
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDirection);
    // Deep blue-black, a touch lighter overhead, darkest below.
    float height = d.y * 0.5 + 0.5;
    vec3 color = mix(vec3(0.003, 0.006, 0.014), vec3(0.018, 0.03, 0.06), smoothstep(0.1, 1.0, height));
    // Faint latitude / longitude lines give the enclosure a sense of curvature.
    float longitude = atan(d.z, d.x) / 6.2831853 * 24.0;
    float latitude = asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 * 12.0;
    float grid = max(
      1.0 - smoothstep(0.0, 0.035, lineDistance(longitude)),
      1.0 - smoothstep(0.0, 0.035, lineDistance(latitude))
    );
    color += vec3(0.04, 0.09, 0.15) * grid * 0.3;
    // A subtle tint, not blackout: depth comes from parallax, haze and light.
    gl_FragColor = vec4(color, uLevel * 0.6);
  }
`;
