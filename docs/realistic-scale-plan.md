# Realistic Scale Plan — Planets, Moons, Sun & Ships

> **Branch:** `scale-realism` (forked from `main` after merging `new-physics-engines`)  
> **Date:** 2026-02-13  
> **Status:** PLANNING — Do not implement until plan is reviewed and approved.  
> **Revision:** 2 — Updated after deep code audit (300+ hardcoded values catalogued).

---

## 1. Problem Statement

Ships are absurdly large relative to celestial bodies. The Star Destroyer is nearly **3× the
size of a planet**, and the Millennium Falcon is about half a planet's radius. This destroys
any sense of scale or realism. The goal is to make the universe feel vast and immersive:
celestial bodies should dominate the scene, and ships should be tiny specks visible only
when the camera is close.

---

## 2. Current Measurements

| Object              | Type     | Size (radius / world-units) | Orbit Distance | Notes                    |
|---------------------|----------|-----------------------------|----------------|--------------------------|
| **Sun**             | Star     | r = 60                      | 0 (center)     | Glow sprite: 180×180     |
| **Experience**      | Planet   | r = 15                      | 600            | Mars texture             |
| **Skills**          | Planet   | r = 20                      | 1000           | Earth texture            |
| **Projects**        | Planet   | r = 18                      | 900            | Jupiter texture          |
| **Experience Moons**| Moon     | r = 5                       | 60 + i×20      | Job entries              |
| **Skills Moons**    | Moon     | r = 6                       | 70 + i×15      | Skill categories         |
| **Scrolling Resume**| Moon     | r = 5                       | 40 from parent | Neptune texture          |
| **Millennium Falcon** | Ship  | scale 0.5 ≈ **7–8 units long** | —           | GLTF model               |
| **Star Destroyer**  | Ship     | scale 0.06 ≈ **44 units long** | —           | GLTF model, 6× Falcon   |

### Current Ratios (the problem)

| Comparison                     | Current Ratio | Real-World Ratio   | How Wrong?       |
|--------------------------------|---------------|--------------------|------------------|
| Star Destroyer : Planet        | 44 : 15 ≈ 3× | 1.6 km : 6,371 km ≈ 0.00025× | **~12,000× too big** |
| Falcon : Planet                | 8 : 15 ≈ 0.5×| 0.034 km : 6,371 km ≈ 0.000005× | **~100,000× too big** |
| Sun : Planet                   | 60 : 17 ≈ 3.5× | 109× (Sun:Earth)  | ~30× too small   |
| Planet : Moon                  | 17 : 5.5 ≈ 3× | 3.7× (Earth:Moon)  | Actually close!  |
| Orbit : Planet radius          | 600 : 15 = 40× | ~23,500× (Earth orbit:Earth radius) | 600× too small |

### Camera / Renderer Settings

| Setting                 | Current Value   |
|-------------------------|-----------------|
| Camera FOV              | 45°             |
| Camera near plane       | 0.1 (dynamic: 0.005–1.0) |
| Camera far plane        | 10,000          |
| Controls min distance   | 0.01            |
| Controls max distance   | 6,000           |
| Logarithmic depth buffer| **NOT enabled** |
| Fog                     | None            |
| LOD system              | Not implemented |

---

## 3. Assessment: Is This Achievable?

**Yes, with caveats.** Here is an honest breakdown:

### 3a. What Three.js Can Handle

Three.js can absolutely render scenes with large scale differences. Games and space
simulations do this routinely. However, the standard depth buffer struggles when the
ratio of `camera.far / camera.near` exceeds ~100,000. Our current ratio is already
10,000/0.1 = 100,000× which is at the edge.

**Key enabler: `logarithmicDepthBuffer: true`** on the WebGLRenderer. This changes
depth precision from linear to logarithmic, allowing near/far ratios of 1,000,000×
or more with minimal z-fighting. This is a one-line change but some shader materials
(custom ShaderMaterials) may need adjustment.

### 3b. What We CAN'T Do (True Astronomical Scale)

True astronomical scale (Sun radius = 696,340 km, Earth orbit = 150,000,000 km) would
place objects at positions >10⁸ in world-units. **Three.js uses 32-bit floats for vertex
positions**, which gives ~7 decimal digits of precision. At position 100,000,000 the
smallest representable step is ~8 units — a ship would jitter wildly. This would require
a "floating origin" system (re-centering the world around the camera each frame), which
is a massive architectural change we should NOT attempt now.

### 3c. What We CAN Do (Stylized Realistic Scale)

We can achieve a **stylized realism** where:
- Ships are properly tiny (invisible from far away, visible up close)
- Planets are large and imposing
- The sun dominates the inner system
- Moons fill the screen when in orbit around them
- The universe feels vast

