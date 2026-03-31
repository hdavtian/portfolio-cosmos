import * as THREE from "three";

// ─── Destination-type scheme ────────────────────────────────────────────────

export type TargetingRouteKind = "moon" | "section";

interface TargetingScheme {
  ringCount: number;
  tickDensity: number;
  rotationSpeedRange: [number, number];
  baseHue: number;
  hueSpread: number;
  saturation: number;
  lightness: number;
  crosshairScale: number;
  scanMotion: boolean;
  innerDiamonds: boolean;
  ringGapVariance: number;
  phrases: string[];
  coordPrefix: string;
  outerEncircleSegments: number;   // how many dashed arcs on outer ring
  focusNotchCount: number;         // radial notch lines that animate inward
  beamDataLineCount: number;       // scrolling data readout sprites along beam
  sweepArc: boolean;               // animated scanning sweep on outer ring
  cornerBrackets: boolean;         // HUD corner bracket marks
}

const MOON_SCHEME: TargetingScheme = {
  ringCount: 4,
  tickDensity: 24,
  rotationSpeedRange: [0.3, 0.9],
  baseHue: 0.08,
  hueSpread: 0.06,
  saturation: 0.85,
  lightness: 0.55,
  crosshairScale: 1.15,
  scanMotion: true,
  innerDiamonds: true,
  ringGapVariance: 0.3,
  phrases: [
    "SCANNING LUNAR SURFACE",
    "TRAJECTORY LOCKED",
    "GRAVITATIONAL PULL DETECTED",
    "APPROACH VECTOR SOLVED",
    "NAV LOCK STABLE",
    "ORBIT INTERCEPT READY",
    "THERMAL SIGNATURE CONFIRMED",
    "SURFACE SCAN IN PROGRESS",
  ],
  coordPrefix: "LUNAR",
  outerEncircleSegments: 5,
  focusNotchCount: 12,
  beamDataLineCount: 4,
  sweepArc: true,
  cornerBrackets: true,
};

const SECTION_SCHEME: TargetingScheme = {
  ringCount: 3,
  tickDensity: 16,
  rotationSpeedRange: [0.15, 0.45],
  baseHue: 0.55,
  hueSpread: 0.08,
  saturation: 0.75,
  lightness: 0.60,
  crosshairScale: 1.0,
  scanMotion: false,
  innerDiamonds: false,
  ringGapVariance: 0.1,
  phrases: [
    "DESTINATION ACQUIRED",
    "COURSE PLOTTED",
    "STELLAR COORDINATES SET",
    "TRAJECTORY SOLVED",
    "NAVIGATION ALIGNED",
    "SECTOR APPROACH LOCKED",
    "HYPERSPACE VECTOR LOCKED",
    "BEACON SIGNAL STRONG",
  ],
  coordPrefix: "SECTOR",
  outerEncircleSegments: 3,
  focusNotchCount: 8,
  beamDataLineCount: 3,
  sweepArc: false,
  cornerBrackets: true,
};

function getScheme(kind: TargetingRouteKind): TargetingScheme {
  return kind === "moon" ? MOON_SCHEME : SECTION_SCHEME;
}

// ─── Seeded random ──────────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ─── Ring geometry (circle outline + tick marks) ────────────────────────────

