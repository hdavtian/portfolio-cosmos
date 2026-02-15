# Universe Expansion & Lightspeed Travel Plan

**Created:** 2026-02-13
**Status:** In Progress
**Branch:** `new-physics-engines`

---

## 1. Goal

Push planets far from the sun, spread moon orbits, and add a lightspeed travel
mode so inter-planet journeys feel epic but take only ~5 seconds.

---

## 2. Current State (after Phase 3 tuning)

| Entity | Value | Notes |
|---|---|---|
| Sun radius | 240 | (60 × SCALE.sun=4) |
| Sun glow sprite | 450 | Decoupled from sun scale |
| Experience radius | 105 | (15 × planet=7) |
| Skills radius | 140 | (20 × planet=7) |
| Projects radius | 126 | (18 × planet=7) |
| Experience orbit | 1,200 | (600 × orbit=2) |
| Skills orbit | 2,000 | (1000 × orbit=2) |
| Projects orbit | 1,800 | (900 × orbit=2) |
| Exp moon orbit base | 195 | parent(105)+moon(30)+gap(60) |
| Skill moon orbit base | 236 | parent(140)+moon(36)+gap(60) |
| Scrolling moon orbit | 216 | parent(126)+moon(30)+gap(60) |
| Moon orbit step | 50 | Between successive moons |
| Falcon scale | 0.05 | (~0.8 units long) |
| SD scale | 0.006 | (~4.4 units long) |
| Camera far | 20,000 | |
| Starfield radius | 8,000 | |
| Sun light distance | 4,400 | |
| Nav max speed | 6.0 | units/frame |
| Nav turbo speed | 12.0 | units/frame |
| Travel speed (section) | 4.0 | actual target in useNavigationSystem |
| Controls max dist | 12,000 | |

---

## 3. Proposed Changes

### 3a. Planet Orbits — Push Experience 10× Further

| Entity | Current | Proposed | Change |
|---|---|---|---|
| Experience orbit | 1,200 | **12,000** | 10× current |
| Skills orbit | 2,000 | **13,600** | Exp + 2×(current gap 800) |
| Projects orbit | 1,800 | **13,200** | Exp + 2×(current gap 600) |

**Rationale:** User wants the first planet 10× further from the sun.
Second/third planets keep their inter-planet spacing but doubled.

- Current gap Exp→Skills: 2,000 − 1,200 = 800 → doubled = 1,600
- Current gap Exp→Projects: 1,800 − 1,200 = 600 → doubled = 1,200
- Skills: 12,000 + 1,600 = 13,600
- Projects: 12,000 + 1,200 = 13,200

### 3b. Moon Orbits — Spread Them Out

Moons look bunched because the gap from planet surface is only 60 units
(less than half the planet radius). Increase gap to 250.

| Entity | Current | Proposed |
|---|---|---|
| Exp moon orbit base | 195 | 105+30+**250** = **385** |
| Skill moon orbit base | 236 | 140+36+**250** = **426** |
| Scrolling moon orbit | 216 | 126+30+**250** = **406** |
| Moon orbit step | 50 | **120** |

### 3c. Supporting Infrastructure

| Config | Current | Proposed | Why |
|---|---|---|---|
| CAMERA_FAR | 20,000 | **50,000** | Must see farthest planet at ~14,000 + margin |
| STARFIELD_RADIUS | 8,000 | **30,000** | Must surround entire system |
| SKYFIELD_RADIUS | 7,800 | **29,000** | Slightly smaller than starfield |
| SUN_LIGHT_DISTANCE | 4,400 | **30,000** | Must illuminate planets at 12,000–14,000 |
| CONTROLS_MAX_DIST | 12,000 | **30,000** | Allow camera to pull back far enough |
| FILL_LIGHT_POS | (100, 100, -200) | **(6000, 6000, -12000)** | Proportional to new system size |
| SUN_OBSTACLE_RADIUS | 550 | **600** | Still well below Experience orbit (12,000) |
| CAMERA_INITIAL_POS | (0, 3000, 5000) | **(0, 5000, 15000)** | Much further back to frame system |
| FALCON_INITIAL_POS | (1080, 20, 100) | **(11000, 20, 100)** | Near Experience orbit |
| SD_INITIAL_POS | (800, 40, -600) | **(8000, 40, -6000)** | Somewhere in the inner system |

### 3d. Navigation Speeds — Lightspeed Mode

Current section travel uses hardcoded speed targets in `useNavigationSystem.ts`:
- Turbo: 4.0 units/frame (~240 units/sec at 60fps)
- Normal: 2.0 units/frame (~120 units/sec at 60fps)

At these speeds, 12,000 units would take **50 seconds** at turbo. Too slow.

**Lightspeed mode:**
- Speed: ~50 units/frame (~3,000 units/sec at 60fps)
- 12,000 units / 3,000 = **4 seconds cruise** + accel/decel ≈ **5–6 seconds total**
- Activate when distance > 2,000 units (inter-planet travel)
- Below 2,000 units (planet-to-moon, nearby): use normal/turbo speeds

