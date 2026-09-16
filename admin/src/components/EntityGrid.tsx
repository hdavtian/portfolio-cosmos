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
  type RowDropSettingsModel,
} from "@syncfusion/ej2-react-grids";
import type { ReactNode } from "react";
import type { ListState, PagedResult } from "../lib/entityApi";

interface EntityGridProps<T> {
  /** ColumnDirective elements. Nothing else may sit between them. */
  children: ReactNode;
  page: PagedResult<T> | undefined;
  state: ListState;
  onStateChange: (state: ListState) => void;
  /** Supplied when the entity is manually ordered (drag to reorder). */
  onReorder?: (slugs: string[]) => void;
  isLoading?: boolean;
}

interface GridDataState {
  skip?: number;
  take?: number;
  sorted?: Array<{ name: string; direction: string }>;
  search?: Array<{ key: string }>;
}

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Wraps the Syncfusion grid with custom (server-side) binding: the API owns
 * paging, sorting and search, so a grid never loads more than one page.
 */
export function EntityGrid<T>({
  children,
  page,
  state,
  onStateChange,
  onReorder,
  isLoading,
}: EntityGridProps<T>) {
  const rowDropSettings: RowDropSettingsModel = { targetID: undefined };

  const handleDataStateChange = (args: GridDataState) => {
    const take = args.take ?? state.pageSize;
    const skip = args.skip ?? 0;
    const sort = args.sorted?.[0];

    onStateChange({
      page: Math.floor(skip / take) + 1,
      pageSize: take,
      sort: sort ? `${sort.direction === "descending" ? "-" : ""}${sort.name}` : undefined,
      search: args.search?.[0]?.key || undefined,
    });
  };

  // Rows carry their slug order after a drag; persisting it is the page's job.
  const handleRowDrop = (args: { fromIndex?: number; dropIndex?: number }) => {
    if (!onReorder || !page || args.fromIndex === undefined || args.dropIndex === undefined) return;

    const slugs = page.items.map((item) => item.slug);
    const [moved] = slugs.splice(args.fromIndex, 1);
    slugs.splice(args.dropIndex, 0, moved);
    onReorder(slugs);
  };

  return (
    <GridComponent
      dataSource={page ? { result: page.items, count: page.total } : []}
      dataStateChange={handleDataStateChange}
      rowDrop={handleRowDrop}
      allowPaging
      allowSorting
      allowFiltering
      allowGrouping
      allowReordering
      allowResizing
      allowRowDragAndDrop={Boolean(onReorder)}
      rowDropSettings={rowDropSettings}
      showColumnChooser
      toolbar={["Search", "ColumnChooser"]}
      filterSettings={{ type: "Menu" }}
      pageSettings={{ pageSize: state.pageSize, pageSizes: PAGE_SIZES, currentPage: state.page }}
      gridLines="Horizontal"
      height="100%"
      enableHover
      loadingIndicator={{ indicatorType: "Shimmer" }}
      dataBound={undefined}
      emptyRecordTemplate={isLoading ? undefined : () => <div style={{ padding: 18 }}>No records yet.</div>}
    >
      <ColumnsDirective>{children}</ColumnsDirective>
      <Inject
        services={[Page, Sort, Filter, Search, Toolbar, Group, Reorder, Resize, ColumnChooser, RowDD]}
      />
    </GridComponent>
  );
}
