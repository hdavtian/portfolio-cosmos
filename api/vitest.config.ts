import { randomBytes, scryptSync } from "node:crypto";
import { defineConfig } from "vitest/config";

// Real scrypt hash in the shared sign-on format, so auth tests exercise the
// same verification path as production instead of a stubbed one.
const TEST_PASSWORD = "test-password";
const salt = randomBytes(16);
const testPasswordHash = [
  "scrypt",
  16384,
  8,
  1,
  salt.toString("base64"),
  scryptSync(TEST_PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64"),
].join("$");

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // env.ts fails fast without these; tests never connect to a real database.
    env: {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:1/unused",
      MONGODB_DB_NAME: "test",
      AUTH_PASSWORD_HASH: testPasswordHash,
      AUTH_COOKIE_SECRET: "test-cookie-secret-test-cookie-secret",
    },
  },
});
