import {
  configureLogger,
  getLogger,
  setLogLevel,
  jsonSink,
  type LogLevel,
  type Logger as CoreLogger,
} from '@kb-labs/core-sys';

type Fields = Record<string, unknown>;

export interface RestLogger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields | Error): void;
}

let configured = false;

export function initRestLogging(level: LogLevel = 'info'): void {
  if (!configured) {
    configureLogger({
      level,
      sinks: [jsonSink],
    });
    configured = true;
    return;
  }
  setLogLevel(level);
}

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

  return wrap(coreLogger);
}

function wrap(core: CoreLogger): RestLogger {
  return {
    debug(message, fields) {
      core.debug(message, fields);
    },
    info(message, fields) {
      core.info(message, fields);
    },
    warn(message, fields) {
      core.warn(message, fields);
    },
    error(message, fields) {
      if (fields instanceof Error) {
        core.error(message, fields);
        return;
      }
      core.error(message, fields);
    },
  };
}

