import {
  collectionSchemas,
  MEDIA_COLLECTION,
  SINGLETONS_COLLECTION,
  type CollectionName,
} from "@hd/content-schema";
import type { Db } from "mongodb";

// The unique slug index is what makes duplicate slugs fail loudly instead of
// creating a second record. The import script creates these too; doing it at
// startup keeps a freshly created database correct without running an import.
export const ensureIndexes = async (db: Db): Promise<void> => {
  for (const name of Object.keys(collectionSchemas) as CollectionName[]) {
    await db.collection(name).createIndex({ slug: 1 }, { unique: true });
    await db.collection(name).createIndex({ sortOrder: 1 });
  }

  await db.collection(SINGLETONS_COLLECTION).createIndex({ key: 1 }, { unique: true });
  await db.collection(MEDIA_COLLECTION).createIndex({ blobPath: 1 }, { unique: true });
  await db
    .collection(MEDIA_COLLECTION)
    .createIndex(
      { sourcePath: 1 },
      { unique: true, partialFilterExpression: { sourcePath: { $type: "string" } } },
    );
};
