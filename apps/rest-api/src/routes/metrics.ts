/**
 * @module @kb-labs/rest-api-app/routes/metrics
 * Metrics endpoint
 */

import type { FastifyInstance } from 'fastify/types/instance';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { metricsCollector } from '../middleware/metrics.js';

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

    // Uptime
    const uptime = (Date.now() - metrics.timestamps.startTime) / 1000;
    prometheusLines.push(`# HELP process_uptime_seconds Process uptime in seconds`);
    prometheusLines.push(`# TYPE process_uptime_seconds gauge`);
    prometheusLines.push(`process_uptime_seconds ${uptime}`);

    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return prometheusLines.join('\n');
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
    
    // Return only data - envelope middleware will wrap it
    return {
      ...metrics,
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


