/**
 * @module @kb-labs/rest-api-app/routes/audit
 * Audit routes
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import {
  createAuditRunRequestSchema,
  createAuditRunResponseSchema,
  getAuditRunResponseSchema,
  listAuditRunsQuerySchema,
  listAuditRunsResponseSchema,
  getAuditReportResponseSchema,
  getAuditSummaryResponseSchema,
  successEnvelopeSchema,
} from '@kb-labs/rest-api-core';
import { createServices } from '../services/index.js';

/**
 * Register audit routes
 */
export function registerAuditRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): void {
  const basePath = config.basePath;
  const services = createServices(config, repoRoot);

  // POST /audit/run
  server.post(`${basePath}/audit/run`, {
    schema: {
      body: { type: 'object' },
      response: { 202: { type: 'object' } },
    },
  }, async (request, reply) => {
    // Validate request body
    const requestBody = createAuditRunRequestSchema.parse(request.body);
    const idempotencyKey = (request.headers['idempotency-key'] as string) || undefined;

    const result = await services.audit.createRun({
      ...requestBody,
      idempotencyKey: idempotencyKey || requestBody.idempotencyKey,
    });

    reply.code(202);
    // Return only data - envelope middleware will wrap it
    return result;
  });

  // GET /audit/runs
  server.get(`${basePath}/audit/runs`, {
    schema: {
      querystring: { type: 'object' },
      response: { 200: { type: 'object' } },
    },
  }, async (request, reply) => {
    // Validate query
    const query = listAuditRunsQuerySchema.parse(request.query);
    
    const result = await services.queue.list({
      kind: 'audit.run',
      status: query.status,
      cursor: query.cursor,
      limit: query.limit || 25,
    });

    const runs = result.jobs.map((job) => ({
      runId: job.runId || job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    }));

    // Return only data - envelope middleware will wrap it
    return {
      runs,
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });

  // GET /audit/runs/:runId
  server.get(`${basePath}/audit/runs/:runId`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    
    const result = await services.audit.getRunStatus(runId);

    // Return only data - envelope middleware will wrap it
    return result;
  });

  // GET /audit/report/latest
  server.get(`${basePath}/audit/report/latest`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const report = await services.audit.getLatestReport();

    // Return only data - envelope middleware will wrap it
    return report;
  });

  // GET /audit/summary
  server.get(`${basePath}/audit/summary`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const mockMode = request.mockMode || false;
    const summary = await services.audit.getSummary(mockMode);

    // Return only data - envelope middleware will wrap it
    return summary;
  });
}
