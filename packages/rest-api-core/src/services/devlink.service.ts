/**
 * @module @kb-labs/rest-api-core/services/devlink
 * DevLink service implementation
 */

import type { CliPort } from '../ports/cli.js';
import type { StoragePort } from '../ports/storage.js';
import type { QueuePort } from '../ports/queue.js';
import type { RestApiConfig } from '../config/schema.js';
import { createError, ErrorCode } from '../utils/errors.js';
import type {
  CreateDevlinkCheckRequest,
  GetDevlinkSummaryResponse,
  GetDevlinkGraphResponse,
} from '../contracts/devlink.js';

/**
 * DevLink service
 */
export class DevlinkService {
  constructor(
    private cli: CliPort,
    private storage: StoragePort,
    private queue: QueuePort,
    private config: RestApiConfig,
    private repoRoot: string
  ) {}

  /**
   * Create devlink check (enqueue job)
   */
  async createCheck(request: CreateDevlinkCheckRequest): Promise<{ runId: string; jobId: string }> {
    // Build CLI args
    const args: string[] = ['devlink', 'check', '--json'];

    // Enqueue job
    const { jobId, runId } = await this.queue.enqueue(
      'devlink.check',
      { args },
      {
        priority: 0,
        idempotencyKey: request.idempotencyKey,
        timeoutMs: this.config.cli.timeoutSec * 1000,
      }
    );

    return {
      runId: runId || jobId,
      jobId,
    };
  }

  /**
   * Get devlink summary
   */
  async getSummary(): Promise<GetDevlinkSummaryResponse['data']> {
    // Try to read latest summary
    const summaryPath = 'runs/devlink/latest/summary.json';
    
    try {
      const exists = await this.storage.exists(summaryPath);
      if (!exists) {
        return {
          cycles: [],
          mismatches: 0,
          status: 'ok',
        };
      }

      const summary = await this.storage.readJson<any>(summaryPath);
      
      return {
        cycles: summary.cycles || [],
        mismatches: summary.mismatches || 0,
        status: summary.status || 'ok',
      };
    } catch (error) {
      return {
        cycles: [],
        mismatches: 0,
        status: 'ok',
      };
    }
  }

  /**
   * Get devlink graph
   */
  async getGraph(): Promise<GetDevlinkGraphResponse['data']> {
    // Try to read latest graph
    const graphPath = 'runs/devlink/latest/graph.json';
    
    const exists = await this.storage.exists(graphPath);
    if (!exists) {
      // Return empty graph if not found
      return {
        nodes: [],
        edges: [],
      };
    }

    return await this.storage.readJson(graphPath);
  }
}

