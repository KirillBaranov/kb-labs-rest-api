/**
 * @module @kb-labs/rest-api-app/types/fastify
 * Fastify type extensions
 */

import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    mockMode?: boolean;
  }
}

