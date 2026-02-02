# ResumeSpace3D.tsx Refactor Plan

## Summary

ResumeSpace3D.tsx remains a large, monolithic component with mixed responsibilities: Three.js scene setup, render loop, input handling, navigation, content overlays, tour logic, and options syncing. The existing cosmos helpers are a good start, but the file still tightly couples state, effects, and imperative scene updates.

## Refactor Goals

- Keep the refactor live and incremental with test points after each phase.
- Move the component into src/components/cosmos for organization.
- Reduce cross-cutting state by extracting cohesive hooks and systems.
- Keep Three.js object lifecycles isolated from React rendering.
- Preserve current behavior while making future changes safer.
- Align with React best practices (stable refs, effect boundaries, minimal re-renders).
- Align with Three.js best practices (deterministic lifecycle, explicit dispose, no leaked listeners).

## High-Level Recommendation

Proceed in small phases, each resulting in a buildable, testable state. Extract low-risk, self-contained pieces first (render/resize, logging, keyboard handling), then medium-risk items (navigation, orbit systems), and finally high-risk items (scene construction and animation loop).

Best-practice emphasis:

- React: keep all Three.js mutable state in refs, isolate React state to UI only.
- React: prefer hooks that return handlers/refs, avoid re-creating handlers inside render.
- React: keep effect dependency lists minimal and stable; lift static helpers out.
- Three.js: create/dispose resources deterministically; no hidden globals.
- Three.js: keep a single animation loop with explicit system updates.
- Three.js: never mutate scene graph from multiple places without a clear owner.

## Proposed Phases (Live Refactor)

### Phase 0 — Baseline & Safety

- Add a minimal “integration checklist” doc for runtime tests.
- Identify a single “export surface” for the component (props and emitted events) and keep it stable.
- Add a short “ownership map” comment in the component to show which hook controls which system.

Test Focus:

- App boots, scene loads, HUD visible, navigation works, moon focus/exit works.

### Phase 1 — Relocate Component (Low Risk)

- Move ResumeSpace3D.tsx into src/components/cosmos.
- Update imports in App.tsx and any other references.
- Keep file content unchanged aside from import path updates.
- Keep exported component name stable to avoid downstream changes.

Test Focus:

- Build succeeds, scene renders, no runtime errors.

### Phase 2 — Extract Options & Logging (Low Risk)

- Extract options syncing and display (console logs, mission logs) into a hook (e.g., useCosmosLogs, useCosmosOptions).
- Keep external behavior unchanged.
- Ensure these hooks are pure React state + refs (no scene mutation inside).

Test Focus:

- Options panel still updates lights/bloom/orbits.
- Logs still render and copy/clear works.

### Phase 3 — Extract Input Handling (Medium Risk)

- Extract keyboard and pointer handlers into hooks:
  - useKeyboardControls
  - usePointerInteractions
- Keep event registration in hooks; return handlers as needed.
- Ensure event listeners are registered once and cleaned up on unmount.

Test Focus:

- Manual flight input works.
- Click/hover interactions still function.
- Moon focus/exit behavior unaffected.

### Phase 4 — Extract Scene Setup & Cleanup (Medium Risk)

- Move Three.js scene creation (scene, camera, renderer, post-processing, label renderer, lights) into useThreeScene.
- Ensure cleanup remains robust.
- Centralize all Three.js disposal in a single teardown path.

Test Focus:

- Scene still renders correctly.
- Resize handling works.
- No renderer duplication or console warnings.

### Phase 5 — Extract Orbit + Moon Focus System (Medium Risk)

- Encapsulate orbit data structure + update loop into useOrbitSystem.
- Encapsulate moon focus/exit into a small “focus controller” module.
- Keep orbit rules in a single place (no scattered orbit writes).

Test Focus:

- Orbits, moon focus/exit, and orbit ellipses still behave as before.

### Phase 6 — Extract Navigation System (Higher Risk)

- Move autopilot navigation, target tracking, and arrival handling into a useNavigationSystem hook that wraps SpaceshipNavigationSystem.
- Keep navigation side effects (freeze/resume orbit) inside the navigation hook.

Test Focus:

- Quick navigation, arrival, and overlays all work.
- Ship follow mode unchanged.

### Phase 7 — Extract Render Loop (Higher Risk)

- Centralize the animation loop in a single hook and inject dependencies (scene, camera, systems).
- Keep the loop minimal and deterministic.
- Gate loop start until all required systems are ready.

Test Focus:

- FPS stable, interactions smooth, no jitter or regressions.

## File/Module Targets

- src/components/cosmos/ResumeSpace3D.tsx (moved component)
- src/components/cosmos/hooks/
  - useThreeScene.ts
  - useOrbitSystem.ts
  - usePointerInteractions.ts
  - useKeyboardControls.ts
  - useNavigationSystem.ts
  - useCosmosOptions.ts
  - useCosmosLogs.ts
- src/components/cosmos/controllers/
  - MoonFocusController.ts
- src/components/cosmos/systems/
  - OrbitSystem.ts
  - NavigationSystem.ts
  - InteractionSystem.ts

## Test Checkpoints (Per Phase)

- App loads, no errors in console.
- Orbits visible and toggleable.
- Moon focus enters and exits correctly; orbit resumes correctly.
- Navigation to moon works.
- HUD toggles and overlay content works.
- No duplicate canvases or leaked event handlers after remount.

## Open Questions (for later confirmation)

- Preferred order of medium-risk phases (Orbit vs Navigation first).
- Whether to split HUD/UI rendering into a separate component.
- Whether to remove the global renderer singleton once useThreeScene is in place.

---

If this plan looks good, I will implement Phase 1 and wait for your test before continuing.
