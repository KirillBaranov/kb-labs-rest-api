/**
 * @module @kb-labs/rest-api-core/utils/error-mapper
 * Error mapping utilities for consistent error handling
 */

import type { CliExecutionResult } from '../ports/cli.js';
import { ErrorCode, mapCliExitCodeToErrorCode, createError } from './errors.js';
import type { ApiError as ApiContractsApiError } from '@kb-labs/api-contracts';

/**
 * Map CLI execution result to API error
 */
export function mapCliResultToError(
  result: CliExecutionResult,
  command: string
): ApiContractsApiError {
  const exitCode = result.code || 1;
  const errorCode = mapCliExitCodeToErrorCode(exitCode, command);
  
  return {
    code: errorCode,
    message: result.stderr || `Command failed: ${command}`,
    details: {
      exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    },
    cause: `CLI exit code: ${exitCode}`,
  };
}

/**
 * Map timeout error to API error
 */
export function mapTimeoutError(
  timeoutMs: number,
  command: string
): ApiContractsApiError {
  return {
    code: ErrorCode.TIMEOUT,
    message: `Command timeout after ${timeoutMs}ms: ${command}`,
    details: {
      timeoutMs,
      command,
    },
    cause: `Execution exceeded timeout of ${timeoutMs}ms`,
  };
}

/**
 * Map validation error to API error
 */
export function mapValidationError(
  field: string,
  message: string,
  value?: unknown,
  traceId?: string
): ApiContractsApiError {
  return {
    code: ErrorCode.VALIDATION_ERROR,
    message: `Validation error: ${field} - ${message}`,
    details: {
      field,
      value,
    },
    traceId,
  };
}

/**
 * Map internal error to API error
 */
export function mapInternalError(
  error: Error,
  traceId?: string
): ApiContractsApiError {
  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: error.message || 'Internal server error',
    details: {
      name: error.name,
      stack: error.stack,
    },
    cause: error.cause?.toString(),
    traceId,
  };
}

