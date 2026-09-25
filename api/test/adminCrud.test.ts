import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { SESSION_COOKIE_NAME } from "../src/auth/requireAuth.js";
import { createSessionToken } from "../src/auth/sessionToken.js";
import { getDb } from "../src/v2/db.js";
import { ensureIndexes } from "../src/v2/indexes.js";
import { mongoAvailable, resetDb, SKIP_MESSAGE, stopMongo } from "./helpers/mongo.js";

const app = createApp();

// Requires local Docker MongoDB; skipped (not failed) when it is not running.
const dockerMongo = await mongoAvailable();

// Matches vitest.config.ts.
const COOKIE_SECRET = "test-cookie-secret-test-cookie-secret";

const authCookie = (): string => {
  const token = createSessionToken({
    secret: COOKIE_SECRET,
    subject: "owner",
    ttlSeconds: 3600,
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
};

const skill = (overrides: Record<string, unknown> = {}) => ({
  slug: "typescript",
  sortOrder: 0,
  name: "TypeScript",
  ...overrides,
});

describe.skipIf(!dockerMongo)(`v2 admin CRUD (${dockerMongo ? "docker" : SKIP_MESSAGE})`, () => {
  beforeAll(async () => {
    await ensureIndexes(getDb());
  }, 60_000);

  afterAll(async () => {
    await stopMongo();
  });

  beforeEach(async () => {
    await resetDb();
    await ensureIndexes(getDb());
  });

  it("rejects every admin route without a session", async () => {
    const calls = [
      request(app).get("/api/v2/admin/technologies"),
      request(app).post("/api/v2/admin/technologies").send(skill()),
      request(app).get("/api/v2/admin/singletons/profile"),
    ];

    for (const call of calls) {
      const response = await call;
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    }
  });

  it("creates, reads, lists, updates and deletes a record", async () => {
    const created = await request(app)
      .post("/api/v2/admin/technologies")
      .set("Cookie", authCookie())
      .send(skill());

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ slug: "typescript", name: "TypeScript", version: 1 });
    expect(created.body.id).toMatch(/^[a-f0-9]{24}$/);
    expect(created.body.updatedBy).toBe("owner");

    const read = await request(app)
      .get("/api/v2/admin/technologies/typescript")
      .set("Cookie", authCookie());
    expect(read.status).toBe(200);
    expect(read.body.name).toBe("TypeScript");

    const list = await request(app)
      .get("/api/v2/admin/technologies?page=1&pageSize=25")
      .set("Cookie", authCookie());
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 25 });
    expect(list.body.items).toHaveLength(1);

    const updated = await request(app)
      .put("/api/v2/admin/technologies/typescript")
      .set("Cookie", authCookie())
      .send({ ...skill({ name: "TypeScript 5" }), version: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: "TypeScript 5", version: 2 });

    const deleted = await request(app)
      .delete("/api/v2/admin/technologies/typescript")
      .set("Cookie", authCookie());
    expect(deleted.status).toBe(204);

    const missing = await request(app)
      .get("/api/v2/admin/technologies/typescript")
      .set("Cookie", authCookie());
    expect(missing.status).toBe(404);
  });

  it("returns 409 when the record changed since it was loaded", async () => {
    await request(app).post("/api/v2/admin/technologies").set("Cookie", authCookie()).send(skill());
    await request(app)
      .put("/api/v2/admin/technologies/typescript")
      .set("Cookie", authCookie())
      .send({ ...skill({ name: "First" }), version: 1 });

    const stale = await request(app)
      .put("/api/v2/admin/technologies/typescript")
      .set("Cookie", authCookie())
      .send({ ...skill({ name: "Second" }), version: 1 });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("CONFLICT");
  });

  it("rejects a duplicate slug and invalid input with field details", async () => {
    await request(app).post("/api/v2/admin/technologies").set("Cookie", authCookie()).send(skill());

    const duplicate = await request(app)
      .post("/api/v2/admin/technologies")
      .set("Cookie", authCookie())
      .send(skill({ name: "Other" }));
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.details?.[0].path).toBe("slug");

    const invalid = await request(app)
      .post("/api/v2/admin/technologies")
      .set("Cookie", authCookie())
      .send(skill({ slug: "Not A Slug" }));
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details?.some((d: { path: string }) => d.path === "slug")).toBe(true);
  });

  it("persists drag-and-drop ordering", async () => {
    for (const [index, name] of ["a", "b", "c"].entries()) {
      await request(app)
        .post("/api/v2/admin/technologies")
        .set("Cookie", authCookie())
        .send(skill({ slug: name, name: name.toUpperCase(), sortOrder: index }));
    }

    const reordered = await request(app)
      .put("/api/v2/admin/technologies/order")
      .set("Cookie", authCookie())
      .send({ slugs: ["c", "a", "b"] });
    expect(reordered.status).toBe(200);

    const list = await request(app).get("/api/v2/admin/technologies").set("Cookie", authCookie());
    expect(list.body.items.map((item: { slug: string }) => item.slug)).toEqual(["c", "a", "b"]);
  });

  it("reads and writes a singleton with version checking", async () => {
    const profile = {
      name: "Harma Davtian",
      title: "Full Stack Engineer",
      email: "harma.davtian@gmail.com",
      phone: "818.632.1804",
      location: "Glendale, CA",
      summary: "Full stack engineer.",
    };

    const missing = await request(app)
      .get("/api/v2/admin/singletons/profile")
      .set("Cookie", authCookie());
    expect(missing.status).toBe(404);

    const saved = await request(app)
      .put("/api/v2/admin/singletons/profile")
      .set("Cookie", authCookie())
      .send({ data: profile, version: 0 });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(1);

    const read = await request(app)
      .get("/api/v2/admin/singletons/profile")
      .set("Cookie", authCookie());
    expect(read.body.data.name).toBe("Harma Davtian");

    const stale = await request(app)
      .put("/api/v2/admin/singletons/profile")
      .set("Cookie", authCookie())
      .send({ data: profile, version: 0 });
    expect(stale.status).toBe(409);
  });
});
