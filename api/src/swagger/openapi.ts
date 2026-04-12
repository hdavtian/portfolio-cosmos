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
    "/api/v1/content": {
      get: {
        tags: ["Content"],
        summary: "Get all active content documents",
        responses: {
          "200": { description: "Content returned" },
        },
      },
    },
    "/api/v1/content/{key}": {
      get: {
        tags: ["Content"],
        summary: "Get a content document by key",
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            description: "Content document key",
            example: "resume",
            schema: {
              type: "string",
              enum: [
                "resume",
                "portfolio-cores",
                "about-deck",
                "about-hall-levels",
                "about-hall-slides",
                "about-path-travel-messages",
                "cosmic-narrative",
                "about-content",
                "legacy-websites",
                "moon-portfolio-mapping",
              ],
            },
          },
        ],
        responses: {
          "200": { description: "Content returned" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/content/resume": {
      get: {
        tags: ["Content"],
        summary: "Resume content",
        responses: {
          "200": { description: "Resume document returned" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/content/portfolio-cores": {
      get: {
        tags: ["Content"],
        summary: "Portfolio cores content",
        responses: {
          "200": { description: "Portfolio cores document returned" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/content/about-deck": {
      get: {
        tags: ["Content"],
        summary: "About deck content",
        responses: {
          "200": { description: "About deck document returned" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/content/about-hall-levels": {
      get: {
        tags: ["Content"],
        summary: "About hall levels content",
        responses: {
          "200": { description: "About hall levels document returned" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/content/about-hall-slides": {
      get: {
        tags: ["Content"],
        summary: "About hall slides content",
        responses: {
          "200": { description: "About hall slides document returned" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/content/about-path-travel-messages": {
      get: {
        tags: ["Content"],
        summary: "About path travel messages",
        responses: {
          "200": { description: "About path travel messages document returned" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/content/cosmic-narrative": {
      get: {
        tags: ["Content"],
        summary: "Cosmic narrative content",
        responses: {
          "200": { description: "Cosmic narrative document returned" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/content/about-content": {
      get: {
        tags: ["Content"],
        summary: "About content document",
        responses: {
          "200": { description: "About content document returned" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/content/legacy-websites": {
      get: {
        tags: ["Content"],
        summary: "Legacy websites document",
        responses: {
          "200": { description: "Legacy websites document returned" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/content/moon-portfolio-mapping": {
      get: {
        tags: ["Content"],
        summary: "Moon portfolio mapping document",
        responses: {
          "200": { description: "Moon portfolio mapping document returned" },
          "404": { description: "Not found" },
        },
      },
    },
  },
} as const;
