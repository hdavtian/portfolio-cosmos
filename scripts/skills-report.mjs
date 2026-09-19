// Reads the mock skill timeline and prints what it can answer, so the shape can
// be judged on real numbers before anything is built.
//   npm run skills:report
//   npm run skills:report -- --matrix     also print the job/skill grid
//
// Overlapping jobs are merged, so a year is never counted twice — the whole
// point of the exercise.
import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(readFileSync(path.join(rootDir, "src/data/mock/skillTimeline.json"), "utf8"));
const NOW = new Date();
const nowMonths = NOW.getFullYear() * 12 + NOW.getMonth();

const toMonths = (value) => {
  if (!value) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + (month - 1);
};

/** Every span a skill was used in, from jobs and from work outside jobs. */
const spansBySkill = new Map();
const addSpan = (skill, from, to, source, level) => {
  if (from === null) return;
  const end = to ?? nowMonths;
  if (end < from) return;
  if (!spansBySkill.has(skill)) spansBySkill.set(skill, []);
  spansBySkill.get(skill).push({ from, to: end, source, level });
};

for (const job of data.jobs) {
  const jobFrom = toMonths(job.start);
  const jobTo = toMonths(job.end);
  for (const use of job.uses) {
    addSpan(use.skill, toMonths(use.start) ?? jobFrom, toMonths(use.end) ?? jobTo, job.slug, use.level);
  }
}
for (const period of data.outsideWork ?? []) {
  const from = toMonths(period.start);
  const to = toMonths(period.end);
  for (const use of period.uses) {
    addSpan(use.skill, toMonths(use.start) ?? from, toMonths(use.end) ?? to, period.label, use.level);
  }
}

/** Union of spans: the months actually spent, with overlaps collapsed. */
const merge = (spans) => {
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  const merged = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to + 1) last.to = Math.max(last.to, span.to);
    else merged.push({ from: span.from, to: span.to });
  }
  return merged;
};
const monthsIn = (merged) => merged.reduce((total, span) => total + (span.to - span.from + 1), 0);
const label = (months) => {
  const years = months / 12;
  return years >= 10 ? `${Math.floor(years)}+ yrs` : `${years.toFixed(1)} yrs`;
};
const asYear = (months) => Math.floor(months / 12);

const skillsBySlug = new Map(data.skills.map((skill) => [skill.slug, skill]));
const capabilities = data.capabilities.map((capability) => ({
  ...capability,
  skills: data.skills.filter((skill) => skill.capability === capability.slug),
}));

console.log("\n=== At a glance ===");
for (const capability of capabilities) {
  const spans = capability.skills.flatMap((skill) => spansBySkill.get(skill.slug) ?? []);
  if (spans.length === 0) continue;
  const merged = merge(spans);
  const first = asYear(merged[0].from);
  const last = merged[merged.length - 1].to >= nowMonths - 1 ? "now" : asYear(merged[merged.length - 1].to);
  console.log(
    `${capability.name.padEnd(22)} ${label(monthsIn(merged)).padStart(9)}   ${first}–${last}` +
      (merged.length > 1 ? `   (${merged.length} stretches)` : ""),
  );
}

console.log("\n=== By skill ===");
const rows = [...spansBySkill.entries()]
  .map(([slug, spans]) => {
    const merged = merge(spans);
    return {
      name: skillsBySlug.get(slug)?.name ?? slug,
      capability: skillsBySlug.get(slug)?.capability ?? "?",
      months: monthsIn(merged),
      first: asYear(merged[0].from),
      last: merged[merged.length - 1].to >= nowMonths - 1 ? "now" : asYear(merged[merged.length - 1].to),
      jobs: new Set(spans.map((span) => span.source)).size,
    };
  })
  .sort((a, b) => b.months - a.months);
for (const row of rows) {
  console.log(
    `${row.name.padEnd(34)} ${label(row.months).padStart(9)}   ${String(row.first)}–${row.last}`.padEnd(64) +
      `${row.jobs} place${row.jobs === 1 ? "" : "s"}`,
  );
}

if (process.argv.includes("--matrix")) {
  console.log("\n=== Where (P primary, s secondary, · exposure) ===");
  const marks = { primary: "P", secondary: "s", exposure: "·" };
  const header = data.jobs.map((job) => job.slug.slice(0, 6).padEnd(7)).join("");
  console.log(`${"".padEnd(34)}${header}`);
  for (const skill of data.skills) {
    const cells = data.jobs
      .map((job) => (marks[job.uses.find((use) => use.skill === skill.slug)?.level] ?? " ").padEnd(7))
      .join("");
    console.log(`${skill.name.padEnd(34)}${cells}`);
  }
}

console.log("\n=== Sentences this would write for you ===");
const say = (slug) => {
  const capability = capabilities.find((entry) => entry.slug === slug);
  const merged = merge(capability.skills.flatMap((skill) => spansBySkill.get(skill.slug) ?? []));
  return `${label(monthsIn(merged))} ${capability.name.toLowerCase()}`;
};
console.log(`"${["backend", "frontend-frameworks", "cloud-devops", "testing"].map(say).join(", ")}"`);
console.log("");
