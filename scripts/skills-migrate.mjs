// Plans the skills consolidation (docs/tech-consolidation-plan.md, D1/D11).
//
//   npm run skills:migrate                      # dry run against the prod copy
//   npm run skills:migrate -- --db=<name>        # another local database
//
// READ ONLY. It never writes to any database. It reads a local database,
// applies the naming rules R1-R10 and the exception list, and writes a report
// to docs/skills-migration-dryrun.md plus the proposed records as JSON in
// db-backups/. Writing the result is a separate step, once Harma has read the
// report and corrected the exceptions.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CATEGORY_NAMES, fold, resolve } from "./lib/skills-rules.mjs";

const container = "scrolling-resume-mongo";
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const dbName = arg("db", "resume_cosmos_prodcopy");

const read = (collection) => {
  const out = execFileSync(
    "docker",
    [
      "exec",
      container,
      "mongosh",
      "--quiet",
      "--eval",
      `JSON.stringify(db.getSiblingDB(${JSON.stringify(dbName)}).${collection}.find({}).toArray())`,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(out);
};

// ---------------------------------------------------------------- the plan

const skills = read("skills");
const categories = read("skillCategories");
const nodes = read("techStackNodes");
const experiences = read("experiences");
const entries = read("portfolioEntries");

/** name (folded) -> record */
const master = new Map();
const upsert = (name, source, parentName) => {
  const key = fold(name);
  if (!master.has(key)) {
    master.set(key, { name, slug: null, parentName: parentName ?? null, aliases: new Set(), sources: new Set() });
  }
  const record = master.get(key);
  if (parentName && !record.parentName) record.parentName = parentName;
  record.sources.add(source);
  return record;
};

const unresolved = [];
const trace = [];
const take = (raw, source, parentName) => {
  const { parts, rule } = resolve(raw);
  if (parts.length === 0) {
    unresolved.push({ raw, source, rule });
    return [];
  }
  const names = [];
  for (const part of parts) {
    const record = upsert(part, source, parentName);
    if (fold(part) !== fold(raw)) record.aliases.add(raw);
    names.push(record.name);
  }
  if (rule !== "unchanged") trace.push({ raw, source, rule, became: names.join(" + ") });
  return names;
};

// The tree first, so parents exist before anything hangs off them (D4).
const nodeBySlug = new Map(nodes.map((n) => [n.slug, n]));
for (const node of [...nodes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
  const parent = node.parentSlug ? nodeBySlug.get(node.parentSlug) : null;
  take(node.name, "tree", parent?.name ?? null);
}
// Skills merge into the tree under their category (D1): the category name is
// already a top-level entry, so this is a merge, not an addition.
const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
for (const skill of skills) {
  const category = categoryBySlug.get(skill.categorySlug ?? skill.category);
  take(skill.name, "skill", category?.name ?? null);
}
// Then the free text, which has no parent to offer.
const jobUses = [];
for (const experience of experiences) {
  for (const tech of experience.jobTech ?? []) {
    const names = take(tech.label, "jobTech", null);
    for (const name of names) {
      jobUses.push({
        experience: experience.slug,
        technology: name,
        fromLabel: tech.label,
        highlightMatches: tech.highlightMatches ?? [],
        showAsChip: true, // migrated labels are visible; see Q3
      });
    }
  }
  // Both tech and code memories hold technology names (D12); code memories were
  // filed as "code" only to get the monospace box, which is styling (D13).
  for (const memory of experience.jobMemories ?? []) {
    if (memory.type === "tech") take((memory.text ?? "").trim(), "memory", null);
    if (memory.type === "code") take((memory.text ?? "").trim(), "code", null);
  }
}
for (const entry of entries) for (const tech of entry.technologies ?? []) take(tech, "entry", null);

// Slugs, once the names are settled.
const slugOf = (name) =>
  name
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/#/g, "sharp")
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const slugs = new Set();
for (const record of master.values()) {
  let slug = slugOf(record.name);
  let n = 2;
  while (slugs.has(slug)) slug = `${slugOf(record.name)}-${n++}`;
  slugs.add(slug);
  record.slug = slug;
}

// ---------------------------------------------------------------- report

const rows = [...master.values()].sort((a, b) => a.name.localeCompare(b.name));
const roots = rows.filter((r) => !r.parentName);
const orphans = rows.filter((r) => !r.parentName && !CATEGORY_NAMES.has(r.name));
const sourceStrings = new Set(trace.map((t) => t.raw));

const lines = [];
lines.push("# Skills consolidation: dry run");
lines.push("");
lines.push(`Generated by \`scripts/skills-migrate.mjs\` from \`${dbName}\` on ${new Date().toISOString().slice(0, 10)}.`);
lines.push("**Nothing was written.** This is what the migration would produce.");
lines.push("");
lines.push("## Totals");
lines.push("");
lines.push("| | Before | After |");
lines.push("|---|---|---|");
lines.push(`| Technology records | ${nodes.length} tree + ${skills.length} skills + ${categories.length} categories = ${nodes.length + skills.length + categories.length} | **${rows.length}** |`);
lines.push(`| Top-level entries | ${categories.length} | ${roots.length} |`);
lines.push(`| Free-text job labels | ${experiences.reduce((n, e) => n + (e.jobTech ?? []).length, 0)} | 0 (become ${jobUses.length} linked uses) |`);
lines.push(`| Strings changed by a rule | - | ${sourceStrings.size} |`);
lines.push(`| Strings dropped (R7) | - | ${unresolved.length} |`);
lines.push("");
lines.push("## What each rule did");
lines.push("");
lines.push("| Source string | Rule | Became |");
lines.push("|---|---|---|");
for (const t of trace.sort((a, b) => a.raw.localeCompare(b.raw))) {
  lines.push(`| \`${t.raw}\` | ${t.rule} | ${t.became} |`);
}
lines.push("");
lines.push("## Dropped (R7: work, not a technology)");
lines.push("");
if (unresolved.length === 0) lines.push("None.");
for (const u of unresolved) lines.push(`- \`${u.raw}\` (${u.source}) - ${u.rule}`);
lines.push("");
lines.push("## The proposed master list");
lines.push("");
lines.push("| Name | Slug | Parent | Aliases kept (R8) | Seen in |");
lines.push("|---|---|---|---|---|");
for (const r of rows) {
  lines.push(
    `| ${r.name} | \`${r.slug}\` | ${r.parentName ?? "-"} | ${[...r.aliases].map((a) => `\`${a}\``).join(", ") || "-"} | ${[...r.sources].join(", ")} |`,
  );
}
lines.push("");
lines.push("## Entries with no parent (need a home before this runs, D7)");
lines.push("");
if (orphans.length === 0) lines.push("None.");
for (const o of orphans) lines.push(`- ${o.name} (from ${[...o.sources].join(", ")})`);
lines.push("");
lines.push("## Skill uses per job");
lines.push("");
lines.push("| Job | Uses | Technologies |");
lines.push("|---|---|---|");
for (const experience of experiences) {
  const mine = jobUses.filter((u) => u.experience === experience.slug);
  lines.push(`| ${experience.slug} | ${mine.length} | ${mine.map((m) => m.technology).join(", ") || "-"} |`);
}
lines.push("");

mkdirSync(path.join(process.cwd(), "db-backups"), { recursive: true });
writeFileSync("docs/skills-migration-dryrun.md", lines.join("\n"), "utf8");
writeFileSync(
  "db-backups/skills-migration-proposal.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceDatabase: dbName,
      technologies: rows.map((r) => ({ ...r, aliases: [...r.aliases], sources: [...r.sources] })),
      jobUses,
      dropped: unresolved,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(`[skills:migrate] DRY RUN against ${dbName}. Nothing was written to any database.`);
console.log(`[skills:migrate] ${nodes.length + skills.length + categories.length} records -> ${rows.length} technologies, ${jobUses.length} skill uses.`);
console.log(`[skills:migrate] ${sourceStrings.size} strings changed by a rule, ${unresolved.length} dropped, ${orphans.length} without a parent.`);
console.log("[skills:migrate] Report: docs/skills-migration-dryrun.md");
console.log("[skills:migrate] Proposed records: db-backups/skills-migration-proposal.json");
