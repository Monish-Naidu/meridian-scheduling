import type { Db } from "./db/index";
import type { EpicClient } from "./epic/client";
import type { Logger } from "./logger";

export interface AppDeps {
  db: Db;
  epic: EpicClient;
  logger: Logger;
  /** Injectable clock so tests can pin "now". */
  now: () => Date;
}
