import type { Experience } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { DropDownListComponent } from "@syncfusion/ej2-react-dropdowns";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ListEditor } from "../components/ListEditor";
import { useStatus } from "../lib/status";
import { fieldLabel } from "../lib/validationMessages";
import { ApiError } from "../lib/apiClient";
import {
  useCreateEntity,
  useEntity,
  useUpdateEntity,
  withoutMeta,
  type EntityRecord,
} from "../lib/entityApi";

const ENTITY = "experiences";

type Position = Experience["positions"][number];
type Project = Experience["projects"][number];
type JobMemory = Experience["jobMemories"][number];
type JobTech = Experience["jobTech"][number];

const EMPTY: Experience = {
  slug: "",
  sortOrder: 0,
  company: "",
  navLabel: "",
  location: "",
  startDate: "",
  endDate: "",
  droneIntroText: "",
  positions: [{ title: "", responsibilities: [] }],
  projects: [],
  jobMemories: [],
  jobTech: [],
  skillsUsed: [],
};

const MEMORY_TYPES = [
  { value: "tech", text: "Tech" },
  { value: "memory", text: "Memory" },
  { value: "code", text: "Code" },
];

// Lines and comma lists are edited as text and stored as arrays. Blank entries
// are kept while typing (so Enter works) and dropped on save.
const toLines = (values: string[]) => values.join("\n");
const fromLines = (text: string) => text.split("\n");
const toCommaList = (values: string[]) => values.join(", ");
const fromCommaList = (text: string) => text.split(",").map((value) => value.trimStart());

const clean = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);

/** Normalises the editable text back into the shape the API validates. */
const normalise = (draft: Experience): Experience => ({
  ...draft,
  // Blank means the job is current.
  endDate: draft.endDate?.trim() || undefined,
  positions: draft.positions.map((position) => ({
    ...position,
    startDate: position.startDate?.trim() || undefined,
    endDate: position.endDate?.trim() || undefined,
    responsibilities: clean(position.responsibilities),
  })),
  jobTech: draft.jobTech.map((tech) => ({
    ...tech,
    highlightMatches: clean(tech.highlightMatches),
  })),
});

/** Loads the record, then mounts an editor seeded from it. */
export function ExperienceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const isNew = slug === "new";
  const existing = useEntity<Experience>(ENTITY, isNew ? undefined : slug);

  if (isNew) {
    return <ExperienceEditor key="new" initial={EMPTY} initialVersion={0} isNew />;
  }

  if (existing.isLoading) {
    return <p className="admin-status">Loading…</p>;
  }

  if (existing.isError || !existing.data) {
    return (
      <p className="admin-error">
        {existing.error instanceof ApiError ? existing.error.message : "Could not load this job."}
      </p>
    );
  }

  const record = existing.data as EntityRecord<Experience>;

  // Keyed by version: a background refetch of the same version cannot
  // overwrite edits in progress, while a newer saved version remounts cleanly.
  return (
    <ExperienceEditor
      key={`${record.slug}-${record.version}`}
      initial={withoutMeta(record)}
      initialVersion={record.version}
      updatedBy={record.updatedBy}
      isNew={false}
    />
  );
}

interface EditorProps {
  initial: Experience;
  initialVersion: number;
  updatedBy?: string;
  isNew: boolean;
}