This does NOT require true astronomical ratios. We compress distances (as every space
game does — Elite Dangerous, Kerbal Space Program, No Man's Sky all do this).

### 3d. Do Orbits Need to Change?

**It depends on how much we enlarge planets:**

| Planet Scale Factor | New Planet Radius | Orbit at 600 | Gap (orbit - radius) | Verdict |
|---------------------|-------------------|--------------|----------------------|---------|
| 1× (current)        | 15                | 600          | 585                  | Fine    |
| 5×                   | 75                | 600          | 525                  | Fine    |
| 10×                  | 150               | 600          | 450                  | Fine    |
| 20×                  | 300               | 600          | 300                  | Tight   |
| 30×                  | 450               | 600          | 150                  | Too tight|
| 40×                  | 600               | 600          | **0 — overlaps!**    | Broken  |

**Recommendation:** If we scale planets by **5–10×**, orbits can stay the same.
If we go beyond **15×**, orbits must grow proportionally. The sweet spot is likely
**~10× for planets** with a modest **1.5–2× orbit expansion** for breathing room.

For the sun, we could go up to **20–30×** since nothing orbits close to it, but we'd
need to ensure the inner planet (Experience at distance 600) doesn't clip the sun
(sun radius 60 × 30 = 1800 > 600 — that would overlap!). So sun scaling is capped
at about **8–10×** with current orbits, or orbits must expand too.

---

## 4. Recommended Approach — "Stylized Realism"

### Target Scale

| Object              | Current Size | New Size      | Scale Factor | Rationale                                    |
|---------------------|-------------|---------------|--------------|----------------------------------------------|
| **Sun**             | r = 60      | r = 400       | ~6.7×        | Dominates inner system but fits in orbits     |
| **Planets**         | r = 15–20   | r = 100–150   | ~7×          | Large, imposing celestial bodies              |
| **Moons**           | r = 5–6     | r = 25–40     | ~5–7×        | Fill screen when orbiting close               |
| **Falcon**          | ~8 units    | ~0.02 units   | 0.0025×      | True speck — 34m in "1 unit ≈ 1km" terms     |
| **Star Destroyer**  | ~44 units   | ~0.8 units    | 0.018×       | 1.6km — visible as a dot from medium distance |

### Target Orbit Distances

| Object      | Current Orbit | New Orbit | Scale Factor | Rationale                        |
|-------------|---------------|-----------|--------------|----------------------------------|
| Experience  | 600           | 1,200     | 2×           | Room for larger sun + planets    |
| Projects    | 900           | 1,800     | 2×           | Consistent scaling               |
| Skills      | 1,000         | 2,000     | 2×           | Consistent scaling               |
| Moon orbits | 40–120        | 80–240    | 2×           | Proportional to parent growth    |

### Target Camera Settings

| Setting                 | Current       | New                  | Why                                    |
|-------------------------|---------------|----------------------|----------------------------------------|
| Camera far plane        | 10,000        | 50,000               | See entire expanded system             |
| Camera near plane       | 0.1           | 0.001                | See ship details up close              |
| Logarithmic depth buffer| Off           | **On**               | Essential for large near/far ratio     |
| Controls max distance   | 6,000         | 30,000               | Zoom out to see full system            |
| Controls min distance   | 0.01          | 0.001                | Get very close to ships                |

---

## 5. Technical Requirements

### 5a. CRITICAL — Sun Shader Must Be Fixed for Log Depth Buffer

The deep audit found **one custom ShaderMaterial** in the codebase: the sun shader in
`ResumeSpace3D.factories.ts` (lines 294–321). It uses raw GLSL and does **NOT** include
the log depth buffer chunks. If we enable `logarithmicDepthBuffer: true` without fixing
this shader, **the sun will render at the wrong depth and clip through/behind planets**.

**Current vertex shader:**
```glsl
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

**Fixed vertex shader (add log depth buffer support):**
```glsl
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
```

**Current fragment shader:**
```glsl
uniform sampler2D map;
uniform vec3 tintColor;
uniform float tintStrength;
varying vec2 vUv;
void main() {
  vec4 tex = texture2D(map, vUv);
  float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
  vec3 tinted = luma * tintColor;
  vec3 finalColor = mix(tex.rgb, tinted, tintStrength);
  gl_FragColor = vec4(finalColor, tex.a);
}
```

**Fixed fragment shader:**
```glsl
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform vec3 tintColor;
uniform float tintStrength;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec4 tex = texture2D(map, vUv);
  float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
  vec3 tinted = luma * tintColor;
  vec3 finalColor = mix(tex.rgb, tinted, tintStrength);
  gl_FragColor = vec4(finalColor, tex.a);
}
```

Note: Three.js automatically injects `#define USE_LOGDEPTHBUF` when the renderer has
`logarithmicDepthBuffer: true`, so we only need the `#include` directives. No other
custom shaders exist in the codebase — all other materials use built-in Three.js
materials that handle log depth buffer automatically.

### 5b. Must-Have Changes

1. **Enable logarithmic depth buffer**
   - File: `useThreeScene.ts`
   - Change: `new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true })`
   - MUST fix sun shader first (Section 5a above)
   - Impact: Low risk once shader is fixed

2. **Centralized scale constants (`scaleConfig.ts`)**
   - Deep audit found **300+ hardcoded numeric values** across 15+ files
   - This is the #1 reason the previous attempt failed — changing sizes without
     updating all dependent values
   - The config file must cover ALL categories (see Section 8 for expanded blueprint)
   - Every hardcoded size/distance references this config

3. **Ship scale reduction**
   - Falcon: scale from 0.5 → ~0.001 (500× smaller)
   - Star Destroyer: scale from 0.06 → ~0.001 (60× smaller)
   - **Dependent values that MUST update with ships (audit found these):**
     - Cockpit local positions: `(-6.05, 3.16, 5.36)` — duplicated in BOTH
       `useRenderLoop.ts` line 162 AND `CockpitHologramPanels.ts` line 20
     - Cabin local positions: `(0, -0.64, -4.49)` — `useRenderLoop.ts` line 164
     - Follow camera distance: `60` — 4 locations across 2 files
     - Follow camera height: `25` — 4 locations across 2 files
     - Engine light distance: `220` — 3 locations in `useRenderLoop.ts`
     - Star Destroyer escort offsets: `40 starboard, 8 above, 15 behind`
     - Cockpit steering thrust speed: `40 units/sec`
     - Debug snap distances: `60 behind, 25 height`
     - Ship explore movement speed: `0.25 / 0.06`
     - Manual flight turn rates and acceleration values
     - Interior camera constraints: `minDistance: 0.01, maxDistance: 0.02`
     - CockpitHologramPanels: panel width `1.4`, depth `1.5`, depth step `0.3`

4. **Planet/Moon/Sun enlargement**
   - Sun geometry radius: `60` in `createSunMesh()`
   - Sun glow sprite: `180×180` in `ResumeSpace3D.tsx`
   - Sun label offset: `(0, 50, 0)` in `ResumeSpace3D.tsx`
   - Planet radii: `15, 20, 18` in `createPlanet()` calls
   - Moon radii: `5, 6` in `createPlanet()` calls
   - **Label Y offset**: `size + 10` in factories — already relative, but the `+10`
     constant may need scaling
   - **Core/aurora/ring sprite multipliers**: `1.2×, 4×, 2.6×` — these are relative
     to planet size, should be fine
   - **Starfield/skyfield sphere**: radii `8000` and `7800` — may need increase if
     camera far plane extends to 50,000