**Implementation:**
1. Add `NAV_LIGHTSPEED` constant in scaleConfig (~50 units/frame)
2. Add `NAV_LIGHTSPEED_ENGAGE_DIST` threshold (~2,000 units)
3. In `useNavigationSystem.ts` travel phase, add lightspeed tier:
   - `if (distance > NAV_LIGHTSPEED_ENGAGE_DIST) targetSpeed = NAV_LIGHTSPEED`
4. Faster acceleration lerp during lightspeed (0.08 instead of 0.05)
5. Longer deceleration distance to avoid overshoot

**Visual effects (stretch goal):**
- Engine glow brightens and shifts to white-blue
- Optional: star streak lines or FOV widening during lightspeed
- These can be done later without breaking anything

### 3e. Intro Sequence

The intro final positions were already scaled by `SCALE.orbit` in a previous fix.
With the new orbit distances set directly (not via SCALE.orbit), the intro
final positions need to be updated to point near the Experience orbit (12,000).

- `INTRO_CAMERA_FINAL_POS` → near (12,000, y, z)
- `INTRO_CAMERA_FINAL_TARGET` → near (12,000, 0, 0)
- `INTRO_SHIP_FINAL_POS` → near (12,000, y, z)
- `INTRO_ORBIT_RADIUS` → scaled for new distances

### 3f. Other Constants That Reference SCALE.orbit

Many constants multiply by `SCALE.orbit` (currently 2). With orbits now set
directly, we must decide per-constant whether it should scale with the new
orbit distances or stay as-is.

**Should scale with new system size (set individually):**
- `NAV_DECEL_DISTANCE` — increase for lightspeed decel
- `NAV_TURBO_ENGAGE_DIST` — increase to match new distances
- `NAV_AVOID_COOLDOWN_DIST` — increase
- `SD_WAYPOINT_MIN_R`, `SD_WAYPOINT_MAX_R` — patrol range for SD

**Should NOT change (planet-local distances):**
- `NAV_ARRIVAL_DIST` — how close to get to arrive (planet-scale)
- `NAV_FREEZE_DIST` — orbit freeze distance (planet-scale)
- `NAV_WAYPOINT_CLEAR` — avoidance waypoint clearance (planet-scale)
- `NAV_HEIGHT_OFFSET_MIN` — staging height (planet-scale)
- `NAV_ARC_CLEARANCE_MIN` — obstacle arc (planet-scale)

**Planet focus distances (should grow modestly):**
- `EXP_FOCUS_DIST`, `SKILLS_FOCUS_DIST`, `PROJ_FOCUS_DIST` — these control
  how far the camera sits when viewing a planet. They should be relative to
  planet radius, not orbit distance. Keep as-is or tune slightly.

---

## 4. Implementation Phases

### Phase A: Orbit & Moon Expansion (scaleConfig only) — [x]
- Set `EXPERIENCE_ORBIT = 12000`, `SKILLS_ORBIT = 13600`, `PROJECTS_ORBIT = 13200`
- Set orbit values directly (no longer multiply by SCALE.orbit)
- Increase moon orbit gaps: 250 instead of 60, step 120 instead of 50
- Update `FALCON_INITIAL_POS` near Experience (~11000)
- Update `SD_INITIAL_POS` to inner system (~8000)
- Increase orbit tube radii: 0.12 → 1.2, 0.08 → 0.8

### Phase B: Infrastructure (scaleConfig + factories) — [x]
- `CAMERA_FAR` → 50,000
- `STARFIELD_RADIUS` → 30,000
- `SKYFIELD_RADIUS` → 29,000
- `SUN_LIGHT_DISTANCE` → 30,000
- `CONTROLS_MAX_DIST` → 30,000
- `CAMERA_INITIAL_POS` → (0, 5000, 15000)
- `FILL_LIGHT_POS` → scaled (6000, 6000, -12000)
- `SUN_OBSTACLE_RADIUS` → 600
- `OVERVIEW_POS_Y` → 8000, `OVERVIEW_POS_Z` → 16000
- Wander radii → proportional to new system (3000–5000 range)
- Planet focus distances → moderate increase
- Replace hardcoded `maxDistance` in useRenderLoop.ts with `CONTROLS_MAX_DIST`

### Phase C: Hardcoded Value Cleanup — [x]
- Wire ship wander bounds in ResumeSpace3D.tsx (~lines 813-816) to scaleConfig
- Wire turbo thresholds (500) in useNavigationSystem.ts to scaleConfig
- Wire decel offset (80) in useNavigationSystem.ts to scaleConfig
- Wire cinematic duration divisors (600) to `EXPERIENCE_ORBIT` or constant
- Update `SD_WAYPOINT_MIN_R` → 2000, `SD_WAYPOINT_MAX_R` → 12000

### Phase D: Lightspeed Travel Mode — [x]
- Add constants to scaleConfig:
  - `NAV_LIGHTSPEED = 50` (units/frame, ~3,000 u/s)
  - `NAV_LIGHTSPEED_ENGAGE_DIST = 2000`
  - `NAV_LIGHTSPEED_DECEL_DIST = 1500`
  - `NAV_LIGHTSPEED_LERP = 0.08`
