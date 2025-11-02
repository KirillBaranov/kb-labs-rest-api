/**
 * @module @kb-labs/rest-api-core/contracts/mind
 * Mind endpoint schemas
 */

import { z } from 'zod';
import { successEnvelopeSchema } from './envelope.js';

/**
 * Get mind summary response
 */
export const getMindSummaryResponseSchema = successEnvelopeSchema(
  z.object({
    freshness: z.number(), // 0-100
    drift: z.number(), // drift count
    lastSync: z.string().optional(),
  })
);

/**
 * Type exports
 */
export type GetMindSummaryResponse = z.infer<typeof getMindSummaryResponseSchema>;

