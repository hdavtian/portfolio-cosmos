import { resumeSkillLines } from "@hd/content-schema/technology-tree";
import type { Release } from "../../lib/api/release";
import mock from "../../data/mock/skillTimeline.json";

/**
 * Turns a skill timeline into spans on the calendar, so every view - the
 * Game of Thrones film, its home-page preview and the lab page - draws from
 * the same numbers. The rules match scripts/skills-report.mjs: exact years
 * win, then placement inside the job, then "assume it overlapped".
 *
 * The timeline comes from the published release (the master list, and each
 * job's skill uses with their years); a release from before the list, or one
 * whose jobs carry no uses yet, falls back to the mock so the film still
 * plays.
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
  };
}

export type SkillsData = ReturnType<typeof computeSkillsData>;

const yearOfIso = (value: string | null | undefined, fallback: number) =>
  value ? Number(value.split("-")[0]) + (Number(value.split("-")[1]) - 1) / 12 : fallback;

let mockData: SkillsData | null = null;

/** The film's own timeline, kept as the fallback until every release carries the uses. */
export function skillsDataFromMock(): SkillsData {
  if (mockData) return mockData;
  mockData = computeSkillsData({
    categories: mock.categories as Category[],
    skills: mock.skills as SkillDefinition[],
    places: mock.jobs.map((job) => ({
      slug: job.slug,
      name: job.company,
      short: job.company.split(/[ (]/)[0],
      title: (job as { title?: string }).title ?? "",
      from: yearOfIso(job.start, 2000),
      to: yearOfIso(job.end, NOW_YEAR),
    })),
    uses: mock.jobs.flatMap((job) => job.uses.map((use) => ({ ...use, place: job.slug }))) as RawUse[],
  });
  return mockData;
}

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
 * spans, each dated as recorded or, undated, taken as the whole job. Only
 * uses ticked for the film's destination, on skills ticked for the film's
 * progress, are drawn.
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
  if (technologies.length === 0 || uses.length === 0) return skillsDataFromMock();

  const bySlug = new Map(technologies.map((record) => [record.slug, record]));
  const ordered = [...technologies].sort((a, b) => a.sortOrder - b.sortOrder);
  const lines = resumeSkillLines(technologies, release.resumeSkills?.headingOrder ?? []);
  const lineOf = new Map(lines.flatMap((line) => line.skillSlugs.map((slug) => [slug, line.slug] as const)));
  const anyCurrent = ordered.some((record) => record.current && !record.isGrouping);
  const categories: Category[] = [
    ...lines.map((line, index) => ({
      slug: line.slug,
      name: line.name,
      sortOrder: index,
      headline: true,
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
  const skills: SkillDefinition[] = ordered
    .filter((record) => !record.isGrouping && record.surfaces.includes("filmProgress"))
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

  return computeSkillsData({ categories, skills, places, uses: uses.filter((use) => known.has(use.skill)) });
}
