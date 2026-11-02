import { DEFAULT_DB_PATH, openDb } from "./index";
import { seed } from "./seed";
import { logger } from "../logger";

const db = openDb(DEFAULT_DB_PATH);
seed(db, { reset: true });
db.close();
logger.info("database reseeded", { dbPath: DEFAULT_DB_PATH });
