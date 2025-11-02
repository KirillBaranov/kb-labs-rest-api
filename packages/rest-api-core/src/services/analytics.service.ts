/**
 * @module @kb-labs/rest-api-core/services/analytics
 * Analytics service implementation
 */

import type { StoragePort } from '../ports/storage.js';
import type { RestApiConfig } from '../config/schema.js';
import type { GetAnalyticsSummaryResponse } from '../contracts/analytics.js';

/**
 * Analytics service
 */
export class AnalyticsService {
  constructor(
    private storage: StoragePort,
    private config: RestApiConfig,
    private repoRoot: string
  ) {}

  /**
   * Get analytics summary
   */
  async getSummary(period?: { start: string; end: string }): Promise<GetAnalyticsSummaryResponse['data']> {
    // Default period: last 30 days
    const end = period?.end || new Date().toISOString();
    const start = period?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Try to read analytics data
    const analyticsPath = 'runs/analytics/summary.json';
    
    try {
      const exists = await this.storage.exists(analyticsPath);
      if (!exists) {
        return {
          period: { start, end },
          counters: {},
        };
      }

      const data = await this.storage.readJson<any>(analyticsPath);
      
      return {
        period: { start, end },
        counters: data.counters || {},
      };
    } catch (error) {
      return {
        period: { start, end },
        counters: {},
      };
    }
  }
}

