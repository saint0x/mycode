/**
 * Sub-Agent System
 * Provides ability to spawn specialized sub-agents for complex tasks
 */

import type { IAgent, ITool } from '../agents/type';
import { SUBAGENT_DEPTH_HEADER } from '../utils/router';
import { createSubAgentRunner } from './runner';
import type {
  SubAgentContext,
  SpawnSubAgentInput,
  SubAgentResult,
  SubAgentSystemConfig,
  SubAgentType,
} from './types';

// Default configuration
const DEFAULT_CONFIG: SubAgentSystemConfig = {
  enabled: true,
  maxDepth: 3,
  inheritMemory: true,
  defaultTimeout: 120000, // 2 minutes
  allowedTypes: ['research', 'code', 'review', 'custom'],
};

/**
 * Sub-Agent Agent
 * Implements IAgent interface to provide sub-agent spawning capability
 */
export class SubAgentAgent implements IAgent {
  name = 'subagent';
  tools: Map<string, ITool>;

  constructor() {
    this.tools = new Map<string, ITool>();
    this.registerTools();
  }

  /**
   * Determine if this agent should handle the request
   * Only activates if sub-agents are enabled and we're not at max depth
   */
  shouldHandle(req: any, config: any): boolean {
    const subAgentConfig = this.getConfig(config);

    // Check if sub-agents are enabled
    if (!subAgentConfig.enabled) {
      return false;
    }

    // Check depth limit
    const currentDepth = this.getDepthFromRequest(req);
    if (currentDepth >= subAgentConfig.maxDepth) {
      return false;
    }

    return true;
  }

  /**
   * Modify request before processing
   * Injects sub-agent spawning instructions into system prompt
   */
  reqHandler(req: any, config: any): void {
    const subAgentConfig = this.getConfig(config);
    const currentDepth = this.getDepthFromRequest(req);

    // Add depth tracking to request
    req.subagentDepth = currentDepth;
    req.isSubAgent = currentDepth > 0;

    // Only inject instructions if not already at max depth
    if (currentDepth >= subAgentConfig.maxDepth) {
      return;
    }

    // Inject system prompt for sub-agent awareness
    if (Array.isArray(req.body?.system)) {
      req.body.system.push({
        type: 'text',
        text: this.buildSubAgentInstructions(subAgentConfig, currentDepth),
      });
    }
  }

  /**
   * Get sub-agent configuration from router config
   */
  private getConfig(config: any): SubAgentSystemConfig {
    return {
      ...DEFAULT_CONFIG,
      ...config?.SubAgent,
    };
  }

  /**
   * Extract current depth from request headers
   */
  private getDepthFromRequest(req: any): number {
    const depthHeader = req.headers?.[SUBAGENT_DEPTH_HEADER];
    if (depthHeader) {
      return parseInt(depthHeader, 10) || 0;
    }
    return 0;
  }

  /**
   * Build instructions for sub-agent spawning
   */
  private buildSubAgentInstructions(
    config: SubAgentSystemConfig,
    currentDepth: number
  ): string {
    const remainingDepth = config.maxDepth - currentDepth;

    return `<subagent_capability>
You can spawn specialized sub-agents to handle complex tasks using the spawn_subagent tool.

Available sub-agent types:
${config.allowedTypes.includes('research') ? '- **research**: Information gathering, code analysis, exploration' : ''}
${config.allowedTypes.includes('code') ? '- **code**: Implementation, writing/editing code' : ''}
${config.allowedTypes.includes('review') ? '- **review**: Code review, security analysis, quality assessment' : ''}
${config.allowedTypes.includes('custom') ? '- **custom**: Custom tasks with user-defined instructions' : ''}

When to use sub-agents:
- Complex tasks that benefit from focused, specialized attention
- Tasks that can be parallelized
- When you need deep research or analysis
- When implementing large features in parts

Current depth: ${currentDepth}/${config.maxDepth} (can spawn ${remainingDepth > 0 ? remainingDepth - 1 : 0} more level${remainingDepth - 1 !== 1 ? 's' : ''})
${currentDepth > 0 ? '\n**Note**: You are currently running as a sub-agent.' : ''}
</subagent_capability>`;
  }

