// Starts local Docker services (MongoDB + Azurite), then the API, the site
// (:5173) and the admin (:5174).
//   npm run dev:full
//   npm run dev:full-restart       first stops this project's API/site/admin
//                                  still holding their ports (e.g. after a crash)
//   npm run dev:full -- --seed     also seeds local MongoDB from src/data first
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import concurrently from "concurrently";
import { localApiCommand, localApiCwd } from "./local-api-command.mjs";
import { LOCAL_API_PORT, localApiEnv, localWebEnv } from "./local-env.mjs";

const run = (command) => execSync(command, { stdio: "inherit" });
const repoRoot = path.resolve(import.meta.dirname, "..");
const restart = process.argv.includes("--restart");

const PORTS = [
  { port: LOCAL_API_PORT, name: "API" },
  { port: 5173, name: "site" },
  { port: 5174, name: "admin" },
];

/** Processes listening on a port: { pid, command }. */
const listeners = (port) => {
  if (process.platform === "win32") {
    const script = `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$_"; "$_\`t$($p.CommandLine)" }`;
    const output = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).stdout ?? "";
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [pid, ...rest] = line.split("\t");
        return { pid: Number(pid), command: rest.join("\t") };
      })
      .filter((entry) => Number.isFinite(entry.pid) && entry.pid > 0);
  }
  const output = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"], { encoding: "utf8" }).stdout ?? "";
  const pids = [...output.matchAll(/^p(\d+)$/gm)].map((match) => Number(match[1]));
  return pids.map((pid) => ({
    pid,
    command: spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).stdout?.trim() ?? "",
  }));
};

const belongsToThisRepo = (command) => command.toLowerCase().includes(repoRoot.toLowerCase());

/**
 * The listening process is often a child (node --watch → server). Walk up to the
 * highest ancestor that still runs from this repo, so the watcher goes too.
 */
const topmostRepoAncestor = (pid) => {
  if (process.platform !== "win32") return pid;
  let current = pid;
  for (let hops = 0; hops < 6; hops += 1) {
    const script = `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${current}"; if ($p) { $q = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)"; if ($q) { "$($q.ProcessId)\`t$($q.CommandLine)" } }`;
    const line = (spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).stdout ?? "").trim();
    const [parentPid, ...rest] = line.split("\t");
    if (!parentPid || !belongsToThisRepo(rest.join("\t"))) break;
    current = Number(parentPid);
  }
  return current;
};

/** Stops a process and everything it started (the API's watcher, npm wrappers). */
const stopTree = (pid) => {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(topmostRepoAncestor(pid)), "/T", "/F"], { stdio: "ignore" });
  } else {
    spawnSync("kill", ["-TERM", String(pid)], { stdio: "ignore" });
  }
};

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
  // Give Windows a moment to release the ports.
  if (ours.length > 0) spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 1500)"]);
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
