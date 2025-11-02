/**
 * @module @kb-labs/rest-api-app/middleware/envelope
 * Response envelope wrapper middleware
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { successEnvelopeSchema, errorEnvelopeSchema } from '@kb-labs/rest-api-core';

/**
 * Register envelope middleware
 */
export function registerEnvelopeMiddleware(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  // Add response schema version header and wrap in envelope
  // Use 'preSerialization' hook to modify payload before Fastify serializes it
  server.addHook('preSerialization', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    reply.header('x-schema-version', config.apiVersion);
    
    // Skip envelope wrapping for streaming responses
    if (reply.getHeader('content-type') === 'text/event-stream') {
      return payload;
    }
    
    // If payload is already an envelope (has 'ok' field), return as is
    if (payload && typeof payload === 'object' && 'ok' in payload) {
      return payload;
    }
    
    // Otherwise, wrap in success envelope (if not an error response)
    if (reply.statusCode >= 200 && reply.statusCode < 300 && payload !== null && payload !== undefined) {
      // Wrap payload in envelope
      const envelope = {
        ok: true as const,
        data: payload,
        meta: {
          requestId: (request as any).id || '',
          durationMs: reply.elapsedTime || 0,
          schemaVersion: config.apiVersion,
        },
      };
      // Return object - Fastify will serialize to JSON
      return envelope;
    }
    
    return payload;
  });

  // Error handler
  server.setErrorHandler(async (error, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error.statusCode || 500;
    
    // Extract error details
    const errorCode = (error as any).code || 'INTERNAL_ERROR';
    const message = error.message || 'Internal server error';
    const details = (error as any).details || {};
    const cause = (error as any).cause;

    const errorEnvelope = errorEnvelopeSchema.parse({
      ok: false,
      error: {
        code: errorCode,
        message,
        details,
        cause,
      },
      meta: {
        requestId: request.id,
        durationMs: reply.elapsedTime || 0,
        schemaVersion: config.apiVersion,
      },
    });

    reply.status(statusCode);
    return errorEnvelope;
  });
}

