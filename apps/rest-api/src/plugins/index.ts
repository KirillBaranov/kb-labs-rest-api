/**
 * @module @kb-labs/rest-api-app/plugins
 * Fastify plugins registration
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

/**
 * Register all Fastify plugins
 */
export async function registerPlugins(
  server: FastifyInstance,
  config: RestApiConfig
): Promise<void> {
  // CORS plugin
  await server.register(cors, {
    origin: config.cors.origins,
    credentials: config.cors.allowCredentials,
  });

  // Rate limit plugin
  if (config.rateLimit) {
    await server.register(rateLimit, {
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.timeWindow,
      addHeaders: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
      },
    });
  }
}

