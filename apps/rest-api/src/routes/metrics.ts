/**
 * @module @kb-labs/rest-api-app/routes/metrics
 * Metrics endpoint
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { metricsCollector } from '../middleware/metrics';
import { getHeaderDebugEntries } from '../diagnostics/header-debug';
import { getPrometheusMetrics, updateProcessUptime } from '../middleware/prom-metrics';

function formatNumber(value: number, fractionDigits = 2): string {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : '0';
}

/**
 * Calculate percentiles from histogram buckets using linear interpolation
 */
function calculatePercentilesFromHistogram(
  sum: number,
  count: number,
  buckets: Array<{ le: string; count: number }>
): { p50: number; p95: number; p99: number } {
  if (count === 0) {
    return { p50: 0, p95: 0, p99: 0 };
  }

  // Sort buckets by le (upper bound)
  const sortedBuckets = buckets
    .map(b => ({ le: b.le === '+Inf' ? Infinity : parseFloat(b.le), count: b.count }))
    .sort((a, b) => a.le - b.le);

  const calculatePercentile = (percentile: number): number => {
    const targetCount = count * percentile;
    let prevCount = 0;
    let prevBound = 0;

    for (const bucket of sortedBuckets) {
      if (bucket.count >= targetCount) {
        // Linear interpolation
        if (bucket.count === prevCount) {
          return bucket.le;
        }
        const ratio = (targetCount - prevCount) / (bucket.count - prevCount);
        return prevBound + ratio * (bucket.le - prevBound);
      }
      prevCount = bucket.count;
      prevBound = bucket.le;
    }

    return sum / count; // Fallback to average
  };

  return {
    p50: calculatePercentile(0.50),
    p95: calculatePercentile(0.95),
    p99: calculatePercentile(0.99),
  };
}

/**
 * Register metrics routes
 */
