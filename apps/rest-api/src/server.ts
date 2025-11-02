/**
 * @module @kb-labs/rest-api-app/server
 * Fastify server setup
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { registerRoutes } from './routes/index.js';
import { registerPlugins } from './plugins/index.js';
import { registerMiddleware } from './middleware/index.js';

/**
 * Create and configure Fastify server
 */
export async function createServer(
  config: RestApiConfig,
  repoRoot: string
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: 'info',
      transport: process.env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
      } : undefined,
    },
    requestIdHeader: 'X-Request-Id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    requestTimeout: config.timeouts?.requestTimeout || 30000,
    bodyLimit: config.timeouts?.bodyLimit || 10485760, // 10MB
  });

  // Register plugins
  await registerPlugins(server, config);

  // Register middleware
  registerMiddleware(server, config);

  // Register routes
  await registerRoutes(server, config, repoRoot);

  return server;
}

