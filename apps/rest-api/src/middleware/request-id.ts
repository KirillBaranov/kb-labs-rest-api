/**
 * @module @kb-labs/rest-api-app/middleware/request-id
 * Request ID generation and correlation middleware
 */

import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { createRestLogger } from '../logging.js';

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

    const requestLogger = createRestLogger('request', {
      reqId: requestId,
      traceId,
      method: request.method,
      url: request.url,
    });

    (request as any).log = requestLogger;
    (reply as any).log = requestLogger;

    requestLogger.info('Request received');
  });
}

