import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { moonPortfolioMapping } from "../../../src/data/moonPortfolioMapping";
import { connectMongo } from "../db/connectMongo.js";
import {
  ContentRepository,
  type UpsertContentInput,
} from "../modules/content/content.repository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "../../../");

const checksum = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const loadJson = async (relativePath: string): Promise<unknown> => {
  const fullPath = path.join(rootDir, relativePath);
  const content = await readFile(fullPath, "utf8");
  return JSON.parse(content);
};

const buildSeedItems = async (): Promise<UpsertContentInput[]> => {
  const sources: Array<{ key: string; category: string; sourcePath: string }> =
    [
      { key: "resume", category: "resume", sourcePath: "src/data/resume.json" },
      {
        key: "portfolio-cores",
        category: "portfolio",
        sourcePath: "src/data/portfolioCores.json",
      },
      {
        key: "about-deck",
        category: "about",
        sourcePath: "src/data/aboutDeck.json",
      },
      {
        key: "about-hall-levels",
        category: "about",
        sourcePath: "src/data/aboutHallLevels.json",
      },
      {
        key: "about-hall-slides",
        category: "about",
        sourcePath: "src/data/aboutHallSlides.json",
      },
      {
        key: "about-hall-slides-level-01",
        category: "about",
        sourcePath: "src/data/aboutHallSlides.level-01-signal-origins.json",
      },
      {
        key: "about-hall-slides-level-02",
        category: "about",
        sourcePath: "src/data/aboutHallSlides.level-02-human-systems.json",
      },
      {
        key: "about-path-travel-messages",
        category: "about",
        sourcePath: "src/data/aboutPathTravelMessages.json",
      },
      {
        key: "cosmic-narrative",
        category: "cosmos",
        sourcePath: "src/data/cosmic-narrative.json",
      },
      {
        key: "about-content",
        category: "about",
        sourcePath: "src/data/aboutContent.json",
      },
      {
        key: "legacy-websites",
        category: "portfolio",
        sourcePath: "src/data/legacyWebsites.json",
      },
    ];

  const mapped = await Promise.all(
    sources.map(async (source) => {
      const payload = await loadJson(source.sourcePath);
      return {
        key: source.key,
        category: source.category,
        payload,
        sourceType: "file-json",
        sourcePath: source.sourcePath,
        checksum: checksum(payload),
      } satisfies UpsertContentInput;
    }),
  );

  mapped.push({
    key: "moon-portfolio-mapping",
    category: "portfolio",
    payload: moonPortfolioMapping,
    sourceType: "file-ts",
    sourcePath: "src/data/moonPortfolioMapping.ts",
    checksum: checksum(moonPortfolioMapping),
  });

  return mapped;
};

const run = async () => {
  await connectMongo();

  const repository = new ContentRepository();
  const items = await buildSeedItems();

  await repository.upsertMany(items);

  console.log(`Seed completed. Upserted ${items.length} content documents.`);
  await mongoose.connection.close();
};

void run().catch(async (error) => {
  console.error("Seed failed", error);
  await mongoose.connection.close();
  process.exit(1);
});
