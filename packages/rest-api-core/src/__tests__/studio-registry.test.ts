import { describe, it, expect } from 'vitest';
import { manifestToRegistryEntry, combineManifestsToRegistry } from '../studio-registry';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';

function makeManifest(overrides: Partial<ManifestV3> = {}): ManifestV3 {
  return {
    schema: 'kb.plugin/3',
    id: '@kb-labs/test-plugin',
    version: '1.0.0',
    ...overrides,
  };
}

describe('manifestToRegistryEntry', () => {
  it('returns null for manifest without studio config', () => {
    const result = manifestToRegistryEntry(makeManifest());
    expect(result).toBeNull();
  });

  it('returns null for manifest with non-v2 studio config', () => {
    const result = manifestToRegistryEntry(
      makeManifest({ studio: { widgets: [], layouts: [] } as any }),
    );
    expect(result).toBeNull();
  });

  it('returns entry for valid V2 studio config', () => {
    const manifest = makeManifest({
      id: '@kb-labs/commit',
      version: '2.0.0',
      display: { name: 'Commit Plugin' },
      studio: {
        version: 2,
        remoteName: 'commitPlugin',
        pages: [
          { id: 'commit.overview', title: 'Commit', route: '/p/commit', entry: './CommitOverview' },
        ],
        menus: [
          { id: 'commit', label: 'Commit', icon: 'GitlabOutlined', target: 'commit.overview' },
        ],
      },
    });

    const entry = manifestToRegistryEntry(manifest);

    expect(entry).not.toBeNull();
    expect(entry!.pluginId).toBe('@kb-labs/commit');
    expect(entry!.remoteName).toBe('commitPlugin');
    expect(entry!.remoteEntryUrl).toBe('/plugins/@kb-labs/commit/widgets/remoteEntry.js');
    expect(entry!.pages).toHaveLength(1);
    expect(entry!.menus).toHaveLength(1);
  });
});

describe('combineManifestsToRegistry', () => {
  it('returns empty registry for no manifests', () => {
    const registry = combineManifestsToRegistry([]);
    expect(registry.schema).toBe('kb.studio/2');
    expect(registry.schemaVersion).toBe(2);
    expect(registry.plugins).toHaveLength(0);
  });

  it('skips manifests without V2 studio config', () => {
    const registry = combineManifestsToRegistry([
      { manifest: makeManifest() },
      { manifest: makeManifest({ id: '@kb-labs/no-studio' }) },
    ]);
    expect(registry.plugins).toHaveLength(0);
  });

  it('generates remoteEntryUrl matching gateway route pattern', () => {
    const registry = combineManifestsToRegistry([
      {
        manifest: makeManifest({
          id: '@kb-labs/commit',
          studio: {
            version: 2,
            remoteName: 'commitPlugin',
            pages: [{ id: 'c.o', title: 'C', route: '/p/commit', entry: './C' }],
          },
        }),
        resolvedPath: './node_modules/@kb-labs/commit',
      },
    ]);

    const entry = registry.plugins[0]!;
    // Must match gateway route: GET /plugins/@scope/name/widgets/remoteEntry.js
    expect(entry.remoteEntryUrl).toBe('/plugins/@kb-labs/commit/widgets/remoteEntry.js');
    // Verify URL can be parsed by gateway route pattern /plugins/@:scope/:name/widgets/*
    const match = entry.remoteEntryUrl.match(/^\/plugins\/@([^/]+)\/([^/]+)\/widgets\/(.+)$/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('kb-labs');
    expect(match![2]).toBe('commit');
    expect(match![3]).toBe('remoteEntry.js');
  });

  it('preserves all manifest fields in registry entry', () => {
    const registry = combineManifestsToRegistry([{
      manifest: makeManifest({
        id: '@kb-labs/release-manager',
        version: '3.0.0',
        display: { name: 'Release Manager' },
        studio: {
          version: 2,
          remoteName: 'releasePlugin',
          pages: [
            { id: 'release.dashboard', title: 'Dashboard', route: '/p/release', entry: './Dashboard', icon: 'RocketOutlined', order: 1, permissions: ['release:read'] },
            { id: 'release.history', title: 'History', route: '/p/release/history', entry: './History', order: 2 },
          ],
          menus: [
            { id: 'release', label: 'Release', icon: 'RocketOutlined', target: 'release.dashboard', order: 50 },
            { id: 'release.history', label: 'History', target: 'release.history', parentId: 'release', order: 2 },
          ],
        },
      }),
    }]);

    expect(registry.plugins).toHaveLength(1);
    const p = registry.plugins[0]!;
    expect(p.pluginId).toBe('@kb-labs/release-manager');
    expect(p.pluginVersion).toBe('3.0.0');
    expect(p.displayName).toBe('Release Manager');
    expect(p.remoteName).toBe('releasePlugin');
    expect(p.pages).toHaveLength(2);
    expect(p.pages[0]!.permissions).toEqual(['release:read']);
    expect(p.pages[1]!.route).toBe('/p/release/history');
    expect(p.menus).toHaveLength(2);
    expect(p.menus[1]!.parentId).toBe('release');
  });

  it('combines multiple V2 manifests', () => {
    const registry = combineManifestsToRegistry([
      {
        manifest: makeManifest({
          id: '@kb-labs/commit',
          studio: {
            version: 2,
            remoteName: 'commitPlugin',
            pages: [{ id: 'c.o', title: 'C', route: '/p/commit', entry: './C' }],
          },
        }),
      },
      {
        manifest: makeManifest({
          id: '@kb-labs/quality',
          studio: {
            version: 2,
            remoteName: 'qualityPlugin',
            pages: [{ id: 'q.o', title: 'Q', route: '/p/quality', entry: './Q' }],
          },
        }),
      },
    ]);

    expect(registry.plugins).toHaveLength(2);
    expect(registry.plugins[0]!.pluginId).toBe('@kb-labs/commit');
    expect(registry.plugins[1]!.pluginId).toBe('@kb-labs/quality');
  });
});
