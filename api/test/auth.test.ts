import { randomBytes, scryptSync } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { SESSION_COOKIE_NAME } from "../src/auth/requireAuth.js";
import {
  createSessionToken,
  parseCookies,
  verifySessionToken,
} from "../src/auth/sessionToken.js";

// Matches vitest.config.ts, which seeds the same password/secret.
const TEST_PASSWORD = "test-password";

const app = createApp();

describe("password hashing", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("hunter2");

    expect(hash.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("hunter2", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("verifies a hash produced by the shared reference implementation", async () => {
    // Same format the other apps store: scrypt$N$r$p$salt$key
    const salt = randomBytes(16);
    const derived = scryptSync("shared", salt, 64, { N: 16384, r: 8, p: 1 });
    const stored = ["scrypt", 16384, 8, 1, salt.toString("base64"), derived.toString("base64")].join(
      "$",
    );

    expect(await verifyPassword("shared", stored)).toBe(true);
  });

  it("rejects malformed hashes instead of throwing", async () => {
    for (const bad of ["", "nope", "bcrypt$1$2$3$4$5", "scrypt$a$b$c$d$e"]) {
      expect(await verifyPassword("x", bad), bad).toBe(false);
    }
  });
});

describe("session token", () => {
  const secret = "a".repeat(40);

  it("signs and verifies a token", () => {
    const token = createSessionToken({ secret, subject: "owner", ttlSeconds: 60 });
    const claims = verifySessionToken(token, secret);

    expect(claims?.sub).toBe("owner");
    expect(token.split(".")).toHaveLength(2);
  });

  it("rejects a wrong secret, a tampered payload and an expired token", () => {
    const token = createSessionToken({ secret, subject: "owner", ttlSeconds: 60 });

    expect(verifySessionToken(token, "b".repeat(40))).toBeNull();
    expect(verifySessionToken(`x${token}`, secret)).toBeNull();
    expect(
      verifySessionToken(
        createSessionToken({ secret, subject: "owner", ttlSeconds: -10 }),
        secret,
      ),
    ).toBeNull();
  });

  it("parses cookie headers", () => {
    expect(parseCookies("a=1; hd_session=abc%20def; b=2")).toEqual({
      a: "1",
      hd_session: "abc def",
      b: "2",
    });
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe("auth endpoints", () => {
  it("reports an unauthenticated session by default", async () => {
    const response = await request(app).get("/api/v1/auth/session");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: false });
  });

  it("rejects a wrong password with the shared error envelope", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ password: "not-the-password" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("issues an hd_session cookie on success and accepts it afterwards", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ password: TEST_PASSWORD });

    expect(login.status).toBe(200);
    expect(login.body).toEqual({ authenticated: true });

    const setCookie = login.headers["set-cookie"] as string | string[] | undefined;
    const cookie = ([] as string[])
      .concat(setCookie ?? [])
      .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));

    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    const session = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", cookie!);

    expect(session.body).toEqual({ authenticated: true });
  });

  it("clears the cookie on logout", async () => {
    const response = await request(app).post("/api/v1/auth/logout");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: false });
  });
});
