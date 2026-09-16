import { randomBytes } from "node:crypto";
import mongoose from "mongoose";

// Integration tests run against the local Docker MongoDB (`npm run services:up`),
// not mongodb-memory-server: MongoDB publishes no Windows ARM64 build, so its
// downloader cannot work on this machine. Docker also matches production Atlas
// (8.0) exactly, which is what we want to test against anyway.
//
// Each run uses a throwaway database that is dropped afterwards, so a test run
// can never disturb resume_cosmos_local.
const TEST_MONGO_URI = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017";

/** True when Docker MongoDB accepted a connection and tests can run. */
export const mongoAvailable = async (): Promise<boolean> => {
  try {
    await mongoose.connect(TEST_MONGO_URI, {
      dbName: `api_test_${randomBytes(6).toString("hex")}`,
      serverSelectionTimeoutMS: 3000,
    });
    return true;
  } catch {
    await mongoose.connection.close().catch(() => undefined);
    return false;
  }
};

export const stopMongo = async (): Promise<void> => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.connection.close();
};

export const resetDb = async (): Promise<void> => {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

export const SKIP_MESSAGE =
  "Docker MongoDB is not running - start it with `npm run services:up`";
