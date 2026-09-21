// Downloads production media binaries to media-backups/<timestamp>/ (read-only
// on Azure: lists and downloads, never writes or deletes).
//   npm run media:pull
//
// Signs in with your Azure CLI login after the subscription guard. Only this
// site's prefix in the shared storage account is read. A manifest.json records
// each blob's size, content type and MD5. Backups are kept; retention is
// managed by hand.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runAzGuard, rootDir } from "./lib/production.mjs";

// Resolve the SDKs from the API workspace's dependencies.
const require = createRequire(path.join(rootDir, "api", "package.json"));
const { BlobServiceClient } = require("@azure/storage-blob");
const { AzureCliCredential } = require("@azure/identity");

const PROD_ACCOUNT = "sthdsharedprod";
const CONTAINER = "media";
const PREFIX = "scrolling-resume/";

runAzGuard();

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(rootDir, "media-backups", `prod-${stamp}`);
mkdirSync(target, { recursive: true });

const container = new BlobServiceClient(
  `https://${PROD_ACCOUNT}.blob.core.windows.net`,
  new AzureCliCredential(),
).getContainerClient(CONTAINER);

const manifest = [];
let bytes = 0;
for await (const blob of container.listBlobsFlat({ prefix: PREFIX })) {
  const file = path.join(target, ...blob.name.split("/"));
  mkdirSync(path.dirname(file), { recursive: true });
  await container.getBlobClient(blob.name).downloadToFile(file);
  bytes += blob.properties.contentLength ?? 0;
  manifest.push({
    name: blob.name,
    size: blob.properties.contentLength,
    contentType: blob.properties.contentType,
    cacheControl: blob.properties.cacheControl,
    md5: blob.properties.contentMD5 ? Buffer.from(blob.properties.contentMD5).toString("base64") : null,
  });
  if (manifest.length % 50 === 0) console.log(`[media:pull] ${manifest.length} files…`);
}
writeFileSync(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`[media:pull] Done: ${manifest.length} files, ${(bytes / 1048576).toFixed(1)} MB -> media-backups/prod-${stamp}`);
