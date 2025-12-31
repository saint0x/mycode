/**
 * Memory System Types
 * Stoar-compatible schema for persistent memory storage
 */

// Memory categories for classification
export type MemoryCategory =
  | 'preference'      // User preferences (global)
  | 'pattern'         // Code patterns, conventions
  | 'knowledge'       // Domain knowledge
  | 'decision'        // Architectural decisions
  | 'architecture'    // Project architecture
  | 'context'         // Project context
  | 'code'            // Code-specific knowledge
  | 'error'           // Past errors and solutions
  | 'workflow';       // Workflow preferences

export type MemoryScope = 'global' | 'project';

// Base memory interface
export interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  scope: MemoryScope;
  projectPath?: string;        // Required for project scope
  importance: number;          // 0.0 - 1.0
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt?: number;
  metadata: MemoryMetadata;
}

export interface MemoryMetadata {
  source?: string;             // Where this memory came from
  tags?: string[];             // Searchable tags
  relatedFiles?: string[];     // Related files
  sessionId?: string;          // Session that created this
  expiresAt?: number;          // Optional TTL
}

// Search result with relevance scoring
export interface MemorySearchResult {
  memory: Memory;
  score: number;               // Relevance score 0.0 - 1.0
  matchType: 'vector' | 'keyword' | 'hybrid';
}

// Embedding provider interface
export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

// Memory configuration
export interface MemoryConfig {
  enabled: boolean;
  dbPath: string;
  embedding: {
    provider: 'openai' | 'ollama' | 'local';
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  autoInject: {
    global: boolean;
    project: boolean;
    maxMemories: number;
    maxTokens: number;
  };
  autoExtract: boolean;
  retention: {
    minImportance: number;
    maxAgeDays: number;
    cleanupIntervalMs: number;
  };
  debugMode?: boolean;
}

// Stoar-compatible collection item (for serialization)
export interface StoarMemoryRecord {
  id: string;
  content: string;
  category: MemoryCategory;
  scope: MemoryScope;
  projectPath?: string;
  importance: number;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt?: number;
  metadata: MemoryMetadata;
  embeddingKey?: string;       // Reference to __objects blob
}

// Blob metadata (stoar __objects format)
export interface BlobMeta {
  key: string;
  mimeType?: string;
  size: number;
  hash?: string;
  createdAt: number;
  updatedAt: number;
}
