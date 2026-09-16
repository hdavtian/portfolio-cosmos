import type { PortfolioCore } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { ColumnDirective } from "@syncfusion/ej2-react-grids";
import { DialogUtility } from "@syncfusion/ej2-popups";
import { useNavigate } from "react-router-dom";
import { EntityGrid } from "../components/EntityGrid";
import { ApiError } from "../lib/apiClient";
import { useAllEntities, useDeleteEntity, useReorderEntity, type EntityRecord } from "../lib/entityApi";

const ENTITY = "portfolioCores";
type Row = EntityRecord<PortfolioCore>;

export function PortfolioCoresPage() {
  const navigate = useNavigate();
  const list = useAllEntities<PortfolioCore>(ENTITY);
  const remove = useDeleteEntity(ENTITY);
  const reorder = useReorderEntity(ENTITY);

  const confirmDelete = (record: Row) => {
    DialogUtility.confirm({
      title: "Delete this core?",
      content: `"${record.name}" will be removed. Projects placed on it will fail validation until moved to another core.`,
      okButton: {
        text: "Delete",
        cssClass: "e-danger e-outline",
        click: () =>
          remove.mutate(record.slug, {
            onError: (error) =>
              DialogUtility.alert({
                title: "Could not delete",
                content: error instanceof ApiError ? error.message : "Unexpected error.",
              }),
          }),
      },
      cancelButton: { text: "Cancel", cssClass: "e-flat e-outline" },
      showCloseIcon: true,
      closeOnEscape: true,
    });
  };

  // Templates must tolerate partial objects: Syncfusion also invokes them with
  // non-row data and silently swallows a throw, which blanked the whole grid.
  const colorTemplate = (record: Row) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 16, height: 16, borderRadius: 4, background: record?.color, border: "1px solid #dfe3e8" }} />
      <code>{record?.color}</code>
    </span>
  );

  const layoutTemplate = (record: Row) => {
    const planes = record?.planes ?? [];
    const rings = planes.reduce((total, plane) => total + (plane?.rings?.length ?? 0), 0);
    return (
      <span className="admin-status">
        {planes.length} plane{planes.length === 1 ? "" : "s"} · {rings} rings
      </span>
    );
  };

  const actionsTemplate = (record: Row) => (
    <div style={{ display: "flex", gap: 6 }}>
      <ButtonComponent cssClass="e-small e-outline e-primary" onClick={() => navigate(`/portfolioCores/${record.slug}`)}>
        Edit
      </ButtonComponent>
      <ButtonComponent cssClass="e-small e-outline e-danger" onClick={() => confirmDelete(record)}>
        Delete
      </ButtonComponent>
    </div>
  );

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Cores</h1>
          <p>The centres projects orbit in the 3D portfolio, usually one per company. Use Reorder rows to change their order.</p>
        </div>
        <ButtonComponent cssClass="e-primary e-outline" onClick={() => navigate("/portfolioCores/new")}>
          Add core
        </ButtonComponent>
      </div>

      {list.isError ? <p className="admin-error">Could not load cores.</p> : null}

      <div className="admin-grid-wrap">
        <EntityGrid rows={list.items} mode="local" onReorder={(slugs) => reorder.mutate(slugs)}>
          {[
            <ColumnDirective key="name" field="name" headerText="Core" width={220} />,
            <ColumnDirective key="color" headerText="Color" width={160} template={colorTemplate} allowSorting={false} allowFiltering={false} allowGrouping={false} />,
            <ColumnDirective key="layout" headerText="Layout" width={180} template={layoutTemplate} allowSorting={false} allowFiltering={false} allowGrouping={false} />,
            <ColumnDirective key="actions" headerText="" width={150} template={actionsTemplate} allowSorting={false} allowFiltering={false} allowGrouping={false} />,
          ]}
        </EntityGrid>
      </div>
    </>
  );
}
