/**
 * @module @kb-labs/rest-api-app/bootstrap
 * Server bootstrap and startup
 */

import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { createServer } from './server';
import { findRepoRoot } from '@kb-labs/core-sys';
import { createCliAPI } from '@kb-labs/cli-api';
import { setCliApi, disposeCliApi } from './plugins/cli-discovery';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { initLogging, getLogger } from '@kb-labs/core-sys/logging';
import type { LogLevel } from '@kb-labs/core-sys';
import { randomUUID } from 'node:crypto';

/**
 * Find monorepo root (prefer pnpm-workspace.yaml with kb-* patterns)
 * Looks for the topmost directory with pnpm-workspace.yaml that includes kb-* patterns
 */
async function findMonorepoRoot(startDir: string): Promise<string> {
  let dir = path.resolve(startDir);
  let monorepoRoot: string | null = null;
  
  // First, try to find workspace with kb-* patterns (the actual monorepo root)
  while (true) {
    try {
      const workspacePath = path.join(dir, 'pnpm-workspace.yaml');
      await fs.access(workspacePath);
      const content = await fs.readFile(workspacePath, 'utf-8');
      if (content.includes('kb-*')) {
        // Found the monorepo root with kb-* patterns
        monorepoRoot = dir;
        break;
      }
    } catch {
      // Continue
    }
    
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  
  if (monorepoRoot) {
    return monorepoRoot;
  }
  
  // Fallback: try to find the topmost directory with both .git and pnpm-workspace.yaml
  dir = path.resolve(startDir);
  let foundRoot: string | null = null;
  while (true) {
    try {
      const hasGit = await fs.access(path.join(dir, '.git')).then(() => true).catch(() => false);
      const hasWorkspace = await fs.access(path.join(dir, 'pnpm-workspace.yaml')).then(() => true).catch(() => false);
      
      if (hasGit && hasWorkspace) {
        foundRoot = dir;
      }
    } catch {
      // Continue
    }
    
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  
  if (foundRoot) {
    return foundRoot;
  }
  
  // Final fallback: try to find any pnpm-workspace.yaml
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
  
  // Initialize logging with unified system
  initLogging({
    level: logLevel,
    mode: 'json', // REST API uses JSON output
  });
  
  const bootstrapLogger = getLogger('rest:bootstrap').child({
    meta: {
      layer: 'rest',
      traceId: randomUUID(),
      reqId: 'rest-bootstrap',
    },
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

  // Detect repo root (prefer monorepo root with kb-* patterns)
  const repoRoot = await findMonorepoRoot(cwd);
  bootstrapLogger.info('Resolved repo root', { cwd, repoRoot });

  // Initialize CLI API singleton
  bootstrapLogger.info('Initializing CLI API');
  const redisConfig = config.redis;
  
  // Collect all kb-labs-* directories as roots for discovery
  // CLI API will scan these roots using workspace strategy
  const discoveryRoots = [repoRoot];
  try {
    const entries = await fs.readdir(repoRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('kb-labs-')) {
        const repoPath = path.join(repoRoot, entry.name);
        discoveryRoots.push(repoPath);
      }
    }
    bootstrapLogger.info('Discovery roots configured', { 
      roots: discoveryRoots,
      rootsCount: discoveryRoots.length,
    });
  } catch (error) {
    bootstrapLogger.warn('Failed to collect discovery roots', { 
      error: error instanceof Error ? error.message : String(error),
    });
  }
  
  const cliApi = await createCliAPI({
    discovery: {
      strategies: ['workspace', 'pkg', 'dir', 'file'],
      roots: discoveryRoots,
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
      mode: 'producer', // REST API should produce snapshots, not consume them
      refreshIntervalMs: 60_000,
    },
    pubsub: redisConfig
      ? {
          redisUrl: redisConfig.url,
          namespace: redisConfig.namespace,
        }
      : undefined,
  });
  
  // Initialize CLI API (discovers plugins)
  bootstrapLogger.info('Initializing CLI API discovery');
  await cliApi.initialize();
  
  // Log discovered plugins
  const plugins = await cliApi.listPlugins();
  bootstrapLogger.info('CLI API discovery complete', {
    pluginsFound: plugins.length,
    pluginIds: plugins.map(p => `${p.id}@${p.version}`),
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
  // Note: registerRoutes() now waits for initial plugin route mounting to complete
  // before returning, so routes are already mounted when createServer() returns
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

