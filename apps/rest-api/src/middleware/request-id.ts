/**
 * @module @kb-labs/rest-api-app/middleware/request-id
 * Request ID generation and correlation middleware
 */

import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { getLogger } from '@kb-labs/core-sys/logging';

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

    const requestLogger = getLogger('rest:request').child({
      meta: {
        layer: 'rest',
        reqId: requestId,
        traceId,
        method: request.method,
        url: request.url,
      },
    });

    (request as any).log = {
      debug: (msg: string, fields?: Record<string, unknown>) => requestLogger.debug(msg, fields),
      info: (msg: string, fields?: Record<string, unknown>) => requestLogger.info(msg, fields),
      warn: (msg: string, fields?: Record<string, unknown>) => requestLogger.warn(msg, fields),
      error: (msg: string, fields?: Record<string, unknown> | Error) => requestLogger.error(msg, fields),
    };
    (reply as any).log = (request as any).log;

    requestLogger.info('Request received');
  });
}

