# CCR Fork: Dynamic Context Injection & Memory System

## The Vision

Transform CCR from a simple router into an **intelligence-amplified agentic system** where every API call dynamically builds its context with:
- Persistent memory (global + project-scoped)
- Live context injection
- Adaptive prompt emphasis
- Context trimming for efficiency
- First-class memory integration (not a separate agent)

**The core insight**: Memory is not a tool the agent calls—it's context the agent receives. Every single API call goes through a **Dynamic Context Builder** that assembles the optimal context for that specific request.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INCOMING REQUEST                             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DYNAMIC CONTEXT BUILDER                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │   Memory    │ │   Project   │ │   Session   │ │   Request   │   │
│  │  Retrieval  │ │   Context   │ │   State     │ │   Analysis  │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│         │               │               │               │           │
│         ▼               ▼               ▼               ▼           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              CONTEXT ASSEMBLY & PRIORITIZATION               │   │
│  │  • Rank by relevance                                         │   │
│  │  • Trim to fit token budget                                  │   │
│  │  • Emphasize critical context                                │   │
│  │  • Build final system prompt                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         ENHANCED REQUEST                             │
│  • Original messages                                                 │
│  • Dynamically built system prompt with:                            │
│    - Relevant memories (global + project)                           │
│    - Project architecture context                                   │
│    - User preferences                                               │
│    - Session continuity                                             │
│    - Task-specific emphasis                                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          LLM PROVIDER                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      RESPONSE PROCESSOR                              │
│  • Extract memories to persist                                       │
│  • Update session state                                              │
│  • Log for future context                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Why Dynamic Building > Static Prompts

| Static Prompts | Dynamic Building |
|----------------|------------------|
| Same context every call | Tailored context per call |
| Wastes tokens on irrelevant info | Only includes relevant context |
| No memory integration | Memory as first-class citizen |
| Can't adapt to request type | Emphasizes based on task |
| Context grows unbounded | Intelligent trimming |
| Agents must call memory tools | Memory injected automatically |

**The Result**: An agent that appears to have perfect memory and context awareness without any explicit memory tool calls.

---

## Implementation Checklist

### Phase 0: Project Setup
- [x] **0.1** Working in existing repository `/Users/deepsaint/Desktop/mycode`
- [x] **0.2** Install dependencies with `bun install`
- [x] **0.3** Verify build works with `bun run build`
- [ ] **0.4** Create branch for enhancements: `git checkout -b feature/dynamic-context`

---

### Phase 1: Memory Infrastructure ✅ COMPLETE

#### 1.1 Create Directory Structure
- [x] **1.1.1** Create `src/memory/` directory
- [x] **1.1.2** Create `src/memory/types.ts` - All type definitions
- [x] **1.1.3** Create `src/memory/database.ts` - SQLite wrapper (using `bun:sqlite`)
- [x] **1.1.4** Create `src/memory/embedding.ts` - Embedding provider
- [x] **1.1.5** ~~Create `src/memory/store/global.store.ts`~~ (merged into index.ts)
- [x] **1.1.6** ~~Create `src/memory/store/project.store.ts`~~ (merged into index.ts)
- [x] **1.1.7** ~~Create `src/memory/search.ts`~~ (hybrid search in index.ts)
- [x] **1.1.8** Create `src/memory/index.ts` - MemoryService singleton export

#### 1.2 Define Types (`src/memory/types.ts`)
- [x] **1.2.1** Define `Memory` interface
- [x] **1.2.2** Define `GlobalMemory` interface (extends Memory)
- [x] **1.2.3** Define `ProjectMemory` interface (extends Memory)
- [x] **1.2.4** Define `MemoryCategory` type
- [x] **1.2.5** Define `MemoryMetadata` interface
- [x] **1.2.6** Define `MemorySearchResult` interface
- [x] **1.2.7** Define `EmbeddingProvider` interface
- [x] **1.2.8** Define `MemoryConfig` interface

```typescript
// src/memory/types.ts

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

export interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  embedding?: Float32Array;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt?: number;
  importance: number;  // 0.0 - 1.0
  metadata: MemoryMetadata;
}

export interface GlobalMemory extends Memory {
  scope: 'global';
}

export interface ProjectMemory extends Memory {
  scope: 'project';
  projectPath: string;
}

export interface MemoryMetadata {
  source?: string;           // Where this memory came from
  tags?: string[];           // Searchable tags
  relatedProjects?: string[];
  files?: string[];          // Related files
  sessionId?: string;        // Session that created this
  expiresAt?: number;        // Optional TTL
}

export interface MemorySearchResult {
  memory: Memory;
  score: number;             // Relevance score 0.0 - 1.0
  matchType: 'vector' | 'keyword' | 'hybrid';
}

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export interface MemoryConfig {
  enabled: boolean;
  dbPath: string;
  maxSizeBytes: number;
  embedding: {
    provider: 'openai' | 'voyageai' | 'local' | 'ollama';
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
  retention: {
    minImportance: number;
    maxAgeDays: number;
    cleanupIntervalMs: number;
  };
}
```

#### 1.3 Implement Database Layer (`src/memory/database.ts`) ✅ COMPLETE
- [x] **1.3.1** Using `bun:sqlite` (native Bun SQLite driver, not better-sqlite3)
- [x] **1.3.2** Create `MemoryDatabase` class with singleton pattern
- [x] **1.3.3** Implement stoar-compatible schema initialization
- [x] **1.3.4** Implement CRUD operations for global_memories
- [x] **1.3.5** Implement CRUD operations for project_memories
- [x] **1.3.6** Implement vector similarity search (cosine) + blob storage for embeddings
- [x] **1.3.7** Pre-compiled prepared statements for performance
- [x] **1.3.8** Transaction support and error handling

```typescript
// src/memory/database.ts

import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';

const SCHEMA = `
-- Global memories: cross-project knowledge, user preferences
CREATE TABLE IF NOT EXISTS global_memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    embedding BLOB,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    access_count INTEGER DEFAULT 0,
    last_accessed_at INTEGER,
    importance REAL DEFAULT 0.5,
    metadata TEXT
);

-- Project memories: project-specific knowledge
CREATE TABLE IF NOT EXISTS project_memories (
    id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    embedding BLOB,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    access_count INTEGER DEFAULT 0,
    last_accessed_at INTEGER,
    importance REAL DEFAULT 0.5,
    metadata TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_global_category ON global_memories(category);
CREATE INDEX IF NOT EXISTS idx_global_importance ON global_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_project_path ON project_memories(project_path);
CREATE INDEX IF NOT EXISTS idx_project_category ON project_memories(project_path, category);
CREATE INDEX IF NOT EXISTS idx_project_importance ON project_memories(importance DESC);

-- Conversation log for context continuity
CREATE TABLE IF NOT EXISTS conversation_log (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    project_path TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    token_count INTEGER,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_conv_session ON conversation_log(session_id);
CREATE INDEX IF NOT EXISTS idx_conv_project ON conversation_log(project_path);
CREATE INDEX IF NOT EXISTS idx_conv_timestamp ON conversation_log(timestamp DESC);
`;

export class MemoryDatabase {
  private db: Database.Database;
  private static instance: MemoryDatabase | null = null;

  private constructor(dbPath: string) {
    // Ensure directory exists
    const dir = join(dbPath, '..');
    mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA);
  }

  static getInstance(dbPath: string): MemoryDatabase {
    if (!MemoryDatabase.instance) {
      MemoryDatabase.instance = new MemoryDatabase(dbPath);
    }
    return MemoryDatabase.instance;
  }

  // Global memory operations
  saveGlobalMemory(memory: GlobalMemory): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO global_memories
      (id, content, category, embedding, created_at, updated_at, access_count, last_accessed_at, importance, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      memory.id,
      memory.content,
      memory.category,
      memory.embedding ? Buffer.from(memory.embedding.buffer) : null,
      memory.createdAt,
      memory.updatedAt,
      memory.accessCount,
      memory.lastAccessedAt,
      memory.importance,
      JSON.stringify(memory.metadata)
    );
  }

  getGlobalMemories(limit: number = 50): GlobalMemory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM global_memories
      ORDER BY importance DESC, last_accessed_at DESC
      LIMIT ?
    `);
    return stmt.all(limit).map(this.rowToGlobalMemory);
  }

  // Project memory operations
  saveProjectMemory(memory: ProjectMemory): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO project_memories
      (id, project_path, content, category, embedding, created_at, updated_at, access_count, last_accessed_at, importance, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      memory.id,
      memory.projectPath,
      memory.content,
      memory.category,
      memory.embedding ? Buffer.from(memory.embedding.buffer) : null,
      memory.createdAt,
      memory.updatedAt,
      memory.accessCount,
      memory.lastAccessedAt,
      memory.importance,
      JSON.stringify(memory.metadata)
    );
  }

  getProjectMemories(projectPath: string, limit: number = 50): ProjectMemory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM project_memories
      WHERE project_path = ?
      ORDER BY importance DESC, last_accessed_at DESC
      LIMIT ?
    `);
    return stmt.all(projectPath, limit).map(this.rowToProjectMemory);
  }

  // Vector similarity search
  searchByEmbedding(
    embedding: Float32Array,
    table: 'global_memories' | 'project_memories',
    projectPath?: string,
    limit: number = 10
  ): { id: string; score: number }[] {
    // Get all embeddings and compute cosine similarity in JS
    // (For production, consider sqlite-vss or similar)
    let stmt;
    if (table === 'global_memories') {
      stmt = this.db.prepare(`SELECT id, embedding FROM global_memories WHERE embedding IS NOT NULL`);
    } else {
      stmt = this.db.prepare(`SELECT id, embedding FROM project_memories WHERE embedding IS NOT NULL AND project_path = ?`);
    }

    const rows = table === 'global_memories' ? stmt.all() : stmt.all(projectPath);

    const results = rows.map((row: any) => {
      const storedEmbedding = new Float32Array(row.embedding.buffer);
      const score = this.cosineSimilarity(embedding, storedEmbedding);
      return { id: row.id, score };
    });

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Keyword search fallback
  searchByKeyword(
    query: string,
    table: 'global_memories' | 'project_memories',
    projectPath?: string,
    limit: number = 10
  ): { id: string; score: number }[] {
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
    let sql = `SELECT id, content FROM ${table} WHERE `;

    if (table === 'project_memories' && projectPath) {
      sql += `project_path = ? AND `;
    }

    sql += keywords.map(() => `LOWER(content) LIKE ?`).join(' OR ');
    sql += ` LIMIT ?`;

    const params = table === 'project_memories' && projectPath
      ? [projectPath, ...keywords.map(k => `%${k}%`), limit]
      : [...keywords.map(k => `%${k}%`), limit];

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map((row: any) => {
      const matchCount = keywords.filter(k => row.content.toLowerCase().includes(k)).length;
      return { id: row.id, score: matchCount / keywords.length };
    });
  }

  // Update access metadata
  touchMemory(id: string, table: 'global_memories' | 'project_memories'): void {
    const stmt = this.db.prepare(`
      UPDATE ${table}
      SET access_count = access_count + 1, last_accessed_at = ?
      WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  // Cleanup old/unimportant memories
  cleanup(minImportance: number, maxAgeDays: number): number {
    const maxAge = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    const stmt1 = this.db.prepare(`
      DELETE FROM global_memories
      WHERE importance < ? AND created_at < ? AND access_count < 3
    `);
    const result1 = stmt1.run(minImportance, maxAge);

    const stmt2 = this.db.prepare(`
      DELETE FROM project_memories
      WHERE importance < ? AND created_at < ? AND access_count < 3
    `);
    const result2 = stmt2.run(minImportance, maxAge);

    return result1.changes + result2.changes;
  }

  // Helpers
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private rowToGlobalMemory(row: any): GlobalMemory {
    return {
      id: row.id,
      scope: 'global',
      content: row.content,
      category: row.category,
      embedding: row.embedding ? new Float32Array(row.embedding.buffer) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at,
      importance: row.importance,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  private rowToProjectMemory(row: any): ProjectMemory {
    return {
      id: row.id,
      scope: 'project',
      projectPath: row.project_path,
      content: row.content,
      category: row.category,
      embedding: row.embedding ? new Float32Array(row.embedding.buffer) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at,
      importance: row.importance,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  close(): void {
    this.db.close();
  }
}
```

#### 1.4 Implement Embedding Provider (`src/memory/embedding.ts`) ✅ COMPLETE
- [x] **1.4.1** Create `EmbeddingProvider` base interface
- [x] **1.4.2** Implement `OpenAIEmbeddingProvider`
- [x] **1.4.3** Implement `OllamaEmbeddingProvider` + `LocalEmbeddingProvider` (for testing)
- [x] **1.4.4** Create provider factory function with smart fallback
- [x] **1.4.5** Add LRU caching layer for embeddings
- [x] **1.4.6** Batch embedding support

```typescript
// src/memory/embedding.ts

import OpenAI from 'openai';
import { EmbeddingProvider, EmbeddingConfig } from './types';
import { LRUCache } from '../utils/cache';

// Cache embeddings to avoid redundant API calls
const embeddingCache = new LRUCache<string, Float32Array>(1000);

export function createEmbeddingProvider(config: EmbeddingConfig['embedding']): EmbeddingProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider(config);
    case 'ollama':
      return new OllamaEmbeddingProvider(config);
    case 'local':
      return new LocalEmbeddingProvider(config);
    default:
      return new OpenAIEmbeddingProvider(config);
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions = 1536;  // text-embedding-3-small

  private client: OpenAI;
  private model: string;

  constructor(config: EmbeddingConfig['embedding']) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'text-embedding-3-small';

    // Adjust dimensions based on model
    if (this.model === 'text-embedding-3-large') {
      this.dimensions = 3072;
    }
  }

  async embed(text: string): Promise<Float32Array> {
    // Check cache first
    const cacheKey = `${this.model}:${text}`;
    const cached = embeddingCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      encoding_format: 'float'
    });

    const embedding = new Float32Array(response.data[0].embedding);
    embeddingCache.put(cacheKey, embedding);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Check cache and filter out cached ones
    const uncached: { index: number; text: string }[] = [];
    const results: (Float32Array | null)[] = texts.map((text, i) => {
      const cacheKey = `${this.model}:${text}`;
      const cached = embeddingCache.get(cacheKey);
      if (cached) return cached;
      uncached.push({ index: i, text });
      return null;
    });

    if (uncached.length > 0) {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: uncached.map(u => u.text),
        encoding_format: 'float'
      });

      response.data.forEach((item, i) => {
        const embedding = new Float32Array(item.embedding);
        const { index, text } = uncached[i];
        results[index] = embedding;
        embeddingCache.put(`${this.model}:${text}`, embedding);
      });
    }

    return results as Float32Array[];
  }
}

