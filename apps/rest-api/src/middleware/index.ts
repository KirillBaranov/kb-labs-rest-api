/**
 * @module @kb-labs/rest-api-app/middleware
 * Middleware registration
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { registerEnvelopeMiddleware } from './envelope.js';
import { registerRequestIdMiddleware } from './request-id.js';
import { registerMockModeMiddleware } from './mock-mode.js';
import { registerSecurityHeadersMiddleware } from './security-headers.js';
import { registerCacheMiddleware } from './cache.js';
import { registerMetricsMiddleware } from './metrics.js';
import { registerErrorGuard } from './error-guard.js';
import { registerStartupGuard } from './startup-guard.js';
import { registerRequestTimeoutGuard } from './request-timeout.js';
import { registerHeaderPolicyMiddleware } from './header-policy.js';

/**
 * Register all middleware
 */
export function registerMiddleware(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  registerStartupGuard(server, config);
  registerSecurityHeadersMiddleware(server);
  registerRequestIdMiddleware(server);
  registerMockModeMiddleware(server, config);
  registerHeaderPolicyMiddleware(server);
  registerCacheMiddleware(server);
  registerRequestTimeoutGuard(server, config);
  registerMetricsMiddleware(server);
  registerEnvelopeMiddleware(server, config);
  
  // Global error guard for plugin routes (must be last)
  registerErrorGuard(server);
}

