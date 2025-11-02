/**
 * @module @kb-labs/rest-api-app/middleware/request-id
 * Request ID generation and correlation middleware
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ulid } from 'ulid';

/**
 * Register request ID middleware
 */
export function registerRequestIdMiddleware(server: FastifyInstance): void {
  server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Use existing request ID from header or generate new one
    const requestId = (request.headers['x-request-id'] as string) || ulid();
    
    // Store in request object
    (request as any).id = requestId;
    
    // Set response header
    reply.header('X-Request-Id', requestId);
    
    // Log correlation ID
    request.log.info({ requestId }, 'Request received');
  });
}

