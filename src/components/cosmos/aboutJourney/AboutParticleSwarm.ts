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

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LEADER_COUNT = 80;
const FOLLOWERS_PER_LEADER = 32;
const TOTAL_PARTICLES = LEADER_COUNT * FOLLOWERS_PER_LEADER; // 2560
const SWARM_RADIUS = 200;

// Path trail needs many more particles for density + continuous emission
const PATH_POOL_SIZE = 12_000;
const MAX_PARTICLES = Math.max(TOTAL_PARTICLES + 800, PATH_POOL_SIZE);

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

// Excitement phase
const EXCITEMENT_SPEED_MULTIPLIER = 2.5;
const EXCITEMENT_SIZE_MULTIPLIER = 2.2;
const EXCITEMENT_EXTRA_PARTICLES = 800;
const RING_RADIUS = 250;
const RING_CONVERGENCE_SPEED = 2.0;
const FLY_PULL_RADIUS = 420;
const FLY_PULL_FORWARD_DIST = 260;
const FLY_PULL_INWARD_DIST = 95;

// Path trail
const PATH_HEAD_SPEED = 3500;
const PATH_TRAIL_RADIUS = 35;
const PATH_EMISSION_RATE = 1200; // particles per second from origin (doubled for denser path)
const PATH_PARTICLE_MIN_SPEED = 0.6;
const PATH_PARTICLE_MAX_SPEED = 1.4;
const PATH_PARTICLE_SIZE_MIN = 0.4;
const PATH_PARTICLE_SIZE_MAX = 2.8;
const PATH_HOLD_PARTICLE_COUNT = 10_400;
const PATH_HOLD_PROFILE_DWELL_MIN_MS = 7000;
const PATH_HOLD_PROFILE_DWELL_MAX_MS = 16000;
const PATH_HOLD_PROFILE_BLEND_MS = 1800;

// Path dispersal (burst + fade)
const DISPERSAL_SPEED_MIN = 260;
const DISPERSAL_SPEED_MAX = 760;
const DISPERSAL_SIZE_DECAY = 0.34;
const DISPERSAL_MAX_DURATION_S = 13.5;

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
  ): AboutSwarmFrameSignals;
  getDebugState(): AboutParticleSwarmDebugState;
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

// ---------------------------------------------------------------------------
// Per-path-particle metadata (for electricity flow)
// ---------------------------------------------------------------------------

interface PathParticle {
  alive: boolean;
  pathT: number; // current position along path [0, 1]
  speed: number; // flow speed multiplier
  size: number; // particle size
  hue: number; // color hue
  radialAngle: number; // angle for trail spread
  radialDist: number; // distance from path center
  /** Local-space velocity during PATH_DISPERSING (units / sec). */
  vx: number;
  vy: number;
  vz: number;
}

interface HoldPulseProfile {
  mode: "max" | "avg";
  timeA: number;
  spatialA: number;
  phaseA: number;
  timeB: number;
  spatialB: number;
  phaseB: number;
  surgeTime: number;
  surgeSpatial: number;
  surgePhase: number;
  surgePow: number;
  surgeWeight: number;
  sizeBase: number;
  sizeAmp: number;
  brightnessBase: number;
  brightnessAmp: number;
  saturationBase: number;
  saturationAmp: number;
}

