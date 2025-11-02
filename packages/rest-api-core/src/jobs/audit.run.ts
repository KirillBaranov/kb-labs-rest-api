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

    // Execute CLI command
    const result = await cli.run('audit', args, {
      cwd: context.repoRoot,
      timeoutMs: (payload.timeoutSec as number) * 1000 || 900000,
    });

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

    // Create summary
    const summary = {
      finishedAt: new Date().toISOString(),
      overall: (report as any).overall || { ok: true, severity: 'none' },
      counts: (report as any).counts || {},
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

