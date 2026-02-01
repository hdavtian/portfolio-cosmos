# ResumeSpace3D Refactor Plan (Live + Stepwise)

## Goal

Refactor the monster file safely by extracting small, testable units while keeping everything wired into the live orchestrator (ResumeSpace3D) at every step.

## Rules (Non‑Negotiable)

- No “side branch” systems. Every change must be plugged into the orchestrator immediately.
- Test after every step (manual run + sanity check).
- One step = one commit.
- No behavior changes during early steps (constants/types/helpers).
- If a step fails, revert to the previous commit.
- Consistent component style: prefer `const FuncName = () => {}` and `export default FuncName`.

## Step 0 — Baseline

- Current known good commit: fbd20e1
- File under refactor: ResumeSpace3D.tsx

## Step 1 — Extract Constants & Types (No Behavior Change)

**Target:** move static data and type definitions out of ResumeSpace3D.tsx

- Move static configuration objects (sizes, distances, magic numbers) into a new module.
- Move local type aliases/interfaces into a new module.
- Wire imports back into ResumeSpace3D.tsx immediately.
- Run app and verify no visual or behavioral change.
- Commit.

## Step 2 — Extract Pure Helpers (No Three.js State)

**Target:** functions that only compute values (no side effects)

- Move pure helper functions into a module (e.g., math/formatting utilities).
- Replace in ResumeSpace3D.tsx immediately.
- Run app; verify behavior unchanged.
- Commit.

## Step 3 — Extract Factories (Create Meshes/Labels/Overlays)

**Target:** createX functions that return objects with no external side effects

- Extract `createPlanet`, `createLabel`, `createOverlay` as separate modules.
- Keep inputs/outputs identical.
- Wire into ResumeSpace3D.tsx immediately.
- Test visually (planet positions, labels, overlays).
- Commit.

## Step 4 — Extract Subsystems (One at a Time)

**Order:** Orbital → Interaction → Spaceship → Content Overlay

- Move logic into modules/classes while keeping ResumeSpace3D as orchestrator.
- Plug in immediately; no parallel system.
- Test each subsystem step.
- Commit each step.

## Step 5 — Extract Animation Loop + Lifecycle (Last)

**Target:** move main render loop + lifecycle handlers

- Only after all other pieces are stable.
- Keep orchestrator in control until final cutover.
- Test for performance + stability.
- Commit.

## Step 6 — Cleanup + Documentation

- Remove dead code.
- Update README with architecture notes.
- Final full pass test.

---

## Progress Tracker

- [ ] Step 1 — Constants & Types
- [ ] Step 2 — Pure Helpers
- [ ] Step 3 — Factories
- [ ] Step 4 — Subsystems
- [ ] Step 5 — Lifecycle
- [ ] Step 6 — Cleanup
