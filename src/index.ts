import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import path, { join } from "path";
import { initConfig, initDir, cleanupLogFiles } from "./utils";
import { createServer } from "./server";
import { router, searchProjectBySession } from "./utils/router";
import { apiKeyAuth } from "./middleware/auth";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE, MEMORY_DB_PATH } from "./constants";
import { createStream } from 'rotating-file-stream';
import { HOME_DIR } from "./constants";
import { sessionUsageCache } from "./utils/cache";
import {SSEParserTransform} from "./utils/SSEParser.transform";
import {SSESerializerTransform} from "./utils/SSESerializer.transform";
import {rewriteStream} from "./utils/rewriteStream";
import JSON5 from "json5";
import { IAgent } from "./agents/type";
import agentsManager from "./agents";
import { EventEmitter } from "node:events";
import { initMemoryService, getMemoryService, hasMemoryService } from "./memory";
import { getContextBuilder, initContextBuilder } from "./context";
import type { MemoryConfig, MemoryCategory } from "./memory/types";
import {
  RouterError,
  StreamError,
  ErrorCode,
  formatErrorForToolResult,
  getErrorMessage,
} from "./errors";

const event = new EventEmitter()

// Extract and save memories from response content
async function extractMemoriesFromResponse(
  content: string,
  req: any,
  config: any
): Promise<{ saved: number; errors: string[] }> {
  const result = { saved: 0, errors: [] as string[] };

  if (!config.Memory?.enabled || !hasMemoryService()) return result;

  try {
    const memoryService = getMemoryService();

    // Extract <remember> tags
    const rememberRegex = /<remember\s+scope="(global|project)"\s+category="(\w+)">([\s\S]*?)<\/remember>/g;
    let match;

    while ((match = rememberRegex.exec(content)) !== null) {
      const [, scope, category, memoryContent] = match;

      try {
        await memoryService.remember(memoryContent.trim(), {
          scope: scope as 'global' | 'project',
          projectPath: req.projectPath,
          category: category as MemoryCategory,
          metadata: {
            sessionId: req.sessionId,
            source: 'agent-explicit',
          },
        });
        result.saved++;

        if (config.Memory.debugMode) {
          console.log(`[Memory] Saved ${scope} memory (${category}):`, memoryContent.trim().slice(0, 50) + '...');
        }
      } catch (err) {
        const errorMsg = `Failed to save ${scope}/${category} memory: ${getErrorMessage(err)}`;
        result.errors.push(errorMsg);
        if (config.Memory.debugMode) {
          console.error('[Memory]', errorMsg);
        }
      }
    }

    // Auto-extract if enabled
    if (config.Memory.autoExtract) {
      const autoResult = await autoExtractMemories(content, req, config);
      result.saved += autoResult.saved;
      result.errors.push(...autoResult.errors);
    }
  } catch (err) {
    result.errors.push(`Memory extraction failed: ${getErrorMessage(err)}`);
    console.error('[Memory] Error extracting memories:', err);
  }

  return result;
}

async function autoExtractMemories(
  content: string,
  req: any,
  config: any
): Promise<{ saved: number; errors: string[] }> {
  const result = { saved: 0, errors: [] as string[] };

  if (!hasMemoryService()) return result;

  try {
    const memoryService = getMemoryService();
    const patterns = [
      {
        regex: /(?:user prefers?|always use|never use|I (?:like|prefer|want))\s+(.+?)(?:\.|$)/gi,
        category: 'preference' as MemoryCategory,
        scope: 'global' as const,
      },
      {
        regex: /(?:decided to|choosing|went with|using)\s+(.+?)\s+(?:for|because|since)/gi,
        category: 'decision' as MemoryCategory,
        scope: 'project' as const,
      },
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const extractedContent = match[1].trim();
        if (extractedContent.length > 10 && extractedContent.length < 500) {
          try {
            await memoryService.remember(extractedContent, {
              scope: pattern.scope,
              projectPath: req.projectPath,
              category: pattern.category,
              importance: 0.5,
              metadata: {
                sessionId: req.sessionId,
                source: 'auto-extracted',
              },
            });
            result.saved++;
          } catch (err) {
            // Collect but don't propagate auto-extraction errors
            result.errors.push(`Auto-extract failed for ${pattern.category}: ${getErrorMessage(err)}`);
          }
        }
      }
    }
  } catch (err) {
    result.errors.push(`Auto-extraction error: ${getErrorMessage(err)}`);
  }

  return result;
}

