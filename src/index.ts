import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { createServer as createNetServer } from "net";
import { initConfig, initDir, cleanupLogFiles } from "./utils";
import { createServer } from "./newserver";
import { apiKeyAuth } from "./middleware/auth";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE, MEMORY_DB_PATH } from "./constants";
import { createStream } from 'rotating-file-stream';
import { HOME_DIR, HOOKS_DIR, PLUGINS_DIR, SKILLS_DIR, LOGS_DIR } from "./constants";
import { parseRememberTags } from "./utils/rememberTags";
import { EventEmitter } from "node:events";
import { initMemoryService, getMemoryService, hasMemoryService } from "./memory";
import { initContextBuilder } from "./context";
import type { MemoryConfig, MemoryCategory } from "./memory/types";
import { initHooksManager } from "./hooks";
import type { HookConfig } from "./hooks/types";
import { initPluginManager } from "./plugins";
import type { PluginConfig } from "./plugins/types";
import { initSkillsManager } from "./skills";
import type { CCRRequest, CCRReply } from "./types/request";
import type { CCRConfig } from "./config/schema";

const event = new EventEmitter()

// Use CCRRequest from types/request
type CCRFastifyRequest = CCRRequest;

// Generic logger interface
interface Logger {
  error(message: string | object, ...args: unknown[]): void;
  warn(message: string | object, ...args: unknown[]): void;
  info(message: string | object, ...args: unknown[]): void;
  debug(message: string | object, ...args: unknown[]): void;
}

// Helper for safe logging
function _logError(logger: Logger, message: string, err?: unknown): void {
  if (err instanceof Error) {
    logger.error({ err }, message);
  } else {
    logger.error(message);
  }
}

