/**
 * @module @kb-labs/rest-api-app/server
 * Fastify server setup
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI } from '@kb-labs/cli-api';
import { registerRoutes } from './routes/index';
import { registerPlugins } from './plugins/index';
import { registerMiddleware } from './middleware/index';
import { platform } from '@kb-labs/core-runtime';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';

/**
 * Fastify internal symbol to disable request logging
 */
const kDisableRequestLogging = Symbol.for('fastify.disableRequestLogging');

/**
 * Create and configure Fastify server
 */
export async function createServer(
  config: RestApiConfig,
  repoRoot: string,
  cliApi: CliAPI
): Promise<FastifyInstance> {
  // HTTP/2 configuration (requires HTTPS)
  const useHttp2 = config.http2?.enabled ?? false;
  const allowHTTP1 = config.http2?.allowHTTP1 ?? true;

  // SSL configuration
  let httpsOptions: { allowHTTP1: boolean; key: Buffer; cert: Buffer } | undefined;
  if (useHttp2 && config.ssl?.keyPath && config.ssl?.certPath) {
    const keyPath = config.ssl.keyPath;
    const certPath = config.ssl.certPath;

    if (existsSync(keyPath) && existsSync(certPath)) {
      httpsOptions = {
        allowHTTP1,
        key: readFileSync(keyPath),
        cert: readFileSync(certPath),
      };
    } else {
      platform.logger.warn('HTTP/2 enabled but SSL certificates not found, falling back to HTTP/1.1', {
        keyPath,
        certPath,
      });
    }
  }

  const server = Fastify({
    logger: true, // Enable logger so disableRequestLogging works
    requestIdHeader: 'X-Request-Id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: true,
    requestTimeout: config.timeouts?.requestTimeout || 30000,
    bodyLimit: config.timeouts?.bodyLimit || 10485760, // 10MB
    http2: useHttp2 && httpsOptions ? true : false,
    https: httpsOptions,
  });

  // Override child logger factory to return our custom logger with disable flag
  server.setChildLoggerFactory((logger, bindings, opts, rawReq) => {
    const customLogger = {
      [kDisableRequestLogging]: true, // Disable Fastify's built-in request logging
      debug: (obj: any, msg?: string) => {},
      info: (obj: any, msg?: string) => {},
      warn: (obj: any, msg?: string) => {},
      error: (obj: any, msg?: string) => {},
      fatal: (obj: any, msg?: string) => {},
      trace: (obj: any, msg?: string) => {},
      child: () => customLogger,
      level: 'silent',
    };
    return customLogger as any;
  });

  // Override with our custom logger for non-request logging
  const restLogger = createRestServerLogger();
  server.log = restLogger as unknown as typeof server.log;

  // Log protocol being used
  if (useHttp2 && httpsOptions) {
    restLogger.info('HTTP/2 enabled with HTTPS', {
      allowHTTP1Fallback: allowHTTP1,
    });
  } else if (useHttp2) {
    restLogger.warn('HTTP/2 requested but SSL certificates missing, using HTTP/1.1');
  } else {
    restLogger.info('Using HTTP/1.1');
  }

  // Store cliApi in server instance
  server.cliApi = cliApi;

  // Register plugins
  await registerPlugins(server as unknown as FastifyInstance, config);

  // Register middleware
  registerMiddleware(server as unknown as FastifyInstance, config);

  // Register routes
  await registerRoutes(server as unknown as FastifyInstance, config, repoRoot, cliApi);

  return server as unknown as FastifyInstance;
}

function createRestServerLogger() {
  const traceId = randomUUID();
  const logger = platform.logger.child({
    layer: 'rest',
    service: 'server',
    traceId,
  });

  // Return Fastify-compatible logger interface
  return {
    debug: (msg: string, fields?: Record<string, unknown>) => logger.debug(msg || '', fields),
    info: (msg: string, fields?: Record<string, unknown>) => logger.info(msg || '', fields),
    warn: (msg: string, fields?: Record<string, unknown>) => logger.warn(msg || '', fields),
    error: (msg: string, fields?: Record<string, unknown> | Error) => {
      if (fields instanceof Error) {
        logger.error(msg || '', fields, {});
      } else {
        logger.error(msg || '', undefined, fields);
      }
    },
    fatal: (msg: string, fields?: Record<string, unknown> | Error) => {
      if (fields instanceof Error) {
        logger.error(msg || '', fields, {});
      } else {
        logger.error(msg || '', undefined, fields);
      }
    },
    trace: (msg: string, fields?: Record<string, unknown>) => logger.trace(msg || '', fields),
    child: () => createRestServerLogger(),
  };
}

