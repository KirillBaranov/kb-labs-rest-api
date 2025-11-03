/**
 * @module @kb-labs/rest-api-app/routes
 * Route registration
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { createServices } from '../services/index.js';
import { registerHealthRoutes } from './health.js';
import { registerAuditRoutes } from './audit.js';
import { registerReleaseRoutes } from './release.js';
import { registerDevlinkRoutes } from './devlink.js';
import { registerMindRoutes } from './mind.js';
import { registerAnalyticsRoutes } from './analytics.js';
import { registerJobsRoutes } from './jobs.js';
import { registerOpenApiRoutes } from './openapi.js';
import { registerMetricsRoutes } from './metrics.js';

/**
 * Register all routes
 */
export async function registerRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): Promise<void> {
  // Create services once and store in server instance
  if (!server.services) {
    server.services = createServices(config, repoRoot);
  }

  // Health and info routes
  registerHealthRoutes(server, config, repoRoot);

  // Audit routes
  registerAuditRoutes(server, config, repoRoot);

  // Release routes
  registerReleaseRoutes(server, config, repoRoot);

  // DevLink routes
  registerDevlinkRoutes(server, config, repoRoot);

  // Mind routes
  registerMindRoutes(server, config, repoRoot);

  // Analytics routes
  registerAnalyticsRoutes(server, config, repoRoot);

  // Jobs routes
  registerJobsRoutes(server, config, repoRoot);

  // OpenAPI routes
  await registerOpenApiRoutes(server, config);

  // Metrics routes
  registerMetricsRoutes(server, config);
}

