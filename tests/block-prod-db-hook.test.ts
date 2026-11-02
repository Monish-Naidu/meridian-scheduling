import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HOOK = path.resolve(".factory/hooks/block-prod-db.mjs");

function runHook(input: unknown) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr };
}

const execute = (command: string) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Execute",
  tool_input: { command },
});

describe("block-prod-db hook", () => {
  it.each([
    ['psql "postgres://app@db.prod.meridian.example:5432/meridian" -c "select 1"'],
    ["DATABASE_URL=postgresql://admin@meridian-production.example/db npx prisma migrate deploy"],
    ["mongosh mongodb+srv://ops@cluster-prod.example/meridian"],
    ["jdbc:mysql://reporting-prod.example:3306/meridian"],
    ["psql $PROD_DATABASE_URL -f dump.sql"],
    ["echo $DATABASE_URL_PRODUCTION"],
    ["DB_PATH=/srv/prod/meridian.db npm run dev"],
    ["pg_dump -h prod-db.meridian.example meridian > backup.sql"],
    ["sqlite3 data/production.db 'select * from patients'"],
    ["npm run seed -- --env production"],
  ])("blocks %s", (command) => {
    const { status, stderr } = runHook(execute(command));
    expect(status).toBe(2);
    expect(stderr).toContain("Blocked by");
  });

  it.each([
    ["npm test"],
    ["npm run seed"],
    ['psql "postgres://localhost:5432/meridian_dev" -c "select * from products"'],
    ["sqlite3 data/meridian.db 'select count(*) from appointments'"],
    ["git log --grep production"],
    ["NODE_ENV=production npm run build"],
  ])("allows %s", (command) => {
    expect(runHook(execute(command)).status).toBe(0);
  });

  it("ignores tool calls without a shell command", () => {
    expect(runHook({ tool_name: "Read", tool_input: { file_path: "/tmp/x" } }).status).toBe(0);
  });

  it("blocks when the hook input is not valid JSON", () => {
    expect(runHook("not json").status).toBe(2);
  });
});
