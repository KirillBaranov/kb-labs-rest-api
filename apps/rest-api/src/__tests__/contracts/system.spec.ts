/**
 * @module @kb-labs/rest-api-app/__tests__/contracts/system
 * Contract tests for system endpoints
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createServer } from '../../server.js';
import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { findRepoRoot } from '@kb-labs/core-sys';
import {
  healthResponseSchema,
  readyResponseSchema,
  infoResponseSchema,
  capabilitiesResponseSchema,
  configResponseSchema,
  successEnvelopeSchema,
} from '@kb-labs/api-contracts';

describe('System endpoints contract tests', () => {
  let server: any;
  let baseUrl: string;

  beforeAll(async () => {
    const repoRoot = await findRepoRoot(process.cwd());
    const { config } = await loadRestApiConfig(repoRoot);
    server = await createServer(config, repoRoot);
    baseUrl = `http://localhost:${config.port}${config.basePath}`;
  });

  describe('GET /health/live', () => {
    it('should return valid HealthResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/health/live`,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      healthResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('status', 'ok');
      expect(body.data).toHaveProperty('version');
      expect(body.data).toHaveProperty('node');
      expect(body.data).toHaveProperty('uptimeSec');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
      expect(body.meta).toHaveProperty('requestId');
    });
  });

  describe('GET /health/ready', () => {
    it('should return valid ReadyResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/health/ready`,
      });

      expect([200, 503]).toContain(response.statusCode);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      readyResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('status');
      expect(body.data).toHaveProperty('checks');
      expect(typeof body.data.checks).toBe('object');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });
  });

  describe('GET /info', () => {
    it('should return valid InfoResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/info`,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      infoResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('cwd');
      expect(body.data).toHaveProperty('profiles');
      expect(Array.isArray(body.data.profiles)).toBe(true);
      expect(body.data).toHaveProperty('apiVersion');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });
  });

  describe('GET /info/capabilities', () => {
    it('should return valid CapabilitiesResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/info/capabilities`,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      capabilitiesResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('commands');
      expect(Array.isArray(body.data.commands)).toBe(true);
      expect(body.data).toHaveProperty('adapters');
      expect(body.data.adapters).toHaveProperty('queue');
      expect(body.data.adapters).toHaveProperty('storage');
      expect(body.data.adapters).toHaveProperty('auth');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });
  });

  describe('GET /info/config', () => {
    it('should return valid ConfigResponse envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${baseUrl}/info/config`,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Validate envelope structure
      configResponseSchema.parse(body);
      
      expect(body).toHaveProperty('ok', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('port');
      expect(body.data).toHaveProperty('basePath');
      expect(body.data).toHaveProperty('auth');
      expect(body.data).toHaveProperty('queue');
      expect(body.data).toHaveProperty('storage');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('apiVersion');
    });
  });
});

