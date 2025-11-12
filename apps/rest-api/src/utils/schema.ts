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
 * Response schemas (simplified, validation via Zod in handlers)
 */
export const responseSchemas = {
  200: objectSchema,
  202: objectSchema,
  400: objectSchema,
  404: objectSchema,
  500: objectSchema,
} as const;

