/**
 * @module @kb-labs/rest-api-app/bootstrap
 * Server bootstrap and startup
 */

import { loadRestApiConfig } from '@kb-labs/rest-api-core';
import { createServer } from './server.js';
import { findRepoRoot } from '@kb-labs/core-sys';

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

  // Detect repo root
  const repoRoot = await findRepoRoot(cwd);

  // Create server
  const server = await createServer(config, repoRoot);

  // Start server
  const address = await server.listen({
    port: config.port,
    host: '0.0.0.0',
  });

  console.log(`REST API server listening on ${address}`);

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    
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

