import {
  collectionSchemas,
  contentBundleSchema,
  singletonSchemas,
  SINGLETONS_COLLECTION,
  type CollectionName,
  type ContentBundle,
  type SingletonName,
  techStackIssues,
  technologyIssues,
} from "@hd/content-schema";
import { createHash } from "node:crypto";
import type { Db, Document } from "mongodb";
import { ApiError } from "./http.js";
import { summarizeChanges, type ContentSide } from "./changeSummary.js";
import { fromDb, stripMeta, toDb } from "./storageCodec.js";

export const RELEASES_COLLECTION = "releases";
/** Drafts saved before a rollback replaced them. Never deleted automatically. */
export const DRAFT_BACKUPS_COLLECTION = "draftBackups";

// Key order differs between stored drafts and release snapshots; compare sorted.
const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : nested,
  );

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

/** Stored details of an image referenced by a release; the URL is derived when served. */
export interface ReleaseMedia {
  blobPath: string;
  altText: string;
  width?: number;
  height?: number;
}

export interface Release extends ReleaseSummary {
  content: ContentBundle;
  media: Record<string, ReleaseMedia>;
}

/** Every media id referenced anywhere in a bundle (or part of one). */
export const collectMediaIds = (value: unknown): string[] => {
  const ids = new Set<string>();
  const walk = (node: unknown, key?: string): void => {
    if (key === "mediaId" && typeof node === "string") ids.add(node);
    else if (Array.isArray(node)) node.forEach((item) => walk(item));
    else if (node && typeof node === "object") {
      Object.entries(node as Record<string, unknown>).forEach(([k, v]) => walk(v, k));
    }
  };
  walk(value);
  return [...ids];
};

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

    // The tech stack must form a tree; the schemas check each node on its own.
    const treeIssues = techStackIssues(result.data.collections.techStackNodes);
    if (treeIssues.length > 0) {
      throw ApiError.badRequest(
        "Cannot publish: the tech stack has nodes with a broken parent. Fix the listed nodes and try again.",
        treeIssues.map((issue) => ({
          path: `techStackNodes.${issue.index}.parentSlug`,
          message: `"${result.data.collections.techStackNodes[issue.index]?.name}" ${issue.message}`,
        })),
      );
    }

    // The master list must form a tree, and no two entries may claim the same
    // name or alias: a string that resolves to two technologies cannot be
    // resolved at all (D25/D26). The schemas check each record on its own.
    const technologyProblems = technologyIssues(result.data.collections.technologies);
    if (technologyProblems.length > 0) {
      throw ApiError.badRequest(
        "Cannot publish: some technologies have a broken parent or a name used twice. Fix the listed entries and try again.",
        technologyProblems.map((issue) => ({
          path: `technologies.${issue.index}`,
          message: `"${result.data.collections.technologies[issue.index]?.name}" ${issue.message}`,
        })),
      );
    }

    return result.data;
  }

  /**
   * Details of every image the bundle references. Snapshotted into the release,
   * so a published release keeps working even if an image record changes later.
   * Throws if a reference points at media that no longer exists.
   */
  public async mediaSnapshot(bundle: ContentBundle): Promise<Record<string, ReleaseMedia>> {
    const ids = collectMediaIds(bundle);
    if (ids.length === 0) return {};

    const { ObjectId } = await import("mongodb");
    const docs = await this.db
      .collection("media")
      .find(
        { _id: { $in: ids.map((id) => new ObjectId(id)) } },
        { projection: { blobPath: 1, altText: 1, width: 1, height: 1 } },
      )
      .toArray();

    const snapshot: Record<string, ReleaseMedia> = {};
    for (const doc of docs) {
      snapshot[doc._id.toHexString()] = {
        blobPath: String(doc.blobPath),
        altText: (doc.altText as string | undefined) ?? "",
        ...(typeof doc.width === "number" ? { width: doc.width } : {}),
        ...(typeof doc.height === "number" ? { height: doc.height } : {}),
      };
    }

    const dangling = ids.filter((id) => !(id in snapshot));
    if (dangling.length > 0) {
      throw ApiError.badRequest(
        `Cannot publish: ${dangling.length} image reference${dangling.length === 1 ? "" : "s"} point to media that no longer exists.`,
      );
    }

    return snapshot;
  }

  public async publish(notes: string, publishedBy: string): Promise<ReleaseSummary> {
    const content = await this.buildDraftBundle();
    const media = await this.mediaSnapshot(content);

    const collection = this.db.collection(RELEASES_COLLECTION);
    const [latest] = await collection.find({}).sort({ id: -1 }).limit(1).toArray();
    const id = ((latest?.id as number | undefined) ?? 0) + 1;

    const etag = createHash("sha256")
      .update(JSON.stringify({ content, media }))
      .digest("hex")
      .slice(0, 32);

    const doc = {
      id,
      notes,
      content,
      media,
      etag,
      publishedAt: new Date(),
      publishedBy,
      current: true,
    };

    await collection.updateMany({ current: true }, { $set: { current: false } });
    await collection.insertOne(doc);

    return toSummary(doc);
  }

  /**
   * Makes the drafts match a release, so the admin shows what the sites show.
   * The drafts being replaced are saved to draftBackups first. A collection the
   * release predates (absent from its snapshot) is left untouched rather than
   * emptied.
   */
  /**
   * `reason` is stored on the backup: a discard and a rollback both replace the
   * drafts, and which one it was is the first thing anyone recovering will ask.
   */
  public async restoreDraftsFrom(
    content: ContentBundle,
    restoredBy: string,
    releaseId: number,
    reason = `Drafts before rolling back to release ${releaseId}`,
  ): Promise<void> {
    const now = new Date();

    const backup: Record<string, unknown> = {
      createdAt: now,
      createdBy: restoredBy,
      reason,
      singletons: await this.db.collection(SINGLETONS_COLLECTION).find({}).toArray(),
      collections: {} as Record<string, Document[]>,
    };
    for (const name of Object.keys(collectionSchemas) as CollectionName[]) {
      (backup.collections as Record<string, Document[]>)[name] = await this.db.collection(name).find({}).toArray();
    }
    await this.db.collection(DRAFT_BACKUPS_COLLECTION).insertOne(backup);

    for (const [key, data] of Object.entries(content.singletons ?? {})) {
      const current = await this.db.collection(SINGLETONS_COLLECTION).findOne({ key });
      if (current && stableJson(fromDb(current.data)) === stableJson(data)) continue;
      await this.db.collection(SINGLETONS_COLLECTION).updateOne(
        { key },
        {
          $set: { key, data: toDb(data), updatedAt: now, updatedBy: restoredBy },
          $inc: { version: 1 },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
    }

    const releaseCollections = (content.collections ?? {}) as Record<string, Array<Record<string, unknown>> | undefined>;
    for (const name of Object.keys(collectionSchemas) as CollectionName[]) {
      const records = releaseCollections[name];
      if (!records) continue;
      const collection = this.db.collection(name);
      await collection.deleteMany({ slug: { $nin: records.map((record) => record.slug) } });
      for (const record of records) {
        const current = await collection.findOne({ slug: record.slug });
        if (current && stableJson(fromDb(stripMeta(current))) === stableJson(record)) continue;
        // Bumping the version makes any editor still open on the old draft get
        // a conflict instead of silently overwriting the restored content.
        await collection.replaceOne(
          { slug: record.slug },
          {
            ...(toDb(record) as Document),
            version: ((current?.version as number | undefined) ?? 0) + 1,
            createdAt: current?.createdAt ?? now,
            updatedAt: now,
            updatedBy: restoredBy,
          },
          { upsert: true },
        );
      }
    }
  }

  /**
   * Throws away every unpublished change by restoring the drafts from the live
   * release. No release is published: history stays a record of what went out,
   * not of what was abandoned. The drafts being replaced are backed up first,
   * exactly as a rollback does, so a discard is recoverable.
   */
  public async discardDrafts(discardedBy: string): Promise<{ discarded: boolean }> {
    const current = await this.db.collection(RELEASES_COLLECTION).findOne({ current: true });
    if (!current) throw ApiError.badRequest("Nothing has been published yet, so there is nothing to go back to.");
    await this.restoreDraftsFrom(
      current.content as ContentBundle,
      discardedBy,
      current.id as number,
      `Drafts discarded, restoring release ${current.id as number}`,
    );
    return { discarded: true };
  }

  public async rollbackTo(
    id: number,
    publishedBy: string,
    { restoreDrafts = true }: { restoreDrafts?: boolean } = {},
  ): Promise<ReleaseSummary> {
    const collection = this.db.collection(RELEASES_COLLECTION);
    const target = await collection.findOne({ id });
    if (!target) throw ApiError.notFound(`No release ${id}`);
    if (target.current) throw ApiError.badRequest(`Release ${id} is already the current release`);

    // Drafts first: if restoring fails, the live release has not moved yet.
    if (restoreDrafts) {
      await this.restoreDraftsFrom(target.content as ContentBundle, publishedBy, id);
    }

    // Rolling back publishes a new release with the old content, so history
    // stays append-only and the change itself is recorded.
    const [latest] = await collection.find({}).sort({ id: -1 }).limit(1).toArray();
    const newId = ((latest?.id as number | undefined) ?? 0) + 1;

    const doc = {
      id: newId,
      notes: `Rolled back to release ${id}`,
      content: target.content,
      media: (target.media as Record<string, ReleaseMedia> | undefined) ?? {},
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
    return {
      ...toSummary(doc),
      content: doc.content as ContentBundle,
      media: (doc.media as Record<string, ReleaseMedia> | undefined) ?? {},
    };
  }

  /**
   * Plain-language list of what publishing now would change, for the release
   * notes. Drafts are read without failing on invalid records, so the list is
   * available even while something still needs fixing.
   */
  public async pendingChanges(): Promise<{ neverPublished: boolean; lines: string[] }> {
    const release = await this.current();
    if (!release) return { neverPublished: true, lines: ["First publish"] };

    const draft = await this.readDraftsLeniently();
    const lines = summarizeChanges(release.content as unknown as ContentSide, draft);

    // Alt text lives on the media record and is snapshotted at publish.
    const ids = Object.keys(release.media);
    if (ids.length > 0) {
      const { ObjectId } = await import("mongodb");
      const docs = await this.db
        .collection("media")
        .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { altText: 1 } })
        .toArray();
      const changed = docs.filter(
        (doc) => ((doc.altText as string | undefined) ?? "") !== release.media[doc._id.toHexString()]?.altText,
      ).length;
      if (changed > 0) lines.push(`Updated alt text on ${changed} image${changed === 1 ? "" : "s"}`);
    }

    return { neverPublished: false, lines };
  }

  /** Drafts shaped like a release; records that fail validation are kept as stored. */
  private async readDraftsLeniently(): Promise<ContentSide> {
    const singletonDocs = await this.db.collection(SINGLETONS_COLLECTION).find({}).toArray();
    const singletons: Record<string, unknown> = {};
    for (const doc of singletonDocs) {
      const key = doc.key as SingletonName;
      const raw = fromDb(doc.data);
      const parsed = singletonSchemas[key]?.safeParse(raw);
      singletons[key] = parsed?.success ? parsed.data : raw;
    }

    const collections: Record<string, Record<string, unknown>[]> = {};
    for (const name of Object.keys(collectionSchemas) as CollectionName[]) {
      const docs = await this.db.collection(name).find({}).sort({ sortOrder: 1 }).toArray();
      collections[name] = docs.map((doc) => {
        const raw = fromDb(stripMeta(doc));
        // Parsing applies the same defaults the published snapshot received,
        // so an omitted empty list does not read as a change.
        const parsed = collectionSchemas[name].safeParse(raw);
        return (parsed.success ? parsed.data : raw) as Record<string, unknown>;
      });
    }

    return { singletons, collections };
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
