import { ObjectId, type Document } from "mongodb";

// Entities carry `mediaId` as a hex string at the API boundary and as an
// ObjectId in MongoDB, so $lookup against the media collection works. The
// conversion is recursive: media references appear inside gallery items,
// client variants and deck blocks too.
const MEDIA_REF_KEY = "mediaId";

export const META_FIELDS = [
  "_id",
  "version",
  "createdAt",
  "updatedAt",
  "updatedBy",
] as const;

const metaFieldSet = new Set<string>(META_FIELDS);

export const toDb = (value: unknown, key?: string): unknown => {
  if (key === MEDIA_REF_KEY && typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  if (Array.isArray(value)) return value.map((item) => toDb(item));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toDb(v, k)]),
    );
  }
  return value;
};

export const fromDb = (value: unknown, key?: string): unknown => {
  if (key === MEDIA_REF_KEY && value instanceof ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map((item) => fromDb(item));
  if (
    value &&
    typeof value === "object" &&
    !(value instanceof ObjectId) &&
    !(value instanceof Date)
  ) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fromDb(v, k)]),
    );
  }
  return value;
};

/** Document content without storage/meta fields, ready for schema parsing. */
export const stripMeta = (doc: Document): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(doc).filter(([key]) => !metaFieldSet.has(key)),
  ) as Record<string, unknown>;

/** Document content plus the meta fields the admin needs (id, version, audit). */
export const withMeta = (doc: Document): Record<string, unknown> => ({
  ...(fromDb(stripMeta(doc)) as Record<string, unknown>),
  id: (doc._id as ObjectId).toHexString(),
  version: doc.version as number,
  createdAt: (doc.createdAt as Date)?.toISOString(),
  updatedAt: (doc.updatedAt as Date)?.toISOString(),
  updatedBy: doc.updatedBy as string,
});
