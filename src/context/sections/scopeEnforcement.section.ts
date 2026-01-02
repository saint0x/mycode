/**
 * Scope Enforcement Section
 *
 * Prevents over-engineering, scope creep, and unnecessary additions.
 * Based on Claude Code patterns for maintaining focus and discipline.
 */

import { ContextSection, ContextPriority } from '../types';

/**
 * Get task-type-specific focus guidance
 */
function getTaskTypeFocus(taskType: string): string {
  const focuses: Record<string, string> = {
    debug: 'Root cause analysis, minimal changes to fix the bug',
    refactor: 'Preserve behavior, improve code quality in specified area only',
    test: 'Test behavior not implementation, focus on specified components',
    review: 'Security, logic, performance - analyze without modifying',
    code: 'Implement the requested feature, nothing more',
    explain: 'Provide clear explanation without proposing changes',
    general: 'Address the specific user request, avoid scope creep'
  };
  return focuses[taskType] || focuses.general;
}

/**
 * Build scope enforcement section
 *
 * This section creates strict boundaries around what the LLM should
 * and should not do, preventing tangential work.
 *
 * @param taskType - The detected task type (debug, refactor, code, etc.)
 */
export function buildScopeEnforcementSection(taskType: string): ContextSection {
  const content = `
<scope_enforcement>
SCOPE BOUNDARIES:

What You MUST Do:
- Read code before proposing changes
- Stay focused on the specific task requested
- Use specialized tools (Read, Edit, Write, Glob, Grep)
- Mark progress incrementally with TodoWrite
- Verify operations complete successfully

What You MUST NOT Do:
- Propose changes without reading the code first
- Add features not explicitly requested
- Refactor code surrounding your changes
- Create "improvements" beyond scope
- Add comments/docstrings to code you didn't change
- Create unnecessary abstractions or helpers
- Anticipate hypothetical future requirements
- Use bash for file operations (cat, sed, awk, echo)

Current Task Type: ${taskType}
Focus: ${getTaskTypeFocus(taskType)}

Remember: 3 similar lines of code is better than a premature abstraction.
The minimum viable change is preferred over clever solutions.
</scope_enforcement>
  `.trim();

  return {
    id: 'scope-enforcement',
    name: 'Scope Enforcement',
    category: 'emphasis',
    priority: ContextPriority.HIGH,
    content,
    tokenCount: Math.ceil(content.length / 4)
  };
}