const HOLD_PULSE_PROFILES: HoldPulseProfile[] = [
  // 1) Slower majestic pulse.
  {
    mode: "avg",
    timeA: 2.1,
    spatialA: 34,
    phaseA: 0.1,
    timeB: 2.9,
    spatialB: 47,
    phaseB: 1.7,
    surgeTime: 0.22,
    surgeSpatial: 12,
    surgePhase: 0,
    surgePow: 6,
    surgeWeight: 0.1,
    sizeBase: 0.98,
    sizeAmp: 0.56,
    brightnessBase: 0.5,
    brightnessAmp: 0.22,
    saturationBase: 0.7,
    saturationAmp: 0.14,
  },
  // 2) Faster conduit energy.
  {
    mode: "max",
    timeA: 5.8,
    spatialA: 86,
    phaseA: 0.5,
    timeB: 7.4,
    spatialB: 126,
    phaseB: 2.3,
    surgeTime: 0.5,
    surgeSpatial: 26,
    surgePhase: 1.2,
    surgePow: 3.2,
    surgeWeight: 0.22,
    sizeBase: 0.92,
    sizeAmp: 0.92,
    brightnessBase: 0.5,
    brightnessAmp: 0.32,
    saturationBase: 0.72,
    saturationAmp: 0.2,
  },
  // 3) Subtle glow with occasional surges.
  {
    mode: "avg",
    timeA: 1.35,
    spatialA: 28,
    phaseA: 0.2,
    timeB: 1.9,
    spatialB: 42,
    phaseB: 2.9,
    surgeTime: 0.16,
    surgeSpatial: 8,
    surgePhase: 0.7,
    surgePow: 9,
    surgeWeight: 0.35,
    sizeBase: 0.95,
    sizeAmp: 0.48,
    brightnessBase: 0.48,
    brightnessAmp: 0.2,
    saturationBase: 0.68,
    saturationAmp: 0.12,
  },
];

const HOLD_PULSE_PROFILE_NAMES = [
  "Majestic Wave",
  "Conduit Surge",
  "Subtle Glow",
] as const;

function randomHoldProfileIndex(exclude: number): number {
  if (HOLD_PULSE_PROFILES.length <= 1) return 0;
  let idx = Math.floor(Math.random() * HOLD_PULSE_PROFILES.length);
  if (idx === exclude) {
    idx =
      (idx + 1 + Math.floor(Math.random() * (HOLD_PULSE_PROFILES.length - 1))) %
      HOLD_PULSE_PROFILES.length;
  }
  return idx;
}

function randomHoldProfileDwellMs(): number {
  return (
    PATH_HOLD_PROFILE_DWELL_MIN_MS +
    Math.random() *
      (PATH_HOLD_PROFILE_DWELL_MAX_MS - PATH_HOLD_PROFILE_DWELL_MIN_MS)
  );
}

