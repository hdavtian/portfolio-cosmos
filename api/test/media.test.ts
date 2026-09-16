import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { SESSION_COOKIE_NAME } from "../src/auth/requireAuth.js";
import { createSessionToken } from "../src/auth/sessionToken.js";
import { getDb } from "../src/v2/db.js";
import { ensureIndexes } from "../src/v2/indexes.js";
import { getMediaContainer } from "../src/v2/mediaStorage.js";
import { mongoAvailable, resetDb, SKIP_MESSAGE, stopMongo } from "./helpers/mongo.js";

const app = createApp();
const COOKIE_SECRET = "test-cookie-secret-test-cookie-secret";

const dockerMongo = await mongoAvailable();

const authCookie = (): string =>
  `${SESSION_COOKIE_NAME}=${createSessionToken({
    secret: COOKIE_SECRET,
    subject: "owner",
    ttlSeconds: 3600,
  })}`;

// A real PNG carrying EXIF-style metadata, so the re-encode is meaningful.
const samplePng = async (): Promise<Buffer> =>
  sharp({
    create: { width: 40, height: 24, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .withMetadata({ exif: { IFD0: { Copyright: "secret-location-data" } } })
    .png()
    .toBuffer();

describe.skipIf(!dockerMongo)(`v2 media (${dockerMongo ? "docker" : SKIP_MESSAGE})`, () => {
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

  it("requires a session", async () => {
    const response = await request(app).get("/api/v2/admin/media");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("uploads an image, stores the blob and records its dimensions", async () => {
    const response = await request(app)
      .post("/api/v2/admin/media")
      .set("Cookie", authCookie())
      .attach("file", await samplePng(), "My Photo.png")
      .field("altText", "A red rectangle");

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      contentType: "image/png",
      width: 40,
      height: 24,
      altText: "A red rectangle",
      version: 1,
    });
    expect(response.body.blobPath).toMatch(/^scrolling-resume\/uploads\/my-photo-\d+\.png$/);
    expect(response.body.url).toContain(response.body.blobPath);

    // The blob really exists in Azurite, and the stored bytes are the
    // re-encoded image (EXIF stripped), not the original upload.
    const container = await getMediaContainer();
    const blob = container.getBlockBlobClient(response.body.blobPath);
    expect(await blob.exists()).toBe(true);

    const downloaded = await blob.downloadToBuffer();
    expect(downloaded.byteLength).toBe(response.body.bytes);
    expect(downloaded.toString("latin1")).not.toContain("secret-location-data");
  });

  it("rejects a file that is not an image", async () => {
    const response = await request(app)
      .post("/api/v2/admin/media")
      .set("Cookie", authCookie())
      .attach("file", Buffer.from("#!/bin/sh\necho hello\n"), "payload.png");

    expect(response.status).toBe(400);
    expect(response.body.error.details?.[0].path).toBe("file");
  });

  it("lists uploaded media with public URLs", async () => {
    await request(app)
      .post("/api/v2/admin/media")
      .set("Cookie", authCookie())
      .attach("file", await samplePng(), "listed.png");

    const response = await request(app).get("/api/v2/admin/media").set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].url).toContain("/media/scrolling-resume/uploads/");
  });

  it("reads one image with its usage count", async () => {
    const created = await request(app)
      .post("/api/v2/admin/media")
      .set("Cookie", authCookie())
      .attach("file", await samplePng(), "single.png");

    const response = await request(app)
      .get(`/api/v2/admin/media/${created.body.id}`)
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: created.body.id, usedBy: 0, width: 40 });
    expect(response.body.url).toContain(created.body.blobPath);

    const missing = await request(app)
      .get("/api/v2/admin/media/0123456789abcdef01234567")
      .set("Cookie", authCookie());
    expect(missing.status).toBe(404);
  });

  it("updates alt text and enforces the version check", async () => {
    const created = await request(app)
      .post("/api/v2/admin/media")
      .set("Cookie", authCookie())
      .attach("file", await samplePng(), "alt.png");

    const patched = await request(app)
      .patch(`/api/v2/admin/media/${created.body.id}`)
      .set("Cookie", authCookie())
      .send({ altText: "Updated caption", version: 1 });

    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ altText: "Updated caption", version: 2 });

    const stale = await request(app)
      .patch(`/api/v2/admin/media/${created.body.id}`)
      .set("Cookie", authCookie())
      .send({ altText: "Later", version: 1 });

    expect(stale.status).toBe(409);
  });

  it("refuses to delete an image that a record still references", async () => {
    const created = await request(app)
      .post("/api/v2/admin/media")
      .set("Cookie", authCookie())
      .attach("file", await samplePng(), "referenced.png");

    await request(app)
      .post("/api/v2/admin/aboutDeckSlides")
      .set("Cookie", authCookie())
      .send({
        slug: "who-i-am",
        sortOrder: 0,
        holdMs: 9800,
        explodeAfter: false,
        reveal: { pattern: "scanline", blockStaggerMs: 340, cellRevealMs: 1600 },
        blocks: [{ type: "image", title: "Portrait", mediaId: created.body.id }],
      })
      .expect(201);

    const blocked = await request(app)
      .delete(`/api/v2/admin/media/${created.body.id}`)
      .set("Cookie", authCookie());

    expect(blocked.status).toBe(400);
    expect(blocked.body.error.message).toContain("used by 1 record");
  });

  it("deletes an unreferenced image and its blob", async () => {
    const created = await request(app)
      .post("/api/v2/admin/media")
      .set("Cookie", authCookie())
      .attach("file", await samplePng(), "unused.png");

    const deleted = await request(app)
      .delete(`/api/v2/admin/media/${created.body.id}`)
      .set("Cookie", authCookie());
    expect(deleted.status).toBe(204);

    const container = await getMediaContainer();
    expect(await container.getBlockBlobClient(created.body.blobPath).exists()).toBe(false);

    const list = await request(app).get("/api/v2/admin/media").set("Cookie", authCookie());
    expect(list.body.total).toBe(0);
  });
});
