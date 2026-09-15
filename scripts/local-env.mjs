// Environment for local development against the Docker services.
// These values are injected into child processes and take precedence over
// api/.env (dotenv never overrides variables that are already set), so local
// runs cannot reach production Atlas even if api/.env holds its URI.

export const LOCAL_API_PORT = 8080;

// Azurite's published well-known development account.
const AZURITE_BLOB_CONNECTION_STRING =
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
  "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";

export const localApiEnv = {
  NODE_ENV: "development",
  PORT: String(LOCAL_API_PORT),
  MONGODB_URI: "mongodb://127.0.0.1:27017",
  MONGODB_DB_NAME: "resume_cosmos_local",
  FRONTEND_ORIGIN: "http://localhost:5173",
  AZURE_STORAGE_CONNECTION_STRING: AZURITE_BLOB_CONNECTION_STRING,
  AZURE_STORAGE_CONTAINER: "media",
};

export const localWebEnv = {
  VITE_API_BASE_URL: `http://localhost:${LOCAL_API_PORT}`,
};
