// Writes src/data/release.fallback.json: the published release as the API
// serves it, for the sites to show if the API can't be reached (only when the
// build sets VITE_CONTENT_FALLBACK=on). Generated, never edited by hand.
// The site deploy (.github/workflows/deploy.yml) runs it against the
// production API before every build, so the shipped copy is the release live
// at deploy time; the committed copy only keeps local builds working.
//   npm run content:fallback                      from the local API
//   npm run content:fallback -- https://api.host  from another API
import { writeFileSync } from "node:fs";
import path from "node:path";

const base = (process.argv[2] || "http://localhost:8080").replace(/\/$/, "");
const response = await fetch(`${base}/api/v2/content/release`).catch((error) => {
  console.error(`[content:fallback] could not reach ${base}: ${error.message}`);
  process.exit(1);
});
if (!response.ok) {
  console.error(`[content:fallback] ${base} returned ${response.status}`);
  process.exit(1);
}
const release = await response.json();
const target = path.resolve(import.meta.dirname, "../src/data/release.fallback.json");
writeFileSync(target, JSON.stringify(release, null, 2) + "\n");
console.log(`[content:fallback] Wrote release ${release.etag.slice(0, 8)} (${(JSON.stringify(release).length / 1024).toFixed(0)} KB) -> src/data/release.fallback.json`);
