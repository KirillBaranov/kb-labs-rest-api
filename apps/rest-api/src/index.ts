/**
 * @module @kb-labs/rest-api-app
 * REST API application entry point
 */

import { bootstrap } from './bootstrap.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..', '..');

// Start server
bootstrap(repoRoot).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

