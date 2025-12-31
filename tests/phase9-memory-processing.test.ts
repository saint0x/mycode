/**
 * Phase 9: Memory Processing Transform Tests
 *
 * Tests for SSE stream memory processing and tag stripping
 */

import { describe, test, beforeEach, afterEach } from 'bun:test';
import { createLogger, TestLogger } from './helpers/logger';
import { createMemoryProcessingTransform } from '../src/utils/MemoryProcessing.transform';
import { contentWithTags, rememberTagCases } from './helpers/fixtures';

describe('Phase 9: Memory Processing Transform', () => {
  let log: TestLogger;

  beforeEach(() => {
    log = createLogger('MemoryProcessing');
  });

  afterEach(() => {
    log.finish();
  });

  // ═══════════════════════════════════════════════════════════════════
  // createMemoryProcessingTransform tests
  // ═══════════════════════════════════════════════════════════════════

  describe('createMemoryProcessingTransform', () => {
    test('creates transform with required methods', () => {
      log.info('Testing transform creation');

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
      });

      log.assertDefined(transform.processEvent, 'processEvent method');
      log.assertDefined(transform.getAccumulatedText, 'getAccumulatedText method');

      log.success('Transform created with methods');
    });

    test('accumulates text from text_delta events', () => {
      log.info('Testing text accumulation');

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
      });

      // Simulate content_block_start for text
      transform.processEvent({
        event: 'content_block_start',
        data: { index: 0, content_block: { type: 'text' } },
      });

      // Simulate text_delta events
      transform.processEvent({
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'text_delta', text: 'Hello ' } },
      });

      transform.processEvent({
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'text_delta', text: 'World' } },
      });

      const accumulated = transform.getAccumulatedText();
      log.assertEqual(accumulated, 'Hello World', 'accumulated text');

      log.success('Text accumulated correctly');
    });

    test('calls onMemoryExtracted callback on message_delta', () => {
      log.info('Testing memory extraction callback');

      const extractedMemories: any[] = [];

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
        onMemoryExtracted: (memory) => {
          extractedMemories.push(memory);
        },
      });

      // Simulate text block with remember tag
      transform.processEvent({
        event: 'content_block_start',
        data: { index: 0, content_block: { type: 'text' } },
      });

      transform.processEvent({
        event: 'content_block_delta',
        data: {
          index: 0,
          delta: {
            type: 'text_delta',
            text: '<remember scope="global" category="preference">Test memory</remember>',
          },
        },
      });

      // Trigger message completion
      transform.processEvent({
        event: 'message_delta',
        data: {},
      });

      log.assertEqual(extractedMemories.length, 1, 'one memory extracted');
      log.assertEqual(extractedMemories[0].scope, 'global', 'scope');
      log.assertEqual(extractedMemories[0].category, 'preference', 'category');
      log.assertEqual(extractedMemories[0].content, 'Test memory', 'content');

      log.success('Memory extracted via callback');
    });

    test('extracts multiple memories', () => {
      log.info('Testing multiple memory extraction');

      const extractedMemories: any[] = [];

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
        onMemoryExtracted: (memory) => {
          extractedMemories.push(memory);
        },
      });

      transform.processEvent({
        event: 'content_block_start',
        data: { index: 0, content_block: { type: 'text' } },
      });

      transform.processEvent({
        event: 'content_block_delta',
        data: {
          index: 0,
          delta: { type: 'text_delta', text: contentWithTags.multiple },
        },
      });

      transform.processEvent({
        event: 'message_delta',
        data: {},
      });

      log.assertEqual(extractedMemories.length, 2, 'two memories extracted');

      log.success('Multiple memories extracted');
    });

    test('passes through non-text events unchanged', () => {
      log.info('Testing non-text event passthrough');

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
      });

      const toolUseEvent = {
        event: 'content_block_start',
        data: { index: 1, content_block: { type: 'tool_use', name: 'test_tool' } },
      };

      const result = transform.processEvent(toolUseEvent);

      log.assertEqual(result, toolUseEvent, 'event unchanged');

      log.success('Non-text events passed through');
    });

    test('handles content block stop correctly', () => {
      log.info('Testing content block stop');

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
      });

      // Start text block
      transform.processEvent({
        event: 'content_block_start',
        data: { index: 0, content_block: { type: 'text' } },
      });

      // Add content
      transform.processEvent({
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'text_delta', text: 'Test' } },
      });

      // Stop block
      const stopResult = transform.processEvent({
        event: 'content_block_stop',
        data: { index: 0 },
      });

      log.assertDefined(stopResult, 'stop event returned');

      log.success('Content block stop handled');
    });

    test('resets accumulated text after message_delta', () => {
      log.info('Testing text reset after message');

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
      });

      transform.processEvent({
        event: 'content_block_start',
        data: { index: 0, content_block: { type: 'text' } },
      });

      transform.processEvent({
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'text_delta', text: 'First message' } },
      });

      transform.processEvent({
        event: 'message_delta',
        data: {},
      });

      const afterReset = transform.getAccumulatedText();
      log.assertEqual(afterReset, '', 'text reset');

      log.success('Text reset after message');
    });

    test('strips complete remember tags from text deltas', () => {
      log.info('Testing tag stripping in text deltas');

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
      });

      transform.processEvent({
        event: 'content_block_start',
        data: { index: 0, content_block: { type: 'text' } },
      });

      // Send text with complete remember tag
      const result = transform.processEvent({
        event: 'content_block_delta',
        data: {
          index: 0,
          delta: {
            type: 'text_delta',
            text: 'Before <remember scope="global" category="preference">hidden</remember> After',
          },
        },
      });

      // The result should have stripped content or be filtered
      if (result && result.data?.delta?.text) {
        log.assert(
          !result.data.delta.text.includes('<remember'),
          'tag stripped from output'
        );
      }

      log.success('Tags stripped from deltas');
    });

    test('handles message_start event', () => {
      log.info('Testing message_start event');

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
      });

      const startEvent = {
        event: 'message_start',
        data: { message: { id: 'msg_123' } },
      };

      const result = transform.processEvent(startEvent);

      log.assertEqual(result, startEvent, 'message_start passed through');

      log.success('message_start handled');
    });

    test('handles ping events', () => {
      log.info('Testing ping event');

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
      });

      const pingEvent = {
        event: 'ping',
        data: {},
      };

      const result = transform.processEvent(pingEvent);

      log.assertEqual(result, pingEvent, 'ping passed through');

      log.success('ping event handled');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    test('handles empty text deltas', () => {
      log.info('Testing empty text delta');

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
      });

      transform.processEvent({
        event: 'content_block_start',
        data: { index: 0, content_block: { type: 'text' } },
      });

      const result = transform.processEvent({
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'text_delta', text: '' } },
      });

      log.assertDefined(result, 'empty delta handled');

      log.success('Empty text delta handled');
    });

    test('handles malformed events gracefully', () => {
      log.info('Testing malformed events');

      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
      });

      // Missing data
      const result1 = transform.processEvent({ event: 'content_block_delta' });
      log.assertDefined(result1, 'missing data handled');

      // Missing delta
      const result2 = transform.processEvent({
        event: 'content_block_delta',
        data: { index: 0 },
      });
      log.assertDefined(result2, 'missing delta handled');

      log.success('Malformed events handled gracefully');
    });

    test('handles multiple text blocks', () => {
      log.info('Testing multiple text blocks');

      const extractedMemories: any[] = [];
      const transform = createMemoryProcessingTransform({
        req: {},
        config: {},
        onMemoryExtracted: (m) => extractedMemories.push(m),
      });

      // First text block
      transform.processEvent({
        event: 'content_block_start',
        data: { index: 0, content_block: { type: 'text' } },
      });
      transform.processEvent({
        event: 'content_block_delta',
        data: {
          index: 0,
          delta: {
            type: 'text_delta',
            text: '<remember scope="global" category="preference">First</remember>',
          },
        },
      });
      transform.processEvent({
        event: 'content_block_stop',
        data: { index: 0 },
      });

      // Second text block
      transform.processEvent({
        event: 'content_block_start',
        data: { index: 1, content_block: { type: 'text' } },
      });
      transform.processEvent({
        event: 'content_block_delta',
        data: {
          index: 1,
          delta: {
            type: 'text_delta',
            text: '<remember scope="project" category="decision">Second</remember>',
          },
        },
      });
      transform.processEvent({
        event: 'content_block_stop',
        data: { index: 1 },
      });

      // Complete message
      transform.processEvent({
        event: 'message_delta',
        data: {},
      });

      log.assertEqual(extractedMemories.length, 2, 'both memories extracted');

      log.success('Multiple text blocks handled');
    });
  });
});
