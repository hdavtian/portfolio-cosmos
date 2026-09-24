// Technology tree helpers. Deliberately free of zod so the sites can import
// them (via "@hd/content-schema/technology-tree") without bundling schemas.
//
// One tree, read two ways (D4): nested where a reader wants the breakdown,
// flattened where a screen shows skills only. Flattening drops groupings, which
// are marked rather than inferred (D16), because React, AWS and Azure are real
// technologies that happen to have children.

/** Stored shape of one technology; `parentSlug` is "" at the top level. */
export interface TechnologyRecord {
  slug: string;
  sortOrder: number;
  name: string;
  parentSlug: string;
  isGrouping?: boolean;
  current?: boolean;
  surfaces?: readonly string[];
  aliases?: readonly string[];
  blurb?: string;
}

export interface TechnologyTreeNode {
  slug: string;
  name: string;
  isGrouping: boolean;
  children: TechnologyTreeNode[];
}

export interface TechnologyIssue {
  /** Index of the offending record in the list it was given. */
  index: number;
  message: string;
}

const fold = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Everything that makes the list invalid: a parent that does not exist, a
 * record that is its own parent, a loop, two records whose names collide
 * case-insensitively (R2), and an alias claimed by more than one record or
 * colliding with a name (D25).
 *
 * Slug uniqueness is not checked here: the unique index on the collection is
 * the only guarantee that survives two simultaneous saves (D26). This reports
 * what a human can fix before saving.
 */
export function technologyIssues(records: readonly TechnologyRecord[]): TechnologyIssue[] {
  const bySlug = new Map(records.map((record) => [record.slug, record]));
  const issues: TechnologyIssue[] = [];

  // Names, then aliases, share one namespace: a typed string must resolve to
  // exactly one record or the picker is ambiguous.
  const claimedBy = new Map<string, number>();
  const claim = (value: string, index: number, what: string) => {
    const key = fold(value);
    if (!key) return;
    const owner = claimedBy.get(key);
    if (owner !== undefined && owner !== index) {
      issues.push({
        index,
        message: `${what} "${value}" is already used by "${records[owner]?.name}"`,
      });
      return;
    }
    claimedBy.set(key, index);
  };
  records.forEach((record, index) => claim(record.name, index, "the name"));
  records.forEach((record, index) => {
    for (const alias of record.aliases ?? []) claim(alias, index, "the alias");
  });

  records.forEach((record, index) => {
    if (!record.parentSlug) return;
    if (record.parentSlug === record.slug) {
      issues.push({ index, message: "cannot be its own parent" });
      return;
    }
    if (!bySlug.has(record.parentSlug)) {
      issues.push({ index, message: `has a parent ("${record.parentSlug}") that does not exist` });
      return;
    }
    const seen = new Set([record.slug]);
    let current = bySlug.get(record.parentSlug);
    while (current?.parentSlug) {
      if (seen.has(current.slug)) {
        issues.push({ index, message: "is inside a loop of parents" });
        return;
      }
      seen.add(current.slug);
      current = bySlug.get(current.parentSlug);
    }
  });

  return issues;
}

/**
 * Would moving `slug` under `parentSlug` make it its own ancestor? Asked before
 * a drag is accepted: without the check one move creates a loop and every tree
 * render fails at once (D25). A record's whole subtree moves with it.
 */
export function wouldCycle(
  records: readonly TechnologyRecord[],
  slug: string,
  parentSlug: string,
): boolean {
  if (!parentSlug) return false;
  if (parentSlug === slug) return true;
  const bySlug = new Map(records.map((record) => [record.slug, record]));
  const seen = new Set<string>();
  let current = bySlug.get(parentSlug);
  while (current) {
    if (current.slug === slug) return true;
    if (seen.has(current.slug)) return false;
    seen.add(current.slug);
    current = current.parentSlug ? bySlug.get(current.parentSlug) : undefined;
  }
  return false;
}

/** What still points at a technology, so it can be merged rather than deleted (D25). */
export interface TechnologyReferences {
  children: string[];
  skillUses: number;
  projectTags: number;
}

export const isReferenced = (references: TechnologyReferences): boolean =>
  references.children.length > 0 || references.skillUses > 0 || references.projectTags > 0;

/**
 * Nests the flat list. Siblings follow sortOrder; a record with a missing
 * parent or inside a loop is left out rather than breaking the whole tree.
 */
export function buildTechnologyTree(records: readonly TechnologyRecord[]): TechnologyTreeNode[] {
  const invalid = new Set(technologyIssues(records).map((issue) => records[issue.index]?.slug));
  const ordered = [...records]
    .filter((record) => !invalid.has(record.slug))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const childrenOf = new Map<string, TechnologyRecord[]>();
  for (const record of ordered) {
    const list = childrenOf.get(record.parentSlug) ?? [];
    list.push(record);
    childrenOf.set(record.parentSlug, list);
  }

  const build = (parentSlug: string): TechnologyTreeNode[] =>
    (childrenOf.get(parentSlug) ?? []).map((record) => ({
      slug: record.slug,
      name: record.name,
      isGrouping: record.isGrouping ?? false,
      children: build(record.slug),
    }));

  return build("");
}

/**
 * The skills for a screen that shows no headings: leaves and real technologies,
 * never groupings (D16). `surface` narrows it to what that screen may show.
 */
export function flattenTechnologies(
  records: readonly TechnologyRecord[],
  surface?: string,
): TechnologyRecord[] {
  return [...records]
    .filter((record) => !record.isGrouping)
    .filter((record) => !surface || (record.surfaces ?? []).includes(surface))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * A grouping with nothing visible under it renders no heading (D25), so the
 * empty AI heading never reaches the resume while its records are being
 * entered. Counts descendants, not just children: a grouping of groupings is
 * empty too.
 */
export function hasVisibleChildren(
  records: readonly TechnologyRecord[],
  slug: string,
  surface?: string,
): boolean {
  const children = records.filter((record) => record.parentSlug === slug);
  return children.some((child) => {
    if (!child.isGrouping) {
      return !surface || (child.surfaces ?? []).includes(surface);
    }
    return hasVisibleChildren(records, child.slug, surface);
  });
}

/** The top-level ancestor, which is the heading a skill shows under (Q2/D4). */
export function headingFor(
  records: readonly TechnologyRecord[],
  slug: string,
): TechnologyRecord | undefined {
  const bySlug = new Map(records.map((record) => [record.slug, record]));
  const seen = new Set<string>();
  let current = bySlug.get(slug);
  while (current?.parentSlug) {
    if (seen.has(current.slug)) return undefined;
    seen.add(current.slug);
    current = bySlug.get(current.parentSlug);
  }
  return current;
}
