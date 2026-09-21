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

export const skillCategorySchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  name: text(100),
});

export const skillSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  categorySlug: slugSchema,
  name: text(100),
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

export const jobMemoryTypeSchema = z.enum(["tech", "memory", "code"]);

export const jobMemorySchema = z.object({
  type: jobMemoryTypeSchema,
  text: text(500),
});

// Tech chips on a job; highlightMatches are the resume terms each chip lights up.
export const jobTechSchema = z.object({
  label: text(100),
  highlightMatches: z.array(text(100)),
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
  jobTech: z.array(jobTechSchema).default([]),
});

export type Profile = z.infer<typeof profileSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Certification = z.infer<typeof certificationSchema>;
export type Link = z.infer<typeof linkSchema>;
export type SkillCategory = z.infer<typeof skillCategorySchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Experience = z.infer<typeof experienceSchema>;