5. **Orbit expansion** (modest — ~2×)
   - Planet orbits: `600, 900, 1000` in `ResumeSpace3D.tsx`
   - Moon orbits: `40, 60+i*20, 70+i*15` in `ResumeSpace3D.tsx`
   - Orbit ring tube radius: `0.12 (main), 0.08 (moon)` — may need slight increase
     for visibility at larger distances
   - Orbit ellipse ratios: `0.85, 0.9` — these are relative, should stay unchanged
   - Orbit inclinations: `8, -4, -12, 14, 26, -10` degrees — no change needed

6. **Camera parameter updates — ALL locations (audit found 20+ locations)**
   - Initial camera: `near=0.1, far=10000` in `useThreeScene.ts` line 74-75
   - Camera position: `(0, 400, 600)` in `useThreeScene.ts`
   - Controls: `minDistance=0.01, maxDistance=6000` in `useThreeScene.ts` line 112-113
   - Near plane restored to `0.1` in **7 different locations** across `ResumeSpace3D.tsx`
   - Near plane set to `0.01` in **3 locations** for cockpit view
   - Near plane set to `0.005` in **2 locations** in `useRenderLoop.ts`
   - Near plane set to `1` in 1 location for ship explore mode
   - maxDistance `6000` restored in **5 locations**
   - maxDistance `1000` in 3 locations (focused moon, explore mode, ship follow)
   - maxDistance `2000` in 1 location (settled view)
   - Zoom exit threshold: `12` in `useThreeScene.ts` line 128

7. **Navigation system — MANY scale-dependent values**
   - Sun obstacle radius: `350` (hardcoded in `useNavigationSystem.ts` line 196)
     — **CRITICAL: with sun radius growing to 400, this must be at least 500-600**
   - Planet safety multiplier: `5×`, Moon: `6×` — these are multipliers, OK
   - Arrival distance: `30` — needs scaling with orbit expansion
   - Deceleration distance: `150` — needs scaling
   - Freeze distance: `60` — needs scaling
   - Height offset: `targetRadius * 6, min 200` — the `min 200` needs scaling
   - Arc clearance: `targetRadius * 5, min 120` — the `min 120` needs scaling
   - Turbo engagement: `> 200 units` — needs scaling
   - Waypoint clearance: `40 units` — needs scaling
   - Ship staging offset: `80 units from camera` — needs scaling
   - Turn/travel camera distances: `60 behind, 25 height` — needs scaling
   - Settle camera offset: `80 units from planet` — needs scaling

8. **Intro sequence — HIGHEST breakage risk for visual quality**
   - `introSequence.ts` has **50+ hardcoded absolute positions**
   - Final camera position: `(919, 35, 180)` — these are world-space coordinates
     that reference the current Experience orbit (~600) area
   - Final ship position: `(902, 29, 176)` — similarly absolute
   - Orbit radius: `260` — relates to current scene scale
   - Detour distances: `220, 380, 680` thresholds
   - Camera clearance: `80`
   - All lateral/vertical offset ranges
   - **These ALL need recalculation for the new orbit scale**

9. **Star Destroyer cruiser patrol — scale-dependent**
   - Waypoint radius range: `200–900` in `StarDestroyerCruiser.ts` — maps to current
     orbit space, needs 2× expansion
   - Waypoint max height: `80` — needs scaling
   - Cruising speed: `12 units/sec` — may need adjustment
   - Waypoint arrival distance: `40` — needs scaling
   - Minimum travel distance: `150` — needs scaling
   - Engine light distances: `60 + speedFraction * 100`

10. **Hologram displays — scale-dependent**
    - `HologramDroneDisplay.ts`: reference distance `60`, base panel width `14`,
      side offset `10`, drone height offset `5 * distScale`
    - `CockpitHologramPanels.ts`: cockpit camera position duplicated from
      `useRenderLoop.ts` — must stay in sync

11. **CosmicNavigation.ts — camera fly-to targets**
    - System overview position: `(800, 1200)` — needs scaling
    - Planet focus distance: `300` default — needs scaling
    - Cinematic approach height: `200` — needs scaling
    - Orbit/final position offsets: all scale-dependent

12. **Focus controller**
    - Moon focus camera distance: `25` in `focusController.ts`
    - With moons growing 6×, this needs to become ~150 or relative to moon radius

13. **Wander radii (camera boundaries)**
    - `ResumeSpace3D.tsx` lines 1304-1308: Experience `320`, Skills `360`,
      Projects `340`, Sun `260`
    - These define cinematic camera wander zones — must scale with orbits

### 5c. Should-Have Changes

14. **Ship LOD (Level of Detail) system**
    - When camera > N units from ship, render as a glowing point sprite
    - When camera < N units, switch to full GLTF model
    - Prevents ships from being completely invisible at distance
    - Could use `THREE.LOD` or manual distance check in render loop

15. **Adaptive near plane** (partially implemented, needs expansion)
    - Currently adjusts between 0.005–1.0 based on view mode
    - With log depth buffer, the near plane matters less, but keeping it reasonable
      still helps precision

16. **Starfield/skyfield sphere expansion**
    - Currently `8000` and `7800` radius
    - If camera far plane goes to `50,000`, these need to grow to avoid the camera
      flying past the star background (or we can just keep far=50k and stars at 8k
      since the camera rarely goes that far)

### 5d. Nice-to-Have (Future)

17. **Moon orbit view mode** — enabled by this refactor
18. **Atmospheric glow for planets** — Fresnel rim glow shader

### 5e. Additional Libraries

**No new libraries required.** Everything can be done with current dependencies.

**Optional future library:**
- `three-mesh-bvh` — if we add collision detection at scale, BVH acceleration helps.
  Not needed for this phase.

---

## 6. Risk Assessment (Updated After Deep Audit)

