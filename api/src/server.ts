import mongoose from "mongoose";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectMongo } from "./db/connectMongo.js";

const app = createApp();

const MONGO_RETRY_MS = 15000;

const connectMongoWithRetry = async (): Promise<void> => {
  try {
    await connectMongo();
    console.log("MongoDB connected.");
  } catch (error) {
    console.error("MongoDB connection failed. Retrying...", error);
    setTimeout(() => {
      void connectMongoWithRetry();
    }, MONGO_RETRY_MS);
  }
};

const start = async () => {
  app.listen(env.PORT, () => {
    // Keep startup logging straightforward for Azure App Service log streaming.
    console.log(`API listening on port ${env.PORT}`);
  });

  // Keep the app alive even if Atlas is temporarily unreachable.
  await connectMongoWithRetry();
};

void start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});

const shutdown = async () => {
  await mongoose.connection.close();
  process.exit(0);
};

process.on("SIGTERM", () => {
  void shutdown();
});

process.on("SIGINT", () => {
  void shutdown();
});
