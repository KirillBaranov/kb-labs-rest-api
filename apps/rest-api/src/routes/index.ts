/**
 * @module @kb-labs/rest-api-app/routes
 * Route registration
 */

import type { FastifyInstance } from 'fastify/types/instance';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI } from '@kb-labs/cli-api';
import { registerHealthRoutes } from './health.js';
import { registerOpenAPIRoutes } from './openapi.js';
import { registerMetricsRoutes } from './metrics.js';
import { registerPluginRoutes, registerPluginRegistry } from './plugins.js';

/**
 * Register all routes
 */
export async function registerRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string,
  cliApi: CliAPI
): Promise<void> {
  // Health and info routes (with CliAPI)
  registerHealthRoutes(server, config, repoRoot, cliApi);

  // OpenAPI routes (with CliAPI)
  await registerOpenAPIRoutes(server, config, repoRoot, cliApi);

  // Metrics routes
  registerMetricsRoutes(server, config);

  // Plugin routes (v2 manifests)
  await registerPluginRoutes(server, config, repoRoot);
  
  // Plugin registry endpoint for Studio
  await registerPluginRegistry(server, config, repoRoot);
}

