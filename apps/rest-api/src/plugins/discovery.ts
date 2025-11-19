/**
 * @module @kb-labs/rest-api-app/plugins/discovery
 * Plugin discovery for REST API
 */

import type { ManifestV1, ManifestV2 } from '@kb-labs/plugin-manifest';
import {
  detectManifestVersion,
  checkDualManifest,
  migrateV1ToV2,
} from '@kb-labs/plugin-manifest';
import { getDeprecationWarning } from '@kb-labs/plugin-manifest';
import { getLogger } from '@kb-labs/core-sys/logging';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

/**
 * Discovered plugin
 */
export interface DiscoveredPlugin {
  /** Package name */
  packageName: string;
  /** Manifest version */
  version: 'v1' | 'v2';
  /** Manifest data */
  manifest: ManifestV1 | ManifestV2;
  /** Warning message if any */
  warning?: string;
  /** Absolute path to manifest file */
  manifestPath: string;
  /** Root directory of the plugin (directory containing manifest or package root) */
  pluginRoot: string;
}

/**
 * Discover plugins from package.json and .kblabs/plugins/
 * Discovery order: package.json.kbLabs.manifest → .kblabs/plugins/ → auto-discovery
 */
export async function discoverPlugins(
  startDir = process.cwd()
): Promise<DiscoveredPlugin[]> {
  const logger = getLogger('rest:discovery');
  logger.debug('discoverPlugins started', { startDir });
  const plugins: DiscoveredPlugin[] = [];

  // 1. Check package.json.kbLabs.manifest
  const pkgPath = await findNearestPackageJson(startDir);
  logger.debug('Nearest package.json', { pkgPath: pkgPath || 'not found' });
  if (pkgPath) {
    try {
      const raw = await fsp.readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as any;
      logger.debug('package.json.kbLabs', { kbLabs: pkg?.kbLabs || null });
      const manifestPath = pkg?.kbLabs?.manifest;
      if (manifestPath) {
        const plugin = await loadPlugin(manifestPath, path.dirname(pkgPath));
        if (plugin) {
          plugins.push(plugin);
          const manifestId = (plugin.manifest as any).id || plugin.packageName;
          logger.debug('Discovered plugin from package.json.kbLabs.manifest', { 
            manifestId, 
            version: plugin.version, 
            manifestPath: plugin.manifestPath 
          });
        }
      }

      // Also check kbLabs.plugins array
      const pluginsList = pkg?.kbLabs?.plugins;
      if (Array.isArray(pluginsList)) {
        for (const pluginPath of pluginsList) {
          const plugin = await loadPlugin(pluginPath, path.dirname(pkgPath));
          if (plugin) {
            plugins.push(plugin);
            const manifestId = (plugin.manifest as any).id || plugin.packageName;
            logger.debug('Discovered plugin from kbLabs.plugins array', { 
              manifestId, 
              version: plugin.version, 
              manifestPath: plugin.manifestPath 
            });
          }
        }
      }
    } catch {
      // Ignore package.json errors
    }
  }

  // 2. Check .kblabs/plugins/ directory
  const pluginsDir = path.join(startDir, '.kblabs', 'plugins');
  try {
    const entries = await fsp.readdir(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.ts')) {
        const pluginPath = path.join(pluginsDir, entry.name);
        const plugin = await loadPlugin(pluginPath, startDir);
        if (plugin) {
          plugins.push(plugin);
          const manifestId = (plugin.manifest as any).id || plugin.packageName;
          logger.debug('Discovered plugin from .kblabs/plugins/', { 
            manifestId, 
            version: plugin.version, 
            manifestPath: plugin.manifestPath 
          });
        }
      }
    }
  } catch {
    // .kblabs/plugins/ doesn't exist
    logger.debug('.kblabs/plugins/ directory not found', { pluginsDir });
  }

  logger.debug('Total plugins discovered', { count: plugins.length });
  return plugins;
}

/**
 * Load plugin from path
 */
async function loadPlugin(
  pluginPath: string,
  baseDir: string
): Promise<DiscoveredPlugin | null> {
  try {
    const resolvedPath = path.isAbsolute(pluginPath)
      ? pluginPath
      : path.join(baseDir, pluginPath);

    const module = await import(resolvedPath);
    const manifest: unknown = module.default || module.manifest || module;

    const version = detectManifestVersion(manifest);

    if (version === 'unknown') {
      return null;
    }

    const resolvedPathAbs = path.resolve(resolvedPath);
    const pluginRoot = path.dirname(resolvedPathAbs);

    if (version === 'v1') {
      return {
        packageName: path.basename(resolvedPathAbs, path.extname(resolvedPathAbs)),
        version: 'v1',
        manifest: manifest as ManifestV1,
        warning: getDeprecationWarning(path.basename(resolvedPathAbs)),
        manifestPath: resolvedPathAbs,
        pluginRoot,
      };
    }

    if (version === 'v2') {
      return {
        packageName: path.basename(resolvedPathAbs, path.extname(resolvedPathAbs)),
        version: 'v2',
        manifest: manifest as ManifestV2,
        manifestPath: resolvedPathAbs,
        pluginRoot,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Find nearest package.json
 */
async function findNearestPackageJson(dir: string): Promise<string | null> {
  let cur = path.resolve(dir);
  while (true) {
    const cand = path.join(cur, 'package.json');
    try {
      await fsp.access(cand);
      return cand;
    } catch {}
    const parent = path.dirname(cur);
    if (parent === cur) {
      return null;
    }
    cur = parent;
  }
}

/**
 * Check for dual manifests and prefer v2
 */
export function checkDualManifests(
  plugins: DiscoveredPlugin[]
): Map<string, DiscoveredPlugin> {
  const pluginMap = new Map<string, DiscoveredPlugin>();

  // Group by package name
  const groups = new Map<string, DiscoveredPlugin[]>();
  for (const plugin of plugins) {
    if (!groups.has(plugin.packageName)) {
      groups.set(plugin.packageName, []);
    }
    groups.get(plugin.packageName)!.push(plugin);
  }

  // Prefer v2, warn about v1
  for (const [packageName, pluginList] of groups.entries()) {
    const v1Plugin = pluginList.find((p) => p.version === 'v1');
    const v2Plugin = pluginList.find((p) => p.version === 'v2');

    if (v1Plugin && v2Plugin) {
      // Both v1 and v2 exist - prefer v2, warn about v1
      const check = checkDualManifest(
        v1Plugin.manifest as ManifestV1,
        v2Plugin.manifest as ManifestV2,
        packageName
      );
      if (check.warning) {
        console.warn(check.warning);
      }
      pluginMap.set(packageName, v2Plugin);
    } else if (v2Plugin) {
      pluginMap.set(packageName, v2Plugin);
    } else if (v1Plugin) {
      // Migrate v1 to v2
      const v2Manifest = migrateV1ToV2(v1Plugin.manifest as ManifestV1);
      pluginMap.set(packageName, {
        packageName,
        version: 'v2',
        manifest: v2Manifest,
        warning: v1Plugin.warning,
        manifestPath: v1Plugin.manifestPath,
        pluginRoot: v1Plugin.pluginRoot,
      });
    }
  }

  return pluginMap;
}
