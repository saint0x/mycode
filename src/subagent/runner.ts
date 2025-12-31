/**
 * Sub-Agent Runner
 * Handles execution of sub-agents with streaming support
 */

import { v4 as uuid } from 'uuid';
import { hasMemoryService, getMemoryService, type Memory } from '../memory';
import { SUBAGENT_DEPTH_HEADER, SUBAGENT_ID_HEADER } from '../utils/router';
import {
  buildSubAgentSystemPrompt,
  getSubAgentConfig,
  filterToolsForSubAgent,
} from './configs';
import type {
  SubAgentType,
  SubAgentContext,
  SpawnSubAgentInput,
  SubAgentResult,
  SubAgentResultMetadata,
  SubAgentStreamEvent,
  SubAgentProgressCallback,
} from './types';

// Re-export header constants for convenience
export { SUBAGENT_DEPTH_HEADER, SUBAGENT_ID_HEADER };

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

    try {
      // Build the request
      const requestBody = await this.buildRequestBody(input);

      // Make internal API call
      const response = await this.makeInternalApiCall(requestBody, input.streamProgress ?? false);

      // Process response
      const output = await this.processResponse(response);

      const endTime = Date.now();

      return {
        success: true,
        output,
        summary: this.generateSummary(output, input.task),
        metadata: this.buildMetadata(input, startTime, endTime),
      };
    } catch (error) {
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        output: '',
        error: errorMessage,
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

    // Emit start event
    this.emitEvent(onProgress, {
      type: 'start',
      task: input.task,
      agentType: input.type,
    });

    try {
      // Build the request
      const requestBody = await this.buildRequestBody(input);

      // Make internal API call with streaming
      const response = await this.makeInternalApiCall(requestBody, true);

      // Process streaming response
      const output = await this.processStreamingResponse(response, onProgress);

      const endTime = Date.now();

      const result: SubAgentResult = {
        success: true,
        output,
        summary: this.generateSummary(output, input.task),
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
      });

      const result: SubAgentResult = {
        success: false,
        output: '',
        error: errorMessage,
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
  private async buildRequestBody(input: SpawnSubAgentInput): Promise<any> {
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
  private getFilteredTools(config: any): any[] {
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
    requestBody: any,
    stream: boolean
  ): Promise<Response> {
    const port = this.context.config?.PORT || 3456;
    const apiKey = this.context.config?.APIKEY;

    requestBody.stream = stream;

    const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        [SUBAGENT_DEPTH_HEADER]: String(this.context.depth + 1),
        [SUBAGENT_ID_HEADER]: this.subAgentId,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sub-agent API call failed: ${response.status} ${errorText}`);
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
    const data = await response.json();

    if (data.content && Array.isArray(data.content)) {
      return data.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
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
            } catch (parseError) {
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
  private generateSummary(output: string, task: string): string {
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
  private emitEvent(callback: SubAgentProgressCallback, data: any): void {
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
