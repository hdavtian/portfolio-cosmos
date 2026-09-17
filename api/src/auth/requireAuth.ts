import type { NextFunction, Request, Response } from "express";
import { parseCookies, verifySessionToken } from "./sessionToken.js";

// Shared by every app on harmadavtian.com: the same cookie name plus the same
// AUTH_COOKIE_SECRET means one login is accepted everywhere. Do not rename.
export const SESSION_COOKIE_NAME = "hd_session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { subject: string };
      requestId?: string;
    }
  }
}

export interface RequireAuthOptions {
  cookieSecret: string;
  enabled?: boolean;
  /** Paths reachable without a session, in addition to the auth endpoints. */
  publicPaths?: readonly string[];
}

// Deny by default: a route added later is protected unless it is listed here.
// This app's health endpoint is /healthz (it differs between apps).
const DEFAULT_PUBLIC_PATHS = [
  "/healthz",
  "/api/v1/auth/login",
  "/api/v1/auth/session",
] as const;

export function createRequireAuth({
  cookieSecret,
  enabled = true,
  publicPaths = [],
}: RequireAuthOptions) {
  const allowed = new Set<string>([...DEFAULT_PUBLIC_PATHS, ...publicPaths]);

  return function requireAuth(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    if (!enabled) {
      next();
      return;
    }

    if (request.method === "OPTIONS" || allowed.has(request.path)) {
      next();
      return;
    }

    const cookies = parseCookies(request.headers.cookie);
    const claims = verifySessionToken(cookies[SESSION_COOKIE_NAME], cookieSecret);

    if (!claims) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
          requestId: request.requestId ?? "unknown",
        },
      });
      return;
    }

    request.auth = { subject: claims.sub };
    next();
  };
}
