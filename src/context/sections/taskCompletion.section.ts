/**
 * Task Completion Section
 *
 * Enforces TodoWrite discipline and progressive task completion.
 * Based on Claude Code patterns for task management and accountability.
 */

import { ContextSection, ContextPriority } from '../types';

/**
 * Build task completion discipline section
 *
 * This section teaches the LLM how to properly use TodoWrite and
 * enforce incremental progress visibility.
 */
export function buildTaskCompletionSection(): ContextSection {
  return {
    category: 'instruction',
    priority: ContextPriority.HIGH,
    content: `
<task_completion_discipline>
TASK MANAGEMENT REQUIREMENTS:

1. TodoWrite Tool Usage:
   - Use for: Multi-step tasks (3+ steps), complex work, user-provided task lists
   - Skip for: Single trivial tasks, informational requests
   - Task format: { content: "Do X", activeForm: "Doing X", status: "pending|in_progress|completed" }

2. Task State Management:
   - Mark in_progress BEFORE starting work (not after)
   - Exactly ONE task in_progress at a time (never multiple)
   - Mark completed IMMEDIATELY after finishing (no batching)
   - Remove stale/irrelevant tasks from list entirely

3. Progress Verification:
   - After git commit → run git status to verify
   - After file edit → explain what changed
   - After complex operation → confirm success
   - Make progress visible to the user at each step

4. When NOT to use TodoWrite:
   - Single straightforward task
   - Trivial tasks (< 3 steps)
   - Conversational/informational requests
   - Tasks that can be completed in one action

Examples:

✓ CORRECT TodoWrite Usage:
User: "Refactor auth system, update tests, and deploy"
→ Create TodoWrite with 3 tasks
→ Mark first as in_progress
→ Complete each individually

✗ WRONG TodoWrite Usage:
User: "What does this function do?"
→ Don't use TodoWrite (informational only)
→ Just answer the question
</task_completion_discipline>
    `.trim(),
    tokenEstimate: 380
  };
}
