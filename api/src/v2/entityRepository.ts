import {
  DEFAULT_PAGE_SIZE,
  type CollectionName,
  type ListQuery,
} from "@hd/content-schema";
import { ObjectId, type Db, type Document, type Filter, type Sort } from "mongodb";
import { ApiError } from "./http.js";
import { fromDb, stripMeta, toDb, withMeta } from "./storageCodec.js";

export interface PagedResult {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * One repository for every slug-keyed content collection. The schemas in
 * @hd/content-schema describe the shape, so the storage layer stays generic:
 * find/create/update/delete/reorder behave identically for each entity.
 */
export class EntityRepository {
  public constructor(
    private readonly db: Db,
    private readonly collectionName: CollectionName | "media",
    /** Fields the admin grid may sort, filter or search on. */
    private readonly searchableFields: readonly string[] = ["slug"],
    /**
     * Natural key for lookups. Content entities are keyed by `slug`; media has
     * no slug and is keyed by its unique `blobPath`.
     */
    private readonly keyField: string = "slug",
  ) {}

  private get collection() {
    return this.db.collection(this.collectionName);
  }

  public async list(query: ListQuery): Promise<PagedResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const filter: Filter<Document> = {};
    if (query.search) {
      // Escaped so a search for "c++" cannot inject a pattern.
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = this.searchableFields.map((field) => ({
        [field]: { $regex: escaped, $options: "i" },
      }));
    }

    const sort: Sort = query.sort
      ? { [query.sort.replace(/^-/, "")]: query.sort.startsWith("-") ? -1 : 1 }
      : { sortOrder: 1 };

    const [docs, total] = await Promise.all([
      this.collection
        .find(filter)
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      this.collection.countDocuments(filter),
    ]);

    return { items: docs.map(withMeta), total, page, pageSize };
  }

  /** Every document, ordered — used to build a release snapshot. */
  public async findAll(): Promise<Array<Record<string, unknown>>> {
    const docs = await this.collection.find({}).sort({ sortOrder: 1 }).toArray();
    return docs.map((doc) => fromDb(stripMeta(doc)) as Record<string, unknown>);
  }

  public async findBySlug(slug: string): Promise<Record<string, unknown> | null> {
    const doc = await this.collection.findOne({ [this.keyField]: slug });
    return doc ? withMeta(doc) : null;
  }

  public async create(
    content: Record<string, unknown>,
    updatedBy: string,
  ): Promise<Record<string, unknown>> {
    const now = new Date();
    const stored = toDb(content) as Document;

    try {
      const result = await this.collection.insertOne({
        ...stored,
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy,
      });
      const doc = await this.collection.findOne({ _id: result.insertedId });
      return withMeta(doc!);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw ApiError.badRequest(
          `A record with ${this.keyField} "${String(content[this.keyField])}" already exists`,
          [{ path: this.keyField, message: "Must be unique" }],
        );
      }
      throw error;
    }
  }

  /**
   * Replaces a record only if it is still at `expectedVersion`, so two admin
   * tabs cannot silently overwrite each other.
   */
  public async update(
    slug: string,
    content: Record<string, unknown>,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<Record<string, unknown>> {
    const current = await this.collection.findOne({ [this.keyField]: slug });
    if (!current) throw ApiError.notFound(`No record with ${this.keyField} "${slug}"`);

    if (current.version !== expectedVersion) {
      throw ApiError.conflict(
        `This record changed since you loaded it (version ${String(current.version)}, you sent ${expectedVersion}). Reload and reapply your changes.`,
      );
    }

    const now = new Date();
    const stored = toDb(content) as Document;

    try {
      await this.collection.replaceOne(
        { _id: current._id, version: expectedVersion },
        {
          ...stored,
          version: expectedVersion + 1,
          createdAt: current.createdAt ?? now,
          updatedAt: now,
          updatedBy,
        },
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw ApiError.badRequest(
          `A record with ${this.keyField} "${String(content[this.keyField])}" already exists`,
          [{ path: this.keyField, message: "Must be unique" }],
        );
      }
      throw error;
    }

    const doc = await this.collection.findOne({ _id: current._id });
    return withMeta(doc!);
  }

  public async deleteBySlug(slug: string): Promise<void> {
    const result = await this.collection.deleteOne({ [this.keyField]: slug });
    if (result.deletedCount === 0) {
      throw ApiError.notFound(`No record with ${this.keyField} "${slug}"`);
    }
  }

  /** Persists drag-and-drop ordering from the admin grid. */
  public async reorder(slugs: string[], updatedBy: string): Promise<void> {
    const existing = await this.collection
      .find({ slug: { $in: slugs } }, { projection: { slug: 1 } })
      .toArray();

    if (existing.length !== slugs.length) {
      const found = new Set(existing.map((doc) => String(doc.slug)));
      const missing = slugs.filter((slug) => !found.has(slug));
      throw ApiError.badRequest(`Unknown slugs: ${missing.join(", ")}`);
    }

    const now = new Date();
    await this.collection.bulkWrite(
      slugs.map((slug, index) => ({
        updateOne: {
          filter: { slug },
          update: { $set: { sortOrder: index, updatedAt: now, updatedBy } },
        },
      })),
      { ordered: false },
    );
  }

  public async findById(id: string): Promise<Record<string, unknown> | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await this.collection.findOne({ _id: new ObjectId(id) });
    return doc ? withMeta(doc) : null;
  }
}

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
