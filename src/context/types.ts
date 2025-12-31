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

export type ContextCategory = 'memory' | 'project' | 'session' | 'instruction' | 'emphasis';

export interface ContextSection {
  id: string;
  name: string;
  content: string;
  priority: ContextPriority;
  tokenCount: number;
  category: ContextCategory;
  metadata?: Record<string, any>;
}

export interface RequestAnalysis {
  taskType: 'code' | 'debug' | 'explain' | 'refactor' | 'test' | 'review' | 'general';
  complexity: 'simple' | 'moderate' | 'complex';
  requiresMemory: boolean;
  requiresProjectContext: boolean;
  keywords: string[];
  entities: string[];
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

export interface ContextBuilderConfig {
  maxTokens: number;
  reserveTokensForResponse: number;
  enableMemory: boolean;
  enableProjectContext: boolean;
  enableEmphasis: boolean;
  debugMode: boolean;
}
