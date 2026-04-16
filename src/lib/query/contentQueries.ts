import { useQuery } from "@tanstack/react-query";
import { fetchContentByKey } from "../api/contentClient";
import type { PortfolioCoreSeed, ResumePayload } from "../../features/fast/types";
import portfolioCoresFallback from "../../data/portfolioCores.json";
import resumeFallback from "../../data/resume.json";

export const contentKeys = {
  all: ["content"] as const,
  byKey: (key: string) => [...contentKeys.all, key] as const,
};

export function usePortfolioCoresQuery() {
  return useQuery({
    queryKey: contentKeys.byKey("portfolio-cores"),
    queryFn: () =>
      fetchContentByKey<PortfolioCoreSeed[]>("portfolio-cores", {
        fallbackPayload: portfolioCoresFallback as PortfolioCoreSeed[],
        fallbackCategory: "portfolio",
      }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useResumeQuery() {
  return useQuery({
    queryKey: contentKeys.byKey("resume"),
    queryFn: () =>
      fetchContentByKey<ResumePayload>("resume", {
        fallbackPayload: resumeFallback as ResumePayload,
        fallbackCategory: "resume",
      }),
    staleTime: 1000 * 60 * 10,
  });
}
