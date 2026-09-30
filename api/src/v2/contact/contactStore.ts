import { createHash, randomBytes } from "node:crypto";
import {
  contactSettingsSchema,
  defaultContactSettings,
  type ContactSettings,
  type ContactStatus,
} from "@hd/content-schema";
import { ObjectId, type Db, type Document, type Filter, type Sort } from "mongodb";
import { getDb } from "../db.js";
import { withMeta } from "../storageCodec.js";

/**
 * Storage for contact messages and the settings that govern them. HD-4.
 *
 * Two collections of its own, on purpose. Neither appears in
 * `collectionSchemas`, so neither is swept into a release snapshot: see the
 * note at the top of `@hd/content-schema`'s contact.ts. A release is a
 * reviewable description of the site, and it must not grow by one entry every
 * time a stranger writes in.
 */

export const CONTACT_SUBMISSIONS_COLLECTION = "contactSubmissions";
export const CONTACT_SETTINGS_COLLECTION = "contactSettings";

/** One document, found by this key, so the collection can never hold two. */
const SETTINGS_KEY = "contact";

/** Fields the admin grid may search on. */
const SEARCHABLE = ["reference", "name", "email", "message", "notes"] as const;

export interface SubmissionPage {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
}

const collection = () => getDb().collection(CONTACT_SUBMISSIONS_COLLECTION);

/**
 * A short reference, quoted in both emails and shown in the admin.
 *
 * The only handle on a message that exists outside the database, so it has to
 * survive being read down a phone line: no vowels (nothing spells a word by
 * accident), and no `0`/`O` or `1`/`I` to misread. Eight characters from an
 * alphabet of 27 is ample for a personal contact form, and a collision is
 * caught by the unique index and retried rather than trusted.
 */
const REFERENCE_ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXYZ";

export const generateReference = (): string => {
  const bytes = randomBytes(8);
  let reference = "";
  for (const byte of bytes) {
    reference += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }
  return reference;
};

/**
 * How the same message submitted twice is recognised.
 *
 * Address plus message, both normalised, hashed. Normalising matters: a
 * double-click that retries the post sends byte-identical text, but somebody
 * who reloads and retypes their note will not reproduce their own whitespace,
 * and treating those two as different messages is the failure this guards
 * against — two identical emails in Harma's inbox from one person.
 *
 * Whitespace is collapsed and case folded. The message's *content* is not
 * otherwise touched; the stored copy is always what was typed.
 */
export const fingerprintOf = (email: string, message: string): string =>
  createHash("sha256")
    .update(email.trim().toLowerCase())
    .update("\u0000")
    .update(message.trim().toLowerCase().replace(/\s+/g, " "))
    .digest("hex");

/** How long a message counts as a duplicate of itself. */
export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * An earlier copy of this exact message, if there is a recent one.
 *
 * A window rather than forever: somebody who wrote in three months ago and
 * never heard back is entitled to send the same note again, and silently
 * swallowing it would be the worst possible outcome for a contact form.
 */
export const findRecentDuplicate = async (
  fingerprint: string,
  now: Date,
): Promise<Document | null> =>
  collection().findOne({
    fingerprint,
    submittedAt: { $gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
  });

export interface NewSubmission {
  name: string;
  email: string;
  message: string;
  fingerprint: string;
  submittedAt: Date;
  sourcePath?: string;
  userAgent?: string;
}

/**
 * Writes a message, retrying a reference collision.
 *
 * `version` and the audit fields match what `EntityRepository` writes for
 * content, so the admin's grid and editor read a submission the same way they
 * read everything else. `updatedBy` is "visitor" until Harma touches it.
 */
export const insertSubmission = async (
  input: NewSubmission,
): Promise<{ id: ObjectId; reference: string }> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = generateReference();
    try {
      const result = await collection().insertOne({
        ...input,
        reference,
        status: "new" satisfies ContactStatus,
        notes: "",
        version: 1,
        createdAt: input.submittedAt,
        updatedAt: input.submittedAt,
        updatedBy: "visitor",
      });
      return { id: result.insertedId, reference };
    } catch (error) {
      // 11000 is a duplicate key. Only a reference clash is retryable here.
      const isDuplicate =
        typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
      if (!isDuplicate) throw error;
    }
  }

  throw new Error("Could not allocate a unique contact reference after five attempts");
};

/** Records that one or both emails failed, without touching anything else. */
export const recordMailError = async (id: ObjectId, mailError: string): Promise<void> => {
  await collection().updateOne({ _id: id }, { $set: { mailError } });
};

