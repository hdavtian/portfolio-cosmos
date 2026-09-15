// Imports the legacy src/data content and its images into the content model.
//
//   npm run db:import                 local Docker MongoDB + Azurite (default)
//   npm run db:import -- --dry-run    report what would change, write nothing
//   npm run db:import -- --verify-only
//
// Idempotent: entities are upserted by slug and media by source path; unchanged
// records are left alone. Nothing is deleted; records in the database that are
// not in the source are reported. After writing, everything is read back,
// projected to the legacy shapes and diffed against the source files.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { imageSize } from "image-size";
import { MongoClient, ObjectId, type Db, type Document } from "mongodb";
import {
  collectLegacyImagePaths,
  collectionSchemas,
  contentBundleSchema,
  diffJson,
  fromLegacy,
  LEGACY_EXCLUDED_PATHS,
  MEDIA_COLLECTION,
  mediaAssetSchema,
  singletonSchemas,
  SINGLETONS_COLLECTION,
  toLegacy,
  type ContentBundle,
  type LegacyContent,
  type MediaAsset,
} from "@hd/content-schema";
import { moonPortfolioMapping } from "../../../src/data/moonPortfolioMapping";

// api/.env holds the local Docker targets; injected variables (npm run
// db:import) still win, since dotenv never overrides what is already set.
loadDotEnv();

const APP_MEDIA_PREFIX = "scrolling-resume";
const IMPORTED_BY = "import";
const UPLOAD_CONCURRENCY = 8;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const verifyOnly = args.has("--verify-only");

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

// Only local targets are allowed until the production migration (plan phase 5).
const assertLocalTarget = (mongoUri: string, storageConnection: string) => {
  const mongoHost = new URL(mongoUri.replace(/^mongodb(\+srv)?:\/\//, "http://")).hostname;
  const localHosts = new Set(["127.0.0.1", "localhost"]);
  if (!localHosts.has(mongoHost)) {
    throw new Error(
      `Refusing to import into non-local MongoDB host "${mongoHost}". ` +
        "Run through `npm run db:import`, which targets Docker. Production import is plan phase 5.",
    );
  }
  if (!/BlobEndpoint=http:\/\/(127\.0\.0\.1|localhost):10000\//.test(storageConnection)) {
    throw new Error("Refusing to upload media to non-Azurite storage. Production upload is plan phase 5.");
  }
};

const readJson = async <T>(relativePath: string): Promise<T> =>
  JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8")) as T;

const loadLegacy = async (): Promise<LegacyContent> => ({
  resume: await readJson("src/data/resume.json"),
  portfolioCores: await readJson("src/data/portfolioCores.json"),
  moonPortfolioMapping,
  aboutDeck: await readJson("src/data/aboutDeck.json"),
  aboutPathTravelMessages: await readJson("src/data/aboutPathTravelMessages.json"),
  cosmicNarrative: await readJson("src/data/cosmic-narrative.json"),
});

const CONTENT_TYPES: Record<string, MediaAsset["contentType"]> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

// ---- storage codec: mediaId strings <-> ObjectId, meta fields stripped ----

const META_FIELDS = new Set(["_id", "version", "createdAt", "updatedAt", "updatedBy"]);

const toDb = (value: unknown, key?: string): unknown => {
  if (key === "mediaId" && typeof value === "string") return new ObjectId(value);
  if (Array.isArray(value)) return value.map((v) => toDb(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toDb(v, k)]));
  }
  return value;
};

const fromDb = (value: unknown, key?: string): unknown => {
  if (key === "mediaId" && value instanceof ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map((v) => fromDb(v));
  if (value && typeof value === "object" && !(value instanceof ObjectId) && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => key !== undefined || !META_FIELDS.has(k))
        .map(([k, v]) => [k, fromDb(v, k)]),
    );
  }
  return value;
};

const stripMeta = (doc: Document): Record<string, unknown> =>
  Object.fromEntries(Object.entries(doc).filter(([k]) => !META_FIELDS.has(k)));

const sameContent = (a: unknown, b: unknown) => diffJson(a, b).length === 0;

interface UpsertStats {
  inserted: number;
  updated: number;
  unchanged: number;
  extraInDb: string[];
}

const newStats = (): UpsertStats => ({ inserted: 0, updated: 0, unchanged: 0, extraInDb: [] });

// Upserts plain content by a natural key, bumping version only when content changed.
const upsertByKey = async (
  db: Db,
  collectionName: string,
  keyField: string,
  items: Array<Record<string, unknown>>,
  stats: UpsertStats,
) => {
  const collection = db.collection(collectionName);
  const now = new Date();
  const existing = new Map(
    (await collection.find({}).toArray()).map((doc) => [String(doc[keyField]), doc]),
  );

  for (const item of items) {
    const key = String(item[keyField]);
    const current = existing.get(key);
    existing.delete(key);
    const stored = toDb(item) as Document;

    if (!current) {
      stats.inserted += 1;
      if (!dryRun) {
        await collection.insertOne({
          ...stored,
          version: 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: IMPORTED_BY,
        });
      }
    } else if (sameContent(fromDb(stripMeta(current)), item)) {
      stats.unchanged += 1;
    } else {
      stats.updated += 1;
      if (!dryRun) {
        await collection.replaceOne(
          { _id: current._id },
          {
            ...stored,
            version: (Number(current.version) || 0) + 1,
            createdAt: current.createdAt ?? now,
            updatedAt: now,
            updatedBy: IMPORTED_BY,
          },
        );
      }
    }
  }

  stats.extraInDb.push(...existing.keys());
};

