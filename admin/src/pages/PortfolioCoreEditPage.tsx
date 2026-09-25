import type { PortfolioCore } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import {
  ColorPickerComponent,
  NumericTextBoxComponent,
  TextBoxComponent,
  type ColorPickerEventArgs,
} from "@syncfusion/ej2-react-inputs";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormField } from "../components/FormField";
import { ListEditor } from "../components/ListEditor";
import { useStatus } from "../lib/status";
import { fieldLabel } from "../lib/validationMessages";
import { suggestSlug } from "../entities/definitions";
import { api, ApiError } from "../lib/apiClient";
import {
  useCreateEntity,
  useEntity,
  useUpdateEntity,
  withoutMeta,
  type EntityRecord,
  type PagedResult,
} from "../lib/entityApi";

const ENTITY = "portfolioCores";
type Plane = PortfolioCore["planes"][number];
type Ring = Plane["rings"][number];

const EMPTY: PortfolioCore = {
  slug: "",
  sortOrder: 0,
  name: "",
  color: "#ffd65c",
  planes: [{ angle: 0, rings: [{ orbitColor: "#545353" }] }],
};

// Syncfusion reports colours with an alpha channel; the content stores #rrggbb.
const toHex = (args: ColorPickerEventArgs) => args.currentValue.hex.slice(0, 7);

export function PortfolioCoreEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const isNew = slug === "new";
  const existing = useEntity<PortfolioCore>(ENTITY, isNew ? undefined : slug);

  const count = useQuery({
    queryKey: [ENTITY, "count"],
    queryFn: () => api.get<PagedResult<PortfolioCore>>(`/api/v2/admin/${ENTITY}?pageSize=1`),
    enabled: isNew,
  });

  if (isNew) {
    if (count.isLoading) return <p className="admin-status">Loading…</p>;
    return <CoreEditor key="new" initial={{ ...EMPTY, sortOrder: count.data?.total ?? 0 }} initialVersion={0} isNew />;
  }

  if (existing.isLoading) return <p className="admin-status">Loading…</p>;
  if (existing.isError || !existing.data) {
    return (
      <p className="admin-error">
        {existing.error instanceof ApiError ? existing.error.message : "Could not load this core."}
      </p>
    );
  }

  const record = existing.data as EntityRecord<PortfolioCore>;
  return (
    <CoreEditor
      key={`${record.slug}-${record.version}`}
      initial={withoutMeta(record)}
      initialVersion={record.version}
      updatedBy={record.updatedBy}
      isNew={false}
    />
  );
}

function CoreEditor({
  initial,
  initialVersion,
  updatedBy,
  isNew,
}: {
  initial: PortfolioCore;
  initialVersion: number;
  updatedBy?: string;
  isNew: boolean;
}) {
  const navigate = useNavigate();
  const create = useCreateEntity<PortfolioCore>(ENTITY);
  const update = useUpdateEntity<PortfolioCore>(ENTITY);
  const status = useStatus();

  const [draft, setDraft] = useState<PortfolioCore>(initial);
  const [version] = useState(initialVersion);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const saving = create.isPending || update.isPending;

  const planeErrors = Object.entries(fieldErrors)
    .filter(([path]) => path.startsWith("planes"))
    .map(([path, message]) => `${fieldLabel(path)} ${message}`);

  const handleError = (error: unknown) => {
    if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
    status.error(error, "Could not save.");
  };

  const save = () => {
    setFieldErrors({});
    const content: PortfolioCore = { ...draft, slug: draft.slug.trim(), name: draft.name.trim() };

    if (isNew) {
      create.mutate(content, {
        onSuccess: (record) => {
          status.success(`Created core "${record.name}". Publish to show it on the sites.`);
          navigate("/portfolioCores");
        },
        onError: handleError,
      });
      return;
    }

    update.mutate(
      { slug: initial.slug, content, version },
      {
        onSuccess: (record) => {
          status.success(`Saved core "${record.name}". Publish to show changes on the sites.`);
          navigate("/portfolioCores");
        },
        onError: handleError,
      },
    );
  };

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>{isNew ? "New core" : draft.name || draft.slug}</h1>
          <p>
            {isNew
              ? "Nothing is saved until you press Save."
              : `Version ${version} · last saved by ${updatedBy ?? "unknown"} · changes go live only when published`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonComponent cssClass="e-flat e-outline" onClick={() => navigate("/portfolioCores")}>
            Back
          </ButtonComponent>
          <ButtonComponent cssClass="e-primary e-outline" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </ButtonComponent>
        </div>
      </div>

      <section className="admin-card">
        <FormField label="Name" error={fieldErrors.name}>
          <TextBoxComponent
            value={draft.name}
            input={(e: { value: string }) =>
              setDraft((current) => ({
                ...current,
                name: e.value,
                slug: slugTouched ? current.slug : suggestSlug(e.value),
              }))
            }
          />
        </FormField>
        <FormField label="Slug" hint="Suggested from the name for new cores" error={fieldErrors.slug}>
          <TextBoxComponent
            value={draft.slug}
            input={(e: { value: string }) => {
              setSlugTouched(true);
              setDraft((current) => ({ ...current, slug: e.value }));
            }}
          />
        </FormField>
        <FormField label="Color" hint={draft.color} error={fieldErrors.color}>
          <ColorPickerComponent
            value={draft.color}
            modeSwitcher={false}
            showButtons={false}
            change={(args: ColorPickerEventArgs) => setDraft((current) => ({ ...current, color: toHex(args) }))}
          />
        </FormField>
      </section>

      <ListEditor<Plane>
        title="Orbit planes"
        description="Tilted planes around the core. Removing a plane or ring moves projects placed on it out of range, so reassign them first."
        items={draft.planes}
        onChange={(planes) => setDraft((current) => ({ ...current, planes }))}
        createItem={() => ({ angle: 0, rings: [{ orbitColor: "#545353" }] })}
        describeItem={(plane, index) => `Plane ${index + 1} (${plane.angle}°)`}
        addLabel="Add plane"
        errors={planeErrors}
        renderItem={(plane, updatePlane) => (
          <>
            <FormField label="Tilt angle" hint="Degrees, from -90 to 90">
              <NumericTextBoxComponent
                min={-90}
                max={90}
                format="n0"
                value={plane.angle}
                change={(e: { value: number | null }) => updatePlane({ ...plane, angle: e.value ?? 0 })}
              />
            </FormField>
            <ListEditor<Ring>
              title="Rings"
              items={plane.rings}
              onChange={(rings) => updatePlane({ ...plane, rings })}
              createItem={() => ({ orbitColor: "#545353" })}
              describeItem={(ring, index) => `Ring ${index + 1} (${ring.orbitColor})`}
              addLabel="Add ring"
              renderItem={(ring, updateRing) => (
                <FormField label="Orbit color" hint={ring.orbitColor}>
                  <ColorPickerComponent
                    value={ring.orbitColor}
                    modeSwitcher={false}
                    showButtons={false}
                    change={(args: ColorPickerEventArgs) => updateRing({ orbitColor: toHex(args) })}
                  />
                </FormField>
              )}
            />
          </>
        )}
      />
    </>
  );
}
