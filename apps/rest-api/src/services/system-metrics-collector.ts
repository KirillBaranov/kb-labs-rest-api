/**
 * @module @kb-labs/rest-api-app/services/system-metrics-collector
 * System metrics collector for REST API instances.
 *
 * Collects CPU, memory, uptime, and load average metrics from the current instance
 * and writes them to platform.cache with TTL for automatic cleanup.
 */

import { platform } from '@kb-labs/core-runtime';
import * as os from 'node:os';
import * as process from 'node:process';

/**
 * System metrics data structure
 */
export interface SystemMetrics {
  /** Instance identifier (hostname) */
  instanceId: string;

  /** Timestamp when metrics were collected (ms since epoch) */
  timestamp: number;

  /** CPU usage information */
  cpu: {
    /** User CPU time in microseconds */
    user: number;
    /** System CPU time in microseconds */
    system: number;
    /** CPU usage percentage (0-100) */
    percentage: number;
  };

  /** Memory usage information */
  memory: {
    /** Resident Set Size (bytes) - total memory allocated */
    rss: number;
    /** Heap total (bytes) - allocated heap */
    heapTotal: number;
    /** Heap used (bytes) - actual heap used */
    heapUsed: number;
    /** External memory (bytes) - C++ objects bound to JS */
    external: number;
    /** Array buffers (bytes) */
    arrayBuffers: number;
    /** RSS usage percentage (0-100) */
    rssPercentage: number;
    /** Heap usage percentage (0-100) */
    heapPercentage: number;
  };

  /** Process uptime (seconds) */
  uptime: number;

  /** System load average (1, 5, 15 minutes) */
  loadAvg: [number, number, number];

  /** Total system memory (bytes) */
  totalMemory: number;

  /** Free system memory (bytes) */
  freeMemory: number;
}

/**
 * System metrics collector
 * Periodically collects system metrics and writes to platform.cache
 */
export class SystemMetricsCollector {
  private intervalId: NodeJS.Timeout | null = null;
  private instanceId: string;
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = Date.now();

  constructor() {
    this.instanceId = os.hostname();
  }

  /**
   * Calculate CPU percentage based on delta
   */
  private calculateCpuPercentage(): number {
    const currentUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = Date.now();
    const deltaTime = currentTime - this.lastCpuTime;

    // Update for next calculation
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = currentTime;

    // Calculate CPU percentage
    // cpuUsage() returns microseconds, convert to milliseconds and calculate percentage
    const cpuTimeMs = (currentUsage.user + currentUsage.system) / 1000;
    const percentage = (cpuTimeMs / deltaTime) * 100;

    // Cap at 100% (can exceed on multi-core systems)
    return Math.min(percentage, 100);
  }

  /**
   * Collect current system metrics
   */
  private collectMetrics(): SystemMetrics {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();

    return {
      instanceId: this.instanceId,
      timestamp: Date.now(),
      cpu: {
        user: this.lastCpuUsage.user,
        system: this.lastCpuUsage.system,
        percentage: this.calculateCpuPercentage(),
      },
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        rssPercentage: (memoryUsage.rss / totalMemory) * 100,
        heapPercentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      },
      uptime: process.uptime(),
      loadAvg: os.loadavg() as [number, number, number],
      totalMemory,
      freeMemory: os.freemem(),
    };
  }

  /**
   * Start collecting metrics at regular intervals
   * @param intervalMs - Collection interval in milliseconds (default: 10000ms = 10s)
   * @param ttlMs - Time-to-live for cache entries (default: 60000ms = 60s)
   */
  async start(intervalMs: number = 10000, ttlMs: number = 60000): Promise<void> {
    if (this.intervalId) {
      platform.logger.warn('SystemMetricsCollector already started');
      return;
    }

    platform.logger.info('Starting system metrics collector', {
      instanceId: this.instanceId,
      intervalMs,
      ttlMs,
    });

    // Collect immediately on start
    await this.collect(ttlMs);

    // Then collect at intervals
    this.intervalId = setInterval(async () => {
      await this.collect(ttlMs);
    }, intervalMs);
  }

  /**
   * Collect metrics and write to cache
   */
  private async collect(ttlMs: number): Promise<void> {
    try {
      const metrics = this.collectMetrics();

      // Write to platform.cache with TTL
      // Key pattern: system-metrics:{instanceId}
      await platform.cache.set(
        `system-metrics:${this.instanceId}`,
        metrics,
        ttlMs
      );

      platform.logger.debug('System metrics collected', {
        instanceId: this.instanceId,
        cpu: metrics.cpu.percentage.toFixed(1) + '%',
        memory: metrics.memory.rssPercentage.toFixed(1) + '%',
        uptime: Math.floor(metrics.uptime) + 's',
      });
    } catch (error) {
      platform.logger.error('Failed to collect system metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      platform.logger.info('System metrics collector stopped');
    }
  }
}
