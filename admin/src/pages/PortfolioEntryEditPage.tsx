import type { ClientVariant, GalleryItem, PortfolioCore, PortfolioEntry } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { DropDownListComponent } from "@syncfusion/ej2-react-dropdowns";
import { NumericTextBoxComponent, TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormField } from "../components/FormField";
import { ListEditor } from "../components/ListEditor";
import { MediaPicker } from "../components/MediaPicker";
import { TechnologyPicker } from "../components/TechnologyPicker";
import { useStatus } from "../lib/status";
import { suggestSlug } from "../entities/definitions";
import { fieldLabel } from "../lib/validationMessages";
import { api, ApiError } from "../lib/apiClient";
import {
  useCreateEntity,
  useEntity,
  useEntityList,
  useUpdateEntity,
  withoutMeta,
  type EntityRecord,
  type PagedResult,
} from "../lib/entityApi";

const ENTITY = "portfolioEntries";

const FIT_OPTIONS = [
  { value: "cover", text: "Cover (fill and crop)" },
  { value: "contain", text: "Contain (show whole image)" },
];

const EMPTY: PortfolioEntry = {
  slug: "",
  sortOrder: 0,
  coreSlug: "",
  placement: { plane: 0, ring: 0 },
  title: "",
  mediaId: "",
  description: "",
  technologies: [],
  technologySlugs: [],
  year: null,
  fit: "cover",
  galleryMedia: [],
  clientVariants: [],
};

const toCommaList = (values: string[]) => values.join(", ");
const clean = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);

/**
 * Gallery images only need an image: the slug is generated, and a blank title
 * or description falls back to the project's (or client site's) own.
 */
const trimGallery = (
  items: GalleryItem[],
  owner: { slug: string; title: string; description: string },
): GalleryItem[] => {
  const used = new Set<string>();
  const ownerSlug = suggestSlug(owner.slug) || "image";
  return items.map((item, index) => {
    let slug = item.slug.trim() || `${ownerSlug}-image-${index + 1}`;
    for (let n = 2; used.has(slug); n++) slug = `${ownerSlug}-image-${index + 1}-${n}`;
    used.add(slug);
    return {
      ...item,
      type: "image",
      slug,
      title: item.title.trim() || `${owner.title.trim()} ${index + 1}`.trim(),
      description: item.description.trim() || owner.description.trim(),
    };
  });
};

/** Normalises editable text back into the shape the API validates. */
const normalise = (draft: PortfolioEntry): PortfolioEntry => ({
  ...draft,
  slug: draft.slug.trim(),
  title: draft.title.trim(),
  description: draft.description.trim(),
  technologies: clean(draft.technologies),
  galleryMedia: trimGallery(draft.galleryMedia, draft),
  clientVariants: draft.clientVariants.map((variant) => {
    const slug = variant.slug.trim() || suggestSlug(variant.title);
    return {
      ...variant,
      slug,
      title: variant.title.trim(),
      description: variant.description.trim(),
      technologies: clean(variant.technologies),
      galleryMedia: trimGallery(variant.galleryMedia, { ...variant, slug }),
    };
  }),
});

export function PortfolioEntryEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const isNew = slug === "new";
  const existing = useEntity<PortfolioEntry>(ENTITY, isNew ? undefined : slug);

  const count = useQuery({
    queryKey: [ENTITY, "count"],
    queryFn: () => api.get<PagedResult<PortfolioEntry>>(`/api/v2/admin/${ENTITY}?pageSize=1`),
    enabled: isNew,
  });

  if (isNew) {
    if (count.isLoading) return <p className="admin-status">Loading…</p>;
    return (
      <EntryEditor
        key="new"
        initial={{ ...EMPTY, sortOrder: count.data?.total ?? 0 }}
        initialVersion={0}
        isNew
      />
    );
  }

  if (existing.isLoading) return <p className="admin-status">Loading…</p>;
  if (existing.isError || !existing.data) {
    return (
      <p className="admin-error">
        {existing.error instanceof ApiError ? existing.error.message : "Could not load this project."}
      </p>
    );
  }

  const record = existing.data as EntityRecord<PortfolioEntry>;

  // Keyed by version so a background refetch cannot overwrite edits in progress.
  return (
    <EntryEditor
      key={`${record.slug}-${record.version}`}
      initial={withoutMeta(record)}
      initialVersion={record.version}
      updatedBy={record.updatedBy}
      isNew={false}
    />
  );
}

