import * as THREE from "three";

/**
 * Builds the About roller-coaster route: a random closed loop that starts at
 * the About swarm, flies straight through every stop in a random order, and
 * steers clear of every obstacle. The ride slows down near stops and makes up
 * the time between them, so a full loop takes as long as the legacy loop.
 */

export interface RouteObstacle {
  center: THREE.Vector3;
  /** Keep-out radius, clearance included. */
  radius: number;
}

export interface RouteStop {
  name: string;
  center: THREE.Vector3;
  /** Half-length of the straight pass through the stop. */
  passRadius: number;
  /** Shifts the pass line off the center (e.g. above a planet). */
  passOffset?: THREE.Vector3;
  /** Ride slows while closer than this to the center (default: pass + margin). */
  slowOuter?: number;
  /** ...and farther than this, e.g. to slow outside a shape but not inside it. */
  slowInner?: number;
}

export interface RouteTiming {
  /** Arc length of this route. */
  length: number;
  /** Arc length of the legacy loop the original timings were tuned for. */
  referenceLength: number;
  /** Seconds the particle head takes to trace the full loop. */
  formSeconds: number;
  /** Particle head speed (units / sec) so the loop forms in `formSeconds`. */
  headSpeed: number;
  /** Route length relative to the legacy loop. */
  lengthScale: number;
  /**
   * Ride speed multiplier sampled evenly along the route: low near stops,
   * higher between them, averaging out to the legacy loop's duration.
   */
  speedProfile: Float32Array;
  /** Stop centers in ride order, for turning the rider's view toward them. */
  stopCenters: THREE.Vector3[];
}

export type CosmicPathCurve = THREE.CatmullRomCurve3 & { timing: RouteTiming };

/** Head speed the original loop was tuned for. */
export const LEGACY_PATH_HEAD_SPEED = 4725;

const WANDER_LATERAL_FRACTION = 0.18;
const WANDER_VERTICAL_FRACTION = 0.08;
const WANDER_VERTICAL_MAX = 2200;
/** Keeps passes close to level so they read as straight lines. */
const PASS_VERTICAL_DAMPING = 0.3;
const RESOLVE_ITERATIONS = 8;
const SAMPLES_PER_SEGMENT = 24;
/** Legs are bent away while they pass within this multiple of a keep-out radius. */
const POLYLINE_MARGIN = 1.2;
const DETOUR_PUSH = 1.45;

const SPEED_PROFILE_SAMPLES = 1024;
/** Ride speed near a stop, relative to the legacy loop's speed. */
const STOP_SPEED = 0.35;
/** Extra distance past a stop's pass before the ride starts speeding up. */
const STOP_SLOW_MARGIN = 900;
/** Distance over which the ride eases between stop speed and cruise speed. */
const STOP_SPEED_RAMP = 1800;
/** Ramp at a slow zone's inner edge (stops that slow outside but not inside). */
const STOP_INNER_RAMP = 500;
/**
 * Top cruise speed between stops. If matching the legacy loop time would need
 * more, the ride simply takes a little longer rather than racing past things.
 */
const MAX_CRUISE_SPEED = 2.2;

const WORLD_UP = new THREE.Vector3(0, 1, 0);

const randRange = (min: number, max: number) => min + Math.random() * (max - min);

