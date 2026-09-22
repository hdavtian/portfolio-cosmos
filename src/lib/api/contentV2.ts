import { API_BASE_URL, shouldSkipApiRequest } from "./contentClient";
import { toRelease, type Release, type ReleaseResponse } from "./release";

/**
 * The published content, from the API. There is one shape, the release as
 * stored (see release.ts), and every site reads it.
 *
 * If the API can't be reached, and the build allows it
 * (VITE_CONTENT_FALLBACK=on), the copy of a release bundled with the site
 * stands in: src/data/release.fallback.json, written by `npm run
 * content:fallback` from a published release, never by hand. Otherwise the
 * failure is an error, so it can't hide behind old content.
 */
export interface SiteContent {
  release: Release;
  /** "api" when served from the published release, "fallback" when the bundled copy was used. */
  source: "api" | "fallback";
}

const FALLBACK_ENABLED = import.meta.env.VITE_CONTENT_FALLBACK === "on";

const fallbackOrThrow = async (reason: string, cause?: unknown): Promise<SiteContent> => {
  if (FALLBACK_ENABLED) {
    const bundled = (await import("../../data/release.fallback.json")).default as unknown as ReleaseResponse;
    console.info(`[content] ${reason}; showing bundled fallback content (release ${bundled.etag.slice(0, 8)}).`, cause ?? "");
    return { release: toRelease(bundled), source: "fallback" };
  }
  console.error(`[content] ${reason}; bundled fallback is off (VITE_CONTENT_FALLBACK).`, cause ?? "");
  throw new Error(`[content] ${reason}`);
};

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
    return { release: toRelease(release), source: "api" };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[content]")) throw error;
    return fallbackOrThrow("API v2 unreachable", error);
  }
}
