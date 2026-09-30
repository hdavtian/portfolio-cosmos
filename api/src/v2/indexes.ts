import {
  collectionSchemas,
  MEDIA_COLLECTION,
  SINGLETONS_COLLECTION,
  type CollectionName,
} from "@hd/content-schema";
import type { Db } from "mongodb";
import {
  CONTACT_SETTINGS_COLLECTION,
  CONTACT_SUBMISSIONS_COLLECTION,
} from "./contact/contactStore.js";
import { RELEASES_COLLECTION } from "./releaseService.js";

// The unique slug index is what makes duplicate slugs fail loudly instead of
// creating a second record. The import script creates these too; doing it at
// startup keeps a freshly created database correct without running an import.
export const ensureIndexes = async (db: Db): Promise<void> => {
  for (const name of Object.keys(collectionSchemas) as CollectionName[]) {
    await db.collection(name).createIndex({ slug: 1 }, { unique: true });
    await db.collection(name).createIndex({ sortOrder: 1 });
  }

  await db.collection(SINGLETONS_COLLECTION).createIndex({ key: 1 }, { unique: true });

  // Release history is append-only; exactly one row may be the current release.
  await db.collection(RELEASES_COLLECTION).createIndex({ id: 1 }, { unique: true });
  await db
    .collection(RELEASES_COLLECTION)
    .createIndex(
      { current: 1 },
      { unique: true, partialFilterExpression: { current: true } },
    );
  // Contact messages (HD-4). The reference is unique because it is quoted in
  // both emails, so two messages sharing one would be genuinely ambiguous;
  // `insertSubmission` retries a collision rather than trusting the draw.
  // The fingerprint index is not unique: the duplicate guard is scoped to a
  // 24-hour window, so the same note sent again months later is a new message.
  await db
    .collection(CONTACT_SUBMISSIONS_COLLECTION)
    .createIndex({ reference: 1 }, { unique: true });
  await db.collection(CONTACT_SUBMISSIONS_COLLECTION).createIndex({ fingerprint: 1, submittedAt: -1 });
  await db.collection(CONTACT_SUBMISSIONS_COLLECTION).createIndex({ submittedAt: -1 });
  await db.collection(CONTACT_SUBMISSIONS_COLLECTION).createIndex({ status: 1, submittedAt: -1 });
  await db.collection(CONTACT_SETTINGS_COLLECTION).createIndex({ key: 1 }, { unique: true });

  await db.collection(MEDIA_COLLECTION).createIndex({ blobPath: 1 }, { unique: true });
  await db
    .collection(MEDIA_COLLECTION)
    .createIndex(
      { sourcePath: 1 },
      { unique: true, partialFilterExpression: { sourcePath: { $type: "string" } } },
    );
};
