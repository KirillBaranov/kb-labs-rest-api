/**
 * @module @kb-labs/rest-api-app/types/fastify
 * Fastify instance type extensions
 */

import type { createServices } from '../services/index.js';

type Services = ReturnType<typeof createServices>;

declare module 'fastify' {
  interface FastifyInstance {
    services?: Services;
  }
  
  interface FastifyRequest {
    mockMode?: boolean;
  }
}
