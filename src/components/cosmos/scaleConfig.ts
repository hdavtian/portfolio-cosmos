// ═══════════════════════════════════════════════════════════════════════════════
// scaleConfig.ts — Central scale constants for the entire cosmos scene.
//
// DESIGN:
//   Phase 2 wires every hardcoded spatial value in the codebase to this file.
//   Phase 3 changes the multipliers below to achieve realistic scale.
//
// SAFETY:
//   All multipliers start at 1.0, so the app is UNCHANGED after wiring.
//   To rollback Phase 3, set all multipliers back to 1.0.
//
// CONVENTION:
//   - "orig:" comments show the original hardcoded value for verification.
//   - Only SPATIAL constants live here (distances, sizes, positions).
//   - Behavioral constants (rates, angles, opacities) stay in their files.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── BASE MULTIPLIERS ─────────────────────────────────────────────────────────
// Phase 3 ACTIVE — multipliers set to target values.
// To rollback: set all values back to 1.0.

export const SCALE = {
  /** Multiplier for the sun radius and related distances */
  sun: 4, // orig: 1.0 → Sun radius 60 → 240 (reduced from 6.7 — was too dominant)

  /** Multiplier for planet radii */
  planet: 7, // orig: 1.0 → Planets 15–20 → 105–140

  /** Multiplier for moon radii */
  moon: 6, // orig: 1.0 → Moons 5–6 → 30–36

  /** Multiplier for orbital distances (planets from sun, moons from planets) */
  orbit: 2, // orig: 1.0 → Orbits 600–1000 → 1200–2000

  /**
   * Multiplier for ship scales (< 1 to shrink).
   * Falcon: 0.5 × 0.1 = 0.05 scale (~0.8 units long, ~10× smaller than before)
   * Star Destroyer: 0.06 × 0.1 = 0.006 scale (~4.4 units long)
   * Planet:Falcon ratio ≈ 130:1 (was 3:1, real life is millions:1)
   */
  ship: 0.1, // orig: 1.0 → Ships shrink ~10×

  /** Multiplier for camera and view distances */
  camera: 2, // orig: 1.0 → Camera distances 2× to match orbit expansion
} as const;

// ─── CELESTIAL BODIES ─────────────────────────────────────────────────────────

// Sun  (orig radius: 60)
export const SUN_RADIUS = 60 * SCALE.sun;                 // 240
export const SUN_GLOW_SPRITE_SIZE = 180 * 2.5;            // 450 — decoupled from sun scale (was 1206, too huge)
export const SUN_LABEL_Y = 50 * SCALE.sun;                // 200

// Planets  (orig radii: 15, 20, 18)
export const EXPERIENCE_RADIUS = 15 * SCALE.planet;
export const SKILLS_RADIUS = 20 * SCALE.planet;
export const PROJECTS_RADIUS = 18 * SCALE.planet;

// Planet orbits — set directly for universe expansion.
// Experience 10× further from sun; Skills/Projects double their gap from Experience.
// Current gaps: Exp→Skills=800, Exp→Projects=600 → doubled to 1600, 1200.
export const EXPERIENCE_ORBIT = 12_000;
export const SKILLS_ORBIT = 13_600;     // 12000 + 1600
export const PROJECTS_ORBIT = 13_200;   // 12000 + 1200

// Moons  (orig radii: 5, 6)
export const EXP_MOON_RADIUS = 5 * SCALE.moon;
export const SKILL_MOON_RADIUS = 6 * SCALE.moon;
export const SCROLLING_MOON_RADIUS = 5 * SCALE.moon;

// Moon orbits from parent — MUST exceed parent radius + moon radius + gap.
// Gap of 250 gives visual breathing room (≈2× planet radius from surface).
export const SCROLLING_MOON_ORBIT = PROJECTS_RADIUS + SCROLLING_MOON_RADIUS + 250;  // 126+30+250 = 406
export const EXP_MOON_ORBIT_BASE = EXPERIENCE_RADIUS + EXP_MOON_RADIUS + 250;       // 105+30+250 = 385
export const EXP_MOON_ORBIT_STEP = 120;                                              // spacing between moons
export const SKILL_MOON_ORBIT_BASE = SKILLS_RADIUS + SKILL_MOON_RADIUS + 250;       // 140+36+250 = 426
export const SKILL_MOON_ORBIT_STEP = 120;                                            // spacing between moons

// Label offset above planet surface  (orig: size + 10)
export const LABEL_Y_PADDING = 10 * SCALE.planet;

// Orbit ring tube radii — thicker so they're visible at 12,000+ units
export const MAIN_ORBIT_TUBE_RADIUS = 1.2;
export const MOON_ORBIT_TUBE_RADIUS = 0.8;

