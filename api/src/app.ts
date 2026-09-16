import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { createAuthRoutes, type AuthConfig } from "./auth/authRoutes.js";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { createAdminRouter } from "./v2/adminRouter.js";
import { createContentRouter } from "./v2/contentRouter.js";
import { errorHandler } from "./v2/http.js";

// Credentialed requests come from the admin (same origin as the API once
// portfolio-admin.harmadavtian.com serves it) and from local development.
const corsOrigins = (): string[] => {
  const configured = [
    ...(env.CORS_ORIGINS?.split(",") ?? []),
    env.FRONTEND_ORIGIN ?? "",
    "http://localhost:5173",
  ];

  return [...new Set(configured.map((origin) => origin.trim()).filter(Boolean))];
};

export const authConfig = (): AuthConfig => ({
  passwordHash: env.AUTH_PASSWORD_HASH ?? "",
  cookieSecret: env.AUTH_COOKIE_SECRET ?? "",
  cookieDomain: env.AUTH_COOKIE_DOMAIN,
  sessionTtlSeconds: env.AUTH_SESSION_TTL_SECONDS,
  secureCookie: env.NODE_ENV === "production",
});

export const createApp = () => {
  const app = express();

  // Behind App Service's proxy; needed for request.ip and secure cookies.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins(),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  // Correlates log lines with the error envelope returned to the client.
  app.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  app.use(morgan("combined"));

  app.use(createAuthRoutes({ auth: authConfig() }));
  app.use(apiRouter);
  // Public content (current release), with draft preview for a signed-in admin.
  app.use("/api/v2/content", createContentRouter({ cookieSecret: env.AUTH_COOKIE_SECRET ?? "" }));
  app.use("/api/v2/admin", createAdminRouter({ cookieSecret: env.AUTH_COOKIE_SECRET ?? "" }));

  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found" });
  });

  // Renders ApiError as the shared { error: { code, message, details, requestId } }
  // envelope; anything else becomes a 500 with the request id for log lookup.
  app.use(errorHandler);

  return app;
};
