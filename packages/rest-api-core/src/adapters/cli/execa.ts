/**
 * @module @kb-labs/rest-api-core/adapters/cli/execa
 * Execa-based CLI adapter implementation
 */

import { execa } from 'execa';
import path from 'node:path';
import type { CliPort, CliExecutionResult, CliExecutionOptions } from '../../ports/cli.js';
import type { RestApiConfig } from '../../config/schema.js';

/**
 * Execa-based CLI adapter
 */
export class ExecaCliAdapter implements CliPort {
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
    if (!this.config.cli.allowedCommands.includes(cmd)) {
      throw new Error(`Command "${cmd}" is not allowed. Allowed commands: ${this.config.cli.allowedCommands.join(', ')}`);
    }

    // Validate cwd is within repo root
    const cwd = opts?.cwd || this.repoRoot;
    const resolvedCwd = path.resolve(cwd);
    const resolvedRepoRoot = path.resolve(this.repoRoot);
    
    if (!resolvedCwd.startsWith(resolvedRepoRoot)) {
      throw new Error(`Working directory "${resolvedCwd}" is outside repository root "${resolvedRepoRoot}"`);
    }

    // Build command: {bin} {prefix} {cmd} {args}
    const command = this.config.cli.bin;
    const commandArgs = [...this.config.cli.prefix, cmd, ...args];

    // Set timeout
    const timeoutMs = opts?.timeoutMs || this.config.cli.timeoutSec * 1000;

    try {
      const result = await execa(command, commandArgs, {
        cwd: resolvedCwd,
        env: {
          ...process.env,
          ...opts?.env,
        },
        timeout: timeoutMs,
      });

      return {
        code: result.exitCode || 0,
        stdout: result.stdout,
        stderr: result.stderr || '',
      };
    } catch (error: any) {
      // execa throws on non-zero exit codes
      return {
        code: error.exitCode || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
      };
    }
  }

  async *stream(
    cmd: string,
    args: string[],
    opts?: CliExecutionOptions
  ): AsyncIterable<string> {
    // Validate command
    if (!this.config.cli.allowedCommands.includes(cmd)) {
      throw new Error(`Command "${cmd}" is not allowed`);
    }

    // Validate cwd
    const cwd = opts?.cwd || this.repoRoot;
    const resolvedCwd = path.resolve(cwd);
    const resolvedRepoRoot = path.resolve(this.repoRoot);
    
    if (!resolvedCwd.startsWith(resolvedRepoRoot)) {
      throw new Error(`Working directory "${resolvedCwd}" is outside repository root`);
    }

    // Build command
    const command = this.config.cli.bin;
    const commandArgs = [...this.config.cli.prefix, cmd, ...args];

    // Create process
    const proc = execa(command, commandArgs, {
      cwd: resolvedCwd,
      env: {
        ...process.env,
        ...opts?.env,
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

