import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { CliAPI, RegistrySnapshot } from '@kb-labs/cli-api';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import {
  registerPluginRoutes,
  registerPluginRegistry,
} from '../plugins';
import type { ReadinessState } from '../readiness';
import * as fs from 'node:fs/promises';

// Mock dependencies
vi.mock('@kb-labs/plugin-execution/http', () => ({
  mountRoutes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@kb-labs/core-runtime', () => ({
  platform: {
    executionBackend: {
      type: 'mock-backend',
    },
    shutdown: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@kb-labs/core-workspace', () => ({
  resolveWorkspaceRoot: vi.fn().mockResolvedValue({
    rootDir: '/mock/workspace',
    source: 'KB_LABS_WORKSPACE_ROOT',
  }),
}));

vi.mock('../middleware/metrics', () => ({
  metricsCollector: {
    resetPluginRouteBudgets: vi.fn(),
    beginPluginMount: vi.fn(() => ({
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    })),
    registerRouteBudget: vi.fn(),
    completePluginMount: vi.fn(),
  },
}));

vi.mock('node:fs/promises');

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
  timeouts: {
    requestTimeout: 30000,
  },
};

function createMockManifest(overrides: Partial<ManifestV3> = {}): ManifestV3 {
  return {
    schema: 'kb.plugin/3',
    id: '@kb-labs/test-plugin',
    version: '1.0.0',
    sdk: '3.0.0',
    name: 'Test Plugin',
    description: 'A test plugin',
    platform: {
      supported: ['node'],
    },
    host: 'node',
    permissions: {
      fs: { read: ['**/*.ts'], write: [] },
      network: { allowedDomains: [] },
      process: { allowedCommands: [] },
      state: { namespaces: [] },
    },
    entry: './dist/index.js',
    ...overrides,
  } as ManifestV3;
}

function createMockReadinessState(): ReadinessState {
  return {
    cliApiInitialized: true,
    registryLoaded: true,
    registryPartial: false,
    registryStale: false,
    pluginRoutesMounted: false,
    pluginMountInProgress: false,
    pluginRoutesCount: 0,
    pluginRouteErrors: 0,
    pluginRouteFailures: [],
    lastPluginMountTs: null,
    pluginRoutesLastDurationMs: null,
    redisEnabled: false,
    redisConnected: false,
    redisStates: {
      publisher: null,
      subscriber: null,
      cache: null,
    },
  };
}

function createMockSnapshot(manifests: Array<{
  pluginId: string;
  manifest: ManifestV3;
  pluginRoot: string;
  source?: string;
}>): RegistrySnapshot {
  return {
    schema: 'kb.registry/1',
    rev: 1,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ttlMs: 60_000,
    partial: false,
    stale: false,
    source: { cliVersion: 'test', cwd: process.cwd() },
    corrupted: false,
    manifests: manifests.map((entry) => ({
      pluginId: entry.pluginId,
      manifest: entry.manifest,
      pluginRoot: entry.pluginRoot,
      source: entry.source ?? 'test',
    })),
  };
}

