import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";
import express, { type Express } from "express";
import type { Db } from "./db/index";
import type { AppDeps } from "./deps";
import { EpicClient } from "./epic/client";
import { errorHandler, notFoundHandler } from "./errors";
import { logger as defaultLogger, type Logger } from "./logger";
import { appointmentsRouter } from "./routes/appointments";
import { clinicsRouter } from "./routes/clinics";
import { metricsRouter } from "./routes/metrics";
import { providersRouter } from "./routes/providers";
import { visitsRouter } from "./routes/visits";

export interface CreateAppOptions {
  db: Db;
  logger?: Logger;
  epic?: EpicClient;
  now?: () => Date;
}

export function createApp(options: CreateAppOptions): { app: Express; deps: AppDeps } {
  const logger = options.logger ?? defaultLogger;
  const deps: AppDeps = {
    db: options.db,
    logger,
    epic: options.epic ?? new EpicClient({ logger }),
    now: options.now ?? (() => new Date()),
  };
  const httpLog = logger.child({ component: "http" });

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use((req, res, next) => {
    const incoming = req.header("x-request-id");
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    const started = process.hrtime.bigint();
    // req.path is router-relative once a mounted router handles the request.
    const path = req.originalUrl.split("?")[0];
    res.on("finish", () => {
      httpLog.info("request", {
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
      });
    });
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/clinics", clinicsRouter(deps));
  app.use("/providers", providersRouter(deps));
  app.use("/appointments", appointmentsRouter(deps));
  app.use("/visits", visitsRouter(deps));
  app.use("/metrics", metricsRouter(deps));

  if (Sentry.isInitialized()) Sentry.setupExpressErrorHandler(app);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return { app, deps };
}