| # | Risk                                           | Severity   | Mitigation                                                |
|---|------------------------------------------------|------------|-----------------------------------------------------------|
| 1 | **Sun disappears/clips** with log depth buffer | **HIGH**   | Fix shader BEFORE enabling log depth buffer (Section 5a)  |
| 2 | **Intro sequence breaks** — 50+ absolute coords| **HIGH**   | Multiply all positions by `SCALE.orbit`; test thoroughly   |
| 3 | **Cockpit view breaks** — offsets in 3 files   | **HIGH**   | Centralize in `scaleConfig.ts`; positions are already × by `ship.scale.x` so they auto-scale IF the model-space positions stay the same |
| 4 | **Ships completely invisible** from any view    | **HIGH**   | LOD system: point sprite when far, model when close        |
| 5 | **Navigation never arrives** — thresholds wrong | **HIGH**   | All arrival/decel/freeze distances must reference config   |
| 6 | **Sun obstacle too small** — ships fly through  | **HIGH**   | Sun obstacle radius `350` MUST grow with sun radius        |
| 7 | Z-fighting / depth artifacts                   | Medium     | Log depth buffer + sun shader fix                          |
| 8 | Bloom intensity wrong at new scales             | Medium     | May need to adjust bloom threshold/radius/strength         |
| 9 | Labels positioned incorrectly                  | Medium     | Label Y offset `size + 10` — the `+10` may need scaling   |
| 10| Follow camera too far/close from ship          | Medium     | Follow distance is hardcoded in 4 places — must all update|
| 11| Star Destroyer patrol exits visible space      | Medium     | Waypoint range `200-900` must scale with orbit expansion   |
| 12| Hologram drone display positioning wrong       | Medium     | Reference distance `60` and offsets need recalibration     |
| 13| CockpitHologramPanels out of sync              | Medium     | Cockpit position duplicated from `useRenderLoop.ts` — must sync |
| 14| CosmicNavigation fly-to targets wrong          | Medium     | All absolute positions need scaling                        |
| 15| Focus controller zoom distance wrong           | Medium     | Moon focus distance `25` must scale with moon radius       |
| 16| Wander radii don't match new orbits            | Medium     | Values `260-360` must scale with orbit expansion           |
| 17| Engine light distances wrong                   | Low        | `220 + speedFactor * 140` — may need adjustment            |
| 18| Physics collider sizes wrong                   | Low        | Anchor radius `0.5` — minor impact                         |
| 19| Performance at larger scales                   | Low        | Object count unchanged; geometry slightly larger is fine   |
| 20| Starfield sphere too small for new camera range| Low        | Expand from `8000` to match new far plane if needed        |

### NEW RISK: Value Duplication

The audit found the same values **duplicated across multiple files** without shared constants:
- Cockpit position `(-6.05, 3.16, 5.36)` → `useRenderLoop.ts` AND `CockpitHologramPanels.ts`
- Follow distance `60` → 4 locations in 2 files
- Follow height `25` → 4 locations in 2 files
- Camera near `0.1` → 7 locations
- Camera maxDistance `6000` → 5 locations
- Camera near cockpit `0.01` → 3 locations

**Mitigation:** The `scaleConfig.ts` approach eliminates this duplication. Every location
imports from one source of truth.

---

## 7. Implementation Plan (Phased, Revised After Audit)

### Phase 0 — Safety Net ✅ DONE
- [x] **0.1** Merge `new-physics-engines` → `main`
- [x] **0.2** Create `scale-realism` branch from `main`
- [ ] **0.3** Ensure the app builds and runs correctly before any changes
- [ ] **0.4** Take screenshots of current state for comparison

### Phase 1 — Foundation & Config (LOW RISK)
- [ ] **1.1** Create `src/components/cosmos/scaleConfig.ts` with ALL scale constants
  - Must cover all 300+ hardcoded values (grouped by category)
  - Include ORIGINAL values as comments so we can verify nothing was mistyped
  - Start with multipliers all set to `1.0` so the app is UNCHANGED after wiring
- [ ] **1.2** Fix sun ShaderMaterial: add `#include <logdepthbuf_*>` chunks (Section 5a)
- [ ] **1.3** Enable `logarithmicDepthBuffer: true` on WebGLRenderer
- [ ] **1.4** Test: sun renders correctly, no z-fighting, app works identically
- [ ] **1.5** COMMIT — "Phase 1: log depth buffer + scale config scaffold"
- **Checkpoint:** App works identically to before. Log depth buffer active. Config file
  exists with all `1.0` multipliers (no visual change yet).

### Phase 2 — Wire Up Config (MEDIUM RISK, ZERO VISUAL CHANGE)
This is the tedious but critical phase — replace every hardcoded value with a reference
to `scaleConfig.ts`, while keeping all multipliers at `1.0`. After this phase, the app
looks and works identically, but all values flow from one file.
- [ ] **2.1** Wire up `ResumeSpace3D.tsx` — planet/moon/ship creation (sizes, distances, positions)
- [ ] **2.2** Wire up `ResumeSpace3D.factories.ts` — sun radius, label offsets, orbit tube radii
- [ ] **2.3** Wire up `useRenderLoop.ts` — cockpit offsets, follow distances, escort offsets,
  engine lights, steering params, camera constraints
- [ ] **2.4** Wire up `useNavigationSystem.ts` — arrival/decel/freeze distances, obstacle radii,
  staging offsets, camera distances
- [ ] **2.5** Wire up `useThreeScene.ts` — camera near/far, control distances
- [ ] **2.6** Wire up `introSequence.ts` — all absolute positions and distances
- [ ] **2.7** Wire up `StarDestroyerCruiser.ts` — patrol ranges, speeds, waypoint distances
- [ ] **2.8** Wire up `CosmicNavigation.ts` — fly-to positions, focus distances
- [ ] **2.9** Wire up `HologramDroneDisplay.ts` — panel widths, offsets, reference distance
- [ ] **2.10** Wire up `CockpitHologramPanels.ts` — cockpit position (sync with useRenderLoop)
- [ ] **2.11** Wire up `ResumeSpace3D.focusController.ts` — moon focus distance
- [ ] **2.12** Wire up `SpaceshipNavigationSystem.ts` — navigation distances
- [ ] **2.13** Wire up `SteeringController.ts` — arrive behavior radii
- [ ] **2.14** Wire up `useOrbitSystem.ts` — label occlusion thresholds, overlay offsets
- [ ] **2.15** Wire up remaining files: `PhysicsWorld.ts`, `PhysicsTravelAnchor.ts`,
  `ResumeSpace3D.interaction.ts`
