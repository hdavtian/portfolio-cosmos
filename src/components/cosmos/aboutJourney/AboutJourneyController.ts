import type CameraControls from "camera-controls";
import * as THREE from "three";
import {
  FollowPathBehavior,
  OnPathBehavior,
  Path as YukaPath,
  Vector3 as YukaVector3,
  Vehicle as YukaVehicle,
} from "yuka";
import {
  buildCosmicRoute,
  routeSpeedAt,
  type CosmicPathCurve,
  type RouteObstacle,
  type RouteStop,
} from "./cosmicRoute";

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
const PATH_TRAVEL_SAMPLE_COUNT = 900;
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
const PATH_TRAVEL_INPUT_RAMP_SECONDS = 3;
const PATH_TRAVEL_INPUT_MIN_SCALE = 0.2;
const PATH_TRAVEL_BRAKE_INPUT_FLOOR = 0.9;
/** The ride runs on its own at this speed scale (no rider speed input). */
const PATH_TRAVEL_AUTO_SPEED_SCALE = 2;
/** Route speed (from the speed profile) at or below which the view fully turns to a stop. */
const STOP_LOOK_FULL_SPEED = 0.45;
/** Route speed at or above which the view looks straight down the rail. */
const STOP_LOOK_NONE_SPEED = 1;
const STOP_LOOK_MAX_WEIGHT = 0.85;
/** Slow, so the turn toward a stop and back reads as a gentle head turn. */
const STOP_LOOK_DAMP_PER_SEC = 0.9;

// Falcon fly-by: once per ride, on an open stretch, the Falcon (scaled up)
// comes up alongside, matches speed, then punches ahead and peels away.
const FLY_BY_EARLIEST_S = 8;
/** Route speed that counts as cruising (away from stops). */
const FLY_BY_MIN_ROUTE_SPEED = 1;
/** Seconds of steady cruising before the fly-by starts. */
const FLY_BY_CRUISE_HOLD_S = 1;
/**
 * The fly-by starts on the straightest stretch early in the loop: every
 * cruise-speed stretch long enough for the approach and side-by-side flight
 * is scored by how far it bends, and one within this many degrees of the
 * straightest is picked at random when the ride starts.
 */
const FLY_BY_STRAIGHTNESS_TOLERANCE_DEG = 3;
/** Only the first part of the loop counts as "early on". */
const FLY_BY_EARLY_FRACTION = 0.6;
/** Samples of the loop used to find straight stretches. */
const FLY_BY_SCAN_SAMPLES = 1200;
/** Rail distance that must remain so it doesn't run into the finale. */
const FLY_BY_MIN_REMAINING = 12000;
/** ~14-unit model × FALCON_SCALE 0.05 × this ≈ 460 units long, dwarfing Mjolnir. */
const FLY_BY_SHIP_SCALE = 660;
/**
 * "Alongside" spot relative to the rider: always well ahead and off to the
 * side (~25° off center), so we see the ship's side as well as its rear.
 */
const FLY_BY_ALONG = 1100;
const FLY_BY_LATERAL = 520;
/** During the punch it cuts across in front of the rider to this side. */
const FLY_BY_CUT_ACROSS_LATERAL = -520;
const FLY_BY_HEIGHT = 20;
/** Peak of the single up-and-down arc while flying alongside. */
const FLY_BY_ARC_HEIGHT = 70;
/** Where the approach starts (behind the rider) and how far the punch covers. */
const FLY_BY_START_ALONG = -1400;
const FLY_BY_START_HEIGHT = -120;
const FLY_BY_PUNCH_DISTANCE = 3200;
const FLY_BY_APPROACH_S = 3;
const FLY_BY_ALONGSIDE_S = 4.5;
const FLY_BY_PUNCH_S = 1.5;
const FLY_BY_VEER_S = 2;
/** After the ride, the ship is parked this far ahead of where the rider stopped. */
const SHIP_PARK_AHEAD = 12;
const PATH_TRAVEL_ACCEL_PER_SEC = 1.2;
const PATH_TRAVEL_BRAKE_PER_SEC = 2.8;
const PATH_TRAVEL_COAST_DRAG_PER_SEC = 0.95;
const PATH_TRAVEL_CRUISE_MARKER_NORM = 0.7;
const PATH_TRAVEL_CRUISE_ENGAGE_SPEED_SCALE =
  PATH_TRAVEL_SPEED_SCALE_MAX * PATH_TRAVEL_CRUISE_MARKER_NORM;
const PATH_TRAVEL_CRUISE_SPEED_SCALE =
  PATH_TRAVEL_CRUISE_ENGAGE_SPEED_SCALE * 1.15;
const PATH_TRAVEL_CRUISE_TOP_SPEED_SCALE = PATH_TRAVEL_SPEED_SCALE_MAX;
const PATH_TRAVEL_CAMERA_TURN_DAMP_PER_SEC = 4.6;

// ---------------------------------------------------------------------------
// Cosmic route — a random closed loop through the universe's destinations
// ---------------------------------------------------------------------------

export interface CosmicRouteConfig {
  stops: RouteStop[];
  obstacles: RouteObstacle[];
  /** Length of the legacy loop; formation and ride times are matched to it. */
  referenceLength: number;
}

