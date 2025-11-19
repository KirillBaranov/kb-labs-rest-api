/**
 * @module @kb-labs/rest-api-app/plugins/compat
 * Compatibility layer for v1 and v2 manifests
 */

import type { ManifestV1, ManifestV2 } from '@kb-labs/plugin-manifest';
import { discoverPlugins, checkDualManifests } from './discovery.js';
import { migrateV1ToV2 } from '@kb-labs/plugin-manifest';
import { discoverPluginsViaCli } from './cli-discovery.js';
import { getLogger } from '@kb-labs/core-sys/logging';

/**
 * Plugin manifest with path information
 */
export interface PluginManifestWithPath {
  /** Manifest data */
  manifest: ManifestV2;
  /** Absolute path to manifest file */
  manifestPath: string;
  /** Root directory of the plugin */
  pluginRoot: string;
}

/**
 * Compatibility layer result
 */
export interface CompatResult {
  /** V2 manifests ready for mounting */
  v2Manifests: ManifestV2[];
  /** Manifests with path information for mounting */
  manifestsWithPaths: PluginManifestWithPath[];
  /** Warnings for deprecated v1 manifests */
  warnings: string[];
}

/**
 * Get all v2 manifests (migrated from v1 if needed)
 * Uses CLI discovery first, falls back to local discovery if CLI fails
 */
export async function getV2Manifests(
  startDir = process.cwd()
): Promise<CompatResult> {
  const logger = getLogger('rest:compat');
  logger.debug('Starting plugin discovery', { startDir });
  
  // Try CLI discovery first (workspace-aware)
  try {
    const cliResult = await discoverPluginsViaCli(startDir);
    
    // If CLI discovery succeeded (found plugins or completed without errors), use it
    if (cliResult.manifestsWithPaths.length > 0 || cliResult.warnings.length === 0) {
      logger.debug('CLI discovery found manifests', { count: cliResult.v2Manifests.length });
      if (cliResult.warnings.length > 0) {
        logger.debug('CLI discovery warnings', { warnings: cliResult.warnings });
      }
      
      return cliResult;
    }
    
    // CLI returned empty with warnings - fall back to local
    logger.debug('CLI discovery returned empty with warnings, trying local discovery');
  } catch (error) {
    // CLI discovery failed, fall back to local
    logger.debug('CLI discovery failed, falling back to local discovery', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
  
  // Fallback to local discovery
  return getV2ManifestsLocal(startDir);
}

/**
 * Local discovery (original implementation)
 * Used as fallback when CLI discovery is not available
 */
async function getV2ManifestsLocal(
  startDir = process.cwd()
): Promise<CompatResult> {
  const discovered = await discoverPlugins(startDir);
  const checked = checkDualManifests(discovered);

  const v2Manifests: ManifestV2[] = [];
  const manifestsWithPaths: PluginManifestWithPath[] = [];
  const warnings: string[] = [];

  for (const plugin of checked.values()) {
    if (plugin.warning) {
      warnings.push(plugin.warning);
    }

    if (plugin.version === 'v2') {
      const manifest = plugin.manifest as ManifestV2;
      v2Manifests.push(manifest);
      manifestsWithPaths.push({
        manifest,
        manifestPath: plugin.manifestPath,
        pluginRoot: plugin.pluginRoot,
      });
      logger.debug('Plugin ready for mounting', { 
        manifestId: manifest.id, 
        version: manifest.version, 
        manifestPath: plugin.manifestPath 
      });
    } else if (plugin.version === 'v1') {
      // Migrate v1 to v2
      const v2Manifest = migrateV1ToV2(plugin.manifest as ManifestV1);
      v2Manifests.push(v2Manifest);
      manifestsWithPaths.push({
        manifest: v2Manifest,
        manifestPath: plugin.manifestPath,
        pluginRoot: plugin.pluginRoot,
      });
      warnings.push(`Migrated v1 manifest from ${plugin.packageName} to v2`);
      logger.debug('Plugin migrated and ready', { 
        manifestId: v2Manifest.id, 
        version: v2Manifest.version, 
        manifestPath: plugin.manifestPath 
      });
    }
  }

  logger.debug('Local discovery result', { 
    v2ManifestCount: v2Manifests.length, 
    manifestWithPathCount: manifestsWithPaths.length 
  });
  if (v2Manifests.length > 0) {
    logger.debug('Plugin IDs', { 
      pluginIds: v2Manifests.map(m => `${m.id}@${m.version}`) 
    });
  }

  return { v2Manifests, manifestsWithPaths, warnings };
}

