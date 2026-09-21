// Proves the 3D site's content built from the release equals what the old
// translation gave it, field for field and in the same order.
//   npx tsx scripts/retirement-checks/space.ts [release.json]
import { readFileSync } from "node:fs";
import path from "node:path";
import { toLegacy } from "../../packages/content-schema/src/legacy/toLegacy.ts";
import { toRelease } from "../../src/lib/api/release.ts";
import { spaceContentFromRelease } from "../../src/components/cosmos/spaceContent.ts";

const file = process.argv[2] ?? "baselines/stage1/release-2.json";
const response = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8"));
const before = toLegacy(response.content, (id: string) => response.media[id]?.url ?? "") as any;
const after = spaceContentFromRelease(toRelease(response)) as any;

// Key order matters to the scene in places (skills by category), so compare as written.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const parts: Array<[string, unknown, unknown]> = [
  ["resume.personal", before.resume.personal, after.resume.personal],
  ["resume.summary", before.resume.summary, after.resume.summary],
  ["resume.skills", before.resume.skills, after.resume.skills],
  ["resume.experience", before.resume.experience, after.resume.experience],
  ["resume.education", before.resume.education, after.resume.education],
  ["resume.links", before.resume.links, after.resume.links],
  ["resume.certifications", before.resume.certifications, after.resume.certifications],
  ["portfolioCores", before.portfolioCores, after.portfolioCores],
  ["moonPortfolioMapping", before.moonPortfolioMapping, after.moonPortfolioMapping],
  ["aboutPathTravelMessages", before.aboutPathTravelMessages, after.aboutPathTravelMessages],
  ["aboutSlides", before.aboutDeck.aboutDeck.slides, after.aboutSlides],
];
let bad = 0;
for (const [name, a, b] of parts) {
  const ok = same(a, b);
  if (!ok) bad++;
  console.log(`${ok ? "same  " : "DIFFER"} ${name}`);
  if (!ok) console.log(`   before ${JSON.stringify(a)?.slice(0, 300)}\n   after  ${JSON.stringify(b)?.slice(0, 300)}`);
}
console.log(bad === 0 ? "OK: the 3D site receives identical content" : `${bad} parts differ`);
process.exit(bad === 0 ? 0 : 1);
