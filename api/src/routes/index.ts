import { Router } from "express";
import mongoose from "mongoose";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "../swagger/buildOpenApi.js";

// Generated from the Zod schemas that validate the requests, so the docs
// cannot drift from the implementation. Built once at startup.
const openApiDocument = buildOpenApiDocument();


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