// Starfield / skyfield background spheres — must surround entire system (14,000+)
export const STARFIELD_RADIUS = 30_000;
export const SKYFIELD_RADIUS = 29_000;

// ─── LIGHTING ─────────────────────────────────────────────────────────────────

// Sun point light distance — must reach farthest planet (~14,000)
export const SUN_LIGHT_DISTANCE = 30_000;

// Fill light position — proportional to new system size
export const FILL_LIGHT_POS = {
  x: 6_000,
  y: 6_000,
  z: -12_000,
};

// ─── SHIPS ────────────────────────────────────────────────────────────────────

// Millennium Falcon  (orig scale: 0.5)
export const FALCON_SCALE = 0.5 * SCALE.ship;

// Star Destroyer  (orig scale: 0.06)
export const SD_SCALE = 0.06 * SCALE.ship;

// Initial positions — Falcon near the intro camera's final view
export const FALCON_INITIAL_POS = {
  x: 14_940,   // slightly ahead of camera (camera looks in -x direction)
  y: 242,
  z: -1_046,
};
// SD starts near Experience planet — offset so it's visible but not overlapping
export const SD_INITIAL_POS = {
  x: 12_300,
  y: 80,
  z: 400,
};

// ─── CAMERA & CONTROLS ───────────────────────────────────────────────────────

// Camera creation — far plane must reach farthest planet + margin
export const CAMERA_FOV = 45;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 50_000;

// Initial camera position — slightly behind the final spot for a gentle zoom-in.
// The intro animates from here to the final position near the Experience planet.
export const CAMERA_INITIAL_POS = {
  x: 15_350,
  y: 340,
  z: -950,
};

// Camera controls distance limits
export const CONTROLS_MIN_DIST = 0.01;
export const CONTROLS_MAX_DIST = 30_000;

// Near-plane values used in various view modes (originals shown)
export const NEAR_DEFAULT = 0.1; // restored when leaving ship
export const NEAR_COCKPIT = 0.01; // cockpit view
export const NEAR_CABIN = 0.05; // cabin view
export const NEAR_EXPLORE = 0.005; // ship explore mode
export const NEAR_OVERVIEW = 1.0; // ship explore mode (overview)

// Zoom exit threshold
export const ZOOM_EXIT_THRESHOLD = 24;

// Bokeh focus
export const BOKEH_FOCUS = 50;

// ─── SHIP CAMERA — FOLLOW & INTERIOR ─────────────────────────────────────────

// Exterior follow camera  (orig: 60 behind, 25 above)
// Falcon is now ~0.8 units long. Follow at 8 = ~10× ship length (good framing).
export const FOLLOW_DISTANCE = 8;
export const FOLLOW_HEIGHT = 3;

// Cockpit local position — model space, multiplied by ship.scale at runtime
// (orig: -6.05, 3.16, 5.36)
export const COCKPIT_LOCAL_POS = { x: -6.05, y: 3.16, z: 5.36 } as const;
export const COCKPIT_TARGET_LOCAL = { x: -6.05, y: 3.16, z: 11.36 } as const;

// Cabin local position — model space  (orig: 0, -0.64, -4.49)
export const CABIN_LOCAL_POS = { x: 0, y: -0.64, z: -4.49 } as const;
export const CABIN_TARGET_LOCAL = { x: 0, y: -0.64, z: 1.51 } as const;

// Interior camera constraints — cockpit offset at ship scale 0.05
// Cockpit-to-target distance ≈ 6 * 0.05 = 0.3 units
export const INTERIOR_MIN_DIST = 0.005;
export const INTERIOR_MAX_DIST = 0.5;

// ─── STAR DESTROYER ESCORT FORMATION ─────────────────────────────────────────
// (orig: 40 starboard, 8 above, 15 behind)
// SD is now ~4.4 units long. Scale formation proportionally.
export const SD_ESCORT_STARBOARD = 8;
export const SD_ESCORT_ABOVE = 1.5;
export const SD_ESCORT_BEHIND = 3;

// ─── NAVIGATION ──────────────────────────────────────────────────────────────

// Navigation config defaults
// Max/turbo for local maneuvers; lightspeed for inter-planet (Phase D)
export const NAV_MAX_SPEED = 6.0;
export const NAV_TURBO_SPEED = 12.0;
export const NAV_ACCEL_RATE = 0.12;
export const NAV_DECEL_DISTANCE = 300;   // planet-local decel
export const NAV_ARRIVAL_DIST = 60;      // arrive when this close
export const NAV_FREEZE_DIST = 120;      // freeze orbits when this close

// Sun obstacle avoidance radius — must exceed sun + glow (240+225=465)
// but stay well BELOW the nearest orbit (Experience at 12,000).
export const SUN_OBSTACLE_RADIUS = 600;

