// Reads the mock skill timeline and prints what it can answer, so the shape can
// be judged on real numbers before anything is built.
//   npm run skills:report
//   npm run skills:report -- --matrix     also print the job/skill grid
//
// A use can be stated three ways, most precise first:
//   from/to   actual years, e.g. 2022-2025 — exact, and years are derived
//   years+when  how long, and where it sat in the job (start, middle, end)
//   years       how long only — assumed to overlap the rest of the job's skills
//
// Three rules keep the numbers honest:
//   1. A skill's years are what you say, but never more than the job lasted.
//   2. Inside one job, a group (Backend, Frontend...) counts the years it
//      covered, not the sum of its skills. "when" says where a skill sat in
//      the job (start, end, middle); skills with no "when" are assumed to have
//      overlapped, so the group gets the longest of them, never their sum.
//   3. Across jobs, a total is capped by the real calendar span of the places
//      it was used, so overlapping jobs never invent years.
import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(readFileSync(path.join(rootDir, "src/data/mock/skillTimeline.json"), "utf8"));

const NOW = new Date();
const nowMonths = NOW.getFullYear() * 12 + NOW.getMonth();
const toMonths = (value) => {
  if (!value) return nowMonths;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + (month - 1);
};
const yearsBetween = (from, to) => (to - from + 1) / 12;

const places = [
  ...data.jobs.map((job) => ({ ...job, kind: "job", name: job.company })),
  ...(data.outsideWork ?? []).map((period) => ({ ...period, kind: "outside", name: period.label, slug: period.label })),
];
for (const place of places) {
  place.from = toMonths(place.start);
  place.to = toMonths(place.end);
  place.length = yearsBetween(place.from, place.to);
}

// Rule 1: a use can't be longer than the place it happened in, measured in
// whole years the way people say them ("almost 3 years there, 3 years of React").
const problems = [];
for (const place of places) {
  place.allowance = Math.max(1, Math.round(place.length));
  place.firstYear = Math.floor(place.from / 12);
  place.lastYear = Math.floor(place.to / 12);
  for (const use of place.uses) {
    // Exact years win: the length comes from them.
    if (use.from !== undefined) {
      const to = use.to ?? place.lastYear;
      use.years = Math.max(1, to - use.from);
      if (use.from < place.firstYear || to > place.lastYear + 1) {
        problems.push(
          `${place.name}: ${use.skill} says ${use.from}–${to}, outside the ${place.kind} (${place.firstYear}–${place.lastYear})`,
        );
      }
    }
    if (use.years > place.allowance) {
      problems.push(
        `${place.name}: ${use.skill} says ${use.years} yrs, but the ${place.kind} lasted ${place.length.toFixed(1)} (max ${place.allowance})`,
      );
    }
  }
}

/** Merges [from, to] spans and returns their total length. */
const unionLength = (spans) => {
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  let total = 0;
  let current = null;
  for (const span of sorted) {
    if (current && span.from <= current.to) current.to = Math.max(current.to, span.to);
    else {
      if (current) total += current.to - current.from;
      current = { ...span };
    }
  }
  if (current) total += current.to - current.from;
  return total;
};

/**
 * Where a skill sat inside its job, as a span in years from the job's start.
 * With no "when" the span is anchored at the start, so skills of unknown
 * placement overlap each other: a group then gets the longest of them rather
 * than their sum, which is the conservative reading.
 */
const placement = (use, jobYears, place) => {
  const years = Math.min(use.years, jobYears);
  // Exact years: place it where it actually sat inside the job.
  if (use.from !== undefined && place) {
    const start = Math.max(0, use.from - place.firstYear);
    return { from: start, to: Math.min(jobYears, start + years) };
  }
  if (use.when === "end") return { from: jobYears - years, to: jobYears };
  if (use.when === "middle") return { from: (jobYears - years) / 2, to: (jobYears + years) / 2 };
  return { from: 0, to: years };
};

/** Calendar span covered by a set of places, with overlaps merged. */
const calendarYears = (usedPlaces) => {
  const spans = usedPlaces.map((place) => ({ from: place.from, to: place.to })).sort((a, b) => a.from - b.from);
  const merged = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to + 1) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  return {
    years: merged.reduce((total, span) => total + yearsBetween(span.from, span.to), 0),
    first: Math.floor(merged[0].from / 12),
    last: merged[merged.length - 1].to >= nowMonths - 1 ? "now" : Math.floor(merged[merged.length - 1].to / 12),
  };
};

const say = (years) => (years >= 10 ? `${Math.floor(years)}+ yrs` : `${years.toFixed(1)} yrs`);

const skillsBySlug = new Map(data.skills.map((skill) => [skill.slug, skill]));

