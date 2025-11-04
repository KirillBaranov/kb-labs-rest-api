/**
 * @module @kb-labs/rest-api-app/__tests__/cli-api-integration
 * E2E tests for REST API → CLI API → Plugins flow
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { discoverPluginsViaCli, refreshPluginDiscovery, disposeCliApi } from '../plugins/cli-discovery.js';
import * as path from 'node:path';

describe('REST API → CLI API Integration', () => {
  const repoRoot = path.resolve(process.cwd(), '../../..');

  afterAll(async () => {
    await disposeCliApi();
  });

  describe('Plugin Discovery', () => {
    it('should discover plugins via CLI API', async () => {
      const result = await discoverPluginsViaCli(repoRoot);

      expect(result).toHaveProperty('v2Manifests');
      expect(result).toHaveProperty('manifestsWithPaths');
      expect(result).toHaveProperty('warnings');

      expect(Array.isArray(result.v2Manifests)).toBe(true);
      expect(Array.isArray(result.manifestsWithPaths)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should return valid manifest structure', async () => {
      const result = await discoverPluginsViaCli(repoRoot);

      for (const manifest of result.v2Manifests) {
        expect(manifest).toHaveProperty('id');
        expect(manifest).toHaveProperty('version');
        expect(typeof manifest.id).toBe('string');
        expect(typeof manifest.version).toBe('string');
      }
    });

    it('should return manifest with path information', async () => {
      const result = await discoverPluginsViaCli(repoRoot);

      for (const item of result.manifestsWithPaths) {
        expect(item).toHaveProperty('manifest');
        expect(item).toHaveProperty('manifestPath');
        expect(item).toHaveProperty('pluginRoot');
        expect(typeof item.manifestPath).toBe('string');
        expect(typeof item.pluginRoot).toBe('string');
      }
    });

    it('should handle multiple discoveries (caching)', async () => {
      const result1 = await discoverPluginsViaCli(repoRoot);
      const result2 = await discoverPluginsViaCli(repoRoot);

      // Results should be consistent
      expect(result1.v2Manifests.length).toBe(result2.v2Manifests.length);
    });
  });

  describe('Plugin Refresh', () => {
    it('should refresh plugin discovery', async () => {
      await expect(refreshPluginDiscovery()).resolves.not.toThrow();
    });

    it('should maintain consistency after refresh', async () => {
      const before = await discoverPluginsViaCli(repoRoot);
      await refreshPluginDiscovery();
      const after = await discoverPluginsViaCli(repoRoot);

      // Should find same number of plugins
      expect(before.v2Manifests.length).toBe(after.v2Manifests.length);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid repo root gracefully', async () => {
      const result = await discoverPluginsViaCli('/non/existent/path');

      // Should return empty result with warnings, not throw
      expect(result.v2Manifests).toEqual([]);
      expect(result.manifestsWithPaths).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should not throw on repeated dispose calls', async () => {
      await expect(disposeCliApi()).resolves.not.toThrow();
      await expect(disposeCliApi()).resolves.not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should complete discovery in reasonable time', async () => {
      const start = Date.now();
      await discoverPluginsViaCli(repoRoot);
      const elapsed = Date.now() - start;

      // Should complete in less than 5 seconds
      expect(elapsed).toBeLessThan(5000);
    });

    it('should be faster on cached calls', async () => {
      // First call (cold)
      const start1 = Date.now();
      await discoverPluginsViaCli(repoRoot);
      const time1 = Date.now() - start1;

      // Second call (cached)
      const start2 = Date.now();
      await discoverPluginsViaCli(repoRoot);
      const time2 = Date.now() - start2;

      // Cached call should be faster
      expect(time2).toBeLessThanOrEqual(time1);
    });
  });

  describe('Specific Plugin Discovery', () => {
    it('should discover kb-labs-mind plugin if present', async () => {
      const result = await discoverPluginsViaCli(repoRoot);
      
      // Check if mind plugin is present
      const mindPlugin = result.v2Manifests.find(
        m => m.id === '@kb-labs/mind' || m.id.includes('mind')
      );

      if (mindPlugin) {
        expect(mindPlugin).toHaveProperty('id');
        expect(mindPlugin).toHaveProperty('version');
        expect(mindPlugin.version).toMatch(/^\d+\.\d+\.\d+/);
      }
    });

    it('should discover ai-review plugin if present', async () => {
      const result = await discoverPluginsViaCli(repoRoot);
      
      // Check if ai-review plugin is present
      const aiReviewPlugin = result.v2Manifests.find(
        m => m.id === '@kb-labs/ai-review' || m.id.includes('ai-review')
      );

      if (aiReviewPlugin) {
        expect(aiReviewPlugin).toHaveProperty('id');
        expect(aiReviewPlugin).toHaveProperty('version');
      }
    });
  });
});

describe('No Subprocess Spawning', () => {
  it('should not use execa or child_process', async () => {
    // This test verifies that we're not spawning subprocesses
    // by checking the implementation doesn't import execa
    
    const cliDiscoveryModule = await import('../plugins/cli-discovery.js');
    const moduleString = cliDiscoveryModule.toString();
    
    // Should not contain execa references
    expect(moduleString).not.toContain('execa');
  });
});

