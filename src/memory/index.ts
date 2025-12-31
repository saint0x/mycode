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

export class MemoryService {
  private db: MemoryDatabase;
  private embedder: EmbeddingProvider;
  private config: MemoryConfig;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.db = MemoryDatabase.getInstance(config.dbPath);
    this.embedder = createEmbeddingProvider(config.embedding);
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
    // Generate embedding
    const embedding = await this.embedder.embed(content);
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

    // Save memory and embedding
    this.db.transaction(() => {
      if (options.scope === 'global') {
        this.db.saveGlobalMemory(memory);
      } else {
        if (!options.projectPath) {
          throw new Error('projectPath required for project-scoped memories');
        }
        this.db.saveProjectMemory(memory);
      }
      this.db.writeEmbedding(memory.id, embedding);
    });

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
    const limit = options.limit ?? 10;
    const minScore = options.minScore ?? 0.3;
    const results: MemorySearchResult[] = [];

    // Get query embedding
    const queryEmbedding = await this.embedder.embed(query);

    // Search global memories
    if (options.scope === 'global' || options.scope === 'both') {
      const globalResults = this.searchMemories(
        queryEmbedding,
        query,
        this.db.getAllGlobalMemories(),
        this.db.getAllGlobalEmbeddings(),
        limit
      );
      results.push(...globalResults);
    }

    // Search project memories
    if ((options.scope === 'project' || options.scope === 'both') && options.projectPath) {
      const projectResults = this.searchMemories(
        queryEmbedding,
        query,
        this.db.getProjectMemoriesByPath(options.projectPath),
        this.db.getAllProjectEmbeddings(options.projectPath),
        limit
      );
      results.push(...projectResults);
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
  }> {
    const maxGlobal = options?.maxGlobalMemories ?? this.config.autoInject.maxMemories;
    const maxProject = options?.maxProjectMemories ?? this.config.autoInject.maxMemories;

    // Extract query context from recent messages
    const recentMessages = request.messages.slice(-5);
    const queryContext = recentMessages
      .filter((m: any) => m.role === 'user')
      .map((m: any) => (typeof m.content === 'string' ? m.content : ''))
      .join(' ');

    let globalMemories: Memory[] = [];
    let projectMemories: Memory[] = [];

    if (queryContext && this.config.autoInject.global) {
      const globalResults = await this.recall(queryContext, {
        scope: 'global',
        limit: maxGlobal,
      });
      globalMemories = globalResults.map(r => r.memory);

      // Also include high-importance memories
      const allGlobal = this.db.getAllGlobalMemories();
      const topGlobalIds = new Set(globalMemories.map(m => m.id));
      for (const m of allGlobal) {
        if (!topGlobalIds.has(m.id) && m.importance >= 0.8 && globalMemories.length < maxGlobal) {
          globalMemories.push(m);
        }
      }
    }

    if (queryContext && this.config.autoInject.project && request.projectPath) {
      const projectResults = await this.recall(queryContext, {
        scope: 'project',
        projectPath: request.projectPath,
        limit: maxProject,
      });
      projectMemories = projectResults.map(r => r.memory);

      // Also include high-importance project memories
      const allProject = this.db.getProjectMemoriesByPath(request.projectPath);
      const topProjectIds = new Set(projectMemories.map(m => m.id));
      for (const m of allProject) {
        if (!topProjectIds.has(m.id) && m.importance >= 0.8 && projectMemories.length < maxProject) {
          projectMemories.push(m);
        }
      }
    }

    // Touch accessed memories
    for (const m of globalMemories) {
      this.db.touchMemory(m.id, 'global');
    }
    for (const m of projectMemories) {
      this.db.touchMemory(m.id, 'project');
    }

    return { globalMemories, projectMemories };
  }

  // ═══════════════════════════════════════════════════════════════════
  // DIRECT ACCESS
  // ═══════════════════════════════════════════════════════════════════

  getGlobalMemory(id: string): Memory | null {
    return this.db.getGlobalMemory(id);
  }

  getProjectMemory(id: string): Memory | null {
    return this.db.getProjectMemory(id);
  }

  getAllGlobalMemories(): Memory[] {
    return this.db.getAllGlobalMemories();
  }

  getAllProjectMemories(projectPath: string): Memory[] {
    return this.db.getProjectMemoriesByPath(projectPath);
  }

  deleteMemory(id: string, scope: 'global' | 'project'): void {
    if (scope === 'global') {
      this.db.deleteGlobalMemory(id);
    } else {
      this.db.deleteProjectMemory(id);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // MAINTENANCE
  // ═══════════════════════════════════════════════════════════════════

  cleanup(): number {
    return this.db.cleanup(
      this.config.retention.minImportance,
      this.config.retention.maxAgeDays
    );
  }

  getStats(): {
    globalCount: number;
    projectCount: number;
    instanceId: string;
  } {
    return {
      globalCount: this.db.countGlobalMemories(),
      projectCount: this.db.countProjectMemories(),
      instanceId: this.db.instanceId(),
    };
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

export function initMemoryService(config: MemoryConfig): MemoryService {
  memoryService = new MemoryService(config);
  return memoryService;
}

export function getMemoryService(): MemoryService {
  if (!memoryService) {
    throw new Error('MemoryService not initialized. Call initMemoryService first.');
  }
  return memoryService;
}

export function hasMemoryService(): boolean {
  return memoryService !== null;
}

// Re-export types
export * from './types';
export { MemoryDatabase } from './database';
export { createEmbeddingProvider, cosineSimilarity } from './embedding';
