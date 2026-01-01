/**
 * Sub-Agent Runner
 * Handles execution of sub-agents with streaming support
 */

import { v4 as uuid } from 'uuid';
import { hasMemoryService, getMemoryService } from '../memory';
import { SUBAGENT_DEPTH_HEADER, SUBAGENT_ID_HEADER } from '../utils/tokens';
import {
  buildSubAgentSystemPrompt,
  getSubAgentConfig,
  filterToolsForSubAgent,
} from './configs';
import type {
  SubAgentContext,
  SpawnSubAgentInput,
  SubAgentResult,
  SubAgentResultMetadata,
  SubAgentProgressCallback,
  SubAgentConfig,
} from './types';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import {
  SubAgentError,
  ErrorCode,
  isNetworkError,
  isRateLimitError,
} from '../errors';

// Re-export header constants for convenience
export { SUBAGENT_DEPTH_HEADER, SUBAGENT_ID_HEADER };

interface SubAgentRequestBody {
  model: string | undefined;
  system: Array<{ type: string; text: string }>;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number | undefined;
  stream: boolean;
  tools: Tool[];
  agentType?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: ContentBlock[];
}

export class SubAgentRunner {
  private context: SubAgentContext;
  private subAgentId: string;

  constructor(context: SubAgentContext) {
    this.context = context;
    this.subAgentId = uuid();
  }

