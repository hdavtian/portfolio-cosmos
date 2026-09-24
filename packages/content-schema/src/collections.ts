import { z } from "zod";
import { aboutDeckSlideSchema, pathTravelMessageSchema } from "./about.js";
import { cosmosIntroductionSchema, cosmosPlanetSchema, guidedTourSchema } from "./cosmos.js";
import { mediaAssetSchema } from "./media.js";
import { techStackNodeSchema } from "./techStack.js";
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
  skillCategorySchema,
  skillSchema,
} from "./resume.js";

// One document each, stored in the `singletons` collection under `key`.
export const singletonSchemas = {
  profile: profileSchema,
  cosmosIntroduction: cosmosIntroductionSchema,
  // Defaulted, so a release from before it existed still validates, and a
  // publish is not blocked until the order has been saved once.
  resumeSkills: resumeSkillsSchema.default({ headingOrder: [] }),
} as const;

// Ordered, slug-keyed entity collections. The key is the MongoDB collection name.
export const collectionSchemas = {
  education: educationSchema,
  certifications: certificationSchema,
  links: linkSchema,
  skillCategories: skillCategorySchema,
  skills: skillSchema,
  techStackNodes: techStackNodeSchema,
  // The master list (D1). `skills`, `skillCategories` and `techStackNodes`
  // remain until the migration has run and the sites read this instead.
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
