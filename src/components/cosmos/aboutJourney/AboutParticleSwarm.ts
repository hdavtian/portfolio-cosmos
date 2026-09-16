import * as THREE from "three";
import {
  AlignmentBehavior,
  CohesionBehavior,
  EntityManager,
  SeparationBehavior,
  Vehicle,
  WanderBehavior,
  Vector3 as YukaVector3,
} from "yuka";
import { dlog } from "../../../lib/debugLog";
import { AboutJourneyPhase } from "./AboutJourneyController";
import { AboutPathParticles, PULSE_PROFILE_NAMES } from "./AboutPathParticles";
import type { CosmicPathCurve } from "./cosmicRoute";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LEADER_COUNT = 80;
const FOLLOWERS_PER_LEADER = 32;
const TOTAL_PARTICLES = LEADER_COUNT * FOLLOWERS_PER_LEADER; // 2560
const SWARM_RADIUS = 200;

// Excitement phase
const EXCITEMENT_SPEED_MULTIPLIER = 2.5;
const EXCITEMENT_SIZE_MULTIPLIER = 2.2;
const EXCITEMENT_EXTRA_PARTICLES = 800;
const RING_RADIUS = 250;
const RING_CONVERGENCE_SPEED = 2.0;
const FLY_PULL_RADIUS = 420;
const FLY_PULL_FORWARD_DIST = 260;
const FLY_PULL_INWARD_DIST = 95;

const MAX_PARTICLES = TOTAL_PARTICLES + EXCITEMENT_EXTRA_PARTICLES;

const PALETTE = [
  0x9beaff, 0xa7b6ff, 0xb8ffd9, 0xffb8ef, 0xffe2b3, 0xc8b8ff, 0xffa8c8,
  0x88eedd,
];

const VEHICLE_MAX_SPEED = 16;
const VEHICLE_MAX_FORCE = 7;
const NEIGHBORHOOD_RADIUS = 70;

const WANDER_RADIUS = 14;
const WANDER_DISTANCE = 22;
const WANDER_JITTER = 8;

const SEPARATION_WEIGHT = 1.8;
const COHESION_WEIGHT = 0.55;
const ALIGNMENT_WEIGHT = 0.7;
const WANDER_WEIGHT = 0.6;

const CONTAINMENT_RADIUS = SWARM_RADIUS * 1.25;
const CONTAINMENT_STRENGTH = 0.5;

const BREATHING_AMPLITUDE = 0.06;
const BREATHING_SPEED = 0.35;

const FOLLOWER_ORBIT_RADIUS_MIN = 3;
const FOLLOWER_ORBIT_RADIUS_MAX = 22;
const FOLLOWER_SPEED_MIN = 0.6;
const FOLLOWER_SPEED_MAX = 2.8;
const FOLLOWER_DRIFT_SPEED = 0.15;

// Word formation: at rest the swarm spells this word instead of a clump.
const WORD_TEXT = "AMELIA";
const WORD_WIDTH = 400;
const WORD_DEPTH = 14;
/** Follower orbits shrink inside the letters so the glyphs stay legible. */
const WORD_ORBIT_SCALE = 0.22;
const WORD_HOVER_AMPLITUDE = 9;
const WORD_HOVER_SPEED = 0.55;
const WORD_WAVE_AMPLITUDE = 6;
/** How quickly the word turns to face the camera (per second). */
const WORD_FACE_RATE = 2.5;

/** Seconds for the swarm to fade back in at the anchor while the path bursts. */
const REFORM_FADE_SECONDS = 3;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AboutSwarmFrameSignals {
  /** True for a single frame when the cosmic loop first finishes (still in PATH_FORMING). */
  pathLoopCompleteEdge: boolean;
  /** True for a single frame when dispersal has fully finished. */
  dispersalCompleteEdge: boolean;
}

export interface AboutParticleSwarmDebugState {
  activeParticles: number;
  pathHeadT: number;
  pathComplete: boolean;
  holdMode: boolean;
  holdPulseProfileIndex: number;
  holdPulseProfileName: string;
  nextProfileSwitchInMs: number;
}

