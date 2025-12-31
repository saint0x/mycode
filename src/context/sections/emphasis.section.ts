/**
 * Emphasis Section Builder
 * Task-specific guidance and emphasis
 */

import type { ContextSection, RequestAnalysis } from '../types';
import { ContextPriority } from '../types';

export function buildEmphasisSections(analysis: RequestAnalysis): ContextSection[] {
  const sections: ContextSection[] = [];

  // Task-specific emphasis
  const emphasis = getTaskEmphasis(analysis.taskType);
  if (emphasis) {
    sections.push({
      id: 'task-emphasis',
      name: 'Task Emphasis',
      content: emphasis,
      priority: ContextPriority.HIGH,
      tokenCount: estimateTokens(emphasis),
      category: 'emphasis',
      metadata: { taskType: analysis.taskType },
    });
  }

  // Complexity-based guidance
  if (analysis.complexity === 'complex') {
    const complexGuidance = getComplexityGuidance();
    sections.push({
      id: 'complexity-guidance',
      name: 'Complexity Guidance',
      content: complexGuidance,
      priority: ContextPriority.MEDIUM,
      tokenCount: estimateTokens(complexGuidance),
      category: 'emphasis',
    });
  }

  return sections;
}

function getTaskEmphasis(taskType: RequestAnalysis['taskType']): string | null {
  const emphases: Record<string, string> = {
    debug: `<emphasis>
You are debugging. Focus on:
1. Understanding the error/symptom completely
2. Tracing the root cause methodically
3. Verifying fixes don't introduce regressions
</emphasis>`,

    refactor: `<emphasis>
You are refactoring. Focus on:
1. Preserving existing behavior exactly
2. Improving code quality incrementally
3. Running tests after each change
</emphasis>`,

    test: `<emphasis>
You are writing tests. Focus on:
1. Testing behavior, not implementation
2. Edge cases and error conditions
3. Clear, descriptive test names
</emphasis>`,

    review: `<emphasis>
You are reviewing code. Focus on:
1. Logic correctness and edge cases
2. Security vulnerabilities
3. Performance implications
4. Code clarity and maintainability
</emphasis>`,
  };

  return emphases[taskType] || null;
}

function getComplexityGuidance(): string {
  return `<complexity_guidance>
This appears to be a complex task. Consider:
1. Breaking it into smaller, verifiable steps
2. Validating assumptions before proceeding
3. Testing incrementally rather than all at once
4. Asking clarifying questions if uncertain
</complexity_guidance>`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
