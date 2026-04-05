import * as THREE from "three";
import { dlog } from "../../../lib/debugLog";
import {
  Vehicle,
  EntityManager,
  SeparationBehavior,
  CohesionBehavior,
  AlignmentBehavior,
  WanderBehavior,
  Vector3 as YukaVector3,
} from "yuka";
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
  0x9beaff, 0xa7b6ff, 0xb8ffd9, 0xffb8ef,
  0xffe2b3, 0xc8b8ff, 0xffa8c8, 0x88eedd,
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

// Path trail
const PATH_HEAD_SPEED = 3500;
const PATH_TRAIL_RADIUS = 35;
const PATH_EMISSION_RATE = 600; // particles per second from origin
const PATH_PARTICLE_MIN_SPEED = 0.6;
const PATH_PARTICLE_MAX_SPEED = 1.4;
const PATH_PARTICLE_SIZE_MIN = 0.4;
const PATH_PARTICLE_SIZE_MAX = 2.8;

// ---------------------------------------------------------------------------
// Custom shader for per-particle size + soft circles + additive blend
// ---------------------------------------------------------------------------

const VERT_SHADER = /* glsl */ `
attribute float particleSize;
attribute vec3 color;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = particleSize * (280.0 / -mvPosition.z);
  gl_PointSize = max(gl_PointSize, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAG_SHADER = /* glsl */ `