const ensureIndexes = async (db: Db) => {
  for (const name of Object.keys(collectionSchemas)) {
    await db.collection(name).createIndex({ slug: 1 }, { unique: true });
    await db.collection(name).createIndex({ sortOrder: 1 });
  }
  await db.collection(SINGLETONS_COLLECTION).createIndex({ key: 1 }, { unique: true });
  await db.collection(MEDIA_COLLECTION).createIndex({ blobPath: 1 }, { unique: true });
  await db
    .collection(MEDIA_COLLECTION)
    .createIndex({ sourcePath: 1 }, { unique: true, partialFilterExpression: { sourcePath: { $type: "string" } } });
};

const runPool = async <T>(items: T[], worker: (item: T) => Promise<void>) => {
  let next = 0;
  const run = async () => {
    while (next < items.length) await worker(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, items.length) }, run));
};

// ---- media ----

const describeImage = async (sourcePath: string): Promise<{ asset: MediaAsset; data: Buffer }> => {
  const filePath = path.join(rootDir, "public", sourcePath);
  const data = await readFile(filePath);
  const extension = path.extname(sourcePath).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) throw new Error(`Unsupported image type: ${sourcePath}`);

  let width: number | undefined;
  let height: number | undefined;
  try {
    const size = imageSize(data);
    width = size.width;
    height = size.height;
  } catch {
    // Dimensions are optional (e.g. SVG without width/height).
  }

  const asset = mediaAssetSchema.parse({
    // URL-safe blob names: "stormscape - demo sites.png" -> "stormscape-demo-sites.png".
    // sourcePath keeps the original so legacy references still resolve.
    blobPath: `${APP_MEDIA_PREFIX}${sourcePath.replace(/^\/images/, "")}`
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-"),
    sourcePath,
    contentType,
    bytes: data.byteLength,
    width,
    height,
    sha256: createHash("sha256").update(data).digest("hex"),
    altText: "",
  });
  return { asset, data };
};

interface MediaStats extends UpsertStats {
  uploaded: number;
  blobUnchanged: number;
}

const importMedia = async (
  db: Db,
  container: ContainerClient,
  sourcePaths: string[],
  stats: MediaStats,
): Promise<Map<string, string>> => {
  const described = new Map<string, { asset: MediaAsset; data: Buffer }>();
  await runPool(sourcePaths, async (sourcePath) => {
    const item = await describeImage(sourcePath);
    described.set(sourcePath, item);

    const blob = container.getBlockBlobClient(item.asset.blobPath);
    const existingSha = await blob
      .getProperties()
      .then((p) => p.metadata?.sha256)
      .catch(() => undefined);
    if (existingSha === item.asset.sha256) {
      stats.blobUnchanged += 1;
      return;
    }
    stats.uploaded += 1;
    if (!dryRun) {
      await blob.uploadData(item.data, {
        blobHTTPHeaders: {
          blobContentType: item.asset.contentType,
          blobCacheControl: "public, max-age=86400",
        },
        metadata: { sha256: item.asset.sha256 },
      });
    }
  });

  await upsertByKey(
    db,
    MEDIA_COLLECTION,
    "sourcePath",
    sourcePaths.map((p) => described.get(p)!.asset),
    stats,
  );

  const idByPath = new Map<string, string>();
  const docs = await db.collection(MEDIA_COLLECTION).find({}, { projection: { sourcePath: 1 } }).toArray();
  for (const doc of docs) {
    if (typeof doc.sourcePath === "string") idByPath.set(doc.sourcePath, doc._id.toHexString());
  }
  if (dryRun) {
    // Records that don't exist yet get placeholder ids so the transform can validate.
    sourcePaths.forEach((p, i) => {
      if (!idByPath.has(p)) idByPath.set(p, new ObjectId(i.toString(16).padStart(24, "0")).toHexString());
    });
  }
  return idByPath;
};

// ---- read back + verify ----

const readBundle = async (db: Db): Promise<ContentBundle> => {
  const singletonDocs = await db.collection(SINGLETONS_COLLECTION).find({}).toArray();
  const singletons = Object.fromEntries(
    singletonDocs.map((doc) => [doc.key, fromDb(doc.data)]),
  );
  const collections: Record<string, unknown[]> = {};
  for (const name of Object.keys(collectionSchemas)) {
    const docs = await db.collection(name).find({}).sort({ sortOrder: 1 }).toArray();
    collections[name] = docs.map((doc) => fromDb(stripMeta(doc)));
  }
  return contentBundleSchema.parse({ singletons, collections });
};

