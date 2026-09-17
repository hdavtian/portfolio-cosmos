import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  collectLegacyImagePaths,
  collectionSchemas,
  diffJson,
  fromLegacy,
  LEGACY_EXCLUDED_PATHS,
  toLegacy,
  type LegacyContent,
} from "../src";
import { moonPortfolioMapping } from "../../../src/data/moonPortfolioMapping";

const readData = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`../../../src/data/${file}`, import.meta.url), "utf8")) as T;

const loadLegacy = (): LegacyContent => ({
  resume: readData("resume.json"),
  portfolioCores: readData("portfolioCores.json"),
  moonPortfolioMapping,
  aboutDeck: readData("aboutDeck.json"),
  aboutPathTravelMessages: readData("aboutPathTravelMessages.json"),
  cosmicNarrative: readData("cosmic-narrative.json"),
});

// Deterministic fake media ids so the transform can run without a database.
const fakeMedia = (paths: string[]) => {
  const idByPath = new Map(paths.map((p, i) => [p, i.toString(16).padStart(24, "0")]));
  const pathById = new Map([...idByPath].map(([p, id]) => [id, p]));
  return {
    resolve: (p: string) => {
      const id = idByPath.get(p);
      if (!id) throw new Error(`Unknown media path ${p}`);
      return id;
    },
    path: (id: string) => pathById.get(id) ?? `missing:${id}`,
  };
};

describe("legacy content round trip", () => {
  const legacy = loadLegacy();
  const media = fakeMedia(collectLegacyImagePaths(legacy));
  const bundle = fromLegacy(legacy, media.resolve);

  it("reproduces every modeled value from the source files", () => {
    const differences = diffJson(legacy, toLegacy(bundle, media.path), LEGACY_EXCLUDED_PATHS);
    expect(differences).toEqual([]);
  });

  it("only excludes paths that exist in the source", () => {
    const withoutExclusions = diffJson(legacy, toLegacy(bundle, media.path));
    const hit = LEGACY_EXCLUDED_PATHS.filter((pattern) =>
      withoutExclusions.some((d) => {
        const segments = pattern.split(".");
        return d.path
          .split(".")
          .slice(0, segments.length)
          .every((s, i) => segments[i] === "*" || segments[i] === s);
      }),
    );
    expect(hit).toEqual([...LEGACY_EXCLUDED_PATHS]);
  });

  it("produces unique slugs within every collection", () => {
    for (const name of Object.keys(collectionSchemas) as Array<keyof typeof collectionSchemas>) {
      const slugs = bundle.collections[name].map((item) => item.slug);
      expect(new Set(slugs).size, name).toBe(slugs.length);
    }
  });

  it("has the expected entity counts", () => {
    const counts = Object.fromEntries(
      Object.entries(bundle.collections).map(([name, items]) => [name, items.length]),
    );
    expect(counts).toEqual({
      education: 1,
      certifications: 1,
      links: 5,
      skillCategories: 5,
      skills: 18,
      // A copy of the skills to start from: 5 categories + 18 skills.
      techStackNodes: 23,
      experiences: 7,
      portfolioCores: 6,
      portfolioEntries: 47,
      moonPortfolioMappings: 6,
      aboutDeckSlides: 3,
      pathTravelMessages: 17,
      guidedTours: 3,
      cosmosPlanets: 3,
    });
  });

  // 206 image paths exist across src/data; the 4 About card images belong to
  // aboutContent.json, which is no longer used and is not modeled.
  it("references 202 images", () => {
    expect(collectLegacyImagePaths(legacy)).toHaveLength(202);
  });
});
