/**
 * @module @kb-labs/rest-api-app/routes/plugins
 * Plugin routes registration
 *
 * Uses @kb-labs/plugin-execution for unified execution layer.
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI, RegistrySnapshot } from '@kb-labs/cli-api';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import { validateManifest } from '@kb-labs/plugin-contracts';
import { mountRoutes } from '@kb-labs/plugin-execution/http';
import { combineManifestsToRegistry } from '@kb-labs/rest-api-core';
import { platform } from '@kb-labs/core-runtime';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ReadinessState } from './readiness';
import { resolveWorkspaceRoot } from '@kb-labs/core-workspace';
import { metricsCollector } from '../middleware/metrics';
import { performance } from 'node:perf_hooks';

interface SnapshotManifestEntry {
  pluginId: string;
  manifest: ManifestV3;
  pluginRoot: string;
}

function extractSnapshotManifests(snapshot: RegistrySnapshot): SnapshotManifestEntry[] {
  return (snapshot.manifests || []).map(entry => ({
    pluginId: entry.pluginId,
    manifest: entry.manifest,
    pluginRoot: entry.pluginRoot,
  }));
}

/**
 * Register plugin routes
 */
export async function registerPluginRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string,
  cliApi: CliAPI,
  readiness?: ReadinessState
): Promise<void> {
  const gatewayTimeoutMs = config.timeouts?.requestTimeout ?? 30_000;
  // Stats will be computed from mount results to avoid race conditions in parallel execution
  const stats = {
    mountedRoutes: 0,
    errors: 0,
  };

  if (readiness) {
    readiness.pluginRoutesMounted = false;
    readiness.pluginMountInProgress = true;
    readiness.pluginRoutesCount = 0;
    readiness.pluginRouteErrors = 0;
    readiness.pluginRouteFailures = [];
    readiness.pluginRoutesLastDurationMs = null;
  }

  metricsCollector.resetPluginRouteBudgets();

  const mountMetrics = metricsCollector.beginPluginMount();
  const mountStart = performance.now();

  try {
    const workspaceResolution = await resolveWorkspaceRoot({
      startDir: repoRoot,
      env: {
        KB_LABS_WORKSPACE_ROOT: process.env.KB_LABS_WORKSPACE_ROOT,
        KB_LABS_REPO_ROOT: process.env.KB_LABS_REPO_ROOT,
      },
    });
    const workspaceRoot = workspaceResolution.rootDir;
    platform.logger.info('Resolved workspace root', {
      repoRoot,
      workspaceRoot,
      source: workspaceResolution.source,
    });

    const snapshot = cliApi.snapshot();
    const manifests = extractSnapshotManifests(snapshot);

    if (snapshot.partial || snapshot.stale) {
      platform.logger.warn({
        partial: snapshot.partial,
        stale: snapshot.stale,
        rev: snapshot.rev,
      }, 'Registry snapshot is partial or stale');
    }

    // Use platform's unified ExecutionBackend (initialized in bootstrap.ts)
    const backend = platform.executionBackend;

    // Prepare mount tasks for parallel execution
    const mountTasks = manifests
      .filter(entry => entry.manifest.rest?.routes && entry.manifest.rest.routes.length > 0)
      .map(async (entry) => {
        const { manifest, pluginRoot } = entry;

        // Validate routes first (synchronous checks)
        const restValidationErrors: string[] = [];
        if (manifest.rest?.routes) {
          const manifestDir = pluginRoot;
          for (const route of manifest.rest.routes) {
            const handlerRef = route.handler;
            const handlerFile = handlerRef.split('#')[0];

            if (!handlerFile) {
              restValidationErrors.push(
                `Route ${route.method} ${route.path}: Invalid handler reference "${handlerRef}"`
              );
              continue;
            }

            const handlerPath = path.resolve(manifestDir, handlerFile);
            try {
              await fs.access(handlerPath);
            } catch {
              restValidationErrors.push(
                `Route ${route.method} ${route.path}: Handler file not found: ${handlerPath}`
              );
            }
          }
        }

        if (restValidationErrors.length > 0) {
          platform.logger.warn({
            plugin: `${manifest.id}@${manifest.version}`,
            pluginRoot,
            remediation: 'Verify REST handler file and export exist',
            errors: restValidationErrors,
          }, 'REST validation errors found, will skip problematic routes but continue mounting others');
          // Filter out routes with validation errors
          const errorPaths = new Set(restValidationErrors.map((error) => {
            const match = error.match(/Route\s+(\w+)\s+([^\s:]+)/);
            return match ? `${match[1]} ${match[2]}` : null;
          }).filter(Boolean));

          const validRoutes = manifest.rest!.routes!.filter((route) => {
            const routeKey = `${route.method} ${route.path}`;
            return !errorPaths.has(routeKey);
          });

          if (validRoutes.length === 0) {
            platform.logger.error('All routes failed validation, skipping plugin', undefined, {
              plugin: `${manifest.id}@${manifest.version}`,
              pluginRoot,
              errors: restValidationErrors,
            });
            return {
              success: false,
              pluginId: manifest.id,
              error: true,
              routesCount: 0,
              failureError: summarizeValidationErrors(restValidationErrors),
            };
          }

          // Replace routes with only valid ones
          manifest.rest!.routes = validRoutes;
          platform.logger.info({
            plugin: `${manifest.id}@${manifest.version}`,
            totalRoutes: manifest.rest!.routes.length + restValidationErrors.length,
            validRoutes: validRoutes.length,
            skippedRoutes: restValidationErrors.length,
          }, 'Filtered routes, mounting valid ones');
        }

        try {
          const start = performance.now();
          const pluginBasePath = manifest.rest?.basePath
            ? manifest.rest.basePath.replace(/^\/v1/, config.basePath)
            : `${config.basePath}/plugins/${manifest.id}`;

          platform.logger.info({
            plugin: `${manifest.id}@${manifest.version}`,
            configBasePath: config.basePath,
            manifestBasePath: manifest.rest?.basePath,
            pluginBasePath,
            pluginRoot,
            routes: manifest.rest?.routes?.length ?? 0,
          }, 'Mounting plugin routes');

          // Use new plugin-execution API
          await mountRoutes(server, manifest, {
            backend,
            pluginRoot,
            workspaceRoot,
            basePath: pluginBasePath,
            defaultTimeoutMs: gatewayTimeoutMs,
          });

          const duration = performance.now() - start;
          const routesCount = manifest.rest?.routes?.length ?? 0;

          // Register route budgets for metrics
          for (const route of manifest.rest?.routes ?? []) {
            metricsCollector.registerRouteBudget(
              route.method,
              `${pluginBasePath}${route.path}`,
              route.timeoutMs ?? gatewayTimeoutMs,
              manifest.id
            );
          }

          mountMetrics.recordSuccess(manifest.id, routesCount, duration);
          platform.logger.info({
            plugin: `${manifest.id}@${manifest.version}`,
            durationMs: Number(duration.toFixed(2)),
          }, 'Successfully mounted plugin routes');
          return {
            success: true,
            pluginId: manifest.id,
            error: false,
            routesCount,
          };
        } catch (error) {
          mountMetrics.recordFailure(manifest.id, shortErrorMessage(error));
          platform.logger.error(
            'Failed to mount plugin routes',
            error instanceof Error ? error : new Error(String(error)),
            { plugin: manifest.id }
          );
          return {
            success: false,
            pluginId: manifest.id,
            error: true,
            routesCount: 0,
            failureError: `rest_mount_failed ${shortErrorMessage(error)}`,
          };
        }
      });

    // Execute all mount tasks in parallel
    // Use allSettled to ensure all plugins are processed even if some fail
    const results = await Promise.allSettled(mountTasks);

    // Aggregate stats from results (avoid race conditions)
    let mountedRoutes = 0;
    let errors = 0;
    const succeeded: string[] = [];
    const failed: string[] = [];
    const routeFailures: Array<{ id: string; error: string }> = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const value = result.value;
        if (value.success) {
          mountedRoutes += value.routesCount ?? 0;
          succeeded.push(value.pluginId);
        } else {
          errors += 1;
          failed.push(value.pluginId);
          if (value.failureError && readiness) {
            routeFailures.push({
              id: value.pluginId,
              error: value.failureError,
            });
          }
        }
      } else {
        errors += 1;
        failed.push('unknown');
        if (readiness) {
          routeFailures.push({
            id: 'unknown',
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    }

    // Update stats and readiness (safely, after all parallel operations complete)
    stats.mountedRoutes = mountedRoutes;
    stats.errors = errors;
    if (readiness) {
      readiness.pluginRouteFailures = routeFailures;
    }

    // Log summary
    platform.logger.info({
      total: mountTasks.length,
      succeeded: succeeded.length,
      failed: failed.length,
      mountedRoutes,
      errors,
    }, 'Parallel plugin route mounting completed');
  } catch (error) {
    platform.logger.error(
      'Plugin discovery failed',
      error instanceof Error ? error : new Error(String(error))
    );
    stats.errors += 1;
    if (readiness) {
      readiness.pluginRoutesCount = stats.mountedRoutes;
      readiness.pluginRouteErrors = stats.errors;
      readiness.pluginRoutesMounted = false;
      readiness.pluginMountInProgress = false;
      readiness.pluginRoutesLastDurationMs = null;
      readiness.pluginRouteFailures.push({
        id: 'discovery',
        error: `rest_discovery_failed ${shortErrorMessage(error)}`,
      });
    }
    metricsCollector.completePluginMount(platform.logger as any);
    return;
  }

  if (readiness) {
    readiness.pluginRoutesCount = stats.mountedRoutes;
    readiness.pluginRouteErrors = stats.errors;
    readiness.pluginRoutesMounted = stats.errors === 0;
    readiness.pluginMountInProgress = false;
    readiness.lastPluginMountTs = new Date().toISOString();
    readiness.pluginRoutesLastDurationMs = Number(
      (performance.now() - mountStart).toFixed(2)
    );
  }

  metricsCollector.completePluginMount(platform.logger as any);
}

/**
 * Register plugin registry endpoint for Studio
 */
export async function registerPluginRegistry(
  server: FastifyInstance,
  config: RestApiConfig,
  cliApi: CliAPI
): Promise<void> {
  const basePath = config.basePath;

  // Legacy endpoint: returns raw manifests
  server.get(`${basePath}/plugins/registry`, async (_request, reply) => {
    try {
      const snapshot = cliApi.snapshot();

      // Get build timestamps and validate manifests
      const manifestsWithTimestamps = await Promise.all(
        snapshot.manifests.map(async (entry) => {
          let buildTimestamp: string | undefined;
          try {
            const distPath = path.join(entry.pluginRoot, 'dist');
            const stats = await fs.stat(distPath);
            buildTimestamp = stats.mtime.toISOString();
          } catch {
            // dist/ doesn't exist or not accessible, skip
          }

          // Validate manifest structure
          const validation = validateManifest(entry.manifest);

          return {
            pluginId: entry.pluginId,
            manifest: entry.manifest,
            pluginRoot: entry.pluginRoot,
            source: entry.source,
            discoveredAt: snapshot.generatedAt,
            buildTimestamp,
            validation: {
              valid: validation.valid,
              errors: validation.errors,
            },
          };
        })
      );

      reply.type('application/json');
      return {
        manifests: manifestsWithTimestamps,
        apiBasePath: basePath,
      };
    } catch (error) {
      platform.logger.error(
        'Failed to get plugin registry',
        error instanceof Error ? error : new Error(String(error))
      );
      reply.code(500).send({
        error: 'Failed to load plugin registry',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // New endpoint: returns pre-computed StudioRegistry
  // Studio should use this endpoint instead of plugins/registry
  server.get(`${basePath}/studio/registry`, async (_request, reply) => {
    try {
      const snapshot = cliApi.snapshot();
      const manifests = extractSnapshotManifests(snapshot);

      // Convert manifests to StudioRegistry
      const studioManifests = manifests
        .filter(entry => entry.manifest.studio)
        .map(entry => entry.manifest);

      const studioRegistry = combineManifestsToRegistry(
        studioManifests,
        String(snapshot.rev)
      );

      reply.type('application/json');
      return studioRegistry;
    } catch (error) {
      platform.logger.error({
        err: error instanceof Error ? error : new Error(String(error)),
      }, 'Failed to generate studio registry');
      reply.code(500).send({
        error: 'Failed to generate studio registry',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Plugin registry health endpoint
  server.get(`${basePath}/plugins/health`, async (_request, reply) => {
    try {
      const snapshot = cliApi.snapshot();

      // Collect validation errors from all manifests
      const validationIssues: Array<{ pluginId: string; errors: string[] }> = [];
      for (const entry of snapshot.manifests) {
        const validation = validateManifest(entry.manifest);
        if (!validation.valid) {
          validationIssues.push({
            pluginId: entry.pluginId,
            errors: validation.errors,
          });
        }
      }

      // Get discovery errors (plugins that failed to load)
      const discoveryErrors = snapshot.errors || [];

      // Determine why registry is partial
      const partialReasons: string[] = [];
      if (snapshot.corrupted) {
        partialReasons.push('snapshot_corrupted');
      }
      if (discoveryErrors.length > 0) {
        partialReasons.push('discovery_errors');
      }
      // If partial but no clear reason, it's likely initialization
      if (snapshot.partial && partialReasons.length === 0) {
        partialReasons.push('initialization_incomplete');
      }

      reply.type('application/json');
      return {
        healthy: !snapshot.partial && !snapshot.stale && validationIssues.length === 0 && discoveryErrors.length === 0,
        snapshot: {
          partial: snapshot.partial,
          stale: snapshot.stale,
          corrupted: snapshot.corrupted,
          rev: snapshot.rev,
          generatedAt: snapshot.generatedAt,
          totalManifests: snapshot.manifests.length,
          partialReasons,
        },
        discovery: {
          totalErrors: discoveryErrors.length,
          errors: discoveryErrors.map((err) => ({
            pluginPath: err.pluginPath,
            pluginId: err.pluginId,
            error: err.error,
            code: err.code,
          })),
        },
        validation: {
          totalIssues: validationIssues.length,
          issues: validationIssues,
        },
        message:
          discoveryErrors.length > 0
            ? `Registry is partial - ${discoveryErrors.length} plugin(s) failed to load. Check discovery.errors for details.`
            : snapshot.partial && partialReasons.includes('initialization_incomplete')
              ? 'Registry is partial - initialization incomplete. Try refreshing or wait for discovery to complete.'
              : snapshot.partial
                ? `Registry is partial - reasons: ${partialReasons.join(', ')}`
                : snapshot.stale
                  ? 'Registry is stale - plugin discovery may be outdated.'
                  : validationIssues.length > 0
                    ? `${validationIssues.length} plugin(s) have validation errors.`
                    : 'All plugins are healthy.',
      };
    } catch (error) {
      platform.logger.error({
        err: error instanceof Error ? error : new Error(String(error)),
      }, 'Failed to get plugin health');
      reply.code(500).send({
        error: 'Failed to get plugin health',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // AI Assistant endpoint: ask questions about a plugin
  server.post(`${basePath}/plugins/:pluginId/ask`, async (request, reply) => {
    try {
      const { pluginId } = request.params as { pluginId: string };
      const { question } = request.body as { question: string };

      if (!question || typeof question !== 'string') {
        reply.code(400).send({
          error: 'Bad request',
          message: 'Question is required and must be a string',
        });
        return;
      }

      // Get plugin manifest
      const snapshot = cliApi.snapshot();
      const pluginEntry = snapshot.manifests.find((entry) => entry.pluginId === pluginId);

      if (!pluginEntry) {
        reply.code(404).send({
          error: 'Plugin not found',
          message: `Plugin ${pluginId} not found in registry`,
        });
        return;
      }

      // Build prompt for LLM
      const systemPrompt = `You are a helpful assistant that explains KB Labs plugins based on their manifest.
Provide clear, concise answers about the plugin's capabilities, API endpoints, permissions, and usage.
Be specific and reference the actual values from the manifest.`;

      const userPrompt = `Plugin Manifest:
${JSON.stringify(pluginEntry.manifest, null, 2)}

User Question: ${question}

Please answer the question based on the plugin manifest above.`;

      // Call LLM
      const response = await platform.llm.complete(userPrompt, {
        systemPrompt,
        temperature: 0.3,
        maxTokens: 1000,
      });

      reply.type('application/json');
      return {
        answer: response.content,
        usage: response.usage,
      };
    } catch (error) {
      platform.logger.error({
        err: error instanceof Error ? error : new Error(String(error)),
      }, 'Failed to get AI answer about plugin');
      reply.code(500).send({
        error: 'Failed to get AI answer',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

/**
 * Shutdown execution backend gracefully.
 * NOTE: ExecutionBackend is now owned by platform, shutdown via platform.shutdown()
 */
export async function shutdownExecutionBackend(): Promise<void> {
  // ExecutionBackend lifecycle is now managed by platform
  // Call platform.shutdown() instead to shutdown all services including executionBackend
  await platform.shutdown();
}

function summarizeValidationErrors(errors: string[]): string {
  if (errors.length === 0) {
    return 'rest_validation_failed';
  }
  const first = errors[0] || 'rest_validation_failed';
  const prefix = first.split(':')[0]?.trim() ?? 'rest_validation_failed';
  return `rest_validation_failed ${prefix}`.trim();
}

function shortErrorMessage(error: unknown): string {
  if (!error) {
    return 'unknown_error';
  }
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.trim().split('\n')[0] ?? message.trim();
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}
