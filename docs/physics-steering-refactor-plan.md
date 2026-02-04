# Physics + Steering Refactor Plan

## Progress Checklist

- [ ] Step 0 — Baseline
- [ ] Step 1 — Install Rapier
- [ ] Step 2 — Add YUKA steering
- [ ] Step 3 — Physics-driven travel anchor
- [ ] Step 4 — Camera follow rig
- [ ] Step 5 — Replace travel entry points
- [ ] Step 6 — Cleanup & tuning
- [ ] Step 7 — Physics-based orbital motion

## Goal

Replace GSAP camera travel with **live physics + steering** (no parallel versions). Each step swaps in new behavior while keeping the app running.

## Target Stack

- Physics: **Rapier** (fast WASM physics)
- Steering/AI: **YUKA** (arrive/seek, follow, behavior blending)
- Camera rig: **camera-controls** (damped camera follow) or a small custom spring-damper

## High-Level Flow

1. **Physics world** runs each frame (Rapier).
2. **Steering entity** computes desired velocity (YUKA).
3. **Physics body** receives forces/velocity to move ship/camera anchor.
4. **Camera rig** follows a target transform with damping.

---

## Current GSAP Travel Usage (to be replaced)

**Core travel implementation** (GSAP tweens):

- [src/components/CosmicNavigation.ts](../src/components/CosmicNavigation.ts)
  - `flyTo()` (GSAP tween driving camera position + lookAt)
  - `orbitAround()` (GSAP tween driving orbital path)
  - `cinematicApproach()` (chain of `flyTo()`)
  - `systemOverview()` (calls `flyTo()`)
  - `focusPlanet()` (calls `flyTo()`)

**Call sites that trigger travel** (will be switched to steering API):

- [src/components/cosmos/ResumeSpace3D.focusController.ts](../src/components/cosmos/ResumeSpace3D.focusController.ts) – moon focus travel
- [src/components/cosmos/ResumeSpace3D.tsx](../src/components/cosmos/ResumeSpace3D.tsx) – planet navigation + tour use

**Out of scope (GSAP UI/scroll animations remain)**:

- [src/components/App.tsx](../src/components/App.tsx)
- [src/components/Hero.tsx](../src/components/Hero.tsx)
- [src/components/Experience.tsx](../src/components/Experience.tsx)
- [src/components/Skills.tsx](../src/components/Skills.tsx)
- [src/components/Summary.tsx](../src/components/Summary.tsx)
- [src/components/Footer.tsx](../src/components/Footer.tsx)

---

## Step 0 — Baseline (no code change)

- Confirm build runs and current navigation paths are understood.
- Identify all travel entry points (moon focus, planet navigation, tour, intro).

**Exit criteria**: baseline behavior confirmed.

---

## Step 1 — Install and wire physics (Rapier)

- Add dependencies: `@dimforge/rapier3d-compat`.
- Create a minimal **PhysicsWorld** module with init + step methods.
- Add world to render loop (one source of truth).

**Replace**: none yet (just live physics ticking).
**Exit criteria**: app runs with physics loop active (no behavior change).

---

## Step 2 — Introduce a steering entity (YUKA)

- Add dependency: `yuka`.
- Create a **SteeringController** with a single `Vehicle`.
- Wire `arrive` behavior to a target.

**Replace**: GSAP travel trigger _logic only_ (no camera changes yet).
**Exit criteria**: steering entity updates in the loop without errors.

---

## Step 3 — Create a physics-driven ship/camera anchor

- Create a physics body that represents the travel anchor.
- On each frame: apply steering output → velocity/force on physics body.
- Sync a THREE.Object3D to the body position.

**Replace**: GSAP `flyTo` movement for travel anchor.
**Exit criteria**: anchor moves with steering, no GSAP travel used.

---

## Step 4 — Camera follow rig

- Add camera follow target to the anchor.
- Use **camera-controls** or a custom spring‑damper.
- Keep look-at locked to travel target during flight.

**Replace**: GSAP camera travel fully.
**Exit criteria**: all travel uses physics+steering; GSAP travel removed.

---

## Step 5 — Replace per-feature travel entry points

- Moon focus
- Planet navigation
- Tour waypoints
- Intro sequence (optional)

**Replace**: Each entry point calls the steering travel API.
**Exit criteria**: no GSAP travel left in navigation flows.

---

## Step 6 — Cleanup & tuning

- Remove GSAP travel helpers if unused.
- Add tuning controls (speed, damping, arrival radius).
- Validate performance and stability.

---

## Notes

- Every step is **live replacement** (no duplicate logic).
- If a step breaks behavior, we revert that step only and adjust.

---

## Step 7 — Physics-based orbital motion (best of both worlds)

- Replace deterministic orbit math in [src/components/cosmos/ResumeSpace3D.orbital.ts](../src/components/cosmos/ResumeSpace3D.orbital.ts)
  with physics‑driven orbits.
- Use **Rapier** bodies + **custom gravity forces** per update.
- Keep art‑direction controls (orbit radius, speed) as clamps or targets.

**Replace**: parametric orbit + spin logic.
**Exit criteria**: planets/moons orbit via physics with stable, tunable motion.

---

## Next Action

If you approve, I will start Step 1 and implement it directly.
