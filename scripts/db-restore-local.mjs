// Restores a db:pull archive into local Docker MongoDB as a separate database,
// leaving the local working database (resume_cosmos_local) untouched.
//   npm run db:restore-local                 newest archive in db-backups/
//   npm run db:restore-local -- <file>       a specific archive
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const backupDir = path.join(rootDir, "db-backups");
const container = "scrolling-resume-mongo";
const sourceDb = process.env.MONGODB_DB_NAME ?? "resume_cosmos";
const targetDb = `${sourceDb}_prodcopy`;

const archive =
  process.argv[2] ??
  (existsSync(backupDir)
    ? readdirSync(backupDir)
        .filter((name) => name.endsWith(".archive.gz"))
        .map((name) => path.join(backupDir, name))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
    : undefined);

if (!archive || !existsSync(archive)) {
  console.error("[db:restore-local] No archive found. Run `npm run db:pull` first.");
  process.exit(1);
}

execSync("docker compose up -d --wait", { stdio: "inherit" });

const inContainer = `/tmp/${path.basename(archive)}`;
console.log(`[db:restore-local] ${path.basename(archive)} -> local database ${targetDb}`);
execFileSync("docker", ["cp", archive, `${container}:${inContainer}`], { stdio: "inherit" });
execFileSync(
  "docker",
  [
    "exec",
    container,
    "mongorestore",
    "--gzip",
    `--archive=${inContainer}`,
    `--nsInclude=${sourceDb}.*`,
    `--nsFrom=${sourceDb}.*`,
    `--nsTo=${targetDb}.*`,
    "--drop",
  ],
  { stdio: "inherit" },
);
execFileSync("docker", ["exec", container, "rm", "-f", inContainer]);
console.log(`[db:restore-local] Done. Browse it in the container: use ${targetDb}`);
