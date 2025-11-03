/**
 * @module @kb-labs/rest-api-core/ports/cli
 * CliPort interface for CLI command execution
 */

/**
 * CLI execution result
 */
export interface CliExecutionResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * CLI execution options
 */
export interface CliExecutionOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * CLI Port interface
 * Provides abstraction for executing CLI commands
 */
export interface CliPort {
  /**
   * Execute a CLI command
   * @param cmd - Command name (e.g., 'audit')
   * @param args - Command arguments
   * @param opts - Execution options (may include jobId for cancellation)
   * @returns Execution result with exit code, stdout, and stderr
   */
  run(
    cmd: string,
    args: string[],
    opts?: CliExecutionOptions
  ): Promise<CliExecutionResult>;

  /**
   * Stream command output (optional, for real-time logs)
   * @param cmd - Command name
   * @param args - Command arguments
   * @param opts - Execution options
   * @returns Async iterable of output lines
   */
  stream?(
    cmd: string,
    args: string[],
    opts?: CliExecutionOptions
  ): AsyncIterable<string>;

  /**
   * Cancel active process for a job (optional, for cancellation support)
   * @param jobId - Job ID
   * @returns True if process was cancelled, false if not found
   */
  cancelProcess?(jobId: string): boolean;
}

