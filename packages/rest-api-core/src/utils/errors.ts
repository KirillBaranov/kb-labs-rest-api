/**
 * @module @kb-labs/rest-api-core/utils/errors
 * Error codes and factory functions
 */

/**
 * Error codes enum
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  JOB_TIMEOUT = 'JOB_TIMEOUT',
  AUDIT_TOOL_ERROR = 'AUDIT_TOOL_ERROR',
  RELEASE_TOOL_ERROR = 'RELEASE_TOOL_ERROR',
  DEVLINK_TOOL_ERROR = 'DEVLINK_TOOL_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
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

  // Generic errors
  if (exitCode === 127) {
    // Command not found
    return ErrorCode.INTERNAL_ERROR;
  }

  // Default to tool error
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
}

/**
 * Create error from code and message
 */
export function createError(
  code: ErrorCode | string,
  message: string,
  details?: Record<string, unknown>,
  cause?: string
): ApiError {
  return {
    code,
    message,
    details,
    cause,
  };
}

/**
 * Create validation error
 */
export function createValidationError(
  field: string,
  message: string,
  value?: unknown
): ApiError {
  return createError(
    ErrorCode.VALIDATION_ERROR,
    `Validation error: ${field} - ${message}`,
    { field, value }
  );
}

