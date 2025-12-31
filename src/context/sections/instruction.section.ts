/**
 * Instruction Section Builder
 * Memory usage instructions for the agent
 */

import type { ContextSection } from '../types';
import { ContextPriority } from '../types';

export function buildInstructionSections(): ContextSection[] {
  const sections: ContextSection[] = [];

  sections.push({
    id: 'memory-instructions',
    name: 'Memory Instructions',
    content: MEMORY_INSTRUCTIONS,
    priority: ContextPriority.MEDIUM,
    tokenCount: estimateTokens(MEMORY_INSTRUCTIONS),
    category: 'instruction',
  });

  return sections;
}

const MEMORY_INSTRUCTIONS = `<memory_instructions>
You have access to persistent memory that has been automatically loaded based on this request.

**Your memories are shown above in <global_memory> and <project_memory> sections.**

When you learn something important during this conversation:
- User preferences → Will be remembered globally
- Project decisions → Will be remembered for this project
- Patterns discovered → Will be remembered appropriately

**Memory Tools Available:**
- **ccr_remember**: Save new memories explicitly (returns confirmation with ID)
- **ccr_recall**: Query memories by semantic search (find specific information)
- **ccr_forget**: Delete a memory by ID (remove outdated information)

**When to explicitly save new memories:**
- When the user states a preference ("I prefer...", "Always use...", "Never...")
- When an architectural decision is made
- When you discover a project pattern worth preserving
- When you solve a tricky problem that might recur

To save a memory inline (auto-extracted, no confirmation):
<remember scope="global|project" category="preference|pattern|decision|architecture|knowledge|error|workflow">
Content to remember
</remember>

Or use the ccr_remember tool for explicit save with confirmation.
</memory_instructions>`;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
