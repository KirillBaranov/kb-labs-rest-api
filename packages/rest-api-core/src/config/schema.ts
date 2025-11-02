/**
 * @module @kb-labs/rest-api-core/config/schema
 * Zod schema for REST API configuration
 */

import { z } from 'zod';

/**
 * REST API configuration schema
 */
export const restApiConfigSchema = z.object({
  port: z.number().int().positive().default(3001),
  basePath: z.string().default('/api/v1'),
  apiVersion: z.string().default('1.0.0'),
  
  auth: z.object({
    mode: z.enum(['none', 'jwt', 'apiKey']).default('none'),
    jwksUrl: z.string().url().optional(),
    apiKeyHeader: z.string().default('X-API-Key'),
    roles: z.array(z.enum(['viewer', 'operator', 'admin'])).default(['viewer', 'operator', 'admin']),
  }).default({}),
  
  queue: z.object({
    driver: z.enum(['memory', 'bullmq']).default('memory'),
    redisUrl: z.string().optional(),
    maxConcurrent: z.object({
      audit: z.number().int().positive().default(2),
      release: z.number().int().positive().default(1),
      devlink: z.number().int().positive().default(2),
    }).optional(),
    defaultPriority: z.number().int().default(0),
    retry: z.object({
      maxRetries: z.number().int().nonnegative().default(0),
      backoff: z.object({
        type: z.enum(['fixed', 'exponential']).default('fixed'),
        delay: z.number().int().positive().default(1000),
      }).optional(),
    }).optional(),
  }).default({}),
  
  cli: z.object({
    bin: z.string().default('pnpm'),
    prefix: z.array(z.string()).default(['kb']),
    timeoutSec: z.number().int().positive().default(900),
    allowedCommands: z.array(z.string()).default(['audit', 'release', 'devlink', 'mind', 'analytics']),
    cwdRestriction: z.string().optional(), // repo root path
  }).default({}),
  
  storage: z.object({
    driver: z.enum(['fs', 's3']).default('fs'),
    baseDir: z.string().default('.kb/rest'),
    s3Bucket: z.string().optional(),
    s3Prefix: z.string().optional(),
  }).default({}),
  
  plugins: z.array(z.string()).default([]),
  mockMode: z.boolean().default(false),
  
  cors: z.object({
    origins: z.array(z.string()).default(['http://localhost:3000']),
    allowCredentials: z.boolean().default(true),
  }).default({}),
  
  timeouts: z.object({
    requestTimeout: z.number().int().positive().default(30000),
    bodyLimit: z.number().int().positive().default(10485760), // 10MB
  }).optional(),
  
  rateLimit: z.object({
    max: z.number().int().positive().default(60),
    timeWindow: z.string().default('1 minute'), // ms or string like '1 minute'
    perIp: z.boolean().default(true),
  }).optional(),
});

export type RestApiConfig = z.infer<typeof restApiConfigSchema>;

