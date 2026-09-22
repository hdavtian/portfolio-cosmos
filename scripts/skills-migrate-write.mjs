// Writes the skills consolidation into a LOCAL database copy.
//
//   npm run skills:write                 # reads resume_cosmos_prodcopy, writes resume_cosmos_migrated
//   npm run skills:write -- --from=X --to=Y
//
// It cannot reach production: every read and write goes through
// `docker exec scrolling-resume-mongo mongosh`, which only sees the local
// container. Production is written later by db:push-prod, after Harma has read
// the diff and curated the visibility ticks (D15).
//
// The target database is dropped and rebuilt each run, so this is repeatable:
// correct scripts/lib/skills-plan.mjs, run again, read the diff again.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GROUPINGS, MERGES, PROSE, RETIRED, TREE } from "./lib/skills-plan.mjs";
import { resolve as applyRules } from "./lib/skills-rules.mjs";

const container = "scrolling-resume-mongo";
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const fromDb = arg("from", "resume_cosmos_prodcopy");
const toDb = arg("to", "resume_cosmos_migrated");

// A local container cannot host production, but a wrong name here would still
// overwrite something Harma cares about. The working database is not a target.
if (/^resume_cosmos$/.test(toDb) || toDb === "resume_cosmos_local") {
  console.error(`[skills:write] Refusing to write to "${toDb}". Use a scratch database.`);
  process.exit(1);
}

const mongo = (script) =>
  execFileSync("docker", ["exec", "-i", container, "mongosh", "--quiet", "--eval", script], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });

/**
 * The migration payload is far past the limit for a command-line argument, so
 * it goes in as a file and runs inside the container.
 */
