/**
 * @module @kb-labs/rest-api-core/config/schema
 * Zod schema for REST API configuration
 */

import { z } from 'zod';

export const restApiConfigSchema = z.object({
  port: z.number().int().positive().default(5050),
  basePath: z.string().default('/api/v1'),
  apiVersion: z.string().default('1.0.0'),
  cors: z.object({
    origins: z.array(z.string()).default(['http://localhost:3000', 'http://localhost:5173']),
    allowCredentials: z.boolean().default(true),
    profile: z.enum(['dev', 'preview', 'prod']).default('dev'),
  }).default({}),
  timeouts: z.object({
    requestTimeout: z.number().int().positive().default(30000),
    bodyLimit: z.number().int().positive().default(10_485_760),
  }).optional(),
  rateLimit: z.object({
    max: z.number().int().positive().default(60),
    timeWindow: z.string().default('1 minute'),
  }).optional(),
  plugins: z.array(z.string()).default([]),
  mockMode: z.boolean().default(false),
});

export type RestApiConfig = z.infer<typeof restApiConfigSchema>;