// ---------------------------------------------------------------------------
// Controller callbacks
// ---------------------------------------------------------------------------

export interface AboutJourneyCallbacks {
  hideShip(): void;
  showShip(): void;
  setShipPose(position: THREE.Vector3, forward: THREE.Vector3): void;
  /** Multiplies the ship's normal scale (1 restores it). */
  setShipScale?(multiplier: number): void;
  setFollowingSpaceship(v: boolean): void;
  disableControls(): void;
  enableControls(): void;
  getCamera(): THREE.Camera | null;
  getControls(): CameraControls | null;
  getShipPosition(): THREE.Vector3 | null;
  getSwarmWorldPosition(): THREE.Vector3 | null;
  setAutopilotSuppressed(v: boolean): void;
  vlog(msg: string): void;
  /** Fired once when the particle frenzy / path-forming cinematic begins. */
  onPathFormingStart?(): void;
  /** Spawn the secondary “hydrate” swarm at the about / memory-square anchor. */
  onPathDispersalStarted(): void;
  /** Swap hydrate swarm into the primary slot, dispose the old path swarm, restore camera limits. */
  onPathDispersalComplete(): void;
  /** Any non-IDLE exit: restore camera limits and drop the hydrate swarm if still present. */
  onAboutJourneyExit(): void;
  /** Optional object that rides the rail ahead of the rider and ends the ride. */
  getRideCompanion?(): RideCompanion | null;
}

export interface RideCompanion {
  readonly position: THREE.Vector3;
  /** Flies in and hovers in front of the rider; `onReady` once it waits to be grabbed. */
  arrive(path: CosmicPathCurve, riderT: number, onReady: () => void): boolean;
  /** Docks with the rider; `onDocked` once it's ready to pull. */
  dock(onDocked: () => void): boolean;
  /** Rider's camera position and smoothed travel direction. */
  setRiderFrame(cameraPosition: THREE.Vector3, forward: THREE.Vector3): void;
  /** While true, only `update(..., "ride")` from the ride tick moves it. */
  setDriven(driven: boolean): void;
  update(
    dt: number,
    elapsed: number,
    cameraPosition?: THREE.Vector3,
    source?: "scene" | "ride",
  ): void;
  setRider(riderT: number, sign: 1 | -1): void;
  /** Returns false if it can't strike, in which case the ride ends normally. */
  startStrike(onImpact: (impactT: number, point: THREE.Vector3) => void): boolean;
  hide(): void;
}

// ---------------------------------------------------------------------------
// Controller state (public read-only)
// ---------------------------------------------------------------------------

export interface AboutJourneyState {
  phase: AboutJourneyPhase;
  phaseName: string;
  phaseStartedAt: number;
}

