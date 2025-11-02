/**
 * @module @kb-labs/rest-api-core/services/audit
 * Audit service implementation
 */

import type { CliPort } from '../ports/cli.js';
import type { StoragePort } from '../ports/storage.js';
import type { QueuePort } from '../ports/queue.js';
import type { RestApiConfig } from '../config/schema.js';
import { mapCliExitCodeToErrorCode, ErrorCode, createError } from '../utils/errors.js';
import type {
  CreateAuditRunRequest,
  GetAuditSummaryResponse,
  GetAuditReportResponse,
} from '../contracts/audit.js';

/**
 * Audit service
 */
export class AuditService {
  constructor(
    private cli: CliPort,
    private storage: StoragePort,
    private queue: QueuePort,
    private config: RestApiConfig,
    private repoRoot: string
  ) {}

  /**
   * Create audit run (enqueue job)
   */
  async createRun(request: CreateAuditRunRequest): Promise<{ runId: string; jobId: string }> {
    // Build CLI args
    const args: string[] = ['audit', 'run', '--json'];
    
    if (request.scope) {
      args.push('--scope', request.scope);
    }
    if (request.strict) {
      args.push('--strict');
    }
    if (request.profile) {
      args.push('--profile', request.profile);
    }
    if (request.timeoutSec) {
      args.push('--timeout', request.timeoutSec.toString());
    }

    // Enqueue job
    const { jobId, runId } = await this.queue.enqueue(
      'audit.run',
      {
        args,
        scope: request.scope,
        strict: request.strict,
        profile: request.profile,
        timeoutSec: request.timeoutSec,
      },
      {
        priority: 0,
        idempotencyKey: request.idempotencyKey,
        timeoutMs: (request.timeoutSec || this.config.cli.timeoutSec) * 1000,
      }
    );

    return {
      runId: runId || jobId,
      jobId,
    };
  }

  /**
   * Get audit summary
   */
  async getSummary(mockMode?: boolean): Promise<GetAuditSummaryResponse['data']> {
    // Mock mode
    if (mockMode) {
      const { mockAuditSummary } = await import('../mocks/index.js');
      return mockAuditSummary();
    }

    // Try to read latest report
    const reportPath = 'runs/audit/latest/summary.json';
    
    try {
      const exists = await this.storage.exists(reportPath);
      if (!exists) {
        return {
          overall: { ok: true, severity: 'none' },
          counts: {},
        };
      }

      const report = await this.storage.readJson<any>(reportPath);
      
      return {
        overall: report.overall || { ok: true, severity: 'none' },
        counts: report.counts || {},
        lastRunAt: report.finishedAt,
      };
    } catch (error) {
      // Return default summary on error
      return {
        overall: { ok: true, severity: 'none' },
        counts: {},
      };
    }
  }

  /**
   * Get latest audit report
   */
  async getLatestReport(): Promise<GetAuditReportResponse['data']> {
    const reportPath = 'runs/audit/latest/report.json';
    
    const exists = await this.storage.exists(reportPath);
    if (!exists) {
      throw createError(ErrorCode.NOT_FOUND, 'No audit report found');
    }

    return await this.storage.readJson(reportPath);
  }

  /**
   * Get audit run status
   */
  async getRunStatus(runId: string): Promise<{
    runId: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
    summary?: unknown;
  }> {
    // Try to find job by runId
    const jobs = await this.queue.list({ kind: 'audit.run' });
    const job = jobs.jobs.find(j => j.runId === runId || j.jobId === runId);
    
    if (!job) {
      throw createError(ErrorCode.NOT_FOUND, `Audit run not found: ${runId}`);
    }

    // Try to read summary if completed
    let summary: unknown | undefined;
    if (job.status === 'completed') {
      try {
        const summaryPath = `runs/audit/${runId}/summary.json`;
        const exists = await this.storage.exists(summaryPath);
        if (exists) {
          summary = await this.storage.readJson(summaryPath);
        }
      } catch {
        // Ignore errors reading summary
      }
    }

    return {
      runId: job.runId || job.jobId,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      summary,
    };
  }
}

