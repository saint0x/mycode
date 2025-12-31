/**
 * Phase 9: Tag Parsing Tests
 *
 * Tests for lenient <remember> tag parsing and stripping
 */

import { describe, test, beforeEach, afterEach } from 'bun:test';
import { createLogger, TestLogger } from './helpers/logger';
import { rememberTagCases, contentWithTags } from './helpers/fixtures';
import {
  parseRememberTags,
  stripRememberTags,
  hasRememberTags,
} from '../src/utils/rememberTags';

describe('Phase 9: Tag Parsing', () => {
  let log: TestLogger;

  beforeEach(() => {
    log = createLogger('TagParsing');
  });

  afterEach(() => {
    log.finish();
  });

  // ═══════════════════════════════════════════════════════════════════
  // parseRememberTags tests
  // ═══════════════════════════════════════════════════════════════════

  describe('parseRememberTags', () => {
    test('parses standard format', () => {
      log.info('Testing standard format parsing');

      const result = parseRememberTags(rememberTagCases.standard);

      log.assertEqual(result.length, 1, 'result count');
      log.assertEqual(result[0].scope, 'global', 'scope');
      log.assertEqual(result[0].category, 'preference', 'category');
      log.assertEqual(result[0].content, 'User prefers dark mode', 'content');

      log.success('Standard format parsed correctly');
    });

    test('handles reversed attribute order (category before scope)', () => {
      log.info('Testing reversed attribute order');

      const result = parseRememberTags(rememberTagCases.reversed);

      log.assertEqual(result.length, 1, 'result count');
      log.assertEqual(result[0].scope, 'global', 'scope');
      log.assertEqual(result[0].category, 'preference', 'category');

      log.success('Reversed attributes parsed correctly');
    });

    test('handles single quotes', () => {
      log.info('Testing single quotes');

      const result = parseRememberTags(rememberTagCases.singleQuotes);

      log.assertEqual(result.length, 1, 'result count');
      log.assertEqual(result[0].scope, 'global', 'scope');
      log.assertEqual(result[0].category, 'preference', 'category');

      log.success('Single quotes parsed correctly');
    });

    test('handles extra whitespace', () => {
      log.info('Testing extra whitespace');

      const result = parseRememberTags(rememberTagCases.extraWhitespace);

      log.assertEqual(result.length, 1, 'result count');
      log.assertEqual(result[0].scope, 'global', 'scope');
      log.assertEqual(result[0].category, 'preference', 'category');

      log.success('Extra whitespace handled correctly');
    });

    test('handles mixed case attributes', () => {
      log.info('Testing mixed case attributes');

      const result = parseRememberTags(rememberTagCases.mixedCase);

      log.assertEqual(result.length, 1, 'result count');
      log.assertEqual(result[0].scope, 'global', 'scope');
      log.assertEqual(result[0].category, 'preference', 'category');

      log.success('Mixed case normalized correctly');
    });

    test('handles multiline content', () => {
      log.info('Testing multiline content');

      const result = parseRememberTags(rememberTagCases.multiline);

      log.assertEqual(result.length, 1, 'result count');
      log.assertIncludes(result[0].content, 'Multi-line', 'multiline content');

      log.success('Multiline content parsed correctly');
    });

    test('handles project scope', () => {
      log.info('Testing project scope');

      const result = parseRememberTags(rememberTagCases.projectScope);

      log.assertEqual(result.length, 1, 'result count');
      log.assertEqual(result[0].scope, 'project', 'scope');
      log.assertEqual(result[0].category, 'decision', 'category');

      log.success('Project scope parsed correctly');
    });

    test('extracts multiple tags', () => {
      log.info('Testing multiple tags extraction');

      const result = parseRememberTags(contentWithTags.multiple);

      log.assertEqual(result.length, 2, 'result count');
      log.assertEqual(result[0].scope, 'global', 'first scope');
      log.assertEqual(result[0].content, 'first memory', 'first content');
      log.assertEqual(result[1].scope, 'project', 'second scope');
      log.assertEqual(result[1].content, 'second memory', 'second content');

      log.success('Multiple tags extracted correctly');
    });

    test('returns empty array for no tags', () => {
      log.info('Testing no tags');

      const result = parseRememberTags(contentWithTags.noTags);

      log.assertEqual(result.length, 0, 'result count');

      log.success('Returns empty array for no tags');
    });

    test('ignores malformed tags (missing scope)', () => {
      log.info('Testing malformed tag without scope');

      const result = parseRememberTags(rememberTagCases.malformedNoScope);

      log.assertEqual(result.length, 0, 'result count');

      log.success('Malformed tag (no scope) ignored');
    });

    test('ignores malformed tags (missing category)', () => {
      log.info('Testing malformed tag without category');

      const result = parseRememberTags(rememberTagCases.malformedNoCategory);

      log.assertEqual(result.length, 0, 'result count');

      log.success('Malformed tag (no category) ignored');
    });

    test('ignores empty tags', () => {
      log.info('Testing empty tag');

      const result = parseRememberTags(rememberTagCases.malformedEmpty);

      log.assertEqual(result.length, 0, 'result count');

      log.success('Empty tag ignored');
    });

    test('handles nested content with HTML-like tags', () => {
      log.info('Testing nested content');

      const result = parseRememberTags(contentWithTags.nestedContent);

      log.assertEqual(result.length, 1, 'result count');
      log.assertIncludes(result[0].content, '<code>tags</code>', 'nested tags');

      log.success('Nested content preserved');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // stripRememberTags tests
  // ═══════════════════════════════════════════════════════════════════

  describe('stripRememberTags', () => {
    test('removes single tag', () => {
      log.info('Testing single tag removal');

      const result = stripRememberTags(contentWithTags.single);

      log.assert(!result.includes('<remember'), 'no remember tag');
      log.assert(!result.includes('</remember>'), 'no closing tag');
      log.assertIncludes(result, 'Before text', 'before content');
      log.assertIncludes(result, 'After text', 'after content');

      log.success('Single tag removed correctly');
    });

    test('removes multiple tags', () => {
      log.info('Testing multiple tags removal');

      const result = stripRememberTags(contentWithTags.multiple);

      log.assert(!result.includes('<remember'), 'no remember tags');
      log.assertIncludes(result, 'Start', 'start content');
      log.assertIncludes(result, 'middle', 'middle content');
      log.assertIncludes(result, 'end', 'end content');

      log.success('Multiple tags removed correctly');
    });

    test('preserves content without tags', () => {
      log.info('Testing content without tags');

      const original = contentWithTags.noTags;
      const result = stripRememberTags(original);

      log.assertEqual(result, original, 'unchanged content');

      log.success('Content preserved when no tags');
    });

    test('returns empty string for tag-only content', () => {
      log.info('Testing tag-only content');

      const result = stripRememberTags(contentWithTags.onlyTag);

      log.assertEqual(result, '', 'empty result');

      log.success('Tag-only content becomes empty');
    });

    test('cleans up extra newlines', () => {
      log.info('Testing newline cleanup');

      const result = stripRememberTags(contentWithTags.withNewlines);

      log.assert(!result.includes('\n\n\n'), 'no triple newlines');
      log.assertIncludes(result, 'Line 1', 'line 1 preserved');
      log.assertIncludes(result, 'Line 2', 'line 2 preserved');

      log.success('Extra newlines cleaned up');
    });

    test('handles all tag formats', () => {
      log.info('Testing all format variations');

      const formats = [
        rememberTagCases.standard,
        rememberTagCases.reversed,
        rememberTagCases.singleQuotes,
        rememberTagCases.extraWhitespace,
        rememberTagCases.mixedCase,
      ];

      for (const format of formats) {
        const result = stripRememberTags(format);
        log.assert(!result.includes('<remember'), `no remember tag in: ${format.slice(0, 30)}...`);
      }

      log.success('All format variations stripped');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // hasRememberTags tests
  // ═══════════════════════════════════════════════════════════════════

  describe('hasRememberTags', () => {
    test('returns true for content with tags', () => {
      log.info('Testing detection of tags');

      log.assert(hasRememberTags(contentWithTags.single), 'single tag');
      log.assert(hasRememberTags(contentWithTags.multiple), 'multiple tags');
      log.assert(hasRememberTags(rememberTagCases.standard), 'standard format');

      log.success('Tags detected correctly');
    });

    test('returns false for content without tags', () => {
      log.info('Testing no-tag detection');

      log.assert(!hasRememberTags(contentWithTags.noTags), 'no tags');
      log.assert(!hasRememberTags('plain text'), 'plain text');
      log.assert(!hasRememberTags(''), 'empty string');

      log.success('No-tag content detected correctly');
    });
  });
});