function ExperienceEditor({ initial, initialVersion, updatedBy, isNew }: EditorProps) {
  const navigate = useNavigate();
  const create = useCreateEntity<Experience>(ENTITY);
  const update = useUpdateEntity<Experience>(ENTITY);
  const status = useStatus();

  const [draft, setDraft] = useState<Experience>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const saving = create.isPending || update.isPending;
  const set = <K extends keyof Experience>(key: K, value: Experience[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  /** Server messages for a nested section, e.g. every "positions.1.title". */
  const sectionErrors = (prefix: string) =>
    Object.entries(fieldErrors)
      .filter(([path]) => path === prefix || path.startsWith(`${prefix}.`))
      .map(([path, message]) => `${fieldLabel(path)} ${message}`);

  const handleError = (error: unknown) => {
    if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
    status.error(error, "Could not save.");
  };

  const save = () => {
    setFieldErrors({});
    const content = normalise(draft);

    if (isNew) {
      create.mutate(content, {
        onSuccess: (record) => {
          status.success("Created job. Publish to show it on the sites.");
          navigate(`/experiences/${record.slug}`, { replace: true });
        },
        onError: handleError,
      });
      return;
    }

    update.mutate(
      { slug: initial.slug, content, version },
      {
        onSuccess: (record) => {
          status.success(`Saved (version ${record.version}). Publish to show changes on the sites.`);
          setVersion(record.version);
          setDraft(withoutMeta(record));
        },
        onError: handleError,
      },
    );
  };

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>{isNew ? "New job" : draft.company || draft.slug}</h1>
          <p>
            {isNew
              ? "Nothing is saved until you press Save."
              : `Version ${version} · last saved by ${updatedBy ?? "unknown"} · changes go live only when published`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonComponent cssClass="e-flat e-outline" onClick={() => navigate("/experiences")}>
            Back
          </ButtonComponent>
          <ButtonComponent cssClass="e-primary e-outline" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </ButtonComponent>
        </div>
      </div>

      <section className="admin-card">
        <Field label="Company" error={fieldErrors.company}>
          <TextBoxComponent value={draft.company} input={(e: { value: string }) => set("company", e.value)} />
        </Field>
        <Field label="Slug" hint="Lowercase id used in links and by the cosmos moons" error={fieldErrors.slug}>
          <TextBoxComponent value={draft.slug} input={(e: { value: string }) => set("slug", e.value)} />
        </Field>
        <Field label="Short name" hint="Shown in navigation and on moon labels" error={fieldErrors.navLabel}>
          <TextBoxComponent value={draft.navLabel} input={(e: { value: string }) => set("navLabel", e.value)} />
        </Field>
        <Field label="Location" error={fieldErrors.location}>
          <TextBoxComponent value={draft.location} input={(e: { value: string }) => set("location", e.value)} />
        </Field>
        <Field label="Start date" hint="MM/YYYY" error={fieldErrors.startDate}>
          <TextBoxComponent value={draft.startDate} input={(e: { value: string }) => set("startDate", e.value)} />
        </Field>
        <Field label="End date" hint="MM/YYYY, or leave blank for a current job" error={fieldErrors.endDate}>
          <TextBoxComponent value={draft.endDate} input={(e: { value: string }) => set("endDate", e.value)} />
        </Field>
        <Field label="Intro text" hint="Read out by the drone in the cosmos" error={fieldErrors.droneIntroText}>
          <TextBoxComponent
            multiline
            value={draft.droneIntroText}
            input={(e: { value: string }) => set("droneIntroText", e.value)}
          />
        </Field>
      </section>

      <ListEditor<Position>
        title="Positions"
        description="Roles held at this company, most recent first."
        items={draft.positions}
        onChange={(items) => set("positions", items)}
        createItem={() => ({ title: "", responsibilities: [] })}
        describeItem={(item, index) => item.title || `Position ${index + 1}`}
        addLabel="Add position"
        errors={sectionErrors("positions")}
        renderItem={(item, update) => (
          <>
            <Field label="Title">
              <TextBoxComponent value={item.title} input={(e: { value: string }) => update({ ...item, title: e.value })} />
            </Field>
            <Field label="Start date" hint="MM/YYYY — only needed when the job had several roles">
              <TextBoxComponent
                value={item.startDate ?? ""}
                input={(e: { value: string }) => update({ ...item, startDate: e.value })}
              />
            </Field>
            <Field label="End date" hint="MM/YYYY">
              <TextBoxComponent
                value={item.endDate ?? ""}
                input={(e: { value: string }) => update({ ...item, endDate: e.value })}
              />
            </Field>
            <Field label="Responsibilities" hint="One per line">
              <TextBoxComponent
                multiline
                value={toLines(item.responsibilities)}
                input={(e: { value: string }) => update({ ...item, responsibilities: fromLines(e.value) })}
              />
            </Field>
          </>
        )}
      />

      <ListEditor<Project>
        title="Projects"
        description="Highlighted projects from this job."
        items={draft.projects}
        onChange={(items) => set("projects", items)}
        createItem={() => ({ slug: "", title: "", summary: "" })}
        describeItem={(item, index) => item.title || `Project ${index + 1}`}
        addLabel="Add project"
        errors={sectionErrors("projects")}
        renderItem={(item, update) => (
          <>
            <Field label="Title">
              <TextBoxComponent value={item.title} input={(e: { value: string }) => update({ ...item, title: e.value })} />
            </Field>
            <Field label="Slug">
              <TextBoxComponent value={item.slug} input={(e: { value: string }) => update({ ...item, slug: e.value })} />
            </Field>
            <Field label="Summary">
              <TextBoxComponent
                multiline
                value={item.summary}
                input={(e: { value: string }) => update({ ...item, summary: e.value })}
              />
            </Field>
          </>
        )}
      />

      <ListEditor<JobMemory>
        title="Job memories"
        description="Short fragments the cosmos drone cycles through."
        items={draft.jobMemories}
        onChange={(items) => set("jobMemories", items)}
        createItem={() => ({ type: "memory", text: "" })}
        describeItem={(item, index) => item.text || `Memory ${index + 1}`}
        addLabel="Add memory"
        errors={sectionErrors("jobMemories")}
        renderItem={(item, update) => (
          <>
            <Field label="Type">
              <DropDownListComponent
                dataSource={MEMORY_TYPES}
                fields={{ text: "text", value: "value" }}
                value={item.type}
                change={(e: { value: string }) => update({ ...item, type: e.value as JobMemory["type"] })}
              />
            </Field>
            <Field label="Text">
              <TextBoxComponent value={item.text} input={(e: { value: string }) => update({ ...item, text: e.value })} />
            </Field>
          </>
        )}
      />

      <ListEditor<JobTech>
        title="Tech chips"
        description="Technology labels; each lights up the listed words in the resume text."
        items={draft.jobTech}
        onChange={(items) => set("jobTech", items)}
        createItem={() => ({ label: "", highlightMatches: [] })}
        describeItem={(item, index) => item.label || `Tech ${index + 1}`}
        addLabel="Add tech chip"
        errors={sectionErrors("jobTech")}
        renderItem={(item, update) => (
          <>
            <Field label="Label">
              <TextBoxComponent value={item.label} input={(e: { value: string }) => update({ ...item, label: e.value })} />
            </Field>
            <Field label="Highlights" hint="Comma-separated words to highlight">
              <TextBoxComponent
                value={toCommaList(item.highlightMatches)}
                input={(e: { value: string }) => update({ ...item, highlightMatches: fromCommaList(e.value) })}
              />
            </Field>
          </>
        )}
      />
    </>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-form__row">
      <div className="admin-form__label">{label}</div>
      <div className="admin-form__control">
        {children}
        {error ? (
          <p className="admin-error" style={{ margin: "4px 0 0" }}>{error}</p>
        ) : hint ? (
          <p className="admin-status" style={{ margin: "4px 0 0" }}>{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