const mongoScript = (script) => {
  const dir = mkdtempSync(path.join(tmpdir(), "skills-write-"));
  const local = path.join(dir, "migrate.js");
  writeFileSync(local, script, "utf8");
  execFileSync("docker", ["cp", local, `${container}:/tmp/skills-migrate.js`], { stdio: "pipe" });
  try {
    return execFileSync("docker", ["exec", container, "mongosh", "--quiet", "/tmp/skills-migrate.js"], {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
  } finally {
    execFileSync("docker", ["exec", container, "rm", "-f", "/tmp/skills-migrate.js"], { stdio: "pipe" });
  }
};

const read = (collection) =>
  JSON.parse(mongo(`JSON.stringify(db.getSiblingDB(${JSON.stringify(fromDb)}).${collection}.find({}).toArray())`));

// ---------------------------------------------------------------- resolving

const fold = (value) => String(value).trim().toLowerCase().replace(/\s+/g, " ");

/** Slug generation, with a suffix when two names want the same slug (D26). */
const taken = new Set();
const slugify = (name) => {
  const base =
    name
      .normalize("NFKD")
      .replace(/#/g, "-sharp")
      .replace(/\+/g, "-plus")
      .replace(/&/g, "-and-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "technology";
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  taken.add(slug);
  return slug;
};

const prose = new Set(PROSE.map(fold));
const retired = new Set(Object.keys(RETIRED).map(fold));
const mergeInto = new Map(Object.entries(MERGES).map(([from, to]) => [fold(from), to]));

/**
 * sortOrder is the tree read depth first - a heading, then everything under
 * it, then the next heading - which is how the grid renumbers after any drag
 * (see planMove in TechnologiesPage). Numbering by declaration order instead
 * would put React's children after Next.js, and the first drag in admin would
 * silently correct it.
 */
const declarationOrder = Object.keys(TREE);
const depthFirst = [];
const walkNames = (parentName) => {
  for (const name of declarationOrder) {
    if (TREE[name] !== parentName) continue;
    depthFirst.push(name);
    walkNames(name);
  }
};
walkNames(null);

// The tree is the authority on which technologies exist and where they sit.
const technologies = new Map(); // folded name -> record
depthFirst.forEach((name, index) => {
  const parentName = TREE[name];
  technologies.set(fold(name), {
    slug: slugify(name),
    sortOrder: index,
    name,
    parentName,
    parentSlug: "",
    isGrouping: false,
    featured: false,
    current: false,
    // Every visibility option on (D15); curated in admin before publishing.
    surfaces: parentName === null || TREE[name] === null ? [] : [],
    aliases: new Set(),
  });
});
if (depthFirst.length !== declarationOrder.length) {
  console.error(`[skills:write] ${declarationOrder.length - depthFirst.length} entries are unreachable from a root.`);
  process.exit(1);
}
for (const record of technologies.values()) {
  record.isGrouping = GROUPINGS.has(record.name);
  record.parentSlug = record.parentName ? (technologies.get(fold(record.parentName))?.slug ?? "") : "";
  record.surfaces = ["lattice", "resume", "filmProgress", "filters"];
}

const unmatched = [];
/**
 * A source string -> the technology records it means, or [] with a reason.
 * Two stages: the naming rules split and fold the string into atoms (R1-R10),
 * then the curation maps each atom onto the tree (merge, prose, or a record).
 */
const resolveString = (raw, where) => {
  const value = String(raw).trim();
  if (!value) return [];
  const key = fold(value);
  if (prose.has(key) || retired.has(key)) return [];

  // A whole string that is itself a merge or a record wins before splitting, so
  // "Adobe Test & Target" is never torn in half by the ampersand.
  const whole = technologies.get(key) ?? null;
  if (whole) return [whole];
  const mergedWhole = mergeInto.get(key);
  if (mergedWhole) {
    const targets = mergedWhole.map((name) => technologies.get(fold(name))).filter(Boolean);
    // Only a string meaning exactly one technology is an alias of it. A string
    // that splits ("React + Redux") is an alias of neither part, or it would be
    // claimed twice and the picker could not resolve it (D25).
    if (targets.length === 1) targets[0].aliases.add(value);
    if (targets.length) return targets;
  }

  const { parts } = applyRules(value);
  if (parts.length === 0) return [];

  const found = [];
  for (const part of parts) {
    const partKey = fold(part);
    if (prose.has(partKey) || retired.has(partKey)) continue;
    const record = technologies.get(partKey);
    if (record) {
      if (partKey !== key && parts.length === 1) record.aliases.add(value);
      found.push(record);
      continue;
    }
    const merged = mergeInto.get(partKey);
    if (merged) {
      const targets = merged.map((name) => technologies.get(fold(name))).filter(Boolean);
      if (targets.length === 1 && parts.length === 1) targets[0].aliases.add(value);
      found.push(...targets);
      continue;
    }
    // Held for review rather than dropped or auto-created (D25).
    unmatched.push({ raw: part, from: value, where });
  }
  return found;
};

// ---------------------------------------------------------------- the data

const experiences = read("experiences");
const entries = read("portfolioEntries");

const skillUses = new Map(); // experience slug -> uses
const memoryChanges = [];
const harvested = [];

for (const experience of experiences) {
  const uses = [];
  const seen = new Set();
  const addUse = (record, { highlightMatches = [], style, source }) => {
    if (seen.has(record.slug)) {
      // Same technology named twice on one job (a label and a memory): one use,
      // and the highlight words merge rather than one quietly winning.
      const existing = uses.find((use) => use.technologySlug === record.slug);
      for (const word of highlightMatches) {
        if (!existing.highlightMatches.includes(word)) existing.highlightMatches.push(word);
      }
      if (style && !existing.style) existing.style = style;
      return false;
    }
    seen.add(record.slug);
    uses.push({
      technologySlug: record.slug,
      surfaces: ["moonLabel", "flyBy", "filmDestination"],
      highlightMatches: [...highlightMatches],
      ...(style ? { style } : {}),
      _source: source,
    });
    return true;
  };

  for (const tech of experience.jobTech ?? []) {
    for (const record of resolveString(tech.label, `${experience.slug} jobTech`)) {
      addUse(record, { highlightMatches: tech.highlightMatches ?? [], source: "label" });
    }
  }

  // Memories: a technology name becomes a use, prose stays (D12).
  const keptMemories = [];
  for (const memory of experience.jobMemories ?? []) {
    const text = String(memory.text ?? "").trim();
    if (memory.type !== "tech" && memory.type !== "code") {
      keptMemories.push({ type: memory.type, text, ...(memory.style ? { style: memory.style } : {}) });
      continue;
    }
    if (prose.has(fold(text))) {
      // Mislabelled prose: kept, re-typed, and it keeps the look it had.
      keptMemories.push({ type: "memory", text, ...(memory.type === "code" ? { style: "code" } : {}) });
      memoryChanges.push({ job: experience.slug, text, action: "re-typed as prose" });
      continue;
    }
    const records = resolveString(text, `${experience.slug} ${memory.type} memory`);
    if (records.length === 0) {
      keptMemories.push({ type: "memory", text, ...(memory.type === "code" ? { style: "code" } : {}) });
      memoryChanges.push({ job: experience.slug, text, action: "kept as prose (no technology matched)" });
      continue;
    }
    let isNew = false;
    for (const record of records) {
      if (addUse(record, { style: memory.type === "code" ? "code" : undefined, source: memory.type })) isNew = true;
    }
    if (isNew) harvested.push({ job: experience.slug, text, became: records.map((r) => r.name).join(", ") });
    memoryChanges.push({
      job: experience.slug,
      text,
      action: isNew ? "became a skill used" : "deleted (already a label on this job)",
    });
  }

  skillUses.set(experience.slug, { uses, memories: keptMemories });
}

// Project tags become links to the master list (plan 4.5).
const entryTags = new Map();
for (const entry of entries) {
  const slugs = [];
  for (const tag of entry.technologies ?? []) {
    for (const record of resolveString(tag, `${entry.slug} project tag`)) {
      if (!slugs.includes(record.slug)) slugs.push(record.slug);
    }
  }
  entryTags.set(entry.slug, slugs);
}

// ---------------------------------------------------------------- writing

// Records written straight into Mongo still need the metadata every document
// carries: admin sends `version` back when saving, and `updatedBy` is how a
// script-created record is told apart from a hand-edited one.
const now = new Date().toISOString();
// Dates are written as real Date objects inside the container script below:
// the storage layer calls toISOString() on them, so an ISO string here would
// read back as a 500 from every admin list.
const meta = { version: 1, updatedBy: "script:skills-migrate" };

const technologyDocs = [...technologies.values()]
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((record) => ({
    slug: record.slug,
    sortOrder: record.sortOrder,
    name: record.name,
    parentSlug: record.parentSlug,
    isGrouping: record.isGrouping,
    // Emphasis, not visibility: ticking everything would make it meaningless,
    // so Harma chooses the few (D21).
    featured: false,
    current: false,
    surfaces: record.surfaces,
    aliases: [...record.aliases].sort(),
    ...meta,
  }));

const experienceUpdates = experiences.map((experience) => {
  const plan = skillUses.get(experience.slug);
  return {
    slug: experience.slug,
    skillsUsed: plan.uses.map(({ _source, ...use }) => use),
    jobMemories: plan.memories,
  };
});

const script = `
const src = db.getSiblingDB(${JSON.stringify(fromDb)});
const dst = db.getSiblingDB(${JSON.stringify(toDb)});
dst.dropDatabase();
for (const name of src.getCollectionNames()) {
  const docs = src.getCollection(name).find({}).toArray();
  if (docs.length) dst.getCollection(name).insertMany(docs);
}
dst.technologies.insertMany(${JSON.stringify(technologyDocs)});
const stamp = new Date(${JSON.stringify(now)});
dst.technologies.updateMany({}, { $set: { createdAt: stamp, updatedAt: stamp } });
dst.technologies.createIndex({ slug: 1 }, { unique: true });
dst.technologies.createIndex({ sortOrder: 1 });
for (const update of ${JSON.stringify(experienceUpdates)}) {
  dst.experiences.updateOne(
    { slug: update.slug },
    {
      $set: { skillsUsed: update.skillsUsed, jobMemories: update.jobMemories, updatedAt: stamp, updatedBy: "script:skills-migrate" },
      $inc: { version: 1 },
    },
  );
}
for (const entry of ${JSON.stringify([...entryTags].map(([slug, technologySlugs]) => ({ slug, technologySlugs })))}) {
  dst.portfolioEntries.updateOne(
    { slug: entry.slug },
    {
      $set: { technologySlugs: entry.technologySlugs, updatedAt: stamp, updatedBy: "script:skills-migrate" },
      $inc: { version: 1 },
    },
  );
}
print("technologies: " + dst.technologies.countDocuments());
print("experiences with skillsUsed: " + dst.experiences.countDocuments({ "skillsUsed.0": { $exists: true } }));
`;
const output = mongoScript(script);

// ---------------------------------------------------------------- the diff

const before = {
  technologyRecords: read("techStackNodes").length + read("skills").length + read("skillCategories").length,
  jobTechLabels: experiences.reduce((n, e) => n + (e.jobTech ?? []).length, 0),
  memories: experiences.reduce((n, e) => n + (e.jobMemories ?? []).length, 0),
};
const after = {
  technologyRecords: technologyDocs.length,
  skillUses: experienceUpdates.reduce((n, e) => n + e.skillsUsed.length, 0),
  memories: experienceUpdates.reduce((n, e) => n + e.jobMemories.length, 0),
};

const L = [];
L.push("# Skills migration: what it wrote");
L.push("");
L.push(`\`${fromDb}\` -> \`${toDb}\`, ${new Date().toISOString().slice(0, 16).replace("T", " ")}. Production untouched.`);
L.push("");
L.push("| | Before | After |");
L.push("|---|---|---|");
L.push(`| Technology records | ${before.technologyRecords} (tree + skills + categories) | **${after.technologyRecords}** |`);
L.push(`| Free-text job labels | ${before.jobTechLabels} | 0 |`);
L.push(`| Skill uses | 0 | **${after.skillUses}** |`);
L.push(`| Memories | ${before.memories} | ${after.memories} (prose only) |`);
L.push("");
L.push("## Skill uses per job");
L.push("");
L.push("| Job | Uses | From labels | Harvested from memories |");
L.push("|---|---|---|---|");
for (const experience of experiences) {
  const plan = skillUses.get(experience.slug);
  const fromLabels = plan.uses.filter((use) => use._source === "label").length;
  L.push(
    `| ${experience.slug} | ${plan.uses.length} | ${fromLabels} | ${plan.uses.length - fromLabels} |`,
  );
}
L.push("");
L.push("## Technologies rescued from memories");
L.push("");
L.push("Recorded nowhere else. Deleting the tech memories without harvesting these");
L.push("would have lost them silently.");
L.push("");
if (harvested.length === 0) L.push("None.");
for (const item of harvested) L.push(`- **${item.became}** - from \`${item.text}\` on ${item.job}`);
L.push("");
L.push("## What happened to every tech and code memory");
L.push("");
L.push("| Job | Memory | Action |");
L.push("|---|---|---|");
for (const change of memoryChanges) L.push(`| ${change.job} | \`${change.text}\` | ${change.action} |`);
L.push("");
L.push("## Prose memories that are a technology name");
L.push("");
L.push("Left untouched: these are `memory` type, which the migration does not");
L.push("claim to clean up (D12 covers `tech` and `code`). Each duplicates a skill");
L.push("the job already records, so they are Harma's to keep or remove.");
L.push("");
const technologyNames = new Set([...technologies.values()].map((record) => fold(record.name)));
const proseDuplicates = experienceUpdates.flatMap((experience) =>
  experience.jobMemories
    .filter((memory) => technologyNames.has(fold(memory.text)))
    .map((memory) => `- \`${memory.text}\` on ${experience.slug}`),
);
if (proseDuplicates.length === 0) L.push("None.");
for (const line of proseDuplicates) L.push(line);
L.push("");
L.push("## Unmatched: nothing was created or dropped for these");
L.push("");
L.push("Each needs a decision: add a technology, add an alias to an existing one,");
L.push("or leave it out. Auto-creating is how junk got into the tree the first time.");
L.push("");
if (unmatched.length === 0) L.push("None.");
const byString = new Map();
for (const item of unmatched) {
  const list = byString.get(item.raw) ?? [];
  list.push(item.where);
  byString.set(item.raw, list);
}
for (const [raw, wheres] of [...byString].sort()) L.push(`- \`${raw}\` - ${[...new Set(wheres)].join("; ")}`);
L.push("");

writeFileSync("docs/skills-migration-result.md", L.join("\n"), "utf8");

console.log(output.trim());
console.log(`[skills:write] ${after.technologyRecords} technologies, ${after.skillUses} skill uses, ${after.memories} memories kept.`);
console.log(`[skills:write] ${harvested.length} technologies harvested from memories, ${byString.size} strings unmatched.`);
console.log("[skills:write] Report: docs/skills-migration-result.md");
