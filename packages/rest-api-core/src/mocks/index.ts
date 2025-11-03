/**
 * @module @kb-labs/rest-api-core/mocks
 * Mock data for mock mode
 */

import { ulid } from 'ulid';

/**
 * Generate mock audit summary
 */
import type { GetAuditSummaryResponse } from '@kb-labs/api-contracts';

export function mockAuditSummary(): GetAuditSummaryResponse['data'] {
  const ts = new Date().toISOString();
  return {
    ts,
    totals: {
      packages: 17,
      ok: 10,
      warn: 5,
      fail: 2,
      durationMs: 45000,
    },
    topFailures: [
      { pkg: '@kb-labs/example', checks: ['style', 'types'] },
      { pkg: '@kb-labs/test', checks: ['tests'] },
    ],
    overall: {
      ok: true,
      severity: 'low' as const,
    },
    counts: {
      error: 2,
      warning: 5,
      info: 10,
    },
    lastRunAt: ts,
  };
}

/**
 * Generate mock audit report
 */
export function mockAuditReport() {
  return {
    overall: {
      ok: true,
      severity: 'low' as const,
    },
    findings: [
      {
        file: 'src/example.ts',
        line: 10,
        severity: 'warning',
        message: 'Example finding',
      },
    ],
    summary: {
      total: 17,
      errors: 2,
      warnings: 5,
      info: 10,
    },
  };
}

/**
 * Generate mock release preview
 */
export function mockReleasePreview() {
  return {
    plan: {
      packages: [
        {
          name: '@kb-labs/example',
          version: '1.0.1',
          type: 'patch' as const,
        },
      ],
    },
    changelog: '# Changelog\n\n## 1.0.1\n\n- Fix: Example bug fix',
  };
}

/**
 * Generate mock devlink summary
 */
export function mockDevlinkSummary() {
  return {
    cycles: [],
    mismatches: 0,
    status: 'ok' as const,
  };
}

/**
 * Generate mock devlink graph
 */
export function mockDevlinkGraph() {
  return {
    nodes: [
      { id: 'pkg1', name: 'Package 1', type: 'package' },
      { id: 'pkg2', name: 'Package 2', type: 'package' },
    ],
    edges: [
      { from: 'pkg1', to: 'pkg2', type: 'dependency' },
    ],
  };
}

/**
 * Generate mock mind summary
 */
export function mockMindSummary() {
  return {
    freshness: 95,
    drift: 2,
    lastSync: new Date().toISOString(),
  };
}

/**
 * Generate mock analytics summary
 */
export function mockAnalyticsSummary() {
  return {
    period: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    },
    counters: {
      auditRuns: 10,
      releaseRuns: 2,
      devlinkChecks: 15,
    },
  };
}

/**
 * Generate mock job ID
 */
export function mockJobId(): string {
  return ulid();
}

/**
 * Generate mock run ID
 */
export function mockRunId(): string {
  return ulid();
}