class OllamaEmbeddingProvider implements EmbeddingProvider {
  name = 'ollama';
  dimensions = 768;  // nomic-embed-text default

  private baseUrl: string;
  private model: string;

  constructor(config: EmbeddingConfig['embedding']) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'nomic-embed-text';
  }

  async embed(text: string): Promise<Float32Array> {
    const cacheKey = `ollama:${this.model}:${text}`;
    const cached = embeddingCache.get(cacheKey);
    if (cached) return cached;

    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text })
    });

    const data = await response.json();
    const embedding = new Float32Array(data.embedding);
    embeddingCache.put(cacheKey, embedding);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Ollama doesn't support batch, so we parallelize
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

class LocalEmbeddingProvider implements EmbeddingProvider {
  name = 'local';
  dimensions = 384;  // Simple hash-based for testing

  constructor(_config: EmbeddingConfig['embedding']) {}

  async embed(text: string): Promise<Float32Array> {
    // Simple hash-based embedding for testing/offline
    const embedding = new Float32Array(this.dimensions);
    const words = text.toLowerCase().split(/\s+/);

    for (const word of words) {
      for (let i = 0; i < word.length; i++) {
        const idx = (word.charCodeAt(i) * (i + 1)) % this.dimensions;
        embedding[idx] += 1;
      }
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((a, b) => a + b * b, 0));
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm || 1;
    }

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}
```

#### 1.5 Implement Memory Service (`src/memory/index.ts`) ✅ COMPLETE
- [x] **1.5.1** Create `MemoryService` class
- [x] **1.5.2** Implement `remember()` method
- [x] **1.5.3** Implement `recall()` method with hybrid search (vector + keyword)
- [x] **1.5.4** Implement `getContextForRequest()` method
- [x] **1.5.5** Implement importance scoring based on content and category
- [x] **1.5.6** Add automatic memory extraction from responses
- [x] **1.5.7** Export singleton instance with `initMemoryService()`/`getMemoryService()`

```typescript
// src/memory/index.ts

