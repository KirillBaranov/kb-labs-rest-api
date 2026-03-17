/**
 * @module @kb-labs/rest-api-app/utils/schema
 * Schema utilities for Fastify routes
 */

/**
 * Simple object schema for Fastify (Zod validation happens in handlers)
 */
export const objectSchema = {
  type: 'object',
  additionalProperties: true,
} as const;

/**
 * Error response schema (includes message field for error responses)
 */
export const errorSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    error: { type: 'string' },
    message: { type: 'string' },
    code: { type: 'string' },
  },
  additionalProperties: true,
} as const;

/**
 * Response schemas (simplified, validation via Zod in handlers)
 */
export const responseSchemas = {
  200: objectSchema,
  201: objectSchema,
  202: objectSchema,
  204: { type: 'null' } as const,
  400: errorSchema,
  404: errorSchema,
  500: errorSchema,
} as const;

