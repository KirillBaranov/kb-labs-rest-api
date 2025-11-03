/**
 * @module @kb-labs/rest-api-app/__tests__/contracts/audit
 * Contract tests for audit endpoints
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createServer } from '../../server.js';
import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { findRepoRoot } from '@kb-labs/core-sys';
import {
  createAuditRunRequestSchema,
  createAuditRunResponseSchema,
  getAuditRunResponseSchema,
  listAuditRunsResponseSchema,
  getAuditReportResponseSchema,
  getAuditSummaryResponseSchema,
  successEnvelopeSchema,
  errorEnvelopeSchema,
} from '@kb-labs/api-contracts';

describe('Audit endpoints contract tests', () => {
  let server: any;
  let baseUrl: string;

  beforeAll(async () => {
    const repoRoot = await findRepoRoot(process.cwd());
    const { config } = await loadRestApiConfig(repoRoot);
    server = await createServer(config, repoRoot);
    baseUrl = `http://localhost:${config.port}${config.basePath}`;
  });

  describe('POST /audit/runs', () => {
    it('should return valid CreateAuditRunResponse envelope', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `${baseUrl}/audit/runs`,
        headers: {
          'Content-Type': 'application/json',
          'KB-Mock': 'true', // Use mock mode for testing
        },
        payload: {
          scope: 'packages/*',
          strict: true,
        },
      });

      expect(response.statusCode).toBe(202);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      const envelopeSchema = successEnvelopeSchema(createAuditRunResponseSchema.shape.data);
      envelopeSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('runId');
      expect(body.data).toHaveProperty('jobId');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
      expect(body.meta).toHaveProperty('requestId');
    });

    it('should support Idempotency-Key header', async () => {
      const idempotencyKey = 'test-key-123';
      
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
      
      // Should return same jobId for same idempotency key
      expect(body1.data.jobId).toBe(body2.data.jobId);
    });
  });

  describe('GET /audit/summary', () => {
    it('should return valid GetAuditSummaryResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/audit/summary`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      getAuditSummaryResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('overall');
      expect(body.data).toHaveProperty('counts');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });
  });

  describe('GET /audit/runs', () => {
    it('should return valid ListAuditRunsResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/audit/runs`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      listAuditRunsResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('runs');
      expect(Array.isArray(body.data.runs)).toBe(true);
      expect(body.data).toHaveProperty('hasMore');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });

    it('should support cursor pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/audit/runs?limit=10&cursor=test-cursor`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      listAuditRunsResponseSchema.parse(body);
      
      expect(body.data).toHaveProperty('cursor');
      expect(body.data).toHaveProperty('hasMore');
    });
  });

  describe('GET /audit/report/latest', () => {
    it('should return valid GetAuditReportResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/audit/report/latest`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      getAuditReportResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('report');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });

    it('should support ETag caching', async () => {
      const response1 = await server.inject({
        method: 'GET',
        url: `${baseUrl}/audit/report/latest`,
        headers: {
          'KB-Mock': 'true',
        },
      });

      expect(response1.statusCode).toBe(200);
      const etag = response1.headers.etag;
      
      expect(etag).toBeDefined();

      const response2 = await server.inject({
        method: 'GET',
        url: `${baseUrl}/audit/report/latest`,
        headers: {
          'If-None-Match': etag,
          'KB-Mock': 'true',
        },
      });

      // Should return 304 Not Modified
      expect(response2.statusCode).toBe(304);
    });
  });

  describe('Error responses', () => {
    it('should return valid ErrorEnvelope for validation errors', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `${baseUrl}/audit/runs`,
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          scope: 123, // Invalid type
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      
      const body = JSON.parse(response.body);
      
      // Validate error envelope structure
      errorEnvelopeSchema.parse(body);
      
      expect(body).toHaveProperty('ok', false);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });
  });
});

