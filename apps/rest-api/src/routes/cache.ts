/**
 * @module @kb-labs/rest-api-app/routes/cache
 * Cache management routes
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI } from '@kb-labs/cli-api';
import { normalizeBasePath } from '../utils/path-helpers';

/**
 * Register cache management routes
 */
export async function registerCacheRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  cliApi: CliAPI
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  /**
   * POST /api/v1/cache/invalidate
   * Force cache invalidation and registry refresh
   */
  server.post(`${basePath}/cache/invalidate`, async (request, reply) => {
    const start = Date.now();

    // Capture current state
    const beforeSnapshot = cliApi.snapshot();
    const previousRev = beforeSnapshot.rev;

    server.log.info({
      requestId: request.id,
      previousRev,
    }, 'Manual cache invalidation requested');

    try {
      // Force cache invalidation and refresh discovery
      // This will trigger re-discovery and clear stale cache
      await cliApi.refresh();

      // Get new state
      const afterSnapshot = cliApi.snapshot();
      const plugins = await cliApi.listPlugins();

      const elapsed = Date.now() - start;

      server.log.info({
        requestId: request.id,
        previousRev,
        newRev: afterSnapshot.rev,
        pluginsDiscovered: plugins.length,
        elapsedMs: elapsed,
      }, 'Cache invalidated successfully');

      return reply.code(200).send({
        ok: true,
        data: {
          invalidated: true,
          timestamp: new Date().toISOString(),
          previousRev,
          newRev: afterSnapshot.rev,
          pluginsDiscovered: plugins.length,
        },
        meta: {
          requestId: request.id,
          durationMs: elapsed,
          apiVersion: '1.0.0',
        },
      });
    } catch (error) {
      const elapsed = Date.now() - start;

      server.log.error({
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: elapsed,
      }, 'Cache invalidation failed');

      return reply.code(500).send({
        ok: false,
        error: {
          code: 'CACHE_INVALIDATION_FAILED',
          message: error instanceof Error ? error.message : 'Cache invalidation failed',
        },
        meta: {
          requestId: request.id,
          durationMs: elapsed,
          apiVersion: '1.0.0',
        },
      });
    }
  });
}
