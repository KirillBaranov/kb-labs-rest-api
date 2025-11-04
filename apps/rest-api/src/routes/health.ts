/**
 * @module @kb-labs/rest-api-app/routes/health
 * Health check and diagnostics endpoints
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI } from '@kb-labs/cli-api';

/**
 * Register health and diagnostics routes
 */
export async function registerHealthRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string,
  cliApi: CliAPI
) {

  // Detailed health check
  fastify.get('/health', async (_, reply) => {
    const snapshot = cliApi.snapshot();
    
    reply.send({
      status: 'healthy',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      timestamp: Date.now(),
      registry: {
        version: snapshot.version,
        pluginsCount: snapshot.plugins.length,
        lastRefresh: snapshot.ts,
      },
      system: {
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
      },
    });
  });

  // Readiness probe (K8s)
  fastify.get('/ready', async (_, reply) => {
    const plugins = await cliApi.listPlugins();
    
    if (plugins.length === 0) {
      reply.code(503).send({ ready: false, reason: 'No plugins discovered' });
      return;
    }
    
    reply.send({ ready: true, pluginsCount: plugins.length });
  });

  // Liveness probe (K8s)
  fastify.get('/live', async (_, reply) => {
    reply.send({ live: true });
  });

  // Health check - plugins
  fastify.get('/health/plugins', async (_, reply) => {
    try {
      const plugins = await cliApi.listPlugins();
      
      reply.send({
        ok: true,
        version: '1.0.0',
        pluginsCount: plugins.length,
        timestamp: Date.now(),
        plugins: plugins.map(p => ({
          id: p.id,
          version: p.version,
        })),
      });
    } catch (error) {
      reply.code(500).send({
        ok: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  // Diagnostics - explain plugin selection
  fastify.get('/debug/plugins/:id/explain', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const explanation = cliApi.explain(id);
      
      reply.send(explanation);
    } catch (error) {
      reply.code(500).send({
        ok: false,
        error: {
          code: 'EXPLAIN_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  // Registry snapshot
  fastify.get('/debug/registry/snapshot', async (_, reply) => {
    try {
      const snapshot = cliApi.snapshot();
      
      reply.send(snapshot);
    } catch (error) {
      reply.code(500).send({
        ok: false,
        error: {
          code: 'SNAPSHOT_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
