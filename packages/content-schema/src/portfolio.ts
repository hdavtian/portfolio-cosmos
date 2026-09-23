import { z } from "zod";
import { hexColorSchema, mediaRefSchema, slugSchema, sortOrderSchema } from "./primitives.js";

const text = (max = 500) => z.string().trim().min(1).max(max);

export const imageFitSchema = z.enum(["cover", "contain"]);

export const galleryItemSchema = z.object({
  slug: slugSchema,
  type: z.literal("image"),
  mediaId: mediaRefSchema,
  title: text(200),
  description: text(2000),
  fit: imageFitSchema,
});

const yearSchema = z.number().int().min(1990).max(2100).nullable();

// A client site grouped under a portfolio entry (e.g. one restaurant site).
export const clientVariantSchema = z.object({
  slug: slugSchema,
  title: text(200),
  mediaId: mediaRefSchema,
  description: text(4000),
  technologies: z.array(text(60)),
  /** Links into the master list; empty means "same as the parent project". */
  technologySlugs: z.array(slugSchema).default([]),
  year: yearSchema,
  fit: imageFitSchema,
  galleryMedia: z.array(galleryItemSchema).default([]),
});

// Appearance: the 3D layout groups entries into tilted planes of colored rings.
export const portfolioRingSchema = z.object({
  orbitColor: hexColorSchema,
});

export const portfolioPlaneSchema = z.object({
  angle: z.number().min(-90).max(90),
  rings: z.array(portfolioRingSchema).min(1),
});

export const portfolioCoreSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  name: text(100),
  color: hexColorSchema,
  planes: z.array(portfolioPlaneSchema).min(1),
});

export const portfolioEntrySchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  coreSlug: slugSchema,
  placement: z.object({
    plane: z.number().int().min(0),
    ring: z.number().int().min(0),
  }),
  title: text(200),
  mediaId: mediaRefSchema,
  description: text(4000),
  technologies: z.array(text(60)),
  /**
   * Links into the master technology list (plan 4.5). The free-text
   * `technologies` above stays until every site reads these; a site renders
   * the linked record's name, which is what makes html/HTML one tag.
   */
  technologySlugs: z.array(slugSchema).default([]),
  year: yearSchema,
  fit: imageFitSchema,
  galleryMedia: z.array(galleryItemSchema).default([]),
  clientVariants: z.array(clientVariantSchema).default([]),
});

// Which portfolio entries appear on each experience moon in the 3D experience.
export const moonPortfolioTabSchema = z.object({
  slug: slugSchema,
  title: text(100),
  includeEntrySlugs: z.array(slugSchema).default([]),
});

export const moonPortfolioMappingSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  experienceSlug: slugSchema,
  coreSlugs: z.array(slugSchema).default([]),
  includeEntrySlugs: z.array(slugSchema).default([]),
  excludeEntrySlugs: z.array(slugSchema).default([]),
  tabs: z.array(moonPortfolioTabSchema).default([]),
});

export type PortfolioCore = z.infer<typeof portfolioCoreSchema>;
export type PortfolioEntry = z.infer<typeof portfolioEntrySchema>;
export type ClientVariant = z.infer<typeof clientVariantSchema>;
export type GalleryItem = z.infer<typeof galleryItemSchema>;
export type MoonPortfolioMapping = z.infer<typeof moonPortfolioMappingSchema>;
