---
name: syncfusion-edit-dialogs
description: "Create or update admin add/edit dialogs in scrolling-resume using Syncfusion-native dialog, controls, validation and confirm/alert. Use for any create/edit/delete overlay in /admin."
argument-hint: "Target entity and fields for the create/edit dialog"
user-invocable: true
---

# Admin Add/Edit Dialogs With Syncfusion

Adapted from the Hydrodent project's proven rules. Plan context:
`docs/content-platform-plan.md` (sections 3 and 6).

## Locked baseline

- Modal: Syncfusion `DialogComponent`.
- Controls: Syncfusion React inputs (`TextBoxComponent`, `NumericTextBoxComponent`,
  `DropDownListComponent`, `MultiSelectComponent`, `ColorPickerComponent`,
  `DatePickerComponent`, `RichTextEditorComponent`, `UploaderComponent`, `CheckBoxComponent`).
- Validation: Syncfusion `FormValidator`, with rules derived from the entity's
  schema in `@hd/content-schema` so they match the API.
- Confirm/alert: `DialogUtility.confirm` / `DialogUtility.alert`.

## Rules

1. The modal container is `DialogComponent`.
2. Footer actions are declared through `DialogComponent.buttons` with Syncfusion
   button models; no plain `<button>` in the action area.
3. Every Syncfusion button includes `e-outline` alongside its variant
   (`e-primary e-outline`, `e-flat e-outline`, `e-danger e-outline`).
4. No project button classes on dialog actions.
5. All fields use Syncfusion controls.
6. Validation is `FormValidator` rules only, default placement; no custom
   field-error state maps. Server `details[]` errors from the API are shown
   through the same validator.
7. Destructive actions confirm with `DialogUtility.confirm`; blocking errors use
   `DialogUtility.alert`. Never `window.confirm` / `window.alert`.
8. Desktop: label and field on the same row; mobile: stacked.
9. Tabs: **Content** (what the site shows) and **Appearance** (typed
   presentation fields: numeric ranges, color pickers, enum dropdowns). Never a
   raw JSON text field.
10. References to other entities or media use dropdowns / multi-selects / the
    media picker, never typed ids or paths.
11. Save sends the record's `version`; a `409` conflict shows
    `DialogUtility.alert` explaining the record changed and offers reload.

## Close/cancel

- Cancel closes through the Syncfusion dialog lifecycle (button click → dialog
  instance `hide()`), keeping React open state in sync.
- Unsaved-change protection uses dialog hooks + `DialogUtility.confirm` only.

## Procedure

1. Define the `DialogComponent` and its `buttons`.
2. Build fields from Syncfusion controls; Content / Appearance tabs.
3. Initialize `FormValidator` with rules from the schema.
4. Save handler: `validate()` → mutation (TanStack Query) → invalidate list query.
5. Delete: `DialogUtility.confirm` → mutation.

## Manual verification checklist

- Add opens with empty values; Edit opens populated.
- Cancel always closes.
- Invalid input is blocked client-side; server validation errors appear on fields.
- Save and delete complete and the grid refreshes.
- Concurrent edit produces the conflict alert.
- Every button includes `e-outline`.
- Desktop rows are horizontal; mobile stacks.
- No console errors; `npm run build` passes.
