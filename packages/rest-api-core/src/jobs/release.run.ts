/**
 * @module @kb-labs/rest-api-core/jobs/release.run
 * Release run job executor
 */

import type { CliPort } from '../ports/cli.js';
import type { StoragePort } from '../ports/storage.js';
import { mapCliExitCodeToErrorCode, ErrorCode } from '../utils/errors.js';
import type { JobExecutor, JobContext, JobResult, JobPayload } from './types.js';

/**
 * Create release run executor
 */
export function createReleaseRunExecutor(cli: CliPort, storage: StoragePort): JobExecutor {
  return async (payload: JobPayload, context: JobContext): Promise<JobResult> => {
    const { args } = payload;

    // Execute CLI command
    const result = await cli.run('release', args, {
      cwd: context.repoRoot,
      timeoutMs: 900000,
      jobId: context.jobId, // Pass jobId for cancellation
    } as any);

    if (result.code !== 0) {
      const errorCode = mapCliExitCodeToErrorCode(result.code, 'release');
      return {
        success: false,
        error: result.stderr || 'Release failed',
        output: result.stdout,
      };
    }

    // Parse JSON output
    let releaseData: unknown;
    try {
      releaseData = JSON.parse(result.stdout);
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to parse release output: ${error.message}`,
        output: result.stdout,
      };
    }

    // Store release data
    const releasePath = `runs/release/${context.runId || context.jobId}/release.json`;
    await storage.writeJson(releasePath, releaseData);

    // Extract and store changelog
    const changelog = (releaseData as any).changelog || '';
    const changelogPath = `runs/release/${context.runId || context.jobId}/changelog.md`;
    await storage.writeText(changelogPath, changelog);

    // Update latest symlink
    const latestChangelogPath = 'runs/release/latest/changelog.md';
    const latestReleasePath = 'runs/release/latest/release.json';
    await storage.writeText(latestChangelogPath, changelog);
    await storage.writeJson(latestReleasePath, releaseData);

    return {
      success: true,
      output: result.stdout,
      artifacts: {
        release: releaseData,
        changelog,
      },
    };
  };
}