- [ ] **2.16** Test: app works IDENTICALLY to before — no visual change whatsoever
- [ ] **2.17** COMMIT — "Phase 2: wire all hardcoded values to scaleConfig (no visual change)"
- **Checkpoint:** Zero visual change. But now every distance/size flows from one file.
  Changing a multiplier in `scaleConfig.ts` changes everything proportionally.

### Phase 3 — Flip the Switch: Scale Changes (HIGH RISK)
Now we change the multipliers in `scaleConfig.ts` and fix whatever breaks.
- [ ] **3.1** Set ship multiplier to target value (e.g. `0.002`)
- [ ] **3.2** Set planet multiplier to target value (e.g. `7`)
- [ ] **3.3** Set moon multiplier to target value (e.g. `6`)
- [ ] **3.4** Set sun multiplier to target value (e.g. `6.7`)
- [ ] **3.5** Set orbit multiplier to target value (e.g. `2`)
- [ ] **3.6** Set camera multiplier to target value (e.g. `2`)
- [ ] **3.7** Expand starfield/skyfield spheres if needed (currently `8000/7800`)
- [ ] **3.8** Test systematically:
  - [ ] System overview — all planets/sun visible, orbits look right
  - [ ] Planet focus — click planet, camera zooms to right distance
  - [ ] Moon focus — click moon, camera zooms to right distance
  - [ ] Ship navigation — fly to a planet, ship arrives correctly
  - [ ] Cockpit view — enter cockpit, instruments visible, can look around
  - [ ] Cabin view — enter cabin, view works
  - [ ] Exterior follow — camera follows at right distance
  - [ ] Star Destroyer — patrols within visible space
  - [ ] Star Destroyer escort — formation offsets look right
  - [ ] Manual flight — WASD controls work, ship moves correctly
  - [ ] Intro sequence — camera sweeps work at new scale
  - [ ] Labels — positioned correctly above bodies
  - [ ] Hologram panels — positioned correctly near moons
  - [ ] Cockpit holograms — visible and positioned correctly
  - [ ] Bloom — sun/planets glow appropriately
  - [ ] No z-fighting or depth artifacts
- [ ] **3.9** Fix any broken values (adjust specific constants in `scaleConfig.ts`)
- [ ] **3.10** COMMIT — "Phase 3: apply scale multipliers"
- **Checkpoint:** Universe is now at target scale. May need polish but fundamentally works.

### Phase 4 — Ship LOD System (MEDIUM RISK)
- [ ] **4.1** Implement LOD for Millennium Falcon:
  - Full GLTF model when camera < N units
  - Glowing point sprite when camera > N units
  - Smooth transition between the two
- [ ] **4.2** Implement LOD for Star Destroyer (same approach)
- [ ] **4.3** Test: ships visible as dots from far, full model up close
- [ ] **4.4** COMMIT — "Phase 4: ship LOD system"
- **Checkpoint:** Ships are visible at all distances as appropriate representation.

### Phase 5 — Polish & Edge Cases (LOW RISK)
- [ ] **5.1** Fine-tune all multiplier values for visual quality
- [ ] **5.2** Verify all view transitions (overview → planet → moon → cockpit → back)
- [ ] **5.3** Verify keyboard controls, pointer interactions, HUD displays
- [ ] **5.4** Performance check
- [ ] **5.5** Update documentation and comments with new scale assumptions
- [ ] **5.6** COMMIT — "Phase 5: polish and tune"
- **Checkpoint:** Production-ready. All features work. Universe feels immersive.

---

## 8. The `scaleConfig.ts` Blueprint (Expanded After Audit)

This is the key file. Phase 2 wires everything to it. Phase 3 changes the multipliers.

**CRITICAL DESIGN DECISION:** In Phase 2, all multipliers are `1.0`. The app must look
identical to before. Only in Phase 3 do we change multipliers to target values.

