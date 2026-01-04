/**
 * @module @kb-labs/rest-api-app/routes/adapters
 * Platform adapter analytics endpoints
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { normalizeBasePath, resolvePaths } from '../utils/path-helpers';
import { platform } from '@kb-labs/core-runtime';

/**
 * LLM usage statistics response
 */
interface LLMUsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byModel: Record<
    string,
    {
      requests: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost: number;
      avgDurationMs: number;
    }
  >;
  errors: number;
  timeRange: {
    from: string;
    to: string;
  };
}

/**
 * Helper to get event data, supporting both kb.v1 (payload) and legacy (properties) formats
 */
function getEventData(event: any): Record<string, unknown> {
  // kb.v1 format uses 'payload'
  if (event.schema === 'kb.v1' && event.payload) {
    return event.payload as Record<string, unknown>;
  }
  // Legacy format uses 'properties'
  return (event.properties as Record<string, unknown>) || {};
}

/**
 * Extract date range from query parameters
 */
function extractDateRange(query: any): { from?: string; to?: string } {
  // Handle null/undefined query
  if (!query) {
    return { from: undefined, to: undefined };
  }

  const from = query.from as string | undefined;
  const to = query.to as string | undefined;

  // Validate ISO 8601 format
  if (from && !isValidISODate(from)) {
    throw new Error('Invalid "from" date format. Expected ISO 8601 datetime (e.g., 2026-01-01T00:00:00Z)');
  }
  if (to && !isValidISODate(to)) {
    throw new Error('Invalid "to" date format. Expected ISO 8601 datetime (e.g., 2026-01-31T23:59:59Z)');
  }

  return { from, to };
}

/**
 * Basic ISO 8601 validation
 */