- Modify travel phase in `useNavigationSystem.ts`:
  - Add lightspeed speed tier when distance > engage threshold
  - Use faster lerp alpha (0.08) during lightspeed
  - Use longer decel distance (1500) for smooth stop
- Update `NAV_TURBO_ENGAGE_DIST` → 1000
- Update `NAV_AVOID_COOLDOWN_DIST` → 5000
- Engine glow brighten during lightspeed (visual cue)

### Phase E: Intro Sequence — [x]
- Set `INTRO_CAMERA_FINAL_POS/TARGET` as absolute values near Experience (12,000)
- Set `INTRO_SHIP_FINAL_POS` near Experience orbit
- Update `INTRO_ORBIT_RADIUS` → ~2600 (proportional)
- Update detour thresholds for new distances
- Verify intro animation lands correctly

### Phase F: Build & Test — [x] (build passes, ready for visual test)
- `npx tsc -b` passes
- Visual test: sun is small at load, planets visible in distance
- Ship travels between planets in ~5 seconds
- Moon visits work, moons are well-spaced
- Intro sequence ends near Experience planet
- Orbit rings visible at new distances

---

## 4g. Overlooked Items (found during review)

These were discovered during a deep code audit and MUST be addressed:

### Orbit Ring Visibility
- `MAIN_ORBIT_TUBE_RADIUS = 0.12` — at 12,000 units distance, a 0.12 tube is
  invisible. Increase to **1.2** (10×). Moon tube: 0.08 → **0.8**.

### Ship Wander Bounds (ResumeSpace3D.tsx ~lines 813-816)
- Hardcoded `±1200` on X/Z, `±400` on Y for ship wander system.
- With planets at 12,000+, wander is stuck near the sun.
- Fix: Wire to scaleConfig or set proportional to system size.

### Intro Final Positions (introSequence.ts)
- Currently multiply by `SCALE.orbit` (=2), giving ~1,200 for camera target.
- Need to point at ~12,000 (new Experience orbit).
- Fix: Set directly as absolute values based on new Experience orbit.

### Hardcoded Navigation Thresholds (useNavigationSystem.ts)
- `distanceTo(...) > 500` — turbo threshold for moon/section nav (2 places)
- `arrivalDistance + 80` — decel offset
- These should become scaleConfig constants.

### Hardcoded Camera maxDistance (useRenderLoop.ts)
- Multiple `maxDistance = 1000` or `2000` values.
- Should use `CONTROLS_MAX_DIST` from scaleConfig.

### Cinematic Duration Divisors (ResumeSpace3D.tsx)
- `6000 * (distance / 600)` and `4000 * (distance / 600)` — hardcoded 600.
- The 600 was the old Experience orbit. Should become `EXPERIENCE_ORBIT`.

### Overview/Wander Camera Positions
- `OVERVIEW_POS_Y = 1600`, `OVERVIEW_POS_Z = 2400` — too small for 12,000+ system.
- Wander radii (520-720) also too small.
- Fix: Scale proportionally in Phase C.

### Star Destroyer Patrol Specific Values
- `SD_WAYPOINT_MIN_R = 400`, `SD_WAYPOINT_MAX_R = 1800` — too small.
- Should cover inner system: **2,000–12,000**.

---

## 5. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Sun light too dim at 12,000+ | Medium | Increase light distance to 30,000, may need to reduce decay |
| Camera can't find planets | Low | Update camera initial pos and intro to point near Experience |
| Lightspeed overshoot | Medium | Careful decel distance tuning, test iteratively |
| Bloom makes distant objects invisible | Low | Bloom threshold is 0.5, only sun should trigger it |
| Star Destroyer patrol broken | Low | Update SD_WAYPOINT ranges to new system size |
| Intro animation broken | Medium | Recompute absolute positions for new orbit distances |
| Orbit ring lines too thin at distance | Low | May need to increase MAIN_ORBIT_TUBE_RADIUS |

---

## 6. Constants Quick Reference (Proposed Final Values)

```
EXPERIENCE_ORBIT = 12,000
SKILLS_ORBIT = 13,600
PROJECTS_ORBIT = 13,200

SCROLLING_MOON_ORBIT = 406
EXP_MOON_ORBIT_BASE = 385
EXP_MOON_ORBIT_STEP = 120
SKILL_MOON_ORBIT_BASE = 426
SKILL_MOON_ORBIT_STEP = 120

CAMERA_FAR = 50,000
STARFIELD_RADIUS = 30,000
SKYFIELD_RADIUS = 29,000
SUN_LIGHT_DISTANCE = 30,000
CONTROLS_MAX_DIST = 30,000
CAMERA_INITIAL_POS = (0, 5000, 15000)

NAV_LIGHTSPEED = 50 (units/frame, ~3,000 u/s at 60fps)
NAV_LIGHTSPEED_ENGAGE_DIST = 2,000
```
