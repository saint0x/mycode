/**
 * Tool Validation Tests
 *
 * Tests for tool parameter validation, parsing, and error handling
 * to ensure robust handling of tool calls from LLM responses.
 */

import { describe, test, expect } from 'bun:test';
import {
  parseToolArguments,
  validateToolSchema,
  validateToolArguments,
  validateOpenAIToolCall,
  safeJSONParse,
} from '../src/utils/toolValidation';

describe('Tool Validation', () => {
  describe('parseToolArguments', () => {
    test('handles null arguments - returns undefined', () => {
      const result = parseToolArguments(null);
      expect(result.isValid).toBe(true);
      expect(result.arguments).toBeUndefined();
    });

    test('handles undefined arguments - returns undefined', () => {
      const result = parseToolArguments(undefined);
      expect(result.isValid).toBe(true);
      expect(result.arguments).toBeUndefined();
    });

    test('handles empty string - returns empty object (critical for streaming)', () => {
      // This is the fix for "Input should be a valid dictionary" errors
      const result = parseToolArguments('');
      expect(result.isValid).toBe(true);
      expect(result.arguments).toEqual({});
    });

    test('handles whitespace-only string - returns empty object', () => {
      const result = parseToolArguments('   ');
      expect(result.isValid).toBe(true);
      expect(result.arguments).toEqual({});
    });

    test('handles valid JSON string', () => {
      const result = parseToolArguments('{"file_path": "/test.ts"}');
      expect(result.isValid).toBe(true);
      expect(result.arguments).toEqual({ file_path: '/test.ts' });
    });

    test('handles object arguments - passes through unchanged', () => {
      const args = { file_path: '/test.ts', content: 'hello' };
      const result = parseToolArguments(args);
      expect(result.isValid).toBe(true);
      expect(result.arguments).toEqual(args);
    });

    test('rejects invalid JSON string', () => {
      const result = parseToolArguments('{invalid json}');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('rejects non-object parsed result (primitive)', () => {
      const result = parseToolArguments('"just a string"');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('not an object');
    });

    test('rejects null parsed result', () => {
      const result = parseToolArguments('null');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('not an object');
    });

    test('handles complex nested objects', () => {
      const complex = JSON.stringify({
        todos: [
          { content: 'Task 1', status: 'pending', activeForm: 'Working on Task 1' },
          { content: 'Task 2', status: 'completed', activeForm: 'Working on Task 2' },
        ],
      });
      const result = parseToolArguments(complex);
      expect(result.isValid).toBe(true);
      expect(result.arguments).toBeDefined();
      expect((result.arguments as { todos: unknown[] }).todos).toHaveLength(2);
    });
  });

  describe('validateToolSchema', () => {
    test('validates complete tool schema', () => {
      const tool = {
        name: 'Read',
        description: 'Read a file',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file' },
          },
          required: ['file_path'],
        },
      };
      const result = validateToolSchema(tool);
      expect(result.isValid).toBe(true);
      expect(result.tool?.name).toBe('Read');
    });

    test('rejects tool without name', () => {
      const tool = {
        description: 'Read a file',
        input_schema: { type: 'object' },
      };
      const result = validateToolSchema(tool);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tool must have a name');
    });

    test('rejects tool with empty name', () => {
      const tool = {
        name: '   ',
        description: 'Read a file',
        input_schema: { type: 'object' },
      };
      const result = validateToolSchema(tool);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tool name cannot be empty');
    });

    test('rejects tool without description', () => {
      const tool = {
        name: 'Read',
        input_schema: { type: 'object' },
      };
      const result = validateToolSchema(tool);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('description');
    });

    test('rejects tool without input_schema', () => {
      const tool = {
        name: 'Read',
        description: 'Read a file',
      };
      const result = validateToolSchema(tool);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tool must have input_schema');
    });

    test('rejects tool with invalid input_schema (no type)', () => {
      const tool = {
        name: 'Read',
        description: 'Read a file',
        input_schema: { properties: {} },
      };
      const result = validateToolSchema(tool);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('valid JSON Schema');
    });

    test('accepts JSON Schema with additional fields', () => {
      const tool = {
        name: 'Write',
        description: 'Write a file',
        input_schema: {
          type: 'object',
          $schema: 'http://json-schema.org/draft-07/schema#',
          additionalProperties: false,
          properties: {
            content: { type: 'string', minLength: 1, maxLength: 10000 },
          },
          required: ['content'],
        },
      };
      const result = validateToolSchema(tool);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateToolArguments', () => {
    const schema = {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content: { type: 'string' },
        count: { type: 'number' },
      },
      required: ['file_path'],
    };

    test('validates arguments with all required fields', () => {
      const args = { file_path: '/test.ts' };
      const result = validateToolArguments(args, schema);
      expect(result.isValid).toBe(true);
    });

    test('validates arguments with optional fields', () => {
      const args = { file_path: '/test.ts', content: 'hello', count: 5 };
      const result = validateToolArguments(args, schema);
      expect(result.isValid).toBe(true);
    });

    test('rejects missing required fields', () => {
      const args = { content: 'hello' };
      const result = validateToolArguments(args, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Missing required field: file_path');
    });

    test('rejects wrong type for field', () => {
      const args = { file_path: '/test.ts', count: 'not a number' };
      const result = validateToolArguments(args, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("'count'");
      expect(result.errors[0]).toContain('wrong type');
    });

    test('handles undefined arguments with no required fields', () => {
      const noRequiredSchema = { type: 'object', properties: {} };
      const result = validateToolArguments(undefined, noRequiredSchema);
      expect(result.isValid).toBe(true);
    });

    test('handles arrays correctly', () => {
      const arraySchema = {
        type: 'object',
        properties: {
          items: { type: 'array' },
        },
      };
      const args = { items: [1, 2, 3] };
      const result = validateToolArguments(args, arraySchema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateOpenAIToolCall', () => {
    test('validates correct function tool call', () => {
      const toolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'Read',
          arguments: '{"file_path": "/test.ts"}',
        },
      };
      expect(validateOpenAIToolCall(toolCall)).toBe(true);
    });

    test('rejects tool call without type', () => {
      const toolCall = {
        id: 'call_123',
        function: { name: 'Read' },
      };
      expect(validateOpenAIToolCall(toolCall)).toBe(false);
    });

    test('rejects function type without function field', () => {
      const toolCall = {
        id: 'call_123',
        type: 'function',
      };
      expect(validateOpenAIToolCall(toolCall)).toBe(false);
    });

    test('rejects function without name', () => {
      const toolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          arguments: '{}',
        },
      };
      expect(validateOpenAIToolCall(toolCall)).toBe(false);
    });

    test('rejects null/undefined', () => {
      expect(validateOpenAIToolCall(null)).toBe(false);
      expect(validateOpenAIToolCall(undefined)).toBe(false);
    });
  });

  describe('safeJSONParse', () => {
    test('parses valid JSON', () => {
      const result = safeJSONParse<{ key: string }>('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    test('returns null for invalid JSON', () => {
      const result = safeJSONParse('{invalid}');
      expect(result).toBeNull();
    });

    test('handles empty string', () => {
      const result = safeJSONParse('');
      expect(result).toBeNull();
    });
  });

  describe('Production Edge Cases', () => {
    test('handles streaming partial JSON gracefully', () => {
      // Simulates incomplete JSON from streaming that gets cut off
      const partialJSON = '{"file_path": "/test.ts", "content": "hello wor';
      const result = parseToolArguments(partialJSON);
      expect(result.isValid).toBe(false);
      // Should have parse error, not crash
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('handles tool with empty input_schema properties', () => {
      // Some tools have no parameters
      const tool = {
        name: 'GetStatus',
        description: 'Get current status',
        input_schema: {
          type: 'object',
          properties: {},
          required: [],
        },
      };
      const result = validateToolSchema(tool);
      expect(result.isValid).toBe(true);
    });

    test('handles deeply nested tool arguments', () => {
      const deepNested = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };
      const result = parseToolArguments(deepNested);
      expect(result.isValid).toBe(true);
      expect(result.arguments).toEqual(deepNested);
    });

    test('handles special characters in arguments', () => {
      const args = JSON.stringify({
        content: 'Hello\nWorld\t"quoted"\u0000null',
        path: '/path/with spaces/file.ts',
      });
      const result = parseToolArguments(args);
      expect(result.isValid).toBe(true);
    });
  });
});
