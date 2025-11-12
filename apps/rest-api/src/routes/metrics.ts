/**
 * @module @kb-labs/rest-api-app/routes/metrics
 * Metrics endpoint
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { metricsCollector } from '../middleware/metrics.js';
import { getHeaderDebugEntries } from '../diagnostics/header-debug.js';

function formatNumber(value: number, fractionDigits = 2): string {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : '0';
}

/**
 * Register metrics routes
 */
export function registerMetricsRoutes(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  const basePath = config.basePath;

  // GET /metrics (Prometheus format)
  server.get(`${basePath}/metrics`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (_request, reply) => {
    const metrics = metricsCollector.getMetrics();
    const pluginSnapshot = metricsCollector.getLastPluginMountSnapshot();

    // Prometheus format
    const prometheusLines: string[] = [];

    // Request count
    prometheusLines.push(`# HELP http_requests_total Total number of HTTP requests`);
    prometheusLines.push(`# TYPE http_requests_total counter`);
    prometheusLines.push(`http_requests_total ${metrics.requests.total}`);

    // Request count by method
    for (const [method, count] of Object.entries(metrics.requests.byMethod)) {
      prometheusLines.push(`http_requests_total{method="${method}"} ${count}`);
    }

    // Request count by status
    for (const [status, count] of Object.entries(metrics.requests.byStatus)) {
      prometheusLines.push(`http_requests_total{status="${status}"} ${count}`);
    }

    // Latency
    prometheusLines.push(`# HELP http_request_duration_ms HTTP request duration in milliseconds`);
    prometheusLines.push(`# TYPE http_request_duration_ms summary`);
    prometheusLines.push(`http_request_duration_ms{quantile="0.5"} ${metrics.latency.average}`);
    prometheusLines.push(`http_request_duration_ms{quantile="0.95"} ${metrics.latency.max}`);
    prometheusLines.push(`http_request_duration_ms{quantile="0.99"} ${metrics.latency.max}`);
    prometheusLines.push(`http_request_duration_ms_sum ${metrics.latency.total}`);
    prometheusLines.push(`http_request_duration_ms_count ${metrics.latency.count}`);

    // Error count
    prometheusLines.push(`# HELP http_errors_total Total number of HTTP errors`);
    prometheusLines.push(`# TYPE http_errors_total counter`);
    prometheusLines.push(`http_errors_total ${metrics.errors.total}`);

    // Error count by code
    for (const [code, count] of Object.entries(metrics.errors.byCode)) {
      prometheusLines.push(`http_errors_total{code="${code}"} ${count}`);
    }

    // Header policy metrics
    prometheusLines.push(`# HELP kb_headers_filtered_total Total headers filtered by policy enforcement`);
    prometheusLines.push(`# TYPE kb_headers_filtered_total counter`);
    prometheusLines.push(`kb_headers_filtered_total{direction="inbound"} ${metrics.headers.filteredInbound}`);
    prometheusLines.push(`kb_headers_filtered_total{direction="outbound"} ${metrics.headers.filteredOutbound}`);

    prometheusLines.push(`# HELP kb_headers_sensitive_inbound_total Sensitive inbound headers observed`);
    prometheusLines.push(`# TYPE kb_headers_sensitive_inbound_total counter`);
    prometheusLines.push(`kb_headers_sensitive_inbound_total ${metrics.headers.sensitiveInbound}`);

    prometheusLines.push(`# HELP kb_headers_validation_errors_total Header validation errors encountered`);
    prometheusLines.push(`# TYPE kb_headers_validation_errors_total counter`);
    prometheusLines.push(`kb_headers_validation_errors_total ${metrics.headers.validationErrors}`);

    prometheusLines.push(`# HELP kb_headers_vary_applied_total Vary header entries applied by policy`);
    prometheusLines.push(`# TYPE kb_headers_vary_applied_total counter`);
    prometheusLines.push(`kb_headers_vary_applied_total ${metrics.headers.varyApplied}`);

    prometheusLines.push(`# HELP kb_headers_dry_run_decisions_total Header decisions skipped due to dry-run mode`);
    prometheusLines.push(`# TYPE kb_headers_dry_run_decisions_total counter`);
    prometheusLines.push(`kb_headers_dry_run_decisions_total ${metrics.headers.dryRunDecisions}`);

    for (const pluginHeader of metrics.headers.perPlugin) {
      const pluginLabel = pluginHeader.pluginId || 'unknown';
      prometheusLines.push(`kb_headers_filtered_total{plugin="${pluginLabel}",direction="inbound"} ${pluginHeader.filteredInbound}`);
      prometheusLines.push(`kb_headers_filtered_total{plugin="${pluginLabel}",direction="outbound"} ${pluginHeader.filteredOutbound}`);
      prometheusLines.push(`kb_headers_sensitive_inbound_total{plugin="${pluginLabel}"} ${pluginHeader.sensitiveInbound}`);
      prometheusLines.push(`kb_headers_validation_errors_total{plugin="${pluginLabel}"} ${pluginHeader.validationErrors}`);
      prometheusLines.push(`kb_headers_vary_applied_total{plugin="${pluginLabel}"} ${pluginHeader.varyApplied}`);
    }

    for (const entry of metrics.latency.histogram) {
      const avg = entry.count > 0 ? entry.total / entry.count : 0;
      const routeLabels = [`route="${entry.route}"`];
      if (entry.pluginId) {
        routeLabels.push(`plugin="${entry.pluginId}"`);
      }
      const labelString = routeLabels.join(',');

      prometheusLines.push(`# HELP http_request_route_duration_ms Route-specific request duration statistics`);
      prometheusLines.push(`# TYPE http_request_route_duration_ms gauge`);
      prometheusLines.push(`http_request_route_duration_ms_max{${labelString}} ${formatNumber(entry.max)}`);
      prometheusLines.push(`http_request_route_duration_ms_avg{${labelString}} ${formatNumber(avg)}`);
      if (entry.budgetMs !== null) {
        prometheusLines.push(`http_request_route_budget_ms{${labelString}} ${formatNumber(entry.budgetMs)}`);
      }
      for (const [statusCode, count] of Object.entries(entry.byStatus)) {
        const statusLabels = [...routeLabels, `status="${statusCode}"`].join(',');
        prometheusLines.push(`http_request_route_total{${statusLabels}} ${count}`);
      }
    }

    if (metrics.perPlugin.length > 0) {
      prometheusLines.push(`# HELP kb_plugin_request_total Total HTTP requests per plugin`);
      prometheusLines.push(`# TYPE kb_plugin_request_total gauge`);
      prometheusLines.push(`# HELP kb_plugin_request_duration_ms Plugin request duration metrics`);
      prometheusLines.push(`# TYPE kb_plugin_request_duration_ms gauge`);
      prometheusLines.push(`# HELP kb_plugin_request_status_total Plugin request status code totals`);
      prometheusLines.push(`# TYPE kb_plugin_request_status_total gauge`);

      for (const pluginMetrics of metrics.perPlugin) {
        const pluginLabel = pluginMetrics.pluginId ?? 'unknown';
        const avgDuration =
          pluginMetrics.total > 0 ? pluginMetrics.totalDuration / pluginMetrics.total : 0;

        prometheusLines.push(`kb_plugin_request_total{plugin="${pluginLabel}"} ${pluginMetrics.total}`);
        prometheusLines.push(`kb_plugin_request_duration_ms_avg{plugin="${pluginLabel}"} ${formatNumber(avgDuration)}`);
        prometheusLines.push(`kb_plugin_request_duration_ms_max{plugin="${pluginLabel}"} ${formatNumber(pluginMetrics.maxDuration)}`);

        for (const [statusCode, count] of Object.entries(pluginMetrics.statuses)) {
          prometheusLines.push(`kb_plugin_request_status_total{plugin="${pluginLabel}",status="${statusCode}"} ${count}`);
        }
      }
    }

    if (pluginSnapshot) {
      prometheusLines.push(`# HELP kb_plugins_mount_total Plugins processed during last mount run`);
      prometheusLines.push(`# TYPE kb_plugins_mount_total gauge`);
      prometheusLines.push(`kb_plugins_mount_total ${pluginSnapshot.total}`);
      prometheusLines.push(`kb_plugins_mount_succeeded ${pluginSnapshot.succeeded}`);
      prometheusLines.push(`kb_plugins_mount_failed ${pluginSnapshot.failed}`);
      prometheusLines.push(`kb_plugins_mount_elapsed_ms ${formatNumber(pluginSnapshot.elapsedMs)}`);
    }

    // Redis metrics
    prometheusLines.push(`# HELP kb_redis_status_updates_total Redis status updates observed`);
    prometheusLines.push(`# TYPE kb_redis_status_updates_total counter`);
    prometheusLines.push(`kb_redis_status_updates_total ${metrics.redis.updates}`);

    prometheusLines.push(`# HELP kb_redis_status_transitions_total Redis health transitions`);
    prometheusLines.push(`# TYPE kb_redis_status_transitions_total counter`);
    prometheusLines.push(`kb_redis_status_transitions_total{state="healthy"} ${metrics.redis.healthyTransitions}`);
    prometheusLines.push(`kb_redis_status_transitions_total{state="unhealthy"} ${metrics.redis.unhealthyTransitions}`);

    if (metrics.redis.lastStatus) {
      const healthyValue = metrics.redis.lastStatus.healthy ? 1 : 0;
      prometheusLines.push(`# HELP kb_redis_healthy Redis healthy flag (1 = healthy)`);
      prometheusLines.push(`# TYPE kb_redis_healthy gauge`);
      prometheusLines.push(`kb_redis_healthy ${healthyValue}`);

      for (const roleEntry of metrics.redis.roleStates) {
        for (const stateEntry of roleEntry.states) {
          const safeState = stateEntry.state.replace(/"/g, '\"');
          prometheusLines.push(
            `kb_redis_role_state_total{role="${roleEntry.role}",state="${safeState}"} ${stateEntry.count}`,
          );
        }
      }
    }

    // Uptime
    const uptime = (Date.now() - metrics.timestamps.startTime) / 1000;
    prometheusLines.push(`# HELP process_uptime_seconds Process uptime in seconds`);
    prometheusLines.push(`# TYPE process_uptime_seconds gauge`);
    prometheusLines.push(`process_uptime_seconds ${uptime}`);

    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return prometheusLines.join('\n');
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

  // GET /metrics/json (JSON format)
  server.get(`${basePath}/metrics/json`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (_request, _reply) => {
    const metrics = metricsCollector.getMetrics();
    const pluginSnapshot = metricsCollector.getLastPluginMountSnapshot();

    // Return only data - envelope middleware will wrap it
    return {
      ...metrics,
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


