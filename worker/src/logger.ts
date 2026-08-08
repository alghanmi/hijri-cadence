import type { LogLevel } from './types.js';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function isLogLevel(value: string | undefined): value is LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error';
}

export function parseLogLevel(value: string | undefined): LogLevel {
  return isLogLevel(value) ? value : 'info';
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/**
 * Structured JSON logging per the project's convention: one JSON line per
 * significant event, required fields `ts`, `level`, `event`, `version`.
 * Feed tokens must always be hashed before landing on a log field, never
 * logged raw — see `hashToken()` in feed-handler.ts.
 */
export function createLogger(level: LogLevel, instanceId: string): Logger {
  const minRank = LEVEL_RANK[level];

  function emit(severity: LogLevel, event: string, fields?: Record<string, unknown>): void {
    if (LEVEL_RANK[severity] < minRank) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level: severity,
      event,
      version: VERSION,
      instance: instanceId,
      ...(fields ?? {}),
    });
    if (severity === 'error') {
      console.error(line);
    } else if (severity === 'warn') {
      console.warn(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
  };
}