```typescript
// src/components/cosmos/scaleConfig.ts

// ═══════════════════════════════════════════════════════════
// BASE MULTIPLIERS — Change these to rescale the universe.
// In Phase 2 these are all 1.0 (no visual change).
// In Phase 3 we set them to target values.
// ═══════════════════════════════════════════════════════════

export const SCALE = {
  sun: 1.0,      // Target: 6.7  — sun radius multiplier
  planet: 1.0,   // Target: 7    — planet radius multiplier
  moon: 1.0,     // Target: 6    — moon radius multiplier
  orbit: 1.0,    // Target: 2    — orbital distance multiplier
  ship: 1.0,     // Target: 0.002 — ship scale multiplier (< 1 shrinks)
  camera: 1.0,   // Target: 2    — camera/view distance multiplier
} as const;

// ═══════════════════════════════════════════════════════════
// CELESTIAL BODIES
// ═══════════════════════════════════════════════════════════

// Sun (original radius: 60)
export const SUN_RADIUS          = 60 * SCALE.sun;
export const SUN_GLOW_SPRITE     = 180 * SCALE.sun;
export const SUN_LABEL_Y         = 50 * SCALE.sun;
export const SUN_OBSTACLE_RADIUS = 350 * SCALE.sun;  // nav avoidance radius
export const SUN_WANDER_RADIUS   = 260 * SCALE.camera;

// Planets (original radii: 15, 20, 18)
export const EXPERIENCE_RADIUS   = 15 * SCALE.planet;
export const SKILLS_RADIUS       = 20 * SCALE.planet;
export const PROJECTS_RADIUS     = 18 * SCALE.planet;

// Planet orbits (original: 600, 1000, 900)
export const EXPERIENCE_ORBIT    = 600 * SCALE.orbit;
export const SKILLS_ORBIT        = 1000 * SCALE.orbit;
export const PROJECTS_ORBIT      = 900 * SCALE.orbit;

// Planet wander radii (original: 320, 360, 340)
export const EXP_WANDER_RADIUS   = 320 * SCALE.camera;
export const SKILLS_WANDER_RADIUS = 360 * SCALE.camera;
export const PROJ_WANDER_RADIUS  = 340 * SCALE.camera;

// Moons (original radii: 5, 6)
export const EXP_MOON_RADIUS     = 5 * SCALE.moon;
export const SKILL_MOON_RADIUS   = 6 * SCALE.moon;
export const SCROLLING_MOON_RADIUS = 5 * SCALE.moon;

// Moon orbits from parent (original: 40, 60+i*20, 70+i*15)
export const SCROLLING_MOON_ORBIT = 40 * SCALE.orbit;
export const EXP_MOON_ORBIT_BASE = 60 * SCALE.orbit;
export const EXP_MOON_ORBIT_STEP = 20 * SCALE.orbit;
export const SKILL_MOON_ORBIT_BASE = 70 * SCALE.orbit;
export const SKILL_MOON_ORBIT_STEP = 15 * SCALE.orbit;

// Label offset (added to planet radius)
export const LABEL_Y_PADDING     = 10 * SCALE.planet;

// Orbit ring tube radii
export const MAIN_ORBIT_TUBE     = 0.12;  // may need * SCALE.orbit
export const MOON_ORBIT_TUBE     = 0.08;

// Starfield
export const STARFIELD_RADIUS    = 8000;  // may need increase for camera range
export const SKYFIELD_RADIUS     = 7800;

// ═══════════════════════════════════════════════════════════
// SHIPS
// ═══════════════════════════════════════════════════════════

// Falcon (original scale: 0.5)
export const FALCON_SCALE        = 0.5 * SCALE.ship;
export const FALCON_INITIAL_POS  = { x: 50, y: 20, z: 50 };  // may need * SCALE.orbit

// Star Destroyer (original scale: 0.06)
export const SD_SCALE            = 0.06 * SCALE.ship;
export const SD_INITIAL_POS      = { x: 400 * SCALE.orbit, y: 40, z: -300 * SCALE.orbit };

// ═══════════════════════════════════════════════════════════
// CAMERA & CONTROLS
// ═══════════════════════════════════════════════════════════

export const CAMERA_FOV          = 45;
export const CAMERA_NEAR         = 0.1;     // target: 0.001 with log depth
export const CAMERA_FAR          = 10_000 * SCALE.camera;
export const CAMERA_INITIAL_POS  = { x: 0, y: 400 * SCALE.camera, z: 600 * SCALE.camera };

export const CONTROLS_MIN_DIST   = 0.01;
export const CONTROLS_MAX_DIST   = 6000 * SCALE.camera;

export const NEAR_PLANE_DEFAULT  = 0.1;      // restored when leaving ship
export const NEAR_PLANE_COCKPIT  = 0.01;     // cockpit view
export const NEAR_PLANE_CABIN    = 0.05;     // cabin view
export const NEAR_PLANE_EXPLORE  = 0.005;    // ship explore mode
export const NEAR_PLANE_OVERVIEW = 1.0;      // system overview

// Zoom exit threshold
export const ZOOM_EXIT_THRESHOLD = 12 * SCALE.camera;

// ═══════════════════════════════════════════════════════════
// SHIP CAMERA — FOLLOW & INTERIOR
// ═══════════════════════════════════════════════════════════

// Exterior follow (original: 60 behind, 25 above)
export const FOLLOW_DISTANCE     = 60;   // camera-controls handles via ship position
export const FOLLOW_HEIGHT       = 25;

// Cockpit local position (original: -6.05, 3.16, 5.36 — model space, scaled by ship.scale.x)
export const COCKPIT_LOCAL_POS   = { x: -6.05, y: 3.16, z: 5.36 };
export const COCKPIT_TARGET_LOCAL = { x: -6.05, y: 3.16, z: 11.36 };

// Cabin local position (original: 0, -0.64, -4.49 — model space)
export const CABIN_LOCAL_POS     = { x: 0, y: -0.64, z: -4.49 };
export const CABIN_TARGET_LOCAL  = { x: 0, y: -0.64, z: 1.51 };

// Interior camera constraints
export const INTERIOR_MIN_DIST   = 0.01;
export const INTERIOR_MAX_DIST   = 0.02;

// ═══════════════════════════════════════════════════════════
// STAR DESTROYER ESCORT FORMATION
// ═══════════════════════════════════════════════════════════

export const SD_ESCORT_STARBOARD = 40;   // units to the right
export const SD_ESCORT_ABOVE     = 8;    // units above
export const SD_ESCORT_BEHIND    = 15;   // units behind

// ═══════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════

export const NAV_MAX_SPEED       = 3.0 * SCALE.orbit;   // scales with distance
export const NAV_TURBO_SPEED     = 6.0 * SCALE.orbit;
export const NAV_ACCEL_RATE      = 0.12;
export const NAV_DECEL_DISTANCE  = 150 * SCALE.orbit;
export const NAV_ARRIVAL_DIST    = 30 * SCALE.orbit;
export const NAV_FREEZE_DIST     = 60 * SCALE.orbit;
export const NAV_STAGING_OFFSET  = 80 * SCALE.camera;  // ship staging from camera
export const NAV_HEIGHT_MIN      = 200 * SCALE.orbit;
export const NAV_ARC_CLEARANCE_MIN = 120 * SCALE.orbit;
export const NAV_TURBO_ENGAGE_DIST = 200 * SCALE.orbit;
export const NAV_WAYPOINT_CLEAR  = 40 * SCALE.orbit;
export const NAV_CAMERA_BEHIND   = 60;   // follow cam during travel
export const NAV_CAMERA_HEIGHT   = 25;   // follow cam height during travel

// ═══════════════════════════════════════════════════════════
// STAR DESTROYER CRUISER PATROL
// ═══════════════════════════════════════════════════════════

export const SD_WAYPOINT_MIN_R   = 200 * SCALE.orbit;
export const SD_WAYPOINT_MAX_R   = 900 * SCALE.orbit;
export const SD_WAYPOINT_MAX_H   = 80 * SCALE.orbit;
export const SD_CRUISE_SPEED     = 12;     // units/sec — may need * SCALE.orbit
export const SD_WAYPOINT_ARRIVE  = 40 * SCALE.orbit;
export const SD_MIN_TRAVEL_DIST  = 150 * SCALE.orbit;

// ═══════════════════════════════════════════════════════════
// INTRO SEQUENCE (all absolute positions)
// ═══════════════════════════════════════════════════════════

export const INTRO_ORBIT_RADIUS  = 260 * SCALE.orbit;
export const INTRO_CAM_CLEARANCE = 80 * SCALE.camera;
export const INTRO_DETOUR_THRESH = 220 * SCALE.orbit;
export const INTRO_DETOUR_MIN    = 380 * SCALE.orbit;
export const INTRO_DETOUR_MAX    = 680 * SCALE.orbit;
// Note: Final camera/ship positions will need full recalculation in Phase 3

// ═══════════════════════════════════════════════════════════
// FOCUS & INTERACTION
// ═══════════════════════════════════════════════════════════

export const MOON_FOCUS_DISTANCE = 25 * SCALE.moon;
export const PLANET_FOCUS_DIST   = 300 * SCALE.camera;
export const SYSTEM_OVERVIEW_Y   = 800 * SCALE.camera;
export const SYSTEM_OVERVIEW_Z   = 1200 * SCALE.camera;
export const CINEMATIC_APPROACH_H = 200 * SCALE.camera;

// ═══════════════════════════════════════════════════════════
// HOLOGRAM DISPLAYS
// ═══════════════════════════════════════════════════════════

export const HOLO_PANEL_WIDTH    = 14;    // world-unit width at reference
export const HOLO_SIDE_OFFSET    = 10;    // world units to right of moon
export const HOLO_REF_DISTANCE   = 60;    // reference distance for scaling
export const HOLO_FWD_RATIO      = 0.3;   // 30% from moon toward camera

// Cockpit hologram
export const COCKPIT_PANEL_WIDTH = 1.4;
export const COCKPIT_PANEL_DEPTH = 1.5;   // closest panel
export const COCKPIT_PANEL_STEP  = 0.3;   // each subsequent panel

// ═══════════════════════════════════════════════════════════
// ENGINE EFFECTS
// ═══════════════════════════════════════════════════════════

export const ENGINE_LIGHT_DIST   = 220;   // base engine light distance
export const ENGINE_LIGHT_RANGE  = 140;   // additional range at full speed

// ═══════════════════════════════════════════════════════════
// LOD THRESHOLDS
// ═══════════════════════════════════════════════════════════

export const SHIP_LOD_MODEL_DIST = 5;     // show full GLTF within 5 units
export const SHIP_LOD_SPRITE_DIST = 2000; // show sprite up to 2000 units
```