function isValidISODate(dateString: string): boolean {
  // Check if it's a string
  if (typeof dateString !== 'string' || dateString.length === 0) {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Register platform adapter analytics routes
 */
export async function registerAdaptersRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  // GET /api/v1/adapters/llm/usage
  // Returns aggregated LLM usage statistics
  const llmUsagePaths = resolvePaths(basePath, '/adapters/llm/usage');
  for (const path of llmUsagePaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      // Check if analytics supports reading
      if (!analytics.getEvents) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'ANALYTICS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support reading events',
          },
        });
      }

      try {
        // Extract and validate date range
        const dateRange = extractDateRange(request.query);

        // Fetch LLM completion events
        const completedEvents = await analytics.getEvents({
          type: 'llm.completion.completed',
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000, // TODO: Pagination
        });

        const errorEvents = await analytics.getEvents({
          type: 'llm.completion.error',
          from: dateRange.from,
          to: dateRange.to,
          limit: 1000,
        });

        // Debug logging
        fastify.log.debug('LLM analytics query results', {
          completedCount: completedEvents.events.length,
          completedTotal: completedEvents.total,
          errorCount: errorEvents.events.length,
          sampleEvent: completedEvents.events[0] ? {
            schema: (completedEvents.events[0] as any).schema,
            type: completedEvents.events[0].type,
            hasPayload: !!(completedEvents.events[0] as any).payload,
            hasProperties: !!(completedEvents.events[0] as any).properties,
          } : null,
        });

        // Aggregate statistics
        const stats: LLMUsageStats = {
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          byModel: {},
          errors: errorEvents.events.length,
          timeRange: {
            from: '',
            to: '',
          },
        };

        // Process completed events
        for (const event of completedEvents.events) {
          const props = getEventData(event);

          const model = (props.model || 'unknown') as string;
          const promptTokens = Number(props.promptTokens || 0);
          const completionTokens = Number(props.completionTokens || 0);
          const totalTokens = Number(props.totalTokens || promptTokens + completionTokens);
          const estimatedCost = Number(props.estimatedCost || 0);
          const durationMs = Number(props.durationMs || 0);

          stats.totalRequests++;
          stats.totalTokens += totalTokens;
          stats.totalCost += estimatedCost;

          if (!stats.byModel[model]) {
            stats.byModel[model] = {
              requests: 0,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              cost: 0,
              avgDurationMs: 0,
            };
          }

          const modelStats = stats.byModel[model]!;
          modelStats.requests++;
          modelStats.promptTokens += promptTokens;
          modelStats.completionTokens += completionTokens;
          modelStats.totalTokens += totalTokens;
          modelStats.cost += estimatedCost;
          modelStats.avgDurationMs =
            (modelStats.avgDurationMs * (modelStats.requests - 1) + durationMs) / modelStats.requests;
        }

        // Calculate time range
        const allTimestamps = completedEvents.events.map((e) => e.ts);
        if (allTimestamps.length > 0) {
          stats.timeRange.from = allTimestamps[allTimestamps.length - 1]!; // oldest
          stats.timeRange.to = allTimestamps[0]!; // newest
        }

        return {
          ok: true,
          data: stats,
          meta: {
            source: 'analytics-adapter',
            totalEvents: completedEvents.total,
          },
        };
      } catch (error) {
        // Handle validation errors
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        fastify.log.error({ err: error }, 'Failed to fetch LLM usage stats');

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'LLM_USAGE_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch LLM usage statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/llm/daily-stats
  // Returns daily aggregated LLM statistics for time-series visualization
  const llmDailyStatsPaths = resolvePaths(basePath, '/adapters/llm/daily-stats');
  for (const path of llmDailyStatsPaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getDailyStats) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support daily statistics',
          },
        });
      }

      try {
        const dateRange = extractDateRange(request.query);

        const dailyStats = await analytics.getDailyStats({
          type: 'llm.completion.completed',
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000,
        });

        return reply.send({
          ok: true,
          data: dailyStats,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch daily statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/embeddings/daily-stats
  // Returns daily aggregated Embeddings statistics for time-series visualization
  const embeddingsDailyStatsPaths = resolvePaths(basePath, '/adapters/embeddings/daily-stats');
  for (const path of embeddingsDailyStatsPaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getDailyStats) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support daily statistics',
          },
        });
      }

      try {
        const dateRange = extractDateRange(request.query);

        const dailyStats = await analytics.getDailyStats({
          type: ['embeddings.embed.completed', 'embeddings.embedBatch.completed'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000,
        });

        return reply.send({
          ok: true,
          data: dailyStats,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch daily statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/embeddings/usage
  // Returns aggregated Embeddings usage statistics
  const embeddingsUsagePaths = resolvePaths(basePath, '/adapters/embeddings/usage');
  for (const path of embeddingsUsagePaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getEvents) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'ANALYTICS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support reading events',
          },
        });
      }

      try {
        // Extract and validate date range
        const dateRange = extractDateRange(request.query);

        const completedEvents = await analytics.getEvents({
          type: ['embeddings.embed.completed', 'embeddings.embedBatch.completed'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000,
        });

        const errorEvents = await analytics.getEvents({
          type: ['embeddings.embed.error', 'embeddings.embedBatch.error'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 1000,
        });

        const stats = {
          totalRequests: completedEvents.events.length,
          totalTextLength: 0,
          totalCost: 0,
          errors: errorEvents.events.length,
          avgDurationMs: 0,
          batchRequests: 0,
          singleRequests: 0,
          avgBatchSize: 0,
        };

        let totalDuration = 0;
        let totalBatchSize = 0;

        for (const event of completedEvents.events) {
          const props = getEventData(event);

          const textLength = Number(props.textLength || props.totalTextLength || 0);
          const cost = Number(props.estimatedCost || 0);
          const duration = Number(props.durationMs || 0);
          const batchSize = Number(props.batchSize || 1);

          stats.totalTextLength += textLength;
          stats.totalCost += cost;
          totalDuration += duration;

          if (batchSize > 1) {
            stats.batchRequests++;
            totalBatchSize += batchSize;
          } else {
            stats.singleRequests++;
          }
        }

        stats.avgDurationMs = stats.totalRequests > 0 ? totalDuration / stats.totalRequests : 0;
        stats.avgBatchSize = stats.batchRequests > 0 ? totalBatchSize / stats.batchRequests : 0;

        return { ok: true, data: stats, meta: { source: 'analytics-adapter' } };
      } catch (error) {
        // Handle validation errors
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        fastify.log.error({ err: error }, 'Failed to fetch Embeddings usage stats');
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'EMBEDDINGS_USAGE_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch embeddings statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/vectorstore/daily-stats
  // Returns daily aggregated VectorStore statistics for time-series visualization
  const vectorstoreDailyStatsPaths = resolvePaths(basePath, '/adapters/vectorstore/daily-stats');
  for (const path of vectorstoreDailyStatsPaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getDailyStats) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support daily statistics',
          },
        });
      }

      try {
        const dateRange = extractDateRange(request.query);

        const dailyStats = await analytics.getDailyStats({
          type: ['vectorstore.search.completed', 'vectorstore.upsert.completed', 'vectorstore.delete.completed'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000,
        });

        return reply.send({
          ok: true,
          data: dailyStats,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch daily statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/vectorstore/usage
  // Returns aggregated VectorStore usage statistics
  const vectorstoreUsagePaths = resolvePaths(basePath, '/adapters/vectorstore/usage');
  for (const path of vectorstoreUsagePaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getEvents) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'ANALYTICS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support reading events',
          },
        });
      }

      try {
        // Extract and validate date range
        const dateRange = extractDateRange(request.query);

        const searchEvents = await analytics.getEvents({
          type: 'vectorstore.search.completed',
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000,
        });

        const upsertEvents = await analytics.getEvents({
          type: 'vectorstore.upsert.completed',
          from: dateRange.from,
          to: dateRange.to,
          limit: 1000,
        });

        const deleteEvents = await analytics.getEvents({
          type: 'vectorstore.delete.completed',
          from: dateRange.from,
          to: dateRange.to,
          limit: 1000,
        });

        const stats = {
          searchQueries: searchEvents.events.length,
          upsertOperations: upsertEvents.events.length,
          deleteOperations: deleteEvents.events.length,
          avgSearchDuration: 0,
          avgSearchScore: 0,
          avgResultsCount: 0,
          totalVectorsUpserted: 0,
          totalVectorsDeleted: 0,
        };

        let totalSearchDuration = 0;
        let totalSearchScore = 0;
        let totalResultsCount = 0;

        for (const event of searchEvents.events) {
          const props = getEventData(event);

          const duration = Number(props.durationMs || 0);
          const avgScore = Number(props.avgScore || 0);
          const resultsCount = Number(props.resultsCount || 0);

          totalSearchDuration += duration;
          totalSearchScore += avgScore;
          totalResultsCount += resultsCount;
        }

        stats.avgSearchDuration = stats.searchQueries > 0 ? totalSearchDuration / stats.searchQueries : 0;
        stats.avgSearchScore = stats.searchQueries > 0 ? totalSearchScore / stats.searchQueries : 0;
        stats.avgResultsCount = stats.searchQueries > 0 ? totalResultsCount / stats.searchQueries : 0;

        for (const event of upsertEvents.events) {
          const props = getEventData(event);
          stats.totalVectorsUpserted += Number(props.vectorCount || 0);
        }

        for (const event of deleteEvents.events) {
          const props = getEventData(event);
          stats.totalVectorsDeleted += Number(props.idsCount || 0);
        }

        return { ok: true, data: stats, meta: { source: 'analytics-adapter' } };
      } catch (error) {
        // Handle validation errors
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        fastify.log.error({ err: error }, 'Failed to fetch VectorStore usage stats');
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'VECTORSTORE_USAGE_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch vectorstore statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/cache/daily-stats
  // Returns daily aggregated Cache statistics for time-series visualization
  const cacheDailyStatsPaths = resolvePaths(basePath, '/adapters/cache/daily-stats');
  for (const path of cacheDailyStatsPaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getDailyStats) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support daily statistics',
          },
        });
      }

      try {
        const dateRange = extractDateRange(request.query);

        const dailyStats = await analytics.getDailyStats({
          type: ['cache.get.hit', 'cache.get.miss', 'cache.set.completed'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000,
        });

        return reply.send({
          ok: true,
          data: dailyStats,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch daily statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/cache/usage
  // Returns aggregated Cache usage statistics
  const cacheUsagePaths = resolvePaths(basePath, '/adapters/cache/usage');
  for (const path of cacheUsagePaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getEvents) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'ANALYTICS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support reading events',
          },
        });
      }

      try {
        // Extract and validate date range
        const dateRange = extractDateRange(request.query);

        const hitEvents = await analytics.getEvents({
          type: 'cache.get.hit',
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000
        });
        const missEvents = await analytics.getEvents({
          type: 'cache.get.miss',
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000
        });
        const setEvents = await analytics.getEvents({
          type: 'cache.set.completed',
          from: dateRange.from,
          to: dateRange.to,
          limit: 1000
        });

        const totalGets = hitEvents.events.length + missEvents.events.length;
        const hitRate = totalGets > 0 ? (hitEvents.events.length / totalGets) * 100 : 0;

        const stats = {
          totalGets,
          hits: hitEvents.events.length,
          misses: missEvents.events.length,
          hitRate,
          sets: setEvents.events.length,
          avgGetDuration: 0,
          avgSetDuration: 0,
        };

        let totalGetDuration = 0;
        for (const event of [...hitEvents.events, ...missEvents.events]) {
          const props = getEventData(event);
          totalGetDuration += Number(props.durationMs || 0);
        }
        stats.avgGetDuration = totalGets > 0 ? totalGetDuration / totalGets : 0;

        let totalSetDuration = 0;
        for (const event of setEvents.events) {
          const props = getEventData(event);
          totalSetDuration += Number(props.durationMs || 0);
        }
        stats.avgSetDuration = stats.sets > 0 ? totalSetDuration / stats.sets : 0;

        return { ok: true, data: stats, meta: { source: 'analytics-adapter' } };
      } catch (error) {
        // Handle validation errors
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        fastify.log.error({ err: error }, 'Failed to fetch Cache usage stats');
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'CACHE_USAGE_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch cache statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/storage/daily-stats
  // Returns daily aggregated Storage statistics for time-series visualization
  const storageDailyStatsPaths = resolvePaths(basePath, '/adapters/storage/daily-stats');
  for (const path of storageDailyStatsPaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getDailyStats) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support daily statistics',
          },
        });
      }

      try {
        const dateRange = extractDateRange(request.query);

        const dailyStats = await analytics.getDailyStats({
          type: ['storage.read.completed', 'storage.write.completed', 'storage.delete.completed'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000,
        });

        return reply.send({
          ok: true,
          data: dailyStats,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch daily statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/storage/usage
  // Returns aggregated Storage usage statistics
  const storageUsagePaths = resolvePaths(basePath, '/adapters/storage/usage');
  for (const path of storageUsagePaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getEvents) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'ANALYTICS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support reading events',
          },
        });
      }

      try {
        // Extract and validate date range
        const dateRange = extractDateRange(request.query);

        const readEvents = await analytics.getEvents({
          type: 'storage.read.completed',
          from: dateRange.from,
          to: dateRange.to,
          limit: 10000
        });
        const writeEvents = await analytics.getEvents({
          type: 'storage.write.completed',
          from: dateRange.from,
          to: dateRange.to,
          limit: 1000
        });
        const deleteEvents = await analytics.getEvents({
          type: 'storage.delete.completed',
          from: dateRange.from,
          to: dateRange.to,
          limit: 1000
        });

        const stats = {
          readOperations: readEvents.events.length,
          writeOperations: writeEvents.events.length,
          deleteOperations: deleteEvents.events.length,
          totalBytesRead: 0,
          totalBytesWritten: 0,
          avgReadDuration: 0,
          avgWriteDuration: 0,
        };

        let totalReadDuration = 0;
        for (const event of readEvents.events) {
          const props = getEventData(event);
          stats.totalBytesRead += Number(props.bytesRead || 0);
          totalReadDuration += Number(props.durationMs || 0);
        }
        stats.avgReadDuration = stats.readOperations > 0 ? totalReadDuration / stats.readOperations : 0;

        let totalWriteDuration = 0;
        for (const event of writeEvents.events) {
          const props = getEventData(event);
          stats.totalBytesWritten += Number(props.bytesWritten || 0);
          totalWriteDuration += Number(props.durationMs || 0);
        }
        stats.avgWriteDuration = stats.writeOperations > 0 ? totalWriteDuration / stats.writeOperations : 0;

        return { ok: true, data: stats, meta: { source: 'analytics-adapter' } };
      } catch (error) {
        // Handle validation errors
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        fastify.log.error({ err: error }, 'Failed to fetch Storage usage stats');
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'STORAGE_USAGE_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch storage statistics',
          },
        });
      }
    });
  }

  fastify.log.info('Platform adapter routes registered');
}