export const listSubmissions = async (query: {
  page: number;
  pageSize: number;
  sort?: string;
  search?: string;
  status?: ContactStatus;
}): Promise<SubmissionPage> => {
  const filter: Filter<Document> = {};

  if (query.search) {
    // Escaped so a search for "c++" cannot inject a pattern.
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = SEARCHABLE.map((field) => ({ [field]: { $regex: escaped, $options: "i" } }));
  }

  if (query.status) filter.status = query.status;

  // Newest first by default: a contact list is read from the top, unlike
  // content, which is read in the order the site shows it.
  const sort: Sort = query.sort
    ? { [query.sort.replace(/^-/, "")]: query.sort.startsWith("-") ? -1 : 1 }
    : { submittedAt: -1 };

  const [docs, total] = await Promise.all([
    collection()
      .find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .toArray(),
    collection().countDocuments(filter),
  ]);

  return { items: docs.map(withMeta), total, page: query.page, pageSize: query.pageSize };
};

/** How many messages sit in each status, for the admin's filter chips. */
export const countByStatus = async (): Promise<Record<string, number>> => {
  const rows = await collection()
    .aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    .toArray();
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
};

export const findSubmission = async (id: string): Promise<Record<string, unknown> | null> => {
  if (!ObjectId.isValid(id)) return null;
  const doc = await collection().findOne({ _id: new ObjectId(id) });
  return doc ? withMeta(doc) : null;
};

/**
 * Applies a status or notes change, refusing a stale version.
 *
 * Returns null when nothing matched, which the router turns into a 404 for an
 * unknown id and a 409 for a version that has moved on — it has to check which
 * of the two it was, because the filter cannot tell it.
 */
export const patchSubmission = async (
  id: string,
  changes: { status?: ContactStatus; notes?: string },
  version: number,
  editor: string,
): Promise<Record<string, unknown> | null> => {
  if (!ObjectId.isValid(id)) return null;

  const result = await collection().findOneAndUpdate(
    { _id: new ObjectId(id), version },
    {
      $set: { ...changes, updatedAt: new Date(), updatedBy: editor },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  return result ? withMeta(result) : null;
};

export const deleteSubmission = async (id: string): Promise<boolean> => {
  if (!ObjectId.isValid(id)) return false;
  const result = await collection().deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
};

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const settingsCollection = () => getDb().collection(CONTACT_SETTINGS_COLLECTION);

/**
 * The settings, or the defaults when they have never been saved.
 *
 * Parsed through the schema on the way out rather than trusted, so a document
 * written before a field existed still yields a complete object and the mail
 * code never has to ask whether a setting is there.
 */
export const readContactSettings = async (): Promise<ContactSettings & { version: number }> => {
  const doc = await settingsCollection().findOne({ key: SETTINGS_KEY });
  if (!doc) return { ...defaultContactSettings(), version: 0 };

  const parsed = contactSettingsSchema.safeParse(doc);
  return {
    ...(parsed.success ? parsed.data : defaultContactSettings()),
    version: (doc.version as number) ?? 1,
  };
};

/**
 * Saves the settings, refusing a stale version.
 *
 * `version: 0` means "there is nothing stored yet", which is what
 * `readContactSettings` reports for a fresh database, so an editor who loads
 * the defaults and saves them writes the first document rather than colliding
 * with one that does not exist.
 */
export const writeContactSettings = async (
  settings: ContactSettings,
  version: number,
  editor: string,
): Promise<(ContactSettings & { version: number }) | null> => {
  const now = new Date();

  if (version === 0) {
    try {
      await settingsCollection().insertOne({
        key: SETTINGS_KEY,
        ...settings,
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: editor,
      });
      return { ...settings, version: 1 };
    } catch (error) {
      const isDuplicate =
        typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
      // Somebody else created it in between; that is a conflict, not a crash.
      if (isDuplicate) return null;
      throw error;
    }
  }

  const result = await settingsCollection().findOneAndUpdate(
    { key: SETTINGS_KEY, version },
    { $set: { ...settings, updatedAt: now, updatedBy: editor }, $inc: { version: 1 } },
    { returnDocument: "after" },
  );

  if (!result) return null;

  const parsed = contactSettingsSchema.safeParse(result);
  return {
    ...(parsed.success ? parsed.data : defaultContactSettings()),
    version: result.version as number,
  };
};
