// Tech stack tree helpers. Deliberately free of zod so the sites can import
// them (via "@hd/content-schema/tech-stack-tree") without bundling schemas.
//
// The tech stack is separate from the resume's skills on purpose: the resume
// stays one level deep (category → skill), while the tech stack can nest as
// deep as needed for the portfolio site and the D3 skills graph.

/** Stored shape of one node; `parentSlug` is "" for a top-level node. */
export interface TechStackNodeRecord {
  slug: string;
  sortOrder: number;
  name: string;
  parentSlug: string;
}

export interface TechStackTreeNode {
  slug: string;
  name: string;
  children: TechStackTreeNode[];
}

export interface TechStackIssue {
  /** Index of the offending node in the list it was given. */
  index: number;
  message: string;
}

/**
 * Problems that make the list an invalid tree: a parent that does not exist,
 * a node that is its own parent, or a loop (A under B under A).
 */
export function techStackIssues(nodes: readonly TechStackNodeRecord[]): TechStackIssue[] {
  const bySlug = new Map(nodes.map((node) => [node.slug, node]));
  const issues: TechStackIssue[] = [];

  nodes.forEach((node, index) => {
    if (!node.parentSlug) return;
    if (node.parentSlug === node.slug) {
      issues.push({ index, message: "cannot be its own parent" });
      return;
    }
    if (!bySlug.has(node.parentSlug)) {
      issues.push({ index, message: `has a parent ("${node.parentSlug}") that does not exist` });
      return;
    }
    const seen = new Set([node.slug]);
    let current = bySlug.get(node.parentSlug);
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
 * Nests the flat list. Siblings follow sortOrder; nodes with a missing parent
 * or inside a loop are left out rather than breaking the whole tree.
 */
export function buildTechStackTree(nodes: readonly TechStackNodeRecord[]): TechStackTreeNode[] {
  const invalid = new Set(techStackIssues(nodes).map((issue) => nodes[issue.index]?.slug));
  const ordered = [...nodes]
    .filter((node) => !invalid.has(node.slug))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const childrenOf = new Map<string, TechStackNodeRecord[]>();
  for (const node of ordered) {
    const list = childrenOf.get(node.parentSlug) ?? [];
    list.push(node);
    childrenOf.set(node.parentSlug, list);
  }

  const build = (parentSlug: string): TechStackTreeNode[] =>
    (childrenOf.get(parentSlug) ?? []).map((node) => ({
      slug: node.slug,
      name: node.name,
      children: build(node.slug),
    }));

  return build("");
}

/** A two-level tree from the resume's skill map, used before a tech stack exists. */
export function techStackTreeFromSkills(skills: Record<string, string[]>): TechStackTreeNode[] {
  return Object.entries(skills).map(([category, names]) => ({
    slug: `category-${category}`,
    name: category,
    children: names.map((name) => ({ slug: `skill-${category}-${name}`, name, children: [] })),
  }));
}
