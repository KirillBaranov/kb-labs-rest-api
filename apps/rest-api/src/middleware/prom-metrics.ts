/**
 * @module @kb-labs/rest-api-app/middleware/prom-metrics
 * Prometheus metrics using prom-client
 */

import { Registry, Histogram, Counter, Gauge } from 'prom-client';

/**
 * Prometheus metrics registry
 */
export const promRegistry = new Registry();

/**
 * HTTP request duration histogram with percentiles
 * Automatically calculates p50, p95, p99
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code', 'tenant', 'plugin'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000], // milliseconds
  registers: [promRegistry],
});

/**
 * HTTP requests total counter
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'tenant', 'plugin'],
  registers: [promRegistry],
});

/**
 * HTTP errors total counter
 */
export const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors (4xx, 5xx)',
  labelNames: ['status_code', 'error_code', 'tenant'],
  registers: [promRegistry],
});

/**
 * Process uptime gauge
 */
export const processUptime = new Gauge({
  name: 'process_uptime_seconds',
  help: 'Process uptime in seconds',
  registers: [promRegistry],
});

/**
 * Header policy metrics
 */
export const headersFiltered = new Counter({
  name: 'kb_headers_filtered_total',
  help: 'Total headers filtered by policy enforcement',
  labelNames: ['direction', 'plugin'],
  registers: [promRegistry],
});

export const headersSensitiveInbound = new Counter({
  name: 'kb_headers_sensitive_inbound_total',
  help: 'Sensitive inbound headers observed',
  labelNames: ['plugin'],
  registers: [promRegistry],
});

export const headersValidationErrors = new Counter({
  name: 'kb_headers_validation_errors_total',
  help: 'Header validation errors encountered',
  labelNames: ['plugin'],
  registers: [promRegistry],
});

export const headersVaryApplied = new Counter({
  name: 'kb_headers_vary_applied_total',
  help: 'Vary header entries applied by policy',
  labelNames: ['plugin'],
  registers: [promRegistry],
});

export const headersDryRunDecisions = new Counter({
  name: 'kb_headers_dry_run_decisions_total',
  help: 'Header decisions skipped due to dry-run mode',
  registers: [promRegistry],
});

/**
 * Plugin metrics
 */
export const pluginRequestsTotal = new Counter({
  name: 'kb_plugin_request_total',
  help: 'Total HTTP requests per plugin',
  labelNames: ['plugin'],
  registers: [promRegistry],
});

export const pluginRequestDuration = new Histogram({
  name: 'kb_plugin_request_duration_ms',
  help: 'Plugin request duration metrics',
  labelNames: ['plugin'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [promRegistry],
});

/**
 * Tenant metrics
 */
export const tenantRequestsTotal = new Counter({
  name: 'kb_tenant_request_total',
  help: 'Total HTTP requests per tenant',
  labelNames: ['tenant'],
  registers: [promRegistry],
});

export const tenantErrorsTotal = new Counter({
  name: 'kb_tenant_request_errors_total',
  help: 'Total HTTP errors per tenant',
  labelNames: ['tenant'],
  registers: [promRegistry],
});

export const tenantRequestDuration = new Histogram({
  name: 'kb_tenant_request_duration_ms',
  help: 'Tenant request duration',
  labelNames: ['tenant'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [promRegistry],
});

/**
 * Plugin mount metrics
 */
export const pluginsMountTotal = new Gauge({
  name: 'kb_plugins_mount_total',
  help: 'Plugins processed during last mount run',
  registers: [promRegistry],
});

export const pluginsMountSucceeded = new Gauge({
  name: 'kb_plugins_mount_succeeded',
  help: 'Plugins successfully mounted',
  registers: [promRegistry],
});

export const pluginsMountFailed = new Gauge({
  name: 'kb_plugins_mount_failed',
  help: 'Plugins failed to mount',
  registers: [promRegistry],
});

export const pluginsMountElapsed = new Gauge({
  name: 'kb_plugins_mount_elapsed_ms',
  help: 'Plugin mount elapsed time in milliseconds',
  registers: [promRegistry],
});

/**
 * Redis metrics
 */
export const redisStatusUpdates = new Counter({
  name: 'kb_redis_status_updates_total',
  help: 'Redis status updates observed',
  registers: [promRegistry],
});

export const redisStatusTransitions = new Counter({
  name: 'kb_redis_status_transitions_total',
  help: 'Redis health transitions',
  labelNames: ['state'],
  registers: [promRegistry],
});

export const redisHealthy = new Gauge({
  name: 'kb_redis_healthy',
  help: 'Redis healthy flag (1 = healthy)',
  registers: [promRegistry],
});

export const redisRoleState = new Gauge({
  name: 'kb_redis_role_state_total',
  help: 'Redis role state occurrences',
  labelNames: ['role', 'state'],
  registers: [promRegistry],
});

/**
 * Update process uptime metric
 */
export function updateProcessUptime(startTimeMs: number): void {
  const uptimeSeconds = (Date.now() - startTimeMs) / 1000;
  processUptime.set(uptimeSeconds);
}

/**
 * Get all metrics in Prometheus format
 */
export async function getPrometheusMetrics(): Promise<string> {
  return promRegistry.metrics();
}
