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
import { sessionUsageCache, type Usage } from "./utils/cache";
import {SSEParserTransform} from "./utils/SSEParser.transform";
import {SSESerializerTransform} from "./utils/SSESerializer.transform";
import {rewriteStream} from "./utils/rewriteStream";
import {createMemoryProcessingTransform} from "./utils/MemoryProcessing.transform";
import { parseRememberTags } from "./utils/rememberTags";
import JSON5 from "json5";
import { IAgent } from "./agents/type";
import agentsManager from "./agents";
import { EventEmitter } from "node:events";
import { initMemoryService, getMemoryService, hasMemoryService } from "./memory";
import { getContextBuilder, initContextBuilder } from "./context";
import type { MemoryConfig, MemoryCategory } from "./memory/types";
import { initHooksManager, getHooksManager, hasHooksManager } from "./hooks";
import { initPluginManager, getPluginManager } from "./plugins";
import { initSkillsManager, getSkillsManager, hasSkillsManager } from "./skills";
import { HOOKS_DIR, PLUGINS_DIR, SKILLS_DIR, LOGS_DIR } from "./constants";
import type { CCRConfig } from "./types/request";
import type { FastifyRequest, FastifyReply } from "fastify";

const event = new EventEmitter()

// Extended request interface for CCR
interface CCRFastifyRequest extends FastifyRequest {
  sessionId?: string;
  projectPath?: string;
  agents?: string[];
  contextAnalysis?: import("./context/types").RequestAnalysis;
  routeInfo?: {
    provider?: string;
    model?: string;
  };
  body: Record<string, unknown> & {
    messages?: Array<{ role: string; content: unknown }>;
    tools?: Array<{ name: string; description: string; input_schema: unknown }>;
    system?: string;
  };
}

// Helper for safe logging
function logError(logger: FastifyRequest['log'], message: string, err?: unknown): void {
  if (err instanceof Error) {
    logger.error({ err }, message);
  } else {
    logger.error(message);
  }
}

// Extract and save memories from response content
async function extractMemoriesFromResponse(
  content: string,
  req: CCRFastifyRequest,
  config: CCRConfig
): Promise<void> {
  if (!config.Memory?.enabled || !hasMemoryService()) return;

  try {
    const memoryService = getMemoryService();

    // Use lenient parser (Phase 9.2.1)
    const parsedTags = parseRememberTags(content);

    for (const tag of parsedTags) {
      await memoryService.remember(tag.content, {
        scope: tag.scope,
        projectPath: req.projectPath,
        category: tag.category as MemoryCategory,
        metadata: {
          sessionId: req.sessionId,
          source: 'agent-explicit',
        },
      });

      if (config.Memory.debugMode) {
        console.log(`[Memory] Saved ${tag.scope} memory (${tag.category}):`, tag.content.slice(0, 50) + '...');
      }
    }

    // Auto-extract if enabled
    if (config.Memory.autoExtract) {
      await autoExtractMemories(content, req, config);
    }
  } catch (err) {
    console.error('[Memory] Error extracting memories:', err);
  }
}

