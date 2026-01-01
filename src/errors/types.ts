/**
 * CCR Error Types
 * Centralized error definitions with rich context for LLM-friendly error handling
 */

// ═══════════════════════════════════════════════════════════════════
// ERROR CODES - Machine-readable identifiers
// ═══════════════════════════════════════════════════════════════════

export enum ErrorCode {
  // Database errors (1xxx)
  DATABASE_INIT_FAILED = 'DB_1001',
  DATABASE_QUERY_FAILED = 'DB_1002',
  DATABASE_WRITE_FAILED = 'DB_1003',
  DATABASE_TRANSACTION_FAILED = 'DB_1004',
  DATABASE_CONNECTION_LOST = 'DB_1005',
  DATABASE_SCHEMA_ERROR = 'DB_1006',
  DATABASE_CONNECTION_FAILED = 'DB_1007',

  // Memory errors (2xxx)
  MEMORY_SERVICE_NOT_INITIALIZED = 'MEM_2001',
  MEMORY_SAVE_FAILED = 'MEM_2002',
  MEMORY_RECALL_FAILED = 'MEM_2003',
  MEMORY_INVALID_SCOPE = 'MEM_2004',
  MEMORY_MISSING_PROJECT_PATH = 'MEM_2005',
  MEMORY_CONTEXT_BUILD_FAILED = 'MEM_2006',
  MEMORY_CLEANUP_FAILED = 'MEM_2007',
  MEMORY_STORE_FAILED = 'MEM_2008',
  MEMORY_RETRIEVAL_FAILED = 'MEM_2009',
  MEMORY_DELETE_FAILED = 'MEM_2010',
  MEMORY_INIT_FAILED = 'MEM_2011',

  // Embedding errors (3xxx)
  EMBEDDING_PROVIDER_INIT_FAILED = 'EMB_3001',
  EMBEDDING_API_ERROR = 'EMB_3002',
  EMBEDDING_RATE_LIMITED = 'EMB_3003',
  EMBEDDING_INVALID_RESPONSE = 'EMB_3004',
  EMBEDDING_NETWORK_ERROR = 'EMB_3005',
  EMBEDDING_TIMEOUT = 'EMB_3006',
  EMBEDDING_INVALID_INPUT = 'EMB_3007',
  EMBEDDING_INIT_FAILED = 'EMB_3008',
  EMBEDDING_DIMENSION_MISMATCH = 'EMB_3009',

  // Context builder errors (4xxx)
  CONTEXT_BUILD_FAILED = 'CTX_4001',
  CONTEXT_SECTION_FAILED = 'CTX_4002',
  CONTEXT_TOKEN_LIMIT_EXCEEDED = 'CTX_4003',
  CONTEXT_ANALYSIS_FAILED = 'CTX_4004',

  // Sub-agent errors (5xxx)
  SUBAGENT_SPAWN_FAILED = 'SUB_5001',
  SUBAGENT_MAX_DEPTH_EXCEEDED = 'SUB_5002',
  SUBAGENT_EXECUTION_FAILED = 'SUB_5003',
  SUBAGENT_TIMEOUT = 'SUB_5004',
  SUBAGENT_INVALID_TYPE = 'SUB_5005',
  SUBAGENT_API_CALL_FAILED = 'SUB_5006',
  SUBAGENT_STREAM_ERROR = 'SUB_5007',
  SUBAGENT_NETWORK_ERROR = 'SUB_5008',
  SUBAGENT_RATE_LIMITED = 'SUB_5009',

  // Router errors (6xxx)
  ROUTER_CONFIG_INVALID = 'RTR_6001',
  ROUTER_PROVIDER_NOT_FOUND = 'RTR_6002',
  ROUTER_MODEL_NOT_FOUND = 'RTR_6003',
  ROUTER_CUSTOM_ROUTER_FAILED = 'RTR_6004',
  ROUTER_PROJECT_LOOKUP_FAILED = 'RTR_6005',

