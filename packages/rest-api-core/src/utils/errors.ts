/**
 * @module @kb-labs/rest-api-core/utils/errors
 * Error codes and factory functions
 */

import { ErrorCode as ApiContractsErrorCode, type ErrorCode as ApiContractsErrorCodeType } from '@kb-labs/api-contracts';

/**
 * Error codes enum (re-export from api-contracts for backward compatibility)
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'E_VALIDATION',
  UNAUTHORIZED = 'E_UNAUTHORIZED',
  FORBIDDEN = 'E_FORBIDDEN',
  NOT_FOUND = 'E_NOT_FOUND',
  CONFLICT = 'E_CONFLICT',
  RATE_LIMIT = 'E_RATE_LIMIT',
  TIMEOUT = 'E_TIMEOUT',
  AUDIT_TOOL_ERROR = 'E_TOOL_AUDIT',
  RELEASE_TOOL_ERROR = 'E_TOOL_RELEASE',
  DEVLINK_TOOL_ERROR = 'E_TOOL_DEVLINK',
  MIND_TOOL_ERROR = 'E_TOOL_MIND',
  ANALYTICS_TOOL_ERROR = 'E_TOOL_ANALYTICS',
  INTERNAL_ERROR = 'E_INTERNAL',
}

/**
 * Map ErrorCode enum to api-contracts ErrorCode
 */
export function mapToApiContractsErrorCode(code: ErrorCode): ApiContractsErrorCode {
  return code as unknown as ApiContractsErrorCode;
}

/**
 * Map CLI exit code to API error code
 */
export function mapCliExitCodeToErrorCode(exitCode: number, command: string): ErrorCode {
  if (exitCode === 0) {
    throw new Error('Cannot map exit code 0 to error');
  }

  // Map command-specific errors
  if (command === 'audit') {
    return ErrorCode.AUDIT_TOOL_ERROR;
  }
  if (command === 'release') {
    return ErrorCode.RELEASE_TOOL_ERROR;
  }
  if (command === 'devlink') {
    return ErrorCode.DEVLINK_TOOL_ERROR;
  }
  if (command === 'mind') {
    return ErrorCode.MIND_TOOL_ERROR;
  }
  if (command === 'analytics') {
    return ErrorCode.ANALYTICS_TOOL_ERROR;
  }

  // Generic errors
  if (exitCode === 127) {
    // Command not found
    return ErrorCode.INTERNAL_ERROR;
  }

  // Timeout
  if (exitCode === 124 || exitCode === 143) {
    // SIGTERM or timeout
    return ErrorCode.TIMEOUT;
  }

  // Default to internal error
  return ErrorCode.INTERNAL_ERROR;
}

/**
 * Create API error object
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  cause?: string;
  traceId?: string;
}

/**
 * Create error from code and message
 */
export function createError(
  code: ErrorCode | string,
  message: string,
  details?: Record<string, unknown>,
  cause?: string,
  traceId?: string
): ApiError {
  return {
    code,
    message,
    details,
    cause,
    traceId,
  };
}

/**
 * Create validation error
 */
export function createValidationError(
  field: string,
  message: string,
  value?: unknown,
  traceId?: string
): ApiError {
  return createError(
    ErrorCode.VALIDATION_ERROR,
    `Validation error: ${field} - ${message}`,
    { field, value },
    undefined,
    traceId
  );
}

/**
 * Create timeout error
 */
export function createTimeoutError(
  timeoutMs: number,
  command: string,
  traceId?: string
): ApiError {
  return createError(
    ErrorCode.TIMEOUT,
    `Command timeout after ${timeoutMs}ms: ${command}`,
    { timeoutMs, command },
    `Execution exceeded timeout of ${timeoutMs}ms`,
    traceId
  );
}

/**
 * Create not found error
 */
export function createNotFoundError(
  resource: string,
  id?: string,
  traceId?: string
): ApiError {
  const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
  return createError(
    ErrorCode.NOT_FOUND,
    message,
    { resource, id },
    undefined,
    traceId
  );
}

