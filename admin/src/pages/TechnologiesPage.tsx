import type { Technology } from "@hd/content-schema";
import { ButtonComponent, CheckBoxComponent } from "@syncfusion/ej2-react-buttons";
import {
  ColumnChooser,
  ColumnDirective,
  ColumnsDirective,
  Filter,
  Inject,
  Sort,
  Reorder,
  Resize,
  RowDD,
  Selection,
  Toolbar,
  TreeGridComponent,
} from "@syncfusion/ej2-react-treegrid";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/apiClient";
import { confirmAction } from "../lib/confirm";
import { useAllEntities, withoutMeta, type EntityRecord } from "../lib/entityApi";
import { useStatus } from "../lib/status";

const GRID_ID = "technologies";
const ENTITY = "technologies";
type NodeRecord = EntityRecord<Technology>;

// TreeGrid rows: self-referencing by slug. Top-level nodes need a null parent.
// The extra columns are the curation state, so a pass over the tree can be read
// rather than opened row by row.
// The record stores `surfaces` as one array; here it is split into a boolean
// per surface so each is its own checkbox column, filterable on its own, and
// reads the same way as the checkboxes on the edit form.
type TreeRow = {
  slug: string;
  name: string;
  parentId: string | null;
  childCount: number;
  kind: string;
  current: boolean;
  lattice: boolean;
  resume: boolean;
  film: boolean;
  filters: boolean;
  aliases: string;
};

// The tick columns, and the record field each one writes (D20/D27). They are
// live checkboxes: a click saves that one record straight away, the way a
// drop saves a move, so a curation pass is a run of clicks down a column
// rather than open, tick, save, back for every row.
type TickField = "current" | "lattice" | "resume" | "film" | "filters";
const TICKS: Array<{ field: TickField; headerText: string; width: number; surface?: Technology["surfaces"][number] }> = [
  { field: "current", headerText: "Current", width: 100 },
  { field: "lattice", headerText: "Lattice", width: 95, surface: "lattice" },
  { field: "resume", headerText: "Resume", width: 95, surface: "resume" },
  { field: "film", headerText: "Film", width: 85, surface: "filmProgress" },
  { field: "filters", headerText: "Filters", width: 90, surface: "filters" },
];

// Constants handed to Syncfusion, so re-renders never refresh the grid.
const TOOLBAR = ["Search", "ExpandAll", "CollapseAll", "ColumnChooser"];
const SEARCH_SETTINGS = { fields: ["name", "slug", "aliases"] };
const SELECTION = { type: "Single" as const };
// Excel-style filter menus: a checkbox column filters to ticked or unticked.
const FILTER_SETTINGS = { type: "Excel" as const };
// Sorting, search, filtering, resizing, the column chooser and column
// reordering all work here - measured in a visible tab. (A background tab
// never repaints a TreeGrid, which once made all of them look broken.)

interface DropArgs {
  data?: TreeRow[];
  dropIndex?: number;
  dropPosition?: string;
  cancel?: boolean;
}

/**
 * Where a dragged node ends up: its new parent and its place among that
 * parent's children, then the whole tree flattened depth-first, which is the
 * saved sortOrder (siblings keep their relative order).
 */
function planMove(
  items: NodeRecord[],
  draggedSlug: string,
  targetSlug: string,
  position: "before" | "after" | "inside",
): { parentSlug: string; order: string[] } | { error: string } {
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const target = bySlug.get(targetSlug);
  if (!target || !bySlug.has(draggedSlug)) return { error: "That node no longer exists. Reload and try again." };

  // Refuse dropping a node into itself or anything beneath it.
  for (let current: NodeRecord | undefined = target; current; current = bySlug.get(current.parentSlug)) {
    if (current.slug === draggedSlug) return { error: "A technology cannot be moved inside itself." };
    if (!current.parentSlug) break;
  }

  const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const children = new Map<string, string[]>();
  for (const item of ordered) {
    if (item.slug === draggedSlug) continue;
    const list = children.get(item.parentSlug) ?? [];
    list.push(item.slug);
    children.set(item.parentSlug, list);
  }

  const parentSlug = position === "inside" ? target.slug : target.parentSlug;
  const siblings = children.get(parentSlug) ?? [];
  const at = position === "inside" ? siblings.length : siblings.indexOf(target.slug) + (position === "after" ? 1 : 0);
  siblings.splice(at, 0, draggedSlug);
  children.set(parentSlug, siblings);

  const order: string[] = [];
  const walk = (parent: string) => {
    for (const slug of children.get(parent) ?? []) {
      order.push(slug);
      walk(slug);
    }
  };
  walk("");
  return { parentSlug, order };
}

