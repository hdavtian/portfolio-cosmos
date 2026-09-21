// Proves the 3D site builds the same scene models from stored field names as
// it did from the old nested shapes: the portfolio cores and their cards, each
// job moon's project tabs, and the jobs, skills, slides and messages.
//   npx tsx scripts/retirement-checks/space.ts [release.json]
import { readFileSync } from "node:fs";
import path from "node:path";
import { toRelease } from "../../src/lib/api/release.ts";
import { spaceContentFromRelease } from "../../src/components/cosmos/spaceContent.ts";
import { buildPortfolioRegistryModel } from "../../src/components/cosmos/portfolioData.ts";
import { buildMoonPortfolioPayload } from "../../src/components/cosmos/moonPortfolioSelector.ts";
import { spaceContentFromRelease as oldContent } from "./old/spaceContent.ts";
import { buildPortfolioRegistryModel as oldRegistry } from "./old/portfolioData.ts";
import { buildMoonPortfolioPayload as oldMoonPayload } from "./old/moonPortfolioSelector.ts";

const file = process.argv[2] ?? "baselines/stage1/release-2.json";
const response = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8"));
const release = toRelease(response);
const before = oldContent(release) as any;
const after = spaceContentFromRelease(release);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// For the scene's own models the order of an object's keys carries no meaning.
const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]))
      : value;
const renamed = (job: any) => {
  const { slug, sortOrder, projects, ...rest } = job;
  return JSON.stringify({ ...rest, id: slug, projects: projects.map((p: any) => ({ id: p.slug, title: p.title, summary: p.summary })) }, Object.keys({ ...rest, id: 1, projects: 1 }).sort());
};
const oldJob = (job: any) => {
  const { Projects, ...rest } = job;
  return JSON.stringify({ ...rest, projects: Projects ?? [] }, Object.keys({ ...rest, projects: 1 }).sort());
};

const parts: Array<[string, boolean]> = [
  ["portfolio cores, groups and cards (scene model)", same(sorted(oldRegistry(before.portfolioCores)), sorted(buildPortfolioRegistryModel(after.portfolioCores)))],
  ...after.resume.experience.map((job): [string, boolean] => [
    `moon projects: ${job.slug}`,
    same(
      oldMoonPayload({ companyId: job.slug, companyName: job.company, coreSeeds: before.portfolioCores, mappings: before.moonPortfolioMapping }),
      buildMoonPortfolioPayload({ companyId: job.slug, companyName: job.company, coreSeeds: after.portfolioCores, mappings: after.moonPortfolioMapping }),
    ),
  ]),
  ["jobs (id→slug, Projects→projects, otherwise equal)", same(before.resume.experience.map(oldJob), after.resume.experience.map(renamed))],
  ["skills", same(before.resume.skills, after.resume.skills)],
  ["profile, education, links, certifications", same([before.resume.personal, before.resume.education, before.resume.links, before.resume.certifications], [after.resume.personal, after.resume.education, after.resume.links, after.resume.certifications])],
  ["about slides (blocks and timing)", same(before.aboutSlides.map(({ id, ...s }: any) => s), after.aboutSlides.map(({ slug, sortOrder, ...s }: any) => s))],
  ["ride messages (text and style)", same(before.aboutPathTravelMessages.map(({ id, ...m }: any) => m), after.aboutPathTravelMessages.map(({ slug, sortOrder, ...m }: any) => m))],
];
let bad = 0;
for (const [name, ok] of parts) { if (!ok) bad++; console.log(`${ok ? "same  " : "DIFFER"} ${name}`); }
console.log(bad === 0 ? "OK: the 3D site builds identical scene models" : `${bad} parts differ`);
process.exit(bad === 0 ? 0 : 1);
