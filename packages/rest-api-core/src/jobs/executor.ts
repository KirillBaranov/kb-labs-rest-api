/**
 * @module @kb-labs/rest-api-core/jobs/executor
 * Generic job executor
 */

import type { CliPort } from '../ports/cli.js';
import type { StoragePort } from '../ports/storage.js';
import type { QueuePort } from '../ports/queue.js';
import type { RestApiConfig } from '../config/schema.js';
import { mapCliExitCodeToErrorCode, ErrorCode } from '../utils/errors.js';
import type { JobExecutor, JobContext, JobResult, JobPayload } from './types.js';

/**
 * Generic job executor
 */
export class JobExecutorImpl {
  constructor(
    private cli: CliPort,
    private storage: StoragePort,
    private queue: QueuePort,
    private config: RestApiConfig,
    private repoRoot: string
  ) {}

  /**
   * Execute job
   */
  async execute(jobId: string, executor: JobExecutor, payload: JobPayload): Promise<void> {
    // Get job metadata
    const job = await this.queue.getStatus(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Update status to running
    const queue = this.queue as any;
    if (typeof queue.updateStatus === 'function') {
      queue.updateStatus(jobId, 'running');
    }

    try {
      // Create context
      const context: JobContext = {
        jobId,
        runId: job.runId,
        repoRoot: this.repoRoot,
        config: this.config,
      };

      // Execute job
      const result = await executor(payload, context);

      // Update status
      const queue = this.queue as any;
      if (typeof queue.updateStatus === 'function') {
        queue.updateStatus(
          jobId,
          result.success ? 'completed' : 'failed',
          result.error,
          100
        );
      }

      // Store artifacts if provided
      if (result.artifacts) {
        for (const [key, value] of Object.entries(result.artifacts)) {
          const artifactPath = `runs/${job.kind}/${job.runId || jobId}/${key}.json`;
          await this.storage.writeJson(artifactPath, value);
        }
      }
    } catch (error: any) {
      // Update status to failed
      const queue = this.queue as any;
      if (typeof queue.updateStatus === 'function') {
        queue.updateStatus(jobId, 'failed', error.message);
      }
      throw error;
    }
  }
}

