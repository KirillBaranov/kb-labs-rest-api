/**
 * @module @kb-labs/rest-api-app/routes/devlink
 * DevLink routes
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import {
  createDevlinkCheckRequestSchema,
  createDevlinkCheckResponseSchema,
  getDevlinkSummaryResponseSchema,
  getDevlinkGraphResponseSchema,
} from '@kb-labs/api-contracts';
import { createServices } from '../services/index.js';

/**
 * Register devlink routes
 */
export function registerDevlinkRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): void {
  const basePath = config.basePath;
  // Reuse services from server instance (created in registerRoutes)
  const services = server.services || createServices(config, repoRoot);

  // POST /devlink/check
  server.post(`${basePath}/devlink/check`, {
    schema: {
      body: { type: 'object' },
      response: {
        202: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const requestBody = createDevlinkCheckRequestSchema.parse(request.body);
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

    const result = await services.devlink.createCheck({
      ...requestBody,
      idempotencyKey: idempotencyKey || requestBody.idempotencyKey,
    });

    reply.code(202);
    // Return only data - envelope middleware will wrap it
    return result;
  });

  // GET /devlink/summary
  server.get(`${basePath}/devlink/summary`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const summary = await services.devlink.getSummary();

    // Return only data - envelope middleware will wrap it
    return summary;
  });

  // GET /devlink/graph
  server.get(`${basePath}/devlink/graph`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const graph = await services.devlink.getGraph();

    // Return only data - envelope middleware will wrap it
    return graph;
  });
}

