import { useMemo } from "react";
import { usePortfolioCoresQuery, useResumeQuery } from "../../../lib/query/contentQueries";
import { flattenPortfolioCores } from "../../fast/lib/portfolioTransform";
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
  const portfolio = usePortfolioCoresQuery();
  const resume = useResumeQuery();

  return useMemo(() => {
    const cores = portfolio.data?.payload ?? [];
    const colorByCore = new Map(cores.map((core) => [core.core, core.coreColor ?? FALLBACK_TINT]));
    const flattened = flattenPortfolioCores(cores);

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
        name: core.core,
        color: core.coreColor ?? FALLBACK_TINT,
        count: projects.filter((project) => project.category === core.core).length,
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
      isLoading: portfolio.isLoading,
      projects,
      cores: coreList,
      topTech,
      yearRange: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
      personal: resume.data?.payload.personal ?? null,
    };
  }, [portfolio.data, portfolio.isLoading, resume.data]);
}
