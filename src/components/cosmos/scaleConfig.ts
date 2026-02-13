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
// In Phase 2 these are all 1.0 (no visual change).
// In Phase 3 we set them to target values.

export const SCALE = {
  /** Multiplier for the sun radius and related distances */
  sun: 1.0, // Target: ~6.7

  /** Multiplier for planet radii */
  planet: 1.0, // Target: ~7

  /** Multiplier for moon radii */
  moon: 1.0, // Target: ~6

  /** Multiplier for orbital distances (planets from sun, moons from planets) */
  orbit: 1.0, // Target: ~2

  /**
   * Multiplier for ship scales (< 1 to shrink).
   * At 1.0 the ships are at their original sizes.
   * Target: ~0.02  (Falcon goes from 0.5 → 0.01 scale, ~50× smaller)
   */
  ship: 1.0, // Target: ~0.02

  /** Multiplier for camera and view distances */
  camera: 1.0, // Target: ~2
} as const;

// ─── CELESTIAL BODIES ─────────────────────────────────────────────────────────

// Sun  (orig radius: 60)
export const SUN_RADIUS = 60 * SCALE.sun;
export const SUN_GLOW_SPRITE_SIZE = 180 * SCALE.sun;
export const SUN_LABEL_Y = 50 * SCALE.sun;

// Planets  (orig radii: 15, 20, 18)
export const EXPERIENCE_RADIUS = 15 * SCALE.planet;
export const SKILLS_RADIUS = 20 * SCALE.planet;
export const PROJECTS_RADIUS = 18 * SCALE.planet;

// Planet orbits  (orig: 600, 1000, 900)
export const EXPERIENCE_ORBIT = 600 * SCALE.orbit;
export const SKILLS_ORBIT = 1000 * SCALE.orbit;
export const PROJECTS_ORBIT = 900 * SCALE.orbit;

// Moons  (orig radii: 5, 6)
export const EXP_MOON_RADIUS = 5 * SCALE.moon;
export const SKILL_MOON_RADIUS = 6 * SCALE.moon;
export const SCROLLING_MOON_RADIUS = 5 * SCALE.moon;

// Moon orbits from parent  (orig: 40, 60 + i*20, 70 + i*15)
export const SCROLLING_MOON_ORBIT = 40 * SCALE.orbit;
export const EXP_MOON_ORBIT_BASE = 60 * SCALE.orbit;
export const EXP_MOON_ORBIT_STEP = 20 * SCALE.orbit;
export const SKILL_MOON_ORBIT_BASE = 70 * SCALE.orbit;
export const SKILL_MOON_ORBIT_STEP = 15 * SCALE.orbit;

// Label offset above planet surface  (orig: size + 10)
export const LABEL_Y_PADDING = 10 * SCALE.planet;

// Orbit ring tube radii  (orig: 0.12, 0.08)
export const MAIN_ORBIT_TUBE_RADIUS = 0.12;
export const MOON_ORBIT_TUBE_RADIUS = 0.08;

// Starfield / skyfield background spheres  (orig: 8000, 7800)
export const STARFIELD_RADIUS = 8000;
export const SKYFIELD_RADIUS = 7800;

// ─── LIGHTING ─────────────────────────────────────────────────────────────────

// Sun point light distance — must reach the farthest planet
// (orig: 2200)
export const SUN_LIGHT_DISTANCE = 2200 * SCALE.orbit;

// Fill light position  (orig: 50, 50, -100)
export const FILL_LIGHT_POS = {
  x: 50 * SCALE.orbit,
  y: 50 * SCALE.orbit,
  z: -100 * SCALE.orbit,
};

// ─── SHIPS ────────────────────────────────────────────────────────────────────

// Millennium Falcon  (orig scale: 0.5)
export const FALCON_SCALE = 0.5 * SCALE.ship;

// Star Destroyer  (orig scale: 0.06)
export const SD_SCALE = 0.06 * SCALE.ship;

// Initial positions  (orig: (50,20,50) and (400,40,-300))
export const FALCON_INITIAL_POS = {
  x: 50,
  y: 20,
  z: 50,
};
export const SD_INITIAL_POS = {
  x: 400 * SCALE.orbit,
  y: 40,
  z: -300 * SCALE.orbit,
};

// ─── CAMERA & CONTROLS ───────────────────────────────────────────────────────

// Camera creation  (orig: fov 45, near 0.1, far 10000)
export const CAMERA_FOV = 45;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 10000 * SCALE.camera;

// Initial camera position  (orig: 0, 400, 600)
export const CAMERA_INITIAL_POS = {
  x: 0,
  y: 400 * SCALE.camera,
  z: 600 * SCALE.camera,
};

// Camera controls distance limits  (orig: 0.01, 6000)
export const CONTROLS_MIN_DIST = 0.01;
export const CONTROLS_MAX_DIST = 6000 * SCALE.camera;