const shuffle = <T>(items: T[]): T[] => {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const horizontalPerpendicular = (dir: THREE.Vector3): THREE.Vector3 => {
  const lateral = new THREE.Vector3().crossVectors(dir, WORLD_UP);
  if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
  return lateral.normalize();
};

/** A random bend point partway between two points. */
const wanderPoint = (from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 => {
  const leg = new THREE.Vector3().subVectors(to, from);
  const dist = leg.length();
  const lateral = horizontalPerpendicular(leg.clone().normalize());
  return from
    .clone()
    .lerp(to, randRange(0.35, 0.65))
    .addScaledVector(lateral, randRange(-1, 1) * dist * WANDER_LATERAL_FRACTION)
    .addScaledVector(
      WORLD_UP,
      THREE.MathUtils.clamp(
        randRange(-1, 1) * dist * WANDER_VERTICAL_FRACTION,
        -WANDER_VERTICAL_MAX,
        WANDER_VERTICAL_MAX,
      ),
    );
};

/** Pass center (offset applied) of a stop. */
const passCenter = (stop: RouteStop): THREE.Vector3 =>
  stop.center.clone().add(stop.passOffset ?? new THREE.Vector3());

/** Five collinear points so the spline runs dead straight through the stop. */
const stopWaypoints = (
  stop: RouteStop,
  previous: THREE.Vector3,
  next: THREE.Vector3,
): THREE.Vector3[] => {
  const center = passCenter(stop);
  const inDir = new THREE.Vector3().subVectors(center, previous).normalize();
  const outDir = new THREE.Vector3().subVectors(next, center).normalize();
  const passDir = inDir.clone().add(outDir);
  if (passDir.lengthSq() < 1e-4) passDir.copy(inDir);
  passDir.y *= PASS_VERTICAL_DAMPING;
  passDir.normalize();
  return [-1, -0.5, 0, 0.5, 1].map((f) =>
    center.clone().addScaledVector(passDir, f * stop.passRadius),
  );
};

/** Point on `obstacle`'s keep-out shell, pushed out along `from - center`. */
const pushOut = (
  from: THREE.Vector3,
  obstacle: RouteObstacle,
  fallbackDir: THREE.Vector3,
  scale: number,
): THREE.Vector3 => {
  const offset = from.clone().sub(obstacle.center);
  if (offset.lengthSq() < 1e-3) offset.copy(horizontalPerpendicular(fallbackDir));
  return obstacle.center
    .clone()
    .addScaledVector(offset.normalize(), obstacle.radius * scale);
};

/**
 * Cheap first pass on the straight-line polyline: move bend points out of
 * obstacles and bend any leg that passes through one around it. Stop passes
 * (`locked`) are never moved so they stay straight.
 */
const resolvePolyline = (
  points: THREE.Vector3[],
  locked: Set<THREE.Vector3>,
  obstacles: RouteObstacle[],
) => {
  const segment = new THREE.Vector3();
  const closest = new THREE.Vector3();
  for (let iteration = 0; iteration < RESOLVE_ITERATIONS; iteration++) {
    for (const point of points) {
      if (locked.has(point)) continue;
      for (const obstacle of obstacles) {
        if (point.distanceTo(obstacle.center) < obstacle.radius * POLYLINE_MARGIN) {
          point.copy(pushOut(point, obstacle, WORLD_UP, DETOUR_PUSH));
        }
      }
    }
    const inserts: Array<{ index: number; point: THREE.Vector3 }> = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      // Legs inside a stop's straight pass are left alone.
      if (locked.has(a) && locked.has(b)) continue;
      segment.subVectors(b, a);
      const lengthSq = Math.max(1e-6, segment.lengthSq());
      for (const obstacle of obstacles) {
        const t = THREE.MathUtils.clamp(
          closest.subVectors(obstacle.center, a).dot(segment) / lengthSq,
          0,
          1,
        );
        closest.copy(a).addScaledVector(segment, t);
        if (closest.distanceTo(obstacle.center) >= obstacle.radius * POLYLINE_MARGIN) {
          continue;
        }
        inserts.push({ index: i + 1, point: pushOut(closest, obstacle, segment, DETOUR_PUSH) });
        break;
      }
    }
    if (inserts.length === 0) return;
    for (let k = inserts.length - 1; k >= 0; k--) {
      points.splice(inserts[k].index, 0, inserts[k].point);
    }
  }
};

/** Resolves obstacles on the polyline, then adds detours where the spline still dips in. */
const resolveObstacles = (
  points: THREE.Vector3[],
  locked: Set<THREE.Vector3>,
  obstacles: RouteObstacle[],
): THREE.CatmullRomCurve3 => {
  resolvePolyline(points, locked, obstacles);

  const sample = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  for (let iteration = 0; iteration < RESOLVE_ITERATIONS; iteration++) {
    const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
    const samples = points.length * SAMPLES_PER_SEGMENT;
    const worst = new Map<RouteObstacle, { depth: number; u: number }>();
    for (let s = 0; s < samples; s++) {
      const u = s / samples;
      curve.getPoint(u, sample);
      for (const obstacle of obstacles) {
        const depth = obstacle.radius - sample.distanceTo(obstacle.center);
        if (depth > (worst.get(obstacle)?.depth ?? 0)) worst.set(obstacle, { depth, u });
      }
    }
    if (worst.size === 0) return curve;

    const detours = Array.from(worst, ([obstacle, { u }]) => {
      curve.getPoint(u, sample);
      curve.getTangent(u, tangent);
      return { u, point: pushOut(sample, obstacle, tangent, DETOUR_PUSH) };
    }).sort((a, b) => b.u - a.u);
    let inserted = false;
    for (const detour of detours) {
      const segment = Math.floor(detour.u * points.length);
      // An intrusion on a stop's own straight pass is accepted as a close
      // flyby; detouring beside it only piles up zigzags.
      if (
        locked.has(points[segment % points.length]) &&
        locked.has(points[(segment + 1) % points.length])
      ) {
        continue;
      }
      points.splice(segment + 1, 0, detour.point);
      inserted = true;
    }
    if (!inserted) break;
  }
  return new THREE.CatmullRomCurve3(points, true, "centripetal");
};

/**
 * Speed multiplier along the route: STOP_SPEED near stops, easing up to a
 * cruise speed chosen so the whole loop takes as long as the legacy loop did
 * at a constant speed.
 */
const buildSpeedProfile = (
  curve: THREE.CatmullRomCurve3,
  stops: RouteStop[],
  length: number,
  referenceLength: number,
): Float32Array => {
  const n = SPEED_PROFILE_SAMPLES;
  const weights = new Float32Array(n);
  const point = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    curve.getPointAt(i / n, point);
    let slow = 0;
    for (const stop of stops) {
      const d = point.distanceTo(stop.center);
      const outer = stop.slowOuter ?? stop.passRadius + STOP_SLOW_MARGIN;
      const inner = stop.slowInner ?? 0;
      const insideOuter = 1 - THREE.MathUtils.smoothstep(d, outer, outer + STOP_SPEED_RAMP);
      const outsideInner =
        inner > 0 ? THREE.MathUtils.smoothstep(d, inner - STOP_INNER_RAMP, inner) : 1;
      slow = Math.max(slow, insideOuter * outsideInner);
    }
    // 0 inside a stop's slow zone, 1 at cruise.
    weights[i] = 1 - slow;
  }

  // Time for the loop relative to the legacy loop, for a given cruise speed.
  const ds = length / n;
  const loopTime = (cruise: number) => {
    let time = 0;
    for (let i = 0; i < n; i++) {
      time += ds / THREE.MathUtils.lerp(STOP_SPEED, cruise, weights[i]);
    }
    return time;
  };
  let lo = STOP_SPEED;
  let hi = MAX_CRUISE_SPEED;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (loopTime(mid) > referenceLength) lo = mid;
    else hi = mid;
  }
  const cruise = hi;
  // Only speed up if the loop would finish sooner than the legacy loop; a
  // longer ride is fine.
  const rescale = Math.min(1, loopTime(cruise) / referenceLength);
  const profile = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    profile[i] = THREE.MathUtils.lerp(STOP_SPEED, cruise, weights[i]) * rescale;
  }
  return profile;
};

