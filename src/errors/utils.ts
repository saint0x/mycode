/**
 * CCR Error Utilities
 * Helper functions for error handling, wrapping, and formatting
 */

import {
  CCRError,
  ErrorCode,
  ErrorSeverity,
  DatabaseError,
  MemoryError,
  EmbeddingError,
  ContextBuilderError,
  SubAgentError,
  RouterError,
  APIError,
  StreamError,
  ConfigError,
  AgentError,
  type ErrorContext,
  type RecoverySuggestion,
} from './types';

// ═══════════════════════════════════════════════════════════════════
// ERROR WRAPPING UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Wrap any error into a CCRError with context
 */
export function wrapError(
  error: unknown,
  context: Omit<ErrorContext, 'timestamp'>,
  code: ErrorCode = ErrorCode.UNKNOWN_ERROR
): CCRError {
  if (error instanceof CCRError) {
    // Already a CCR error, add additional context
    return new CCRError(error.message, {
      code: error.code,
      severity: error.severity,
      context: {
        ...error.context,
        ...context,
        details: {
          ...error.context.details,
          ...context.details,
        },
      },
      recoverable: error.recoverable,
      suggestions: error.suggestions,
      cause: error.cause,
    });
  }

  const originalError = error instanceof Error ? error : new Error(String(error));

  return new CCRError(originalError.message, {
    code,
    severity: ErrorSeverity.MEDIUM,
    context,
    recoverable: true,
    cause: originalError,
  });
}

/**
 * Create a database error from any error
 */
export function wrapDatabaseError(
  error: unknown,
  operation: string,
  details?: Record<string, any>
): DatabaseError {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  // Detect specific database error types
  let code = ErrorCode.DATABASE_QUERY_FAILED;
  if (message.includes('SQLITE_BUSY') || message.includes('database is locked')) {
    code = ErrorCode.DATABASE_CONNECTION_LOST;
  } else if (message.includes('SQLITE_CORRUPT') || message.includes('malformed')) {
    code = ErrorCode.DATABASE_SCHEMA_ERROR;
  } else if (message.includes('constraint') || message.includes('UNIQUE')) {
    code = ErrorCode.DATABASE_WRITE_FAILED;
  }

  return new DatabaseError(message, {
    code,
    operation,
    cause,
    details,
  });
}

/**
 * Create a memory error from any error
 */
export function wrapMemoryError(
  error: unknown,
  operation: string,
  options?: {
    scope?: 'global' | 'project';
    projectPath?: string;
    details?: Record<string, any>;
  }
): MemoryError {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  return new MemoryError(message, {
    operation,
    scope: options?.scope,
    projectPath: options?.projectPath,
    cause,
    details: options?.details,
  });
}

/**
 * Create an embedding error from any error
 */
export function wrapEmbeddingError(
  error: unknown,
  provider: string,
  operation: string,
  details?: Record<string, any>
): EmbeddingError {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  // Detect specific embedding error types
  let code = ErrorCode.EMBEDDING_API_ERROR;
  if (message.includes('rate') || message.includes('429') || message.includes('quota')) {
    code = ErrorCode.EMBEDDING_RATE_LIMITED;
  } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    code = ErrorCode.EMBEDDING_TIMEOUT;
  } else if (message.includes('network') || message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    code = ErrorCode.EMBEDDING_NETWORK_ERROR;
  }

  return new EmbeddingError(message, {
    code,
    provider,
    operation,
    cause,
    details,
  });
}

/**
 * Create an API error from a fetch response
 */
export function createAPIError(
  response: Response,
  operation: string,
  errorBody?: string
): APIError {
  let code = ErrorCode.API_REQUEST_FAILED;
  if (response.status === 429) {
    code = ErrorCode.API_RATE_LIMITED;
  } else if (response.status === 401 || response.status === 403) {
    code = ErrorCode.API_AUTH_FAILED;
  } else if (response.status >= 500) {
    code = ErrorCode.API_REQUEST_FAILED;
  }

  const message = errorBody || `API request failed with status ${response.status}`;

  return new APIError(message, {
    code,
    operation,
    statusCode: response.status,
    endpoint: response.url,
    details: {
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    },
  });
}

