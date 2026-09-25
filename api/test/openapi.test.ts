import { collectionSchemas, type CollectionName } from "@hd/content-schema";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { buildOpenApiDocument } from "../src/swagger/buildOpenApi.js";

const doc = buildOpenApiDocument();
const app = createApp();

describe("generated OpenAPI document", () => {
  it("documents the public and auth surface", () => {
    for (const path of [
      "/healthz",
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
      "/api/v1/auth/session",
      "/api/v2/content/release",
      "/api/v2/content/{area}",
    ]) {
      expect(Object.keys(doc.paths), path).toContain(path);
    }
  });

  // Catches a collection added to the schema package but not exposed, or a
  // route added without documentation.
  it("documents every CRUD route for every content collection", () => {
    for (const name of Object.keys(collectionSchemas) as CollectionName[]) {
      expect(doc.paths[`/api/v2/admin/${name}`]?.get, name).toBeDefined();
      expect(doc.paths[`/api/v2/admin/${name}`]?.post, name).toBeDefined();
      expect(doc.paths[`/api/v2/admin/${name}/order`]?.put, name).toBeDefined();
      expect(doc.paths[`/api/v2/admin/${name}/{slug}`]?.get, name).toBeDefined();
      expect(doc.paths[`/api/v2/admin/${name}/{slug}`]?.put, name).toBeDefined();
      expect(doc.paths[`/api/v2/admin/${name}/{slug}`]?.delete, name).toBeDefined();
    }
  });

  it("documents media and releases", () => {
    for (const path of [
      "/api/v2/admin/media",
      "/api/v2/admin/media/{id}",
      "/api/v2/admin/releases",
      "/api/v2/admin/releases/publish",
      "/api/v2/admin/releases/status",
      "/api/v2/admin/releases/{id}/rollback",
    ]) {
      expect(Object.keys(doc.paths), path).toContain(path);
    }
  });

  // Entity schemas are inlined rather than named components: schemas imported
  // from @hd/content-schema are created before extendZodWithOpenApi runs, so
  // they cannot be registered by name. The bodies must still be derived from
  // the Zod definitions.
  it("derives request bodies from the Zod definitions", () => {
    const requestBody = doc.paths["/api/v2/admin/technologies"]?.post?.requestBody as {
      content: Record<string, { schema: { properties?: Record<string, unknown> } }>;
    };
    const schema = requestBody.content["application/json"].schema;

    expect(schema.properties).toHaveProperty("slug");
    expect(schema.properties).toHaveProperty("parentSlug");
    expect(schema.properties).toHaveProperty("name");
    expect(doc.components?.securitySchemes).toHaveProperty("hd_session");
  });

  it("marks admin routes as requiring the session cookie", () => {
    const listSkills = doc.paths["/api/v2/admin/technologies"]?.get;

    expect(listSkills?.security).toEqual([{ hd_session: [] }]);
  });

  it("is served at /openapi.json", async () => {
    const response = await request(app).get("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.body.info.version).toBe("2.0.0");
    expect(Object.keys(response.body.paths)).toContain("/api/v2/content/release");
  });
});
