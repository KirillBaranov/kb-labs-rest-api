/**
 * @module @kb-labs/rest-api-app/services/incident-detector
 * Automatic incident detection based on metrics thresholds
 */

import type { IncidentStorage, IncidentCreatePayload, IncidentSeverity, IncidentType, RootCauseItem } from './incident-storage';
import { metricsCollector } from '../middleware/metrics';

/**
 * Detection thresholds configuration
 */
export interface DetectionThresholds {
  /** Error rate threshold (percentage, default: 5%) */
  errorRateWarning: number;
  /** Error rate critical threshold (percentage, default: 10%) */
  errorRateCritical: number;
  /** P99 latency warning threshold (ms, default: 2000) */
  latencyP99Warning: number;
  /** P99 latency critical threshold (ms, default: 5000) */
  latencyP99Critical: number;
  /** P95 latency warning threshold (ms, default: 1000) */
  latencyP95Warning: number;
  /** Minimum requests before triggering (default: 10) */
  minRequestsForDetection: number;
  /** Plugin error rate threshold (percentage, default: 10%) */
  pluginErrorRateWarning: number;
  /** Plugin error rate critical threshold (percentage, default: 25%) */
  pluginErrorRateCritical: number;
}

/**
 * Detector configuration
 */
export interface IncidentDetectorConfig {
  /** Detection interval in milliseconds (default: 30000 - 30s) */
  intervalMs: number;
  /** Thresholds for detection */
  thresholds: DetectionThresholds;
  /** Cooldown period before creating same incident again (ms, default: 5 minutes) */
  cooldownMs: number;
  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_THRESHOLDS: DetectionThresholds = {
  errorRateWarning: 5,
  errorRateCritical: 10,
  latencyP99Warning: 2000,
  latencyP99Critical: 5000,
  latencyP95Warning: 1000,
  minRequestsForDetection: 10,
  pluginErrorRateWarning: 10,
  pluginErrorRateCritical: 25,
};

const DEFAULT_CONFIG: IncidentDetectorConfig = {
  intervalMs: 30000, // 30 seconds
  thresholds: DEFAULT_THRESHOLDS,
  cooldownMs: 5 * 60 * 1000, // 5 minutes
  debug: false,
};

/**
 * Track recently created incidents to avoid duplicates
 */
interface RecentIncident {
  type: IncidentType;
  key: string; // unique key for deduplication (e.g., "error_rate" or "plugin:@kb-labs/foo")
  timestamp: number;
}

/**
 * Automatic incident detector service
 *
 * Periodically analyzes metrics and creates incidents when thresholds are exceeded.
 * Includes deduplication to avoid spamming with repeated incidents.
 */
export class IncidentDetector {
  private incidentStorage: IncidentStorage;
  private config: IncidentDetectorConfig;
  private logger: Console | any;
  private intervalHandle: NodeJS.Timeout | null = null;
  private recentIncidents: RecentIncident[] = [];
  private isRunning = false;

  constructor(
    incidentStorage: IncidentStorage,
    config: Partial<IncidentDetectorConfig> = {},
    logger: Console | any = console
  ) {
    this.incidentStorage = incidentStorage;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: { ...DEFAULT_THRESHOLDS, ...config.thresholds },
    };
    this.logger = logger;
  }

  /**
   * Start automatic detection
   */
  start(): void {
    if (this.isRunning) {
      this.log('warn', 'Detector already running');
      return;
    }

    this.isRunning = true;
    this.log('info', 'Starting incident detector', {
      intervalMs: this.config.intervalMs,
      thresholds: this.config.thresholds,
    });

    // Run immediately once
    this.runDetection().catch(err => {
      this.log('error', 'Initial detection failed', { error: err.message });
    });

    // Schedule periodic detection
    this.intervalHandle = setInterval(() => {
      this.runDetection().catch(err => {
        this.log('error', 'Detection cycle failed', { error: err.message });
      });
    }, this.config.intervalMs);
  }

