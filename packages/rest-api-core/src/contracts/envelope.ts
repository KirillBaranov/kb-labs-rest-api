/**
 * @module @kb-labs/rest-api-core/contracts/envelope
 * Request/response envelope schemas
 */

import { z } from 'zod';

/**
 * Success response envelope
 */
export const successEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
    meta: z.object({
      requestId: z.string(),
      durationMs: z.number(),
      schemaVersion: z.string().optional(),
    }),
  });

/**
 * Error response envelope
 */
export const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    cause: z.string().optional(),
  }),
  meta: z.object({
    requestId: z.string(),
    durationMs: z.number(),
    schemaVersion: z.string().optional(),
  }),
});

/**
 * Type exports
 */
export type SuccessEnvelope<T> = {
  ok: true;
  data: T;
  meta: {
    requestId: string;
    durationMs: number;
    schemaVersion?: string;
  };
};

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export type ApiResponse<T> = SuccessEnvelope<T> | ErrorEnvelope;

