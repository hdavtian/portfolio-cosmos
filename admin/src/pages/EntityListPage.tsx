import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { ColumnDirective } from "@syncfusion/ej2-react-grids";
import { DialogUtility } from "@syncfusion/ej2-popups";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { EntityGrid } from "../components/EntityGrid";
import type { EntityDefinition } from "../entities/definitions";
import { useReferenceOptions } from "../entities/references";
import { ApiError } from "../lib/apiClient";
import { confirmAction } from "../lib/confirm";
import { useAllEntities, useDeleteEntity, useReorderEntity, type EntityRecord } from "../lib/entityApi";

type Row = EntityRecord<Record<string, unknown>>;

/** Reference columns get a real text field so the grid can sort, filter and group on it. */
const labelField = (key: string) => `${key}__label`;

/** Grid page for any entity described in entities/definitions.ts. */
export function EntityListPage({ definition }: { definition: EntityDefinition }) {
  const navigate = useNavigate();
  const list = useAllEntities<Record<string, unknown>>(definition.entity);
  const remove = useDeleteEntity(definition.entity);
  const reorder = useReorderEntity(definition.entity);
  const references = useReferenceOptions(definition);

  const referenceKeys = useMemo(
    () => new Set(definition.fields.filter((field) => field.kind === "reference").map((field) => field.key)),
    [definition],
  );

  const labelsReady = !references.isLoading;
  const rows = useMemo(() => {
    if (!list.items) return undefined;
    if (referenceKeys.size === 0) return list.items as Row[];
    return (list.items as Row[]).map((item) => {
      const withLabels: Record<string, unknown> = { ...item };
      for (const key of referenceKeys) withLabels[labelField(key)] = references.labelFor(key, item[key]);
      return withLabels as Row;
    });
    // labelsReady marks when reference options arrive, so labels are recomputed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.items, referenceKeys, labelsReady]);

  const confirmDelete = (record: Row) => {
    confirmAction({
      title: `Delete this ${definition.singular}?`,
      content: `"${definition.describe(record) || record.slug}" will be removed. Published sites keep showing it until the next publish.`,
      confirmText: "Delete",
      confirmClass: "e-danger e-outline",
      onConfirm: () =>
        remove.mutate(record.slug, {
          onError: (error) =>
            DialogUtility.alert({
              title: "Could not delete",
              content: error instanceof ApiError ? error.message : "Unexpected error.",
            }),
        }),
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

  const columns = definition.columns.map((column) => (
    <ColumnDirective
      key={column.field}
      field={referenceKeys.has(column.field) ? labelField(column.field) : column.field}
      headerText={column.header}
      width={column.width}
      clipMode="EllipsisWithTooltip"
    />
  ));

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>{definition.title}</h1>
          <p>{definition.description}</p>
        </div>
        <ButtonComponent cssClass="e-primary e-outline" onClick={() => navigate(`/${definition.entity}/new`)}>
          Add {definition.singular}
        </ButtonComponent>
      </div>

      {list.isError ? (
        <p className="admin-error">
          {list.error instanceof ApiError ? list.error.message : `Could not load ${definition.title.toLowerCase()}.`}
        </p>
      ) : null}
      {list.truncated ? <p className="admin-error">Showing the first 100 records only.</p> : null}

      <div className="admin-grid-wrap">
        <EntityGrid rows={rows} mode="local" onReorder={(slugs) => reorder.mutate(slugs)}>
          {[
            ...columns,
            <ColumnDirective key="updatedAt" field="updatedAt" headerText="Updated" width={140} type="date" format="yMd" />,
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