  // API/Network errors (7xxx)
  API_REQUEST_FAILED = 'API_7001',
  API_RESPONSE_INVALID = 'API_7002',
  API_TIMEOUT = 'API_7003',
  API_RATE_LIMITED = 'API_7004',
  API_AUTH_FAILED = 'API_7005',
  API_NETWORK_ERROR = 'API_7006',

  // Stream errors (8xxx)
  STREAM_PROCESSING_FAILED = 'STR_8001',
  STREAM_PARSE_ERROR = 'STR_8002',
  STREAM_INTERRUPTED = 'STR_8003',
  STREAM_TOOL_EXECUTION_FAILED = 'STR_8004',

  // Config errors (9xxx)
  CONFIG_NOT_FOUND = 'CFG_9001',
  CONFIG_PARSE_ERROR = 'CFG_9002',
  CONFIG_VALIDATION_FAILED = 'CFG_9003',
  CONFIG_MISSING_REQUIRED = 'CFG_9004',

  // Agent errors (10xxx)
  AGENT_TOOL_NOT_FOUND = 'AGT_10001',
  AGENT_TOOL_EXECUTION_FAILED = 'AGT_10002',
  AGENT_HANDLER_ERROR = 'AGT_10003',

  // Generic errors
  UNKNOWN_ERROR = 'ERR_0001',
  VALIDATION_ERROR = 'ERR_0002',
  INTERNAL_ERROR = 'ERR_0003',
}

// ═══════════════════════════════════════════════════════════════════
// ERROR SEVERITY LEVELS
// ═══════════════════════════════════════════════════════════════════

export enum ErrorSeverity {
  /** Recoverable - operation can continue with degraded functionality */
  LOW = 'low',
  /** Significant - operation failed but system remains stable */
  MEDIUM = 'medium',
  /** Critical - operation failed, may affect other operations */
  HIGH = 'high',
  /** Fatal - system cannot continue, requires restart */
  FATAL = 'fatal',
}

// ═══════════════════════════════════════════════════════════════════
// ERROR CONTEXT INTERFACE
// ═══════════════════════════════════════════════════════════════════

export interface ErrorContext {
  /** Operation that was being performed */
  operation: string;
  /** Component/module where error occurred */
  component: string;
  /** Additional details about the error */
  details?: Record<string, any>;
  /** Input that caused the error (sanitized) */
  input?: any;
  /** Timestamp of the error */
  timestamp: number;
  /** Request ID if available */
  requestId?: string;
  /** Session ID if available */
  sessionId?: string;
  /** Project path if available */
  projectPath?: string;
}

// ═══════════════════════════════════════════════════════════════════
// RECOVERY SUGGESTION INTERFACE
// ═══════════════════════════════════════════════════════════════════

export interface RecoverySuggestion {
  /** What action to take */
  action: string;
  /** Why this might help */
  reason: string;
  /** Whether this is automatic or requires user action */
  automatic: boolean;
  /** Priority of this suggestion */
  priority: number;
}

// ═══════════════════════════════════════════════════════════════════
// BASE CCR ERROR CLASS
// ═══════════════════════════════════════════════════════════════════

