/**
 * @module @kb-labs/rest-api-app/middleware/request-id
 * Request ID generation and correlation middleware
 */

import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { platform } from '@kb-labs/core-runtime';

/**
 * Register request ID middleware
 */
export function registerRequestIdMiddleware(server: FastifyInstance): void {
  server.addHook('onRequest', async (request, reply) => {
    const requestId = (request.headers['x-request-id'] as string | undefined) || ulid();
    const traceId = (request.headers['x-trace-id'] as string | undefined) || ulid();

    request.id = requestId;
    reply.header('X-Request-Id', requestId);
    reply.header('X-Trace-Id', traceId);

    // Store logger metadata on request for metrics middleware to use
    (request as any).kbLogger = platform.logger.child({
      layer: 'rest',
      service: 'request',
      reqId: requestId,
      traceId,
      method: request.method,
      url: request.url,
    });

    // Log request received
    const method = request.method.toUpperCase();
    const fullUrl = request.url;
    (request as any).kbLogger.info(`→ ${method} ${fullUrl}`);
  });
}

