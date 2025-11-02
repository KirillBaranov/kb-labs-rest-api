/**
 * @module @kb-labs/rest-api-core/contracts/audit
 * Audit endpoint schemas
 */

import { z } from 'zod';
import { successEnvelopeSchema } from './envelope.js';

/**
 * Create audit run request
 */
export const createAuditRunRequestSchema = z.object({
  scope: z.string().optional(),
  strict: z.boolean().optional(),
  profile: z.string().optional(),
  timeoutSec: z.number().int().positive().optional(),
  idempotencyKey: z.string().optional(),
});

/**
 * Create audit run response
 */
export const createAuditRunResponseSchema = successEnvelopeSchema(
  z.object({
    runId: z.string(),
    jobId: z.string(),
  })
);

/**
 * Get audit run response
 */
export const getAuditRunResponseSchema = successEnvelopeSchema(
  z.object({
    runId: z.string(),
    status: z.enum(['queued', 'running', 'completed', 'failed']),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    summary: z.record(z.unknown()).optional(),
  })
);

/**
 * List audit runs query params
 */
export const listAuditRunsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['queued', 'running', 'completed', 'failed']).optional(),
  since: z.string().optional(), // ISO date
});

/**
 * List audit runs response
 */
export const listAuditRunsResponseSchema = successEnvelopeSchema(
  z.object({
    runs: z.array(
      z.object({
        runId: z.string(),
        status: z.string(),
        createdAt: z.string(),
        finishedAt: z.string().optional(),
      })
    ),
    cursor: z.string().optional(),
    hasMore: z.boolean(),
  })
);

/**
 * Get audit report response
 */
export const getAuditReportResponseSchema = successEnvelopeSchema(
  z.record(z.unknown()) // Report JSON structure
);

/**
 * Get audit summary response
 */
export const getAuditSummaryResponseSchema = successEnvelopeSchema(
  z.object({
    overall: z.object({
      ok: z.boolean(),
      severity: z.enum(['none', 'low', 'medium', 'high', 'critical']),
    }),
    counts: z.record(z.number()),
    lastRunAt: z.string().optional(),
  })
);

/**
 * Type exports
 */
export type CreateAuditRunRequest = z.infer<typeof createAuditRunRequestSchema>;
export type CreateAuditRunResponse = z.infer<typeof createAuditRunResponseSchema>;
export type GetAuditRunResponse = z.infer<typeof getAuditRunResponseSchema>;
export type ListAuditRunsQuery = z.infer<typeof listAuditRunsQuerySchema>;
export type ListAuditRunsResponse = z.infer<typeof listAuditRunsResponseSchema>;
export type GetAuditReportResponse = z.infer<typeof getAuditReportResponseSchema>;
export type GetAuditSummaryResponse = z.infer<typeof getAuditSummaryResponseSchema>;

