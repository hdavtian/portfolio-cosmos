import { z } from "zod";
import { slugSchema, sortOrderSchema } from "./primitives";

const text = (max = 500) => z.string().trim().min(1).max(max);

// Singleton.
export const cosmosIntroductionSchema = z.object({
  title: text(200),
  subtitle: text(300),
  description: text(4000),
});

export const guidedTourSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  name: text(100),
  description: text(1000),
  duration: text(40),
  // Scene object keys the tour visits, e.g. "sun", "experience", "investcloud".
  waypoints: z.array(text(60)).min(1),
});

// Narrative text for a planet. Camera positions, visual effects and moon
// descriptions in cosmic-narrative.json are not read by the experience and are
// intentionally not modeled.
export const cosmosPlanetSchema = z.object({
  slug: slugSchema,
  sortOrder: sortOrderSchema,
  cosmicName: text(100),
  description: text(2000),
  atmosphere: text(2000),
});

export type CosmosIntroduction = z.infer<typeof cosmosIntroductionSchema>;
export type GuidedTour = z.infer<typeof guidedTourSchema>;
export type CosmosPlanet = z.infer<typeof cosmosPlanetSchema>;
