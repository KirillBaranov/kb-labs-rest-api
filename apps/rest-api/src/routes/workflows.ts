import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { RestApiConfig } from '@kb-labs/rest-api-core'
import type { IWorkflowEngine, IJobScheduler } from '@kb-labs/core-platform'
import type { WorkflowsAPI, JobsAPI } from '@kb-labs/plugin-contracts'
import { createWorkflowsAPI } from '@kb-labs/plugin-runtime'
import { createJobsAPI } from '@kb-labs/plugin-runtime'
import { WorkflowSpecSchema, type WorkflowSpec } from '@kb-labs/workflow-contracts'
import { z } from 'zod'
import { normalizeBasePath } from '../utils/path-helpers'
import { objectSchema, responseSchemas } from '../utils/schema'

const runRequestSchema = z
  .object({
    inlineSpec: z.unknown().optional(),
    specRef: z.string().min(1).optional(),
    idempotency: z.string().min(1).optional(),
    concurrency: z
      .object({
        group: z.string().min(1),
      })
      .optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()

const listQuerySchema = z
  .object({
    status: z.string().optional(),
    limit: z
      .union([z.string(), z.number()])
      .optional()
      .transform(value => (value === undefined ? undefined : Number(value))),
  })
  .strict()

const logsQuerySchema = z
  .object({
    follow: z
      .enum(['1', 'true', 'yes', 'on'])
      .optional()
      .transform(value => Boolean(value)),
    idleTimeoutMs: z
      .union([z.string(), z.number()])
      .optional()
      .transform(value => (value === undefined ? undefined : Number(value))),
  })
  .strict()

const eventsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z
      .union([z.string(), z.number()])
      .optional()
      .transform(value => (value === undefined ? undefined : Number(value))),
    follow: z
      .enum(['1', 'true', 'yes', 'on'])
      .optional()
      .transform(value => Boolean(value)),
    pollIntervalMs: z
      .union([z.string(), z.number()])
      .optional()
      .transform(value => (value === undefined ? undefined : Number(value))),
  })
  .strict()

export async function registerWorkflowRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  workflowEngine: IWorkflowEngine | null,
  jobScheduler: IJobScheduler | null,
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath)

  // Helper to extract tenantId from headers
  const getTenantId = (headers: Record<string, unknown>): string | undefined => {
    const tenantHeader = headers['x-tenant-id'];
    if (!tenantHeader) {return undefined;}
    return Array.isArray(tenantHeader) ? tenantHeader[0] : String(tenantHeader);
  };

  // Create WorkflowsAPI and JobsAPI with full permissions for REST API
  const createWorkflowsAPIForRequest = (request: FastifyRequest): WorkflowsAPI | null => {
    if (!workflowEngine) {return null;}
    return createWorkflowsAPI({
      tenantId: getTenantId(request.headers),
      engine: workflowEngine,
      permissions: {
        platform: {
          workflows: true, // REST API has full workflow access
        },
      },
    });
  };

  const createJobsAPIForRequest = (request: FastifyRequest): JobsAPI | null => {
    if (!jobScheduler) {return null;}
    return createJobsAPI({
      tenantId: getTenantId(request.headers),
      scheduler: jobScheduler,
      permissions: {
        platform: {
          jobs: true, // REST API has full jobs access
        },
      },
    });
  };

  server.route({
    method: 'POST',
    url: `${basePath}/workflows/run`,
    schema: {
      body: objectSchema,
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const workflowsAPI = createWorkflowsAPIForRequest(request);
      if (!workflowsAPI) {
        throw createError(503, 'WF_ENGINE_UNAVAILABLE', 'Workflow engine not available');
      }

      const body = runRequestSchema.parse(request.body ?? {})

      if (body.specRef) {
        throw createError(400, 'WF_SPEC_REF_UNSUPPORTED', 'specRef is not supported yet')
      }

      const spec = parseInlineSpec(body.inlineSpec, request)
      if (spec === null) {
        throw createError(400, 'WF_SPEC_MISSING', 'inlineSpec is required')
      }

      // Use the new WorkflowsAPI
      const runId = await workflowsAPI.run(spec.id, {
        ...body.metadata,
      }, {
        priority: spec.priority,
        timeout: spec.timeout,
        tags: {
          source: 'rest',
          actor: resolveActor(request.headers),
          ...body.metadata,
        },
        idempotencyKey: body.idempotency ?? resolveIdempotencyFromHeaders(request.headers),
      });

      return reply.code(202).send({ runId })
    },
  })

  server.route({
    method: 'GET',
    url: `${basePath}/workflows/runs`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const workflowsAPI = createWorkflowsAPIForRequest(request);
      if (!workflowsAPI) {
        throw createError(503, 'WF_ENGINE_UNAVAILABLE', 'Workflow engine not available');
      }

      const query = listQuerySchema.parse(request.query ?? {})
      const runs = await workflowsAPI.list({
        status: query.status as any,
        limit: query.limit,
      })
      return reply.send({ runs })
    },
  })

  server.route({
    method: 'GET',
    url: `${basePath}/workflows/runs/:runId`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const workflowsAPI = createWorkflowsAPIForRequest(request);
      if (!workflowsAPI) {
        throw createError(503, 'WF_ENGINE_UNAVAILABLE', 'Workflow engine not available');
      }

      const runId = getRunId(request.params)
      const run = await workflowsAPI.status(runId)
      if (!run) {
        throw createError(404, 'WF_RUN_NOT_FOUND', `Workflow run ${runId} not found`)
      }
      return reply.send({ run })
    },
  })

  server.route({
    method: 'POST',
    url: `${basePath}/workflows/runs/:runId/cancel`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const workflowsAPI = createWorkflowsAPIForRequest(request);
      if (!workflowsAPI) {
        throw createError(503, 'WF_ENGINE_UNAVAILABLE', 'Workflow engine not available');
      }

      const runId = getRunId(request.params)

      // Check if run exists before cancelling
      const run = await workflowsAPI.status(runId)
      if (!run) {
        throw createError(404, 'WF_RUN_NOT_FOUND', `Workflow run ${runId} not found`)
      }

      // Cancel the workflow
      await workflowsAPI.cancel(runId)

      // Get updated status
      const updatedRun = await workflowsAPI.status(runId)
      return reply.send({ run: updatedRun })
    },
  })

  // TODO: Implement logs/events routes using WorkflowsAPI
  // These routes require streaming support which is not yet implemented in WorkflowsAPI

  server.route({
    method: 'GET',
    url: `${basePath}/workflows/runs/:runId/logs`,
    handler: async (request, reply) => {
      throw createError(501, 'NOT_IMPLEMENTED', 'Workflow logs streaming not yet implemented in new API')
    },
  })

  server.route({
    method: 'GET',
    url: `${basePath}/workflows/runs/:runId/events`,
    handler: async (request, reply) => {
      throw createError(501, 'NOT_IMPLEMENTED', 'Workflow events streaming not yet implemented in new API')
    },
  })
}