  /**
   * Stop automatic detection
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    this.log('info', 'Incident detector stopped');
  }

  /**
   * Run a single detection cycle
   */
  async runDetection(): Promise<void> {
    const metrics = metricsCollector.getMetrics();
    const now = Date.now();

    // Clean up old recent incidents (outside cooldown period)
    this.recentIncidents = this.recentIncidents.filter(
      ri => now - ri.timestamp < this.config.cooldownMs
    );

    // Skip if not enough requests
    if (metrics.requests.total < this.config.thresholds.minRequestsForDetection) {
      this.log('debug', 'Not enough requests for detection', {
        total: metrics.requests.total,
        min: this.config.thresholds.minRequestsForDetection,
      });
      return;
    }

    // Detect error rate issues
    await this.detectErrorRate(metrics, now);

    // Detect latency issues
    await this.detectLatencyIssues(metrics, now);

    // Detect plugin failures
    await this.detectPluginFailures(metrics, now);

    this.log('debug', 'Detection cycle complete', {
      recentIncidentsCount: this.recentIncidents.length,
    });
  }

  /**
   * Detect high error rate
   */
  private async detectErrorRate(metrics: any, now: number): Promise<void> {
    const totalErrors = (metrics.requests.clientErrors ?? 0) + (metrics.requests.serverErrors ?? 0);
    const errorRate = metrics.requests.total > 0
      ? (totalErrors / metrics.requests.total) * 100
      : 0;

    const key = 'error_rate';

    if (this.isInCooldown(key)) {
      return;
    }

    let severity: IncidentSeverity | null = null;
    let title = '';
    let details = '';

    if (errorRate >= this.config.thresholds.errorRateCritical) {
      severity = 'critical';
      title = `Critical Error Rate: ${errorRate.toFixed(1)}%`;
      details = `Error rate has exceeded critical threshold of ${this.config.thresholds.errorRateCritical}%. ` +
        `Current: ${errorRate.toFixed(2)}% (${totalErrors}/${metrics.requests.total} requests). ` +
        `Client errors: ${metrics.requests.clientErrors ?? 0}, Server errors: ${metrics.requests.serverErrors ?? 0}.`;
    } else if (errorRate >= this.config.thresholds.errorRateWarning) {
      severity = 'warning';
      title = `High Error Rate: ${errorRate.toFixed(1)}%`;
      details = `Error rate has exceeded warning threshold of ${this.config.thresholds.errorRateWarning}%. ` +
        `Current: ${errorRate.toFixed(2)}% (${totalErrors}/${metrics.requests.total} requests).`;
    }

    if (severity) {
      // Determine primary error type for root cause
      const clientErrors = metrics.requests.clientErrors ?? 0;
      const serverErrors = metrics.requests.serverErrors ?? 0;
      const primaryErrorType = serverErrors > clientErrors ? 'Server errors (5xx)' : 'Client errors (4xx)';

      await this.createIncident({
        type: 'error_rate',
        severity,
        title,
        details,
        rootCause: [
          {
            factor: primaryErrorType,
            confidence: 0.85,
            evidence: `${serverErrors} server errors, ${clientErrors} client errors out of ${metrics.requests.total} requests`,
          },
          {
            factor: 'Application bugs or misconfigurations',
            confidence: 0.7,
            evidence: 'Check application logs for stack traces',
          },
          {
            factor: 'Infrastructure issues',
            confidence: 0.5,
            evidence: 'Verify database connections, external services, and resource limits',
          },
        ],
        metadata: {
          errorRate,
          totalRequests: metrics.requests.total,
          clientErrors: metrics.requests.clientErrors,
          serverErrors: metrics.requests.serverErrors,
          threshold: severity === 'critical'
            ? this.config.thresholds.errorRateCritical
            : this.config.thresholds.errorRateWarning,
        },
      }, key, now);
    }
  }