interface EditorProps {
  initial: PortfolioEntry;
  initialVersion: number;
  updatedBy?: string;
  isNew: boolean;
}

function EntryEditor({ initial, initialVersion, updatedBy, isNew }: EditorProps) {
  const navigate = useNavigate();
  const create = useCreateEntity<PortfolioEntry>(ENTITY);
  const update = useUpdateEntity<PortfolioEntry>(ENTITY);
  const cores = useEntityList<PortfolioCore>("portfolioCores", { page: 1, pageSize: 100, sort: "sortOrder" });
  const status = useStatus();

  const [draft, setDraft] = useState<PortfolioEntry>(initial);
  const [version] = useState(initialVersion);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(!isNew);

  const saving = create.isPending || update.isPending;
  const set = <K extends keyof PortfolioEntry>(key: K, value: PortfolioEntry[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const core = cores.data?.items.find((item) => item.slug === draft.coreSlug);
  const planeOptions = (core?.planes ?? []).map((plane, index) => ({
    value: index,
    text: `Plane ${index + 1} (${plane.angle}°)`,
  }));
  const ringOptions = (core?.planes[draft.placement.plane]?.rings ?? []).map((ring, index) => ({
    value: index,
    text: `Ring ${index + 1} (${ring.orbitColor})`,
  }));

  // Item fields show their own errors; the section lists only list-level ones.
  const sectionErrors = (prefix: string) =>
    fieldErrors[prefix] ? [`${fieldLabel(prefix)} ${fieldErrors[prefix]}`] : [];
  const itemError = (prefix: string, index: number, field: string) =>
    fieldErrors[`${prefix}.${index}.${field}`];

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
          status.success(`Created project "${record.title}". Publish to show it on the sites.`);
          navigate("/portfolioEntries");
        },
        onError: handleError,
      });
      return;
    }

    update.mutate(
      { slug: initial.slug, content, version },
      {
        onSuccess: (record) => {
          status.success(`Saved project "${record.title}". Publish to show changes on the sites.`);
          navigate("/portfolioEntries");
        },
        onError: handleError,
      },
    );
  };

  const galleryEditor = (items: GalleryItem[], onChange: (items: GalleryItem[]) => void, prefix: string) => (
    <ListEditor<GalleryItem>
      title="Gallery"
      description="Three.js app: when the card opens, the cover image is the large photo, and the cover plus these images appear as thumbnails beneath it (6 per row, arrows for more). Don't repeat the cover image here or it appears twice. HTML portfolio: every image appears in the detail view."
      items={items}
      onChange={onChange}
      createItem={() => ({ slug: "", type: "image", mediaId: "", title: "", description: "", fit: "cover" })}
      describeItem={(item, index) => item.title || `Image ${index + 1}`}
      addLabel="Add image"
      errors={sectionErrors(prefix)}
      renderItem={(item, updateItem, index) => (
        <>
          <FormField label="Image" error={itemError(prefix, index, "mediaId")}>
            <MediaPicker value={item.mediaId} onChange={(mediaId) => updateItem({ ...item, mediaId })} />
          </FormField>
          <FormField label="Title" hint="Leave empty to number it after the project" error={itemError(prefix, index, "title")}>
            <TextBoxComponent value={item.title} input={(e: { value: string }) => updateItem({ ...item, title: e.value })} />
          </FormField>
          <FormField
            label="Description"
            hint="Leave empty to use the project's description"
            error={itemError(prefix, index, "description")}
          >
            <TextBoxComponent
              multiline
              value={item.description}
              input={(e: { value: string }) => updateItem({ ...item, description: e.value })}
            />
          </FormField>
          <FormField label="Fit">
            <DropDownListComponent
              dataSource={FIT_OPTIONS}
              fields={{ text: "text", value: "value" }}
              value={item.fit}
              change={(e: { value: string }) => updateItem({ ...item, fit: e.value as GalleryItem["fit"] })}
            />
          </FormField>
        </>
      )}
    />
  );

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>{isNew ? "New project" : draft.title || draft.slug}</h1>
          <p>
            {isNew
              ? "Nothing is saved until you press Save."
              : `Version ${version} · last saved by ${updatedBy ?? "unknown"} · changes go live only when published`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonComponent cssClass="e-flat e-outline" onClick={() => navigate("/portfolioEntries")}>
            Back
          </ButtonComponent>
          <ButtonComponent cssClass="e-primary e-outline" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </ButtonComponent>
        </div>
      </div>

      <section className="admin-card">
        <FormField label="Title" error={fieldErrors.title}>
          <TextBoxComponent
            value={draft.title}
            input={(e: { value: string }) =>
              setDraft((current) => ({
                ...current,
                title: e.value,
                slug: slugTouched ? current.slug : suggestSlug(e.value),
              }))
            }
          />
        </FormField>
        <FormField label="Slug" hint="Suggested from the title for new projects" error={fieldErrors.slug}>
          <TextBoxComponent
            value={draft.slug}
            input={(e: { value: string }) => {
              setSlugTouched(true);
              set("slug", e.value);
            }}
          />
        </FormField>
        <FormField label="Image" error={fieldErrors.mediaId}>
          <MediaPicker value={draft.mediaId} onChange={(mediaId) => set("mediaId", mediaId)} />
        </FormField>
        <FormField label="Image fit" error={fieldErrors.fit}>
          <DropDownListComponent
            dataSource={FIT_OPTIONS}
            fields={{ text: "text", value: "value" }}
            value={draft.fit}
            change={(e: { value: string }) => set("fit", e.value as PortfolioEntry["fit"])}
          />
        </FormField>
        <FormField label="Description" error={fieldErrors.description}>
          <TextBoxComponent
            multiline
            value={draft.description}
            input={(e: { value: string }) => set("description", e.value)}
          />
        </FormField>
        <FormField
          label="Technologies"
          hint={
            draft.technologies.length
              ? `Typed before the master list existed: ${toCommaList(draft.technologies)}. The sites read the linked list above; the typed one goes once every site does.`
              : undefined
          }
          error={fieldErrors.technologySlugs ?? fieldErrors.technologies}
        >
          <TechnologyPicker value={draft.technologySlugs} onChange={(slugs) => set("technologySlugs", slugs)} />
        </FormField>
        <FormField label="Year" hint="Leave empty if unknown" error={fieldErrors.year}>
          <NumericTextBoxComponent
            format="####"
            min={1990}
            max={2100}
            showSpinButton={false}
            value={draft.year ?? undefined}
            change={(e: { value: number | null }) => set("year", e.value ?? null)}
          />
        </FormField>
      </section>

      <section className="admin-card admin-section">
        <div className="admin-section__header">
          <div>
            <h2>Placement</h2>
            <p className="admin-status" style={{ margin: "2px 0 0" }}>
              Where the project orbits in the 3D portfolio: its core, and the plane and ring around it.
            </p>
          </div>
        </div>
        <FormField label="Core" error={fieldErrors.coreSlug}>
          <DropDownListComponent
            dataSource={(cores.data?.items ?? []).map((item) => ({ value: item.slug, text: item.name }))}
            fields={{ text: "text", value: "value" }}
            value={draft.coreSlug}
            placeholder={cores.isLoading ? "Loading…" : "Choose a core"}
            change={(e: { value: string }) =>
              // A different core has different planes, so placement starts over.
              setDraft((current) => ({ ...current, coreSlug: e.value ?? "", placement: { plane: 0, ring: 0 } }))
            }
          />
        </FormField>
        <FormField label="Plane" error={fieldErrors["placement.plane"]}>
          <DropDownListComponent
            dataSource={planeOptions}
            fields={{ text: "text", value: "value" }}
            value={draft.placement.plane}
            enabled={planeOptions.length > 0}
            change={(e: { value: number }) =>
              setDraft((current) => ({ ...current, placement: { plane: Number(e.value ?? 0), ring: 0 } }))
            }
          />
        </FormField>
        <FormField label="Ring" error={fieldErrors["placement.ring"]}>
          <DropDownListComponent
            dataSource={ringOptions}
            fields={{ text: "text", value: "value" }}
            value={draft.placement.ring}
            enabled={ringOptions.length > 0}
            change={(e: { value: number }) =>
              setDraft((current) => ({ ...current, placement: { ...current.placement, ring: Number(e.value ?? 0) } }))
            }
          />
        </FormField>
      </section>

      {galleryEditor(draft.galleryMedia, (items) => set("galleryMedia", items), "galleryMedia")}

      <ListEditor<ClientVariant>
        title="Client sites"
        description="Effectively multiple galleries for one project. Three.js app: each client site becomes a tab above the image, and its tab shows that site's own image and gallery; the project's own image and gallery are then not shown in the card (a client site with an empty gallery borrows the project's). Tabs show 5 at a time, with arrows for more. HTML portfolio: each client site is a separate card."
        items={draft.clientVariants}
        onChange={(items) => set("clientVariants", items)}
        createItem={() => ({
          slug: "",
          title: "",
          mediaId: "",
          description: "",
          technologies: [],
          technologySlugs: [],
          year: null,
          fit: "cover",
          galleryMedia: [],
        })}
        describeItem={(item, index) => item.title || `Client site ${index + 1}`}
        addLabel="Add client site"
        errors={sectionErrors("clientVariants")}
        renderItem={(item, updateItem, index) => (
          <>
            <FormField label="Title" error={itemError("clientVariants", index, "title")}>
              <TextBoxComponent value={item.title} input={(e: { value: string }) => updateItem({ ...item, title: e.value })} />
            </FormField>
            <FormField label="Slug" hint="Leave empty to generate it from the title" error={itemError("clientVariants", index, "slug")}>
              <TextBoxComponent value={item.slug} input={(e: { value: string }) => updateItem({ ...item, slug: e.value })} />
            </FormField>
            <FormField label="Image" error={itemError("clientVariants", index, "mediaId")}>
              <MediaPicker value={item.mediaId} onChange={(mediaId) => updateItem({ ...item, mediaId })} />
            </FormField>
            <FormField label="Description" error={itemError("clientVariants", index, "description")}>
              <TextBoxComponent
                multiline
                value={item.description}
                input={(e: { value: string }) => updateItem({ ...item, description: e.value })}
              />
            </FormField>
            <FormField
              label="Technologies"
              hint={
                item.technologies.length
                  ? `Typed before the master list existed: ${toCommaList(item.technologies)}. Leave the list empty to share the project's.`
                  : "Leave empty to share the project's technologies."
              }
              error={itemError("clientVariants", index, "technologySlugs") ?? itemError("clientVariants", index, "technologies")}
            >
              <TechnologyPicker
                value={item.technologySlugs ?? []}
                onChange={(slugs) => updateItem({ ...item, technologySlugs: slugs })}
              />
            </FormField>
            <FormField label="Year" error={itemError("clientVariants", index, "year")}>
              <NumericTextBoxComponent
                format="####"
                min={1990}
                max={2100}
                showSpinButton={false}
                value={item.year ?? undefined}
                change={(e: { value: number | null }) => updateItem({ ...item, year: e.value ?? null })}
              />
            </FormField>
            <FormField label="Fit">
              <DropDownListComponent
                dataSource={FIT_OPTIONS}
                fields={{ text: "text", value: "value" }}
                value={item.fit}
                change={(e: { value: string }) => updateItem({ ...item, fit: e.value as ClientVariant["fit"] })}
              />
            </FormField>
            {galleryEditor(
              item.galleryMedia,
              (galleryMedia) => updateItem({ ...item, galleryMedia }),
              `clientVariants.${index}.galleryMedia`,
            )}
          </>
        )}
      />
    </>
  );
}
