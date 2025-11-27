/**
 * @module @kb-labs/rest-api-app/server
 * Fastify server setup
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI } from '@kb-labs/cli-api';
import { registerRoutes } from './routes/index.js';
import { registerPlugins } from './plugins/index.js';
import { registerMiddleware } from './middleware/index.js';
import { getLogger } from '@kb-labs/core-sys/logging';
import { randomUUID } from 'node:crypto';

/**
 * Create and configure Fastify server
 */
export async function createServer(
  config: RestApiConfig,
  repoRoot: string,
  cliApi: CliAPI
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false,
    requestIdHeader: 'X-Request-Id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    requestTimeout: config.timeouts?.requestTimeout || 30000,
    bodyLimit: config.timeouts?.bodyLimit || 10485760, // 10MB
  });

  const restLogger = createRestServerLogger();
  server.log = restLogger as unknown as typeof server.log;

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
  const logger = getLogger('rest:server').child({
    meta: {
      layer: 'rest',
      traceId,
      reqId: traceId,
    },
  });
  
  // Return Fastify-compatible logger interface
  return {
    debug: (msg: string, fields?: Record<string, unknown>) => logger.debug(msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => logger.info(msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => logger.warn(msg, fields),
    error: (msg: string, fields?: Record<string, unknown> | Error) => logger.error(msg, fields),
    fatal: (msg: string, fields?: Record<string, unknown> | Error) => logger.error(msg, fields),
    trace: (msg: string, fields?: Record<string, unknown>) => logger.debug(msg, fields),
    child: () => createRestServerLogger(), // Fastify may call child()
  };
}

