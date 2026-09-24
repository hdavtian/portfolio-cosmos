// Carries the film's per-job years from the mock timeline onto the skill uses
// in the working database, so the film's progression survives the move from
// src/data/mock/skillTimeline.json to the release (plan: "reconciling the
// film"). Read-only by default; --write updates resume_cosmos_local.
//
//   node scripts/skills-years-from-mock.mjs          dry run: the mapping and what would change
//   node scripts/skills-years-from-mock.mjs --write  apply it
//
// A mock skill maps to one or more technologies (its combined labels were
// split by D2). For each mock use, the job's uses of those technologies get
// the mock's years (from/to as years, or years + when); a job with none of
// them gets one film-only use of the first, so the mock's skill still shows
// at that stop while the moon's labels stay as curated. Uses the mock never
// mentions are left as they are: undated, spanning the whole job.
import { MongoClient } from "mongodb";
import { readFileSync } from "node:fs";
import path from "node:path";

const write = process.argv.includes("--write");
const repoRoot = path.resolve(import.meta.dirname, "..");
const mock = JSON.parse(readFileSync(path.join(repoRoot, "src/data/mock/skillTimeline.json"), "utf8"));

const JOBS = { "stormscape-now": "stormscape-freelance" };

// Mock skill → technology slugs. Empty: nothing in the master list carries it.
const SKILLS = {
  "csharp-dotnet": ["c-sharp", "net"],
  "csharp-webapi": ["asp-net-core-web-api"],
  java: ["java", "spring-boot"],
  php: ["php"],
  node: ["node-js", "express-js"],
  angular: ["angular"],
  react: ["react", "redux"],
  nextjs: ["next-js"],
  typescript: ["typescript"],
  javascript: ["javascript"],
  "html-css": ["html", "css"],
  jquery: ["jquery"],
  animation: ["gsap", "framer-motion"],
  azure: ["azure"],
  aws: ["aws"],
  docker: ["docker"],
  cicd: ["ci-cd"],
  "linux-hosting": ["linux", "lamp", "web-hosting"],
  datacenter: ["data-center-operations"],
  sql: ["mysql", "postgresql"],
  mongodb: ["mongodb"],
  rabbitmq: ["rabbitmq"],
  cms: ["wordpress", "drupal", "shopsite", "e-commerce"],
  playwright: ["playwright"],
  selenium: ["selenium", "testng"],
  "test-platforms": [],
  "team-lead": [],
  "product-owner": ["product"],
  "client-delivery": ["client-delivery"],
  scss: ["scss"],
  "tech-support": ["technical-support", "desktop-support"],
  networking: ["networking", "dial-up", "isdn"],
  sales: ["sales"],
  "dns-domains": ["dns", "domains"],
};

const client = new MongoClient("mongodb://127.0.0.1:27017");
await client.connect();
const db = client.db("resume_cosmos_local");
const technologies = new Set((await db.collection("technologies").find({}, { projection: { slug: 1 } }).toArray()).map((t) => t.slug));
const experiences = await db.collection("experiences").find({}).toArray();
const bySlug = new Map(experiences.map((job) => [job.slug, job]));

const unknownTech = [...new Set(Object.values(SKILLS).flat())].filter((slug) => !technologies.has(slug));
if (unknownTech.length) {
  console.error("These mapped slugs are not in the technologies list:", unknownTech.join(", "));
  process.exit(1);
}

const years = (use) => {
  if (use.from !== undefined) return { from: String(use.from), to: use.to !== undefined ? String(use.to) : undefined };
  return { years: use.years, when: use.when };
};

let dated = 0;
let added = 0;
const skipped = [];
const plan = new Map(); // job slug → { doc, uses }
for (const mockJob of mock.jobs) {
  const jobSlug = JOBS[mockJob.slug] ?? mockJob.slug;
  const job = bySlug.get(jobSlug);
  if (!job) {
    skipped.push(`${mockJob.slug}: no experience "${jobSlug}"`);
    continue;
  }
  const uses = (job.skillsUsed ?? []).map((use) => ({ ...use }));
  for (const mockUse of mockJob.uses) {
    const targets = SKILLS[mockUse.skill];
    if (!targets) {
      skipped.push(`${mockJob.slug}/${mockUse.skill}: not in the mapping`);
      continue;
    }
    if (targets.length === 0) {
      skipped.push(`${mockJob.slug}/${mockUse.skill}: nothing in the list carries it`);
      continue;
    }
    // The migration already decided which technologies each job used; the
    // mock only dates them. A combined label ("SQL databases") dates every
    // one of its technologies the job has, never invents the others. Only
    // when the job has none of them does the first one get a film-only use,
    // so the mock's skill still shows at that stop.
    const dates = Object.fromEntries(Object.entries(years(mockUse)).filter(([, v]) => v !== undefined));
    const present = uses.filter((use) => targets.includes(use.technologySlug));
    if (present.length > 0) {
      for (const existing of present) {
        delete existing.from;
        delete existing.to;
        delete existing.years;
        delete existing.when;
        Object.assign(existing, dates);
        dated += 1;
      }
    } else {
      uses.push({ technologySlug: targets[0], ...dates, surfaces: ["filmDestination"], highlightMatches: [] });
      added += 1;
    }
  }
  plan.set(jobSlug, { doc: job, uses });
}

for (const [slug, { uses }] of plan) {
  console.log(`\n${slug}`);
  for (const use of uses) {
    const when = use.from ? `${use.from}–${use.to ?? "end"}` : use.years ? `${use.years}y${use.when ? "/" + use.when : ""}` : "whole job";
    console.log(`  ${use.technologySlug.padEnd(24)} ${when.padEnd(12)} ${(use.surfaces ?? []).join(",")}`);
  }
}
console.log(`\nDated ${dated} existing uses, would add ${added} film-only uses.`);
if (skipped.length) console.log("Skipped:\n  " + skipped.join("\n  "));

if (write) {
  const now = new Date();
  for (const [slug, { doc, uses }] of plan) {
    await db.collection("experiences").updateOne(
      { _id: doc._id },
      { $set: { skillsUsed: uses, updatedAt: now, updatedBy: "owner" }, $inc: { version: 1 } },
    );
    console.log(`wrote ${slug}`);
  }
} else {
  console.log("\nDry run: nothing written. Add --write to apply.");
}
await client.close();
