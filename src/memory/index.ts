/**
 * Memory Service
 * Core service for storing, retrieving, and searching memories
 */

import { v4 as uuid } from 'uuid';
import { MemoryDatabase } from './database';
import { createEmbeddingProvider, cosineSimilarity } from './embedding';
import type {
  Memory,
  MemoryCategory,
  MemorySearchResult,
  MemoryConfig,
  EmbeddingProvider,
} from './types';
import {
  MemoryError,
  ErrorCode,
  wrapMemoryError,
  type CCRError,
} from '../errors';

export class MemoryService {
  private db: MemoryDatabase;
  private embedder: EmbeddingProvider;
  private config: MemoryConfig;
  private initError: CCRError | null = null;

  constructor(config: MemoryConfig) {
    this.config = config;

    try {
      this.db = MemoryDatabase.getInstance(config.dbPath);
    } catch (error) {
      this.initError = wrapMemoryError(error, 'init_database', {
        details: { dbPath: config.dbPath },
      });
      throw this.initError;
    }

    try {
      this.embedder = createEmbeddingProvider(config.embedding);
    } catch (error) {
      this.initError = wrapMemoryError(error, 'init_embedding_provider', {
        details: { provider: config.embedding.provider },
      });
      throw this.initError;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // REMEMBER - Store new memories
  // ═══════════════════════════════════════════════════════════════════

  async remember(
    content: string,
    options: {
      scope: 'global' | 'project';
      projectPath?: string;
      category: MemoryCategory;
      importance?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<Memory> {
    // Validate input
    if (!content || content.trim().length === 0) {
      throw new MemoryError('Cannot store empty memory content', {
        code: ErrorCode.MEMORY_STORE_FAILED,
        operation: 'remember',
        scope: options.scope,
        projectPath: options.projectPath,
      });
    }

    if (options.scope === 'project' && !options.projectPath) {
      throw new MemoryError('projectPath is required for project-scoped memories', {
        code: ErrorCode.MEMORY_STORE_FAILED,
        operation: 'remember',
        scope: options.scope,
        details: { category: options.category },
      });
    }

    let embedding: Float32Array;
    try {
      embedding = await this.embedder.embed(content);
    } catch (error) {
      throw new MemoryError(
        `Failed to generate embedding for memory: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: ErrorCode.MEMORY_STORE_FAILED,
          operation: 'remember_embedding',
          scope: options.scope,
          projectPath: options.projectPath,
          cause: error instanceof Error ? error : undefined,
          details: { contentLength: content.length, category: options.category },
        }
      );
    }

    const now = Date.now();
    const memory: Memory = {
      id: uuid(),
      content,
      category: options.category,
      scope: options.scope,
      projectPath: options.projectPath,
      importance: options.importance ?? this.calculateImportance(content, options.category),
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      metadata: options.metadata ?? {},
    };

    try {
      // Save memory and embedding in transaction
      this.db.transaction(() => {
        if (options.scope === 'global') {
          this.db.saveGlobalMemory(memory);
        } else {
          this.db.saveProjectMemory(memory);
        }
        this.db.writeEmbedding(memory.id, embedding);
      });
    } catch (error) {
      throw new MemoryError(
        `Failed to store memory: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: ErrorCode.MEMORY_STORE_FAILED,
          operation: 'remember_save',
          scope: options.scope,
          projectPath: options.projectPath,
          cause: error instanceof Error ? error : undefined,
          details: { memoryId: memory.id, category: options.category },
        }
      );
    }

    return memory;
  }

  // ═══════════════════════════════════════════════════════════════════
  // RECALL - Search and retrieve memories
  // ═══════════════════════════════════════════════════════════════════

  async recall(
    query: string,
    options: {
      scope: 'global' | 'project' | 'both';
      projectPath?: string;
      categories?: MemoryCategory[];
      limit?: number;
      minScore?: number;
    }
  ): Promise<MemorySearchResult[]> {
    if (!query || query.trim().length === 0) {
      // Return empty results for empty query instead of throwing
      return [];
    }

    const limit = options.limit ?? 10;
    const minScore = options.minScore ?? 0.3;
    const results: MemorySearchResult[] = [];
    const errors: string[] = [];

    // Get query embedding
    let queryEmbedding: Float32Array;
    try {
      queryEmbedding = await this.embedder.embed(query);
    } catch (error) {
      throw new MemoryError(
        `Failed to generate embedding for query: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: ErrorCode.MEMORY_RETRIEVAL_FAILED,
          operation: 'recall_embedding',
          scope: options.scope === 'both' ? undefined : options.scope,
          projectPath: options.projectPath,
          cause: error instanceof Error ? error : undefined,
          details: { queryLength: query.length },
        }
      );
    }

    // Search global memories
    if (options.scope === 'global' || options.scope === 'both') {
      try {
        const globalResults = this.searchMemories(
          queryEmbedding,
          query,
          this.db.getAllGlobalMemories(),
          this.db.getAllGlobalEmbeddings(),
          limit
        );
        results.push(...globalResults);
      } catch (error) {
        errors.push(`global: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Search project memories
    if ((options.scope === 'project' || options.scope === 'both') && options.projectPath) {
      try {
        const projectResults = this.searchMemories(
          queryEmbedding,
          query,
          this.db.getProjectMemoriesByPath(options.projectPath),
          this.db.getAllProjectEmbeddings(options.projectPath),
          limit
        );
        results.push(...projectResults);
      } catch (error) {
        errors.push(`project: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Log errors but return partial results
    if (errors.length > 0) {
      console.warn('[MemoryService] Partial recall errors:', errors);
    }

    // Filter by categories
    let filtered = results;
    if (options.categories?.length) {
      filtered = results.filter(r => options.categories!.includes(r.memory.category));
    }

    // Filter by score and sort
    return filtered
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private searchMemories(
    queryEmbedding: Float32Array,
    queryText: string,
    memories: Memory[],
    embeddings: { id: string; embedding: Float32Array }[],
    limit: number
  ): MemorySearchResult[] {
    const embeddingMap = new Map(embeddings.map(e => [e.id, e.embedding]));
    const memoryMap = new Map(memories.map(m => [m.id, m]));
    const scores = new Map<string, { vector: number; keyword: number }>();

    // Vector search
    for (const { id, embedding } of embeddings) {
      const score = cosineSimilarity(queryEmbedding, embedding);
      scores.set(id, { vector: score, keyword: 0 });
    }

    // Keyword search
    const keywords = queryText.toLowerCase().split(/\s+/).filter(k => k.length > 2);
    for (const memory of memories) {
      const content = memory.content.toLowerCase();
      const matchCount = keywords.filter(k => content.includes(k)).length;
      const keywordScore = keywords.length > 0 ? matchCount / keywords.length : 0;

      const existing = scores.get(memory.id);
      if (existing) {
        existing.keyword = keywordScore;
      } else {
        scores.set(memory.id, { vector: 0, keyword: keywordScore });
      }
    }

    // Combine scores and build results
    const results: MemorySearchResult[] = [];
    for (const [id, { vector, keyword }] of scores) {
      const memory = memoryMap.get(id);
      if (!memory) continue;

      // Hybrid score: weighted combination
      const hybridScore = vector * 0.7 + keyword * 0.3;

      results.push({
        memory,
        score: hybridScore,
        matchType: vector > 0 && keyword > 0 ? 'hybrid' : vector > 0 ? 'vector' : 'keyword',
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ═══════════════════════════════════════════════════════════════════
  // GET CONTEXT FOR REQUEST - Dynamic context building
  // ═══════════════════════════════════════════════════════════════════

  async getContextForRequest(
    request: {
      messages: any[];
      projectPath?: string;
    },
    options?: {
      maxGlobalMemories?: number;
      maxProjectMemories?: number;
    }
  ): Promise<{
    globalMemories: Memory[];
    projectMemories: Memory[];
    errors?: string[];
  }> {
    const maxGlobal = options?.maxGlobalMemories ?? this.config.autoInject.maxMemories;
    const maxProject = options?.maxProjectMemories ?? this.config.autoInject.maxMemories;
    const errors: string[] = [];

    // Extract query context from recent messages safely
    let queryContext = '';
    try {
      const recentMessages = request.messages?.slice(-5) ?? [];
      queryContext = recentMessages
        .filter((m: any) => m?.role === 'user')
        .map((m: any) => (typeof m?.content === 'string' ? m.content : ''))
        .join(' ')
        .trim();
    } catch (error) {
      errors.push(`Failed to extract query context: ${error instanceof Error ? error.message : String(error)}`);
    }

    let globalMemories: Memory[] = [];
    let projectMemories: Memory[] = [];

    // Fetch global memories
    if (queryContext && this.config.autoInject.global) {
      try {
        const globalResults = await this.recall(queryContext, {
          scope: 'global',
          limit: maxGlobal,
        });
        globalMemories = globalResults.map(r => r.memory);

        // Also include high-importance memories
        try {
          const allGlobal = this.db.getAllGlobalMemories();
          const topGlobalIds = new Set(globalMemories.map(m => m.id));
          for (const m of allGlobal) {
            if (!topGlobalIds.has(m.id) && m.importance >= 0.8 && globalMemories.length < maxGlobal) {
              globalMemories.push(m);
            }
          }
        } catch (error) {
          errors.push(`Failed to fetch high-importance global memories: ${error instanceof Error ? error.message : String(error)}`);
        }
      } catch (error) {
        errors.push(`Failed to recall global memories: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Fetch project memories
    if (queryContext && this.config.autoInject.project && request.projectPath) {
      try {
        const projectResults = await this.recall(queryContext, {
          scope: 'project',
          projectPath: request.projectPath,
          limit: maxProject,
        });
        projectMemories = projectResults.map(r => r.memory);

        // Also include high-importance project memories
        try {
          const allProject = this.db.getProjectMemoriesByPath(request.projectPath);
          const topProjectIds = new Set(projectMemories.map(m => m.id));
          for (const m of allProject) {
            if (!topProjectIds.has(m.id) && m.importance >= 0.8 && projectMemories.length < maxProject) {
              projectMemories.push(m);
            }
          }
        } catch (error) {
          errors.push(`Failed to fetch high-importance project memories: ${error instanceof Error ? error.message : String(error)}`);
        }
      } catch (error) {
        errors.push(`Failed to recall project memories: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Touch accessed memories (non-critical, don't fail on errors)
    for (const m of globalMemories) {
      try {
        this.db.touchMemory(m.id, 'global');
      } catch (error) {
        // Silent failure for touch - non-critical operation
      }
    }
    for (const m of projectMemories) {
      try {
        this.db.touchMemory(m.id, 'project');
      } catch (error) {
        // Silent failure for touch - non-critical operation
      }
    }

    // Log errors if any
    if (errors.length > 0) {
      console.warn('[MemoryService] Context retrieval errors:', errors);
    }

    return {
      globalMemories,
      projectMemories,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // DIRECT ACCESS
  // ═══════════════════════════════════════════════════════════════════

  getGlobalMemory(id: string): Memory | null {
    try {
      return this.db.getGlobalMemory(id);
    } catch (error) {
      throw wrapMemoryError(error, 'get_global_memory', {
        scope: 'global',
        details: { memoryId: id },
      });
    }
  }

  getProjectMemory(id: string): Memory | null {
    try {
      return this.db.getProjectMemory(id);
    } catch (error) {
      throw wrapMemoryError(error, 'get_project_memory', {
        scope: 'project',
        details: { memoryId: id },
      });
    }
  }

  getAllGlobalMemories(): Memory[] {
    try {
      return this.db.getAllGlobalMemories();
    } catch (error) {
      throw wrapMemoryError(error, 'get_all_global_memories', {
        scope: 'global',
      });
    }
  }

  getAllProjectMemories(projectPath: string): Memory[] {
    try {
      return this.db.getProjectMemoriesByPath(projectPath);
    } catch (error) {
      throw wrapMemoryError(error, 'get_all_project_memories', {
        scope: 'project',
        projectPath,
      });
    }
  }

  deleteMemory(id: string, scope: 'global' | 'project'): void {
    try {
      if (scope === 'global') {
        this.db.deleteGlobalMemory(id);
      } else {
        this.db.deleteProjectMemory(id);
      }
    } catch (error) {
      throw new MemoryError(
        `Failed to delete ${scope} memory: ${id}`,
        {
          code: ErrorCode.MEMORY_DELETE_FAILED,
          operation: 'delete_memory',
          scope,
          cause: error instanceof Error ? error : undefined,
          details: { memoryId: id },
        }
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // MAINTENANCE
  // ═══════════════════════════════════════════════════════════════════

  cleanup(): number {
    try {
      return this.db.cleanup(
        this.config.retention.minImportance,
        this.config.retention.maxAgeDays
      );
    } catch (error) {
      throw wrapMemoryError(error, 'cleanup', {
        details: {
          minImportance: this.config.retention.minImportance,
          maxAgeDays: this.config.retention.maxAgeDays,
        },
      });
    }
  }

  getStats(): {
    globalCount: number;
    projectCount: number;
    instanceId: string;
    error?: string;
  } {
    try {
      return {
        globalCount: this.db.countGlobalMemories(),
        projectCount: this.db.countProjectMemories(),
        instanceId: this.db.instanceId(),
      };
    } catch (error) {
      // Return partial stats with error info
      console.error('[MemoryService] Failed to get stats:', error);
      return {
        globalCount: -1,
        projectCount: -1,
        instanceId: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private calculateImportance(content: string, category: MemoryCategory): number {
    const categoryWeights: Record<MemoryCategory, number> = {
      preference: 0.8,
      decision: 0.7,
      architecture: 0.7,
      pattern: 0.6,
      workflow: 0.6,
      knowledge: 0.5,
      error: 0.5,
      context: 0.4,
      code: 0.4,
    };

    let importance = categoryWeights[category] ?? 0.5;
    const lower = content.toLowerCase();

    // Boost for explicit importance markers
    if (lower.includes('important')) importance += 0.1;
    if (lower.includes('always')) importance += 0.1;
    if (lower.includes('never')) importance += 0.1;
    if (lower.includes('prefer')) importance += 0.05;
    if (lower.includes('critical')) importance += 0.15;

    return Math.min(1.0, importance);
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

let memoryService: MemoryService | null = null;
let initializationError: CCRError | null = null;

export function initMemoryService(config: MemoryConfig): MemoryService {
  try {
    memoryService = new MemoryService(config);
    initializationError = null;
    return memoryService;
  } catch (error) {
    initializationError = error instanceof MemoryError
      ? error
      : wrapMemoryError(error, 'init_memory_service', {
          details: { dbPath: config.dbPath, provider: config.embedding.provider },
        });
    memoryService = null;
    throw initializationError;
  }
}

export function getMemoryService(): MemoryService {
  if (!memoryService) {
    if (initializationError) {
      throw new MemoryError(
        `MemoryService initialization failed: ${initializationError.message}`,
        {
          code: ErrorCode.MEMORY_INIT_FAILED,
          operation: 'get_memory_service',
          cause: initializationError,
        }
      );
    }
    throw new MemoryError(
      'MemoryService not initialized. Call initMemoryService first.',
      {
        code: ErrorCode.MEMORY_INIT_FAILED,
        operation: 'get_memory_service',
      }
    );
  }
  return memoryService;
}

export function hasMemoryService(): boolean {
  return memoryService !== null;
}

export function getMemoryServiceError(): CCRError | null {
  return initializationError;
}

export function resetMemoryService(): void {
  memoryService = null;
  initializationError = null;
  MemoryDatabase.resetInstance();
}

// Re-export types
export * from './types';
export { MemoryDatabase } from './database';
export { createEmbeddingProvider, cosineSimilarity } from './embedding';
