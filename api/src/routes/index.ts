import { Router } from "express";
import mongoose from "mongoose";
import swaggerUi from "swagger-ui-express";
import { ContentController } from "../modules/content/content.controller.js";
import { ContentRepository } from "../modules/content/content.repository.js";
import { ContentService } from "../modules/content/content.service.js";
import { buildOpenApiDocument } from "../swagger/buildOpenApi.js";

// Generated from the Zod schemas that validate the requests, so the docs
// cannot drift from the implementation. Built once at startup.
const openApiDocument = buildOpenApiDocument();

const contentRepository = new ContentRepository();
const contentService = new ContentService(contentRepository);
const contentController = new ContentController(contentService);

export const apiRouter = Router();

apiRouter.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "scrolling-resume-api",
    mongoReadyState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get("/swagger/v1/swagger.json", (_req, res) => {
  res.status(200).json(openApiDocument);
});
apiRouter.get("/openapi.json", (_req, res) => {
  res.status(200).json(openApiDocument);
});

// Override Swagger UI's default initializer to prevent external petstore/validator requests.
apiRouter.get("/swagger/swagger-initializer.js", (_req, res) => {
  res.type("application/javascript").send(`window.onload = function() {
  window.ui = SwaggerUIBundle({
    url: "/openapi.json",
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    plugins: [
      SwaggerUIBundle.plugins.DownloadUrl
    ],
    validatorUrl: null,
    layout: "StandaloneLayout"
  });
};`);
});

apiRouter.use(
  "/swagger",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    swaggerOptions: {
      url: "/openapi.json",
      validatorUrl: null,
    },
  }),
);

// v1 is reduced to the only route the site actually calls
// (src/lib/api/contentClient.ts requests /api/v1/content/{key}), and only for
// the keys still in use. The listing route and the ten per-key routes were
// never requested by either experience. v1 is replaced by v2 in plan phase 2
// and removed once the Three.js retrofit lands.
apiRouter.get("/api/v1/content/:key", contentController.getByKey);
