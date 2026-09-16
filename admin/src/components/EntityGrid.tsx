import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import {
  ColumnChooser,
  ColumnsDirective,
  Filter,
  GridComponent,
  Group,
  Inject,
  Page,
  Reorder,
  Resize,
  RowDD,
  Search,
  Sort,
  Toolbar,
} from "@syncfusion/ej2-react-grids";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { ListState } from "../lib/entityApi";

interface GridRow {
  slug?: string;
}

interface EntityGridProps<T extends GridRow> {
  /** ColumnDirective elements. Nothing else may sit between them. */
  children: ReactNode;
  rows: T[] | undefined;
  /**
   * `local`: every row is loaded and the grid pages, sorts, filters, searches
   * and groups them itself. Use it for lists that fit in one API page (≤100).
   * `server`: the API pages, sorts and searches; grouping and filtering are
   * hidden because the API cannot do them.
   */
  mode: "local" | "server";
  /** Server mode: total rows, plus the page, sort and search to request. */
  total?: number;
  state?: ListState;
  onStateChange?: (state: ListState) => void;
  /** Supplied when the entity is manually ordered; receives the full slug order. */
  onReorder?: (slugs: string[]) => void;
}

interface GridDataState {
  skip?: number;
  take?: number;
  sorted?: Array<{ name: string; direction: string }>;
  search?: Array<{ key: string }>;
}

const PAGE_SIZES = [10, 25, 50, 100];

// Syncfusion writes into the settings objects it is given (current page,
// grouped columns, filters). They must therefore be created per grid instance:
// shared module-level constants leaked one page's grouping and paging into the
// next grid (blank template cells on Projects, "No records" on Cores).
const createGridSettings = () => ({
  toolbar: ["Search", "ColumnChooser"],
  loading: { indicatorType: "Shimmer" as const },
  filterSettings: { type: "Menu" as const },
  groupSettings: { showDropArea: true, showGroupedColumn: true },
  localPageSettings: { pageSize: 25, pageSizes: [...PAGE_SIZES] },
});

const sameState = (a: ListState, b: ListState) =>
  a.page === b.page && a.pageSize === b.pageSize && a.sort === b.sort && a.search === b.search;

export function EntityGrid<T extends GridRow>({
  children,
  rows,
  mode,
  total,
  state,
  onStateChange,
  onReorder,
}: EntityGridProps<T>) {
  const gridRef = useRef<GridComponent>(null);
  const isServer = mode === "server";

  // Row drag-and-drop and grouping must never be active together: with both on,
  // grouping freezes the page (reproduced on Skills). Reordering is therefore a
  // separate mode, which also guarantees drags follow the saved order.
  const [reordering, setReordering] = useState(false);
  const [settings] = useState(createGridSettings);

  // Everything handed to Syncfusion is memoised: a new object on every render
  // makes the grid refresh, which in server mode fires dataStateChange.
  const dataSource = useMemo(
    () => (isServer ? { result: rows ?? [], count: total ?? 0 } : (rows ?? [])),
    [isServer, rows, total],
  );

  const pageSize = state?.pageSize ?? 25;
  const currentPage = state?.page ?? 1;
  const pageSettings = useMemo(
    () =>
      isServer ? { pageSize, pageSizes: [...PAGE_SIZES], currentPage } : settings.localPageSettings,
    [isServer, pageSize, currentPage, settings],
  );

  const handleDataStateChange = (args: GridDataState) => {
    if (!isServer || !state || !onStateChange) return;

    const take = args.take ?? state.pageSize;
    const skip = args.skip ?? 0;
    const sort = args.sorted?.[0];
    const next: ListState = {
      page: Math.floor(skip / take) + 1,
      pageSize: take,
      sort: sort ? `${sort.direction === "descending" ? "-" : ""}${sort.name}` : undefined,
      search: args.search?.[0]?.key || undefined,
    };

    // Only a real change reaches React state, so a refresh can never loop.
    if (!sameState(next, state)) onStateChange(next);
  };

  const startReordering = () => {
    const grid = gridRef.current;
    if (grid) {
      grid.clearGrouping();
      grid.clearSorting();
      grid.clearFiltering();
      grid.search("");
    }
    setReordering(true);
  };

  // Drop indices are positions within the visible page. That page's slugs are
  // reordered, then spliced back into the full list, which is in saved order.
  const handleRowDrop = (args: { fromIndex?: number; dropIndex?: number }) => {
    const grid = gridRef.current;
    if (!onReorder || !rows || !grid || args.fromIndex === undefined || args.dropIndex === undefined) return;

    const view = (grid.getCurrentViewRecords() as T[]).map((row) => row.slug ?? "");
    const reorderedView = [...view];
    const [moved] = reorderedView.splice(args.fromIndex, 1);
    reorderedView.splice(args.dropIndex, 0, moved);

    const all = rows.map((row) => row.slug ?? "");
    const start = all.indexOf(view[0]);
    if (start < 0) return;
    all.splice(start, view.length, ...reorderedView);
    onReorder(all);
  };

  return (
    <>
      {onReorder ? (
        <div className="admin-grid-mode">
          {reordering ? (
            <>
              <span className="admin-status">
                Drag rows by their handle to change the saved order. Each drop saves immediately.
              </span>
              <ButtonComponent cssClass="e-small e-primary e-outline" onClick={() => setReordering(false)}>
                Done reordering
              </ButtonComponent>
            </>
          ) : (
            <ButtonComponent cssClass="e-small e-flat e-outline" onClick={startReordering}>
              Reorder rows
            </ButtonComponent>
          )}
        </div>
      ) : null}

      {/* Keyed on the mode: Syncfusion only builds the drag-handle column when
          the grid is created, so toggling allowRowDragAndDrop on a live grid
          showed no handles. Remounting is cheap here (rows are already loaded). */}
      <GridComponent
        key={reordering ? "reorder" : "browse"}
        ref={gridRef}
        dataSource={dataSource}
        dataStateChange={isServer ? handleDataStateChange : undefined}
        rowDrop={reordering ? handleRowDrop : undefined}
        allowPaging
        allowSorting={!reordering}
        allowFiltering={!isServer && !reordering}
        allowGrouping={!isServer && !reordering}
        groupSettings={settings.groupSettings}
        allowReordering
        allowResizing
        allowRowDragAndDrop={reordering}
        showColumnChooser
        toolbar={settings.toolbar}
        filterSettings={settings.filterSettings}
        pageSettings={pageSettings}
        gridLines="Horizontal"
        enableHover
        loadingIndicator={settings.loading}
      >
        <ColumnsDirective>{children}</ColumnsDirective>
        <Inject services={[Page, Sort, Filter, Search, Toolbar, Group, Reorder, Resize, ColumnChooser, RowDD]} />
      </GridComponent>
    </>
  );
}
