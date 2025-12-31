/**
 * Memory Section Builder
 * Formats memories into context sections
 */

import type { ContextSection } from '../types';
import { ContextPriority } from '../types';
import { getMemoryService, hasMemoryService } from '../../memory';
import type { Memory } from '../../memory/types';

export async function buildMemorySections(
  request: { messages: any[]; projectPath?: string },
  maxSections: number = 10
): Promise<ContextSection[]> {
  if (!hasMemoryService()) {
    return [];
  }

  const memoryService = getMemoryService();
  const sections: ContextSection[] = [];

  try {
    const context = await memoryService.getContextForRequest(request);

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
