import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { AnalyticsAdapter, AnalyticsEvent } from '@kb-labs/plugin-contracts';
import * as coreRuntime from '@kb-labs/core-runtime';

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

/**
 * Create mock analytics events with kb.v1 schema
 */
function createMockEvent(
  type: string,
  timestamp: string,
  payload: Record<string, unknown>
): AnalyticsEvent {
  return {
    schema: 'kb.v1',
    type,
    ts: timestamp,
    payload,
    actor: 'test-user',
    source: 'test-source',
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

describe('Adapter Analytics Routes - Date Range Support', () => {
  describe('GET /api/v1/adapters/llm/usage', () => {
    it('should return LLM usage stats without date range', async () => {
      const completedEvents: AnalyticsEvent[] = [
        createMockEvent('llm.completion.completed', '2026-01-15T10:00:00Z', {
          model: 'gpt-4',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.01,
          durationMs: 1000,
        }),
        createMockEvent('llm.completion.completed', '2026-01-16T10:00:00Z', {
          model: 'gpt-4',
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          cost: 0.02,
          durationMs: 1500,
        }),
      ];

      const errorEvents: AnalyticsEvent[] = [
        createMockEvent('llm.completion.error', '2026-01-17T10:00:00Z', {
          model: 'gpt-4',
          error: 'Rate limit exceeded',
        }),
      ];

      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn((query) => {
          if (query.type === 'llm.completion.completed') {
            return Promise.resolve(completedEvents);
          }
          if (query.type === 'llm.completion.error') {
            return Promise.resolve(errorEvents);
          }
          return Promise.resolve([]);
        }),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/llm/usage',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.ok).toBe(true);
      expect(payload.data.totalRequests).toBe(2);
      expect(payload.data.totalTokens).toBe(450);
      expect(payload.data.totalCost).toBe(0.03);
      expect(payload.data.errors).toBe(1);
      expect(mockAnalytics.getEvents).toHaveBeenCalledWith({
        type: 'llm.completion.completed',
        from: undefined,
        to: undefined,
        limit: 10000,
      });

      await app.close();
    });

    it('should return LLM usage stats with date range', async () => {
      const completedEvents: AnalyticsEvent[] = [
        createMockEvent('llm.completion.completed', '2026-01-15T10:00:00Z', {
          model: 'gpt-4',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.01,
          durationMs: 1000,
        }),
      ];

      const errorEvents: AnalyticsEvent[] = [];

      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn((query) => {
          expect(query.from).toBe('2026-01-01T00:00:00Z');
          expect(query.to).toBe('2026-01-31T23:59:59Z');

          if (query.type === 'llm.completion.completed') {
            return Promise.resolve(completedEvents);
          }
          if (query.type === 'llm.completion.error') {
            return Promise.resolve(errorEvents);
          }
          return Promise.resolve([]);
        }),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/llm/usage?from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.ok).toBe(true);
      expect(payload.data.totalRequests).toBe(1);
      expect(payload.data.totalTokens).toBe(150);
      expect(mockAnalytics.getEvents).toHaveBeenCalledWith({
        type: 'llm.completion.completed',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-31T23:59:59Z',
        limit: 10000,
      });

      await app.close();
    });

    it('should return 400 for invalid from date', async () => {
      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn(),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/llm/usage?from=invalid-date',
      });

      expect(response.statusCode).toBe(400);
      const payload = response.json();
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('INVALID_DATE_RANGE');
      expect(payload.error.message).toContain('Invalid "from" date format');

      await app.close();
    });

    it('should return 400 for invalid to date', async () => {
      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn(),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/llm/usage?to=not-a-date',
      });

      expect(response.statusCode).toBe(400);
      const payload = response.json();
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('INVALID_DATE_RANGE');
      expect(payload.error.message).toContain('Invalid "to" date format');

      await app.close();
    });

    it('should return 501 when analytics does not support getEvents', async () => {
      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        // getEvents not implemented
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/llm/usage',
      });

      expect(response.statusCode).toBe(501);
      const payload = response.json();
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('ANALYTICS_NOT_IMPLEMENTED');

      await app.close();
    });
  });

  describe('GET /api/v1/adapters/embeddings/usage', () => {
    it('should return embeddings usage stats with date range', async () => {
      const embeddingEvents: AnalyticsEvent[] = [
        createMockEvent('embeddings.generate.completed', '2026-01-15T10:00:00Z', {
          model: 'text-embedding-ada-002',
          tokens: 500,
          cost: 0.001,
          durationMs: 200,
          dimensions: 1536,
        }),
      ];

      const errorEvents: AnalyticsEvent[] = [];

      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn((query) => {
          expect(query.from).toBe('2026-01-01T00:00:00Z');
          expect(query.to).toBe('2026-01-31T23:59:59Z');

          if (query.type === 'embeddings.generate.completed') {
            return Promise.resolve(embeddingEvents);
          }
          if (query.type === 'embeddings.generate.error') {
            return Promise.resolve(errorEvents);
          }
          return Promise.resolve([]);
        }),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/embeddings/usage?from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.ok).toBe(true);
      expect(payload.data.totalRequests).toBe(1);
      expect(payload.data.totalTokens).toBe(500);

      await app.close();
    });

    it('should return 400 for invalid date range', async () => {
      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn(),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/embeddings/usage?from=invalid&to=also-invalid',
      });

      expect(response.statusCode).toBe(400);
      const payload = response.json();
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('INVALID_DATE_RANGE');

      await app.close();
    });
  });

  describe('GET /api/v1/adapters/vectorstore/usage', () => {
    it('should return vectorstore usage stats with date range', async () => {
      const searchEvents: AnalyticsEvent[] = [
        createMockEvent('vectorstore.search.completed', '2026-01-15T10:00:00Z', {
          durationMs: 50,
          resultsCount: 5,
        }),
      ];

      const upsertEvents: AnalyticsEvent[] = [
        createMockEvent('vectorstore.upsert.completed', '2026-01-15T11:00:00Z', {
          durationMs: 100,
          vectorCount: 10,
        }),
      ];

      const deleteEvents: AnalyticsEvent[] = [];

      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn((query) => {
          expect(query.from).toBe('2026-01-01T00:00:00Z');
          expect(query.to).toBe('2026-01-31T23:59:59Z');

          if (query.type === 'vectorstore.search.completed') {
            return Promise.resolve(searchEvents);
          }
          if (query.type === 'vectorstore.upsert.completed') {
            return Promise.resolve(upsertEvents);
          }
          if (query.type === 'vectorstore.delete.completed') {
            return Promise.resolve(deleteEvents);
          }
          return Promise.resolve([]);
        }),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/vectorstore/usage?from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.ok).toBe(true);
      expect(payload.data.searchOperations).toBe(1);
      expect(payload.data.upsertOperations).toBe(1);
      expect(payload.data.deleteOperations).toBe(0);

      await app.close();
    });

    it('should return 400 for invalid date', async () => {
      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn(),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/vectorstore/usage?from=2026-13-45T99:99:99Z',
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });
  });

  describe('GET /api/v1/adapters/cache/usage', () => {
    it('should return cache usage stats with date range', async () => {
      const hitEvents: AnalyticsEvent[] = [
        createMockEvent('cache.hit', '2026-01-15T10:00:00Z', {
          durationMs: 1,
        }),
        createMockEvent('cache.hit', '2026-01-15T11:00:00Z', {
          durationMs: 2,
        }),
      ];

      const missEvents: AnalyticsEvent[] = [
        createMockEvent('cache.miss', '2026-01-15T12:00:00Z', {
          durationMs: 1,
        }),
      ];

      const setEvents: AnalyticsEvent[] = [
        createMockEvent('cache.set', '2026-01-15T13:00:00Z', {
          durationMs: 5,
        }),
      ];

      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn((query) => {
          expect(query.from).toBe('2026-01-01T00:00:00Z');
          expect(query.to).toBe('2026-01-31T23:59:59Z');

          if (query.type === 'cache.hit') {
            return Promise.resolve(hitEvents);
          }
          if (query.type === 'cache.miss') {
            return Promise.resolve(missEvents);
          }
          if (query.type === 'cache.set') {
            return Promise.resolve(setEvents);
          }
          return Promise.resolve([]);
        }),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/cache/usage?from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.ok).toBe(true);
      expect(payload.data.hits).toBe(2);
      expect(payload.data.misses).toBe(1);
      expect(payload.data.sets).toBe(1);
      expect(payload.data.totalGets).toBe(3);
      expect(payload.data.hitRate).toBeCloseTo(66.67, 1);

      await app.close();
    });

    it('should work without date parameters for backward compatibility', async () => {
      const hitEvents: AnalyticsEvent[] = [
        createMockEvent('cache.hit', '2026-01-15T10:00:00Z', {
          durationMs: 1,
        }),
      ];

      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn((query) => {
          expect(query.from).toBeUndefined();
          expect(query.to).toBeUndefined();

          if (query.type === 'cache.hit') {
            return Promise.resolve(hitEvents);
          }
          return Promise.resolve([]);
        }),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/cache/usage',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });
  });

  describe('GET /api/v1/adapters/storage/usage', () => {
    it('should return storage usage stats with date range', async () => {
      const readEvents: AnalyticsEvent[] = [
        createMockEvent('storage.read.completed', '2026-01-15T10:00:00Z', {
          durationMs: 10,
          bytesRead: 1024,
        }),
      ];

      const writeEvents: AnalyticsEvent[] = [
        createMockEvent('storage.write.completed', '2026-01-15T11:00:00Z', {
          durationMs: 20,
          bytesWritten: 2048,
        }),
      ];

      const deleteEvents: AnalyticsEvent[] = [];

      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn((query) => {
          expect(query.from).toBe('2026-01-01T00:00:00Z');
          expect(query.to).toBe('2026-01-31T23:59:59Z');

          if (query.type === 'storage.read.completed') {
            return Promise.resolve(readEvents);
          }
          if (query.type === 'storage.write.completed') {
            return Promise.resolve(writeEvents);
          }
          if (query.type === 'storage.delete.completed') {
            return Promise.resolve(deleteEvents);
          }
          return Promise.resolve([]);
        }),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/storage/usage?from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.ok).toBe(true);
      expect(payload.data.readOperations).toBe(1);
      expect(payload.data.writeOperations).toBe(1);
      expect(payload.data.deleteOperations).toBe(0);
      expect(payload.data.totalBytesRead).toBe(1024);
      expect(payload.data.totalBytesWritten).toBe(2048);

      await app.close();
    });

    it('should handle only from parameter', async () => {
      const readEvents: AnalyticsEvent[] = [];

      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn((query) => {
          expect(query.from).toBe('2026-01-01T00:00:00Z');
          expect(query.to).toBeUndefined();

          return Promise.resolve(readEvents);
        }),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/storage/usage?from=2026-01-01T00:00:00Z',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should handle only to parameter', async () => {
      const readEvents: AnalyticsEvent[] = [];

      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn((query) => {
          expect(query.from).toBeUndefined();
          expect(query.to).toBe('2026-01-31T23:59:59Z');

          return Promise.resolve(readEvents);
        }),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/storage/usage?to=2026-01-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });
  });

  describe('Date format support', () => {
    it('should accept ISO 8601 with milliseconds', async () => {
      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn(() => Promise.resolve([])),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/llm/usage?from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.999Z',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should accept ISO 8601 with timezone offset', async () => {
      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn(() => Promise.resolve([])),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/llm/usage?from=2026-01-01T00:00:00%2B03:00&to=2026-01-31T23:59:59-05:00',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should accept short ISO 8601 date format', async () => {
      const mockAnalytics: AnalyticsAdapter = {
        recordEvent: vi.fn(),
        getEvents: vi.fn(() => Promise.resolve([])),
      };

      vi.spyOn(coreRuntime, 'platform', 'get').mockReturnValue({
        analytics: mockAnalytics,
      } as any);

      const { registerAdaptersRoutes } = await import('../adapters');
      const app = Fastify({ logger: false }) as unknown as FastifyInstance;
      await registerAdaptersRoutes(app, BASE_CONFIG);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/adapters/llm/usage?from=2026-01-01&to=2026-01-31',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });
  });
});