// Height offset for staging point — planet-local
export const NAV_HEIGHT_OFFSET_MIN = 400;

// Arc clearance — planet-local
export const NAV_ARC_CLEARANCE_MIN = 240;

// Staging offset from camera
export const NAV_STAGING_OFFSET = 160;

// Camera behind ship during travel/turn
export const NAV_CAMERA_BEHIND = 8;
export const NAV_CAMERA_HEIGHT = 3;

// Settle camera offset from planet
export const NAV_SETTLE_OFFSET = 160;

// Turbo engagement distance threshold
export const NAV_TURBO_ENGAGE_DIST = 1_000;

// Waypoint clearance distance — planet-local
export const NAV_WAYPOINT_CLEAR = 80;

// Avoidance cooldown distance
export const NAV_AVOID_COOLDOWN_DIST = 5_000;

// ─── STAR DESTROYER CRUISER ──────────────────────────────────────────────────

// Local patrol — gentle carrier-like movement within a planet/moon system
export const SD_LOCAL_PATROL_RADIUS = 600;    // radius around target to patrol
export const SD_LOCAL_PATROL_HEIGHT = 150;    // Y variation during local patrol
export const SD_LOCAL_CRUISE_SPEED = 12;      // max local patrol speed (units/sec)
export const SD_LOCAL_ACCEL = 1.5;            // local acceleration
export const SD_LOCAL_DECEL = 2.0;            // local deceleration
export const SD_LOCAL_TURN_RATE = 0.08;       // radians/sec (~4.6°/sec, carrier-like)
export const SD_LOCAL_IDLE_MIN = 5;           // min seconds to idle at waypoint
export const SD_LOCAL_IDLE_MAX = 12;          // max seconds to idle
export const SD_LOCAL_PATROLS_MIN = 2;        // min local waypoints before moving on
export const SD_LOCAL_PATROLS_MAX = 5;        // max local waypoints before moving on

// Lightspeed — inter-planet/moon travel
export const SD_LIGHTSPEED = 80;              // units/frame (~4,800 u/s at 60fps)
export const SD_LIGHTSPEED_ENGAGE_DIST = 800; // distance from origin before engaging
export const SD_LIGHTSPEED_DECEL_DIST = 1_200;// start decelerating this far from target
export const SD_LIGHTSPEED_LERP = 0.06;       // acceleration smoothing (slower than Falcon)
export const SD_LIGHTSPEED_ARRIVAL = 400;     // arrived near target system

// Jump turn — faster turn rate so alignment takes ~5 seconds
// 90° (π/2) at 0.3 rad/s ≈ 5.2 seconds
export const SD_JUMP_TURN_RATE = 0.3;

// Hyperspace cone visual effect
export const SD_CONE_LENGTH = 500;            // length of projected light cone
export const SD_CONE_RADIUS = 30;             // base radius (near ship)
export const SD_CONE_FADE_IN_SECS = 3;        // fade in during turn phase
export const SD_CONE_FADE_OUT_SECS = 3;       // fade out after entering hyperspace
export const SD_CONE_MAX_OPACITY = 0.25;      // peak opacity (faint but visible)

// Waypoint arrival (local)
export const SD_WAYPOINT_ARRIVE = 80;

// Engine light — SD is ~4.4 units long. Keep glow proportional.
export const SD_ENGINE_LIGHT_BASE = 5;
export const SD_ENGINE_LIGHT_RANGE = 5;
export const SD_ENGINE_LIGHT_LIGHTSPEED = 15; // bright engines at lightspeed

// ─── INTRO SEQUENCE ──────────────────────────────────────────────────────────

// Orbit radius during intro — proportional to new system
export const INTRO_ORBIT_RADIUS = 2_600;

// Camera clearance
export const INTRO_CAM_CLEARANCE = 160;

// Detour distance thresholds — proportional to new orbit distances
export const INTRO_DETOUR_THRESHOLD = 2_200;
export const INTRO_DETOUR_MIN = 3_800;
export const INTRO_DETOUR_MAX = 6_800;

// Orbit enabled threshold
export const INTRO_ORBIT_ENABLED_DIST = 4_200;

// Distance factor divisor
export const INTRO_DIST_FACTOR_DIV = EXPERIENCE_ORBIT;  // 12,000

// ─── FOCUS & INTERACTION ─────────────────────────────────────────────────────

// Moon focus camera distance — close enough to see detail, far enough for drone panels.
// Moon radii are now 30–36. 84 = ~2.3–2.8× radius (30% closer than 120).
export const MOON_FOCUS_DISTANCE = 84;

// Planet focus distances — relative to planet radius, not orbit
// ~5× radius gives good framing with moons visible
export const EXP_FOCUS_DIST = 600;    // 105 radius × ~5.7
export const SKILLS_FOCUS_DIST = 750;  // 140 radius × ~5.4
export const PROJ_FOCUS_DIST = 700;    // 126 radius × ~5.6