function createRingGeometry(
  radius: number,
  segments: number,
  tickCount: number,
  tickLength: number,
  includeDiamonds: boolean,
): THREE.BufferGeometry {
  const points: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    points.push(Math.cos(theta) * radius, Math.sin(theta) * radius, 0);
  }

  for (let i = 0; i < tickCount; i++) {
    const theta = (i / tickCount) * Math.PI * 2;
    const cx = Math.cos(theta);
    const cy = Math.sin(theta);
    points.push(cx * radius, cy * radius, 0);
    points.push(cx * (radius - tickLength), cy * (radius - tickLength), 0);
  }

  if (includeDiamonds) {
    const dSize = tickLength * 0.6;
    const dRadius = radius - tickLength * 1.8;
    for (let q = 0; q < 4; q++) {
      const theta = (q / 4) * Math.PI * 2;
      const dx = Math.cos(theta) * dRadius;
      const dy = Math.sin(theta) * dRadius;
      const nx = Math.cos(theta);
      const ny = Math.sin(theta);
      const tx = -ny;
      const ty = nx;
      points.push(dx + nx * dSize, dy + ny * dSize, 0);
      points.push(dx + tx * dSize * 0.5, dy + ty * dSize * 0.5, 0);
      points.push(dx + tx * dSize * 0.5, dy + ty * dSize * 0.5, 0);
      points.push(dx - nx * dSize, dy - ny * dSize, 0);
      points.push(dx - nx * dSize, dy - ny * dSize, 0);
      points.push(dx - tx * dSize * 0.5, dy - ty * dSize * 0.5, 0);
      points.push(dx - tx * dSize * 0.5, dy - ty * dSize * 0.5, 0);
      points.push(dx + nx * dSize, dy + ny * dSize, 0);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geo;
}

// ─── Outer encirclement ring (dashed arcs) ──────────────────────────────────

function createOuterEncircleGeometry(
  radius: number,
  arcCount: number,
  segmentsPerArc: number,
): THREE.BufferGeometry {
  const points: number[] = [];
  const gapFraction = 0.12;
  const arcSpan = (Math.PI * 2) / arcCount;
  const drawSpan = arcSpan * (1 - gapFraction);
  for (let a = 0; a < arcCount; a++) {
    const arcStart = a * arcSpan;
    for (let s = 0; s <= segmentsPerArc; s++) {
      const theta = arcStart + (s / segmentsPerArc) * drawSpan;
      points.push(Math.cos(theta) * radius, Math.sin(theta) * radius, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geo;
}

// ─── Focus notch lines (radial lines that animate inward) ───────────────────

function createFocusNotchGeometry(
  outerRadius: number,
  innerRadius: number,
  notchCount: number,
): THREE.BufferGeometry {
  const points: number[] = [];
  for (let i = 0; i < notchCount; i++) {
    const theta = (i / notchCount) * Math.PI * 2;
    const cx = Math.cos(theta);
    const cy = Math.sin(theta);
    points.push(cx * outerRadius, cy * outerRadius, 0);
    points.push(cx * innerRadius, cy * innerRadius, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geo;
}

// ─── Sweep arc geometry (partial arc for scanning effect) ───────────────────

function createSweepArcGeometry(
  radius: number,
  sweepAngle: number,
  segments: number,
): THREE.BufferGeometry {
  const points: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * sweepAngle;
    points.push(Math.cos(theta) * radius, Math.sin(theta) * radius, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geo;
}

// ─── Corner bracket geometry ────────────────────────────────────────────────

function createCornerBracketsGeometry(halfSize: number): THREE.BufferGeometry {
  const points: number[] = [];
  const arm = halfSize * 0.25;
  const corners = [
    [-1, -1], [1, -1], [1, 1], [-1, 1],
  ];
  for (const [sx, sy] of corners) {
    const cx = sx * halfSize;
    const cy = sy * halfSize;
    // horizontal arm
    points.push(cx, cy, 0);
    points.push(cx - sx * arm, cy, 0);
    // vertical arm
    points.push(cx, cy, 0);
    points.push(cx, cy - sy * arm, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geo;
}

// ─── Targeting grid (4x4 wireframe) ─────────────────────────────────────────

function createTargetingGridGeometry(halfSize: number): THREE.BufferGeometry {
  const points: number[] = [];
  const cells = 4;
  const step = (halfSize * 2) / cells;
  for (let i = 0; i <= cells; i++) {
    const off = -halfSize + i * step;
    // horizontal line
    points.push(-halfSize, off, 0);
    points.push( halfSize, off, 0);
    // vertical line
    points.push(off, -halfSize, 0);
    points.push(off,  halfSize, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geo;
}

// ─── Crosshair geometry ────────────────────────────────────────────────────

function createCrosshairGeometry(size: number): THREE.BufferGeometry {
  const g = size * 0.4;
  const points = [
    -size, 0, 0,  -g, 0, 0,
     g, 0, 0,     size, 0, 0,
     0, -size, 0,  0, -g, 0,
     0, g, 0,      0, size, 0,
    -g * 0.7, -g * 0.7, 0,  -g * 0.35, -g * 0.35, 0,
     g * 0.7,  g * 0.7, 0,   g * 0.35,  g * 0.35, 0,
     g * 0.7, -g * 0.7, 0,   g * 0.35, -g * 0.35, 0,
    -g * 0.7,  g * 0.7, 0,  -g * 0.35,  g * 0.35, 0,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geo;
}

// ─── Micro-text sprite ──────────────────────────────────────────────────────

function createTextSprite(
  text: string,
  color: THREE.Color,
  scale: number,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 512;
  canvas.height = 64;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 28px 'Courier New', monospace";
  ctx.fillStyle = `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0.85)`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale * 8, scale, 1);
  return sprite;
}

// ─── Beam data readout sprite (non-readable scrolling gibberish) ────────────

const DATA_LINES = [
  "0xF3A1..8B92 TRJ_VEC::ALIGN",
  "SYS//NAV_CORE  DFLT_0x7E",
  "FREQ 447.2 GHZ  LOCK_PH:3",
  "BUF[0x2F] >> STRM::AX_COMP",
  "POS_DELTA  12.07E+03  CHK",
  "GRAV_WELL  -0.003  STABLE",
  "CALC..DONE  RTT 0.214ms",
  "VEC3{X:-0.71,Y:0.02,Z:0.71}",
  "ALIGN>>OK  SPIN_CORR 0.00",
  "TGT_HASH  9A2F..C701  PASS",
];

function createDataReadoutSprite(
  color: THREE.Color,
  scale: number,
  seed: number,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 512;
  canvas.height = 128;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "11px 'Courier New', monospace";
  const r = (color.r * 255) | 0;
  const g = (color.g * 255) | 0;
  const b = (color.b * 255) | 0;
  const lineCount = 4;
  for (let i = 0; i < lineCount; i++) {
    const idx = (seed + i) % DATA_LINES.length;
    const alpha = 0.35 + (i % 2) * 0.2;
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(DATA_LINES[idx], 8, 6 + i * 28);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale * 6, scale * 1.5, 1);
  return sprite;
}

// ─── Laser beam + flare ─────────────────────────────────────────────────────

function createLaserBeam(color: THREE.Color): THREE.Line {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(6);
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
  });
  return new THREE.Line(geo, mat);
}

function createFlareSprite(color: THREE.Color): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1.0)");
  gradient.addColorStop(0.15, `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0.9)`);
  gradient.addColorStop(0.5, `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0.3)`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(12, 12, 1);
  return sprite;
}

// ─── Main Controller ────────────────────────────────────────────────────────

export interface TargetingFXState {
  active: boolean;
  phase: "spawning" | "locking" | "locked" | "fading" | "done";
  startTime: number;
  seed: number;
  routeKind: TargetingRouteKind;
  targetPosition: THREE.Vector3;
  shipNoseOffset: THREE.Vector3;
  totalDurationMs: number;
  progress: number;
  /** Set by controller at lock moment so caller can nudge camera FOV */
  lockFlashT: number;
}

export interface TargetingFXController {
  state: TargetingFXState;
  group: THREE.Group;
  begin: (params: {
    targetPosition: THREE.Vector3;
    shipPosition: THREE.Vector3;
    routeKind: TargetingRouteKind;
    targetId: string;
    targetRadius?: number;
  }) => void;
  update: (
    deltaMs: number,
    shipObject: THREE.Object3D,
    camera: THREE.Camera,
  ) => void;
  fadeOut: () => void;
  isComplete: () => boolean;
  dispose: () => void;
}

export function createTargetingFXController(
  scene: THREE.Scene,
): TargetingFXController {
  const group = new THREE.Group();
  group.name = "TargetingFX";
  group.visible = false;
  scene.add(group);

  const state: TargetingFXState = {
    active: false,
    phase: "done",
    startTime: 0,
    seed: 0,
    routeKind: "section",
    targetPosition: new THREE.Vector3(),
    shipNoseOffset: new THREE.Vector3(0, 0, 12),
    totalDurationMs: 2000,
    progress: 0,
    lockFlashT: 0,
  };

  // ── Internal objects ──
  let rings: THREE.LineSegments[] = [];
  let crosshair: THREE.LineSegments | null = null;
  let textSprite: THREE.Sprite | null = null;
  let coordSprite: THREE.Sprite | null = null;
  let laserBeam: THREE.Line | null = null;
  let flareSprite: THREE.Sprite | null = null;
  let outerEncircle: THREE.Line | null = null;
  let focusNotches: THREE.LineSegments | null = null;
  let sweepArc: THREE.Line | null = null;
  let cornerBrackets: THREE.LineSegments | null = null;
  let beamDataSprites: THREE.Sprite[] = [];
  let targetingGrid: THREE.LineSegments | null = null;
  let lockFlashRing: THREE.Line | null = null;
  let trailingBeam: THREE.Line | null = null;

  let ringRotationSpeeds: number[] = [];
  let ringBaseAngles: number[] = [];
  let ringRadii: number[] = [];
  let schemeColors: THREE.Color[] = [];
  let lockColor = new THREE.Color();
  let laserProgress = 0;
  let masterOpacity = 0;
  let fadeStartTime = 0;
  let outerRadius = 0;
  let focusNotchOuterR = 0;
  let focusNotchTargetInnerR = 0;
  let focusNotchCurrentInnerR = 0;
  let sweepArcRadius = 0;
  let gridStartPos = new THREE.Vector3();
  let gridHalfSize = 0;
  let lockFlashStartTime = 0;
  let lockFlashFired = false;
  let crosshairSpreadFactor = 1;   // 1 = fully spread, 0 = converged
  let ringLockOrder: number[] = []; // per-ring stagger delay (seconds)
  let baseCameraFov: number | null = null;

  const _tmpVec = new THREE.Vector3();
  const _tmpVec2 = new THREE.Vector3();
  const _shipNose = new THREE.Vector3();
  const _lookQuat = new THREE.Quaternion();

  function disposeObject3D(obj: THREE.Object3D) {
    if ((obj as THREE.Mesh).geometry) {
      (obj as THREE.Mesh).geometry.dispose();
    }
    const mat = (obj as any).material;
    if (mat) {
      if (mat.map) mat.map.dispose();
      mat.dispose();
    }
    group.remove(obj);
  }

  function clearObjects() {
    for (const r of rings) disposeObject3D(r);
    rings = [];
    if (crosshair) { disposeObject3D(crosshair); crosshair = null; }
    if (textSprite) { disposeObject3D(textSprite); textSprite = null; }
    if (coordSprite) { disposeObject3D(coordSprite); coordSprite = null; }
    if (laserBeam) { disposeObject3D(laserBeam); laserBeam = null; }
    if (flareSprite) { disposeObject3D(flareSprite); flareSprite = null; }
    if (outerEncircle) { disposeObject3D(outerEncircle); outerEncircle = null; }
    if (focusNotches) { disposeObject3D(focusNotches); focusNotches = null; }
    if (sweepArc) { disposeObject3D(sweepArc); sweepArc = null; }
    if (cornerBrackets) { disposeObject3D(cornerBrackets); cornerBrackets = null; }
    for (const s of beamDataSprites) disposeObject3D(s);
    beamDataSprites = [];
    if (targetingGrid) { disposeObject3D(targetingGrid); targetingGrid = null; }
    if (lockFlashRing) { disposeObject3D(lockFlashRing); lockFlashRing = null; }
    if (trailingBeam) { disposeObject3D(trailingBeam); trailingBeam = null; }
    lockFlashFired = false;
    lockFlashStartTime = 0;
    crosshairSpreadFactor = 1;
    ringLockOrder = [];
    baseCameraFov = null;
    ringRotationSpeeds = [];
    ringBaseAngles = [];
    ringRadii = [];
    schemeColors = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // begin()
  // ─────────────────────────────────────────────────────────────────────────

  function begin(params: {
    targetPosition: THREE.Vector3;
    shipPosition: THREE.Vector3;
    routeKind: TargetingRouteKind;
    targetId: string;
    targetRadius?: number;
  }) {
    clearObjects();

    const { targetPosition, shipPosition, routeKind, targetId, targetRadius: bodyRadius } = params;
    const distance = shipPosition.distanceTo(targetPosition);

    state.active = true;
    state.phase = "spawning";
    state.startTime = performance.now();
    state.seed = (Date.now() ^ (targetId.length * 7919)) | 0;
    state.routeKind = routeKind;
    state.targetPosition.copy(targetPosition);

    state.totalDurationMs = THREE.MathUtils.clamp(
      1800 + distance * 0.15,
      1800,
      3500,
    );
    state.progress = 0;
    state.lockFlashT = 0;
    laserProgress = 0;
    masterOpacity = 0;
    fadeStartTime = 0;

    const rng = seededRandom(state.seed);
    const scheme = getScheme(routeKind);

    // ── Colors ──
    schemeColors = [];
    for (let i = 0; i < scheme.ringCount + 3; i++) {
      const hue = scheme.baseHue + (rng() - 0.5) * scheme.hueSpread * 2;
      const c = new THREE.Color();
      c.setHSL(
        ((hue % 1) + 1) % 1,
        scheme.saturation + (rng() - 0.5) * 0.1,
        scheme.lightness + (rng() - 0.5) * 0.08,
      );
      schemeColors.push(c);
    }

    lockColor = new THREE.Color();
    lockColor.setHSL(
      routeKind === "moon" ? 0.12 : 0.35,
      0.95,
      0.65,
    );

    // Scale reticle to the actual body size for larger destinations.
    // Distance-based fallback for small/unknown objects; body-radius
    // based floor so big planets/lattices get visually wrapped.
    const distanceBased = THREE.MathUtils.clamp(distance * 0.012, 30, 120);
    const bodyBased = bodyRadius != null
      ? THREE.MathUtils.clamp(bodyRadius * 1.6, 40, 600)
      : 0;
    const baseRadius = Math.max(distanceBased, bodyBased);

    // ── Inner rings ──
    ringRadii = [];
    ringRotationSpeeds = [];
    ringBaseAngles = [];

    for (let i = 0; i < scheme.ringCount; i++) {
      const radiusMult = 0.6 + i * 0.35 + rng() * 0.15;
      const radius = baseRadius * radiusMult;
      ringRadii.push(radius);

      const speed = scheme.rotationSpeedRange[0] +
        rng() * (scheme.rotationSpeedRange[1] - scheme.rotationSpeedRange[0]);
      ringRotationSpeeds.push(speed * (i % 2 === 0 ? 1 : -1));
      ringBaseAngles.push(rng() * Math.PI * 2);

      const segments = 64 + i * 16;
      const tickCount = scheme.tickDensity + Math.floor(rng() * 8);
      const tickLen = radius * (0.08 + rng() * 0.04);

      const geo = createRingGeometry(radius, segments, tickCount, tickLen, scheme.innerDiamonds && i === 0);
      const mat = new THREE.LineBasicMaterial({
        color: schemeColors[i],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      const ring = new THREE.LineSegments(geo, mat);
      ring.renderOrder = 999;
      rings.push(ring);
      group.add(ring);
    }

    // ── Outer encirclement ring ──
    outerRadius = baseRadius * (1.8 + rng() * 0.4);
    const outerGeo = createOuterEncircleGeometry(
      outerRadius,
      scheme.outerEncircleSegments,
      32,
    );
    const outerMat = new THREE.LineBasicMaterial({
      color: schemeColors[scheme.ringCount] ?? schemeColors[0],
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    outerEncircle = new THREE.Line(outerGeo, outerMat);
    outerEncircle.renderOrder = 999;
    group.add(outerEncircle);

    // ── Focus notch lines (radial "lens-turn" notches) ──
    focusNotchOuterR = outerRadius * 1.05;
    focusNotchTargetInnerR = outerRadius * 0.7;
    focusNotchCurrentInnerR = focusNotchOuterR;

    const notchGeo = createFocusNotchGeometry(
      focusNotchOuterR,
      focusNotchCurrentInnerR,
      scheme.focusNotchCount,
    );
    const notchMat = new THREE.LineBasicMaterial({
      color: schemeColors[scheme.ringCount + 1] ?? schemeColors[0],
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    focusNotches = new THREE.LineSegments(notchGeo, notchMat);
    focusNotches.renderOrder = 999;
    group.add(focusNotches);

    // ── Sweep arc ──
    if (scheme.sweepArc) {
      sweepArcRadius = outerRadius * 0.92;
      const sweepGeo = createSweepArcGeometry(sweepArcRadius, Math.PI * 0.35, 24);
      const sweepMat = new THREE.LineBasicMaterial({
        color: lockColor.clone(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      sweepArc = new THREE.Line(sweepGeo, sweepMat);
      sweepArc.renderOrder = 999;
      group.add(sweepArc);
    }

    // ── Corner brackets ──
    if (scheme.cornerBrackets) {
      const bracketSize = outerRadius * 1.15;
      const bracketGeo = createCornerBracketsGeometry(bracketSize);
      const bracketMat = new THREE.LineBasicMaterial({
        color: schemeColors[scheme.ringCount + 2] ?? schemeColors[0],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      cornerBrackets = new THREE.LineSegments(bracketGeo, bracketMat);
      cornerBrackets.renderOrder = 999;
      group.add(cornerBrackets);
    }

    // ── Crosshair ──
    const chSize = baseRadius * 0.5 * scheme.crosshairScale;
    const chGeo = createCrosshairGeometry(chSize);
    const chMat = new THREE.LineBasicMaterial({
      color: schemeColors[scheme.ringCount] ?? schemeColors[0],
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    crosshair = new THREE.LineSegments(chGeo, chMat);
    crosshair.renderOrder = 999;
    group.add(crosshair);

    // ── Text sprites ──
    const phrase = scheme.phrases[Math.floor(rng() * scheme.phrases.length)];
    textSprite = createTextSprite(phrase, schemeColors[0], baseRadius * 0.14);
    textSprite.renderOrder = 999;
    group.add(textSprite);

    const coordText = `${scheme.coordPrefix} ${Math.abs(targetPosition.x).toFixed(0)}.${Math.abs(targetPosition.z).toFixed(0)}.${Math.abs(targetPosition.y).toFixed(0)}`;
    const coordColor = schemeColors[1] ?? schemeColors[0];
    coordSprite = createTextSprite(coordText, coordColor, baseRadius * 0.10);
    coordSprite.renderOrder = 999;
    group.add(coordSprite);

    // ── Beam data readout sprites ──
    beamDataSprites = [];
    for (let i = 0; i < scheme.beamDataLineCount; i++) {
      const dataSprite = createDataReadoutSprite(
        schemeColors[i % schemeColors.length],
        baseRadius * 0.08,
        (state.seed + i * 3) & 0xffff,
      );
      dataSprite.renderOrder = 998;
      group.add(dataSprite);
      beamDataSprites.push(dataSprite);
    }

    // ── Targeting grid (4x4, zooms from ship to target with 360° spin) ──
    gridHalfSize = baseRadius * 0.55;
    const gridGeo = createTargetingGridGeometry(gridHalfSize);
    const gridColor = routeKind === "moon"
      ? new THREE.Color(0.3, 1.0, 0.35)     // green for moons
      : new THREE.Color(0.85, 0.92, 1.0);   // cool white for sections
    const gridMat = new THREE.LineBasicMaterial({
      color: gridColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    targetingGrid = new THREE.LineSegments(gridGeo, gridMat);
    targetingGrid.renderOrder = 999;
    gridStartPos.copy(shipPosition);
    group.add(targetingGrid);

    // ── Laser beam ──
    laserBeam = createLaserBeam(schemeColors[0]);
    laserBeam.renderOrder = 998;
    group.add(laserBeam);

    // ── Flare ──
    flareSprite = createFlareSprite(schemeColors[0]);
    flareSprite.renderOrder = 999;
    group.add(flareSprite);

    // ── Trailing beam (dimmer segment behind flare head) ──
    const trailColor = schemeColors[0].clone().multiplyScalar(0.5);
    trailingBeam = createLaserBeam(trailColor);
    trailingBeam.renderOrder = 997;
    group.add(trailingBeam);

    // ── Lock flash ring (expanding pulse at lock moment) ──
    const flashGeo = createOuterEncircleGeometry(baseRadius * 0.8, 1, 64);
    const flashMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(1, 1, 1),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    lockFlashRing = new THREE.Line(flashGeo, flashMat);
    lockFlashRing.renderOrder = 1000;
    lockFlashRing.visible = false;
    group.add(lockFlashRing);

    // ── Per-ring staggered lock order ──
    lockFlashFired = false;
    lockFlashStartTime = 0;
    crosshairSpreadFactor = 1;
    baseCameraFov = null;
    state.lockFlashT = 0;
    ringLockOrder = [];
    const staggerStep = 0.12;
    for (let i = 0; i < scheme.ringCount; i++) {
      ringLockOrder.push(i * staggerStep);
    }

    group.visible = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // update()
  // ─────────────────────────────────────────────────────────────────────────

  function update(
    deltaMs: number,
    shipObject: THREE.Object3D,
    camera: THREE.Camera,
  ) {
    if (!state.active || state.phase === "done") return;

    const elapsed = performance.now() - state.startTime;
    const scheme = getScheme(state.routeKind);

    // Phase transitions
    const spawnEnd = state.totalDurationMs * 0.3;
    const lockEnd = state.totalDurationMs * 0.7;
    const lockedEnd = state.totalDurationMs * 0.9;

    if (state.phase === "spawning" && elapsed > spawnEnd) {
      state.phase = "locking";
    }
    if (state.phase === "locking" && elapsed > lockEnd) {
      state.phase = "locked";
      // Fire lock flash pulse
      if (!lockFlashFired) {
        lockFlashFired = true;
        lockFlashStartTime = performance.now();
        if (lockFlashRing) lockFlashRing.visible = true;
        // Capture base FOV for nudge
        if (camera instanceof THREE.PerspectiveCamera && baseCameraFov === null) {
          baseCameraFov = camera.fov;
        }
      }
    }
    if (state.phase === "locked" && elapsed > lockedEnd) {
      state.phase = "fading";
      fadeStartTime = performance.now();
    }

    state.progress = Math.min(elapsed / state.totalDurationMs, 1);

    // Master opacity ramp
    if (state.phase === "fading") {
      const fadeProg = Math.min(
        (performance.now() - fadeStartTime) / (state.totalDurationMs * 0.12),
        1,
      );
      masterOpacity = 1 - fadeProg;
      if (fadeProg >= 1) {
        state.phase = "done";
        state.active = false;
        group.visible = false;
        return;
      }
    } else {
      masterOpacity = Math.min(masterOpacity + deltaMs * 0.004, 1);
    }

    // Ship nose world position
    _shipNose.copy(state.shipNoseOffset).applyMatrix4(shipObject.matrixWorld);

    // Billboard toward camera
    _tmpVec.subVectors(camera.position, state.targetPosition).normalize();
    _lookQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _tmpVec);

    const seconds = elapsed / 1000;

    // ── Inner rings ──
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      ring.position.copy(state.targetPosition);
      ring.quaternion.copy(_lookQuat);

      const angle = ringBaseAngles[i] + seconds * ringRotationSpeeds[i];
      ring.rotateZ(angle);

      let scaleMult = 1;
      if (state.phase === "spawning") {
        const spawnT = Math.min(elapsed / (state.totalDurationMs * 0.3), 1);
        const ringDelay = i * 0.15;
        const localT = THREE.MathUtils.clamp((spawnT - ringDelay) / (1 - ringDelay), 0, 1);
        scaleMult = 0.5 + 0.5 * (1 - Math.pow(1 - localT, 3));
      }

      if (scheme.scanMotion) {
        const jitter = Math.sin(seconds * 3.5 + i * 1.2) * 0.015;
        scaleMult += jitter;
      }

      ring.scale.setScalar(scaleMult);

      const mat = ring.material as THREE.LineBasicMaterial;
      let targetOpacity = 0.5 + 0.15 * Math.sin(seconds * 2 + i);
      if (state.phase === "locked" || state.phase === "locking") {
        const globalLockT = state.phase === "locked" ? 1 :
          Math.min((elapsed - state.totalDurationMs * 0.3) / (state.totalDurationMs * 0.4), 1);
        // Staggered per-ring lock: each ring snaps at its own delay
        const ringDelaySec = ringLockOrder[i] ?? 0;
        const ringLockT = THREE.MathUtils.clamp(
          globalLockT - ringDelaySec / (state.totalDurationMs * 0.4 / 1000),
          0, 1,
        );
        // Snap curve: stays near 0 then jumps to 1
        const snapT = ringLockT < 0.3 ? 0 : Math.min((ringLockT - 0.3) / 0.15, 1);
        mat.color.copy(schemeColors[i]).lerp(lockColor, snapT * 0.7);
        targetOpacity = 0.6 + 0.25 * snapT;
      } else {
        mat.color.copy(schemeColors[i]);
      }
      mat.opacity = targetOpacity * masterOpacity;
    }

    // ── Outer encirclement ring ──
    if (outerEncircle) {
      outerEncircle.position.copy(state.targetPosition);
      outerEncircle.quaternion.copy(_lookQuat);
      outerEncircle.rotateZ(-seconds * 0.12);

      let outerScale = 1;
      if (state.phase === "spawning") {
        const t = Math.min(elapsed / (state.totalDurationMs * 0.35), 1);
        outerScale = 1.4 - 0.4 * t;
      }
      outerEncircle.scale.setScalar(outerScale);

      const outerMat = outerEncircle.material as THREE.LineBasicMaterial;
      let outerOp = 0;
      if (state.phase === "spawning") {
        outerOp = Math.min(elapsed / (state.totalDurationMs * 0.2), 1) * 0.4;
      } else if (state.phase === "locking") {
        outerOp = 0.4 + 0.15 * Math.sin(seconds * 1.5);
      } else if (state.phase === "locked") {
        outerOp = 0.65;
        outerMat.color.copy(schemeColors[scheme.ringCount] ?? schemeColors[0]).lerp(lockColor, 0.5);
      } else {
        outerOp = 0.35;
      }
      outerMat.opacity = outerOp * masterOpacity;
    }

    // ── Focus notch lines (animate inward like lens-turn) ──
    if (focusNotches) {
      focusNotches.position.copy(state.targetPosition);
      focusNotches.quaternion.copy(_lookQuat);
      focusNotches.rotateZ(seconds * 0.25);

      // Animate the inner radius inward during spawning/locking
      const focusT = THREE.MathUtils.clamp(elapsed / (state.totalDurationMs * 0.65), 0, 1);
      const easedFocus = focusT < 0.5 ? 2 * focusT * focusT : 1 - Math.pow(-2 * focusT + 2, 2) / 2;
      focusNotchCurrentInnerR = focusNotchOuterR + (focusNotchTargetInnerR - focusNotchOuterR) * easedFocus;

      // Rebuild geometry with animated inner radius
      const notchCount = scheme.focusNotchCount;
      const posAttr = focusNotches.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < notchCount; i++) {
        const theta = (i / notchCount) * Math.PI * 2;
        const cx = Math.cos(theta);
        const cy = Math.sin(theta);
        posAttr.setXYZ(i * 2, cx * focusNotchOuterR, cy * focusNotchOuterR, 0);
        posAttr.setXYZ(i * 2 + 1, cx * focusNotchCurrentInnerR, cy * focusNotchCurrentInnerR, 0);
      }
      posAttr.needsUpdate = true;

      const notchMat = focusNotches.material as THREE.LineBasicMaterial;
      let notchOp = 0;
      if (state.phase === "spawning") {
        notchOp = Math.min(elapsed / (state.totalDurationMs * 0.25), 1) * 0.3;
      } else if (state.phase === "locking") {
        notchOp = 0.3 + 0.2 * easedFocus;
      } else if (state.phase === "locked") {
        notchOp = 0.6;
        notchMat.color.lerp(lockColor, 0.3);
      } else {
        notchOp = 0.25;
      }
      notchMat.opacity = notchOp * masterOpacity;
    }

    // ── Sweep arc (rotating scanner) ──
    if (sweepArc) {
      sweepArc.position.copy(state.targetPosition);
      sweepArc.quaternion.copy(_lookQuat);
      sweepArc.rotateZ(seconds * 1.8);

      const sweepMat = sweepArc.material as THREE.LineBasicMaterial;
      let sweepOp = 0;
      if (state.phase === "spawning") {
        sweepOp = Math.min(elapsed / (state.totalDurationMs * 0.3), 1) * 0.25;
      } else if (state.phase === "locking") {
        sweepOp = 0.25 + 0.2 * Math.abs(Math.sin(seconds * 3));
      } else if (state.phase === "locked") {
        sweepOp = 0.5;
      } else {
        sweepOp = 0.2;
      }
      sweepMat.opacity = sweepOp * masterOpacity;
    }

    // ── Corner brackets ──
    if (cornerBrackets) {
      cornerBrackets.position.copy(state.targetPosition);
      cornerBrackets.quaternion.copy(_lookQuat);

      let bracketScale = 1;
      if (state.phase === "spawning") {
        const t = Math.min(elapsed / (state.totalDurationMs * 0.4), 1);
        bracketScale = 1.3 - 0.3 * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      }
      cornerBrackets.scale.setScalar(bracketScale);

      const bMat = cornerBrackets.material as THREE.LineBasicMaterial;
      let bOp = 0;
      if (state.phase === "spawning") {
        bOp = Math.min(elapsed / (state.totalDurationMs * 0.3), 1) * 0.3;
      } else if (state.phase === "locking" || state.phase === "locked") {
        bOp = 0.45 + 0.15 * (state.phase === "locked" ? 1 : 0);
      } else {
        bOp = 0.3;
      }
      bMat.opacity = bOp * masterOpacity;
    }

    // ── Crosshair (convergence animation: arms start spread, tighten inward) ──
    if (crosshair) {
      crosshair.position.copy(state.targetPosition);
      crosshair.quaternion.copy(_lookQuat);

      // Convergence: spread factor lerps from 1 (wide) to 0 (tight)
      if (state.phase === "spawning") {
        crosshairSpreadFactor = 1 - Math.min(elapsed / (state.totalDurationMs * 0.3), 1) * 0.3;
      } else if (state.phase === "locking") {
        const lockingT = Math.min(
          (elapsed - state.totalDurationMs * 0.3) / (state.totalDurationMs * 0.4), 1,
        );
        crosshairSpreadFactor = 0.7 - 0.7 * (lockingT < 0.5 ? 2 * lockingT * lockingT : 1 - Math.pow(-2 * lockingT + 2, 2) / 2);
      } else if (state.phase === "locked") {
        crosshairSpreadFactor = 0;
      }

      // Apply spread as uniform scale (1.0 = normal, up to 2.2 = spread)
      const chScale = 1.0 + crosshairSpreadFactor * 1.2;
      crosshair.scale.setScalar(chScale);

      const chMat = crosshair.material as THREE.LineBasicMaterial;
      let chOp = 0;
      if (state.phase === "spawning") {
        const t = Math.min(elapsed / (state.totalDurationMs * 0.25), 1);
        chOp = t * 0.5;
      } else if (state.phase === "locking") {
        chOp = 0.5 + 0.3 * Math.sin(seconds * 6);
      } else if (state.phase === "locked") {
        chOp = 0.9;
        chMat.color.copy(lockColor);
      } else {
        chOp = 0.4;
      }
      chMat.opacity = chOp * masterOpacity;
    }

    // ── Text sprites ──
    if (textSprite) {
      const textOffset = _tmpVec.set(0, -(ringRadii[0] ?? 40) * 1.3, 0);
      textOffset.applyQuaternion(_lookQuat);
      textSprite.position.copy(state.targetPosition).add(textOffset);

      let textOp = 0;
      if (state.phase === "locking" || state.phase === "locked") {
        const lockStart = state.totalDurationMs * 0.35;
        const lockFadeIn = Math.min((elapsed - lockStart) / 400, 1);
        textOp = Math.max(0, lockFadeIn) * 0.8;
      }
      (textSprite.material as THREE.SpriteMaterial).opacity = textOp * masterOpacity;
    }

    if (coordSprite) {
      const coordOffset = _tmpVec.set(0, -(ringRadii[0] ?? 40) * 1.65, 0);
      coordOffset.applyQuaternion(_lookQuat);
      coordSprite.position.copy(state.targetPosition).add(coordOffset);

      let coordOp = 0;
      if (state.phase === "locking" || state.phase === "locked") {
        const coordStart = state.totalDurationMs * 0.45;
        const coordFadeIn = Math.min((elapsed - coordStart) / 500, 1);
        coordOp = Math.max(0, coordFadeIn) * 0.55;
      }
      (coordSprite.material as THREE.SpriteMaterial).opacity = coordOp * masterOpacity;
    }

    // ── Targeting grid (flies from ship to target, 360° spin) ──
    if (targetingGrid) {
      // Grid travel: starts at 5% of the sequence, arrives at 70%
      const gridTravelStart = state.totalDurationMs * 0.05;
      const gridTravelEnd = state.totalDurationMs * 0.70;
      let gridT = 0;
      if (elapsed > gridTravelStart) {
        const raw = Math.min((elapsed - gridTravelStart) / (gridTravelEnd - gridTravelStart), 1);
        gridT = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      }

      // Position: lerp from ship start to target
      const gridPos = _tmpVec.lerpVectors(gridStartPos, state.targetPosition, gridT);
      targetingGrid.position.copy(gridPos);

      // Billboard toward camera
      targetingGrid.quaternion.copy(_lookQuat);

      // Full 360° spin during travel
      const spinAngle = gridT * Math.PI * 2;
      targetingGrid.rotateZ(spinAngle);

      // Scale: starts small, grows to full, slight overshoot then settle
      let gridScale: number;
      if (gridT < 0.8) {
        gridScale = 0.3 + 0.8 * gridT;
      } else {
        const settleT = (gridT - 0.8) / 0.2;
        gridScale = 0.94 + 0.12 * (1 - settleT); // overshoot then settle to ~0.94
      }
      targetingGrid.scale.setScalar(gridScale);

      // Opacity: fade in, hold, then fade down once settled
      const gMat = targetingGrid.material as THREE.LineBasicMaterial;
      let gridOp = 0;
      if (gridT < 0.1) {
        gridOp = (gridT / 0.1) * 0.55;
      } else if (gridT < 0.9) {
        gridOp = 0.55 + 0.15 * Math.sin(seconds * 5);
      } else {
        const fadeT = (gridT - 0.9) / 0.1;
        gridOp = 0.55 * (1 - fadeT * 0.6);
      }

      // During locked/fading, keep it visible but dimmer at the target
      if (state.phase === "locked" && gridT >= 1) {
        gridOp = 0.3 + 0.1 * Math.sin(seconds * 2);
      }

      gMat.opacity = gridOp * masterOpacity;
    }

    // ── Laser beam ──
    if (laserBeam) {
      const laserStart = state.totalDurationMs * 0.1;
      const laserEnd = state.totalDurationMs * 0.6;
      if (elapsed > laserStart) {
        const laserT = Math.min((elapsed - laserStart) / (laserEnd - laserStart), 1);
        laserProgress = laserT < 0.5
          ? 2 * laserT * laserT
          : 1 - Math.pow(-2 * laserT + 2, 2) / 2;
      }

      const beamEnd = _tmpVec.lerpVectors(
        _shipNose,
        state.targetPosition,
        laserProgress,
      );

      const posAttr = laserBeam.geometry.getAttribute("position") as THREE.BufferAttribute;
      posAttr.setXYZ(0, _shipNose.x, _shipNose.y, _shipNose.z);
      posAttr.setXYZ(1, beamEnd.x, beamEnd.y, beamEnd.z);
      posAttr.needsUpdate = true;

      const beamMat = laserBeam.material as THREE.LineBasicMaterial;
      beamMat.opacity = Math.min(laserProgress * 0.6, 0.35) * masterOpacity;
    }

    // ── Beam data readout sprites (scrolling under the laser) ──
    if (beamDataSprites.length > 0 && laserProgress > 0.05) {
      const beamDir = _tmpVec2.subVectors(state.targetPosition, _shipNose).normalize();
      const perpUp = _tmpVec.set(0, 1, 0);
      const beamRight = perpUp.cross(beamDir).normalize();
      if (beamRight.lengthSq() < 0.01) beamRight.set(1, 0, 0);

      for (let i = 0; i < beamDataSprites.length; i++) {
        const ds = beamDataSprites[i];
        // Each sprite is placed at a different position along the beam
        // and scrolls forward over time
        const baseT = (i + 1) / (beamDataSprites.length + 1);
        const scrollOffset = (seconds * 0.08 + i * 0.13) % 0.3 - 0.15;
        const t = THREE.MathUtils.clamp(
          (baseT + scrollOffset) * laserProgress,
          0.02,
          laserProgress * 0.95,
        );

        const pos = _tmpVec.lerpVectors(_shipNose, state.targetPosition, t);
        // Offset slightly below/right of beam so it doesn't overlap
        const offsetScale = (ringRadii[0] ?? 30) * 0.3;
        pos.addScaledVector(beamRight, offsetScale * 0.5);
        pos.y -= offsetScale * 0.6;
        ds.position.copy(pos);

        const dsMat = ds.material as THREE.SpriteMaterial;
        let dsOp = 0;
        if (laserProgress > 0.1) {
          const fadeIn = Math.min((laserProgress - 0.1) / 0.2, 1);
          dsOp = fadeIn * (0.25 + 0.15 * Math.sin(seconds * 4 + i * 2.1));
        }
        dsMat.opacity = dsOp * masterOpacity;

        const camDist = camera.position.distanceTo(pos);
        const dsScale = THREE.MathUtils.clamp(camDist * 0.008, 2, 18);
        ds.scale.set(dsScale * 6, dsScale * 1.5, 1);
      }
    }

    // ── Flare at beam head ──
    if (flareSprite && laserBeam) {
      const flarePos = _tmpVec.lerpVectors(
        _shipNose,
        state.targetPosition,
        laserProgress,
      );
      flareSprite.position.copy(flarePos);

      const flareMat = flareSprite.material as THREE.SpriteMaterial;
      let flareOp = 0;
      if (laserProgress > 0.02 && laserProgress < 0.98) {
        flareOp = 0.5 + 0.3 * Math.sin(seconds * 8);
      } else if (laserProgress >= 0.98) {
        const lockFlash = Math.max(0, 1 - (elapsed - state.totalDurationMs * 0.6) / 300);
        flareOp = 0.8 * lockFlash;
      }
      flareMat.opacity = flareOp * masterOpacity;

      const camDist = camera.position.distanceTo(flarePos);
      const flareScale = THREE.MathUtils.clamp(camDist * 0.02, 4, 30);
      flareSprite.scale.setScalar(flareScale);
    }

    // ── Trailing beam (dimmer tail behind flare) ──
    if (trailingBeam && laserProgress > 0.05) {
      const trailLen = 0.35;
      const trailStart = Math.max(laserProgress - trailLen, 0);
      const trailEnd = laserProgress;
      const trailA = _tmpVec.lerpVectors(_shipNose, state.targetPosition, trailStart);
      const trailB = _tmpVec2.lerpVectors(_shipNose, state.targetPosition, trailEnd);
      const tPosAttr = trailingBeam.geometry.getAttribute("position") as THREE.BufferAttribute;
      tPosAttr.setXYZ(0, trailA.x, trailA.y, trailA.z);
      tPosAttr.setXYZ(1, trailB.x, trailB.y, trailB.z);
      tPosAttr.needsUpdate = true;
      const tMat = trailingBeam.material as THREE.LineBasicMaterial;
      tMat.opacity = Math.min(laserProgress * 0.4, 0.2) * masterOpacity;
    }

    // ── Lock-on flash ring (expanding pulse at lock moment) ──
    if (lockFlashRing && lockFlashFired) {
      const flashElapsed = performance.now() - lockFlashStartTime;
      const FLASH_DURATION_MS = 450;
      const flashT = Math.min(flashElapsed / FLASH_DURATION_MS, 1);

      lockFlashRing.position.copy(state.targetPosition);
      lockFlashRing.quaternion.copy(_lookQuat);

      // Rapid expansion from 1x to ~2.5x
      const expandScale = 1 + flashT * 1.5;
      lockFlashRing.scale.setScalar(expandScale);

      // Bright start, quick fade
      const flashOp = (1 - flashT) * 0.9;
      (lockFlashRing.material as THREE.LineBasicMaterial).color.copy(lockColor);
      (lockFlashRing.material as THREE.LineBasicMaterial).opacity = flashOp;

      state.lockFlashT = flashT < 1 ? 1 - flashT : 0;

      if (flashT >= 1) {
        lockFlashRing.visible = false;
        state.lockFlashT = 0;
      }
    }

    // ── Camera FOV nudge at lock moment ──
    if (baseCameraFov !== null && camera instanceof THREE.PerspectiveCamera) {
      const nudgeElapsed = performance.now() - lockFlashStartTime;
      const NUDGE_MS = 500;
      if (nudgeElapsed < NUDGE_MS) {
        const nudgeT = nudgeElapsed / NUDGE_MS;
        // Outward bump: 0→peak→0
        const bump = Math.sin(nudgeT * Math.PI) * 2.5;
        camera.fov = baseCameraFov + bump;
        camera.updateProjectionMatrix();
      } else if (nudgeElapsed < NUDGE_MS + 100) {
        // Restore
        camera.fov = baseCameraFov;
        camera.updateProjectionMatrix();
        baseCameraFov = null;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  function fadeOut() {
    if (state.active && state.phase !== "fading" && state.phase !== "done") {
      state.phase = "fading";
      fadeStartTime = performance.now();
      state.lockFlashT = 0;
    }
  }

  function isComplete(): boolean {
    return state.phase === "done";
  }

  function dispose() {
    clearObjects();
    scene.remove(group);
  }

  return {
    state,
    group,
    begin,
    update,
    fadeOut,
    isComplete,
    dispose,
  };
}
