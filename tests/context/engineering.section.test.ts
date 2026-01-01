/**
 * Engineering Section Builder Tests
 */

import { describe, test, expect } from 'bun:test';
import { buildEngineeringSections } from '../../src/context/sections/engineering.section';
import type { RequestAnalysis } from '../../src/context/types';
import { ContextPriority } from '../../src/context/types';

describe('buildEngineeringSections', () => {
  describe('Section Generation', () => {
    test('should generate all sections for code task', () => {
      const analysis: RequestAnalysis = {
        taskType: 'code',
        complexity: 'moderate',
        requiresMemory: true,
        requiresProjectContext: true,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);

      expect(sections).toHaveLength(4); // core + tool + system + task-specific
      expect(sections.map(s => s.id)).toContain('core-principles');
      expect(sections.map(s => s.id)).toContain('tool-guidelines');
      expect(sections.map(s => s.id)).toContain('system-features');
      expect(sections.map(s => s.id)).toContain('task-engineering');
    });

    test('should generate base sections for general task', () => {
      const analysis: RequestAnalysis = {
        taskType: 'general',
        complexity: 'simple',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);

      expect(sections).toHaveLength(3); // core + tool + system (no task-specific)
      expect(sections.map(s => s.id)).not.toContain('task-engineering');
    });

    test('should generate base sections for explain task', () => {
      const analysis: RequestAnalysis = {
        taskType: 'explain',
        complexity: 'simple',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);

      expect(sections).toHaveLength(3); // core + tool + system (no task-specific)
      expect(sections.map(s => s.id)).not.toContain('task-engineering');
    });

    test('should respect disabled config', () => {
      const analysis: RequestAnalysis = {
        taskType: 'code',
        complexity: 'moderate',
        requiresMemory: true,
        requiresProjectContext: true,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis, { enabled: false });
      expect(sections).toHaveLength(0);
    });
  });

  describe('Section Content', () => {
    test('core principles section should contain key topics', () => {
      const analysis: RequestAnalysis = {
        taskType: 'general',
        complexity: 'simple',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const coreSection = sections.find(s => s.id === 'core-principles');

      expect(coreSection).toBeDefined();
      expect(coreSection!.content).toContain('Error Handling');
      expect(coreSection!.content).toContain('Modular Design');
      expect(coreSection!.content).toContain('Architecture');
      expect(coreSection!.content).toContain('Anti-Over-Engineering');
      expect(coreSection!.content).toContain('Memory Efficiency');
      expect(coreSection!.content).toContain('Code Quality Standards');
      expect(coreSection!.content).toContain('Type Safety');
      expect(coreSection!.content).toContain('Testing Expectations');
      expect(coreSection!.content).toContain('Elite Implementation Qualities');
    });

    test('tool guidelines section should contain patterns', () => {
      const analysis: RequestAnalysis = {
        taskType: 'general',
        complexity: 'simple',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const toolSection = sections.find(s => s.id === 'tool-guidelines');

      expect(toolSection).toBeDefined();
      expect(toolSection!.content).toContain('Tool Call Structure');
      expect(toolSection!.content).toContain('Error Handling for Tools');
      expect(toolSection!.content).toContain('Parallel vs Sequential');
      expect(toolSection!.content).toContain('Tool Call Best Practices');
      expect(toolSection!.content).toContain('Common Patterns');
      expect(toolSection!.content).toContain('CORRECT');
      expect(toolSection!.content).toContain('WRONG');
    });

    test('system features section should document agents, skills, and hooks', () => {
      const analysis: RequestAnalysis = {
        taskType: 'general',
        complexity: 'simple',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const systemSection = sections.find(s => s.id === 'system-features');

      expect(systemSection).toBeDefined();
      expect(systemSection!.content).toContain('Agents System');
      expect(systemSection!.content).toContain('memoryAgent');
      expect(systemSection!.content).toContain('imageAgent');
      expect(systemSection!.content).toContain('subAgentAgent');
      expect(systemSection!.content).toContain('Skills System');
      expect(systemSection!.content).toContain('Slash Commands');
      expect(systemSection!.content).toContain('Hooks System');
      expect(systemSection!.content).toContain('Lifecycle Interceptors');
      expect(systemSection!.content).toContain('PreToolUse');
      expect(systemSection!.content).toContain('PostToolUse');
    });
  });

  describe('Task-Specific Content', () => {
    test.each([
      ['code', 'implementation'],
      ['debug', 'debugging'],
      ['refactor', 'refactoring'],
      ['test', 'testing'],
      ['review', 'code_review'],
    ])('should generate %s-specific guidance', (taskType, expectedType) => {
      const analysis: RequestAnalysis = {
        taskType: taskType as any,
        complexity: 'moderate',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const taskSection = sections.find(s => s.id === 'task-engineering');

      expect(taskSection).toBeDefined();
      expect(taskSection!.content).toContain(`type="${expectedType}"`);
    });

    test('should return no task section for general tasks', () => {
      const analysis: RequestAnalysis = {
        taskType: 'general',
        complexity: 'moderate',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const taskSection = sections.find(s => s.id === 'task-engineering');

      expect(taskSection).toBeUndefined();
    });

    test('should return no task section for explain tasks', () => {
      const analysis: RequestAnalysis = {
        taskType: 'explain',
        complexity: 'moderate',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const taskSection = sections.find(s => s.id === 'task-engineering');

      expect(taskSection).toBeUndefined();
    });
  });

  describe('Token Estimation', () => {
    test('should estimate tokens accurately for code task', () => {
      const analysis: RequestAnalysis = {
        taskType: 'code',
        complexity: 'moderate',
        requiresMemory: true,
        requiresProjectContext: true,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const totalTokens = sections.reduce((sum, s) => sum + s.tokenCount, 0);

      // Should be around 3100-3200 tokens total
      expect(totalTokens).toBeGreaterThan(2800);
      expect(totalTokens).toBeLessThan(3500);
    });

    test('should estimate tokens accurately for general task', () => {
      const analysis: RequestAnalysis = {
        taskType: 'general',
        complexity: 'simple',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const totalTokens = sections.reduce((sum, s) => sum + s.tokenCount, 0);

      // Should be around 3000 tokens (no task-specific section)
      expect(totalTokens).toBeGreaterThan(2500);
      expect(totalTokens).toBeLessThan(3300);
    });

    test('each section should have reasonable token counts', () => {
      const analysis: RequestAnalysis = {
        taskType: 'code',
        complexity: 'moderate',
        requiresMemory: true,
        requiresProjectContext: true,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);

      const coreSection = sections.find(s => s.id === 'core-principles');
      expect(coreSection!.tokenCount).toBeGreaterThan(800);
      expect(coreSection!.tokenCount).toBeLessThan(1400);

      const toolSection = sections.find(s => s.id === 'tool-guidelines');
      expect(toolSection!.tokenCount).toBeGreaterThan(700);
      expect(toolSection!.tokenCount).toBeLessThan(1000);

      const systemSection = sections.find(s => s.id === 'system-features');
      expect(systemSection!.tokenCount).toBeGreaterThan(700);
      expect(systemSection!.tokenCount).toBeLessThan(1000);

      const taskSection = sections.find(s => s.id === 'task-engineering');
      expect(taskSection!.tokenCount).toBeGreaterThan(100);
      expect(taskSection!.tokenCount).toBeLessThan(500);
    });
  });

  describe('Priority Assignment', () => {
    test('core principles should be HIGH priority', () => {
      const analysis: RequestAnalysis = {
        taskType: 'general',
        complexity: 'simple',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const coreSection = sections.find(s => s.id === 'core-principles');

      expect(coreSection!.priority).toBe(ContextPriority.HIGH);
    });

    test('tool guidelines should be HIGH priority', () => {
      const analysis: RequestAnalysis = {
        taskType: 'general',
        complexity: 'simple',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const toolSection = sections.find(s => s.id === 'tool-guidelines');

      expect(toolSection!.priority).toBe(ContextPriority.HIGH);
    });

    test('system features should be MEDIUM priority', () => {
      const analysis: RequestAnalysis = {
        taskType: 'general',
        complexity: 'simple',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const systemSection = sections.find(s => s.id === 'system-features');

      expect(systemSection!.priority).toBe(ContextPriority.MEDIUM);
    });

    test('task-specific should be MEDIUM priority', () => {
      const analysis: RequestAnalysis = {
        taskType: 'code',
        complexity: 'moderate',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);
      const taskSection = sections.find(s => s.id === 'task-engineering');

      expect(taskSection!.priority).toBe(ContextPriority.MEDIUM);
    });
  });

  describe('Category Assignment', () => {
    test('all sections should have engineering category', () => {
      const analysis: RequestAnalysis = {
        taskType: 'code',
        complexity: 'moderate',
        requiresMemory: true,
        requiresProjectContext: true,
        keywords: [],
        entities: [],
      };

      const sections = buildEngineeringSections(analysis);

      expect(sections.every(s => s.category === 'engineering')).toBe(true);
    });
  });

  describe('Caching Behavior', () => {
    test('should return same instances for multiple calls (caching)', () => {
      const analysis1: RequestAnalysis = {
        taskType: 'code',
        complexity: 'moderate',
        requiresMemory: true,
        requiresProjectContext: true,
        keywords: [],
        entities: [],
      };

      const analysis2: RequestAnalysis = {
        taskType: 'code',
        complexity: 'simple',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: ['different'],
        entities: ['keywords'],
      };

      const sections1 = buildEngineeringSections(analysis1);
      const sections2 = buildEngineeringSections(analysis2);

      // Same task type should return same instances (cached)
      expect(sections1[0]).toBe(sections2[0]); // core-principles
      expect(sections1[1]).toBe(sections2[1]); // tool-guidelines
      expect(sections1[2]).toBe(sections2[2]); // system-features
      expect(sections1[3]).toBe(sections2[3]); // task-engineering
    });

    test('should return different task sections for different task types', () => {
      const codeAnalysis: RequestAnalysis = {
        taskType: 'code',
        complexity: 'moderate',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const debugAnalysis: RequestAnalysis = {
        taskType: 'debug',
        complexity: 'moderate',
        requiresMemory: false,
        requiresProjectContext: false,
        keywords: [],
        entities: [],
      };

      const codeSections = buildEngineeringSections(codeAnalysis);
      const debugSections = buildEngineeringSections(debugAnalysis);

      const codeTask = codeSections.find(s => s.id === 'task-engineering');
      const debugTask = debugSections.find(s => s.id === 'task-engineering');

      expect(codeTask).toBeDefined();
      expect(debugTask).toBeDefined();
      expect(codeTask!.content).not.toBe(debugTask!.content);
      expect(codeTask!.metadata?.taskType).toBe('code');
      expect(debugTask!.metadata?.taskType).toBe('debug');
    });
  });
});