// Extract and save memories from response content
async function _extractMemoriesFromResponse(
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

async function autoExtractMemories(content: string, req: CCRFastifyRequest, _config: CCRConfig): Promise<void> {
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
        } catch {
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

async function initializeExtensions(server: { addHook: (name: string, handler: unknown) => void }, config: CCRConfig) {
  // ═══════════════════════════════════════════════════════════════════
  // MEMORY SERVICE INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════
  if (config.Memory?.enabled) {
    const memoryConfig: MemoryConfig = {
      enabled: true,
      dbPath: config.Memory.dbPath || MEMORY_DB_PATH,
      embedding: {
        provider: (config.Memory.embedding?.provider || 'openai') as 'openai' | 'ollama' | 'local',
        apiKey: config.Memory.embedding?.apiKey || (config as { OPENAI_API_KEY?: string }).OPENAI_API_KEY,
        baseUrl: config.Memory.embedding?.baseUrl || (config as { OPENAI_BASE_URL?: string }).OPENAI_BASE_URL,
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
      const hooksConfig = config.Hooks as HookConfig;
      const hookConfig: HookConfig = {
        enabled: hooksConfig.enabled ?? true,
        directory: hooksConfig.directory,
        timeout: hooksConfig.timeout,
        hooks: hooksConfig.hooks,
      };
      const hooksManager = initHooksManager(hookConfig);
      await hooksManager.loadHooksFromDir(config.Hooks?.directory || HOOKS_DIR);
      console.log("✅ Hooks system initialized");
    } catch (err) {
      console.error("⚠️ Failed to initialize hooks system:", err);
    }
  }

  // Initialize plugins system
  if (config.Plugins?.enabled !== false) {
    try {
      const pluginsConfig = config.Plugins as PluginConfig;
      const pluginConfig: PluginConfig = {
        enabled: pluginsConfig.enabled ?? true,
        directory: pluginsConfig.directory,
        autoload: pluginsConfig.autoload,
        disabled: pluginsConfig.disabled,
      };
      const pluginManager = initPluginManager(pluginConfig);
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

  // ═══════════════════════════════════════════════════════════════════
  // HOOK REGISTRATIONS
  // ═══════════════════════════════════════════════════════════════════

  // Add async preHandler hook for authentication
  server.addHook("preHandler", async (req: CCRRequest, reply: CCRReply) => {
    return new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) reject(err);
        else resolve();
      };
      // Call the async auth function
      apiKeyAuth(config)(req, reply, done).catch(reject);
    });
  });

  // Legacy preHandler hook removed - newserver.ts handles all /v1/messages routing now

  server.addHook("onError", async (request: CCRRequest, reply: CCRReply, error: Error) => {
    event.emit('onError', request, reply, error);
  })

  // Legacy onSend hooks removed - newserver.ts handles all routing now
}

async function run(_options: RunOptions = {}) {
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
  console.log("[DEBUG RUN] Config loaded, proceeding...");

  let HOST = config.HOST || "127.0.0.1";

  if (config.HOST && !config.APIKEY) {
    HOST = "127.0.0.1";
    console.warn("⚠️ API key is not set. HOST is forced to 127.0.0.1.");
  }

  const port = config.PORT || 3456;

  // Note: PID will be saved after server starts successfully
  console.log("[DEBUG RUN] Setting up signal handlers...");

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

  console.log("[DEBUG RUN] Creating server...");
  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      // ...config,
      providers: config.Providers || (config as { providers?: unknown[] }).providers || [],
      HOST: HOST,
      PORT: servicePort,
      LOG_FILE: join(LOGS_DIR, "claude-code-router.log"),
    },
    logger: loggerConfig as false | undefined,
  });
  console.log("[DEBUG RUN] Server created, setting up error handlers...");

  // Add global error handlers to prevent the service from crashing
  process.on("uncaughtException", (err) => {
    if (server.logger && typeof server.logger !== 'boolean' && server.logger.error) {
      server.logger.error({ err }, "Uncaught exception");
    } else {
      console.error("Uncaught exception:", err);
    }
  });

  process.on("unhandledRejection", (reason, promise) => {
    if (server.logger && typeof server.logger !== 'boolean' && server.logger.error) {
      server.logger.error({ promise, reason }, "Unhandled rejection");
    } else {
      console.error("Unhandled rejection:", reason);
    }
  });

  console.log("[DEBUG RUN] Initializing extensions...");
  // Initialize extensions - this MUST happen before server.start()
  // because Fastify doesn't allow adding hooks after the server starts
  try {
    await initializeExtensions(server as unknown as { addHook: (name: string, handler: unknown) => void }, config);
    console.log("[DEBUG RUN] Extensions initialized successfully");
  } catch (err: unknown) {
    console.error("[FATAL] Failed to initialize extensions:", err);
    console.error("[FATAL] Error details:", {
      message: err instanceof Error ? err.message : String(err),
      code: (err as { code?: string })?.code,
      stack: err instanceof Error ? err.stack : undefined
    });
    cleanupPidFile();
    process.exit(1);
  }

  // Check if port is already in use before attempting to start
  console.log("[DEBUG RUN] Checking port availability...");
  const portInUse = await new Promise<boolean>((resolve) => {
    const tester = createNetServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        tester.close();
        resolve(false);
      })
      .listen(servicePort, HOST);
  });

  if (portInUse) {
    console.error(`[FATAL] Port ${servicePort} is already in use on ${HOST}`);
    console.error(`[FATAL] Please stop the existing process or choose a different port`);
    cleanupPidFile();
    process.exit(1);
  }

  console.log("[DEBUG RUN] Starting server...");
  // Start server - health endpoint can respond now
  try {
    await server.start();
    console.log(`✅ Server listening on http://${HOST}:${servicePort}`);

    // Save PID only after server is fully ready and health endpoint is available
    savePid(process.pid);
    console.log(`[DEBUG RUN] PID ${process.pid} saved after server ready`);
  } catch (err: unknown) {
    console.error("[FATAL] Failed to start server:", err);
    console.error("[FATAL] Error details:", {
      message: err instanceof Error ? err.message : String(err),
      code: (err as { code?: string })?.code,
      stack: err instanceof Error ? err.stack : undefined
    });
    cleanupPidFile();
    process.exit(1);
  }

  console.log("[DEBUG RUN] Server started successfully, keeping process alive...");
  // Keep process alive indefinitely
  await new Promise(() => {
    // Never resolves - keeps the event loop running
  });
}

export { run };
// run();
