// Dumps the production Atlas database to db-backups/ (read-only on Atlas).
//   npm run db:pull
//
// Uses mongodump from the mongo:8.0 Docker image, so no local install is needed.
// The production URI comes from scripts/lib/production.mjs and is passed to the
// container through an environment variable, never printed.
// Files are named prod-<db>-<timestamp>.archive.gz. Dumps are kept; retention
// is managed by hand.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { backupArchiveName, backupDir, productionMongo } from "./lib/production.mjs";

const { uri, dbName, host } = productionMongo("db:pull");
const archiveName = backupArchiveName("prod", dbName);

mkdirSync(backupDir, { recursive: true });
console.log(`[db:pull] Dumping ${dbName} from ${host} -> db-backups/${archiveName}`);

const result = spawnSync(
  "docker",
  [
    "run", "--rm",
    "-e", "MONGODUMP_URI",
    "-v", `${backupDir}:/backup`,
    "mongo:8.0",
    "sh", "-c",
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
