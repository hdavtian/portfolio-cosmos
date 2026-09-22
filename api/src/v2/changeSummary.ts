// Describes what publishing would change, by comparing the drafts with the live
// release record by record. Comparing content (not update timestamps) means an
// edit that was undone is not reported, and deletions are.

type Record_ = Record<string, unknown>;

export interface ContentSide {
  singletons: Record<string, unknown>;
  collections: Record<string, Record_[]>;
}

interface CollectionWording {
  singular: string;
  plural: string;
  label: (record: Record_) => string;
}

const firstWords = (value: unknown, max = 40): string => {
  const text =
    typeof value === "string"
      ? value
          .replace(/\/n|\\n|<br\s*\/?>/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const field =
  (...keys: string[]) =>
  (record: Record_): string => {
    for (const key of keys) {
      const value = firstWords(record[key]);
      if (value) return value;
    }
    return String(record.slug ?? "");
  };

const COLLECTIONS: Record<string, CollectionWording> = {
  experiences: { singular: "job", plural: "jobs", label: field("company") },
  skills: { singular: "skill", plural: "skills", label: field("name") },
  skillCategories: { singular: "skill category", plural: "skill categories", label: field("name") },
  techStackNodes: { singular: "tech stack node", plural: "tech stack nodes", label: field("name") },
  technologies: { singular: "technology", plural: "technologies", label: field("name") },
  education: { singular: "education entry", plural: "education entries", label: field("institution") },
  certifications: { singular: "certification", plural: "certifications", label: field("name") },
  links: { singular: "link", plural: "links", label: field("title") },
  portfolioCores: { singular: "core", plural: "cores", label: field("name") },
  portfolioEntries: { singular: "project", plural: "projects", label: field("title") },
  moonPortfolioMappings: { singular: "moon filter", plural: "moon filters", label: field("experienceSlug") },
  aboutDeckSlides: { singular: "About slide", plural: "About slides", label: field("slug") },
  pathTravelMessages: { singular: "ride message", plural: "ride messages", label: field("textContent") },
  guidedTours: { singular: "tour", plural: "tours", label: field("name") },
  cosmosPlanets: { singular: "planet", plural: "planets", label: field("cosmicName") },
};

const SINGLETON_NAMES: Record<string, string> = {
  profile: "profile",
  cosmosIntroduction: "cosmos introduction",
};

const FIELD_NAMES: Record<string, string> = {
  galleryMedia: "gallery",
  clientVariants: "client sites",
  mediaId: "image",
  coreSlug: "core",
  categorySlug: "category",
  parentSlug: "parent",
  placement: "orbit",
  textContent: "text",
  fontFamily: "font",
  fontSize: "size",
  fontColor: "color",
  fontShadow: "glow",
  navLabel: "short name",
  jobMemories: "memories",
  jobTech: "tech",
  skillsUsed: "skills used",
  isGrouping: "heading",
  surfaces: "shown in",
  aliases: "also known as",
  technologySlug: "technology",
  coreSlugs: "cores",
  includeEntrySlugs: "included projects",
  excludeEntrySlugs: "excluded projects",
};

const fieldName = (key: string) =>
  FIELD_NAMES[key] ?? key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

// Key order is not meaningful (Mongo and the snapshot can differ), so compare
// with keys sorted.
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested as Record_).sort(([a], [b]) => a.localeCompare(b)))
      : nested,
  );

/** Top-level fields that differ, ignoring the order position. */
const changedFields = (before: Record_, after: Record_): string[] => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete("sortOrder");
  return [...keys].filter((key) => stable(before[key]) !== stable(after[key])).map(fieldName);
};

const withFields = (fields: string[]) => {
  if (fields.length === 0) return "";
  const shown = fields.slice(0, 4).join(", ");
  return ` (${fields.length > 4 ? `${shown} and ${fields.length - 4} more` : shown})`;
};

// Beyond this many adds or deletes in one collection, list a count instead
// (e.g. seeding a whole tech stack), so the notes stay readable.
const LIST_LIMIT = 5;

const bySortOrder = (records: Record_[]) =>
  [...records].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));

/** Short lines such as `Updated project "Disney Inspired" (gallery)`. */
export function summarizeChanges(live: ContentSide, draft: ContentSide): string[] {
  const lines: string[] = [];

  for (const [key, name] of Object.entries(SINGLETON_NAMES)) {
    const before = live.singletons[key] as Record_ | undefined;
    const after = draft.singletons[key] as Record_ | undefined;
    if (!after || stable(before) === stable(after)) continue;
    lines.push(before ? `Updated ${name}${withFields(changedFields(before, after))}` : `Added ${name}`);
  }

  for (const [collection, wording] of Object.entries(COLLECTIONS)) {
    const before = bySortOrder(live.collections[collection] ?? []);
    const after = bySortOrder(draft.collections[collection] ?? []);
    const beforeBySlug = new Map(before.map((record) => [String(record.slug), record]));
    const afterBySlug = new Map(after.map((record) => [String(record.slug), record]));
    const quote = (record: Record_) => `${wording.singular} "${wording.label(record)}"`;

    const added = after.filter((record) => !beforeBySlug.has(String(record.slug)));
    const deleted = before.filter((record) => !afterBySlug.has(String(record.slug)));
    const listOrCount = (verb: string, records: Record_[]) => {
      if (records.length > LIST_LIMIT) lines.push(`${verb} ${records.length} ${wording.plural}`);
      else records.forEach((record) => lines.push(`${verb} ${quote(record)}`));
    };

    listOrCount("Added", added);
    for (const record of after) {
      const previous = beforeBySlug.get(String(record.slug));
      if (!previous) continue;
      const fields = changedFields(previous, record);
      if (fields.length > 0) lines.push(`Updated ${quote(record)}${withFields(fields)}`);
    }
    listOrCount("Deleted", deleted);

    // Order only matters among records on both sides; adding or deleting one
    // is already reported and shifts the others without a real reorder.
    const keptBefore = before.map((record) => String(record.slug)).filter((slug) => afterBySlug.has(slug));
    const keptAfter = after.map((record) => String(record.slug)).filter((slug) => beforeBySlug.has(slug));
    if (stable(keptBefore) !== stable(keptAfter)) lines.push(`Reordered ${wording.plural}`);
  }

  return lines;
}
