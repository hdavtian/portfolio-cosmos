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
