import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { checkForUpdates, performUpdate } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import {calculateTokenCount} from "./utils/router";
import { LOGS_DIR } from "./constants";
import { getPluginManager, hasPluginManager } from "./plugins";
import { getHooksManager, hasHooksManager } from "./hooks";
import { getSkillsManager, hasSkillsManager } from "./skills";

export const createServer = (config: any): Server => {
  const server = new Server(config);

  server.app.post("/v1/messages/count_tokens", async (req, reply) => {
    const {messages, tools, system} = req.body;
    const tokenCount = calculateTokenCount(messages, system, tools);
    return { "input_tokens": tokenCount }
  });

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async (req, reply) => {
    return await readConfigFile();
  });

  server.app.get("/api/transformers", async () => {
    const transformers =
      server.app._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  server.app.post("/api/config", async (req, reply) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // Add endpoint to restart the service with access control
  server.app.post("/api/restart", async (req, reply) => {
    reply.send({ success: true, message: "Service restart initiated" });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      const { spawn } = require("child_process");
      spawn(process.execPath, [process.argv[1], "restart"], {
        detached: true,
        stdio: "ignore",
      });
    }, 1000);
  });

  // Register static file serving with caching
  server.app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  server.app.get("/ui", async (_, reply) => {
    return reply.redirect("/ui/");
  });

  // Version check endpoint
  server.app.get("/api/update/check", async (req, reply) => {
    try {
      // Get current version
      const currentVersion = require("../package.json").version;
      const { hasUpdate, latestVersion, changelog } = await checkForUpdates(currentVersion);

      return {
        hasUpdate,
        latestVersion: hasUpdate ? latestVersion : undefined,
        changelog: hasUpdate ? changelog : undefined
      };
    } catch (error) {
      console.error("Failed to check for updates:", error);
      reply.status(500).send({ error: "Failed to check for updates" });
    }
  });

  // Perform update endpoint
  server.app.post("/api/update/perform", async (req, reply) => {
    try {
      // Only allow full access users to perform updates
      const accessLevel = (req as any).accessLevel || "restricted";
      if (accessLevel !== "full") {
        reply.status(403).send("Full access required to perform updates");
        return;
      }

      // Execute update logic
      const result = await performUpdate();

      return result;
    } catch (error) {
      console.error("Failed to perform update:", error);
      reply.status(500).send({ error: "Failed to perform update" });
    }
  });

  // Get log files list endpoint
  server.app.get("/api/logs/files", async (req, reply) => {
    try {
      const logDir = LOGS_DIR;
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> = [];

      if (existsSync(logDir)) {
        const files = readdirSync(logDir);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(logDir, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString()
            });
          }
        }

        // Sort by modification time descending
        logFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      }

      return logFiles;
    } catch (error) {
      console.error("Failed to get log files:", error);
      reply.status(500).send({ error: "Failed to get log files" });
    }
  });

  // Get log content endpoint
  server.app.get("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // Use specified file path
        logFilePath = filePath;
      } else {
        // Use default log file path
        logFilePath = join(LOGS_DIR, "app.log");
      }

      if (!existsSync(logFilePath)) {
        return [];
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim())

      return logLines;
    } catch (error) {
      console.error("Failed to get logs:", error);
      reply.status(500).send({ error: "Failed to get logs" });
    }
  });

  // Clear log content endpoint
  server.app.delete("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // Use specified file path
        logFilePath = filePath;
      } else {
        // Use default log file path
        logFilePath = join(LOGS_DIR, "app.log");
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return { success: true, message: "Logs cleared successfully" };
    } catch (error) {
      console.error("Failed to clear logs:", error);
      reply.status(500).send({ error: "Failed to clear logs" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // EXTENSIBILITY API ENDPOINTS (Phase 10)
  // ═══════════════════════════════════════════════════════════════════

  // Plugins endpoints
  server.app.get("/api/plugins", async () => {
    if (!hasPluginManager()) return [];
    const pluginManager = getPluginManager();
    return pluginManager.getAllPlugins().map(p => ({
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      enabled: p.enabled,
      hooks: p.hooks.length,
      skills: p.skills.length,
      commands: p.commands.length
    }));
  });

  server.app.post("/api/plugins/:name/enable", async (req) => {
    const { name } = req.params as { name: string };
    if (!hasPluginManager()) return { success: false, name };
    const pluginManager = getPluginManager();
    const success = pluginManager.enablePlugin(name);
    return { success, name };
  });

  server.app.post("/api/plugins/:name/disable", async (req) => {
    const { name } = req.params as { name: string };
    if (!hasPluginManager()) return { success: false, name };
    const pluginManager = getPluginManager();
    const success = pluginManager.disablePlugin(name);
    return { success, name };
  });

  // Hooks endpoints
  server.app.get("/api/hooks", async () => {
    if (!hasHooksManager()) return [];
    const hooksManager = getHooksManager();
    return hooksManager.getAllHooks().map(h => ({
      name: h.name,
      event: h.event,
      priority: h.priority ?? 0,
      enabled: h.enabled !== false
    }));
  });

  server.app.get("/api/hooks/events", async () => {
    return [
      'PreToolUse', 'PostToolUse', 'PreRoute', 'PostRoute',
      'SessionStart', 'SessionEnd', 'PreResponse', 'PostResponse',
      'PreCompact', 'Notification'
    ];
  });

  // Skills endpoints
  server.app.get("/api/skills", async () => {
    if (!hasSkillsManager()) return [];
    const skillsManager = getSkillsManager();
    return skillsManager.getAllSkills().map(s => ({
      name: s.name,
      description: s.description,
      trigger: String(s.trigger)
    }));
  });

  return server;
};
