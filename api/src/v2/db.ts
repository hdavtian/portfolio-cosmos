import mongoose from "mongoose";
import type { Db } from "mongodb";

// v1 uses Mongoose models; v2 works with the native driver, since the schemas
// live in @hd/content-schema and Mongoose's own schema layer would duplicate
// them. Both share one connection.
export const getDb = (): Db => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection is not ready");
  }
  return db as unknown as Db;
};