The beauty of this approach: **Phase 2 changes nothing visually** — it only replaces
hardcoded numbers with references to this file (all multipliers are `1.0`). **Phase 3
changes only this file** — adjust multipliers and everything scales proportionally.
If anything looks wrong, tweak ONE number.

---

## 9. Key Code Locations — Full Audit Results

| # | File | Hardcoded Values Found | Estimated Complexity |
|---|------|----------------------|---------------------|
| 1 | `scaleConfig.ts` (NEW) | Central scale constants | New file |
| 2 | `ResumeSpace3D.tsx` | ~60 values: planet/moon/ship creation, positions, camera near/far, follow distances, cinematic offsets, wander radii, FOV, control distances | **Very High** |
| 3 | `useRenderLoop.ts` | ~70 values: cockpit offsets, follow distances, escort formation, steering rates, engine lights, camera constraints, manual flight params | **Very High** |
| 4 | `useNavigationSystem.ts` | ~45 values: arrival/decel/freeze distances, obstacle radii, staging offsets, turbo thresholds, camera distances, avoidance params | **High** |
| 5 | `introSequence.ts` | ~50 values: absolute camera/ship positions, orbit radii, detour distances, offset ranges, durations | **High** |
| 6 | `StarDestroyerCruiser.ts` | ~25 values: patrol ranges, speeds, waypoint distances, engine effects, banking params | **Medium** |
| 7 | `ResumeSpace3D.factories.ts` | ~15 values: sun radius, label offsets, orbit tube radii, starfield size, sprite multipliers | **Medium** |
| 8 | `CosmicNavigation.ts` | ~15 values: fly-to positions, focus distances, approach heights, overview position | **Medium** |
| 9 | `useOrbitSystem.ts` | ~15 values: label occlusion thresholds, overlay offsets, bullet spacing | **Medium** |
| 10 | `SpaceshipNavigationSystem.ts` | ~20 values: nav config, obstacle avoidance, speed calculations | **Medium** |
| 11 | `HologramDroneDisplay.ts` | ~10 values: panel widths, offsets, reference distance, fly-in positions | **Low–Medium** |
| 12 | `CockpitHologramPanels.ts` | ~8 values: cockpit pos (DUPLICATE), panel dimensions | **Low** |
| 13 | `useThreeScene.ts` | ~8 values: camera near/far, control distances, bloom params | **Low** |
| 14 | `ResumeSpace3D.focusController.ts` | ~4 values: focus distances | **Low** |
| 15 | `SteeringController.ts` | ~3 values: max speed, max force, arrive radii | **Low** |
| 16 | `ResumeSpace3D.interaction.ts` | ~2 values: click detection thresholds | **Low** |
| 17 | `PhysicsTravelAnchor.ts` | 1 value: anchor radius | **Trivial** |
| | **TOTAL** | **~350 hardcoded values** | |

