import type CameraControls from "camera-controls";
import * as THREE from "three";
import {
  FollowPathBehavior,
  OnPathBehavior,
  Path as YukaPath,
  Vector3 as YukaVector3,
  Vehicle as YukaVehicle,
} from "yuka";

// ---------------------------------------------------------------------------
// Phase definitions — strict linear progression for the About experience
// ---------------------------------------------------------------------------

export const AboutJourneyPhase = {
  IDLE: 0,
  TRANSIT: 1,
  FLY_THROUGH: 2,
  EXCITEMENT: 3,
  PATH_FORMING: 4,
  PATH_READY: 5,
  /** Falcon travel has started while the completed path remains visible. */
  PATH_TRAVEL: 6,
  /** Path particles burst outward and fade; hydrate swarm spins up at the about anchor. */
  PATH_DISPERSING: 7,
} as const;

export type AboutJourneyPhase =
  (typeof AboutJourneyPhase)[keyof typeof AboutJourneyPhase];

const PHASE_NAMES: Record<AboutJourneyPhase, string> = {
  [AboutJourneyPhase.IDLE]: "IDLE",
  [AboutJourneyPhase.TRANSIT]: "TRANSIT",
  [AboutJourneyPhase.FLY_THROUGH]: "FLY_THROUGH",
  [AboutJourneyPhase.EXCITEMENT]: "EXCITEMENT",
  [AboutJourneyPhase.PATH_FORMING]: "PATH_FORMING",
  [AboutJourneyPhase.PATH_READY]: "PATH_READY",
  [AboutJourneyPhase.PATH_TRAVEL]: "PATH_TRAVEL",
  [AboutJourneyPhase.PATH_DISPERSING]: "PATH_DISPERSING",
};

