import { BlobServiceClient } from "@azure/storage-blob";
import { env } from "../config/env.js";

// Lets the 3D site load media from local Azurite. Three.js requests textures
// cross-origin, and Azurite sends no CORS headers until the blob service is
// told to, so every texture failed while plain <img> tags still worked.
// Azurite keeps this setting in its data folder, so run it once per data reset.
// The Azure storage account gets its CORS rules from infrastructure (phase 3).

const connectionString = env.AZURE_STORAGE_CONNECTION_STRING;
if (!connectionString || !/devstoreaccount1|UseDevelopmentStorage/i.test(connectionString)) {
  console.error("Refusing to run: AZURE_STORAGE_CONNECTION_STRING must point at local Azurite.");
  process.exit(1);
}

const service = BlobServiceClient.fromConnectionString(connectionString);
const properties = await service.getProperties();

await service.setProperties({
  ...properties,
  cors: [
    {
      allowedOrigins: "*",
      allowedMethods: "GET,HEAD,OPTIONS",
      allowedHeaders: "*",
      exposedHeaders: "*",
      maxAgeInSeconds: 3600,
    },
  ],
});

console.log("Azurite blob CORS now allows GET/HEAD from any origin.");
