// Runs a command against the local Docker services (MongoDB + Azurite).
//   node scripts/with-local-env.mjs <command> [args...]
// The local environment overrides api/.env, so the command cannot reach
// production Atlas or Azure Storage.
import { execSync, spawnSync } from "node:child_process";
import { localApiCommand, localApiCwd } from "./local-api-command.mjs";
import { localApiEnv } from "./local-env.mjs";

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

// "--api" runs the API exactly as dev:full does.
const isApi = command.length === 1 && command[0] === "--api";
const result = spawnSync(isApi ? localApiCommand : command.join(" "), {
  stdio: "inherit",
  shell: true,
  cwd: isApi ? localApiCwd : undefined,
  env: { ...process.env, ...localApiEnv },
});
process.exit(result.status ?? 1);