// Near-plane values used in various view modes (originals shown)
export const NEAR_DEFAULT = 0.1; // restored when leaving ship
export const NEAR_COCKPIT = 0.01; // cockpit view
export const NEAR_CABIN = 0.05; // cabin view
export const NEAR_EXPLORE = 0.005; // ship explore mode
export const NEAR_OVERVIEW = 1.0; // ship explore mode (overview)

// Zoom exit threshold  (orig: 12)
export const ZOOM_EXIT_THRESHOLD = 12 * SCALE.camera;

// Bokeh focus  (orig: 25)
export const BOKEH_FOCUS = 25 * SCALE.camera;

// ─── SHIP CAMERA — FOLLOW & INTERIOR ─────────────────────────────────────────

// Exterior follow camera  (orig: 60 behind, 25 above)
export const FOLLOW_DISTANCE = 60;
export const FOLLOW_HEIGHT = 25;

// Cockpit local position — model space, multiplied by ship.scale at runtime
// (orig: -6.05, 3.16, 5.36)
export const COCKPIT_LOCAL_POS = { x: -6.05, y: 3.16, z: 5.36 } as const;
export const COCKPIT_TARGET_LOCAL = { x: -6.05, y: 3.16, z: 11.36 } as const;

// Cabin local position — model space  (orig: 0, -0.64, -4.49)
export const CABIN_LOCAL_POS = { x: 0, y: -0.64, z: -4.49 } as const;
export const CABIN_TARGET_LOCAL = { x: 0, y: -0.64, z: 1.51 } as const;

// Interior camera constraints  (orig: min 0.01, max 0.02)
export const INTERIOR_MIN_DIST = 0.01;
export const INTERIOR_MAX_DIST = 0.02;

// ─── STAR DESTROYER ESCORT FORMATION ─────────────────────────────────────────
// (orig: 40 starboard, 8 above, 15 behind)

export const SD_ESCORT_STARBOARD = 40;
export const SD_ESCORT_ABOVE = 8;
export const SD_ESCORT_BEHIND = 15;

// ─── NAVIGATION ──────────────────────────────────────────────────────────────

// Navigation config defaults  (orig values shown)
export const NAV_MAX_SPEED = 3.0;
export const NAV_TURBO_SPEED = 6.0;
export const NAV_ACCEL_RATE = 0.12;
export const NAV_DECEL_DISTANCE = 150 * SCALE.orbit;
export const NAV_ARRIVAL_DIST = 30 * SCALE.orbit;
export const NAV_FREEZE_DIST = 60 * SCALE.orbit;

// Sun obstacle avoidance radius  (orig: 350 — larger than sun to clear glow)
export const SUN_OBSTACLE_RADIUS = 350 * SCALE.sun;

// Height offset for staging point  (orig: max(targetRadius * 6, 200))
export const NAV_HEIGHT_OFFSET_MIN = 200 * SCALE.orbit;

// Arc clearance  (orig: max(targetRadius * 5, 120))
export const NAV_ARC_CLEARANCE_MIN = 120 * SCALE.orbit;

// Staging offset from camera  (orig: 80)
export const NAV_STAGING_OFFSET = 80 * SCALE.camera;

// Camera behind ship during travel/turn  (orig: 60, height 25)
export const NAV_CAMERA_BEHIND = 60;
export const NAV_CAMERA_HEIGHT = 25;

// Settle camera offset from planet  (orig: 80)
export const NAV_SETTLE_OFFSET = 80 * SCALE.camera;

// Turbo engagement distance threshold  (orig: 200)
export const NAV_TURBO_ENGAGE_DIST = 200 * SCALE.orbit;

// Waypoint clearance distance  (orig: 40)
export const NAV_WAYPOINT_CLEAR = 40 * SCALE.orbit;

// Avoidance cooldown distance  (orig: 500)
export const NAV_AVOID_COOLDOWN_DIST = 500 * SCALE.orbit;

// ─── STAR DESTROYER CRUISER PATROL ───────────────────────────────────────────

// Waypoint generation  (orig: 200–900 radius, 80 max height)
export const SD_WAYPOINT_MIN_R = 200 * SCALE.orbit;
export const SD_WAYPOINT_MAX_R = 900 * SCALE.orbit;
export const SD_WAYPOINT_MAX_H = 80 * SCALE.orbit;

// Waypoint arrival  (orig: 40)
export const SD_WAYPOINT_ARRIVE = 40 * SCALE.orbit;

// Minimum travel distance  (orig: 150)
export const SD_MIN_TRAVEL_DIST = 150 * SCALE.orbit;

// Engine light  (orig: 60 + speedFraction * 100)
export const SD_ENGINE_LIGHT_BASE = 60;
export const SD_ENGINE_LIGHT_RANGE = 100;

