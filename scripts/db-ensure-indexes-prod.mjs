// Creates the content indexes (unique slugs, one current release, unique media
// paths) on production Atlas. The same definitions as api/src/v2/indexes.ts,
// which runs during `db:import` locally; a restore from a local dump may not
// carry them all. Idempotent.
//   npm run db:ensure-indexes-prod
import { spawnSync } from "node:child_process";
import { productionMongo } from "./lib/production.mjs";

const { uri, dbName, host } = productionMongo("db:ensure-indexes-prod");

const collections = [
  "education", "certifications", "links", "technologies", "experiences",
  "portfolioCores", "portfolioEntries", "moonPortfolioMappings", "aboutDeckSlides", "pathTravelMessages",
  "guidedTours", "cosmosPlanets",
];

const script = `
const d = db.getSiblingDB(${JSON.stringify(dbName)});
const existing = new Set(d.getCollectionNames());
for (const name of ${JSON.stringify(collections)}) {
  if (!existing.has(name)) continue;
  d.getCollection(name).createIndex({ slug: 1 }, { unique: true });
  d.getCollection(name).createIndex({ sortOrder: 1 });
}
d.singletons.createIndex({ key: 1 }, { unique: true });
d.releases.createIndex({ id: 1 }, { unique: true });
d.releases.createIndex({ current: 1 }, { unique: true, partialFilterExpression: { current: true } });
d.media.createIndex({ blobPath: 1 }, { unique: true });
d.media.createIndex({ sourcePath: 1 }, { unique: true, partialFilterExpression: { sourcePath: { $type: "string" } } });
print("releases: " + d.releases.getIndexes().map((i) => i.name).join(", "));
print("media: " + d.media.getIndexes().map((i) => i.name).join(", "));
`;

console.log(`[db:ensure-indexes-prod] Ensuring indexes on ${dbName} at ${host}`);
const result = spawnSync(
  "docker",
  ["run", "--rm", "-e", "MONGOSH_URI", "-e", "MONGOSH_SCRIPT", "mongo:8.0", "sh", "-c", 'mongosh --quiet "$MONGOSH_URI" --eval "$MONGOSH_SCRIPT"'],
  { stdio: "inherit", env: { ...process.env, MONGOSH_URI: uri, MONGOSH_SCRIPT: script } },
);
process.exit(result.status ?? 1);
