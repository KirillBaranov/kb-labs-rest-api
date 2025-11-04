/**
 * @module @kb-labs/rest-api-app/plugins/compat
 * Compatibility layer for v1 and v2 manifests
 */

import type { ManifestV1, ManifestV2 } from '@kb-labs/plugin-manifest';
import { discoverPlugins, checkDualManifests } from './discovery.js';
import { migrateV1ToV2 } from '@kb-labs/plugin-manifest';
import { discoverPluginsViaCli } from './cli-discovery.js';

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
  console.log(`[DEBUG] Starting plugin discovery from: ${startDir}`);
  
  // Try CLI discovery first (workspace-aware)
  try {
    const cliResult = await discoverPluginsViaCli(startDir);
    
    // If CLI discovery succeeded (found plugins or completed without errors), use it
    if (cliResult.manifestsWithPaths.length > 0 || cliResult.warnings.length === 0) {
      console.log(`[DEBUG] CLI discovery found ${cliResult.v2Manifests.length} manifests`);
      if (cliResult.warnings.length > 0) {
        console.log(`[DEBUG] CLI discovery warnings: ${cliResult.warnings.join(', ')}`);
      }
      
      return cliResult;
    }
    
    // CLI returned empty with warnings - fall back to local
    console.log(`[DEBUG] CLI discovery returned empty with warnings, trying local discovery`);
  } catch (error) {
    // CLI discovery failed, fall back to local
    console.log(`[DEBUG] CLI discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`[DEBUG] Falling back to local discovery`);
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
      console.log(`[DEBUG] Plugin ready for mounting: ${manifest.id}@${manifest.version} (v2) from ${plugin.manifestPath}`);
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
      console.log(`[DEBUG] Plugin migrated and ready: ${v2Manifest.id}@${v2Manifest.version} (v1->v2) from ${plugin.manifestPath}`);
    }
  }

  console.log(`[DEBUG] Local discovery result: ${v2Manifests.length} v2 manifests, ${manifestsWithPaths.length} manifests with paths`);
  if (v2Manifests.length > 0) {
    console.log(`[DEBUG] Plugin IDs: ${v2Manifests.map(m => `${m.id}@${m.version}`).join(', ')}`);
  }

  return { v2Manifests, manifestsWithPaths, warnings };
}

