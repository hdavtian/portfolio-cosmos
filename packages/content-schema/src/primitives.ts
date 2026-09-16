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

export const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Use a hex color");

// Resume dates are month precision, displayed as written: "04/2018".
export const yearMonthSchema = z
  .string()
  .regex(/^(0[1-9]|1[0-2])\/\d{4}$/, "Use MM/YYYY");

export const httpUrlSchema = z.url({ protocol: /^https?$/ });

export const cssLengthSchema = z
  .string()
  .regex(/^\d+(\.\d+)?(px|rem|em)$/, "Use a length such as 54px");

// text-shadow values such as "0px 0px 34px rgba(80, 198, 255, 0.75)".
export const cssShadowSchema = z
  .string()
  .max(200)
  .regex(/^[a-zA-Z0-9#.,%()\s-]+$/, "Invalid shadow");

export const fontFamilySchema = z
  .array(z.string().regex(/^[A-Za-z0-9 -]+$/, "Invalid font family name"))
  .min(1);

export const isoDateTimeSchema = z.iso.datetime();

// Stable slug from a display name: "C#" -> "c-sharp", "Cloud & DevOps" -> "cloud-and-devops".
export const slugify = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/#/g, "-sharp")
    .replace(/\+/g, "-plus")
    .replace(/&/g, "-and-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Fields every stored entity carries. `version` drives optimistic concurrency.
export const documentMetaSchema = z.object({
  id: objectIdSchema,
  version: z.number().int().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1),
});

export type DocumentMeta = z.infer<typeof documentMetaSchema>;
