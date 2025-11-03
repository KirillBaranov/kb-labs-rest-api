/**
 * @module @kb-labs/rest-api-core/jobs/devlink.check
 * DevLink check job executor
 */

import type { CliPort } from '../ports/cli.js';
import type { StoragePort } from '../ports/storage.js';
import { mapCliExitCodeToErrorCode } from '../utils/errors.js';
import type { JobExecutor, JobContext, JobResult, JobPayload } from './types.js';

/**
 * Create devlink check executor
 */
export function createDevlinkCheckExecutor(cli: CliPort, storage: StoragePort): JobExecutor {
  return async (payload: JobPayload, context: JobContext): Promise<JobResult> => {
    const { args } = payload;

    // Execute CLI command
    const result = await cli.run('devlink', args, {
      cwd: context.repoRoot,
      timeoutMs: 900000,
      jobId: context.jobId, // Pass jobId for cancellation
    } as any);

    if (result.code !== 0) {
      const errorCode = mapCliExitCodeToErrorCode(result.code, 'devlink');
      return {
        success: false,
        error: result.stderr || 'DevLink check failed',
        output: result.stdout,
      };
    }

    // Parse JSON output
    let checkData: unknown;
    try {
      checkData = JSON.parse(result.stdout);
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to parse devlink output: ${error.message}`,
        output: result.stdout,
      };
    }

    // Store check results
    const checkPath = `runs/devlink/${context.runId || context.jobId}/check.json`;
    await storage.writeJson(checkPath, checkData);

    // Extract summary and graph
    const summary = {
      cycles: (checkData as any).cycles || [],
      mismatches: (checkData as any).mismatches || 0,
      status: (checkData as any).status || 'ok',
      finishedAt: new Date().toISOString(),
    };

    const graph = {
      nodes: (checkData as any).nodes || [],
      edges: (checkData as any).edges || [],
    };

    const summaryPath = `runs/devlink/${context.runId || context.jobId}/summary.json`;
    const graphPath = `runs/devlink/${context.runId || context.jobId}/graph.json`;
    
    await storage.writeJson(summaryPath, summary);
    await storage.writeJson(graphPath, graph);

    // Update latest symlink
    const latestSummaryPath = 'runs/devlink/latest/summary.json';
    const latestGraphPath = 'runs/devlink/latest/graph.json';
    await storage.writeJson(latestSummaryPath, summary);
    await storage.writeJson(latestGraphPath, graph);

    return {
      success: true,
      output: result.stdout,
      artifacts: {
        check: checkData,
        summary,
        graph,
      },
    };
  };
}

