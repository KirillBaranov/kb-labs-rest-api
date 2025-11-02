/**
 * @module @kb-labs/rest-api-core/services/release
 * Release service implementation
 */

import type { CliPort } from '../ports/cli.js';
import type { StoragePort } from '../ports/storage.js';
import type { QueuePort } from '../ports/queue.js';
import type { RestApiConfig } from '../config/schema.js';
import { mapCliExitCodeToErrorCode, ErrorCode, createError } from '../utils/errors.js';
import type {
  ReleasePreviewRequest,
  ReleasePreviewResponse,
  CreateReleaseRunRequest,
  GetReleaseRunResponse,
  GetReleaseChangelogResponse,
} from '../contracts/release.js';

/**
 * Release service
 */
export class ReleaseService {
  constructor(
    private cli: CliPort,
    private storage: StoragePort,
    private queue: QueuePort,
    private config: RestApiConfig,
    private repoRoot: string
  ) {}

  /**
   * Preview release
   */
  async preview(request: ReleasePreviewRequest): Promise<ReleasePreviewResponse['data']> {
    // Build CLI args
    const args: string[] = ['release', 'preview', '--json'];
    
    if (request.strategy) {
      args.push('--strategy', request.strategy);
    }
    if (request.fromTag) {
      args.push('--from-tag', request.fromTag);
    }
    if (request.toRef) {
      args.push('--to-ref', request.toRef);
    }

    // Execute CLI command
    const result = await this.cli.run('release', args, {
      cwd: this.repoRoot,
      timeoutMs: this.config.cli.timeoutSec * 1000,
    });

    if (result.code !== 0) {
      throw createError(
        ErrorCode.RELEASE_TOOL_ERROR,
        `Release preview failed: ${result.stderr}`,
        { exitCode: result.code }
      );
    }

    // Parse JSON output
    const preview = JSON.parse(result.stdout);

    return {
      plan: preview.plan || { packages: [] },
      changelog: preview.changelog || '',
    };
  }

  /**
   * Create release run (enqueue job)
   */
  async createRun(request: CreateReleaseRunRequest): Promise<{ runId: string; jobId: string }> {
    // Build CLI args
    const args: string[] = ['release', 'run', '--json'];
    
    if (request.dryRun) {
      args.push('--dry-run');
    }
    if (request.strategy) {
      args.push('--strategy', request.strategy);
    }
    if (request.confirm) {
      args.push('--yes');
    }

    // Enqueue job
    const { jobId, runId } = await this.queue.enqueue(
      'release.run',
      {
        args,
        dryRun: request.dryRun,
        strategy: request.strategy,
        confirm: request.confirm,
      },
      {
        priority: request.dryRun ? 0 : -1, // Dry runs have lower priority
        idempotencyKey: request.idempotencyKey,
        timeoutMs: this.config.cli.timeoutSec * 1000,
      }
    );

    return {
      runId: runId || jobId,
      jobId,
    };
  }

  /**
   * Get release run status
   */
  async getRunStatus(runId: string): Promise<GetReleaseRunResponse['data']> {
    const jobs = await this.queue.list({ kind: 'release.run' });
    const job = jobs.jobs.find(j => j.runId === runId || j.jobId === runId);
    
    if (!job) {
      throw createError(ErrorCode.NOT_FOUND, `Release run not found: ${runId}`);
    }

    // Try to read changelog if completed
    let changelog: string | undefined;
    if (job.status === 'completed') {
      try {
        const changelogPath = `runs/release/${runId}/changelog.md`;
        const exists = await this.storage.exists(changelogPath);
        if (exists) {
          changelog = await this.storage.readText(changelogPath);
        }
      } catch {
        // Ignore errors reading changelog
      }
    }

    return {
      runId: job.runId || job.jobId,
      status: job.status as 'queued' | 'running' | 'completed' | 'failed',
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      changelog,
    };
  }

  /**
   * Get release changelog
   */
  async getChangelog(format: 'markdown' | 'json' = 'markdown'): Promise<GetReleaseChangelogResponse['data']> {
    const changelogPath = format === 'markdown' 
      ? 'runs/release/latest/changelog.md'
      : 'runs/release/latest/changelog.json';
    
    const exists = await this.storage.exists(changelogPath);
    if (!exists) {
      throw createError(ErrorCode.NOT_FOUND, 'No changelog found');
    }

    if (format === 'json') {
      const changelog = await this.storage.readJson(changelogPath);
      return { changelog: JSON.stringify(changelog, null, 2), format: 'json' };
    } else {
      const changelog = await this.storage.readText(changelogPath);
      return { changelog, format: 'markdown' };
    }
  }
}

