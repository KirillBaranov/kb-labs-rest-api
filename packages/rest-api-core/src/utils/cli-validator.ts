/**
 * @module @kb-labs/rest-api-core/utils/cli-validator
 * CLI command and argument validation utilities
 */

import path from 'node:path';

/**
 * Allowed CLI argument patterns (whitelist approach)
 */
const ALLOWED_ARG_PATTERNS = [
  /^--json$/,
  /^--scope=/,
  /^--strict$/,
  /^--profile=/,
  /^--timeout=/,
  /^--strategy=/,
  /^--type=/,
  /^--format=/,
  /^--output=/,
  /^[a-zA-Z0-9_-]+$/, // Simple flags and options
];

/**
 * Validate CLI command is in whitelist
 */
export function validateCommand(allowedCommands: string[], command: string): void {
  if (!allowedCommands.includes(command)) {
    throw new Error(
      `Command "${command}" is not allowed. Allowed commands: ${allowedCommands.join(', ')}`
    );
  }
}

/**
 * Validate and sanitize CLI arguments
 */
export function validateAndSanitizeArgs(args: string[]): string[] {
  const sanitized: string[] = [];

  for (const arg of args) {
    // Check for dangerous patterns
    if (arg.includes(';') || arg.includes('|') || arg.includes('&') || arg.includes('$')) {
      throw new Error(`Dangerous character detected in argument: ${arg}`);
    }

    // Check for command injection patterns
    if (arg.includes('`') || arg.includes('$(') || arg.includes('${')) {
      throw new Error(`Potential command injection detected: ${arg}`);
    }

    // Check for path traversal in arguments
    if (arg.includes('..') || arg.includes('../') || arg.includes('..\\')) {
      throw new Error(`Path traversal detected in argument: ${arg}`);
    }

    // Validate against whitelist patterns
    const isAllowed = ALLOWED_ARG_PATTERNS.some(pattern => pattern.test(arg));
    if (!isAllowed && arg.startsWith('--')) {
      // Allow unknown flags but log warning (could be strict mode later)
      // For now, we allow them but could tighten this
    }

    sanitized.push(arg);
  }

  return sanitized;
}

/**
 * Validate working directory is within repository root
 */
export function validateWorkingDirectory(
  cwd: string,
  repoRoot: string
): string {
  const resolvedCwd = path.resolve(cwd);
  const resolvedRepoRoot = path.resolve(repoRoot);

  if (!resolvedCwd.startsWith(resolvedRepoRoot)) {
    throw new Error(
      `Working directory "${resolvedCwd}" is outside repository root "${resolvedRepoRoot}"`
    );
  }

  return resolvedCwd;
}

/**
 * Validate artifact path is safe (no path traversal, within allowed base)
 */
export function validateArtifactPath(
  artifactPath: string,
  baseDir: string
): string {
  // Validate path is not empty
  if (!artifactPath || artifactPath.trim() === '') {
    throw new Error('Empty artifact path provided');
  }

  // Normalize path
  const normalized = path.normalize(artifactPath);

  // Check for path traversal patterns
  if (normalized.includes('..') || normalized.includes('../') || normalized.startsWith('/')) {
    throw new Error(`Path traversal detected: ${artifactPath}`);
  }

  // Resolve to absolute path
  const resolved = path.resolve(baseDir, normalized);
  const resolvedBaseDir = path.resolve(baseDir);

  // Ensure resolved path is within base directory
  if (!resolved.startsWith(resolvedBaseDir)) {
    throw new Error(`Path traversal detected: ${artifactPath}`);
  }

  // Additional validation: check for dangerous characters
  if (normalized.includes('\0') || normalized.includes('\r') || normalized.includes('\n')) {
    throw new Error(`Invalid characters in artifact path: ${artifactPath}`);
  }

  return normalized;
}

/**
 * Validate environment variables for CLI execution
 */
export function validateEnvVars(env: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  // Blocklist of dangerous environment variables
  const BLOCKLIST = [
    'PATH',
    'LD_LIBRARY_PATH',
    'LD_PRELOAD',
    'DYLD_LIBRARY_PATH',
    'SHELL',
    'HOME',
    'USER',
    'USERNAME',
  ];

  for (const [key, value] of Object.entries(env)) {
    if (BLOCKLIST.includes(key)) {
      throw new Error(`Blocklisted environment variable: ${key}`);
    }

    // Check for dangerous patterns in values
    if (value.includes(';') || value.includes('|') || value.includes('&')) {
      throw new Error(`Dangerous character in environment variable ${key}`);
    }

    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Validate command binary path
 */
export function validateCommandBinary(bin: string): void {
  // Only allow simple command names (no path traversal)
  if (bin.includes('/') || bin.includes('\\') || bin.includes('..')) {
    throw new Error(`Invalid command binary: ${bin}`);
  }

  // Allow only alphanumeric and common characters
  if (!/^[a-zA-Z0-9_.-]+$/.test(bin)) {
    throw new Error(`Invalid command binary: ${bin}`);
  }
}