export type AboutTravelCameraMode = "forward" | "free";

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
  private _cosmicPath: CosmicPathCurve | null = null;
  private _pathFormStartedAt = 0;
  private _dispersalOriginT = 0;
  private _dispersalOriginOverride: number | null = null;
  private _dispersalImpactPoint = new THREE.Vector3();
  private _hasDispersalImpactPoint = false;
  private _finaleActive = false;
  private _followDeferredUntilDispersalEnds = false;
  /** Camera is boarding the rail / Mjolnir is arriving or waiting (PATH_READY). */
  private _boarding = false;
  private _awaitingGrab = false;
  /** 0 = looking down the rail, up to STOP_LOOK_MAX_WEIGHT = turned toward a stop. */
  private _stopLookWeight = 0;
  private readonly _rideLookDir = new THREE.Vector3();
  private _flyByState: "pending" | "active" | "done" = "done";
  private _flyByTime = 0;
  private _cruiseSince = 0;
  /** Rider distance (from ride start) where the fly-by begins; null = no straight found. */
  private _flyByStartDistance: number | null = null;
  private _flyByHasPrev = false;
  private readonly _flyByPos = new THREE.Vector3();
  private readonly _flyByPrevPos = new THREE.Vector3();
  private readonly _flyByTangent = new THREE.Vector3();
  private readonly _flyByRight = new THREE.Vector3();
  private readonly _flyByForward = new THREE.Vector3(0, 0, 1);
  private readonly _flyByMotion = new THREE.Vector3();
  private readonly _flyByUp = new THREE.Vector3(0, 1, 0);
  /** Where the rider stopped at the end of the loop (near the About origin). */
  private _hasRideEnd = false;
  private readonly _rideEndPosition = new THREE.Vector3();
  private readonly _rideEndForward = new THREE.Vector3(0, 0, 1);
  private readonly _shipParkPosition = new THREE.Vector3();

  // Reusable temp vectors
  private readonly _tmpCam = new THREE.Vector3();
  private readonly _tmpTarget = new THREE.Vector3();
  private readonly _tmpFlyShipPos = new THREE.Vector3();

  private _routeConfigProvider: (() => CosmicRouteConfig | null) | null = null;
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
  private _travelInputDirection: -1 | 0 | 1 = 0;
  private _travelInputDirectionSince = 0;
  private _travelCruiseEnabled = false;
  private _travelCameraReversed = false;
  private _travelCameraMode: AboutTravelCameraMode = "forward";

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
  private readonly _tmpTravelForwardLookDir = new THREE.Vector3(0, 0, 1);
  private readonly _tmpTravelForwardTargetDir = new THREE.Vector3(0, 0, 1);

  constructor(callbacks: AboutJourneyCallbacks) {
    this._cb = callbacks;
  }

  /** Route inputs are read when a path starts forming, so positions are current. */
  setRouteConfigProvider(provider: () => CosmicRouteConfig | null): void {
    this._routeConfigProvider = provider;
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

  get cosmicPath(): CosmicPathCurve | null {
    return this._cosmicPath;
  }

  /** Where along the route (0..1) the rider was when the path burst. */
  get dispersalOriginT(): number {
    return this._dispersalOriginT;
  }

  /** Where the ride companion struck the rail, if the ride ended that way. */
  get dispersalImpactPoint(): THREE.Vector3 | null {
    return this._hasDispersalImpactPoint ? this._dispersalImpactPoint : null;
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

  get travelInputDirection(): -1 | 0 | 1 {
    return this._travelInputDirection;
  }

  get travelCameraReversed(): boolean {
    return this._travelCameraReversed;
  }

  get travelCameraMode(): AboutTravelCameraMode {
    return this._travelCameraMode;
  }

  get travelMomentumNormalized(): number {
    return THREE.MathUtils.clamp(
      Math.abs(this._travelSpeedScale) / PATH_TRAVEL_SPEED_SCALE_MAX,
      0,
      1,
    );
  }

  get travelCruiseEnabled(): boolean {
    return this._travelCruiseEnabled;
  }

  get travelCruiseThresholdNormalized(): number {
    return PATH_TRAVEL_CRUISE_MARKER_NORM;
  }

  get travelDistanceAbs(): number {
    return this._travelDistanceAbs;
  }

  get travelPathDistance(): number {
    const len = Math.max(1, this._travelPathLength);
    return THREE.MathUtils.euclideanModulo(this._travelDistanceTraveled, len);
  }

  setTravelSpeedScale(scale: number): void {
    this._travelSpeedScale = THREE.MathUtils.clamp(
      scale,
      PATH_TRAVEL_SPEED_SCALE_MIN,
      PATH_TRAVEL_SPEED_SCALE_MAX,
    );
    this._travelSpeedTarget = this._travelSpeedScale;
    this._travelInputDirection = 0;
    this._travelCruiseEnabled = false;
  }

  setTravelInputDirection(dir: -1 | 0 | 1): void {
    if (this._phase !== AboutJourneyPhase.PATH_TRAVEL || !this._travelRunning) {
      this._travelInputDirection = 0;
      this._travelInputDirectionSince = 0;
      return;
    }
    if (this._travelCruiseEnabled && dir < 0) {
      this._travelCruiseEnabled = false;
    }
    if (this._travelInputDirection !== dir) {
      this._travelInputDirectionSince = dir === 0 ? 0 : performance.now();
    }
    this._travelInputDirection = dir;
  }

  setTravelCameraReversed(v: boolean): void {
    this._travelCameraReversed = v;
  }

  setTravelCameraMode(mode: AboutTravelCameraMode): void {
    this._travelCameraMode = mode;
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

    // Stop following ship, disable user controls. The autopilot must let go
    // too, or it keeps steering the ship to its standoff point beside the
    // swarm instead of through it.
    this._cb.setAutopilotSuppressed(true);
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

    const routeConfig = this._routeConfigProvider?.();
    if (!routeConfig || routeConfig.stops.length === 0) {
      this._transition(AboutJourneyPhase.IDLE);
      return;
    }
    this._cosmicPath = buildCosmicRoute({ origin: swarmPos, ...routeConfig });
    this._dispersalOriginT = 0;
    this._dispersalOriginOverride = null;
    this._hasDispersalImpactPoint = false;
    this._pathFormStartedAt = performance.now();
    const { timing } = this._cosmicPath;
    this._cb.vlog(
      `✨ [AboutJourney] Route ${Math.round(timing.length)} units ` +
        `(legacy ${Math.round(timing.referenceLength)}), forms in ` +
        `${timing.formSeconds.toFixed(1)}s`,
    );

    // Enable controls so user can look around, but we'll soft-guide the target
    this._cb.enableControls();
    this._cb.onPathFormingStart?.();

    const _trackTarget = new THREE.Vector3();
    const _currentTarget = new THREE.Vector3();
    const _headPos = new THREE.Vector3();
    const TRACK_LERP = 0.015; // Gentle tracking — not locked, just guided

    const tick = () => {
      if (this._phase !== AboutJourneyPhase.PATH_FORMING) return;

      const ctrl = this._cb.getControls();
      if (ctrl && this._cosmicPath) {
        // Calculate where the spear head currently is on the path
        const elapsed = performance.now() - this._pathFormStartedAt;
        const { length, headSpeed } = this._cosmicPath.timing;
        const headT = Math.min(1, ((elapsed / 1000) * headSpeed) / length);
        this._cosmicPath.getPointAt(headT, _headPos);
        const headPos = _headPos;

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
        this._boardRail();
      }
    }, PATH_READY_TRAVEL_DELAY_MS);
  }

  /**
   * Boards the rider onto the rail (still PATH_READY) and calls Mjolnir in.
   * The ride itself starts only when the rider grabs the hammer.
   */
  private _boardRail(): void {
    if (this._phase !== AboutJourneyPhase.PATH_READY || this._boarding) return;
    this._boarding = true;
    this._awaitingGrab = false;
    this._clearPathReadyTravelTimeout();
    // Ride is camera-only; the ship stays hidden while riding the rail.
    this._cb.hideShip();
    this._cb.setFollowingSpaceship(false);
    this._cb.disableControls();
    this._startPathTravelRun();
    this._cb.vlog("✨ [AboutJourney] Boarding the rail — calling Mjolnir");
  }

  /** True while Mjolnir hovers in front of the rider, waiting to be clicked. */
  get awaitingGrab(): boolean {
    return this._awaitingGrab;
  }

  /** Rider clicked Mjolnir: it docks, then pulls the rider down the rail. */
  grabCompanion(): void {
    if (this._phase !== AboutJourneyPhase.PATH_READY || !this._awaitingGrab) {
      return;
    }
    const companion = this._cb.getRideCompanion?.();
    if (!companion) return;
    this._awaitingGrab = false;
    companion.dock(() => this._beginRide());
  }

  private _beginRide(): void {
    if (this._phase !== AboutJourneyPhase.PATH_READY) return;
    if (!this._transition(AboutJourneyPhase.PATH_TRAVEL)) return;
    this._boarding = false;
    this._cb.getRideCompanion?.()?.setDriven(true);
    this._travelStartedAt = performance.now();
    this._travelLastTickAt = this._travelStartedAt;
    this._runPathTravelTick();
    this._cb.vlog("✨ [AboutJourney] Mjolnir docked — ride underway");
  }

  /** Fast-forward the path-forming cinematic directly into tram boarding/travel. */
  skipCinematicToPathTravel(): void {
    if (this._phase !== AboutJourneyPhase.PATH_FORMING || !this._cosmicPath) {
      return;
    }

    this._cancelRaf();
    if (!this._transition(AboutJourneyPhase.PATH_READY)) return;
    this._cb.enableControls();

    // Mark crystallization as effectively complete so visuals are fully formed.
    this._pathCrystallizationDurationMs = PATH_CRYSTALLIZATION_MIN_MS;
    this._pathCrystallizationStartedAt =
      performance.now() - this._pathCrystallizationDurationMs;
    this._pathCrystallizationActive = true;

    this._clearPathReadyTravelTimeout();
    this._cb.vlog(
      "⏭️ [AboutJourney] Skipping path-forming cinematic to tram boarding",
    );
    this._boardRail();
  }

  /** Explicitly disperse the path, e.g. when retargeting Falcon to another destination. */
  beginPathDispersal(reason = "manual"): void {
    if (
      this._phase !== AboutJourneyPhase.PATH_READY &&
      this._phase !== AboutJourneyPhase.PATH_TRAVEL
    ) {
      return;
    }

    this._clearPathReadyTravelTimeout();
    this._pathCrystallizationActive = false;
    // Retargeting away mid-ride: no hammer finale.
    this._cb.getRideCompanion?.()?.hide();
    this._finaleActive = false;
    this._boarding = false;
    this._awaitingGrab = false;

    if (
      this._phase === AboutJourneyPhase.PATH_TRAVEL ||
      this._phase === AboutJourneyPhase.PATH_READY
    ) {
      this._travelRunning = false;
      this._travelVehicle = null;
      this._travelInputDirection = 0;
      this._travelInputDirectionSince = 0;
      this._travelSpeedTarget = 0;
      this._travelSpeedScale = 0;
      this._travelCruiseEnabled = false;
      this._cancelRaf();
    }

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
    this._travelInputDirection = 0;
    this._travelInputDirectionSince = 0;
    this._travelCruiseEnabled = false;
    this._travelCameraReversed = false;
    this._travelCameraMode = "forward";
    this._travelStartedAt = performance.now();
    this._travelLastTickAt = this._travelStartedAt;
    this._travelRunning = true;
    this._cb.setAutopilotSuppressed(true);

    this._tmpTravelForward.subVectors(ordered[1], ordered[0]).normalize();
    if (this._tmpTravelForward.lengthSq() < 0.0001) {
      this._tmpTravelForward.set(0, 0, 1);
    }
    this._tmpTravelForwardLookDir.copy(this._tmpTravelForward);

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
      if (this._phase !== AboutJourneyPhase.PATH_READY || !this._boarding) {
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
        this._rafId = null;
        const companion = this._cb.getRideCompanion?.();
        const path = this._cosmicPath;
        companion?.setRiderFrame(this._tmpTravelBoardEndCam, this._tmpTravelForward);
        const arriving =
          !!companion &&
          !!path &&
          companion.arrive(
            path,
            THREE.MathUtils.euclideanModulo(this._travelStartT, 1),
            () => {
              if (this._phase === AboutJourneyPhase.PATH_READY && this._boarding) {
                this._awaitingGrab = true;
              }
            },
          );
        // Without the hammer (e.g. it failed to load) the ride starts on its own.
        if (!arriving) this._beginRide();
        return;
      }

      this._rafId = requestAnimationFrame(boardTick);
    };

    this._cancelRaf();
    this._rafId = requestAnimationFrame(boardTick);
  }

  private _runPathTravelTick(): void {
    // The ride steers the camera (down the rail, and toward stops).
    this._cb.disableControls();
    this._stopLookWeight = 0;
    this._rideLookDir.set(0, 0, 0);
    this._flyByState = "pending";
    this._cruiseSince = 0;
    this._flyByStartDistance = this._pickFlyByStart();
    this._hasRideEnd = false;

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

      if (this._travelCruiseEnabled && this._travelInputDirection >= 0) {
        this._travelSpeedTarget = PATH_TRAVEL_CRUISE_TOP_SPEED_SCALE;
      } else if (this._travelInputDirection !== 0) {
        const heldSeconds = Math.max(
          0,
          (now - this._travelInputDirectionSince) / 1000,
        );
        const heldRamp = THREE.MathUtils.clamp(
          heldSeconds / PATH_TRAVEL_INPUT_RAMP_SECONDS,
          0,
          1,
        );
        const rampedMagnitude = THREE.MathUtils.lerp(
          PATH_TRAVEL_INPUT_MIN_SCALE,
          PATH_TRAVEL_SPEED_SCALE_MAX,
          heldRamp,
        );
        const isOppositeInputToVelocity =
          Math.abs(this._travelSpeedScale) > 0.08 &&
          Math.sign(this._travelSpeedScale) !== this._travelInputDirection;
        const brakingMagnitude = isOppositeInputToVelocity
          ? Math.max(PATH_TRAVEL_BRAKE_INPUT_FLOOR, rampedMagnitude)
          : rampedMagnitude;

        this._travelSpeedTarget = this._travelInputDirection * brakingMagnitude;
      } else {
        // No rider input: Mjolnir pulls at a steady pace to the end.
        this._travelSpeedTarget = PATH_TRAVEL_AUTO_SPEED_SCALE;
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
        this._travelInputDirection === 0 &&
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

      if (
        !this._travelCruiseEnabled &&
        this._travelInputDirection === 1 &&
        this._travelSpeedScale >= PATH_TRAVEL_CRUISE_ENGAGE_SPEED_SCALE
      ) {
        this._travelCruiseEnabled = true;
        this._travelSpeedScale = Math.max(
          this._travelSpeedScale,
          PATH_TRAVEL_CRUISE_SPEED_SCALE,
        );
        this._travelSpeedTarget = PATH_TRAVEL_CRUISE_TOP_SPEED_SCALE;
        this._travelInputDirection = 0;
        this._travelInputDirectionSince = 0;
      }

      this._tmpTravelVel.set(
        this._travelVehicle.velocity.x,
        this._travelVehicle.velocity.y,
        this._travelVehicle.velocity.z,
      );

      // Slow through stops, faster between them; a full loop still takes as
      // long as the legacy loop.
      const routeSpeed = this._cosmicPath
        ? routeSpeedAt(
            this._cosmicPath.timing,
            this._travelStartT +
              this._travelDistanceTraveled /
                Math.max(1, this._travelPathLength),
          )
        : 1;
      const guideSpeed = PATH_TRAVEL_SPEED * this._travelSpeedScale * routeSpeed;
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
      this._cb.getRideCompanion?.()?.setRider(railT, travelSign);
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
        // "Invisible tram" feel: keep camera on the rail centerline and only
        // raise slightly for readability.
        this._tmpTravelCamPos
          .copy(this._tmpTravelPos)
          .add(new THREE.Vector3(0, PATH_TRAVEL_CAM_HEIGHT, 0));

        // Look down the rail; while the ride slows past a stop, slowly turn
        // toward it, then back as it speeds up again.
        // Travel heading, smoothed through bends. Mjolnir rides along it.
        if (this._rideLookDir.lengthSq() < 1e-4) {
          this._rideLookDir.copy(this._tmpTravelForward);
        }
        this._rideLookDir
          .lerp(
            this._tmpTravelForward,
            1 - Math.exp(-PATH_TRAVEL_CAMERA_TURN_DAMP_PER_SEC * dt),
          )
          .normalize();
        this._tmpTravelForwardTargetDir.copy(this._rideLookDir);
        let nearestStop: THREE.Vector3 | null = null;
        let nearestStopDistSq = Number.POSITIVE_INFINITY;
        for (const center of path.timing.stopCenters) {
          const d2 = center.distanceToSquared(this._tmpTravelPos);
          if (d2 < nearestStopDistSq) {
            nearestStopDistSq = d2;
            nearestStop = center;
          }
        }
        const slowness =
          1 -
          THREE.MathUtils.smoothstep(
            routeSpeed,
            STOP_LOOK_FULL_SPEED,
            STOP_LOOK_NONE_SPEED,
          );
        const lookWeightTarget = nearestStop ? slowness * STOP_LOOK_MAX_WEIGHT : 0;
        this._stopLookWeight +=
          (lookWeightTarget - this._stopLookWeight) *
          (1 - Math.exp(-STOP_LOOK_DAMP_PER_SEC * dt));
        if (nearestStop && this._stopLookWeight > 1e-3) {
          this._tmpTravelUserTarget
            .subVectors(nearestStop, this._tmpTravelCamPos)
            .normalize();
          this._tmpTravelForwardTargetDir
            .lerp(this._tmpTravelUserTarget, this._stopLookWeight)
            .normalize();
        }
        // The stop weight itself eases slowly, so the view turns gently.
        this._tmpTravelUserViewDir.copy(this._tmpTravelForwardTargetDir);

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

      // Move Mjolnir in this same tick, from this frame's camera position, so
      // it can't lag a frame behind (at ride speed that read as jitter and as
      // the rider overtaking it).
      const rideCompanion = this._cb.getRideCompanion?.();
      if (rideCompanion) {
        rideCompanion.setRiderFrame(this._tmpTravelCamPos, this._rideLookDir);
        rideCompanion.update(dt, now / 1000, this._tmpTravelCamPos, "ride");
      }

      this._updateFlyBy(dt, now, routeSpeed, path);

      const elapsedMs = now - this._travelStartedAt;
      const loopCompleted = this._travelDistanceAbs >= this._travelPathLength;
      const minElapsed = elapsedMs >= PATH_TRAVEL_MIN_DURATION_MS;

      if (loopCompleted && minElapsed) {
        this._rideEndPosition.copy(this._tmpTravelCamPos);
        this._rideEndForward.copy(this._rideLookDir);
        this._hasRideEnd = this._rideEndForward.lengthSq() > 1e-6;
        // The companion smashes the rail; the shatter starts where it lands.
        const companion = this._cb.getRideCompanion?.();
        const striking = companion?.startStrike((impactT, point) => {
          this._finaleActive = false;
          this._dispersalOriginOverride = impactT;
          this._dispersalImpactPoint.copy(point);
          this._hasDispersalImpactPoint = true;
          this._completePathTravelRun();
        });
        if (companion && striking) {
          this._runFinaleCamera(companion);
        } else {
          this._completePathTravelRun();
        }
        return;
      }

      this._rafId = requestAnimationFrame(tick);
    };

    this._cancelRaf();
    this._rafId = requestAnimationFrame(tick);
  }

  /**
   * Picks, at random, the start of a long, nearly straight cruise stretch early
   * in the loop for the fly-by. Returns the rider distance from the ride start
   * to begin at, or null if the route has no such stretch.
   */
  private _pickFlyByStart(): number | null {
    const path = this._cosmicPath;
    if (!path) return null;
    const length = Math.max(1, this._travelPathLength);
    const n = FLY_BY_SCAN_SAMPLES;
    const ds = length / n;
    const tangents: THREE.Vector3[] = [];
    const speeds: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = THREE.MathUtils.euclideanModulo(this._travelStartT + i / n, 1);
      tangents.push(path.getTangentAt(t, new THREE.Vector3()).normalize());
      speeds.push(routeSpeedAt(path.timing, t));
    }

    // Samples the rider covers while the Falcon is in view: the second half
    // of the approach and the side-by-side flight (early in the approach it's
    // still behind the rider, and the punch races ahead on its own).
    const flyBySeconds = FLY_BY_APPROACH_S * 0.5 + FLY_BY_ALONGSIDE_S;
    const riderSpeedAt = (i: number) =>
      PATH_TRAVEL_SPEED * PATH_TRAVEL_AUTO_SPEED_SCALE * Math.max(0.05, speeds[i % n]);
    const earliest = Math.ceil(
      (FLY_BY_EARLIEST_S * riderSpeedAt(0)) / ds,
    );
    const latest = Math.floor(n * FLY_BY_EARLY_FRACTION);

    // Score every cruise-speed window by its worst bend (min tangent dot).
    const windows: Array<{ start: number; straightness: number }> = [];
    for (let start = earliest; start < latest; start++) {
      if (length - start * ds <= FLY_BY_MIN_REMAINING) break;
      let time = 0;
      let straightness = 1;
      let cruising = true;
      let i = start;
      while (time < flyBySeconds && i - start < n) {
        if (speeds[i % n] < FLY_BY_MIN_ROUTE_SPEED) {
          cruising = false;
          break;
        }
        straightness = Math.min(straightness, tangents[i % n].dot(tangents[start]));
        time += ds / riderSpeedAt(i);
        i++;
      }
      if (cruising && time >= flyBySeconds) windows.push({ start, straightness });
    }
    if (windows.length === 0) {
      this._cb.vlog("✈️ [AboutJourney] No cruise stretch for the fly-by; using cruise trigger");
      return null;
    }

    const bestBendDeg = THREE.MathUtils.radToDeg(
      Math.acos(THREE.MathUtils.clamp(Math.max(...windows.map((w) => w.straightness)), -1, 1)),
    );
    const acceptCos = Math.cos(
      THREE.MathUtils.degToRad(bestBendDeg + FLY_BY_STRAIGHTNESS_TOLERANCE_DEG),
    );
    const candidates = windows.filter((w) => w.straightness >= acceptCos);
    const pick = candidates[Math.floor(Math.random() * candidates.length)].start;
    this._cb.vlog(
      `✈️ [AboutJourney] Fly-by planned at ${Math.round(pick * ds)} units ` +
        `(straightest bend ${bestBendDeg.toFixed(1)}°, ${candidates.length} starts)`,
    );
    return pick * ds;
  }

  private _updateFlyBy(
    dt: number,
    now: number,
    routeSpeed: number,
    path: CosmicPathCurve,
  ): void {
    if (this._flyByState === "done") return;
    const length = Math.max(1, this._travelPathLength);

    if (this._flyByState === "pending") {
      if (this._flyByStartDistance !== null) {
        // Planned: begin when the rider reaches the chosen straight stretch.
        if (this._travelDistanceAbs < this._flyByStartDistance) return;
      } else {
        // No straight stretch on this route: fall back to steady cruising.
        const cruising =
          routeSpeed >= FLY_BY_MIN_ROUTE_SPEED &&
          (now - this._travelStartedAt) / 1000 > FLY_BY_EARLIEST_S &&
          length - this._travelDistanceAbs > FLY_BY_MIN_REMAINING;
        this._cruiseSince = cruising ? this._cruiseSince + dt : 0;
        if (this._cruiseSince < FLY_BY_CRUISE_HOLD_S) return;
      }
      this._flyByState = "active";
      this._flyByTime = 0;
      this._flyByHasPrev = false;
      this._cb.setShipScale?.(FLY_BY_SHIP_SCALE);
    }

    this._flyByTime += dt;
    const t = this._flyByTime;
    const approachEnd = FLY_BY_APPROACH_S;
    const alongsideEnd = approachEnd + FLY_BY_ALONGSIDE_S;
    const punchEnd = alongsideEnd + FLY_BY_PUNCH_S;
    const veerEnd = punchEnd + FLY_BY_VEER_S;
    let along = FLY_BY_ALONG;
    let lateral = FLY_BY_LATERAL;
    let height = FLY_BY_HEIGHT;
    if (t < approachEnd) {
      // Blows in from behind and settles alongside, easing to our speed.
      const u = t / FLY_BY_APPROACH_S;
      along = THREE.MathUtils.lerp(
        FLY_BY_START_ALONG,
        FLY_BY_ALONG,
        1 - Math.pow(1 - u, 3),
      );
      height = THREE.MathUtils.lerp(
        FLY_BY_START_HEIGHT,
        FLY_BY_HEIGHT,
        THREE.MathUtils.smoothstep(u, 0, 1),
      );
    } else if (t < alongsideEnd) {
      // Locked alongside (no fore/aft drift, which read as falling behind),
      // rising in one gentle arc and settling back, like real flight; the
      // nose follows the motion so it pitches into the climb and out of it.
      height +=
        FLY_BY_ARC_HEIGHT *
        Math.sin((Math.PI * (t - approachEnd)) / FLY_BY_ALONGSIDE_S);
    } else if (t < punchEnd) {
      // Punches it and cuts across in front of the rider once it's clear
      // ahead (so the big ship never sweeps through the camera or Mjolnir).
      const u = (t - alongsideEnd) / FLY_BY_PUNCH_S;
      along += FLY_BY_PUNCH_DISTANCE * u * u * u;
      lateral = THREE.MathUtils.lerp(
        FLY_BY_LATERAL,
        FLY_BY_CUT_ACROSS_LATERAL,
        THREE.MathUtils.smoothstep(u, 0.3, 1),
      );
    } else if (t < veerEnd) {
      // Keeps its punch speed (never slows) while veering off on the far side
      // and climbing away.
      const punchExitSpeed = (3 * FLY_BY_PUNCH_DISTANCE) / FLY_BY_PUNCH_S;
      const s = t - punchEnd;
      const u = s / FLY_BY_VEER_S;
      along += FLY_BY_PUNCH_DISTANCE + punchExitSpeed * s;
      lateral = FLY_BY_CUT_ACROSS_LATERAL - 2600 * u * u;
      height += 1000 * u * u;
    } else {
      this._endFlyBy();
      return;
    }

    const riderDistance = this._travelStartT * length + this._travelDistanceTraveled;
    const s = THREE.MathUtils.euclideanModulo((riderDistance + along) / length, 1);
    path.getPointAt(s, this._flyByPos);
    path.getTangentAt(s, this._flyByTangent).normalize();
    this._flyByRight.crossVectors(this._flyByTangent, this._flyByUp).normalize();
    this._flyByPos
      .addScaledVector(this._flyByRight, lateral)
      .addScaledVector(this._flyByUp, height);

    // Nose follows its actual motion, smoothed.
    if (this._flyByHasPrev) {
      this._flyByMotion.subVectors(this._flyByPos, this._flyByPrevPos);
    }
    const wanted =
      this._flyByHasPrev && this._flyByMotion.lengthSq() > 1e-4
        ? this._flyByMotion.normalize()
        : this._flyByTangent;
    if (!this._flyByHasPrev) this._flyByForward.copy(wanted);
    this._flyByForward.lerp(wanted, 1 - Math.exp(-6 * dt)).normalize();
    this._flyByPrevPos.copy(this._flyByPos);
    this._flyByHasPrev = true;
    this._cb.setShipPose(this._flyByPos, this._flyByForward);
  }

  /**
   * Parks the ship just ahead of where the rider stopped (the loop ends back
   * at the About origin), so following it resumes right there instead of
   * wherever the ship was left, e.g. far down the rail after the fly-by.
   */
  private _placeShipAtRideEnd(): void {
    if (!this._hasRideEnd) return;
    this._hasRideEnd = false;
    this._shipParkPosition
      .copy(this._rideEndPosition)
      .addScaledVector(this._rideEndForward, SHIP_PARK_AHEAD);
    this._cb.setShipPose(this._shipParkPosition, this._rideEndForward);
  }

  private _endFlyBy(): void {
    if (this._flyByState === "active") {
      this._cb.hideShip();
      this._cb.setShipScale?.(1);
    }
    this._flyByState = "done";
  }

  /** Rider stops on the rail and watches the companion climb and dive. */
  private _runFinaleCamera(companion: RideCompanion): void {
    this._finaleActive = true;
    const camPos = this._tmpTravelCamPos.clone();
    const lookDir = this._tmpTravelUserViewDir.clone();
    const wantDir = new THREE.Vector3();
    const look = new THREE.Vector3();
    let last = performance.now();
    const tick = () => {
      if (!this._finaleActive || this._phase !== AboutJourneyPhase.PATH_TRAVEL) {
        return;
      }
      const now = performance.now();
      const dt = THREE.MathUtils.clamp((now - last) / 1000, 1 / 240, 1 / 30);
      last = now;
      wantDir.subVectors(companion.position, camPos);
      if (wantDir.lengthSq() > 1e-4) {
        lookDir.lerp(wantDir.normalize(), 1 - Math.exp(-5 * dt)).normalize();
      }
      look.copy(camPos).addScaledVector(lookDir, PATH_TRAVEL_CAM_LOOK_AHEAD);
      this._cb
        .getControls()
        ?.setLookAt(camPos.x, camPos.y, camPos.z, look.x, look.y, look.z, false);
      this._rafId = requestAnimationFrame(tick);
    };
    this._cancelRaf();
    this._rafId = requestAnimationFrame(tick);
  }

  private _completePathTravelRun(): void {
    this._travelRunning = false;
    this._travelVehicle = null;
    this._cb.setAutopilotSuppressed(false);
    this._travelInputDirection = 0;
    this._travelInputDirectionSince = 0;
    this._travelCruiseEnabled = false;
    this._travelCameraReversed = false;
    this._travelCameraMode = "forward";
    this._cancelRaf();

    // Hand control back to standard ship flow after tram loop is done. After
    // a hammer strike the camera holds on the impact until the burst ends;
    // following the ship now would fight it and shake the view.
    if (this._hasDispersalImpactPoint) {
      this._followDeferredUntilDispersalEnds = true;
    } else {
      this._placeShipAtRideEnd();
      this._cb.showShip();
      this._cb.setFollowingSpaceship(true);
    }
    this._cb.enableControls();

    const reason = this._pendingDispersalReason ?? "travel-loop-complete";
    this._pendingDispersalReason = null;
    this._pathCrystallizationActive = false;
    this._beginPathDispersing(reason);
  }

  private _beginPathDispersing(reason: string): void {
    // The burst radiates from wherever the rider is on the rail.
    this._dispersalOriginT =
      this._dispersalOriginOverride ??
      (this._travelPathLength > 1
        ? THREE.MathUtils.euclideanModulo(
            this._travelStartT +
              this._travelDistanceTraveled / this._travelPathLength,
            1,
          )
        : 0);
    this._dispersalOriginOverride = null;
    this._finaleActive = false;
    this._boarding = false;
    this._awaitingGrab = false;
    this._endFlyBy();
    this._clearPathReadyTravelTimeout();
    this._travelRunning = false;
    this._travelVehicle = null;
    this._cb.setAutopilotSuppressed(false);
    this._travelInputDirection = 0;
    this._travelInputDirectionSince = 0;
    this._travelCruiseEnabled = false;
    this._travelCameraReversed = false;
    this._travelCameraMode = "forward";
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
    if (this._followDeferredUntilDispersalEnds) {
      this._followDeferredUntilDispersalEnds = false;
      this._placeShipAtRideEnd();
      this._cb.showShip();
      this._cb.setFollowingSpaceship(true);
    }
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
    this._cb.getRideCompanion?.()?.hide();
    this._finaleActive = false;
    this._followDeferredUntilDispersalEnds = false;
    this._hasDispersalImpactPoint = false;
    this._dispersalOriginOverride = null;
    this._boarding = false;
    this._awaitingGrab = false;
    this._endFlyBy();
    this._clearPathReadyTravelTimeout();
    this._travelRunning = false;
    this._travelVehicle = null;
    this._pendingDispersalReason = null;
    this._pathCrystallizationActive = false;
    this._travelInputDirection = 0;
    this._travelInputDirectionSince = 0;
    this._travelCruiseEnabled = false;
    this._travelCameraReversed = false;
    this._travelCameraMode = "forward";
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