import { v4 as uuid } from 'uuid';
import { MemoryDatabase } from './database';
import { createEmbeddingProvider } from './embedding';
import {
  Memory,
  GlobalMemory,
  ProjectMemory,
  MemoryCategory,
  MemorySearchResult,
  MemoryConfig,
  EmbeddingProvider
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
    const embedding = await this.embedder.embed(content);
    const now = Date.now();

    const baseMemory = {
      id: uuid(),
      content,
      category: options.category,
      embedding,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      importance: options.importance ?? this.calculateImportance(content, options.category),
      metadata: options.metadata ?? {}
    };

    if (options.scope === 'global') {
      const memory: GlobalMemory = { ...baseMemory, scope: 'global' };
      this.db.saveGlobalMemory(memory);
      return memory;
    } else {
      if (!options.projectPath) {
        throw new Error('projectPath required for project-scoped memories');
      }
      const memory: ProjectMemory = {
        ...baseMemory,
        scope: 'project',
        projectPath: options.projectPath
      };
      this.db.saveProjectMemory(memory);
      return memory;
    }
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
      const vectorResults = this.db.searchByEmbedding(
        queryEmbedding,
        'global_memories',
        undefined,
        limit
      );

      const keywordResults = this.db.searchByKeyword(
        query,
        'global_memories',
        undefined,
        limit
      );

      const globalMemories = this.db.getGlobalMemories(100);
      const memoryMap = new Map(globalMemories.map(m => [m.id, m]));

      // Merge and dedupe results
      const scored = this.mergeSearchResults(vectorResults, keywordResults, memoryMap);
      results.push(...scored.filter(r => r.score >= minScore));
    }

    // Search project memories
    if ((options.scope === 'project' || options.scope === 'both') && options.projectPath) {
      const vectorResults = this.db.searchByEmbedding(
        queryEmbedding,
        'project_memories',
        options.projectPath,
        limit
      );

      const keywordResults = this.db.searchByKeyword(
        query,
        'project_memories',
        options.projectPath,
        limit
      );

      const projectMemories = this.db.getProjectMemories(options.projectPath, 100);
      const memoryMap = new Map(projectMemories.map(m => [m.id, m]));

      const scored = this.mergeSearchResults(vectorResults, keywordResults, memoryMap);
      results.push(...scored.filter(r => r.score >= minScore));
    }

    // Filter by categories if specified
    let filtered = results;
    if (options.categories?.length) {
      filtered = results.filter(r => options.categories!.includes(r.memory.category));
    }

    // Sort by score and limit
    return filtered
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ═══════════════════════════════════════════════════════════════════
  // GET CONTEXT FOR REQUEST - The core dynamic building method
  // ═══════════════════════════════════════════════════════════════════

  async getContextForRequest(
    request: {
      messages: any[];
      projectPath?: string;
      sessionId?: string;
    },
    options?: {
      maxGlobalMemories?: number;
      maxProjectMemories?: number;
      maxTokens?: number;
    }
  ): Promise<{
    globalMemories: GlobalMemory[];
    projectMemories: ProjectMemory[];
    recentContext: string[];
  }> {
    const maxGlobal = options?.maxGlobalMemories ?? this.config.autoInject.maxMemories;
    const maxProject = options?.maxProjectMemories ?? this.config.autoInject.maxMemories;

    // Extract query context from recent messages
    const recentMessages = request.messages.slice(-5);
    const queryContext = recentMessages
      .filter((m: any) => m.role === 'user')
      .map((m: any) => typeof m.content === 'string' ? m.content : '')
      .join(' ');

    // Get relevant global memories
    let globalMemories: GlobalMemory[] = [];
    if (this.config.autoInject.global && queryContext) {
      const globalResults = await this.recall(queryContext, {
        scope: 'global',
        limit: maxGlobal
      });
      globalMemories = globalResults.map(r => r.memory as GlobalMemory);

      // Also get high-importance memories regardless of query
      const topGlobal = this.db.getGlobalMemories(5);
      const topGlobalIds = new Set(globalMemories.map(m => m.id));
      for (const m of topGlobal) {
        if (!topGlobalIds.has(m.id) && m.importance >= 0.8) {
          globalMemories.push(m);
        }
      }
    }

    // Get relevant project memories
    let projectMemories: ProjectMemory[] = [];
    if (this.config.autoInject.project && request.projectPath && queryContext) {
      const projectResults = await this.recall(queryContext, {
        scope: 'project',
        projectPath: request.projectPath,
        limit: maxProject
      });
      projectMemories = projectResults.map(r => r.memory as ProjectMemory);

      // Also get high-importance project memories
      const topProject = this.db.getProjectMemories(request.projectPath, 5);
      const topProjectIds = new Set(projectMemories.map(m => m.id));
      for (const m of topProject) {
        if (!topProjectIds.has(m.id) && m.importance >= 0.8) {
          projectMemories.push(m);
        }
      }
    }

    // Update access metadata for retrieved memories
    for (const m of [...globalMemories, ...projectMemories]) {
      this.db.touchMemory(
        m.id,
        m.scope === 'global' ? 'global_memories' : 'project_memories'
      );
    }

    return {
      globalMemories,
      projectMemories,
      recentContext: []  // Can be extended for session continuity
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private mergeSearchResults(
    vectorResults: { id: string; score: number }[],
    keywordResults: { id: string; score: number }[],
    memoryMap: Map<string, Memory>
  ): MemorySearchResult[] {
    const scoreMap = new Map<string, { vector: number; keyword: number }>();

    for (const r of vectorResults) {
      scoreMap.set(r.id, { vector: r.score, keyword: 0 });
    }

    for (const r of keywordResults) {
      const existing = scoreMap.get(r.id);
      if (existing) {
        existing.keyword = r.score;
      } else {
        scoreMap.set(r.id, { vector: 0, keyword: r.score });
      }
    }

    const results: MemorySearchResult[] = [];
    for (const [id, scores] of scoreMap) {
      const memory = memoryMap.get(id);
      if (memory) {
        // Hybrid score: weighted combination
        const hybridScore = scores.vector * 0.7 + scores.keyword * 0.3;
        results.push({
          memory,
          score: hybridScore,
          matchType: scores.vector > 0 && scores.keyword > 0 ? 'hybrid'
                   : scores.vector > 0 ? 'vector'
                   : 'keyword'
        });
      }
    }

    return results;
  }

  private calculateImportance(content: string, category: MemoryCategory): number {
    // Base importance by category
    const categoryWeights: Record<MemoryCategory, number> = {
      preference: 0.8,      // User preferences are very important
      decision: 0.7,        // Architectural decisions
      architecture: 0.7,
      pattern: 0.6,
      knowledge: 0.5,
      context: 0.4,
      code: 0.4,
      error: 0.5,
      workflow: 0.6
    };

    let importance = categoryWeights[category] ?? 0.5;

    // Boost for explicit importance markers
    if (content.toLowerCase().includes('important')) importance += 0.1;
    if (content.toLowerCase().includes('always')) importance += 0.1;
    if (content.toLowerCase().includes('never')) importance += 0.1;
    if (content.toLowerCase().includes('prefer')) importance += 0.05;

    return Math.min(1.0, importance);
  }
}

// Singleton instance - initialized in server startup
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

export { MemoryService };
```

---

### Phase 2: Dynamic Context Builder ✅ COMPLETE

This is the **core innovation**. Every API call goes through this builder.

#### 2.1 Create Builder Structure ✅ COMPLETE
- [x] **2.1.1** Create `src/context/` directory
- [x] **2.1.2** Create `src/context/types.ts` - Context section types
- [x] **2.1.3** Create `src/context/sections/` directory for section builders
- [x] **2.1.4** Create `src/context/builder.ts` - Main DynamicContextBuilder
- [x] **2.1.5** Create `src/context/index.ts` - Export builder

#### 2.2 Define Context Types (`src/context/types.ts`) ✅ COMPLETE
- [x] **2.2.1** Define `ContextSection` interface
- [x] **2.2.2** Define `ContextPriority` enum
- [x] **2.2.3** Define `ContextBuildResult` interface
- [x] **2.2.4** Define `RequestAnalysis` interface

```typescript
// src/context/types.ts

export enum ContextPriority {
  CRITICAL = 100,    // Must include (user preferences, critical context)
  HIGH = 75,         // Important (project architecture, recent decisions)
  MEDIUM = 50,       // Relevant (related memories, patterns)
  LOW = 25,          // Nice to have (older context, tangential info)
  OPTIONAL = 0       // Only if space permits
}

export interface ContextSection {
  id: string;
  name: string;
  content: string;
  priority: ContextPriority;
  tokenCount: number;
  category: 'memory' | 'project' | 'session' | 'instruction' | 'emphasis';
  metadata?: Record<string, any>;
}

export interface RequestAnalysis {
  taskType: 'code' | 'debug' | 'explain' | 'refactor' | 'test' | 'review' | 'general';
  complexity: 'simple' | 'moderate' | 'complex';
  requiresMemory: boolean;
  requiresProjectContext: boolean;
  keywords: string[];
  entities: string[];  // Files, functions, classes mentioned
}

export interface ContextBuildResult {
  systemPrompt: string;
  sections: ContextSection[];
  totalTokens: number;
  trimmedSections: ContextSection[];
  analysis: RequestAnalysis;
}

export interface ContextBuilderConfig {
  maxTokens: number;
  reserveTokensForResponse: number;
  enableMemory: boolean;
  enableProjectContext: boolean;
  enableEmphasis: boolean;
  debugMode: boolean;
}
```

#### 2.3 Implement Section Builders ✅ COMPLETE
- [x] **2.3.1** Create `src/context/sections/memory.section.ts`
- [x] **2.3.2** ~~Create `src/context/sections/project.section.ts`~~ (merged with memory section)
- [x] **2.3.3** ~~Create `src/context/sections/session.section.ts`~~ (future enhancement)
- [x] **2.3.4** Create `src/context/sections/instruction.section.ts`
- [x] **2.3.5** Create `src/context/sections/emphasis.section.ts`

```typescript
// src/context/sections/memory.section.ts

import { ContextSection, ContextPriority } from '../types';
import { getMemoryService } from '../../memory';
import { GlobalMemory, ProjectMemory } from '../../memory/types';

export async function buildMemorySections(
  request: { messages: any[]; projectPath?: string },
  maxSections: number = 10
): Promise<ContextSection[]> {
  const memoryService = getMemoryService();
  const sections: ContextSection[] = [];

  const context = await memoryService.getContextForRequest(request);

  // Build global memory section
  if (context.globalMemories.length > 0) {
    const globalContent = formatGlobalMemories(context.globalMemories);
    sections.push({
      id: 'global-memory',
      name: 'Global Memory',
      content: globalContent,
      priority: ContextPriority.HIGH,
      tokenCount: estimateTokens(globalContent),
      category: 'memory',
      metadata: { memoryCount: context.globalMemories.length }
    });
  }

  // Build project memory section
  if (context.projectMemories.length > 0) {
    const projectContent = formatProjectMemories(context.projectMemories);
    sections.push({
      id: 'project-memory',
      name: 'Project Memory',
      content: projectContent,
      priority: ContextPriority.HIGH,
      tokenCount: estimateTokens(projectContent),
      category: 'memory',
      metadata: { memoryCount: context.projectMemories.length }
    });
  }

  return sections.slice(0, maxSections);
}

function formatGlobalMemories(memories: GlobalMemory[]): string {
  const grouped = groupByCategory(memories);
  const lines: string[] = [];

  lines.push('<global_memory scope="cross-project">');
  lines.push('Your persistent knowledge about this user across all projects:');
  lines.push('');

  for (const [category, mems] of Object.entries(grouped)) {
    if (mems.length > 0) {
      lines.push(`## ${formatCategory(category)}`);
      for (const m of mems) {
        lines.push(`- ${m.content}`);
      }
      lines.push('');
    }
  }

  lines.push('</global_memory>');
  return lines.join('\n');
}

function formatProjectMemories(memories: ProjectMemory[]): string {
  const grouped = groupByCategory(memories);
  const lines: string[] = [];

  lines.push('<project_memory scope="current-project">');
  lines.push('Your knowledge about this specific project:');
  lines.push('');

  for (const [category, mems] of Object.entries(grouped)) {
    if (mems.length > 0) {
      lines.push(`## ${formatCategory(category)}`);
      for (const m of mems) {
        lines.push(`- ${m.content}`);
      }
      lines.push('');
    }
  }

  lines.push('</project_memory>');
  return lines.join('\n');
}

function groupByCategory(memories: (GlobalMemory | ProjectMemory)[]): Record<string, (GlobalMemory | ProjectMemory)[]> {
  return memories.reduce((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {} as Record<string, (GlobalMemory | ProjectMemory)[]>);
}

function formatCategory(category: string): string {
  const names: Record<string, string> = {
    preference: 'User Preferences',
    pattern: 'Patterns & Conventions',
    knowledge: 'Domain Knowledge',
    decision: 'Decisions Made',
    architecture: 'Architecture',
    context: 'Context',
    code: 'Code Knowledge',
    error: 'Past Errors & Solutions',
    workflow: 'Workflow Preferences'
  };
  return names[category] || category;
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}
```

```typescript
// src/context/sections/instruction.section.ts

import { ContextSection, ContextPriority } from '../types';

export function buildInstructionSections(): ContextSection[] {
  const sections: ContextSection[] = [];

  // Memory usage instructions
  sections.push({
    id: 'memory-instructions',
    name: 'Memory Instructions',
    content: MEMORY_INSTRUCTIONS,
    priority: ContextPriority.MEDIUM,
    tokenCount: estimateTokens(MEMORY_INSTRUCTIONS),
    category: 'instruction'
  });

  return sections;
}

const MEMORY_INSTRUCTIONS = `<memory_instructions>
You have access to persistent memory that has been automatically loaded based on this request.

**Your memories are shown above in <global_memory> and <project_memory> sections.**

When you learn something important during this conversation:
- User preferences → Will be remembered globally
- Project decisions → Will be remembered for this project
- Patterns discovered → Will be remembered appropriately

You don't need to call any tools to access memory - relevant memories are automatically injected into each request.

**When to explicitly save new memories:**
- When the user states a preference ("I prefer...", "Always use...", "Never...")
- When an architectural decision is made
- When you discover a project pattern worth preserving
- When you solve a tricky problem that might recur

To save a memory, include in your response:
<remember scope="global|project" category="preference|pattern|decision|...">
Content to remember
</remember>
</memory_instructions>`;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

```typescript
// src/context/sections/emphasis.section.ts

import { ContextSection, ContextPriority, RequestAnalysis } from '../types';

export function buildEmphasisSections(analysis: RequestAnalysis): ContextSection[] {
  const sections: ContextSection[] = [];

  // Task-specific emphasis
  const emphasis = getTaskEmphasis(analysis.taskType);
  if (emphasis) {
    sections.push({
      id: 'task-emphasis',
      name: 'Task Emphasis',
      content: emphasis,
      priority: ContextPriority.HIGH,
      tokenCount: estimateTokens(emphasis),
      category: 'emphasis',
      metadata: { taskType: analysis.taskType }
    });
  }

  // Complexity-based guidance
  if (analysis.complexity === 'complex') {
    const complexGuidance = getComplexityGuidance();
    sections.push({
      id: 'complexity-guidance',
      name: 'Complexity Guidance',
      content: complexGuidance,
      priority: ContextPriority.MEDIUM,
      tokenCount: estimateTokens(complexGuidance),
      category: 'emphasis'
    });
  }

  return sections;
}

function getTaskEmphasis(taskType: RequestAnalysis['taskType']): string | null {
  const emphases: Record<string, string> = {
    debug: `<emphasis>
You are debugging. Focus on:
1. Understanding the error/symptom completely
2. Tracing the root cause methodically
3. Verifying fixes don't introduce regressions
</emphasis>`,

    refactor: `<emphasis>
You are refactoring. Focus on:
1. Preserving existing behavior exactly
2. Improving code quality incrementally
3. Running tests after each change
</emphasis>`,

    test: `<emphasis>
You are writing tests. Focus on:
1. Testing behavior, not implementation
2. Edge cases and error conditions
3. Clear, descriptive test names
</emphasis>`,

    review: `<emphasis>
You are reviewing code. Focus on:
1. Logic correctness and edge cases
2. Security vulnerabilities
3. Performance implications
4. Code clarity and maintainability
</emphasis>`
  };

  return emphases[taskType] || null;
}

function getComplexityGuidance(): string {
  return `<complexity_guidance>
This appears to be a complex task. Consider:
1. Breaking it into smaller, verifiable steps
2. Validating assumptions before proceeding
3. Testing incrementally rather than all at once
4. Asking clarifying questions if uncertain
</complexity_guidance>`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

#### 2.4 Implement Main Dynamic Context Builder ✅ COMPLETE
- [x] **2.4.1** Create `DynamicContextBuilder` class
- [x] **2.4.2** Implement request analysis (task type, complexity, keywords, entities)
- [x] **2.4.3** Implement section collection
- [x] **2.4.4** Implement priority-based trimming
- [x] **2.4.5** Implement final assembly (memory > instruction > emphasis > original)
- [x] **2.4.6** Add token budget management

```typescript
// src/context/builder.ts

import {
  ContextSection,
  ContextPriority,
  ContextBuildResult,
  ContextBuilderConfig,
  RequestAnalysis
} from './types';
import { buildMemorySections } from './sections/memory.section';
import { buildInstructionSections } from './sections/instruction.section';
import { buildEmphasisSections } from './sections/emphasis.section';
import { calculateTokenCount } from '../utils/router';

const DEFAULT_CONFIG: ContextBuilderConfig = {
  maxTokens: 8000,
  reserveTokensForResponse: 4000,
  enableMemory: true,
  enableProjectContext: true,
  enableEmphasis: true,
  debugMode: false
};

export class DynamicContextBuilder {
  private config: ContextBuilderConfig;

  constructor(config: Partial<ContextBuilderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════
  // MAIN BUILD METHOD - Called on every API request
  // ═══════════════════════════════════════════════════════════════════

  async build(
    originalSystem: string | any[],
    request: {
      messages: any[];
      projectPath?: string;
      sessionId?: string;
      tools?: any[];
    }
  ): Promise<ContextBuildResult> {
    // Step 1: Analyze the request
    const analysis = this.analyzeRequest(request);

    // Step 2: Collect all context sections
    const sections: ContextSection[] = [];

    // Memory sections (if enabled)
    if (this.config.enableMemory) {
      const memorySections = await buildMemorySections(request);
      sections.push(...memorySections);
    }

    // Instruction sections
    const instructionSections = buildInstructionSections();
    sections.push(...instructionSections);

    // Emphasis sections (if enabled)
    if (this.config.enableEmphasis) {
      const emphasisSections = buildEmphasisSections(analysis);
      sections.push(...emphasisSections);
    }

    // Step 3: Calculate available token budget
    const originalSystemTokens = this.estimateSystemTokens(originalSystem);
    const availableTokens = this.config.maxTokens - this.config.reserveTokensForResponse - originalSystemTokens;

    // Step 4: Prioritize and trim sections to fit budget
    const { included, trimmed } = this.fitToBudget(sections, availableTokens);

    // Step 5: Assemble final system prompt
    const enhancedSystem = this.assembleSystemPrompt(originalSystem, included);

    // Step 6: Calculate final token count
    const totalTokens = this.estimateSystemTokens(enhancedSystem);

    return {
      systemPrompt: enhancedSystem,
      sections: included,
      totalTokens,
      trimmedSections: trimmed,
      analysis
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // REQUEST ANALYSIS
  // ═══════════════════════════════════════════════════════════════════

  private analyzeRequest(request: { messages: any[]; tools?: any[] }): RequestAnalysis {
    const recentMessages = request.messages.slice(-3);
    const lastUserMessage = recentMessages.find(m => m.role === 'user');
    const content = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : '';

    // Detect task type
    const taskType = this.detectTaskType(content, request.tools);

    // Detect complexity
    const complexity = this.detectComplexity(content, request.messages.length);

    // Extract keywords and entities
    const keywords = this.extractKeywords(content);
    const entities = this.extractEntities(content);

    return {
      taskType,
      complexity,
      requiresMemory: true,  // For now, always true
      requiresProjectContext: true,
      keywords,
      entities
    };
  }

  private detectTaskType(content: string, tools?: any[]): RequestAnalysis['taskType'] {
    const lower = content.toLowerCase();

    if (lower.includes('debug') || lower.includes('error') || lower.includes('fix') || lower.includes('bug')) {
      return 'debug';
    }
    if (lower.includes('refactor') || lower.includes('clean up') || lower.includes('improve')) {
      return 'refactor';
    }
    if (lower.includes('test') || lower.includes('spec') || lower.includes('coverage')) {
      return 'test';
    }
    if (lower.includes('review') || lower.includes('check') || lower.includes('audit')) {
      return 'review';
    }
    if (lower.includes('explain') || lower.includes('how does') || lower.includes('what is')) {
      return 'explain';
    }
    if (lower.includes('implement') || lower.includes('create') || lower.includes('add') || lower.includes('build')) {
      return 'code';
    }

    return 'general';
  }

  private detectComplexity(content: string, messageCount: number): RequestAnalysis['complexity'] {
    // Long requests or long conversations suggest complexity
    if (content.length > 500 || messageCount > 10) {
      return 'complex';
    }
    if (content.length > 200 || messageCount > 5) {
      return 'moderate';
    }
    return 'simple';
  }

  private extractKeywords(content: string): string[] {
    // Simple keyword extraction
    const words = content.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                               'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                               'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
                               'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
                               'during', 'before', 'after', 'above', 'below', 'between', 'under',
                               'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
                               'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also',
                               'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
                               'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
                               'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs']);

    return words
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 10);
  }

  private extractEntities(content: string): string[] {
    const entities: string[] = [];

    // File paths
    const fileMatches = content.match(/[\w\-\/]+\.(ts|js|tsx|jsx|py|go|rs|java|cpp|c|h|css|scss|html|json|yaml|yml|md|txt)/g);
    if (fileMatches) entities.push(...fileMatches);

    // Function/class names (PascalCase or camelCase)
    const nameMatches = content.match(/\b[A-Z][a-zA-Z0-9]+\b|\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g);
    if (nameMatches) entities.push(...nameMatches.slice(0, 5));

    return [...new Set(entities)];
  }

  // ═══════════════════════════════════════════════════════════════════
  // TOKEN BUDGET MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  private fitToBudget(
    sections: ContextSection[],
    availableTokens: number
  ): { included: ContextSection[]; trimmed: ContextSection[] } {
    // Sort by priority (highest first)
    const sorted = [...sections].sort((a, b) => b.priority - a.priority);

    const included: ContextSection[] = [];
    const trimmed: ContextSection[] = [];
    let usedTokens = 0;

    for (const section of sorted) {
      if (usedTokens + section.tokenCount <= availableTokens) {
        included.push(section);
        usedTokens += section.tokenCount;
      } else if (section.priority >= ContextPriority.CRITICAL) {
        // Critical sections: try to include truncated version
        const remainingTokens = availableTokens - usedTokens;
        if (remainingTokens > 100) {
          const truncated = this.truncateSection(section, remainingTokens);
          included.push(truncated);
          usedTokens += truncated.tokenCount;
        } else {
          trimmed.push(section);
        }
      } else {
        trimmed.push(section);
      }
    }

    return { included, trimmed };
  }

  private truncateSection(section: ContextSection, maxTokens: number): ContextSection {
    const maxChars = maxTokens * 4;  // Rough estimate
    const truncatedContent = section.content.slice(0, maxChars) + '\n... (truncated for token limit)';

    return {
      ...section,
      content: truncatedContent,
      tokenCount: maxTokens,
      metadata: { ...section.metadata, truncated: true }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // FINAL ASSEMBLY
  // ═══════════════════════════════════════════════════════════════════

  private assembleSystemPrompt(
    originalSystem: string | any[],
    sections: ContextSection[]
  ): string {
    const parts: string[] = [];

    // Add memory sections first (highest priority context)
    const memorySections = sections.filter(s => s.category === 'memory');
    for (const section of memorySections) {
      parts.push(section.content);
    }

    // Add instruction sections
    const instructionSections = sections.filter(s => s.category === 'instruction');
    for (const section of instructionSections) {
      parts.push(section.content);
    }

    // Add emphasis sections
    const emphasisSections = sections.filter(s => s.category === 'emphasis');
    for (const section of emphasisSections) {
      parts.push(section.content);
    }

    // Add original system prompt
    if (typeof originalSystem === 'string') {
      parts.push(originalSystem);
    } else if (Array.isArray(originalSystem)) {
      for (const item of originalSystem) {
        if (item.type === 'text') {
          parts.push(item.text);
        }
      }
    }

    return parts.join('\n\n');
  }

  private estimateSystemTokens(system: string | any[]): number {
    if (typeof system === 'string') {
      return Math.ceil(system.length / 4);
    }
    if (Array.isArray(system)) {
      return system.reduce((acc, item) => {
        if (item.type === 'text') {
          return acc + Math.ceil(item.text.length / 4);
        }
        return acc;
      }, 0);
    }
    return 0;
  }
}

// Singleton instance
let builder: DynamicContextBuilder | null = null;

export function getContextBuilder(config?: Partial<ContextBuilderConfig>): DynamicContextBuilder {
  if (!builder) {
    builder = new DynamicContextBuilder(config);
  }
  return builder;
}

export function initContextBuilder(config: Partial<ContextBuilderConfig>): DynamicContextBuilder {
  builder = new DynamicContextBuilder(config);
  return builder;
}
```

---

### Phase 3: Integration with Main Agentic Loop ✅ COMPLETE

#### 3.1 Modify Server Startup (`src/index.ts`) ✅ COMPLETE
- [x] **3.1.1** Import memory service initialization
- [x] **3.1.2** Import context builder initialization
- [x] **3.1.3** Initialize memory service on startup
- [x] **3.1.4** Initialize context builder on startup
- [x] **3.1.5** Add memory config loading from MEMORY_DB_PATH constant

#### 3.2 Modify Router Middleware (`src/index.ts` preHandler) ✅ COMPLETE
- [x] **3.2.1** Import context builder
- [x] **3.2.2** Call `builder.build()` on each request via preHandler hook
- [x] **3.2.3** Replace system prompt with enhanced version
- [x] **3.2.4** Pass analysis to downstream processing
- [x] **3.2.5** Log context building stats (debug mode)

```typescript
// Modification to src/utils/router.ts

import { getContextBuilder } from '../context';
import { getMemoryService } from '../memory';

// In the router function, before forwarding to provider:

export async function router(req: FastifyRequest, reply: FastifyReply, opts: RouterOptions) {
  const { config, event } = opts;
  const body = req.body as any;

  // ═══════════════════════════════════════════════════════════════════
  // DYNAMIC CONTEXT BUILDING - THE MAGIC HAPPENS HERE
  // ═══════════════════════════════════════════════════════════════════

  if (config.Memory?.enabled) {
    const builder = getContextBuilder();

    // Build enhanced context for this specific request
    const contextResult = await builder.build(
      body.system,
      {
        messages: body.messages,
        projectPath: await searchProjectBySession(req.sessionId),
        sessionId: req.sessionId,
        tools: body.tools
      }
    );

    // Replace system prompt with enhanced version
    body.system = contextResult.systemPrompt;

    // Attach analysis for downstream use
    (req as any).contextAnalysis = contextResult.analysis;
    (req as any).contextStats = {
      sections: contextResult.sections.length,
      trimmed: contextResult.trimmedSections.length,
      tokens: contextResult.totalTokens
    };

    if (config.Memory?.debugMode) {
      console.log('[Context Builder]', {
        taskType: contextResult.analysis.taskType,
        complexity: contextResult.analysis.complexity,
        sections: contextResult.sections.map(s => s.name),
        trimmed: contextResult.trimmedSections.map(s => s.name),
        totalTokens: contextResult.totalTokens
      });
    }
  }

  // Continue with existing routing logic...
}
```

#### 3.3 Modify Response Handler (`src/index.ts`) ✅ COMPLETE
- [x] **3.3.1** Extract memories from responses via `extractMemoriesFromResponse()`
- [x] **3.3.2** Parse `<remember>` tags with scope and category
- [x] **3.3.3** Save extracted memories via MemoryService
- [ ] **3.3.4** Log conversation for context continuity (future enhancement)

```typescript
// Add to response processing in src/index.ts

import { getMemoryService } from './memory';

// After receiving response from LLM, extract memories:

async function processResponse(response: any, req: any, config: any) {
  const content = extractTextContent(response);

  if (config.Memory?.enabled && content) {
    const memoryService = getMemoryService();

    // Extract and save any <remember> tags
    const rememberMatches = content.matchAll(
      /<remember\s+scope="(global|project)"\s+category="(\w+)">([\s\S]*?)<\/remember>/g
    );

    for (const match of rememberMatches) {
      const [, scope, category, memoryContent] = match;

      await memoryService.remember(memoryContent.trim(), {
        scope: scope as 'global' | 'project',
        projectPath: req.projectPath,
        category: category as any,
        metadata: {
          sessionId: req.sessionId,
          source: 'agent-explicit'
        }
      });

      console.log(`[Memory] Saved ${scope} memory (${category}):`,
        memoryContent.trim().slice(0, 50) + '...');
    }

    // Also auto-extract important information (optional)
    if (config.Memory?.autoExtract) {
      await autoExtractMemories(content, req, config);
    }
  }
}

async function autoExtractMemories(content: string, req: any, config: any) {
  // Pattern matching for auto-extraction
  const patterns = [
    {
      regex: /(?:user prefers?|always use|never use|I (?:like|prefer|want))\s+(.+?)(?:\.|$)/gi,
      category: 'preference',
      scope: 'global'
    },
    {
      regex: /(?:decided to|choosing|went with|using)\s+(.+?)\s+(?:for|because|since)/gi,
      category: 'decision',
      scope: 'project'
    },
    {
      regex: /(?:architecture|pattern|convention):\s*(.+?)(?:\.|$)/gi,
      category: 'architecture',
      scope: 'project'
    }
  ];

  const memoryService = getMemoryService();

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const extractedContent = match[1].trim();
      if (extractedContent.length > 10 && extractedContent.length < 500) {
        await memoryService.remember(extractedContent, {
          scope: pattern.scope as 'global' | 'project',
          projectPath: req.projectPath,
          category: pattern.category as any,
          importance: 0.6,
          metadata: {
            sessionId: req.sessionId,
            source: 'auto-extracted'
          }
        });
      }
    }
  }
}
```

---

### Phase 4: Configuration Updates ✅ COMPLETE

#### 4.1 Update Config Schema ✅ COMPLETE
- [x] **4.1.1** Add `Memory` section to config types
- [x] **4.1.2** Add `Context` section to config types (via ContextBuilderConfig)
- [x] **4.1.3** Update src/constants.ts with MEMORY_DB_PATH
- [x] **4.1.4** Environment variable support via process.env

#### 4.2 Create Default Config ✅ COMPLETE
- [x] **4.2.1** Update ui/config.example.json with memory settings
- [ ] **4.2.2** Document all configuration options (README update pending)

```json
// ~/.claude-code-router/config.json (additions)
{
  "Memory": {
    "enabled": true,
    "dbPath": "~/.claude-code-router/memory/memory.db",
    "maxSizeBytes": 1073741824,
    "debugMode": false,
    "embedding": {
      "provider": "openai",
      "apiKey": "${OPENAI_API_KEY}",
      "model": "text-embedding-3-small"
    },
    "autoInject": {
      "global": true,
      "project": true,
      "maxMemories": 10,
      "maxTokens": 2000
    },
    "autoExtract": true,
    "retention": {
      "minImportance": 0.3,
      "maxAgeDays": 90,
      "cleanupIntervalMs": 86400000
    }
  },
  "Context": {
    "maxTokens": 8000,
    "reserveTokensForResponse": 4000,
    "enableEmphasis": true
  }
}
```

---

### Phase 5: Sub-Agent Architecture (Optional Enhancement)

#### 5.1 Create Sub-Agent Infrastructure
- [ ] **5.1.1** Create `src/subagent/types.ts`
- [ ] **5.1.2** Create `src/subagent/runner.ts`
- [ ] **5.1.3** Create `src/subagent/configs.ts` (predefined types)
- [ ] **5.1.4** Create spawn tool

#### 5.2 Integrate Sub-Agent Spawning
- [ ] **5.2.1** Register spawn tool with agent system
- [ ] **5.2.2** Ensure sub-agents inherit memory context
- [ ] **5.2.3** Implement summary generation on completion
- [ ] **5.2.4** Handle sub-agent errors gracefully

---

### Phase 6: Testing & Validation ✅ COMPLETE (82 tests passing)

#### 6.1 Unit Tests ✅ COMPLETE
- [x] **6.1.1** Test MemoryDatabase CRUD operations (tests/database.test.ts - 15 tests)
- [x] **6.1.2** Test embedding provider (tests/embedding.test.ts - 13 tests)
- [x] **6.1.3** Test MemoryService recall/remember (tests/memory-service.test.ts - 17 tests)
- [x] **6.1.4** Test DynamicContextBuilder (tests/context-builder.test.ts - 19 tests)
- [x] **6.1.5** Test token budget management
- [x] **6.1.6** Test section prioritization

#### 6.2 Integration Tests ✅ COMPLETE
- [x] **6.2.1** Test full request flow with memory injection (tests/integration.test.ts - 18 tests)
- [x] **6.2.2** Test memory extraction from responses
- [x] **6.2.3** Test context trimming behavior
- [x] **6.2.4** Test multi-project isolation

#### 6.3 Manual Testing
- [ ] **6.3.1** Start CCR with memory enabled
- [ ] **6.3.2** Have a conversation and check memory persistence
- [ ] **6.3.3** Verify memories are injected in subsequent requests
- [ ] **6.3.4** Test with different project contexts
- [ ] **6.3.5** Verify cleanup works correctly

---

### Phase 7: Production Hardening

#### 7.1 Performance Optimization
- [ ] **7.1.1** Add embedding caching
- [ ] **7.1.2** Optimize SQLite queries
- [ ] **7.1.3** Add connection pooling
- [ ] **7.1.4** Profile and optimize hot paths

#### 7.2 Error Handling
- [ ] **7.2.1** Graceful degradation if memory DB fails
- [ ] **7.2.2** Fallback if embedding API fails
- [ ] **7.2.3** Handle malformed memory data
- [ ] **7.2.4** Add comprehensive logging

#### 7.3 Monitoring
- [ ] **7.3.1** Add metrics for memory operations
- [ ] **7.3.2** Track context building times
- [ ] **7.3.3** Monitor token usage
- [ ] **7.3.4** Alert on errors

---

## Dependencies Added ✅

**Note**: Using `bun:sqlite` (native Bun SQLite driver) instead of `better-sqlite3` for full Bun compatibility.

```json
{
  "dependencies": {
    "openai": "^4.0.0",
    "uuid": "^11.1.0"
  }
}
```

**Built-in Bun modules used:**
- `bun:sqlite` - Native SQLite driver (no external dependency needed)

---

## File Summary

### New Files to Create

| File | Purpose | Priority |
|------|---------|----------|
| `src/memory/types.ts` | Memory type definitions | P0 |
| `src/memory/database.ts` | SQLite wrapper | P0 |
| `src/memory/embedding.ts` | Embedding providers | P0 |
| `src/memory/index.ts` | MemoryService | P0 |
| `src/context/types.ts` | Context builder types | P0 |
| `src/context/builder.ts` | DynamicContextBuilder | P0 |
| `src/context/sections/memory.section.ts` | Memory section builder | P0 |
| `src/context/sections/instruction.section.ts` | Instructions builder | P1 |
| `src/context/sections/emphasis.section.ts` | Emphasis builder | P1 |
| `src/context/index.ts` | Context builder exports | P0 |
| `src/subagent/types.ts` | Sub-agent types | P2 |
| `src/subagent/runner.ts` | Sub-agent execution | P2 |

### Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `src/index.ts` | Initialize memory, process responses | P0 |
| `src/utils/router.ts` | Call context builder | P0 |
| `package.json` | Add dependencies | P0 |

---

## Success Criteria

The implementation is complete when:

1. **Memory persists across sessions** - Information remembered in one session is available in the next
2. **Memory is automatically injected** - No explicit tool calls needed to access memory
3. **Context is dynamically built** - Each request gets tailored context based on relevance
4. **Token budget is respected** - System doesn't exceed limits, prioritizes important context
5. **User preferences are remembered globally** - Cross-project knowledge works
6. **Project context is isolated** - Project-specific knowledge stays in project scope
7. **Performance is acceptable** - Context building adds < 100ms latency

---

## Architecture Decision Records

### ADR-001: Memory as First-Class Citizen (Not Agent Tool)

**Decision**: Memory is injected automatically into every request rather than being accessed via agent tools.

**Rationale**:
- Reduces cognitive load on the agent (doesn't need to decide when to check memory)
- Ensures consistent memory usage across all requests
- Eliminates latency of tool call round-trips
- Makes memory invisible to user while still effective

**Consequences**:
- More complex request preprocessing
- Need smart relevance filtering to avoid irrelevant memories
- Must handle token budget carefully

### ADR-002: Dynamic Context Building Per Request

**Decision**: Build context dynamically for each API call rather than using static prompts.

**Rationale**:
- Enables context trimming for long conversations
- Allows task-specific emphasis
- Supports adaptive memory injection
- Future-proofs for more sophisticated context strategies

**Consequences**:
- Slightly higher per-request overhead
- More complex testing requirements
- Need careful priority management

### ADR-003: SQLite for Memory Storage

**Decision**: Use SQLite with better-sqlite3 for memory persistence.

**Rationale**:
- No external dependencies (self-contained)
- Fast for typical workloads
- Supports both structured queries and vector similarity
- Easy backup/migration

**Consequences**:
- Limited to single-machine deployment
- Vector search is O(n) without specialized extension
- May need sqlite-vss for large memory stores

---

## Quick Start After Implementation

```bash
# 1. Install dependencies
pnpm install

# 2. Build
pnpm run build

# 3. Configure memory (add to ~/.claude-code-router/config.json)
{
  "Memory": {
    "enabled": true,
    "embedding": {
      "provider": "openai",
      "apiKey": "sk-..."
    }
  }
}

# 4. Start CCR
ccr start

# 5. Use Claude Code - memories will be automatically injected
ccr code "remember that I prefer TypeScript with strict mode"

# 6. In a new session, the preference should be remembered
ccr code "create a new TypeScript project"
# -> Should use strict mode without being told
```

---

## Phase 8: Pre-Allocation & Performance Optimization

**Goal**: Zero runtime allocations in the hot path. Everything pre-allocated at startup.

This section covers aggressive pre-allocation strategies to make the system blazingly fast. Every object, buffer, and resource that can be pre-allocated MUST be pre-allocated.

### 8.1 Pre-Allocation Checklist

#### 8.1.1 Object Pools
- [ ] **8.1.1.1** Create `ObjectPool<T>` generic class
- [ ] **8.1.1.2** Pre-allocate `ContextSection` object pool (100 objects)
- [ ] **8.1.1.3** Pre-allocate `MemorySearchResult` object pool (200 objects)
- [ ] **8.1.1.4** Pre-allocate `Message` object pool (500 objects)
- [ ] **8.1.1.5** Pre-allocate `RequestAnalysis` object pool (50 objects)
- [ ] **8.1.1.6** Implement `acquire()` and `release()` methods
- [ ] **8.1.1.7** Add pool exhaustion handling (grow or block)

```typescript
// src/utils/pool.ts

export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    initialSize: number,
    maxSize: number = initialSize * 2
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;

    // PRE-ALLOCATE at construction time
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    // Pool exhausted - create new (but log warning)
    console.warn('[ObjectPool] Pool exhausted, creating new object');
    return this.factory();
  }

  release(obj: T): void {
    this.reset(obj);
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
    // Else discard (pool at max capacity)
  }

  get available(): number {
    return this.pool.length;
  }

  // Pre-warm the pool (call at startup)
  prewarm(count: number): void {
    const needed = count - this.pool.length;
    for (let i = 0; i < needed && this.pool.length < this.maxSize; i++) {
      this.pool.push(this.factory());
    }
  }
}

