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
- Row drag-and-drop reordering for entities with `sortOrder`, always enabled,
  persisted through the entity's order endpoint (see "Reordering is always on").

Do not build custom filter/search widgets when Syncfusion provides one.

## Where actions go

**Row actions live in the row.** Every action that operates on one record
(edit, delete, add child, roll back to this one) is a button in an actions
column on that row, never a button at the top of the page that acts on the
selected row. A list can be long: selecting a row near the bottom and then
scrolling back to the top to press a button is the failure this rule prevents.

**Only genuinely global actions sit above the grid**, and only when they need
no row: "Add", "Publish", a filter that applies to the whole list.

This applies to `TreeGridComponent` as much as `GridComponent`: a tree still
gets an actions column, and selection stays for dragging, not for acting.

## Reordering is always on

Row dragging is enabled on every grid that has a `sortOrder`. There is no
"Reorder rows" mode to unlock first: the handle is always there.

A drop index is a position in the *visible* view, so only a view in saved order
can be translated back into `sortOrder`. When the grid is sorted, grouped,
filtered or searched, the drop is cancelled and the status line says which of
those to clear. Refusing is the point - the alternative is saving an order
nobody asked for, silently.

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
