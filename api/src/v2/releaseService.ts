import {
  collectionSchemas,
  contentBundleSchema,
  singletonSchemas,
  SINGLETONS_COLLECTION,
  type CollectionName,
  type ContentBundle,
  type SingletonName,
} from "@hd/content-schema";
import { createHash } from "node:crypto";
import type { Db, Document } from "mongodb";
import { ApiError } from "./http.js";
import { fromDb, stripMeta } from "./storageCodec.js";

export const RELEASES_COLLECTION = "releases";

export interface ReleaseSummary {
  id: number;
  notes: string;
  publishedAt: string;
  publishedBy: string;
  current: boolean;
  etag: string;
  /** Set when this release was created by rolling back to an earlier one. */
  rolledBackFrom?: number;
}

export interface Release extends ReleaseSummary {
  content: ContentBundle;
}

const toSummary = (doc: Document): ReleaseSummary => ({
  id: doc.id as number,
  notes: doc.notes as string,
  publishedAt: (doc.publishedAt as Date).toISOString(),
  publishedBy: doc.publishedBy as string,
  current: Boolean(doc.current),
  etag: doc.etag as string,
  ...(typeof doc.rolledBackFrom === "number" ? { rolledBackFrom: doc.rolledBackFrom } : {}),
});

/**
 * Publishing freezes the current drafts into an immutable snapshot. The public
 * API only ever serves the snapshot marked `current`, so half-finished edits
 * cannot reach either site, and rolling back is just moving that marker.
 */
export class ReleaseService {
  public constructor(private readonly db: Db) {}

  /** Reads every draft and validates it against the schemas. */
  public async buildDraftBundle(): Promise<ContentBundle> {
    const singletonDocs = await this.db.collection(SINGLETONS_COLLECTION).find({}).toArray();
    const singletons = Object.fromEntries(
      singletonDocs.map((doc) => [doc.key as string, fromDb(doc.data)]),
    );

    const missing = (Object.keys(singletonSchemas) as SingletonName[]).filter(
      (name) => !(name in singletons),
    );
    if (missing.length > 0) {
      throw ApiError.badRequest(
        `Cannot publish: these have never been saved: ${missing.join(", ")}`,
      );
    }

    const collections: Record<string, unknown[]> = {};
    for (const name of Object.keys(collectionSchemas) as CollectionName[]) {
      const docs = await this.db.collection(name).find({}).sort({ sortOrder: 1 }).toArray();
      collections[name] = docs.map((doc) => fromDb(stripMeta(doc)));
    }

    const result = contentBundleSchema.safeParse({ singletons, collections });
    if (!result.success) {
      throw ApiError.badRequest(
        "Cannot publish: some content is invalid. Fix the listed fields and try again.",
        result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    return result.data;
  }

  /** Every media id referenced by the bundle must still exist. */
  private async assertMediaExists(bundle: ContentBundle): Promise<void> {
    const ids = new Set<string>();
    const walk = (value: unknown, key?: string): void => {
      if (key === "mediaId" && typeof value === "string") ids.add(value);
      else if (Array.isArray(value)) value.forEach((item) => walk(item));
      else if (value && typeof value === "object") {
        Object.entries(value as Record<string, unknown>).forEach(([k, v]) => walk(v, k));
      }
    };
    walk(bundle);

    if (ids.size === 0) return;

    const { ObjectId } = await import("mongodb");
    const found = await this.db
      .collection("media")
      .find({ _id: { $in: [...ids].map((id) => new ObjectId(id)) } }, { projection: { _id: 1 } })
      .toArray();

    const foundIds = new Set(found.map((doc) => doc._id.toHexString()));
    const dangling = [...ids].filter((id) => !foundIds.has(id));

    if (dangling.length > 0) {
      throw ApiError.badRequest(
        `Cannot publish: ${dangling.length} image reference${dangling.length === 1 ? "" : "s"} point to media that no longer exists.`,
      );
    }
  }

  public async publish(notes: string, publishedBy: string): Promise<ReleaseSummary> {
    const content = await this.buildDraftBundle();
    await this.assertMediaExists(content);

    const collection = this.db.collection(RELEASES_COLLECTION);
    const [latest] = await collection.find({}).sort({ id: -1 }).limit(1).toArray();
    const id = ((latest?.id as number | undefined) ?? 0) + 1;

    const etag = createHash("sha256")
      .update(JSON.stringify(content))
      .digest("hex")
      .slice(0, 32);

    const doc = {
      id,
      notes,
      content,
      etag,
      publishedAt: new Date(),
      publishedBy,
      current: true,
    };

    await collection.updateMany({ current: true }, { $set: { current: false } });
    await collection.insertOne(doc);

    return toSummary(doc);
  }

  public async rollbackTo(id: number, publishedBy: string): Promise<ReleaseSummary> {
    const collection = this.db.collection(RELEASES_COLLECTION);
    const target = await collection.findOne({ id });
    if (!target) throw ApiError.notFound(`No release ${id}`);
    if (target.current) throw ApiError.badRequest(`Release ${id} is already the current release`);

    // Rolling back publishes a new release with the old content, so history
    // stays append-only and the change itself is recorded.
    const [latest] = await collection.find({}).sort({ id: -1 }).limit(1).toArray();
    const newId = ((latest?.id as number | undefined) ?? 0) + 1;

    const doc = {
      id: newId,
      notes: `Rolled back to release ${id}`,
      content: target.content,
      etag: target.etag as string,
      publishedAt: new Date(),
      publishedBy,
      current: true,
      rolledBackFrom: id,
    };

    await collection.updateMany({ current: true }, { $set: { current: false } });
    await collection.insertOne(doc);

    return toSummary(doc);
  }

  public async history(limit = 25): Promise<ReleaseSummary[]> {
    const docs = await this.db
      .collection(RELEASES_COLLECTION)
      .find({}, { projection: { content: 0 } })
      .sort({ id: -1 })
      .limit(limit)
      .toArray();

    return docs.map(toSummary);
  }

  public async current(): Promise<Release | null> {
    const doc = await this.db.collection(RELEASES_COLLECTION).findOne({ current: true });
    if (!doc) return null;
    return { ...toSummary(doc), content: doc.content as ContentBundle };
  }

  /** Counts drafts changed since the current release was published. */
  public async unpublishedChangeCount(): Promise<number> {
    const release = await this.db
      .collection(RELEASES_COLLECTION)
      .findOne({ current: true }, { projection: { publishedAt: 1 } });

    if (!release) return -1;

    const since = release.publishedAt as Date;
    const counts = await Promise.all(
      [...(Object.keys(collectionSchemas) as CollectionName[]), SINGLETONS_COLLECTION].map((name) =>
        this.db.collection(name).countDocuments({ updatedAt: { $gt: since } }),
      ),
    );

    return counts.reduce((total, count) => total + count, 0);
  }
}
