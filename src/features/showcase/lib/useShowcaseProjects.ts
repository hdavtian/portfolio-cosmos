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

/**
 * Published portfolio projects for the showcase site, in admin order, plus the
 * cores and the technologies offered as filter chips.
 *
 * Technology names come from the master list: a project links to records by
 * slug and the record's name is what shows, so "html" and "HTML" are one tag
 * without anyone editing the project. The chip row is the technologies ticked
 * for the filters surface (Admin -> Technologies -> Shown in), headings left
 * out, most-used first, with no cap - the tick is the only control (D23/D24).
 * A release from before the master list carries no links; its free-text tags
 * are shown as typed so that release still renders.
 */
export function useShowcaseProjects() {
  const content = useReleaseQuery();

  return useMemo(() => {
    const release = content.data;
    const cores = release?.collections.portfolioCores ?? [];
    const colorByCore = new Map(cores.map((core) => [core.name, core.color ?? FALLBACK_TINT]));
    const flattened = release ? portfolioItemsFromRelease(release) : [];

    const technologies = release?.collections.technologies ?? [];
    const nameBySlug = new Map(technologies.map((record) => [record.slug, record.name]));

    const projects: ShowcaseProject[] = flattened.map((item) => ({
      ...item,
      technologies:
        item.technologySlugs.length > 0
          ? [
              ...new Set(
                item.technologySlugs
                  .map((slug) => nameBySlug.get(slug))
                  .filter((name): name is string => Boolean(name)),
              ),
            ]
          : [...new Set(item.technologies.map((raw) => raw.trim()).filter(Boolean))],
      coreColor: colorByCore.get(item.category) ?? FALLBACK_TINT,
    }));

    const coreList: ShowcaseCore[] = cores
      .map((core) => ({
        name: core.name,
        color: core.color ?? FALLBACK_TINT,
        count: projects.filter((project) => project.category === core.name).length,
      }))
      .filter((core) => core.count > 0);

    const usedBy = new Map<string, number>();
    projects.forEach((project) =>
      project.technologies.forEach((name) => usedBy.set(name, (usedBy.get(name) ?? 0) + 1)),
    );
    const topTech = technologies
      .filter((record) => !record.isGrouping && record.surfaces.includes("filters"))
      .map((record) => record.name)
      .filter((name) => (usedBy.get(name) ?? 0) > 0)
      .sort((a, b) => (usedBy.get(b) ?? 0) - (usedBy.get(a) ?? 0) || a.localeCompare(b));

    const years = projects.map((project) => project.year).filter((year): year is number => year !== null);

    return {
      isLoading: content.isLoading,
      isError: content.isError,
      projects,
      cores: coreList,
      topTech,
      yearRange: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
      personal: release?.profile ?? null,
    };
  }, [content.data, content.isError, content.isLoading]);
}
