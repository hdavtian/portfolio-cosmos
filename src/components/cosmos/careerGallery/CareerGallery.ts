import * as THREE from "three";

/**
 * Career Gallery: an 80-face icosahedral hologram shell whose faces show the
 * career's portfolio screenshots. Each face periodically glitches and
 * cross-fades to another random screenshot, so the shell keeps changing like a
 * screensaver. Viewed from its center once the visitor enters.
 *
 * Images are decoded and downscaled off the main thread (createImageBitmap)
 * and only a couple load at a time, so filling the shell never stalls a frame.
 */

export type CareerGalleryOptions = {
  imageUrls: string[];
  radius?: number;
};

type LoadedImage = {
  texture: THREE.Texture;
  aspect: number;
  users: number;
};

type FaceState = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  currentUrl: string | null;
  nextUrl: string | null;
  transitionT: number;
  transitioning: boolean;
  /** Seconds until this face becomes eligible for its next swap. */
  holdRemaining: number;
};

const DETAIL = 1; // IcosahedronGeometry detail 1 → 80 triangular faces
const MAX_IMAGE_WIDTH = 384;
const MAX_CONCURRENT_LOADS = 2;
const TRANSITION_SECONDS = 1.6;
const MIN_HOLD_SECONDS = 4;
const MAX_HOLD_SECONDS = 11;
const TEXTURE_POOL_LIMIT = 90;
/** Beyond this camera distance the faces stop swapping images (saves work). */
const ACTIVE_CYCLE_DISTANCE = 4000;

const HOLO_TINT = new THREE.Color(0.55, 0.9, 1.0);

// The renderer uses a logarithmic depth buffer; custom shaders must include
// the logdepthbuf chunks or their depth won't match the rest of the scene and
// the faces fail the depth test (invisible).
const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 bary;
  varying vec2 vUv;
  varying vec3 vBary;
  void main() {
    vUv = uv;
    vBary = bary;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
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
  uniform vec3 uTint;
  varying vec2 vUv;
  varying vec3 vBary;

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
    // Mirror horizontally: the face UVs are laid out from outside the shell,
    // but the gallery is viewed from its center.
    float u = (0.5 - uv.x) * s.x + 0.5;
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

    // Horizontal slice jitter + chromatic split while glitching.
    float slice = floor(vUv.y * 38.0);
    float jitter = (hash(vec2(slice, floor(time * 24.0))) - 0.5) * 0.08 * uGlitch;
    vec2 uv = vec2(vUv.x + jitter, vUv.y);
    float shift = 0.0012 + 0.014 * uGlitch;

    vec3 a = sampleHolo(uTexA, uv, uAspectA, shift) * uHasA;
    vec3 b = sampleHolo(uTexB, uv, uAspectB, shift) * uHasB;
    float presence = mix(uHasA, uHasB, uMix);
    vec3 col = mix(a, b, uMix);

    // Hologram treatment: subtle at rest (images stay readable), stronger
    // while a face is glitching between screenshots.
    float scanDepth = 0.05 + 0.2 * uGlitch;
    float scan = (1.0 - scanDepth) + scanDepth * sin(vUv.y * 260.0 + time * 4.0);
    col = mix(col, col * uTint + uTint * 0.04, 0.16 + 0.3 * uGlitch) * scan;
    float flicker = 0.97 + 0.03 * hash(vec2(floor(time * 12.0), uSeed));
    col *= flicker;

    // Static noise: strong on empty faces and during transitions.
    float n = hash(vUv * vec2(420.0, 260.0) + floor(time * 30.0));
    float staticAmt = (1.0 - presence) * 0.22 + uGlitch * 0.18;
    col += uTint * n * staticAmt;

    // Glowing triangle edges.
    float edge = min(vBary.x, min(vBary.y, vBary.z));
    float edgeGlow = 1.0 - smoothstep(0.0, 0.03, edge);
    col += uTint * edgeGlow * (0.55 + 0.35 * uGlitch);

    float alpha = uOpacity * mix(0.35, 0.95, max(presence, edgeGlow));
    gl_FragColor = vec4(min(col, vec3(0.95)), alpha);
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
 * box). The UV basis uses the inward normal so images read correctly from the
 * shell's center.
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
  return { geometry, faceAspect: w / h };
};

/** Decode + downscale off the main thread, then wrap as a texture. */
const loadBitmapTexture = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: MAX_IMAGE_WIDTH,
    resizeQuality: "medium",
    imageOrientation: "none",
  });
  const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, aspect: bitmap.width / Math.max(1, bitmap.height), bitmap };
};

export class CareerGallery {
  readonly root: THREE.Group;
  readonly radius: number;

  private readonly shell: THREE.Group;
  private readonly edges: THREE.LineSegments;
  private readonly faces: FaceState[] = [];
  private readonly imageUrls: string[];
  private bag: string[] = [];
  private readonly pool = new Map<string, LoadedImage>();
  private readonly bitmaps = new Map<string, ImageBitmap>();
  private readonly failedUrls = new Set<string>();
  private inFlight = 0;
  private time = 0;
  private interior = false;
  private disposed = false;
  private readonly tmpWorld = new THREE.Vector3();

