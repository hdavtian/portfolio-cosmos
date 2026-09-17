import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { buildOpenApiDocument } from "../src/swagger/buildOpenApi.js";

describe("app", () => {
  const app = createApp();

  it("serves the health check without a database", async () => {
    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", service: "scrolling-resume-api" });
  });

  it("returns JSON 404 for unknown routes", async () => {
    const response = await request(app).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/json/);
  });

  // Retired v1 surface: these must not reach MongoDB (no database in tests).
  it.each([
    "about-deck",
    "about-hall-levels",
    "about-hall-slides",
    "about-path-travel-messages",
    "cosmic-narrative",
    "about-content",
    "legacy-websites",
    "moon-portfolio-mapping",
  ])("returns 404 for retired content key %s", async (key) => {
    const response = await request(app).get(`/api/v1/content/${key}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toContain(key);
  });

  it("no longer exposes the content listing route", async () => {
    const response = await request(app).get("/api/v1/content");

    expect(response.status).toBe(404);
  });

  it("documents only the v1 keys still served", () => {
    const doc = buildOpenApiDocument();
    const parameters = doc.paths["/api/v1/content/{key}"]?.get?.parameters as Array<{
      name: string;
      schema: { enum?: string[] };
    }>;
    const keyParam = parameters.find((parameter) => parameter.name === "key");

    expect(keyParam?.schema.enum).toEqual(["resume", "portfolio-cores"]);

    // The retired v1 routes stay undocumented.
    for (const retired of ["/api/v1/content", "/api/v1/content/about-deck"]) {
      expect(Object.keys(doc.paths)).not.toContain(retired);
    }
  });
});
