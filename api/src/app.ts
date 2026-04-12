import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN ?? true,
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("combined"));

  app.use(apiRouter);

  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found" });
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message = err instanceof Error ? err.message : "Unexpected error";
      res.status(500).json({ message });
    },
  );

  return app;
};
