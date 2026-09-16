import { createHmac, timingSafeEqual } from "node:crypto";

// Ported from shared-login-for-personal-apps/reference/server/lib/sessionToken.mjs.
// DO NOT change the token format, cookie name or signing algorithm: single
// sign-on works only because every app in the group agrees on them.
//
// Stateless signed tokens: the cookie carries the claim and the server only
// verifies a signature, so no session store is needed.

export interface SessionClaims {
  sub: string;
  iat: number;
  exp: number;
}

const base64UrlEncode = (input: string): string =>
  Buffer.from(input, "utf8").toString("base64url");

const sign = (payload: string, secret: string): string =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export function createSessionToken({
  secret,
  subject,
  ttlSeconds,
}: {
  secret: string;
  subject: string;
  ttlSeconds: number;
}): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({ sub: subject, iat: issuedAt, exp: issuedAt + ttlSeconds }),
  );

  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
): SessionClaims | null {
  const value = String(token ?? "");
  const separatorIndex = value.indexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expected = sign(payload, secret);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!claims || typeof claims !== "object") {
    return null;
  }

  const parsed = claims as Partial<SessionClaims>;
  if (typeof parsed.exp !== "number" || typeof parsed.sub !== "string") {
    return null;
  }

  if (parsed.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return parsed as SessionClaims;
}

export function parseCookies(
  cookieHeader: string | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const part of String(cookieHeader ?? "").split(";")) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();

    if (name.length > 0) {
      result[name] = decodeURIComponent(rawValue);
    }
  }

  return result;
}
