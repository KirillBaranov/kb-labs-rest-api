/**
 * Workflow Management API endpoints
 * Provides CRUD operations and schedule management for workflows
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI } from '@kb-labs/cli-api';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import { WorkflowSpecSchema, type WorkflowSpec } from '@kb-labs/workflow-contracts';
import {
  WorkflowService,
  WorkflowRepository,
  ManifestScanner,
  type WorkflowRuntime,
} from '@kb-labs/workflow-engine';
import { z } from 'zod';
import { normalizeBasePath } from '../utils/path-helpers';
import { objectSchema, responseSchemas } from '../utils/schema';

// ============================================================================
// Schemas
// ============================================================================

const listWorkflowsQuerySchema = z.object({
  source: z.enum(['manifest', 'standalone']).optional(),
  status: z.enum(['active', 'paused', 'disabled']).optional(),
  tags: z.string().optional(), // comma-separated
  search: z.string().optional(),
});

const createWorkflowBodySchema = z.object({
  spec: WorkflowSpecSchema,
});

const updateWorkflowBodySchema = z.object({
  spec: z.object({
    name: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    description: z.string().optional(),
    on: z.any().optional(),
    env: z.record(z.string(), z.string()).optional(),
    secrets: z.array(z.string().min(1)).optional(),
    jobs: z.record(z.string().min(1), z.any()).optional(),
  }).optional(),
  status: z.enum(['active', 'paused', 'disabled']).optional(),
});

const scheduleConfigSchema = z.object({
  cron: z.string().min(1),
  enabled: z.boolean(),
  timezone: z.string().optional(),
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

function getWorkflowId(params: unknown): string {
  const id = (params as { id?: unknown } | undefined)?.id;
  if (!id || typeof id !== 'string') {
    throw createError(400, 'WF_ID_REQUIRED', 'Workflow id must be provided');
  }
  return id;
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerWorkflowManagementRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  cliApi: CliAPI,
  platform: PlatformServices,
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  // Initialize services
  const repository = new WorkflowRepository(platform, '.kb/workflows');
  const scanner = new ManifestScanner(cliApi, platform);
  const workflowService = new WorkflowService(scanner, repository, platform);

  // ========================================================================
  // Workflow CRUD
  // ========================================================================

  /**
   * GET /api/v1/workflows
   * List all workflows (manifest + standalone)
   */
  server.route({
    method: 'GET',
    url: `${basePath}/workflows`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const query = listWorkflowsQuerySchema.parse(request.query ?? {});

      const workflows = await workflowService.listAll({
        source: query.source,
        status: query.status,
      });

      // Apply additional filters
      let filtered = workflows;

      if (query.tags) {
        const tags = query.tags.split(',').map((t) => t.trim());
        filtered = filtered.filter((w) => w.tags?.some((tag) => tags.includes(tag)));
      }

      if (query.search) {
        const search = query.search.toLowerCase();
        filtered = filtered.filter(
          (w) =>
            w.name.toLowerCase().includes(search) ||
            w.description?.toLowerCase().includes(search)
        );
      }

      reply.send({
        workflows: filtered,
        total: filtered.length,
      });
    },
  });

  /**
   * GET /api/v1/workflows/:id
   * Get workflow by ID
   */
  server.route({
    method: 'GET',
    url: `${basePath}/workflows/:id`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const id = getWorkflowId(request.params);
      const workflow = await workflowService.get(id);

      if (!workflow) {
        throw createError(404, 'WF_NOT_FOUND', `Workflow ${id} not found`);
      }

      reply.send({ workflow });
    },
  });

  /**
   * POST /api/v1/workflows
   * Create new standalone workflow
   */
  server.route({
    method: 'POST',
    url: `${basePath}/workflows`,
    schema: {
      body: objectSchema,
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const body = createWorkflowBodySchema.parse(request.body ?? {});
      const workflow = await repository.create(body.spec);

      reply.code(201).send({ workflow });
    },
  });

  /**
   * PUT /api/v1/workflows/:id
   * Update standalone workflow
   */
  server.route({
    method: 'PUT',
    url: `${basePath}/workflows/:id`,
    schema: {
      body: objectSchema,
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const id = getWorkflowId(request.params);
      const body = updateWorkflowBodySchema.parse(request.body ?? {});

      const existing = await repository.get(id);
      if (!existing) {
        throw createError(404, 'WF_NOT_FOUND', `Workflow ${id} not found`);
      }

      if (existing.source !== 'standalone') {
        throw createError(
          400,
          'WF_NOT_STANDALONE',
          `Cannot update manifest-based workflow ${id}`
        );
      }

      let workflow: WorkflowRuntime = existing;

      // Update spec
      if (body.spec) {
        workflow = await repository.update(id, body.spec);
      }

      // Update status
      if (body.status) {
        if (body.status === 'paused') {
          workflow = await repository.pause(id);
        } else if (body.status === 'active') {
          workflow = await repository.resume(id);
        } else if (body.status === 'disabled') {
          workflow = await repository.disable(id);
        }
      }

      reply.send({ workflow });
    },
  });

  /**
   * DELETE /api/v1/workflows/:id
   * Delete standalone workflow
   */
  server.route({
    method: 'DELETE',
    url: `${basePath}/workflows/:id`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const id = getWorkflowId(request.params);

      const existing = await repository.get(id);
      if (!existing) {
        throw createError(404, 'WF_NOT_FOUND', `Workflow ${id} not found`);
      }

      if (existing.source !== 'standalone') {
        throw createError(
          400,
          'WF_NOT_STANDALONE',
          `Cannot delete manifest-based workflow ${id}`
        );
      }

      await repository.delete(id);

      reply.code(204).send();
    },
  });

  // ========================================================================
  // Schedule Management
  // ========================================================================

  /**
   * POST /api/v1/workflows/:id/schedule
   * Enable or update workflow schedule
   */
  server.route({
    method: 'POST',
    url: `${basePath}/workflows/:id/schedule`,
    schema: {
      body: objectSchema,
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const id = getWorkflowId(request.params);
      const scheduleConfig = scheduleConfigSchema.parse(request.body ?? {});

      const existing = await repository.get(id);
      if (!existing) {
        throw createError(404, 'WF_NOT_FOUND', `Workflow ${id} not found`);
      }

      if (existing.source !== 'standalone') {
        throw createError(
          400,
          'WF_NOT_STANDALONE',
          `Cannot modify schedule for manifest-based workflow ${id}`
        );
      }

      const workflow = await repository.update(id, {
        schedule: scheduleConfig,
      });

      reply.send({ workflow });
    },
  });

  /**
   * DELETE /api/v1/workflows/:id/schedule
   * Disable workflow schedule
   */
  server.route({
    method: 'DELETE',
    url: `${basePath}/workflows/:id/schedule`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const id = getWorkflowId(request.params);

      const existing = await repository.get(id);
      if (!existing) {
        throw createError(404, 'WF_NOT_FOUND', `Workflow ${id} not found`);
      }

      if (existing.source !== 'standalone') {
        throw createError(
          400,
          'WF_NOT_STANDALONE',
          `Cannot modify schedule for manifest-based workflow ${id}`
        );
      }

      const workflow = await repository.update(id, {
        schedule: { enabled: false },
      });

      reply.send({ workflow });
    },
  });

  /**
   * POST /api/v1/workflows/:id/pause
   * Pause workflow (disable schedule temporarily)
   */
  server.route({
    method: 'POST',
    url: `${basePath}/workflows/:id/pause`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const id = getWorkflowId(request.params);

      const existing = await repository.get(id);
      if (!existing) {
        throw createError(404, 'WF_NOT_FOUND', `Workflow ${id} not found`);
      }

      if (existing.source !== 'standalone') {
        throw createError(
          400,
          'WF_NOT_STANDALONE',
          `Cannot pause manifest-based workflow ${id}`
        );
      }

      const workflow = await repository.pause(id);

      reply.send({ workflow });
    },
  });

  /**
   * POST /api/v1/workflows/:id/resume
   * Resume workflow (re-enable schedule)
   */
  server.route({
    method: 'POST',
    url: `${basePath}/workflows/:id/resume`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const id = getWorkflowId(request.params);

      const existing = await repository.get(id);
      if (!existing) {
        throw createError(404, 'WF_NOT_FOUND', `Workflow ${id} not found`);
      }

      if (existing.source !== 'standalone') {
        throw createError(
          400,
          'WF_NOT_STANDALONE',
          `Cannot resume manifest-based workflow ${id}`
        );
      }

      const workflow = await repository.resume(id);

      reply.send({ workflow });
    },
  });

  // ========================================================================
  // Discovery
  // ========================================================================

  /**
   * GET /api/v1/workflows/handlers
   * List available workflow handlers (from manifests)
   */
  server.route({
    method: 'GET',
    url: `${basePath}/workflows/handlers`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const handlers = await workflowService.getAvailableHandlers();

      reply.send({
        handlers,
        total: handlers.length,
      });
    },
  });

  /**
   * POST /api/v1/workflows/validate
   * Validate workflow spec
   */
  server.route({
    method: 'POST',
    url: `${basePath}/workflows/validate`,
    schema: {
      body: objectSchema,
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const body = createWorkflowBodySchema.parse(request.body ?? {});
      const result = await workflowService.validate(body.spec);

      reply.send(result);
    },
  });
}
