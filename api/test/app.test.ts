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

  // v1 content is retired (2026-09-21): the sites read the v2 release. Its
  // routes are plain 404s that never reach MongoDB (no database in tests).
  it.each(["/api/v1/content", "/api/v1/content/resume", "/api/v1/content/portfolio-cores"])(
    "no longer serves %s",
    async (path) => {
      const response = await request(app).get(path);

      expect(response.status).toBe(404);
      expect(response.headers["content-type"]).toMatch(/json/);
    },
  );

  it("documents no v1 content route", () => {
    const doc = buildOpenApiDocument();
    for (const path of Object.keys(doc.paths)) {
      expect(path, path).not.toMatch(/^\/api\/v1\/content/);
    }
  });
});
