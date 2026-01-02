/**
 * Tool Formatting Section
 *
 * Strict enforcement of proper tool call parameter formatting.
 * Prevents "Invalid tool parameters" errors by showing exact examples.
 */

import { ContextSection, ContextPriority } from '../types';

export function buildToolFormattingSection(): ContextSection {
  const content = `
<tool_formatting_requirements>
CRITICAL: Proper Tool Call Formatting

ALL tool parameters MUST be complete, valid values. NEVER use:
- Placeholders like "..." or "placeholder"
- undefined, null, or empty strings for required parameters
- Incomplete JSON objects or arrays
- Comments inside parameter values

CORRECT Tool Call Examples:

1. TodoWrite - Array of complete todo objects:
CORRECT:
<invoke name="TodoWrite">
<parameter name="todos">[{"content": "Fix authentication bug", "status": "in_progress", "activeForm": "Fixing authentication bug"}, {"content": "Update tests", "status": "pending", "activeForm": "Updating tests"}]</parameter>
</invoke>

WRONG:
<invoke name="TodoWrite">
<parameter name="todos">[{"content": "Fix bug", "status": ...}]</parameter>
</invoke>

2. Read - Complete file path:
CORRECT:
<invoke name="Read">
<parameter name="file_path">/Users/deepsaint/Desktop/mycode/src/index.ts</parameter>
</invoke>

WRONG:
<invoke name="Read">
<parameter name="file_path">undefined</parameter>
</invoke>

3. AskUserQuestion - Complete question objects:
CORRECT:
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "Which approach?", "header": "Approach", "options": [{"label": "Option A", "description": "Description A"}, {"label": "Option B", "description": "Description B"}], "multiSelect": false}]</parameter>
</invoke>

WRONG:
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "Which?", "options": [...]}]</parameter>
</invoke>

VALIDATION RULES:
1. Check ALL required parameters are present
2. Ensure values match expected types (string, number, boolean, object, array)
3. For arrays/objects: Use proper JSON syntax
4. For strings: Use actual values, not "undefined" or "null" text
5. Never leave parameters incomplete - if unsure, ask the user first

If a tool requires information you don't have:
- Use AskUserQuestion to get the information first
- Do NOT make the tool call with placeholder values
- Do NOT guess or use undefined
</tool_formatting_requirements>
  `.trim();

  return {
    id: 'tool-formatting',
    name: 'Tool Formatting Requirements',
    category: 'engineering',
    priority: ContextPriority.CRITICAL,
    content,
    tokenCount: Math.ceil(content.length / 4),
  };
}
