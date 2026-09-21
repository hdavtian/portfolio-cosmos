import { useMemo } from "react";
import { useReleaseQuery } from "../../../lib/query/contentQueries";
import { portfolioItemsFromRelease } from "../../fast/lib/portfolioTransform";
import type { PortfolioItem } from "../../fast/types";

export interface ShowcaseProject extends PortfolioItem {
  /** Colour of the project's core (Admin → Cores), used to tint the backdrop. */
  coreColor: string;
}

export interface ShowcaseCore {
  name: string;
  color: string;
  count: number;
}

const FALLBACK_TINT = "#7d8594";
const TOP_TECH_COUNT = 10;

/**
 * Published portfolio projects for the showcase site, in admin order, plus the
 * cores and most-used technologies that drive the filter chips.
 */
export function useShowcaseProjects() {
  const content = useReleaseQuery();

  return useMemo(() => {
    const release = content.data;
    const cores = release?.collections.portfolioCores ?? [];
    const colorByCore = new Map(cores.map((core) => [core.name, core.color ?? FALLBACK_TINT]));
    const flattened = release ? portfolioItemsFromRelease(release) : [];

    // Technology names are typed by hand in the admin ("css", "CSS "), so one
    // spelling is chosen per name: the one with the most capitals ("CSS",
    // "JavaScript"). Filters and chips then treat them as one.
    const spelling = new Map<string, string>();
    const capitals = (value: string) => value.replace(/[^A-Z]/g, "").length;
    flattened.forEach((item) =>
      item.technologies.forEach((raw) => {
        const tech = raw.trim();
        if (!tech) return;
        const key = tech.toLowerCase();
        const current = spelling.get(key);
        if (!current || capitals(tech) > capitals(current)) spelling.set(key, tech);
      }),
    );

    const projects: ShowcaseProject[] = flattened.map((item) => ({
      ...item,
      technologies: [
        ...new Set(
          item.technologies
            .map((raw) => spelling.get(raw.trim().toLowerCase()))
            .filter((tech): tech is string => Boolean(tech)),
        ),
      ],
      coreColor: colorByCore.get(item.category) ?? FALLBACK_TINT,
    }));

    const coreList: ShowcaseCore[] = cores
      .map((core) => ({
        name: core.name,
        color: core.color ?? FALLBACK_TINT,
        count: projects.filter((project) => project.category === core.name).length,
      }))
      .filter((core) => core.count > 0);

    const techCounts = new Map<string, number>();
    projects.forEach((project) =>
      project.technologies.forEach((tech) => techCounts.set(tech, (techCounts.get(tech) ?? 0) + 1)),
    );
    const topTech = [...techCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_TECH_COUNT)
      .map(([tech]) => tech);

    const years = projects.map((project) => project.year).filter((year): year is number => year !== null);

    return {
      isLoading: content.isLoading,
      projects,
      cores: coreList,
      topTech,
      yearRange: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
      personal: release?.profile ?? null,
    };
  }, [content.data, content.isLoading]);
}
