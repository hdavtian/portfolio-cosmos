import { z } from "zod";
import { aboutDeckSlideSchema, pathTravelMessageSchema } from "./about.js";
import { cosmosIntroductionSchema, cosmosPlanetSchema, guidedTourSchema } from "./cosmos.js";
import { mediaAssetSchema } from "./media.js";
import { technologySchema } from "./technology.js";
import {
  moonPortfolioMappingSchema,
  portfolioCoreSchema,
  portfolioEntrySchema,
} from "./portfolio.js";
import {
  certificationSchema,
  educationSchema,
  experienceSchema,
  linkSchema,
  profileSchema,
  resumeSkillsSchema,
} from "./resume.js";

// One document each, stored in the `singletons` collection under `key`.
export const singletonSchemas = {
  profile: profileSchema,
  cosmosIntroduction: cosmosIntroductionSchema,
  // Defaulted, so a release from before it existed still validates, and a
  // publish is not blocked until the order has been saved once.
  resumeSkills: resumeSkillsSchema.default({ headingOrder: [], closingLines: [] }),
} as const;

// Ordered, slug-keyed entity collections. The key is the MongoDB collection name.
export const collectionSchemas = {
  education: educationSchema,
  certifications: certificationSchema,
  links: linkSchema,
  // The master list (D1). The skills, skill categories and tech stack nodes
  // it absorbed were retired once every site read it (D31).
  technologies: technologySchema,
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
