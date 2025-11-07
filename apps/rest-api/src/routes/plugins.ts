/**
 * @module @kb-labs/rest-api-app/routes/plugins
 * Plugin routes registration
 */

import type { FastifyInstance } from 'fastify/types/instance';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { mountRoutes } from '@kb-labs/plugin-adapter-rest';
import { execute as runtimeExecute, validateManifestOnStartup } from '@kb-labs/plugin-runtime';
import { getV2Manifests, type PluginManifestWithPath } from '../plugins/compat.js';
import * as path from 'node:path';

/**
 * Register plugin routes
 */
export async function registerPluginRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): Promise<void> {
  try {
    // Discover and get v2 manifests with paths
    const { manifestsWithPaths, warnings } = await getV2Manifests(repoRoot);

    // Log warnings
    for (const warning of warnings) {
      server.log.warn(warning);
    }

    // Mount routes for each plugin
    for (const manifestWithPath of manifestsWithPaths) {
      const { manifest, manifestPath, pluginRoot } = manifestWithPath;
      
      if (!manifest.rest?.routes || manifest.rest.routes.length === 0) {
        continue;
      }

      // Validate REST handlers only (CLI handlers are not required for REST API)
      // Check if REST handlers exist
      const restValidationErrors: string[] = [];
      if (manifest.rest?.routes) {
        const manifestDir = path.dirname(manifestPath);
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

      // If REST handlers are missing, skip this plugin
      if (restValidationErrors.length > 0) {
        server.log.error(
          `Plugin ${manifest.id}@${manifest.version} REST validation failed:`
        );
        for (const error of restValidationErrors) {
          server.log.error(`    - ${error}`);
        }
        // Continue with other plugins but skip this one
        continue;
      }

      // Log warnings about CLI handlers if they exist but are not found (non-blocking)
      try {
        const validation = await validateManifestOnStartup(manifest, manifestPath);
        if (validation.warnings.length > 0) {
          server.log.warn(
            `Plugin ${manifest.id}@${manifest.version} validation warnings:`
          );
          for (const warning of validation.warnings) {
            server.log.warn(`    - ${warning}`);
          }
        }
        // Log CLI validation errors as warnings (non-blocking for REST API)
        if (!validation.valid && validation.errors.length > 0) {
          const cliErrors = validation.errors.filter(e => e.includes('CLI command'));
          if (cliErrors.length > 0) {
            server.log.warn(
              `Plugin ${manifest.id}@${manifest.version} CLI handlers not found (non-blocking for REST API):`
            );
            for (const error of cliErrors) {
              server.log.warn(`    - ${error}`);
            }
          }
        }
      } catch (error) {
        // If validation throws, log but continue (non-blocking)
        const errorMessage = error instanceof Error ? error.message : String(error);
        server.log.warn(`Plugin ${manifest.id}@${manifest.version} validation error (non-blocking): ${errorMessage}`);
      }

      try {
        // Combine config.basePath (/api/v1) with manifest.rest.basePath (/v1/plugins/...)
        // Result: /api/v1/plugins/...
        const pluginBasePath = manifest.rest?.basePath
          ? manifest.rest.basePath.replace(/^\/v1/, config.basePath)
          : `${config.basePath}/plugins/${manifest.id}`;

        server.log.info(`Mounting routes for plugin ${manifest.id}@${manifest.version}`);
        server.log.info(`  config.basePath: ${config.basePath}`);
        server.log.info(`  manifest.rest.basePath: ${manifest.rest?.basePath}`);
        server.log.info(`  pluginBasePath: ${pluginBasePath}`);
        server.log.info(`  pluginRoot: ${pluginRoot}`);
        server.log.info(`  routes count: ${manifest.rest?.routes?.length || 0}`);

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
            pluginRoot, // Pass plugin root to mountRoutes
          }
        );

        server.log.info(`Successfully mounted routes for plugin ${manifest.id}@${manifest.version}`);
      } catch (error) {
        server.log.error(`Failed to mount routes for plugin ${manifest.id}: ${error instanceof Error ? error.message : String(error)}`);
        server.log.error(`  Error stack: ${error instanceof Error ? error.stack : String(error)}`);
        // Continue with other plugins - never crash API
      }
    }
  } catch (error) {
    // Never crash API - log and continue
    server.log.error(`Plugin discovery failed: ${error instanceof Error ? error.message : String(error)}`);
  }
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
  repoRoot: string
): Promise<void> {
  const basePath = config.basePath;
  // GET /api/v1/plugins/registry - return all plugin manifests for Studio
  server.get(`${basePath}/plugins/registry`, async (request, reply) => {
    try {
      const { v2Manifests } = await getV2Manifests(repoRoot);
      // Return directly without envelope wrapper for Studio compatibility
      reply.type('application/json');
      return {
        manifests: v2Manifests,
      };
    } catch (error) {
      server.log.error(`Failed to get plugin registry: ${error instanceof Error ? error.message : String(error)}`);
      reply.code(500).send({
        error: 'Failed to load plugin registry',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
