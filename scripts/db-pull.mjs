// Dumps the production Atlas database to db-backups/ (read-only on Atlas).
//   npm run db:pull
//
// Uses mongodump from the mongo:8 Docker image, so no local install is needed.
// The connection string comes from MONGODB_URI (environment or api/.env) and is
// passed to the container through an environment variable, never printed.
// Dumps are kept; retention is managed by hand.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const backupDir = path.join(rootDir, "db-backups");

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

const apiEnv = readDotEnv(path.join(rootDir, "api", ".env"));
const uri = process.env.MONGODB_URI ?? apiEnv.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME ?? apiEnv.MONGODB_DB_NAME ?? "resume_cosmos";

if (!uri || !uri.startsWith("mongodb+srv://")) {
  console.error("[db:pull] MONGODB_URI must be the production Atlas URI (mongodb+srv://...), set in api/.env or the environment.");
  process.exit(1);
}

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
