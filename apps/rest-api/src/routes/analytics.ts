/**
 * @module @kb-labs/rest-api-app/routes/analytics
 * Analytics routes
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import {
  getAnalyticsSummaryResponseSchema,
} from '@kb-labs/api-contracts';
import { createServices } from '../services/index.js';

/**
 * Register analytics routes
 */
export function registerAnalyticsRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): void {
  const basePath = config.basePath;
  // Reuse services from server instance (created in registerRoutes)
  const services = server.services || createServices(config, repoRoot);

  // GET /analytics/summary
  server.get(`${basePath}/analytics/summary`, {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          start: { type: 'string' },
          end: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const query = request.query as { start?: string; end?: string };
    const period = query.start && query.end ? { start: query.start, end: query.end } : undefined;
    
    const summary = await services.analytics.getSummary(period);

    // Return only data - envelope middleware will wrap it
    return summary;
  });
}