export interface AboutParticleSwarmHandle {
  readonly group: THREE.Group;
  readonly points: THREE.Points;
  readonly entityManager: EntityManager;
  readonly vehicles: Vehicle[];
  update(
    deltaSeconds: number,
    elapsedSeconds: number,
    phase: AboutJourneyPhase,
    excitementProgress: number,
    ringAxis: THREE.Vector3,
    flyThroughPoint: THREE.Vector3,
    flyThroughDirection: THREE.Vector3,
    flyThroughProgress: number,
    pathCrystallizationProgress: number,
    pathCrystallizationActive: boolean,
    cosmicPath: THREE.CatmullRomCurve3 | null,
    dispersalOriginT?: number,
  ): AboutSwarmFrameSignals;
  getDebugState(): AboutParticleSwarmDebugState;
  forcePathFormationComplete(): void;
  /** Links the path particle shader ahead of time so the first path doesn't stall. */
  compile(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Per-follower metadata
// ---------------------------------------------------------------------------

interface FollowerMeta {
  leaderIndex: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  orbitTiltX: number;
  orbitTiltZ: number;
  driftPhase: number;
  driftAmplitude: number;
  hueDriftSpeed: number;
  baseHue: number;
}

/**
 * Samples points inside the rendered glyphs of `text`, centred on the origin
 * in the XY plane. Returns a flat [x, y, z, ...] array of `count` points.
 */
function sampleWordPoints(text: string, count: number): Float32Array {
  const out = new Float32Array(count * 3);
  if (typeof document === "undefined") return out;

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return out;

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fontSize = 200;
  ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`;
  const measured = ctx.measureText(text).width;
  if (measured > canvas.width * 0.94) {
    fontSize = Math.floor((fontSize * canvas.width * 0.94) / measured);
    ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`;
  }
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const filled: number[] = [];
  let minX = canvas.width;
  let maxX = 0;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (data[(y * canvas.width + x) * 4 + 3] > 128) {
        filled.push(x, y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (filled.length === 0) return out;

  const scale = WORD_WIDTH / Math.max(1, maxX - minX);
  const centerX = (minX + maxX) / 2;
  const pixelCount = filled.length / 2;
  for (let i = 0; i < count; i++) {
    const p = Math.floor(Math.random() * pixelCount) * 2;
    out[i * 3] = (filled[p] + Math.random() * 2 - centerX) * scale;
    out[i * 3 + 1] =
      -(filled[p + 1] + Math.random() * 2 - canvas.height / 2) * scale;
    out[i * 3 + 2] = (Math.random() - 0.5) * WORD_DEPTH;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAboutParticleSwarm(
  anchor: THREE.Vector3,
): AboutParticleSwarmHandle {
  const group = new THREE.Group();
  group.name = "AboutParticleSwarmGroup";
  group.position.copy(anchor);

  // --- Geometry with per-particle size attribute ---
  const positionArray = new Float32Array(MAX_PARTICLES * 3);
  const colorArray = new Float32Array(MAX_PARTICLES * 3);
  const sizeArray = new Float32Array(MAX_PARTICLES);
  const tmpColor = new THREE.Color();

  // Initialize sizes to default
  sizeArray.fill(1.0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positionArray, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(colorArray, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    "particleSize",
    new THREE.BufferAttribute(sizeArray, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setDrawRange(0, TOTAL_PARTICLES);

  const material = new THREE.PointsMaterial({
    size: 4,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });

  dlog(
    "[AboutSwarm] Created with",
    TOTAL_PARTICLES,
    "particles at anchor",
    anchor.toArray(),
  );

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 8;
  group.add(points);

  // Word targets, turned each frame (yaw only) to face the last camera seen.
  const wordPoints = sampleWordPoints(WORD_TEXT, MAX_PARTICLES);
  const _cameraWorld = new THREE.Vector3();
  let _hasCamera = false;
  let _wordYaw = 0;
  points.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldPosition(_cameraWorld);
    _hasCamera = true;
  };

  // The cosmic path stream is a separate GPU-driven points object. The route
  // starts at the swarm, so the group origin is also the route origin.
  const pathParticles = new AboutPathParticles();
  group.add(pathParticles.points);

  // --- Yuka leaders with flocking behaviors ---
  const entityManager = new EntityManager();
  const vehicles: Vehicle[] = [];

  for (let i = 0; i < LEADER_COUNT; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = SWARM_RADIUS * Math.cbrt(Math.random());

    const vehicle = new Vehicle();
    vehicle.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    );
    vehicle.maxSpeed = VEHICLE_MAX_SPEED * (0.7 + Math.random() * 0.6);
    vehicle.maxForce = VEHICLE_MAX_FORCE;
    vehicle.neighborhoodRadius = NEIGHBORHOOD_RADIUS;
    vehicle.updateNeighborhood = true;
    vehicle.updateOrientation = false;

    const separation = new SeparationBehavior();
    separation.weight = SEPARATION_WEIGHT;
    vehicle.steering.add(separation);

    const cohesion = new CohesionBehavior();
    cohesion.weight = COHESION_WEIGHT;
    vehicle.steering.add(cohesion);

    const alignment = new AlignmentBehavior();
    alignment.weight = ALIGNMENT_WEIGHT;
    vehicle.steering.add(alignment);

    const wander = new WanderBehavior(
      WANDER_RADIUS,
      WANDER_DISTANCE,
      WANDER_JITTER,
    );
    wander.weight = WANDER_WEIGHT;
    vehicle.steering.add(wander);

    vehicles.push(vehicle);
    entityManager.add(vehicle);
  }

  // --- Follower metadata ---
  const followers: FollowerMeta[] = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const leaderIndex = i % LEADER_COUNT;
    followers.push({
      leaderIndex,
      orbitRadius:
        FOLLOWER_ORBIT_RADIUS_MIN +
        Math.random() * (FOLLOWER_ORBIT_RADIUS_MAX - FOLLOWER_ORBIT_RADIUS_MIN),
      orbitSpeed:
        FOLLOWER_SPEED_MIN +
        Math.random() * (FOLLOWER_SPEED_MAX - FOLLOWER_SPEED_MIN),
      orbitPhase: Math.random() * Math.PI * 2,
      orbitTiltX: (Math.random() - 0.5) * Math.PI * 0.8,
      orbitTiltZ: (Math.random() - 0.5) * Math.PI * 0.8,
      driftPhase: Math.random() * Math.PI * 2,
      driftAmplitude: 1.5 + Math.random() * 4,
      hueDriftSpeed: 0.015 + Math.random() * 0.04,
      baseHue: (i % PALETTE.length) / PALETTE.length,
    });
  }

  // Initialize positions + colors for swarm particles
  for (let i = 0; i < TOTAL_PARTICLES; i++) {
    const f = followers[i];
    const leader = vehicles[f.leaderIndex];
    positionArray[i * 3] = leader.position.x;
    positionArray[i * 3 + 1] = leader.position.y;
    positionArray[i * 3 + 2] = leader.position.z;
    sizeArray[i] = 0.6 + Math.random() * 0.8;

    tmpColor.setHex(PALETTE[i % PALETTE.length]);
    colorArray[i * 3] = tmpColor.r;
    colorArray[i * 3 + 1] = tmpColor.g;
    colorArray[i * 3 + 2] = tmpColor.b;
  }

  // --- Containment ---
  const _center = new YukaVector3(0, 0, 0);
  const _toCenter = new YukaVector3();

  function applyContainment() {
    for (const v of vehicles) {
      _toCenter.copy(_center).sub(v.position);
      const dist = _toCenter.length();
      if (dist > CONTAINMENT_RADIUS) {
        const overshoot = (dist - CONTAINMENT_RADIUS) / CONTAINMENT_RADIUS;
        _toCenter
          .normalize()
          .multiplyScalar(overshoot * CONTAINMENT_STRENGTH * v.maxForce);
        v.velocity.add(_toCenter);
      }
    }
  }

  let _prevPhase: AboutJourneyPhase = AboutJourneyPhase.IDLE;
  let _begunPath: THREE.CatmullRomCurve3 | null = null;
  let _reformElapsed = 0;

  // --- Update ---
  let _updateLogCounter = 0;

  function update(
    deltaSeconds: number,
    elapsedSeconds: number,
    phase: AboutJourneyPhase,
    excitementProgress: number,
    ringAxis: THREE.Vector3,
    flyThroughPoint: THREE.Vector3,
    flyThroughDirection: THREE.Vector3,
    flyThroughProgress: number,
    pathCrystallizationProgress: number,
    _pathCrystallizationActive: boolean,
    cosmicPath: THREE.CatmullRomCurve3 | null,
    dispersalOriginT = 0,
  ): AboutSwarmFrameSignals {
    _updateLogCounter++;
    if (_updateLogCounter % 300 === 1) {
      dlog(
        "[AboutSwarm] update tick",
        _updateLogCounter,
        "phase=",
        phase,
        "pos=",
        group.position.toArray(),
        "drawRange=",
        geometry.drawRange.count,
        "inScene=",
        !!group.parent,
      );
    }
    const clampedDelta = Math.min(deltaSeconds, 0.05);
    faceCamera(clampedDelta);

    // Start on a new route, not on the PATH_FORMING edge: a skip can jump
    // past PATH_FORMING before this update ever sees it.
    if (
      cosmicPath &&
      cosmicPath !== _begunPath &&
      (cosmicPath as CosmicPathCurve).timing &&
      phase >= AboutJourneyPhase.PATH_FORMING &&
      phase <= AboutJourneyPhase.PATH_TRAVEL
    ) {
      _begunPath = cosmicPath;
      pathParticles.begin(cosmicPath as CosmicPathCurve, group.position);
      if (phase !== AboutJourneyPhase.PATH_FORMING) {
        pathParticles.forceComplete();
      }
    }
    if (
      phase === AboutJourneyPhase.PATH_DISPERSING &&
      _prevPhase !== AboutJourneyPhase.PATH_DISPERSING
    ) {
      pathParticles.burst(dispersalOriginT);
      _reformElapsed = 0;
    }
    if (
      phase === AboutJourneyPhase.IDLE &&
      _prevPhase !== AboutJourneyPhase.IDLE
    ) {
      pathParticles.reset();
      material.opacity = 1;
    }

    let activeCount = TOTAL_PARTICLES;
    let pathLoopCompleteEdge = false;
    let dispersalCompleteEdge = false;

    if (phase === AboutJourneyPhase.FLY_THROUGH) {
      // Falcon pass-through wake: agitated swarm + directional drag.
      for (const v of vehicles) {
        v.maxSpeed = VEHICLE_MAX_SPEED * 1.5;
      }
      entityManager.update(clampedDelta);
      applyContainment();
      updateFlyThroughSwarm(
        positionArray,
        colorArray,
        sizeArray,
        TOTAL_PARTICLES,
        elapsedSeconds,
        1.0,
        flyThroughPoint,
        flyThroughDirection,
        flyThroughProgress,
      );
    } else if (phase === AboutJourneyPhase.EXCITEMENT) {
      const extraParticles = Math.floor(
        excitementProgress * EXCITEMENT_EXTRA_PARTICLES,
      );
      activeCount = TOTAL_PARTICLES + extraParticles;
      const sizeBase =
        1.0 + excitementProgress * (EXCITEMENT_SIZE_MULTIPLIER - 1.0);
      const speedMult =
        1.0 + excitementProgress * (EXCITEMENT_SPEED_MULTIPLIER - 1.0);
      for (const v of vehicles) {
        v.maxSpeed = VEHICLE_MAX_SPEED * speedMult;
      }
      entityManager.update(clampedDelta);
      applyContainment();

      if (excitementProgress > 0.33) {
        updateRingFormation(
          positionArray,
          colorArray,
          sizeArray,
          activeCount,
          elapsedSeconds,
          excitementProgress,
          ringAxis,
          flyThroughPoint,
          sizeBase,
        );
      } else {
        updateNormalSwarm(
          positionArray,
          colorArray,
          sizeArray,
          activeCount,
          elapsedSeconds,
          sizeBase,
        );
      }
    } else if (
      phase === AboutJourneyPhase.PATH_FORMING ||
      phase === AboutJourneyPhase.PATH_READY ||
      phase === AboutJourneyPhase.PATH_TRAVEL
    ) {
      // The swarm has become the path; only the GPU stream is drawn.
      activeCount = 0;
      const frame = pathParticles.update(
        clampedDelta,
        elapsedSeconds,
        phase !== AboutJourneyPhase.PATH_FORMING,
        pathCrystallizationProgress,
      );
      pathLoopCompleteEdge =
        frame.loopCompleteEdge && phase === AboutJourneyPhase.PATH_FORMING;
    } else if (phase === AboutJourneyPhase.PATH_DISPERSING) {
      if (pathParticles.active) {
        const frame = pathParticles.update(
          clampedDelta,
          elapsedSeconds,
          true,
          1,
        );
        dispersalCompleteEdge = frame.burstCompleteEdge;
      } else {
        dispersalCompleteEdge = true;
      }
      // The swarm fades back in at its anchor while the path bursts.
      _reformElapsed += clampedDelta;
      material.opacity = THREE.MathUtils.smoothstep(
        _reformElapsed / REFORM_FADE_SECONDS,
        0,
        1,
      );
      entityManager.update(clampedDelta);
      applyContainment();
      updateNormalSwarm(
        positionArray,
        colorArray,
        sizeArray,
        TOTAL_PARTICLES,
        elapsedSeconds,
        1.0,
      );
    } else {
      // IDLE / TRANSIT — normal swarming
      entityManager.update(clampedDelta);
      applyContainment();
      updateNormalSwarm(
        positionArray,
        colorArray,
        sizeArray,
        TOTAL_PARTICLES,
        elapsedSeconds,
        1.0,
      );
    }

    geometry.setDrawRange(0, activeCount);
    if (activeCount > 0) {
      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
        true;
      (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.particleSize as THREE.BufferAttribute).needsUpdate =
        true;
    }

    _prevPhase = phase;

    return { pathLoopCompleteEdge, dispersalCompleteEdge };
  }

  function updateFlyThroughSwarm(
    posArr: Float32Array,
    colArr: Float32Array,
    szArr: Float32Array,
    count: number,
    elapsed: number,
    sizeBase: number,
    flyPoint: THREE.Vector3,
    flyDir: THREE.Vector3,
    flyProgress: number,
  ) {
    updateNormalSwarm(posArr, colArr, szArr, count, elapsed, sizeBase);

    const cross = Math.exp(-Math.pow((flyProgress - 0.54) / 0.17, 2));
    const dirLenSq = flyDir.lengthSq();
    if (cross <= 0.001 || dirLenSq < 0.0001) return;

    const groupPos = group.position;
    const dirX = flyDir.x;
    const dirY = flyDir.y;
    const dirZ = flyDir.z;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      const wx = posArr[i3] + groupPos.x;
      const wy = posArr[i3 + 1] + groupPos.y;
      const wz = posArr[i3 + 2] + groupPos.z;

      const toPx = flyPoint.x - wx;
      const toPy = flyPoint.y - wy;
      const toPz = flyPoint.z - wz;
      const dist = Math.sqrt(toPx * toPx + toPy * toPy + toPz * toPz);
      if (dist >= FLY_PULL_RADIUS) continue;

      const localWeight = Math.pow(1 - dist / FLY_PULL_RADIUS, 1.65) * cross;
      const inwardScale =
        (FLY_PULL_INWARD_DIST * localWeight) / Math.max(dist, 1e-5);

      posArr[i3] +=
        dirX * FLY_PULL_FORWARD_DIST * localWeight + toPx * inwardScale;
      posArr[i3 + 1] +=
        dirY * FLY_PULL_FORWARD_DIST * localWeight + toPy * inwardScale;
      posArr[i3 + 2] +=
        dirZ * FLY_PULL_FORWARD_DIST * localWeight + toPz * inwardScale;

      szArr[i] *= 1 + localWeight * 1.25;
    }
  }

  // --- Word formation ---
  const _home = new THREE.Vector3();

  /** Eases the word's yaw toward the camera, keeping the letters upright. */
  function faceCamera(delta: number) {
    if (!_hasCamera) return;
    const dx = _cameraWorld.x - group.position.x;
    const dz = _cameraWorld.z - group.position.z;
    if (dx * dx + dz * dz < 1) return;
    const target = Math.atan2(dx, dz);
    let diff = target - _wordYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    _wordYaw += diff * Math.min(1, delta * WORD_FACE_RATE);
  }

  /** Writes particle i's hovering spot inside the word into `_home`. */
  function wordHome(i: number, elapsed: number, scale: number) {
    const f = followers[i];
    const i3 = i * 3;
    const wx = wordPoints[i3];
    const hover =
      Math.sin(elapsed * WORD_HOVER_SPEED) * WORD_HOVER_AMPLITUDE +
      Math.sin(elapsed * 1.3 + wx * 0.02) * WORD_WAVE_AMPLITUDE;
    const x = wx * scale;
    const y = wordPoints[i3 + 1] * scale + hover;
    const z =
      wordPoints[i3 + 2] * scale +
      Math.sin(elapsed * 0.7 + f.driftPhase) * f.driftAmplitude;
    const cosY = Math.cos(_wordYaw);
    const sinY = Math.sin(_wordYaw);
    _home.set(x * cosY + z * sinY, y, -x * sinY + z * cosY);
  }

  // --- Normal swarming ---
  function updateNormalSwarm(
    posArr: Float32Array,
    colArr: Float32Array,
    szArr: Float32Array,
    count: number,
    elapsed: number,
    sizeBase: number,
  ) {
    const breathScale =
      1.0 + Math.sin(elapsed * BREATHING_SPEED) * BREATHING_AMPLITUDE;

    for (let i = 0; i < count; i++) {
      const f = followers[i];
      const i3 = i * 3;

      const angle = f.orbitPhase + elapsed * f.orbitSpeed;
      const drift =
        Math.sin(elapsed * FOLLOWER_DRIFT_SPEED + f.driftPhase) *
        f.driftAmplitude;
      const r = f.orbitRadius + drift;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const cosTX = Math.cos(f.orbitTiltX);
      const sinTX = Math.sin(f.orbitTiltX);
      const cosTZ = Math.cos(f.orbitTiltZ);
      const sinTZ = Math.sin(f.orbitTiltZ);

      const ox = cosA * r;
      const oy = sinA * r;
      const oz = sinA * cosA * r * 0.3;
      const oy1 = oy * cosTX - oz * sinTX;
      const oz1 = oy * sinTX + oz * cosTX;
      const ox1 = ox * cosTZ - oy1 * sinTZ;
      const oy2 = ox * sinTZ + oy1 * cosTZ;

      wordHome(i, elapsed, breathScale);
      posArr[i3] = _home.x + ox1 * WORD_ORBIT_SCALE;
      posArr[i3 + 1] = _home.y + oy2 * WORD_ORBIT_SCALE;
      posArr[i3 + 2] = _home.z + oz1 * WORD_ORBIT_SCALE;

      szArr[i] = sizeBase * (0.5 + Math.random() * 0.5);

      const driftedHue = (f.baseHue + elapsed * f.hueDriftSpeed) % 1.0;
      tmpColor.setHSL(
        driftedHue,
        0.65 + Math.sin(angle * 0.5) * 0.15,
        0.6 + Math.sin(elapsed * 0.8 + f.orbitPhase) * 0.12,
      );
      colArr[i3] = tmpColor.r;
      colArr[i3 + 1] = tmpColor.g;
      colArr[i3 + 2] = tmpColor.b;
    }
  }

  // --- Ring formation (EXCITEMENT) ---
  const _ringRight = new THREE.Vector3();
  const _ringTangent = new THREE.Vector3();
  const _ringBitangent = new THREE.Vector3();
  const _ringCenter = new THREE.Vector3();

  function updateRingFormation(
    posArr: Float32Array,
    colArr: Float32Array,
    szArr: Float32Array,
    count: number,
    elapsed: number,
    excProg: number,
    ringAxis: THREE.Vector3,
    flyThroughPoint: THREE.Vector3,
    sizeBase: number,
  ) {
    const ringBlend = Math.min(
      1,
      ((excProg - 0.33) / 0.67) * RING_CONVERGENCE_SPEED,
    );
    const up = ringAxis;
    const right = _ringRight.set(1, 0, 0);
    if (Math.abs(up.dot(right)) > 0.95) right.set(0, 0, 1);
    const tangent = _ringTangent.crossVectors(up, right).normalize();
    const bitangent = _ringBitangent.crossVectors(tangent, up).normalize();
    const localFTP = _ringCenter.copy(flyThroughPoint).sub(group.position);
    const rotSpeed = 0.3 + excProg * 0.5;

    for (let i = 0; i < count; i++) {
      const f = followers[i];
      const i3 = i * 3;

      const angle = f.orbitPhase + elapsed * f.orbitSpeed;
      const drift =
        Math.sin(elapsed * FOLLOWER_DRIFT_SPEED + f.driftPhase) *
        f.driftAmplitude;
      const r = f.orbitRadius + drift;
      wordHome(i, elapsed, 1);
      const orbitR = r * WORD_ORBIT_SCALE;
      const swarmX = _home.x + Math.cos(angle) * orbitR;
      const swarmY = _home.y + Math.sin(angle) * orbitR;
      const swarmZ = _home.z + Math.sin(angle) * Math.cos(angle) * orbitR * 0.3;

      const ringAngle = (i / count) * Math.PI * 2 + elapsed * rotSpeed;
      const ringR = RING_RADIUS + Math.sin(i * 0.1 + elapsed) * 15;
      const ringX =
        localFTP.x +
        (tangent.x * Math.cos(ringAngle) + bitangent.x * Math.sin(ringAngle)) *
          ringR;
      const ringY =
        localFTP.y +
        (tangent.y * Math.cos(ringAngle) + bitangent.y * Math.sin(ringAngle)) *
          ringR;
      const ringZ =
        localFTP.z +
        (tangent.z * Math.cos(ringAngle) + bitangent.z * Math.sin(ringAngle)) *
          ringR;

      posArr[i3] = swarmX + (ringX - swarmX) * ringBlend;
      posArr[i3 + 1] = swarmY + (ringY - swarmY) * ringBlend;
      posArr[i3 + 2] = swarmZ + (ringZ - swarmZ) * ringBlend;

      szArr[i] =
        sizeBase *
        (0.6 + excProg * 1.2 + Math.sin(elapsed * 3 + f.orbitPhase) * 0.4);

      const driftedHue = (f.baseHue + elapsed * f.hueDriftSpeed * 2) % 1.0;
      tmpColor.setHSL(
        driftedHue,
        0.75 + excProg * 0.2,
        0.65 + excProg * 0.15 + Math.sin(elapsed * 2 + f.orbitPhase) * 0.1,
      );
      colArr[i3] = tmpColor.r;
      colArr[i3 + 1] = tmpColor.g;
      colArr[i3 + 2] = tmpColor.b;
    }
  }

  // --- Cleanup ---
  function getDebugState(): AboutParticleSwarmDebugState {
    const path = pathParticles.getDebugState();
    return {
      activeParticles: path.particleCount,
      pathHeadT: path.headT,
      pathComplete: path.complete,
      holdMode: path.hold,
      holdPulseProfileIndex: path.profileIndex,
      holdPulseProfileName:
        PULSE_PROFILE_NAMES[path.profileIndex] ??
        `Profile ${path.profileIndex + 1}`,
      nextProfileSwitchInMs: path.nextProfileSwitchInMs,
    };
  }

  function forcePathFormationComplete() {
    // Skip should jump to the formed crystal rail state without waiting for
    // the streaming phase to finish naturally.
    pathParticles.forceComplete();
  }

  function compile(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    pathParticles.compile(renderer, scene, camera);
  }

  function dispose() {
    pathParticles.dispose();
    geometry.dispose();
    material.dispose();
    entityManager.clear();
    vehicles.length = 0;
    followers.length = 0;
    if (group.parent) group.parent.remove(group);
  }

  return {
    group,
    points,
    entityManager,
    vehicles,
    update,
    getDebugState,
    forcePathFormationComplete,
    compile,
    dispose,
  };
}
