/**
 * Server creation with all routes - Production-ready implementation
 * Uses Hono instead of Fastify/@musistudio/llms
 */

import { Server, type ServerConfig } from "./newserver/index";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { checkForUpdates, performUpdate } from "./utils";
import { join, basename, resolve } from "path";
import { spawn } from "child_process";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { calculateTokenCount } from "./utils/tokens";
import { LOGS_DIR } from "./constants";
import { getPluginManager, hasPluginManager } from "./plugins";
import { getHooksManager, hasHooksManager } from "./hooks";
import { getSkillsManager, hasSkillsManager } from "./skills";
import type { ProviderConfig } from "./config/schema";
import { version } from "../package.json";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import type { Context } from "hono";
import { stream } from "hono/streaming";

interface TokenCountBody {
  messages: MessageParam[];
  tools: Tool[];
  system: string;
}

/**
 * Detect provider type from API base URL
 */
function detectProviderType(apiBaseUrl: string): 'anthropic' | 'openrouter' | 'openai' {
  const url = apiBaseUrl.toLowerCase();
  if (url.includes('anthropic.com')) return 'anthropic';
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('openai.com') || url.includes('api.openai.com')) return 'openai';

  // Default to OpenAI-compatible (most common)
  return 'openai';
}

/**
 * Transform Anthropic request to OpenAI format
 */
function anthropicToOpenAI(body: any): any {
  const openAIBody: any = {
    model: body.model,
    messages: [],
    stream: body.stream ?? false,
  };

  // Add system message to messages array
  if (body.system) {
    openAIBody.messages.push({
      role: "system",
      content: body.system
    });
  }

  // Add conversation messages
  if (body.messages) {
    openAIBody.messages.push(...body.messages);
  }

  // Transform tools from Anthropic to OpenAI format
  if (body.tools && Array.isArray(body.tools)) {
    openAIBody.tools = body.tools.map((tool: any) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema || { type: "object", properties: {} }
      }
    }));
  }

  // Transform tool_choice from Anthropic to OpenAI format
  if (body.tool_choice) {
    if (typeof body.tool_choice === 'object' && body.tool_choice.type) {
      // Anthropic format: { type: "auto" | "any" | "tool", name?: string }
      switch (body.tool_choice.type) {
        case 'auto':
          openAIBody.tool_choice = 'auto';
          break;
        case 'any':
          openAIBody.tool_choice = 'required';
          break;
        case 'tool':
          if (body.tool_choice.name) {
            openAIBody.tool_choice = {
              type: 'function',
              function: { name: body.tool_choice.name }
            };
          }
          break;
      }
    } else if (typeof body.tool_choice === 'string') {
      // Simple string format
      openAIBody.tool_choice = body.tool_choice === 'any' ? 'required' : body.tool_choice;
    }
  }

  // Optional parameters
  if (body.max_tokens) openAIBody.max_tokens = body.max_tokens;
  if (body.temperature) openAIBody.temperature = body.temperature;
  if (body.top_p) openAIBody.top_p = body.top_p;
  if (body.stop_sequences) openAIBody.stop = body.stop_sequences;

  return openAIBody;
}

/**
 * Transform OpenAI streaming chunk to Anthropic format
 */
function openAIChunkToAnthropic(chunk: string): string {
  if (!chunk.startsWith('data: ')) return chunk;
  if (chunk === 'data: [DONE]') return 'event: message_stop\ndata: {}\n\n';

  try {
    const data = JSON.parse(chunk.slice(6));
    const delta = data.choices?.[0]?.delta;
    const finishReason = data.choices?.[0]?.finish_reason;

    if (!delta && !finishReason) return '';

    let output = '';

    // Handle tool calls in streaming
    if (delta.tool_calls && delta.tool_calls.length > 0) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.function) {
          // Tool call start
          if (toolCall.function.name) {
            output += `event: content_block_start\ndata: {"type":"tool_use","index":${toolCall.index || 0},"id":"${toolCall.id || 'tool_' + Date.now()}","name":"${toolCall.function.name}"}\n\n`;
          }
          // Tool call arguments delta
          if (toolCall.function.arguments) {
            output += `event: content_block_delta\ndata: {"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(toolCall.function.arguments)}}}\n\n`;
          }
        }
      }
      return output;
    }

    // Handle text content
    if (delta.content) {
      return `event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":${JSON.stringify(delta.content)}}}\n\n`;
    }

    // Handle finish reason
    if (finishReason) {
      const stopReason = finishReason === 'tool_calls' ? 'tool_use' :
                         finishReason === 'stop' ? 'end_turn' : finishReason;
      output += `event: message_delta\ndata: {"delta":{"stop_reason":"${stopReason}"}}\n\n`;
    }

    return output;
  } catch (e) {
    return '';
  }
}

