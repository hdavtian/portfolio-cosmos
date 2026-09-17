import path from "node:path";

// How the API runs in local development, shared by dev:full and api:local.
//
// node --watch, not "tsx watch": tsx watch hung silently (no "API listening")
// when started by concurrently in dev:full. The server path is absolute so the
// process is recognisably this project's (dev:full-restart stops only those).
// The working directory is api/, where dotenv reads api/.env.
const repoRoot = path.resolve(import.meta.dirname, "..");

export const localApiCwd = path.join(repoRoot, "api");
export const localApiCommand = `node --watch --import tsx "${path.join(localApiCwd, "src", "server.ts")}"`;