function sampleHoldPulse(
  profile: HoldPulseProfile,
  elapsed: number,
  t: number,
): number {
  const waveA =
    Math.sin(elapsed * profile.timeA - t * profile.spatialA + profile.phaseA) *
      0.5 +
    0.5;
  const waveB =
    Math.sin(elapsed * profile.timeB - t * profile.spatialB + profile.phaseB) *
      0.5 +
    0.5;
  const base =
    profile.mode === "max" ? Math.max(waveA, waveB) : (waveA + waveB) * 0.5;
  const surgeRaw =
    Math.sin(
      elapsed * profile.surgeTime -
        t * profile.surgeSpatial +
        profile.surgePhase,
    ) *
      0.5 +
    0.5;
  const surge = Math.pow(surgeRaw, profile.surgePow) * profile.surgeWeight;
  return THREE.MathUtils.clamp(base + surge, 0, 1);
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

  // --- Path particle pool ---
  const pathParticles: PathParticle[] = [];
  for (let i = 0; i < PATH_POOL_SIZE; i++) {
    pathParticles.push({
      alive: false,
      pathT: 0,
      speed:
        PATH_PARTICLE_MIN_SPEED +
        Math.random() * (PATH_PARTICLE_MAX_SPEED - PATH_PARTICLE_MIN_SPEED),
      size:
        PATH_PARTICLE_SIZE_MIN +
        Math.random() * (PATH_PARTICLE_SIZE_MAX - PATH_PARTICLE_SIZE_MIN),
      hue: Math.random(),
      radialAngle: Math.random() * Math.PI * 2,
      radialDist: Math.random() * PATH_TRAIL_RADIUS,
      vx: 0,
      vy: 0,
      vz: 0,
    });
  }
  let _pathHeadT = 0;
  let _pathEmitAccum = 0;
  let _pathComplete = false;
  let _pathHoldLatched = false;
  let _pathActiveCount = 0;
  let _holdPulseProfileIndex = 0;
  let _holdPulsePrevProfileIndex = 0;
  let _holdPulseBlendStartedAtMs = 0;
  let _holdPulseBlendUntilMs = 0;
  let _holdPulseSwitchAtMs = 0;
  let _prevPhase: AboutJourneyPhase = AboutJourneyPhase.IDLE;
  let _dispersalStartedAtMs = 0;
  let _dispersalSeeded = false;
  let _dispersalEndSignaled = false;

  // --- Update ---
  let _updateLogCounter = 0;

  function resetPathTrailState() {
    _pathHeadT = 0;
    _pathComplete = false;
    _pathEmitAccum = 0;
    _pathHoldLatched = false;
    _holdPulseProfileIndex = Math.floor(
      Math.random() * HOLD_PULSE_PROFILES.length,
    );
    _holdPulsePrevProfileIndex = _holdPulseProfileIndex;
    _holdPulseBlendStartedAtMs = 0;
    _holdPulseBlendUntilMs = 0;
    _holdPulseSwitchAtMs = performance.now() + randomHoldProfileDwellMs();
    _dispersalSeeded = false;
    _dispersalEndSignaled = false;
    for (const pp of pathParticles) {
      pp.alive = false;
      pp.vx = 0;
      pp.vy = 0;
      pp.vz = 0;
    }
  }

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
    pathCrystallizationActive: boolean,
    cosmicPath: THREE.CatmullRomCurve3 | null,
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

    if (
      phase === AboutJourneyPhase.PATH_FORMING &&
      _prevPhase !== AboutJourneyPhase.PATH_FORMING
    ) {
      resetPathTrailState();
    }

    const wasPathIncomplete = !_pathComplete;

    let activeCount = TOTAL_PARTICLES;
    let sizeBase = 1.0;
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
      sizeBase = 1.0 + excitementProgress * (EXCITEMENT_SIZE_MULTIPLIER - 1.0);
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
      // PATH_FORMING: emit stream; PATH_READY/PATH_TRAVEL: hold completed path (no new particles)
      activeCount = updatePathTrail(
        positionArray,
        colorArray,
        sizeArray,
        clampedDelta,
        elapsedSeconds,
        cosmicPath,
        phase === AboutJourneyPhase.PATH_FORMING,
        pathCrystallizationProgress,
        pathCrystallizationActive,
      );
    } else if (phase === AboutJourneyPhase.PATH_DISPERSING) {
      const disperse = updatePathDispersal(
        positionArray,
        colorArray,
        sizeArray,
        clampedDelta,
        cosmicPath,
      );
      activeCount = disperse.activeCount;
      dispersalCompleteEdge = disperse.dispersalCompleteEdge;
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
    (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.particleSize as THREE.BufferAttribute).needsUpdate =
      true;

    const pathLoopCompleteEdge =
      wasPathIncomplete &&
      _pathComplete &&
      phase === AboutJourneyPhase.PATH_FORMING;

    _pathActiveCount = activeCount;

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
      const leader = vehicles[f.leaderIndex];
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

      posArr[i3] = (leader.position.x + ox1) * breathScale;
      posArr[i3 + 1] = (leader.position.y + oy2) * breathScale;
      posArr[i3 + 2] = (leader.position.z + oz1) * breathScale;

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
    const right = new THREE.Vector3(1, 0, 0);
    if (Math.abs(up.dot(right)) > 0.95) right.set(0, 0, 1);
    const tangent = new THREE.Vector3().crossVectors(up, right).normalize();
    const bitangent = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const localFTP = flyThroughPoint.clone().sub(group.position);
    const rotSpeed = 0.3 + excProg * 0.5;

    for (let i = 0; i < count; i++) {
      const f = followers[i];
      const leader = vehicles[f.leaderIndex];
      const i3 = i * 3;

      const angle = f.orbitPhase + elapsed * f.orbitSpeed;
      const drift =
        Math.sin(elapsed * FOLLOWER_DRIFT_SPEED + f.driftPhase) *
        f.driftAmplitude;
      const r = f.orbitRadius + drift;
      const swarmX = leader.position.x + Math.cos(angle) * r;
      const swarmY = leader.position.y + Math.sin(angle) * r;
      const swarmZ =
        leader.position.z + Math.sin(angle) * Math.cos(angle) * r * 0.3;

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

  // --- Path trail: continuous emission with electricity flow ---
  function updatePathTrail(
    posArr: Float32Array,
    colArr: Float32Array,
    szArr: Float32Array,
    dt: number,
    elapsed: number,
    cosmicPath: THREE.CatmullRomCurve3 | null,
    allowEmit: boolean,
    crystallizationProgress: number,
    crystallizationActive: boolean,
  ): number {
    if (!cosmicPath) return 0;

    const pathLength = cosmicPath.getLength();

    // Advance head along the path
    if (!_pathComplete) {
      _pathHeadT += (PATH_HEAD_SPEED * dt) / pathLength;
      if (_pathHeadT >= 1.0) {
        _pathHeadT = 1.0;
        _pathComplete = true;
      }
    }

    // Emit new particles from origin (only while the path is still forming)
    if (allowEmit) {
      _pathEmitAccum += PATH_EMISSION_RATE * dt;
      while (_pathEmitAccum >= 1) {
        _pathEmitAccum -= 1;
        for (let pi = 0; pi < pathParticles.length; pi++) {
          const pp = pathParticles[pi];
          if (!pp.alive) {
            pp.alive = true;
            pp.pathT = 0;
            pp.speed =
              PATH_PARTICLE_MIN_SPEED +
              Math.random() *
                (PATH_PARTICLE_MAX_SPEED - PATH_PARTICLE_MIN_SPEED);
            pp.size =
              PATH_PARTICLE_SIZE_MIN +
              Math.random() * (PATH_PARTICLE_SIZE_MAX - PATH_PARTICLE_SIZE_MIN);
            pp.hue = Math.random();
            pp.radialAngle = Math.random() * Math.PI * 2;
            pp.radialDist = Math.pow(Math.random(), 0.5) * PATH_TRAIL_RADIUS;
            pp.vx = 0;
            pp.vy = 0;
            pp.vz = 0;
            break;
          }
        }
      }
    }

    // Once the loop is complete, lock into a stable closed path so the beam
    // persists while light pulses travel through it.
    if (_pathComplete && !allowEmit && !_pathHoldLatched) {
      const holdCount = Math.min(
        PATH_HOLD_PARTICLE_COUNT,
        pathParticles.length,
      );
      for (let pi = 0; pi < holdCount; pi++) {
        const pp = pathParticles[pi];
        pp.alive = true;
        pp.pathT = (pi + Math.random() * 0.35) / holdCount;
        pp.speed = 1;
        pp.size =
          PATH_PARTICLE_SIZE_MIN +
          Math.random() * (PATH_PARTICLE_SIZE_MAX - PATH_PARTICLE_SIZE_MIN);
        pp.hue = Math.random();
        pp.radialAngle = Math.random() * Math.PI * 2;
        pp.radialDist = Math.pow(Math.random(), 0.6) * PATH_TRAIL_RADIUS;
      }
      for (let pi = holdCount; pi < pathParticles.length; pi++) {
        pathParticles[pi].alive = false;
      }
      const now = performance.now();
      _holdPulseProfileIndex = Math.floor(
        Math.random() * HOLD_PULSE_PROFILES.length,
      );
      _holdPulsePrevProfileIndex = _holdPulseProfileIndex;
      _holdPulseBlendStartedAtMs = now;
      _holdPulseBlendUntilMs = now;
      _holdPulseSwitchAtMs = now + randomHoldProfileDwellMs();
      _pathHoldLatched = true;
    }

    // Update alive particles: flow along path toward the head
    let activeCount = 0;
    const groupPos = group.position;

    for (let pi = 0; pi < pathParticles.length; pi++) {
      const pp = pathParticles[pi];
      if (!pp.alive) continue;

      const holdMode = _pathComplete && !allowEmit;
      const stableCrystalMode = holdMode;

      // During path-forming, particles stream from origin toward head.
      if (!holdMode) {
        pp.pathT += (pp.speed * PATH_HEAD_SPEED * dt) / pathLength;
      }

      // If particle passes head during forming, recycle from origin.
      if (!holdMode && pp.pathT > _pathHeadT) {
        pp.pathT = 0;
      }

      const clampedT = Math.max(0, Math.min(1, pp.pathT));
      const pathPoint = cosmicPath.getPointAt(clampedT);

      // Perpendicular spread for trail width (rotating for electricity feel)
      const spreadAngle = stableCrystalMode
        ? pp.radialAngle + clampedT * 1.8
        : pp.radialAngle + elapsed * 1.5 + clampedT * 8;

      if (stableCrystalMode) {
        const targetRadial = PATH_TRAIL_RADIUS * 0.12;
        const crystalBlend = crystallizationActive
          ? THREE.MathUtils.clamp(crystallizationProgress, 0, 1)
          : 1;
        pp.radialDist = THREE.MathUtils.lerp(
          pp.radialDist,
          targetRadial,
          0.08 + crystalBlend * 0.28,
        );
      }

      const r = stableCrystalMode
        ? pp.radialDist
        : pp.radialDist *
          (0.3 + 0.7 * Math.sin(elapsed * 4 + pi * 0.3) * 0.5 + 0.5);

      const i3 = activeCount * 3;
      posArr[i3] = pathPoint.x - groupPos.x + Math.cos(spreadAngle) * r;
      posArr[i3 + 1] = pathPoint.y - groupPos.y + Math.sin(spreadAngle) * r;
      posArr[i3 + 2] =
        pathPoint.z - groupPos.z + Math.cos(spreadAngle + 1.57) * r;

      // Size + color: forming mode highlights the spear head, hold mode keeps
      // a stable beam with pulse waves running around the loop.
      const headProximity = holdMode
        ? 0
        : 1.0 - Math.min(1.0, Math.abs(clampedT - _pathHeadT) * 15);
      let pulse = Math.sin(elapsed * 3.2 - clampedT * 58) * 0.5 + 0.5;

      if (holdMode) {
        const now = performance.now();
        if (now >= _holdPulseSwitchAtMs) {
          _holdPulsePrevProfileIndex = _holdPulseProfileIndex;
          _holdPulseProfileIndex = randomHoldProfileIndex(
            _holdPulseProfileIndex,
          );
          _holdPulseBlendStartedAtMs = now;
          _holdPulseBlendUntilMs = now + PATH_HOLD_PROFILE_BLEND_MS;
          _holdPulseSwitchAtMs = now + randomHoldProfileDwellMs();
        }

        const activeProfile = HOLD_PULSE_PROFILES[_holdPulseProfileIndex];
        const activePulse = sampleHoldPulse(activeProfile, elapsed, clampedT);
        if (
          now < _holdPulseBlendUntilMs &&
          _holdPulsePrevProfileIndex !== _holdPulseProfileIndex
        ) {
          const prevProfile = HOLD_PULSE_PROFILES[_holdPulsePrevProfileIndex];
          const prevPulse = sampleHoldPulse(prevProfile, elapsed, clampedT);
          const blendT = THREE.MathUtils.smootherstep(
            (now - _holdPulseBlendStartedAtMs) /
              Math.max(1, _holdPulseBlendUntilMs - _holdPulseBlendStartedAtMs),
            0,
            1,
          );
          pulse = THREE.MathUtils.lerp(prevPulse, activePulse, blendT);
        } else {
          pulse = activePulse;
        }

        szArr[activeCount] =
          pp.size * (activeProfile.sizeBase + pulse * activeProfile.sizeAmp);
      } else {
        szArr[activeCount] = pp.size * (1.0 + headProximity * 1.5);
      }

      const shimmer = Math.sin(elapsed * 6 + clampedT * 40) * 0.5 + 0.5;
      const activeProfile = holdMode
        ? HOLD_PULSE_PROFILES[_holdPulseProfileIndex]
        : null;
      const brightness = holdMode
        ? activeProfile!.brightnessBase +
          pulse * activeProfile!.brightnessAmp +
          shimmer * 0.08
        : 0.55 + headProximity * 0.35 + shimmer * 0.1;
      const saturation = holdMode
        ? activeProfile!.saturationBase + pulse * activeProfile!.saturationAmp
        : 0.7 + headProximity * 0.25;
      const hue = (pp.hue + clampedT * 0.15 + elapsed * 0.01) % 1.0;
      tmpColor.setHSL(hue, saturation, brightness);
      colArr[i3] = tmpColor.r;
      colArr[i3 + 1] = tmpColor.g;
      colArr[i3 + 2] = tmpColor.b;

      activeCount++;
    }

    return activeCount;
  }

  function updatePathDispersal(
    posArr: Float32Array,
    colArr: Float32Array,
    szArr: Float32Array,
    dt: number,
    cosmicPath: THREE.CatmullRomCurve3 | null,
  ): { activeCount: number; dispersalCompleteEdge: boolean } {
    if (!_dispersalSeeded) {
      _dispersalSeeded = true;
      _dispersalStartedAtMs = performance.now();
      _dispersalEndSignaled = false;
      for (const pp of pathParticles) {
        if (!pp.alive) continue;
        let dirX = Math.random() - 0.5;
        let dirY = Math.random() - 0.5;
        let dirZ = Math.random() - 0.5;
        if (cosmicPath) {
          const t = Math.max(0, Math.min(1, pp.pathT));
          const tan = cosmicPath.getTangentAt(t);
          dirX += tan.x * 0.9;
          dirY += tan.y * 0.9;
          dirZ += tan.z * 0.9;
        }
        const mag = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) + 1e-5;
        const sp =
          DISPERSAL_SPEED_MIN +
          Math.random() * (DISPERSAL_SPEED_MAX - DISPERSAL_SPEED_MIN);
        pp.vx = (dirX / mag) * sp;
        pp.vy = (dirY / mag) * sp;
        pp.vz = (dirZ / mag) * sp;
      }
    }

    const dispersalElapsedS =
      (performance.now() - _dispersalStartedAtMs) / 1000;
    let activeCount = 0;

    for (let pi = 0; pi < pathParticles.length; pi++) {
      const pp = pathParticles[pi];
      if (!pp.alive) continue;

      const i3 = activeCount * 3;
      const ox = posArr[i3];
      const oy = posArr[i3 + 1];
      const oz = posArr[i3 + 2];

      pp.vx *= 1 - dt * 0.055;
      pp.vy *= 1 - dt * 0.055;
      pp.vz *= 1 - dt * 0.055;

      posArr[i3] = ox + pp.vx * dt;
      posArr[i3 + 1] = oy + pp.vy * dt;
      posArr[i3 + 2] = oz + pp.vz * dt;

      pp.size *= Math.exp(-dt * DISPERSAL_SIZE_DECAY);
      szArr[activeCount] = pp.size;

      const hue = (pp.hue + dt * 0.04) % 1.0;
      tmpColor.setHSL(hue, 0.78, 0.42 + pp.size * 0.12);
      colArr[i3] = tmpColor.r;
      colArr[i3 + 1] = tmpColor.g;
      colArr[i3 + 2] = tmpColor.b;

      if (pp.size < 0.05) {
        pp.alive = false;
        pp.vx = 0;
        pp.vy = 0;
        pp.vz = 0;
        continue;
      }

      activeCount++;
    }

    let dispersalCompleteEdge = false;
    let outCount = activeCount;
    if (
      !_dispersalEndSignaled &&
      (activeCount === 0 || dispersalElapsedS >= DISPERSAL_MAX_DURATION_S)
    ) {
      _dispersalEndSignaled = true;
      dispersalCompleteEdge = true;
      for (const pp of pathParticles) {
        pp.alive = false;
        pp.vx = 0;
        pp.vy = 0;
        pp.vz = 0;
      }
      outCount = 0;
    }

    return { activeCount: outCount, dispersalCompleteEdge };
  }

  // --- Cleanup ---
  function getDebugState(): AboutParticleSwarmDebugState {
    const now = performance.now();
    const nextProfileSwitchInMs = Math.max(0, _holdPulseSwitchAtMs - now);
    const holdPulseProfileName =
      HOLD_PULSE_PROFILE_NAMES[_holdPulseProfileIndex] ??
      `Profile ${_holdPulseProfileIndex + 1}`;

    return {
      activeParticles: _pathActiveCount,
      pathHeadT: _pathHeadT,
      pathComplete: _pathComplete,
      holdMode: _pathComplete,
      holdPulseProfileIndex: _holdPulseProfileIndex,
      holdPulseProfileName,
      nextProfileSwitchInMs,
    };
  }

  function dispose() {
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
    dispose,
  };
}