// Pre-allocated pools (initialized at module load)
export const contextSectionPool = new ObjectPool<ContextSection>(
  () => ({
    id: '',
    name: '',
    content: '',
    priority: 0,
    tokenCount: 0,
    category: 'memory',
    metadata: {}
  }),
  (obj) => {
    obj.id = '';
    obj.name = '';
    obj.content = '';
    obj.priority = 0;
    obj.tokenCount = 0;
    obj.category = 'memory';
    obj.metadata = {};
  },
  100,  // Initial size
  500   // Max size
);

export const searchResultPool = new ObjectPool<MemorySearchResult>(
  () => ({ memory: null as any, score: 0, matchType: 'vector' }),
  (obj) => { obj.memory = null as any; obj.score = 0; obj.matchType = 'vector'; },
  200,
  1000
);
```

#### 8.1.2 Buffer Pre-Allocation
- [ ] **8.1.2.1** Pre-allocate embedding buffers (`Float32Array`)
- [ ] **8.1.2.2** Pre-allocate string builders for prompt assembly
- [ ] **8.1.2.3** Pre-allocate JSON stringify buffers
- [ ] **8.1.2.4** Pre-allocate SSE parsing buffers
- [ ] **8.1.2.5** Pre-allocate response accumulation buffers

```typescript
// src/utils/buffers.ts