export function registerMetricsRoutes(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  const basePath = config.basePath;

  // GET /metrics (Prometheus format with real p50/p95/p99)
  server.get(`${basePath}/metrics`, async (_request, reply) => {
    const metrics = metricsCollector.getMetrics();

    // Update process uptime before generating metrics
    updateProcessUptime(metrics.timestamps.startTime);

    // Get prom-client metrics (includes histogram with real percentiles)
    const promMetrics = await getPrometheusMetrics();

    // Append custom metrics not covered by prom-client
    const customLines: string[] = [];

    // Route-specific metrics (budget tracking)
    for (const entry of metrics.latency.histogram) {
      if (entry.budgetMs !== null) {
        const routeLabels = [`route="${entry.route}"`];
        if (entry.pluginId) {
          routeLabels.push(`plugin="${entry.pluginId}"`);
        }
        const labelString = routeLabels.join(',');
        customLines.push(`# HELP http_request_route_budget_ms Route performance budget in milliseconds`);
        customLines.push(`# TYPE http_request_route_budget_ms gauge`);
        customLines.push(`http_request_route_budget_ms{${labelString}} ${formatNumber(entry.budgetMs)}`);
      }
    }

    // Plugin mount snapshot
    const pluginSnapshot = metricsCollector.getLastPluginMountSnapshot();
    if (pluginSnapshot) {
      customLines.push(`# HELP kb_plugins_mount_total Plugins processed during last mount run`);
      customLines.push(`# TYPE kb_plugins_mount_total gauge`);
      customLines.push(`kb_plugins_mount_total ${pluginSnapshot.total}`);
      customLines.push(`kb_plugins_mount_succeeded ${pluginSnapshot.succeeded}`);
      customLines.push(`kb_plugins_mount_failed ${pluginSnapshot.failed}`);
      customLines.push(`kb_plugins_mount_elapsed_ms ${formatNumber(pluginSnapshot.elapsedMs)}`);
    }

    // Redis metrics (not in prom-client)
    customLines.push(`# HELP kb_redis_status_updates_total Redis status updates observed`);
    customLines.push(`# TYPE kb_redis_status_updates_total counter`);
    customLines.push(`kb_redis_status_updates_total ${metrics.redis.updates}`);

    customLines.push(`# HELP kb_redis_status_transitions_total Redis health transitions`);
    customLines.push(`# TYPE kb_redis_status_transitions_total counter`);
    customLines.push(`kb_redis_status_transitions_total{state="healthy"} ${metrics.redis.healthyTransitions}`);
    customLines.push(`kb_redis_status_transitions_total{state="unhealthy"} ${metrics.redis.unhealthyTransitions}`);

    if (metrics.redis.lastStatus) {
      const healthyValue = metrics.redis.lastStatus.healthy ? 1 : 0;
      customLines.push(`# HELP kb_redis_healthy Redis healthy flag (1 = healthy)`);
      customLines.push(`# TYPE kb_redis_healthy gauge`);
      customLines.push(`kb_redis_healthy ${healthyValue}`);

      for (const roleEntry of metrics.redis.roleStates) {
        for (const stateEntry of roleEntry.states) {
          const safeState = stateEntry.state.replace(/"/g, '\\"');
          customLines.push(
            `kb_redis_role_state_total{role="${roleEntry.role}",state="${safeState}"} ${stateEntry.count}`,
          );
        }
      }
    }

    // Combine prom-client metrics with custom metrics
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return promMetrics + '\n' + customLines.join('\n');
  });

  server.get(`${basePath}/metrics/headers/debug`, {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 200 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            entries: { type: 'array' },
          },
        },
      },
    },
  }, async (request) => {
    const query = request.query as { limit?: number };
    const limit = typeof query?.limit === 'number' ? query.limit : 50;
    return {
      entries: getHeaderDebugEntries(limit),
    };
  });

  // GET /metrics/json (JSON format with real p50/p95/p99)
  server.get(`${basePath}/metrics/json`, async (_request, reply) => {
    const metrics = metricsCollector.getMetrics();
    const pluginSnapshot = metricsCollector.getLastPluginMountSnapshot();

    // Get prom-client metrics to extract histogram data
    const promMetricsText = await getPrometheusMetrics();

    // Parse histogram buckets for http_request_duration_ms
    const bucketMap = new Map<string, number>(); // le -> cumulative count
    let totalSum = 0;
    let totalCount = 0;

    for (const line of promMetricsText.split('\n')) {
      // Parse bucket lines: http_request_duration_ms_bucket{...} <count>
      const bucketMatch = line.match(/^http_request_duration_ms_bucket\{[^}]*le="([^"]+)"[^}]*\}\s+(\d+(?:\.\d+)?)/);
      if (bucketMatch && bucketMatch[1] && bucketMatch[2]) {
        const le = bucketMatch[1];
        const count = parseFloat(bucketMatch[2]);
        // Aggregate counts for same le across different labels
        bucketMap.set(le, (bucketMap.get(le) || 0) + count);
      }

      // Parse sum: http_request_duration_ms_sum{...} <sum>
      const sumMatch = line.match(/^http_request_duration_ms_sum\{[^}]*\}\s+(\d+(?:\.\d+)?)/);
      if (sumMatch) {
        totalSum += parseFloat(sumMatch[1]);
      }

      // Parse count: http_request_duration_ms_count{...} <count>
      const countMatch = line.match(/^http_request_duration_ms_count\{[^}]*\}\s+(\d+(?:\.\d+)?)/);
      if (countMatch) {
        totalCount += parseFloat(countMatch[1]);
      }
    }

    // Convert map to array for percentile calculation
    const histogramBuckets = Array.from(bucketMap.entries()).map(([le, count]) => ({ le, count }));

    // Calculate percentiles from aggregated histogram data
    const percentiles = calculatePercentilesFromHistogram(totalSum, totalCount, histogramBuckets);

    // Return data with enhanced latency metrics
    return {
      requests: metrics.requests,
      latency: {
        ...metrics.latency,
        p50: percentiles.p50,
        p95: percentiles.p95,
        p99: percentiles.p99,
      },
      perPlugin: metrics.perPlugin,
      perTenant: metrics.perTenant,
      errors: metrics.errors,
      timestamps: metrics.timestamps,
      headers: metrics.headers,
      redis: metrics.redis,
      pluginMounts: pluginSnapshot ?? null,
      uptime: {
        seconds: (Date.now() - metrics.timestamps.startTime) / 1000,
        startTime: new Date(metrics.timestamps.startTime).toISOString(),
        lastRequest: metrics.timestamps.lastRequest
          ? new Date(metrics.timestamps.lastRequest).toISOString()
          : null,
      },
    };
  });
}


