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
