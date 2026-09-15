import { z } from "zod";

// Stable, human-readable ids. Existing ids such as "investcloud",
// "hs-slide-1" and "path-msg-01" already fit this shape and are preserved.
export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/, "Invalid id");

// Entities reference media by id, never by file path.
export const mediaRefSchema = objectIdSchema;

export const sortOrderSchema = z.number().int().min(0);

// Content uses hex and rgb()/rgba()/hsl()/hsla() colors.
export const cssColorSchema = z
  .string()
  .trim()
  .regex(
    /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/+-]+\))$/,
    "Use a hex, rgb(a) or hsl(a) color",
  );

export const isoDateTimeSchema = z.iso.datetime();

// Fields every stored entity carries. `version` drives optimistic concurrency.
export const documentMetaSchema = z.object({
  id: objectIdSchema,
  version: z.number().int().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1),
});

export type DocumentMeta = z.infer<typeof documentMetaSchema>;
