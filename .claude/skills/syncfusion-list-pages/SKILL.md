---
name: syncfusion-list-pages
description: "Create or update admin list/grid pages in scrolling-resume using the Syncfusion Data Grid. Use when asked for admin list pages, grid pages, entity tables, or paging/sorting/filtering/reordering changes in /admin."
argument-hint: "Target entity and required columns or actions"
user-invocable: true
---

# Admin List Pages With Syncfusion

Adapted from the Hydrodent project's proven rules. Applies to every grid under
`/admin`. Plan context: `docs/content-platform-plan.md` (section 6).

## Locked baseline

- React + TypeScript + Vite; admin route chunk is lazy-loaded so Syncfusion
  never ships to public visitors.
- Grid: Syncfusion Data Grid (`@syncfusion/ej2-react-grids`).
- License: registered once in `syncfusion-license.ts` from
  `VITE_SYNCFUSION_LICENSE_KEY` (Harma's own Community License, never Hydrodent's).
- Icons: Font Awesome Free (already in this repo).
- Data: TanStack Query hooks; requests use `credentials: "include"`.
- Types and validation rules come from `@hd/content-schema`.
- API errors use the envelope `{ error: { code, message, details[], requestId } }`;
  map `details[]` to field messages and `message` to the top-level alert.

## Mandatory grid behavior

Every admin grid provides:

- Pagination (default page size 25, options include 25; backend max 100).
- Sorting, filtering, toolbar search.
- Column chooser, grouping, column reordering.
- **Column resizing** — `allowResizing` on the component *and* `Resize` in
  `Inject`. The prop alone does nothing, and the omission only shows when a
  value is clipped.
- Row drag-and-drop reordering for entities with `sortOrder`, persisted through
  the entity's order endpoint.

Do not build custom filter/search widgets when Syncfusion provides one.

## Guardrails (lessons learned)

- Nothing may sit between `ColumnDirective` elements inside `ColumnsDirective`,
  not even a JSX comment. Syncfusion reads children positionally; an extra child
  blanks template cells and drops `visible={false}`. Put comments above the grid.
- Never render a grid inside a `<form>`: template cells render empty.
- Row actions use Syncfusion buttons with Syncfusion class tokens (`e-small`,
  `e-outline`, `e-flat`, `e-primary`), never project button classes.
- Add/edit overlays follow the `syncfusion-edit-dialogs` skill.
- No `window.confirm` / `window.alert`; use `DialogUtility`.
- If a behavior cannot be done natively in Syncfusion, stop and ask Harma before
  adding custom styling or logic.

## Backend alignment

- Sort/filter/search field names must match the API allowlist for the entity.
- `pageSize` never exceeds 100 (`MAX_PAGE_SIZE` in `@hd/content-schema`).

## Procedure

1. Import Syncfusion grid pieces in the page module.
2. Configure `GridComponent` with `allowPaging`, `allowSorting`,
   `allowFiltering`, `allowGrouping`, `allowReordering`, `allowResizing`,
   `showColumnChooser`, `toolbar={["Search", "ColumnChooser"]}`.
3. `Inject` services: `Page`, `Sort`, `Filter`, `Search`, `Toolbar`, `Group`,
   `Reorder`, `Resize`, `ColumnChooser` (+ `RowDD` when reorderable).
4. `pageSettings` default 25.
5. Columns via `ColumnDirective`; action cells via templates with Syncfusion buttons.
6. No inline CSS; keep layout responsive.

## Manual verification checklist

- Rows come from the real API (local Docker data).
- Paging, sorting, filtering, search work.
- Column chooser hides/shows columns; grouping works.
- Columns drag-reorder and edge-resize.
- Row drag reorder persists after reload (when applicable).
- Row action buttons look Syncfusion-native.
- No console errors.
- `npm run build` passes.
