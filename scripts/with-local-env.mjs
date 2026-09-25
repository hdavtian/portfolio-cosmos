// Runs a command against the local Docker services (MongoDB + Azurite).
//   node scripts/with-local-env.mjs <command> [args...]
// The local environment overrides api/.env, so the command cannot reach
// production Atlas or Azure Storage.
import { execSync, spawnSync } from "node:child_process";
import { localApiCommand, localApiCwd } from "./local-api-command.mjs";
import { LOCAL_API_PORT, localApiEnv } from "./local-env.mjs";
import { belongsToThisRepo, listeners, settle, stopTree } from "./local-ports.mjs";

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("Usage: node scripts/with-local-env.mjs <command> [args...]");
  process.exit(1);
}

try {
  execSync("docker info", { stdio: "ignore" });
} catch {
  console.error("[local-env] Docker is not running. Start Docker Desktop and try again.");
  process.exit(1);
}

execSync("docker compose up -d --wait", { stdio: "inherit" });

// "--api" runs the API exactly as dev:full does. A previous API of this
// project still on the port is stopped first, watcher and all: otherwise the
// new one starts, logs "listening", and the old one keeps answering.
const isApi = command.length === 1 && command[0] === "--api";
if (isApi) {
  const holders = listeners(LOCAL_API_PORT);
  const ours = holders.filter((entry) => belongsToThisRepo(entry.command));
  for (const entry of ours) {
    console.log(`[local-env] Stopping the previous API on :${LOCAL_API_PORT} (pid ${entry.pid})`);
    stopTree(entry.pid);
  }
  if (ours.length > 0) settle();
  const foreign = listeners(LOCAL_API_PORT).filter((entry) => !belongsToThisRepo(entry.command));
  if (foreign.length > 0) {
    for (const entry of foreign) console.error(`[local-env] Port ${LOCAL_API_PORT} is held by another program: pid ${entry.pid} ${entry.command.slice(0, 160)}`);
    process.exit(1);
  }
}
const result = spawnSync(isApi ? localApiCommand : command.join(" "), {
  stdio: "inherit",
  shell: true,
  cwd: isApi ? localApiCwd : undefined,
  env: { ...process.env, ...localApiEnv },
});
process.exit(result.status ?? 1);