const verify = async (db: Db, container: ContainerClient, legacy: LegacyContent) => {
  const bundle = await readBundle(db);
  const mediaDocs = await db.collection(MEDIA_COLLECTION).find({}).toArray();
  const pathById = new Map(mediaDocs.map((doc) => [doc._id.toHexString(), String(doc.sourcePath)]));

  const differences = diffJson(
    legacy,
    toLegacy(bundle, (id) => pathById.get(id) ?? `missing-media:${id}`),
    LEGACY_EXCLUDED_PATHS,
  );

  const missingBlobs: string[] = [];
  await runPool(mediaDocs, async (doc) => {
    const exists = await container.getBlockBlobClient(String(doc.blobPath)).exists();
    if (!exists) missingBlobs.push(String(doc.blobPath));
  });

  return { differences, missingBlobs, mediaCount: mediaDocs.length };
};

// ---- main ----

const main = async () => {
  const mongoUri = requireEnv("MONGODB_URI");
  const dbName = requireEnv("MONGODB_DB_NAME");
  const storageConnection = requireEnv("AZURE_STORAGE_CONNECTION_STRING");
  const containerName = requireEnv("AZURE_STORAGE_CONTAINER");
  assertLocalTarget(mongoUri, storageConnection);

  const legacy = await loadLegacy();
  const client = await MongoClient.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const db = client.db(dbName);
  const container = BlobServiceClient.fromConnectionString(storageConnection).getContainerClient(containerName);

  console.log(`[import] target db=${dbName} container=${containerName}${dryRun ? " (dry run)" : ""}`);

  try {
    if (!verifyOnly) {
      if (!dryRun) {
        await container.createIfNotExists({ access: "blob" });
        await ensureIndexes(db);
      }

      const mediaStats: MediaStats = { ...newStats(), uploaded: 0, blobUnchanged: 0 };
      const idByPath = await importMedia(db, container, collectLegacyImagePaths(legacy), mediaStats);

      const bundle = fromLegacy(legacy, (sourcePath) => {
        const id = idByPath.get(sourcePath);
        if (!id) throw new Error(`No media record for ${sourcePath}`);
        return id;
      });

      const report: Record<string, UpsertStats> = {};
      report.singletons = newStats();
      await upsertByKey(
        db,
        SINGLETONS_COLLECTION,
        "key",
        (Object.keys(singletonSchemas) as Array<keyof typeof singletonSchemas>).map((key) => ({
          key,
          data: bundle.singletons[key],
        })),
        report.singletons,
      );
      for (const name of Object.keys(collectionSchemas) as Array<keyof typeof collectionSchemas>) {
        report[name] = newStats();
        await upsertByKey(db, name, "slug", bundle.collections[name] as Array<Record<string, unknown>>, report[name]);
      }

      console.log(
        `[import] media files: uploaded ${mediaStats.uploaded}, unchanged ${mediaStats.blobUnchanged}; ` +
          `records: inserted ${mediaStats.inserted}, updated ${mediaStats.updated}, unchanged ${mediaStats.unchanged}` +
          (mediaStats.extraInDb.length ? `, in db but not in source ${mediaStats.extraInDb.length}` : ""),
      );
      console.table(
        Object.fromEntries(
          Object.entries(report).map(([name, s]) => [
            name,
            { inserted: s.inserted, updated: s.updated, unchanged: s.unchanged, notInSource: s.extraInDb.length },
          ]),
        ),
      );
      const extras = Object.entries(report).filter(([, s]) => s.extraInDb.length > 0);
      for (const [name, s] of extras) {
        console.log(`[import] ${name}: in database but not in source (kept): ${s.extraInDb.join(", ")}`);
      }
    }

    if (dryRun) {
      console.log("[import] dry run: nothing written; verification skipped.");
      return;
    }

    const result = await verify(db, container, legacy);
    console.log(`[verify] media records ${result.mediaCount}, missing blobs ${result.missingBlobs.length}`);
    console.log(`[verify] intentionally not modeled: ${LEGACY_EXCLUDED_PATHS.join("; ")}`);
    if (result.differences.length > 0 || result.missingBlobs.length > 0) {
      console.error(`[verify] FAILED: ${result.differences.length} differences from source`);
      for (const d of result.differences.slice(0, 25)) {
        console.error(`  ${d.path}: expected ${JSON.stringify(d.expected)} got ${JSON.stringify(d.actual)}`);
      }
      result.missingBlobs.slice(0, 25).forEach((b) => console.error(`  missing blob ${b}`));
      process.exitCode = 1;
    } else {
      console.log("[verify] OK: database reproduces every modeled value in src/data (0 differences, 0 unmapped).");
    }
  } finally {
    await client.close();
  }
};

main().catch((error) => {
  console.error("[import] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
