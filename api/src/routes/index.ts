import { Router } from "express";
import mongoose from "mongoose";
import swaggerUi from "swagger-ui-express";
import { ContentController } from "../modules/content/content.controller.js";
import { ContentRepository } from "../modules/content/content.repository.js";
import { ContentService } from "../modules/content/content.service.js";
import { openApiDocument } from "../swagger/openapi.js";

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

apiRouter.get("/api/v1/content", contentController.getAll);
apiRouter.get("/api/v1/content/:key", contentController.getByKey);
apiRouter.get(
  "/api/v1/content/resume",
  contentController.getByKnownKey("resume"),
);
apiRouter.get(
  "/api/v1/content/portfolio-cores",
  contentController.getByKnownKey("portfolio-cores"),
);
apiRouter.get(
  "/api/v1/content/about-deck",
  contentController.getByKnownKey("about-deck"),
);
apiRouter.get(
  "/api/v1/content/about-hall-levels",
  contentController.getByKnownKey("about-hall-levels"),
);
apiRouter.get(
  "/api/v1/content/about-hall-slides",
  contentController.getByKnownKey("about-hall-slides"),
);
apiRouter.get(
  "/api/v1/content/about-path-travel-messages",
  contentController.getByKnownKey("about-path-travel-messages"),
);
apiRouter.get(
  "/api/v1/content/cosmic-narrative",
  contentController.getByKnownKey("cosmic-narrative"),
);
apiRouter.get(
  "/api/v1/content/about-content",
  contentController.getByKnownKey("about-content"),
);
apiRouter.get(
  "/api/v1/content/legacy-websites",
  contentController.getByKnownKey("legacy-websites"),
);
apiRouter.get(
  "/api/v1/content/moon-portfolio-mapping",
  contentController.getByKnownKey("moon-portfolio-mapping"),
);
