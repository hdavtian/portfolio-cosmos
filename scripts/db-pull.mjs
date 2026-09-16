// Dumps the production Atlas database to db-backups/ (read-only on Atlas).
//   npm run db:pull
//
// Uses mongodump from the mongo:8.0 Docker image, so no local install is needed.
// api/.env targets local Docker, so the production URI is resolved in this order:
//   1. MONGODB_URI in the environment
//   2. api/.env.production.local (git-ignored)
//   3. the harma-api app settings in Azure (after the subscription guard)
// The URI is passed to the container through an environment variable, never printed.
// Dumps are kept; retention is managed by hand.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const backupDir = path.join(rootDir, "db-backups");

const AZURE_SUBSCRIPTION = "0aebe465-2471-45ac-a357-6f84975876ed";
const AZURE_RESOURCE_GROUP = "rg-portfolio-prod";
const AZURE_WEBAPP = "harma-api";

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

const fromAzure = () => {
  const guard = spawnSync(
    "pwsh",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(rootDir, "scripts", "az-guard.ps1")],
    { stdio: "inherit" },
  );
  if (guard.status !== 0) process.exit(guard.status ?? 1);

  const read = (name) =>
    execFileSync(
      "az",
      [
        "webapp",
        "config",
        "appsettings",
        "list",
        "--subscription",
        AZURE_SUBSCRIPTION,
        "-g",
        AZURE_RESOURCE_GROUP,
        "-n",
        AZURE_WEBAPP,
        "--query",
        `[?name=='${name}'].value | [0]`,
        "-o",
        "tsv",
      ],
      { encoding: "utf8" },
    ).trim();

  console.log("[db:pull] Reading production connection details from Azure app settings...");
  return { uri: read("MONGODB_URI"), dbName: read("MONGODB_DB_NAME") };
};

const productionEnv = readDotEnv(path.join(rootDir, "api", ".env.production.local"));
let uri = process.env.MONGODB_URI ?? productionEnv.MONGODB_URI;
let dbName = process.env.MONGODB_DB_NAME ?? productionEnv.MONGODB_DB_NAME;

if (!uri || !uri.startsWith("mongodb+srv://")) {
  ({ uri, dbName } = fromAzure());
}

if (!uri || !uri.startsWith("mongodb+srv://")) {
  console.error(
    "[db:pull] No production Atlas URI found. Set MONGODB_URI, add it to api/.env.production.local, or sign in with `az login`.",
  );
  process.exit(1);
}
dbName ||= "resume_cosmos";

const host = new URL(uri.replace(/^mongodb\+srv:\/\//, "http://")).hostname;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archiveName = `${dbName}-${stamp}.archive.gz`;

mkdirSync(backupDir, { recursive: true });
console.log(`[db:pull] Dumping ${dbName} from ${host} -> db-backups/${archiveName}`);

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-e",
    "MONGODUMP_URI",
    "-v",
    `${backupDir}:/backup`,
    "mongo:8.0",
    "sh",
    "-c",
    `mongodump --uri="$MONGODUMP_URI" --db="${dbName}" --gzip --archive="/backup/${archiveName}"`,
  ],
  { stdio: "inherit", env: { ...process.env, MONGODUMP_URI: uri } },
);

if (result.status !== 0) {
  console.error(
    "[db:pull] mongodump failed. If it timed out, your current IP may not be on the Atlas Network Access list.",
  );
  process.exit(result.status ?? 1);
}
console.log(`[db:pull] Done: db-backups/${archiveName}`);