// ─── INTRO SEQUENCE ──────────────────────────────────────────────────────────

// Orbit radius during intro  (orig: 260)
export const INTRO_ORBIT_RADIUS = 260 * SCALE.orbit;

// Camera clearance  (orig: 80)
export const INTRO_CAM_CLEARANCE = 80 * SCALE.camera;

// Detour distance thresholds  (orig: 220, 380, 680)
export const INTRO_DETOUR_THRESHOLD = 220 * SCALE.orbit;
export const INTRO_DETOUR_MIN = 380 * SCALE.orbit;
export const INTRO_DETOUR_MAX = 680 * SCALE.orbit;

// Orbit enabled threshold  (orig: 420)
export const INTRO_ORBIT_ENABLED_DIST = 420 * SCALE.orbit;

// Distance factor divisor  (orig: 600)
export const INTRO_DIST_FACTOR_DIV = 600 * SCALE.orbit;

// ─── FOCUS & INTERACTION ─────────────────────────────────────────────────────

// Moon focus camera distance  (orig: 25)
export const MOON_FOCUS_DISTANCE = 25 * SCALE.moon;

// Planet focus distances  (orig: 300, 350, 400)
export const EXP_FOCUS_DIST = 300 * SCALE.camera;
export const SKILLS_FOCUS_DIST = 350 * SCALE.camera;
export const PROJ_FOCUS_DIST = 400 * SCALE.camera;

// System overview position  (orig: y=800, z=1200)
export const OVERVIEW_POS_Y = 800 * SCALE.camera;
export const OVERVIEW_POS_Z = 1200 * SCALE.camera;

// Cinematic approach height  (orig: 200)
export const CINEMATIC_APPROACH_H = 200 * SCALE.camera;

// Default planet focus distance  (orig: 300)
export const DEFAULT_FOCUS_DISTANCE = 300 * SCALE.camera;

// Wander radii for cinematic camera  (orig: 260, 320, 340, 360)
export const SUN_WANDER_RADIUS = 260 * SCALE.camera;
export const EXP_WANDER_RADIUS = 320 * SCALE.camera;
export const PROJ_WANDER_RADIUS = 340 * SCALE.camera;
export const SKILLS_WANDER_RADIUS = 360 * SCALE.camera;

// ─── HOLOGRAM DISPLAYS ───────────────────────────────────────────────────────

// HologramDroneDisplay  (orig values shown)
export const HOLO_PANEL_WIDTH = 14;
export const HOLO_SIDE_OFFSET = 10;
export const HOLO_REF_DISTANCE = 60;
export const HOLO_DRONE_HEIGHT_MULT = 5;
export const HOLO_FLYIN_FWD = 15;
export const HOLO_FLYIN_HEIGHT = 8;
export const HOLO_FWD_PUSH = 3;

// CockpitHologramPanels  (orig values shown)
export const COCKPIT_PANEL_WIDTH = 1.4;
export const COCKPIT_PANEL_DEPTH = 1.5;
export const COCKPIT_PANEL_STEP = 0.3;

// ─── ENGINE EFFECTS ──────────────────────────────────────────────────────────

// Engine light distances  (orig: 220 base, 140 range)
export const ENGINE_LIGHT_BASE_DIST = 220;
export const ENGINE_LIGHT_RANGE = 140;

// ─── CINEMATIC CAMERA OFFSETS (ResumeSpace3D.tsx) ────────────────────────────

// Behind camera  (orig: -150 behind, 30 above)
export const CINE_BEHIND_DIST = 150 * SCALE.camera;
export const CINE_BEHIND_HEIGHT = 30;

// Front camera  (orig: 80 forward, -5 below)
export const CINE_FRONT_DIST = 80 * SCALE.camera;
export const CINE_FRONT_HEIGHT = -5;

// Control point height  (orig: 20)
export const CINE_CONTROL_HEIGHT = 20;

// ─── COCKPIT STEERING ────────────────────────────────────────────────────────

// Thrust speed  (orig: 40 units/sec)
export const COCKPIT_THRUST_SPEED = 40;

// ─── DEBUG / MISC ────────────────────────────────────────────────────────────

// Debug snap camera distance  (orig: 60 behind, 25 height)
export const DEBUG_SNAP_DIST = 60;
export const DEBUG_SNAP_HEIGHT = 25;

// Explore mode movement speed  (orig: 0.25 shift, 0.06 normal)
export const EXPLORE_SPEED_FAST = 0.25;
export const EXPLORE_SPEED_NORMAL = 0.06;

// SpaceshipNavigationSystem obstacle avoidance  (orig: 12)
export const NAV_LATERAL_BIAS = 12;

// Fallback planet radius for obstacles  (orig: 20)
export const NAV_FALLBACK_PLANET_R = 20 * SCALE.planet;
