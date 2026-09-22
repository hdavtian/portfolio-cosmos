// Only the projection back to the legacy shapes: the site must not bundle zod
// and every schema just to read published content.
import { toLegacy } from "@hd/content-schema/to-legacy";
import {
  buildTechStackTree,
  techStackTreeFromSkills,
  type TechStackTreeNode,
} from "@hd/content-schema/tech-stack-tree";
import type { PortfolioCoreSeed, ResumePayload } from "../../features/fast/types";
import { moonPortfolioMapping as moonPortfolioMappingFallback, type MoonPortfolioCompanyMapping } from "../../data/moonPortfolioMapping";
import aboutPathTravelMessagesFallback from "../../data/aboutPathTravelMessages.json";
import portfolioCoresFallback from "../../data/portfolioCores.json";
import resumeFallback from "../../data/resume.json";
import { API_BASE_URL, shouldSkipApiRequest } from "./contentClient";
import { toRelease, type Release, type ReleaseResponse } from "./release";

export type { TechStackTreeNode };

export interface AboutPathTravelMessage {
  id: string;
  textContent: string;
  fontFamily?: string[];
  fontSize?: string;
  fontColor?: string;
  fontShadow?: string;
}

export interface SiteContent {
  resume: ResumePayload;
  portfolioCores: PortfolioCoreSeed[];
  /** Which projects each job moon shows in the 3D site. */
  moonPortfolioMapping: MoonPortfolioCompanyMapping[];
  /** Messages shown during the Mjolnir ride in the 3D site's About section. */
  aboutPathTravelMessages: AboutPathTravelMessage[];
  /**
   * Nested tech stack (portfolio site, D3 skills graph). Separate from the
   * resume's one-level skills; built from those skills until a tech stack has
   * been published.
   */
  techStack: TechStackTreeNode[];
  /**
   * The same release in the shapes it is stored in (see release.ts). Sites are
   * being moved onto this; the older fields above go once none reads them.
   * Null only when bundled fallback content is standing in.
   */
  release: Release | null;
  /** "api" when served from the published release, "fallback" when bundled JSON was used. */
  source: "api" | "fallback";
  etag?: string;
}

/**
 * Whether bundled content may stand in for the API. Off unless the build sets
 * VITE_CONTENT_FALLBACK=on, so that while the sites are being moved onto the
 * API a failure shows up as a failure instead of hiding behind old content.
 */
const FALLBACK_ENABLED = import.meta.env.VITE_CONTENT_FALLBACK === "on";

const fallbackOrThrow = (reason: string, cause?: unknown): SiteContent => {
  if (FALLBACK_ENABLED) {
    console.info(`[content] ${reason}; showing bundled fallback content.`, cause ?? "");
    return FALLBACK;
  }
  console.error(`[content] ${reason}; bundled fallback is off (VITE_CONTENT_FALLBACK).`, cause ?? "");
  throw new Error(`[content] ${reason}`);
};

const FALLBACK: SiteContent = {
  resume: resumeFallback as ResumePayload,
  portfolioCores: portfolioCoresFallback as PortfolioCoreSeed[],
  moonPortfolioMapping: moonPortfolioMappingFallback,
  aboutPathTravelMessages: aboutPathTravelMessagesFallback as AboutPathTravelMessage[],
  techStack: techStackTreeFromSkills((resumeFallback as ResumePayload).skills),
  release: null,
  source: "fallback",
};

/**
 * Loads the published release from API v2 and projects it into the shapes the
 * current portfolio pages already use. Any failure - API down, nothing
 * published yet, or a page served somewhere the API is unreachable - falls
 * back to the content bundled with the build, so the site always renders.
 */
export async function fetchSiteContent(): Promise<SiteContent> {
  if (shouldSkipApiRequest()) return fallbackOrThrow("No reachable API is configured for this host");

  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/content/release`);
    if (!response.ok) {
      return fallbackOrThrow(
        response.status === 404 ? "Nothing has been published yet" : `API v2 returned ${response.status}`,
      );
    }

    const release = (await response.json()) as ReleaseResponse;
    console.info(`[content] Published content from the API (release ${release.etag.slice(0, 8)}).`);
    const legacy = toLegacy(release.content, (mediaId) => release.media[mediaId]?.url ?? "");

    return {
      resume: legacy.resume as unknown as ResumePayload,
      portfolioCores: legacy.portfolioCores as unknown as PortfolioCoreSeed[],
      moonPortfolioMapping: legacy.moonPortfolioMapping as MoonPortfolioCompanyMapping[],
      aboutPathTravelMessages: legacy.aboutPathTravelMessages as AboutPathTravelMessage[],
      // Releases published before the tech stack existed have no nodes.
      techStack:
        (release.content.collections.techStackNodes ?? []).length > 0
          ? buildTechStackTree(release.content.collections.techStackNodes)
          : techStackTreeFromSkills((legacy.resume as unknown as ResumePayload).skills),
      release: toRelease(release),
      source: "api",
      etag: release.etag,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[content]")) throw error;
    return fallbackOrThrow("API v2 unreachable", error);
  }
}
