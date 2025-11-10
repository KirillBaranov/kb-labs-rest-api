/**
 * @module @kb-labs/rest-api-app/bootstrap
 * Server bootstrap and startup
 */

import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { createServer } from './server.js';
import { findRepoRoot } from '@kb-labs/core-sys';
import { createCliAPI } from '@kb-labs/cli-api';
import { setCliApi, disposeCliApi } from './plugins/cli-discovery.js';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { initRestLogging, createRestLogger } from './logging.js';
import type { LogLevel } from '@kb-labs/core-sys';
import { randomUUID } from 'node:crypto';

/**
 * Find monorepo root (prefer pnpm-workspace.yaml or .git over package.json)
 * Looks for the topmost directory with both .git and pnpm-workspace.yaml
 */
async function findMonorepoRoot(startDir: string): Promise<string> {
  let dir = path.resolve(startDir);
  let foundRoot: string | null = null;
  
  // Walk up the directory tree to find the topmost directory with both .git and pnpm-workspace.yaml
  // This ensures we find the main monorepo root, not a sub-workspace
  while (true) {
    try {
      const hasGit = await fs.access(path.join(dir, '.git')).then(() => true).catch(() => false);
      const hasWorkspace = await fs.access(path.join(dir, 'pnpm-workspace.yaml')).then(() => true).catch(() => false);
      
      if (hasGit && hasWorkspace) {
        // Found a root with both markers, save it and continue up to find the topmost one
        foundRoot = dir;
      }
    } catch {
      // Continue
    }
    
    const parent = path.dirname(dir);
    if (parent === dir) {
      // Reached filesystem root, stop here
      break;
    }
    dir = parent;
  }
  
  // If we found a root with both .git and pnpm-workspace.yaml, use it (it's the topmost one)
  if (foundRoot) {
    return foundRoot;
  }
  
  // Fallback: try to find the topmost directory with pnpm-workspace.yaml (walking up)
  dir = path.resolve(startDir);
  let topmostWorkspace: string | null = null;
  while (true) {
    try {
      await fs.access(path.join(dir, 'pnpm-workspace.yaml'));
      topmostWorkspace = dir;
    } catch {
      // Continue
    }
    
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  
  if (topmostWorkspace) {
    return topmostWorkspace;
  }
  
  // Final fallback to standard findRepoRoot
  return findRepoRoot(startDir);
}

/**
 * Bootstrap REST API server
 */
export async function bootstrap(cwd: string = process.cwd()): Promise<void> {
  const logLevel = resolveLogLevel(process.env.REST_LOG_LEVEL);
  initRestLogging(logLevel);
  const bootstrapLogger = createRestLogger('bootstrap', {
    traceId: randomUUID(),
    reqId: 'rest-bootstrap',
  });

  // Load configuration
  const { config, diagnostics } = await loadRestApiConfig(cwd);
  
  if (diagnostics.length > 0) {
    bootstrapLogger.warn('Configuration diagnostics', { diagnosticsCount: diagnostics.length });
    for (const diagnostic of diagnostics) {
      bootstrapLogger.warn('Configuration diagnostic', {
        level: diagnostic.level,
        message: diagnostic.message,
      });
    }
  }

  // Detect repo root (prefer monorepo root)
  const repoRoot = await findMonorepoRoot(cwd);
  bootstrapLogger.debug('Resolved repo root', { cwd, repoRoot });

  // Initialize CLI API singleton
  bootstrapLogger.info('Initializing CLI API');
  const redisConfig = config.redis;
  const cliApi = await createCliAPI({
    discovery: {
      strategies: ['workspace', 'pkg', 'dir', 'file'],
      roots: [repoRoot],
      allowDowngrade: false,
    },
    cache: {
      inMemory: true,
      ttlMs: 30_000,
    },
    logger: {
      level: logLevel,
    },
    snapshot: {
      mode: 'consumer',
    },
    pubsub: redisConfig
      ? {
          redisUrl: redisConfig.url,
          namespace: redisConfig.namespace,
        }
      : undefined,
  });
  
  // Set singleton for cli-discovery
  setCliApi(cliApi);
  
  // Subscribe to changes
  cliApi.onChange((diff: { added: unknown[]; removed: unknown[]; changed: unknown[] }) => {
    bootstrapLogger.info('CLI registry changed', {
      added: diff.added.length,
      removed: diff.removed.length,
      changed: diff.changed.length,
    });
  });

  // Create server with cliApi
  const server = await createServer(config, repoRoot, cliApi);

  // Start server
  const address = await server.listen({
    port: config.port,
    host: '0.0.0.0',
  });

  bootstrapLogger.info('REST API server listening', { address });

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    bootstrapLogger.warn('Received shutdown signal', { signal });
    
    // Dispose CLI API
    await disposeCliApi();
    
    // Close server
    await server.close();
    bootstrapLogger.info('Server closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

function resolveLogLevel(level: unknown): LogLevel {
  if (!level) {
    return 'info';
  }
  const normalized = String(level).toLowerCase();
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized;
  }
  return 'info';
}

