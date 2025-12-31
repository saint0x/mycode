/**
 * Memory Database - Stoar-compatible SQLite storage
 *
 * Uses Bun's native SQLite driver (bun:sqlite) for best performance
 *
 * Uses stoar's schema:
 * - __meta: System metadata (key, value)
 * - __objects: Blob storage for embeddings (key, data, mime_type, size, hash, created_at, updated_at)
 * - {collection}: Dynamic JSON collections (key, data as JSON text)
 */

import { Database, type Statement } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { v4 as uuid } from 'uuid';
import type { Memory, StoarMemoryRecord, BlobMeta } from './types';
import {
  DatabaseError,
  ErrorCode,
  wrapDatabaseError,
  type Result,
} from '../errors';

// Stoar-compatible schema initialization
const SCHEMA = `
-- System metadata table (stoar format)
CREATE TABLE IF NOT EXISTS __meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Blob storage for embeddings (stoar format)
CREATE TABLE IF NOT EXISTS __objects (
  key TEXT PRIMARY KEY,
  data BLOB NOT NULL,
  mime_type TEXT,
  size INTEGER,
  hash TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- Global memories collection
CREATE TABLE IF NOT EXISTS global_memories (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

-- Project memories collection
CREATE TABLE IF NOT EXISTS project_memories (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_objects_created ON __objects(created_at);
`;

export class MemoryDatabase {
  private db: Database;
  private static instance: MemoryDatabase | null = null;
  private readonly dbPath: string;

  // Pre-compiled prepared statements
  private stmts!: {
    // Meta operations
    getMeta: Statement;
    setMeta: Statement;

    // Blob operations
    writeBlob: Statement;
    readBlob: Statement;
    blobMeta: Statement;
    deleteBlob: Statement;

    // Global memories
    putGlobal: Statement;
    getGlobal: Statement;
    deleteGlobal: Statement;
    allGlobal: Statement;
    countGlobal: Statement;

    // Project memories
    putProject: Statement;
    getProject: Statement;
    deleteProject: Statement;
    allProject: Statement;
    countProject: Statement;
  };

  private constructor(dbPath: string) {
    this.dbPath = dbPath;

    try {
      // Ensure directory exists
      mkdirSync(dirname(dbPath), { recursive: true });
    } catch (error) {
      throw new DatabaseError(
        `Failed to create database directory: ${dirname(dbPath)}`,
        {
          code: ErrorCode.DATABASE_CONNECTION_FAILED,
          operation: 'init_directory',
          cause: error instanceof Error ? error : undefined,
          details: { dbPath, directory: dirname(dbPath) },
        }
      );
    }

    try {
      this.db = new Database(dbPath);
    } catch (error) {
      throw new DatabaseError(
        `Failed to open database at ${dbPath}`,
        {
          code: ErrorCode.DATABASE_CONNECTION_FAILED,
          operation: 'open_database',
          cause: error instanceof Error ? error : undefined,
          details: { dbPath },
        }
      );
    }

    try {
      // Stoar-compatible pragmas
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = NORMAL');
      this.db.exec('PRAGMA cache_size = 10000');
      this.db.exec('PRAGMA foreign_keys = ON');
    } catch (error) {
      throw new DatabaseError(
        'Failed to configure database pragmas',
        {
          code: ErrorCode.DATABASE_SCHEMA_ERROR,
          operation: 'configure_pragmas',
          cause: error instanceof Error ? error : undefined,
          details: { dbPath },
        }
      );
    }

    try {
      // Initialize schema
      this.db.exec(SCHEMA);
    } catch (error) {
      throw new DatabaseError(
        'Failed to initialize database schema',
        {
          code: ErrorCode.DATABASE_SCHEMA_ERROR,
          operation: 'init_schema',
          cause: error instanceof Error ? error : undefined,
          details: { dbPath },
        }
      );
    }

    // Initialize meta
    this.initMeta();

    // Pre-compile statements
    this.prepareStatements();
  }

