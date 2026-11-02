import "./instrument";
import * as Sentry from "@sentry/node";
import { createApp } from "./app";
import { DEFAULT_DB_PATH, openDb } from "./db/index";
import { logger } from "./logger";

const port = Number(process.env.PORT ?? 3000);
const db = openDb(DEFAULT_DB_PATH);
const { app } = createApp({ db, logger });

const server = app.listen(port, () => {
  logger.info("server started", { port, dbPath: DEFAULT_DB_PATH });
});

function shutdown(signal: string) {
  logger.info("shutting down", { signal });
  server.close(() => {
    db.close();
    if (Sentry.isInitialized()) {
      void Sentry.close(2_000).catch(() => undefined).finally(() => process.exit(0));
      return;
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