export class CCRError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly recoverable: boolean;
  public readonly suggestions: RecoverySuggestion[];
  public readonly cause?: Error;
  public readonly timestamp: number;

  constructor(
    message: string,
    options: {
      code: ErrorCode;
      severity?: ErrorSeverity;
      context: Omit<ErrorContext, 'timestamp'>;
      recoverable?: boolean;
      suggestions?: RecoverySuggestion[];
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'CCRError';
    this.code = options.code;
    this.severity = options.severity ?? ErrorSeverity.MEDIUM;
    this.timestamp = Date.now();
    this.context = {
      ...options.context,
      timestamp: this.timestamp,
    };
    this.recoverable = options.recoverable ?? true;
    this.suggestions = options.suggestions ?? [];
    this.cause = options.cause;

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CCRError);
    }
  }

  /**
   * Format error for LLM consumption - rich, actionable error message
   */
  toLLMFormat(): string {
    const parts: string[] = [];

    parts.push(`<error code="${this.code}" severity="${this.severity}">`);
    parts.push(`<message>${this.message}</message>`);

    parts.push(`<context>`);
    parts.push(`  <component>${this.context.component}</component>`);
    parts.push(`  <operation>${this.context.operation}</operation>`);
    if (this.context.details) {
      parts.push(`  <details>${JSON.stringify(this.context.details, null, 2)}</details>`);
    }
    parts.push(`</context>`);

    if (this.suggestions.length > 0) {
      parts.push(`<recovery_suggestions>`);
      for (const suggestion of this.suggestions.sort((a, b) => a.priority - b.priority)) {
        parts.push(`  <suggestion priority="${suggestion.priority}" automatic="${suggestion.automatic}">`);
        parts.push(`    <action>${suggestion.action}</action>`);
        parts.push(`    <reason>${suggestion.reason}</reason>`);
        parts.push(`  </suggestion>`);
      }
      parts.push(`</recovery_suggestions>`);
    }

    if (this.cause) {
      parts.push(`<cause>${this.cause.message}</cause>`);
    }

    parts.push(`<recoverable>${this.recoverable}</recoverable>`);
    parts.push(`</error>`);

    return parts.join('\n');
  }

  /**
   * Format error for logging - structured JSON
   */
  toLogFormat(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      context: this.context,
      recoverable: this.recoverable,
      suggestions: this.suggestions,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack,
      } : undefined,
      stack: this.stack,
      timestamp: this.timestamp,
    };
  }

  /**
   * Format error for user display - concise message
   */
  toUserFormat(): string {
    const recoveryHint = this.suggestions.length > 0
      ? ` Try: ${this.suggestions[0].action}`
      : '';
    return `[${this.code}] ${this.message}${recoveryHint}`;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SPECIALIZED ERROR CLASSES
// ═══════════════════════════════════════════════════════════════════

export class DatabaseError extends CCRError {
  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      operation: string;
      query?: string;
      cause?: Error;
      details?: Record<string, any>;
    }
  ) {
    super(message, {
      code: options.code ?? ErrorCode.DATABASE_QUERY_FAILED,
      severity: ErrorSeverity.HIGH,
      context: {
        component: 'MemoryDatabase',
        operation: options.operation,
        details: {
          ...options.details,
          query: options.query,
        },
      },
      recoverable: true,
      suggestions: [
        {
          action: 'Retry the operation',
          reason: 'Database errors are often transient',
          automatic: true,
          priority: 1,
        },
        {
          action: 'Check database file permissions and disk space',
          reason: 'Database writes may fail due to filesystem issues',
          automatic: false,
          priority: 2,
        },
      ],
      cause: options.cause,
    });
    this.name = 'DatabaseError';
  }
}

export class MemoryError extends CCRError {
  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      operation: string;
      scope?: 'global' | 'project';
      projectPath?: string;
      cause?: Error;
      details?: Record<string, any>;
    }
  ) {
    super(message, {
      code: options.code ?? ErrorCode.MEMORY_SAVE_FAILED,
      severity: ErrorSeverity.MEDIUM,
      context: {
        component: 'MemoryService',
        operation: options.operation,
        projectPath: options.projectPath,
        details: {
          ...options.details,
          scope: options.scope,
        },
      },
      recoverable: true,
      suggestions: [
        {
          action: 'Continue without memory context',
          reason: 'Memory enhancement is optional, core functionality remains available',
          automatic: true,
          priority: 1,
        },
      ],
      cause: options.cause,
    });
    this.name = 'MemoryError';
  }
}