  /**
   * Detect latency spikes
   */
  private async detectLatencyIssues(metrics: any, now: number): Promise<void> {
    // We need to fetch p99 from histogram data
    // For now, use average as approximation if p99 not available
    const avgLatency = metrics.latency.average ?? 0;

    // Try to calculate p99 from histogram if available
    let p99 = avgLatency * 3; // rough approximation
    let p95 = avgLatency * 2;

    if (metrics.latency.histogram && metrics.latency.histogram.length > 0) {
      // Sort by max latency and take top percentiles
      const sorted = [...metrics.latency.histogram].sort((a: any, b: any) => b.max - a.max);
      if (sorted.length > 0) {
        p99 = sorted[0]?.max ?? p99;
        p95 = sorted[Math.floor(sorted.length * 0.05)]?.max ?? p95;
      }
    }

    const keyP99 = 'latency_p99';
    const keyP95 = 'latency_p95';

    // Check P99 latency
    if (!this.isInCooldown(keyP99)) {
      let severity: IncidentSeverity | null = null;
      let title = '';
      let details = '';

      if (p99 >= this.config.thresholds.latencyP99Critical) {
        severity = 'critical';
        title = `Critical P99 Latency: ${p99.toFixed(0)}ms`;
        details = `P99 latency has exceeded critical threshold of ${this.config.thresholds.latencyP99Critical}ms. ` +
          `Current P99: ${p99.toFixed(0)}ms, Average: ${avgLatency.toFixed(0)}ms. ` +
          `This indicates severe performance degradation affecting tail latencies.`;
      } else if (p99 >= this.config.thresholds.latencyP99Warning) {
        severity = 'warning';
        title = `High P99 Latency: ${p99.toFixed(0)}ms`;
        details = `P99 latency has exceeded warning threshold of ${this.config.thresholds.latencyP99Warning}ms. ` +
          `Current P99: ${p99.toFixed(0)}ms, Average: ${avgLatency.toFixed(0)}ms.`;
      }

      if (severity) {
        await this.createIncident({
          type: 'latency_spike',
          severity,
          title,
          details,
          rootCause: [
            {
              factor: 'High tail latency',
              confidence: 0.9,
              evidence: `P99 latency ${p99.toFixed(0)}ms exceeds threshold`,
            },
            {
              factor: 'Possible slow database queries',
              confidence: 0.6,
              evidence: 'Common cause of high P99 latency',
            },
            {
              factor: 'External API delays',
              confidence: 0.5,
              evidence: 'Check external service response times',
            },
          ],
          metadata: {
            p99,
            p95,
            average: avgLatency,
            threshold: severity === 'critical'
              ? this.config.thresholds.latencyP99Critical
              : this.config.thresholds.latencyP99Warning,
          },
        }, keyP99, now);
      }
    }

    // Check P95 latency (separate incident)
    if (!this.isInCooldown(keyP95) && p95 >= this.config.thresholds.latencyP95Warning) {
      await this.createIncident({
        type: 'latency_spike',
        severity: 'warning',
        title: `Elevated P95 Latency: ${p95.toFixed(0)}ms`,
        details: `P95 latency has exceeded threshold of ${this.config.thresholds.latencyP95Warning}ms. ` +
          `Current P95: ${p95.toFixed(0)}ms. Consider investigating slow endpoints.`,
        metadata: {
          p95,
          average: avgLatency,
          threshold: this.config.thresholds.latencyP95Warning,
        },
      }, keyP95, now);
    }
  }

