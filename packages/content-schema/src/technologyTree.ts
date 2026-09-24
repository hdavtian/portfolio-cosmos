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

/** A node of the Skills lattice: what the universe draws. */
export interface LatticeNode {
  slug: string;
  name: string;
  children: LatticeNode[];
}

/**
 * The Skills lattice (D20): every record ticked for the `lattice` surface,
 * nested as in the tree, and a heading only where something visible sits
 * under it. Nothing is inherited: React appears with Hooks beneath it only if
 * Hooks is ticked itself.
 */
export function latticeTree(records: readonly TechnologyRecord[]): LatticeNode[] {
  const shown = (record: TechnologyRecord) =>
    record.isGrouping
      ? hasVisibleChildren(records, record.slug, "lattice")
      : (record.surfaces ?? []).includes("lattice");
  const toNode = (node: TechnologyTreeNode): LatticeNode => ({
    slug: node.slug,
    name: node.name,
    children: node.children.map(toNode),
  });
  return buildTechnologyTree(records.filter(shown)).map(toNode);
}

/**
 * The lattice as the Skills planet's moons read it: each top-level heading's
 * name to the names of the skills under it, at any depth, in tree order.
 */
export function latticeByHeading(records: readonly TechnologyRecord[]): Record<string, string[]> {
  const leaves = (node: LatticeNode): string[] =>
    node.children.length === 0 ? [node.name] : [node.name, ...node.children.flatMap(leaves)].filter((name, i, all) => all.indexOf(name) === i);
  const bySlug = new Map(records.map((record) => [record.slug, record]));
  return Object.fromEntries(
    latticeTree(records).map((root) => [
      root.name,
      root.children.flatMap((child) => (bySlug.get(child.slug)?.isGrouping ? child.children.flatMap(leaves) : leaves(child))),
    ]),
  );
}

/** One line of the resume's skills section: a heading and its skills. */
export interface ResumeSkillLine {
  slug: string;
  name: string;
  skills: string[];
}

/**
 * The resume's skills lines (D27/D28), shared by the site that prints them
 * and the admin page that orders them. One tick decides it: `resume` in
 * `surfaces`. A ticked heading gets its own line, top-level or nested; a
 * ticked skill is printed on the line of the nearest ticked heading above it;
 * nothing is inherited, and a line with no skills is not printed. Lines
 * follow `headingOrder`; ticked headings not in it come after, in tree order.
 * Skills within a line stay in tree order.
 */
export function resumeSkillLines(
  records: readonly TechnologyRecord[],
  headingOrder: readonly string[] = [],
): ResumeSkillLine[] {
  const ordered = [...records].sort((a, b) => a.sortOrder - b.sortOrder);
  const bySlug = new Map(ordered.map((record) => [record.slug, record]));
  const onResume = (record: TechnologyRecord) => (record.surfaces ?? []).includes("resume");
  const lineFor = (record: TechnologyRecord): string | null => {
    const seen = new Set<string>([record.slug]);
    let parent = record.parentSlug ? bySlug.get(record.parentSlug) : undefined;
    while (parent && !seen.has(parent.slug)) {
      if (parent.isGrouping && onResume(parent)) return parent.slug;
      seen.add(parent.slug);
      parent = parent.parentSlug ? bySlug.get(parent.parentSlug) : undefined;
    }
    return null;
  };
  const lines = ordered
    .filter((record) => record.isGrouping && onResume(record))
    .map((heading) => ({
      slug: heading.slug,
      name: heading.name,
      skills: ordered
        .filter((record) => !record.isGrouping && onResume(record) && lineFor(record) === heading.slug)
        .map((record) => record.name),
    }))
    .filter((line) => line.skills.length > 0);
  const rank = new Map(headingOrder.map((slug, index) => [slug, index]));
  const unlisted = headingOrder.length;
  return lines
    .map((line, treeIndex) => ({ line, key: [rank.get(line.slug) ?? unlisted, treeIndex] as const }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1])
    .map(({ line }) => line);
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
