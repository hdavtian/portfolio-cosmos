// Config-driven admin sections. Simple entities share one list page and one
// full-page editor; each is described here instead of hand-writing near
// identical pages. Entities with nested content (experiences, portfolio) keep
// bespoke pages.

export type FieldKind =
  | "text"
  | "multiline"
  | "reference"
  | "boolean"
  /** A short, fixed set of options, all visible: read the state without opening anything. */
  | "checkboxes"
  /** The same, behind a dropdown. For sets too long to show at once. */
  | "multiselect"
  | "tags";

export interface FieldDefinition {
  key: string;
  label: string;
  hint?: string;
  kind: FieldKind;
  /** For `reference` fields: the entity whose slug is stored, and its label field. */
  reference?: { entity: string; labelField: string };
  /**
   * For `reference` fields: an empty choice with this label is offered and
   * stored as "". For a self-reference (a tree), the record itself and its
   * descendants are left out, so a loop cannot be chosen.
   */
  emptyOption?: string;
  /**
   * For `checkboxes` and `multiselect` fields: the choices, stored as an array
   * of values. A choice's `hint` says what ticking it does, listed under the
   * control so each option explains itself rather than sharing one paragraph.
   */
  options?: { value: string; label: string; hint?: string }[];
  /**
   * Set once, on creation, and read-only afterwards. Used for the slug of
   * anything other records point at: changing it would silently break every
   * link, and the display name is editable instead.
   */
  immutableAfterCreate?: boolean;
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
  /** The list page is shared, but editing uses a bespoke page (see AdminApp). */
  customEditor?: boolean;
  /** Editing is shared, but the list is a bespoke page (see AdminApp). */
  customList?: boolean;
}

const slugField: FieldDefinition = {
  key: "slug",
  label: "Slug",
  hint: "Lowercase id with hyphens; suggested from the name for new records",
  kind: "text",
};

/** For entities other records point at by slug: the id is fixed after creation. */
const fixedSlugField: FieldDefinition = {
  ...slugField,
  hint: "Fixed once saved: jobs and projects point at this id. Rename the technology instead - every screen shows the name.",
  immutableAfterCreate: true,
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

export const ENTITY_DEFINITIONS: EntityDefinition[] = [
  {
    entity: "skills",
    title: "Skills",
    singular: "skill",
    description: "Technologies listed on the resume, grouped by category. Drag a row by its handle to change the order.",
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
    description: "Groups for skills, such as Frontend or Cloud & DevOps. Drag a row by its handle to change the order.",
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
    description: "Profile and demo links (LinkedIn, GitHub, live demos). Drag a row by its handle to change the order.",
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
  {
    entity: "technologies",
    title: "Technologies",
    singular: "technology",
    description:
      "The one list of technologies. Everything else - a job's skills, a project's tags - points at an entry here, so a name is typed once and corrected once. Drag a row onto another to nest it, or above or below a row to reorder.",
    slugSource: "name",
    columns: [],
    fields: [
      fixedSlugField,
      { key: "name", label: "Name", kind: "text" },
      {
        key: "parentSlug",
        label: "Parent",
        hint: "Its one home in the tree. A skill has exactly one parent; if it seems to belong in two places, it is two skills.",
        kind: "reference",
        reference: { entity: "technologies", labelField: "name" },
        emptyOption: "— Top level —",
      },
      {
        key: "isGrouping",
        label: "Heading",
        hint: "A heading, not a skill you claim. Headings organise the tree (Frontend, Databases, APIs). Screens that show skills only - the film's Skill Progress, moon labels, the home page chips - skip them.",
        kind: "boolean",
      },
      {
        key: "current",
        label: "Current stack",
        hint: "Part of the stack you work in today. Marks it as current wherever a site separates present from past.",
        kind: "boolean",
      },
      {
        key: "surfaces",
        label: "Shown in",
        hint: "A project's own technology list is not set here; edit the project.",
        kind: "checkboxes",
        options: [
          {
            value: "lattice",
            label: "Skills Lattice (universe)",
            hint: "appears in the universe's Skills Lattice",
          },
          {
            value: "resume",
            label: "Resume skills",
            hint: "on the resume's skills section and the film's closing list. A ticked heading gets its own line; a ticked skill is printed on the line of the nearest ticked heading above it. Nothing is inherited: tick the heading and each skill you want printed",
          },
          {
            value: "filmProgress",
            label: "Film: Skill Progress",
            hint: "appears on the film's Skill Progress screen",
          },
          {
            value: "filters",
            label: "Filters",
            hint:
              "offered as a filter in the home page chips and the universe Portfolio drop-down - but only once at " +
              "least one project is tagged with it, since a filter that finds nothing is not shown. Leave off for " +
              "something like HTML that nearly every project uses",
          },
        ],
      },
      {
        key: "aliases",
        label: "Also known as",
        hint: "Older names and the combined labels this replaced, one per line. Typing any of them finds this technology, and nothing else may claim the same one.",
        kind: "tags",
      },
      {
        key: "blurb",
        label: "Blurb",
        hint: "Optional one line, mainly for headings.",
        kind: "multiline",
      },
    ],
    empty: () => ({
      slug: "",
      sortOrder: 0,
      name: "",
      parentSlug: "",
      isGrouping: false,
      current: false,
      surfaces: ["lattice", "filmProgress", "filters"],
      aliases: [],
      blurb: "",
    }),
    describe: (record) => text(record.name),
    customList: true,
  },
  {
    entity: "techStackNodes",
    title: "Tech stack",
    singular: "tech stack node",
    description:
      "Nested tech stack for the portfolio site and the D3 skills graph, any depth (e.g. Frontend › Frameworks › React). Separate from the resume's Skills, which stay one level deep. Order within a level follows the drag handle.",
    slugSource: "name",
    columns: [],
    fields: [
      slugField,
      { key: "name", label: "Name", kind: "text" },
      {
        key: "parentSlug",
        label: "Parent",
        hint: "Leave at top level for a main branch",
        kind: "reference",
        reference: { entity: "techStackNodes", labelField: "name" },
        emptyOption: "— Top level —",
      },
    ],
    empty: () => ({ slug: "", sortOrder: 0, name: "", parentSlug: "" }),
    describe: (record) => text(record.name),
    customList: true,
  },
  {
    entity: "pathTravelMessages",
    title: "Ride messages",
    singular: "ride message",
    description:
      "Only used in the Three.js app. Messages shown one after another while Mjolnir pulls you along the About path, in this order. Drag a row by its handle to change the order.",
    slugSource: "textContent",
    columns: [
      { field: "textContent", header: "Message", width: 420 },
      { field: "fontSize", header: "Size", width: 90 },
    ],
    fields: [],
    empty: () => ({
      slug: "",
      sortOrder: 0,
      textContent: "",
      fontFamily: ["Oswald", "Montserrat", "Arial", "sans-serif"],
      fontSize: "54px",
      fontColor: "rgba(242, 251, 255, 0.99)",
      fontShadow: "0px 0px 34px rgba(80, 198, 255, 0.75)",
    }),
    describe: (record) => text(record.textContent).split("\n")[0].slice(0, 60),
    customEditor: true,
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