const ALLOWED_TRANSITIONS: Record<AboutJourneyPhase, AboutJourneyPhase[]> = {
  [AboutJourneyPhase.IDLE]: [AboutJourneyPhase.TRANSIT],
  [AboutJourneyPhase.TRANSIT]: [
    AboutJourneyPhase.FLY_THROUGH,
    AboutJourneyPhase.IDLE,
  ],
  [AboutJourneyPhase.FLY_THROUGH]: [
    AboutJourneyPhase.EXCITEMENT,
    AboutJourneyPhase.IDLE,
  ],
  [AboutJourneyPhase.EXCITEMENT]: [
    AboutJourneyPhase.PATH_FORMING,
    AboutJourneyPhase.IDLE,
  ],
  [AboutJourneyPhase.PATH_FORMING]: [
    AboutJourneyPhase.PATH_READY,
    AboutJourneyPhase.IDLE,
  ],
  [AboutJourneyPhase.PATH_READY]: [
    AboutJourneyPhase.PATH_TRAVEL,
    AboutJourneyPhase.PATH_DISPERSING,
    AboutJourneyPhase.IDLE,
  ],
  [AboutJourneyPhase.PATH_TRAVEL]: [
    AboutJourneyPhase.PATH_DISPERSING,
    AboutJourneyPhase.IDLE,
  ],
  [AboutJourneyPhase.PATH_DISPERSING]: [AboutJourneyPhase.IDLE],
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ARRIVAL_TRIGGER_DIST = 900;
const FLY_THROUGH_DURATION_MS = 3000;
const FLY_THROUGH_OVERSHOOT = 350;
const FLY_THROUGH_CAM_LAG = 180;
const FLY_THROUGH_CAM_HEIGHT = 40;

const EXCITEMENT_DURATION_MS = 3400;
const PATH_HEAD_SPEED = 3500; // Must match AboutParticleSwarm.ts
const PATH_TRAVEL_SAMPLE_COUNT = 220;
const PATH_TRAVEL_SPEED = 980;
const PATH_TRAVEL_MAX_FORCE = 1200;
const PATH_TRAVEL_PREDICTION = 0.8;
const PATH_TRAVEL_ON_PATH_RADIUS = 65;
const PATH_TRAVEL_MIN_DURATION_MS = 5500;
const PATH_READY_TRAVEL_DELAY_MS = 2300;
const PATH_CRYSTALLIZATION_MIN_MS = 3200;
const PATH_CRYSTALLIZATION_MAX_MS = 8500;
const PATH_TRAVEL_CAM_HEIGHT = 30;
const PATH_TRAVEL_CAM_LOOK_AHEAD = 460;
const PATH_TRAVEL_BOARDING_DURATION_MS = 1350;
const PATH_TRAVEL_SPEED_SCALE_MIN = -2.5;
const PATH_TRAVEL_SPEED_SCALE_MAX = 2.5;
const PATH_TRAVEL_STOP_EPSILON = 0.03;
const PATH_TRAVEL_WHEEL_IMPULSE = 0.22;
const PATH_TRAVEL_WHEEL_LOCK_STEPS = 20;
const PATH_TRAVEL_TARGET_DRIFT_PER_SEC = 0.55;
const PATH_TRAVEL_ACCEL_PER_SEC = 1.2;
const PATH_TRAVEL_BRAKE_PER_SEC = 2.8;
const PATH_TRAVEL_COAST_DRAG_PER_SEC = 0.95;

// ---------------------------------------------------------------------------
// Cosmic path waypoints — a closed loop through universe landmarks
// ---------------------------------------------------------------------------

export interface UniverseLandmark {
  name: string;
  position: THREE.Vector3;
}

function buildCosmicLoopPath(
  origin: THREE.Vector3,
  landmarks: UniverseLandmark[],
): THREE.CatmullRomCurve3 {
  const waypoints: THREE.Vector3[] = [origin.clone()];

  for (const lm of landmarks) {
    const toward = lm.position.clone().sub(origin).normalize();
    const passPoint = lm.position.clone().addScaledVector(toward, -500);
    passPoint.y += 200 + Math.random() * 300;
    waypoints.push(passPoint);
  }

  waypoints.push(origin.clone());

  return new THREE.CatmullRomCurve3(waypoints, true, "catmullrom", 0.3);
}

// ---------------------------------------------------------------------------
// Controller callbacks
// ---------------------------------------------------------------------------

export interface AboutJourneyCallbacks {
  hideShip(): void;
  showShip(): void;
  setShipPose(position: THREE.Vector3, forward: THREE.Vector3): void;
  setFollowingSpaceship(v: boolean): void;
  disableControls(): void;
  enableControls(): void;
  getCamera(): THREE.Camera | null;
  getControls(): CameraControls | null;
  getShipPosition(): THREE.Vector3 | null;
  getSwarmWorldPosition(): THREE.Vector3 | null;
  setAutopilotSuppressed(v: boolean): void;
  vlog(msg: string): void;
  /** Spawn the secondary “hydrate” swarm at the about / memory-square anchor. */
  onPathDispersalStarted(): void;
  /** Swap hydrate swarm into the primary slot, dispose the old path swarm, restore camera limits. */
  onPathDispersalComplete(): void;
  /** Any non-IDLE exit: restore camera limits and drop the hydrate swarm if still present. */
  onAboutJourneyExit(): void;
}

// ---------------------------------------------------------------------------
// Controller state (public read-only)
// ---------------------------------------------------------------------------

export interface AboutJourneyState {
  phase: AboutJourneyPhase;
  phaseName: string;
  phaseStartedAt: number;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class AboutJourneyController {
  private _phase: AboutJourneyPhase = AboutJourneyPhase.IDLE;
  private _phaseStartedAt = 0;
  private _rafId: number | null = null;
  private readonly _cb: AboutJourneyCallbacks;

  // FLY_THROUGH state
  private _flyStartCam = new THREE.Vector3();
  private _flyEndCam = new THREE.Vector3();
  private _flyStartTarget = new THREE.Vector3();
  private _flyEndTarget = new THREE.Vector3();
  private _flyStartShip = new THREE.Vector3();
  private _flyEndShip = new THREE.Vector3();
  private _flyDirection = new THREE.Vector3(0, 0, 1);
  private _flyStartedAt = 0;
  private _flyThroughPoint = new THREE.Vector3();

  // EXCITEMENT state
  private _excitementStartedAt = 0;
  private _ringAxis = new THREE.Vector3(0, 1, 0);

  // PATH_FORMING state
  private _cosmicPath: THREE.CatmullRomCurve3 | null = null;
  private _pathFormStartedAt = 0;

  // Reusable temp vectors
  private readonly _tmpCam = new THREE.Vector3();
  private readonly _tmpTarget = new THREE.Vector3();
  private readonly _tmpFlyShipPos = new THREE.Vector3();

  private _landmarks: UniverseLandmark[] = [];
  private _travelVehicle: YukaVehicle | null = null;
  private _travelStartedAt = 0;
  private _travelLastTickAt = 0;
  private _travelEntryPoint = new THREE.Vector3();
  private _travelPathLength = 1;
  private _travelStartT = 0;
  private _travelDistanceTraveled = 0;
  private _travelDistanceAbs = 0;
  private _travelRunning = false;
  private _pendingDispersalReason: string | null = null;
  private _pathReadyTravelTimeoutId: number | null = null;
  private _pathCrystallizationActive = false;
  private _pathCrystallizationStartedAt = 0;
  private _pathCrystallizationDurationMs = PATH_CRYSTALLIZATION_MIN_MS;
  private _travelSpeedScale = 1;
  private _travelSpeedTarget = 0;
  private _travelWheelStreakDir: -1 | 0 | 1 = 0;
  private _travelWheelStreakCount = 0;
  private _travelWheelLockedDir: -1 | 0 | 1 = 0;

  private readonly _tmpTravelPos = new THREE.Vector3();
  private readonly _tmpTravelVel = new THREE.Vector3();
  private readonly _tmpTravelForward = new THREE.Vector3(0, 0, 1);
  private readonly _tmpTravelCamPos = new THREE.Vector3();
  private readonly _tmpTravelLookPos = new THREE.Vector3();
  private readonly _tmpTravelBoardStartCam = new THREE.Vector3();
  private readonly _tmpTravelBoardStartTarget = new THREE.Vector3();
  private readonly _tmpTravelBoardEndCam = new THREE.Vector3();
  private readonly _tmpTravelBoardEndTarget = new THREE.Vector3();
  private readonly _tmpTravelUserTarget = new THREE.Vector3();
  private readonly _tmpTravelUserViewDir = new THREE.Vector3();
  private readonly _tmpTravelTangent = new THREE.Vector3();

  constructor(callbacks: AboutJourneyCallbacks) {
    this._cb = callbacks;
  }

  setLandmarks(landmarks: UniverseLandmark[]): void {
    this._landmarks = landmarks;
  }

  // --- Public read-only state ---

  get phase(): AboutJourneyPhase {
    return this._phase;
  }

  get phaseName(): string {
    return PHASE_NAMES[this._phase];
  }

  get state(): AboutJourneyState {
    return {
      phase: this._phase,
      phaseName: this.phaseName,
      phaseStartedAt: this._phaseStartedAt,
    };
  }

  get flyThroughPoint(): THREE.Vector3 {
    return this._flyThroughPoint;
  }

  get flyThroughDirection(): THREE.Vector3 {
    return this._flyDirection;
  }

  get flyThroughProgress(): number {
    if (this._phase !== AboutJourneyPhase.FLY_THROUGH) return 0;
    return THREE.MathUtils.clamp(
      (performance.now() - this._flyStartedAt) / FLY_THROUGH_DURATION_MS,
      0,
      1,
    );
  }

  get excitementProgress(): number {
    if (this._phase !== AboutJourneyPhase.EXCITEMENT) return 0;
    return Math.min(
      1,
      (performance.now() - this._excitementStartedAt) / EXCITEMENT_DURATION_MS,
    );
  }

  get ringAxis(): THREE.Vector3 {
    return this._ringAxis;
  }

  get cosmicPath(): THREE.CatmullRomCurve3 | null {
    return this._cosmicPath;
  }

  get pathCrystallizationActive(): boolean {
    return this._pathCrystallizationActive;
  }

  get pathCrystallizationProgress(): number {
    if (!this._pathCrystallizationActive) return 0;
    return THREE.MathUtils.clamp(
      (performance.now() - this._pathCrystallizationStartedAt) /
        Math.max(1, this._pathCrystallizationDurationMs),
      0,
      1,
    );
  }

  get travelSpeedScale(): number {
    return this._travelSpeedScale;
  }

  get travelThrottleLockedDirection(): -1 | 0 | 1 {
    return this._travelWheelLockedDir;
  }

  get travelThrottleStreakCount(): number {
    return this._travelWheelStreakCount;
  }

  setTravelSpeedScale(scale: number): void {
    this._travelSpeedScale = THREE.MathUtils.clamp(
      scale,
      PATH_TRAVEL_SPEED_SCALE_MIN,
      PATH_TRAVEL_SPEED_SCALE_MAX,
    );
    this._travelSpeedTarget = this._travelSpeedScale;
    this._travelWheelLockedDir = 0;
    this._travelWheelStreakCount = 0;
    this._travelWheelStreakDir = 0;
  }

  nudgeTravelSpeedFromWheel(deltaY: number): void {
    if (this._phase !== AboutJourneyPhase.PATH_TRAVEL || !this._travelRunning) {
      return;
    }
    if (Math.abs(deltaY) < 0.0001) return;

    const dir: -1 | 1 = deltaY < 0 ? 1 : -1;

    if (this._travelWheelLockedDir !== 0) {
      if (dir === this._travelWheelLockedDir) {
        this._travelSpeedTarget =
          this._travelWheelLockedDir * PATH_TRAVEL_SPEED_SCALE_MAX;
      } else {
        // Opposite wheel direction disengages lock and starts a realistic brake.
        this._travelWheelLockedDir = 0;
        this._travelWheelStreakDir = dir;
        this._travelWheelStreakCount = 1;
        this._travelSpeedTarget *= 0.35;
      }
      return;
    }

    if (dir === this._travelWheelStreakDir) {
      this._travelWheelStreakCount += 1;
    } else {
      this._travelWheelStreakDir = dir;
      this._travelWheelStreakCount = 1;
    }

    if (this._travelWheelStreakCount >= PATH_TRAVEL_WHEEL_LOCK_STEPS) {
      this._travelWheelLockedDir = dir;
      this._travelSpeedTarget = dir * PATH_TRAVEL_SPEED_SCALE_MAX;
      return;
    }

    this._travelSpeedTarget = THREE.MathUtils.clamp(
      this._travelSpeedTarget + dir * PATH_TRAVEL_WHEEL_IMPULSE,
      PATH_TRAVEL_SPEED_SCALE_MIN,
      PATH_TRAVEL_SPEED_SCALE_MAX,
    );
  }

  // --- Phase transitions ---

  private _transition(to: AboutJourneyPhase): boolean {
    const allowed = ALLOWED_TRANSITIONS[this._phase];
    if (!allowed.includes(to)) {
      this._cb.vlog(
        `⚠️ [AboutJourney] blocked transition ${PHASE_NAMES[this._phase]} → ${PHASE_NAMES[to]}`,
      );
      return false;
    }
    this._cb.vlog(
      `✨ [AboutJourney] ${PHASE_NAMES[this._phase]} → ${PHASE_NAMES[to]}`,
    );
    this._phase = to;
    this._phaseStartedAt = performance.now();
    return true;
  }

  // --- IDLE → TRANSIT ---

  beginTransit(): void {
    if (this._phase !== AboutJourneyPhase.IDLE) return;
    this._transition(AboutJourneyPhase.TRANSIT);
  }

  // --- Check arrival (called every frame from the render loop) ---

  checkArrival(): void {
    if (this._phase !== AboutJourneyPhase.TRANSIT) return;

    const shipPos = this._cb.getShipPosition();
    const swarmPos = this._cb.getSwarmWorldPosition();
    if (!shipPos || !swarmPos) return;

    const dist = shipPos.distanceTo(swarmPos);
    if (dist > ARRIVAL_TRIGGER_DIST) return;

    this._beginFlyThrough();
  }

  // --- TRANSIT → FLY_THROUGH ---
  // The falcon flies straight through the swarm center and disappears on the other side.
  // Camera follows from behind, then detaches.

  private _beginFlyThrough(): void {
    if (!this._transition(AboutJourneyPhase.FLY_THROUGH)) return;

    const camera = this._cb.getCamera();
    const controls = this._cb.getControls();
    const shipPos = this._cb.getShipPosition();
    const swarmPos = this._cb.getSwarmWorldPosition();
    if (!camera || !controls || !shipPos || !swarmPos) {
      this._transition(AboutJourneyPhase.IDLE);
      return;
    }

    // Direction the ship is traveling (toward the swarm)
    const flyDir = swarmPos.clone().sub(shipPos).normalize();
    this._flyDirection.copy(flyDir);
    this._flyStartedAt = performance.now();

    // The point where the ship passes through the swarm
    this._flyThroughPoint.copy(swarmPos);

    this._flyStartShip.copy(shipPos);
    this._flyEndShip
      .copy(swarmPos)
      .addScaledVector(flyDir, FLY_THROUGH_OVERSHOOT);

    // Camera starts at current position, ends behind the fly-through point
    this._flyStartCam.copy(camera.position);
    this._flyEndCam
      .copy(swarmPos)
      .addScaledVector(flyDir, -FLY_THROUGH_CAM_LAG)
      .add(new THREE.Vector3(0, FLY_THROUGH_CAM_HEIGHT, 0));

    // Look target: start at swarm center, end past it
    this._flyStartTarget.copy(swarmPos);
    this._flyEndTarget
      .copy(swarmPos)
      .addScaledVector(flyDir, FLY_THROUGH_OVERSHOOT);

    // Random ring axis (tilted from vertical for visual interest)
    this._ringAxis
      .set(
        (Math.random() - 0.5) * 0.6,
        0.7 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.6,
      )
      .normalize();

    // Stop following ship, disable user controls
    this._cb.setFollowingSpaceship(false);
    this._cb.disableControls();
    this._cb.showShip();

    // The ship stays visible during fly-through — it will be hidden at the end
    const smooth = (u: number) => u * u * (3 - 2 * u);

    const tick = () => {
      if (this._phase !== AboutJourneyPhase.FLY_THROUGH) return;

      const elapsed = performance.now() - this._flyStartedAt;
      const t = THREE.MathUtils.clamp(elapsed / FLY_THROUGH_DURATION_MS, 0, 1);
      const s = smooth(t);

      // Drive Falcon through the particle cloud before the path sequence.
      this._tmpFlyShipPos.lerpVectors(this._flyStartShip, this._flyEndShip, s);
      this._cb.setShipPose(this._tmpFlyShipPos, this._flyDirection);

      // Camera smoothly moves to behind-the-swarm position
      this._tmpCam.lerpVectors(this._flyStartCam, this._flyEndCam, s);
      // Look target sweeps from swarm center through to overshoot
      this._tmpTarget.lerpVectors(this._flyStartTarget, this._flyEndTarget, s);

      const ctrl = this._cb.getControls();
      if (ctrl) {
        ctrl.setLookAt(
          this._tmpCam.x,
          this._tmpCam.y,
          this._tmpCam.z,
          this._tmpTarget.x,
          this._tmpTarget.y,
          this._tmpTarget.z,
          false,
        );
      }

      // Keep ship visible through the pass, then fade it as excitement begins.
      if (t > 0.92) {
        this._cb.hideShip();
      }

      if (t >= 1) {
        this._cb.hideShip();
        this._rafId = null;
        this._beginExcitement();
        return;
      }

      this._rafId = requestAnimationFrame(tick);
    };

    this._cancelRaf();
    this._rafId = requestAnimationFrame(tick);
  }

  // --- FLY_THROUGH → EXCITEMENT ---
  // Particles get agitated, grow, brighten, then form a rotating ring.
  // The swarm module reads excitementProgress and ringAxis from this controller.

  private _beginExcitement(): void {
    if (!this._transition(AboutJourneyPhase.EXCITEMENT)) return;

    this._excitementStartedAt = performance.now();

    // Camera stays put during excitement — user can look around
    this._cb.enableControls();

    const tick = () => {
      if (this._phase !== AboutJourneyPhase.EXCITEMENT) return;

      const elapsed = performance.now() - this._excitementStartedAt;
      if (elapsed >= EXCITEMENT_DURATION_MS) {
        this._rafId = null;
        this._beginPathForming();
        return;
      }

      this._rafId = requestAnimationFrame(tick);
    };

    this._cancelRaf();
    this._rafId = requestAnimationFrame(tick);
  }

  // --- EXCITEMENT → PATH_FORMING ---
  // Particles shoot off and trace the cosmic loop path.
  // Camera soft-tracks the spear head but user can still look around.

  private _beginPathForming(): void {
    if (!this._transition(AboutJourneyPhase.PATH_FORMING)) return;

    const swarmPos = this._cb.getSwarmWorldPosition();
    if (!swarmPos) {
      this._transition(AboutJourneyPhase.IDLE);
      return;
    }

    // Build the cosmic loop path through universe landmarks
    this._cosmicPath = buildCosmicLoopPath(swarmPos, this._landmarks);
    this._pathFormStartedAt = performance.now();

    // Enable controls so user can look around, but we'll soft-guide the target
    this._cb.enableControls();

    const _trackTarget = new THREE.Vector3();
    const _currentTarget = new THREE.Vector3();
    const TRACK_LERP = 0.015; // Gentle tracking — not locked, just guided

    const tick = () => {
      if (this._phase !== AboutJourneyPhase.PATH_FORMING) return;

      const ctrl = this._cb.getControls();
      if (ctrl && this._cosmicPath) {
        // Calculate where the spear head currently is on the path
        const elapsed = performance.now() - this._pathFormStartedAt;
        const pathLength = this._cosmicPath.getLength();
        const headT = Math.min(
          1,
          ((elapsed / 1000) * PATH_HEAD_SPEED) / pathLength,
        );
        const headPos = this._cosmicPath.getPointAt(headT);

        // Soft-track: gently nudge the camera's look-at target toward the spear head
        ctrl.getTarget(_currentTarget);
        _trackTarget.lerpVectors(_currentTarget, headPos, TRACK_LERP);
        ctrl.setTarget(_trackTarget.x, _trackTarget.y, _trackTarget.z, false);
      }

      this._rafId = requestAnimationFrame(tick);
    };

    this._cancelRaf();
    this._rafId = requestAnimationFrame(tick);
  }

  // Called by the swarm when its path-tracing animation completes the loop
  notifyPathComplete(): void {
    if (this._phase !== AboutJourneyPhase.PATH_FORMING) return;
    this._cancelRaf();
    this._transition(AboutJourneyPhase.PATH_READY);
    this._cb.enableControls();

    const formElapsedMs = Math.max(
      0,
      performance.now() - this._pathFormStartedAt,
    );
    this._pathCrystallizationDurationMs = THREE.MathUtils.clamp(
      formElapsedMs * 0.5,
      PATH_CRYSTALLIZATION_MIN_MS,
      PATH_CRYSTALLIZATION_MAX_MS,
    );
    this._pathCrystallizationStartedAt = performance.now();
    this._pathCrystallizationActive = true;

    this._cb.vlog(
      "✨ [AboutJourney] Cosmic path loop complete — crystallizing tram glass path",
    );

    this._clearPathReadyTravelTimeout();
    this._pathReadyTravelTimeoutId = window.setTimeout(() => {
      this._pathReadyTravelTimeoutId = null;
      if (this._phase === AboutJourneyPhase.PATH_READY) {
        this.beginPathTravel();
      }
    }, PATH_READY_TRAVEL_DELAY_MS);
  }

  /** Enter travel mode on the completed cosmic path as an "invisible tram" ride. */
  beginPathTravel(): void {
    if (
      this._phase !== AboutJourneyPhase.PATH_READY &&
      this._phase !== AboutJourneyPhase.PATH_TRAVEL
    ) {
      return;
    }
    if (this._phase === AboutJourneyPhase.PATH_READY) {
      if (!this._transition(AboutJourneyPhase.PATH_TRAVEL)) return;
      this._clearPathReadyTravelTimeout();
      // Ride is camera-only; Falcon stays hidden while the tram traverses the loop.
      this._cb.hideShip();
      this._cb.setFollowingSpaceship(false);
      this._cb.disableControls();
      this._startPathTravelRun();
    }
    this._cb.vlog(
      "✨ [AboutJourney] Invisible tram engaged on completed cosmic path",
    );
  }

  /** Explicitly disperse the path, e.g. when retargeting Falcon to another destination. */
  beginPathDispersal(reason = "manual"): void {
    if (
      this._phase !== AboutJourneyPhase.PATH_READY &&
      this._phase !== AboutJourneyPhase.PATH_TRAVEL
    ) {
      return;
    }

    if (this._phase === AboutJourneyPhase.PATH_TRAVEL) {
      this._pendingDispersalReason = reason;
      this._cb.vlog(
        `✨ [AboutJourney] Dispersal queued until path travel loop completes (${reason})`,
      );
      return;
    }

    this._clearPathReadyTravelTimeout();
    this._pathCrystallizationActive = false;

    this._beginPathDispersing(reason);
  }

  private _startPathTravelRun(): void {
    if (!this._cosmicPath) {
      this._cb.vlog("⚠️ [AboutJourney] No cosmic path available for travel");
      this._beginPathDispersing(this._pendingDispersalReason ?? "no-path");
      return;
    }

    const camera = this._cb.getCamera();
    const controls = this._cb.getControls();
    if (!camera || !controls) {
      this._cb.vlog(
        "⚠️ [AboutJourney] Camera controls unavailable for tram boarding",
      );
      this._beginPathDispersing(this._pendingDispersalReason ?? "no-ship");
      return;
    }

    const samples: THREE.Vector3[] = [];
    for (let i = 0; i < PATH_TRAVEL_SAMPLE_COUNT; i++) {
      samples.push(this._cosmicPath.getPointAt(i / PATH_TRAVEL_SAMPLE_COUNT));
    }

    let nearestIdx = 0;
    let nearestDistSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < samples.length; i++) {
      const d2 = samples[i].distanceToSquared(camera.position);
      if (d2 < nearestDistSq) {
        nearestDistSq = d2;
        nearestIdx = i;
      }
    }

    const ordered: THREE.Vector3[] = [];
    for (let i = 0; i < samples.length; i++) {
      ordered.push(samples[(nearestIdx + i) % samples.length]);
    }
    // Close the loop for follow behavior.
    ordered.push(ordered[0].clone());

    const yukaPath = new YukaPath();
    yukaPath.loop = true;
    for (const p of ordered) {
      yukaPath.add(new YukaVector3(p.x, p.y, p.z));
    }

    const vehicle = new YukaVehicle();
    vehicle.maxSpeed = PATH_TRAVEL_SPEED;
    vehicle.maxForce = PATH_TRAVEL_MAX_FORCE;
    vehicle.position.set(ordered[0].x, ordered[0].y, ordered[0].z);

    const followPath = new FollowPathBehavior(yukaPath, PATH_TRAVEL_PREDICTION);
    const onPath = new OnPathBehavior(
      yukaPath,
      PATH_TRAVEL_PREDICTION,
      PATH_TRAVEL_ON_PATH_RADIUS,
    );
    vehicle.steering.add(onPath);
    vehicle.steering.add(followPath);

    this._travelVehicle = vehicle;
    this._travelEntryPoint.copy(ordered[0]);
    this._travelPathLength = this._cosmicPath.getLength();
    this._travelStartT = nearestIdx / PATH_TRAVEL_SAMPLE_COUNT;
    this._travelDistanceTraveled = 0;
    this._travelDistanceAbs = 0;
    this._travelSpeedScale = 0;
    this._travelSpeedTarget = 0;
    this._travelWheelLockedDir = 0;
    this._travelWheelStreakDir = 0;
    this._travelWheelStreakCount = 0;
    this._travelStartedAt = performance.now();
    this._travelLastTickAt = this._travelStartedAt;
    this._travelRunning = true;
    this._cb.setAutopilotSuppressed(true);

    this._tmpTravelForward.subVectors(ordered[1], ordered[0]).normalize();
    if (this._tmpTravelForward.lengthSq() < 0.0001) {
      this._tmpTravelForward.set(0, 0, 1);
    }

    controls.getTarget(this._tmpTravelBoardStartTarget);
    this._tmpTravelBoardStartCam.copy(camera.position);
    this._tmpTravelBoardEndCam
      .copy(ordered[0])
      .add(new THREE.Vector3(0, PATH_TRAVEL_CAM_HEIGHT, 0));
    this._tmpTravelBoardEndTarget
      .copy(ordered[0])
      .addScaledVector(this._tmpTravelForward, PATH_TRAVEL_CAM_LOOK_AHEAD)
      .add(new THREE.Vector3(0, 10, 0));

    const boardingStartedAt = performance.now();
    const boardTick = () => {
      if (
        this._phase !== AboutJourneyPhase.PATH_TRAVEL ||
        !this._travelRunning
      ) {
        return;
      }

      const ctrl = this._cb.getControls();
      if (!ctrl) {
        this._completePathTravelRun();
        return;
      }

      const now = performance.now();
      const t = THREE.MathUtils.clamp(
        (now - boardingStartedAt) / PATH_TRAVEL_BOARDING_DURATION_MS,
        0,
        1,
      );
      const s = t * t * (3 - 2 * t);

      this._tmpTravelCamPos.lerpVectors(
        this._tmpTravelBoardStartCam,
        this._tmpTravelBoardEndCam,
        s,
      );
      this._tmpTravelLookPos.lerpVectors(
        this._tmpTravelBoardStartTarget,
        this._tmpTravelBoardEndTarget,
        s,
      );

      ctrl.setLookAt(
        this._tmpTravelCamPos.x,
        this._tmpTravelCamPos.y,
        this._tmpTravelCamPos.z,
        this._tmpTravelLookPos.x,
        this._tmpTravelLookPos.y,
        this._tmpTravelLookPos.z,
        false,
      );

      if (t >= 1) {
        this._travelLastTickAt = performance.now();
        this._runPathTravelTick();
        return;
      }

      this._rafId = requestAnimationFrame(boardTick);
    };

    this._cancelRaf();
    this._rafId = requestAnimationFrame(boardTick);
  }

  private _runPathTravelTick(): void {
    // Let the rider look around while the tram remains rail-locked.
    this._cb.enableControls();

    const tick = () => {
      if (
        this._phase !== AboutJourneyPhase.PATH_TRAVEL ||
        !this._travelRunning
      ) {
        return;
      }

      const now = performance.now();
      const dt = THREE.MathUtils.clamp(
        (now - this._travelLastTickAt) / 1000,
        1 / 240,
        1 / 30,
      );
      this._travelLastTickAt = now;

      if (!this._travelVehicle) {
        this._completePathTravelRun();
        return;
      }

      this._travelVehicle.update(dt);

      if (this._travelWheelLockedDir !== 0) {
        this._travelSpeedTarget =
          this._travelWheelLockedDir * PATH_TRAVEL_SPEED_SCALE_MAX;
      } else {
        const decayAlpha = 1 - Math.exp(-PATH_TRAVEL_TARGET_DRIFT_PER_SEC * dt);
        this._travelSpeedTarget += (0 - this._travelSpeedTarget) * decayAlpha;
      }

      const speedError = this._travelSpeedTarget - this._travelSpeedScale;
      const braking =
        Math.abs(this._travelSpeedScale) > 0.05 &&
        Math.sign(speedError) !== Math.sign(this._travelSpeedScale);
      const accelLimit =
        (braking ? PATH_TRAVEL_BRAKE_PER_SEC : PATH_TRAVEL_ACCEL_PER_SEC) * dt;
      this._travelSpeedScale += THREE.MathUtils.clamp(
        speedError,
        -accelLimit,
        accelLimit,
      );

      if (
        this._travelWheelLockedDir === 0 &&
        Math.abs(this._travelSpeedTarget) <= 0.05
      ) {
        this._travelSpeedScale *= Math.exp(
          -PATH_TRAVEL_COAST_DRAG_PER_SEC * dt,
        );
      }
      if (
        Math.abs(this._travelSpeedScale) <= PATH_TRAVEL_STOP_EPSILON &&
        Math.abs(this._travelSpeedTarget) <= 0.05
      ) {
        this._travelSpeedScale = 0;
      }

      this._tmpTravelVel.set(
        this._travelVehicle.velocity.x,
        this._travelVehicle.velocity.y,
        this._travelVehicle.velocity.z,
      );

      const guideSpeed =
        THREE.MathUtils.clamp(
          this._tmpTravelVel.length(),
          PATH_TRAVEL_SPEED * 0.55,
          PATH_TRAVEL_SPEED,
        ) * this._travelSpeedScale;
      this._travelDistanceTraveled += guideSpeed * dt;
      this._travelDistanceAbs += Math.abs(guideSpeed) * dt;

      const railTRaw =
        this._travelStartT +
        this._travelDistanceTraveled / Math.max(1, this._travelPathLength);
      const railT = ((railTRaw % 1) + 1) % 1;

      const path = this._cosmicPath;
      if (!path) {
        this._completePathTravelRun();
        return;
      }
      this._tmpTravelPos.copy(path.getPointAt(railT));
      this._tmpTravelTangent.copy(path.getTangentAt(railT)).normalize();
      const travelSign = this._travelSpeedScale >= 0 ? 1 : -1;
      this._tmpTravelForward
        .copy(this._tmpTravelTangent)
        .multiplyScalar(travelSign)
        .normalize();

      // Keep yuka guide snapped to the same rail position for stable steering
      // while we still use its velocity as pacing input.
      this._travelVehicle.position.set(
        this._tmpTravelPos.x,
        this._tmpTravelPos.y,
        this._tmpTravelPos.z,
      );
      this._travelVehicle.velocity.set(
        this._tmpTravelForward.x * Math.abs(guideSpeed),
        this._tmpTravelForward.y * Math.abs(guideSpeed),
        this._tmpTravelForward.z * Math.abs(guideSpeed),
      );

      const ctrl = this._cb.getControls();
      if (ctrl) {
        const cam = this._cb.getCamera();
        // "Invisible tram" feel: keep camera on the rail centerline and only
        // raise slightly for readability.
        this._tmpTravelCamPos
          .copy(this._tmpTravelPos)
          .add(new THREE.Vector3(0, PATH_TRAVEL_CAM_HEIGHT, 0));

        // Preserve rider-chosen look direction while moving camera along rail.
        if (cam) {
          ctrl.getTarget(this._tmpTravelUserTarget);
          this._tmpTravelUserViewDir
            .subVectors(this._tmpTravelUserTarget, cam.position)
            .normalize();
        } else {
          this._tmpTravelUserViewDir.copy(this._tmpTravelForward);
        }

        if (this._tmpTravelUserViewDir.lengthSq() < 0.0001) {
          this._tmpTravelUserViewDir.copy(this._tmpTravelForward);
        }

        const isStopped =
          Math.abs(this._travelSpeedScale) <= PATH_TRAVEL_STOP_EPSILON;
        if (!isStopped) {
          // Moving: lock view directly to direction of travel.
          this._tmpTravelUserViewDir.copy(this._tmpTravelForward);
        }

        this._tmpTravelLookPos
          .copy(this._tmpTravelCamPos)
          .addScaledVector(
            this._tmpTravelUserViewDir,
            PATH_TRAVEL_CAM_LOOK_AHEAD,
          );

        ctrl.setLookAt(
          this._tmpTravelCamPos.x,
          this._tmpTravelCamPos.y,
          this._tmpTravelCamPos.z,
          this._tmpTravelLookPos.x,
          this._tmpTravelLookPos.y,
          this._tmpTravelLookPos.z,
          false,
        );
      }

      const elapsedMs = now - this._travelStartedAt;
      const loopCompleted = this._travelDistanceAbs >= this._travelPathLength;
      const minElapsed = elapsedMs >= PATH_TRAVEL_MIN_DURATION_MS;

      if (loopCompleted && minElapsed) {
        this._completePathTravelRun();
        return;
      }

      this._rafId = requestAnimationFrame(tick);
    };

    this._cancelRaf();
    this._rafId = requestAnimationFrame(tick);
  }

  private _completePathTravelRun(): void {
    this._travelRunning = false;
    this._travelVehicle = null;
    this._cb.setAutopilotSuppressed(false);
    this._travelWheelLockedDir = 0;
    this._travelWheelStreakDir = 0;
    this._travelWheelStreakCount = 0;
    this._cancelRaf();

    // Hand control back to standard ship flow after tram loop is done.
    this._cb.showShip();
    this._cb.setFollowingSpaceship(true);
    this._cb.enableControls();

    const reason = this._pendingDispersalReason ?? "travel-loop-complete";
    this._pendingDispersalReason = null;
    this._pathCrystallizationActive = false;
    this._beginPathDispersing(reason);
  }

  private _beginPathDispersing(reason: string): void {
    this._clearPathReadyTravelTimeout();
    this._travelRunning = false;
    this._travelVehicle = null;
    this._cb.setAutopilotSuppressed(false);
    this._travelWheelLockedDir = 0;
    this._travelWheelStreakDir = 0;
    this._travelWheelStreakCount = 0;
    this._pathCrystallizationActive = false;
    if (!this._transition(AboutJourneyPhase.PATH_DISPERSING)) return;
    this._cb.enableControls();
    this._cb.onPathDispersalStarted();
    this._cb.vlog(
      `✨ [AboutJourney] Path dispersal (${reason}) — hydrate swarm forming at about anchor`,
    );
  }

  /** Called from the render loop when the primary swarm has finished dispersing. */
  notifyDispersalComplete(): void {
    if (this._phase !== AboutJourneyPhase.PATH_DISPERSING) return;
    this._cb.onPathDispersalComplete();
    this._cosmicPath = null;
    this._transition(AboutJourneyPhase.IDLE);
    this._cb.vlog(
      "✨ [AboutJourney] Handoff complete — swarm reset at about anchor",
    );
  }

  // --- Elapsed time in current phase ---

  get phaseElapsedMs(): number {
    return performance.now() - this._phaseStartedAt;
  }

  // --- Exit / reset (any phase → IDLE) ---

  exit(): void {
    this._cancelRaf();

    if (this._phase === AboutJourneyPhase.IDLE) return;

    const prevPhase = this._phase;
    this._cb.onAboutJourneyExit();
    this._clearPathReadyTravelTimeout();
    this._travelRunning = false;
    this._travelVehicle = null;
    this._pendingDispersalReason = null;
    this._pathCrystallizationActive = false;
    this._cb.setAutopilotSuppressed(false);
    this._phase = AboutJourneyPhase.IDLE;
    this._phaseStartedAt = performance.now();
    this._cosmicPath = null;

    if (prevPhase >= AboutJourneyPhase.FLY_THROUGH) {
      this._cb.showShip();
      this._cb.setFollowingSpaceship(true);
      this._cb.enableControls();
    }

    this._cb.vlog(`✨ [AboutJourney] ${PHASE_NAMES[prevPhase]} → IDLE (exit)`);
  }

  private _cancelRaf(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _clearPathReadyTravelTimeout(): void {
    if (this._pathReadyTravelTimeoutId !== null) {
      window.clearTimeout(this._pathReadyTravelTimeoutId);
      this._pathReadyTravelTimeoutId = null;
    }
  }

  dispose(): void {
    this.exit();
  }
}
