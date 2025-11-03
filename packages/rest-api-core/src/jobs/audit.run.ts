/**
 * @module @kb-labs/rest-api-core/jobs/audit.run
 * Audit run job executor
 */

import type { CliPort } from '../ports/cli.js';
import type { StoragePort } from '../ports/storage.js';
import { mapCliExitCodeToErrorCode, ErrorCode } from '../utils/errors.js';
import type { JobExecutor, JobContext, JobResult, JobPayload } from './types.js';

/**
 * Create audit run executor
 */
export function createAuditRunExecutor(cli: CliPort, storage: StoragePort): JobExecutor {
  return async (payload: JobPayload, context: JobContext): Promise<JobResult> => {
    const { args } = payload;

    // Execute CLI command (pass jobId for cancellation support)
    const result = await cli.run('audit', args, {
      cwd: context.repoRoot,
      timeoutMs: (payload.timeoutSec as number) * 1000 || 900000,
      jobId: context.jobId, // Pass jobId for cancellation
    } as any);

    if (result.code !== 0) {
      const errorCode = mapCliExitCodeToErrorCode(result.code, 'audit');
      return {
        success: false,
        error: result.stderr || 'Audit failed',
        output: result.stdout,
      };
    }

    // Parse JSON output
    let report: unknown;
    try {
      report = JSON.parse(result.stdout);
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to parse audit output: ${error.message}`,
        output: result.stdout,
      };
    }

    // Store report
    const reportPath = `runs/audit/${context.runId || context.jobId}/report.json`;
    await storage.writeJson(reportPath, report);

    // Transform CLI output to api-contracts format
    const reportData = report as any;
    const ts = new Date().toISOString();
    const overall = reportData.overall || { ok: true, severity: 'none' };
    const counts = reportData.counts || {};
    
    // Derive totals from counts or mock if needed
    const totals = {
      packages: counts.packages ?? counts.total ?? 0,
      ok: counts.ok ?? counts.passed ?? 0,
      warn: counts.warn ?? counts.warnings ?? 0,
      fail: counts.fail ?? counts.failed ?? 0,
      durationMs: counts.durationMs ?? reportData.durationMs ?? 0,
    };
    
    // Extract topFailures from CLI output or mock empty array
    const topFailures = reportData.topFailures ?? 
                       reportData.failures?.slice(0, 10) ?? 
                       [];

    // Create summary in api-contracts format
    const summary = {
      ts,
      totals,
      topFailures: topFailures.map((f: any) => ({
        pkg: f.pkg ?? f.name ?? f.package ?? '',
        checks: f.checks ?? f.failedChecks ?? [],
      })),
      // Backward compatibility
      finishedAt: ts,
      overall,
      counts,
      lastRunAt: ts,
    };

    const summaryPath = `runs/audit/${context.runId || context.jobId}/summary.json`;
    await storage.writeJson(summaryPath, summary);

    // Update latest symlink (store latest report)
    const latestReportPath = 'runs/audit/latest/report.json';
    const latestSummaryPath = 'runs/audit/latest/summary.json';
    await storage.writeJson(latestReportPath, report);
    await storage.writeJson(latestSummaryPath, summary);

    return {
      success: true,
      output: result.stdout,
      artifacts: {
        report,
        summary,
      },
    };
  };
}

