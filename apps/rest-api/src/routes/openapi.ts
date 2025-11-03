/**
 * @module @kb-labs/rest-api-app/routes/openapi
 * OpenAPI schema endpoint
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { generateOpenApiSpec, zodToOpenApiSchema } from '@kb-labs/rest-api-core';
import {
  createAuditRunRequestSchema,
  getAuditSummaryResponseSchema,
  releasePreviewRequestSchema,
  jobResponseSchema,
  healthResponseSchema,
} from '@kb-labs/api-contracts';

/**
 * Register OpenAPI routes
 */
export function registerOpenApiRoutes(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  // GET /openapi.json
  server.get(`${config.basePath}/openapi.json`, {
    schema: {
      response: {
        200: {
          type: 'object',
        },
      },
    },
  }, async () => {
    const spec = generateOpenApiSpec({
      title: 'KB Labs REST API',
      version: config.apiVersion,
      basePath: config.basePath,
    });

    // Add example endpoints and schemas
    spec.paths = {
      [`${config.basePath}/health/live`]: {
        get: {
          tags: ['System'],
          summary: 'Health check',
          description: 'Check if the API is alive',
          responses: {
            '200': {
              description: 'API is healthy',
              content: {
                'application/json': {
                  schema: zodToOpenApiSchema(healthResponseSchema.shape.data),
                },
              },
            },
          },
        },
      },
      [`${config.basePath}/audit/summary`]: {
        get: {
          tags: ['Audit'],
          summary: 'Get audit summary',
          description: 'Get aggregated audit summary',
          responses: {
            '200': {
              description: 'Audit summary',
              content: {
                'application/json': {
                  schema: zodToOpenApiSchema(getAuditSummaryResponseSchema.shape.data),
                },
              },
            },
          },
        },
      },
      [`${config.basePath}/audit/runs`]: {
        post: {
          tags: ['Audit'],
          summary: 'Create audit run',
          description: 'Create a new audit run job',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: zodToOpenApiSchema(createAuditRunRequestSchema),
              },
            },
          },
          responses: {
            '202': {
              description: 'Audit run created',
              content: {
                'application/json': {
                  schema: zodToOpenApiSchema(jobResponseSchema.shape.data),
                },
              },
            },
          },
        },
      },
      [`${config.basePath}/jobs/{jobId}`]: {
        get: {
          tags: ['Jobs'],
          summary: 'Get job status',
          description: 'Get status of a job by ID',
          parameters: [
            {
              name: 'jobId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Job ID',
            },
          ],
          responses: {
            '200': {
              description: 'Job status',
              content: {
                'application/json': {
                  schema: zodToOpenApiSchema(jobResponseSchema.shape.data),
                },
              },
            },
            '404': {
              description: 'Job not found',
            },
          },
        },
      },
      [`${config.basePath}/jobs/{jobId}/events`]: {
        get: {
          tags: ['Jobs'],
          summary: 'Subscribe to job events (SSE)',
          description: 'Stream job events via Server-Sent Events',
          parameters: [
            {
              name: 'jobId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Job ID',
            },
          ],
          responses: {
            '200': {
              description: 'Event stream',
              content: {
                'text/event-stream': {
                  schema: {
                    type: 'string',
                    description: 'SSE stream of job events',
                  },
                },
              },
            },
          },
        },
      },
    };

    return spec;
  });

  // Swagger UI endpoint (dev only)
  if (process.env.NODE_ENV === 'development') {
    server.get(`${config.basePath}/docs`, {
      schema: {
        response: {
          200: {
            type: 'string',
          },
        },
      },
    }, async () => {
      // Basic Swagger UI HTML
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>KB Labs REST API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${config.basePath}/openapi.json',
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.presets.standalone
      ]
    });
  </script>
</body>
</html>
      `;
      return html;
    });
  }
}

