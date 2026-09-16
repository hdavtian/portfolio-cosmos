import type { Experience } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { ColumnDirective } from "@syncfusion/ej2-react-grids";
import { DialogUtility } from "@syncfusion/ej2-popups";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EntityGrid } from "../components/EntityGrid";
import { ApiError } from "../lib/apiClient";
import {
  DEFAULT_LIST_STATE,
  useDeleteEntity,
  useEntityList,
  useReorderEntity,
  type EntityRecord,
  type ListState,
} from "../lib/entityApi";

const ENTITY = "experiences";

export function ExperiencesPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<ListState>(DEFAULT_LIST_STATE);
  const list = useEntityList<Experience>(ENTITY, state);
  const remove = useDeleteEntity(ENTITY);
  const reorder = useReorderEntity(ENTITY);

  const confirmDelete = (record: EntityRecord<Experience>) => {
    DialogUtility.confirm({
      title: "Delete this job?",
      content: `"${record.company}" and everything inside it (positions, projects, memories) will be removed. This cannot be undone.`,
      okButton: {
        text: "Delete",
        cssClass: "e-danger e-outline",
        click: () => {
          remove.mutate(record.slug, {
            onError: (error) =>
              DialogUtility.alert({
                title: "Could not delete",
                content: error instanceof ApiError ? error.message : "Unexpected error.",
              }),
          });
        },
      },
      cancelButton: { text: "Cancel", cssClass: "e-flat e-outline" },
      showCloseIcon: true,
      closeOnEscape: true,
    });
  };

  // Comments must not sit between ColumnDirective elements: Syncfusion reads
  // those children positionally.
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
      {record.startDate} – {record.endDate}
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
          <p>Jobs shown on the resume and as moons in the cosmos. Drag rows to reorder.</p>
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

      <div className="admin-grid-wrap">
        <EntityGrid
          page={list.data}
          state={state}
          onStateChange={setState}
          isLoading={list.isLoading}
          onReorder={(slugs) => reorder.mutate(slugs)}
        >
          <ColumnDirective field="company" headerText="Company" width="220" clipMode="EllipsisWithTooltip" />
          <ColumnDirective field="navLabel" headerText="Short name" width="130" />
          <ColumnDirective field="location" headerText="Location" width="150" />
          <ColumnDirective headerText="Dates" width="150" template={datesTemplate} allowSorting={false} />
          <ColumnDirective headerText="Contains" width="230" template={countsTemplate} allowSorting={false} />
          <ColumnDirective field="updatedAt" headerText="Updated" width="140" type="date" format="yMd" />
          <ColumnDirective headerText="" width="150" template={actionsTemplate} allowSorting={false} allowFiltering={false} />
        </EntityGrid>
      </div>
    </>
  );
}
