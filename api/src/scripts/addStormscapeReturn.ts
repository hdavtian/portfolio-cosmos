// Adds StormScape's second period (freelance, Jul 2025 to present) as its own
// Experience, first in the list. Local database only.
//   npm run db:add-stormscape-return
//
// Validates against the Experience schema and skips if already there. Draft
// only: publish from admin.
import mongoose from "mongoose";
import { experienceSchema } from "@hd/content-schema";
import { env } from "../config/env.js";
import { connectMongo } from "../db/connectMongo.js";
import { getDb } from "../v2/db.js";
import { EntityRepository } from "../v2/entityRepository.js";

const SLUG = "stormscape-freelance";
const BY = "script:add-stormscape-return";

const record = {
  slug: SLUG,
  sortOrder: 0,
  company: "StormScape (Freelance)",
  navLabel: "StormScape",
  location: "Glendale, CA",
  startDate: "07/2025",
  droneIntroText:
    "Back to the studio as a principal full stack developer: a dental product catalog platform, this portfolio and its 3D experiences, and private management tools, all deployed to Azure.",
  positions: [
    {
      title: "Principal Full Stack Developer",
      startDate: "07/2025",
      responsibilities: [
        "Architected and built Hydrodent, a dental product catalog platform, with React, Next.js, TypeScript, Tailwind as the public site, an admin dashboard app for backend management powered by an Express/TypeScript API using Prisma and MySQL.",
        "Hydrodent: Syncfusion data grids with paging, sorting, filtering, and grouping, file uploads.",
        "Hydrodent: integrated Meilisearch for fast product search and a graceful fallback to database queries.",
        "Hydrodent: automated deployments to Azure App Service with GitHub Actions.",
        "Hydrodent: scheduled database backups.",
        "Built harmadavtian.com, an interactive portfolio site featuring Three.js 3D experiences.",
        "Built private React/Express/MySQL management tools with AG Grid, including a technical knowledge base with rich-text and syntax-highlighted code notes and a job-search tracker, both deployed to Azure via GitHub Actions and publicly accessible as third level domains.",
        "Using AI-assisted development (Claude Code, Cursor, OpenAI Codex) to speed up delivery while owning architecture, code review, and quality of all shipped code.",
      ],
    },
  ],
  projects: [],
  jobMemories: [],
};

const run = async () => {
  if (!/localhost|127\.0\.0\.1/.test(env.MONGODB_URI) || !env.MONGODB_DB_NAME.endsWith("_local")) {
    throw new Error("Refusing to run: this script only writes to the local database.");
  }
  await connectMongo();
  const repository = new EntityRepository(getDb(), "experiences");
  const existing = await repository.findAll();
  if (existing.some((entry) => entry.slug === SLUG)) {
    console.log(`[stormscape-return] ${SLUG}: already there, skipped`);
    return;
  }
  await repository.create(experienceSchema.parse(record), BY);
  // Newest job first; everything else keeps its order behind it.
  await repository.reorder([SLUG, ...existing.map((entry) => String(entry.slug))], BY);
  console.log(`[stormscape-return] ${SLUG}: added first; ${existing.length} others moved down one`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
