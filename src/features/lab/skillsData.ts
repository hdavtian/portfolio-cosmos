import { resumeSkillLines } from "@hd/content-schema/technology-tree";
import type { Release } from "../../lib/api/release";

/**
 * Turns a skill timeline into spans on the calendar, so every view - the
 * Game of Thrones film, its home-page preview and the lab page - draws from
 * the same numbers. The rules match scripts/skills-report.mjs: exact years
 * win, then placement inside the job, then "assume it overlapped".
 *
 * The timeline comes from the published release: the master list, and each
 * job's skill uses with their years.
 */

export interface SkillSpan {
  skill: string;
  skillName: string;
  place: string;
  placeName: string;
  categories: string[];
  from: number;
  to: number;
  exact: boolean;
}

export interface Category {
  slug: string;
  name: string;
  sortOrder: number;
  headline?: boolean;
  era?: number;
  blurb?: string;
  /** Shown with its years on the film's closing screen (D33). */
  closing?: boolean;
}

export interface SkillDefinition {
  slug: string;
  name: string;
  categories?: string[];
  /** A skill inside another (C# Web API inside C#): counted under its parent, not again. */
  parent?: string;
}

export interface Place {
  slug: string;
  name: string;
  /** The company on its own, for tight column headers. */
  short: string;
  /** The role held there. */
  title: string;
  from: number;
  to: number;
}

export interface RawUse {
  skill: string;
  place: string;
  years?: number;
  when?: string;
  from?: number;
  to?: number;
}

export interface SkillsInput {
  categories: Category[];
  skills: SkillDefinition[];
  places: Place[];
  uses: RawUse[];
  /** Lines whose skills the film draws as one tower per job (D30). */
  rolled?: Set<string>;
}

export const NOW_YEAR = new Date().getFullYear() + new Date().getMonth() / 12;

/** "Current stack" counts from this year on, as the mock's category did. */
export const CURRENT_STACK_SINCE = 2014;

const merge = (ranges: Array<{ from: number; to: number }>) => {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const merged: Array<{ from: number; to: number }> = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
};

export const totalYears = (ranges: Array<{ from: number; to: number }>) =>
  merge(ranges).reduce((total, range) => total + (range.to - range.from), 0);

export const say = (years: number) => (years >= 10 ? `${Math.floor(years)}+` : years.toFixed(1));

