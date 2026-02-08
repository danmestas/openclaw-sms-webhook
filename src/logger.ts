export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

export function createLogger(minLevel: LogLevel = LogLevel.INFO): Logger {
  const minOrd = LEVEL_ORDER[minLevel];

  function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < minOrd) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      msg,
      ...ctx,
    };
    const line = JSON.stringify(entry);
    if (level === LogLevel.ERROR || level === LogLevel.WARN) {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  return {
    debug: (msg, ctx?) => emit(LogLevel.DEBUG, msg, ctx),
    info: (msg, ctx?) => emit(LogLevel.INFO, msg, ctx),
    warn: (msg, ctx?) => emit(LogLevel.WARN, msg, ctx),
    error: (msg, ctx?) => emit(LogLevel.ERROR, msg, ctx),
  };
}

/** Silent logger for tests */
export function createNullLogger(): Logger {
  const noop = () => {};
  return { debug: noop, info: noop, warn: noop, error: noop };
}
