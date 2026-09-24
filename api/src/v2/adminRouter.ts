import {
  collectionSchemas,
  listQuerySchema,
  singletonSchemas,
  SINGLETONS_COLLECTION,
  type CollectionName,
  type SingletonName,
} from "@hd/content-schema";
import { Router } from "express";
import { z } from "zod";
import { createRequireAuth } from "../auth/requireAuth.js";
import { getDb } from "./db.js";
import { EntityRepository } from "./entityRepository.js";
import { ApiError, asyncHandler, parseOrThrow } from "./http.js";
import { createMediaRouter } from "./mediaRouter.js";
import { createReleaseRouter } from "./releaseRouter.js";
import { fromDb, toDb } from "./storageCodec.js";

// Which fields each entity can be searched on in the admin grid. Everything
// else falls back to slug-only search.
const SEARCHABLE_FIELDS: Partial<Record<CollectionName, readonly string[]>> = {
  experiences: ["slug", "company", "navLabel", "location"],
  portfolioEntries: ["slug", "title", "description", "technologies"],
  portfolioCores: ["slug", "name"],
  links: ["slug", "title", "url"],
  certifications: ["slug", "name"],
  education: ["slug", "institution", "degree", "major"],
  aboutDeckSlides: ["slug"],
  pathTravelMessages: ["slug", "textContent"],
  guidedTours: ["slug", "name", "description"],
  cosmosPlanets: ["slug", "cosmicName", "description"],
  moonPortfolioMappings: ["slug", "experienceSlug"],
};

const versionSchema = z.object({
  version: z.coerce.number().int().min(1),
});

const reorderSchema = z.object({
  slugs: z.array(z.string().min(1)).min(1),
});

const editorOf = (req: { auth?: { subject: string } }): string =>
  req.auth?.subject ?? "unknown";

// Express types route params as string | string[]; these routes always have a
// single segment.
const param = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

export function createAdminRouter({ cookieSecret }: { cookieSecret: string }): Router {
  const router = Router();

  // Deny by default across the whole admin surface.
  router.use(createRequireAuth({ cookieSecret }));

  const repositoryFor = (name: CollectionName) =>
    new EntityRepository(getDb(), name, SEARCHABLE_FIELDS[name] ?? ["slug"]);

  // Media library: uploads, alt text, deletes. Behind the same auth as the
  // rest of the admin surface. Mounted before the generated collection routes
  // because "media" is not one of them.
  router.use("/media", createMediaRouter());

  // Publishing, history and rollback. Also not a content collection.
  router.use("/releases", createReleaseRouter());

  // ---- singletons (profile, cosmos introduction) ----

  router.get(
    "/singletons/:name",
    asyncHandler(async (req, res) => {
      const name = parseOrThrow(
        z.enum(Object.keys(singletonSchemas) as [SingletonName, ...SingletonName[]]),
        req.params.name,
        "Unknown singleton",
      );

      const doc = await getDb().collection(SINGLETONS_COLLECTION).findOne({ key: name });
      if (!doc) throw ApiError.notFound(`Singleton "${name}" has not been created yet`);

      res.json({
        key: name,
        data: fromDb(doc.data),
        version: doc.version as number,
        updatedAt: (doc.updatedAt as Date)?.toISOString(),
        updatedBy: doc.updatedBy as string,
      });
    }),
  );

  router.put(
    "/singletons/:name",
    asyncHandler(async (req, res) => {
      const name = parseOrThrow(
        z.enum(Object.keys(singletonSchemas) as [SingletonName, ...SingletonName[]]),
        req.params.name,
        "Unknown singleton",
      );
      const body = parseOrThrow(
        z.object({ data: z.unknown(), version: z.number().int().min(0) }),
        req.body,
      );
      const data = parseOrThrow(singletonSchemas[name], body.data);

      const collection = getDb().collection(SINGLETONS_COLLECTION);
      const current = await collection.findOne({ key: name });
      const currentVersion = (current?.version as number | undefined) ?? 0;

      if (currentVersion !== body.version) {
        throw ApiError.conflict(
          `This record changed since you loaded it (version ${currentVersion}, you sent ${body.version}). Reload and reapply your changes.`,
        );
      }

      const now = new Date();
      await collection.updateOne(
        { key: name },
        {
          $set: {
            key: name,
            data: toDb(data),
            version: currentVersion + 1,
            updatedAt: now,
            updatedBy: editorOf(req),
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );

      res.json({ key: name, data, version: currentVersion + 1 });
    }),
  );

  // ---- collections ----

  for (const name of Object.keys(collectionSchemas) as CollectionName[]) {
    const schema = collectionSchemas[name];
    const base = `/${name}`;

    router.get(
      base,
      asyncHandler(async (req, res) => {
        const query = parseOrThrow(listQuerySchema, req.query, "Invalid list query");
        res.json(await repositoryFor(name).list(query));
      }),
    );

    router.post(
      base,
      asyncHandler(async (req, res) => {
        const content = parseOrThrow(schema, req.body);
        const created = await repositoryFor(name).create(content, editorOf(req));
        res.status(201).json(created);
      }),
    );

    // Ordering is saved before the :slug route so "order" is not read as a slug.
    router.put(
      `${base}/order`,
      asyncHandler(async (req, res) => {
        const { slugs } = parseOrThrow(reorderSchema, req.body);
        await repositoryFor(name).reorder(slugs, editorOf(req));
        res.json({ ok: true, count: slugs.length });
      }),
    );

    router.get(
      `${base}/:slug`,
      asyncHandler(async (req, res) => {
        const slug = param(req.params.slug);
        const item = await repositoryFor(name).findBySlug(slug);
        if (!item) throw ApiError.notFound(`No record with slug "${slug}"`);
        res.json(item);
      }),
    );

    router.put(
      `${base}/:slug`,
      asyncHandler(async (req, res) => {
        const { version } = parseOrThrow(
          versionSchema,
          { version: (req.body as { version?: unknown } | undefined)?.version },
          "A version is required to update a record",
        );
        const content = parseOrThrow(schema, req.body);
        const updated = await repositoryFor(name).update(
          param(req.params.slug),
          content,
          version,
          editorOf(req),
        );
        res.json(updated);
      }),
    );

    router.delete(
      `${base}/:slug`,
      asyncHandler(async (req, res) => {
        await repositoryFor(name).deleteBySlug(param(req.params.slug));
        res.status(204).end();
      }),
    );
  }

  return router;
}
