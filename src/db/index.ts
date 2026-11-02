import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA } from "./schema";
import { seed } from "./seed";

export type Db = Database.Database;

export const DEFAULT_DB_PATH = process.env.DB_PATH ?? path.resolve("data", "meridian.db");

/** Opens the database, applies the schema, and seeds reference data if the database is empty. */
export function openDb(file: string = DEFAULT_DB_PATH): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM clinics").get() as { count: number };
  if (count === 0) seed(db);
  return db;
}
