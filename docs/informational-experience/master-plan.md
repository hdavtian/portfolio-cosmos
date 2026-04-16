# Informational Experience Master Plan

## Purpose
- Deliver a fast, SEO-friendly, non-ThreeJS experience in phases.
- Keep cinematic ThreeJS flow isolated and unchanged.
- Maintain this file as a living status document for AI and human contributors.

## Guardrails
- Do not modify cinematic engine files in `src/components/cosmos/*` unless explicitly required and approved.
- `/cinematic` stays bound to existing `src/App.tsx` behavior.
- `/fast` consumes Node API content keys; cinematic keeps local JSON flow.
- Never merge this branch into `main` without explicit user consent at the final approval step.

## Active Branch
- `feature/informational-experience`

## Phase Status
- [x] Phase 0: Branch + guardrails + planning docs
- [x] Phase 1: Route split and navigation shell
- [x] Phase 2: Theme tokens, provider, persistence, and no-FOUC setup
- [x] Phase 3: Node API integration with TanStack Query and initial pages
- [x] Phase 4: Portfolio feature set (view modes, sort/filter, favorites, size slider, quick/detail views)
- [x] Phase 5: Hardening pass and doc updates

## Implemented Structure
- Routing and app shell: `src/app/*`
- Fast experience features: `src/features/fast/*`
- API and query integration: `src/lib/api/*`, `src/lib/query/*`
- Theme system: `src/theme/*`, `src/styles/themes/*`, `src/styles/tokens.base.css`

## Related Sub-Plans
- [Theme authoring guide](./theme-authoring.md)
- [Portfolio domain model](./portfolio-domain-model.md)
- [QA checklist](./qa-matrix.md)

## Iteration Notes
### Iteration 1
- Added route split: `/`, `/cinematic`, `/fast`.
- Added compact top nav and contextual left nav for fast mode.
- Added theme system with five initial themes and persistent selection.
- Added portfolio listing with filtering, sorting, favorites, card sizing, quick view, and detail route.
- Added text-forward resume page sourced from API.

### Iteration 2
- Added accessibility and interaction hardening in fast mode:
  - focus-visible styles for nav/buttons/inputs,
  - improved aria-pressed states,
  - quick-view escape handling and dialog focus behavior.
- Added persistent portfolio preferences:
  - view mode, sort mode, category, search text, and card size now persist in localStorage.
- Added API resilience:
  - query layer now supports fallback to local JSON content when API fetch fails.
- Added reusable empty-state component for no-results and unavailable-data scenarios.

## Verification Checklist
- [ ] `/cinematic` loads and preserves existing intro/ThreeJS path.
- [ ] `/fast` renders without importing/instantiating ThreeJS scene components at runtime.
- [ ] API-backed pages handle loading/error gracefully.
- [ ] Theme persistence survives page refresh.
- [ ] Favorites persist via localStorage.
- [ ] Portfolio filters/preferences persist after reload.
- [ ] Quick view supports keyboard close with `Escape` and has visible focus.
