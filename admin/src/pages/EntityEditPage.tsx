import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { DropDownListComponent } from "@syncfusion/ej2-react-dropdowns";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { DialogUtility } from "@syncfusion/ej2-popups";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormField } from "../components/FormField";
import { suggestSlug, type EntityDefinition } from "../entities/definitions";
import { useReferenceOptions } from "../entities/references";
import { api, ApiError } from "../lib/apiClient";
import {
  useCreateEntity,
  useEntity,
  useUpdateEntity,
  withoutMeta,
  type EntityRecord,
  type PagedResult,
} from "../lib/entityApi";

type Content = Record<string, unknown>;

/** Loads the record (or the record count, for a new one), then mounts the editor. */
export function EntityEditPage({ definition }: { definition: EntityDefinition }) {
  const { slug } = useParams<{ slug: string }>();
  const isNew = slug === "new";
  const existing = useEntity<Content>(definition.entity, isNew ? undefined : slug);

  // New records are appended: sortOrder starts at the current count.
  const count = useQuery({
    queryKey: [definition.entity, "count"],
    queryFn: () =>
      api.get<PagedResult<Content>>(`/api/v2/admin/${definition.entity}?pageSize=1`),
    enabled: isNew,
  });

  if (isNew) {
    if (count.isLoading) return <p className="admin-status">Loading…</p>;
    return (
      <EntityEditor
        key="new"
        definition={definition}
        initial={{ ...definition.empty(), sortOrder: count.data?.total ?? 0 }}
        initialVersion={0}
        isNew
      />
    );
  }

  if (existing.isLoading) return <p className="admin-status">Loading…</p>;

  if (existing.isError || !existing.data) {
    return (
      <p className="admin-error">
        {existing.error instanceof ApiError
          ? existing.error.message
          : `Could not load this ${definition.singular}.`}
      </p>
    );
  }

  const record = existing.data as EntityRecord<Content>;

  // Keyed by version so a background refetch cannot overwrite edits in progress.
  return (
    <EntityEditor
      key={`${record.slug}-${record.version}`}
      definition={definition}
      initial={withoutMeta(record)}
      initialVersion={record.version}
      updatedBy={record.updatedBy}
      isNew={false}
    />
  );
}

interface EditorProps {
  definition: EntityDefinition;
  initial: Content;
  initialVersion: number;
  updatedBy?: string;
  isNew: boolean;
}

function EntityEditor({ definition, initial, initialVersion, updatedBy, isNew }: EditorProps) {
  const navigate = useNavigate();
  const create = useCreateEntity<Content>(definition.entity);
  const update = useUpdateEntity<Content>(definition.entity);
  const references = useReferenceOptions(definition);

  const [draft, setDraft] = useState<Content>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Until the slug is typed by hand, new records follow the name field.
  const [slugTouched, setSlugTouched] = useState(!isNew);

  const saving = create.isPending || update.isPending;
  const listPath = `/${definition.entity}`;

  const setField = (key: string, value: string) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === definition.slugSource && !slugTouched) next.slug = suggestSlug(value);
      return next;
    });
    if (key === "slug") setSlugTouched(true);
  };

  const handleError = (error: unknown) => {
    if (!(error instanceof ApiError)) {
      DialogUtility.alert({ title: "Could not save", content: "Unexpected error." });
      return;
    }
    setFieldErrors(error.fieldErrors);
    if (error.isConflict) {
      DialogUtility.alert({
        title: "Someone else saved first",
        content: `${error.message} Your changes are still on screen: reload to see the current version, then reapply them.`,
      });
    } else if (error.details.length === 0) {
      DialogUtility.alert({ title: "Could not save", content: error.message });
    }
  };

  const save = () => {
    setFieldErrors({});
    // Trim text so stray spaces never fail validation or reach the sites.
    const content = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]),
    );

    if (isNew) {
      create.mutate(content, {
        onSuccess: (record) => navigate(`${listPath}/${record.slug}`, { replace: true }),
        onError: handleError,
      });
      return;
    }

    update.mutate(
      { slug: String(initial.slug), content, version },
      {
        onSuccess: (record) => {
          setVersion(record.version);
          setDraft(withoutMeta(record));
          // The slug is part of the URL; follow it if it was changed.
          if (record.slug !== initial.slug) navigate(`${listPath}/${record.slug}`, { replace: true });
        },
        onError: handleError,
      },
    );
  };

  const heading = definition.describe(draft) || (isNew ? `New ${definition.singular}` : String(draft.slug));

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>{isNew ? `New ${definition.singular}` : heading}</h1>
          <p>
            {isNew
              ? "Nothing is saved until you press Save."
              : `Version ${version} · last saved by ${updatedBy ?? "unknown"} · changes go live only when published`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonComponent cssClass="e-flat e-outline" onClick={() => navigate(listPath)}>
            Back
          </ButtonComponent>
          <ButtonComponent cssClass="e-primary e-outline" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </ButtonComponent>
        </div>
      </div>

      <section className="admin-card">
        {definition.fields.map((field) => (
          <FormField key={field.key} label={field.label} hint={field.hint} error={fieldErrors[field.key]}>
            {field.kind === "reference" ? (
              <DropDownListComponent
                dataSource={references.options[field.key] ?? []}
                fields={{ text: "label", value: "slug" }}
                value={String(draft[field.key] ?? "")}
                placeholder={references.isLoading ? "Loading…" : `Choose a ${field.label.toLowerCase()}`}
                change={(event: { value: string }) => setField(field.key, event.value ?? "")}
              />
            ) : (
              <TextBoxComponent
                multiline={field.kind === "multiline"}
                value={String(draft[field.key] ?? "")}
                input={(event: { value: string }) => setField(field.key, event.value)}
              />
            )}
          </FormField>
        ))}
      </section>
    </>
  );
}
