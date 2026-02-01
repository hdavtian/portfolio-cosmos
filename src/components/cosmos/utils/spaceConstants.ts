/**
 * Constants for space scene configuration
 * Extracted from ResumeSpace3D.tsx
 */

/**
 * Orbital speeds
 */
export const ORBITAL_SPEEDS = {
  EXPERIENCE_PLANET: 0.0002,
  SKILLS_PLANET: 0.00015,
  PROJECTS_PLANET: 0.0001,
  MOON_BASE: 0.002,
  MOON_VARIANCE: 0.001,
  SKILLS_MOON_BASE: 0.0015,
  DEFAULT_ORBIT_SPEED: 0.1,
} as const;

/**
 * Distances from center (sun)
 */
export const DISTANCES = {
  EXPERIENCE_PLANET: 600,
  SKILLS_PLANET: 1000,
  PROJECTS_PLANET: 1400,
  MOON_BASE: 60,
  MOON_SPACING: 20,
  SKILLS_MOON_BASE: 70,
  SKILLS_MOON_SPACING: 15,
  PROJECTS_MOON: 40,
} as const;

/**
 * Celestial body sizes (radii)
 */
export const SIZES = {
  SUN: 60,
  EXPERIENCE_PLANET: 15,
  SKILLS_PLANET: 20,
  PROJECTS_PLANET: 18,
  MOON_DEFAULT: 5,
  MOON_SMALL: 6,
} as const;

/**
 * Camera configuration
 */
export const CAMERA = {
  FOV: 45,
  NEAR: 0.1,
  FAR: 10000,
  INITIAL_POSITION: { x: 0, y: 400, z: 600 },
  MIN_DISTANCE: 0,
  MAX_DISTANCE: 6000,
  ZOOM_EXIT_THRESHOLD: 12, // Distance change to trigger moon focus exit
} as const;

/**
 * Navigation configuration
 */
export const NAVIGATION = {
  TURBO_DISTANCE_THRESHOLD: 500, // Distance threshold to enable turbo
  ARRIVAL_DISTANCE: 30, // Distance to consider arrived at target
} as const;

/**
 * Orbit path visualization
 */
export const ORBIT_PATHS = {
  MAIN_ORBIT_TUBE_RADIUS: 0.12,
  MOON_ORBIT_TUBE_RADIUS: 0.08,
  MAIN_ORBIT_ELLIPSE_RATIO: 0.85,
  MOON_ORBIT_ELLIPSE_RATIO: 0.9,
  SEGMENTS: 256,
  RADIAL_SEGMENTS: 12,
} as const;

/**
 * Orbit colors (hex values)
 */
export const ORBIT_COLORS = {
  EXPERIENCE: 0xe8c547, // gold
  SKILLS: 0x33a8ff, // cyan
  PROJECTS: 0x9933ff, // purple
  NEUTRAL: 0x666a80,
  EXPERIENCE_MOONS: 0xff9966, // warm
  SKILLS_MOONS: 0x66ccff, // cool
  PROJECTS_MOONS: 0xcc99ff, // pastel
  DEFAULT_MOONS: 0x556070,
} as const;

/**
 * Orbit path opacity
 */
export const ORBIT_OPACITY = {
  MAIN: 0.08,
  MOON: 0.05,
} as const;

/**
 * Lighting configuration
 */
export const LIGHTING = {
  AMBIENT_COLOR: 0x212121,
  AMBIENT_INTENSITY: 0.5,
  SUN_INTENSITY_MULTIPLIER: 4,
  SUN_DEFAULT_INTENSITY: 2.5,
  SUN_DISTANCE: 1000,
  SUN_DECAY: 0.5,
  FILL_LIGHT_COLOR: 0x3366ff,
  FILL_LIGHT_INTENSITY: 2.0,
  FILL_LIGHT_DISTANCE: 100,
  FILL_LIGHT_DECAY: 1,
  FILL_LIGHT_POSITION: { x: 50, y: 50, z: -100 },
} as const;

/**
 * Bloom effect configuration
 */
export const BLOOM = {
  STRENGTH_MULTIPLIER: 0.4,
  MAX_STRENGTH: 3,
  RADIUS: 0.6,
  THRESHOLD: 0.5,
} as const;

/**
 * Starfield configuration
 */
export const STARFIELD = {
  OUTER_SPHERE_RADIUS: 8000,
  INNER_SPHERE_RADIUS: 7800,
  SPHERE_SEGMENTS: 64,
  POINT_STARS_COUNT: 15000,
  POINT_STAR_SIZE: 1.5,
  POINT_STAR_MIN_DISTANCE: 500,
  POINT_STAR_MAX_DISTANCE: 5000,
  INNER_OPACITY: 0.3,
  BRIGHTNESS_MULTIPLIER: 1.2,
} as const;

/**
 * Halo effect configuration
 */
export const HALO = {
  SIZE_VARIANCE_MIN: 0.75,
  SIZE_VARIANCE_MAX: 1.25,
  SPEED_VARIANCE_MIN: 0.75,
  SPEED_VARIANCE_MAX: 1.25,
  AURORA_SCALE: 4,
  RING_SCALE: 2.6,
  CORE_SCALE: 1.2,
} as const;

/**
 * Overlay configuration
 */
export const OVERLAY = {
  TITLE_HEIGHT_MULTIPLIER: 1.2,
  BULLET_HEIGHT_MULTIPLIER: 0.4,
  RADIAL_OFFSET_MULTIPLIER: 0.02,
  ELEVATION_MULTIPLIER: 0.02,
  DEFAULT_OPACITY: 0.9,
  TITLE_OPACITY: 0.88,
} as const;

/**
 * Spaceship configuration
 */
export const SPACESHIP = {
  DEFAULT_CAMERA_OFFSET: { x: 0, y: 20, z: -60 },
  PATH_SPEED: 0.002,
  MOON_VISIT_DURATION: 10000, // milliseconds
  MAX_SPEED: 2.0,
  CONTROL_SENSITIVITY: 0.5,
} as const;

/**
 * Material properties
 */
export const MATERIALS = {
  PLANET_METALNESS: 0.05,
  PLANET_ROUGHNESS: 1.0,
  FLASH_STRENGTH: 0.6,
  SUPER_FLASH_EVERY_MIN: 4,
  SUPER_FLASH_EVERY_MAX: 5,
} as const;
