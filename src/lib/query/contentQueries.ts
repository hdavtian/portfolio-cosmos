import { useQuery } from "@tanstack/react-query";
import { fetchSiteContent } from "../api/contentV2";
import { buildTechStackTree, techStackTreeFromSkills, type TechStackTreeNode } from "@hd/content-schema/tech-stack-tree";
import {
  buildTechnologyTree,
  hasVisibleChildren,
  type TechnologyRecord,
  type TechnologyTreeNode,
} from "@hd/content-schema/technology-tree";
import type { Release } from "../api/release";
import { spaceContentFromRelease } from "../../components/cosmos/spaceContent";
import { portfolioItemsFromRelease } from "../../features/fast/lib/portfolioTransform";

export const contentKeys = {
  all: ["content"] as const,
  release: () => [...contentKeys.all, "v2", "release"] as const,
};

// One request for the whole published release, shared by every page through
// the query cache. Each hook selects its slice.
export const releaseQuery = {
  queryKey: contentKeys.release(),
  queryFn: fetchSiteContent,
  staleTime: 60_000,
  gcTime: 1000 * 60 * 60 * 24,
  refetchOnMount: "always" as const,
  // A request that fails is treated as "offline" by default and parked until
  // the network comes back, which leaves the page on "Loading…" for ever when
  // it is the API, not the visitor, that is down. Always attempt, so a failure
  // becomes an error (or the bundled fallback) after the retry.
  networkMode: "always" as const,
};

/**
 * The tree the portfolio site draws (constellation, skills lattice, About
 * ride), read from the master technology list: entries ticked for the lattice
 * surface, nested under their headings, a heading kept only while something
 * visible sits under it (so an empty heading such as AI draws nothing). The
 * shape is the one the scenes already take, so they need no change.
 */
const latticeFromTechnologies = (records: TechnologyRecord[]): TechStackTreeNode[] => {
  const shown = (record: TechnologyRecord) =>
    record.isGrouping
      ? hasVisibleChildren(records, record.slug, "lattice")
      : (record.surfaces ?? []).includes("lattice");
  const toNode = (node: TechnologyTreeNode): TechStackTreeNode => ({
    slug: node.slug,
    name: node.name,
    children: node.children.map(toNode),
  });
  return buildTechnologyTree(records.filter(shown)).map(toNode);
};

// A release from before the master list has no technologies: the tree then
// comes from the tech stack nodes, or before those, from the skill categories.
const techStackFromRelease = (release: Release) => {
  const { technologies, techStackNodes, skillCategories, skills } = release.collections;
  const payload =
    technologies.length > 0
      ? latticeFromTechnologies(technologies)
      : techStackNodes.length > 0
      ? buildTechStackTree(techStackNodes)
      : techStackTreeFromSkills(
          Object.fromEntries(
            skillCategories.map((category) => [
              category.name,
              skills.filter((skill) => skill.categorySlug === category.slug).map((skill) => skill.name),
            ]),
          ),
        );
  return { payload, source: "api" as const };
};

/** Nested tech stack for the D3 skills graph (and the portfolio site redesign). */
export function useTechStackQuery() {
  return useReleaseQuery(techStackFromRelease);
}

/**
 * The published release in its stored shapes: the one source every site is
 * moving onto. Pass a selector to take only what a component needs, so it
 * re-renders only when that part changes.
 */
export function useReleaseQuery<T = Release>(select?: (release: Release) => T) {
  return useQuery({
    ...releaseQuery,
    select: (content) => (select ? select(content.release) : (content.release as T)),
  });
}

/** The published projects, one per entry or client site, in portfolio order. */
export function usePortfolioItemsQuery() {
  return useReleaseQuery(portfolioItemsFromRelease);
}

/** Everything the 3D site shows (see components/cosmos/spaceContent.ts). */
export function useSpaceContentQuery() {
  return useReleaseQuery(spaceContentFromRelease);
}
