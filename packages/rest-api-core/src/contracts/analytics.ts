/**
 * @module @kb-labs/rest-api-core/contracts/analytics
 * Analytics endpoint schemas
 */

import { z } from 'zod';
import { successEnvelopeSchema } from './envelope.js';

/**
 * Get analytics summary response
 */
export const getAnalyticsSummaryResponseSchema = successEnvelopeSchema(
  z.object({
    period: z.object({
      start: z.string(),
      end: z.string(),
    }),
    counters: z.record(z.number()),
  })
);

/**
 * Type exports
 */
export type GetAnalyticsSummaryResponse = z.infer<typeof getAnalyticsSummaryResponseSchema>;

