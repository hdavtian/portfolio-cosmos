import * as THREE from "three";
import type CameraControls from "camera-controls";

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
} as const;

export type AboutJourneyPhase = (typeof AboutJourneyPhase)[keyof typeof AboutJourneyPhase];

const PHASE_NAMES: Record<AboutJourneyPhase, string> = {
  [AboutJourneyPhase.IDLE]: "IDLE",
  [AboutJourneyPhase.TRANSIT]: "TRANSIT",
  [AboutJourneyPhase.FLY_THROUGH]: "FLY_THROUGH",
  [AboutJourneyPhase.EXCITEMENT]: "EXCITEMENT",
  [AboutJourneyPhase.PATH_FORMING]: "PATH_FORMING",
  [AboutJourneyPhase.PATH_READY]: "PATH_READY",
};

const ALLOWED_TRANSITIONS: Record<AboutJourneyPhase, AboutJourneyPhase[]> = {
  [AboutJourneyPhase.IDLE]: [AboutJourneyPhase.TRANSIT],
  [AboutJourneyPhase.TRANSIT]: [AboutJourneyPhase.FLY_THROUGH, AboutJourneyPhase.IDLE],
  [AboutJourneyPhase.FLY_THROUGH]: [AboutJourneyPhase.EXCITEMENT, AboutJourneyPhase.IDLE],
  [AboutJourneyPhase.EXCITEMENT]: [AboutJourneyPhase.PATH_FORMING, AboutJourneyPhase.IDLE],
  [AboutJourneyPhase.PATH_FORMING]: [AboutJourneyPhase.PATH_READY, AboutJourneyPhase.IDLE],
  [AboutJourneyPhase.PATH_READY]: [AboutJourneyPhase.IDLE],
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ARRIVAL_TRIGGER_DIST = 900;
const FLY_THROUGH_DURATION_MS = 3000;
const FLY_THROUGH_OVERSHOOT = 350;
const FLY_THROUGH_CAM_LAG = 180;
const FLY_THROUGH_CAM_HEIGHT = 40;

const EXCITEMENT_DURATION_MS = 6000;
const PATH_HEAD_SPEED = 3500; // Must match AboutParticleSwarm.ts

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
  setFollowingSpaceship(v: boolean): void;
  disableControls(): void;
  enableControls(): void;
  getCamera(): THREE.Camera | null;
  getControls(): CameraControls | null;
  getShipPosition(): THREE.Vector3 | null;
  getSwarmWorldPosition(): THREE.Vector3 | null;
  vlog(msg: string): void;
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

  private _landmarks: UniverseLandmark[] = [];

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

  get excitementProgress(): number {
    if (this._phase !== AboutJourneyPhase.EXCITEMENT) return 0;
    return Math.min(1, (performance.now() - this._excitementStartedAt) / EXCITEMENT_DURATION_MS);
  }

  get ringAxis(): THREE.Vector3 {
    return this._ringAxis;
  }

  get cosmicPath(): THREE.CatmullRomCurve3 | null {
    return this._cosmicPath;
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

    // The point where the ship passes through the swarm
    this._flyThroughPoint.copy(swarmPos);

    // Camera starts at current position, ends behind the fly-through point
    this._flyStartCam.copy(camera.position);
    this._flyEndCam.copy(swarmPos)
      .addScaledVector(flyDir, -FLY_THROUGH_CAM_LAG)
      .add(new THREE.Vector3(0, FLY_THROUGH_CAM_HEIGHT, 0));

    // Look target: start at swarm center, end past it
    this._flyStartTarget.copy(swarmPos);
    this._flyEndTarget.copy(swarmPos).addScaledVector(flyDir, FLY_THROUGH_OVERSHOOT);

    // Random ring axis (tilted from vertical for visual interest)
    this._ringAxis.set(
      (Math.random() - 0.5) * 0.6,
      0.7 + Math.random() * 0.3,
      (Math.random() - 0.5) * 0.6,
    ).normalize();

    // Stop following ship, disable user controls
    this._cb.setFollowingSpaceship(false);
    this._cb.disableControls();

    // The ship stays visible during fly-through — it will be hidden at the end
    const startedAt = performance.now();
    const smooth = (u: number) => u * u * (3 - 2 * u);

    const tick = () => {
      if (this._phase !== AboutJourneyPhase.FLY_THROUGH) return;

      const elapsed = performance.now() - startedAt;
      const t = THREE.MathUtils.clamp(elapsed / FLY_THROUGH_DURATION_MS, 0, 1);
      const s = smooth(t);

      // Camera smoothly moves to behind-the-swarm position
      this._tmpCam.lerpVectors(this._flyStartCam, this._flyEndCam, s);
      // Look target sweeps from swarm center through to overshoot
      this._tmpTarget.lerpVectors(this._flyStartTarget, this._flyEndTarget, s);

      const ctrl = this._cb.getControls();
      if (ctrl) {
        ctrl.setLookAt(
          this._tmpCam.x, this._tmpCam.y, this._tmpCam.z,
          this._tmpTarget.x, this._tmpTarget.y, this._tmpTarget.z,
          false,
        );
      }

      // Hide ship at 60% through (it has "passed through" and is flying away)
      if (t > 0.6) {
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
        const headT = Math.min(1, (elapsed / 1000 * PATH_HEAD_SPEED) / pathLength);
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
    this._cb.vlog("✨ [AboutJourney] Cosmic path loop complete — ready to travel");
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
    this._phase = AboutJourneyPhase.IDLE;
    this._phaseStartedAt = performance.now();
    this._cosmicPath = null;

    if (prevPhase >= AboutJourneyPhase.FLY_THROUGH) {
      this._cb.showShip();
      this._cb.setFollowingSpaceship(true);
      this._cb.enableControls();
    }

    this._cb.vlog(
      `✨ [AboutJourney] ${PHASE_NAMES[prevPhase]} → IDLE (exit)`,
    );
  }

  private _cancelRaf(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  dispose(): void {
    this.exit();
  }
}
