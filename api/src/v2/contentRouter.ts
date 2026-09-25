import type { ContentBundle } from "@hd/content-schema";
import { Router } from "express";
import { z } from "zod";
import { parseCookies, verifySessionToken } from "../auth/sessionToken.js";
import { SESSION_COOKIE_NAME } from "../auth/requireAuth.js";
import { getDb } from "./db.js";
import { ApiError, asyncHandler, parseOrThrow } from "./http.js";
import { mediaUrl } from "./mediaStorage.js";
import { collectMediaIds, ReleaseService, type ReleaseMedia } from "./releaseService.js";
import { resumeDocx, resumeModel, resumePdf, resumeText } from "@hd/resume-export";

// Public read API for both experiences. Serves the current release only, so a
// half-finished edit can never reach a visitor. A signed-in admin may ask for
// the draft instead, which is what the admin's preview buttons use.
const areaSchema = z.enum(["resume", "portfolio", "about", "cosmos"]);
type Area = z.infer<typeof areaSchema>;

const AREA_CONTENTS: Record<Area, { singletons: string[]; collections: string[] }> = {
  resume: {
    singletons: ["profile", "resumeSkills"],
    collections: ["education", "certifications", "links", "technologies", "experiences"],
  },
  portfolio: {
    singletons: [],
    collections: ["portfolioCores", "portfolioEntries", "moonPortfolioMappings", "technologies"],
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

/**
 * Images the served content references, with public URLs. Content stores media
 * ids only; clients look each one up here instead of making extra requests.
 */
const servedMedia = (content: unknown, media: Record<string, ReleaseMedia>) =>
  Object.fromEntries(
    collectMediaIds(content)
      .filter((id) => id in media)
      .map((id) => {
        const { blobPath, ...details } = media[id];
        return [id, { ...details, url: mediaUrl(blobPath) }];
      }),
  );

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
  ): Promise<{
    content: ContentBundle;
    media: Record<string, ReleaseMedia>;
    etag: string;
    draft: boolean;
  }> => {
    const wantsDraft = req.query.preview === "draft";

    if (wantsDraft) {
      if (!isSignedIn(req, cookieSecret)) {
        throw new ApiError(401, "UNAUTHORIZED", "Sign in to preview drafts.");
      }
      const content = await service().buildDraftBundle();
      const media = await service().mediaSnapshot(content);
      return { content, media, etag: `draft-${Date.now()}`, draft: true };
    }

    const release = await service().current();
    if (!release) {
      throw ApiError.notFound("Nothing has been published yet.");
    }
    return { content: release.content, media: release.media, etag: release.etag, draft: false };
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

    // Drafts must never be cached. Published content revalidates on every load
    // (no-cache + ETag): unchanged content costs an empty 304, and a new publish
    // shows up immediately instead of after a max-age window.
    res.set({
      ETag: quoted,
      "Cache-Control": draft ? "no-store" : "public, no-cache",
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
      const { content, media, etag, draft } = await resolveBundle(req);
      send(req, res, etag, draft, { etag, draft, content, media: servedMedia(content, media) });
    }),
  );

  // The resume as a file, written from the current release on each request:
  // a link that always returns the current version.
  const RESUME_FILES = {
    docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", write: resumeDocx },
    pdf: { type: "application/pdf", write: resumePdf },
    txt: { type: "text/plain; charset=utf-8", write: async (model: ReturnType<typeof resumeModel>) => resumeText(model) },
  } as const;
  const resumeFormatSchema = z.enum(["docx", "pdf", "txt"]);
  router.get(
    "/resume.:format",
    asyncHandler(async (req, res) => {
      const format = parseOrThrow(resumeFormatSchema, req.params.format, "Unknown resume format");
      const { content, draft } = await resolveBundle(req);
      const model = resumeModel({
        profile: content.singletons.profile,
        resumeSkills: content.singletons.resumeSkills,
        collections: content.collections,
      });
      const file = RESUME_FILES[format];
      const body = await file.write(model);
      res.set({
        "Content-Type": file.type,
        "Content-Disposition": `attachment; filename="${model.fileStem}.${format}"`,
        "Cache-Control": draft ? "no-store" : "public, no-cache",
      });
      res.send(typeof body === "string" ? body : Buffer.from(new Uint8Array(body)));
    }),
  );

  router.get(
    "/:area",
    asyncHandler(async (req, res) => {
      const area = parseOrThrow(areaSchema, req.params.area, "Unknown content area");
      const { content, media, etag, draft } = await resolveBundle(req);
      const sliced = sliceArea(content, area);
      send(req, res, etag, draft, { etag, draft, area, content: sliced, media: servedMedia(sliced, media) });
    }),
  );

  return router;
}