---

## 10. Answers to Your Questions

**Q: Can Three.js handle this?**  
A: Yes. With `logarithmicDepthBuffer` enabled, Three.js handles extreme scale ranges
well. Space games (and Three.js demos) routinely do this. No floating-origin hack needed
at our scale (~50,000 unit range).

**Q: Will ships be invisible from far away?**  
A: Yes, by design! A ship LOD system will show them as a glowing dot/sprite from
distance, and the full model when close. This is standard in space games.

**Q: Do orbits need to change?**  
A: Only if we enlarge planets significantly. With a 7× planet scale, a modest 2× orbit
expansion gives plenty of room. If we only shrink ships and leave planets as-is, orbits
don't need to change at all.

**Q: Do we need additional libraries?**  
A: No. Everything needed is already in Three.js and the current dependencies.

**Q: Will existing functionality break?**  
A: Not if we follow the phased plan. The deep audit found **350+ hardcoded values**
across **17 files** — this is almost certainly why the previous attempt failed. You
can't change 5 values and have the other 345 still work. Our Phase 2 ("wire up config")
replaces ALL 350+ values with references to one config file, and the multipliers start
at `1.0` so the app is unchanged. Only then do we change multipliers in Phase 3.
If anything breaks, we set the multiplier back to `1.0` — instant rollback.

**Q: Is the moon-orbit view (moon filling the screen) feasible after this?**  
A: Absolutely — it's one of the primary motivations. With moons at radius 25–40 units,
placing a camera at altitude 5–10 above the surface would make the moon fill the lower
half of the viewport. The logarithmic depth buffer ensures both the nearby moon surface
and distant stars render correctly.

---

## 11. Order of Operations (Safe Rollback Points)

```
main (merged from new-physics-engines)
  └── scale-realism (current branch)
         │
         ├── Phase 0: branch + verify      ✅ DONE
         ├── Phase 1: log depth + config    (rollback: revert 1 commit)
         ├── Phase 2: wire up config        (rollback: revert 1 commit — app unchanged)
         ├── Phase 3: flip the switch       (rollback: set multipliers back to 1.0 in scaleConfig)
         ├── Phase 4: ship LOD              (rollback: revert 1 commit)
         └── Phase 5: polish               (merge to main when ready)
```

**Key safety property of this design:** Phase 3's rollback is trivial — just reset
the multipliers in `scaleConfig.ts` back to `1.0`. No code revert needed. This is why
Phase 2 (wiring up the config) is the most important phase even though it changes nothing
visually.

---

## 12. Estimated Effort (Revised After Audit)

The original estimate of 10–15 hours was **too optimistic**. The audit found 350+
hardcoded values across 17 files. Phase 2 alone (wiring up the config) is substantial.

| Phase | Effort | Risk | Notes |
|-------|--------|------|-------|
| Phase 0: Safety Net | 10 min | None | ✅ Done |
| Phase 1: Foundation | 1–2 hours | Low | Config file + shader fix + log depth buffer |
| Phase 2: Wire Up Config | **6–10 hours** | Medium | 350+ values across 17 files. Zero visual change. |
| Phase 3: Flip the Switch | 2–4 hours | **High** | Change multipliers, test everything, fix breakage |
| Phase 4: Ship LOD | 2–3 hours | Medium | New feature: point sprites + model switching |
| Phase 5: Polish | 2–4 hours | Low | Tuning, edge cases, documentation |
| **Total** | **~15–25 hours** | **Manageable with phased approach** | |

**Why Phase 2 is so large:** It's the tedious but essential work of replacing every
hardcoded number with a config reference. It produces zero visual change but creates
the safety net that makes Phase 3 a controlled, tunable operation instead of a
"change 50 things and pray" situation. This is exactly what was missing in the
previous failed attempt.

---

## 13. What Could Still Surprise Us

Being honest about unknowns:

1. **Bloom post-processing at new scales** — The `UnrealBloomPass` with strength
   `sunIntensity * 0.4` may bloom too aggressively or too weakly on larger geometry.
   We won't know until we test. Easy to tune.

2. **Intro sequence final positions** — The intro's final camera and ship positions
   are absolute world coordinates `(919, 35, 180)` that place the camera near the
   Experience planet orbit. With orbits at 2×, these become `(~1838, 70, 360)`.
   But the intro uses cubic Bézier curves with randomized control points, so the
   "feel" of the animation may change. May need manual tweaking.

3. **Cockpit camera positions are model-space** — The values `(-6.05, 3.16, 5.36)`
   are positions inside the Falcon GLTF model and are already multiplied by
   `ship.scale.x`. So when we change `FALCON_SCALE` from `0.5` to `0.001`, the
   cockpit camera will be positioned at `(-6.05 * 0.001, ...)` = very tiny offset
   from ship center. This should be correct (camera inside a tiny ship). BUT the
   `minDistance` and `maxDistance` on camera-controls during interior view (`0.01`
   and `0.02`) may need to scale down to `0.00001` and `0.00002`. This is untested
   territory with camera-controls — need to verify it handles such small values.

4. **camera-controls at extreme small distances** — When the ship is scale `0.001`,
   the cockpit is ~0.006 units from the ship center. camera-controls may have
   numerical instability at these scales. If so, we may need to keep the ship at a
   larger scale (e.g., `0.01`) and find the sweet spot.

5. **Engine lights** — PointLight distance of `220` units currently makes sense for
   a ship that's 8 units long. At scale `0.001`, the ship is 0.016 units long and
   a light distance of 220 would illuminate half the solar system. These definitely
   need to scale with ship size.

---

## Approval Checklist

- [ ] User approves overall approach (stylized realism, not true astronomical)
- [ ] User approves target scale values (Section 4 table)
- [ ] User approves the revised 5-phase plan (especially the "wire up first, change later" strategy)
- [ ] User approves the revised effort estimate (~15–25 hours)
- [x] Branch created (`scale-realism` from `main`)
- [ ] Ready to begin Phase 1
