/**
 * Test Fixtures - Realistic test data
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';

// Create temp directory for test databases
export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'ccr-test-'));
}

export function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// Sample memories for testing
export const sampleMemories = {
  global: [
    {
      content: 'User prefers TypeScript with strict mode enabled',
      category: 'preference' as const,
      importance: 0.9,
    },
    {
      content: 'Always use Prettier for code formatting',
      category: 'preference' as const,
      importance: 0.8,
    },
    {
      content: 'User prefers functional programming patterns over OOP',
      category: 'pattern' as const,
      importance: 0.7,
    },
  ],
  project: [
    {
      content: 'This project uses Fastify for the HTTP server',
      category: 'architecture' as const,
      importance: 0.8,
    },
    {
      content: 'Database operations use better-sqlite3 with WAL mode',
      category: 'decision' as const,
      importance: 0.7,
    },
    {
      content: 'Error handling follows fail-fast pattern',
      category: 'pattern' as const,
      importance: 0.6,
    },
  ],
};

// Sample messages for context building
export const sampleMessages = {
  simple: [
    { role: 'user', content: 'Hello, how are you?' },
  ],
  codeRequest: [
    { role: 'user', content: 'Please implement a function to parse JSON files' },
  ],
  debugRequest: [
    { role: 'user', content: 'I have an error in my database connection, can you help debug it?' },
  ],
  refactorRequest: [
    { role: 'user', content: 'Please refactor this code to improve performance' },
  ],
  complexConversation: [
    { role: 'user', content: 'I want to build a memory system for an AI agent' },
    { role: 'assistant', content: 'I can help you design a memory system. What features do you need?' },
    { role: 'user', content: 'I need persistent storage, vector search, and automatic context injection' },
    { role: 'assistant', content: 'Great! Let me outline the architecture...' },
    { role: 'user', content: 'Please implement the database layer with SQLite' },
    { role: 'assistant', content: 'Sure, I will implement the database layer using SQLite with WAL mode.' },
    { role: 'user', content: 'Also add embedding support for semantic search' },
  ],
};

// Sample system prompts
export const sampleSystemPrompts = {
  simple: 'You are a helpful assistant.',
  claude: [
    { type: 'text', text: 'You are Claude, an AI assistant.' },
    { type: 'text', text: '<env>Working directory: /Users/test/project</env>' },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// Phase 9: Remember tag test cases
// ═══════════════════════════════════════════════════════════════════

export const rememberTagCases = {
  standard: '<remember scope="global" category="preference">User prefers dark mode</remember>',
  reversed: '<remember category="preference" scope="global">User prefers dark mode</remember>',
  singleQuotes: "<remember scope='global' category='preference'>User prefers dark mode</remember>",
  extraWhitespace: '<remember   scope="global"   category="preference"  >User prefers dark mode</remember>',
  mixedCase: '<remember SCOPE="global" Category="Preference">User prefers dark mode</remember>',
  multiline: `<remember scope="global" category="preference">
Multi-line
content here
</remember>`,
  projectScope: '<remember scope="project" category="decision">Use SQLite for storage</remember>',
  malformedNoScope: '<remember category="preference">Missing scope</remember>',
  malformedNoCategory: '<remember scope="global">Missing category</remember>',
  malformedEmpty: '<remember></remember>',
};

export const contentWithTags = {
  single: 'Before text <remember scope="global" category="preference">remember me</remember> After text',
  multiple: 'Start <remember scope="global" category="preference">first memory</remember> middle <remember scope="project" category="decision">second memory</remember> end',
  noTags: 'Just regular content without any tags',
  onlyTag: '<remember scope="global" category="preference">only this</remember>',
  nestedContent: 'Outer <remember scope="global" category="pattern">inner content with <code>tags</code> inside</remember> outer',
  withNewlines: `Line 1
<remember scope="global" category="preference">
memory content
</remember>
Line 2`,
};

// All valid memory categories
export const validCategories = [
  'preference',
  'pattern',
  'decision',
  'architecture',
  'knowledge',
  'error',
  'workflow',
  'context',
  'code',
] as const;

// Memory config for testing
export function createTestMemoryConfig(dbPath: string) {
  return {
    enabled: true,
    dbPath,
    embedding: {
      provider: 'local' as const, // Use local provider for tests (no API calls)
      apiKey: undefined,
      baseUrl: undefined,
      model: undefined,
    },
    autoInject: {
      global: true,
      project: true,
      maxMemories: 10,
      maxTokens: 2000,
    },
    autoExtract: true,
    retention: {
      minImportance: 0.3,
      maxAgeDays: 90,
      cleanupIntervalMs: 86400000,
    },
    debugMode: true,
  };
}
