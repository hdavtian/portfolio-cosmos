// Starts local Docker services (MongoDB + Azurite), then the API and Vite.
//   npm run dev:full
//   npm run dev:full -- --seed    also seeds local MongoDB from src/data first
import { execSync, spawnSync } from "node:child_process";
import concurrently from "concurrently";
import { localApiEnv, localWebEnv } from "./local-env.mjs";

const run = (command) => execSync(command, { stdio: "inherit" });

try {
  execSync("docker info", { stdio: "ignore" });
} catch {
  console.error("[dev:full] Docker is not running. Start Docker Desktop and try again.");
  process.exit(1);
}

console.log("[dev:full] Starting MongoDB and Azurite...");
run("docker compose up -d --wait");

if (process.argv.includes("--seed")) {
  console.log("[dev:full] Seeding local MongoDB...");
  const seed = spawnSync("npm run seed -w api", {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...localApiEnv },
  });
  if (seed.status !== 0) process.exit(seed.status ?? 1);
}

const { result } = concurrently(
  [
    {
      name: "api",
      command: "npm run dev -w api",
      prefixColor: "blue",
      env: localApiEnv,
    },
    {
      name: "web",
      command: "npm run dev",
      prefixColor: "magenta",
      env: localWebEnv,
    },
  ],
  { killOthersOn: ["failure"], prefix: "name" },
);

result.catch(() => process.exit(1));
