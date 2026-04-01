/**
 * @module @kb-labs/rest-api-core/studio-registry
 *
 * Transforms ManifestV3 studio sections into StudioRegistryV2 format.
 * REST API uses this to provide pre-computed registry data to Studio frontend.
 *
 * remoteEntryUrl is computed from the plugin's resolvedPath in marketplace.lock:
 *   resolvedPath: ./node_modules/@kb-labs/commit
 *   → remoteEntryUrl: /plugins/@kb-labs/commit/widgets/remoteEntry.js
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import type { StudioRegistryV2, StudioPluginEntryV2 } from '@kb-labs/rest-api-contracts';

/**
 * Compute remoteEntry URL from the plugin's resolved install path.
 * Gateway serves static files from node_modules.
 */
function computeRemoteEntryUrl(pluginId: string, resolvedPath?: string): string {
  // Default: derive from plugin ID
  // e.g. @kb-labs/commit → /plugins/@kb-labs/commit/widgets/remoteEntry.js
  return `/plugins/${pluginId}/widgets/remoteEntry.js`;
}

/**
 * Convert a single ManifestV3 with studio V2 config to a registry entry.
 */
export function manifestToRegistryEntry(
  manifest: ManifestV3,
  resolvedPath?: string,
): StudioPluginEntryV2 | null {
  const studio = manifest.studio;
  if (!studio || studio.version !== 2) {
    return null;
  }

  return {
    pluginId: manifest.id,
    displayName: manifest.display?.name,
    pluginVersion: manifest.version,
    remoteName: studio.remoteName,
    remoteEntryUrl: computeRemoteEntryUrl(manifest.id, resolvedPath),
    pages: studio.pages ?? [],
    menus: studio.menus ?? [],
  };
}

/**
 * Combine multiple manifests into a StudioRegistryV2.
 */
export function combineManifestsToRegistry(
  manifests: Array<{ manifest: ManifestV3; resolvedPath?: string }>,
): StudioRegistryV2 {
  const plugins: StudioPluginEntryV2[] = [];

  for (const { manifest, resolvedPath } of manifests) {
    const entry = manifestToRegistryEntry(manifest, resolvedPath);
    if (entry) {
      plugins.push(entry);
    }
  }

  return {
    schema: 'kb.studio/2',
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    plugins,
  };
}
