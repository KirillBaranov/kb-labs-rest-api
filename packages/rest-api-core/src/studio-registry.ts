/**
 * @module @kb-labs/rest-api-core/studio-registry
 *
 * Transforms ManifestV3 studio sections into StudioRegistry format.
 * REST API uses this to provide pre-computed registry data to Studio frontend.
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import type {
  StudioRegistry,
  StudioPluginEntry,
  StudioWidgetDecl,
  StudioMenuDecl,
  StudioLayoutDecl,
} from '@kb-labs/rest-api-contracts';

/**
 * Convert a single ManifestV3 to StudioRegistry entries.
 */
export function manifestToRegistry(manifest: ManifestV3): {
  plugin: StudioPluginEntry;
  widgets: StudioWidgetDecl[];
  menus: StudioMenuDecl[];
  layouts: StudioLayoutDecl[];
} {
  const studio = manifest.studio;
  if (!studio) {
    return {
      plugin: {
        pluginId: manifest.id,
        displayName: manifest.display?.name,
        widgets: [],
        menus: [],
        layouts: [],
      },
      widgets: [],
      menus: [],
      layouts: [],
    };
  }

  // Widgets, menus, layouts are already in correct format from manifest.studio
  const widgets = studio.widgets ?? [];
  const menus = studio.menus ?? [];
  const layouts = studio.layouts ?? [];

  const plugin: StudioPluginEntry = {
    pluginId: manifest.id,
    displayName: manifest.display?.name,
    widgets,
    menus,
    layouts,
  };

  return { plugin, widgets, menus, layouts };
}

/**
 * Combine multiple manifests into a single StudioRegistry.
 */
export function combineManifestsToRegistry(
  manifests: ManifestV3[],
  _registryVersion?: string
): StudioRegistry {
  const plugins: StudioPluginEntry[] = [];

  for (const manifest of manifests) {
    if (!manifest.studio) continue;

    const { plugin } = manifestToRegistry(manifest);
    plugins.push(plugin);
  }

  return {
    schema: 'kb.studio/1',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    plugins,
  };
}