export class EmbeddingError extends CCRError {
  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      provider: string;
      operation: string;
      cause?: Error;
      details?: Record<string, any>;
    }
  ) {
    const suggestions: RecoverySuggestion[] = [];

    if (options.code === ErrorCode.EMBEDDING_RATE_LIMITED) {
      suggestions.push({
        action: 'Wait and retry with exponential backoff',
        reason: 'Rate limiting is temporary',
        automatic: true,
        priority: 1,
      });
    } else if (options.code === ErrorCode.EMBEDDING_API_ERROR) {
      suggestions.push({
        action: 'Use local embedding provider as fallback',
        reason: 'Local embeddings work offline and are free',
        automatic: true,
        priority: 1,
      });
    } else {
      suggestions.push({
        action: 'Skip embedding and use keyword search only',
        reason: 'Keyword search provides degraded but functional memory lookup',
        automatic: true,
        priority: 1,
      });
    }

    super(message, {
      code: options.code ?? ErrorCode.EMBEDDING_API_ERROR,
      severity: ErrorSeverity.MEDIUM,
      context: {
        component: 'EmbeddingProvider',
        operation: options.operation,
        details: {
          ...options.details,
          provider: options.provider,
        },
      },
      recoverable: true,
      suggestions,
      cause: options.cause,
    });
    this.name = 'EmbeddingError';
  }
}

export class ContextBuilderError extends CCRError {
  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      operation: string;
      section?: string;
      phase?: string;
      cause?: Error;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: options.code ?? ErrorCode.CONTEXT_BUILD_FAILED,
      severity: ErrorSeverity.MEDIUM,
      context: {
        component: 'DynamicContextBuilder',
        operation: options.operation,
        details: {
          ...options.details,
          section: options.section,
          phase: options.phase,
        },
      },
      recoverable: true,
      suggestions: [
        {
          action: 'Continue with original system prompt only',
          reason: 'Context enhancement is optional, request can proceed without it',
          automatic: true,
          priority: 1,
        },
      ],
      cause: options.cause,
    });
    this.name = 'ContextBuilderError';
  }
}

export class SubAgentError extends CCRError {
  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      operation: string;
      agentType?: string;
      depth?: number;
      parentRequestId?: string;
      cause?: Error;
      details?: Record<string, unknown>;
    }
  ) {
    const suggestions: RecoverySuggestion[] = [];

    if (options.code === ErrorCode.SUBAGENT_MAX_DEPTH_EXCEEDED) {
      suggestions.push({
        action: 'Handle the task directly without spawning sub-agents',
        reason: 'Maximum nesting depth reached to prevent infinite recursion',
        automatic: false,
        priority: 1,
      });
    } else if (options.code === ErrorCode.SUBAGENT_TIMEOUT) {
      suggestions.push({
        action: 'Retry with a simpler task or increase timeout',
        reason: 'Complex tasks may require more time',
        automatic: false,
        priority: 1,
      });
    } else {
      suggestions.push({
        action: 'Handle the task directly in the main agent',
        reason: 'Sub-agent execution failed, but main agent can attempt the task',
        automatic: false,
        priority: 1,
      });
    }

    super(message, {
      code: options.code ?? ErrorCode.SUBAGENT_EXECUTION_FAILED,
      severity: ErrorSeverity.MEDIUM,
      context: {
        component: 'SubAgentRunner',
        operation: options.operation,
        details: {
          ...options.details,
          agentType: options.agentType,
          depth: options.depth,
          parentRequestId: options.parentRequestId,
        },
      },
      recoverable: true,
      suggestions,
      cause: options.cause,
    });
    this.name = 'SubAgentError';
  }
}

export class RouterError extends CCRError {
  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      operation: string;
      cause?: Error;
      details?: Record<string, any>;
    }
  ) {
    super(message, {
      code: options.code ?? ErrorCode.ROUTER_CONFIG_INVALID,
      severity: ErrorSeverity.HIGH,
      context: {
        component: 'Router',
        operation: options.operation,
        details: options.details,
      },
      recoverable: true,
      suggestions: [
        {
          action: 'Use default routing configuration',
          reason: 'Fallback to default model when routing fails',
          automatic: true,
          priority: 1,
        },
      ],
      cause: options.cause,
    });
    this.name = 'RouterError';
  }
}

