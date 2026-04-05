# About journey & particle beams — handoff for continued work

This document summarizes what exists today for the **about particle swarm / cosmic path (“beams”)** experience, how it is wired into the scene, and a **directional plan** for the full narrative so another contributor (human or AI) can extend it without rediscovering the codebase.

---

## What exists today

### Core modules (this folder)

| File | Role |
|------|------|
| `AboutJourneyController.ts` | Linear **phase state machine** for the cinematic about journey: arrival, fly-through, excitement, path forming, path ready, automatic dispersal, then handoff to `IDLE`. Schedules timing (e.g. hold on completed path before dispersal). Exposes `notifyPathComplete` / `notifyDispersalComplete` for the render loop. |
| `AboutParticleSwarm.ts` | **Three.js `Points` + Yuka** flock: leaders with separation/cohesion/alignment/wander; followers orbit leaders. Phases drive visuals: normal swarm → excitement / ring → **path trail** (many particles flowing along a `CatmullRomCurve3`) → **dispersal** (burst velocities + fade). Returns per-frame **edge signals** (`pathLoopCompleteEdge`, `dispersalCompleteEdge`) so the controller is notified exactly once per event. |

### Integration point

- **`ResumeSpace3D.tsx`** (large file): creates the primary swarm at **`ABOUT_PARTICLE_SWARM_WORLD_ANCHOR`** (same as `PROJECT_SHOWCASE_ABOUT_WORLD_ANCHOR`), instantiates `AboutJourneyController` with callbacks (`hideShip`, `showShip`, controls, camera, swarm world position, vlog, **dispersal / hydrate / exit** hooks, **camera distance clamping** during journey).
- **`useRenderLoop.ts`**: each frame — `checkArrival` during `TRANSIT`; **`aboutParticleSwarmRef.current.update(...)`** with current journey phase; **`aboutHydrateSwarmRef`** updated as a second swarm in `IDLE` behavior while dispersal runs; calls **`notifyPathComplete`** / **`notifyDispersalComplete`** when edge flags fire.
- **Landmarks** for the cosmic loop are registered after scene build (skills anchor, orbital portfolio anchor, memory square anchor, plus sampled experience moons).

### Debug / ops

- **`src/lib/debugLog.ts`**: `?debug=true` gates `dlog` / `dwarn` / `dinfo` / `dtable` so perf and dev logs do not spam production consoles.
- Journey “ship log” / `vlog` messages still go through the existing HUD/terminal pipeline where applicable.

---

## Phase flow (current)

Numeric phases are `AboutJourneyPhase` in `AboutJourneyController.ts`:

1. **`IDLE`** — Normal operation; primary swarm can be at showcase “about” anchor **or**, after a full cycle, promoted to **memory square** (see hydrates below).
2. **`TRANSIT`** — User navigated to about; ship approaches; render loop calls **`checkArrival()`** when ship is within `ARRIVAL_TRIGGER_DIST` of swarm world position.
3. **`FLY_THROUGH`** — Scripted camera from current view toward behind swarm; ship hidden partway through; controls disabled.
4. **`EXCITEMENT`** — Controls enabled; swarm animation escalates (speed, size, extra particles, ring formation). **Camera min/max distance** clamped (`ABOUT_JOURNEY_CAM_MIN_DIST` / `ABOUT_JOURNEY_CAM_MAX_DIST` in `ResumeSpace3D.tsx`) so extreme dolly does not make the point path vanish (point size ~ 1/depth).
5. **`PATH_FORMING`** — Cosmic loop curve built from swarm position + landmarks; particles emit along path; soft camera target nudges toward “spear head”. **`PATH_HEAD_SPEED` must stay in sync** between controller and swarm file.
6. **`PATH_READY`** — Path loop complete; **emission stops** (only `PATH_FORMING` emits); frozen path visible briefly.
7. After **`PATH_READY_HOLD_BEFORE_DISPERSAL_MS`** → **`PATH_DISPERSING`** — Path particles burst and fade; **hydrate swarm** spawns at **`ABOUT_MEMORY_SQUARE_WORLD_ANCHOR`** (`onPathDispersalStarted`).
8. When dispersal finishes (particles gone or max duration) → **`onPathDispersalComplete`**: dispose old primary, promote hydrate to **`aboutParticleSwarmRef`**, clear hydrate ref, restore default camera distance limits, controller → **`IDLE`**. Next **`beginTransit()`** uses the **new** swarm position (memory square).

**Exit:** `AboutJourneyController.exit()` calls **`onAboutJourneyExit()`** (restore camera limits, dispose hydrate if present), then restores ship visibility / following where appropriate.

---

## Important world anchors (ResumeSpace3D)

- **`PROJECT_SHOWCASE_ABOUT_WORLD_ANCHOR` / `ABOUT_PARTICLE_SWARM_WORLD_ANCHOR`** — Initial primary swarm (project showcase “about” corridor region).
- **`ABOUT_MEMORY_SQUARE_WORLD_ANCHOR`** — Memory-square / deep about area; **hydrate swarm** appears here during dispersal and becomes the **primary** after handoff.

Navigation helpers (`resolveSpecialSectionTarget`, `resolveSectionVisualCenter` for `"about"`) use **`aboutParticleSwarmRef`** so after handoff, “about” targets follow the **active** swarm.

---

## Plan for the “whole” experience (suggested roadmap)

This is **intent**, not all implemented:

1. **Narrative glue** — Copy, audio, and UI beats tied to each phase (e.g. terminal lines, subtle SFX on path complete / dispersal / handoff).
2. **Authoring** — Data-driven landmarks / path variants (JSON or constants file) instead of only code in `ResumeSpace3D` + `buildCosmicLoopPath`.
3. **Second and later runs** — After handoff at memory square, validate **arrival**, **fly-through**, and **path** readability at the new scale; tune `ARRIVAL_TRIGGER_DIST`, camera splines, and landmark set.
4. **Optional user control** — e.g. “dismiss path early” or “replay path” without full journey reset; would need new transitions in `ALLOWED_TRANSITIONS` and UI hooks.
5. **Performance** — Path pool size and dispersal duration trade particles vs. GPU/CPU; `balanced` perf profile already affects the wider scene; consider throttling dispersal updates on low-end if needed.
6. **Visual polish** — Custom shader for points (there were unused GLSL snippets removed from `AboutParticleSwarm.ts`); motion blur / bloom tuning for beams; clearer silhouette at extreme zoom within clamped range.

---

## Quick pointers for the next implementer

- **Single source of truth for phases:** `AboutJourneyController.ts` + `AboutJourneyPhase` enum; keep `useRenderLoop` phase checks aligned (import `AboutJourneyPhase` there).
- **Swarm ↔ controller contract:** `update()` return type is **`AboutSwarmFrameSignals`** — do not revert to a bare `boolean` without updating the render loop.
- **New side-effects** (extra objects, sounds): prefer new **`AboutJourneyCallbacks`** methods so `ResumeSpace3D` stays the only place that touches `sceneRef` / refs.
- **Tuning knobs:** `PATH_READY_HOLD_BEFORE_DISPERSAL_MS`, dispersal constants in `AboutParticleSwarm.ts`, `ABOUT_JOURNEY_CAM_*` in `ResumeSpace3D.tsx`.

---

## Related commits / branch context

Work has been on branch **`feature/about-particle-journey`** (includes debug-gated console helpers, swarm, journey controller, dispersal, hydrate handoff, and camera limits). Verify latest `git log` for exact commit messages.

---

*Last updated for handoff: documentation pass aligned with dispersal + hydrate + camera clamp behavior.*