  constructor({ imageUrls, radius = 396 }: CareerGalleryOptions) {
    this.radius = radius;
    this.imageUrls = Array.from(new Set(imageUrls.filter(Boolean)));

    this.root = new THREE.Group();
    this.root.name = "CareerGallery";
    this.shell = new THREE.Group();
    this.root.add(this.shell);

    const ico = new THREE.IcosahedronGeometry(radius, DETAIL).toNonIndexed();
    const pos = ico.getAttribute("position");
    const baseMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
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
        uTint: { value: HOLO_TINT.clone() },
      },
    });

    for (let i = 0; i < pos.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
      const { geometry, faceAspect } = buildFaceGeometry(a, b, c);
      // Clones share the compiled program (same shader source).
      const material = baseMaterial.clone();
      material.uniforms.uFaceAspect.value = faceAspect;
      material.uniforms.uSeed.value = Math.random();
      material.uniforms.uTint.value = HOLO_TINT.clone();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `CareerGalleryFace_${i / 3}`;
      this.shell.add(mesh);
      this.faces.push({
        mesh,
        currentUrl: null,
        nextUrl: null,
        transitionT: 0,
        transitioning: false,
        holdRemaining: randomBetween(0, 1.5),
      });
    }
    baseMaterial.dispose();

    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(radius * 1.002, DETAIL)),
      new THREE.LineBasicMaterial({
        color: 0x9fe4ff,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.shell.add(this.edges);
    ico.dispose();
  }

  /** Snapshot of loading/cycling state, for debugging. */
  getStats() {
    return {
      imageUrls: this.imageUrls.length,
      inFlight: this.inFlight,
      texturesReady: this.pool.size,
      failed: this.failedUrls.size,
      failedSample: Array.from(this.failedUrls).slice(0, 5),
      facesWithImage: this.faces.filter((face) => face.currentUrl !== null).length,
      facesTransitioning: this.faces.filter((face) => face.transitioning).length,
      interior: this.interior,
      time: Number(this.time.toFixed(1)),
    };
  }

  /** Setting interior mode tones the outer wireframe down for the inside view. */
  setInteriorMode(inside: boolean): void {
    this.interior = inside;
    (this.edges.material as THREE.LineBasicMaterial).opacity = inside ? 0.18 : 0.35;
  }

  update(dt: number, cameraWorldPos: THREE.Vector3): void {
    if (this.disposed) return;
    const step = Math.min(dt, 0.1);
    this.time += step;

    // Slow drift so the gallery never looks static.
    this.shell.rotation.y += step * (this.interior ? 0.018 : 0.03);
    this.shell.rotation.x += step * 0.006;

    this.root.getWorldPosition(this.tmpWorld);
    const cycling =
      this.interior ||
      cameraWorldPos.distanceTo(this.tmpWorld) < this.radius + ACTIVE_CYCLE_DISTANCE;

    for (const face of this.faces) {
      const u = face.mesh.material.uniforms;
      u.uTime.value = this.time;

      if (face.transitioning) {
        face.transitionT = Math.min(1, face.transitionT + step / TRANSITION_SECONDS);
        const t = face.transitionT;
        u.uMix.value = THREE.MathUtils.smoothstep(t, 0.25, 0.85);
        u.uGlitch.value = Math.pow(Math.sin(Math.PI * t), 0.6);
        if (t >= 1) this.finishTransition(face);
        continue;
      }

      if (!cycling || this.imageUrls.length === 0) continue;
      face.holdRemaining -= step;
      // Empty faces fill first; filled faces wait out their hold time.
      const due = face.currentUrl === null || face.holdRemaining <= 0;
      if (due && face.nextUrl === null && this.inFlight < MAX_CONCURRENT_LOADS) {
        this.requestNextImage(face);
      }
    }
  }

  private nextFromBag(): string | null {
    for (let guard = 0; guard < this.imageUrls.length * 2; guard += 1) {
      if (this.bag.length === 0) this.bag = shuffle(this.imageUrls);
      const url = this.bag.pop() ?? null;
      if (url && !this.failedUrls.has(url)) return url;
    }
    return null;
  }

  private requestNextImage(face: FaceState): void {
    const url = this.nextFromBag();
    if (!url) return;
    face.nextUrl = url;

    const ready = this.pool.get(url);
    if (ready) {
      ready.users += 1;
      this.beginTransition(face, url, ready);
      return;
    }

    this.inFlight += 1;
    loadBitmapTexture(url)
      .then(({ texture, aspect, bitmap }) => {
        this.inFlight -= 1;
        if (this.disposed) {
          texture.dispose();
          bitmap.close();
          return;
        }
        const entry: LoadedImage = { texture, aspect, users: 1 };
        this.pool.set(url, entry);
        this.bitmaps.set(url, bitmap);
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

  private finishTransition(face: FaceState): void {
    const u = face.mesh.material.uniforms;
    const previousUrl = face.currentUrl;
    u.uTexA.value = u.uTexB.value;
    u.uAspectA.value = u.uAspectB.value;
    u.uHasA.value = 1;
    u.uTexB.value = getPlaceholderTexture();
    u.uHasB.value = 0;
    u.uMix.value = 0;
    u.uGlitch.value = 0;
    face.currentUrl = face.nextUrl;
    face.nextUrl = null;
    face.transitioning = false;
    face.holdRemaining = randomBetween(MIN_HOLD_SECONDS, MAX_HOLD_SECONDS);
    if (previousUrl) this.releaseImage(previousUrl);
  }

  private releaseImage(url: string): void {
    const entry = this.pool.get(url);
    if (!entry) return;
    entry.users = Math.max(0, entry.users - 1);
    if (entry.users > 0 || this.pool.size <= TEXTURE_POOL_LIMIT) return;
    entry.texture.dispose();
    this.bitmaps.get(url)?.close();
    this.bitmaps.delete(url);
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
    this.pool.forEach((entry) => entry.texture.dispose());
    this.bitmaps.forEach((bitmap) => bitmap.close());
    this.pool.clear();
    this.bitmaps.clear();
    this.root.removeFromParent();
  }
}