  private initMeta(): void {
    const instanceId = uuid();
    const now = Date.now();

    try {
      this.db.prepare(`INSERT OR IGNORE INTO __meta VALUES (?, ?)`).run('instance_id', instanceId);
      this.db.prepare(`INSERT OR IGNORE INTO __meta VALUES (?, ?)`).run('schema_version', '1');
      this.db.prepare(`INSERT OR IGNORE INTO __meta VALUES (?, ?)`).run('initialized_at', now.toString());
    } catch (error) {
      throw wrapDatabaseError(error, 'init_meta', { instanceId });
    }
  }

  private prepareStatements(): void {
    try {
      this.stmts = {
        // Meta
        getMeta: this.db.prepare('SELECT value FROM __meta WHERE key = ?'),
        setMeta: this.db.prepare('INSERT OR REPLACE INTO __meta (key, value) VALUES (?, ?)'),

        // Blobs
        writeBlob: this.db.prepare(`
          INSERT OR REPLACE INTO __objects (key, data, mime_type, size, hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `),
        readBlob: this.db.prepare('SELECT data FROM __objects WHERE key = ?'),
        blobMeta: this.db.prepare('SELECT key, mime_type, size, hash, created_at, updated_at FROM __objects WHERE key = ?'),
        deleteBlob: this.db.prepare('DELETE FROM __objects WHERE key = ?'),

        // Global memories
        putGlobal: this.db.prepare('INSERT OR REPLACE INTO global_memories (key, data) VALUES (?, ?)'),
        getGlobal: this.db.prepare('SELECT data FROM global_memories WHERE key = ?'),
        deleteGlobal: this.db.prepare('DELETE FROM global_memories WHERE key = ?'),
        allGlobal: this.db.prepare('SELECT key, data FROM global_memories'),
        countGlobal: this.db.prepare('SELECT COUNT(*) as count FROM global_memories'),

        // Project memories
        putProject: this.db.prepare('INSERT OR REPLACE INTO project_memories (key, data) VALUES (?, ?)'),
        getProject: this.db.prepare('SELECT data FROM project_memories WHERE key = ?'),
        deleteProject: this.db.prepare('DELETE FROM project_memories WHERE key = ?'),
        allProject: this.db.prepare('SELECT key, data FROM project_memories'),
        countProject: this.db.prepare('SELECT COUNT(*) as count FROM project_memories'),
      };
    } catch (error) {
      throw new DatabaseError(
        'Failed to prepare SQL statements',
        {
          code: ErrorCode.DATABASE_SCHEMA_ERROR,
          operation: 'prepare_statements',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  static getInstance(dbPath: string): MemoryDatabase {
    if (!MemoryDatabase.instance) {
      MemoryDatabase.instance = new MemoryDatabase(dbPath);
    }
    return MemoryDatabase.instance;
  }

  static resetInstance(): void {
    if (MemoryDatabase.instance) {
      try {
        MemoryDatabase.instance.close();
      } catch (error) {
        // Log but don't throw - we're cleaning up
        console.error('[MemoryDatabase] Error closing instance:', error);
      }
      MemoryDatabase.instance = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // META OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  getMeta(key: string): string | undefined {
    try {
      const row = this.stmts.getMeta.get(key) as { value: string } | null;
      return row?.value;
    } catch (error) {
      throw wrapDatabaseError(error, 'get_meta', { key });
    }
  }

  setMeta(key: string, value: string): void {
    try {
      this.stmts.setMeta.run(key, value);
    } catch (error) {
      throw wrapDatabaseError(error, 'set_meta', { key, valueLength: value.length });
    }
  }

  instanceId(): string {
    try {
      return this.getMeta('instance_id') || 'unknown';
    } catch (error) {
      // Non-critical - return fallback
      console.error('[MemoryDatabase] Failed to get instance_id:', error);
      return 'unknown';
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // BLOB OPERATIONS (for embeddings)
  // ═══════════════════════════════════════════════════════════════════

  writeBlob(key: string, data: Buffer, mimeType?: string): void {
    try {
      const now = Date.now();
      const hash = this.simpleHash(data);
      this.stmts.writeBlob.run(key, data, mimeType || null, data.length, hash, now, now);
    } catch (error) {
      throw new DatabaseError(
        `Failed to write blob: ${key}`,
        {
          code: ErrorCode.DATABASE_WRITE_FAILED,
          operation: 'write_blob',
          cause: error instanceof Error ? error : undefined,
          details: { key, size: data.length, mimeType },
        }
      );
    }
  }

  readBlob(key: string): Buffer | null {
    try {
      const row = this.stmts.readBlob.get(key) as { data: Buffer } | null;
      return row?.data || null;
    } catch (error) {
      throw new DatabaseError(
        `Failed to read blob: ${key}`,
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'read_blob',
          cause: error instanceof Error ? error : undefined,
          details: { key },
        }
      );
    }
  }

  blobMeta(key: string): BlobMeta | null {
    try {
      const row = this.stmts.blobMeta.get(key) as {
        key: string;
        mime_type: string | null;
        size: number;
        hash: string | null;
        created_at: number;
        updated_at: number;
      } | null;

      if (!row) return null;

      return {
        key: row.key,
        mimeType: row.mime_type || undefined,
        size: row.size,
        hash: row.hash || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      throw wrapDatabaseError(error, 'blob_meta', { key });
    }
  }

  deleteBlob(key: string): void {
    try {
      this.stmts.deleteBlob.run(key);
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete blob: ${key}`,
        {
          code: ErrorCode.DATABASE_WRITE_FAILED,
          operation: 'delete_blob',
          cause: error instanceof Error ? error : undefined,
          details: { key },
        }
      );
    }
  }

  // Write embedding as blob
  writeEmbedding(memoryId: string, embedding: Float32Array): string {
    const key = `embeddings/${memoryId}`;
    try {
      const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
      this.writeBlob(key, buffer, 'application/octet-stream');
      return key;
    } catch (error) {
      // Re-throw if already a DatabaseError
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to write embedding for memory: ${memoryId}`,
        {
          code: ErrorCode.DATABASE_WRITE_FAILED,
          operation: 'write_embedding',
          cause: error instanceof Error ? error : undefined,
          details: { memoryId, embeddingSize: embedding.length },
        }
      );
    }
  }

  // Read embedding from blob
  readEmbedding(memoryId: string): Float32Array | null {
    const key = `embeddings/${memoryId}`;
    try {
      const buffer = this.readBlob(key);
      if (!buffer) return null;

      // Create a new ArrayBuffer and copy the data to avoid alignment issues
      const arrayBuffer = new ArrayBuffer(buffer.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < buffer.length; i++) {
        view[i] = buffer[i];
      }
      return new Float32Array(arrayBuffer);
    } catch (error) {
      // Re-throw if already a DatabaseError
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to read embedding for memory: ${memoryId}`,
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'read_embedding',
          cause: error instanceof Error ? error : undefined,
          details: { memoryId },
        }
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // GLOBAL MEMORY OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  saveGlobalMemory(memory: Memory): void {
    try {
      const record: StoarMemoryRecord = {
        ...memory,
        embeddingKey: `embeddings/${memory.id}`,
      };
      this.stmts.putGlobal.run(memory.id, JSON.stringify(record));
    } catch (error) {
      throw new DatabaseError(
        `Failed to save global memory: ${memory.id}`,
        {
          code: ErrorCode.DATABASE_WRITE_FAILED,
          operation: 'save_global_memory',
          cause: error instanceof Error ? error : undefined,
          details: { memoryId: memory.id, category: memory.category },
        }
      );
    }
  }

  getGlobalMemory(id: string): Memory | null {
    try {
      const row = this.stmts.getGlobal.get(id) as { data: string } | null;
      if (!row) return null;
      return this.recordToMemory(JSON.parse(row.data));
    } catch (error) {
      throw new DatabaseError(
        `Failed to get global memory: ${id}`,
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'get_global_memory',
          cause: error instanceof Error ? error : undefined,
          details: { memoryId: id },
        }
      );
    }
  }

  deleteGlobalMemory(id: string): void {
    try {
      this.stmts.deleteGlobal.run(id);
      this.deleteBlob(`embeddings/${id}`);
    } catch (error) {
      // Re-throw if already a DatabaseError
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to delete global memory: ${id}`,
        {
          code: ErrorCode.DATABASE_WRITE_FAILED,
          operation: 'delete_global_memory',
          cause: error instanceof Error ? error : undefined,
          details: { memoryId: id },
        }
      );
    }
  }

  getAllGlobalMemories(): Memory[] {
    try {
      const rows = this.stmts.allGlobal.all() as { key: string; data: string }[];
      return rows.map(row => this.recordToMemory(JSON.parse(row.data)));
    } catch (error) {
      throw new DatabaseError(
        'Failed to get all global memories',
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'get_all_global_memories',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  countGlobalMemories(): number {
    try {
      const row = this.stmts.countGlobal.get() as { count: number };
      return row.count;
    } catch (error) {
      throw wrapDatabaseError(error, 'count_global_memories');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROJECT MEMORY OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  saveProjectMemory(memory: Memory): void {
    try {
      const record: StoarMemoryRecord = {
        ...memory,
        embeddingKey: `embeddings/${memory.id}`,
      };
      this.stmts.putProject.run(memory.id, JSON.stringify(record));
    } catch (error) {
      throw new DatabaseError(
        `Failed to save project memory: ${memory.id}`,
        {
          code: ErrorCode.DATABASE_WRITE_FAILED,
          operation: 'save_project_memory',
          cause: error instanceof Error ? error : undefined,
          details: { memoryId: memory.id, category: memory.category, projectPath: memory.projectPath },
        }
      );
    }
  }

  getProjectMemory(id: string): Memory | null {
    try {
      const row = this.stmts.getProject.get(id) as { data: string } | null;
      if (!row) return null;
      return this.recordToMemory(JSON.parse(row.data));
    } catch (error) {
      throw new DatabaseError(
        `Failed to get project memory: ${id}`,
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'get_project_memory',
          cause: error instanceof Error ? error : undefined,
          details: { memoryId: id },
        }
      );
    }
  }

  deleteProjectMemory(id: string): void {
    try {
      this.stmts.deleteProject.run(id);
      this.deleteBlob(`embeddings/${id}`);
    } catch (error) {
      // Re-throw if already a DatabaseError
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to delete project memory: ${id}`,
        {
          code: ErrorCode.DATABASE_WRITE_FAILED,
          operation: 'delete_project_memory',
          cause: error instanceof Error ? error : undefined,
          details: { memoryId: id },
        }
      );
    }
  }

  getAllProjectMemories(): Memory[] {
    try {
      const rows = this.stmts.allProject.all() as { key: string; data: string }[];
      return rows.map(row => this.recordToMemory(JSON.parse(row.data)));
    } catch (error) {
      throw new DatabaseError(
        'Failed to get all project memories',
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'get_all_project_memories',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  getProjectMemoriesByPath(projectPath: string): Memory[] {
    try {
      return this.getAllProjectMemories().filter(m => m.projectPath === projectPath);
    } catch (error) {
      // Re-throw if already a DatabaseError
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to get project memories for path: ${projectPath}`,
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'get_project_memories_by_path',
          cause: error instanceof Error ? error : undefined,
          details: { projectPath },
        }
      );
    }
  }

  countProjectMemories(): number {
    try {
      const row = this.stmts.countProject.get() as { count: number };
      return row.count;
    } catch (error) {
      throw wrapDatabaseError(error, 'count_project_memories');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SEARCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  // Get all embeddings for vector search
  getAllGlobalEmbeddings(): { id: string; embedding: Float32Array }[] {
    try {
      const memories = this.getAllGlobalMemories();
      const results: { id: string; embedding: Float32Array }[] = [];
      const errors: string[] = [];

      for (const memory of memories) {
        try {
          const embedding = this.readEmbedding(memory.id);
          if (embedding) {
            results.push({ id: memory.id, embedding });
          }
        } catch (error) {
          // Collect errors but continue processing
          errors.push(`${memory.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Log any errors but return partial results
      if (errors.length > 0) {
        console.warn(`[MemoryDatabase] ${errors.length} embedding read errors:`, errors.slice(0, 5));
      }

      return results;
    } catch (error) {
      // Re-throw if already a DatabaseError
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        'Failed to get all global embeddings',
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'get_all_global_embeddings',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  getAllProjectEmbeddings(projectPath: string): { id: string; embedding: Float32Array }[] {
    try {
      const memories = this.getProjectMemoriesByPath(projectPath);
      const results: { id: string; embedding: Float32Array }[] = [];
      const errors: string[] = [];

      for (const memory of memories) {
        try {
          const embedding = this.readEmbedding(memory.id);
          if (embedding) {
            results.push({ id: memory.id, embedding });
          }
        } catch (error) {
          // Collect errors but continue processing
          errors.push(`${memory.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Log any errors but return partial results
      if (errors.length > 0) {
        console.warn(`[MemoryDatabase] ${errors.length} embedding read errors for ${projectPath}:`, errors.slice(0, 5));
      }

      return results;
    } catch (error) {
      // Re-throw if already a DatabaseError
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to get project embeddings for: ${projectPath}`,
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'get_all_project_embeddings',
          cause: error instanceof Error ? error : undefined,
          details: { projectPath },
        }
      );
    }
  }

  // Update access metadata
  touchMemory(id: string, scope: 'global' | 'project'): void {
    try {
      const memory = scope === 'global'
        ? this.getGlobalMemory(id)
        : this.getProjectMemory(id);

      if (memory) {
        memory.accessCount++;
        memory.lastAccessedAt = Date.now();

        if (scope === 'global') {
          this.saveGlobalMemory(memory);
        } else {
          this.saveProjectMemory(memory);
        }
      }
    } catch (error) {
      // Re-throw if already a DatabaseError
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Failed to touch memory: ${id}`,
        {
          code: ErrorCode.DATABASE_WRITE_FAILED,
          operation: 'touch_memory',
          cause: error instanceof Error ? error : undefined,
          details: { memoryId: id, scope },
        }
      );
    }
  }

  // Cleanup old/unimportant memories
  cleanup(minImportance: number, maxAgeDays: number): number {
    const maxAge = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let deleted = 0;
    const errors: string[] = [];

    try {
      // Cleanup global
      const globalMemories = this.getAllGlobalMemories();
      for (const memory of globalMemories) {
        if (memory.importance < minImportance && memory.createdAt < maxAge && memory.accessCount < 3) {
          try {
            this.deleteGlobalMemory(memory.id);
            deleted++;
          } catch (error) {
            errors.push(`global/${memory.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // Cleanup project
      const projectMemories = this.getAllProjectMemories();
      for (const memory of projectMemories) {
        if (memory.importance < minImportance && memory.createdAt < maxAge && memory.accessCount < 3) {
          try {
            this.deleteProjectMemory(memory.id);
            deleted++;
          } catch (error) {
            errors.push(`project/${memory.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // Log errors if any occurred
      if (errors.length > 0) {
        console.warn(`[MemoryDatabase] ${errors.length} cleanup errors:`, errors.slice(0, 5));
      }

      return deleted;
    } catch (error) {
      // Re-throw if already a DatabaseError
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        'Failed to cleanup memories',
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'cleanup',
          cause: error instanceof Error ? error : undefined,
          details: { minImportance, maxAgeDays, deletedBeforeError: deleted },
        }
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════

  transaction<T>(fn: () => T): T {
    try {
      const txFn = this.db.transaction(fn);
      return txFn();
    } catch (error) {
      throw new DatabaseError(
        'Transaction failed',
        {
          code: ErrorCode.DATABASE_WRITE_FAILED,
          operation: 'transaction',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private recordToMemory(record: StoarMemoryRecord): Memory {
    // Validate required fields
    if (!record.id || !record.content) {
      throw new DatabaseError(
        'Invalid memory record: missing required fields',
        {
          code: ErrorCode.DATABASE_QUERY_FAILED,
          operation: 'record_to_memory',
          details: { hasId: !!record.id, hasContent: !!record.content },
        }
      );
    }

    return {
      id: record.id,
      content: record.content,
      category: record.category,
      scope: record.scope,
      projectPath: record.projectPath,
      importance: record.importance,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      accessCount: record.accessCount,
      lastAccessedAt: record.lastAccessedAt,
      metadata: record.metadata,
    };
  }

  private simpleHash(data: Buffer): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data[i];
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  close(): void {
    try {
      this.db.close();
    } catch (error) {
      throw new DatabaseError(
        'Failed to close database',
        {
          code: ErrorCode.DATABASE_CONNECTION_LOST,
          operation: 'close',
          cause: error instanceof Error ? error : undefined,
          details: { dbPath: this.dbPath },
        }
      );
    }
  }

  // Get database path (for debugging/logging)
  getDbPath(): string {
    return this.dbPath;
  }
}
