// Syncfusion remembers a grid's layout - column widths and order, hidden
// columns, sorting, filters, page size - in localStorage under "grid" + id,
// through `enablePersistence`. Every grid therefore needs an id that is stable
// and unique across the admin.
//
// The saved state includes the columns as they were, so changing a grid's
// columns can leave a layout that no longer matches, with no way out from
// inside the grid. Every persisted grid offers a reset, and this is where the
// key is spelled once.

/** The localStorage key Syncfusion uses for a grid. */
export const gridStateKey = (gridId: string) => `grid${gridId}`;

/** Forgets a grid's remembered layout. The caller reloads to rebuild it. */
export function resetGridLayout(gridId: string): void {
  try {
    window.localStorage.removeItem(gridStateKey(gridId));
  } catch {
    // Private windows and blocked storage: there was nothing to forget.
  }
}
