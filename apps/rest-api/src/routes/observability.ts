/**
 * @module @kb-labs/rest-api-app/routes/observability
 * Observability endpoints for monitoring system internals
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { normalizeBasePath, resolvePaths } from '../utils/path-helpers';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Register observability routes
 *
 * These are system-level observability endpoints that expose internal metrics
 * and health information about platform components (State Broker, DevKit, etc.)
 */
export async function registerObservabilityRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);
  const stateBrokerPaths = resolvePaths(basePath, '/observability/state-broker');
  const devkitPaths = resolvePaths(basePath, '/observability/devkit');

  // GET /api/v1/observability/state-broker
  // Returns statistics from State Broker daemon (cache hits, namespaces, etc.)
  for (const path of stateBrokerPaths) {
    fastify.get(path, async (_request, reply) => {
      try {
        const stateBrokerUrl = process.env.KB_STATE_DAEMON_URL || 'http://localhost:7777';

        fastify.log.debug({ url: stateBrokerUrl }, 'Fetching State Broker stats');

        const response = await fetch(`${stateBrokerUrl}/stats`, {
          signal: AbortSignal.timeout(5000), // 5s timeout
        });

        if (!response.ok) {
          fastify.log.warn({
            status: response.status,
            url: stateBrokerUrl,
          }, 'State Broker responded with error');

          return reply.code(503).send({
            ok: false,
            error: {
              code: 'STATE_BROKER_UNAVAILABLE',
              message: 'State Broker daemon is not available',
              details: {
                url: stateBrokerUrl,
                status: response.status,
              },
            },
          });
        }

        const stats = await response.json();

        fastify.log.debug({
          totalEntries: stats.totalEntries,
          hitRate: stats.hitRate,
        }, 'State Broker stats retrieved successfully');

        return {
          ok: true,
          data: stats,
          meta: {
            source: 'state-broker',
            daemonUrl: stateBrokerUrl,
          },
        };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to fetch State Broker stats');

        // Check if it's a timeout error
        const isTimeout = error instanceof Error && error.name === 'AbortError';

        return reply.code(503).send({
          ok: false,
          error: {
            code: isTimeout ? 'STATE_BROKER_TIMEOUT' : 'STATE_BROKER_ERROR',
            message: isTimeout
              ? 'State Broker daemon did not respond in time'
              : error instanceof Error ? error.message : 'Unknown error',
            details: {
              isTimeout,
            },
          },
        });
      }
    });
  }

  // GET /api/v1/observability/devkit
  // Returns DevKit health check results (monorepo health score, issues, etc.)
  for (const path of devkitPaths) {
    fastify.get(path, async (_request, reply) => {
      try {
        fastify.log.debug({ cwd: repoRoot }, 'Executing DevKit health check');

        const { stdout, stderr } = await execAsync('npx kb-devkit-health --json', {
          cwd: repoRoot,
          timeout: 30000, // 30s timeout (DevKit can be slow)
          env: {
            ...process.env,
            // Ensure DevKit runs in non-interactive mode
            CI: 'true',
          },
        });

        if (stderr) {
          fastify.log.warn({ stderr }, 'DevKit health check produced warnings');
        }

        const health = JSON.parse(stdout);

        fastify.log.debug({
          healthScore: health.healthScore,
          grade: health.grade,
        }, 'DevKit health check completed');

        return {
          ok: true,
          data: health,
          meta: {
            source: 'devkit-cli',
            repoRoot,
            command: 'npx kb-devkit-health --json',
          },
        };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to execute DevKit health check');

        // Try to parse stdout if available (DevKit might fail but still output JSON)
        let partialData = null;
        if (error && typeof error === 'object' && 'stdout' in error) {
          try {
            partialData = JSON.parse((error as { stdout: string }).stdout);
          } catch {
            // Ignore JSON parse errors
          }
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DEVKIT_ERROR',
            message: error instanceof Error ? error.message : 'Failed to execute DevKit health check',
            details: {
              partialData,
            },
          },
        });
      }
    });
  }

  fastify.log.info('Observability routes registered');
}
