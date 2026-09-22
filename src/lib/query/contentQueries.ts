import { useQuery } from "@tanstack/react-query";
import { fetchSiteContent } from "../api/contentV2";
import { buildTechStackTree, techStackTreeFromSkills } from "@hd/content-schema/tech-stack-tree";
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

// Releases published before the tech stack existed have no nodes; the tree is
// then two levels, built from the skill categories and their skills.
const techStackFromRelease = (release: Release) => {
  const { techStackNodes, skillCategories, skills } = release.collections;
  const payload =
    techStackNodes.length > 0
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
