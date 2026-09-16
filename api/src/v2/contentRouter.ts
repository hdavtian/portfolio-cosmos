import type { ContentBundle } from "@hd/content-schema";
import { Router } from "express";
import { z } from "zod";
import { parseCookies, verifySessionToken } from "../auth/sessionToken.js";
import { SESSION_COOKIE_NAME } from "../auth/requireAuth.js";
import { getDb } from "./db.js";
import { ApiError, asyncHandler, parseOrThrow } from "./http.js";
import { ReleaseService } from "./releaseService.js";

// Public read API for both experiences. Serves the current release only, so a
// half-finished edit can never reach a visitor. A signed-in admin may ask for
// the draft instead, which is what the admin's preview buttons use.
const areaSchema = z.enum(["resume", "portfolio", "about", "cosmos"]);
type Area = z.infer<typeof areaSchema>;

const AREA_CONTENTS: Record<Area, { singletons: string[]; collections: string[] }> = {
  resume: {
    singletons: ["profile"],
    collections: ["education", "certifications", "links", "skillCategories", "skills", "experiences"],
  },
  portfolio: {
    singletons: [],
    collections: ["portfolioCores", "portfolioEntries", "moonPortfolioMappings"],
  },
  about: { singletons: [], collections: ["aboutDeckSlides", "pathTravelMessages"] },
  cosmos: {
    singletons: ["cosmosIntroduction"],
    collections: ["guidedTours", "cosmosPlanets"],
  },
};

const sliceArea = (bundle: ContentBundle, area: Area) => {
  const { singletons, collections } = AREA_CONTENTS[area];
  return {
    singletons: Object.fromEntries(
      singletons.map((name) => [name, bundle.singletons[name as keyof ContentBundle["singletons"]]]),
    ),
    collections: Object.fromEntries(
      collections.map((name) => [
        name,
        bundle.collections[name as keyof ContentBundle["collections"]],
      ]),
    ),
  };
};

const isSignedIn = (req: { headers: { cookie?: string } }, cookieSecret: string): boolean =>
  Boolean(
    verifySessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME], cookieSecret),
  );

export function createContentRouter({ cookieSecret }: { cookieSecret: string }): Router {
  const router = Router();
  const service = () => new ReleaseService(getDb());

  /** Resolves the bundle to serve: the current release, or drafts for preview. */
  const resolveBundle = async (
    req: Parameters<typeof isSignedIn>[0] & { query: Record<string, unknown> },
  ): Promise<{ content: ContentBundle; etag: string; draft: boolean }> => {
    const wantsDraft = req.query.preview === "draft";

    if (wantsDraft) {
      if (!isSignedIn(req, cookieSecret)) {
        throw new ApiError(401, "UNAUTHORIZED", "Sign in to preview drafts.");
      }
      const content = await service().buildDraftBundle();
      return { content, etag: `draft-${Date.now()}`, draft: true };
    }

    const release = await service().current();
    if (!release) {
      throw ApiError.notFound("Nothing has been published yet.");
    }
    return { content: release.content, etag: release.etag, draft: false };
  };

  const send = (
    req: { headers: Record<string, unknown> },
    res: {
      status: (code: number) => { end: () => void };
      set: (headers: Record<string, string>) => void;
      json: (body: unknown) => void;
    },
    etag: string,
    draft: boolean,
    body: unknown,
  ): void => {
    const quoted = `"${etag}"`;

    // Drafts must never be cached; published content is safe to cache briefly
    // and revalidate by ETag, which keeps Atlas out of the hot path.
    res.set({
      ETag: quoted,
      "Cache-Control": draft ? "no-store" : "public, max-age=60, must-revalidate",
    });

    if (!draft && req.headers["if-none-match"] === quoted) {
      res.status(304).end();
      return;
    }

    res.json(body);
  };

  router.get(
    "/release",
    asyncHandler(async (req, res) => {
      const { content, etag, draft } = await resolveBundle(req);
      send(req, res, etag, draft, { etag, draft, content });
    }),
  );

  router.get(
    "/:area",
    asyncHandler(async (req, res) => {
      const area = parseOrThrow(areaSchema, req.params.area, "Unknown content area");
      const { content, etag, draft } = await resolveBundle(req);
      send(req, res, etag, draft, { etag, draft, area, content: sliceArea(content, area) });
    }),
  );

  return router;
}
