import type { CCRConfig } from '../config/schema';

export type HookEvent =
  | 'PreToolUse'        // Before tool execution
  | 'PostToolUse'       // After tool execution
  | 'PreRoute'          // Before routing decision (CCR-specific)
  | 'PostRoute'         // After routing decision (CCR-specific)
  | 'SessionStart'      // Session begins
  | 'SessionEnd'        // Session ends
  | 'PreResponse'       // Before sending response
  | 'PostResponse'      // After response sent
  | 'PreCompact'        // Before context compaction
  | 'Notification';     // System notifications

export interface HookRequest {
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  sessionId?: string;
  projectPath?: string;
  url: string;
  method: string;
}

export interface HookResponse {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
}

export interface ToolInput {
  [key: string]: string | number | boolean | null | undefined | Record<string, unknown>;
}

export interface ToolOutput {
  result?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export interface HookContext {
  event: HookEvent;
  request?: HookRequest;
  response?: HookResponse;
  config: CCRConfig;
  sessionId?: string;
  projectPath?: string;
  toolName?: string;
  toolInput?: ToolInput;
  toolOutput?: ToolOutput;
  routeDecision?: string;
  timestamp: number;
}

export interface HookModifications {
  body?: Record<string, unknown>;
  toolOutput?: string;
  response?: Partial<HookResponse>;
}

export interface HookResult {
  continue: boolean;
  modifications?: HookModifications;
  error?: string;
}

export interface HookDefinition {
  name: string;
  event: HookEvent | HookEvent[];
  priority?: number;      // Higher = runs first (default: 0)
  timeout?: number;       // Timeout in ms (default: 5000)
  enabled?: boolean;      // Default: true
  handler: string | HookHandler;  // Path to JS file or inline function
}

export type HookHandler = (context: HookContext) => Promise<HookResult>;

export interface HookConfig {
  enabled: boolean;
  directory?: string;
  timeout?: number;
  hooks?: HookDefinition[];
}
