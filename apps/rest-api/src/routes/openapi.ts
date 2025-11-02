/**
 * @module @kb-labs/rest-api-app/routes/openapi
 * OpenAPI schema endpoint
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { generateOpenApiSpec } from '@kb-labs/rest-api-core';

/**
 * Register OpenAPI routes
 */
export function registerOpenApiRoutes(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  // GET /openapi.json
  server.get('/openapi.json', {
    schema: {
      response: {
        200: {
          type: 'object',
        },
      },
    },
  }, async () => {
    // Generate basic OpenAPI spec
    // TODO: Extract schemas from registered routes
    const spec = generateOpenApiSpec({
      title: 'KB Labs REST API',
      version: config.apiVersion,
      basePath: config.basePath,
    });
    
    return spec;
  });
}

