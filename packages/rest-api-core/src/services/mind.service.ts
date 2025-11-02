/**
 * @module @kb-labs/rest-api-core/services/mind
 * Mind service implementation
 */

import type { StoragePort } from '../ports/storage.js';
import type { RestApiConfig } from '../config/schema.js';
import { createError, ErrorCode } from '../utils/errors.js';
import type { GetMindSummaryResponse } from '../contracts/mind.js';

/**
 * Mind service
 */
export class MindService {
  constructor(
    private storage: StoragePort,
    private config: RestApiConfig,
    private repoRoot: string
  ) {}

  /**
   * Get mind summary
   */
  async getSummary(): Promise<GetMindSummaryResponse['data']> {
    // Try to read mind summary
    const summaryPath = 'runs/mind/latest/summary.json';
    
    try {
      const exists = await this.storage.exists(summaryPath);
      if (!exists) {
        return {
          freshness: 100,
          drift: 0,
        };
      }

      const summary = await this.storage.readJson<any>(summaryPath);
      
      return {
        freshness: summary.freshness || 100,
        drift: summary.drift || 0,
        lastSync: summary.lastSync,
      };
    } catch (error) {
      return {
        freshness: 100,
        drift: 0,
      };
    }
  }
}

