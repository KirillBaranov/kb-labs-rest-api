/**
 * @module @kb-labs/rest-api-app/plugins/cli-discovery
 * CLI-based plugin discovery for REST API (using @kb-labs/cli-api)
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { CliAPI } from '@kb-labs/cli-api';
import { getLogger } from '@kb-labs/core-sys/logging';
import * as path from 'node:path';

/**
 * Plugin manifest with path information from CLI
 */
export interface PluginManifestWithPath {
  /** Manifest data */
  manifest: ManifestV2;
  /** Absolute path to manifest file */
  manifestPath: string;
  /** Root directory of the plugin */
  pluginRoot: string;
}

// Singleton CLI API instance (set from bootstrap)
let cliApiInstance: CliAPI | null = null;

/**
 * Set CLI API instance (called from bootstrap)
 */
export function setCliApi(api: CliAPI): void {
  cliApiInstance = api;
}

/**
 * Discover plugins using CLI API (new implementation - no subprocess)
 */
export async function discoverPluginsViaCli(
  repoRoot: string
): Promise<{
  v2Manifests: ManifestV2[];
  manifestsWithPaths: PluginManifestWithPath[];
  warnings: string[];
}> {
  try {
    if (!cliApiInstance) {
      throw new Error('CliAPI not initialized. Call from bootstrap first.');
    }
    
    const logger = getLogger('rest:cli-discovery');
    logger.debug('CLI API discovery started', { repoRoot });
    
    const api = cliApiInstance;
    
    // Get plugins
    const plugins = await api.listPlugins();
    logger.debug('CLI API discovery: found plugins', { count: plugins.length });
    if (plugins.length > 0) {
      logger.debug('CLI API discovery plugin IDs', { 
        plugins: plugins.map(p => `${p.id}@${p.version} (${p.kind})`) 
      });
    }
    
    // Get manifests
    const v2Manifests: ManifestV2[] = [];
    const manifestsWithPaths: PluginManifestWithPath[] = [];
    
    for (const plugin of plugins) {
      logger.debug('CLI API discovery: getting manifest for plugin', { pluginId: plugin.id });
      const manifest = await api.getManifestV2(plugin.id);
      if (manifest) {
        logger.debug('CLI API discovery: found manifest', { pluginId: plugin.id, manifestId: manifest.id });
        v2Manifests.push(manifest);
        // plugin.source.path is the path to the manifest file
        // pluginRoot should be the directory containing the manifest
        const manifestPath = plugin.source.path;
        const pluginRoot = path.dirname(manifestPath);
        
        manifestsWithPaths.push({
          manifest,
          manifestPath,
          pluginRoot,
        });
      } else {
        logger.debug('CLI API discovery: manifest not found for plugin', { pluginId: plugin.id });
      }
    }
    
    logger.debug('CLI API discovery success', { manifestCount: v2Manifests.length });
    if (v2Manifests.length > 0) {
      logger.debug('CLI API discovery plugins', { 
        plugins: v2Manifests.map(m => `${m.id}@${m.version}`) 
      });
    }
    
    return {
      v2Manifests,
      manifestsWithPaths,
      warnings: [],
    };
  } catch (error) {
    // CLI API failed - return empty result with warning
    const logger = getLogger('rest:cli-discovery');
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('CLI API discovery error', { 
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined 
    });
    
    const warnings = [
      `CLI API discovery failed: ${errorMessage}. Falling back to local discovery.`,
    ];

    return {
      v2Manifests: [],
      manifestsWithPaths: [],
      warnings,
    };
  }
}

/**
 * Refresh plugin discovery
 */
export async function refreshPluginDiscovery(): Promise<void> {
  if (cliApiInstance) {
    await cliApiInstance.refresh();
  }
}

/**
 * Dispose CLI API (cleanup on shutdown)
 */
export async function disposeCliApi(): Promise<void> {
  if (cliApiInstance) {
    await cliApiInstance.dispose();
    cliApiInstance = null;
  }
}
