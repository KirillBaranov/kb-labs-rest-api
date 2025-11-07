/**
 * @module @kb-labs/rest-api-app/middleware/request-id
 * Request ID generation and correlation middleware
 */

import type { FastifyInstance } from 'fastify/types/instance';
import { ulid } from 'ulid';

/**
 * Register request ID middleware
 */
export function registerRequestIdMiddleware(server: FastifyInstance): void {
  server.addHook('onRequest', async (request, reply) => {
    const requestId = (request.headers['x-request-id'] as string | undefined) || ulid();

    request.id = requestId;
    reply.header('X-Request-Id', requestId);

    request.log.info({ requestId }, 'Request received');
  });
}

