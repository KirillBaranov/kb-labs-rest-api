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
import { getV2Manifests, type PluginManifestWithPath } from '../plugins/compat.js';
import * as path from 'node:path';
import type { ReadinessState } from './readiness.js';
import { resolveWorkspaceRoot } from '@kb-labs/core-workspace';
import { metricsCollector } from '../middleware/metrics.js';
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

    for (const entry of manifests) {
      const { manifest, pluginRoot } = entry;

      if (!manifest.rest?.routes || manifest.rest.routes.length === 0) {
        continue;
      }

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
        server.log.error({
          plugin: `${manifest.id}@${manifest.version}`,
          pluginRoot,
          remediation: 'Verify REST handler file and export exist',
          errors: restValidationErrors,
        }, 'REST validation failed, skipping routes');
        stats.errors += 1;
        if (readiness) {
          readiness.pluginRouteFailures.push({
            id: manifest.id,
            error: summarizeValidationErrors(restValidationErrors),
          });
        }
        continue;
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
        mountMetrics.recordSuccess(manifest.id, manifest.rest?.routes?.length ?? 0, duration);
        server.log.info({
          plugin: `${manifest.id}@${manifest.version}`,
          durationMs: Number(duration.toFixed(2)),
        }, 'Successfully mounted plugin routes');
        stats.mountedRoutes += manifest.rest?.routes?.length ?? 0;
      } catch (error) {
        mountMetrics.recordFailure(manifest.id, shortErrorMessage(error));
        server.log.error({
          plugin: manifest.id,
          err: error instanceof Error ? error : new Error(String(error)),
        }, 'Failed to mount plugin routes');
        stats.errors += 1;
        if (readiness) {
          readiness.pluginRouteFailures.push({
            id: manifest.id,
            error: `rest_mount_failed ${shortErrorMessage(error)}`,
          });
        }
      }
    }
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
