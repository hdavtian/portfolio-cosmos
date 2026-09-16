import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { ColumnDirective } from "@syncfusion/ej2-react-grids";
import { DialogUtility } from "@syncfusion/ej2-popups";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EntityGrid } from "../components/EntityGrid";
import type { EntityDefinition } from "../entities/definitions";
import { useReferenceOptions } from "../entities/references";
import { ApiError } from "../lib/apiClient";
import {
  DEFAULT_LIST_STATE,
  useDeleteEntity,
  useEntityList,
  useReorderEntity,
  type EntityRecord,
  type ListState,
} from "../lib/entityApi";

type Row = EntityRecord<Record<string, unknown>>;

/** Grid page for any entity described in entities/definitions.ts. */
export function EntityListPage({ definition }: { definition: EntityDefinition }) {
  const navigate = useNavigate();
  const [state, setState] = useState<ListState>(DEFAULT_LIST_STATE);
  const list = useEntityList<Record<string, unknown>>(definition.entity, state);
  const remove = useDeleteEntity(definition.entity);
  const reorder = useReorderEntity(definition.entity);
  const references = useReferenceOptions(definition);

  const confirmDelete = (record: Row) => {
    DialogUtility.confirm({
      title: `Delete this ${definition.singular}?`,
      content: `"${definition.describe(record) || record.slug}" will be removed. Published sites keep showing it until the next publish.`,
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

  const actionsTemplate = (record: Row) => (
    <div style={{ display: "flex", gap: 6 }}>
      <ButtonComponent
        cssClass="e-small e-outline e-primary"
        onClick={() => navigate(`/${definition.entity}/${record.slug}`)}
      >
        Edit
      </ButtonComponent>
      <ButtonComponent cssClass="e-small e-outline e-danger" onClick={() => confirmDelete(record)}>
        Delete
      </ButtonComponent>
    </div>
  );

  const referenceKeys = new Set(
    definition.fields.filter((field) => field.kind === "reference").map((field) => field.key),
  );

  // Reference columns show the referenced record's label, not its slug.
  const columns = definition.columns.map((column) =>
    referenceKeys.has(column.field) ? (
      <ColumnDirective
        key={column.field}
        headerText={column.header}
        width={column.width}
        allowSorting={false}
        template={(record: Row) => <span>{references.labelFor(column.field, record[column.field])}</span>}
      />
    ) : (
      <ColumnDirective
        key={column.field}
        field={column.field}
        headerText={column.header}
        width={column.width}
        clipMode="EllipsisWithTooltip"
      />
    ),
  );

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>{definition.title}</h1>
          <p>{definition.description}</p>
        </div>
        <ButtonComponent
          cssClass="e-primary e-outline"
          onClick={() => navigate(`/${definition.entity}/new`)}
        >
          Add {definition.singular}
        </ButtonComponent>
      </div>

      {list.isError ? (
        <p className="admin-error">
          {list.error instanceof ApiError ? list.error.message : `Could not load ${definition.title.toLowerCase()}.`}
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
          {[
            ...columns,
            <ColumnDirective
              key="updatedAt"
              field="updatedAt"
              headerText="Updated"
              width={140}
              type="date"
              format="yMd"
            />,
            <ColumnDirective
              key="actions"
              headerText=""
              width={150}
              template={actionsTemplate}
              allowSorting={false}
              allowFiltering={false}
            />,
          ]}
        </EntityGrid>
      </div>
    </>
  );
}
