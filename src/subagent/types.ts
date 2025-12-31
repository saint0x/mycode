/**
 * Sub-Agent Types
 * Type definitions for the sub-agent spawning system
 */

import type { Memory } from '../memory/types';
import type { ErrorCode } from '../errors';

// Sub-agent types
export type SubAgentType = 'research' | 'code' | 'review' | 'custom';

// Sub-agent configuration
export interface SubAgentConfig {
  type: SubAgentType;
  systemPrompt: string;
  maxTokens: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  model?: string;  // Override model selection
}

// Context passed from parent to sub-agent
export interface SubAgentContext {
  sessionId: string;
  projectPath?: string;
  depth: number;          // Current nesting depth
  parentRequestId?: string;
  config: any;            // Router config
  memories?: {
    global: Memory[];
    project: Memory[];
  };
}

// Input schema for spawn_subagent tool
export interface SpawnSubAgentInput {
  type: SubAgentType;
  task: string;           // Task description for the sub-agent
  context?: string;       // Additional context to provide
  streamProgress?: boolean;  // Whether to stream progress back
  maxTokens?: number;     // Override max tokens
  model?: string;         // Override model
}

// Result from sub-agent execution
export interface SubAgentResult {
  success: boolean;
  output: string;         // The sub-agent's final response
  summary?: string;       // Brief summary of what was done
  error?: string;         // Error message if failed
  errorCode?: ErrorCode;  // Structured error code for LLM consumption
  metadata: SubAgentResultMetadata;
}

export interface SubAgentResultMetadata {
  subAgentId: string;
  type: SubAgentType;
  task: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  depth: number;
  toolCalls?: number;
}

// Events for streaming progress
export type SubAgentStreamEventType =
  | 'start'
  | 'content'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'error'
  | 'complete';

export interface SubAgentStreamEvent {
  type: SubAgentStreamEventType;
  subAgentId: string;
  timestamp: number;
  data: SubAgentStreamEventData;
}

export type SubAgentStreamEventData =
  | SubAgentStartEvent
  | SubAgentContentEvent
  | SubAgentToolUseEvent
  | SubAgentToolResultEvent
  | SubAgentThinkingEvent
  | SubAgentErrorEvent
  | SubAgentCompleteEvent;

export interface SubAgentStartEvent {
  type: 'start';
  task: string;
  agentType: SubAgentType;
}

export interface SubAgentContentEvent {
  type: 'content';
  text: string;
  accumulated: string;
}

export interface SubAgentToolUseEvent {
  type: 'tool_use';
  toolName: string;
  toolId: string;
  input: any;
}

export interface SubAgentToolResultEvent {
  type: 'tool_result';
  toolId: string;
  output: string;
  isError: boolean;
}

export interface SubAgentThinkingEvent {
  type: 'thinking';
  text: string;
}

export interface SubAgentErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}

export interface SubAgentCompleteEvent {
  type: 'complete';
  result: SubAgentResult;
}

// Progress callback type
export type SubAgentProgressCallback = (event: SubAgentStreamEvent) => void;

// Configuration for the sub-agent system
export interface SubAgentSystemConfig {
  enabled: boolean;
  maxDepth: number;        // Maximum nesting depth (default: 3)
  inheritMemory: boolean;  // Whether sub-agents inherit memory context
  defaultTimeout: number;  // Default timeout in ms
  allowedTypes: SubAgentType[];  // Which sub-agent types are enabled
}
