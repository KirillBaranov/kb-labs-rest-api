/**
 * @module @kb-labs/rest-api-app/__tests__/contracts/jobs
 * Contract tests for jobs endpoints
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createServer } from '../../server.js';
import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { findRepoRoot } from '@kb-labs/core-sys';
import {
  jobResponseSchema,
  jobLogsResponseSchema,
  listJobsResponseSchema,
  successEnvelopeSchema,
  errorEnvelopeSchema,
} from '@kb-labs/api-contracts';

describe('Jobs endpoints contract tests', () => {
  let server: any;
  let baseUrl: string;
  let testJobId: string;

  beforeAll(async () => {
    const repoRoot = await findRepoRoot(process.cwd());
    const { config } = await loadRestApiConfig(repoRoot);
    server = await createServer(config, repoRoot);
    baseUrl = `http://localhost:${config.port}${config.basePath}`;

      // Create a test job for testing
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

    const createBody = JSON.parse(createResponse.body);
    testJobId = createBody.data.jobId;
  });

  describe('GET /jobs/:jobId', () => {
    it('should return valid JobResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/jobs/${testJobId}`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      jobResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('jobId');
      expect(body.data).toHaveProperty('status');
      expect(body.data).toHaveProperty('kind');
      expect(body.data).toHaveProperty('createdAt');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });

    it('should return 404 for non-existent job', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/jobs/non-existent-job-id`,
      });

      expect(response.statusCode).toBe(404);
      
      const body = JSON.parse(response.body);
      
      // Validate error envelope structure
      errorEnvelopeSchema.parse(body);
      
      expect(body).toHaveProperty('ok', false);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
    });
  });

  describe('GET /jobs/:jobId/logs', () => {
    it('should return valid JobLogsResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/jobs/${testJobId}/logs`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      jobLogsResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('jobId');
      expect(body.data).toHaveProperty('logs');
      expect(Array.isArray(body.data.logs)).toBe(true);
      expect(body.data).toHaveProperty('hasMore');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });

    it('should support offset pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/jobs/${testJobId}/logs?offset=10`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      jobLogsResponseSchema.parse(body);
      
      expect(body.data).toHaveProperty('offset', 10);
    });
  });

  describe('GET /jobs/:jobId/events', () => {
    it('should return SSE stream with valid event format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/jobs/${testJobId}/events`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      
      // SSE response should start with 'data:' prefix
      const body = response.body;
      expect(body).toBeDefined();
      
      // Parse first event
      const lines = body.split('\n').filter(Boolean);
      const dataLines = lines.filter((line: string) => line.startsWith('data:'));
      
      if (dataLines.length > 0) {
        const firstEvent = JSON.parse(dataLines[0].replace('data: ', ''));
        expect(firstEvent).toHaveProperty('type');
        expect(firstEvent).toHaveProperty('jobId');
        expect(firstEvent).toHaveProperty('timestamp');
      }
    });
  });

  describe('GET /jobs', () => {
    it('should return valid ListJobsResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/jobs`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      listJobsResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('jobs');
      expect(Array.isArray(body.data.jobs)).toBe(true);
      expect(body.data).toHaveProperty('hasMore');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });

    it('should support cursor pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/jobs?limit=10&cursor=test-cursor`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      listJobsResponseSchema.parse(body);
      
      expect(body.data).toHaveProperty('cursor');
      expect(body.data).toHaveProperty('hasMore');
    });

    it('should support filtering by status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/jobs?status=completed`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      listJobsResponseSchema.parse(body);
      
      // All jobs should have status 'completed'
      body.data.jobs.forEach((job: any) => {
        expect(job.status).toBe('completed');
      });
    });
  });
});

