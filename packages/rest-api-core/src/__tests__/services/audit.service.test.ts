/**
 * @module @kb-labs/rest-api-core/__tests__/services/audit
 * Unit tests for AuditService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService } from '../../services/audit.service.js';
import type { CliPort, StoragePort, QueuePort } from '../../ports/index.js';
import type { RestApiConfig } from '../../config/schema.js';

describe('AuditService', () => {
  let service: AuditService;
  let mockCli: CliPort;
  let mockStorage: StoragePort;
  let mockQueue: QueuePort;
  let mockConfig: RestApiConfig;
  const repoRoot = '/tmp/test-repo';

  beforeEach(() => {
    mockCli = {
      run: vi.fn(),
    } as any;

    mockStorage = {
      exists: vi.fn(),
      readJson: vi.fn(),
      writeJson: vi.fn(),
      writeText: vi.fn(),
      readText: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    } as any;

    mockQueue = {
      enqueue: vi.fn(),
      getStatus: vi.fn(),
      cancel: vi.fn(),
      list: vi.fn(),
    } as any;

    mockConfig = {
      port: 3001,
      basePath: '/api/v1',
      apiVersion: '1.0.0',
      auth: { mode: 'none', apiKeyHeader: 'X-API-Key', roles: [] },
      queue: { driver: 'memory', defaultPriority: 0 },
      cli: { bin: 'pnpm', prefix: ['kb'], timeoutSec: 900, allowedCommands: [] },
      storage: { driver: 'fs', baseDir: '.kb/rest' },
      plugins: [],
      mockMode: false,
      cors: { origins: [], allowCredentials: true, profile: 'dev' },
    };

    service = new AuditService(mockCli, mockStorage, mockQueue, mockConfig, repoRoot);
  });

  describe('createRun', () => {
    it('should enqueue audit job and return jobId/runId', async () => {
      const mockJobId = 'job-123';
      const mockRunId = 'run-456';
      
      (mockQueue.enqueue as any).mockResolvedValue({ jobId: mockJobId, runId: mockRunId });

      const result = await service.createRun({
        scope: 'packages/*',
        strict: true,
      });

      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        'audit.run',
        expect.objectContaining({
          args: expect.arrayContaining(['audit', 'run', '--json', '--scope', 'packages/*', '--strict']),
        }),
        expect.any(Object)
      );

      expect(result.jobId).toBe(mockJobId);
      expect(result.runId).toBe(mockRunId);
    });

    it('should support idempotency key', async () => {
      const mockJobId = 'job-123';
      
      (mockQueue.enqueue as any).mockResolvedValue({ jobId: mockJobId, runId: mockJobId });

      await service.createRun({
        idempotencyKey: 'test-key',
      });

      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        'audit.run',
        expect.any(Object),
        expect.objectContaining({
          idempotencyKey: 'test-key',
        })
      );
    });
  });

  describe('getSummary', () => {
    it('should return default summary when report not found', async () => {
      (mockStorage.exists as any).mockResolvedValue(false);

      const result = await service.getSummary();

      expect(result.overall.ok).toBe(true);
      expect(result.counts).toEqual({});
    });

    it('should return summary from storage when exists', async () => {
      const mockReport = {
        overall: { ok: true, severity: 'low' },
        counts: { error: 2, warning: 5 },
        finishedAt: '2024-01-01T00:00:00Z',
      };

      (mockStorage.exists as any).mockResolvedValue(true);
      (mockStorage.readJson as any).mockResolvedValue(mockReport);

      const result = await service.getSummary();

      expect(result.overall).toEqual(mockReport.overall);
      expect(result.counts).toEqual(mockReport.counts);
      expect(result.lastRunAt).toBe(mockReport.finishedAt);
    });

    it('should return mock summary in mock mode', async () => {
      const result = await service.getSummary(true);

      expect(result.overall).toBeDefined();
      expect(result.ts).toBeDefined();
      expect(result.totals).toBeDefined();
      expect(result.topFailures).toBeDefined();
      expect(result.counts).toBeDefined();
    });
  });

  describe('getLatestReport', () => {
    it('should throw NOT_FOUND when report not found', async () => {
      (mockStorage.exists as any).mockResolvedValue(false);

      await expect(service.getLatestReport()).rejects.toThrow('No audit report found');
    });

    it('should return report from storage', async () => {
      const mockReport = { overall: { ok: true } };

      (mockStorage.exists as any).mockResolvedValue(true);
      (mockStorage.readJson as any).mockResolvedValue(mockReport);

      const result = await service.getLatestReport();

      expect(result).toEqual(mockReport);
    });
  });
});

