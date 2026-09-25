import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { SESSION_COOKIE_NAME } from "../src/auth/requireAuth.js";
import { createSessionToken } from "../src/auth/sessionToken.js";
import { getDb } from "../src/v2/db.js";
import { ensureIndexes } from "../src/v2/indexes.js";
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

const profile = {
  name: "Harma Davtian",
  title: "Full Stack Engineer",
  email: "harma.davtian@gmail.com",
  phone: "818.632.1804",
  location: "Glendale, CA",
  summary: "Full stack engineer.",
};

const introduction = {
  title: "The Harma System",
  subtitle: "A Digital Galaxy",
  description: "Welcome to the Harma System.",
};

/** Saves the two singletons, the minimum a release needs. */
const saveSingletons = async (): Promise<void> => {
  await request(app)
    .put("/api/v2/admin/singletons/profile")
    .set("Cookie", authCookie())
    .send({ data: profile, version: 0 })
    .expect(200);

  await request(app)
    .put("/api/v2/admin/singletons/cosmosIntroduction")
    .set("Cookie", authCookie())
    .send({ data: introduction, version: 0 })
    .expect(200);
};

const publish = (notes = "") =>
  request(app).post("/api/v2/admin/releases/publish").set("Cookie", authCookie()).send({ notes });

describe.skipIf(!dockerMongo)(`v2 releases (${dockerMongo ? "docker" : SKIP_MESSAGE})`, () => {
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

  it("requires a session to publish", async () => {
    const response = await request(app).post("/api/v2/admin/releases/publish").send({});

    expect(response.status).toBe(401);
  });

  it("serves 404 publicly until something is published", async () => {
    const response = await request(app).get("/api/v2/content/release");

    expect(response.status).toBe(404);
  });

  it("refuses to publish before the singletons have been saved", async () => {
    const response = await publish();

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("never been saved");
  });

  it("publishes, serves the release publicly and revalidates with an ETag", async () => {
    await saveSingletons();

    const published = await publish("first release");
    expect(published.status).toBe(201);
    expect(published.body).toMatchObject({ id: 1, notes: "first release", current: true });

    const served = await request(app).get("/api/v2/content/release");
    expect(served.status).toBe(200);
    expect(served.body.draft).toBe(false);
    expect(served.body.content.singletons.profile.name).toBe("Harma Davtian");
    // Revalidate every load, so a new publish is visible immediately.
    expect(served.headers["cache-control"]).toBe("public, no-cache");

    const revalidated = await request(app)
      .get("/api/v2/content/release")
      .set("If-None-Match", served.headers.etag);
    expect(revalidated.status).toBe(304);
  });

  it("slices content by area and rejects unknown areas", async () => {
    await saveSingletons();
    await publish();

    const resume = await request(app).get("/api/v2/content/resume");
    expect(resume.status).toBe(200);
    expect(resume.body.content.singletons.profile.title).toBe("Full Stack Engineer");
    expect(resume.body.content.collections).toHaveProperty("experiences");
    expect(resume.body.content.collections).not.toHaveProperty("portfolioCores");

    const unknown = await request(app).get("/api/v2/content/nonsense");
    expect(unknown.status).toBe(400);
  });

  it("only lets a signed-in admin preview drafts", async () => {
    await saveSingletons();
    await publish();

    const anonymous = await request(app).get("/api/v2/content/release?preview=draft");
    expect(anonymous.status).toBe(401);

    const preview = await request(app)
      .get("/api/v2/content/release?preview=draft")
      .set("Cookie", authCookie());
    expect(preview.status).toBe(200);
    expect(preview.body.draft).toBe(true);
    expect(preview.headers["cache-control"]).toBe("no-store");
  });

  it("keeps drafts out of the published release until published again", async () => {
    await saveSingletons();
    await publish();

    await request(app)
      .post("/api/v2/admin/technologies")
      .set("Cookie", authCookie())
      .send({ slug: "typescript", sortOrder: 0, name: "TypeScript" })
      .expect(201);

    const live = await request(app).get("/api/v2/content/resume");
    expect(live.body.content.collections.technologies).toHaveLength(0);

    const draft = await request(app)
      .get("/api/v2/content/resume?preview=draft")
      .set("Cookie", authCookie());
    expect(draft.body.content.collections.technologies).toHaveLength(1);

    const status = await request(app)
      .get("/api/v2/admin/releases/status")
      .set("Cookie", authCookie());
    expect(status.body.unpublishedChanges).toBeGreaterThan(0);

    await publish("with typescript");
    const afterPublish = await request(app).get("/api/v2/content/resume");
    expect(afterPublish.body.content.collections.technologies).toHaveLength(1);
  });

  it("rolls back by publishing the old content as a new release", async () => {
    await saveSingletons();
    await publish("first");

    await request(app)
      .post("/api/v2/admin/technologies")
      .set("Cookie", authCookie())
      .send({ slug: "typescript", sortOrder: 0, name: "TypeScript" });
    await publish("second");

    const rolledBack = await request(app)
      .post("/api/v2/admin/releases/1/rollback")
      .set("Cookie", authCookie());

    expect(rolledBack.status).toBe(200);
    expect(rolledBack.body).toMatchObject({ id: 3, rolledBackFrom: 1, current: true });

    const live = await request(app).get("/api/v2/content/resume");
    expect(live.body.content.collections.technologies).toHaveLength(0);

    const history = await request(app)
      .get("/api/v2/admin/releases")
      .set("Cookie", authCookie());
    expect(history.body.items.map((item: { id: number }) => item.id)).toEqual([3, 2, 1]);
    expect(history.body.items.filter((item: { current: boolean }) => item.current)).toHaveLength(1);
  });

  it("restores the drafts to the rolled-back release and backs up the replaced drafts", async () => {
    await saveSingletons();
    await publish("original");

    await request(app)
      .put("/api/v2/admin/singletons/profile")
      .set("Cookie", authCookie())
      .send({ data: { ...profile, name: "Harma Davtian1" }, version: 1 })
      .expect(200);
    await request(app)
      .post("/api/v2/admin/links")
      .set("Cookie", authCookie())
      .send({ slug: "extra", sortOrder: 0, title: "Extra", url: "https://example.com/extra" })
      .expect(201);
    await publish("edited");

    await request(app).post("/api/v2/admin/releases/1/rollback").set("Cookie", authCookie()).expect(200);

    const draftProfile = await request(app)
      .get("/api/v2/admin/singletons/profile")
      .set("Cookie", authCookie());
    expect(draftProfile.body.data.name).toBe("Harma Davtian");
    expect(draftProfile.body.version).toBe(3);

    const links = await request(app).get("/api/v2/admin/links").set("Cookie", authCookie());
    expect(links.body.items).toHaveLength(0);

    const pending = await request(app)
      .get("/api/v2/admin/releases/pending-changes")
      .set("Cookie", authCookie());
    expect(pending.body.lines).toEqual([]);

    const backups = await getDb().collection("draftBackups").find({}).toArray();
    expect(backups).toHaveLength(1);
    expect(backups[0].reason).toBe("Drafts before rolling back to release 1");
  });

  it("keeps the drafts when asked to roll back the sites only", async () => {
    await saveSingletons();
    await publish();
    await request(app)
      .put("/api/v2/admin/singletons/profile")
      .set("Cookie", authCookie())
      .send({ data: { ...profile, name: "Work in progress" }, version: 1 })
      .expect(200);
    await publish();

    await request(app)
      .post("/api/v2/admin/releases/1/rollback")
      .set("Cookie", authCookie())
      .send({ restoreDrafts: false })
      .expect(200);

    const draftProfile = await request(app)
      .get("/api/v2/admin/singletons/profile")
      .set("Cookie", authCookie());
    expect(draftProfile.body.data.name).toBe("Work in progress");
  });

  it("refuses to roll back to the current release or an unknown one", async () => {
    await saveSingletons();
    await publish();

    const current = await request(app)
      .post("/api/v2/admin/releases/1/rollback")
      .set("Cookie", authCookie());
    expect(current.status).toBe(400);

    const missing = await request(app)
      .post("/api/v2/admin/releases/99/rollback")
      .set("Cookie", authCookie());
    expect(missing.status).toBe(404);
  });

  it("serves image URLs for media the release references, even if the record changes later", async () => {
    await saveSingletons();

    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: "#123456" } })
      .png()
      .toBuffer();
    const uploaded = await request(app)
      .post("/api/v2/admin/media")
      .set("Cookie", authCookie())
      .attach("file", png, "portrait.png")
      .field("altText", "Portrait");

    await request(app)
      .post("/api/v2/admin/aboutDeckSlides")
      .set("Cookie", authCookie())
      .send({
        slug: "who-i-am",
        sortOrder: 0,
        holdMs: 9800,
        explodeAfter: false,
        reveal: { pattern: "scanline", blockStaggerMs: 340, cellRevealMs: 1600 },
        blocks: [{ type: "image", title: "Portrait", mediaId: uploaded.body.id }],
      })
      .expect(201);

    await publish().expect(201);

    // Changing the image record after publishing must not alter the release.
    await request(app)
      .patch(`/api/v2/admin/media/${uploaded.body.id}`)
      .set("Cookie", authCookie())
      .send({ altText: "Changed later", version: 1 })
      .expect(200);

    const full = await request(app).get("/api/v2/content/release");
    expect(full.body.media[uploaded.body.id]).toMatchObject({
      url: expect.stringContaining(uploaded.body.blobPath),
      altText: "Portrait",
      width: 20,
      height: 10,
    });

    // Area responses include only the media that area references.
    const about = await request(app).get("/api/v2/content/about");
    expect(Object.keys(about.body.media)).toEqual([uploaded.body.id]);
    const resume = await request(app).get("/api/v2/content/resume");
    expect(resume.body.media).toEqual({});
  });

  it("refuses to publish content that points at missing media", async () => {
    await saveSingletons();

    await request(app)
      .post("/api/v2/admin/aboutDeckSlides")
      .set("Cookie", authCookie())
      .send({
        slug: "who-i-am",
        sortOrder: 0,
        holdMs: 9800,
        explodeAfter: false,
        reveal: { pattern: "scanline", blockStaggerMs: 340, cellRevealMs: 1600 },
        blocks: [{ type: "image", title: "Portrait", mediaId: "0123456789abcdef01234567" }],
      })
      .expect(201);

    const response = await publish();

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("no longer exists");
  });
});
