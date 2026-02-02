/**
 * @module @kb-labs/rest-api-app/routes/jobs
 * Scheduled jobs management endpoints
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { ICronManager } from '@kb-labs/core-platform';
import { z } from 'zod';
import { normalizeBasePath } from '../utils/path-helpers';
import { responseSchemas } from '../utils/schema';

// ============================================================================
// Schemas
// ============================================================================

const listJobsQuerySchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

function createError(statusCode: number, code: string, message: string) {
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  (error as any).code = code;
  return error;
}

function getJobId(params: unknown): string {
  const id = (params as { id?: unknown } | undefined)?.id;
  if (!id || typeof id !== 'string') {
    throw createError(400, 'JOB_ID_REQUIRED', 'Job id must be provided');
  }
  return id;
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerJobsRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  cronManager: ICronManager | null,
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  /**
   * GET /api/v1/jobs
   * List all scheduled jobs
   */
  server.route({
    method: 'GET',
    url: `${basePath}/jobs`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const query = listJobsQuerySchema.parse(request.query ?? {});
      let jobs = cronManager.list();

      // Filter by status
      if (query.status) {
        jobs = jobs.filter((job) => job.status === query.status);
      }

      return reply.send({ jobs });
    },
  });

  /**
   * GET /api/v1/jobs/:id
   * Get job details
   */
  server.route({
    method: 'GET',
    url: `${basePath}/jobs/:id`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const jobId = getJobId(request.params);
      const jobs = cronManager.list();
      const job = jobs.find((j) => j.id === jobId);

      if (!job) {
        throw createError(404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
      }

      return reply.send({ job });
    },
  });

  /**
   * POST /api/v1/jobs/:id/trigger
   * Trigger job execution immediately
   */
  server.route({
    method: 'POST',
    url: `${basePath}/jobs/:id/trigger`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const jobId = getJobId(request.params);

      try {
        await cronManager.trigger(jobId);
        return reply.send({
          success: true,
          message: `Job ${jobId} triggered successfully`,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw createError(404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
        }
        throw error;
      }
    },
  });

  /**
   * POST /api/v1/jobs/:id/pause
   * Pause job execution
   */
  server.route({
    method: 'POST',
    url: `${basePath}/jobs/:id/pause`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const jobId = getJobId(request.params);

      // Check if job exists
      const jobs = cronManager.list();
      const job = jobs.find((j) => j.id === jobId);
      if (!job) {
        throw createError(404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
      }

      cronManager.pause(jobId);

      return reply.send({
        success: true,
        message: `Job ${jobId} paused successfully`,
      });
    },
  });

  /**
   * POST /api/v1/jobs/:id/resume
   * Resume paused job
   */
  server.route({
    method: 'POST',
    url: `${basePath}/jobs/:id/resume`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const jobId = getJobId(request.params);

      // Check if job exists
      const jobs = cronManager.list();
      const job = jobs.find((j) => j.id === jobId);
      if (!job) {
        throw createError(404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
      }

      cronManager.resume(jobId);

      return reply.send({
        success: true,
        message: `Job ${jobId} resumed successfully`,
      });
    },
  });

  /**
   * GET /api/v1/jobs/stats
   * Get cron jobs statistics
   */
  server.route({
    method: 'GET',
    url: `${basePath}/jobs/stats`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      if (!cronManager) {
        throw createError(503, 'CRON_UNAVAILABLE', 'Cron manager not available');
      }

      const stats = cronManager.getStats();

      return reply.send({ stats });
    },
  });
}
