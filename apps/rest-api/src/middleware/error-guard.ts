/**
 * @module @kb-labs/rest-api-app/middleware/error-guard
 * Global error guard for plugin routes
 */

import type { FastifyInstance } from 'fastify/types/instance';
import type { PluginErrorEnvelope } from '@kb-labs/api-contracts';
import { ErrorCode } from '@kb-labs/api-contracts';

/**
 * Register global error handler for plugin routes
 * Never crashes the API - all errors are converted to ErrorEnvelope
 */
export function registerErrorGuard(server: FastifyInstance): void {
  // Global error handler
  server.setErrorHandler((error, request, reply) => {
    // Handle plugin errors (already ErrorEnvelope)
    if (
      error &&
      typeof error === 'object' &&
      'status' in error &&
      error.status === 'error' &&
      'meta' in error &&
      error.meta &&
      typeof error.meta === 'object' &&
      'pluginId' in error.meta
    ) {
      const envelope = error as unknown as PluginErrorEnvelope;
      reply.status(envelope.http).send(envelope);
      return;
    }

    // Generic error - convert to PluginErrorEnvelope
    const requestId = (request.id as string) || 'unknown';
    const envelope: PluginErrorEnvelope = {
      status: 'error',
      http: error.statusCode || 500,
      code: ErrorCode.INTERNAL,
      message: error.message || 'Internal server error',
      details: {
        error: error.message || String(error),
      },
      trace: error.stack,
      meta: {
        requestId,
        pluginId: 'system',
        pluginVersion: 'unknown',
        routeOrCommand: request.url || 'unknown',
        timeMs: 0,
      },
    };

    reply.status(envelope.http).send(envelope);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    server.log.error({ err: error }, 'Uncaught exception');
    // Don't exit - let Fastify handle it
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason: unknown) => {
    server.log.error({ err: reason }, 'Unhandled rejection');
    // Don't exit - let Fastify handle it
  });
}
