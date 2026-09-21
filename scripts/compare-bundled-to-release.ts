// Compares the content bundled in src/data with the published release, in the
// old file shapes, so we know what a site would change when it stops reading a
// bundled file and reads the API instead.
//   npx tsx scripts/compare-bundled-to-release.ts [release.json]
import { readFileSync } from "node:fs";
import path from "node:path";
import { toLegacy } from "../packages/content-schema/src/legacy/toLegacy.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const release = read(process.argv[2] ?? "baselines/stage1/release.json");
const legacy = toLegacy(release.content, (id: string) => release.media[id]?.url ?? "") as Record<string, any>;

const differences: string[] = [];
const walk = (where: string, file: unknown, api: unknown) => {
  if (JSON.stringify(file) === JSON.stringify(api)) return;
  if (Array.isArray(file) && Array.isArray(api)) {
    if (file.length !== api.length) differences.push(`${where}: ${file.length} in file, ${api.length} in API`);
    const keyOf = (item: any) => item?.id ?? item?.title ?? item?.label ?? item?.name;
    file.forEach((item, index) => {
      const key = keyOf(item);
      const match = key === undefined ? api[index] : api.find((other: any) => keyOf(other) === key);
      if (match === undefined) differences.push(`${where}[${key ?? index}]: only in file`);
      else walk(`${where}[${key ?? index}]`, item, match);
    });
    api.forEach((item: any, index: number) => {
      const key = keyOf(item);
      if (key !== undefined && !file.some((other: any) => keyOf(other) === key)) differences.push(`${where}[${key}]: only in API`);
      else if (key !== undefined && keyOf(file[index]) !== key && file.some((other: any) => keyOf(other) === key))
        differences.push(`${where}[${key}]: position ${file.findIndex((other: any) => keyOf(other) === key)} in file, ${index} in API`);
    });
    return;
  }
  if (file && api && typeof file === "object" && typeof api === "object") {
    for (const key of new Set([...Object.keys(file as object), ...Object.keys(api as object)]))
      walk(`${where}.${key}`, (file as any)[key], (api as any)[key]);
    return;
  }
  const show = (value: unknown) => (value === undefined ? "(missing)" : JSON.stringify(value)?.slice(0, 90));
  differences.push(`${where}: file ${show(file)} | API ${show(api)}`);
};

walk("resume", read("src/data/resume.json"), legacy.resume);
walk("aboutDeck", read("src/data/aboutDeck.json"), legacy.aboutDeck);
walk("portfolioCores", read("src/data/portfolioCores.json"), legacy.portfolioCores);
walk("travelMessages", read("src/data/aboutPathTravelMessages.json"), legacy.aboutPathTravelMessages);

console.log(`release ${release.etag}`);
console.log(differences.length === 0 ? "No differences." : differences.join("\n"));
console.log(`\n${differences.length} differences`);
