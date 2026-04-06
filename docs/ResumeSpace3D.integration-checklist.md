# ResumeSpace3D Integration Checklist

Use this after any refactor phase to confirm runtime behavior.

## Boot & Scene

- [ ] App boots without console errors.
- [ ] Scene renders (stars, sun, planets, moons).
- [ ] HUD is visible and responsive.
- [ ] Orbits toggle on/off from options.

## Input & Camera

- [ ] OrbitControls drag/zoom works.
- [ ] Manual flight toggle works.
- [ ] Manual flight controls respond (arrows/Q/E/Z/C/Shift).

## Navigation

- [ ] Autopilot navigation to a section works.
- [ ] Autopilot navigation to a moon works.
- [ ] Arrival triggers right-pane content.
- [ ] Follow ship mode behaves in exterior + interior views.

## Moon Focus

- [ ] Enter moon focus from click/arrival.
- [ ] Exit focus restores orbit speed/state.
- [ ] Overlays show and clear correctly.

## Rendering & Cleanup

- [ ] Bloom/labels render as expected.
- [ ] No duplicate canvases after remount.
- [ ] No leaked listeners after unmount.

## About Journey Path Travel (Debug-Gated)

Preconditions:

- Run with `?debug=true`.
- Open the new `ABOUT PARTICLE DEBUG` panel.

Phase flow checks:

- [ ] Trigger About journey and observe phase progression:
      `TRANSIT -> FLY_THROUGH -> EXCITEMENT -> PATH_FORMING -> PATH_READY`.
- [ ] Confirm `PATH_FORMING` shows active particle streaming and increasing path visibility.
- [ ] Confirm phase reaches `PATH_READY` and holds (no immediate auto-dispersal).
- [ ] Navigate away with Falcon and confirm phase changes through
      `PATH_TRAVEL -> PATH_DISPERSING -> IDLE`.

Pulse profile checks (while path is held in ready/travel):

- [ ] Confirm debug panel shows `pulse profile` populated (not `-`).
- [ ] Confirm profile rotates over time between all three styles:
      `Majestic Wave`, `Conduit Surge`, `Subtle Glow`.
- [ ] Confirm `profile switch in` countdown decreases and resets on each switch.

Density checks:

- [ ] Confirm path appears denser than prior baseline during `PATH_FORMING`.
- [ ] Confirm held path remains visually dense in `PATH_READY`/`PATH_TRAVEL`.

Regression checks:

- [ ] Intro completion still reveals navigation UI.
- [ ] Journey exit still restores normal navigation/camera behavior.
