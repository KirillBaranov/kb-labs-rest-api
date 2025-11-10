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
  // CORS plugin with profile support
  const corsProfile = config.cors.profile || 'dev';
  let corsOrigins: string[] | boolean = config.cors.origins;
  
  if (corsProfile === 'dev') {
    // Dev: allow localhost origins
    corsOrigins = config.cors.origins.length > 0 
      ? config.cors.origins 
      : ['http://localhost:3000', 'http://localhost:5173']; // Vite default + Studio
  } else if (corsProfile === 'preview') {
    // Preview: specific staging domains
    corsOrigins = config.cors.origins.length > 0 
      ? config.cors.origins 
      : false; // Disable if not configured
  } else if (corsProfile === 'prod') {
    // Prod: strict whitelist
    corsOrigins = config.cors.origins.length > 0 
      ? config.cors.origins 
      : false; // Disable if not configured
  }

  await server.register(cors, {
    origin: corsOrigins,
    credentials: config.cors.allowCredentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key', 'X-Client-Version'],
    exposedHeaders: ['X-Request-Id', 'X-Schema-Version', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    // Add Vary header for proper caching
    preflightContinue: false,
  });

  // Add Vary: Origin header for CORS caching
  server.addHook('onSend', async (request, reply) => {
    if (corsProfile !== 'prod') {
      reply.header('Vary', 'Origin');
    }
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

