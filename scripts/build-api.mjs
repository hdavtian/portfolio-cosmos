// Builds the API into one ESM file, dist/server.js.
//
// The API imports the workspace package @hd/content-schema, which ships as
// TypeScript source (its exports point at .ts files). Plain `tsc` output kept
// those imports, so Node in Azure could not load them and the deploy package
// (which leaves @hd/* out) would crash on startup. esbuild inlines workspace
// packages and keeps every real npm dependency external, installed from the
// lockfile by make-api-deploy.
//
//   npm run build -w api   (typechecks with tsc first)
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const apiDir = path.resolve(import.meta.dirname, "..", "api");
const apiPackage = JSON.parse(readFileSync(path.join(apiDir, "package.json"), "utf8"));
const external = Object.keys(apiPackage.dependencies ?? {}).filter((name) => !name.startsWith("@hd/"));

rmSync(path.join(apiDir, "dist"), { recursive: true, force: true });

await build({
  entryPoints: [path.join(apiDir, "src", "server.ts")],
  outfile: path.join(apiDir, "dist", "server.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  // Subpath imports of external packages (e.g. "zod/v4") stay external too.
  external: [...external, ...external.map((name) => `${name}/*`)],
  logLevel: "info",
});
