/**
 * Memory Section Builder
 * Formats memories into context sections
 */

import type { ContextSection } from '../types';
import { ContextPriority } from '../types';
import { getMemoryService, hasMemoryService } from '../../memory';
import type { Memory } from '../../memory/types';

interface MessageItem {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
}

export async function buildMemorySections(
  request: { messages: MessageItem[]; projectPath?: string },
  maxSections: number = 10
): Promise<ContextSection[]> {
  if (!hasMemoryService()) {
    return [];
  }

  const memoryService = getMemoryService();
  const sections: ContextSection[] = [];

  try {
    const context = await memoryService.getContextForRequest(request);

    const totalMemories = context.globalMemories.length + context.projectMemories.length;

    // Add memory injection indicator if any memories were loaded
    if (totalMemories > 0) {
      const indicatorContent = buildMemoryIndicator(
        context.globalMemories.length,
        context.projectMemories.length
      );
      sections.push({
        id: 'memory-indicator',
        name: 'Memory Status',
        content: indicatorContent,
        priority: ContextPriority.CRITICAL,
        tokenCount: estimateTokens(indicatorContent),
        category: 'system',
        metadata: { totalMemories },
      });
    }

    // Build global memory section
    if (context.globalMemories.length > 0) {
      const globalContent = formatMemories(context.globalMemories, 'global');
      sections.push({
        id: 'global-memory',
        name: 'Global Memory',
        content: globalContent,
        priority: ContextPriority.HIGH,
        tokenCount: estimateTokens(globalContent),
        category: 'memory',
        metadata: { memoryCount: context.globalMemories.length },
      });
    }

    // Build project memory section
    if (context.projectMemories.length > 0) {
      const projectContent = formatMemories(context.projectMemories, 'project');
      sections.push({
        id: 'project-memory',
        name: 'Project Memory',
        content: projectContent,
        priority: ContextPriority.HIGH,
        tokenCount: estimateTokens(projectContent),
        category: 'memory',
        metadata: { memoryCount: context.projectMemories.length },
      });
    }
  } catch (error) {
    console.error('[Memory Section] Error building memory sections:', error);
  }

  return sections.slice(0, maxSections);
}

function buildMemoryIndicator(globalCount: number, projectCount: number): string {
  const lines: string[] = [
    '<memory_status>',
    'Memories have been automatically loaded based on semantic relevance to this conversation.',
    `- Global memories: ${globalCount}`,
    `- Project memories: ${projectCount}`,
    '',
    'These memories represent your persistent knowledge. Do not re-query for information already present.',
    'Use mc_remember to save new important information, mc_recall for explicit searches, mc_forget to remove outdated info.',
    '',
    'IMPORTANT: When using memory tools, follow their exact schemas:',
    '- mc_remember: {content, category, scope, importance}',
    '- mc_recall: {query, scope, limit}',
    '- mc_forget: {id} or {pattern, scope}',
    'Do NOT add extra fields like "id", "priority", "index" to these tools.',
    '</memory_status>'
  ];
  return lines.join('\n');
}

function formatMemories(memories: Memory[], scope: 'global' | 'project'): string {
  const grouped = groupByCategory(memories);
  const lines: string[] = [];

  if (scope === 'global') {
    lines.push('<global_memory scope="cross-project">');
    lines.push('Your persistent knowledge about this user across all projects:');
  } else {
    lines.push('<project_memory scope="current-project">');
    lines.push('Your knowledge about this specific project:');
  }
  lines.push('');

  for (const [category, mems] of Object.entries(grouped)) {
    if (mems.length > 0) {
      lines.push(`## ${formatCategory(category)}`);
      for (const m of mems) {
        lines.push(`- ${m.content}`);
      }
      lines.push('');
    }
  }

  lines.push(scope === 'global' ? '</global_memory>' : '</project_memory>');
  return lines.join('\n');
}

function groupByCategory(memories: Memory[]): Record<string, Memory[]> {
  return memories.reduce((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {} as Record<string, Memory[]>);
}

function formatCategory(category: string): string {
  const names: Record<string, string> = {
    preference: 'User Preferences',
    pattern: 'Patterns & Conventions',
    knowledge: 'Domain Knowledge',
    decision: 'Decisions Made',
    architecture: 'Architecture',
    context: 'Context',
    code: 'Code Knowledge',
    error: 'Past Errors & Solutions',
    workflow: 'Workflow Preferences',
  };
  return names[category] || category;
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}
