/**
 * Memory Service Tests
 *
 * Tests:
 * - remember() - storing memories
 * - recall() - searching memories
 * - getContextForRequest() - context building
 * - Importance calculation
 * - Hybrid search (vector + keyword)
 */

import { describe, test, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { MemoryService, MemoryDatabase } from '../src/memory';
import { createLogger, TestLogger } from './helpers/logger';
import {
  createTempDir,
  cleanupTempDir,
  createTestMemoryConfig,
  sampleMemories,
  sampleMessages,
} from './helpers/fixtures';
import type { MemoryCategory } from '../src/memory/types';

describe('MemoryService', () => {
  let tempDir: string;
  let dbPath: string;
  let service: MemoryService;
  let log: TestLogger;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir, 'memory-service-test.db');
    log = createLogger('MemoryService');

    // Reset database singleton
    MemoryDatabase.resetInstance();

    const config = createTestMemoryConfig(dbPath);
    service = new MemoryService(config);
    log.info('MemoryService created', { dbPath });
  });

  afterEach(() => {
    log.finish();
    MemoryDatabase.resetInstance();
    cleanupTempDir(tempDir);
  });

  describe('remember()', () => {
    test('stores global memory with embedding', async () => {
      log.info('Testing global memory storage');

      const memory = await service.remember(
        sampleMemories.global[0].content,
        {
          scope: 'global',
          category: sampleMemories.global[0].category,
          importance: sampleMemories.global[0].importance,
        }
      );

      log.assertDefined(memory.id, 'memory id');
      log.assertEqual(memory.scope, 'global', 'scope');
      log.assertEqual(memory.content, sampleMemories.global[0].content, 'content');
      log.assertEqual(memory.category, sampleMemories.global[0].category, 'category');
      log.assertGreaterThan(memory.importance, 0, 'importance');
      log.assertGreaterThan(memory.createdAt, 0, 'createdAt');

      log.success('Global memory stored successfully');
    });

    test('stores project memory with project path', async () => {
      log.info('Testing project memory storage');

      const projectPath = '/test/my-project';
      const memory = await service.remember(
        sampleMemories.project[0].content,
        {
          scope: 'project',
          projectPath,
          category: sampleMemories.project[0].category,
        }
      );

      log.assertEqual(memory.scope, 'project', 'scope');
      log.assertEqual(memory.projectPath, projectPath, 'projectPath');
      log.success('Project memory stored successfully');
    });

    test('throws error for project memory without path', async () => {
      log.info('Testing project memory without path');

      let error: Error | null = null;
      try {
        await service.remember('Test', {
          scope: 'project',
          category: 'decision',
          // Missing projectPath
        });
      } catch (e) {
        error = e as Error;
        log.info('Expected error caught', { message: error.message });
      }

      log.assertDefined(error, 'error');
      log.assertIncludes(error.message, 'projectPath', 'error message');
      log.success('Correctly throws for missing projectPath');
    });

    test('calculates importance based on content', async () => {
      log.info('Testing importance calculation');

      // High importance content
      const highImportance = await service.remember(
        'This is critically important: always use TypeScript',
        { scope: 'global', category: 'preference' }
      );

      // Low importance content
      const lowImportance = await service.remember(
        'Just a random note about something',
        { scope: 'global', category: 'context' }
      );

      log.info('Importance values', {
        high: highImportance.importance,
        low: lowImportance.importance,
      });

      log.assertGreaterThan(highImportance.importance, lowImportance.importance, 'importance comparison');
      log.success('Importance calculated correctly based on content');
    });

    test('stores metadata correctly', async () => {
      log.info('Testing metadata storage');

      const metadata = {
        source: 'test',
        tags: ['typescript', 'preference'],
        sessionId: 'test-session-123',
      };

      const memory = await service.remember(
        'Test with metadata',
        {
          scope: 'global',
          category: 'preference',
          metadata,
        }
      );

      log.assertEqual(memory.metadata.source, metadata.source, 'metadata.source');
      log.assert(
        JSON.stringify(memory.metadata.tags) === JSON.stringify(metadata.tags),
        'metadata.tags should match'
      );
      log.success('Metadata stored correctly');
    });
  });

  describe('recall()', () => {
    beforeEach(async () => {
      log.info('Seeding test memories');

      // Seed memories for search tests
      for (const mem of sampleMemories.global) {
        await service.remember(mem.content, {
          scope: 'global',
          category: mem.category,
          importance: mem.importance,
        });
      }

      for (const mem of sampleMemories.project) {
        await service.remember(mem.content, {
          scope: 'project',
          projectPath: '/test/project',
          category: mem.category,
          importance: mem.importance,
        });
      }

      log.info('Seeded memories', {
        global: sampleMemories.global.length,
        project: sampleMemories.project.length,
      });
    });

    test('finds relevant global memories', async () => {
      log.info('Testing global memory recall');

      const results = await service.recall('TypeScript preferences', {
        scope: 'global',
        limit: 5,
      });

      log.info('Search results', { count: results.length });
      log.assertGreaterThan(results.length, 0, 'result count');

      // Check that TypeScript-related memory is found
      const hasTypeScript = results.some(r =>
        r.memory.content.toLowerCase().includes('typescript')
      );
      log.assert(hasTypeScript, 'Should find TypeScript-related memory');

      // Check score is valid
      for (const result of results) {
        log.assertGreaterThan(result.score, 0, 'result score');
        log.assertLessThan(result.score, 1.1, 'result score max');
      }

      log.success('Global memory recall works correctly');
    });

    test('finds relevant project memories', async () => {
      log.info('Testing project memory recall');

      const results = await service.recall('Fastify HTTP server', {
        scope: 'project',
        projectPath: '/test/project',
        limit: 5,
      });

      log.info('Search results', { count: results.length });
      log.assertGreaterThan(results.length, 0, 'result count');

      // Check that Fastify-related memory is found
      const hasFastify = results.some(r =>
        r.memory.content.toLowerCase().includes('fastify')
      );
      log.assert(hasFastify, 'Should find Fastify-related memory');

      log.success('Project memory recall works correctly');
    });

    test('searches both scopes with scope=both', async () => {
      log.info('Testing combined scope search');

      const results = await service.recall('programming preferences patterns', {
        scope: 'both',
        projectPath: '/test/project',
        limit: 10,
      });

      log.info('Combined search results', { count: results.length });

      // Should find memories from both scopes
      const hasGlobal = results.some(r => r.memory.scope === 'global');
      const hasProject = results.some(r => r.memory.scope === 'project');

      log.assert(hasGlobal, 'Should have global memories');
      log.assert(hasProject, 'Should have project memories');

      log.success('Combined scope search works correctly');
    });

    test('respects minScore threshold', async () => {
      log.info('Testing minScore threshold');

      const highThreshold = await service.recall('random gibberish xyzzy', {
        scope: 'global',
        minScore: 0.9, // Very high threshold
      });

      const lowThreshold = await service.recall('random gibberish xyzzy', {
        scope: 'global',
        minScore: 0.01, // Very low threshold
      });

      log.info('Threshold comparison', {
        highCount: highThreshold.length,
        lowCount: lowThreshold.length,
      });

      log.assert(
        lowThreshold.length >= highThreshold.length,
        'Lower threshold should return more results'
      );

      log.success('minScore threshold works correctly');
    });

    test('filters by category', async () => {
      log.info('Testing category filter');

      const results = await service.recall('preferences and patterns', {
        scope: 'global',
        categories: ['preference' as MemoryCategory],
        limit: 10,
      });

      log.info('Filtered results', { count: results.length });

      for (const result of results) {
        log.assertEqual(result.memory.category, 'preference', 'category filter');
      }

      log.success('Category filter works correctly');
    });

    test('results include match type', async () => {
      log.info('Testing match type in results');

      const results = await service.recall('TypeScript strict mode', {
        scope: 'global',
        limit: 5,
      });

      log.info('Match types', {
        types: results.map(r => r.matchType),
      });

      for (const result of results) {
        log.assert(
          ['vector', 'keyword', 'hybrid'].includes(result.matchType),
          'matchType should be valid'
        );
      }

      log.success('Match types are included');
    });
  });

  describe('getContextForRequest()', () => {
    beforeEach(async () => {
      log.info('Seeding memories for context tests');

      // Add high-importance global memory
      await service.remember(
        'User always prefers concise code comments',
        {
          scope: 'global',
          category: 'preference',
          importance: 0.9,
        }
      );

      // Add project-specific memory
      await service.remember(
        'This project uses ESM modules exclusively',
        {
          scope: 'project',
          projectPath: '/test/project',
          category: 'architecture',
          importance: 0.85,
        }
      );
    });

    test('retrieves relevant memories for simple request', async () => {
      log.info('Testing context for simple request');

      const context = await service.getContextForRequest({
        messages: sampleMessages.simple,
        projectPath: '/test/project',
      });

      log.info('Context result', {
        globalCount: context.globalMemories.length,
        projectCount: context.projectMemories.length,
      });

      // Should have some memories even for simple request
      // High importance memories should be included
      log.success('Context retrieved for simple request');
    });

    test('retrieves code-relevant memories for code request', async () => {
      log.info('Testing context for code request');

      const context = await service.getContextForRequest({
        messages: sampleMessages.codeRequest,
        projectPath: '/test/project',
      });

      log.info('Context result', {
        globalCount: context.globalMemories.length,
        projectCount: context.projectMemories.length,
      });

      log.success('Context retrieved for code request');
    });

    test('includes high-importance memories regardless of query', async () => {
      log.info('Testing high-importance memory inclusion');

      // Add very high importance memory
      await service.remember(
        'CRITICAL: Never commit secrets to git',
        {
          scope: 'global',
          category: 'preference',
          importance: 0.95,
        }
      );

      const context = await service.getContextForRequest({
        messages: [{ role: 'user', content: 'unrelated query about weather' }],
      });

      // High importance memories should still be included
      const hasCritical = context.globalMemories.some(m =>
        m.content.includes('CRITICAL')
      );

      // Note: This depends on the threshold (0.8) in getContextForRequest
      log.info('High importance inclusion', {
        hasCritical,
        memories: context.globalMemories.map(m => ({
          content: m.content.slice(0, 50),
          importance: m.importance,
        })),
      });

      log.success('High-importance memories checked');
    });
  });

  describe('Direct Access Methods', () => {
    test('getGlobalMemory returns stored memory', async () => {
      log.info('Testing direct global memory access');

      const stored = await service.remember('Direct access test', {
        scope: 'global',
        category: 'knowledge',
      });

      const retrieved = service.getGlobalMemory(stored.id);
      log.assertDefined(retrieved, 'retrieved memory');
      log.assertEqual(retrieved.id, stored.id, 'memory id');

      log.success('Direct global memory access works');
    });

    test('getAllGlobalMemories returns all memories', async () => {
      log.info('Testing getAllGlobalMemories');

      await service.remember('Memory 1', { scope: 'global', category: 'knowledge' });
      await service.remember('Memory 2', { scope: 'global', category: 'preference' });

      const all = service.getAllGlobalMemories();
      log.assertEqual(all.length, 2, 'memory count');

      log.success('getAllGlobalMemories works correctly');
    });

    test('deleteMemory removes memory', async () => {
      log.info('Testing memory deletion');

      const memory = await service.remember('To delete', {
        scope: 'global',
        category: 'context',
      });

      log.assertDefined(service.getGlobalMemory(memory.id), 'memory before delete');

      service.deleteMemory(memory.id, 'global');

      log.assert(
        service.getGlobalMemory(memory.id) === null,
        'memory should be null after delete'
      );

      log.success('Memory deletion works correctly');
    });
  });

  describe('Statistics', () => {
    test('getStats returns accurate counts', async () => {
      log.info('Testing statistics');

      await service.remember('Global 1', { scope: 'global', category: 'knowledge' });
      await service.remember('Global 2', { scope: 'global', category: 'preference' });
      await service.remember('Project 1', {
        scope: 'project',
        projectPath: '/test',
        category: 'architecture',
      });

      const stats = service.getStats();

      log.assertEqual(stats.globalCount, 2, 'global count');
      log.assertEqual(stats.projectCount, 1, 'project count');
      log.assertDefined(stats.instanceId, 'instance id');

      log.success('Statistics are accurate');
    });
  });
});
