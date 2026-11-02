import "../src/instrument";
import * as Sentry from "@sentry/node";
import { logger } from "../src/logger";

if (!Sentry.isInitialized()) {
  logger.error("Sentry test event not sent", { reason: "SENTRY_DSN is required" });
  process.exitCode = 1;
} else {
  const eventId = Sentry.captureException(new Error("Synthetic Sentry test event for meridian-scheduling"));
  const flushed = await Sentry.flush(5_000);
  if (flushed) {
    logger.info("Sentry test event sent", { eventId, environment: "demo" });
  } else {
    logger.error("Sentry test event could not be flushed", { eventId });
    process.exitCode = 1;
  }
  await Sentry.close(2_000);
}
