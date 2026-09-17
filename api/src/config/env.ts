import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(8080),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    MONGODB_DB_NAME: z.string().min(1).default("resume_cosmos"),
    FRONTEND_ORIGIN: z.string().url().optional(),
    // Comma-separated allowlist for credentialed admin requests.
    CORS_ORIGINS: z.string().optional(),

    // The admin SPA is served on this hostname from ADMIN_DIST_DIR (the deploy
    // package puts the build in admin/ next to dist/). Unset or missing build:
    // the app serves only the API.
    ADMIN_HOST: z.string().min(1).default("portfolio-admin.harmadavtian.com"),
    ADMIN_DIST_DIR: z.string().min(1).optional(),

    // Shared sign-on (hd_session). Generated centrally by
    // C:\sites\shared-login-for-personal-apps (`npm run creds:set`) for
    // production; local development uses its own throwaway values.
    AUTH_PASSWORD_HASH: z.string().min(1).optional(),
    AUTH_COOKIE_SECRET: z.string().min(32).optional(),
    AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),
    AUTH_SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 30),

    // Media storage: Azurite connection string locally; account name plus
    // managed identity in Azure (plan phase 3).
    AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
    AZURE_STORAGE_ACCOUNT: z.string().optional(),
    AZURE_STORAGE_CONTAINER: z.string().min(1).default("media"),
    MEDIA_PUBLIC_BASE_URL: z.string().url().optional(),
  })
  // Never fall back to a default secret in production: fail to start instead.
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;

    for (const key of ["AUTH_PASSWORD_HASH", "AUTH_COOKIE_SECRET"] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid API environment configuration:\n${issues}`);
}

export const env = parsed.data;
