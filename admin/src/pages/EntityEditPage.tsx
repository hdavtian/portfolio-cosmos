import { ButtonComponent, CheckBoxComponent } from "@syncfusion/ej2-react-buttons";
import {
  CheckBoxSelection,
  DropDownListComponent,
  Inject,
  MultiSelectComponent,
} from "@syncfusion/ej2-react-dropdowns";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FormField } from "../components/FormField";
import { useStatus } from "../lib/status";
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

/** A `tags` field is edited as one value per line. */
const NEWLINE = String.fromCharCode(10);

// One object, not a literal per render: a new identity makes Syncfusion rebind.
const REFERENCE_FIELDS = { text: "label", value: "slug" };

// One object, not a literal per render: Syncfusion rebinds when a prop's
// identity changes, and rebinding a multi-select drops its selection.
const MULTISELECT_FIELDS = { text: "label", value: "value" };

type Content = Record<string, unknown>;

/** Loads the record (or the record count, for a new one), then mounts the editor. */
export function EntityEditPage({ definition }: { definition: EntityDefinition }) {
  const { slug } = useParams<{ slug: string }>();
  const isNew = slug === "new";
  const existing = useEntity<Content>(definition.entity, isNew ? undefined : slug);
  // New records can be prefilled from the URL, e.g. "Add child" passes ?parentSlug=.
  const [searchParams] = useSearchParams();
  const prefill = Object.fromEntries(
    definition.fields.filter((field) => searchParams.has(field.key)).map((field) => [field.key, searchParams.get(field.key)]),
  );

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
        initial={{ ...definition.empty(), sortOrder: count.data?.total ?? 0, ...prefill }}
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
  const status = useStatus();

  const [draft, setDraft] = useState<Content>(initial);
  const [version] = useState(initialVersion);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Until the slug is typed by hand, new records follow the name field.
  const [slugTouched, setSlugTouched] = useState(!isNew);

  const saving = create.isPending || update.isPending;
  const listPath = `/${definition.entity}`;

  const setField = (key: string, value: string | boolean | string[]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      // The slug follows the name only while it is still text and untouched.
      if (key === definition.slugSource && !slugTouched && typeof value === "string") {
        next.slug = suggestSlug(value);
      }
      return next;
    });
    if (key === "slug") setSlugTouched(true);
  };

  const handleError = (error: unknown) => {
    if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
    status.error(error, "Could not save.");
  };

  const save = () => {
    setFieldErrors({});
    // Trim text so stray spaces never fail validation or reach the sites.
    const content = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]),
    );

    if (isNew) {
      create.mutate(content, {
        // Back to the list, where the new row is: the message survives the
        // navigation, so it appears above the grid.
        onSuccess: (record) => {
          status.success(`Created ${definition.singular} "${definition.describe(record) || record.slug}". Publish to show it on the sites.`);
          navigate(listPath);
        },
        onError: handleError,
      });
      return;
    }

    update.mutate(
      { slug: String(initial.slug), content, version },
      {
        onSuccess: (record) => {
          status.success(`Saved ${definition.singular} "${definition.describe(record) || record.slug}". Publish to show changes on the sites.`);
          navigate(listPath);
        },
        onError: handleError,
      },
    );
  };

  // Choices for a reference field: an optional "none" entry, and for a
  // self-reference, never the record itself or anything beneath it.
  const choicesFor = (key: string, emptyOption?: string, selfReference?: boolean) => {
    let choices = references.options[key] ?? [];
    if (selfReference && !isNew) {
      const excluded = new Set([String(initial.slug)]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const option of choices) {
          if (option.parentSlug && excluded.has(option.parentSlug) && !excluded.has(option.slug)) {
            excluded.add(option.slug);
            grew = true;
          }
        }
      }
      choices = choices.filter((option) => !excluded.has(option.slug));
    }
    if (selfReference) {
      // A tree is easier to search when each choice shows where it sits
      // ("Frontend › SPA frameworks › React") and the list runs alphabetically
      // by that path, so siblings sit together and a name is found by typing
      // any part of it.
      const all = references.options[key] ?? [];
      const bySlug = new Map(all.map((option) => [option.slug, option]));
      const pathOf = (slug: string): string => {
        const parts: string[] = [];
        const seen = new Set<string>();
        for (let current = bySlug.get(slug); current && !seen.has(current.slug); current = current.parentSlug ? bySlug.get(current.parentSlug) : undefined) {
          seen.add(current.slug);
          parts.unshift(current.label);
        }
        return parts.join(" › ");
      };
      choices = choices
        .map((option) => ({ ...option, label: pathOf(option.slug) }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    }
    return emptyOption ? [{ slug: "", label: emptyOption }, ...choices] : choices;
  };

  // The slug is derived from the name, so it is shown right after it.
  const orderedFields = (() => {
    const slug = definition.fields.find((field) => field.key === "slug");
    const rest = definition.fields.filter((field) => field.key !== "slug");
    if (!slug) return rest;
    const at = rest.findIndex((field) => field.key === definition.slugSource);
    return at < 0 ? [slug, ...rest] : [...rest.slice(0, at + 1), slug, ...rest.slice(at + 1)];
  })();

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
        {orderedFields.map((field) => (
          <FormField key={field.key} label={field.label} hint={field.hint} error={fieldErrors[field.key]}>
            {field.kind === "boolean" ? (
              <CheckBoxComponent
                checked={Boolean(draft[field.key])}
                change={(event: { checked: boolean }) => setField(field.key, event.checked)}
              />
            ) : field.kind === "checkboxes" ? (
              // One option per line: tick, label, then what ticking it does,
              // so the effect is read beside the tick rather than in a block
              // of prose underneath.
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(field.options ?? []).map((option) => {
                  const chosen = Array.isArray(draft[field.key]) ? (draft[field.key] as string[]) : [];
                  return (
                    <div key={option.value} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <CheckBoxComponent
                        label={option.label}
                        checked={chosen.includes(option.value)}
                        change={(event: { checked: boolean }) =>
                          setField(
                            field.key,
                            event.checked
                              ? [...chosen, option.value]
                              : chosen.filter((value) => value !== option.value),
                          )
                        }
                      />
                      {option.hint ? <span className="admin-status">{option.hint}</span> : null}
                    </div>
                  );
                })}
              </div>
            ) : field.kind === "multiselect" ? (
              <MultiSelectComponent
                dataSource={field.options ?? []}
                fields={MULTISELECT_FIELDS}
                mode="CheckBox"
                showSelectAll
                showDropDownIcon
                placeholder="Nowhere"
                value={Array.isArray(draft[field.key]) ? (draft[field.key] as string[]) : []}
                // The control fires `change` while it initialises, with an
                // empty value and isInteracted false. Treating that as an edit
                // emptied the field on open and would have saved it empty.
                change={(event: { value: string[] | null; isInteracted?: boolean }) => {
                  if (!event.isInteracted) return;
                  setField(field.key, event.value ?? []);
                }}
              >
                {/* CheckBox mode and Select All come from this module; without
                    it the control throws as it renders. */}
                <Inject services={[CheckBoxSelection]} />
              </MultiSelectComponent>
            ) : field.kind === "tags" ? (
              // One per line: the list is read and edited as text, which is
              // faster than a chip control for pasting a handful of old names.
              <TextBoxComponent
                multiline
                value={(Array.isArray(draft[field.key]) ? (draft[field.key] as string[]) : []).join(NEWLINE)}
                input={(event: { value: string }) =>
                  setField(
                    field.key,
                    event.value
                      .split(NEWLINE)
                      .map((line) => line.trim())
                      .filter(Boolean),
                  )
                }
              />
            ) : field.kind === "reference" ? (
              <DropDownListComponent
                dataSource={choicesFor(
                  field.key,
                  field.emptyOption,
                  field.reference?.entity === definition.entity,
                )}
                fields={REFERENCE_FIELDS}
                value={String(draft[field.key] ?? "")}
                placeholder={references.isLoading ? "Loading…" : `Choose a ${field.label.toLowerCase()}`}
                // Type to narrow the list; "Contains" so any part of a path
                // matches, not only its start.
                allowFiltering
                filterType="Contains"
                filterBarPlaceholder="Type to find"
                popupHeight="360px"
                change={(event: { value: string }) => setField(field.key, event.value ?? "")}
              />
            ) : (
              <TextBoxComponent
                multiline={field.kind === "multiline"}
                // An id other records point at is set once and never changed.
                enabled={isNew || !field.immutableAfterCreate}
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
