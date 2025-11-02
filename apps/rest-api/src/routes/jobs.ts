/**
 * @module @kb-labs/rest-api-app/routes/jobs
 * Jobs routes
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import {
  jobResponseSchema,
  jobLogsResponseSchema,
  successEnvelopeSchema,
} from '@kb-labs/rest-api-core';
import { createServices } from '../services/index.js';

/**
 * Register jobs routes
 */
export function registerJobsRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): void {
  const basePath = config.basePath;
  const services = createServices(config, repoRoot);

  // GET /jobs/:jobId/logs/stream (SSE)
  server.get(`${basePath}/jobs/:jobId/logs/stream`, {
    schema: {
      response: {
        200: {
          type: 'object',
        },
      },
    },
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    
    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    
    // Read logs from storage
    const logPath = `jobs/${jobId}/log.ndjson`;
    const exists = await services.storage.exists(logPath);
    
    if (!exists) {
      reply.raw.write(`data: ${JSON.stringify({ error: 'Logs not found' })}\n\n`);
      reply.raw.end();
      return;
    }

    try {
      // Stream logs line by line
      const logContent = await services.storage.readText(logPath);
      const lines = logContent.split('\n').filter(Boolean);
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          reply.raw.write(`data: ${JSON.stringify(parsed)}\n\n`);
        } catch {
          reply.raw.write(`data: ${JSON.stringify({ message: line })}\n\n`);
        }
      }
      
      reply.raw.end();
    } catch (error: any) {
      reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      reply.raw.end();
    }
  });

  // GET /jobs/:jobId
  server.get(`${basePath}/jobs/:jobId`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    
    const job = await services.queue.getStatus(jobId);
    if (!job) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Job not found: ${jobId}`,
        },
        meta: {
          requestId: request.id,
          durationMs: reply.elapsedTime,
        },
      });
    }

    // Return only data - envelope middleware will wrap it
    return {
      jobId: job.jobId,
      runId: job.runId,
      status: job.status,
      kind: job.kind,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      progress: job.progress,
      error: job.error,
    };
  });

  // GET /jobs/:jobId/logs
  server.get(`${basePath}/jobs/:jobId/logs`, {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'number' },
        },
      },
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const offset = (request.query as any)?.offset || 0;
    
    // Read logs from storage
    const logPath = `jobs/${jobId}/log.ndjson`;
    const exists = await services.storage.exists(logPath);
    
    if (!exists) {
      // Return only data - envelope middleware will wrap it
      return {
        jobId,
        logs: [],
        hasMore: false,
      };
    }

    const logContent = await services.storage.readText(logPath);
    const lines = logContent.split('\n').filter(Boolean);
    
    // Apply offset
    const paginatedLines = lines.slice(offset);
    
    // Parse log lines
    const logs = paginatedLines.map((line: string, _index: number) => {
      try {
        const parsed = JSON.parse(line);
        return {
          timestamp: parsed.timestamp || new Date().toISOString(),
          level: parsed.level || 'info',
          message: parsed.message || line,
        };
      } catch {
        return {
          timestamp: new Date().toISOString(),
          level: 'info' as const,
          message: line,
        };
      }
    });

    // Return only data - envelope middleware will wrap it
    return {
      jobId,
      logs,
      offset,
      hasMore: offset + logs.length < lines.length,
    };
  });

  // POST /jobs/:jobId/cancel
  server.post(`${basePath}/jobs/:jobId/cancel`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    
    const cancelled = await services.queue.cancel(jobId);
    if (!cancelled) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Job not found or cannot be cancelled: ${jobId}`,
        },
        meta: {
          requestId: request.id,
          durationMs: reply.elapsedTime,
        },
      });
    }

    const job = await services.queue.getStatus(jobId);
    if (!job) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Job not found: ${jobId}`,
        },
        meta: {
          requestId: request.id,
          durationMs: reply.elapsedTime,
        },
      });
    }

    // Return only data - envelope middleware will wrap it
    return {
      jobId: job.jobId,
      runId: job.runId,
      status: job.status,
      kind: job.kind,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      progress: job.progress,
      error: job.error,
    };
  });
}

