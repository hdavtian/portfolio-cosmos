// Starts local Docker services (MongoDB + Azurite), then the API, the site
// (:5173) and the admin (:5174).
//   npm run dev:full
//   npm run dev:full-restart       first stops this project's API/site/admin
//                                  still holding their ports (e.g. after a crash)
import { execSync } from "node:child_process";
import concurrently from "concurrently";
import { localApiCommand, localApiCwd } from "./local-api-command.mjs";
import { LOCAL_API_PORT, localApiEnv, localWebEnv } from "./local-env.mjs";
import { belongsToThisRepo, listeners, settle, stopTree } from "./local-ports.mjs";

const run = (command) => execSync(command, { stdio: "inherit" });
const restart = process.argv.includes("--restart");

const PORTS = [
  { port: LOCAL_API_PORT, name: "API" },
  { port: 5173, name: "site" },
  { port: 5174, name: "admin" },
];

const busy = () =>
  PORTS.flatMap(({ port, name }) => listeners(port).map((listener) => ({ port, name, ...listener })));

if (restart) {
  const stale = busy();
  const ours = stale.filter((entry) => belongsToThisRepo(entry.command));
  for (const entry of ours) {
    console.log(`[dev:full] Stopping old ${entry.name} on :${entry.port} (pid ${entry.pid})`);
    stopTree(entry.pid);
  }
  if (ours.length === 0) console.log("[dev:full] Nothing from this project was running.");
  if (ours.length > 0) settle();
}

// Fail fast with a clear message instead of starting half the stack: a busy
// API port used to leave the site and admin running against no backend.
const stillBusy = busy();
if (stillBusy.length > 0) {
  for (const entry of stillBusy) {
    const owner = belongsToThisRepo(entry.command) ? "a previous run of this project" : "another program";
    console.error(`[dev:full] Port ${entry.port} (${entry.name}) is in use by ${owner}: pid ${entry.pid}`);
    console.error(`           ${entry.command.slice(0, 160)}`);
  }
  console.error(
    stillBusy.every((entry) => belongsToThisRepo(entry.command))
      ? "[dev:full] Run `npm run dev:full-restart` to stop them and start fresh."
      : "[dev:full] Stop that program (it is not part of this project), then try again.",
  );
  process.exit(1);
}

try {
  execSync("docker info", { stdio: "ignore" });
} catch {
  console.error("[dev:full] Docker is not running. Start Docker Desktop and try again.");
  process.exit(1);
}

console.log("[dev:full] Starting MongoDB and Azurite...");
run("docker compose up -d --wait");

const { result } = concurrently(
  [
    {
      name: "api",
      command: localApiCommand,
      cwd: localApiCwd,
      prefixColor: "blue",
      env: { ...process.env, ...localApiEnv },
    },
    {
      name: "web",
      command: "npm run dev",
      prefixColor: "magenta",
      env: localWebEnv,
    },
    {
      name: "admin",
      command: "npm run admin:dev",
      prefixColor: "green",
      env: localWebEnv,
    },
  ],
  { killOthersOn: ["failure"], prefix: "name" },
);

result.catch(() => process.exit(1));
