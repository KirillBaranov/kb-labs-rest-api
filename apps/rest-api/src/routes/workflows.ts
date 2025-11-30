import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { RestApiConfig } from '@kb-labs/rest-api-core'
import type { CliAPI, WorkflowLogEvent } from '@kb-labs/cli-api'
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
  cliApi: CliAPI,
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath)

  server.route({
    method: 'POST',
    url: `${basePath}/workflows/run`,
    schema: {
      body: objectSchema,
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const body = runRequestSchema.parse(request.body ?? {})

      if (body.specRef) {
        throw createError(400, 'WF_SPEC_REF_UNSUPPORTED', 'specRef is not supported yet')
      }

      const spec = parseInlineSpec(body.inlineSpec, request)
      if (spec === null) {
        throw createError(400, 'WF_SPEC_MISSING', 'inlineSpec is required')
      }

      const run = await cliApi.runWorkflow({
        spec,
        idempotencyKey: body.idempotency ?? resolveIdempotencyFromHeaders(request.headers),
        concurrencyGroup: body.concurrency?.group,
        metadata: {
          source: 'rest',
          ...body.metadata,
        },
        trigger: {
          type: 'manual',
          actor: resolveActor(request.headers),
          payload: body.metadata ?? {},
        },
      })

      reply.code(202).send({ run })
    },
  })

  server.route({
    method: 'GET',
    url: `${basePath}/workflows/runs`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const query = listQuerySchema.parse(request.query ?? {})
      const result = await cliApi.listWorkflowRuns({
        status: query.status,
        limit: query.limit,
      })
      reply.send(result)
    },
  })

  server.route({
    method: 'GET',
    url: `${basePath}/workflows/runs/:runId`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const runId = getRunId(request.params)
      const run = await cliApi.getWorkflowRun(runId)
      if (!run) {
        throw createError(404, 'WF_RUN_NOT_FOUND', `Workflow run ${runId} not found`)
      }
      reply.send({ run })
    },
  })

  server.route({
    method: 'POST',
    url: `${basePath}/workflows/runs/:runId/cancel`,
    schema: {
      response: responseSchemas,
    },
    handler: async (request, reply) => {
      const runId = getRunId(request.params)
      const run = await cliApi.cancelWorkflowRun(runId)
      if (!run) {
        throw createError(404, 'WF_RUN_NOT_FOUND', `Workflow run ${runId} not found`)
      }
      reply.send({ run })
    },
  })

  server.route({
    method: 'GET',
    url: `${basePath}/workflows/runs/:runId/logs`,
    handler: async (request, reply) => {
      const runId = getRunId(request.params)
      const query = logsQuerySchema.parse(request.query ?? {})

      const run = await cliApi.getWorkflowRun(runId)
      if (!run) {
        throw createError(404, 'WF_RUN_NOT_FOUND', `Workflow run ${runId} not found`)
      }

      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.flushHeaders?.()
      reply.raw.write(': connected\n\n')

      const controller = new AbortController()
      const sendEvent = (event: WorkflowLogEvent) => {
        reply.raw.write(`event: workflow.log\n`)
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      }

      request.raw.on('close', () => {
        controller.abort()
        reply.raw.end()
      })

      try {
        await cliApi.streamWorkflowLogs({
          runId,
          follow: Boolean(query.follow),
          idleTimeoutMs: query.idleTimeoutMs,
          signal: controller.signal,
          onEvent: sendEvent,
        })
      } catch (error) {
        request.log.warn({ err: error }, 'Workflow log streaming failed')
      } finally {
        reply.raw.end()
      }
    },
  })

  server.route({
    method: 'GET',
    url: `${basePath}/workflows/runs/:runId/events`,
    handler: async (request, reply) => {
      const runId = getRunId(request.params)
      const query = eventsQuerySchema.parse(request.query ?? {})

      const wantsStream =
        Boolean(query.follow) ||
        (typeof request.headers.accept === 'string' &&
          request.headers.accept.includes('text/event-stream'))

      if (!wantsStream) {
        const result = await cliApi.listWorkflowEvents({
          runId,
          cursor: query.cursor ?? null,
          limit: query.limit,
        })
        reply.send(result)
        return
      }

      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.flushHeaders?.()
      reply.raw.write(': connected\n\n')

      const controller = new AbortController()

      const handleEvent = (event: unknown) => {
        reply.raw.write('event: workflow.event\n')
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      }

      request.raw.on('close', () => {
        controller.abort()
        reply.raw.end()
      })

      try {
        await cliApi.streamWorkflowEvents({
          runId,
          cursor: query.cursor ?? null,
          follow: true,
          pollIntervalMs: query.pollIntervalMs,
          signal: controller.signal,
          onEvent: handleEvent,
        })
      } catch (error) {
        request.log.warn({ err: error }, 'Workflow event streaming failed')
      } finally {
        reply.raw.end()
      }
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
      request.log.error({ issues: result.error.issues }, 'Invalid inline workflow spec object')
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
        request.log.error({ issues: result.error.issues }, 'Invalid inline workflow spec JSON')
        throw createError(400, 'WF_INVALID_SPEC', 'inlineSpec JSON must match WorkflowSpec schema')
      }
      return result.data
    } catch (error) {
      request.log.error({ err: error }, 'Failed to parse inline workflow spec')
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
