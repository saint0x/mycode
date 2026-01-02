/**
 * System Reminders Section
 *
 * Dynamic reminders that reinforce behavioral patterns during conversation.
 * Based on Claude Code's system-reminder pattern for maintaining focus.
 */

import { ContextSection, ContextPriority } from '../types';

export type ReminderType = 'focus' | 'progress' | 'scope';

/**
 * Build a system reminder based on type
 *
 * System reminders are periodic reinforcements of behavioral patterns
 * that help maintain focus and discipline throughout the conversation.
 *
 * @param reminderType - Type of reminder to build
 */
export function buildSystemReminder(reminderType: ReminderType): string {
  const reminders: Record<ReminderType, string> = {
    focus: `
<system-reminder>
FOCUS CHECK: Are you working on the current task or exploring tangentially?
If exploring, return to the active in_progress task immediately.
Current task count: Check TodoWrite list for exactly ONE in_progress task.
</system-reminder>
    `.trim(),

    progress: `
<system-reminder>
PROGRESS CHECK: Have you marked completed tasks as done?
TodoWrite discipline: Mark each task completed IMMEDIATELY after finishing.
No batching - update the list after EVERY completed task.
</system-reminder>
    `.trim(),

    scope: `
<system-reminder>
SCOPE CHECK: Are you adding features or improvements not requested?
Read the original user request. Focus only on what was explicitly asked.
Avoid over-engineering. The minimum viable change is preferred.
</system-reminder>
    `.trim()
  };

  return reminders[reminderType];
}

/**
 * Build all system reminders as a single section
 *
 * This combines all reminder types into one section for efficiency.
 * Use this when you want comprehensive behavioral reinforcement.
 */
export function buildSystemRemindersSection(): ContextSection {
  const content = `
${buildSystemReminder('focus')}

${buildSystemReminder('progress')}

${buildSystemReminder('scope')}
  `.trim();

  return {
    id: 'system-reminders',
    name: 'System Reminders',
    category: 'emphasis',
    priority: ContextPriority.MEDIUM,
    content,
    tokenCount: Math.ceil(content.length / 4)
  };
}
