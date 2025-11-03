/**
 * @module @kb-labs/rest-api-core/adapters/cli/execa
 * Execa-based CLI adapter implementation
 */

import { execa } from 'execa';
import type { ExecaChildProcess } from 'execa';
import path from 'node:path';
import type { CliPort, CliExecutionResult, CliExecutionOptions } from '../../ports/cli.js';
import type { RestApiConfig } from '../../config/schema.js';
import {
  validateCommand,
  validateAndSanitizeArgs,
  validateWorkingDirectory,
  validateEnvVars,
  validateCommandBinary,
} from '../../utils/cli-validator.js';

interface ActiveProcess {
  process: ExecaChildProcess<string>;
  jobId: string;
  startTime: number;
}

/**
 * Execa-based CLI adapter
 */
export class ExecaCliAdapter implements CliPort {
  private activeProcesses = new Map<string, ActiveProcess>(); // jobId -> process

  constructor(
    private config: RestApiConfig,
    private repoRoot: string
  ) {}

  async run(
    cmd: string,
    args: string[],
    opts?: CliExecutionOptions
  ): Promise<CliExecutionResult> {
    // Validate command is in whitelist
    validateCommand(this.config.cli.allowedCommands, cmd);

    // Validate and sanitize arguments
    const sanitizedArgs = validateAndSanitizeArgs(args);

    // Validate command binary
    validateCommandBinary(this.config.cli.bin);

    // Validate cwd is within repo root
    const cwd = opts?.cwd || this.repoRoot;
    const resolvedCwd = validateWorkingDirectory(cwd, this.repoRoot);

    // Validate environment variables
    const sanitizedEnv = opts?.env ? validateEnvVars(opts.env) : undefined;

    // Build command: {bin} {prefix} {cmd} {args}
    const command = this.config.cli.bin;
    const commandArgs = [...this.config.cli.prefix, cmd, ...sanitizedArgs];

    // Set timeout
    const timeoutMs = opts?.timeoutMs || this.config.cli.timeoutSec * 1000;

    // Get jobId from options if available
    const jobId = (opts as any)?.jobId as string | undefined;

    try {
      const proc = execa(command, commandArgs, {
        cwd: resolvedCwd,
        env: {
          ...process.env,
          ...sanitizedEnv,
        },
        timeout: timeoutMs,
      });

      // Track active process if jobId is provided
      if (jobId) {
        this.activeProcesses.set(jobId, {
          process: proc,
          jobId,
          startTime: Date.now(),
        });
      }

      try {
        const result = await proc;

        // Remove from tracking
        if (jobId) {
          this.activeProcesses.delete(jobId);
        }

        return {
          code: result.exitCode || 0,
          stdout: result.stdout,
          stderr: result.stderr || '',
        };
      } catch (error: any) {
        // Remove from tracking
        if (jobId) {
          this.activeProcesses.delete(jobId);
        }

        // execa throws on non-zero exit codes
        return {
          code: error.exitCode || 1,
          stdout: error.stdout || '',
          stderr: error.stderr || error.message || '',
        };
      }
    } catch (error: any) {
      // Initial setup error
      return {
        code: error.exitCode || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
      };
    }
  }

  /**
   * Cancel active process for a job
   */
  cancelProcess(jobId: string): boolean {
    const activeProcess = this.activeProcesses.get(jobId);
    if (!activeProcess) {
      return false;
    }

    try {
      // Kill the process
      activeProcess.process.kill('SIGTERM');
      
      // Remove from tracking
      this.activeProcesses.delete(jobId);
      
      return true;
    } catch {
      // Ignore errors
      this.activeProcesses.delete(jobId);
      return false;
    }
  }

  async *stream(
    cmd: string,
    args: string[],
    opts?: CliExecutionOptions
  ): AsyncIterable<string> {
    // Validate command is in whitelist
    validateCommand(this.config.cli.allowedCommands, cmd);

    // Validate and sanitize arguments
    const sanitizedArgs = validateAndSanitizeArgs(args);

    // Validate command binary
    validateCommandBinary(this.config.cli.bin);

    // Validate cwd is within repo root
    const cwd = opts?.cwd || this.repoRoot;
    const resolvedCwd = validateWorkingDirectory(cwd, this.repoRoot);

    // Validate environment variables
    const sanitizedEnv = opts?.env ? validateEnvVars(opts.env) : undefined;

    // Build command
    const command = this.config.cli.bin;
    const commandArgs = [...this.config.cli.prefix, cmd, ...sanitizedArgs];

    // Create process
    const proc = execa(command, commandArgs, {
      cwd: resolvedCwd,
      env: {
        ...process.env,
        ...sanitizedEnv,
      },
    });

    // Stream stdout
    if (proc.stdout) {
      for await (const chunk of proc.stdout) {
        yield chunk.toString();
      }
    }

    // Stream stderr
    if (proc.stderr) {
      for await (const chunk of proc.stderr) {
        yield chunk.toString();
      }
    }
  }
}

