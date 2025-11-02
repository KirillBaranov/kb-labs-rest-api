/**
 * @module @kb-labs/rest-api-core/ports/queue
 * QueuePort interface for job queue management
 */

/**
 * Job status
 */
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

/**
 * Job metadata
 */
export interface JobMetadata {
  jobId: string;
  runId?: string;
  kind: string;
  status: JobStatus;
  priority: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  progress?: number; // 0-100
  error?: string;
  payload: unknown;
}

/**
 * Queue Port interface
 * Provides abstraction for job queue operations
 */
export interface QueuePort {
  /**
   * Enqueue a job
   * @param kind - Job kind (e.g., 'audit.run', 'release.run')
   * @param payload - Job payload
   * @param options - Enqueue options
   * @returns Job ID and optional run ID
   */
  enqueue(
    kind: string,
    payload: unknown,
    options?: {
      priority?: number;
      idempotencyKey?: string;
      maxRetries?: number;
      timeoutMs?: number;
    }
  ): Promise<{ jobId: string; runId?: string }>;

  /**
   * Get job status
   * @param jobId - Job ID
   * @returns Job metadata or null if not found
   */
  getStatus(jobId: string): Promise<JobMetadata | null>;

  /**
   * Cancel a job
   * @param jobId - Job ID
   * @returns True if job was cancelled, false if not found or already completed
   */
  cancel(jobId: string): Promise<boolean>;

  /**
   * List jobs
   * @param options - List options
   * @returns Array of job metadata
   */
  list(options?: {
    kind?: string;
    status?: JobStatus;
    cursor?: string;
    limit?: number;
  }): Promise<{ jobs: JobMetadata[]; cursor?: string; hasMore: boolean }>;
}

