import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import type { CliAPI } from '@kb-labs/cli-api'
import type { RestApiConfig } from '@kb-labs/rest-api-core'
import { registerWorkflowRoutes } from '../workflows'

const BASE_CONFIG: RestApiConfig = {
  port: 3000,
  basePath: '/api/v1',
  apiVersion: 'test',
  cors: {
    origins: [],
    allowCredentials: true,
    profile: 'dev',
  },
  plugins: [],
  mockMode: false,
}

const SAMPLE_SPEC = {
  name: 'demo',
  version: '1.0.0',
  on: { manual: true },
  jobs: {
    build: {
      runsOn: 'local',
      steps: [{ name: 'echo', uses: 'builtin:shell', with: { command: 'echo hello' } }],
    },
  },
}

function createApp(cliApi: Partial<CliAPI>) {
  const app = Fastify({ logger: false }) as unknown as FastifyInstance
  return registerWorkflowRoutes(app, BASE_CONFIG, cliApi as CliAPI).then(() => app)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('registerWorkflowRoutes', () => {
  it('runs workflow specs provided inline', async () => {
    const runResponse = { id: 'run-1', status: 'queued' }
    const cliApi: Partial<CliAPI> = {
      runWorkflow: vi.fn().mockResolvedValue(runResponse),
      listWorkflowRuns: vi.fn(),
      getWorkflowRun: vi.fn(),
      cancelWorkflowRun: vi.fn(),
      streamWorkflowLogs: vi.fn(),
    }

    const app = await createApp(cliApi)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/run',
      payload: {
        inlineSpec: SAMPLE_SPEC,
        idempotency: 'build#42',
        concurrency: { group: 'branch:main' },
        metadata: { target: 'ci' },
      },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ run: runResponse })
    expect(cliApi.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: SAMPLE_SPEC,
        idempotencyKey: 'build#42',
        concurrencyGroup: 'branch:main',
        metadata: expect.objectContaining({ source: 'rest', target: 'ci' }),
      }),
    )

    await app.close()
  })

  it('rejects run requests without inline spec', async () => {
    const cliApi: Partial<CliAPI> = {
      runWorkflow: vi.fn(),
      listWorkflowRuns: vi.fn(),
      getWorkflowRun: vi.fn(),
      cancelWorkflowRun: vi.fn(),
      streamWorkflowLogs: vi.fn(),
    }

    const app = await createApp(cliApi)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/run',
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(cliApi.runWorkflow).not.toHaveBeenCalled()

    await app.close()
  })

  it('passes list filters to the CLI API', async () => {
    const cliApi: Partial<CliAPI> = {
      runWorkflow: vi.fn(),
      listWorkflowRuns: vi.fn().mockResolvedValue({ runs: [], total: 0 }),
      getWorkflowRun: vi.fn(),
      cancelWorkflowRun: vi.fn(),
      streamWorkflowLogs: vi.fn(),
    }

    const app = await createApp(cliApi)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/workflows/runs?status=running&limit=5',
    })

    expect(response.statusCode).toBe(200)
    expect(cliApi.listWorkflowRuns).toHaveBeenCalledWith({ status: 'running', limit: 5 })

    await app.close()
  })

  it('returns 404 when run is not found before streaming logs', async () => {
    const cliApi: Partial<CliAPI> = {
      runWorkflow: vi.fn(),
      listWorkflowRuns: vi.fn(),
      getWorkflowRun: vi.fn().mockResolvedValue(null),
      cancelWorkflowRun: vi.fn(),
      streamWorkflowLogs: vi.fn(),
    }

    const app = await createApp(cliApi)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/workflows/runs/missing/logs',
    })

    expect(response.statusCode).toBe(404)
    expect(cliApi.streamWorkflowLogs).not.toHaveBeenCalled()

    await app.close()
  })
})





