export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Harmadavtian Cosmos Content API",
    version: "1.0.0",
    description:
      "Express + MongoDB Atlas API for serving resume/cosmos content documents used by the scrolling resume project.",
  },
  servers: [{ url: "/", description: "Current server" }],
  tags: [
    { name: "Health", description: "Health and liveness" },
    { name: "Content", description: "Cosmos content document endpoints" },
  ],
  paths: {
    "/healthz": {
      get: {
        tags: ["Health"],
        summary: "Service health check",
        responses: {
          "200": {
            description: "Service is healthy",
          },
        },
      },
    },
    "/api/v1/content/{key}": {
      get: {
        tags: ["Content"],
        summary: "Get a content document by key (legacy; replaced by v2)",
        description:
          "Serves only the keys the site still requests. Every other key returns 404.",
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            description: "Content document key",
            example: "resume",
            schema: {
              type: "string",
              enum: ["resume", "portfolio-cores"],
            },
          },
        ],
        responses: {
          "200": { description: "Content returned" },
          "404": { description: "Not found or retired key" },
        },
      },
    },
  },
} as const;
