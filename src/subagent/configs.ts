/**
 * Sub-Agent Configurations
 * Predefined configurations for different sub-agent types
 */

import type { SubAgentConfig, SubAgentType } from './types';

// Research agent: focused on information gathering and analysis
const RESEARCH_CONFIG: SubAgentConfig = {
  type: 'research',
  maxTokens: 4096,
  systemPrompt: `You are a Research Sub-Agent specialized in information gathering and analysis.

Your role is to:
- Search and analyze codebases to find relevant information
- Read and understand code structure and patterns
- Gather context about specific topics or implementations
- Provide comprehensive research summaries

Focus on:
1. Thorough exploration using search and file reading tools
2. Understanding relationships between code components
3. Identifying patterns and conventions
4. Providing clear, organized findings

You should NOT modify any files - your role is purely research and analysis.

When complete, provide a clear summary of your findings.`,
  allowedTools: [
    'Read',
    'Glob',
    'Grep',
    'LSP',
    'WebSearch',
    'WebFetch',
    'ccr_recall',  // Phase 9.2.4: Can query memories but not modify
  ],
  disallowedTools: [
    'Write',
    'Edit',
    'Bash',
    'NotebookEdit',
    'ccr_remember',  // Research agents should not save memories
    'ccr_forget',    // Research agents should not delete memories
  ],
};

// Code agent: focused on implementation and modification
const CODE_CONFIG: SubAgentConfig = {
  type: 'code',
  maxTokens: 8192,
  systemPrompt: `You are a Code Sub-Agent specialized in implementation and code modifications.

Your role is to:
- Implement features according to specifications
- Write clean, well-structured code
- Follow existing patterns and conventions
- Make targeted code modifications

Focus on:
1. Understanding existing code before making changes
2. Writing code that matches the project's style
3. Making minimal, focused changes
4. Testing your changes when possible

Guidelines:
- Read files before editing them
- Prefer editing existing files over creating new ones
- Follow established patterns in the codebase
- Don't introduce unnecessary complexity

When complete, provide a summary of changes made.`,
  allowedTools: [
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Bash',
    'LSP',
    'NotebookEdit',
    'ccr_remember',  // Phase 9.2.4: Full memory access
    'ccr_recall',
    'ccr_forget',
  ],
};

// Review agent: focused on code review and analysis
const REVIEW_CONFIG: SubAgentConfig = {
  type: 'review',
  maxTokens: 4096,
  systemPrompt: `You are a Review Sub-Agent specialized in code review and analysis.

Your role is to:
- Review code for correctness and quality
- Identify potential bugs, security issues, and anti-patterns
- Suggest improvements without making changes
- Analyze architecture and design decisions

Focus on:
1. Logic correctness and edge cases
2. Security vulnerabilities
3. Performance implications
4. Code clarity and maintainability
5. Adherence to best practices

You should NOT modify any files - your role is review and recommendations only.

Provide structured feedback with:
- Issues found (categorized by severity)
- Suggestions for improvement
- Positive observations`,
  allowedTools: [
    'Read',
    'Glob',
    'Grep',
    'LSP',
    'ccr_recall',  // Phase 9.2.4: Can query memories for context
  ],
  disallowedTools: [
    'Write',
    'Edit',
    'Bash',
    'NotebookEdit',
    'WebSearch',
    'WebFetch',
    'ccr_remember',  // Review agents should not save memories
    'ccr_forget',    // Review agents should not delete memories
  ],
};

// Custom agent: minimal constraints, used for user-defined tasks
const CUSTOM_CONFIG: SubAgentConfig = {
  type: 'custom',
  maxTokens: 8192,
  systemPrompt: `You are a Sub-Agent executing a custom task.

Follow the task instructions provided and complete the work as specified.
Use available tools as needed to accomplish the goal.

When complete, provide a summary of what was done.`,
  // No tool restrictions for custom agents
};

// Configuration map
export const SUBAGENT_CONFIGS: Record<SubAgentType, SubAgentConfig> = {
  research: RESEARCH_CONFIG,
  code: CODE_CONFIG,
  review: REVIEW_CONFIG,
  custom: CUSTOM_CONFIG,
};

/**
 * Get configuration for a sub-agent type
 */
export function getSubAgentConfig(type: SubAgentType): SubAgentConfig {
  return SUBAGENT_CONFIGS[type];
}

/**
 * Build final system prompt for sub-agent with context
 */
export function buildSubAgentSystemPrompt(
  config: SubAgentConfig,
  task: string,
  additionalContext?: string,
  memoryContext?: string
): string {
  const parts: string[] = [];

  // Add memory context first if available
  if (memoryContext) {
    parts.push(memoryContext);
  }

  // Add base system prompt
  parts.push(config.systemPrompt);

  // Add task-specific instruction
  parts.push(`
<task>
${task}
</task>`);

  // Add additional context if provided
  if (additionalContext) {
    parts.push(`
<additional_context>
${additionalContext}
</additional_context>`);
  }

  // Add sub-agent awareness
  parts.push(`
<sub_agent_awareness>
You are running as a sub-agent within a larger system.
- Complete your task efficiently and report back
- You cannot spawn additional sub-agents
- Focus on the specific task assigned
- Provide a clear summary when done
</sub_agent_awareness>`);

  return parts.join('\n\n');
}

/**
 * Filter tools based on sub-agent configuration
 */
export function filterToolsForSubAgent(
  allTools: any[],
  config: SubAgentConfig
): any[] {
  // If no restrictions, return all tools
  if (!config.allowedTools && !config.disallowedTools) {
    return allTools;
  }

  return allTools.filter(tool => {
    const toolName = tool.name;

    // Check disallowed first
    if (config.disallowedTools?.includes(toolName)) {
      return false;
    }

    // If allowed list exists, only include those
    if (config.allowedTools) {
      return config.allowedTools.includes(toolName);
    }

    // Default: allow
    return true;
  });
}