precision highp float;
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - vec2(0.5));
  if (r > 0.5) discard;
  float alpha = 1.0 - smoothstep(0.25, 0.5, r);
  gl_FragColor = vec4(vColor * 1.3, alpha * 0.88);
}
`;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
    cosmicPath: THREE.CatmullRomCurve3 | null,
  ): boolean; // returns true when path trace completes
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
  pathT: number;       // current position along path [0, 1]
  speed: number;       // flow speed multiplier
  size: number;        // particle size
  hue: number;         // color hue
  radialAngle: number; // angle for trail spread
  radialDist: number;  // distance from path center
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
  geometry.setAttribute("position",
    new THREE.BufferAttribute(positionArray, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("color",
    new THREE.BufferAttribute(colorArray, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("particleSize",
    new THREE.BufferAttribute(sizeArray, 1).setUsage(THREE.DynamicDrawUsage));
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

  dlog("[AboutSwarm] Created with", TOTAL_PARTICLES, "particles at anchor", anchor.toArray());

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

    const wander = new WanderBehavior(WANDER_RADIUS, WANDER_DISTANCE, WANDER_JITTER);
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
      orbitRadius: FOLLOWER_ORBIT_RADIUS_MIN +
        Math.random() * (FOLLOWER_ORBIT_RADIUS_MAX - FOLLOWER_ORBIT_RADIUS_MIN),
      orbitSpeed: FOLLOWER_SPEED_MIN + Math.random() * (FOLLOWER_SPEED_MAX - FOLLOWER_SPEED_MIN),
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
        _toCenter.normalize().multiplyScalar(overshoot * CONTAINMENT_STRENGTH * v.maxForce);
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
      speed: PATH_PARTICLE_MIN_SPEED + Math.random() * (PATH_PARTICLE_MAX_SPEED - PATH_PARTICLE_MIN_SPEED),
      size: PATH_PARTICLE_SIZE_MIN + Math.random() * (PATH_PARTICLE_SIZE_MAX - PATH_PARTICLE_SIZE_MIN),
      hue: Math.random(),
      radialAngle: Math.random() * Math.PI * 2,
      radialDist: Math.random() * PATH_TRAIL_RADIUS,
    });
  }
  let _pathHeadT = 0;
  let _pathEmitAccum = 0;
  let _pathComplete = false;

  // --- Update ---
  let _updateLogCounter = 0;

  function update(
    deltaSeconds: number,
    elapsedSeconds: number,
    phase: AboutJourneyPhase,
    excitementProgress: number,
    ringAxis: THREE.Vector3,
    flyThroughPoint: THREE.Vector3,
    cosmicPath: THREE.CatmullRomCurve3 | null,
  ): boolean {
    _updateLogCounter++;
    if (_updateLogCounter % 300 === 1) {
      dlog("[AboutSwarm] update tick", _updateLogCounter, "phase=", phase,
        "pos=", group.position.toArray(), "drawRange=", geometry.drawRange.count,
        "inScene=", !!group.parent);
    }
    const clampedDelta = Math.min(deltaSeconds, 0.05);

    let activeCount = TOTAL_PARTICLES;
    let sizeBase = 1.0;

    if (phase === AboutJourneyPhase.FLY_THROUGH) {
      // Slightly agitated during fly-through
      for (const v of vehicles) {
        v.maxSpeed = VEHICLE_MAX_SPEED * 1.5;
      }
      entityManager.update(clampedDelta);
      applyContainment();
      updateNormalSwarm(positionArray, colorArray, sizeArray, TOTAL_PARTICLES, elapsedSeconds, 1.0);
    } else if (phase === AboutJourneyPhase.EXCITEMENT) {
      const extraParticles = Math.floor(excitementProgress * EXCITEMENT_EXTRA_PARTICLES);
      activeCount = TOTAL_PARTICLES + extraParticles;
      sizeBase = 1.0 + excitementProgress * (EXCITEMENT_SIZE_MULTIPLIER - 1.0);
      const speedMult = 1.0 + excitementProgress * (EXCITEMENT_SPEED_MULTIPLIER - 1.0);
      for (const v of vehicles) {
        v.maxSpeed = VEHICLE_MAX_SPEED * speedMult;
      }
      entityManager.update(clampedDelta);
      applyContainment();

      if (excitementProgress > 0.33) {
        updateRingFormation(positionArray, colorArray, sizeArray, activeCount, elapsedSeconds,
          excitementProgress, ringAxis, flyThroughPoint, sizeBase);
      } else {
        updateNormalSwarm(positionArray, colorArray, sizeArray, activeCount, elapsedSeconds, sizeBase);
      }
    } else if (phase === AboutJourneyPhase.PATH_FORMING || phase === AboutJourneyPhase.PATH_READY) {
      // Path tracing mode — continuous emission from origin
      activeCount = updatePathTrail(positionArray, colorArray, sizeArray,
        clampedDelta, elapsedSeconds, cosmicPath);
    } else {
      // IDLE / TRANSIT — normal swarming
      entityManager.update(clampedDelta);
      applyContainment();
      updateNormalSwarm(positionArray, colorArray, sizeArray, TOTAL_PARTICLES, elapsedSeconds, 1.0);
    }

    geometry.setDrawRange(0, activeCount);
    (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.particleSize as THREE.BufferAttribute).needsUpdate = true;

    return _pathComplete;
  }

  // --- Normal swarming ---
  function updateNormalSwarm(
    posArr: Float32Array, colArr: Float32Array, szArr: Float32Array,
    count: number, elapsed: number, sizeBase: number,
  ) {
    const breathScale = 1.0 + Math.sin(elapsed * BREATHING_SPEED) * BREATHING_AMPLITUDE;

    for (let i = 0; i < count; i++) {
      const f = followers[i];
      const leader = vehicles[f.leaderIndex];
      const i3 = i * 3;

      const angle = f.orbitPhase + elapsed * f.orbitSpeed;
      const drift = Math.sin(elapsed * FOLLOWER_DRIFT_SPEED + f.driftPhase) * f.driftAmplitude;
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
      tmpColor.setHSL(driftedHue, 0.65 + Math.sin(angle * 0.5) * 0.15,
        0.6 + Math.sin(elapsed * 0.8 + f.orbitPhase) * 0.12);
      colArr[i3] = tmpColor.r;
      colArr[i3 + 1] = tmpColor.g;
      colArr[i3 + 2] = tmpColor.b;
    }
  }

  // --- Ring formation (EXCITEMENT) ---
  function updateRingFormation(
    posArr: Float32Array, colArr: Float32Array, szArr: Float32Array,
    count: number, elapsed: number, excProg: number,
    ringAxis: THREE.Vector3, flyThroughPoint: THREE.Vector3, sizeBase: number,
  ) {
    const ringBlend = Math.min(1, (excProg - 0.33) / 0.67 * RING_CONVERGENCE_SPEED);
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
      const drift = Math.sin(elapsed * FOLLOWER_DRIFT_SPEED + f.driftPhase) * f.driftAmplitude;
      const r = f.orbitRadius + drift;
      const swarmX = leader.position.x + Math.cos(angle) * r;
      const swarmY = leader.position.y + Math.sin(angle) * r;
      const swarmZ = leader.position.z + Math.sin(angle) * Math.cos(angle) * r * 0.3;

      const ringAngle = (i / count) * Math.PI * 2 + elapsed * rotSpeed;
      const ringR = RING_RADIUS + Math.sin(i * 0.1 + elapsed) * 15;
      const ringX = localFTP.x + (tangent.x * Math.cos(ringAngle) + bitangent.x * Math.sin(ringAngle)) * ringR;
      const ringY = localFTP.y + (tangent.y * Math.cos(ringAngle) + bitangent.y * Math.sin(ringAngle)) * ringR;
      const ringZ = localFTP.z + (tangent.z * Math.cos(ringAngle) + bitangent.z * Math.sin(ringAngle)) * ringR;

      posArr[i3] = swarmX + (ringX - swarmX) * ringBlend;
      posArr[i3 + 1] = swarmY + (ringY - swarmY) * ringBlend;
      posArr[i3 + 2] = swarmZ + (ringZ - swarmZ) * ringBlend;

      szArr[i] = sizeBase * (0.6 + excProg * 1.2 + Math.sin(elapsed * 3 + f.orbitPhase) * 0.4);

      const driftedHue = (f.baseHue + elapsed * f.hueDriftSpeed * 2) % 1.0;
      tmpColor.setHSL(driftedHue, 0.75 + excProg * 0.2,
        0.65 + excProg * 0.15 + Math.sin(elapsed * 2 + f.orbitPhase) * 0.1);
      colArr[i3] = tmpColor.r;
      colArr[i3 + 1] = tmpColor.g;
      colArr[i3 + 2] = tmpColor.b;
    }
  }

  // --- Path trail: continuous emission with electricity flow ---
  function updatePathTrail(
    posArr: Float32Array, colArr: Float32Array, szArr: Float32Array,
    dt: number, elapsed: number, cosmicPath: THREE.CatmullRomCurve3 | null,
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

    // Emit new particles from origin
    _pathEmitAccum += PATH_EMISSION_RATE * dt;
    while (_pathEmitAccum >= 1) {
      _pathEmitAccum -= 1;
      // Find a dead particle to resurrect
      for (let pi = 0; pi < pathParticles.length; pi++) {
        const pp = pathParticles[pi];
        if (!pp.alive) {
          pp.alive = true;
          pp.pathT = 0;
          pp.speed = PATH_PARTICLE_MIN_SPEED + Math.random() * (PATH_PARTICLE_MAX_SPEED - PATH_PARTICLE_MIN_SPEED);
          pp.size = PATH_PARTICLE_SIZE_MIN + Math.random() * (PATH_PARTICLE_SIZE_MAX - PATH_PARTICLE_SIZE_MIN);
          pp.hue = Math.random();
          pp.radialAngle = Math.random() * Math.PI * 2;
          pp.radialDist = Math.pow(Math.random(), 0.5) * PATH_TRAIL_RADIUS;
          break;
        }
      }
    }

    // Update alive particles: flow along path toward the head
    let activeCount = 0;
    const groupPos = group.position;

    for (let pi = 0; pi < pathParticles.length; pi++) {
      const pp = pathParticles[pi];
      if (!pp.alive) continue;

      // Flow toward head
      pp.pathT += (pp.speed * PATH_HEAD_SPEED * dt) / pathLength;

      // If particle passes head (or wraps), recycle from origin
      if (pp.pathT > _pathHeadT) {
        if (_pathComplete) {
          // Path done — particle stays at final position
          pp.pathT = _pathHeadT;
        } else {
          // Recycle back to origin for continuous stream
          pp.pathT = 0;
        }
      }

      const clampedT = Math.max(0, Math.min(1, pp.pathT));
      const pathPoint = cosmicPath.getPointAt(clampedT);

      // Perpendicular spread for trail width (rotating for electricity feel)
      const spreadAngle = pp.radialAngle + elapsed * 1.5 + clampedT * 8;
      const r = pp.radialDist * (0.3 + 0.7 * Math.sin(elapsed * 4 + pi * 0.3) * 0.5 + 0.5);

      const i3 = activeCount * 3;
      posArr[i3] = pathPoint.x - groupPos.x + Math.cos(spreadAngle) * r;
      posArr[i3 + 1] = pathPoint.y - groupPos.y + Math.sin(spreadAngle) * r;
      posArr[i3 + 2] = pathPoint.z - groupPos.z + Math.cos(spreadAngle + 1.57) * r;

      // Size: varies per particle with a pulse near the head
      const headProximity = 1.0 - Math.min(1.0, Math.abs(clampedT - _pathHeadT) * 15);
      szArr[activeCount] = pp.size * (1.0 + headProximity * 1.5);

      // Color: bright at head, electric shimmer along trail
      const shimmer = Math.sin(elapsed * 6 + clampedT * 40) * 0.5 + 0.5;
      const brightness = 0.55 + headProximity * 0.35 + shimmer * 0.1;
      const saturation = 0.7 + headProximity * 0.25;
      const hue = (pp.hue + clampedT * 0.15 + elapsed * 0.01) % 1.0;
      tmpColor.setHSL(hue, saturation, brightness);
      colArr[i3] = tmpColor.r;
      colArr[i3 + 1] = tmpColor.g;
      colArr[i3 + 2] = tmpColor.b;

      activeCount++;
    }

    return activeCount;
  }

  // --- Cleanup ---
  function dispose() {
    geometry.dispose();
    material.dispose();
    entityManager.clear();
    vehicles.length = 0;
    followers.length = 0;
    if (group.parent) group.parent.remove(group);
  }

  return { group, points, entityManager, vehicles, update, dispose };
}
