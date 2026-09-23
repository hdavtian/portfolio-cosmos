// One-off: links each client variant's typed technology tags into the master
// list (technologySlugs), the way the migration did for top-level entries.
// Local database only; production is written by db:push-prod, later.
//   node scripts/link-variant-tags.mjs
import { execFileSync } from "node:child_process";
import { GROUPINGS, MERGES, PROSE, TREE } from "./lib/skills-plan.mjs";
import { fold, resolve } from "./lib/skills-rules.mjs";

const container = "scrolling-resume-mongo";
const dbName = process.env.MONGODB_DB_NAME ?? "resume_cosmos_local";
const mongo = (script) =>
  execFileSync("docker", ["exec", "-i", container, "mongosh", "--quiet", "--eval", script], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const read = (c) => JSON.parse(mongo(`JSON.stringify(db.getSiblingDB(${JSON.stringify(dbName)}).${c}.find({}).toArray())`));

const technologies = read("technologies");
const bySearch = new Map();
for (const t of technologies) {
  if (GROUPINGS.has(t.name)) continue;
  bySearch.set(fold(t.name), t.slug);
  for (const alias of t.aliases ?? []) bySearch.set(fold(alias), t.slug);
}
const mergeInto = new Map(Object.entries(MERGES).map(([from, to]) => [fold(from), to]));
const prose = new Set(PROSE.map(fold));
const resolveTag = (raw) => {
  const key = fold(raw);
  if (!key || prose.has(key)) return [];
  if (bySearch.has(key)) return [bySearch.get(key)];
  if (mergeInto.has(key)) return mergeInto.get(key).map((n) => bySearch.get(fold(n))).filter(Boolean);
  return resolve(raw).parts.flatMap((part) => {
    const k = fold(part);
    if (bySearch.has(k)) return [bySearch.get(k)];
    if (mergeInto.has(k)) return mergeInto.get(k).map((n) => bySearch.get(fold(n))).filter(Boolean);
    return [];
  });
};

const entries = read("portfolioEntries");
const updates = [];
const unmatched = new Set();
let variantsLinked = 0;
for (const entry of entries) {
  if (!(entry.clientVariants ?? []).length) continue;
  const variants = entry.clientVariants.map((v) => {
    if ((v.technologySlugs ?? []).length) return v;
    const slugs = [];
    for (const tag of v.technologies ?? []) {
      const found = resolveTag(tag);
      if (found.length === 0) unmatched.add(tag);
      for (const slug of found) if (!slugs.includes(slug)) slugs.push(slug);
    }
    if (slugs.length) variantsLinked += 1;
    return { ...v, technologySlugs: slugs };
  });
  updates.push({ slug: entry.slug, clientVariants: variants });
}
const script = `
const d = db.getSiblingDB(${JSON.stringify(dbName)});
const now = new Date();
for (const u of ${JSON.stringify(updates)}) {
  d.portfolioEntries.updateOne({ slug: u.slug }, { $set: { clientVariants: u.clientVariants, updatedAt: now, updatedBy: "script:link-variant-tags" }, $inc: { version: 1 } });
}
print("entries updated: " + ${updates.length});
`;
console.log(mongo(script).trim());
console.log(`[link-variant-tags] ${variantsLinked} variants linked; unmatched tags: ${unmatched.size ? [...unmatched].join(", ") : "none"}`);
