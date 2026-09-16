import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormField } from "../components/FormField";
import { definitionFor } from "../entities/definitions";
import { api, ApiError } from "../lib/apiClient";
import {
  useCreateEntity,
  useEntity,
  useUpdateEntity,
  withoutMeta,
  type EntityRecord,
  type PagedResult,
} from "../lib/entityApi";
import { useStatus } from "../lib/status";

const ENTITY = "pathTravelMessages";
const definition = definitionFor(ENTITY)!;

interface PathMessage {
  slug: string;
  sortOrder: number;
  textContent: string;
  fontFamily: string[];
  fontSize: string;
  fontColor: string;
  fontShadow: string;
}

const toCommaList = (values: string[]) => values.join(", ");
const fromCommaList = (text: string) => text.split(",").map((value) => value.trimStart());

// The 3D site renders <br> and newlines as line breaks (normalizeRideMessageText).
const previewText = (text: string) => text.replace(/<br\s*\/?>/gi, "\n");

/** Loads the message (or the count, for a new one), then mounts the editor. */
export function PathMessageEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const isNew = slug === "new";
  const existing = useEntity<PathMessage>(ENTITY, isNew ? undefined : slug);

  const count = useQuery({
    queryKey: [ENTITY, "count"],
    queryFn: () => api.get<PagedResult<PathMessage>>(`/api/v2/admin/${ENTITY}?pageSize=1`),
    enabled: isNew,
  });

  if (isNew) {
    if (count.isLoading) return <p className="admin-status">Loading…</p>;
    const next = (count.data?.total ?? 0) + 1;
    return (
      <MessageEditor
        key="new"
        initial={{
          ...(definition.empty() as unknown as PathMessage),
          // Matches the existing ids (path-msg-01 … path-msg-17).
          slug: `path-msg-${String(next).padStart(2, "0")}`,
          sortOrder: next - 1,
        }}
        initialVersion={0}
        isNew
      />
    );
  }

  if (existing.isLoading) return <p className="admin-status">Loading…</p>;
  if (existing.isError || !existing.data) {
    return (
      <p className="admin-error">
        {existing.error instanceof ApiError ? existing.error.message : "Could not load this message."}
      </p>
    );
  }

  const record = existing.data as EntityRecord<PathMessage>;
  return (
    <MessageEditor
      key={`${record.slug}-${record.version}`}
      initial={withoutMeta(record)}
      initialVersion={record.version}
      updatedBy={record.updatedBy}
      isNew={false}
    />
  );
}

function MessageEditor({
  initial,
  initialVersion,
  updatedBy,
  isNew,
}: {
  initial: PathMessage;
  initialVersion: number;
  updatedBy?: string;
  isNew: boolean;
}) {
  const navigate = useNavigate();
  const create = useCreateEntity<PathMessage>(ENTITY);
  const update = useUpdateEntity<PathMessage>(ENTITY);
  const status = useStatus();

  const [draft, setDraft] = useState<PathMessage>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const saving = create.isPending || update.isPending;

  const set = <K extends keyof PathMessage>(key: K, value: PathMessage[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const handleError = (error: unknown) => {
    if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
    status.error(error, "Could not save.");
  };

  const save = () => {
    setFieldErrors({});
    const content: PathMessage = {
      ...draft,
      slug: draft.slug.trim(),
      textContent: draft.textContent.trim(),
      fontFamily: draft.fontFamily.map((name) => name.trim()).filter(Boolean),
      fontSize: draft.fontSize.trim(),
      fontColor: draft.fontColor.trim(),
      fontShadow: draft.fontShadow.trim(),
    };

    if (isNew) {
      create.mutate(content, {
        onSuccess: (record) => {
          status.success("Created ride message. Publish to show it in the Three.js app.");
          navigate(`/${ENTITY}/${record.slug}`, { replace: true });
        },
        onError: handleError,
      });
      return;
    }

    update.mutate(
      { slug: initial.slug, content, version },
      {
        onSuccess: (record) => {
          status.success(`Saved (version ${record.version}). Publish to show it in the Three.js app.`);
          setVersion(record.version);
          setDraft(withoutMeta(record));
          if (record.slug !== initial.slug) navigate(`/${ENTITY}/${record.slug}`, { replace: true });
        },
        onError: handleError,
      },
    );
  };

  // Mirrors the ride overlay in ResumeSpace3D, which draws text 12% larger than declared.
  const declaredPx = Number.parseFloat(draft.fontSize);
  const previewSize = Number.isFinite(declaredPx) ? `${Math.round(declaredPx * 1.12)}px` : "56px";

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>{isNew ? "New ride message" : draft.slug}</h1>
          <p>
            {isNew
              ? "Nothing is saved until you press Save."
              : `Version ${version} · last saved by ${updatedBy ?? "unknown"} · changes go live only when published`}
          </p>
          <p className="admin-status">{definition.description}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonComponent cssClass="e-flat e-outline" onClick={() => navigate(`/${ENTITY}`)}>
            Back
          </ButtonComponent>
          <ButtonComponent cssClass="e-primary e-outline" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </ButtonComponent>
        </div>
      </div>

      <section className="admin-card">
        <FormField
          label="Message"
          hint="Press Enter for a line break"
          error={fieldErrors.textContent}
        >
          <TextBoxComponent
            multiline
            value={draft.textContent}
            input={(e: { value: string }) => set("textContent", e.value)}
          />
        </FormField>
        <FormField label="Slug" hint="Lowercase id with hyphens" error={fieldErrors.slug}>
          <TextBoxComponent value={draft.slug} input={(e: { value: string }) => set("slug", e.value)} />
        </FormField>
      </section>

      <section className="admin-card admin-section">
        <h2>Appearance</h2>
        <FormField
          label="Fonts"
          hint="Comma-separated, first available is used"
          error={fieldErrors.fontFamily ?? fieldErrors["fontFamily.0"]}
        >
          <TextBoxComponent
            value={toCommaList(draft.fontFamily)}
            input={(e: { value: string }) => set("fontFamily", fromCommaList(e.value))}
          />
        </FormField>
        <FormField label="Size" hint="e.g. 54px" error={fieldErrors.fontSize}>
          <TextBoxComponent value={draft.fontSize} input={(e: { value: string }) => set("fontSize", e.value)} />
        </FormField>
        <FormField label="Color" hint="Hex, rgb(a) or hsl(a)" error={fieldErrors.fontColor}>
          <TextBoxComponent value={draft.fontColor} input={(e: { value: string }) => set("fontColor", e.value)} />
        </FormField>
        <FormField label="Glow" hint="CSS text-shadow, e.g. 0px 0px 34px rgba(80, 198, 255, 0.75)" error={fieldErrors.fontShadow}>
          <TextBoxComponent value={draft.fontShadow} input={(e: { value: string }) => set("fontShadow", e.value)} />
        </FormField>
      </section>

      <section className="admin-card admin-section">
        <h2>Preview</h2>
        <div
          style={{
            background: "radial-gradient(ellipse at center, #0b1a2e 0%, #02040a 100%)",
            borderRadius: 8,
            padding: "40px 24px",
            overflow: "hidden",
            textAlign: "center",
            lineHeight: 1.14,
            letterSpacing: "0.15px",
            whiteSpace: "pre-line",
            fontWeight: 500,
            color: draft.fontColor,
            textShadow: draft.fontShadow,
            fontFamily: draft.fontFamily.join(", "),
            fontSize: previewSize,
          }}
        >
          {previewText(draft.textContent) || "Your message"}
        </div>
      </section>
    </>
  );
}
