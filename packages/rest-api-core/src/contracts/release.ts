/**
 * @module @kb-labs/rest-api-core/contracts/release
 * Release endpoint schemas
 */

import { z } from 'zod';
import { successEnvelopeSchema } from './envelope.js';

/**
 * Release preview request
 */
export const releasePreviewRequestSchema = z.object({
  strategy: z.enum(['independent', 'ripple', 'lockstep']).optional(),
  fromTag: z.string().optional(),
  toRef: z.string().optional(),
});

/**
 * Release preview response
 */
export const releasePreviewResponseSchema = successEnvelopeSchema(
  z.object({
    plan: z.object({
      packages: z.array(
        z.object({
          name: z.string(),
          version: z.string(),
          type: z.enum(['patch', 'minor', 'major']),
        })
      ),
    }),
    changelog: z.string(),
  })
);

/**
 * Create release run request
 */
export const createReleaseRunRequestSchema = z.object({
  dryRun: z.boolean().optional(),
  strategy: z.enum(['independent', 'ripple', 'lockstep']).optional(),
  confirm: z.boolean().optional(),
  idempotencyKey: z.string().optional(),
});

/**
 * Create release run response
 */
export const createReleaseRunResponseSchema = successEnvelopeSchema(
  z.object({
    runId: z.string(),
    jobId: z.string(),
  })
);

/**
 * Get release run response
 */
export const getReleaseRunResponseSchema = successEnvelopeSchema(
  z.object({
    runId: z.string(),
    status: z.enum(['queued', 'running', 'completed', 'failed']),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    changelog: z.string().optional(),
  })
);

/**
 * Get release changelog response
 */
export const getReleaseChangelogResponseSchema = successEnvelopeSchema(
  z.object({
    changelog: z.string(),
    format: z.enum(['markdown', 'json']),
  })
);

/**
 * Type exports
 */
export type ReleasePreviewRequest = z.infer<typeof releasePreviewRequestSchema>;
export type ReleasePreviewResponse = z.infer<typeof releasePreviewResponseSchema>;
export type CreateReleaseRunRequest = z.infer<typeof createReleaseRunRequestSchema>;
export type CreateReleaseRunResponse = z.infer<typeof createReleaseRunResponseSchema>;
export type GetReleaseRunResponse = z.infer<typeof getReleaseRunResponseSchema>;
export type GetReleaseChangelogResponse = z.infer<typeof getReleaseChangelogResponseSchema>;

