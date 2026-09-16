import { z } from "zod";
import {
  cssColorSchema,
  cssLengthSchema,
  cssShadowSchema,
  fontFamilySchema,
  mediaRefSchema,
  slugSchema,
  sortOrderSchema,
} from "./primitives.js";
import { defineTemplate, templateKeys } from "./templates.js";

const text = (max = 500) => z.string().trim().min(1).max(max);

// About deck block templates (rendered by the Three.js About ride).
export const aboutDeckBlockTemplates = {
  text: defineTemplate({
    key: "text",
    label: "Text block",
    description: "Title with a paragraph of body text.",
    schema: z.object({ type: z.literal("text"), title: text(200), body: text(2000) }),
  }),
  image: defineTemplate({
    key: "image",
    label: "Image block",
    description: "Title with a single image.",
    schema: z.object({ type: z.literal("image"), title: text(200), mediaId: mediaRefSchema }),
  }),
};

export const aboutDeckBlockTypes = templateKeys(aboutDeckBlockTemplates);

export const aboutDeckBlockSchema = z.discriminatedUnion("type", [
  aboutDeckBlockTemplates.text.schema,
  aboutDeckBlockTemplates.image.schema,
]);

export const revealPatternSchema = z.enum(["scanline", "center-out", "spiral"]);

export const aboutDeckSlideSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  // Appearance
  holdMs: z.number().int().min(500).max(60000),
  explodeAfter: z.boolean(),
  reveal: z.object({
    pattern: revealPatternSchema,
    blockStaggerMs: z.number().int().min(0).max(5000),
    cellRevealMs: z.number().int().min(0).max(10000),
  }),
  // Content
  blocks: z.array(aboutDeckBlockSchema).min(1),
});

// Messages shown along the About travel path. textContent may contain <br>
// and newlines, which the renderer turns into line breaks.
export const pathTravelMessageSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  textContent: text(1000),
  // Appearance
  fontFamily: fontFamilySchema,
  fontSize: cssLengthSchema,
  fontColor: cssColorSchema,
  fontShadow: cssShadowSchema,
});

export type AboutDeckSlide = z.infer<typeof aboutDeckSlideSchema>;
export type AboutDeckBlock = z.infer<typeof aboutDeckBlockSchema>;
export type PathTravelMessage = z.infer<typeof pathTravelMessageSchema>;
