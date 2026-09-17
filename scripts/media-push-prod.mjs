// Copies media binaries from local Azurite to the production storage account.
//   npm run media:push-prod -- --yes
//
// Signs in to production with your Azure CLI login (needs Storage Blob Data
// Contributor on sthdsharedprod), after the subscription guard. Copies only
// blobs that are missing or differ (size or MD5), keeps content types and
// cache headers, and never deletes anything in production.
import { createRequire } from "node:module";
import path from "node:path";
import { runAzGuard, rootDir } from "./lib/production.mjs";

// Resolve the SDKs from the API workspace's dependencies.
const require = createRequire(path.join(rootDir, "api", "package.json"));
const { BlobServiceClient } = require("@azure/storage-blob");
const { AzureCliCredential } = require("@azure/identity");

const PROD_ACCOUNT = "sthdsharedprod";
const CONTAINER = "media";
const PREFIX = "scrolling-resume/";
const AZURITE =
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
  "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";

if (!process.argv.includes("--yes")) {
  console.error("[media:push-prod] This uploads to production storage. Re-run with --yes to confirm.");
  process.exit(1);
}

runAzGuard();

const local = BlobServiceClient.fromConnectionString(AZURITE).getContainerClient(CONTAINER);
const prod = new BlobServiceClient(`https://${PROD_ACCOUNT}.blob.core.windows.net`, new AzureCliCredential()).getContainerClient(
  CONTAINER,
);

const sameBytes = (a, b) =>
  a.contentLength === b.contentLength &&
  (!a.contentMD5 || !b.contentMD5 || Buffer.compare(Buffer.from(a.contentMD5), Buffer.from(b.contentMD5)) === 0);

let copied = 0;
let unchanged = 0;
for await (const item of local.listBlobsFlat({ prefix: PREFIX, includeMetadata: true })) {
  const target = prod.getBlockBlobClient(item.name);
  const existing = await target.getProperties().catch((error) => (error.statusCode === 404 ? null : Promise.reject(error)));
  if (existing && sameBytes(existing, item.properties)) {
    unchanged += 1;
    continue;
  }
  const body = await local.getBlobClient(item.name).downloadToBuffer();
  await target.uploadData(body, {
    blobHTTPHeaders: {
      blobContentType: item.properties.contentType,
      blobCacheControl: item.properties.cacheControl,
      blobContentMD5: item.properties.contentMD5,
    },
    metadata: item.metadata,
  });
  copied += 1;
  if (copied % 25 === 0) console.log(`[media:push-prod] ${copied} copied...`);
}

console.log(`[media:push-prod] Done: ${copied} copied, ${unchanged} already up to date.`);
