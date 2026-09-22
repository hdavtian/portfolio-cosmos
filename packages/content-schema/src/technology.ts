import { z } from "zod";
import { slugSchema, sortOrderSchema } from "./primitives.js";

// The master technology list (tech-consolidation-plan.md, D1). One record per
// technology, one spelling, one home in the tree. It supersedes `skills`,
// `skillCategories` and `techStackNodes`, which stay in place until the
// migration has run.
//
// Slugs are immutable once created and names are freely editable (D25): every
// surface displays the name, and skill uses, project tags and memories point at
// the slug, so renaming can never break a link.

/** Where a technology may appear. Each value names one screen (D20, D23). */
export const technologySurfaceSchema = z.enum([
  /** The universe's Skills Lattice. */
  "lattice",
  /** The resume's skills section. */
  "resume",
  /** The film's Skill Progress screen. */
  "filmProgress",
  /** Offered as a filter: the home page chips and the Portfolio drop-down. */
  "filters",
]);

export const TECHNOLOGY_SURFACES = technologySurfaceSchema.options;

export const technologySchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  name: z.string().trim().min(1).max(100),
  /** "" for a top-level entry; otherwise the slug of another technology. */
  parentSlug: z.union([slugSchema, z.literal("")]).default(""),
  /**
   * A heading, not a skill anyone claims (D16/D22). Screens that show skills
   * only skip these. It is marked rather than inferred from having children,
   * because React, AWS and Azure are real technologies that are also parents.
   */
  isGrouping: z.boolean().default(false),
  /**
   * Worth putting in front of a recruiter (D21/D22). The resume summary and the
   * film's closing list read only these. Emphasis, not visibility.
   */
  featured: z.boolean().default(false),
  /** Part of the stack in use today (D5). */
  current: z.boolean().default(false),
  surfaces: z.array(technologySurfaceSchema).default([]),
  /**
   * Every source string that meant this technology (R8): "React + Redux" and
   * ".NET Web API" among them. Kept so the migration is auditable, so admin
   * pickers match what Harma types, and so a mistaken merge can be undone.
   */
  aliases: z.array(z.string().trim().min(1).max(100)).default([]),
  blurb: z.string().trim().max(300).optional(),
});

export type Technology = z.infer<typeof technologySchema>;
export type TechnologySurface = z.infer<typeof technologySurfaceSchema>;
