/**
 * @module @kb-labs/rest-api-core/adapters/queue/memory
 * In-memory queue adapter implementation
 */

import { ulid } from 'ulid';
import type { QueuePort, JobMetadata, JobStatus } from '../../ports/queue.js';
import type { RestApiConfig } from '../../config/schema.js';

/**
 * Job event types
 */
export type JobEventType = 'job.queued' | 'job.started' | 'job.progress' | 'job.finished' | 'job.failed' | 'job.retry' | 'job.cancelled' | 'job.timeout';

/**
 * Job event
 */
export interface JobEvent {
  type: JobEventType;
  jobId: string;
  timestamp: string;
  data?: {
    status?: JobStatus;
    progress?: number;
    error?: string;
  };
}

/**
 * In-memory queue adapter
 */
export class MemoryQueueAdapter implements QueuePort {
  private jobs = new Map<string, JobMetadata>();
  private idempotencyKeys = new Map<string, string>(); // idempotencyKey -> jobId
  private runningJobs = new Set<string>(); // jobIds currently running
  private kindCounts = new Map<string, number>(); // kind -> count of running jobs
  private eventListeners = new Map<string, Set<(event: JobEvent) => void>>(); // jobId -> listeners
  private cliAdapter: any; // Reference to CLI adapter for cancellation

  constructor(private config: RestApiConfig) {}

  /**
   * Set CLI adapter reference (for cancellation support)
   */
  setCliAdapter(cliAdapter: any): void {
    this.cliAdapter = cliAdapter;
  }

  /**
   * Subscribe to job events
   */
  subscribeToJobEvents(jobId: string, listener: (event: JobEvent) => void): () => void {
    if (!this.eventListeners.has(jobId)) {
      this.eventListeners.set(jobId, new Set());
    }
    this.eventListeners.get(jobId)!.add(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(jobId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.eventListeners.delete(jobId);
        }
      }
    };
  }

  /**
   * Emit job event
   */
  emitEvent(jobId: string, type: JobEventType, data?: { status?: JobStatus; progress?: number; error?: string; retryCount?: number; delay?: number }): void {
    const listeners = this.eventListeners.get(jobId);
    if (listeners) {
      const event: JobEvent = {
        type,
        jobId,
        timestamp: new Date().toISOString(),
        data,
      };
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          // Ignore listener errors
        }
      });
    }
  }

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

    // Get retry config from options or global config
    const maxRetries = options?.maxRetries ?? this.config.queue.retry?.maxRetries ?? 0;

    // Create job metadata
    const job: JobMetadata = {
      jobId,
      runId,
      kind,
      status: 'queued',
      priority: options?.priority ?? this.config.queue.defaultPriority ?? 0,
      createdAt: new Date().toISOString(),
      payload,
      retryCount: 0,
      maxRetries,
    };

    // Store job
    this.jobs.set(jobId, job);

    // Store idempotency key
    if (options?.idempotencyKey) {
      this.idempotencyKeys.set(options.idempotencyKey, jobId);
    }

    // Emit queued event
    this.emitEvent(jobId, 'job.queued', { status: 'queued' });

    return { jobId, runId };
  }

  async getStatus(jobId: string): Promise<JobMetadata | null> {
    return this.jobs.get(jobId) || null;
  }

  async cancel(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return false;
    }

    // If job is running, try to cancel the CLI process
    if (job.status === 'running' && this.cliAdapter && typeof this.cliAdapter.cancelProcess === 'function') {
      const cancelled = this.cliAdapter.cancelProcess(jobId);
      if (!cancelled) {
        // Process not found, but mark job as cancelled anyway
      }
    }

    job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();
    job.error = 'Job was cancelled';

    // Remove from running set
    this.runningJobs.delete(jobId);
    
    // Update kind count
    const currentCount = this.kindCounts.get(job.kind) || 0;
    this.kindCounts.set(job.kind, Math.max(0, currentCount - 1));

    // Emit cancelled event
    this.emitEvent(jobId, 'job.cancelled', { status: 'cancelled' });

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
   * Get queue statistics
   */
  getStats(): {
    size: number;
    running: number;
    queued: number;
    completed: number;
    failed: number;
    capacity: {
      total: number;
      byKind: Record<string, { current: number; max: number }>;
    };
  } {
    const jobs = Array.from(this.jobs.values());
    const running = jobs.filter(j => j.status === 'running').length;
    const queued = jobs.filter(j => j.status === 'queued').length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const failed = jobs.filter(j => j.status === 'failed').length;

    const byKind: Record<string, { current: number; max: number }> = {};
    const maxConcurrent = this.config.queue.maxConcurrent;
    
    if (maxConcurrent) {
      for (const [kind, max] of Object.entries(maxConcurrent)) {
        byKind[kind] = {
          current: this.kindCounts.get(kind) || 0,
          max: max as number,
        };
      }
    }

    const totalCapacity = maxConcurrent
      ? Object.values(maxConcurrent).reduce((sum, max) => sum + (max as number), 0)
      : Infinity;

    return {
      size: jobs.length,
      running,
      queued,
      completed,
      failed,
      capacity: {
        total: totalCapacity,
        byKind,
      },
    };
  }

  /**
   * Update retry count (internal use)
   */
  updateRetryCount(jobId: string, retryCount: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.retryCount = retryCount;
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

      // Emit started event
      this.emitEvent(jobId, 'job.started', { status: 'running' });
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout') {
      job.finishedAt = new Date().toISOString();
      this.runningJobs.delete(jobId);
      
      // Update kind count
      const currentCount = this.kindCounts.get(job.kind) || 0;
      this.kindCounts.set(job.kind, Math.max(0, currentCount - 1));

      // Emit finished/failed/cancelled/timeout event
      if (status === 'completed') {
        this.emitEvent(jobId, 'job.finished', { status: 'completed' });
      } else if (status === 'cancelled') {
        this.emitEvent(jobId, 'job.cancelled', { status: 'cancelled' });
      } else if (status === 'timeout') {
        this.emitEvent(jobId, 'job.timeout', { status: 'timeout', error: job.error });
      } else {
        this.emitEvent(jobId, 'job.failed', { status, error: job.error });
      }
    }

    if (error) {
      job.error = error;
    }

    if (progress !== undefined) {
      job.progress = progress;
      // Emit progress event
      this.emitEvent(jobId, 'job.progress', { status: job.status, progress });
    }
  }

  /**
   * Cleanup expired jobs
   */
  async cleanup(ttlSec: number): Promise<number> {
    const now = Date.now();
    const ttlMs = ttlSec * 1000;
    let cleanedCount = 0;

    const jobsToClean: string[] = [];

    // Find expired jobs (completed, failed, cancelled, timeout)
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'queued' || job.status === 'running') {
        continue; // Skip active jobs
      }

      const finishedAt = job.finishedAt ? new Date(job.finishedAt).getTime() : null;
      if (!finishedAt) {
        // Use createdAt as fallback
        const createdAt = new Date(job.createdAt).getTime();
        if (now - createdAt > ttlMs) {
          jobsToClean.push(jobId);
        }
      } else {
        if (now - finishedAt > ttlMs) {
          jobsToClean.push(jobId);
        }
      }
    }

    // Remove expired jobs
    for (const jobId of jobsToClean) {
      this.jobs.delete(jobId);
      this.runningJobs.delete(jobId);
      this.eventListeners.delete(jobId);
      cleanedCount++;
    }

    return cleanedCount;
  }
}