/**
 * Transform OpenAI response to Anthropic format
 */
function openAIToAnthropic(response: any): any {
  const choice = response.choices?.[0];
  if (!choice) return response;

  // Build content array with text and tool uses
  const content: any[] = [];

  // Add text content if present
  if (choice.message?.content) {
    content.push({
      type: "text",
      text: choice.message.content
    });
  }

  // Add tool calls if present
  if (choice.message?.tool_calls && Array.isArray(choice.message.tool_calls)) {
    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.type === 'function' && toolCall.function) {
        content.push({
          type: "tool_use",
          id: toolCall.id || `tool_${Date.now()}_${Math.random()}`,
          name: toolCall.function.name,
          input: toolCall.function.arguments ?
            (typeof toolCall.function.arguments === 'string' ?
              JSON.parse(toolCall.function.arguments) :
              toolCall.function.arguments) :
            {}
        });
      }
    }
  }

  // Map finish_reason
  const stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' :
                     choice.finish_reason === 'stop' ? 'end_turn' :
                     choice.finish_reason || 'end_turn';

  return {
    id: response.id,
    type: "message",
    role: "assistant",
    content: content.length > 0 ? content : [{ type: "text", text: "" }],
    model: response.model,
    stop_reason: stopReason,
    usage: {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0
    }
  };
}

interface LogQueryParams {
  file?: string;
}

/**
 * Create and configure the server with all routes
 */
