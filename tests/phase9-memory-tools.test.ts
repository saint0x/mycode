/**
 * Phase 9: Memory Tools Tests
 *
 * Tests for memoryAgent and its tools (ccr_remember, ccr_recall, ccr_forget)
 */

import { describe, test, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { createLogger, TestLogger } from './helpers/logger';
import {
  createTempDir,
  cleanupTempDir,
  createTestMemoryConfig,
  validCategories,
} from './helpers/fixtures';
import { memoryAgent } from '../src/agents/memory.agent';
import { initMemoryService, getMemoryService, hasMemoryService } from '../src/memory';
import { MemoryDatabase } from '../src/memory/database';

describe('Phase 9: Memory Tools', () => {
  let log: TestLogger;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    log = createLogger('MemoryTools');
    tempDir = createTempDir();
    dbPath = join(tempDir, 'test-memory.db');

    // Reset singleton
    MemoryDatabase.resetInstance();

    // Initialize memory service
    const config = createTestMemoryConfig(dbPath);
    initMemoryService(config);
  });

  afterEach(() => {
    MemoryDatabase.resetInstance();
    cleanupTempDir(tempDir);
    log.finish();
  });

  // ═══════════════════════════════════════════════════════════════════
  // memoryAgent tests
  // ═══════════════════════════════════════════════════════════════════

  describe('memoryAgent', () => {
    test('has all three tools registered', () => {
      log.info('Testing tool registration');

      log.assertDefined(memoryAgent.tools.get('ccr_remember'), 'ccr_remember tool');
      log.assertDefined(memoryAgent.tools.get('ccr_recall'), 'ccr_recall tool');
      log.assertDefined(memoryAgent.tools.get('ccr_forget'), 'ccr_forget tool');
      log.assertEqual(memoryAgent.tools.size, 3, 'tool count');

      log.success('All three tools registered');
    });

    test('shouldHandle returns true when memory enabled', () => {
      log.info('Testing shouldHandle with memory enabled');

      const req = {};
      const config = { Memory: { enabled: true } };

      const result = memoryAgent.shouldHandle(req, config);

      log.assert(result, 'shouldHandle returns true');

      log.success('shouldHandle returns true when enabled');
    });

    test('shouldHandle returns false when memory disabled', () => {
      log.info('Testing shouldHandle with memory disabled');

      const req = {};
      const config = { Memory: { enabled: false } };

      const result = memoryAgent.shouldHandle(req, config);

      log.assert(!result, 'shouldHandle returns false');

      log.success('shouldHandle returns false when disabled');
    });

    test('shouldHandle returns false when no Memory config', () => {
      log.info('Testing shouldHandle with no Memory config');

      const req = {};
      const config = {};

      const result = memoryAgent.shouldHandle(req, config);

      log.assert(!result, 'shouldHandle returns false');

      log.success('shouldHandle returns false with no config');
    });

    test('tools have correct input schemas', () => {
      log.info('Testing tool input schemas');

      const rememberTool = memoryAgent.tools.get('ccr_remember')!;
      log.assertDefined(rememberTool.input_schema.properties.content, 'content prop');
      log.assertDefined(rememberTool.input_schema.properties.scope, 'scope prop');
      log.assertDefined(rememberTool.input_schema.properties.category, 'category prop');

      const recallTool = memoryAgent.tools.get('ccr_recall')!;
      log.assertDefined(recallTool.input_schema.properties.query, 'query prop');

      const forgetTool = memoryAgent.tools.get('ccr_forget')!;
      log.assertDefined(forgetTool.input_schema.properties.memoryId, 'memoryId prop');

      log.success('Tool schemas are correct');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ccr_remember tool tests
  // ═══════════════════════════════════════════════════════════════════

  describe('ccr_remember tool', () => {
    test('saves global memory', async () => {
      log.info('Testing global memory save');

      const tool = memoryAgent.tools.get('ccr_remember')!;
      const result = await tool.handler(
        {
          content: 'Test global preference',
          scope: 'global',
          category: 'preference',
        },
        { req: { sessionId: 'test-session' } }
      );

      const parsed = JSON.parse(result);
      log.assert(parsed.success, 'success flag');
      log.assertDefined(parsed.id, 'memory id');
      log.assertIncludes(parsed.saved, 'Test global preference', 'saved content');

      log.success('Global memory saved');
    });

    test('saves project memory', async () => {
      log.info('Testing project memory save');

      const tool = memoryAgent.tools.get('ccr_remember')!;
      const result = await tool.handler(
        {
          content: 'Test project decision',
          scope: 'project',
          category: 'decision',
        },
        { req: { sessionId: 'test-session', projectPath: '/test/project' } }
      );

      const parsed = JSON.parse(result);
      log.assert(parsed.success, 'success flag');
      log.assertEqual(parsed.scope, 'project', 'scope');

      log.success('Project memory saved');
    });

    test('returns confirmation with ID', async () => {
      log.info('Testing confirmation response');

      const tool = memoryAgent.tools.get('ccr_remember')!;
      const result = await tool.handler(
        {
          content: 'Test content',
          scope: 'global',
          category: 'pattern',
        },
        { req: { sessionId: 'test-session' } }
      );

      const parsed = JSON.parse(result);
      log.assert(parsed.success === true, 'success is true');
      log.assert(typeof parsed.id === 'string', 'id is string');
      log.assert(parsed.id.length > 0, 'id is not empty');

      log.success('Confirmation includes ID');
    });

    test('handles all valid categories', async () => {
      log.info('Testing all category types');

      const tool = memoryAgent.tools.get('ccr_remember')!;

      for (const category of validCategories) {
        const result = await tool.handler(
          {
            content: `Test ${category}`,
            scope: 'global',
            category,
          },
          { req: { sessionId: 'test-session' } }
        );

        const parsed = JSON.parse(result);
        log.assert(parsed.success, `category ${category} works`);
      }

      log.success('All categories work');
    });

    test('truncates long content in saved field', async () => {
      log.info('Testing content truncation');

      const tool = memoryAgent.tools.get('ccr_remember')!;
      const longContent = 'x'.repeat(200);

      const result = await tool.handler(
        {
          content: longContent,
          scope: 'global',
          category: 'knowledge',
        },
        { req: { sessionId: 'test-session' } }
      );

      const parsed = JSON.parse(result);
      log.assertLessThan(parsed.saved.length, 150, 'truncated length');
      log.assert(parsed.saved.endsWith('...'), 'ends with ellipsis');

      log.success('Long content truncated');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ccr_recall tool tests
  // ═══════════════════════════════════════════════════════════════════

  describe('ccr_recall tool', () => {
    beforeEach(async () => {
      // Seed some memories for recall tests
      const service = getMemoryService();
      await service.remember('TypeScript is a typed superset of JavaScript', {
        scope: 'global',
        category: 'knowledge',
      });
      await service.remember('This project uses Fastify for HTTP', {
        scope: 'project',
        category: 'architecture',
        projectPath: '/test/project',
      });
      await service.remember('User prefers dark mode', {
        scope: 'global',
        category: 'preference',
      });
    });

    test('queries global memories', async () => {
      log.info('Testing global memory query');

      const tool = memoryAgent.tools.get('ccr_recall')!;
      const result = await tool.handler(
        { query: 'TypeScript JavaScript', scope: 'global' },
        { req: {} }
      );

      const parsed = JSON.parse(result);
      log.assert(parsed.success, 'success flag');
      log.assertGreaterThan(parsed.count, 0, 'found memories');

      log.success('Global memories queried');
    });

    test('queries project memories', async () => {
      log.info('Testing project memory query');

      const tool = memoryAgent.tools.get('ccr_recall')!;
      const result = await tool.handler(
        { query: 'Fastify HTTP', scope: 'project' },
        { req: { projectPath: '/test/project' } }
      );

      const parsed = JSON.parse(result);
      log.assert(parsed.success, 'success flag');

      log.success('Project memories queried');
    });

    test('queries both scopes', async () => {
      log.info('Testing both scope query');

      const tool = memoryAgent.tools.get('ccr_recall')!;
      const result = await tool.handler(
        { query: 'preference', scope: 'both' },
        { req: { projectPath: '/test/project' } }
      );

      const parsed = JSON.parse(result);
      log.assert(parsed.success, 'success flag');

      log.success('Both scopes queried');
    });

    test('respects limit parameter', async () => {
      log.info('Testing limit parameter');

      const tool = memoryAgent.tools.get('ccr_recall')!;
      const result = await tool.handler(
        { query: 'test', limit: 1 },
        { req: {} }
      );

      const parsed = JSON.parse(result);
      log.assertLessThan(parsed.memories.length, 2, 'respects limit');

      log.success('Limit respected');
    });

    test('returns relevance scores', async () => {
      log.info('Testing relevance scores');

      const tool = memoryAgent.tools.get('ccr_recall')!;
      const result = await tool.handler(
        { query: 'TypeScript' },
        { req: {} }
      );

      const parsed = JSON.parse(result);
      if (parsed.memories.length > 0) {
        log.assertDefined(parsed.memories[0].score, 'has score');
        log.assert(typeof parsed.memories[0].score === 'number', 'score is number');
      }

      log.success('Relevance scores included');
    });

    test('returns memory metadata', async () => {
      log.info('Testing memory metadata');

      const tool = memoryAgent.tools.get('ccr_recall')!;
      const result = await tool.handler(
        { query: 'TypeScript' },
        { req: {} }
      );

      const parsed = JSON.parse(result);
      if (parsed.memories.length > 0) {
        const memory = parsed.memories[0];
        log.assertDefined(memory.id, 'has id');
        log.assertDefined(memory.content, 'has content');
        log.assertDefined(memory.category, 'has category');
        log.assertDefined(memory.scope, 'has scope');
      }

      log.success('Memory metadata included');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ccr_forget tool tests
  // ═══════════════════════════════════════════════════════════════════

  describe('ccr_forget tool', () => {
    test('deletes global memory', async () => {
      log.info('Testing global memory deletion');

      // First create a memory
      const service = getMemoryService();
      const memory = await service.remember('To be deleted', {
        scope: 'global',
        category: 'knowledge',
      });

      // Then delete it
      const tool = memoryAgent.tools.get('ccr_forget')!;
      const result = await tool.handler(
        { memoryId: memory.id, scope: 'global' },
        { req: {} }
      );

      const parsed = JSON.parse(result);
      log.assert(parsed.success, 'deletion success');

      // Verify it's gone
      const retrieved = service.getGlobalMemory(memory.id);
      log.assert(retrieved === null, 'memory deleted');

      log.success('Global memory deleted');
    });

    test('deletes project memory', async () => {
      log.info('Testing project memory deletion');

      // First create a memory
      const service = getMemoryService();
      const memory = await service.remember('Project memory to delete', {
        scope: 'project',
        category: 'decision',
        projectPath: '/test/project',
      });

      // Then delete it
      const tool = memoryAgent.tools.get('ccr_forget')!;
      const result = await tool.handler(
        { memoryId: memory.id, scope: 'project' },
        { req: {} }
      );

      const parsed = JSON.parse(result);
      log.assert(parsed.success, 'deletion success');

      log.success('Project memory deleted');
    });

    test('returns error for non-existent ID', async () => {
      log.info('Testing non-existent memory deletion');

      const tool = memoryAgent.tools.get('ccr_forget')!;
      const result = await tool.handler(
        { memoryId: 'non-existent-id', scope: 'global' },
        { req: {} }
      );

      const parsed = JSON.parse(result);
      log.assert(!parsed.success, 'failure flag');
      log.assertDefined(parsed.error, 'error message');

      log.success('Non-existent ID handled correctly');
    });

    test('returns deleted memory info', async () => {
      log.info('Testing deletion response');

      // Create and delete
      const service = getMemoryService();
      const memory = await service.remember('Memory with info', {
        scope: 'global',
        category: 'pattern',
      });

      const tool = memoryAgent.tools.get('ccr_forget')!;
      const result = await tool.handler(
        { memoryId: memory.id, scope: 'global' },
        { req: {} }
      );

      const parsed = JSON.parse(result);
      log.assertDefined(parsed.deleted, 'deleted info');
      log.assertEqual(parsed.deleted.id, memory.id, 'deleted id');

      log.success('Deletion response includes info');
    });
  });
});
