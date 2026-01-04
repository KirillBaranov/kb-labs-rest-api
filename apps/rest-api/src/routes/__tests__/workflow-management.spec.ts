import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { CliAPI } from '@kb-labs/cli-api';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import type { WorkflowSpec } from '@kb-labs/workflow-contracts';
import { registerWorkflowManagementRoutes } from '../workflow-management';

// Mock workflow engine dependencies
const mockRepository = {
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  disable: vi.fn(),
};

const mockScanner = {
  scan: vi.fn(),
};

const mockWorkflowService = {
  listAll: vi.fn(),
  get: vi.fn(),
  getAvailableHandlers: vi.fn(),
  validate: vi.fn(),
};

vi.mock('@kb-labs/workflow-engine', () => ({
  WorkflowRepository: vi.fn(() => mockRepository),
  ManifestScanner: vi.fn(() => mockScanner),
  WorkflowService: vi.fn(() => mockWorkflowService),
}));

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
};

const mockPlatform: PlatformServices = {
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
} as any;

const mockCliApi = {} as CliAPI;

function createSampleWorkflowSpec(): WorkflowSpec {
  return {
    name: 'test-workflow',
    version: '1.0.0',
    on: { manual: true },
    jobs: {
      build: {
        runsOn: 'local',
        steps: [
          {
            name: 'echo',
            uses: 'builtin:shell',
            with: { command: 'echo hello' },
          },
        ],
      },
    },
  };
}

