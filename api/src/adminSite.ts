import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Request, type RequestHandler, type Router } from "express";
import helmet from "helmet";

/**
 * Serves the admin SPA on its own hostname (portfolio-admin.harmadavtian.com)
 * from the same app as the API, so the admin calls the API at relative paths:
 * same origin, first-party session cookie, no CORS. Requests on any other host,
 * and API paths on the admin host, fall through to the API routes.
 */

const API_PATHS = [/^\/api\//, /^\/healthz$/, /^\/swagger(\/|$)/, /^\/openapi\.json$/];

export interface AdminSiteOptions {
  /** Hostname that serves the admin, e.g. portfolio-admin.harmadavtian.com. */
  host: string;
  /** Folder holding the admin build (index.html + assets). */
  distDir: string;
  /** Public media origin the admin previews images from. */
  mediaOrigin?: string;
}

export const createAdminSite = ({ host, distDir, mediaOrigin }: AdminSiteOptions): Router | null => {
  if (!existsSync(path.join(distDir, "index.html"))) return null;

  const isAdminPage = (request: Request) =>
    request.hostname === host && !API_PATHS.some((pattern) => pattern.test(request.path));

  const onlyAdmin =
    (handler: RequestHandler): RequestHandler =>
    (request, response, next) =>
      isAdminPage(request) ? handler(request, response, next) : next();

  const imageSources = ["'self'", "data:", "blob:", ...(mediaOrigin ? [mediaOrigin] : [])];
  const router = express.Router();

  // The admin shows media from blob storage; everything else stays same-origin.
  router.use(
    onlyAdmin(
      helmet.contentSecurityPolicy({
        directives: {
          "img-src": imageSources,
          "media-src": imageSources,
          "connect-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
        },
      }),
    ),
  );

  // Hashed assets are immutable; index.html must always revalidate.
  router.use(
    onlyAdmin(
      express.static(distDir, {
        index: false,
        setHeaders: (response, filePath) => {
          response.setHeader(
            "Cache-Control",
            filePath.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
          );
        },
      }),
    ),
  );

  // Client-side routes: any other GET on the admin host gets the SPA shell.
  router.get(
    /.*/,
    onlyAdmin((_request, response) => {
      response.setHeader("Cache-Control", "no-cache");
      // Relative to root, so a dot-folder in distDir's own path isn't refused.
      response.sendFile("index.html", { root: distDir });
    }),
  );

  return router;
};