/**
 * Create an API error from a network/fetch failure
 */
export function createNetworkError(
  error: unknown,
  operation: string,
  endpoint?: string
): APIError {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  let code = ErrorCode.API_NETWORK_ERROR;
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    code = ErrorCode.API_TIMEOUT;
  }

  return new APIError(message, {
    code,
    operation,
    endpoint,
    cause,
    details: {
      errorType: cause?.name || 'NetworkError',
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// SAFE EXECUTION UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Result type for safe execution
 */
export type Result<T, E = CCRError> =
  | { success: true; value: T; error?: never }
  | { success: false; value?: never; error: E };

/**
 * Execute a function safely and return a Result
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  context: Omit<ErrorContext, 'timestamp'>,
  code: ErrorCode = ErrorCode.UNKNOWN_ERROR
): Promise<Result<T>> {
  try {
    const value = await fn();
    return { success: true, value };
  } catch (error) {
    return { success: false, error: wrapError(error, context, code) };
  }
}

/**
 * Execute a function safely (sync) and return a Result
 */
export function safeExecuteSync<T>(
  fn: () => T,
  context: Omit<ErrorContext, 'timestamp'>,
  code: ErrorCode = ErrorCode.UNKNOWN_ERROR
): Result<T> {
  try {
    const value = fn();
    return { success: true, value };
  } catch (error) {
    return { success: false, error: wrapError(error, context, code) };
  }
}

/**
 * Execute with fallback value on error
 */
export async function executeWithFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  onError?: (error: CCRError) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const wrapped = error instanceof CCRError
      ? error
      : wrapError(error, { component: 'unknown', operation: 'unknown' });
    onError?.(wrapped);
    return fallback;
  }
}

/**
 * Execute with retry logic
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    delayMs: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number) => void;
  }
): Promise<T> {
  const { maxRetries, delayMs, backoffMultiplier = 2, shouldRetry, onRetry } = options;
  let lastError: unknown;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      if (shouldRetry && !shouldRetry(error, attempt)) {
        break;
      }

      onRetry?.(error, attempt);
      await sleep(currentDelay);
      currentDelay *= backoffMultiplier;
    }
  }

  throw lastError;
}

// ═══════════════════════════════════════════════════════════════════
// ERROR FORMATTING UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Format error for tool result response
 */
export function formatErrorForToolResult(error: unknown): string {
  if (error instanceof CCRError) {
    return error.toLLMFormat();
  }

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return `<error code="ERR_0001" severity="medium">
<message>${message}</message>
<context>
  <component>unknown</component>
  <operation>tool_execution</operation>
</context>
${stack ? `<stack>${stack}</stack>` : ''}
<recoverable>true</recoverable>
</error>`;
}

/**
 * Format error for logging
 */
export function formatErrorForLog(error: unknown): object {
  if (error instanceof CCRError) {
    return error.toLogFormat();
  }

  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: Date.now(),
  };
}

/**
 * Format error for user display
 */
export function formatErrorForUser(error: unknown): string {
  if (error instanceof CCRError) {
    return error.toUserFormat();
  }

  return error instanceof Error ? error.message : String(error);
}

// ═══════════════════════════════════════════════════════════════════
// ERROR CHECKING UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if an error is a specific CCR error code
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  return error instanceof CCRError && error.code === code;
}

/**
 * Check if an error is recoverable
 */
export function isRecoverable(error: unknown): boolean {
  if (error instanceof CCRError) {
    return error.recoverable;
  }
  return true; // Assume unknown errors are recoverable
}