async function initializeClaudeConfig() {
  const homeDir = homedir();
  const configPath = join(homeDir, ".claude.json");
  if (!existsSync(configPath)) {
    const userID = Array.from(
      { length: 64 },
      () => Math.random().toString(16)[2]
    ).join("");
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: "enabled",
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "1.0.17",
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

interface RunOptions {
  port?: number;
}

async function run(options: RunOptions = {}) {
  // Check if service is already running
  const isRunning = await isServiceRunning()
  if (isRunning) {
    console.log("✅ Service is already running in the background.");
    return;
  }

  await initializeClaudeConfig();
  await initDir();
  // Clean up old log files, keeping only the 10 most recent ones
  await cleanupLogFiles();
  const config = await initConfig();

  // Initialize memory service if configured
  if (config.Memory?.enabled) {
    const memoryConfig: MemoryConfig = {
      enabled: true,
      dbPath: config.Memory.dbPath || MEMORY_DB_PATH,
      embedding: {
        provider: config.Memory.embedding?.provider || 'openai',
        apiKey: config.Memory.embedding?.apiKey || config.OPENAI_API_KEY,
        baseUrl: config.Memory.embedding?.baseUrl || config.OPENAI_BASE_URL,
        model: config.Memory.embedding?.model,
      },
      autoInject: {
        global: config.Memory.autoInject?.global ?? true,
        project: config.Memory.autoInject?.project ?? true,
        maxMemories: config.Memory.autoInject?.maxMemories ?? 10,
        maxTokens: config.Memory.autoInject?.maxTokens ?? 2000,
      },
      autoExtract: config.Memory.autoExtract ?? true,
      retention: {
        minImportance: config.Memory.retention?.minImportance ?? 0.3,
        maxAgeDays: config.Memory.retention?.maxAgeDays ?? 90,
        cleanupIntervalMs: config.Memory.retention?.cleanupIntervalMs ?? 86400000,
      },
      debugMode: config.Memory.debugMode ?? false,
    };

    try {
      initMemoryService(memoryConfig);
      initContextBuilder({
        enableMemory: true,
        enableEmphasis: true,
        debugMode: memoryConfig.debugMode,
      });
      console.log("✅ Memory service initialized");
    } catch (err) {
      console.error("⚠️ Failed to initialize memory service:", err);
    }
  }


  let HOST = config.HOST || "127.0.0.1";

  if (config.HOST && !config.APIKEY) {
    HOST = "127.0.0.1";
    console.warn("⚠️ API key is not set. HOST is forced to 127.0.0.1.");
  }

  const port = config.PORT || 3456;

  // Save the PID of the background process
  savePid(process.pid);

  // Handle SIGINT (Ctrl+C) to clean up PID file
  process.on("SIGINT", () => {
    console.log("Received SIGINT, cleaning up...");
    cleanupPidFile();
    process.exit(0);
  });

  // Handle SIGTERM to clean up PID file
  process.on("SIGTERM", () => {
    cleanupPidFile();
    process.exit(0);
  });

  // Use port from environment variable if set (for background process)
  const servicePort = process.env.SERVICE_PORT
    ? parseInt(process.env.SERVICE_PORT)
    : port;

  // Configure logger based on config settings
  const pad = num => (num > 9 ? "" : "0") + num;
  const generator = (time, index) => {
    if (!time) {
      time = new Date()
    }

    var month = time.getFullYear() + "" + pad(time.getMonth() + 1);
    var day = pad(time.getDate());
    var hour = pad(time.getHours());
    var minute = pad(time.getMinutes());

    return `./logs/ccr-${month}${day}${hour}${minute}${pad(time.getSeconds())}${index ? `_${index}` : ''}.log`;
  };
  const loggerConfig =
    config.LOG !== false
      ? {
          level: config.LOG_LEVEL || "debug",
          stream: createStream(generator, {
            path: HOME_DIR,
            maxFiles: 3,
            interval: "1d",
            compress: false,
            maxSize: "50M"
          }),
        }
      : false;

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      // ...config,
      providers: config.Providers || config.providers,
      HOST: HOST,
      PORT: servicePort,
      LOG_FILE: join(
        homedir(),
        ".claude-code-router",
        "claude-code-router.log"
      ),
    },
    logger: loggerConfig,
  });

  // Add global error handlers to prevent the service from crashing
  process.on("uncaughtException", (err) => {
    server.logger.error("Uncaught exception:", err);
  });

  process.on("unhandledRejection", (reason, promise) => {
    server.logger.error("Unhandled rejection at:", promise, "reason:", reason);
  });
  // Add async preHandler hook for authentication
  server.addHook("preHandler", async (req, reply) => {
    return new Promise((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) reject(err);
        else resolve();
      };
      // Call the async auth function
      apiKeyAuth(config)(req, reply, done).catch(reject);
    });
  });
  server.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens")) {
      const useAgents = []

      for (const agent of agentsManager.getAllAgents()) {
        if (agent.shouldHandle(req, config)) {
          // 设置agent标识
          useAgents.push(agent.name)

          // change request body
          agent.reqHandler(req, config);

          // append agent tools
          if (agent.tools.size) {
            if (!req.body?.tools?.length) {
              req.body.tools = []
            }
            req.body.tools.unshift(...Array.from(agent.tools.values()).map(item => {
              return {
                name: item.name,
                description: item.description,
                input_schema: item.input_schema
              }
            }))
          }
        }
      }

      if (useAgents.length) {
        req.agents = useAgents;
      }

      // Build dynamic context with memory injection
      if (config.Memory?.enabled && hasMemoryService()) {
        try {
          const builder = getContextBuilder();
          const projectPath = req.sessionId ? await searchProjectBySession(req.sessionId) : undefined;

          const contextResult = await builder.build(
            req.body.system,
            {
              messages: req.body.messages,
              projectPath: projectPath || undefined,
              sessionId: req.sessionId,
              tools: req.body.tools,
            }
          );

          // Replace system prompt with enhanced version
          req.body.system = contextResult.systemPrompt;
          req.contextAnalysis = contextResult.analysis;
          req.projectPath = projectPath;

          if (config.Memory.debugMode) {
            req.log.info('[Context Builder]', {
              taskType: contextResult.analysis.taskType,
              sections: contextResult.sections.length,
              tokens: contextResult.totalTokens,
            });
          }
        } catch (err) {
          req.log.error('Context building failed:', err);
        }
      }

      await router(req, reply, {
        config,
        event
      });
    }
  });
  server.addHook("onError", async (request, reply, error) => {
    event.emit('onError', request, reply, error);
  })
  server.addHook("onSend", (req, reply, payload, done) => {
    if (req.sessionId && req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens")) {
      if (payload instanceof ReadableStream) {
        if (req.agents) {
          const abortController = new AbortController();
          const eventStream = payload.pipeThrough(new SSEParserTransform())
          let currentAgent: undefined | IAgent;
          let currentToolIndex = -1
          let currentToolName = ''
          let currentToolArgs = ''
          let currentToolId = ''
          const toolMessages: any[] = []
          const assistantMessages: any[] = []
          // 存储Anthropic格式的消息体，区分文本和工具类型
          return done(null, rewriteStream(eventStream, async (data, controller) => {
            try {
              // 检测工具调用开始
              if (data.event === 'content_block_start' && data?.data?.content_block?.name) {
                const agent = req.agents.find((name: string) => agentsManager.getAgent(name)?.tools.get(data.data.content_block.name))
                if (agent) {
                  currentAgent = agentsManager.getAgent(agent)
                  currentToolIndex = data.data.index
                  currentToolName = data.data.content_block.name
                  currentToolId = data.data.content_block.id
                  return undefined;
                }
              }

              // 收集工具参数
              if (currentToolIndex > -1 && data.data.index === currentToolIndex && data.data?.delta?.type === 'input_json_delta') {
                currentToolArgs += data.data?.delta?.partial_json;
                return undefined;
              }

              // 工具调用完成，处理agent调用
              if (currentToolIndex > -1 && data.data.index === currentToolIndex && data.data.type === 'content_block_stop') {
                try {
                  const args = JSON5.parse(currentToolArgs);
                  assistantMessages.push({
                    type: "tool_use",
                    id: currentToolId,
                    name: currentToolName,
                    input: args
                  })
                  const toolResult = await currentAgent?.tools.get(currentToolName)?.handler(args, {
                    req,
                    config
                  });
                  toolMessages.push({
                    "tool_use_id": currentToolId,
                    "type": "tool_result",
                    "content": toolResult
                  })
                  currentAgent = undefined
                  currentToolIndex = -1
                  currentToolName = ''
                  currentToolArgs = ''
                  currentToolId = ''
                } catch (e) {
                  console.log(e);
                }
                return undefined;
              }

              if (data.event === 'message_delta' && toolMessages.length) {
                req.body.messages.push({
                  role: 'assistant',
                  content: assistantMessages
                })
                req.body.messages.push({
                  role: 'user',
                  content: toolMessages
                })
                const response = await fetch(`http://127.0.0.1:${config.PORT || 3456}/v1/messages`, {
                  method: "POST",
                  headers: {
                    'x-api-key': config.APIKEY,
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify(req.body),
                })
                if (!response.ok) {
                  return undefined;
                }
                const stream = response.body!.pipeThrough(new SSEParserTransform())
                const reader = stream.getReader()
                while (true) {
                  try {
                    const {value, done} = await reader.read();
                    if (done) {
                      break;
                    }
                    if (['message_start', 'message_stop'].includes(value.event)) {
                      continue
                    }

                    // 检查流是否仍然可写
                    if (!controller.desiredSize) {
                      break;
                    }

                    controller.enqueue(value)
                  }catch (readError: any) {
                    if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                      abortController.abort(); // 中止所有相关操作
                      break;
                    }
                    throw readError;
                  }

                }
                return undefined
              }
              return data
            }catch (error: any) {
              console.error('Unexpected error in stream processing:', error);

              // 处理流提前关闭的错误
              if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                abortController.abort();
                return undefined;
              }

              // 其他错误仍然抛出
              throw error;
            }
          }).pipeThrough(new SSESerializerTransform()))
        }

        const [originalStream, clonedStream] = payload.tee();
        const read = async (stream: ReadableStream) => {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              // Process the value if needed
              const dataStr = new TextDecoder().decode(value);
              if (!dataStr.startsWith("event: message_delta")) {
                continue;
              }
              const str = dataStr.slice(27);
              try {
                const message = JSON.parse(str);
                sessionUsageCache.put(req.sessionId, message.usage);
              } catch {}
            }
          } catch (readError: any) {
            if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
              console.error('Background read stream closed prematurely');
            } else {
              console.error('Error in background stream reading:', readError);
            }
          } finally {
            reader.releaseLock();
          }
        }
        read(clonedStream);
        return done(null, originalStream)
      }
      sessionUsageCache.put(req.sessionId, payload.usage);
      if (typeof payload ==='object') {
        if (payload.error) {
          return done(payload.error, null)
        } else {
          return done(payload, null)
        }
      }
    }
    if (typeof payload ==='object' && payload.error) {
      return done(payload.error, null)
    }
    done(null, payload)
  });
  server.addHook("onSend", async (req, reply, payload) => {
    event.emit('onSend', req, reply, payload);
    return payload;
  })


  server.start();
}

export { run };
// run();
