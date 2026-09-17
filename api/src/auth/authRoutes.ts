import { Router, type CookieOptions, type Request, type Response } from "express";
import { verifyPassword } from "./password.js";
import { SESSION_COOKIE_NAME } from "./requireAuth.js";
import { createSessionToken, parseCookies, verifySessionToken } from "./sessionToken.js";

// Ported from the shared sign-on reference. Endpoint paths, cookie name and
// token format match the other apps in the group.
//
// Small in-memory throttle: the gate protects a single-user app, so the goal is
// only to make online password guessing impractical. Counters reset on restart.
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attemptsByAddress = new Map<string, { count: number; firstAttemptAt: number }>();

export interface AuthConfig {
  passwordHash: string;
  cookieSecret: string;
  cookieDomain?: string;
  sessionTtlSeconds: number;
  secureCookie: boolean;
}

function isRateLimited(address: string): boolean {
  const entry = attemptsByAddress.get(address);
  if (!entry) return false;

  if (Date.now() - entry.firstAttemptAt > ATTEMPT_WINDOW_MS) {
    attemptsByAddress.delete(address);
    return false;
  }

  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(address: string): void {
  const entry = attemptsByAddress.get(address);

  if (!entry || Date.now() - entry.firstAttemptAt > ATTEMPT_WINDOW_MS) {
    attemptsByAddress.set(address, { count: 1, firstAttemptAt: Date.now() });
    return;
  }

  entry.count += 1;
}

function buildCookieOptions(auth: AuthConfig, maxAgeMs: number): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: auth.secureCookie,
    path: "/",
    maxAge: maxAgeMs,
  };

  if (auth.cookieDomain) {
    options.domain = auth.cookieDomain;
  }

  return options;
}

export function createAuthRoutes({ auth }: { auth: AuthConfig }): Router {
  const router = Router();

  router.get("/api/v1/auth/session", (request: Request, response: Response) => {
    const cookies = parseCookies(request.headers.cookie);
    const claims = verifySessionToken(cookies[SESSION_COOKIE_NAME], auth.cookieSecret);

    response.json({ authenticated: Boolean(claims) });
  });

  router.post("/api/v1/auth/login", async (request, response, next) => {
    try {
      const address = request.ip ?? "unknown";

      if (isRateLimited(address)) {
        response.status(429).json({
          error: {
            code: "TOO_MANY_ATTEMPTS",
            message: "Too many sign-in attempts. Try again later.",
            requestId: request.requestId ?? "unknown",
          },
        });
        return;
      }

      const password: unknown = (request.body as { password?: unknown } | undefined)?.password;
      const passwordIsValid =
        typeof password === "string" &&
        password.length > 0 &&
        (await verifyPassword(password, auth.passwordHash));

      if (!passwordIsValid) {
        recordFailure(address);
        response.status(401).json({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Incorrect password.",
            requestId: request.requestId ?? "unknown",
          },
        });
        return;
      }

      attemptsByAddress.delete(address);

      const token = createSessionToken({
        secret: auth.cookieSecret,
        subject: "owner",
        ttlSeconds: auth.sessionTtlSeconds,
      });

      response.cookie(
        SESSION_COOKIE_NAME,
        token,
        buildCookieOptions(auth, auth.sessionTtlSeconds * 1000),
      );
      response.json({ authenticated: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/v1/auth/logout", (_request: Request, response: Response) => {
    response.clearCookie(SESSION_COOKIE_NAME, buildCookieOptions(auth, 0));
    response.json({ authenticated: false });
  });

  return router;
}