/**
 * Check if an error is rate limiting
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof CCRError) {
    return [
      ErrorCode.EMBEDDING_RATE_LIMITED,
      ErrorCode.API_RATE_LIMITED,
    ].includes(error.code);
  }
  if (error instanceof Error) {
    return error.message.includes('rate') || error.message.includes('429');
  }
  return false;
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof CCRError) {
    return [
      ErrorCode.EMBEDDING_NETWORK_ERROR,
      ErrorCode.API_NETWORK_ERROR,
      ErrorCode.API_TIMEOUT,
      ErrorCode.EMBEDDING_TIMEOUT,
    ].includes(error.code);
  }
  if (error instanceof Error) {
    return (
      error.message.includes('network') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed') ||
      error.message.includes('timeout')
    );
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// ERROR AGGREGATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Aggregate multiple errors into a single error
 */
export function aggregateErrors(
  errors: CCRError[],
  operation: string,
  component: string
): CCRError {
  if (errors.length === 0) {
    throw new Error('Cannot aggregate empty error array');
  }

  if (errors.length === 1) {
    return errors[0];
  }

  const highestSeverity = errors.reduce((max, e) => {
    const severityOrder = {
      [ErrorSeverity.FATAL]: 4,
      [ErrorSeverity.HIGH]: 3,
      [ErrorSeverity.MEDIUM]: 2,
      [ErrorSeverity.LOW]: 1,
    };
    return severityOrder[e.severity] > severityOrder[max] ? e.severity : max;
  }, ErrorSeverity.LOW);

  const allRecoverable = errors.every(e => e.recoverable);

  const allSuggestions = errors.flatMap(e => e.suggestions);
  const uniqueSuggestions = allSuggestions.filter(
    (s, i, arr) => arr.findIndex(x => x.action === s.action) === i
  );

  return new CCRError(
    `Multiple errors occurred during ${operation}: ${errors.map(e => e.message).join('; ')}`,
    {
      code: ErrorCode.INTERNAL_ERROR,
      severity: highestSeverity,
      context: {
        component,
        operation,
        details: {
          errorCount: errors.length,
          errorCodes: errors.map(e => e.code),
          errors: errors.map(e => e.toLogFormat()),
        },
      },
      recoverable: allRecoverable,
      suggestions: uniqueSuggestions.slice(0, 5),
    }
  );
}

// ═══════════════════════════════════════════════════════════════════
// ERROR LOGGING
// ═══════════════════════════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log an error with appropriate level based on severity
 */
export function logError(
  error: CCRError,
  logger?: {
    debug?: (...args: any[]) => void;
    info?: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
  }
): void {
  const logFn = logger ?? console;
  const formatted = error.toLogFormat();

  switch (error.severity) {
    case ErrorSeverity.LOW:
      logFn.info?.(`[${error.code}] ${error.message}`, formatted);
      break;
    case ErrorSeverity.MEDIUM:
      logFn.warn?.(`[${error.code}] ${error.message}`, formatted);
      break;
    case ErrorSeverity.HIGH:
    case ErrorSeverity.FATAL:
      logFn.error?.(`[${error.code}] ${error.message}`, formatted);
      break;
    default:
      logFn.error?.(`[${error.code}] ${error.message}`, formatted);
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure an error is a CCRError
 */
export function ensureCCRError(error: unknown): CCRError {
  if (error instanceof CCRError) {
    return error;
  }
  return wrapError(error, { component: 'unknown', operation: 'unknown' });
}

/**
 * Extract error message safely
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Create a validation error
 */
export function createValidationError(
  field: string,
  message: string,
  component: string
): CCRError {
  return new CCRError(`Validation failed for '${field}': ${message}`, {
    code: ErrorCode.VALIDATION_ERROR,
    severity: ErrorSeverity.MEDIUM,
    context: {
      component,
      operation: 'validation',
      details: { field },
    },
    recoverable: false,
    suggestions: [
      {
        action: `Provide a valid value for '${field}'`,
        reason: message,
        automatic: false,
        priority: 1,
      },
    ],
  });
}
