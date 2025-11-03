/**
 * @module @kb-labs/rest-api-app/routes/release
 * Release routes
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import {
  releasePreviewRequestSchema,
  releasePreviewResponseSchema,
  createReleaseRunRequestSchema,
  createReleaseRunResponseSchema,
  getReleaseRunResponseSchema,
  getReleaseChangelogResponseSchema,
} from '@kb-labs/api-contracts';
import { createServices } from '../services/index.js';

/**
 * Register release routes
 */
export function registerReleaseRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): void {
  const basePath = config.basePath;
  // Reuse services from server instance (created in registerRoutes)
  const services = server.services || createServices(config, repoRoot);

  // POST /release/preview
  server.post(`${basePath}/release/preview`, {
    schema: {
      body: { type: 'object' },
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const requestBody = releasePreviewRequestSchema.parse(request.body);
    
    const result = await services.release.preview(requestBody);

    // Return only data - envelope middleware will wrap it
    return result;
  });

  // POST /release/runs
  server.post(`${basePath}/release/runs`, {
    schema: {
      body: { type: 'object' },
      response: {
        202: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const requestBody = createReleaseRunRequestSchema.parse(request.body);
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

    const result = await services.release.createRun({
      ...requestBody,
      idempotencyKey: idempotencyKey || requestBody.idempotencyKey,
    });

    reply.code(202);
    // Return only data - envelope middleware will wrap it
    return result;
  });

  // GET /release/runs/:runId
  server.get(`${basePath}/release/runs/:runId`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    
    const result = await services.release.getRunStatus(runId);

    // Return only data - envelope middleware will wrap it
    return result;
  });

  // GET /release/changelog
  server.get(`${basePath}/release/changelog`, {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['markdown', 'json'] },
        },
      },
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const format = (request.query as any)?.format || 'markdown';
    
    const result = await services.release.getChangelog(format as 'markdown' | 'json');

    // Return only data - envelope middleware will wrap it
    return result;
  });
}

