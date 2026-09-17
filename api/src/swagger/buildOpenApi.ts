import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import {
  collectionSchemas,
  listQuerySchema,
  mediaAssetSchema,
  singletonSchemas,
  type CollectionName,
  type SingletonName,
} from "@hd/content-schema";
import { z } from "zod";

// The schemas that validate requests also describe them, so the documentation
// cannot drift from the implementation.
//
// Note: extendZodWithOpenApi patches zod's factory functions, so only schemas
// created after this call gain `.openapi()`. Schemas imported from
// @hd/content-schema are created when that module loads, which ESM evaluates
// first, so they never have it. They are therefore passed to registerPath
// as-is and inlined; only the schemas defined below get named components.
extendZodWithOpenApi(z);

const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z
        .array(z.object({ path: z.string(), message: z.string() }))
        .optional(),
      requestId: z.string(),
    }),
  })
  .openapi("Error");

const metaFields = {
  id: z.string(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
};

const releaseSummarySchema = z
  .object({
    id: z.number().int(),
    notes: z.string(),
    publishedAt: z.string(),
    publishedBy: z.string(),
    current: z.boolean(),
    etag: z.string(),
    rolledBackFrom: z.number().int().optional(),
  })
  .openapi("ReleaseSummary");

const json = (schema: z.ZodType) => ({ content: { "application/json": { schema } } });

const errorResponses = (...codes: Array<401 | 400 | 404 | 409>) =>
  Object.fromEntries(
    codes.map((code) => [
      String(code),
      {
        description: {
          400: "Invalid request",
          401: "Authentication required",
          404: "Not found",
          409: "The record changed since it was loaded",
        }[code],
        ...json(errorSchema),
      },
    ]),
  );

export const buildOpenApiDocument = () => {
  const registry = new OpenAPIRegistry();

  const cookieAuth = registry.registerComponent("securitySchemes", "hd_session", {
    type: "apiKey",
    in: "cookie",
    name: "hd_session",
    description:
      "Shared sign-on cookie, valid across harmadavtian.com subdomains. Obtain it from POST /api/v1/auth/login.",
  });
  const security = [{ [cookieAuth.name]: [] }];

  // ---- health ----

  registry.registerPath({
    method: "get",
    path: "/healthz",
    tags: ["Health"],
    summary: "Service health and database connectivity",
    responses: { 200: { description: "Service is healthy" } },
  });

  // ---- auth ----

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/login",
    tags: ["Auth"],
    summary: "Sign in and receive the shared session cookie",
    request: { body: json(z.object({ password: z.string() })) },
    responses: {
      200: { description: "Signed in", ...json(z.object({ authenticated: z.boolean() })) },
      ...errorResponses(401),
      429: { description: "Too many attempts", ...json(errorSchema) },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/logout",
    tags: ["Auth"],
    summary: "Clear the session cookie",
    responses: { 200: { description: "Signed out" } },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/auth/session",
    tags: ["Auth"],
    summary: "Whether the caller is signed in",
    responses: {
      200: { description: "Session state", ...json(z.object({ authenticated: z.boolean() })) },
    },
  });

  // ---- legacy v1 content ----

  registry.registerPath({
    method: "get",
    path: "/api/v1/content/{key}",
    tags: ["Content (v1, legacy)"],
    summary: "Legacy content document (replaced by v2)",
    description:
      "Serves only the keys the current site requests. Retired keys return 404. Removed once the Three.js retrofit lands.",
    request: { params: z.object({ key: z.enum(["resume", "portfolio-cores"]) }) },
    responses: {
      200: { description: "Content document" },
      ...errorResponses(404),
    },
  });

  // ---- public v2 content ----

  const previewQuery = z.object({
    preview: z.literal("draft").optional().describe("Signed-in admins can preview unpublished drafts"),
  });

  registry.registerPath({
    method: "get",
    path: "/api/v2/content/release",
    tags: ["Content"],
    summary: "The full published content bundle",
    description:
      "Serves the current release. Sends an ETag; repeat with If-None-Match to get 304. With preview=draft a signed-in admin sees unpublished drafts instead.",
    request: { query: previewQuery },
    responses: {
      200: { description: "Published content" },
      304: { description: "Not modified" },
      ...errorResponses(401, 404),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v2/content/{area}",
    tags: ["Content"],
    summary: "One area of the published content",
    request: {
      params: z.object({ area: z.enum(["resume", "portfolio", "about", "cosmos"]) }),
      query: previewQuery,
    },
    responses: {
      200: { description: "Published content for the area" },
      304: { description: "Not modified" },
      ...errorResponses(400, 401, 404),
    },
  });

  // ---- admin: singletons ----

  for (const name of Object.keys(singletonSchemas) as SingletonName[]) {
    const schema = singletonSchemas[name];

    registry.registerPath({
      method: "get",
      path: `/api/v2/admin/singletons/${name}`,
      tags: ["Admin: singletons"],
      summary: `Read ${name}`,
      security,
      responses: {
        200: { description: name, ...json(z.object({ key: z.string(), data: schema, version: z.number().int() })) },
        ...errorResponses(401, 404),
      },
    });

    registry.registerPath({
      method: "put",
      path: `/api/v2/admin/singletons/${name}`,
      tags: ["Admin: singletons"],
      summary: `Replace ${name}`,
      security,
      request: { body: json(z.object({ data: schema, version: z.number().int().min(0) })) },
      responses: {
        200: { description: "Saved" },
        ...errorResponses(400, 401, 409),
      },
    });
  }

  // ---- admin: collections ----

  for (const name of Object.keys(collectionSchemas) as CollectionName[]) {
    const schema = collectionSchemas[name];
    const withMeta = collectionSchemas[name].extend(metaFields);
    const tags = ["Admin: content"];

    registry.registerPath({
      method: "get",
      path: `/api/v2/admin/${name}`,
      tags,
      summary: `List ${name}`,
      security,
      request: { query: listQuerySchema },
      responses: {
        200: {
          description: "A page of records",
          ...json(
            z.object({
              items: z.array(withMeta),
              total: z.number().int(),
              page: z.number().int(),
              pageSize: z.number().int(),
            }),
          ),
        },
        ...errorResponses(400, 401),
      },
    });

    registry.registerPath({
      method: "post",
      path: `/api/v2/admin/${name}`,
      tags,
      summary: `Create a ${name} record`,
      security,
      request: { body: json(schema) },
      responses: {
        201: { description: "Created", ...json(withMeta) },
        ...errorResponses(400, 401),
      },
    });

    registry.registerPath({
      method: "put",
      path: `/api/v2/admin/${name}/order`,
      tags,
      summary: `Reorder ${name}`,
      description: "Persists drag-and-drop ordering; sortOrder follows the given slug order.",
      security,
      request: { body: json(z.object({ slugs: z.array(z.string()).min(1) })) },
      responses: {
        200: { description: "Reordered" },
        ...errorResponses(400, 401),
      },
    });

    registry.registerPath({
      method: "get",
      path: `/api/v2/admin/${name}/{slug}`,
      tags,
      summary: `Read one ${name} record`,
      security,
      request: { params: z.object({ slug: z.string() }) },
      responses: {
        200: { description: "The record", ...json(withMeta) },
        ...errorResponses(401, 404),
      },
    });

    registry.registerPath({
      method: "put",
      path: `/api/v2/admin/${name}/{slug}`,
      tags,
      summary: `Replace one ${name} record`,
      description: "Send the version you loaded; a stale version returns 409.",
      security,
      request: {
        params: z.object({ slug: z.string() }),
        body: json(schema.extend({ version: z.number().int().min(1) })),
      },
      responses: {
        200: { description: "Updated", ...json(withMeta) },
        ...errorResponses(400, 401, 404, 409),
      },
    });

    registry.registerPath({
      method: "delete",
      path: `/api/v2/admin/${name}/{slug}`,
      tags,
      summary: `Delete one ${name} record`,
      security,
      request: { params: z.object({ slug: z.string() }) },
      responses: {
        204: { description: "Deleted" },
        ...errorResponses(401, 404),
      },
    });
  }

  // ---- admin: media ----

  const mediaRecord = mediaAssetSchema.extend({ ...metaFields, url: z.string() });

  registry.registerPath({
    method: "get",
    path: "/api/v2/admin/media",
    tags: ["Admin: media"],
    summary: "List media",
    security,
    request: { query: listQuerySchema },
    responses: {
      200: { description: "A page of media", ...json(z.object({ items: z.array(mediaRecord) })) },
      ...errorResponses(400, 401),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v2/admin/media",
    tags: ["Admin: media"],
    summary: "Upload an image",
    description:
      "multipart/form-data with `file` and optional `altText`. The type is checked by magic bytes and the image is re-encoded, which strips EXIF.",
    security,
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({ file: z.string(), altText: z.string().optional() }),
          },
        },
      },
    },
    responses: {
      201: { description: "Uploaded", ...json(mediaRecord) },
      ...errorResponses(400, 401),
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/v2/admin/media/{id}",
    tags: ["Admin: media"],
    summary: "Update alt text",
    security,
    request: {
      params: z.object({ id: z.string() }),
      body: json(z.object({ altText: z.string().optional(), version: z.number().int().min(1) })),
    },
    responses: {
      200: { description: "Updated", ...json(mediaRecord) },
      ...errorResponses(400, 401, 404, 409),
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/v2/admin/media/{id}",
    tags: ["Admin: media"],
    summary: "Delete an image",
    description: "Refused while any record still references the image.",
    security,
    request: { params: z.object({ id: z.string() }) },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses(400, 401, 404),
    },
  });

  // ---- admin: releases ----

  registry.registerPath({
    method: "post",
    path: "/api/v2/admin/releases/publish",
    tags: ["Admin: releases"],
    summary: "Publish the current drafts",
    description:
      "Validates every draft and every media reference, then freezes an immutable snapshot that the public API serves.",
    security,
    request: { body: json(z.object({ notes: z.string().max(500).optional() })) },
    responses: {
      201: { description: "Published", ...json(releaseSummarySchema) },
      ...errorResponses(400, 401),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v2/admin/releases",
    tags: ["Admin: releases"],
    summary: "Release history",
    security,
    responses: {
      200: { description: "Releases", ...json(z.object({ items: z.array(releaseSummarySchema) })) },
      ...errorResponses(401),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v2/admin/releases/status",
    tags: ["Admin: releases"],
    summary: "What is live and how much is unpublished",
    security,
    responses: {
      200: { description: "Publish status" },
      ...errorResponses(401),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v2/admin/releases/draft-check",
    tags: ["Admin: releases"],
    summary: "Validate the drafts without publishing",
    security,
    responses: {
      200: { description: "Drafts are valid" },
      ...errorResponses(400, 401),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v2/admin/releases/{id}/rollback",
    tags: ["Admin: releases"],
    summary: "Roll back to an earlier release",
    description: "Republishes that release's content as a new release, so history stays append-only.",
    security,
    request: { params: z.object({ id: z.number().int() }) },
    responses: {
      200: { description: "Rolled back", ...json(releaseSummarySchema) },
      ...errorResponses(400, 401, 404),
    },
  });

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Harmadavtian Content API",
      version: "2.0.0",
      description:
        "Content API for harmadavtian.com. v2 is the shared source for both experiences: structured entities, a media library, and draft/publish releases. v1 remains only for the two keys the current site still requests.",
    },
    servers: [{ url: "/", description: "Current server" }],
    tags: [
      { name: "Health" },
      { name: "Auth", description: "Shared sign-on across harmadavtian.com" },
      { name: "Content", description: "Published content for both experiences" },
      { name: "Admin: content" },
      { name: "Admin: singletons" },
      { name: "Admin: media" },
      { name: "Admin: releases" },
      { name: "Content (v1, legacy)" },
    ],
  });
};
