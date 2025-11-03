/**
 * @module @kb-labs/rest-api-core/jobs/executor
 * Generic job executor with retry support
 */

import type { CliPort } from '../ports/cli.js';
import type { StoragePort } from '../ports/storage.js';
import type { QueuePort } from '../ports/queue.js';
import type { RestApiConfig } from '../config/schema.js';
import { mapCliExitCodeToErrorCode, ErrorCode } from '../utils/errors.js';
import type { JobExecutor, JobContext, JobResult, JobPayload } from './types.js';

/**
 * Calculate backoff delay
 */
function calculateBackoff(
  retryCount: number,
  backoffType: 'fixed' | 'exponential',
  baseDelay: number
): number {
  if (backoffType === 'fixed') {
    return baseDelay;
  }
  // Exponential backoff: baseDelay * 2^retryCount
  return baseDelay * Math.pow(2, retryCount);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generic job executor with retry support
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
   * Execute job with retry logic
   */
  async execute(jobId: string, executor: JobExecutor, payload: JobPayload): Promise<void> {
    // Get job metadata
    const job = await this.queue.getStatus(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const maxRetries = job.maxRetries ?? 0;
    let retryCount = job.retryCount ?? 0;
    const retryConfig = this.config.queue.retry;
    const backoffType = retryConfig?.backoff?.type ?? 'fixed';
    const baseDelay = retryConfig?.backoff?.delay ?? 1000;

    // Update status to running
    const queue = this.queue as any;
    if (typeof queue.updateStatus === 'function') {
      queue.updateStatus(jobId, 'running');
    }

    while (true) {
      // Check if job was cancelled before execution
      const currentJob = await this.queue.getStatus(jobId);
      if (!currentJob || currentJob.status === 'cancelled') {
        // Job was cancelled
        const queue = this.queue as any;
        if (typeof queue.updateStatus === 'function') {
          queue.updateStatus(jobId, 'cancelled', 'Job was cancelled');
        }
        throw new Error('Job was cancelled');
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

        // Check if job succeeded
        if (!result.success) {
          // Job failed - check if we should retry
          const error = result.error || 'Job execution failed';
          if (retryCount < maxRetries) {
            retryCount++;

            // Calculate backoff delay
            const delay = calculateBackoff(retryCount - 1, backoffType, baseDelay);

            // Update retry count in job metadata
            if (typeof (queue as any).updateRetryCount === 'function') {
              (queue as any).updateRetryCount(jobId, retryCount);
            }

            // Emit retry event
            if (typeof (queue as any).emitEvent === 'function') {
              (queue as any).emitEvent(jobId, 'job.retry', {
                status: 'running',
                retryCount,
                delay,
                error,
              });
            }

            // Wait before retry
            await sleep(delay);

            // Continue loop to retry
            continue;
          }

          // Max retries exceeded - mark as failed
          if (typeof queue.updateStatus === 'function') {
            queue.updateStatus(jobId, 'failed', error);
          }
          throw new Error(error);
        }

        // Success - update status and store artifacts
        if (typeof queue.updateStatus === 'function') {
          queue.updateStatus(
            jobId,
            'completed',
            undefined,
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

        return; // Success - exit loop
      } catch (error: any) {
        // Check if we should retry
        if (retryCount < maxRetries) {
          retryCount++;

          // Calculate backoff delay
          const delay = calculateBackoff(retryCount - 1, backoffType, baseDelay);

          // Update retry count in job metadata
          if (typeof (queue as any).updateRetryCount === 'function') {
            (queue as any).updateRetryCount(jobId, retryCount);
          }

          // Emit retry event
          if (typeof (queue as any).emitEvent === 'function') {
            (queue as any).emitEvent(jobId, 'job.retry', {
              status: 'running',
              retryCount,
              delay,
            });
          }

          // Wait before retry
          await sleep(delay);

          // Continue loop to retry
          continue;
        }

        // Max retries exceeded - mark as failed
        if (typeof queue.updateStatus === 'function') {
          queue.updateStatus(jobId, 'failed', error.message);
        }
        throw error;
      }
    }
  }
}

