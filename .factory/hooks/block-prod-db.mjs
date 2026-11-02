#!/usr/bin/env node
// PreToolUse hook for Execute: blocks shell commands that target a production database.
// Reads the hook payload as JSON on stdin. Exit 0 allows the command; exit 2 blocks it and
// sends stderr back to the agent.

const DB_URL = /\b(?:jdbc:)?(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|sqlserver|mssql|cockroachdb|sqlite|libsql|clickhouse|file):\/\/?[^\s'"`]+/gi;

const DB_TOOLS = /(?:^|[\s;&|(`'"/])(?:psql|pg_dump|pg_dumpall|pg_restore|mysql|mysqldump|mongosh|mongo|mongodump|mongorestore|redis-cli|sqlite3|sqlcmd|cockroach|prisma|knex|sequelize|drizzle-kit|typeorm|supabase|tsx\s+\S*seed\S*|npm\s+run\s+seed)(?=$|[\s;&|)`'"])/i;

// "prod" or "production" as a standalone word, so "products" and "reproduce" do not match.
const PROD_WORD = /(?:^|[^a-z])prod(?:uction)?(?:[^a-z]|$)/i;

const PROD_DB_ENV = [
  /\b(?:[A-Z0-9]+_)*PROD(?:UCTION)?_(?:[A-Z0-9]+_)*(?:DATABASE|DB)(?:_[A-Z0-9_]*)?\b/,
  /\b(?:[A-Z0-9]+_)*(?:DATABASE|DB)_(?:[A-Z0-9]+_)*PROD(?:UCTION)?(?:_[A-Z0-9_]*)?\b/,
];

const DB_ENV_ASSIGN = /\b(?:DATABASE_URL|DB_URL|DB_PATH|DB_HOST|PGHOST|PGDATABASE|MONGO_URL|MONGODB_URI|REDIS_URL)=("[^"]*"|'[^']*'|\S+)/g;

export function findProductionDbReference(command) {
  for (const match of command.matchAll(DB_URL)) {
    if (/prod/i.test(match[0])) return `database URL contains "prod": ${match[0]}`;
  }
  for (const pattern of PROD_DB_ENV) {
    const match = command.match(pattern);
    if (match) return `references production database variable ${match[0]}`;
  }
  for (const match of command.matchAll(DB_ENV_ASSIGN)) {
    if (PROD_WORD.test(match[1])) return `points a database variable at production: ${match[0]}`;
  }
  const tool = command.match(DB_TOOLS);
  if (tool && PROD_WORD.test(command)) {
    return `runs a database tool (${tool[0].trim().replace(/^['"`(/]/, "")}) with a production target`;
  }
  return null;
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write("block-prod-db: could not parse hook input; blocking to be safe.\n");
    process.exit(2);
  }

  const command = payload?.tool_input?.command;
  if (typeof command !== "string") process.exit(0);

  const reason = findProductionDbReference(command);
  if (!reason) process.exit(0);

  process.stderr.write(
    `Blocked by .factory/hooks/block-prod-db.mjs: this command ${reason}.\n` +
      "Production databases are off limits (see AGENTS.md). Use the local SQLite database " +
      "(data/meridian.db) or an in-memory database instead.\n",
  );
  process.exit(2);
}

main();
