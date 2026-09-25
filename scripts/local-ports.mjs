// Who holds the local dev ports, and how to stop a previous run of this
// project cleanly. Shared by dev:full and api:local, so a stale API watcher
// from an earlier session cannot keep the port while a new one starts behind
// it (that happened: the admin was reading a database nobody had chosen).
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

/** Processes listening on a port: { pid, command }. */
export const listeners = (port) => {
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

export const belongsToThisRepo = (command) => command.toLowerCase().includes(repoRoot.toLowerCase());

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
export const stopTree = (pid) => {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(topmostRepoAncestor(pid)), "/T", "/F"], { stdio: "ignore" });
  } else {
    spawnSync("kill", ["-TERM", String(pid)], { stdio: "ignore" });
  }
};

/** Waits for Windows to release the ports after a kill. */
export const settle = () => spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 1500)"]);