// Pre-allocated embedding buffers
// OpenAI text-embedding-3-small = 1536 dimensions
// Allocate pool of reusable Float32Arrays
class EmbeddingBufferPool {
  private buffers: Float32Array[] = [];
  private dimensions: number;
  private poolSize: number;

  constructor(dimensions: number, poolSize: number) {
    this.dimensions = dimensions;
    this.poolSize = poolSize;

    // PRE-ALLOCATE all buffers at construction
    for (let i = 0; i < poolSize; i++) {
      this.buffers.push(new Float32Array(dimensions));
    }
  }

  acquire(): Float32Array {
    if (this.buffers.length > 0) {
      return this.buffers.pop()!;
    }
    // Pool exhausted
    console.warn('[EmbeddingBufferPool] Exhausted, allocating new buffer');
    return new Float32Array(this.dimensions);
  }

  release(buffer: Float32Array): void {
    if (buffer.length === this.dimensions && this.buffers.length < this.poolSize) {
      // Zero out for security (optional, comment out for max perf)
      // buffer.fill(0);
      this.buffers.push(buffer);
    }
  }
}

// Pre-allocate for common embedding dimensions
export const embeddingBuffers1536 = new EmbeddingBufferPool(1536, 50);  // OpenAI small
export const embeddingBuffers3072 = new EmbeddingBufferPool(3072, 20);  // OpenAI large
export const embeddingBuffers768 = new EmbeddingBufferPool(768, 50);    // Ollama/local

