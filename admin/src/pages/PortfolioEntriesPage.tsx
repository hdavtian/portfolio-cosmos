import type { PortfolioCore, PortfolioEntry } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { ColumnDirective } from "@syncfusion/ej2-react-grids";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { EntityGrid } from "../components/EntityGrid";
import { useStatus } from "../lib/status";
import { confirmAction } from "../lib/confirm";
import {
  useAllEntities,
  useDeleteEntity,
  useReorderEntity,
  type EntityRecord,
} from "../lib/entityApi";
import { useMediaLookup } from "../lib/mediaLookup";

const ENTITY = "portfolioEntries";
type Row = EntityRecord<PortfolioEntry> & { coreName: string };

export function PortfolioEntriesPage() {
  const navigate = useNavigate();
  const list = useAllEntities<PortfolioEntry>(ENTITY);
  const cores = useAllEntities<PortfolioCore>("portfolioCores");
  const remove = useDeleteEntity(ENTITY);
  const reorder = useReorderEntity(ENTITY);
  const status = useStatus();
  const saveOrder = (slugs: string[]) =>
    reorder.mutate(slugs, {
      onSuccess: () =>
        status.success("Order saved. Publish to show it on the sites."),
      onError: (error) => status.error(error, "Could not save the order."),
    });
  const thumbs = useMediaLookup((list.items ?? []).map((item) => item.mediaId));

  // coreName is a real field so the grid can sort, filter and group by core.
  const rows = useMemo<Row[] | undefined>(() => {
    if (!list.items) return undefined;
    const names = new Map(
      (cores.items ?? []).map((core) => [core.slug, core.name]),
    );
    return list.items.map((item) => ({
      ...item,
      coreName: names.get(item.coreSlug) ?? item.coreSlug,
    }));
  }, [list.items, cores.items]);

  const confirmDelete = (record: Row) => {
    confirmAction({
      title: "Delete this project?",
      content: `"${record.title}", with its gallery and client sites, will be removed. Published sites keep showing it until the next publish.`,
      confirmText: "Delete",
      confirmClass: "e-danger e-outline",
      onConfirm: () =>
        remove.mutate(record.slug, {
          onSuccess: () =>
            status.success(
              `Deleted "${record.title}". Publish to remove it from the sites.`,
            ),
          onError: (error) => status.error(error, "Could not delete."),
        }),
    });
  };

  // Templates must tolerate partial objects: Syncfusion also invokes them with
  // non-row data and silently swallows a throw, which blanked every template cell.
  const previewTemplate = (record: Row) => {
    const thumb = record?.mediaId ? thumbs.byId.get(record.mediaId) : undefined;
    return thumb ? (
      <img
        src={thumb.url}
        alt={thumb.altText}
        loading="lazy"
        style={{
          width: 64,
          height: 44,
          objectFit: "cover",
          borderRadius: 4,
          display: "block",
        }}
      />
    ) : (
      <span className="admin-status">…</span>
    );
  };

  const detailTemplate = (record: Row) => {
    const variants = record?.clientVariants?.length ?? 0;
    return (
      <span className="admin-status">
        {record?.technologySlugs?.length ?? 0}{" "}
        tech · {record?.galleryMedia?.length ?? 0} images
        {variants > 0 ? ` · ${variants} client sites` : ""}
      </span>
    );
  };

  const actionsTemplate = (record: Row) => (
    <div style={{ display: "flex", gap: 6 }}>
      <ButtonComponent
        cssClass="e-small e-outline e-primary"
        onClick={() => navigate(`/portfolioEntries/${record.slug}`)}
      >
        Edit
      </ButtonComponent>
      <ButtonComponent
        cssClass="e-small e-outline e-danger"
        onClick={() => confirmDelete(record)}
      >
        Delete
      </ButtonComponent>
    </div>
  );

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Projects</h1>
          <p>
            Portfolio projects shown on both sites. Drag a column header to the
            bar above the grid to group.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonComponent
            cssClass="e-flat e-outline"
            onClick={() => navigate("/portfolioEntries/tagging")}
          >
            Tag technologies
          </ButtonComponent>
          <ButtonComponent
            cssClass="e-primary e-outline"
            onClick={() => navigate("/portfolioEntries/new")}
          >
            Add project
          </ButtonComponent>
        </div>
      </div>

      {list.isError ? (
        <p className="admin-error">Could not load projects.</p>
      ) : null}
      {list.truncated ? (
        <p className="admin-error">Showing the first 100 projects only.</p>
      ) : null}

      <div className="admin-grid-wrap">
        <EntityGrid
          gridId="portfolioEntries"
          rows={rows}
          mode="local"
          onReorder={saveOrder}
        >
          {[
            <ColumnDirective
              key="title"
              field="title"
              headerText="Project"
              width={240}
              clipMode="EllipsisWithTooltip"
            />,
            <ColumnDirective
              key="preview"
              headerText="Image"
              width={100}
              template={previewTemplate}
              allowSorting={false}
              allowFiltering={false}
              allowGrouping={false}
            />,
            <ColumnDirective
              key="coreName"
              field="coreName"
              headerText="Core"
              width={150}
            />,
            <ColumnDirective
              key="year"
              field="year"
              headerText="Year"
              width={90}
            />,
            <ColumnDirective
              key="detail"
              headerText="Contains"
              width={210}
              template={detailTemplate}
              allowSorting={false}
              allowFiltering={false}
              allowGrouping={false}
            />,
            <ColumnDirective
              key="actions"
              headerText=""
              width={150}
              template={actionsTemplate}
              allowSorting={false}
              allowFiltering={false}
              allowGrouping={false}
            />,
          ]}
        </EntityGrid>
      </div>
    </>
  );
}
