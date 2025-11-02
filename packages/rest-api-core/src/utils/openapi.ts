/**
 * @module @kb-labs/rest-api-core/utils/openapi
 * OpenAPI schema generation utilities
 */

import type { z } from 'zod';

/**
 * Convert Zod schema to OpenAPI schema
 * Note: zod-to-openapi may need to be initialized differently
 */
export function zodToOpenApiSchema(schema: z.ZodTypeAny): any {
  try {
    // Try to use zod-to-openapi if available
    // For now, return a basic schema
    return { type: 'object', description: 'Schema from Zod' };
  } catch (error) {
    return { type: 'object' };
  }
}

/**
 * Generate OpenAPI spec from route schemas
 */
export function generateOpenApiSpec(config: {
  title: string;
  version: string;
  basePath: string;
}): any {
  return {
    openapi: '3.0.0',
    info: {
      title: config.title,
      version: config.version,
      description: 'KB Labs REST API - HTTP interface for CLI tools',
    },
    servers: [
      {
        url: `http://localhost:3001${config.basePath}`,
        description: 'Local development',
      },
    ],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        none: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
        },
      },
    },
    tags: [
      { name: 'System', description: 'Health and system information' },
      { name: 'Audit', description: 'Audit operations' },
      { name: 'Release', description: 'Release operations' },
      { name: 'DevLink', description: 'DevLink operations' },
      { name: 'Mind', description: 'Mind operations' },
      { name: 'Analytics', description: 'Analytics operations' },
      { name: 'Jobs', description: 'Job management' },
    ],
  };
}

