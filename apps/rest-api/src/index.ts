/**
 * @module @kb-labs/rest-api-app
 * REST API application entry point
 */

import { bootstrap } from './bootstrap.js';

// Start server
bootstrap(process.cwd()).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