export class APIError extends CCRError {
  public readonly statusCode?: number;
  public readonly endpoint?: string;

  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      operation: string;
      statusCode?: number;
      endpoint?: string;
      cause?: Error;
      details?: Record<string, any>;
    }
  ) {
    const suggestions: RecoverySuggestion[] = [];

    if (options.statusCode === 429) {
      suggestions.push({
        action: 'Wait and retry with exponential backoff',
        reason: 'Rate limit exceeded, temporary condition',
        automatic: true,
        priority: 1,
      });
    } else if (options.statusCode === 401 || options.statusCode === 403) {
      suggestions.push({
        action: 'Check API key configuration',
        reason: 'Authentication failed, API key may be invalid or expired',
        automatic: false,
        priority: 1,
      });
    } else if (options.statusCode && options.statusCode >= 500) {
      suggestions.push({
        action: 'Retry the request',
        reason: 'Server error, may be temporary',
        automatic: true,
        priority: 1,
      });
    }

    super(message, {
      code: options.code ?? ErrorCode.API_REQUEST_FAILED,
      severity: options.statusCode && options.statusCode >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
      context: {
        component: 'APIClient',
        operation: options.operation,
        details: {
          ...options.details,
          statusCode: options.statusCode,
          endpoint: options.endpoint,
        },
      },
      recoverable: true,
      suggestions,
      cause: options.cause,
    });
    this.name = 'APIError';
    this.statusCode = options.statusCode;
    this.endpoint = options.endpoint;
  }
}

export class StreamError extends CCRError {
  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      operation: string;
      cause?: Error;
      details?: Record<string, any>;
    }
  ) {
    super(message, {
      code: options.code ?? ErrorCode.STREAM_PROCESSING_FAILED,
      severity: ErrorSeverity.HIGH,
      context: {
        component: 'StreamProcessor',
        operation: options.operation,
        details: options.details,
      },
      recoverable: false,
      suggestions: [
        {
          action: 'Restart the request',
          reason: 'Stream was interrupted, a fresh request may succeed',
          automatic: false,
          priority: 1,
        },
      ],
      cause: options.cause,
    });
    this.name = 'StreamError';
  }
}

export class ConfigError extends CCRError {
  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      operation: string;
      configPath?: string;
      cause?: Error;
      details?: Record<string, any>;
    }
  ) {
    super(message, {
      code: options.code ?? ErrorCode.CONFIG_VALIDATION_FAILED,
      severity: ErrorSeverity.HIGH,
      context: {
        component: 'ConfigLoader',
        operation: options.operation,
        details: {
          ...options.details,
          configPath: options.configPath,
        },
      },
      recoverable: options.code !== ErrorCode.CONFIG_NOT_FOUND,
      suggestions: [
        {
          action: 'Check configuration file syntax and required fields',
          reason: 'Configuration errors prevent proper system initialization',
          automatic: false,
          priority: 1,
        },
      ],
      cause: options.cause,
    });
    this.name = 'ConfigError';
  }
}

export class AgentError extends CCRError {
  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      operation: string;
      agentName?: string;
      toolName?: string;
      cause?: Error;
      details?: Record<string, any>;
    }
  ) {
    super(message, {
      code: options.code ?? ErrorCode.AGENT_TOOL_EXECUTION_FAILED,
      severity: ErrorSeverity.MEDIUM,
      context: {
        component: 'Agent',
        operation: options.operation,
        details: {
          ...options.details,
          agentName: options.agentName,
          toolName: options.toolName,
        },
      },
      recoverable: true,
      suggestions: [
        {
          action: 'Retry the tool call with different parameters',
          reason: 'Tool execution may succeed with adjusted input',
          automatic: false,
          priority: 1,
        },
      ],
      cause: options.cause,
    });
    this.name = 'AgentError';
  }
}
