import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { env } from "../config/env.js";

// Local development uses the Azurite connection string; Azure will use the
// app's managed identity (plan phase 3), which is why the account name is a
// separate setting. Public URLs are derived, never stored, so moving the
// account or putting a CDN in front is a config change.
let containerPromise: Promise<ContainerClient> | undefined;

const createContainerClient = async (): Promise<ContainerClient> => {
  let service: BlobServiceClient;

  if (env.AZURE_STORAGE_CONNECTION_STRING) {
    service = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
  } else if (env.AZURE_STORAGE_ACCOUNT) {
    // Imported lazily so local runs never need the identity package loaded.
    const { DefaultAzureCredential } = await import("@azure/identity");
    service = new BlobServiceClient(
      `https://${env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
      new DefaultAzureCredential(),
    );
  } else {
    throw new Error(
      "Media storage is not configured: set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT",
    );
  }

  const container = service.getContainerClient(env.AZURE_STORAGE_CONTAINER);
  await container.createIfNotExists({ access: "blob" });
  return container;
};

export const getMediaContainer = (): Promise<ContainerClient> => {
  containerPromise ??= createContainerClient();
  return containerPromise;
};

export const uploadMediaBlob = async (
  blobPath: string,
  data: Buffer,
  contentType: string,
  sha256: string,
): Promise<void> => {
  const container = await getMediaContainer();
  await container.getBlockBlobClient(blobPath).uploadData(data, {
    blobHTTPHeaders: {
      blobContentType: contentType,
      blobCacheControl: "public, max-age=86400",
    },
    metadata: { sha256 },
  });
};

export const deleteMediaBlob = async (blobPath: string): Promise<void> => {
  const container = await getMediaContainer();
  await container.getBlockBlobClient(blobPath).deleteIfExists();
};

/** Public URL for a stored file, derived from configuration. */
export const mediaUrl = (blobPath: string): string => {
  if (env.MEDIA_PUBLIC_BASE_URL) {
    return `${env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "")}/${blobPath}`;
  }

  if (env.AZURE_STORAGE_ACCOUNT) {
    return `https://${env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${env.AZURE_STORAGE_CONTAINER}/${blobPath}`;
  }

  // Azurite's well-known development account.
  return `http://127.0.0.1:10000/devstoreaccount1/${env.AZURE_STORAGE_CONTAINER}/${blobPath}`;
};
