/**
 * @module @kb-labs/rest-api-core/jobs/types
 * Job types and payloads
 */

/**
 * Job kind
 */
export type JobKind = 'audit.run' | 'release.run' | 'release.preview' | 'devlink.check';

/**
 * Job payload
 */
export interface JobPayload {
  args: string[];
  [key: string]: unknown;
}

/**
 * Job executor function
 */
export type JobExecutor = (payload: JobPayload, context: JobContext) => Promise<JobResult>;

/**
 * Job execution context
 */
export interface JobContext {
  jobId: string;
  runId?: string;
  repoRoot: string;
  config: unknown;
}

/**
 * Job execution result
 */
export interface JobResult {
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: Record<string, unknown>;
}

