/**
 * @module @kb-labs/rest-api-core/__tests__/studio-registry
 *
 * Tests for ManifestV3 to StudioRegistry transformation.
 */

import { describe, it, expect } from 'vitest';
import { manifestToRegistry, combineManifestsToRegistry } from '../studio-registry';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import type { StudioConfig } from '@kb-labs/rest-api-contracts';

describe('manifestToRegistry', () => {
  const baseManifest: ManifestV3 = {
    schema: 'kb.manifest/3',
    id: '@kb-labs/test-plugin',
    version: '1.0.0',
    display: {
      name: 'Test Plugin',
      description: 'A test plugin',
    },
    commands: [],
    permissions: {},
    studio: undefined,
  };

  describe('plugin entry', () => {
    it('should create plugin entry with pluginId', () => {
      const studioConfig: StudioConfig = {
        widgets: [],
        menus: [],
        layouts: [],
      };

      const manifest: ManifestV3 = {
        ...baseManifest,
        studio: studioConfig,
      };

      const result = manifestToRegistry(manifest);

      expect(result.plugin.pluginId).toBe('@kb-labs/test-plugin');
    });

    it('should return empty arrays when no studio section', () => {
      const manifest: ManifestV3 = {
        ...baseManifest,
        studio: undefined,
      };

      const result = manifestToRegistry(manifest);

      expect(result.plugin.widgets).toEqual([]);
      expect(result.plugin.menus).toEqual([]);
      expect(result.plugin.layouts).toEqual([]);
      expect(result.widgets).toEqual([]);
      expect(result.menus).toEqual([]);
      expect(result.layouts).toEqual([]);
    });
  });

  describe('widgets transformation', () => {
    it('should transform widgets with all properties', () => {
      const studioConfig: StudioConfig = {
        widgets: [
          {
            id: 'dashboard-widget',
            kind: 'chart-line',
            title: 'Dashboard Chart',
            description: 'Shows metrics',
            data: {
              source: { type: 'rest', routeId: 'metrics' },
            },
            options: { smooth: true },
            layoutHint: { minW: 2, minH: 2 },
            actions: [
              {
                id: 'refresh',
                label: 'Refresh',
                icon: 'refresh',
                variant: 'primary',
                handler: { type: 'rest', routeId: 'metrics', method: 'GET' },
                order: 1,
              },
            ],
            events: {
              emit: ['refresh'],
              subscribe: ['dataChange'],
            },
          },
        ],
        menus: [],
        layouts: [],
      };

      const manifest: ManifestV3 = {
        ...baseManifest,
        studio: studioConfig,
      };

      const result = manifestToRegistry(manifest);

      expect(result.widgets).toHaveLength(1);

      const widget = result.widgets[0];
      expect(widget.id).toBe('dashboard-widget');
      expect(widget.kind).toBe('chart-line');
      expect(widget.title).toBe('Dashboard Chart');
      expect(widget.description).toBe('Shows metrics');
      expect(widget.data?.source).toEqual({ type: 'rest', routeId: 'metrics' });
      expect(widget.options).toEqual({ smooth: true });
      expect(widget.layoutHint).toEqual({ minW: 2, minH: 2 });
      expect(widget.events).toEqual({ emit: ['refresh'], subscribe: ['dataChange'] });

      expect(widget.actions).toHaveLength(1);
      expect(widget.actions![0].id).toBe('refresh');
      expect(widget.actions![0].variant).toBe('primary');
    });

    it('should handle widget without optional properties', () => {
      const studioConfig: StudioConfig = {
        widgets: [
          {
            id: 'simple-widget',
            kind: 'metric',
            title: 'Simple',
            data: { source: { type: 'static' } },
          },
        ],
        menus: [],
        layouts: [],
      };

      const manifest: ManifestV3 = {
        ...baseManifest,
        studio: studioConfig,
      };

      const result = manifestToRegistry(manifest);

      expect(result.widgets).toHaveLength(1);
      expect(result.widgets[0].id).toBe('simple-widget');
      expect(result.widgets[0].description).toBeUndefined();
      expect(result.widgets[0].actions).toBeUndefined();
    });
  });

  describe('menus transformation', () => {
    it('should transform menus correctly', () => {
      const studioConfig: StudioConfig = {
        widgets: [],
        menus: [
          {
            id: 'main-menu',
            label: 'Dashboard',
            target: 'dashboard',
            order: 1,
          },
          {
            id: 'settings-menu',
            label: 'Settings',
            target: 'settings',
            order: 2,
          },
        ],
        layouts: [],
      };

      const manifest: ManifestV3 = {
        ...baseManifest,
        studio: studioConfig,
      };

      const result = manifestToRegistry(manifest);

      expect(result.menus).toHaveLength(2);

      expect(result.menus[0].id).toBe('main-menu');
      expect(result.menus[0].label).toBe('Dashboard');
      expect(result.menus[0].target).toBe('dashboard');
      expect(result.menus[0].order).toBe(1);

      expect(result.menus[1].id).toBe('settings-menu');
      expect(result.menus[1].order).toBe(2);
    });
  });

  describe('layouts transformation', () => {
    it('should transform layouts correctly', () => {
      const studioConfig: StudioConfig = {
        widgets: [],
        menus: [],
        layouts: [
          {
            id: 'main-layout',
            title: 'Main Dashboard',
            kind: 'grid',
            description: 'Primary dashboard layout',
            config: { columns: 12 },
            widgets: ['widget-1', 'widget-2'],
            actions: [
              {
                id: 'save',
                label: 'Save Layout',
                handler: { type: 'rest', routeId: 'save-layout' },
              },
            ],
          },
        ],
      };

      const manifest: ManifestV3 = {
        ...baseManifest,
        studio: studioConfig,
      };

      const result = manifestToRegistry(manifest);

      expect(result.layouts).toHaveLength(1);

      const layout = result.layouts[0];
      expect(layout.id).toBe('main-layout');
      expect(layout.kind).toBe('grid');
      expect(layout.title).toBe('Main Dashboard');
      expect(layout.description).toBe('Primary dashboard layout');
      expect(layout.config).toEqual({ columns: 12 });
      expect(layout.widgets).toEqual(['widget-1', 'widget-2']);
      expect(layout.actions).toHaveLength(1);
      expect(layout.actions![0].id).toBe('save');
    });
  });

  describe('plugin entry aggregation', () => {
    it('should include all widgets, menus, layouts in plugin entry', () => {
      const studioConfig: StudioConfig = {
        widgets: [
          { id: 'w1', kind: 'metric', title: 'W1', data: { source: { type: 'static' } } },
          { id: 'w2', kind: 'chart-line', title: 'W2', data: { source: { type: 'static' } } },
        ],
        menus: [{ id: 'm1', label: 'M1', target: 'm1', order: 1 }],
        layouts: [{ id: 'l1', title: 'L1', kind: 'grid' }],
      };

      const manifest: ManifestV3 = {
        ...baseManifest,
        studio: studioConfig,
      };

      const result = manifestToRegistry(manifest);

      expect(result.plugin.widgets).toHaveLength(2);
      expect(result.plugin.menus).toHaveLength(1);
      expect(result.plugin.layouts).toHaveLength(1);
    });
  });
});

