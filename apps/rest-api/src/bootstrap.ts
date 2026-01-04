/**
 * @module @kb-labs/rest-api-app/bootstrap
 * Server bootstrap and startup
 */

import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { createServer } from './server';
import { findRepoRoot } from '@kb-labs/core-sys';
import { createCliAPI, type CliAPI } from '@kb-labs/cli-api';
import { initializePlatform } from './platform';
import { platform } from '@kb-labs/core-runtime';
import * as path from 'node:path';
import { promises as fs, readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Singleton CLI API instance for cleanup
let cliApiInstance: CliAPI | null = null;

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
 * Load environment variables from .env file
 * Does not overwrite existing variables
 */
function loadEnvFile(cwd: string): void {
  const envPath = path.join(cwd, '.env');

  if (!existsSync(envPath)) {
    return;
  }

  try {
    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=VALUE
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();

      // Remove quotes if present
      const unquotedValue = value
        .replace(/^["'](.*)["']$/, '$1')
        .replace(/^`(.*)`$/, '$1');

      // Set only if variable is not already set
      if (key && !(key in process.env)) {
        process.env[key] = unquotedValue;
      }
    }
  } catch (error) {
    // Silently ignore .env loading errors
    // Not critical for server operation
  }
}

/**
 * Bootstrap REST API server
 */
export async function bootstrap(cwd: string = process.cwd()): Promise<void> {
  // Load .env file if present (does not overwrite existing variables)
  loadEnvFile(cwd);

  // Load configuration first (before platform init, to avoid circular dependency)
  const { config, diagnostics } = await loadRestApiConfig(cwd);

  // Detect repo root (prefer monorepo root with kb-* patterns)
  const repoRoot = await findMonorepoRoot(cwd);

  // Initialize platform adapters from kb.config.json
  // This will initialize logger based on kb.config.json configuration
  await initializePlatform(repoRoot);

  // Now we can use platform.logger (configured from kb.config.json)
  const bootstrapLogger = platform.logger.child({
    layer: 'rest',
    service: 'bootstrap',
    traceId: randomUUID(),
  });

  if (diagnostics.length > 0) {
    bootstrapLogger.warn('Configuration diagnostics', { diagnosticsCount: diagnostics.length });
    for (const diagnostic of diagnostics) {
      bootstrapLogger.warn('Configuration diagnostic', {
        level: diagnostic.level,
        message: diagnostic.message,
      });
    }
  }

  bootstrapLogger.info('Resolved repo root', { cwd, repoRoot });
  bootstrapLogger.info('Platform adapters initialized');

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
  
  // Registry snapshot TTL based on environment
  // Development: 10 minutes (frequent changes, but not too aggressive)
  // Production: 1 hour (stable deployments, less churn)
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const snapshotTTL = isDevelopment
    ? 10 * 60 * 1000  // 10 minutes for development
    : 60 * 60 * 1000; // 1 hour for production

  const cliApi = await createCliAPI({
    discovery: {
      strategies: ['workspace', 'pkg', 'dir', 'file'],
      roots: discoveryRoots,
      allowDowngrade: false,
    },
    cache: {
      inMemory: true,
      ttlMs: snapshotTTL,
    },
    logger: {
      level: 'info', // CLI API internal logging level
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
  
  // Store singleton for cleanup
  cliApiInstance = cliApi;
  
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
    if (cliApiInstance) {
      await cliApiInstance.dispose();
      cliApiInstance = null;
    }

    // Shutdown platform (includes ExecutionBackend and all adapters)
    await platform.shutdown();
    bootstrapLogger.info('Platform shutdown complete');

    // Close server
    await server.close();
    bootstrapLogger.info('Server closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
