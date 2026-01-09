/**
 * @module @kb-labs/rest-api-app/routes/observability
 * Observability endpoints for monitoring system internals
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { normalizeBasePath, resolvePaths } from '../utils/path-helpers';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { HistoricalMetricsCollector } from '../services/historical-metrics';
import type { IncidentStorage } from '../services/incident-storage';

const execAsync = promisify(exec);

/**
 * Register observability routes
 *
 * These are system-level observability endpoints that expose internal metrics
 * and health information about platform components (State Broker, DevKit, etc.)
 */
export async function registerObservabilityRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string,
  historicalMetrics?: HistoricalMetricsCollector,
  incidentStorage?: IncidentStorage
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);
  const stateBrokerPaths = resolvePaths(basePath, '/observability/state-broker');
  const devkitPaths = resolvePaths(basePath, '/observability/devkit');
  const metricsHistoryPaths = resolvePaths(basePath, '/observability/metrics/history');
  const metricsHeatmapPaths = resolvePaths(basePath, '/observability/metrics/heatmap');
  const incidentsCreatePaths = resolvePaths(basePath, '/observability/incidents');
  const incidentsHistoryPaths = resolvePaths(basePath, '/observability/incidents/history');
  const incidentsResolvePaths = resolvePaths(basePath, '/observability/incidents/:id/resolve');

  // GET /api/v1/observability/state-broker
  // Returns statistics from State Broker daemon (cache hits, namespaces, etc.)
  for (const path of stateBrokerPaths) {
    fastify.get(path, async (_request, reply) => {
      try {
        const stateBrokerUrl = process.env.KB_STATE_DAEMON_URL || 'http://localhost:7777';

        fastify.log.debug({ url: stateBrokerUrl }, 'Fetching State Broker stats');

        const response = await fetch(`${stateBrokerUrl}/stats`, {
          signal: AbortSignal.timeout(5000), // 5s timeout
        });

        if (!response.ok) {
          fastify.log.warn({
            status: response.status,
            url: stateBrokerUrl,
          }, 'State Broker responded with error');

          return reply.code(503).send({
            ok: false,
            error: {
              code: 'STATE_BROKER_UNAVAILABLE',
              message: 'State Broker daemon is not available',
              details: {
                url: stateBrokerUrl,
                status: response.status,
              },
            },
          });
        }

        const stats = await response.json();

        fastify.log.debug({
          totalEntries: stats.totalEntries,
          hitRate: stats.hitRate,
        }, 'State Broker stats retrieved successfully');

        return {
          ok: true,
          data: stats,
          meta: {
            source: 'state-broker',
            daemonUrl: stateBrokerUrl,
          },
        };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to fetch State Broker stats');

        // Check if it's a timeout error
        const isTimeout = error instanceof Error && error.name === 'AbortError';

        return reply.code(503).send({
          ok: false,
          error: {
            code: isTimeout ? 'STATE_BROKER_TIMEOUT' : 'STATE_BROKER_ERROR',
            message: isTimeout
              ? 'State Broker daemon did not respond in time'
              : error instanceof Error ? error.message : 'Unknown error',
            details: {
              isTimeout,
            },
          },
        });
      }
    });
  }

  // GET /api/v1/observability/devkit
  // Returns DevKit health check results (monorepo health score, issues, etc.)
  for (const path of devkitPaths) {
    fastify.get(path, async (_request, reply) => {
      try {
        fastify.log.debug({ cwd: repoRoot }, 'Executing DevKit health check');

        const { stdout, stderr } = await execAsync('npx kb-devkit-health --json', {
          cwd: repoRoot,
          timeout: 30000, // 30s timeout (DevKit can be slow)
          env: {
            ...process.env,
            // Ensure DevKit runs in non-interactive mode
            CI: 'true',
          },
        });

        if (stderr) {
          fastify.log.warn({ stderr }, 'DevKit health check produced warnings');
        }

        const health = JSON.parse(stdout);

        fastify.log.debug({
          healthScore: health.healthScore,
          grade: health.grade,
        }, 'DevKit health check completed');

        return {
          ok: true,
          data: health,
          meta: {
            source: 'devkit-cli',
            repoRoot,
            command: 'npx kb-devkit-health --json',
          },
        };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to execute DevKit health check');

        // Try to parse stdout if available (DevKit might fail but still output JSON)
        let partialData = null;
        if (error && typeof error === 'object' && 'stdout' in error) {
          try {
            partialData = JSON.parse((error as { stdout: string }).stdout);
          } catch {
            // Ignore JSON parse errors
          }
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DEVKIT_ERROR',
            message: error instanceof Error ? error.message : 'Failed to execute DevKit health check',
            details: {
              partialData,
            },
          },
        });
      }
    });
  }

  // GET /api/v1/observability/metrics/history
  // Returns historical time-series metrics data
  for (const path of metricsHistoryPaths) {
    fastify.get(path, {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              enum: ['requests', 'errors', 'latency', 'uptime'],
            },
            range: {
              type: 'string',
              enum: ['1m', '5m', '10m', '30m', '1h'],
            },
            interval: {
              type: 'string',
              enum: ['5s', '1m', '5m'],
            },
          },
          required: ['metric', 'range'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    timestamp: { type: 'number' },
                    value: { type: 'number' },
                  },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  metric: { type: 'string' },
                  range: { type: 'string' },
                  interval: { type: 'string' },
                  points: { type: 'number' },
                },
              },
            },
          },
        },
      },
    }, async (request, reply) => {
      if (!historicalMetrics) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'HISTORICAL_METRICS_UNAVAILABLE',
            message: 'Historical metrics collector is not initialized',
          },
        });
      }

      const query = request.query as {
        metric: 'requests' | 'errors' | 'latency' | 'uptime';
        range: '1m' | '5m' | '10m' | '30m' | '1h';
        interval?: '5s' | '1m' | '5m';
      };

      try {
        fastify.log.debug({ query }, 'Querying historical metrics');

        const data = await historicalMetrics.queryHistory({
          metric: query.metric,
          range: query.range,
          interval: query.interval,
        });

        fastify.log.debug({
          metric: query.metric,
          range: query.range,
          points: data.length,
        }, 'Historical metrics retrieved');

        return {
          ok: true,
          data,
          meta: {
            source: 'historical-metrics-collector',
            metric: query.metric,
            range: query.range,
            interval: query.interval ?? '5s',
            points: data.length,
          },
        };
      } catch (error) {
        fastify.log.error({ err: error, query }, 'Failed to query historical metrics');

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'HISTORICAL_METRICS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to query historical metrics',
          },
        });
      }
    });
  }

  // GET /api/v1/observability/metrics/heatmap
  // Returns heatmap aggregated data (7 days × 24 hours)
  for (const path of metricsHeatmapPaths) {
    fastify.get(path, {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              enum: ['latency', 'errors', 'requests'],
            },
            days: {
              type: 'integer',
              enum: [7, 14, 30],
            },
          },
          required: ['metric'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    day: { type: 'string' },
                    hour: { type: 'number' },
                    value: { type: 'number' },
                  },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  metric: { type: 'string' },
                  days: { type: 'number' },
                  cells: { type: 'number' },
                },
              },
            },
          },
        },
      },
    }, async (request, reply) => {
      if (!historicalMetrics) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'HISTORICAL_METRICS_UNAVAILABLE',
            message: 'Historical metrics collector is not initialized',
          },
        });
      }

      const query = request.query as {
        metric: 'latency' | 'errors' | 'requests';
        days?: 7 | 14 | 30;
      };

      try {
        fastify.log.debug({ query }, 'Querying heatmap data');

        const data = await historicalMetrics.queryHeatmap({
          metric: query.metric,
          days: query.days ?? 7,
        });

        fastify.log.debug({
          metric: query.metric,
          cells: data.length,
        }, 'Heatmap data retrieved');

        return {
          ok: true,
          data,
          meta: {
            source: 'historical-metrics-collector',
            metric: query.metric,
            days: query.days ?? 7,
            cells: data.length,
          },
        };
      } catch (error) {
        fastify.log.error({ err: error, query }, 'Failed to query heatmap data');

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'HEATMAP_ERROR',
            message: error instanceof Error ? error.message : 'Failed to query heatmap data',
          },
        });
      }
    });
  }

  // POST /api/v1/observability/incidents
  // Create a new incident record
  for (const path of incidentsCreatePaths) {
    fastify.post(path, {
      schema: {
        body: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['error_rate', 'latency_spike', 'plugin_failure', 'adapter_failure', 'system_health', 'custom'],
            },
            severity: {
              type: 'string',
              enum: ['critical', 'warning', 'info'],
            },
            title: { type: 'string' },
            details: { type: 'string' },
            rootCause: { type: 'string' },
            affectedServices: {
              type: 'array',
              items: { type: 'string' },
            },
            timestamp: { type: 'number' },
            metadata: { type: 'object' },
          },
          required: ['type', 'severity', 'title', 'details'],
        },
      },
    }, async (request, reply) => {
      if (!incidentStorage) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'INCIDENT_STORAGE_UNAVAILABLE',
            message: 'Incident storage is not initialized',
          },
        });
      }

      try {
        const payload = request.body as any;
        const incident = await incidentStorage.createIncident(payload);

        return {
          ok: true,
          data: incident,
          meta: {
            source: 'incident-storage',
          },
        };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to create incident');

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INCIDENT_CREATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create incident',
          },
        });
      }
    });
  }

  // GET /api/v1/observability/incidents/history
  // Query incident history with filters
  for (const path of incidentsHistoryPaths) {
    fastify.get(path, {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 500 },
            severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
            type: {
              type: 'string',
              enum: ['error_rate', 'latency_spike', 'plugin_failure', 'adapter_failure', 'system_health', 'custom'],
            },
            from: { type: 'integer' },
            to: { type: 'integer' },
            includeResolved: { type: 'boolean' },
          },
        },
      },
    }, async (request, reply) => {
      if (!incidentStorage) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'INCIDENT_STORAGE_UNAVAILABLE',
            message: 'Incident storage is not initialized',
          },
        });
      }

      try {
        const query = request.query as any;
        const incidents = await incidentStorage.queryIncidents({
          limit: query.limit ?? 50,
          severity: query.severity,
          type: query.type,
          from: query.from,
          to: query.to,
          includeResolved: query.includeResolved ?? false,
        });

        return {
          ok: true,
          data: incidents,
          meta: {
            source: 'incident-storage',
            count: incidents.length,
          },
        };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to query incidents');

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INCIDENT_QUERY_ERROR',
            message: error instanceof Error ? error.message : 'Failed to query incidents',
          },
        });
      }
    });
  }

  // POST /api/v1/observability/incidents/:id/resolve
  // Mark an incident as resolved
  for (const path of incidentsResolvePaths) {
    fastify.post(path, {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            resolutionNotes: { type: 'string' },
          },
        },
      },
    }, async (request, reply) => {
      if (!incidentStorage) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'INCIDENT_STORAGE_UNAVAILABLE',
            message: 'Incident storage is not initialized',
          },
        });
      }

      try {
        const { id } = request.params as { id: string };
        const body = request.body as { resolutionNotes?: string };

        const incident = await incidentStorage.resolveIncident(id, body.resolutionNotes);

        if (!incident) {
          return reply.code(404).send({
            ok: false,
            error: {
              code: 'INCIDENT_NOT_FOUND',
              message: `Incident with id ${id} not found`,
            },
          });
        }

        return {
          ok: true,
          data: incident,
          meta: {
            source: 'incident-storage',
          },
        };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to resolve incident');

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INCIDENT_RESOLVE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to resolve incident',
          },
        });
      }
    });
  }

  fastify.log.info('Observability routes registered');
}
