type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  level?: string;
  bindings?: LogFields;
  write?: (line: string) => void;
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const levelName = (options.level ?? process.env.LOG_LEVEL ?? "info") as Level | "silent";
  const threshold = LEVELS[levelName] ?? LEVELS.info;
  const bindings = options.bindings ?? {};
  const write = options.write ?? ((line: string) => process.stdout.write(line + "\n"));

  const log = (level: Level, msg: string, fields: LogFields = {}) => {
    if (LEVELS[level] < threshold) return;
    const entry: LogFields = { ts: new Date().toISOString(), level, msg, ...bindings };
    for (const [key, value] of Object.entries(fields)) entry[key] = serialize(value);
    write(JSON.stringify(entry));
  };

  return {
    debug: (msg, fields) => log("debug", msg, fields),
    info: (msg, fields) => log("info", msg, fields),
    warn: (msg, fields) => log("warn", msg, fields),
    error: (msg, fields) => log("error", msg, fields),
    child: (extra) => createLogger({ ...options, level: levelName, bindings: { ...bindings, ...extra } }),
  };
}

export const logger = createLogger();