  /**
   * Detect plugin failures
   */
  private async detectPluginFailures(metrics: any, now: number): Promise<void> {
    if (!metrics.perPlugin || !Array.isArray(metrics.perPlugin)) {
      return;
    }

    for (const plugin of metrics.perPlugin) {
      if (!plugin.pluginId || plugin.requests < 5) {
        continue; // Skip plugins with too few requests
      }

      const errorRate = plugin.requests > 0
        ? ((plugin.errors ?? 0) / plugin.requests) * 100
        : 0;

      const key = `plugin:${plugin.pluginId}`;

      if (this.isInCooldown(key)) {
        continue;
      }

      let severity: IncidentSeverity | null = null;
      let title = '';
      let details = '';

      if (errorRate >= this.config.thresholds.pluginErrorRateCritical) {
        severity = 'critical';
        title = `Plugin Failure: ${plugin.pluginId}`;
        details = `Plugin ${plugin.pluginId} has critical error rate of ${errorRate.toFixed(1)}% ` +
          `(${plugin.errors ?? 0}/${plugin.requests} requests). ` +
          `This exceeds the critical threshold of ${this.config.thresholds.pluginErrorRateCritical}%.`;
      } else if (errorRate >= this.config.thresholds.pluginErrorRateWarning) {
        severity = 'warning';
        title = `Plugin Issues: ${plugin.pluginId}`;
        details = `Plugin ${plugin.pluginId} has elevated error rate of ${errorRate.toFixed(1)}% ` +
          `(${plugin.errors ?? 0}/${plugin.requests} requests).`;
      }

      if (severity) {
        await this.createIncident({
          type: 'plugin_failure',
          severity,
          title,
          details,
          affectedServices: [plugin.pluginId],
          rootCause: [
            {
              factor: `Plugin ${plugin.pluginId} failures`,
              confidence: 0.95,
              evidence: `Error rate ${errorRate.toFixed(1)}% (${plugin.errors ?? 0}/${plugin.requests} requests)`,
            },
            {
              factor: 'Plugin configuration issue',
              confidence: 0.6,
              evidence: 'Check plugin settings and dependencies',
            },
            {
              factor: 'External dependency failure',
              confidence: 0.4,
              evidence: 'Verify external services the plugin depends on',
            },
          ],
          metadata: {
            pluginId: plugin.pluginId,
            errorRate,
            requests: plugin.requests,
            errors: plugin.errors,
            avgLatency: plugin.latency?.average,
          },
        }, key, now);
      }
    }
  }

  /**
   * Check if incident key is in cooldown
   */
  private isInCooldown(key: string): boolean {
    return this.recentIncidents.some(ri => ri.key === key);
  }

  /**
   * Create incident and track it
   */
  private async createIncident(
    payload: IncidentCreatePayload,
    key: string,
    timestamp: number
  ): Promise<void> {
    try {
      const incident = await this.incidentStorage.createIncident(payload);

      // Track for deduplication
      this.recentIncidents.push({
        type: payload.type,
        key,
        timestamp,
      });

      this.log('info', 'Auto-created incident', {
        id: incident.id,
        type: incident.type,
        severity: incident.severity,
        title: incident.title,
      });
    } catch (error) {
      this.log('error', 'Failed to create incident', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current detector status
   */
  getStatus(): {
    running: boolean;
    config: IncidentDetectorConfig;
    recentIncidentsCount: number;
  } {
    return {
      running: this.isRunning,
      config: this.config,
      recentIncidentsCount: this.recentIncidents.length,
    };
  }

  /**
   * Update thresholds at runtime
   */
  updateThresholds(thresholds: Partial<DetectionThresholds>): void {
    this.config.thresholds = { ...this.config.thresholds, ...thresholds };
    this.log('info', 'Thresholds updated', { thresholds: this.config.thresholds });
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: any): void {
    if (level === 'debug' && !this.config.debug) return;

    const prefix = '[IncidentDetector]';
    if (this.logger[level]) {
      if (meta) {
        this.logger[level]({ ...meta }, `${prefix} ${message}`);
      } else {
        this.logger[level](`${prefix} ${message}`);
      }
    } else {
      console.log(`${prefix} [${level}] ${message}`, meta ?? '');
    }
  }
}