function parseInlineSpec(value: unknown, request: FastifyRequest): WorkflowSpec | null {
  if (!value) {
    return null
  }
  if (typeof value === 'object' && value !== null) {
    const result = WorkflowSpecSchema.safeParse(value)
    if (!result.success) {
      if ((request as any).kbLogger) {
        (request as any).kbLogger.error('Invalid inline workflow spec object', undefined, { issues: result.error.issues });
      }
      throw createError(400, 'WF_INVALID_SPEC', 'inlineSpec must match WorkflowSpec schema')
    }
    return result.data
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('inlineSpec parsed to non-object')
      }
      const result = WorkflowSpecSchema.safeParse(parsed)
      if (!result.success) {
        if ((request as any).kbLogger) {
          (request as any).kbLogger.error('Invalid inline workflow spec JSON', undefined, { issues: result.error.issues });
        }
        throw createError(400, 'WF_INVALID_SPEC', 'inlineSpec JSON must match WorkflowSpec schema')
      }
      return result.data
    } catch (error) {
      if ((request as any).kbLogger) {
        (request as any).kbLogger.error('Failed to parse inline workflow spec', undefined, { err: error });
      }
      throw createError(400, 'WF_INVALID_SPEC', 'inlineSpec must be valid JSON object')
    }
  }
  throw createError(400, 'WF_INVALID_SPEC', 'inlineSpec must be an object or JSON string')
}

function resolveIdempotencyFromHeaders(headers: Record<string, unknown>): string | undefined {
  const header = headers['x-idempotency-key']
  if (!header) {
    return undefined
  }
  return Array.isArray(header) ? header[0] : String(header)
}

function resolveActor(headers: Record<string, unknown>): string {
  const actorHeader = headers['x-user-id'] ?? headers['x-actor'] ?? headers['x-user']
  if (!actorHeader) {
    return 'rest-api'
  }
  return Array.isArray(actorHeader) ? actorHeader[0] : String(actorHeader)
}

function getRunId(params: unknown): string {
  const runId = (params as { runId?: unknown } | undefined)?.runId
  if (!runId || typeof runId !== 'string') {
    throw createError(400, 'WF_RUN_ID_REQUIRED', 'runId must be provided')
  }
  return runId
}

function createError(statusCode: number, code: string, message: string) {
  const error = new Error(message)
  ;(error as any).statusCode = statusCode
  ;(error as any).code = code
  return error
}