  /**
   * Register the spawn_subagent tool
   */
  private registerTools(): void {
    this.tools.set('spawn_subagent', {
      name: 'spawn_subagent',
      description: `Spawn a specialized sub-agent to handle a complex task. Sub-agents run independently and return their results.

Available types:
- research: For information gathering, code exploration, and analysis (read-only)
- code: For implementing features, writing and editing code
- review: For code review, security analysis, quality assessment (read-only)
- custom: For custom tasks with specific instructions`,
      input_schema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['research', 'code', 'review', 'custom'],
            description: 'Type of sub-agent to spawn',
          },
          task: {
            type: 'string',
            description: 'Clear description of the task for the sub-agent to complete',
          },
          context: {
            type: 'string',
            description: 'Additional context to provide to the sub-agent (optional)',
          },
          streamProgress: {
            type: 'boolean',
            description: 'Whether to stream progress updates (default: false)',
          },
          maxTokens: {
            type: 'number',
            description: 'Maximum tokens for the sub-agent response (optional)',
          },
        },
        required: ['type', 'task'],
      },
      handler: async (args: SpawnSubAgentInput, context: any) => {
        return this.handleSpawnSubAgent(args, context);
      },
    });
  }

  /**
   * Handle spawn_subagent tool calls
   */
  private async handleSpawnSubAgent(
    input: SpawnSubAgentInput,
    toolContext: any
  ): Promise<string> {
    const config = this.getConfig(toolContext.config);
    const currentDepth = toolContext.req?.subagentDepth ?? 0;

    // Validate depth
    if (currentDepth >= config.maxDepth) {
      return JSON.stringify({
        success: false,
        error: `Maximum sub-agent depth (${config.maxDepth}) reached. Cannot spawn more sub-agents.`,
      });
    }

    // Validate type
    if (!config.allowedTypes.includes(input.type)) {
      return JSON.stringify({
        success: false,
        error: `Sub-agent type '${input.type}' is not enabled. Allowed types: ${config.allowedTypes.join(', ')}`,
      });
    }

    // Build context for sub-agent
    const subAgentContext: SubAgentContext = {
      sessionId: toolContext.req?.id || 'unknown',
      projectPath: toolContext.projectPath,
      depth: currentDepth,
      parentRequestId: toolContext.req?.id,
      config: toolContext.config,
    };

    // Create runner and execute
    const runner = createSubAgentRunner(subAgentContext);

    try {
      let result: SubAgentResult;

      if (input.streamProgress) {
        // Execute with streaming (progress is logged)
        result = await runner.executeWithStreaming(input, (event) => {
          // Log progress events for debugging
          if (toolContext.config?.SubAgent?.debugMode) {
            console.log(`[SubAgent ${event.subAgentId}] ${event.type}:`, event.data);
          }
        });
      } else {
        // Execute without streaming
        result = await runner.execute(input);
      }

      // Return formatted result
      return this.formatResult(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: `Sub-agent execution failed: ${errorMessage}`,
      });
    }
  }

  /**
   * Format sub-agent result for tool response
   */
  private formatResult(result: SubAgentResult): string {
    if (!result.success) {
      return JSON.stringify({
        success: false,
        error: result.error,
        metadata: result.metadata,
      });
    }

    // Format successful result
    const formatted = [
      `<subagent_result type="${result.metadata.type}" duration="${result.metadata.durationMs}ms">`,
      '',
      result.output,
      '',
      '</subagent_result>',
    ];

    if (result.summary) {
      formatted.splice(1, 0, `**Summary**: ${result.summary}`, '');
    }

    return formatted.join('\n');
  }
}

// Export singleton instance
export const subAgentAgent = new SubAgentAgent();

// Re-export types
export * from './types';
export { SUBAGENT_CONFIGS, getSubAgentConfig } from './configs';
export { createSubAgentRunner } from './runner';
export { SUBAGENT_DEPTH_HEADER, SUBAGENT_ID_HEADER } from '../utils/router';
