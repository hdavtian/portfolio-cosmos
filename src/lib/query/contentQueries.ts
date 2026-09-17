import { useQuery } from "@tanstack/react-query";
import { fetchSiteContent } from "../api/contentV2";

export const contentKeys = {
  all: ["content"] as const,
  release: () => [...contentKeys.all, "v2", "release"] as const,
};

// One request for the whole published release, shared by every page through
// the query cache. Each hook selects its slice and keeps the `{ payload }`
// envelope the pages were written against, so they needed no changes.
const releaseQuery = {
  queryKey: contentKeys.release(),
  queryFn: fetchSiteContent,
  staleTime: 60_000,
  gcTime: 1000 * 60 * 60 * 24,
  refetchOnMount: "always" as const,
};

export function usePortfolioCoresQuery() {
  return useQuery({
    ...releaseQuery,
    select: (content) => ({ payload: content.portfolioCores, source: content.source }),
  });
}

/** Nested tech stack for the D3 skills graph (and the portfolio site redesign). */
export function useTechStackQuery() {
  return useQuery({
    ...releaseQuery,
    select: (content) => ({ payload: content.techStack, source: content.source }),
  });
}

export function useResumeQuery() {
  return useQuery({
    ...releaseQuery,
    select: (content) => ({ payload: content.resume, source: content.source }),
  });
}

/** Published content the 3D site reads: portfolio, moon filters and ride messages. */
export function useCosmosContentQuery() {
  return useQuery({
    ...releaseQuery,
    select: (content) => ({
      portfolioCores: content.portfolioCores,
      moonPortfolioMapping: content.moonPortfolioMapping,
      aboutPathTravelMessages: content.aboutPathTravelMessages,
      techStack: content.techStack,
      source: content.source,
    }),
  });
}