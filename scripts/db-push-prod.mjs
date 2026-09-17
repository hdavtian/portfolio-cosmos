// Copies the local Docker content database to production Atlas.
//   npm run db:push-prod -- --yes
//
// Local is where content is curated before production has an admin, so this
// replaces production's v2 collections with the local ones (releases included,
// so the current release and its history come along). The legacy v1
// collection (content_documents) is never touched.
//
// Always backs up both sides first: prod-… via db:pull and local-… via
// db:backup-local, into db-backups/. Media binaries are copied separately by
// `npm run media:push-prod`.
import { spawnSync } from "node:child_process";
import { backupLocal } from "./db-backup-local.mjs";
import { backupDir, productionMongo, rootDir } from "./lib/production.mjs";

const LOCAL_DB = "resume_cosmos_local";
const LEGACY_COLLECTIONS = ["content_documents"];

if (!process.argv.includes("--yes")) {
  console.error("[db:push-prod] This replaces production content. Re-run with --yes to confirm.");
  process.exit(1);
}

const run = (label, command, args, env) => {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: rootDir, env: { ...process.env, ...env } });
  if (result.status !== 0) {
    console.error(`[db:push-prod] ${label} failed; nothing further was done.`);
    process.exit(result.status ?? 1);
  }
};

const { uri, dbName, host } = productionMongo("db:push-prod");

console.log("[db:push-prod] 1/3 Backing up production...");
run("Production backup", "node", ["scripts/db-pull.mjs"]);

console.log("[db:push-prod] 2/3 Backing up local...");
const localArchive = backupLocal();

console.log(`[db:push-prod] 3/3 Restoring local ${LOCAL_DB} into ${dbName} on ${host} (v2 collections, replacing them)...`);
run(
  "Restore",
  "docker",
  [
    "run", "--rm",
    "-e", "MONGORESTORE_URI",
    "-v", `${backupDir}:/backup`,
    "mongo:8.0",
    "sh", "-c",
    [
      'mongorestore --uri="$MONGORESTORE_URI"',
      "--gzip",
      `--archive="/backup/${localArchive}"`,
      `--nsInclude="${LOCAL_DB}.*"`,
      ...LEGACY_COLLECTIONS.map((name) => `--nsExclude="${LOCAL_DB}.${name}"`),
      `--nsFrom="${LOCAL_DB}.*"`,
      `--nsTo="${dbName}.*"`,
      "--drop",
    ].join(" "),
  ],
  { MONGORESTORE_URI: uri },
);

console.log("[db:push-prod] Done. Backups are in db-backups/ (kept; retention is managed by hand).");
