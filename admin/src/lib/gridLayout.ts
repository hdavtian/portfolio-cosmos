// Syncfusion remembers each grid's layout - column widths, order, which columns
// are hidden, sorting, filters, page size - in localStorage under "grid" + id,
// via `enablePersistence`. Every grid therefore needs an id that is stable and
// unique across the admin.
//
// The trap: the saved state includes the columns as they were. Change a grid's
// columns and a stale layout can hide the new one or restore a width for a
// column that no longer exists, with no way out from inside the grid. So every
// grid offers a reset, and this is where the key is spelled once.

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
