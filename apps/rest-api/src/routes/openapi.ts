/**
 * @module @kb-labs/rest-api-app/routes/openapi
 * OpenAPI specification endpoints
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI } from '@kb-labs/cli-api';
import { mergeOpenAPISpecs } from '@kb-labs/cli-core';

/**
 * Register OpenAPI routes
 */
export async function registerOpenAPIRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string,
  cliApi: CliAPI
) {
  // Merged OpenAPI spec from all plugins
  fastify.get('/openapi.json', {
    schema: {
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    config: {
      rateLimit: {
        max: 10, // 10 requests
        timeWindow: '1 minute',
      },
    },
  }, async (_, reply) => {
    try {
      const plugins = await cliApi.listPlugins();
      const specs = [];
      
      for (const plugin of plugins) {
        const spec = await cliApi.getOpenAPISpec(plugin.id);
        if (spec) {
          specs.push(spec);
        }
      }
      
      const merged = mergeOpenAPISpecs(specs);
      
      // Add caching headers (1 hour)
      reply.header('Cache-Control', 'public, max-age=3600');
      reply.header('ETag', `"${cliApi.snapshot().version}"`);
      
      reply.send(merged);
    } catch (error) {
      reply.code(500).send({
        ok: false,
        error: {
          code: 'OPENAPI_GENERATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  // Per-plugin OpenAPI spec
  fastify.get('/openapi/:pluginId', async (req, reply) => {
    try {
      const { pluginId } = req.params as { pluginId: string };
      const spec = await cliApi.getOpenAPISpec(pluginId);
      
      if (!spec) {
        reply.code(404).send({
          ok: false,
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
        return;
      }

      reply.send(spec);
    } catch (error) {
      reply.code(500).send({
        ok: false,
        error: {
          code: 'OPENAPI_GENERATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
