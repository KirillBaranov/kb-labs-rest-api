/**
 * @module @kb-labs/rest-api-app/__tests__/e2e
 * E2E tests for REST API
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../server.js';
import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { findRepoRoot } from '@kb-labs/core-sys';

describe('REST API E2E', () => {
  let server: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    const cwd = process.cwd();
    const repoRoot = await findRepoRoot(cwd);
    const { config } = await loadRestApiConfig(cwd);
    // Enable mock mode for tests
    config.mockMode = true;
    
    server = await createServer(config, repoRoot);
    const address = await server.listen({ port: 0 }); // Use random port for tests
    baseUrl = `${config.basePath}`;
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /health/live returns ok', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `${baseUrl}/health/live`,
    });

    expect(response.statusCode).toBe(200);
    
    // Parse response body
    let body: any;
    try {
      body = JSON.parse(response.body || '{}');
    } catch {
      body = response.body;
    }
    
    // Response should have envelope format
    expect(body).toBeDefined();
    expect(body).toHaveProperty('ok');
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('status');
    expect(body.data.status).toBe('ok');
  });

  it('POST /audit/runs enqueues job and returns jobId', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `${baseUrl}/audit/runs`,
      payload: {
        scope: 'packages/*',
        strict: true,
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.body).toBeDefined();
    expect(typeof response.body).toBe('string');
    
    // Parse response body
    const body = JSON.parse(response.body);
    
    // Response should have envelope format
    expect(body).toBeDefined();
    expect(body).toHaveProperty('ok');
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('jobId');
    expect(body.data).toHaveProperty('runId');
    expect(typeof body.data.jobId).toBe('string');
    expect(body.data.jobId.length).toBeGreaterThan(0);
  });

  it('GET /audit/summary returns summary (mock mode)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `${baseUrl}/audit/summary`,
      headers: {
        'KB-Mock': 'true',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBeDefined();
    expect(typeof response.body).toBe('string');
    
    // Parse response body
    const body = JSON.parse(response.body);
    
    // Response should have envelope format
    expect(body).toBeDefined();
    expect(body).toHaveProperty('ok');
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('overall');
    expect(body.data).toHaveProperty('counts');
  });

  it('GET /jobs/:jobId returns job status', async () => {
    // First create a job
    const createResponse = await server.inject({
      method: 'POST',
      url: `${baseUrl}/audit/runs`,
      payload: {},
    });

    expect(createResponse.statusCode).toBe(202);
    expect(createResponse.body).toBeDefined();
    expect(typeof createResponse.body).toBe('string');
    
    // Parse create response
    const createBody = JSON.parse(createResponse.body);
    
    // Validate create response
    expect(createBody).toBeDefined();
    expect(createBody).toHaveProperty('ok');
    expect(createBody.ok).toBe(true);
    expect(createBody).toHaveProperty('data');
    expect(createBody.data).toHaveProperty('jobId');
    
    const jobId = createBody.data.jobId;
    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe('string');

    // Then get status
    const statusResponse = await server.inject({
      method: 'GET',
      url: `${baseUrl}/jobs/${jobId}`,
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.body).toBeDefined();
    expect(typeof statusResponse.body).toBe('string');
    
    // Parse status response
    const statusBody = JSON.parse(statusResponse.body);
    
    // Validate status response
    expect(statusBody).toBeDefined();
    expect(statusBody).toHaveProperty('ok');
    expect(statusBody.ok).toBe(true);
    expect(statusBody).toHaveProperty('data');
    expect(statusBody.data).toHaveProperty('jobId');
    expect(statusBody.data.jobId).toBe(jobId);
    expect(statusBody.data).toHaveProperty('status');
  });

  it('returns envelope format for all responses', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `${baseUrl}/health/live`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBeDefined();
    expect(typeof response.body).toBe('string');
    
    // Parse response body
    const body = JSON.parse(response.body);
    
    // Validate envelope format
    expect(body).toBeDefined();
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('meta');
    expect(body.meta).toBeDefined();
    expect(body.meta).toHaveProperty('requestId');
    expect(typeof body.meta.requestId).toBe('string');
    expect(body.meta).toHaveProperty('durationMs');
    expect(typeof body.meta.durationMs).toBe('number');
  });
});