function createMockWorkflowRuntime(overrides = {}) {
  return {
    id: 'wf-123',
    name: 'test-workflow',
    version: '1.0.0',
    source: 'standalone',
    status: 'active',
    spec: createSampleWorkflowSpec(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('registerWorkflowManagementRoutes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    await registerWorkflowManagementRoutes(app, BASE_CONFIG, mockCliApi, mockPlatform);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/workflows', () => {
    it('lists all workflows', async () => {
      const workflows = [
        createMockWorkflowRuntime({ id: 'wf-1', name: 'workflow-1' }),
        createMockWorkflowRuntime({ id: 'wf-2', name: 'workflow-2' }),
      ];

      mockWorkflowService.listAll.mockResolvedValue(workflows);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.workflows).toHaveLength(2);
      expect(payload.total).toBe(2);
      expect(mockWorkflowService.listAll).toHaveBeenCalledWith({
        source: undefined,
        status: undefined,
      });
    });

    it('filters workflows by source', async () => {
      mockWorkflowService.listAll.mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: '/api/v1/workflows?source=manifest',
      });

      expect(mockWorkflowService.listAll).toHaveBeenCalledWith({
        source: 'manifest',
        status: undefined,
      });
    });

    it('filters workflows by status', async () => {
      mockWorkflowService.listAll.mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: '/api/v1/workflows?status=paused',
      });

      expect(mockWorkflowService.listAll).toHaveBeenCalledWith({
        source: undefined,
        status: 'paused',
      });
    });

    it('filters workflows by tags', async () => {
      const workflows = [
        createMockWorkflowRuntime({ id: 'wf-1', tags: ['ci', 'build'] }),
        createMockWorkflowRuntime({ id: 'wf-2', tags: ['deploy'] }),
        createMockWorkflowRuntime({ id: 'wf-3', tags: ['ci', 'test'] }),
      ];

      mockWorkflowService.listAll.mockResolvedValue(workflows);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows?tags=ci',
      });

      const payload = response.json();
      expect(payload.workflows).toHaveLength(2);
      expect(payload.workflows.map((w: any) => w.id)).toEqual(['wf-1', 'wf-3']);
    });

    it('filters workflows by search term', async () => {
      const workflows = [
        createMockWorkflowRuntime({
          id: 'wf-1',
          name: 'build-frontend',
          description: 'Build React app',
        }),
        createMockWorkflowRuntime({
          id: 'wf-2',
          name: 'deploy-backend',
          description: 'Deploy Node.js service',
        }),
      ];

      mockWorkflowService.listAll.mockResolvedValue(workflows);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows?search=frontend',
      });

      const payload = response.json();
      expect(payload.workflows).toHaveLength(1);
      expect(payload.workflows[0].id).toBe('wf-1');
    });

    it('combines multiple filters', async () => {
      const workflows = [
        createMockWorkflowRuntime({
          id: 'wf-1',
          name: 'ci-build',
          tags: ['ci'],
          source: 'standalone',
        }),
        createMockWorkflowRuntime({
          id: 'wf-2',
          name: 'deploy',
          tags: ['deploy'],
          source: 'manifest',
        }),
      ];

      mockWorkflowService.listAll.mockResolvedValue([workflows[0]]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows?source=standalone&tags=ci&search=build',
      });

      const payload = response.json();
      expect(payload.workflows).toHaveLength(1);
      expect(payload.workflows[0].id).toBe('wf-1');
    });
  });

  describe('GET /api/v1/workflows/:id', () => {
    it('returns workflow by id', async () => {
      const workflow = createMockWorkflowRuntime({ id: 'wf-123' });
      mockWorkflowService.get.mockResolvedValue(workflow);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-123',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.workflow.id).toBe('wf-123');
      expect(mockWorkflowService.get).toHaveBeenCalledWith('wf-123');
    });

    it('returns 404 when workflow not found', async () => {
      mockWorkflowService.get.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/missing',
      });

      expect(response.statusCode).toBe(404);
      const payload = response.json();
      expect(payload.message).toContain('Workflow missing not found');
    });
  });

  describe('POST /api/v1/workflows', () => {
    it('creates new standalone workflow', async () => {
      const spec = createSampleWorkflowSpec();
      const workflow = createMockWorkflowRuntime({ spec });
      mockRepository.create.mockResolvedValue(workflow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows',
        payload: { spec },
      });

      expect(response.statusCode).toBe(201);
      const payload = response.json();
      expect(payload.workflow.id).toBe('wf-123');
      expect(mockRepository.create).toHaveBeenCalledWith(spec);
    });

    it('validates workflow spec schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows',
        payload: {
          spec: {
            // Missing required fields
            name: 'test',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('rejects empty body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /api/v1/workflows/:id', () => {
    it('updates standalone workflow spec', async () => {
      const existing = createMockWorkflowRuntime({ id: 'wf-123', source: 'standalone' });
      const updated = createMockWorkflowRuntime({
        id: 'wf-123',
        name: 'updated-workflow',
      });

      mockRepository.get.mockResolvedValue(existing);
      mockRepository.update.mockResolvedValue(updated);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/workflows/wf-123',
        payload: {
          spec: {
            name: 'updated-workflow',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.workflow.name).toBe('updated-workflow');
      expect(mockRepository.update).toHaveBeenCalledWith('wf-123', {
        name: 'updated-workflow',
      });
    });

    it('updates workflow status', async () => {
      const existing = createMockWorkflowRuntime({ id: 'wf-123', source: 'standalone' });
      const paused = createMockWorkflowRuntime({ id: 'wf-123', status: 'paused' });

      mockRepository.get.mockResolvedValue(existing);
      mockRepository.pause.mockResolvedValue(paused);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/workflows/wf-123',
        payload: {
          status: 'paused',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.workflow.status).toBe('paused');
      expect(mockRepository.pause).toHaveBeenCalledWith('wf-123');
    });

    it('updates both spec and status', async () => {
      const existing = createMockWorkflowRuntime({ id: 'wf-123', source: 'standalone' });
      const updated = createMockWorkflowRuntime({ id: 'wf-123', name: 'new-name' });
      const disabled = createMockWorkflowRuntime({
        id: 'wf-123',
        name: 'new-name',
        status: 'disabled',
      });

      mockRepository.get.mockResolvedValue(existing);
      mockRepository.update.mockResolvedValue(updated);
      mockRepository.disable.mockResolvedValue(disabled);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/workflows/wf-123',
        payload: {
          spec: { name: 'new-name' },
          status: 'disabled',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockRepository.update).toHaveBeenCalledWith('wf-123', { name: 'new-name' });
      expect(mockRepository.disable).toHaveBeenCalledWith('wf-123');
    });

    it('returns 404 when workflow not found', async () => {
      mockRepository.get.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/workflows/missing',
        payload: { spec: { name: 'test' } },
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects updating manifest-based workflows', async () => {
      const manifestWorkflow = createMockWorkflowRuntime({
        id: 'wf-123',
        source: 'manifest',
      });
      mockRepository.get.mockResolvedValue(manifestWorkflow);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/workflows/wf-123',
        payload: { spec: { name: 'updated' } },
      });

      expect(response.statusCode).toBe(400);
      const payload = response.json();
      expect(payload.message).toContain('Cannot update manifest-based workflow');
    });
  });

  describe('DELETE /api/v1/workflows/:id', () => {
    it('deletes standalone workflow', async () => {
      const workflow = createMockWorkflowRuntime({ id: 'wf-123', source: 'standalone' });
      mockRepository.get.mockResolvedValue(workflow);
      mockRepository.delete.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/workflows/wf-123',
      });

      expect(response.statusCode).toBe(204);
      expect(mockRepository.delete).toHaveBeenCalledWith('wf-123');
    });

    it('returns 404 when workflow not found', async () => {
      mockRepository.get.mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/workflows/missing',
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects deleting manifest-based workflows', async () => {
      const manifestWorkflow = createMockWorkflowRuntime({
        id: 'wf-123',
        source: 'manifest',
      });
      mockRepository.get.mockResolvedValue(manifestWorkflow);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/workflows/wf-123',
      });

      expect(response.statusCode).toBe(400);
      const payload = response.json();
      expect(payload.message).toContain('Cannot delete manifest-based workflow');
    });
  });

  describe('POST /api/v1/workflows/:id/schedule', () => {
    it('enables workflow schedule', async () => {
      const workflow = createMockWorkflowRuntime({ id: 'wf-123', source: 'standalone' });
      const scheduled = createMockWorkflowRuntime({
        id: 'wf-123',
        schedule: { cron: '0 0 * * *', enabled: true },
      });

      mockRepository.get.mockResolvedValue(workflow);
      mockRepository.update.mockResolvedValue(scheduled);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-123/schedule',
        payload: {
          cron: '0 0 * * *',
          enabled: true,
          timezone: 'America/New_York',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.workflow.schedule).toBeDefined();
      expect(mockRepository.update).toHaveBeenCalledWith('wf-123', {
        schedule: {
          cron: '0 0 * * *',
          enabled: true,
          timezone: 'America/New_York',
        },
      });
    });

    it('validates schedule config schema', async () => {
      const workflow = createMockWorkflowRuntime({ id: 'wf-123', source: 'standalone' });
      mockRepository.get.mockResolvedValue(workflow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-123/schedule',
        payload: {
          // Missing required cron and enabled
          timezone: 'UTC',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects scheduling manifest-based workflows', async () => {
      const manifestWorkflow = createMockWorkflowRuntime({
        id: 'wf-123',
        source: 'manifest',
      });
      mockRepository.get.mockResolvedValue(manifestWorkflow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-123/schedule',
        payload: { cron: '0 0 * * *', enabled: true },
      });

      expect(response.statusCode).toBe(400);
      const payload = response.json();
      expect(payload.message).toContain('Cannot modify schedule for manifest-based workflow');
    });
  });

  describe('DELETE /api/v1/workflows/:id/schedule', () => {
    it('disables workflow schedule', async () => {
      const workflow = createMockWorkflowRuntime({
        id: 'wf-123',
        source: 'standalone',
        schedule: { cron: '0 0 * * *', enabled: true },
      });
      const unscheduled = createMockWorkflowRuntime({
        id: 'wf-123',
        schedule: { enabled: false },
      });

      mockRepository.get.mockResolvedValue(workflow);
      mockRepository.update.mockResolvedValue(unscheduled);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/workflows/wf-123/schedule',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.workflow.schedule.enabled).toBe(false);
      expect(mockRepository.update).toHaveBeenCalledWith('wf-123', {
        schedule: { enabled: false },
      });
    });

    it('returns 404 when workflow not found', async () => {
      mockRepository.get.mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/workflows/missing/schedule',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/workflows/:id/pause', () => {
    it('pauses standalone workflow', async () => {
      const workflow = createMockWorkflowRuntime({ id: 'wf-123', source: 'standalone' });
      const paused = createMockWorkflowRuntime({ id: 'wf-123', status: 'paused' });

      mockRepository.get.mockResolvedValue(workflow);
      mockRepository.pause.mockResolvedValue(paused);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-123/pause',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.workflow.status).toBe('paused');
      expect(mockRepository.pause).toHaveBeenCalledWith('wf-123');
    });

    it('rejects pausing manifest-based workflows', async () => {
      const manifestWorkflow = createMockWorkflowRuntime({
        id: 'wf-123',
        source: 'manifest',
      });
      mockRepository.get.mockResolvedValue(manifestWorkflow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-123/pause',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/workflows/:id/resume', () => {
    it('resumes paused workflow', async () => {
      const paused = createMockWorkflowRuntime({
        id: 'wf-123',
        source: 'standalone',
        status: 'paused',
      });
      const resumed = createMockWorkflowRuntime({ id: 'wf-123', status: 'active' });

      mockRepository.get.mockResolvedValue(paused);
      mockRepository.resume.mockResolvedValue(resumed);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-123/resume',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.workflow.status).toBe('active');
      expect(mockRepository.resume).toHaveBeenCalledWith('wf-123');
    });
  });

  describe('GET /api/v1/workflows/handlers', () => {
    it('lists available workflow handlers', async () => {
      const handlers = [
        {
          id: 'builtin:shell',
          name: 'Shell Command',
          description: 'Run shell commands',
        },
        {
          id: '@kb-labs/ai-review:review',
          name: 'AI Code Review',
          description: 'Review code with LLM',
        },
      ];

      mockWorkflowService.getAvailableHandlers.mockResolvedValue(handlers);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/handlers',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.handlers).toHaveLength(2);
      expect(payload.total).toBe(2);
    });
  });

  describe('POST /api/v1/workflows/validate', () => {
    it('validates workflow spec', async () => {
      const spec = createSampleWorkflowSpec();
      const validationResult = {
        valid: true,
        errors: [],
        warnings: [],
      };

      mockWorkflowService.validate.mockResolvedValue(validationResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/validate',
        payload: { spec },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.valid).toBe(true);
      expect(mockWorkflowService.validate).toHaveBeenCalledWith(spec);
    });

    it('returns validation errors', async () => {
      const invalidSpec = { name: 'test' }; // Missing required fields
      const validationResult = {
        valid: false,
        errors: ['Missing required field: version', 'Missing required field: on'],
        warnings: [],
      };

      mockWorkflowService.validate.mockResolvedValue(validationResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/validate',
        payload: { spec: invalidSpec },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.valid).toBe(false);
      expect(payload.errors).toHaveLength(2);
    });
  });
});
