// Assembles a standalone API deploy folder (default: api-deploy/).
//
// With npm workspaces, dependencies are hoisted to the repo root, so the api/
// folder no longer carries a complete node_modules. This copies the built API,
// writes a production-only package.json, and copies the root lockfile so the
// following `npm install --omit=dev` resolves the exact locked versions.
//
//   npm run build -w api
//   node scripts/make-api-deploy.mjs [outDir]
//   cd api-deploy && npm install --omit=dev --ignore-scripts
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const outDir = path.resolve(rootDir, process.argv[2] ?? "api-deploy");
const apiDir = path.join(rootDir, "api");

if (!existsSync(path.join(apiDir, "dist", "server.js"))) {
  console.error("[make-api-deploy] api/dist/server.js not found. Run `npm run build -w api` first.");
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(path.join(apiDir, "dist"), path.join(outDir, "dist"), { recursive: true });
cpSync(path.join(rootDir, "package-lock.json"), path.join(outDir, "package-lock.json"));

const apiPackage = JSON.parse(readFileSync(path.join(apiDir, "package.json"), "utf8"));

// Workspace packages are bundled into dist at build time, never installed.
const dependencies = Object.fromEntries(
  Object.entries(apiPackage.dependencies ?? {}).filter(([name]) => !name.startsWith("@hd/")),
);

const deployPackage = {
  name: apiPackage.name,
  version: apiPackage.version,
  private: true,
  type: apiPackage.type,
  engines: apiPackage.engines,
  scripts: { start: apiPackage.scripts.start },
  dependencies,
};

writeFileSync(path.join(outDir, "package.json"), `${JSON.stringify(deployPackage, null, 2)}\n`);

console.log(`[make-api-deploy] Wrote ${path.relative(rootDir, outDir)} (${Object.keys(dependencies).length} dependencies)`);
