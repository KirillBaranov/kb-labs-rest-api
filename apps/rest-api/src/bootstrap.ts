/**
 * @module @kb-labs/rest-api-app/bootstrap
 * Server bootstrap and startup
 */

import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { createServer } from './server.js';
import { findRepoRoot } from '@kb-labs/core-sys';
import { createCliAPI, type CliAPI } from '@kb-labs/cli-api';
import { setCliApi, disposeCliApi } from './plugins/cli-discovery.js';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';

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
  // Load configuration
  const { config, diagnostics } = await loadRestApiConfig(cwd);
  
  if (diagnostics.length > 0) {
    console.warn('Configuration warnings:');
    for (const diagnostic of diagnostics) {
      console.warn(`  ${diagnostic.level}: ${diagnostic.message}`);
    }
  }

  // Detect repo root (prefer monorepo root)
  const repoRoot = await findMonorepoRoot(cwd);
  console.log(`[DEBUG] Bootstrap: cwd=${cwd}, repoRoot=${repoRoot}`);

  // Initialize CLI API singleton
  console.log('[Bootstrap] Initializing CLI API...');
  const cliApi = await createCliAPI({
    discovery: {
      strategies: ['workspace', 'pkg', 'dir', 'file'],
      roots: [repoRoot],
      preferV2: true,
      allowDowngrade: false,
    },
    cache: {
      inMemory: true,
      ttlMs: 30_000,
    },
    logger: {
      level: 'info',
    },
  });
  
  // Set singleton for cli-discovery
  setCliApi(cliApi);
  
  // Subscribe to changes
  cliApi.onChange((diff: { added: unknown[]; removed: unknown[]; changed: unknown[] }) => {
    console.log('[CliAPI] Registry changed:', {
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

  console.log(`REST API server listening on ${address}`);

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    
    // Dispose CLI API
    await disposeCliApi();
    
    // Stop cleanup task
    if ((server as any).stopCleanup) {
      (server as any).stopCleanup();
    }
    
    // Close server
    await server.close();
    console.log('Server closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

