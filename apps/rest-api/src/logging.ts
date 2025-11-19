/**
 * @module @kb-labs/rest-api-app/logging
 * Logging utilities for REST API - re-exports from unified logging system
 * 
 * @deprecated Use getLogger() from @kb-labs/core-sys/logging directly
 * This file is kept for backward compatibility
 */

import { getLogger, type Logger } from '@kb-labs/core-sys/logging';

// Re-export for convenience
export { getLogger, type LogLevel } from '@kb-labs/core-sys/logging';

type Fields = Record<string, unknown>;

export interface RestLogger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields | Error): void;
}

/**
 * @deprecated Use initLogging() from @kb-labs/core-sys/logging/init instead
 */
export function initRestLogging(_level: string = 'info'): void {
  // No-op - logging is initialized globally via initLogging()
}

/**
 * @deprecated Use getLogger() from @kb-labs/core-sys/logging directly
 */
export function createRestLogger(
  scope: string,
  context: Fields = {}
): RestLogger {
  const coreLogger = getLogger(`rest:${scope}`).child({
    meta: {
      layer: 'rest',
      ...context,
    },
  });

  return {
    debug(message, fields) {
      coreLogger.debug(message, fields);
    },
    info(message, fields) {
      coreLogger.info(message, fields);
    },
    warn(message, fields) {
      coreLogger.warn(message, fields);
    },
    error(message, fields) {
      if (fields instanceof Error) {
        coreLogger.error(message, fields);
        return;
      }
      coreLogger.error(message, fields);
    },
  };
}

