/**
 * @module @kb-labs/rest-api-app/routes/plugins
 * Plugin routes registration
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { CliAPI, RegistrySnapshot } from '@kb-labs/cli-api';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { mountRoutes } from '@kb-labs/plugin-adapter-rest';
import { execute as runtimeExecute } from '@kb-labs/plugin-runtime';
import { toRegistry, combineRegistries } from '@kb-labs/plugin-adapter-studio';
import type { StudioRegistry } from '@kb-labs/rest-api-contracts';
import { getV2Manifests, type PluginManifestWithPath } from '../plugins/compat';
import * as path from 'node:path';
import type { ReadinessState } from './readiness';
import { resolveWorkspaceRoot } from '@kb-labs/core-workspace';
import { metricsCollector } from '../middleware/metrics';
import { performance } from 'node:perf_hooks';

interface SnapshotManifestEntry {
  pluginId: string;
  manifest: ManifestV2;
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
    server.log.info({
      repoRoot,
      workspaceRoot,
      source: workspaceResolution.source,
    }, 'Resolved workspace root');

    const snapshot = cliApi.snapshot();
    const manifests = extractSnapshotManifests(snapshot);

    if (snapshot.partial || snapshot.stale) {
      server.log.warn({
        partial: snapshot.partial,
        stale: snapshot.stale,
        rev: snapshot.rev,
      }, 'Registry snapshot is partial or stale');
    }

    // Prepare mount tasks for parallel execution
    const mountTasks = manifests
      .filter(entry => entry.manifest.rest?.routes && entry.manifest.rest.routes.length > 0)
      .map(async (entry) => {
        const { manifest, pluginRoot } = entry;

        // Validate routes first (synchronous checks)
        const restValidationErrors: string[] = [];
        if (manifest.rest?.routes) {
          const manifestDir = pluginRoot;
          const fs = await import('fs/promises');
          for (const route of manifest.rest.routes) {
            const handlerRef = route.handler;
            const [handlerFile, exportName] = handlerRef.split('#');

            if (!exportName || !handlerFile) {
              restValidationErrors.push(
                `Route ${route.method} ${route.path}: Invalid handler reference "${handlerRef}" (must include export name)`
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
          server.log.warn({
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
          
          const validRoutes = manifest.rest.routes.filter((route) => {
            const routeKey = `${route.method} ${route.path}`;
            return !errorPaths.has(routeKey);
          });
          
          if (validRoutes.length === 0) {
            server.log.error({
              plugin: `${manifest.id}@${manifest.version}`,
              pluginRoot,
              errors: restValidationErrors,
            }, 'All routes failed validation, skipping plugin');
            return { 
              success: false, 
              pluginId: manifest.id,
              error: true,
              routesCount: 0,
              failureError: summarizeValidationErrors(restValidationErrors),
            };
          }
          
          // Replace routes with only valid ones
          manifest.rest.routes = validRoutes;
          server.log.info({
            plugin: `${manifest.id}@${manifest.version}`,
            totalRoutes: manifest.rest.routes.length + restValidationErrors.length,
            validRoutes: validRoutes.length,
            skippedRoutes: restValidationErrors.length,
          }, 'Filtered routes, mounting valid ones');
        }

        try {
          const start = performance.now();
          const pluginBasePath = manifest.rest?.basePath
            ? manifest.rest.basePath.replace(/^\/v1/, config.basePath)
            : `${config.basePath}/plugins/${manifest.id}`;

          server.log.info({
            plugin: `${manifest.id}@${manifest.version}`,
            configBasePath: config.basePath,
            manifestBasePath: manifest.rest?.basePath,
            pluginBasePath,
            pluginRoot,
            routes: manifest.rest?.routes?.length ?? 0,
          }, 'Mounting plugin routes');

          await mountRoutes(
            server as any,
            manifest,
            {
              execute: runtimeExecute as any,
            },
            {
              grantedCapabilities: (() => {
                if (!config.plugins) {
                  return [];
                }
                if (Array.isArray(config.plugins)) {
                  return config.plugins as string[];
                }
                if (typeof config.plugins === 'object' && 'grantedCapabilities' in config.plugins) {
                  const gc = (config.plugins as { grantedCapabilities?: unknown }).grantedCapabilities;
                  return Array.isArray(gc) ? (gc as string[]) : [];
                }
                return [];
              })(),
              basePath: pluginBasePath,
              pluginRoot,
              workdir: workspaceRoot,
              fallbackTimeoutMs: gatewayTimeoutMs,
              rateLimit: config.rateLimit,
              onRouteMounted: info => {
                metricsCollector.registerRouteBudget(
                  info.method,
                  info.path,
                  info.timeoutMs,
                  manifest.id
                );
              },
            }
          );
          const duration = performance.now() - start;
          const routesCount = manifest.rest?.routes?.length ?? 0;
          mountMetrics.recordSuccess(manifest.id, routesCount, duration);
          server.log.info({
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
          server.log.error({
            plugin: manifest.id,
            err: error instanceof Error ? error : new Error(String(error)),
          }, 'Failed to mount plugin routes');
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
    server.log.info({
      total: mountTasks.length,
      succeeded: succeeded.length,
      failed: failed.length,
      mountedRoutes,
      errors,
    }, 'Parallel plugin route mounting completed');
  } catch (error) {
    server.log.error({
      err: error instanceof Error ? error : new Error(String(error)),
    }, 'Plugin discovery failed');
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
    metricsCollector.completePluginMount(server.log);
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

  metricsCollector.completePluginMount(server.log);
}

/**
 * Get all plugin manifests (for OpenAPI generation)
 */
export async function getAllPluginManifests(
  repoRoot: string
): Promise<ManifestV2[]> {
  const { v2Manifests } = await getV2Manifests(repoRoot);
  return v2Manifests;
}

export async function getAllPluginManifestsWithPaths(
  repoRoot: string
): Promise<PluginManifestWithPath[]> {
  const { manifestsWithPaths } = await getV2Manifests(repoRoot);
  return manifestsWithPaths;
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
      const manifests = snapshot.manifests.map(entry => ({
        pluginId: entry.pluginId,
        manifest: entry.manifest,
        pluginRoot: entry.pluginRoot,
        source: entry.source,
      }));
      reply.type('application/json');
      return {
        manifests,
      };
    } catch (error) {
      server.log.error({
        err: error instanceof Error ? error : new Error(String(error)),
      }, 'Failed to get plugin registry');
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

      // Convert manifests with studio section to StudioRegistry
      const registries = manifests
        .filter(entry => entry.manifest.studio)
        .map(entry => toRegistry(entry.manifest));

      // Combine all registries into one
      const combined = registries.length > 0
        ? combineRegistries(...registries)
        : { plugins: [], widgets: [], menus: [], layouts: [] };

      const studioRegistry: StudioRegistry = {
        schema: 'kb.studio-registry/1',
        registryVersion: String(snapshot.rev),
        generatedAt: new Date().toISOString(),
        plugins: combined.plugins,
        widgets: combined.widgets,
        menus: combined.menus,
        layouts: combined.layouts,
      };

      reply.type('application/json');
      return studioRegistry;
    } catch (error) {
      server.log.error({
        err: error instanceof Error ? error : new Error(String(error)),
      }, 'Failed to generate studio registry');
      reply.code(500).send({
        error: 'Failed to generate studio registry',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
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