export function computeSkillsData(input: SkillsInput) {
  const categories = [...input.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const skills = input.skills;
  const places = input.places;
  const skillsBySlug = new Map(skills.map((skill) => [skill.slug, skill]));

  const spans: SkillSpan[] = input.uses
    .flatMap((use) => {
      const place = places.find((entry) => entry.slug === use.place);
      if (!place) return [];
      const placeYears = place.to - place.from;
      const skill = skillsBySlug.get(use.skill);
      const base = {
        skill: use.skill,
        skillName: skill?.name ?? use.skill,
        place: place.slug,
        placeName: place.name,
        categories: skill?.categories ?? [],
      };
      if (use.from !== undefined) {
        return [{ ...base, from: use.from, to: use.to ?? place.to, exact: true }];
      }
      // No years at all counts as the whole job (the schema's rule for a
      // use recorded without dates); stated years are capped at the job.
      const length =
        use.years === undefined ? placeYears : Math.min(use.years, Math.max(1, Math.round(placeYears)));
      if (use.when === "end") return [{ ...base, from: place.to - length, to: place.to, exact: false }];
      if (use.when === "middle") {
        const pad = (placeYears - length) / 2;
        return [{ ...base, from: place.from + pad, to: place.to - pad, exact: false }];
      }
      return [{ ...base, from: place.from, to: place.from + length, exact: false }];
    })
    .sort((a, b) => a.from - b.from);

  const FIRST_YEAR = Math.floor(Math.min(NOW_YEAR, ...spans.map((span) => span.from)));
  const LAST_YEAR = Math.ceil(Math.max(FIRST_YEAR + 1, ...spans.map((span) => span.to)));
  const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

  /** Years covered per skill, merged so overlapping jobs never count twice. */
  const skillTotals = skills
    .map((skill) => {
      const mine = spans.filter((span) => span.skill === skill.slug);
      if (mine.length === 0) return null;
      return {
        ...skill,
        years: totalYears(mine),
        first: Math.min(...mine.map((span) => span.from)),
        last: Math.max(...mine.map((span) => span.to)),
        spans: mine,
        merged: merge(mine),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.years - a.years);

  /** Years covered per category, and how many of its skills were live each year. */
  const categoryTotals = categories.map((category) => {
    const mine = spans.filter(
      (span) => span.categories.includes(category.slug) && !skillsBySlug.get(span.skill)?.parent,
    );
    const era = category.era;
    const clipped = era
      ? mine.filter((span) => span.to > era).map((span) => ({ ...span, from: Math.max(span.from, era) }))
      : mine;
    const perYear = YEARS.map(
      (year) => clipped.filter((span) => span.from <= year + 0.999 && span.to >= year).length,
    );
    const byPlace = new Map(
      places.map((place) => [place.slug, totalYears(clipped.filter((span) => span.place === place.slug))]),
    );
    return {
      ...category,
      byPlace,
      skills: [...new Set(clipped.map((span) => span.skill))],
      years: totalYears(clipped),
      first: clipped.length ? Math.min(...clipped.map((span) => span.from)) : 0,
      last: clipped.length ? Math.max(...clipped.map((span) => span.to)) : 0,
      perYear,
      spans: clipped,
    };
  });

  const headlineCategories = categoryTotals.filter((category) => category.headline);

  // Which line a skill prints on (its first category that is not the era
  // row), and which lines roll up into one tower - for the film's builders.
  const lineOf = new Map(
    skills.flatMap((skill) => {
      const line = (skill.categories ?? []).find((category) => category !== "current-stack");
      return line ? [[skill.slug, line] as const] : [];
    }),
  );
  const lineNames = new Map(categories.map((category) => [category.slug, category.name]));
  const rolled = input.rolled ?? new Set<string>();

  /** How many distinct skills were live in a given year: the pulse of a career. */
  const skillsLiveIn = (year: number) =>
    new Set(spans.filter((span) => span.from <= year + 0.999 && span.to >= year).map((span) => span.skill)).size;

  return {
    categories,
    skills,
    places,
    spans,
    FIRST_YEAR,
    LAST_YEAR,
    YEARS,
    NOW_YEAR,
    skillTotals,
    categoryTotals,
    headlineCategories,
    skillsLiveIn,
    lineOf,
    lineNames,
    rolled,
  };
}

/** A tower the film draws: a skill, or a rolled-up line standing for its skills. */
export interface Tower {
  key: string;
  name: string;
  years: number;
  from: number;
  to: number;
  /** The skill slugs behind it: one, or a line's several. */
  skills: string[];
}

/**
 * The towers at one place (D30): one per skill, except on a rolled-up line,
 * whose skills at that place merge into one tower named for the line - its
 * years the union of theirs, so a year of HTML and CSS together counts once.
 */
export function towersAt(
  spans: readonly SkillSpan[],
  place: string,
  lineOf: ReadonlyMap<string, string>,
  lineNames: ReadonlyMap<string, string>,
  rolled: ReadonlySet<string>,
): Tower[] {
  const mine = spans.filter((span) => span.place === place);
  const towers = new Map<string, { name: string; ranges: Array<{ from: number; to: number }>; skills: Set<string> }>();
  for (const span of mine) {
    const line = lineOf.get(span.skill);
    const rolledUp = line !== undefined && rolled.has(line);
    const key = rolledUp ? `line:${line}` : span.skill;
    const name = rolledUp ? (lineNames.get(line) ?? line) : span.skillName;
    const tower = towers.get(key) ?? { name, ranges: [], skills: new Set<string>() };
    tower.ranges.push({ from: span.from, to: span.to });
    tower.skills.add(span.skill);
    towers.set(key, tower);
  }
  return [...towers.entries()]
    .map(([key, tower]) => ({
      key,
      name: tower.name,
      years: totalYears(tower.ranges),
      from: Math.min(...tower.ranges.map((range) => range.from)),
      to: Math.max(...tower.ranges.map((range) => range.to)),
      skills: [...tower.skills],
    }))
    .sort((a, b) => b.years - a.years);
}

/**
 * A castle, not a wall: the towers at a place vary in height. Height still
 * follows the years, but a use that spans the whole job ties with every
 * other such use, and a row of equal towers hides its own labels. Each
 * tower keeps between two thirds and all of its height, by a factor drawn
 * from its name, so the skyline is the same every visit and the labels
 * stand at different heights. The years shown anywhere are untouched.
 */
export function castleTowers(towers: Tower[], place: string): Tower[] {
  const seeded = (text: string) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return ((h >>> 0) % 10000) / 10000;
  };
  return towers.map((tower) => ({ ...tower, years: tower.years * (0.66 + 0.34 * seeded(`${place}:${tower.key}`)) }));
}

export type SkillsData = ReturnType<typeof computeSkillsData>;

/** "YYYY" or "MM/YYYY" (the schema's job and skill dates) as a fractional year. */
const yearOf = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const [first, second] = value.split("/");
  return second ? Number(second) + (Number(first) - 1) / 12 : Number(first);
};

/**
 * The timeline from the published release. The Skill Progress rows are the
 * resume's lines - the headings ticked Resume, in the order set on Admin ->
 * Resume skills ordering - so the film's tally and the resume agree (plus
 * "Current stack", counted from CURRENT_STACK_SINCE, for everything ticked
 * current). A skill's row is the line it prints on. A job's uses are its
 * spans, each dated as recorded or, undated, taken as the whole job; only
 * uses ticked for the film are drawn. A line ticked "roll up in the film"
 * stands as one tower for its skills at each job (D30).
 */
export function skillsDataFromRelease(release: Release): SkillsData {
  const technologies = release.collections.technologies ?? [];
  const experiences = release.collections.experiences ?? [];
  const uses: RawUse[] = experiences.flatMap((job) =>
    (job.skillsUsed ?? [])
      .filter((use) => use.surfaces.includes("filmDestination"))
      .map((use) => ({
        skill: use.technologySlug,
        place: job.slug,
        years: use.years,
        when: use.when,
        from: use.from ? yearOf(use.from, 0) : undefined,
        to: use.to ? yearOf(use.to, 0) : undefined,
      })),
  );

  const bySlug = new Map(technologies.map((record) => [record.slug, record]));
  const ordered = [...technologies].sort((a, b) => a.sortOrder - b.sortOrder);
  const lines = resumeSkillLines(technologies, release.resumeSkills?.headingOrder ?? []);
  // Which lines the closing screen shows; none chosen means all of them.
  const chosen = new Set(release.resumeSkills?.closingLines ?? []);
  const closing = (slug: string) => chosen.size === 0 || chosen.has(slug);
  const lineOf = new Map(lines.flatMap((line) => line.skillSlugs.map((slug) => [slug, line.slug] as const)));
  const anyCurrent = ordered.some((record) => record.current && !record.isGrouping);
  const categories: Category[] = [
    ...lines.map((line, index) => ({
      slug: line.slug,
      name: line.name,
      sortOrder: index,
      headline: true,
      closing: closing(line.slug),
      blurb: bySlug.get(line.slug)?.blurb,
    })),
    ...(anyCurrent
      ? [
          {
            slug: "current-stack",
            name: "Current stack",
            sortOrder: Number.MAX_SAFE_INTEGER,
            headline: true,
            era: CURRENT_STACK_SINCE,
          },
        ]
      : []),
  ];
  const rolled = new Set(lines.filter((line) => bySlug.get(line.slug)?.rollUpInFilm).map((line) => line.slug));
  const skills: SkillDefinition[] = ordered
    .filter((record) => !record.isGrouping)
    .map((record) => {
      const line = lineOf.get(record.slug);
      const parent = record.parentSlug ? bySlug.get(record.parentSlug) : undefined;
      return {
        slug: record.slug,
        name: record.name,
        categories: [...(line ? [line] : []), ...(record.current ? ["current-stack"] : [])],
        parent: parent && !parent.isGrouping ? parent.slug : undefined,
      };
    });
  const known = new Set(skills.map((skill) => skill.slug));
  const places: Place[] = [...experiences]
    .map((job) => ({
      slug: job.slug,
      name: job.company,
      short: job.company.split(/[ (]/)[0],
      title: job.positions[0]?.title ?? "",
      from: yearOf(job.startDate, 2000),
      to: yearOf(job.endDate, NOW_YEAR),
    }))
    .sort((a, b) => a.from - b.from);

  return computeSkillsData({ categories, skills, places, uses: uses.filter((use) => known.has(use.skill)), rolled });
}