describe('registerPluginRoutes', () => {
  let app: FastifyInstance;
  let readiness: ReadinessState;
  let fsAccessMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    readiness = createMockReadinessState();

    // Mock fs.access to simulate file existence
    fsAccessMock = vi.mocked(fs.access);
    fsAccessMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await app.close();
  });

  it('successfully mounts plugin routes with REST endpoints', async () => {
    const manifest = createMockManifest({
      rest: {
        basePath: '/v1/test',
        routes: [
          {
            method: 'GET',
            path: '/hello',
            description: 'Say hello',
            handler: './dist/handlers/hello.js#default',
          },
          {
            method: 'POST',
            path: '/echo',
            description: 'Echo input',
            handler: './dist/handlers/echo.js#echoHandler',
          },
        ],
      },
    });

    const snapshot = createMockSnapshot([
      {
        pluginId: '@kb-labs/test-plugin',
        manifest,
        pluginRoot: '/mock/plugins/test',
      },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    expect(readiness.pluginRoutesMounted).toBe(true);
    expect(readiness.pluginRoutesCount).toBe(2);
    expect(readiness.pluginRouteErrors).toBe(0);
    expect(readiness.pluginRouteFailures).toEqual([]);
    expect(readiness.pluginMountInProgress).toBe(false);
    expect(readiness.pluginRoutesLastDurationMs).toBeGreaterThan(0);
  });

  it('handles plugins without REST routes', async () => {
    const manifest = createMockManifest({
      // No rest configuration
    });

    const snapshot = createMockSnapshot([
      {
        pluginId: '@kb-labs/cli-only',
        manifest,
        pluginRoot: '/mock/plugins/cli-only',
      },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    expect(readiness.pluginRoutesMounted).toBe(true);
    expect(readiness.pluginRoutesCount).toBe(0);
    expect(readiness.pluginRouteErrors).toBe(0);
  });

  it('validates handler file existence and skips missing handlers', async () => {
    fsAccessMock.mockImplementation((filePath: string) => {
      if (filePath.includes('missing-handler.js')) {
        return Promise.reject(new Error('File not found'));
      }
      return Promise.resolve();
    });

    const manifest = createMockManifest({
      rest: {
        routes: [
          {
            method: 'GET',
            path: '/valid',
            handler: './dist/handlers/valid.js#default',
          },
          {
            method: 'POST',
            path: '/invalid',
            handler: './dist/handlers/missing-handler.js#default',
          },
        ],
      },
    });

    const snapshot = createMockSnapshot([
      {
        pluginId: '@kb-labs/test-plugin',
        manifest,
        pluginRoot: '/mock/plugins/test',
      },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    // Should mount only valid routes
    expect(readiness.pluginRoutesMounted).toBe(true);
    expect(readiness.pluginRoutesCount).toBe(1);
    expect(readiness.pluginRouteErrors).toBe(0);
  });

  it('handles invalid handler references gracefully', async () => {
    const manifest = createMockManifest({
      rest: {
        routes: [
          {
            method: 'GET',
            path: '/broken',
            handler: '', // Invalid: empty handler
          },
        ],
      },
    });

    const snapshot = createMockSnapshot([
      {
        pluginId: '@kb-labs/broken-plugin',
        manifest,
        pluginRoot: '/mock/plugins/broken',
      },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    // Should skip plugin entirely due to validation errors
    expect(readiness.pluginRoutesCount).toBe(0);
    expect(readiness.pluginRouteErrors).toBe(1);
    expect(readiness.pluginRouteFailures).toHaveLength(1);
    expect(readiness.pluginRouteFailures[0]?.error).toContain('rest_validation_failed');
  });

  it('mounts multiple plugins in parallel', async () => {
    const plugin1 = createMockManifest({
      id: '@kb-labs/plugin-1',
      rest: {
        routes: [
          { method: 'GET', path: '/one', handler: './dist/one.js#default' },
        ],
      },
    });

    const plugin2 = createMockManifest({
      id: '@kb-labs/plugin-2',
      rest: {
        routes: [
          { method: 'POST', path: '/two', handler: './dist/two.js#default' },
          { method: 'PUT', path: '/three', handler: './dist/three.js#default' },
        ],
      },
    });

    const snapshot = createMockSnapshot([
      { pluginId: '@kb-labs/plugin-1', manifest: plugin1, pluginRoot: '/mock/p1' },
      { pluginId: '@kb-labs/plugin-2', manifest: plugin2, pluginRoot: '/mock/p2' },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    expect(readiness.pluginRoutesMounted).toBe(true);
    expect(readiness.pluginRoutesCount).toBe(3); // 1 + 2
    expect(readiness.pluginRouteErrors).toBe(0);
  });

  it('continues mounting other plugins when one fails', async () => {
    const { mountRoutes } = await import('@kb-labs/plugin-execution/http');
    const mountRoutesMock = vi.mocked(mountRoutes);

    // Make first plugin fail, second succeed
    mountRoutesMock
      .mockRejectedValueOnce(new Error('Mount failed for plugin-1'))
      .mockResolvedValueOnce(undefined);

    const plugin1 = createMockManifest({
      id: '@kb-labs/failing-plugin',
      rest: {
        routes: [{ method: 'GET', path: '/fail', handler: './dist/fail.js#default' }],
      },
    });

    const plugin2 = createMockManifest({
      id: '@kb-labs/working-plugin',
      rest: {
        routes: [{ method: 'GET', path: '/work', handler: './dist/work.js#default' }],
      },
    });

    const snapshot = createMockSnapshot([
      { pluginId: '@kb-labs/failing-plugin', manifest: plugin1, pluginRoot: '/mock/p1' },
      { pluginId: '@kb-labs/working-plugin', manifest: plugin2, pluginRoot: '/mock/p2' },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    expect(readiness.pluginRoutesCount).toBe(1); // Only plugin2 succeeded
    expect(readiness.pluginRouteErrors).toBe(1);
    expect(readiness.pluginRouteFailures).toHaveLength(1);
    expect(readiness.pluginRouteFailures[0]?.id).toBe('@kb-labs/failing-plugin');
  });

  it('handles partial/stale registry snapshots', async () => {
    const manifest = createMockManifest({
      rest: {
        routes: [{ method: 'GET', path: '/test', handler: './dist/test.js#default' }],
      },
    });

    const snapshot = createMockSnapshot([
      { pluginId: '@kb-labs/test', manifest, pluginRoot: '/mock/test' },
    ]);
    snapshot.partial = true;
    snapshot.stale = true;

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    // Should still mount routes but log warnings
    expect(readiness.pluginRoutesMounted).toBe(true);
    expect(readiness.pluginRoutesCount).toBe(1);
  });

  it('uses custom basePath from manifest.rest.basePath', async () => {
    const { mountRoutes } = await import('@kb-labs/plugin-execution/http');
    const mountRoutesMock = vi.mocked(mountRoutes);

    const manifest = createMockManifest({
      id: '@kb-labs/custom-base',
      rest: {
        basePath: '/v1/custom',
        routes: [{ method: 'GET', path: '/test', handler: './dist/test.js#default' }],
      },
    });

    const snapshot = createMockSnapshot([
      { pluginId: '@kb-labs/custom-base', manifest, pluginRoot: '/mock/custom' },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    expect(mountRoutesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        basePath: '/api/v1/custom', // Should replace /v1 with config.basePath
      })
    );
  });

  it('falls back to default basePath when manifest does not specify one', async () => {
    const { mountRoutes } = await import('@kb-labs/plugin-execution/http');
    const mountRoutesMock = vi.mocked(mountRoutes);

    const manifest = createMockManifest({
      id: '@kb-labs/default-base',
      rest: {
        routes: [{ method: 'GET', path: '/test', handler: './dist/test.js#default' }],
      },
    });

    const snapshot = createMockSnapshot([
      { pluginId: '@kb-labs/default-base', manifest, pluginRoot: '/mock/default' },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    expect(mountRoutesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        basePath: '/api/v1/plugins/@kb-labs/default-base',
      })
    );
  });

  it('handles discovery failure gracefully', async () => {
    const cliApi = {
      snapshot: vi.fn(() => {
        throw new Error('Registry unavailable');
      }),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    expect(readiness.pluginRoutesMounted).toBe(false);
    expect(readiness.pluginRoutesCount).toBe(0);
    expect(readiness.pluginRouteErrors).toBe(1);
    expect(readiness.pluginRouteFailures).toHaveLength(1);
    expect(readiness.pluginRouteFailures[0]?.id).toBe('discovery');
  });

  it('works without readiness tracking', async () => {
    const manifest = createMockManifest({
      rest: {
        routes: [{ method: 'GET', path: '/test', handler: './dist/test.js#default' }],
      },
    });

    const snapshot = createMockSnapshot([
      { pluginId: '@kb-labs/test', manifest, pluginRoot: '/mock/test' },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    // No readiness object passed
    await expect(
      registerPluginRoutes(app, BASE_CONFIG, '/mock/repo', cliApi)
    ).resolves.not.toThrow();
  });

  it('registers route budgets for metrics tracking', async () => {
    const { metricsCollector } = await import('../middleware/metrics');
    const registerBudgetMock = vi.mocked(metricsCollector.registerRouteBudget);

    const manifest = createMockManifest({
      id: '@kb-labs/metrics-test',
      rest: {
        basePath: '/v1/metrics',
        routes: [
          {
            method: 'GET',
            path: '/fast',
            handler: './dist/fast.js#default',
            timeoutMs: 5000,
          },
          {
            method: 'POST',
            path: '/slow',
            handler: './dist/slow.js#default',
            // Uses default timeout
          },
        ],
      },
    });

    const snapshot = createMockSnapshot([
      { pluginId: '@kb-labs/metrics-test', manifest, pluginRoot: '/mock/metrics' },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRoutes(
      app,
      BASE_CONFIG,
      '/mock/repo',
      cliApi,
      readiness
    );

    expect(registerBudgetMock).toHaveBeenCalledWith(
      'GET',
      '/api/v1/metrics/fast',
      5000,
      '@kb-labs/metrics-test'
    );

    expect(registerBudgetMock).toHaveBeenCalledWith(
      'POST',
      '/api/v1/metrics/slow',
      30000, // Default from config
      '@kb-labs/metrics-test'
    );
  });
});

describe('registerPluginRegistry', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns plugin registry from legacy endpoint', async () => {
    const manifest1 = createMockManifest({
      id: '@kb-labs/plugin-1',
      name: 'Plugin One',
    });

    const manifest2 = createMockManifest({
      id: '@kb-labs/plugin-2',
      name: 'Plugin Two',
    });

    const snapshot = createMockSnapshot([
      { pluginId: '@kb-labs/plugin-1', manifest: manifest1, pluginRoot: '/p1', source: 'workspace' },
      { pluginId: '@kb-labs/plugin-2', manifest: manifest2, pluginRoot: '/p2', source: 'npm' },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRegistry(app, BASE_CONFIG, cliApi);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/registry',
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { manifests: any[] };
    expect(payload.manifests).toHaveLength(2);
    expect(payload.manifests[0]).toMatchObject({
      pluginId: '@kb-labs/plugin-1',
      manifest: expect.objectContaining({ id: '@kb-labs/plugin-1' }),
      pluginRoot: '/p1',
      source: 'workspace',
    });
  });

  it('returns studio registry from new endpoint', async () => {
    const manifest1 = createMockManifest({
      id: '@kb-labs/studio-plugin',
      studio: {
        widgets: [
          {
            id: 'test-widget',
            name: 'Test Widget',
            version: '1.0.0',
            type: 'panel',
            component: './dist/widget.js#Widget',
          },
        ],
      },
    });

    const manifest2 = createMockManifest({
      id: '@kb-labs/no-studio',
      // No studio config
    });

    const snapshot = createMockSnapshot([
      { pluginId: '@kb-labs/studio-plugin', manifest: manifest1, pluginRoot: '/s1' },
      { pluginId: '@kb-labs/no-studio', manifest: manifest2, pluginRoot: '/s2' },
    ]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRegistry(app, BASE_CONFIG, cliApi);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/studio/registry',
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.rev).toBe('1');
    expect(payload.widgets).toBeDefined();
    // Should only include studio-enabled plugins
  });

  it('handles registry errors gracefully', async () => {
    const cliApi = {
      snapshot: vi.fn(() => {
        throw new Error('Registry service unavailable');
      }),
    } as unknown as CliAPI;

    await registerPluginRegistry(app, BASE_CONFIG, cliApi);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/registry',
    });

    expect(response.statusCode).toBe(500);
    const payload = response.json() as { error: string; message: string };
    expect(payload.error).toBe('Failed to load plugin registry');
    expect(payload.message).toContain('Registry service unavailable');
  });

  it('handles studio registry generation errors', async () => {
    const cliApi = {
      snapshot: vi.fn(() => {
        throw new Error('Studio registry generation failed');
      }),
    } as unknown as CliAPI;

    await registerPluginRegistry(app, BASE_CONFIG, cliApi);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/studio/registry',
    });

    expect(response.statusCode).toBe(500);
    const payload = response.json() as { error: string; message: string };
    expect(payload.error).toBe('Failed to generate studio registry');
    expect(payload.message).toContain('Studio registry generation failed');
  });

  it('returns empty manifests when registry is empty', async () => {
    const snapshot = createMockSnapshot([]);

    const cliApi = {
      snapshot: vi.fn(() => snapshot),
    } as unknown as CliAPI;

    await registerPluginRegistry(app, BASE_CONFIG, cliApi);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/registry',
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { manifests: any[] };
    expect(payload.manifests).toEqual([]);
  });
});
