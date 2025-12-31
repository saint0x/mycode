/**
 * Error Handling Tests
 * Tests for the centralized error handling system
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  CCRError,
  DatabaseError,
  MemoryError,
  EmbeddingError,
  ContextBuilderError,
  SubAgentError,
  RouterError,
  APIError,
  StreamError,
  ErrorCode,
  ErrorSeverity,
  wrapError,
  wrapDatabaseError,
  wrapMemoryError,
  wrapEmbeddingError,
  createAPIError,
  createNetworkError,
  safeExecute,
  safeExecuteSync,
  executeWithFallback,
  executeWithRetry,
  formatErrorForToolResult,
  formatErrorForLog,
  formatErrorForUser,
  isErrorCode,
  isRecoverable,
  isRateLimitError,
  isNetworkError,
  aggregateErrors,
  getErrorMessage,
  createValidationError,
} from '../src/errors';

describe('Error Types', () => {
  describe('CCRError', () => {
    test('creates error with all properties', () => {
      const error = new CCRError('Test error', {
        code: ErrorCode.INTERNAL_ERROR,
        severity: ErrorSeverity.HIGH,
        context: {
          component: 'test',
          operation: 'test_op',
          details: { key: 'value' },
        },
        recoverable: false,
        suggestions: [
          { action: 'Retry', reason: 'Temporary', automatic: true, priority: 1 },
        ],
      });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoverable).toBe(false);
      expect(error.context.component).toBe('test');
      expect(error.suggestions).toHaveLength(1);
    });

    test('toLLMFormat produces valid XML', () => {
      const error = new CCRError('Test error', {
        code: ErrorCode.DATABASE_INIT_FAILED,
        severity: ErrorSeverity.HIGH,
        context: { component: 'db', operation: 'connect' },
        recoverable: true,
        suggestions: [{ action: 'Check connection', reason: 'DB down', automatic: false, priority: 1 }],
      });

      const llmFormat = error.toLLMFormat();
      expect(llmFormat).toContain('<error');
      expect(llmFormat).toContain('code="DB_1001"');
      expect(llmFormat).toContain('<message>Test error</message>');
      expect(llmFormat).toContain('<component>db</component>');
      expect(llmFormat).toContain('<recoverable>true</recoverable>');
      expect(llmFormat).toContain('<recovery_suggestions>');
    });

    test('toLogFormat produces structured object', () => {
      const error = new CCRError('Test error', {
        code: ErrorCode.MEMORY_SAVE_FAILED,
        severity: ErrorSeverity.MEDIUM,
        context: { component: 'memory', operation: 'store' },
        recoverable: true,
      });

      const logFormat = error.toLogFormat();
      expect(logFormat).toHaveProperty('code');
      expect(logFormat).toHaveProperty('message');
      expect(logFormat).toHaveProperty('severity');
      expect(logFormat).toHaveProperty('context');
      expect(logFormat).toHaveProperty('recoverable');
      expect(logFormat).toHaveProperty('timestamp');
    });

    test('toUserFormat returns formatted message with code', () => {
      const error = new CCRError('Something went wrong: details here', {
        code: ErrorCode.UNKNOWN_ERROR,
        severity: ErrorSeverity.LOW,
        context: { component: 'test', operation: 'test' },
        recoverable: true,
      });

      const userFormat = error.toUserFormat();
      expect(userFormat).toBe('[ERR_0001] Something went wrong: details here');
    });
  });

  describe('DatabaseError', () => {
    test('creates with proper defaults', () => {
      const error = new DatabaseError('DB failed', {
        code: ErrorCode.DATABASE_CONNECTION_LOST,
        operation: 'connect',
      });

      expect(error.code).toBe(ErrorCode.DATABASE_CONNECTION_LOST);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.context.component).toBe('MemoryDatabase');
      expect(error.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('MemoryError', () => {
    test('creates with scope information', () => {
      const error = new MemoryError('Memory failed', {
        code: ErrorCode.MEMORY_SAVE_FAILED,
        operation: 'remember',
        scope: 'project',
        projectPath: '/test/path',
      });

      expect(error.code).toBe(ErrorCode.MEMORY_SAVE_FAILED);
      expect(error.context.details?.scope).toBe('project');
      expect(error.context.projectPath).toBe('/test/path');
    });
  });

  describe('EmbeddingError', () => {
    test('creates with provider information', () => {
      const error = new EmbeddingError('Embedding failed', {
        code: ErrorCode.EMBEDDING_API_ERROR,
        provider: 'openai',
        operation: 'embed',
      });

      expect(error.code).toBe(ErrorCode.EMBEDDING_API_ERROR);
      expect(error.context.details?.provider).toBe('openai');
    });
  });

  describe('SubAgentError', () => {
    test('creates with agent type information', () => {
      const error = new SubAgentError('Sub-agent failed', {
        code: ErrorCode.SUBAGENT_EXECUTION_FAILED,
        operation: 'execute',
        agentType: 'research',
        parentRequestId: 'req-123',
      });

      expect(error.code).toBe(ErrorCode.SUBAGENT_EXECUTION_FAILED);
      expect(error.context.details?.agentType).toBe('research');
    });
  });
});

describe('Error Wrapping', () => {
  test('wrapError preserves CCRError', () => {
    const original = new CCRError('Original', {
      code: ErrorCode.INTERNAL_ERROR,
      severity: ErrorSeverity.HIGH,
      context: { component: 'test', operation: 'test' },
      recoverable: false,
    });

    const wrapped = wrapError(original, { component: 'wrapper', operation: 'wrap' });

    expect(wrapped.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(wrapped.message).toBe('Original');
  });

  test('wrapError wraps plain Error', () => {
    const original = new Error('Plain error');
    const wrapped = wrapError(original, { component: 'test', operation: 'test' });

    expect(wrapped).toBeInstanceOf(CCRError);
    expect(wrapped.message).toBe('Plain error');
    expect(wrapped.cause).toBe(original);
  });

  test('wrapDatabaseError detects SQLITE_BUSY', () => {
    const sqliteError = new Error('SQLITE_BUSY: database is locked');
    const wrapped = wrapDatabaseError(sqliteError, 'write');

    expect(wrapped.code).toBe(ErrorCode.DATABASE_CONNECTION_LOST);
  });

  test('wrapEmbeddingError detects rate limiting', () => {
    const rateError = new Error('Error 429: rate limit exceeded');
    const wrapped = wrapEmbeddingError(rateError, 'openai', 'embed');

    expect(wrapped.code).toBe(ErrorCode.EMBEDDING_RATE_LIMITED);
  });

  test('wrapEmbeddingError detects network errors', () => {
    const networkError = new Error('fetch failed: ECONNREFUSED');
    const wrapped = wrapEmbeddingError(networkError, 'ollama', 'embed');

    expect(wrapped.code).toBe(ErrorCode.EMBEDDING_NETWORK_ERROR);
  });
});

describe('Safe Execution', () => {
  test('safeExecute returns success for successful function', async () => {
    const result = await safeExecute(
      async () => 'success',
      { component: 'test', operation: 'test' }
    );

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.error).toBeUndefined();
  });

  test('safeExecute returns error for failed function', async () => {
    const result = await safeExecute(
      async () => { throw new Error('Failed'); },
      { component: 'test', operation: 'test' }
    );

    expect(result.success).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.error).toBeInstanceOf(CCRError);
  });

  test('safeExecuteSync works synchronously', () => {
    const success = safeExecuteSync(
      () => 42,
      { component: 'test', operation: 'test' }
    );
    expect(success.success).toBe(true);
    expect(success.value).toBe(42);

    const failure = safeExecuteSync(
      () => { throw new Error('Sync fail'); },
      { component: 'test', operation: 'test' }
    );
    expect(failure.success).toBe(false);
  });

  test('executeWithFallback returns fallback on error', async () => {
    const result = await executeWithFallback(
      async () => { throw new Error('Failed'); },
      'fallback'
    );

    expect(result).toBe('fallback');
  });

  test('executeWithRetry retries on failure', async () => {
    let attempts = 0;

    const result = await executeWithRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('Not yet');
        return 'success';
      },
      {
        maxRetries: 5,
        delayMs: 10,
        backoffMultiplier: 1,
      }
    );

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  test('executeWithRetry respects shouldRetry', async () => {
    let attempts = 0;

    try {
      await executeWithRetry(
        async () => {
          attempts++;
          throw new Error('Fatal error');
        },
        {
          maxRetries: 5,
          delayMs: 10,
          shouldRetry: (error) => !error.message.includes('Fatal'),
        }
      );
    } catch (error) {
      // Expected to throw
    }

    expect(attempts).toBe(1);
  });
});

describe('Error Checking', () => {
  test('isErrorCode correctly identifies codes', () => {
    const dbError = new DatabaseError('DB error', {
      code: ErrorCode.DATABASE_CONNECTION_LOST,
      operation: 'connect',
    });

    expect(isErrorCode(dbError, ErrorCode.DATABASE_CONNECTION_LOST)).toBe(true);
    expect(isErrorCode(dbError, ErrorCode.MEMORY_SAVE_FAILED)).toBe(false);
    expect(isErrorCode(new Error('Plain'), ErrorCode.UNKNOWN_ERROR)).toBe(false);
  });

  test('isRecoverable works correctly', () => {
    const recoverable = new CCRError('Recoverable', {
      code: ErrorCode.INTERNAL_ERROR,
      severity: ErrorSeverity.LOW,
      context: { component: 'test', operation: 'test' },
      recoverable: true,
    });

    const notRecoverable = new CCRError('Not recoverable', {
      code: ErrorCode.INTERNAL_ERROR,
      severity: ErrorSeverity.FATAL,
      context: { component: 'test', operation: 'test' },
      recoverable: false,
    });

    expect(isRecoverable(recoverable)).toBe(true);
    expect(isRecoverable(notRecoverable)).toBe(false);
    expect(isRecoverable(new Error('Plain'))).toBe(true);
  });

  test('isRateLimitError detects rate limiting', () => {
    const rateLimitError = new EmbeddingError('Rate limited', {
      code: ErrorCode.EMBEDDING_RATE_LIMITED,
      provider: 'openai',
      operation: 'embed',
    });

    const plainRate = new Error('Error 429 too many requests');

    expect(isRateLimitError(rateLimitError)).toBe(true);
    expect(isRateLimitError(plainRate)).toBe(true);
    expect(isRateLimitError(new Error('Other error'))).toBe(false);
  });

  test('isNetworkError detects network issues', () => {
    const networkError = new EmbeddingError('Network failed', {
      code: ErrorCode.EMBEDDING_NETWORK_ERROR,
      provider: 'ollama',
      operation: 'embed',
    });

    const plainNetwork = new Error('ECONNREFUSED');

    expect(isNetworkError(networkError)).toBe(true);
    expect(isNetworkError(plainNetwork)).toBe(true);
    expect(isNetworkError(new Error('Other error'))).toBe(false);
  });
});

describe('Error Formatting', () => {
  test('formatErrorForToolResult produces XML for CCRError', () => {
    const error = new CCRError('Test', {
      code: ErrorCode.INTERNAL_ERROR,
      severity: ErrorSeverity.MEDIUM,
      context: { component: 'test', operation: 'test' },
      recoverable: true,
    });

    const formatted = formatErrorForToolResult(error);
    expect(formatted).toContain('<error');
    expect(formatted).toContain('</error>');
  });

  test('formatErrorForToolResult handles plain errors', () => {
    const error = new Error('Plain error');
    const formatted = formatErrorForToolResult(error);

    expect(formatted).toContain('<error');
    expect(formatted).toContain('Plain error');
  });

  test('formatErrorForLog produces structured output', () => {
    const error = new CCRError('Test', {
      code: ErrorCode.INTERNAL_ERROR,
      severity: ErrorSeverity.MEDIUM,
      context: { component: 'test', operation: 'test' },
      recoverable: true,
    });

    const formatted = formatErrorForLog(error);
    expect(formatted).toHaveProperty('code');
    expect(formatted).toHaveProperty('message');
    expect(formatted).toHaveProperty('timestamp');
  });

  test('formatErrorForUser returns formatted message', () => {
    const error = new CCRError('User-friendly message', {
      code: ErrorCode.INTERNAL_ERROR,
      severity: ErrorSeverity.LOW,
      context: { component: 'test', operation: 'test' },
      recoverable: true,
    });

    expect(formatErrorForUser(error)).toBe('[ERR_0003] User-friendly message');
    expect(formatErrorForUser(new Error('Plain'))).toBe('Plain');
    expect(formatErrorForUser('String error')).toBe('String error');
  });
});

describe('Error Aggregation', () => {
  test('aggregateErrors combines multiple errors', () => {
    const errors = [
      new CCRError('Error 1', {
        code: ErrorCode.MEMORY_SAVE_FAILED,
        severity: ErrorSeverity.LOW,
        context: { component: 'memory', operation: 'store' },
        recoverable: true,
        suggestions: [{ action: 'Retry', reason: 'Temp', automatic: true, priority: 1 }],
      }),
      new CCRError('Error 2', {
        code: ErrorCode.MEMORY_RECALL_FAILED,
        severity: ErrorSeverity.HIGH,
        context: { component: 'memory', operation: 'retrieve' },
        recoverable: false,
        suggestions: [{ action: 'Check DB', reason: 'DB issue', automatic: false, priority: 2 }],
      }),
    ];

    const aggregated = aggregateErrors(errors, 'batch_operation', 'memory');

    expect(aggregated.message).toContain('Multiple errors');
    expect(aggregated.message).toContain('Error 1');
    expect(aggregated.message).toContain('Error 2');
    expect(aggregated.severity).toBe(ErrorSeverity.HIGH);
    expect(aggregated.recoverable).toBe(false);
  });

  test('aggregateErrors returns single error unchanged', () => {
    const single = new CCRError('Single', {
      code: ErrorCode.INTERNAL_ERROR,
      severity: ErrorSeverity.MEDIUM,
      context: { component: 'test', operation: 'test' },
      recoverable: true,
    });

    const aggregated = aggregateErrors([single], 'op', 'comp');
    expect(aggregated).toBe(single);
  });

  test('aggregateErrors throws on empty array', () => {
    expect(() => aggregateErrors([], 'op', 'comp')).toThrow();
  });
});

describe('Helper Functions', () => {
  test('getErrorMessage extracts message from various types', () => {
    expect(getErrorMessage(new Error('Test'))).toBe('Test');
    expect(getErrorMessage('String error')).toBe('String error');
    expect(getErrorMessage({ message: 'Object' })).toBe('[object Object]');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  test('createValidationError creates proper error', () => {
    const error = createValidationError('email', 'Must be valid email', 'form');

    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.message).toContain('email');
    expect(error.message).toContain('Must be valid email');
    expect(error.recoverable).toBe(false);
    expect(error.suggestions).toHaveLength(1);
  });
});

describe('API Error Creation', () => {
  test('createAPIError handles 429 status', () => {
    const mockResponse = {
      status: 429,
      statusText: 'Too Many Requests',
      url: 'https://api.example.com/test',
      headers: new Headers({ 'retry-after': '60' }),
    } as Response;

    const error = createAPIError(mockResponse, 'api_call');
    expect(error.code).toBe(ErrorCode.API_RATE_LIMITED);
  });

  test('createAPIError handles 401/403 status', () => {
    const mockResponse = {
      status: 401,
      statusText: 'Unauthorized',
      url: 'https://api.example.com/test',
      headers: new Headers(),
    } as Response;

    const error = createAPIError(mockResponse, 'api_call');
    expect(error.code).toBe(ErrorCode.API_AUTH_FAILED);
  });

  test('createNetworkError detects timeout', () => {
    const timeoutError = new Error('Request timeout exceeded');
    const error = createNetworkError(timeoutError, 'fetch', 'https://api.example.com');

    expect(error.code).toBe(ErrorCode.API_TIMEOUT);
  });
});