/** Ride speed multiplier at `t` (0..1 along the route). */
export const routeSpeedAt = (timing: RouteTiming, t: number): number => {
  const profile = timing.speedProfile;
  const u = THREE.MathUtils.euclideanModulo(t, 1) * profile.length;
  const i0 = Math.floor(u) % profile.length;
  const i1 = (i0 + 1) % profile.length;
  return THREE.MathUtils.lerp(profile[i0], profile[i1], u - Math.floor(u));
};

export const buildCosmicRoute = ({
  origin,
  stops,
  obstacles,
  referenceLength,
}: {
  origin: THREE.Vector3;
  stops: RouteStop[];
  obstacles: RouteObstacle[];
  referenceLength: number;
}): CosmicPathCurve => {
  const order = shuffle(stops);
  const points: THREE.Vector3[] = [origin.clone()];
  const locked = new Set<THREE.Vector3>();
  let previous = origin.clone();

  order.forEach((stop, index) => {
    const nextCenter = order[index + 1] ? passCenter(order[index + 1]) : origin;
    const waypoints = stopWaypoints(stop, previous, nextCenter);
    waypoints.forEach((waypoint) => locked.add(waypoint));
    points.push(wanderPoint(previous, waypoints[0]), ...waypoints);
    previous = waypoints[waypoints.length - 1];
  });
  points.push(wanderPoint(previous, origin));

  const curve = resolveObstacles(points, locked, obstacles) as CosmicPathCurve;
  const length = curve.getLength();
  const reference = Math.max(1, referenceLength);
  const formSeconds = reference / LEGACY_PATH_HEAD_SPEED;
  curve.timing = {
    length,
    referenceLength: reference,
    formSeconds,
    headSpeed: length / formSeconds,
    lengthScale: length / reference,
    speedProfile: buildSpeedProfile(curve, order, length, reference),
    stopCenters: order.map((stop) => stop.center.clone()),
  };
  return curve;
};

/**
 * Length of the loop the original timings were tuned for: origin → a point
 * 500 short of each landmark (raised 350, the mean of the old random lift) →
 * origin.
 */
export const legacyLoopLength = (
  origin: THREE.Vector3,
  landmarks: THREE.Vector3[],
): number => {
  const waypoints = [origin.clone()];
  for (const landmark of landmarks) {
    const toward = landmark.clone().sub(origin).normalize();
    const pass = landmark.clone().addScaledVector(toward, -500);
    pass.y += 350;
    waypoints.push(pass);
  }
  waypoints.push(origin.clone());
  return new THREE.CatmullRomCurve3(waypoints, true, "catmullrom", 0.3).getLength();
};
