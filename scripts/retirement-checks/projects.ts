// Proves the project list built from the release equals the one the old
// translation + flattening produced, item for item and in the same order.
//   npx tsx scripts/retirement-checks/projects.ts [release.json]
import { readFileSync } from "node:fs";
import path from "node:path";
import { toLegacy } from "../../packages/content-schema/src/legacy/toLegacy.ts";
import { toRelease } from "../../src/lib/api/release.ts";
import { portfolioItemsFromRelease } from "../../src/features/fast/lib/portfolioTransform.ts";
import { flattenPortfolioCores } from "./portfolioTransform.old.ts";

const file = process.argv[2] ?? "baselines/stage1/release-2.json";
const response = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8"));
const legacy = toLegacy(response.content, (id: string) => response.media[id]?.url ?? "") as any;

const before = flattenPortfolioCores(legacy.portfolioCores);
const after = portfolioItemsFromRelease(toRelease(response));
const norm = (value: unknown) => JSON.stringify(value, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));

let bad = 0;
if (before.length !== after.length) { bad++; console.log(`count: ${before.length} before, ${after.length} after`); }
before.forEach((item, index) => {
  if (norm(item) !== norm(after[index])) {
    bad++;
    console.log(`#${index} ${item.id} differs from ${after[index]?.id}`);
    for (const key of Object.keys(item) as Array<keyof typeof item>)
      if (norm(item[key]) !== norm(after[index]?.[key])) console.log(`   ${key}: ${norm(item[key])?.slice(0, 140)}\n   → ${norm(after[index]?.[key])?.slice(0, 140)}`);
  }
});
console.log(bad === 0 ? `OK: ${after.length} projects identical, same order` : `${bad} differences`);
process.exit(bad === 0 ? 0 : 1);