/** Per skill: the years claimed, and the calendar ceiling they sit under. */
const skillTotals = data.skills
  .map((skill) => {
    const used = places
      .map((place) => ({ place, use: place.uses.find((use) => use.skill === skill.slug) }))
      .filter((entry) => entry.use);
    if (used.length === 0) return null;
    const claimed = used.reduce((total, entry) => total + entry.use.years, 0);
    const calendar = calendarYears(used.map((entry) => entry.place));
    return {
      ...skill,
      years: Math.min(claimed, calendar.years),
      claimed,
      capped: claimed > calendar.years + 0.05,
      first: calendar.first,
      last: calendar.last,
      places: used.length,
    };
  })
  .filter(Boolean)
  .sort((a, b) => b.years - a.years);

/** Per capability: years per place are capped by that place's length, then the same calendar rule. */
const capabilityTotals = data.capabilities
  .map((capability) => {
    const members = new Set(data.skills.filter((skill) => skill.capability === capability.slug).map((s) => s.slug));
    const used = places
      .map((place) => {
        const uses = place.uses.filter((use) => members.has(use.skill));
        // Rule 2: the years this group covered inside the job.
        const covered = unionLength(uses.map((use) => placement(use, place.allowance, place)));
        return { place, years: Math.min(covered, place.allowance) };
      })
      .filter((entry) => entry.years > 0);
    if (used.length === 0) return null;
    const claimed = used.reduce((total, entry) => total + entry.years, 0);
    const calendar = calendarYears(used.map((entry) => entry.place));
    return { ...capability, years: Math.min(claimed, calendar.years), first: calendar.first, last: calendar.last };
  })
  .filter(Boolean)
  .sort((a, b) => b.years - a.years);

console.log("\n=== At a glance ===");
for (const row of capabilityTotals) {
  console.log(`${row.name.padEnd(22)} ${say(row.years).padStart(9)}   ${row.first}–${row.last}`);
}

// Full stack: places where both backend and frontend work happened.
const backendish = new Set(data.skills.filter((s) => s.capability === "backend").map((s) => s.slug));
const frontendish = new Set(
  data.skills.filter((s) => s.capability === "frontend-frameworks" || s.capability === "web-fundamentals").map((s) => s.slug),
);
const bothPlaces = places.filter(
  (place) => place.uses.some((u) => backendish.has(u.skill)) && place.uses.some((u) => frontendish.has(u.skill)),
);
if (bothPlaces.length > 0) {
  const both = calendarYears(bothPlaces);
  console.log(`${"Full stack (both ends)".padEnd(22)} ${say(both.years).padStart(9)}   ${both.first}–${both.last}`);
}

console.log("\n=== By skill ===");
for (const row of skillTotals) {
  const note = row.capped ? `  (claimed ${row.claimed}, capped by calendar)` : "";
  console.log(
    `${row.name.padEnd(34)} ${say(row.years).padStart(9)}   ${row.first}–${row.last}`.padEnd(64) +
      `${row.places} place${row.places === 1 ? "" : "s"}${note}`,
  );
}

if (process.argv.includes("--matrix")) {
  console.log("\n=== Years per place ===");
  console.log(`${"".padEnd(34)}${places.map((p) => p.slug.slice(0, 6).padEnd(7)).join("")}`);
  for (const skill of data.skills) {
    const cells = places
      .map((place) => {
        const use = place.uses.find((entry) => entry.skill === skill.slug);
        if (!use) return "".padEnd(7);
        return (use.from !== undefined ? `${use.years}*` : String(use.years)).padEnd(7);
      })
      .join("");
    console.log(`${skill.name.padEnd(34)}${cells}`);
  }
  console.log(`${"— length of the place —".padEnd(34)}${places.map((p) => p.length.toFixed(1).padEnd(7)).join("")}`);
  console.log(`${"— most you can claim —".padEnd(34)}${places.map((p) => String(p.allowance).padEnd(7)).join("")}`);
  console.log("* stated as exact years rather than a length");
}

console.log("\n=== Sentences this would write for you ===");
const pick = (slug) => capabilityTotals.find((row) => row.slug === slug);
const sentence = ["backend", "frontend-frameworks", "cloud", "testing"]
  .map(pick)
  .filter(Boolean)
  .map((row) => `${say(row.years)} ${row.name.toLowerCase()}`)
  .join(", ");
console.log(`"${sentence}"`);
const lastRole = data.jobs[0];
console.log(
  `"At ${lastRole.company}: ${lastRole.uses
    .slice()
    .sort((a, b) => b.years - a.years)
    .slice(0, 4)
    .map((use) => `${use.years} yrs ${skillsBySlug.get(use.skill)?.name ?? use.skill}`)
    .join(", ")}"`,
);

if (problems.length > 0) {
  console.log("\n=== Needs a look (a use longer than its job) ===");
  for (const problem of problems) console.log(`- ${problem}`);
}
console.log("");
