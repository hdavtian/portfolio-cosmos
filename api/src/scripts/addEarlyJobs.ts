// Adds the two earliest jobs (Earthlink, HostPro) as Experiences, from the
// details already in src/data/resume.json. Local database only.
//   npm run db:add-early-jobs
//
// Validates against the Experience schema, skips any that already exist, and
// places them after the last existing job. Drafts only: publish from admin.
import { readFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { experienceSchema } from "@hd/content-schema";
import { env } from "../config/env.js";
import { connectMongo } from "../db/connectMongo.js";
import { getDb } from "../v2/db.js";
import { EntityRepository } from "../v2/entityRepository.js";

const SLUGS = ["hostpro", "earthlink"];
const rootDir = path.resolve(import.meta.dirname, "../../../");

const run = async () => {
  if (!/localhost|127\.0\.0\.1/.test(env.MONGODB_URI) || !env.MONGODB_DB_NAME.endsWith("_local")) {
    throw new Error("Refusing to run: this script only writes to the local database.");
  }
  await connectMongo();
  const repository = new EntityRepository(getDb(), "experiences");
  const resume = JSON.parse(await readFile(path.join(rootDir, "src/data/resume.json"), "utf8")) as {
    experience: Array<Record<string, unknown> & { id: string }>;
  };

  const existing = await repository.findAll();
  let sortOrder = Math.max(-1, ...existing.map((entry) => Number(entry.sortOrder)));

  for (const slug of SLUGS) {
    if (existing.some((entry) => entry.slug === slug)) {
      console.log(`[early-jobs] ${slug}: already there, skipped`);
      continue;
    }
    const source = resume.experience.find((entry) => entry.id === slug);
    if (!source) throw new Error(`${slug} is not in src/data/resume.json`);
    const { id, Projects, ...rest } = source;
    sortOrder += 1;
    const record = experienceSchema.parse({ ...rest, slug: id, sortOrder, projects: Projects ?? [] });
    await repository.create(record, "script:add-early-jobs");
    console.log(`[early-jobs] ${slug}: added at position ${sortOrder}`);
  }
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
