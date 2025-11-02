/**
 * @module @kb-labs/rest-api-core/contracts/jobs
 * Jobs endpoint schemas
 */

import { z } from 'zod';
import { successEnvelopeSchema } from './envelope.js';

/**
 * Job status enum
 */
export const jobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'timeout']);

/**
 * Job response schema
 */
export const jobResponseSchema = successEnvelopeSchema(
  z.object({
    jobId: z.string(),
    runId: z.string().optional(),
    status: jobStatusSchema,
    kind: z.string(),
    createdAt: z.string(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    progress: z.number().optional(), // 0-100
    error: z.string().optional(),
  })
);

/**
 * Job logs response schema
 */
export const jobLogsResponseSchema = successEnvelopeSchema(
  z.object({
    jobId: z.string(),
    logs: z.array(
      z.object({
        timestamp: z.string(),
        level: z.enum(['info', 'warn', 'error', 'debug']),
        message: z.string(),
      })
    ),
    offset: z.number().optional(),
    hasMore: z.boolean(),
  })
);

/**
 * Create job request schema
 */
export const createJobRequestSchema = z.object({
  kind: z.string(),
  payload: z.record(z.unknown()),
  priority: z.number().optional(),
  idempotencyKey: z.string().optional(),
});

/**
 * Type exports
 */
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobResponse = z.infer<typeof jobResponseSchema>;
export type JobLogsResponse = z.infer<typeof jobLogsResponseSchema>;
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