// Pre-allocated string builder for prompt assembly
class PreallocatedStringBuilder {
  private chunks: string[] = [];
  private chunkPool: string[][] = [];
  private poolSize: number;

  constructor(poolSize: number = 20) {
    this.poolSize = poolSize;
    // Pre-allocate chunk arrays
    for (let i = 0; i < poolSize; i++) {
      this.chunkPool.push([]);
    }
  }

  acquire(): string[] {
    if (this.chunkPool.length > 0) {
      return this.chunkPool.pop()!;
    }
    return [];
  }

  release(chunks: string[]): void {
    chunks.length = 0;  // Clear without dealloc
    if (this.chunkPool.length < this.poolSize) {
      this.chunkPool.push(chunks);
    }
  }
}

export const stringBuilderPool = new PreallocatedStringBuilder(50);

// Pre-allocated response buffer for streaming
export class ResponseBuffer {
  private buffer: Uint8Array;
  private position: number = 0;

  constructor(initialSize: number = 1024 * 1024) {  // 1MB default
    this.buffer = new Uint8Array(initialSize);
  }

  write(data: Uint8Array): void {
    if (this.position + data.length > this.buffer.length) {
      // Grow buffer (double size)
      const newBuffer = new Uint8Array(this.buffer.length * 2);
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
    }
    this.buffer.set(data, this.position);
    this.position += data.length;
  }

  reset(): void {
    this.position = 0;
    // Don't zero - just reset position for speed
  }

  getContent(): Uint8Array {
    return this.buffer.subarray(0, this.position);
  }
}

// Pool of response buffers
class ResponseBufferPool {
  private pool: ResponseBuffer[] = [];
  private poolSize: number;

  constructor(poolSize: number, bufferSize: number) {
    this.poolSize = poolSize;
    for (let i = 0; i < poolSize; i++) {
      this.pool.push(new ResponseBuffer(bufferSize));
    }
  }

  acquire(): ResponseBuffer {
    if (this.pool.length > 0) {
      const buf = this.pool.pop()!;
      buf.reset();
      return buf;
    }
    return new ResponseBuffer();
  }

  release(buffer: ResponseBuffer): void {
    buffer.reset();
    if (this.pool.length < this.poolSize) {
      this.pool.push(buffer);
    }
  }
}

export const responseBufferPool = new ResponseBufferPool(20, 512 * 1024);  // 20 x 512KB buffers
```

#### 8.1.3 Database Connection & Statement Pre-Allocation
- [ ] **8.1.3.1** Pre-compile all SQL prepared statements at startup
- [ ] **8.1.3.2** Keep SQLite connection open (singleton)
- [ ] **8.1.3.3** Pre-allocate result row objects
- [ ] **8.1.3.4** Use WAL mode for concurrent reads

```typescript
// src/memory/database.ts - Enhanced with pre-allocation

