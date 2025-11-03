/**
 * @module @kb-labs/rest-api-app/routes/mind
 * Mind routes
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import {
  getMindSummaryResponseSchema,
} from '@kb-labs/api-contracts';
import { createServices } from '../services/index.js';

/**
 * Register mind routes
 */
export function registerMindRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): void {
  const basePath = config.basePath;
  // Reuse services from server instance (created in registerRoutes)
  const services = server.services || createServices(config, repoRoot);

  // GET /mind/summary
  server.get(`${basePath}/mind/summary`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const summary = await services.mind.getSummary();

    // Return only data - envelope middleware will wrap it
    return summary;
  });
}

