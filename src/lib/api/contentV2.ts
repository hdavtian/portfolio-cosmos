import type { ContentBundle } from "@hd/content-schema";
// Only the projection back to the legacy shapes: the site must not bundle zod
// and every schema just to read published content.
import { toLegacy } from "@hd/content-schema/to-legacy";
import type { PortfolioCoreSeed, ResumePayload } from "../../features/fast/types";
import { moonPortfolioMapping as moonPortfolioMappingFallback, type MoonPortfolioCompanyMapping } from "../../data/moonPortfolioMapping";
import aboutPathTravelMessagesFallback from "../../data/aboutPathTravelMessages.json";
import portfolioCoresFallback from "../../data/portfolioCores.json";
import resumeFallback from "../../data/resume.json";
import { API_BASE_URL, shouldSkipApiRequest } from "./contentClient";

export interface AboutPathTravelMessage {
  id: string;
  textContent: string;
  fontFamily?: string[];
  fontSize?: string;
  fontColor?: string;
  fontShadow?: string;
}

interface ReleaseResponse {
  etag: string;
  draft: boolean;
  content: ContentBundle;
  media: Record<string, { url: string; altText: string; width?: number; height?: number }>;
}

export interface SiteContent {
  resume: ResumePayload;
  portfolioCores: PortfolioCoreSeed[];
  /** Which projects each job moon shows in the 3D site. */
  moonPortfolioMapping: MoonPortfolioCompanyMapping[];
  /** Messages shown during the Mjolnir ride in the 3D site's About section. */
  aboutPathTravelMessages: AboutPathTravelMessage[];
  /** "api" when served from the published release, "fallback" when bundled JSON was used. */
  source: "api" | "fallback";
  etag?: string;
}

const FALLBACK: SiteContent = {
  resume: resumeFallback as ResumePayload,
  portfolioCores: portfolioCoresFallback as PortfolioCoreSeed[],
  moonPortfolioMapping: moonPortfolioMappingFallback,
  aboutPathTravelMessages: aboutPathTravelMessagesFallback as AboutPathTravelMessage[],
  source: "fallback",
};

/**
 * Loads the published release from API v2 and projects it into the shapes the
 * current portfolio pages already use. Any failure - API down, nothing
 * published yet, or a page served somewhere the API is unreachable - falls
 * back to the content bundled with the build, so the site always renders.
 */
export async function fetchSiteContent(): Promise<SiteContent> {
  if (shouldSkipApiRequest()) return FALLBACK;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/content/release`);
    if (!response.ok) {
      if (response.status !== 404) {
        console.warn(`[content] API v2 returned ${response.status}; using bundled content.`);
      }
      return FALLBACK;
    }

    const release = (await response.json()) as ReleaseResponse;
    const legacy = toLegacy(release.content, (mediaId) => release.media[mediaId]?.url ?? "");

    return {
      resume: legacy.resume as unknown as ResumePayload,
      portfolioCores: legacy.portfolioCores as unknown as PortfolioCoreSeed[],
      moonPortfolioMapping: legacy.moonPortfolioMapping as MoonPortfolioCompanyMapping[],
      aboutPathTravelMessages: legacy.aboutPathTravelMessages as AboutPathTravelMessage[],
      source: "api",
      etag: release.etag,
    };
  } catch (error) {
    console.warn("[content] API v2 unreachable; using bundled content.", error);
    return FALLBACK;
  }
}