async function autoExtractMemories(content: string, req: CCRFastifyRequest, config: CCRConfig): Promise<void> {
  if (!hasMemoryService()) return;

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
        } catch (err) {
          // Silently ignore extraction errors
        }
      }
    }
  }
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

  // ═══════════════════════════════════════════════════════════════════
  // EXTENSIBILITY INITIALIZATION (Phase 10)
  // ═══════════════════════════════════════════════════════════════════

  // Initialize hooks system
  if (config.Hooks?.enabled !== false) {
    try {
      const hooksManager = initHooksManager(config.Hooks || { enabled: true });
      await hooksManager.loadHooksFromDir(config.Hooks?.directory || HOOKS_DIR);
      console.log("✅ Hooks system initialized");
    } catch (err) {
      console.error("⚠️ Failed to initialize hooks system:", err);
    }
  }

  // Initialize plugins system
  if (config.Plugins?.enabled !== false) {
    try {
      const pluginManager = initPluginManager(config.Plugins || { enabled: true });
      if (config.Plugins?.autoload !== false) {
        await pluginManager.loadAllPlugins(config.Plugins?.directory || PLUGINS_DIR);
      }
      console.log("✅ Plugins system initialized");
    } catch (err) {
      console.error("⚠️ Failed to initialize plugins system:", err);
    }
  }

  // Initialize skills system
  if (config.Skills?.enabled !== false) {
    try {
      const skillsManager = initSkillsManager();
      await skillsManager.loadSkillsFromDir(config.Skills?.directory || SKILLS_DIR);
      console.log("✅ Skills system initialized");
    } catch (err) {
      console.error("⚠️ Failed to initialize skills system:", err);
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
  const pad = (num: number): string => (num > 9 ? "" : "0") + num;
  const generator = (time: Date | number, index?: number): string => {
    const now = typeof time === 'number' ? new Date(time) : (time || new Date());

    const month = now.getFullYear() + "" + pad(now.getMonth() + 1);
    const day = pad(now.getDate());
    const hour = pad(now.getHours());
    const minute = pad(now.getMinutes());

    return `./logs/ccr-${month}${day}${hour}${minute}${pad(now.getSeconds())}${index ? `_${index}` : ''}.log`;
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
      LOG_FILE: join(LOGS_DIR, "claude-code-router.log"),
    },
    logger: loggerConfig,
  });

  // Add global error handlers to prevent the service from crashing
  process.on("uncaughtException", (err) => {
    server.logger.error({ err }, "Uncaught exception");
  });

  process.on("unhandledRejection", (reason, promise) => {
    server.logger.error({ promise, reason }, "Unhandled rejection");
  });
  // Add async preHandler hook for authentication
  server.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    return new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) reject(err);
        else resolve();
      };
      // Call the async auth function
      apiKeyAuth(config)(req, reply, done).catch(reject);
    });
  });
  server.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const extReq = req as CCRFastifyRequest;
    if (req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens")) {
      // ═══════════════════════════════════════════════════════════════════
      // HOOK: SessionStart - Fire at start of new session/request
      // ═══════════════════════════════════════════════════════════════════
      if (hasHooksManager()) {
        try {
          const sessionStartResult = await getHooksManager().executeHooks('SessionStart', {
            request: {
              body: extReq.body as Record<string, unknown>,
              headers: req.headers as Record<string, string | string[] | undefined>,
              url: req.url,
              method: req.method,
              sessionId: extReq.sessionId,
              projectPath: extReq.projectPath
            },
            config,
            sessionId: extReq.sessionId,
            projectPath: extReq.projectPath
          });

          if (!sessionStartResult.continue) {
            return reply.status(403).send({
              error: {
                type: 'hook_blocked',
                message: sessionStartResult.error || 'Request blocked by SessionStart hook'
              }
            });
          }
        } catch (err) {
          logError(req.log, '[Hooks] SessionStart hook error', err);
          // Fail open - continue processing
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // HOOK: PreRoute - Before context building and routing
      // ═══════════════════════════════════════════════════════════════════
      if (hasHooksManager()) {
        try {
          const preRouteResult = await getHooksManager().executeHooks('PreRoute', {
            request: {
              body: extReq.body as Record<string, unknown>,
              headers: req.headers as Record<string, string | string[] | undefined>,
              url: req.url,
              method: req.method,
              sessionId: extReq.sessionId,
              projectPath: extReq.projectPath
            },
            config,
            sessionId: extReq.sessionId,
            projectPath: extReq.projectPath
          });

          if (!preRouteResult.continue) {
            return reply.status(403).send({
              error: {
                type: 'hook_blocked',
                message: preRouteResult.error || 'Request blocked by PreRoute hook'
              }
            });
          }

          // Apply any modifications from hook
          if (preRouteResult.modifications?.body) {
            extReq.body = { ...extReq.body, ...preRouteResult.modifications.body };
          }
        } catch (err) {
          logError(req.log, '[Hooks] PreRoute hook error', err);
          // Fail open - continue processing
        }
      }

      const useAgents: string[] = []

      for (const agent of agentsManager.getAllAgents()) {
        if (agent.shouldHandle(extReq, config)) {
          // Set agent identifier
          useAgents.push(agent.name)

          // change request body
          agent.reqHandler(extReq, config);

          // append agent tools
          if (agent.tools.size) {
            if (!extReq.body?.tools?.length) {
              extReq.body.tools = []
            }
            extReq.body.tools.unshift(...Array.from(agent.tools.values()).map(item => {
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
        extReq.agents = useAgents;
      }

      // Build dynamic context with memory injection
      if (config.Memory?.enabled && hasMemoryService()) {
        try {
          const builder = getContextBuilder();
          const projectPathResult = extReq.sessionId ? await searchProjectBySession(extReq.sessionId) : null;
          const projectPath = projectPathResult ?? undefined;

          const contextResult = await builder.build(
            extReq.body.system,
            {
              messages: extReq.body.messages || [],
              projectPath: projectPath || undefined,
              sessionId: extReq.sessionId,
              tools: extReq.body.tools,
            }
          );

          // Replace system prompt with enhanced version
          extReq.body.system = contextResult.systemPrompt;
          extReq.contextAnalysis = contextResult.analysis;
          extReq.projectPath = projectPath || undefined;

          if (config.Memory.debugMode) {
            req.log.info(`[Context Builder] taskType=${contextResult.analysis.taskType} sections=${contextResult.sections.length} tokens=${contextResult.totalTokens}`);
          }
        } catch (err) {
          logError(req.log, 'Context building failed', err);
        }
      }

      await router(extReq, reply, {
        config,
        event
      });

      // ═══════════════════════════════════════════════════════════════════
      // HOOK: PostRoute - After routing decision
      // ═══════════════════════════════════════════════════════════════════
      if (hasHooksManager()) {
        try {
          await getHooksManager().executeHooks('PostRoute', {
            request: {
              body: extReq.body as Record<string, unknown>,
              headers: req.headers as Record<string, string | string[] | undefined>,
              url: req.url,
              method: req.method,
              sessionId: extReq.sessionId,
              projectPath: extReq.projectPath
            },
            config,
            sessionId: extReq.sessionId,
            projectPath: extReq.projectPath,
            routeDecision: extReq.routeInfo?.provider || 'unknown'
          });
        } catch (err) {
          logError(req.log, '[Hooks] PostRoute hook error', err);
          // Fail open - continue processing
        }
      }
    }
  });
  server.addHook("onError", async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    event.emit('onError', request, reply, error);
  })

  interface ToolMessage {
    tool_use_id: string;
    type: "tool_result";
    content: string | undefined;
  }

  interface AssistantMessage {
    type: "tool_use" | "text";
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    text?: string;
  }

  server.addHook("onSend", (req: FastifyRequest, reply: FastifyReply, payload: unknown, done: (err: Error | null, payload: unknown) => void) => {
    const extReq = req as CCRFastifyRequest;
    if (extReq.sessionId && req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens")) {
      if (payload instanceof ReadableStream) {
        if (extReq.agents) {
          const abortController = new AbortController();
          const eventStream = payload.pipeThrough(new TextDecoderStream()).pipeThrough(new SSEParserTransform())
          let currentAgent: undefined | IAgent;
          let currentToolIndex = -1
          let currentToolName = ''
          let currentToolArgs = ''
          let currentToolId = ''
          const toolMessages: ToolMessage[] = []
          const assistantMessages: AssistantMessage[] = []
          // Store Anthropic format message body, distinguish text and tool types
          return done(null, (rewriteStream(eventStream, async (data, controller) => {
            try {
              // Detect tool call start
              if (data.event === 'content_block_start' && data?.data?.content_block?.name) {
                const agent = extReq.agents?.find((name: string) => agentsManager.getAgent(name)?.tools.get(data.data.content_block.name))
                if (agent) {
                  currentAgent = agentsManager.getAgent(agent)
                  currentToolIndex = data.data.index
                  currentToolName = data.data.content_block.name
                  currentToolId = data.data.content_block.id
                  return undefined;
                }
              }

              // Collect tool arguments
              if (currentToolIndex > -1 && data.data.index === currentToolIndex && data.data?.delta?.type === 'input_json_delta') {
                currentToolArgs += data.data?.delta?.partial_json;
                return undefined;
              }

              // Tool call complete, process agent call
              if (currentToolIndex > -1 && data.data.index === currentToolIndex && data.data.type === 'content_block_stop') {
                try {
                  const args = JSON5.parse(currentToolArgs);
                  assistantMessages.push({
                    type: "tool_use",
                    id: currentToolId,
                    name: currentToolName,
                    input: args
                  })

                  // ═══════════════════════════════════════════════════════════════
                  // HOOK: PreToolUse - Before tool execution
                  // ═══════════════════════════════════════════════════════════════
                  let toolBlocked = false;
                  let toolBlockedMessage = '';
                  if (hasHooksManager()) {
                    try {
                      const preToolResult = await getHooksManager().executeHooks('PreToolUse', {
                        toolName: currentToolName,
                        toolInput: args,
                        config,
                        sessionId: extReq.sessionId,
                        projectPath: extReq.projectPath
                      });

                      if (!preToolResult.continue) {
                        toolBlocked = true;
                        toolBlockedMessage = preToolResult.error || `Tool ${currentToolName} blocked by hook`;
                      }
                    } catch (err) {
                      console.error('[Hooks] PreToolUse hook error:', err);
                      // Fail open - continue with tool execution
                    }
                  }

                  let toolResult: string | undefined;
                  if (toolBlocked) {
                    toolResult = toolBlockedMessage;
                  } else {
                    toolResult = await currentAgent?.tools.get(currentToolName)?.handler(args, {
                      req: extReq,
                      config
                    });

                    // ═══════════════════════════════════════════════════════════════
                    // HOOK: PostToolUse - After tool execution
                    // ═══════════════════════════════════════════════════════════════
                    if (hasHooksManager()) {
                      try {
                        const postToolResult = await getHooksManager().executeHooks('PostToolUse', {
                          toolName: currentToolName,
                          toolInput: args,
                          toolOutput: { result: toolResult },
                          config,
                          sessionId: extReq.sessionId,
                          projectPath: extReq.projectPath
                        });

                        // Allow hooks to modify tool output
                        if (postToolResult.modifications?.toolOutput) {
                          toolResult = postToolResult.modifications.toolOutput;
                        }
                      } catch (err) {
                        console.error('[Hooks] PostToolUse hook error:', err);
                      }
                    }
                  }

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
                const messages = extReq.body.messages || [];
                messages.push({
                  role: 'assistant',
                  content: assistantMessages
                })
                messages.push({
                  role: 'user',
                  content: toolMessages
                })
                extReq.body.messages = messages;
                const response = await fetch(`http://127.0.0.1:${config.PORT || 3456}/v1/messages`, {
                  method: "POST",
                  headers: {
                    'x-api-key': config.APIKEY || '',
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify(extReq.body),
                })
                if (!response.ok) {
                  return undefined;
                }
                const stream = response.body!
                  .pipeThrough(new TextDecoderStream())
                  .pipeThrough(new SSEParserTransform() as unknown as TransformStream<string, { event?: string; data?: unknown }>)
                const reader = stream.getReader()
                while (true) {
                  try {
                    const {value, done} = await reader.read();
                    if (done) {
                      break;
                    }
                    if (value.event && ['message_start', 'message_stop'].includes(value.event)) {
                      continue
                    }

                    // Check if stream is still writable
                    if (!controller.desiredSize) {
                      break;
                    }

                    (controller as ReadableStreamDefaultController<unknown>).enqueue(value)
                  }catch (readError: any) {
                    if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                      abortController.abort(); // Abort all related operations
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

              // Handle stream premature close error
              if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                abortController.abort();
                return undefined;
              }

              // Rethrow other errors
              throw error;
            }
          }) as ReadableStream).pipeThrough(new SSESerializerTransform() as unknown as TransformStream<unknown, Uint8Array>))
        }

        // ═══════════════════════════════════════════════════════════════
        // PHASE 9.2.2: Memory extraction and tag stripping for non-agent streams
        // ═══════════════════════════════════════════════════════════════

        // Check if memory processing is enabled
        if (config.Memory?.enabled && hasMemoryService()) {
          const memoryProcessor = createMemoryProcessingTransform({
            req: extReq,
            config,
            onMemoryExtracted: async (memory) => {
              try {
                const memoryService = getMemoryService();
                await memoryService.remember(memory.content, {
                  scope: memory.scope,
                  projectPath: extReq.projectPath,
                  category: memory.category as MemoryCategory,
                  metadata: {
                    sessionId: extReq.sessionId,
                    source: 'agent-explicit',
                  },
                });
                if (config.Memory.debugMode) {
                  console.log(`[Memory] Saved ${memory.scope} memory (${memory.category}):`, memory.content.slice(0, 50) + '...');
                }
              } catch (err) {
                console.error('[Memory] Error saving memory:', err);
              }
            },
          });

          // Process stream through memory transform
          const processedStream = (payload as ReadableStream<Uint8Array>)
            .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
            .pipeThrough(new SSEParserTransform() as unknown as TransformStream<string, any>)
            .pipeThrough(new TransformStream<any, any>({
              transform(event: any, controller: TransformStreamDefaultController<any>) {
                const processed = memoryProcessor.processEvent(event);
                if (processed !== null) {
                  controller.enqueue(processed);
                }
              },
            }))
            .pipeThrough(new SSESerializerTransform() as unknown as TransformStream<any, Uint8Array>);

          // Tee for usage tracking
          const [outputStream, trackingStream] = processedStream.tee();

          // Track usage in background
          const readForTracking = async (stream: ReadableStream) => {
            const reader = stream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const dataStr = new TextDecoder().decode(value);
                if (dataStr.startsWith("event: message_delta")) {
                  const str = dataStr.slice(27);
                  try {
                    const message = JSON.parse(str) as { usage?: Usage };
                    if (extReq.sessionId && message.usage) {
                      sessionUsageCache.put(extReq.sessionId, message.usage);
                    }
                  } catch {
                    // Ignore parse errors
                  }
                }
              }
            } catch (readError: unknown) {
              const err = readError as { name?: string; code?: string };
              if (err.name !== 'AbortError' && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
                console.error('Error in background stream reading:', readError);
              }
            } finally {
              reader.releaseLock();
            }
          };
          readForTracking(trackingStream);

          return done(null, outputStream);
        }

        // Fallback: no memory processing
        const [originalStream, clonedStream] = (payload as ReadableStream).tee();
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
                const message = JSON.parse(str) as { usage?: Usage };
                if (extReq.sessionId && message.usage) {
                  sessionUsageCache.put(extReq.sessionId, message.usage);
                }
              } catch {
                // Ignore parse errors
              }
            }
          } catch (readError: unknown) {
            const err = readError as { name?: string; code?: string };
            if (err.name === 'AbortError' || err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
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
      if (extReq.sessionId) {
        const payloadUsage = (payload as { usage?: Usage }).usage;
        if (payloadUsage) {
          sessionUsageCache.put(extReq.sessionId, payloadUsage);
        }
      }
      if (typeof payload ==='object' && payload !== null) {
        const payloadObj = payload as { error?: Error };
        if (payloadObj.error) {
          return done(payloadObj.error, null)
        } else {
          return done(null, payload)
        }
      }
    }
    if (typeof payload ==='object' && payload !== null && (payload as { error?: Error }).error) {
      return done((payload as { error: Error }).error, null)
    }
    done(null, payload)
  });
  server.addHook("onSend", async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const extReq = req as CCRFastifyRequest;
    // ═══════════════════════════════════════════════════════════════════
    // HOOK: PreResponse - Before sending response to client
    // ═══════════════════════════════════════════════════════════════════
    if (req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens") && hasHooksManager()) {
      try {
        const preResponseResult = await getHooksManager().executeHooks('PreResponse', {
          request: {
            body: extReq.body as Record<string, unknown>,
            headers: req.headers as Record<string, string | string[] | undefined>,
            url: req.url,
            method: req.method,
            sessionId: extReq.sessionId,
            projectPath: extReq.projectPath
          },
          response: {
            statusCode: reply.statusCode,
            headers: reply.getHeaders() as Record<string, string>
          },
          config,
          sessionId: extReq.sessionId,
          projectPath: extReq.projectPath
        });

        if (!preResponseResult.continue) {
          console.log('[Hooks] PreResponse blocked response');
        }
      } catch (err) {
        console.error('[Hooks] PreResponse hook error:', err);
      }
    }

    event.emit('onSend', extReq, reply, payload);

    // ═══════════════════════════════════════════════════════════════════
    // HOOK: SessionEnd - After response is complete
    // ═══════════════════════════════════════════════════════════════════
    if (req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens") && hasHooksManager()) {
      // Fire SessionEnd asynchronously - don't block response
      getHooksManager().executeHooks('SessionEnd', {
        request: {
          body: extReq.body as Record<string, unknown>,
          headers: req.headers as Record<string, string | string[] | undefined>,
          url: req.url,
          method: req.method,
          sessionId: extReq.sessionId,
          projectPath: extReq.projectPath
        },
        response: {
          statusCode: reply.statusCode,
          headers: reply.getHeaders() as Record<string, string>
        },
        config,
        sessionId: extReq.sessionId,
        projectPath: extReq.projectPath
      }).catch(err => {
        console.error('[Hooks] SessionEnd hook error:', err);
      });
    }

    return payload;
  })


  server.start();
}

export { run };
// run();