describe('combineManifestsToRegistry', () => {
  const createManifest = (
    id: string,
    studioConfig?: StudioConfig
  ): ManifestV3 => ({
    schema: 'kb.manifest/3',
    id,
    version: '1.0.0',
    display: { name: id },
    commands: [],
    permissions: {},
    studio: studioConfig,
  });

  it('should combine multiple manifests into single registry', () => {
    const manifests = [
      createManifest('@kb-labs/plugin-a', {
        widgets: [{ id: 'widget-a', kind: 'metric', title: 'Widget A', data: { source: { type: 'static' } } }],
        menus: [{ id: 'menu-a', label: 'Menu A', target: 'a', order: 1 }],
        layouts: [],
      }),
      createManifest('@kb-labs/plugin-b', {
        widgets: [{ id: 'widget-b', kind: 'chart-line', title: 'Widget B', data: { source: { type: 'static' } } }],
        menus: [],
        layouts: [{ id: 'layout-b', title: 'Layout B', kind: 'grid' }],
      }),
    ];

    const registry = combineManifestsToRegistry(manifests);

    expect(registry.schema).toBe('kb.studio/1');
    expect(registry.schemaVersion).toBe(1);
    expect(registry.plugins).toHaveLength(2);
  });

  it('should set generatedAt timestamp', () => {
    const before = new Date().toISOString();
    const registry = combineManifestsToRegistry([]);
    const after = new Date().toISOString();

    expect(registry.generatedAt).toBeDefined();
    expect(registry.generatedAt >= before).toBe(true);
    expect(registry.generatedAt <= after).toBe(true);
  });

  it('should skip manifests without studio section', () => {
    const manifests = [
      createManifest('@kb-labs/plugin-a', {
        widgets: [{ id: 'widget-a', kind: 'metric', title: 'Widget A', data: { source: { type: 'static' } } }],
        menus: [],
        layouts: [],
      }),
      createManifest('@kb-labs/plugin-b-no-studio'), // no studio
      createManifest('@kb-labs/plugin-c', {
        widgets: [],
        menus: [{ id: 'menu-c', label: 'Menu C', target: 'c', order: 1 }],
        layouts: [],
      }),
    ];

    const registry = combineManifestsToRegistry(manifests);

    expect(registry.plugins).toHaveLength(2);
    expect(registry.plugins.map((p) => p.pluginId)).toEqual([
      '@kb-labs/plugin-a',
      '@kb-labs/plugin-c',
    ]);
  });

  it('should handle empty manifests array', () => {
    const registry = combineManifestsToRegistry([]);

    expect(registry.plugins).toEqual([]);
  });
});
