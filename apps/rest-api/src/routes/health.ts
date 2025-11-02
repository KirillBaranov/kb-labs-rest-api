/**
 * @module @kb-labs/rest-api-app/routes/health
 * Health and info routes
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import {
  capabilitiesResponseSchema,
  configResponseSchema,
  infoResponseSchema,
} from '@kb-labs/rest-api-core';
import { readdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { execa } from 'execa';

const startTime = Date.now();

/**
 * Register health routes
 */
export function registerHealthRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): void {
  const basePath = config.basePath;

  // GET /health/live
  server.get(`${basePath}/health/live`, {
    schema: {
      response: {
        200: {
          type: 'object',
        },
      },
    },
  }, async (request, reply) => {
    const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
    
    // Return only data - envelope middleware will wrap it
    return {
      status: 'ok',
      version: config.apiVersion,
      node: process.version,
      uptimeSec,
    };
  });

  // GET /health/ready
  server.get(`${basePath}/health/ready`, {
    schema: {
      response: {
        200: { type: 'object' },
        503: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    const checks: Record<string, boolean> = {};
    let allReady = true;

    // Check queue availability (in-memory queue is always available)
    try {
      // For memory queue, just check if it's initialized
      checks.queue = true;
    } catch {
      checks.queue = false;
      allReady = false;
    }

    // Check storage availability (file system)
    try {
      const testPath = join(repoRoot, '.kb', 'rest', '.health-check');
      await writeFile(testPath, 'health-check');
      await unlink(testPath);
      checks.storage = true;
    } catch {
      checks.storage = false;
      allReady = false;
    }

    // Check CLI availability
    try {
      await execa(config.cli.bin || 'kb', ['--version'], {
        timeout: 2000,
        cwd: repoRoot,
      });
      checks.cli = true;
    } catch {
      checks.cli = false;
      allReady = false;
    }

    const status = allReady ? 'ok' : 'not ready';
    const statusCode = allReady ? 200 : 503;

    reply.code(statusCode);
    return {
      status,
      version: config.apiVersion,
      node: process.version,
      uptimeSec: Math.floor((Date.now() - startTime) / 1000),
      checks,
    };
  });

  // GET /info
  server.get(`${basePath}/info`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    // Get profiles list from repo
    let profiles: string[] = [];
    try {
      const profilesDir = join(repoRoot, '.kb', 'profiles');
      const entries = await readdir(profilesDir, { withFileTypes: true });
      profiles = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      // Profiles directory doesn't exist or not readable
      profiles = [];
    }

    // Return only data - envelope middleware will wrap it
    return {
      cwd: process.cwd(),
      repo: repoRoot,
      profiles,
      plugins: config.plugins,
      apiVersion: config.apiVersion,
    };
  });

  // GET /info/capabilities
  server.get(`${basePath}/info/capabilities`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    // Return only data - envelope middleware will wrap it
    return {
      commands: [
        'audit',
        'release',
        'devlink',
        'mind',
        'analytics',
      ],
      adapters: {
        queue: [config.queue.driver || 'memory'],
        storage: [config.storage.driver || 'fs'],
        auth: [config.auth.mode || 'none'],
      },
    };
  });

  // GET /info/config
  server.get(`${basePath}/info/config`, {
    schema: {
      response: {
        200: { type: 'object' },
      },
    },
  }, async (request, reply) => {
    // Return redacted config (no sensitive data)
    // Return only data - envelope middleware will wrap it
    return {
      port: config.port,
      basePath: config.basePath,
      auth: {
        mode: config.auth.mode,
      },
      queue: {
        driver: config.queue.driver,
      },
      storage: {
        driver: config.storage.driver,
      },
      mockMode: config.mockMode || false,
      // Other fields masked for security
    };
  });
}

