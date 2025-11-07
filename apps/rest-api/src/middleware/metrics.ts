/**
 * @module @kb-labs/rest-api-app/middleware/metrics
 * Metrics collection middleware
 */

import type { FastifyInstance } from 'fastify/types/instance';

/**
 * Metrics data
 */
interface Metrics {
  requests: {
    total: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
    byRoute: Record<string, number>;
  };
  latency: {
    total: number;
    count: number;
    min: number;
    max: number;
    average: number;
  };
  errors: {
    total: number;
    byCode: Record<string, number>;
  };
  timestamps: {
    startTime: number;
    lastRequest: number;
  };
}

/**
 * Metrics singleton
 */
class MetricsCollector {
  private metrics: Metrics = {
    requests: {
      total: 0,
      byMethod: {},
      byStatus: {},
      byRoute: {},
    },
    latency: {
      total: 0,
      count: 0,
      min: Infinity,
      max: 0,
      average: 0,
    },
    errors: {
      total: 0,
      byCode: {},
    },
    timestamps: {
      startTime: Date.now(),
      lastRequest: 0,
    },
  };

  /**
   * Record request
   */
  recordRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    this.metrics.requests.total++;
    
    // Count by method
    this.metrics.requests.byMethod[method] = (this.metrics.requests.byMethod[method] || 0) + 1;
    
    // Count by status
    const statusGroup = `${Math.floor(statusCode / 100)}xx`;
    this.metrics.requests.byStatus[statusGroup] = (this.metrics.requests.byStatus[statusGroup] || 0) + 1;
    
    // Count by route (normalized)
    if (route) {
      const routePath = route.split('?')[0];
      if (routePath) {
        const normalizedRoute = routePath.replace(/\/\d+/g, '/:id');
        const currentRouteCount = this.metrics.requests.byRoute[normalizedRoute] || 0;
        this.metrics.requests.byRoute[normalizedRoute] = currentRouteCount + 1;
      }
    }
    
    // Update latency stats
    this.metrics.latency.count++;
    this.metrics.latency.total += durationMs;
    this.metrics.latency.min = Math.min(this.metrics.latency.min, durationMs);
    this.metrics.latency.max = Math.max(this.metrics.latency.max, durationMs);
    this.metrics.latency.average = this.metrics.latency.total / this.metrics.latency.count;
    
    // Update last request timestamp
    this.metrics.timestamps.lastRequest = Date.now();
  }

  /**
   * Record error
   */
  recordError(errorCode: string): void {
    this.metrics.errors.total++;
    this.metrics.errors.byCode[errorCode] = (this.metrics.errors.byCode[errorCode] || 0) + 1;
  }

  /**
   * Get current metrics
   */
  getMetrics(): Metrics {
    return {
      ...this.metrics,
      latency: {
        ...this.metrics.latency,
        average: this.metrics.latency.count > 0 
          ? this.metrics.latency.total / this.metrics.latency.count 
          : 0,
      },
    };
  }

  /**
   * Reset metrics (for testing)
   */
  reset(): void {
    this.metrics = {
      requests: {
        total: 0,
        byMethod: {},
        byStatus: {},
        byRoute: {},
      },
      latency: {
        total: 0,
        count: 0,
        min: Infinity,
        max: 0,
        average: 0,
      },
      errors: {
        total: 0,
        byCode: {},
      },
      timestamps: {
        startTime: Date.now(),
        lastRequest: 0,
      },
    };
  }
}

/**
 * Global metrics collector instance
 */
export const metricsCollector = new MetricsCollector();

/**
 * Register metrics middleware
 */
export function registerMetricsMiddleware(server: FastifyInstance): void {
  // Record request metrics
  server.addHook('onResponse', async (request, reply) => {
    const method = request.method;
    const route = request.url;
    const statusCode = reply.statusCode || 500;
    const durationMs = (reply.elapsedTime as number | undefined) || 0;

    metricsCollector.recordRequest(method, route, statusCode, durationMs);

    // Record error if status >= 400
    if (statusCode >= 400) {
      const errorCode = (reply as any).errorCode || `HTTP_${statusCode}`;
      metricsCollector.recordError(errorCode);
    }
  });
}

