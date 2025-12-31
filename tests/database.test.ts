/**
 * Database Tests - MemoryDatabase with stoar-compatible schema
 *
 * Tests:
 * - Schema initialization
 * - Global memory CRUD
 * - Project memory CRUD
 * - Blob/embedding storage
 * - Search operations
 * - Cleanup operations
 * - Transaction safety
 */

import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { join } from 'path';
import { existsSync } from 'fs';
import { MemoryDatabase } from '../src/memory/database';
import { createLogger, TestLogger } from './helpers/logger';
import { createTempDir, cleanupTempDir, sampleMemories } from './helpers/fixtures';
import type { Memory } from '../src/memory/types';

describe('MemoryDatabase', () => {
  let tempDir: string;
  let dbPath: string;
  let db: MemoryDatabase;
  let log: TestLogger;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir, 'test-memory.db');
    log = createLogger('MemoryDatabase');
    log.info('Created temp directory', { tempDir, dbPath });

    // Reset singleton for fresh instance
    MemoryDatabase.resetInstance();
    db = MemoryDatabase.getInstance(dbPath);
    log.info('Database instance created');
  });

  afterEach(() => {
    log.finish();
    MemoryDatabase.resetInstance();
    cleanupTempDir(tempDir);
  });

  describe('Schema Initialization', () => {
    test('creates database file on disk', () => {
      log.info('Checking database file creation');

      log.assert(existsSync(dbPath), 'Database file should exist');
      log.success('Database file created successfully');
    });

    test('initializes instance_id in meta table', () => {
      log.info('Checking instance_id initialization');

      const instanceId = db.instanceId();
      log.assertDefined(instanceId, 'instanceId');
      log.assert(instanceId.length > 0, 'instanceId should not be empty');
      log.assert(instanceId !== 'unknown', 'instanceId should not be "unknown"');
      log.success('Instance ID initialized', { instanceId });
    });

    test('meta table supports get/set operations', () => {
      log.info('Testing meta table operations');

      db.setMeta('test_key', 'test_value');
      const value = db.getMeta('test_key');

      log.assertEqual(value, 'test_value', 'meta value');
      log.success('Meta operations work correctly');
    });
  });

  describe('Global Memory CRUD', () => {
    test('saves and retrieves global memory', () => {
      log.info('Testing global memory save/retrieve');

      const memory: Memory = {
        id: 'test-global-1',
        content: sampleMemories.global[0].content,
        category: sampleMemories.global[0].category,
        scope: 'global',
        importance: sampleMemories.global[0].importance,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        metadata: { source: 'test' },
      };

      db.saveGlobalMemory(memory);
      log.info('Memory saved', { id: memory.id });

      const retrieved = db.getGlobalMemory(memory.id);
      log.assertDefined(retrieved, 'retrieved memory');
      log.assertEqual(retrieved.id, memory.id, 'memory id');
      log.assertEqual(retrieved.content, memory.content, 'memory content');
      log.assertEqual(retrieved.category, memory.category, 'memory category');
      log.assertEqual(retrieved.scope, 'global', 'memory scope');
      log.assertGreaterThan(retrieved.importance, 0, 'importance');

      log.success('Global memory CRUD works correctly');
    });

    test('returns null for non-existent global memory', () => {
      log.info('Testing non-existent memory retrieval');

      const result = db.getGlobalMemory('non-existent-id');
      log.assert(result === null, 'Should return null for non-existent memory');
      log.success('Non-existent memory returns null');
    });

    test('gets all global memories', () => {
      log.info('Testing getAllGlobalMemories');

      // Save multiple memories
      for (let i = 0; i < 3; i++) {
        const memory: Memory = {
          id: `global-${i}`,
          content: `Test memory ${i}`,
          category: 'preference',
          scope: 'global',
          importance: 0.5 + i * 0.1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          metadata: {},
        };
        db.saveGlobalMemory(memory);
      }

      const all = db.getAllGlobalMemories();
      log.assertEqual(all.length, 3, 'memory count');
      log.success('getAllGlobalMemories returns correct count', { count: all.length });
    });

    test('deletes global memory and its embedding', () => {
      log.info('Testing global memory deletion');

      const memory: Memory = {
        id: 'delete-test',
        content: 'To be deleted',
        category: 'preference',
        scope: 'global',
        importance: 0.5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        metadata: {},
      };

      db.saveGlobalMemory(memory);
      db.writeEmbedding(memory.id, new Float32Array([1, 2, 3]));

      log.assert(db.getGlobalMemory(memory.id) !== null, 'Memory should exist before delete');
      log.assert(db.readEmbedding(memory.id) !== null, 'Embedding should exist before delete');

      db.deleteGlobalMemory(memory.id);

      log.assert(db.getGlobalMemory(memory.id) === null, 'Memory should be null after delete');
      log.assert(db.readEmbedding(memory.id) === null, 'Embedding should be null after delete');

      log.success('Memory and embedding deleted correctly');
    });

    test('counts global memories correctly', () => {
      log.info('Testing countGlobalMemories');

      log.assertEqual(db.countGlobalMemories(), 0, 'initial count');

      for (let i = 0; i < 5; i++) {
        db.saveGlobalMemory({
          id: `count-test-${i}`,
          content: `Memory ${i}`,
          category: 'preference',
          scope: 'global',
          importance: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          metadata: {},
        });
      }

      log.assertEqual(db.countGlobalMemories(), 5, 'final count');
      log.success('Count is accurate');
    });
  });

  describe('Project Memory CRUD', () => {
    const projectPath = '/test/project';

    test('saves and retrieves project memory', () => {
      log.info('Testing project memory save/retrieve');

      const memory: Memory = {
        id: 'test-project-1',
        content: sampleMemories.project[0].content,
        category: sampleMemories.project[0].category,
        scope: 'project',
        projectPath,
        importance: sampleMemories.project[0].importance,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        metadata: { source: 'test' },
      };

      db.saveProjectMemory(memory);
      log.info('Project memory saved', { id: memory.id, projectPath });

      const retrieved = db.getProjectMemory(memory.id);
      log.assertDefined(retrieved, 'retrieved project memory');
      log.assertEqual(retrieved.id, memory.id, 'memory id');
      log.assertEqual(retrieved.projectPath, projectPath, 'project path');
      log.assertEqual(retrieved.scope, 'project', 'memory scope');

      log.success('Project memory CRUD works correctly');
    });

    test('filters project memories by path', () => {
      log.info('Testing getProjectMemoriesByPath');

      const project1 = '/project/one';
      const project2 = '/project/two';

      // Add memories to different projects
      for (let i = 0; i < 3; i++) {
        db.saveProjectMemory({
          id: `proj1-${i}`,
          content: `Project 1 memory ${i}`,
          category: 'architecture',
          scope: 'project',
          projectPath: project1,
          importance: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          metadata: {},
        });
      }

      for (let i = 0; i < 2; i++) {
        db.saveProjectMemory({
          id: `proj2-${i}`,
          content: `Project 2 memory ${i}`,
          category: 'decision',
          scope: 'project',
          projectPath: project2,
          importance: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          metadata: {},
        });
      }

      const proj1Memories = db.getProjectMemoriesByPath(project1);
      const proj2Memories = db.getProjectMemoriesByPath(project2);

      log.assertEqual(proj1Memories.length, 3, 'project1 memory count');
      log.assertEqual(proj2Memories.length, 2, 'project2 memory count');

      // Verify all memories have correct project path
      for (const m of proj1Memories) {
        log.assertEqual(m.projectPath, project1, 'project1 memory path');
      }

      log.success('Project memory filtering works correctly');
    });
  });

  describe('Blob/Embedding Storage', () => {
    test('writes and reads embedding blob', () => {
      log.info('Testing embedding blob storage');

      const memoryId = 'embedding-test';
      const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);

      const key = db.writeEmbedding(memoryId, embedding);
      log.info('Embedding written', { key, dimensions: embedding.length });

      const retrieved = db.readEmbedding(memoryId);
      log.assertDefined(retrieved, 'retrieved embedding');
      log.assertEqual(retrieved.length, embedding.length, 'embedding length');

      // Verify values
      for (let i = 0; i < embedding.length; i++) {
        log.assert(
          Math.abs(retrieved[i] - embedding[i]) < 0.0001,
          `embedding[${i}] should match`
        );
      }

      log.success('Embedding storage works correctly');
    });

    test('handles large embeddings (1536 dimensions)', () => {
      log.info('Testing large embedding (OpenAI size)');

      const memoryId = 'large-embedding';
      const embedding = new Float32Array(1536);
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = Math.random();
      }

      db.writeEmbedding(memoryId, embedding);
      const retrieved = db.readEmbedding(memoryId);

      log.assertDefined(retrieved, 'retrieved large embedding');
      log.assertEqual(retrieved.length, 1536, 'embedding dimensions');

      // Spot check some values
      log.assert(
        Math.abs(retrieved[0] - embedding[0]) < 0.0001,
        'first value matches'
      );
      log.assert(
        Math.abs(retrieved[1535] - embedding[1535]) < 0.0001,
        'last value matches'
      );

      log.success('Large embedding storage works correctly');
    });

    test('blob meta contains correct size', () => {
      log.info('Testing blob metadata');

      const key = 'test-blob';
      const data = Buffer.from('Hello, World!');
      db.writeBlob(key, data, 'text/plain');

      const meta = db.blobMeta(key);
      log.assertDefined(meta, 'blob meta');
      log.assertEqual(meta.size, data.length, 'blob size');
      log.assertEqual(meta.mimeType, 'text/plain', 'mime type');
      log.assertDefined(meta.hash, 'hash');

      log.success('Blob metadata is correct');
    });
  });

  describe('Access Tracking', () => {
    test('touchMemory updates access count and timestamp', () => {
      log.info('Testing access tracking');

      const memory: Memory = {
        id: 'touch-test',
        content: 'Touch me',
        category: 'preference',
        scope: 'global',
        importance: 0.5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        metadata: {},
      };

      db.saveGlobalMemory(memory);

      // Touch multiple times
      db.touchMemory(memory.id, 'global');
      db.touchMemory(memory.id, 'global');
      db.touchMemory(memory.id, 'global');

      const updated = db.getGlobalMemory(memory.id);
      log.assertDefined(updated, 'updated memory');
      log.assertEqual(updated.accessCount, 3, 'access count');
      log.assertDefined(updated.lastAccessedAt, 'lastAccessedAt');
      log.assertGreaterThan(updated.lastAccessedAt!, memory.createdAt - 1, 'lastAccessedAt timestamp');

      log.success('Access tracking works correctly');
    });
  });

  describe('Cleanup Operations', () => {
    test('cleanup removes old low-importance memories', () => {
      log.info('Testing memory cleanup');

      const oldDate = Date.now() - (100 * 24 * 60 * 60 * 1000); // 100 days ago

      // Add old low-importance memories
      for (let i = 0; i < 3; i++) {
        db.saveGlobalMemory({
          id: `old-low-${i}`,
          content: `Old low importance memory ${i}`,
          category: 'context',
          scope: 'global',
          importance: 0.2, // Low importance
          createdAt: oldDate,
          updatedAt: oldDate,
          accessCount: 0, // Never accessed
          metadata: {},
        });
      }

      // Add recent high-importance memory
      db.saveGlobalMemory({
        id: 'recent-high',
        content: 'Recent high importance',
        category: 'preference',
        scope: 'global',
        importance: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        metadata: {},
      });

      // Add old but frequently accessed memory
      db.saveGlobalMemory({
        id: 'old-accessed',
        content: 'Old but accessed',
        category: 'pattern',
        scope: 'global',
        importance: 0.2,
        createdAt: oldDate,
        updatedAt: oldDate,
        accessCount: 10, // Frequently accessed
        metadata: {},
      });

      log.info('Before cleanup', { count: db.countGlobalMemories() });

      const deleted = db.cleanup(0.3, 90); // min importance 0.3, max age 90 days
      log.info('Cleanup result', { deleted });

      log.assertEqual(deleted, 3, 'deleted count'); // Only old low-importance memories
      log.assertEqual(db.countGlobalMemories(), 2, 'remaining count');

      // Verify correct memories remain
      log.assertDefined(db.getGlobalMemory('recent-high'), 'recent-high should remain');
      log.assertDefined(db.getGlobalMemory('old-accessed'), 'old-accessed should remain');

      log.success('Cleanup works correctly');
    });
  });

  describe('Transactions', () => {
    test('transaction commits on success', () => {
      log.info('Testing transaction commit');

      db.transaction(() => {
        db.saveGlobalMemory({
          id: 'tx-1',
          content: 'Transaction memory 1',
          category: 'preference',
          scope: 'global',
          importance: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          metadata: {},
        });

        db.saveGlobalMemory({
          id: 'tx-2',
          content: 'Transaction memory 2',
          category: 'preference',
          scope: 'global',
          importance: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          metadata: {},
        });
      });

      log.assertDefined(db.getGlobalMemory('tx-1'), 'tx-1 should exist');
      log.assertDefined(db.getGlobalMemory('tx-2'), 'tx-2 should exist');

      log.success('Transaction commits correctly');
    });

    test('transaction rolls back on error', () => {
      log.info('Testing transaction rollback');

      try {
        db.transaction(() => {
          db.saveGlobalMemory({
            id: 'rollback-1',
            content: 'Should be rolled back',
            category: 'preference',
            scope: 'global',
            importance: 0.5,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            accessCount: 0,
            metadata: {},
          });

          throw new Error('Intentional error for rollback test');
        });
      } catch (e) {
        log.info('Expected error caught', { message: (e as Error).message });
      }

      log.assert(
        db.getGlobalMemory('rollback-1') === null,
        'rollback-1 should not exist after rollback'
      );

      log.success('Transaction rolls back correctly');
    });
  });
});
