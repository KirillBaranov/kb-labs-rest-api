/**
 * @module @kb-labs/rest-api-core/adapters/queue/memory
 * In-memory queue adapter implementation
 */

import { ulid } from 'ulid';
import type { QueuePort, JobMetadata, JobStatus } from '../../ports/queue.js';
import type { RestApiConfig } from '../../config/schema.js';

/**
 * In-memory queue adapter
 */
export class MemoryQueueAdapter implements QueuePort {
  private jobs = new Map<string, JobMetadata>();
  private idempotencyKeys = new Map<string, string>(); // idempotencyKey -> jobId
  private runningJobs = new Set<string>(); // jobIds currently running
  private kindCounts = new Map<string, number>(); // kind -> count of running jobs

  constructor(private config: RestApiConfig) {}

  async enqueue(
    kind: string,
    payload: unknown,
    options?: {
      priority?: number;
      idempotencyKey?: string;
      maxRetries?: number;
      timeoutMs?: number;
    }
  ): Promise<{ jobId: string; runId?: string }> {
    // Check idempotency
    if (options?.idempotencyKey) {
      const existingJobId = this.idempotencyKeys.get(options.idempotencyKey);
      if (existingJobId) {
        const existingJob = this.jobs.get(existingJobId);
        if (existingJob) {
          return {
            jobId: existingJobId,
            runId: existingJob.runId,
          };
        }
      }
    }

    // Check concurrency limit
    const maxConcurrentConfig = this.config.queue.maxConcurrent;
    const maxConcurrent = maxConcurrentConfig && kind in maxConcurrentConfig 
      ? maxConcurrentConfig[kind as keyof typeof maxConcurrentConfig] 
      : Infinity;
    const currentCount = this.kindCounts.get(kind) || 0;
    
    if (currentCount >= maxConcurrent) {
      throw new Error(`Concurrency limit reached for job kind "${kind}": ${currentCount}/${maxConcurrent}`);
    }

    // Generate IDs
    const jobId = ulid();
    const runId = ulid();

    // Create job metadata
    const job: JobMetadata = {
      jobId,
      runId,
      kind,
      status: 'queued',
      priority: options?.priority ?? this.config.queue.defaultPriority ?? 0,
      createdAt: new Date().toISOString(),
      payload,
    };

    // Store job
    this.jobs.set(jobId, job);

    // Store idempotency key
    if (options?.idempotencyKey) {
      this.idempotencyKeys.set(options.idempotencyKey, jobId);
    }

    return { jobId, runId };
  }

  async getStatus(jobId: string): Promise<JobMetadata | null> {
    return this.jobs.get(jobId) || null;
  }

  async cancel(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return false;
    }

    job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();

    // Remove from running set
    this.runningJobs.delete(jobId);
    
    // Update kind count
    const currentCount = this.kindCounts.get(job.kind) || 0;
    this.kindCounts.set(job.kind, Math.max(0, currentCount - 1));

    return true;
  }

  async list(options?: {
    kind?: string;
    status?: JobStatus;
    cursor?: string;
    limit?: number;
  }): Promise<{ jobs: JobMetadata[]; cursor?: string; hasMore: boolean }> {
    let jobs = Array.from(this.jobs.values());

    // Filter by kind
    if (options?.kind) {
      jobs = jobs.filter(job => job.kind === options.kind);
    }

    // Filter by status
    if (options?.status) {
      jobs = jobs.filter(job => job.status === options.status);
    }

    // Sort by priority (desc) and createdAt (desc)
    jobs.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    // Apply cursor if provided
    let startIndex = 0;
    if (options?.cursor) {
      const cursorIndex = jobs.findIndex(job => job.jobId === options.cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    // Apply limit
    const limit = options?.limit || 25;
    const paginatedJobs = jobs.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < jobs.length;
    const cursor = hasMore ? paginatedJobs[paginatedJobs.length - 1]?.jobId : undefined;

    return {
      jobs: paginatedJobs,
      cursor,
      hasMore,
    };
  }

  /**
   * Update job status (internal use)
   */
  updateStatus(jobId: string, status: JobStatus, error?: string, progress?: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = status;
    
    if (status === 'running' && !job.startedAt) {
      job.startedAt = new Date().toISOString();
      this.runningJobs.add(jobId);
      
      // Update kind count
      const currentCount = this.kindCounts.get(job.kind) || 0;
      this.kindCounts.set(job.kind, currentCount + 1);
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout') {
      job.finishedAt = new Date().toISOString();
      this.runningJobs.delete(jobId);
      
      // Update kind count
      const currentCount = this.kindCounts.get(job.kind) || 0;
      this.kindCounts.set(job.kind, Math.max(0, currentCount - 1));
    }

    if (error) {
      job.error = error;
    }

    if (progress !== undefined) {
      job.progress = progress;
    }
  }
}