export const createServer = (config: ServerConfig): Server => {
  const server = new Server(config);
  const app = server.app;

  // ═══════════════════════════════════════════════════════════════════
  // CORE /V1/MESSAGES ENDPOINT - Main AI completion endpoint
  // ═══════════════════════════════════════════════════════════════════

  app.post("/v1/messages", async (c: Context) => {
    try {
      // Parse body directly using Hono's method
      const body = await c.req.json();

      // Load full config to get Router settings
      const fullConfig = await readConfigFile();

      // Apply Router logic if Router config exists
      let targetModel = body.model;
      if (fullConfig.Router) {
        // Determine which route to use based on request characteristics
        let routeType = 'default';

        // Check for webSearch - if tools include web search capabilities
        if (fullConfig.Router.webSearch && body.tools) {
          const hasWebSearchTool = body.tools.some((tool: any) =>
            tool.name?.toLowerCase().includes('search') ||
            tool.name?.toLowerCase().includes('web') ||
            tool.description?.toLowerCase().includes('search the web')
          );
          if (hasWebSearchTool) {
            routeType = 'webSearch';
          }
        }

        // Check for think - if metadata or thinking mode enabled
        if (fullConfig.Router.think && body.metadata?.thinking === true) {
          routeType = 'think';
        }

        // Check for longContext - calculate token count
        if (fullConfig.Router.longContext && fullConfig.Router.longContextThreshold) {
          try {
            const tokenCount = calculateTokenCount(
              body.messages || [],
              body.system || '',
              body.tools || []
            );
            if (tokenCount > fullConfig.Router.longContextThreshold) {
              routeType = 'longContext';
            }
          } catch (e) {
            // If token calculation fails, continue with current route
          }
        }

        // Check for background - if stream is false and priority is low
        if (fullConfig.Router.background &&
            body.stream === false &&
            (body.metadata?.priority === 'low' || body.metadata?.background === true)) {
          routeType = 'background';
        }

        // Apply the selected route
        if (fullConfig.Router[routeType]) {
          targetModel = fullConfig.Router[routeType];
        } else if (fullConfig.Router.default) {
          targetModel = fullConfig.Router.default;
        }
      }

      // Extract provider from model or use configured provider
      // Model format: "provider,model" or just "model"
      const modelParts = (targetModel || "").split(",");
      let provider = modelParts.length > 1 ? modelParts[0] : null;
      let modelName = modelParts.length > 1 ? modelParts.slice(1).join(",") : targetModel;

      // Find provider config
      const providers = config.initialConfig.providers;
      let providerConfig: ProviderConfig | undefined;

      if (provider) {
        providerConfig = providers.find((p: ProviderConfig) =>
          p.name?.toLowerCase() === provider.toLowerCase()
        );
      } else {
        // Use first available provider
        providerConfig = providers[0];
      }

      if (!providerConfig) {
        return c.json({ error: "No provider configured" }, 400);
      }

      // Update body with actual model name
      body.model = modelName;

      // Detect provider type for proper authentication
      const providerType = detectProviderType(providerConfig.api_base_url);

      // Transform request body based on provider
      let requestBody = body;
      if (providerType === 'openrouter' || providerType === 'openai') {
        requestBody = anthropicToOpenAI(body);
      }

      // Build provider-specific headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(body.headers as Record<string, string> || {}),
      };

      // Add authentication headers based on provider
      switch (providerType) {
        case 'anthropic':
          headers["x-api-key"] = providerConfig.api_key;
          headers["anthropic-version"] = "2023-06-01";

          // Add beta headers for advanced features
          const betaFeatures = [
            "advanced-tool-use-2025-11-20",
            "fine-grained-tool-streaming-2025-05-14",
            "code-execution-2025-08-25",
            "interleaved-thinking-2025-05-14"
          ];

          // Allow passing custom beta headers from request
          if (body.headers?.["anthropic-beta"]) {
            headers["anthropic-beta"] = body.headers["anthropic-beta"];
          } else {
            headers["anthropic-beta"] = betaFeatures.join(",");
          }
          break;

        case 'openrouter':
        case 'openai':
          headers["Authorization"] = `Bearer ${providerConfig.api_key}`;
          break;
      }

      // Optional OpenRouter-specific headers for app identification
      if (providerType === 'openrouter') {
        headers["HTTP-Referer"] = "https://github.com/mycode/router";
        headers["X-Title"] = "MyCode Router";
      }

      // Proxy to actual provider
      const response = await fetch(providerConfig.api_base_url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      // Handle streaming responses
      if (body.stream && response.body) {
        const needsTransform = providerType === 'openrouter' || providerType === 'openai';

        return stream(c, async (stream) => {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });

              // Transform OpenAI chunks to Anthropic format
              const output = needsTransform ? openAIChunkToAnthropic(chunk) : chunk;
              if (output) await stream.write(output);
            }
          } finally {
            reader.releaseLock();
          }
        });
      }

      // Handle non-streaming responses
      const responseData = await response.json();

      // Transform OpenAI response to Anthropic format
      const needsTransform = providerType === 'openrouter' || providerType === 'openai';
      const transformedData = needsTransform ? openAIToAnthropic(responseData) : responseData;

      // Return with proper status code
      const statusCode = response.ok ? 200 : response.status;
      return c.json(transformedData, statusCode as any);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Internal server error";
      server.logger.error?.("Error in /v1/messages:", error) ||
        console.error("Error in /v1/messages:", error);
      return c.json({ error: errorMessage }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // TOKEN COUNTING ENDPOINT
  // ═══════════════════════════════════════════════════════════════════

  app.post("/v1/messages/count_tokens", async (c: Context) => {
    try {
      const body = await c.req.json() as TokenCountBody;
      const { messages, tools, system } = body;
      const tokenCount = calculateTokenCount(messages, system, tools);
      return c.json({ "input_tokens": tokenCount });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: errorMessage }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // CONFIGURATION ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/config", async (c: Context) => {
    try {
      const config = await readConfigFile();
      return c.json(config);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: errorMessage }, 500);
    }
  });

  app.post("/api/config", async (c: Context) => {
    try {
      const newConfig = await c.req.json();

      // Backup existing config
      const backupPath = await backupConfigFile();
      if (backupPath) {
        console.log(`Backed up existing configuration file to ${backupPath}`);
      }

      await writeConfigFile(newConfig);
      return c.json({ success: true, message: "Config saved successfully" });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: errorMessage }, 500);
    }
  });

  app.get("/api/transformers", async (c: Context) => {
    // Return empty list for now - transformers are provider-specific
    return c.json({ transformers: [] });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SERVICE CONTROL ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════

  app.post("/api/restart", async (c: Context) => {
    // Send response first
    setTimeout(() => {
      spawn(process.execPath, [process.argv[1], "restart"], {
        detached: true,
        stdio: "ignore",
      });
    }, 1000);

    return c.json({ success: true, message: "Service restart initiated" });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STATIC UI SERVING
  // ═══════════════════════════════════════════════════════════════════

  app.get("/ui", async (c: Context) => {
    return c.redirect("/ui/");
  });

  app.get("/ui/*", async (c: Context) => {
    try {
      const path = c.req.path.replace("/ui/", "") || "index.html";
      const filePath = join(__dirname, "..", "dist", path);

      if (!existsSync(filePath)) {
        return c.text("Not found", 404);
      }

      const content = readFileSync(filePath);
      const contentType = getContentType(path);

      c.header("Content-Type", contentType);
      c.header("Cache-Control", "public, max-age=3600");

      return c.body(content);
    } catch (error) {
      return c.text("Error serving file", 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // UPDATE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/update/check", async (c: Context) => {
    try {
      const { hasUpdate, latestVersion, changelog } = await checkForUpdates(version);
      return c.json({
        hasUpdate,
        latestVersion: hasUpdate ? latestVersion : undefined,
        changelog: hasUpdate ? changelog : undefined
      });
    } catch (error) {
      return c.json({ error: "Failed to check for updates" }, 500);
    }
  });

  app.post("/api/update/perform", async (c: Context) => {
    try {
      const result = await performUpdate();
      return c.json(result);
    } catch (error) {
      return c.json({ error: "Failed to perform update" }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // LOG ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/logs/files", async (c: Context) => {
    try {
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> = [];

      if (existsSync(LOGS_DIR)) {
        const files = readdirSync(LOGS_DIR);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(LOGS_DIR, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString()
            });
          }
        }

        logFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      }

      return c.json(logFiles);
    } catch (error) {
      return c.json({ error: "Failed to get log files" }, 500);
    }
  });

  app.get("/api/logs", async (c: Context) => {
    try {
      const fileName = c.req.query("file");
      let logFilePath: string;

      if (fileName) {
        const sanitizedName = basename(fileName);
        logFilePath = join(LOGS_DIR, sanitizedName);

        const resolved = resolve(logFilePath);
        const logsResolved = resolve(LOGS_DIR);
        if (!resolved.startsWith(logsResolved)) {
          return c.json({ error: "Invalid file path" }, 403);
        }
      } else {
        logFilePath = join(LOGS_DIR, "app.log");
      }

      if (!existsSync(logFilePath)) {
        return c.json([]);
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim());

      return c.json(logLines);
    } catch (error) {
      return c.json({ error: "Failed to get logs" }, 500);
    }
  });

  app.delete("/api/logs", async (c: Context) => {
    try {
      const fileName = c.req.query("file");
      let logFilePath: string;

      if (fileName) {
        const sanitizedName = basename(fileName);
        logFilePath = join(LOGS_DIR, sanitizedName);

        const resolved = resolve(logFilePath);
        const logsResolved = resolve(LOGS_DIR);
        if (!resolved.startsWith(logsResolved)) {
          return c.json({ error: "Invalid file path" }, 403);
        }
      } else {
        logFilePath = join(LOGS_DIR, "app.log");
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return c.json({ success: true, message: "Logs cleared successfully" });
    } catch (error) {
      return c.json({ error: "Failed to clear logs" }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // EXTENSIBILITY ENDPOINTS (Plugins, Hooks, Skills)
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/plugins", async (c: Context) => {
    if (!hasPluginManager()) return c.json([]);
    const pluginManager = getPluginManager();
    const plugins = pluginManager.getAllPlugins().map(p => ({
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      enabled: p.enabled,
      hooks: p.hooks.length,
      skills: p.skills.length,
      commands: p.commands.length
    }));
    return c.json(plugins);
  });

  app.post("/api/plugins/:name/enable", async (c: Context) => {
    const name = c.req.param("name");
    if (!hasPluginManager()) return c.json({ success: false, name });
    const pluginManager = getPluginManager();
    const success = pluginManager.enablePlugin(name);
    return c.json({ success, name });
  });

  app.post("/api/plugins/:name/disable", async (c: Context) => {
    const name = c.req.param("name");
    if (!hasPluginManager()) return c.json({ success: false, name });
    const pluginManager = getPluginManager();
    const success = pluginManager.disablePlugin(name);
    return c.json({ success, name });
  });

  app.get("/api/hooks", async (c: Context) => {
    if (!hasHooksManager()) return c.json([]);
    const hooksManager = getHooksManager();
    const hooks = hooksManager.getAllHooks().map(h => ({
      name: h.name,
      event: h.event,
      priority: h.priority ?? 0,
      enabled: h.enabled !== false
    }));
    return c.json(hooks);
  });

  app.get("/api/hooks/events", async (c: Context) => {
    return c.json([
      'PreToolUse', 'PostToolUse', 'PreRoute', 'PostRoute',
      'SessionStart', 'SessionEnd', 'PreResponse', 'PostResponse',
      'PreCompact', 'Notification'
    ]);
  });

  app.get("/api/skills", async (c: Context) => {
    if (!hasSkillsManager()) return c.json([]);
    const skillsManager = getSkillsManager();
    const skills = skillsManager.getAllSkills().map(s => ({
      name: s.name,
      description: s.description,
      trigger: String(s.trigger)
    }));
    return c.json(skills);
  });

  // ═══════════════════════════════════════════════════════════════════
  // HEALTH CHECK ENDPOINT
  // ═══════════════════════════════════════════════════════════════════

  app.get("/health", async (c: Context) => {
    return c.json({
      status: "ok",
      timestamp: Date.now(),
      version: version,
      pid: process.pid
    });
  });

  return server;
};

/**
 * Helper function to determine content type
 */
function getContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    'html': 'text/html',
    'js': 'application/javascript',
    'css': 'text/css',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon'
  };
  return types[ext || ''] || 'application/octet-stream';
}
