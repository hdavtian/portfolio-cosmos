// Shared helpers for scripts that read or write production data.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const rootDir = path.resolve(import.meta.dirname, "..", "..");
export const backupDir = path.join(rootDir, "db-backups");

export const AZURE_SUBSCRIPTION = "0aebe465-2471-45ac-a357-6f84975876ed";
export const AZURE_RESOURCE_GROUP = "rg-portfolio-prod";
export const AZURE_WEBAPP = "harma-api";

/**
 * Backup file names start with where the data came from, so a file in
 * db-backups/ is never mistaken for the other side:
 *   prod-resume_cosmos-2026-09-17T17-30-00-000Z.archive.gz
 *   local-resume_cosmos_local-2026-09-17T17-30-00-000Z.archive.gz
 */
export const backupArchiveName = (source, dbName) =>
  `${source}-${dbName}-${new Date().toISOString().replace(/[:.]/g, "-")}.archive.gz`;

export const runAzGuard = () => {
  const guard = spawnSync(
    "pwsh",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(rootDir, "scripts", "az-guard.ps1")],
    { stdio: "inherit" },
  );
  if (guard.status !== 0) process.exit(guard.status ?? 1);
};

const readDotEnv = (file) => {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
      }),
  );
};

/**
 * The production Atlas URI and database name, never printed. Resolved from
 * MONGODB_URI in the environment, then api/.env.production.local (git-ignored),
 * then the harma-api app settings in Azure (after the subscription guard).
 */
export const productionMongo = (label) => {
  const productionEnv = readDotEnv(path.join(rootDir, "api", ".env.production.local"));
  let uri = process.env.MONGODB_URI ?? productionEnv.MONGODB_URI;
  let dbName = process.env.MONGODB_DB_NAME ?? productionEnv.MONGODB_DB_NAME;

  if (!uri || !uri.startsWith("mongodb+srv://")) {
    runAzGuard();
    const read = (name) =>
      execFileSync(
        "az",
        [
          "webapp", "config", "appsettings", "list",
          "--subscription", AZURE_SUBSCRIPTION,
          "-g", AZURE_RESOURCE_GROUP,
          "-n", AZURE_WEBAPP,
          "--query", `[?name=='${name}'].value | [0]`,
          "-o", "tsv",
        ],
        { encoding: "utf8" },
      ).trim();
    console.log(`[${label}] Reading production connection details from Azure app settings...`);
    uri = read("MONGODB_URI");
    dbName = read("MONGODB_DB_NAME");
  }

  if (!uri || !uri.startsWith("mongodb+srv://")) {
    console.error(
      `[${label}] No production Atlas URI found. Set MONGODB_URI, add it to api/.env.production.local, or sign in with \`az login\`.`,
    );
    process.exit(1);
  }
  const host = new URL(uri.replace(/^mongodb\+srv:\/\//, "http://")).hostname;
  return { uri, dbName: dbName || "resume_cosmos", host };
};
