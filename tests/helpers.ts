import { createApp } from "../src/app";
import { openDb } from "../src/db/index";
import { EpicClient } from "../src/epic/client";
import { createLogger } from "../src/logger";

/** 2030-01-01 is a Tuesday; 2030-01-07 is the following Monday. */
export const FIXED_NOW = new Date("2030-01-01T00:00:00.000Z");
export const MONDAY = "2030-01-07";

export function makeTestApp(now: Date = FIXED_NOW) {
  const db = openDb(":memory:");
  const logger = createLogger({ level: "silent" });
  const epic = new EpicClient({ logger, latencyMs: 0 });
  const { app } = createApp({ db, logger, epic, now: () => now });
  return { app, db, epic };
}
