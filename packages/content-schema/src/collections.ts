import { z } from "zod";
import { aboutDeckSlideSchema, pathTravelMessageSchema } from "./about";
import { cosmosIntroductionSchema, cosmosPlanetSchema, guidedTourSchema } from "./cosmos";
import { mediaAssetSchema } from "./media";
import {
  moonPortfolioMappingSchema,
  portfolioCoreSchema,
  portfolioEntrySchema,
} from "./portfolio";
import {
  certificationSchema,
  educationSchema,
  experienceSchema,
  linkSchema,
  profileSchema,
  skillCategorySchema,
  skillSchema,
} from "./resume";

// One document each, stored in the `singletons` collection under `key`.
export const singletonSchemas = {
  profile: profileSchema,
  cosmosIntroduction: cosmosIntroductionSchema,
} as const;

// Ordered, slug-keyed entity collections. The key is the MongoDB collection name.
export const collectionSchemas = {
  education: educationSchema,
  certifications: certificationSchema,
  links: linkSchema,
  skillCategories: skillCategorySchema,
  skills: skillSchema,
  experiences: experienceSchema,
  portfolioCores: portfolioCoreSchema,
  portfolioEntries: portfolioEntrySchema,
  moonPortfolioMappings: moonPortfolioMappingSchema,
  aboutDeckSlides: aboutDeckSlideSchema,
  pathTravelMessages: pathTravelMessageSchema,
  guidedTours: guidedTourSchema,
  cosmosPlanets: cosmosPlanetSchema,
} as const;

export const MEDIA_COLLECTION = "media";
export const SINGLETONS_COLLECTION = "singletons";

export type SingletonName = keyof typeof singletonSchemas;
export type CollectionName = keyof typeof collectionSchemas;

export const contentBundleSchema = z.object({
  singletons: z.object(singletonSchemas),
  collections: z.object(
    Object.fromEntries(
      Object.entries(collectionSchemas).map(([name, schema]) => [name, z.array(schema)]),
    ) as { [K in CollectionName]: z.ZodArray<(typeof collectionSchemas)[K]> },
  ),
});

export type ContentBundle = z.infer<typeof contentBundleSchema>;

export { mediaAssetSchema };
