import "dotenv/config";
import * as Sentry from "@sentry/node";
import { sanitizeSentryEvent } from "./sentry/sanitize-event";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: "demo",
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: false,
    integrations: [
      Sentry.expressIntegration({
        shouldHandleError: (error) => Number(error.statusCode ?? error.status ?? error.output?.statusCode ?? 500) >= 500,
      }),
    ],
    beforeSend: sanitizeSentryEvent,
  });
}