  /**
   * Execute a sub-agent task
   */
  async execute(input: SpawnSubAgentInput): Promise<SubAgentResult> {
    const startTime = Date.now();

    // Validate input
    if (!input.task || input.task.trim().length === 0) {
      return {
        success: false,
        output: '',
        error: 'Sub-agent task cannot be empty',
        errorCode: ErrorCode.SUBAGENT_SPAWN_FAILED,
        metadata: this.buildMetadata(input, startTime, Date.now()),
      };
    }

    try {
      // Build the request
      let requestBody: SubAgentRequestBody;
      try {
        requestBody = await this.buildRequestBody(input);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          output: '',
          error: `Failed to build sub-agent request: ${errorMessage}`,
          errorCode: ErrorCode.SUBAGENT_SPAWN_FAILED,
          metadata: this.buildMetadata(input, startTime, Date.now()),
        };
      }

      // Make internal API call
      let response: Response;
      try {
        response = await this.makeInternalApiCall(requestBody, input.streamProgress ?? false);
      } catch (error) {
        const isNetwork = isNetworkError(error);
        const isRateLimit = isRateLimitError(error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          output: '',
          error: isNetwork
            ? `Sub-agent network error: ${errorMessage}. Is the router running?`
            : isRateLimit
            ? `Sub-agent rate limited: ${errorMessage}. Try again later.`
            : `Sub-agent API call failed: ${errorMessage}`,
          errorCode: isNetwork
            ? ErrorCode.SUBAGENT_NETWORK_ERROR
            : isRateLimit
            ? ErrorCode.SUBAGENT_RATE_LIMITED
            : ErrorCode.SUBAGENT_EXECUTION_FAILED,
          metadata: this.buildMetadata(input, startTime, Date.now()),
        };
      }

      // Process response
      let output: string;
      try {
        output = await this.processResponse(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          output: '',
          error: `Failed to process sub-agent response: ${errorMessage}`,
          errorCode: ErrorCode.SUBAGENT_EXECUTION_FAILED,
          metadata: this.buildMetadata(input, startTime, Date.now()),
        };
      }

      const endTime = Date.now();

      return {
        success: true,
        output,
        summary: this.generateSummary(output),
        metadata: this.buildMetadata(input, startTime, endTime),
      };
    } catch (error) {
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        output: '',
        error: `Unexpected sub-agent error: ${errorMessage}`,
        errorCode: ErrorCode.SUBAGENT_EXECUTION_FAILED,
        metadata: this.buildMetadata(input, startTime, endTime),
      };
    }
  }

  /**
   * Execute with streaming progress callbacks
   */
  async executeWithStreaming(
    input: SpawnSubAgentInput,
    onProgress: SubAgentProgressCallback
  ): Promise<SubAgentResult> {
    const startTime = Date.now();

    // Validate input
    if (!input.task || input.task.trim().length === 0) {
      const result: SubAgentResult = {
        success: false,
        output: '',
        error: 'Sub-agent task cannot be empty',
        errorCode: ErrorCode.SUBAGENT_SPAWN_FAILED,
        metadata: this.buildMetadata(input, startTime, Date.now()),
      };

      this.emitEvent(onProgress, {
        type: 'error',
        message: result.error,
        code: ErrorCode.SUBAGENT_SPAWN_FAILED,
      });

      this.emitEvent(onProgress, {
        type: 'complete',
        result,
      });

      return result;
    }

    // Emit start event
    this.emitEvent(onProgress, {
      type: 'start',
      task: input.task,
      agentType: input.type,
    });

    try {
      // Build the request
      let requestBody: SubAgentRequestBody;
      try {
        requestBody = await this.buildRequestBody(input);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const result: SubAgentResult = {
          success: false,
          output: '',
          error: `Failed to build sub-agent request: ${errorMessage}`,
          errorCode: ErrorCode.SUBAGENT_SPAWN_FAILED,
          metadata: this.buildMetadata(input, startTime, Date.now()),
        };

        this.emitEvent(onProgress, {
          type: 'error',
          message: result.error,
          code: ErrorCode.SUBAGENT_SPAWN_FAILED,
        });

        this.emitEvent(onProgress, {
          type: 'complete',
          result,
        });

        return result;
      }

      // Make internal API call with streaming
      let response: Response;
      try {
        response = await this.makeInternalApiCall(requestBody, true);
      } catch (error) {
        const isNetwork = isNetworkError(error);
        const isRateLimit = isRateLimitError(error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = isNetwork
          ? ErrorCode.SUBAGENT_NETWORK_ERROR
          : isRateLimit
          ? ErrorCode.SUBAGENT_RATE_LIMITED
          : ErrorCode.SUBAGENT_EXECUTION_FAILED;

        const result: SubAgentResult = {
          success: false,
          output: '',
          error: isNetwork
            ? `Sub-agent network error: ${errorMessage}. Is the router running?`
            : isRateLimit
            ? `Sub-agent rate limited: ${errorMessage}. Try again later.`
            : `Sub-agent API call failed: ${errorMessage}`,
          errorCode,
          metadata: this.buildMetadata(input, startTime, Date.now()),
        };

        this.emitEvent(onProgress, {
          type: 'error',
          message: result.error,
          code: errorCode,
        });

        this.emitEvent(onProgress, {
          type: 'complete',
          result,
        });

        return result;
      }

      // Process streaming response
      const output = await this.processStreamingResponse(response, onProgress);

      const endTime = Date.now();

      const result: SubAgentResult = {
        success: true,
        output,
        summary: this.generateSummary(output),
        metadata: this.buildMetadata(input, startTime, endTime),
      };

      // Emit complete event
      this.emitEvent(onProgress, {
        type: 'complete',
        result,
      });

      return result;
    } catch (error) {
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Emit error event
      this.emitEvent(onProgress, {
        type: 'error',
        message: errorMessage,
        code: ErrorCode.SUBAGENT_EXECUTION_FAILED,
      });

      const result: SubAgentResult = {
        success: false,
        output: '',
        error: `Unexpected sub-agent error: ${errorMessage}`,
        errorCode: ErrorCode.SUBAGENT_EXECUTION_FAILED,
        metadata: this.buildMetadata(input, startTime, endTime),
      };

      // Emit complete event
      this.emitEvent(onProgress, {
        type: 'complete',
        result,
      });

      return result;
    }
  }

  /**
   * Build the request body for the internal API call
   */
  private async buildRequestBody(input: SpawnSubAgentInput): Promise<SubAgentRequestBody> {
    const config = getSubAgentConfig(input.type);

    // Get memory context if enabled
    let memoryContext: string | undefined;
    if (this.context.config?.SubAgent?.inheritMemory && hasMemoryService()) {
      memoryContext = await this.buildMemoryContext(input.task);
    }

    // Build system prompt
    const systemPrompt = buildSubAgentSystemPrompt(
      config,
      input.task,
      input.context,
      memoryContext
    );

    // Get filtered tools
    const tools = this.getFilteredTools(config);

    return {
      model: input.model || config.model || this.context.config?.Router?.default,
      system: [{ type: 'text', text: systemPrompt }],
      messages: [
        {
          role: 'user',
          content: input.task,
        },
      ],
      max_tokens: input.maxTokens || config.maxTokens,
      stream: true,
      tools,
    };
  }

  /**
   * Build memory context string for injection
   */
  private async buildMemoryContext(task: string): Promise<string> {
    if (!hasMemoryService()) {
      return '';
    }

    try {
      const memoryService = getMemoryService();
      const memories = await memoryService.getContextForRequest(
        {
          messages: [{ role: 'user', content: task }],
          projectPath: this.context.projectPath,
        },
        {
          maxGlobalMemories: 5,
          maxProjectMemories: 5,
        }
      );

      const parts: string[] = [];

      if (memories.globalMemories.length > 0) {
        parts.push('<inherited_global_memory>');
        parts.push('Relevant global context from parent:');
        for (const m of memories.globalMemories) {
          parts.push(`- [${m.category}] ${m.content}`);
        }
        parts.push('</inherited_global_memory>');
      }

      if (memories.projectMemories.length > 0) {
        parts.push('<inherited_project_memory>');
        parts.push('Relevant project context from parent:');
        for (const m of memories.projectMemories) {
          parts.push(`- [${m.category}] ${m.content}`);
        }
        parts.push('</inherited_project_memory>');
      }

      return parts.join('\n');
    } catch (error) {
      console.error('[SubAgent] Failed to build memory context:', error);
      return '';
    }
  }

  /**
   * Get filtered tools based on sub-agent configuration
   */
  private getFilteredTools(config: SubAgentConfig): Tool[] {
    // Get base tools from config or default set
    const baseTools = this.context.config?.tools || [];

    // Filter tools based on sub-agent type
    const filtered = filterToolsForSubAgent(baseTools, config);

    // Remove spawn_subagent to prevent infinite recursion
    return filtered.filter(t => t.name !== 'spawn_subagent');
  }

  /**
   * Make internal API call to the router
   */
  private async makeInternalApiCall(
    requestBody: SubAgentRequestBody,
    stream: boolean
  ): Promise<Response> {
    const port = this.context.config?.PORT || 3456;
    const apiKey = this.context.config?.APIKEY;

    requestBody.stream = stream;

    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          [SUBAGENT_DEPTH_HEADER]: String(this.context.depth + 1),
          [SUBAGENT_ID_HEADER]: this.subAgentId,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      // Network-level error (connection refused, DNS failure, etc.)
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SubAgentError(
        `Failed to connect to router at port ${port}: ${errorMessage}`,
        {
          code: ErrorCode.SUBAGENT_NETWORK_ERROR,
          operation: 'api_call',
          agentType: requestBody.agentType,
          parentRequestId: this.context.parentRequestId,
          cause: error instanceof Error ? error : undefined,
          details: { port, depth: this.context.depth + 1 },
        }
      );
    }

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch {
        errorText = response.statusText;
      }

      // Determine error type based on status code
      let errorCode = ErrorCode.SUBAGENT_EXECUTION_FAILED;
      if (response.status === 429) {
        errorCode = ErrorCode.SUBAGENT_RATE_LIMITED;
      } else if (response.status === 408 || response.status === 504) {
        errorCode = ErrorCode.SUBAGENT_TIMEOUT;
      } else if (response.status >= 500) {
        errorCode = ErrorCode.SUBAGENT_NETWORK_ERROR;
      }

      throw new SubAgentError(
        `Sub-agent API returned ${response.status}: ${errorText}`,
        {
          code: errorCode,
          operation: 'api_response',
          agentType: requestBody.agentType,
          parentRequestId: this.context.parentRequestId,
          details: {
            status: response.status,
            depth: this.context.depth + 1,
            errorBody: errorText.slice(0, 500),
          },
        }
      );
    }

    return response;
  }

  /**
   * Process non-streaming response
   */
  private async processResponse(response: Response): Promise<string> {
    // For streaming responses, we need to accumulate the content
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      return this.processStreamingResponse(response);
    }

    // Non-streaming JSON response
    const data = await response.json() as AnthropicResponse;

    if (data.content && Array.isArray(data.content)) {
      return data.content
        .filter((item): item is ContentBlock & { text: string } => item.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('\n');
    }

    return '';
  }

  /**
   * Process streaming response
   */
  private async processStreamingResponse(
    response: Response,
    onProgress?: SubAgentProgressCallback
  ): Promise<string> {
    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();

            if (data === '[DONE]') {
              continue;
            }

            try {
              const event = JSON.parse(data);

              // Handle different event types
              if (event.type === 'content_block_delta') {
                const delta = event.delta;
                if (delta?.type === 'text_delta' && delta?.text) {
                  accumulatedContent += delta.text;

                  if (onProgress) {
                    this.emitEvent(onProgress, {
                      type: 'content',
                      text: delta.text,
                      accumulated: accumulatedContent,
                    });
                  }
                }
              } else if (event.type === 'content_block_start') {
                const contentBlock = event.content_block;
                if (contentBlock?.type === 'tool_use') {
                  if (onProgress) {
                    this.emitEvent(onProgress, {
                      type: 'tool_use',
                      toolName: contentBlock.name,
                      toolId: contentBlock.id,
                      input: {},
                    });
                  }
                }
              } else if (event.type === 'message_delta') {
                // Message complete
                if (event.usage) {
                  // Could track token usage here
                }
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return accumulatedContent;
  }

  /**
   * Generate a brief summary of the output
   */
  private generateSummary(output: string): string {
    // Simple summary: first 200 chars or first paragraph
    if (!output) {
      return 'No output generated';
    }

    const firstParagraph = output.split('\n\n')[0];
    if (firstParagraph.length <= 200) {
      return firstParagraph;
    }

    return output.slice(0, 200) + '...';
  }

  /**
   * Build result metadata
   */
  private buildMetadata(
    input: SpawnSubAgentInput,
    startTime: number,
    endTime: number
  ): SubAgentResultMetadata {
    return {
      subAgentId: this.subAgentId,
      type: input.type,
      task: input.task,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      depth: this.context.depth + 1,
    };
  }

  /**
   * Emit a stream event
   */
  private emitEvent(callback: SubAgentProgressCallback, data: Record<string, unknown>): void {
    callback({
      type: data.type,
      subAgentId: this.subAgentId,
      timestamp: Date.now(),
      data,
    });
  }
}

/**
 * Create a sub-agent runner with context
 */
export function createSubAgentRunner(context: SubAgentContext): SubAgentRunner {
  return new SubAgentRunner(context);
}
