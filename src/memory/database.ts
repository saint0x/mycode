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
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);

    // Stoar-compatible pragmas
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA cache_size = 10000');
    this.db.exec('PRAGMA foreign_keys = ON');

    // Initialize schema
    this.db.exec(SCHEMA);

    // Initialize meta
    this.initMeta();

    // Pre-compile statements
    this.prepareStatements();
  }

  private initMeta(): void {
    const instanceId = uuid();
    const now = Date.now();

    this.db.prepare(`INSERT OR IGNORE INTO __meta VALUES (?, ?)`).run('instance_id', instanceId);
    this.db.prepare(`INSERT OR IGNORE INTO __meta VALUES (?, ?)`).run('schema_version', '1');
    this.db.prepare(`INSERT OR IGNORE INTO __meta VALUES (?, ?)`).run('initialized_at', now.toString());
  }

  private prepareStatements(): void {
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
  }

  static getInstance(dbPath: string): MemoryDatabase {
    if (!MemoryDatabase.instance) {
      MemoryDatabase.instance = new MemoryDatabase(dbPath);
    }
    return MemoryDatabase.instance;
  }

  static resetInstance(): void {
    if (MemoryDatabase.instance) {
      MemoryDatabase.instance.close();
      MemoryDatabase.instance = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // META OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  getMeta(key: string): string | undefined {
    const row = this.stmts.getMeta.get(key) as { value: string } | null;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.stmts.setMeta.run(key, value);
  }

  instanceId(): string {
    return this.getMeta('instance_id') || 'unknown';
  }

  // ═══════════════════════════════════════════════════════════════════
  // BLOB OPERATIONS (for embeddings)
  // ═══════════════════════════════════════════════════════════════════

  writeBlob(key: string, data: Buffer, mimeType?: string): void {
    const now = Date.now();
    const hash = this.simpleHash(data);
    this.stmts.writeBlob.run(key, data, mimeType || null, data.length, hash, now, now);
  }

  readBlob(key: string): Buffer | null {
    const row = this.stmts.readBlob.get(key) as { data: Buffer } | null;
    return row?.data || null;
  }

  blobMeta(key: string): BlobMeta | null {
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
  }

  deleteBlob(key: string): void {
    this.stmts.deleteBlob.run(key);
  }

  // Write embedding as blob
  writeEmbedding(memoryId: string, embedding: Float32Array): string {
    const key = `embeddings/${memoryId}`;
    const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    this.writeBlob(key, buffer, 'application/octet-stream');
    return key;
  }

  // Read embedding from blob
  readEmbedding(memoryId: string): Float32Array | null {
    const key = `embeddings/${memoryId}`;
    const buffer = this.readBlob(key);
    if (!buffer) return null;

    // Create a new ArrayBuffer and copy the data to avoid alignment issues
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; i++) {
      view[i] = buffer[i];
    }
    return new Float32Array(arrayBuffer);
  }

  // ═══════════════════════════════════════════════════════════════════
  // GLOBAL MEMORY OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  saveGlobalMemory(memory: Memory): void {
    const record: StoarMemoryRecord = {
      ...memory,
      embeddingKey: `embeddings/${memory.id}`,
    };
    this.stmts.putGlobal.run(memory.id, JSON.stringify(record));
  }

  getGlobalMemory(id: string): Memory | null {
    const row = this.stmts.getGlobal.get(id) as { data: string } | null;
    if (!row) return null;
    return this.recordToMemory(JSON.parse(row.data));
  }

  deleteGlobalMemory(id: string): void {
    this.stmts.deleteGlobal.run(id);
    this.deleteBlob(`embeddings/${id}`);
  }

  getAllGlobalMemories(): Memory[] {
    const rows = this.stmts.allGlobal.all() as { key: string; data: string }[];
    return rows.map(row => this.recordToMemory(JSON.parse(row.data)));
  }

  countGlobalMemories(): number {
    const row = this.stmts.countGlobal.get() as { count: number };
    return row.count;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROJECT MEMORY OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  saveProjectMemory(memory: Memory): void {
    const record: StoarMemoryRecord = {
      ...memory,
      embeddingKey: `embeddings/${memory.id}`,
    };
    this.stmts.putProject.run(memory.id, JSON.stringify(record));
  }

  getProjectMemory(id: string): Memory | null {
    const row = this.stmts.getProject.get(id) as { data: string } | null;
    if (!row) return null;
    return this.recordToMemory(JSON.parse(row.data));
  }

  deleteProjectMemory(id: string): void {
    this.stmts.deleteProject.run(id);
    this.deleteBlob(`embeddings/${id}`);
  }

  getAllProjectMemories(): Memory[] {
    const rows = this.stmts.allProject.all() as { key: string; data: string }[];
    return rows.map(row => this.recordToMemory(JSON.parse(row.data)));
  }

  getProjectMemoriesByPath(projectPath: string): Memory[] {
    return this.getAllProjectMemories().filter(m => m.projectPath === projectPath);
  }

  countProjectMemories(): number {
    const row = this.stmts.countProject.get() as { count: number };
    return row.count;
  }

  // ═══════════════════════════════════════════════════════════════════
  // SEARCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  // Get all embeddings for vector search
  getAllGlobalEmbeddings(): { id: string; embedding: Float32Array }[] {
    const memories = this.getAllGlobalMemories();
    const results: { id: string; embedding: Float32Array }[] = [];

    for (const memory of memories) {
      const embedding = this.readEmbedding(memory.id);
      if (embedding) {
        results.push({ id: memory.id, embedding });
      }
    }

    return results;
  }

  getAllProjectEmbeddings(projectPath: string): { id: string; embedding: Float32Array }[] {
    const memories = this.getProjectMemoriesByPath(projectPath);
    const results: { id: string; embedding: Float32Array }[] = [];

    for (const memory of memories) {
      const embedding = this.readEmbedding(memory.id);
      if (embedding) {
        results.push({ id: memory.id, embedding });
      }
    }

    return results;
  }

  // Update access metadata
  touchMemory(id: string, scope: 'global' | 'project'): void {
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
  }

  // Cleanup old/unimportant memories
  cleanup(minImportance: number, maxAgeDays: number): number {
    const maxAge = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    // Cleanup global
    const globalMemories = this.getAllGlobalMemories();
    for (const memory of globalMemories) {
      if (memory.importance < minImportance && memory.createdAt < maxAge && memory.accessCount < 3) {
        this.deleteGlobalMemory(memory.id);
        deleted++;
      }
    }

    // Cleanup project
    const projectMemories = this.getAllProjectMemories();
    for (const memory of projectMemories) {
      if (memory.importance < minImportance && memory.createdAt < maxAge && memory.accessCount < 3) {
        this.deleteProjectMemory(memory.id);
        deleted++;
      }
    }

    return deleted;
  }

  // ═══════════════════════════════════════════════════════════════════
  // TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════

  transaction<T>(fn: () => T): T {
    const txFn = this.db.transaction(fn);
    return txFn();
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private recordToMemory(record: StoarMemoryRecord): Memory {
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
    this.db.close();
  }
}
