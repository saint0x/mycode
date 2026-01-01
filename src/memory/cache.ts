/**
 * Embedding Index Cache
 * In-memory cache for frequently-accessed embeddings to avoid repeated DB reads
 */

import type { MemoryDatabase } from './database';

export class EmbeddingCache {
  private globalCache: Map<string, Float32Array> | null = null;
  private projectCaches: Map<string, Map<string, Float32Array>> = new Map();
  private globalLastWarm = 0;
  private projectLastWarm: Map<string, number> = new Map();
  private readonly ttlMs: number;
  private readonly maxProjectCaches: number;

  constructor(options: { ttlMs?: number; maxProjectCaches?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 60000; // 1 minute default
    this.maxProjectCaches = options.maxProjectCaches ?? 10;
  }

  /**
   * Get cached global embeddings, or load from DB if stale/missing
   */
  getGlobalEmbeddings(db: MemoryDatabase): Map<string, Float32Array> {
    const now = Date.now();

    if (this.globalCache && now - this.globalLastWarm < this.ttlMs) {
      return this.globalCache;
    }

    // Cache miss or stale - reload
    const embeddings = db.getAllEmbeddingsBulk();
    this.globalCache = embeddings;
    this.globalLastWarm = now;
    return embeddings;
  }

  /**
   * Get cached project embeddings, or load from DB if stale/missing
   */
  getProjectEmbeddings(db: MemoryDatabase, projectPath: string): Map<string, Float32Array> {
    const now = Date.now();
    const lastWarm = this.projectLastWarm.get(projectPath) ?? 0;

    if (now - lastWarm < this.ttlMs) {
      const cached = this.projectCaches.get(projectPath);
      if (cached) return cached;
    }

    // Evict oldest if at capacity
    if (this.projectCaches.size >= this.maxProjectCaches) {
      let oldestPath = '';
      let oldestTime = Infinity;
      for (const [path, time] of this.projectLastWarm) {
        if (time < oldestTime) {
          oldestTime = time;
          oldestPath = path;
        }
      }
      if (oldestPath) {
        this.projectCaches.delete(oldestPath);
        this.projectLastWarm.delete(oldestPath);
      }
    }

    // Load fresh from DB
    const allEmbeddings: Map<string, Float32Array> = db.getAllEmbeddingsBulk();
    const projectMemories = db.getProjectMemoriesByPath(projectPath);
    const projectIds = new Set(projectMemories.map(m => m.id));

    // Filter to only project-relevant embeddings
    const projectEmbeddings = new Map<string, Float32Array>();
    for (const [id, embedding] of allEmbeddings) {
      if (projectIds.has(id)) {
        projectEmbeddings.set(id, embedding);
      }
    }

    this.projectCaches.set(projectPath, projectEmbeddings);
    this.projectLastWarm.set(projectPath, now);
    return projectEmbeddings;
  }

  /**
   * Warm the cache for a project (call after searchProjectBySession)
   */
  warmProject(db: MemoryDatabase, projectPath: string): void {
    queueMicrotask(() => {
      try {
        this.getProjectEmbeddings(db, projectPath);
      } catch {
        // Silent failure - cache warming is non-critical
      }
    });
  }

  /**
   * Invalidate a specific embedding (call after memory save)
   */
  invalidate(memoryId: string): void {
    // Remove from global cache
    this.globalCache?.delete(memoryId);

    // Remove from all project caches
    for (const cache of this.projectCaches.values()) {
      cache.delete(memoryId);
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.globalCache = null;
    this.globalLastWarm = 0;
    this.projectCaches.clear();
    this.projectLastWarm.clear();
  }

  /**
   * Get cache stats for debugging
   */
  getStats(): {
    globalSize: number;
    projectCacheCount: number;
    projectSizes: Record<string, number>;
  } {
    const projectSizes: Record<string, number> = {};
    for (const [path, cache] of this.projectCaches) {
      projectSizes[path] = cache.size;
    }

    return {
      globalSize: this.globalCache?.size ?? 0,
      projectCacheCount: this.projectCaches.size,
      projectSizes,
    };
  }
}

// Singleton instance
let embeddingCache: EmbeddingCache | null = null;

export function getEmbeddingCache(): EmbeddingCache {
  if (!embeddingCache) {
    embeddingCache = new EmbeddingCache();
  }
  return embeddingCache;
}

export function resetEmbeddingCache(): void {
  embeddingCache?.clear();
  embeddingCache = null;
}
