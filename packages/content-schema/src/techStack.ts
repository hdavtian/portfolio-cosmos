import { z } from "zod";
import { slugSchema, sortOrderSchema } from "./primitives.js";

// One node of the nested tech stack (portfolio site, D3 skills graph). Separate
// from the resume's skills, which stay one level deep. See techStackTree.ts for
// tree validation and nesting.
export const techStackNodeSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  name: z.string().trim().min(1).max(100),
  // "" for a top-level node; otherwise the slug of another node.
  parentSlug: z.union([slugSchema, z.literal("")]).default(""),
});

export type TechStackNode = z.infer<typeof techStackNodeSchema>;