// System overview position — high enough to see the 12,000–14,000 system
export const OVERVIEW_POS_Y = 8_000;
export const OVERVIEW_POS_Z = 16_000;

// Cinematic approach height
export const CINEMATIC_APPROACH_H = 400;

// Default planet focus distance
export const DEFAULT_FOCUS_DISTANCE = 700;

// Wander radii for cinematic camera — proportional to new system size
export const SUN_WANDER_RADIUS = 1_500;
export const EXP_WANDER_RADIUS = 3_000;
export const PROJ_WANDER_RADIUS = 3_500;
export const SKILLS_WANDER_RADIUS = 4_000;

// ─── HOLOGRAM DISPLAYS ───────────────────────────────────────────────────────

// HologramDroneDisplay  (orig values shown)
export const HOLO_PANEL_WIDTH = 24;    // scaled for closer camera distance
export const HOLO_SIDE_OFFSET = 20;    // push drone+panels to the side
export const HOLO_REF_DISTANCE = 84;   // matches MOON_FOCUS_DISTANCE
export const HOLO_DRONE_HEIGHT_MULT = 5;
export const HOLO_FLYIN_FWD = 15;
export const HOLO_FLYIN_HEIGHT = 8;
export const HOLO_FWD_PUSH = 3;

// CockpitHologramPanels  (orig values shown)
export const COCKPIT_PANEL_WIDTH = 1.4;
export const COCKPIT_PANEL_DEPTH = 1.5;
export const COCKPIT_PANEL_STEP = 0.3;

// ─── ENGINE EFFECTS ──────────────────────────────────────────────────────────

// Engine light distances — must match ship size (Falcon ~0.8 units long).
// Light radius ~2–4 units ≈ 3–5× ship length — visible glow, not a fireball.
export const ENGINE_LIGHT_BASE_DIST = 2;
export const ENGINE_LIGHT_RANGE = 2;

// ─── CINEMATIC CAMERA OFFSETS (ResumeSpace3D.tsx) ────────────────────────────

// Behind camera — these frame the ship, stay relative to ship scale (not system)
export const CINE_BEHIND_DIST = 300;
export const CINE_BEHIND_HEIGHT = 60;

// Front camera
export const CINE_FRONT_DIST = 160;
export const CINE_FRONT_HEIGHT = -10;

// Control point height
export const CINE_CONTROL_HEIGHT = 40;

// ─── COCKPIT STEERING ────────────────────────────────────────────────────────

// Thrust speed — scaled for the new universe (orig 40, but universe is 2× bigger)
export const COCKPIT_THRUST_SPEED = 80;

// ─── DEBUG / MISC ────────────────────────────────────────────────────────────

// Debug snap camera distance — scaled to ship size
export const DEBUG_SNAP_DIST = 8;
export const DEBUG_SNAP_HEIGHT = 3;

// Explore mode movement speed — scaled for expanded system
export const EXPLORE_SPEED_FAST = 2.5;
export const EXPLORE_SPEED_NORMAL = 0.6;

// SpaceshipNavigationSystem obstacle avoidance  (orig: 12)
export const NAV_LATERAL_BIAS = 12;

// Ship wander system bounds (ResumeSpace3D.tsx)
export const SHIP_WANDER_XZ = 12_000;  // ±12,000 on X/Z (was ±1200)
export const SHIP_WANDER_Y = 2_000;     // ±2,000 on Y (was ±400)
export const SHIP_WANDER_MIN_DIST = 2_000; // minimum wander distance (was 200)

// Cinematic duration base divisor (was hardcoded 600 = old Experience orbit)
export const CINE_DURATION_DIVISOR = EXPERIENCE_ORBIT;

// Nav turbo threshold for moon/section travel (was hardcoded 500)
export const NAV_TURBO_THRESHOLD = 1_000;

// Nav decel extra offset (was hardcoded 80)
export const NAV_DECEL_EXTRA = 200;

// Fallback planet radius for obstacles
export const NAV_FALLBACK_PLANET_R = 140;  // use largest planet as fallback

// ─── LIGHTSPEED TRAVEL ──────────────────────────────────────────────────────
// For inter-planet journeys: covers 12,000 units in ~5 seconds.
export const NAV_LIGHTSPEED = 50;               // units/frame (~3,000 u/s at 60fps)
export const NAV_LIGHTSPEED_ENGAGE_DIST = 2_000; // only engage for long distances
export const NAV_LIGHTSPEED_DECEL_DIST = 1_500;  // start slowing from this distance
export const NAV_LIGHTSPEED_LERP = 0.08;         // faster lerp for lightspeed accel
