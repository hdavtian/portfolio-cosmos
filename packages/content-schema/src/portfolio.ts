import { z } from "zod";
import { hexColorSchema, httpUrlSchema, mediaRefSchema, slugSchema, sortOrderSchema } from "./primitives.js";

const text = (max = 500) => z.string().trim().min(1).max(max);

/**
 * Commentary on one image (HD-14): rich text as HTML from the admin's editor,
 * "" for none. The API cleans it to a short list of tags on save and the site
 * cleans it again before showing it.
 */
export const imageCommentSchema = z.string().trim().max(10_000).default("");

export const imageFitSchema = z.enum(["cover", "contain"]);

export const galleryItemSchema = z.object({
  slug: slugSchema,
  type: z.literal("image"),
  mediaId: mediaRefSchema,
  title: text(200),
  description: text(2000),
  fit: imageFitSchema,
  comment: imageCommentSchema,
});

const yearSchema = z.number().int().min(1990).max(2100).nullable();

/**
 * A link shown on a project's page on the main site (HD-13), e.g. the live
 * site. URL and label are required; the description is optional ("" = none).
 */
export const projectLinkSchema = z.object({
  url: httpUrlSchema,
  label: text(120),
  description: z.string().trim().max(500).default(""),
});

// A client site grouped under a portfolio entry (e.g. one restaurant site).
export const clientVariantSchema = z.object({
  slug: slugSchema,
  title: text(200),
  mediaId: mediaRefSchema,
  /** Commentary on the client site's own image (HD-14). */
  coverComment: imageCommentSchema,
  description: text(4000),
  /** Links into the master list. A client site is tagged on its own (D32). */
  technologySlugs: z.array(slugSchema).default([]),
  year: yearSchema,
  fit: imageFitSchema,
  galleryMedia: z.array(galleryItemSchema).default([]),
  /** Shown on this client site's own page on the main site (HD-13). */
  links: z.array(projectLinkSchema).default([]),
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
  /** Commentary on the project's own image (HD-14). */
  coverComment: imageCommentSchema,
  description: text(4000),
  /**
   * Links into the master technology list (plan 4.5); a site renders the
   * linked record's name, which is what makes html/HTML one tag. The
   * free-text list that came before was retired in D32.
   */
  technologySlugs: z.array(slugSchema).default([]),
  year: yearSchema,
  fit: imageFitSchema,
  galleryMedia: z.array(galleryItemSchema).default([]),
  /**
   * Shown on the project's page on the main site (HD-13). An entry with client
   * sites isn't listed there itself (each client site is), so its links live
   * on the client sites instead.
   */
  links: z.array(projectLinkSchema).default([]),
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
export type ProjectLink = z.infer<typeof projectLinkSchema>;
export type MoonPortfolioMapping = z.infer<typeof moonPortfolioMappingSchema>;