export class MemoryDatabase {
  private db: Database.Database;

  // PRE-COMPILED prepared statements (allocated once at startup)
  private stmts!: {
    // Global memory statements
    insertGlobal: Database.Statement;
    selectGlobalById: Database.Statement;
    selectGlobalByCategory: Database.Statement;
    selectGlobalTop: Database.Statement;
    selectGlobalAll: Database.Statement;
    updateGlobalAccess: Database.Statement;
    deleteGlobalOld: Database.Statement;

    // Project memory statements
    insertProject: Database.Statement;
    selectProjectById: Database.Statement;
    selectProjectByPath: Database.Statement;
    selectProjectTop: Database.Statement;
    updateProjectAccess: Database.Statement;
    deleteProjectOld: Database.Statement;

    // Search statements
    selectGlobalEmbeddings: Database.Statement;
    selectProjectEmbeddings: Database.Statement;
  };

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000');  // 64MB cache
    this.db.pragma('temp_store = MEMORY');
    this.db.exec(SCHEMA);

    // PRE-COMPILE all statements at construction
    this.prepareStatements();
  }

  private prepareStatements(): void {
    this.stmts = {
      // Global memory
      insertGlobal: this.db.prepare(`
        INSERT OR REPLACE INTO global_memories
        (id, content, category, embedding, created_at, updated_at, access_count, last_accessed_at, importance, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      selectGlobalById: this.db.prepare(`SELECT * FROM global_memories WHERE id = ?`),
      selectGlobalByCategory: this.db.prepare(`SELECT * FROM global_memories WHERE category = ? ORDER BY importance DESC LIMIT ?`),
      selectGlobalTop: this.db.prepare(`SELECT * FROM global_memories ORDER BY importance DESC, last_accessed_at DESC LIMIT ?`),
      selectGlobalAll: this.db.prepare(`SELECT id, embedding FROM global_memories WHERE embedding IS NOT NULL`),
      updateGlobalAccess: this.db.prepare(`UPDATE global_memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?`),
      deleteGlobalOld: this.db.prepare(`DELETE FROM global_memories WHERE importance < ? AND created_at < ? AND access_count < 3`),

      // Project memory
      insertProject: this.db.prepare(`
        INSERT OR REPLACE INTO project_memories
        (id, project_path, content, category, embedding, created_at, updated_at, access_count, last_accessed_at, importance, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      selectProjectById: this.db.prepare(`SELECT * FROM project_memories WHERE id = ?`),
      selectProjectByPath: this.db.prepare(`SELECT * FROM project_memories WHERE project_path = ? ORDER BY importance DESC, last_accessed_at DESC LIMIT ?`),
      selectProjectTop: this.db.prepare(`SELECT * FROM project_memories WHERE project_path = ? ORDER BY importance DESC LIMIT ?`),
      updateProjectAccess: this.db.prepare(`UPDATE project_memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?`),
      deleteProjectOld: this.db.prepare(`DELETE FROM project_memories WHERE importance < ? AND created_at < ? AND access_count < 3`),

      // Embedding search
      selectGlobalEmbeddings: this.db.prepare(`SELECT id, embedding FROM global_memories WHERE embedding IS NOT NULL`),
      selectProjectEmbeddings: this.db.prepare(`SELECT id, embedding FROM project_memories WHERE project_path = ? AND embedding IS NOT NULL`),
    };
  }

  // Use pre-compiled statements
  saveGlobalMemory(memory: GlobalMemory): void {
    this.stmts.insertGlobal.run(
      memory.id,
      memory.content,
      memory.category,
      memory.embedding ? Buffer.from(memory.embedding.buffer) : null,
      memory.createdAt,
      memory.updatedAt,
      memory.accessCount,
      memory.lastAccessedAt,
      memory.importance,
      JSON.stringify(memory.metadata)
    );
  }

  getGlobalMemories(limit: number): GlobalMemory[] {
    return this.stmts.selectGlobalTop.all(limit).map(this.rowToGlobalMemory);
  }

  // ... etc - all methods use pre-compiled this.stmts
}
```

#### 8.1.4 LRU Cache Pre-Sizing
- [ ] **8.1.4.1** Pre-size embedding cache with expected capacity
- [ ] **8.1.4.2** Pre-size session cache
- [ ] **8.1.4.3** Pre-size project path cache
- [ ] **8.1.4.4** Use Map with pre-allocated backing store

```typescript
// src/utils/cache.ts - Enhanced LRU with pre-allocation

export class PreallocatedLRUCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number }>;
  private maxSize: number;
  private keyOrder: K[] = [];

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    // Pre-allocate Map with expected size hint
    this.cache = new Map();

    // Pre-allocate key order array
    this.keyOrder = new Array(maxSize);
    this.keyOrder.length = 0;  // Reset length but keep capacity
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (most recent)
      const idx = this.keyOrder.indexOf(key);
      if (idx > -1) {
        this.keyOrder.splice(idx, 1);
        this.keyOrder.push(key);
      }
      return entry.value;
    }
    return undefined;
  }

  put(key: K, value: V): void {
    if (this.cache.has(key)) {
      // Update existing
      this.cache.set(key, { value, timestamp: Date.now() });
      const idx = this.keyOrder.indexOf(key);
      if (idx > -1) {
        this.keyOrder.splice(idx, 1);
        this.keyOrder.push(key);
      }
    } else {
      // Evict if at capacity
      if (this.cache.size >= this.maxSize) {
        const oldest = this.keyOrder.shift();
        if (oldest !== undefined) {
          this.cache.delete(oldest);
        }
      }
      this.cache.set(key, { value, timestamp: Date.now() });
      this.keyOrder.push(key);
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    const idx = this.keyOrder.indexOf(key);
    if (idx > -1) {
      this.keyOrder.splice(idx, 1);
    }
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.keyOrder.length = 0;
  }

  get size(): number {
    return this.cache.size;
  }
}

// Pre-allocated caches (created at module load)
export const embeddingCache = new PreallocatedLRUCache<string, Float32Array>(2000);
export const sessionCache = new PreallocatedLRUCache<string, any>(500);
export const projectPathCache = new PreallocatedLRUCache<string, string>(1000);
export const tokenCountCache = new PreallocatedLRUCache<string, number>(5000);
```

#### 8.1.5 Context Builder Pre-Allocation
- [ ] **8.1.5.1** Pre-allocate section arrays
- [ ] **8.1.5.2** Pre-allocate result objects
- [ ] **8.1.5.3** Pre-allocate string arrays for assembly
- [ ] **8.1.5.4** Reuse analysis objects

```typescript
// src/context/builder.ts - Pre-allocation additions

export class DynamicContextBuilder {
  // PRE-ALLOCATED arrays (reused across builds)
  private sectionBuffer: ContextSection[] = new Array(50);
  private includedBuffer: ContextSection[] = new Array(50);
  private trimmedBuffer: ContextSection[] = new Array(50);
  private assemblyParts: string[] = new Array(20);

  // PRE-ALLOCATED result object (reused)
  private resultTemplate: ContextBuildResult = {
    systemPrompt: '',
    sections: [],
    totalTokens: 0,
    trimmedSections: [],
    analysis: {
      taskType: 'general',
      complexity: 'simple',
      requiresMemory: true,
      requiresProjectContext: true,
      keywords: [],
      entities: []
    }
  };

  // PRE-ALLOCATED keyword/entity arrays
  private keywordBuffer: string[] = new Array(20);
  private entityBuffer: string[] = new Array(20);

  constructor(config: Partial<ContextBuilderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Reset buffer lengths (keep capacity)
    this.sectionBuffer.length = 0;
    this.includedBuffer.length = 0;
    this.trimmedBuffer.length = 0;
    this.assemblyParts.length = 0;
    this.keywordBuffer.length = 0;
    this.entityBuffer.length = 0;
  }

  async build(
    originalSystem: string | any[],
    request: { messages: any[]; projectPath?: string; sessionId?: string; tools?: any[] }
  ): Promise<ContextBuildResult> {
    // Reset pre-allocated buffers (keeps allocated memory)
    this.sectionBuffer.length = 0;
    this.includedBuffer.length = 0;
    this.trimmedBuffer.length = 0;
    this.assemblyParts.length = 0;

    // ... rest of build logic using pre-allocated buffers ...

    // Reuse result template
    this.resultTemplate.systemPrompt = assembledPrompt;
    this.resultTemplate.sections = [...this.includedBuffer];  // Copy refs
    this.resultTemplate.totalTokens = totalTokens;
    this.resultTemplate.trimmedSections = [...this.trimmedBuffer];
    // Analysis is mutated in place

    return this.resultTemplate;
  }
}
```

#### 8.1.6 HTTP/Fetch Pre-Allocation
- [ ] **8.1.6.1** Pre-create fetch headers objects
- [ ] **8.1.6.2** Pre-allocate request body buffers
- [ ] **8.1.6.3** Reuse AbortController instances where safe
- [ ] **8.1.6.4** Pre-allocate URL objects

```typescript
// src/utils/http.ts - Pre-allocated HTTP resources

// Pre-allocated headers templates
export const preAllocatedHeaders = {
  json: new Headers({
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }),

  sse: new Headers({
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream'
  }),

  embedding: new Headers({
    'Content-Type': 'application/json'
  })
};

// Clone headers for modification (faster than creating new)
export function getHeaders(template: 'json' | 'sse' | 'embedding', apiKey?: string): Headers {
  const headers = new Headers(preAllocatedHeaders[template]);
  if (apiKey) {
    headers.set('Authorization', `Bearer ${apiKey}`);
  }
  return headers;
}

// Pre-allocated request options template
export const requestOptionsTemplate: RequestInit = {
  method: 'POST',
  headers: undefined,
  body: undefined,
  signal: undefined
};

// Reusable JSON stringifier with pre-allocated buffer
class FastJSONStringifier {
  private encoder = new TextEncoder();
  private buffer = new Uint8Array(1024 * 1024);  // 1MB pre-allocated

  stringify(obj: any): string {
    // Use native JSON.stringify (V8 optimizes this heavily)
    return JSON.stringify(obj);
  }

