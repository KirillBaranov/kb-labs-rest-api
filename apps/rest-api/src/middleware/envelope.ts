/**
 * @module @kb-labs/rest-api-app/middleware/envelope
 * Response envelope wrapper middleware
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { errorEnvelopeSchema } from '@kb-labs/rest-api-contracts';

/**
 * Register envelope middleware
 */
export function registerEnvelopeMiddleware(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  // Add response schema version header and wrap in envelope
  // Use 'onSend' hook to modify payload after Fastify serializes it but before sending
  // This ensures we get the serialized JSON string and can wrap it properly
  server.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-schema-version', config.apiVersion);
    
    // Skip envelope wrapping for streaming responses
    if (reply.getHeader('content-type') === 'text/event-stream') {
      console.log('⏭️ [envelope-middleware] Skipping envelope for streaming response');
      return payload;
    }
    
    // Skip if payload is not a string (Buffer or Stream)
    if (typeof payload !== 'string') {
      console.log('⏭️ [envelope-middleware] Skipping envelope for non-string payload:', typeof payload);
      return payload;
    }
    
    // Parse the serialized JSON payload
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      // If not JSON, return as is
      console.log('⚠️ [envelope-middleware] Payload is not JSON, returning as is');
      return payload;
    }
    
    console.log('📦 [envelope-middleware] Processing payload (onSend):', {
      url: request.url,
      method: request.method,
      statusCode: reply.statusCode,
      payloadType: typeof parsedPayload,
      payloadValue: parsedPayload,
      payloadString: payload.substring(0, 200), // First 200 chars for debugging
    });
    
    // If payload is already an envelope (has 'ok' field), return as is
    if (parsedPayload && typeof parsedPayload === 'object' && 'ok' in parsedPayload) {
      console.log('✅ [envelope-middleware] Payload is already an envelope, returning as is');
      return payload;
    }
    
    // Wrap all non-streaming responses in envelope
    // Note: Even 4xx/5xx responses with data should be wrapped with ok: true
    // (e.g., 503 for health/ready still contains useful data)
    
    // Handle empty object case - it should still be wrapped properly
    let dataToWrap = parsedPayload;
    
    // If payload is undefined or null, wrap as null
    if (parsedPayload === null || parsedPayload === undefined) {
      console.log('⚠️ [envelope-middleware] Payload is null or undefined, wrapping as null');
      dataToWrap = null;
    }
    // If payload is an empty object {}, wrap it as {} (not null)
    else if (typeof parsedPayload === 'object' && !Array.isArray(parsedPayload) && Object.keys(parsedPayload).length === 0) {
      console.log('⚠️ [envelope-middleware] Payload is empty object, preserving as {}');
      // Empty object should be preserved as empty object
      dataToWrap = {};
    }
    
    // For responses with data (including 4xx/5xx with payload), wrap with ok: true
    // The HTTP status code indicates the result, but envelope.ok indicates successful request processing
    // Only responses without payload (handled by error handler) should have ok: false
    const envelope = {
      ok: true as const,
      data: dataToWrap,
      meta: {
        requestId: (request as any).id || '',
        durationMs: reply.elapsedTime || 0,
        apiVersion: config.apiVersion,
      },
    };
    
    console.log('✅ [envelope-middleware] Wrapped payload in envelope:', {
      ok: envelope.ok,
      dataType: typeof dataToWrap,
      dataValue: dataToWrap,
      meta: envelope.meta,
      statusCode: reply.statusCode,
    });
    
    // Set Content-Type header if not set
    if (!reply.getHeader('content-type')) {
      reply.header('content-type', 'application/json');
    }
    
    // Serialize and return envelope as string
    const serialized = JSON.stringify(envelope);
    console.log('📤 [envelope-middleware] Returning serialized envelope, length:', serialized.length);
    return serialized;
  });

  // Error handler
  server.setErrorHandler(async (error, request, reply) => {
    const statusCode = error.statusCode || 500;
    
    // Extract error details
    const errorCode = (error as any).code || 'E_INTERNAL';
    const message = error.message || 'Internal server error';
    const details = (error as any).details || {};
    const cause = (error as any).cause;
    const traceId = (error as any).traceId;

    // Store error code for metrics
    (reply as any).errorCode = errorCode;

    // Log error with correlation ID
    request.log.error({
      error,
      errorCode,
      statusCode,
      requestId: request.id,
      traceId,
    }, 'Request error');

    const errorEnvelope = errorEnvelopeSchema.parse({
      ok: false,
      error: {
        code: errorCode,
        message,
        details,
        cause,
        traceId,
      },
      meta: {
        requestId: request.id,
        durationMs: reply.elapsedTime || 0,
        apiVersion: config.apiVersion,
      },
    });

    reply.status(statusCode);
    return errorEnvelope;
  });
}

