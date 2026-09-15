import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

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
});
