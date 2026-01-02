/**
 * Context Builder Types
 */

export enum ContextPriority {
  CRITICAL = 100,    // Must include (user preferences, critical context)
  HIGH = 75,         // Important (project architecture, recent decisions)
  MEDIUM = 50,       // Relevant (related memories, patterns)
  LOW = 25,          // Nice to have (older context, tangential info)
  OPTIONAL = 0       // Only if space permits
}

export type ContextCategory = 'memory' | 'project' | 'session' | 'instruction' | 'emphasis' | 'engineering' | 'system';

export interface ContextSection {
  id: string;
  name: string;
  content: string;
  priority: ContextPriority;
  tokenCount: number;
  category: ContextCategory;
  metadata?: Record<string, unknown>;
}

export interface RequestAnalysis {
  taskType: 'code' | 'debug' | 'explain' | 'refactor' | 'test' | 'review' | 'general';
  complexity: 'simple' | 'moderate' | 'complex';
  complexityScore: number;  // 0-100 scale for more nuanced complexity assessment
  requiresMemory: boolean;
  requiresProjectContext: boolean;
  keywords: string[];
  entities: string[];
  explorationRisk: boolean; // High risk of tangential exploration (keywords: go through, explore, tell me about)
  taskCount: number;        // Number of tasks detected in user message (for TodoWrite guidance)
}

export interface ContextBuildResult {
  systemPrompt: string;
  sections: ContextSection[];
  totalTokens: number;
  trimmedSections: ContextSection[];
  analysis: RequestAnalysis;
  /** Non-fatal errors that occurred during context building */
  errors?: string[];
}

export interface BehavioralPatternsConfig {
  antiAloofness?: boolean;       // TodoWrite discipline, focus enforcement
  scopeEnforcement?: boolean;    // Prevent over-engineering
  toolDiscipline?: boolean;      // Use Read/Edit/Write, not bash
  professionalTone?: boolean;    // Objective, concise communication
  taskCompletion?: boolean;      // Progressive verification requirements
}

export interface ContextBuilderConfig {
  maxTokens: number;
  reserveTokensForResponse: number;
  enableMemory: boolean;
  enableProjectContext: boolean;
  enableEmphasis: boolean;
  enableEngineering?: boolean;
  behavioralPatterns?: BehavioralPatternsConfig;  // NEW: Fine-grained behavioral controls
  debugMode: boolean;
}
