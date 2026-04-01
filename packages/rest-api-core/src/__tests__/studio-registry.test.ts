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
