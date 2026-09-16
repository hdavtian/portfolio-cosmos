// Config-driven admin sections. Simple entities share one list page and one
// full-page editor; each is described here instead of hand-writing near
// identical pages. Entities with nested content (experiences, portfolio) keep
// bespoke pages.

export type FieldKind = "text" | "multiline" | "reference";

export interface FieldDefinition {
  key: string;
  label: string;
  hint?: string;
  kind: FieldKind;
  /** For `reference` fields: the entity whose slug is stored, and its label field. */
  reference?: { entity: string; labelField: string };
}

export interface ColumnDefinition {
  field: string;
  header: string;
  width: number;
}

export interface EntityDefinition {
  entity: string;
  title: string;
  singular: string;
  description: string;
  /** Field whose value suggests the slug for new records. */
  slugSource: string;
  columns: ColumnDefinition[];
  fields: FieldDefinition[];
  empty: () => Record<string, unknown>;
  describe: (record: Record<string, unknown>) => string;
}

const slugField: FieldDefinition = {
  key: "slug",
  label: "Slug",
  hint: "Lowercase id with hyphens; suggested from the name for new records",
  kind: "text",
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

export const ENTITY_DEFINITIONS: EntityDefinition[] = [
  {
    entity: "skills",
    title: "Skills",
    singular: "skill",
    description: "Technologies listed on the resume, grouped by category. Use Reorder rows to change their order.",
    slugSource: "name",
    columns: [
      { field: "name", header: "Skill", width: 220 },
      { field: "categorySlug", header: "Category", width: 200 },
    ],
    fields: [
      slugField,
      { key: "name", label: "Name", kind: "text" },
      {
        key: "categorySlug",
        label: "Category",
        kind: "reference",
        reference: { entity: "skillCategories", labelField: "name" },
      },
    ],
    empty: () => ({ slug: "", sortOrder: 0, name: "", categorySlug: "" }),
    describe: (record) => text(record.name),
  },
  {
    entity: "skillCategories",
    title: "Skill categories",
    singular: "category",
    description: "Groups for skills, such as Frontend or Cloud & DevOps. Use Reorder rows to change their order.",
    slugSource: "name",
    columns: [{ field: "name", header: "Category", width: 260 }],
    fields: [slugField, { key: "name", label: "Name", kind: "text" }],
    empty: () => ({ slug: "", sortOrder: 0, name: "" }),
    describe: (record) => text(record.name),
  },
  {
    entity: "education",
    title: "Education",
    singular: "education entry",
    description: "Degrees shown on the resume.",
    slugSource: "institution",
    columns: [
      { field: "institution", header: "Institution", width: 260 },
      { field: "degree", header: "Degree", width: 170 },
      { field: "major", header: "Major", width: 170 },
      { field: "graduationDate", header: "Graduated", width: 120 },
    ],
    fields: [
      slugField,
      { key: "institution", label: "Institution", kind: "text" },
      { key: "degree", label: "Degree", kind: "text" },
      { key: "major", label: "Major", kind: "text" },
      { key: "graduationDate", label: "Graduated", hint: "MM/YYYY", kind: "text" },
    ],
    empty: () => ({
      slug: "",
      sortOrder: 0,
      institution: "",
      degree: "",
      major: "",
      graduationDate: "",
    }),
    describe: (record) => text(record.institution),
  },
  {
    entity: "certifications",
    title: "Certifications",
    singular: "certification",
    description: "Certifications shown on the resume.",
    slugSource: "name",
    columns: [
      { field: "name", header: "Certification", width: 320 },
      { field: "date", header: "Date", width: 120 },
    ],
    fields: [
      slugField,
      { key: "name", label: "Name", kind: "text" },
      { key: "date", label: "Date", hint: "MM/YYYY", kind: "text" },
    ],
    empty: () => ({ slug: "", sortOrder: 0, name: "", date: "" }),
    describe: (record) => text(record.name),
  },
  {
    entity: "links",
    title: "Links",
    singular: "link",
    description: "Profile and demo links (LinkedIn, GitHub, live demos). Use Reorder rows to change their order.",
    slugSource: "title",
    columns: [
      { field: "title", header: "Title", width: 260 },
      { field: "url", header: "URL", width: 320 },
    ],
    fields: [
      slugField,
      { key: "title", label: "Title", kind: "text" },
      { key: "url", label: "URL", hint: "Full address including https://", kind: "text" },
    ],
    empty: () => ({ slug: "", sortOrder: 0, title: "", url: "" }),
    describe: (record) => text(record.title),
  },
];

export const definitionFor = (entity: string) =>
  ENTITY_DEFINITIONS.find((definition) => definition.entity === entity);

// Mirrors slugify in @hd/content-schema (the API validates the result), kept
// local so the admin bundle does not pull in zod and every schema at runtime.
export const suggestSlug = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/#/g, "-sharp")
    .replace(/\+/g, "-plus")
    .replace(/&/g, "-and-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
