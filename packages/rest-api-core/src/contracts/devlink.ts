/**
 * @module @kb-labs/rest-api-core/contracts/devlink
 * DevLink endpoint schemas
 */

import { z } from 'zod';
import { successEnvelopeSchema } from './envelope.js';

/**
 * Create devlink check request
 */
export const createDevlinkCheckRequestSchema = z.object({
  idempotencyKey: z.string().optional(),
});

/**
 * Create devlink check response
 */
export const createDevlinkCheckResponseSchema = successEnvelopeSchema(
  z.object({
    runId: z.string(),
    jobId: z.string(),
  })
);

/**
 * Get devlink summary response
 */
export const getDevlinkSummaryResponseSchema = successEnvelopeSchema(
  z.object({
    cycles: z.array(z.array(z.string())),
    mismatches: z.number(),
    status: z.enum(['ok', 'warn', 'error']),
  })
);

/**
 * Get devlink graph response
 */
export const getDevlinkGraphResponseSchema = successEnvelopeSchema(
  z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
      })
    ),
    edges: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.string(),
      })
    ),
  })
);

/**
 * Type exports
 */
export type CreateDevlinkCheckRequest = z.infer<typeof createDevlinkCheckRequestSchema>;
export type CreateDevlinkCheckResponse = z.infer<typeof createDevlinkCheckResponseSchema>;
export type GetDevlinkSummaryResponse = z.infer<typeof getDevlinkSummaryResponseSchema>;
export type GetDevlinkGraphResponse = z.infer<typeof getDevlinkGraphResponseSchema>;

