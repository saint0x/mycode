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

export interface HookContext {
  event: HookEvent;
  request?: any;
  response?: any;
  config: any;
  sessionId?: string;
  projectPath?: string;
  toolName?: string;
  toolInput?: any;
  toolOutput?: any;
  routeDecision?: string;
  timestamp: number;
}

export interface HookResult {
  continue: boolean;      // Whether to continue processing
  modified?: any;         // Modified data to use
  error?: string;         // Error message if hook failed
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
