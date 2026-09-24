import { z } from "zod";
import { httpUrlSchema, slugSchema, sortOrderSchema, yearMonthSchema } from "./primitives.js";

const text = (max = 500) => z.string().trim().min(1).max(max);

// Singleton.
export const profileSchema = z.object({
  name: text(100),
  title: text(150),
  email: z.email(),
  phone: text(40),
  location: text(150),
  summary: text(4000),
});

/**
 * Singleton: the order of the resume's skills lines (D28). Each line is a
 * heading ticked for the Resume surface; this is the order they print in.
 * A ticked heading missing from the list prints after the listed ones, in
 * tree order, so a newly ticked heading never disappears. The list is the
 * whole record: one document, one save, nothing spread across the tree.
 */
export const resumeSkillsSchema = z.object({
  headingOrder: z.array(slugSchema).default([]),
});

export const educationSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  institution: text(200),
  degree: text(200),
  major: text(200),
  graduationDate: yearMonthSchema,
});

export const certificationSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  name: text(200),
  date: yearMonthSchema,
});

export const linkSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  title: text(200),
  url: httpUrlSchema,
});

export const positionSchema = z.object({
  title: text(200),
  startDate: yearMonthSchema.optional(),
  endDate: yearMonthSchema.optional(),
  responsibilities: z.array(text(2000)),
});

export const experienceProjectSchema = z.object({
  slug: slugSchema,
  title: text(200),
  summary: text(2000),
});

/**
 * How a thing is drawn as it flies past a moon (D13/D14). A name, never a font
 * or a colour: the appearance of each token lives in one table in the site, so
 * restyling every code box is one edit rather than one per record. Empty means
 * the default for its kind.
 */
export const flyByStyleSchema = z.enum(["plain", "code", "handwritten"]);

export const FLY_BY_STYLES = flyByStyleSchema.options;

/**
 * A prose memory that drifts past the job's moon (D12): its text and how it
 * is drawn. The old `type` (tech / memory / code) became `style` in D32;
 * the technology names it used to carry live in skillsUsed.
 */
export const jobMemorySchema = z.object({
  text: text(500),
  style: flyByStyleSchema.default("plain"),
});

/** Where one skill may appear for one job (D20). */
export const skillUseSurfaceSchema = z.enum([
  /** The labels on the job's moon. */
  "moonLabel",
  /** The memories that drift past when you enter orbit. */
  "flyBy",
  /** The ring, banner or branch at this stop in the film. */
  "filmDestination",
]);

export const SKILL_USE_SURFACES = skillUseSurfaceSchema.options;

/** Where a skill's years sat inside the job, when the dates are not known. */
export const skillUseWhenSchema = z.enum(["start", "middle", "end"]);

/**
 * A year ("2018") or a month and year ("04/2018") - one field taking either,
 * so an imprecise memory of 1997 costs no more to record than last year (D18).
 * A bare year counts as the whole year; a use is capped at the job's own length
 * either way, so vagueness can never inflate a total.
 */
export const skillDateSchema = z
  .string()
  .regex(/^(\d{4}|(0[1-9]|1[0-2])\/\d{4})$/, "Use YYYY or MM/YYYY");

/**
 * One technology used at one job: the years, and where it shows. This replaces
 * jobTech's free-text labels and is where the film's per-job history lives
 * (plan 4.3). Stated one of four ways, most precise first: from/to, years plus
 * when, years alone, or nothing at all - which counts as the whole job and is
 * what every migrated label becomes.
 */
export const skillUseSchema = z.object({
  technologySlug: slugSchema,
  from: skillDateSchema.optional(),
  to: skillDateSchema.optional(),
  years: z.number().min(0).max(60).optional(),
  when: skillUseWhenSchema.optional(),
  surfaces: z.array(skillUseSurfaceSchema).default([]),
  style: flyByStyleSchema.optional(),
  /** The resume terms this skill lights up when hovered on the moon. */
  highlightMatches: z.array(text(100)).default([]),
});

export const experienceSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  company: text(200),
  navLabel: text(60),
  location: text(150),
  startDate: yearMonthSchema,
  // Left out while the job is still current; the sites show "Present".
  endDate: yearMonthSchema.optional(),
  droneIntroText: text(2000),
  positions: z.array(positionSchema).min(1),
  projects: z.array(experienceProjectSchema).default([]),
  jobMemories: z.array(jobMemorySchema).default([]),
  skillsUsed: z.array(skillUseSchema).default([]),
});

export type Profile = z.infer<typeof profileSchema>;
export type ResumeSkills = z.infer<typeof resumeSkillsSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Certification = z.infer<typeof certificationSchema>;
export type Link = z.infer<typeof linkSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type SkillUse = z.infer<typeof skillUseSchema>;
export type SkillUseSurface = z.infer<typeof skillUseSurfaceSchema>;
export type FlyByStyle = z.infer<typeof flyByStyleSchema>;
