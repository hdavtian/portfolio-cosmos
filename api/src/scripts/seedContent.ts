import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

// Seeds only the keys the API still serves. The retired documents stay in the
// database untouched; they are simply no longer refreshed or reachable.
const buildSeedItems = async (): Promise<UpsertContentInput[]> => {
  const sources: Array<{ key: string; category: string; sourcePath: string }> =
    [
      { key: "resume", category: "resume", sourcePath: "src/data/resume.json" },
      {
        key: "portfolio-cores",
        category: "portfolio",
        sourcePath: "src/data/portfolioCores.json",
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
