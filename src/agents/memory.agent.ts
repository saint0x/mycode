/**
 * Memory Agent - Phase 9.2.3
 * Provides explicit memory tools for agent use
 *
 * Tools:
 * - ccr_remember: Save info to persistent memory
 * - ccr_recall: Query memories by semantic search
 * - ccr_forget: Delete a memory by ID
 */

import type { IAgent, ITool, AgentContext } from './type';
import { getMemoryService, hasMemoryService } from '../memory';
import type { MemoryCategory } from '../memory/types';

// Valid memory categories
const VALID_CATEGORIES: MemoryCategory[] = [
  'preference',
  'pattern',
  'decision',
  'architecture',
  'knowledge',
  'error',
  'workflow',
  'context',
  'code',
];

/**
 * ccr_remember tool
 * Save information to persistent memory
 */
const rememberTool: ITool = {
  name: 'ccr_remember',
  description: 'Save info to persistent memory. Returns confirmation with memory ID.',
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'What to remember - be concise and specific',
      },
      scope: {
        type: 'string',
        enum: ['global', 'project'],
        description: 'global = across all projects, project = this project only',
      },
      category: {
        type: 'string',
        enum: VALID_CATEGORIES,
        description: 'Memory category for organization',
      },
    },
    required: ['content', 'scope', 'category'],
  },
  handler: async (args: { content: string; scope: 'global' | 'project'; category: string }, ctx: AgentContext) => {
    try {
      if (!hasMemoryService()) {
        return JSON.stringify({
          success: false,
          error: 'Memory service not available',
        });
      }

      const memoryService = getMemoryService();
      const memory = await memoryService.remember(args.content, {
        scope: args.scope,
        projectPath: ctx.req?.projectPath,
        category: args.category as MemoryCategory,
        metadata: {
          sessionId: ctx.req?.sessionId,
          source: 'tool-explicit',
        },
      });

      return JSON.stringify({
        success: true,
        id: memory.id,
        scope: args.scope,
        category: args.category,
        saved: args.content.slice(0, 100) + (args.content.length > 100 ? '...' : ''),
      });
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

/**
 * ccr_recall tool
 * Query memories by semantic search
 */
const recallTool: ITool = {
  name: 'ccr_recall',
  description: 'Query memories by semantic search. Returns matching memories with relevance scores.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query - describe what you want to find',
      },
      scope: {
        type: 'string',
        enum: ['global', 'project', 'both'],
        default: 'both',
        description: 'Where to search: global, project, or both',
      },
      limit: {
        type: 'number',
        default: 5,
        maximum: 20,
        description: 'Maximum number of results to return',
      },
    },
    required: ['query'],
  },
  handler: async (args: { query: string; scope?: 'global' | 'project' | 'both'; limit?: number }, ctx: AgentContext) => {
    try {
      if (!hasMemoryService()) {
        return JSON.stringify({
          success: false,
          error: 'Memory service not available',
        });
      }

      const memoryService = getMemoryService();
      const results = await memoryService.recall(args.query, {
        scope: args.scope || 'both',
        projectPath: ctx.req?.projectPath,
        limit: args.limit || 5,
      });

      return JSON.stringify({
        success: true,
        count: results.length,
        memories: results.map(r => ({
          id: r.memory.id,
          content: r.memory.content,
          category: r.memory.category,
          scope: r.memory.scope,
          score: parseFloat(r.score.toFixed(3)),
          createdAt: new Date(r.memory.createdAt).toISOString(),
        })),
      });
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

/**
 * ccr_forget tool
 * Delete a memory by ID
 */
const forgetTool: ITool = {
  name: 'ccr_forget',
  description: 'Delete a memory by ID. Use ccr_recall first to find the memory ID.',
  input_schema: {
    type: 'object',
    properties: {
      memoryId: {
        type: 'string',
        description: 'The memory ID to delete (from ccr_recall results)',
      },
      scope: {
        type: 'string',
        enum: ['global', 'project'],
        description: 'Where the memory is stored',
      },
    },
    required: ['memoryId', 'scope'],
  },
  handler: async (args: { memoryId: string; scope: 'global' | 'project' }, _ctx: any) => {
    try {
      if (!hasMemoryService()) {
        return JSON.stringify({
          success: false,
          error: 'Memory service not available',
        });
      }

      const memoryService = getMemoryService();

      // Check if memory exists
      const memory = args.scope === 'global'
        ? memoryService.getGlobalMemory(args.memoryId)
        : memoryService.getProjectMemory(args.memoryId);

      if (!memory) {
        return JSON.stringify({
          success: false,
          error: `Memory not found: ${args.memoryId}`,
        });
      }

      memoryService.deleteMemory(args.memoryId, args.scope);

      return JSON.stringify({
        success: true,
        deleted: {
          id: args.memoryId,
          content: memory.content.slice(0, 50) + '...',
          scope: args.scope,
        },
      });
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

/**
 * Memory Agent
 * Provides memory tools when memory service is enabled
 */
export const memoryAgent: IAgent = {
  name: 'memoryAgent',
  tools: new Map<string, ITool>([
    [rememberTool.name, rememberTool],
    [recallTool.name, recallTool],
    [forgetTool.name, forgetTool],
  ]),

  /**
   * Only activate if memory service is enabled and available
   */
  shouldHandle(_req: AgentContext['req'], config: Record<string, unknown>): boolean {
    const memory = config.Memory as Record<string, unknown> | undefined;
    return memory?.enabled === true && hasMemoryService();
  },

  /**
   * No request modifications needed - tools are injected automatically
   */
  reqHandler(_req: AgentContext['req'], _config: Record<string, unknown>): void {
    // Memory tools are injected via the standard agent pipeline
    // System prompt already has memory instructions from context builder
  },
};
