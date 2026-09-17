import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createAdminSite } from "../src/adminSite.js";

describe("admin site", () => {
  const distDir = mkdtempSync(path.join(tmpdir(), "admin-dist-"));
  mkdirSync(path.join(distDir, "assets"));
  writeFileSync(path.join(distDir, "index.html"), "<!doctype html><title>Admin</title>");
  writeFileSync(path.join(distDir, "assets", "app-abc123.js"), "console.log('admin')");
  afterAll(() => rmSync(distDir, { recursive: true, force: true }));

  const site = createAdminSite({
    host: "portfolio-admin.example.com",
    distDir,
    mediaOrigin: "https://media.example.net",
  });
  const app = express();
  if (site) app.use(site);
  app.get("/api/v2/ping", (_request, response) => response.json({ api: true }));
  app.get("/healthz", (_request, response) => response.json({ status: "ok" }));
  app.use((_request, response) => response.status(404).json({ message: "Route not found" }));

  const onAdmin = (url: string) => request(app).get(url).set("Host", "portfolio-admin.example.com");

  it("serves the SPA shell for admin routes on the admin host", async () => {
    const response = await onAdmin("/portfolio-entries/123");

    expect(response.status).toBe(200);
    expect(response.text).toContain("<title>Admin</title>");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.headers["content-security-policy"]).toContain("https://media.example.net");
  });

  it("serves hashed assets as immutable", async () => {
    const response = await onAdmin("/assets/app-abc123.js");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("immutable");
  });

  it("lets API paths on the admin host reach the API", async () => {
    expect((await onAdmin("/api/v2/ping")).body).toEqual({ api: true });
    expect((await onAdmin("/healthz")).body).toEqual({ status: "ok" });
  });

  it("does not serve the admin on other hosts", async () => {
    const response = await request(app).get("/portfolio-entries/123").set("Host", "api.example.com");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/json/);
  });

  it("is disabled when there is no admin build", () => {
    expect(createAdminSite({ host: "x", distDir: path.join(distDir, "missing") })).toBeNull();
  });
});
