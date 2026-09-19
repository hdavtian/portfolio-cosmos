import mock from "../../data/mock/skillTimeline.json";

/**
 * Turns the mock skill timeline into spans on the calendar, so every view on
 * the lab page draws from the same numbers. The rules match
 * scripts/skills-report.mjs: exact years win, then placement inside the job,
 * then "assume it overlapped".
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

export interface Place {
  slug: string;
  name: string;
  /** The company on its own, for tight column headers. */
  short: string;
  from: number;
  to: number;
}

const yearOf = (value: string | undefined, fallback: number) =>
  value ? Number(value.split("-")[0]) + (Number(value.split("-")[1]) - 1) / 12 : fallback;

export const NOW_YEAR = new Date().getFullYear() + new Date().getMonth() / 12;

export const categories: Category[] = [...mock.categories].sort((a, b) => a.sortOrder - b.sortOrder);
export const skills = mock.skills as Array<{ slug: string; name: string; categories?: string[]; parent?: string }>;
const skillsBySlug = new Map(skills.map((skill) => [skill.slug, skill]));

export const places: Place[] = mock.jobs.map((job) => ({
  slug: job.slug,
  name: job.company,
  short: job.company.split(/[ (]/)[0],
  from: yearOf(job.start ?? undefined, 2000),
  to: yearOf(job.end ?? undefined, NOW_YEAR),
}));

const rawUses = mock.jobs.flatMap((job) =>
  job.uses.map((use) => ({ ...use, place: job.slug })),
) as Array<{ skill: string; place: string; years?: number; when?: string; from?: number; to?: number }>;

export const spans: SkillSpan[] = rawUses
  .map((use) => {
    const place = places.find((entry) => entry.slug === use.place)!;
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
      return { ...base, from: use.from, to: use.to ?? place.to, exact: true };
    }
    const length = Math.min(use.years ?? 1, Math.max(1, Math.round(placeYears)));
    if (use.when === "end") return { ...base, from: place.to - length, to: place.to, exact: false };
    if (use.when === "middle") {
      const pad = (placeYears - length) / 2;
      return { ...base, from: place.from + pad, to: place.to - pad, exact: false };
    }
    return { ...base, from: place.from, to: place.from + length, exact: false };
  })
  .sort((a, b) => a.from - b.from);

export const FIRST_YEAR = Math.floor(Math.min(...spans.map((span) => span.from)));
export const LAST_YEAR = Math.ceil(Math.max(...spans.map((span) => span.to)));
export const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

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

/** Years covered per skill, merged so overlapping jobs never count twice. */
export const skillTotals = skills
  .map((skill) => {
    const mine = spans.filter((span) => span.skill === skill.slug);
    if (mine.length === 0) return null;
    const merged = merge(mine);
    return {
      ...skill,
      years: totalYears(mine),
      first: Math.min(...mine.map((span) => span.from)),
      last: Math.max(...mine.map((span) => span.to)),
      spans: mine,
      merged,
    };
  })
  .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  .sort((a, b) => b.years - a.years);

/** Years covered per category, and how many of its skills were live each year. */
export const categoryTotals = categories.map((category) => {
  const mine = spans.filter(
    (span) => span.categories.includes(category.slug) && !skillsBySlug.get(span.skill)?.parent,
  );
  const clipped = category.era
    ? mine.filter((span) => span.to > category.era!).map((span) => ({ ...span, from: Math.max(span.from, category.era!) }))
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

export const headlineCategories = categoryTotals.filter((category) => category.headline);

/** How many distinct skills were live in a given year: the pulse of a career. */
export const skillsLiveIn = (year: number) =>
  new Set(spans.filter((span) => span.from <= year + 0.999 && span.to >= year).map((span) => span.skill)).size;

export const say = (years: number) => (years >= 10 ? `${Math.floor(years)}+` : years.toFixed(1));
