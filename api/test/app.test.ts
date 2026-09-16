import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openApiDocument } from "../src/swagger/openapi.js";

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

  it("documents only the keys still served", () => {
    const keyPath = openApiDocument.paths["/api/v1/content/{key}"];

    expect(keyPath.get.parameters[0].schema.enum).toEqual([
      "resume",
      "portfolio-cores",
    ]);
    expect(Object.keys(openApiDocument.paths)).toEqual([
      "/healthz",
      "/api/v1/content/{key}",
    ]);
  });
});
