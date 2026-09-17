import type { TechStackNode } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import {
  ColumnDirective,
  ColumnsDirective,
  Inject,
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

const ENTITY = "techStackNodes";
type NodeRecord = EntityRecord<TechStackNode>;

// TreeGrid rows: self-referencing by slug. Top-level nodes need a null parent.
type TreeRow = { slug: string; name: string; parentId: string | null; childCount: number };

// Constants handed to Syncfusion, so re-renders never refresh the grid.
const TOOLBAR = ["Search", "ExpandAll", "CollapseAll"];
const SELECTION = { type: "Single" as const };

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
    if (current.slug === draggedSlug) return { error: "A node cannot be moved inside itself." };
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
export function TechStackPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useStatus();
  const list = useAllEntities<TechStackNode>(ENTITY);
  const gridRef = useRef<TreeGridComponent>(null);
  const [selected, setSelected] = useState<string | null>(null);
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
        })),
    [items],
  );

  const selectedRecord = items.find((item) => item.slug === selected);
  const refresh = () => queryClient.invalidateQueries({ queryKey: [ENTITY] });

  const handleDrop = (args: DropArgs) => {
    // The move is saved to the API and the tree re-renders from saved data, so
    // the grid's own in-memory move is cancelled.
    args.cancel = true;
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
        status.error(error, "Could not move the node.");
      } finally {
        setSaving(false);
        void refresh();
      }
    })();
  };

  const confirmDelete = () => {
    if (!selectedRecord) return;
    const childCount = items.filter((item) => item.parentSlug === selectedRecord.slug).length;
    if (childCount > 0) {
      status.failure(
        `"${selectedRecord.name}" has ${childCount} child node${childCount === 1 ? "" : "s"}. Move or delete them first.`,
      );
      return;
    }
    confirmAction({
      title: "Delete this node?",
      content: `"${selectedRecord.name}" will be removed. Published sites keep showing it until the next publish.`,
      confirmText: "Delete",
      confirmClass: "e-danger e-outline",
      onConfirm: () => {
        void api
          .delete(`/api/v2/admin/${ENTITY}/${selectedRecord.slug}`)
          .then(() => {
            status.success(`Deleted "${selectedRecord.name}". Publish to remove it from the sites.`);
            setSelected(null);
          })
          .catch((error: unknown) => status.error(error, "Could not delete."))
          .finally(() => void refresh());
      },
    });
  };

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Tech stack</h1>
          <p>
            Nested tech stack for the portfolio site and the D3 skills graph, any depth (e.g. Frontend › Frameworks ›
            React). Separate from the resume&apos;s Skills, which stay one level deep. Drag a row onto another to nest
            it, or above or below a row to reorder; each drop saves immediately.
          </p>
        </div>
        <ButtonComponent cssClass="e-primary e-outline" onClick={() => navigate(`/${ENTITY}/new`)}>
          Add top-level node
        </ButtonComponent>
      </div>

      {list.isError ? (
        <p className="admin-error">
          {list.error instanceof ApiError ? list.error.message : "Could not load the tech stack."}
        </p>
      ) : null}
      {list.truncated ? <p className="admin-error">Showing the first 100 nodes only.</p> : null}

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
        <ButtonComponent
          cssClass="e-small e-primary e-outline"
          disabled={!selectedRecord}
          onClick={() => selectedRecord && navigate(`/${ENTITY}/new?parentSlug=${encodeURIComponent(selectedRecord.slug)}`)}
        >
          Add child
        </ButtonComponent>
        <ButtonComponent
          cssClass="e-small e-flat e-outline"
          disabled={!selectedRecord}
          onClick={() => selectedRecord && navigate(`/${ENTITY}/${selectedRecord.slug}`)}
        >
          Edit
        </ButtonComponent>
        <ButtonComponent cssClass="e-small e-danger e-outline" disabled={!selectedRecord} onClick={confirmDelete}>
          Delete
        </ButtonComponent>
        <span className="admin-status">
          {saving
            ? "Saving…"
            : selectedRecord
              ? `"${selectedRecord.name}" selected. Double-click a row to edit it.`
              : "Select a node, or double-click one to edit it."}
        </span>
      </div>

      {list.isLoading ? <p className="admin-status">Loading…</p> : null}
      {list.items ? (
        <div className="admin-grid-wrap">
          <TreeGridComponent
            ref={gridRef}
            dataSource={rows}
            idMapping="slug"
            parentIdMapping="parentId"
            treeColumnIndex={0}
            allowRowDragAndDrop
            selectionSettings={SELECTION}
            toolbar={TOOLBAR}
            gridLines="Horizontal"
            rowDrop={handleDrop}
            rowSelected={(args: { data?: TreeRow }) => setSelected(args.data?.slug ?? null)}
            rowDeselected={() => setSelected(null)}
            recordDoubleClick={(args: { rowData?: TreeRow }) =>
              args.rowData && navigate(`/${ENTITY}/${args.rowData.slug}`)
            }
          >
            <ColumnsDirective>
              <ColumnDirective field="name" headerText="Name" width={320} />
              <ColumnDirective field="slug" headerText="Slug" width={220} />
              <ColumnDirective field="childCount" headerText="Children" width={100} textAlign="Right" />
            </ColumnsDirective>
            <Inject services={[RowDD, Selection, Toolbar]} />
          </TreeGridComponent>
        </div>
      ) : null}
    </>
  );
}