  stringifyToBuffer(obj: any): Uint8Array {
    const json = JSON.stringify(obj);
    const encoded = this.encoder.encode(json);

    if (encoded.length > this.buffer.length) {
      // Grow buffer if needed
      this.buffer = new Uint8Array(encoded.length * 2);
    }

    this.buffer.set(encoded);
    return this.buffer.subarray(0, encoded.length);
  }
}

export const jsonStringifier = new FastJSONStringifier();
```

#### 8.1.7 Startup Pre-Warming
- [ ] **8.1.7.1** Create `prewarm()` function called at startup
- [ ] **8.1.7.2** Pre-load frequent memories into cache
- [ ] **8.1.7.3** Pre-warm embedding provider connection
- [ ] **8.1.7.4** Pre-compile regex patterns
- [ ] **8.1.7.5** Pre-allocate tiktoken encoder

```typescript
// src/utils/prewarm.ts

import { embeddingBuffers1536, embeddingBuffers768 } from './buffers';
import { contextSectionPool, searchResultPool } from './pool';
import { embeddingCache, sessionCache } from './cache';
import { getMemoryService } from '../memory';
import { getContextBuilder } from '../context';

// Pre-compiled regex patterns (allocated once)
export const PRECOMPILED_PATTERNS = {
  rememberTag: /<remember\s+scope="(global|project)"\s+category="(\w+)">([\s\S]*?)<\/remember>/g,
  preferenceExtract: /(?:user prefers?|always use|never use|I (?:like|prefer|want))\s+(.+?)(?:\.|$)/gi,
  decisionExtract: /(?:decided to|choosing|went with|using)\s+(.+?)\s+(?:for|because|since)/gi,
  filePathExtract: /[\w\-\/]+\.(ts|js|tsx|jsx|py|go|rs|java|cpp|c|h|css|scss|html|json|yaml|yml|md|txt)/g,
  camelCaseExtract: /\b[A-Z][a-zA-Z0-9]+\b|\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g,
  wordSplit: /\s+/,
};

// Pre-allocated stop words set
export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
  'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs'
]);

export async function prewarm(config: any): Promise<void> {
  console.log('[Prewarm] Starting pre-allocation and cache warming...');
  const start = Date.now();

  // 1. Pre-warm object pools
  contextSectionPool.prewarm(100);
  searchResultPool.prewarm(200);
  console.log('[Prewarm] Object pools ready');

  // 2. Pre-warm embedding buffers (already done at module load)
  console.log(`[Prewarm] Embedding buffers: 1536=${embeddingBuffers1536.available}, 768=${embeddingBuffers768.available}`);

  // 3. Pre-load high-importance memories into cache
  if (config.Memory?.enabled) {
    try {
      const memoryService = getMemoryService();
      // Trigger a dummy recall to warm up the embedding provider connection
      await memoryService.recall('warmup query', { scope: 'global', limit: 1 });
      console.log('[Prewarm] Memory service warmed');
    } catch (e) {
      console.log('[Prewarm] Memory service not ready yet');
    }
  }

  // 4. Pre-initialize context builder
  getContextBuilder(config.Context);
  console.log('[Prewarm] Context builder ready');

  // 5. Pre-warm tiktoken (if used)
  try {
    const { get_encoding } = await import('tiktoken');
    const enc = get_encoding('cl100k_base');
    enc.encode('warmup');  // Force initialization
    enc.free();
    console.log('[Prewarm] Tiktoken encoder ready');
  } catch (e) {
    console.log('[Prewarm] Tiktoken not available');
  }

  const elapsed = Date.now() - start;
  console.log(`[Prewarm] Complete in ${elapsed}ms`);
}
```

#### 8.1.8 Memory Layout Optimization
- [ ] **8.1.8.1** Use TypedArrays for numeric data
- [ ] **8.1.8.2** Avoid object property access in hot loops
- [ ] **8.1.8.3** Use ArrayBuffer views for embedding storage
- [ ] **8.1.8.4** Align data structures for cache efficiency

```typescript
// src/memory/optimized-storage.ts

// Optimized embedding storage using ArrayBuffer
export class EmbeddingStore {
  private buffer: ArrayBuffer;
  private view: Float32Array;
  private idMap: Map<string, number> = new Map();
  private dimensions: number;
  private capacity: number;
  private count: number = 0;

  constructor(dimensions: number, capacity: number) {
    this.dimensions = dimensions;
    this.capacity = capacity;

    // Pre-allocate contiguous memory for all embeddings
    // This is MUCH faster than individual Float32Arrays
    const totalFloats = dimensions * capacity;
    this.buffer = new ArrayBuffer(totalFloats * 4);  // 4 bytes per float
    this.view = new Float32Array(this.buffer);
  }

  add(id: string, embedding: Float32Array): boolean {
    if (this.count >= this.capacity) {
      return false;  // Full
    }

    const offset = this.count * this.dimensions;
    this.view.set(embedding, offset);
    this.idMap.set(id, this.count);
    this.count++;
    return true;
  }

  get(id: string): Float32Array | null {
    const index = this.idMap.get(id);
    if (index === undefined) return null;

    const offset = index * this.dimensions;
    // Return a view into the buffer (no copy!)
    return this.view.subarray(offset, offset + this.dimensions);
  }

  // Optimized cosine similarity search
  // Uses SIMD-friendly loop structure
  findSimilar(query: Float32Array, topK: number): { id: string; score: number }[] {
    const results: { index: number; score: number }[] = [];

    // Pre-compute query norm
    let queryNorm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      queryNorm += query[i] * query[i];
    }
    queryNorm = Math.sqrt(queryNorm);

    // Search all embeddings
    for (let idx = 0; idx < this.count; idx++) {
      const offset = idx * this.dimensions;

      let dotProduct = 0;
      let embNorm = 0;

      // Unrolled loop for better performance
      const end = offset + this.dimensions;
      for (let i = offset; i < end; i += 4) {
        const q0 = query[i - offset], q1 = query[i - offset + 1];
        const q2 = query[i - offset + 2], q3 = query[i - offset + 3];
        const e0 = this.view[i], e1 = this.view[i + 1];
        const e2 = this.view[i + 2], e3 = this.view[i + 3];

        dotProduct += q0 * e0 + q1 * e1 + q2 * e2 + q3 * e3;
        embNorm += e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3;
      }

      const score = dotProduct / (queryNorm * Math.sqrt(embNorm));
      results.push({ index: idx, score });
    }

    // Partial sort for top K
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);

    // Convert indices to IDs
    const idArray = Array.from(this.idMap.entries());
    return topResults.map(r => ({
      id: idArray.find(([_, idx]) => idx === r.index)![0],
      score: r.score
    }));
  }

  get size(): number {
    return this.count;
  }

  get memoryUsageBytes(): number {
    return this.buffer.byteLength;
  }
}
```

---

### 8.2 Pre-Allocation Summary Table

| Resource | Pre-Allocated Count | Memory | Purpose |
|----------|--------------------:|-------:|---------|
| ContextSection pool | 100 | ~50KB | Avoid alloc during context build |
| MemorySearchResult pool | 200 | ~20KB | Avoid alloc during search |
| Embedding buffers (1536d) | 50 | ~300KB | OpenAI embeddings |
| Embedding buffers (768d) | 50 | ~150KB | Local embeddings |
| Response buffers | 20 | ~10MB | SSE response accumulation |
| String builder arrays | 50 | ~5KB | Prompt assembly |
| LRU cache (embeddings) | 2000 | ~12MB | Embedding cache |
| LRU cache (sessions) | 500 | ~50KB | Session state |
| LRU cache (tokens) | 5000 | ~100KB | Token count cache |
| Prepared SQL statements | 15 | ~10KB | Database queries |
| Regex patterns | 6 | ~2KB | Text extraction |
| **TOTAL** | - | **~23MB** | Startup allocation |

---

### 8.3 Performance Targets

| Metric | Target | How to Achieve |
|--------|--------|----------------|
| Context build time | < 5ms | Pre-allocated buffers, no runtime allocs |
| Memory recall time | < 10ms | Pre-compiled SQL, embedding cache |
| Prompt assembly time | < 1ms | Pre-allocated string arrays |
| Embedding lookup | < 1ms | In-memory cache hit |
| GC pauses | < 5ms | Object pooling, buffer reuse |
| Memory footprint | < 50MB | Fixed pre-allocation, bounded caches |
| Startup time | < 500ms | Lazy loading non-critical, async prewarm |

---

### 8.4 Monitoring Pre-Allocation Health

```typescript
// src/utils/pool-monitor.ts

export function getPoolStats() {
  return {
    contextSections: {
      available: contextSectionPool.available,
      // Add peak usage tracking
    },
    searchResults: {
      available: searchResultPool.available,
    },
    embeddingBuffers: {
      '1536': embeddingBuffers1536.available,
      '768': embeddingBuffers768.available,
    },
    responseBuffers: {
      available: responseBufferPool.available,
    },
    caches: {
      embeddings: embeddingCache.size,
      sessions: sessionCache.size,
      tokens: tokenCountCache.size,
    }
  };
}

// Log pool stats periodically
export function startPoolMonitoring(intervalMs: number = 60000) {
  setInterval(() => {
    const stats = getPoolStats();
    console.log('[Pool Monitor]', JSON.stringify(stats));

    // Warn if pools are getting exhausted
    if (contextSectionPool.available < 10) {
      console.warn('[Pool Monitor] ContextSection pool running low!');
    }
    if (searchResultPool.available < 20) {
      console.warn('[Pool Monitor] SearchResult pool running low!');
    }
  }, intervalMs);
}
```

---

### 8.5 Implementation Checklist Summary

- [ ] **8.5.1** Create `src/utils/pool.ts` with ObjectPool class
- [ ] **8.5.2** Create `src/utils/buffers.ts` with buffer pools
- [ ] **8.5.3** Enhance `src/memory/database.ts` with prepared statements
- [ ] **8.5.4** Create `src/utils/cache.ts` with pre-sized LRU
- [ ] **8.5.5** Enhance `src/context/builder.ts` with buffer reuse
- [ ] **8.5.6** Create `src/utils/http.ts` with pre-allocated headers
- [ ] **8.5.7** Create `src/utils/prewarm.ts` with startup routine
- [ ] **8.5.8** Create `src/memory/optimized-storage.ts` for embeddings
- [ ] **8.5.9** Create `src/utils/pool-monitor.ts` for health checks
- [ ] **8.5.10** Add prewarm call to server startup in `src/index.ts`
- [ ] **8.5.11** Benchmark before/after pre-allocation
- [ ] **8.5.12** Profile with Chrome DevTools to verify no runtime allocs in hot path
