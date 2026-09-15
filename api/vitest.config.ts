import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // env.ts fails fast without these; tests never connect to a real database.
    env: {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:1/unused",
      MONGODB_DB_NAME: "test",
    },
  },
});
