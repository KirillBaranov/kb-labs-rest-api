/**
 * @module @kb-labs/rest-api-app/__tests__/integration/studio
 * Integration tests for REST API ↔ Studio compatibility
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createServer } from '../../server.js';
import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { findRepoRoot } from '@kb-labs/core-sys';
import {
  createAuditRunRequestSchema,
  createAuditRunResponseSchema,
  getAuditSummaryResponseSchema,
  healthResponseSchema,
  readyResponseSchema,
  jobResponseSchema,
} from '@kb-labs/api-contracts';

describe('REST API ↔ Studio integration tests', () => {
  let server: any;
  let baseUrl: string;

  beforeAll(async () => {
    const repoRoot = await findRepoRoot(process.cwd());
    const { config } = await loadRestApiConfig(repoRoot);
    server = await createServer(config, repoRoot);
    baseUrl = `http://localhost:${config.port}${config.basePath}`;
  });

  describe('Happy path: health → run audit → get job → get report', () => {
    it('should complete full audit flow', async () => {
      // 1. Health check
      const healthResponse = await server.inject({
        method: 'GET',
        url: `${baseUrl}/health/live`,
      });

      expect(healthResponse.statusCode).toBe(200);
      const healthBody = JSON.parse(healthResponse.body);
      healthResponseSchema.parse(healthBody);
      expect(healthBody.data.status).toBe('ok');

      // 2. Create audit run
      const createResponse = await server.inject({
        method: 'POST',
        url: `${baseUrl}/audit/runs`,
        headers: {
          'Content-Type': 'application/json',
          'KB-Mock': 'true',
        },
        payload: {
          scope: 'packages/*',
          strict: true,
        },
      });

      expect(createResponse.statusCode).toBe(202);
      const createBody = JSON.parse(createResponse.body);
      createAuditRunResponseSchema.parse(createBody);
      
      const { jobId, runId } = createBody.data;
      expect(jobId).toBeDefined();
      expect(runId).toBeDefined();

      // 3. Get job status
      const jobResponse = await server.inject({
        method: 'GET',
        url: `${baseUrl}/jobs/${jobId}`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(jobResponse.statusCode).toBe(200);
      const jobBody = JSON.parse(jobResponse.body);
      jobResponseSchema.parse(jobBody);
      expect(jobBody.data.jobId).toBe(jobId);

      // 4. Get audit summary (should work even during job execution)
      const summaryResponse = await server.inject({
        method: 'GET',
        url: `${baseUrl}/audit/summary`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(summaryResponse.statusCode).toBe(200);
      const summaryBody = JSON.parse(summaryResponse.body);
      getAuditSummaryResponseSchema.parse(summaryBody);
      expect(summaryBody.data.overall).toBeDefined();
    });
  });

  describe('Degraded mode: REST API down → Studio fallback', () => {
    it('should handle API unavailability gracefully', async () => {
      // Simulate API down by using invalid endpoint
      const invalidResponse = await server.inject({
        method: 'GET',
        url: `${baseUrl}/nonexistent`,
      });

      expect(invalidResponse.statusCode).toBeGreaterThanOrEqual(400);
      
      const invalidBody = JSON.parse(invalidResponse.body);
      expect(invalidBody).toHaveProperty('ok', false);
      expect(invalidBody).toHaveProperty('error');
    });
  });

  describe('Idempotency flow', () => {
    it('should return same jobId for same idempotency key', async () => {
      const idempotencyKey = `test-idempotency-${Date.now()}`;

      const response1 = await server.inject({
        method: 'POST',
        url: `${baseUrl}/audit/runs`,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'KB-Mock': 'true',
        },
        payload: {
          scope: 'packages/*',
        },
      });

      const response2 = await server.inject({
        method: 'POST',
        url: `${baseUrl}/audit/runs`,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'KB-Mock': 'true',
        },
        payload: {
          scope: 'packages/*',
        },
      });

      expect(response1.statusCode).toBe(202);
      expect(response2.statusCode).toBe(202);

      const body1 = JSON.parse(response1.body);
      const body2 = JSON.parse(response2.body);

      // Debug: log response if data is missing
      if (!body1.data || !body2.data) {
        console.error('Response 1:', JSON.stringify(body1, null, 2));
        console.error('Response 2:', JSON.stringify(body2, null, 2));
      }

      expect(body1.data).toBeDefined();
      expect(body2.data).toBeDefined();
      
      // Should return same jobId
      expect(body1.data.jobId).toBeDefined();
      expect(body2.data.jobId).toBeDefined();
      expect(body1.data.jobId).toBe(body2.data.jobId);
      expect(body1.data.runId).toBe(body2.data.runId);
    });
  });

  describe('SSE events flow', () => {
    it('should stream job events via SSE', async () => {
      // Create a job first
      const createResponse = await server.inject({
        method: 'POST',
        url: `${baseUrl}/audit/runs`,
        headers: {
          'Content-Type': 'application/json',
          'KB-Mock': 'true',
        },
        payload: {
          scope: 'packages/*',
        },
      });

      expect(createResponse.statusCode).toBe(202);
      
      const createBody = JSON.parse(createResponse.body);
      
      // Debug: log response if data is missing
      if (!createBody.data) {
        console.error('Create response:', JSON.stringify(createBody, null, 2));
      }
      
      expect(createBody.data).toBeDefined();
      expect(createBody.data.jobId).toBeDefined();
      
      const { jobId } = createBody.data;

      // Subscribe to events
      const eventsResponse = await server.inject({
        method: 'GET',
        url: `${baseUrl}/jobs/${jobId}/events`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(eventsResponse.statusCode).toBe(200);
      expect(eventsResponse.headers['content-type']).toContain('text/event-stream');
      
      // Parse SSE events
      const body = eventsResponse.body;
      const lines = body.split('\n').filter(Boolean);
      const dataLines = lines.filter((line: string) => line.startsWith('data:'));
      
      expect(dataLines.length).toBeGreaterThan(0);
      
      // Parse first event
      if (dataLines.length > 0) {
        const firstEvent = JSON.parse(dataLines[0].replace('data: ', ''));
        expect(firstEvent).toHaveProperty('type');
        expect(firstEvent).toHaveProperty('jobId');
        expect(firstEvent).toHaveProperty('timestamp');
      }
    });
  });
});

