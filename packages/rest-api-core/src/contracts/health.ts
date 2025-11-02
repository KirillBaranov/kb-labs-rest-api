/**
 * @module @kb-labs/rest-api-core/contracts/health
 * Health and info endpoint schemas
 */

import { z } from 'zod';
import { successEnvelopeSchema } from './envelope.js';

/**
 * Health response schema
 */
export const healthResponseSchema = successEnvelopeSchema(
  z.object({
    status: z.literal('ok'),
    version: z.string(),
    node: z.string(),
    uptimeSec: z.number(),
  })
);

/**
 * Info response schema
 */
export const infoResponseSchema = successEnvelopeSchema(
  z.object({
    cwd: z.string(),
    repo: z.string().optional(),
    profiles: z.array(z.string()),
    plugins: z.array(z.string()),
    apiVersion: z.string(),
  })
);

/**
 * Capabilities response schema
 */
export const capabilitiesResponseSchema = successEnvelopeSchema(
  z.object({
    commands: z.array(z.string()),
    adapters: z.object({
      queue: z.array(z.string()),
      storage: z.array(z.string()),
      auth: z.array(z.string()),
    }),
  })
);

/**
 * Config response schema (redacted)
 */
export const configResponseSchema = successEnvelopeSchema(
  z.object({
    port: z.number(),
    basePath: z.string(),
    auth: z.object({
      mode: z.string(),
    }),
    queue: z.object({
      driver: z.string(),
    }),
    storage: z.object({
      driver: z.string(),
    }),
    mockMode: z.boolean(),
    // Other fields masked for security
  })
);

/**
 * Type exports
 */
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type InfoResponse = z.infer<typeof infoResponseSchema>;
export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;
export type ConfigResponse = z.infer<typeof configResponseSchema>;

