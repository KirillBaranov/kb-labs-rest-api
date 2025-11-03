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
} from '@kb-labs/api-contracts';

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
    const preview = JSON.parse(result.stdout) as any;

    // Extract range from request or use defaults
    const range: { from: string; to: string } = {
      from: request.fromTag || 'latest',
      to: request.toRef || 'HEAD',
    };
    
    // Transform CLI output to api-contracts format
    const plan = preview.plan || { packages: [] };
    const changelog = preview.changelog || '';
    
    // Transform packages to api-contracts format
    type PackageInput = { name?: string; type?: string; version?: string; prev?: string; current?: string; previous?: string; next?: string; breaking?: number };
    const packages: ReleasePreviewResponse['data']['packages'] = (plan.packages || []).map((pkg: PackageInput) => {
      // Determine bump type
      let bump: 'major' | 'minor' | 'patch' | 'none' = 'patch';
      if (pkg.type === 'none') {
        bump = 'none';
      } else if (pkg.type === 'major') {
        bump = 'major';
      } else if (pkg.type === 'minor') {
        bump = 'minor';
      } else if (pkg.type === 'patch') {
        bump = 'patch';
      }

      return {
        name: pkg.name ?? '',
        prev: pkg.prev ?? pkg.current ?? pkg.previous ?? '0.0.0', // Mock: extract from git or use placeholder
        next: pkg.version ?? pkg.next ?? '0.0.0', // Map version to next
        bump,
        breaking: pkg.breaking ?? 0, // Mock: analyze changelog or set to 0
      };
    });
    
    // Extract or mock markdown and manifestJson
    const markdown = preview.markdown ?? changelog; // Use changelog as markdown if available
    const manifestJson = preview.manifestJson ?? JSON.stringify({ packages }, null, 2); // Mock: generate from packages

    // Build backward-compatible plan object
    type Package = ReleasePreviewResponse['data']['packages'][number];
    const backwardPlan: NonNullable<ReleasePreviewResponse['data']['plan']> = {
      packages: packages.map((pkg: Package) => ({
        name: pkg.name,
        version: pkg.next,
        type: pkg.bump === 'none' ? 'patch' as const : pkg.bump === 'major' ? 'major' as const : pkg.bump === 'minor' ? 'minor' as const : 'patch' as const,
      })),
    };

    // Build response object with proper types
    const response: ReleasePreviewResponse['data'] = {
      range,
      packages,
      manifestJson: manifestJson || undefined,
      markdown: markdown || undefined,
      changelog,
      plan: backwardPlan,
    };

    return response;
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

    const createdAt = new Date().toISOString();
    
    if (format === 'json') {
      const changelog = await this.storage.readJson(changelogPath);
      return { changelog: JSON.stringify(changelog, null, 2), format: 'json', createdAt };
    } else {
      const changelog = await this.storage.readText(changelogPath);
      return { changelog, format: 'markdown', createdAt };
    }
  }
}