/** Tech stack as a tree: drag to reorder or re-parent; edits open the full-page editor. */
export function TechnologiesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useStatus();
  const list = useAllEntities<Technology>(ENTITY);
  const gridRef = useRef<TreeGridComponent>(null);
  const [saving, setSaving] = useState(false);

  const items = useMemo(() => (list.items ?? []) as NodeRecord[], [list.items]);
  const rows = useMemo<TreeRow[]>(
    () =>
      [...items]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          slug: item.slug,
          name: item.name,
          parentId: item.parentSlug || null,
          childCount: items.filter((other) => other.parentSlug === item.slug).length,
          kind: item.isGrouping ? "Heading" : "Skill",
          current: Boolean(item.current),
          lattice: (item.surfaces ?? []).includes("lattice"),
          resume: (item.surfaces ?? []).includes("resume"),
          film: (item.surfaces ?? []).includes("filmProgress"),
          filters: (item.surfaces ?? []).includes("filters"),
          aliases: (item.aliases ?? []).join(", "),
        })),
    [items],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: [ENTITY] });


  const handleDrop = (args: DropArgs) => {
    // The move is saved to the API and the tree re-renders from saved data, so
    // the grid's own in-memory move is cancelled.
    args.cancel = true;
    // A drop is a position in the visible view. Sorted, filtered or searched,
    // that view is not the saved order, so the move would land somewhere
    // nobody chose. Refuse and say what to clear.
    const grid = gridRef.current;
    const rearranged =
      (grid?.sortSettings?.columns?.length ?? 0) > 0 ||
      (grid?.filterSettings?.columns?.length ?? 0) > 0 ||
      Boolean(grid?.searchSettings?.key);
    if (rearranged) {
      status.failure("Clear the sorting, filter or search before dragging: the tree must be in its saved order.");
      return;
    }
    const dragged = args.data?.[0];
    const target = gridRef.current?.getCurrentViewRecords()[args.dropIndex ?? -1] as TreeRow | undefined;
    if (!dragged || !target || dragged.slug === target.slug || saving) return;

    const position =
      args.dropPosition === "middleSegment" ? "inside" : args.dropPosition === "topSegment" ? "before" : "after";
    const plan = planMove(items, dragged.slug, target.slug, position);
    if ("error" in plan) {
      status.failure(plan.error);
      return;
    }

    const record = items.find((item) => item.slug === dragged.slug)!;
    setSaving(true);
    void (async () => {
      try {
        if (record.parentSlug !== plan.parentSlug) {
          await api.put(`/api/v2/admin/${ENTITY}/${record.slug}`, {
            ...withoutMeta(record),
            parentSlug: plan.parentSlug,
            version: record.version,
          });
        }
        await api.put(`/api/v2/admin/${ENTITY}/order`, { slugs: plan.order });
        const parentName = items.find((item) => item.slug === plan.parentSlug)?.name;
        status.success(
          `Moved "${record.name}" ${parentName ? `under "${parentName}"` : "to the top level"}. Publish to show it on the sites.`,
        );
      } catch (error) {
        status.error(error, "Could not move it.");
      } finally {
        setSaving(false);
        void refresh();
      }
    })();
  };

  const confirmDelete = (selectedRecord: NodeRecord) => {
    // Nothing in use is deleted; it is merged instead (D25). Children are the
    // part admin can see on its own - uses and tags are counted by the API.
    const childCount = items.filter((item) => item.parentSlug === selectedRecord.slug).length;
    if (childCount > 0) {
      status.failure(
        `"${selectedRecord.name}" has ${childCount} entr${childCount === 1 ? "y" : "ies"} under it. Move or delete those first.`,
      );
      return;
    }
    confirmAction({
      title: "Delete this technology?",
      content: `"${selectedRecord.name}" will be removed. Any job or project still pointing at it will lose that link, and published sites keep showing it until the next publish.`,
      confirmText: "Delete",
      confirmClass: "e-danger e-outline",
      onConfirm: () => {
        void api
          .delete(`/api/v2/admin/${ENTITY}/${selectedRecord.slug}`)
          .then(() => {
            status.success(`Deleted "${selectedRecord.name}". Publish to remove it from the sites.`);
          })
          .catch((error: unknown) => status.error(error, "Could not delete."))
          .finally(() => void refresh());
      },
    });
  };

  /**
   * Row actions belong in the row: a long tree makes "select, then scroll back
   * to the top" a poor way to reach Edit.
   */
  // One record, one field, one PUT. The list in the query cache is updated
  // first so the box shows its new state at once; the version travels with
  // the body, so a row changed elsewhere since it loaded is refused (409)
  // rather than overwritten, and the list is refetched either way.
  const [ticking, setTicking] = useState<Set<string>>(() => new Set());
  const saveTick = (slug: string, tick: (typeof TICKS)[number], checked: boolean) => {
    const record = items.find((item) => item.slug === slug);
    if (!record) return;
    const key = `${slug}:${tick.field}`;
    const surfaces = record.surfaces ?? [];
    const content: Technology = tick.surface
      ? {
          ...withoutMeta(record),
          surfaces: checked ? [...surfaces, tick.surface] : surfaces.filter((surface) => surface !== tick.surface),
        }
      : { ...withoutMeta(record), current: checked };
    setTicking((prev) => new Set(prev).add(key));
    queryClient.setQueryData<NodeRecord[]>([ENTITY, "all"], (previous) =>
      previous?.map((item) => (item.slug === slug ? { ...item, ...content } : item)),
    );
    void (async () => {
      try {
        await api.put(`/api/v2/admin/${ENTITY}/${slug}`, { ...content, version: record.version });
        status.success(`${checked ? "Ticked" : "Unticked"} ${tick.headerText} for "${record.name}". Publish to show it on the sites.`);
      } catch (error) {
        status.error(error, `Could not save ${tick.headerText} for "${record.name}".`);
      } finally {
        setTicking((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        void refresh();
      }
    })();
  };

  // The templates are created once. A new template function on every render
  // makes the grid rebuild all its cells (five checkboxes a row), which
  // re-renders React, which makes new templates: the page froze on the first
  // tick. They read the current state and handlers through a ref instead.
  const latest = useRef({ ticking, saveTick, items, confirmDelete });
  latest.current = { ticking, saveTick, items, confirmDelete };
  const tickTemplates = useMemo(
    () =>
      TICKS.map((tick) => (row: TreeRow) => (
        <CheckBoxComponent
          checked={row[tick.field]}
          disabled={latest.current.ticking.has(`${row.slug}:${tick.field}`)}
          change={(event: { checked: boolean; event?: Event }) => {
            // Only a click or key press saves; the control also raises change
            // when the grid re-renders it with a new value.
            if (event.event) latest.current.saveTick(row.slug, tick, event.checked);
          }}
        />
      )),
    [],
  );

  const actionsTemplate = useMemo(
    () => (row: TreeRow) => {
      const record = latest.current.items.find((item) => item.slug === row.slug);
      if (!record) return <span />;
      return (
        <div style={{ display: "flex", gap: 6 }}>
          <ButtonComponent
            cssClass="e-small e-primary e-outline"
            onClick={() => navigate(`/${ENTITY}/new?parentSlug=${encodeURIComponent(record.slug)}`)}
          >
            Add child
          </ButtonComponent>
          <ButtonComponent cssClass="e-small e-flat e-outline" onClick={() => navigate(`/${ENTITY}/${record.slug}`)}>
            Edit
          </ButtonComponent>
          <ButtonComponent cssClass="e-small e-danger e-outline" onClick={() => latest.current.confirmDelete(record)}>
            Delete
          </ButtonComponent>
        </div>
      );
    },
    [navigate],
  );

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Technologies</h1>
          <p>
            The one list of technologies. A job&apos;s skills and a project&apos;s tags point at an entry here, so a
            name is typed once and corrected once. <strong>Headings</strong> organise the tree and are not skills
            anyone claims; <strong>Shown in</strong> is where an entry may appear. Drag a row onto another to nest it, or above or below a row to
            reorder; each drop saves immediately, and so does each tick in the Current and Shown in columns.
          </p>
        </div>
        <ButtonComponent cssClass="e-primary e-outline" onClick={() => navigate(`/${ENTITY}/new`)}>
          Add heading
        </ButtonComponent>
      </div>

      {list.isError ? (
        <p className="admin-error">
          {list.error instanceof ApiError ? list.error.message : "Could not load the technologies."}
        </p>
      ) : null}
      {list.truncated ? <p className="admin-error">Showing the first 100 technologies only.</p> : null}

      <p className="admin-status">
        {saving ? "Saving…" : "Drag a row onto another to nest it, or above or below a row to reorder."}
      </p>

      {list.isLoading ? <p className="admin-status">Loading…</p> : null}
      {list.items ? (
        <div className="admin-grid-wrap">
          <TreeGridComponent
            ref={gridRef}
            dataSource={rows}
            idMapping="slug"
            parentIdMapping="parentId"
            treeColumnIndex={0}
            id={GRID_ID}
            allowRowDragAndDrop
            rowHeight={44}
            allowResizing
            allowSorting
            allowFiltering
            allowReordering
            showColumnChooser
            selectionSettings={SELECTION}
            toolbar={TOOLBAR}
            searchSettings={SEARCH_SETTINGS}
            filterSettings={FILTER_SETTINGS}
            gridLines="Horizontal"
            rowDrop={handleDrop}
            recordDoubleClick={(args: { rowData?: TreeRow }) =>
              args.rowData && navigate(`/${ENTITY}/${args.rowData.slug}`)
            }
          >
            <ColumnsDirective>
              <ColumnDirective field="name" headerText="Name" width={300} />
              <ColumnDirective field="kind" headerText="Kind" width={100} />
              <ColumnDirective field="current" headerText="Current" width={100} type="boolean" textAlign="Center" template={tickTemplates[0]} />
              <ColumnDirective field="lattice" headerText="Lattice" width={95} type="boolean" textAlign="Center" template={tickTemplates[1]} />
              <ColumnDirective field="resume" headerText="Resume" width={95} type="boolean" textAlign="Center" template={tickTemplates[2]} />
              <ColumnDirective field="film" headerText="Film" width={85} type="boolean" textAlign="Center" template={tickTemplates[3]} />
              <ColumnDirective field="filters" headerText="Filters" width={90} type="boolean" textAlign="Center" template={tickTemplates[4]} />
              <ColumnDirective field="aliases" headerText="Also known as" width={280} />
              <ColumnDirective field="slug" headerText="Slug" width={200} isPrimaryKey />
              <ColumnDirective field="childCount" headerText="Children" width={100} textAlign="Right" />
              <ColumnDirective headerText="Actions" width={260} template={actionsTemplate} />
            </ColumnsDirective>
            <Inject services={[RowDD, Selection, Toolbar, Resize, Reorder, ColumnChooser, Filter, Sort]} />
          </TreeGridComponent>
        </div>
      ) : null}
    </>
  );
}
