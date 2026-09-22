import type { Experience } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { ColumnDirective } from "@syncfusion/ej2-react-grids";
import { useNavigate } from "react-router-dom";
import { EntityGrid } from "../components/EntityGrid";
import { useStatus } from "../lib/status";
import { ApiError } from "../lib/apiClient";
import { confirmAction } from "../lib/confirm";
import {
  useAllEntities,
  useDeleteEntity,
  useReorderEntity,
  type EntityRecord,
} from "../lib/entityApi";

const ENTITY = "experiences";

export function ExperiencesPage() {
  const navigate = useNavigate();
  const list = useAllEntities<Experience>(ENTITY);
  const remove = useDeleteEntity(ENTITY);
  const reorder = useReorderEntity(ENTITY);
  const status = useStatus();
  const saveOrder = (slugs: string[]) =>
    reorder.mutate(slugs, {
      onSuccess: () => status.success("Order saved. Publish to show it on the sites."),
      onError: (error) => status.error(error, "Could not save the order."),
    });

  const confirmDelete = (record: EntityRecord<Experience>) => {
    confirmAction({
      title: "Delete this job?",
      content: `"${record.company}" and everything inside it (positions, projects, memories) will be removed. This cannot be undone.`,
      confirmText: "Delete",
      confirmClass: "e-danger e-outline",
      onConfirm: () =>
        remove.mutate(record.slug, {
          onSuccess: () => status.success(`Deleted "${record.company}". Publish to remove it from the sites.`),
          onError: (error) => status.error(error, "Could not delete."),
        }),
    });
  };

  const actionsTemplate = (record: EntityRecord<Experience>) => (
    <div style={{ display: "flex", gap: 6 }}>
      <ButtonComponent
        cssClass="e-small e-outline e-primary"
        onClick={() => navigate(`/experiences/${record.slug}`)}
      >
        Edit
      </ButtonComponent>
      <ButtonComponent cssClass="e-small e-outline e-danger" onClick={() => confirmDelete(record)}>
        Delete
      </ButtonComponent>
    </div>
  );

  const datesTemplate = (record: EntityRecord<Experience>) => (
    <span>
      {record.startDate} – {record.endDate ?? "Present"}
    </span>
  );

  const countsTemplate = (record: EntityRecord<Experience>) => (
    <span className="admin-status">
      {record.positions?.length ?? 0} roles · {record.projects?.length ?? 0} projects ·{" "}
      {record.jobMemories?.length ?? 0} memories
    </span>
  );

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Experience</h1>
          <p>Jobs shown on the resume and as moons in the cosmos. Use Reorder rows to change their order.</p>
        </div>
        <ButtonComponent cssClass="e-primary e-outline" onClick={() => navigate("/experiences/new")}>
          Add job
        </ButtonComponent>
      </div>

      {list.isError ? (
        <p className="admin-error">
          {list.error instanceof ApiError ? list.error.message : "Could not load experience."}
        </p>
      ) : null}
      {list.truncated ? <p className="admin-error">Showing the first 100 records only.</p> : null}

      <div className="admin-grid-wrap">
        <EntityGrid rows={list.items} mode="local" onReorder={saveOrder}>
          {[
            <ColumnDirective key="company" field="company" headerText="Company" width="220" clipMode="EllipsisWithTooltip" />,
            <ColumnDirective key="navLabel" field="navLabel" headerText="Short name" width="130" />,
            <ColumnDirective key="location" field="location" headerText="Location" width="150" />,
            <ColumnDirective key="dates" headerText="Dates" width="150" template={datesTemplate} allowSorting={false} allowFiltering={false} allowGrouping={false} />,
            <ColumnDirective key="counts" headerText="Contains" width="230" template={countsTemplate} allowSorting={false} allowFiltering={false} allowGrouping={false} />,
            <ColumnDirective key="updatedAt" field="updatedAt" headerText="Updated" width="140" type="date" format="yMd" />,
            <ColumnDirective key="actions" headerText="" width="150" template={actionsTemplate} allowSorting={false} allowFiltering={false} allowGrouping={false} />,
          ]}
        </EntityGrid>
      </div>
    </>
  );
}
