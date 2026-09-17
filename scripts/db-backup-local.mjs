// Dumps the local Docker database to db-backups/local-<db>-<timestamp>.archive.gz.
//   npm run db:backup-local
//
// Dumps are kept; retention is managed by hand.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { backupArchiveName, backupDir } from "./lib/production.mjs";

const container = "scrolling-resume-mongo";
const dbName = process.env.LOCAL_MONGODB_DB_NAME ?? "resume_cosmos_local";

export const backupLocal = () => {
  const archiveName = backupArchiveName("local", dbName);
  const inContainer = `/tmp/${archiveName}`;
  mkdirSync(backupDir, { recursive: true });
  console.log(`[db:backup-local] Dumping local ${dbName} -> db-backups/${archiveName}`);
  execFileSync("docker", ["exec", container, "mongodump", `--db=${dbName}`, "--gzip", `--archive=${inContainer}`], {
    stdio: "inherit",
  });
  execFileSync("docker", ["cp", `${container}:${inContainer}`, path.join(backupDir, archiveName)], { stdio: "inherit" });
  execFileSync("docker", ["exec", container, "rm", "-f", inContainer]);
  console.log(`[db:backup-local] Done: db-backups/${archiveName}`);
  return archiveName;
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  backupLocal();
}
