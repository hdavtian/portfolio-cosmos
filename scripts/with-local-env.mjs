// Runs a command against the local Docker services (MongoDB + Azurite).
//   node scripts/with-local-env.mjs <command> [args...]
// The local environment overrides api/.env, so the command cannot reach
// production Atlas or Azure Storage.
import { execSync, spawnSync } from "node:child_process";
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

const result = spawnSync(command.join(" "), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...localApiEnv },
});
process.exit(result.status ?? 1);
