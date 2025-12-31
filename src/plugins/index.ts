import fs from "node:fs/promises";
import path from "node:path";
import { PluginManifest, LoadedPlugin, PluginConfig, SkillDefinition, CommandDefinition } from "./types";
import { PLUGINS_DIR } from "../constants";
import { getHooksManager, hasHooksManager } from "../hooks";

export class PluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private config: PluginConfig;

  constructor(config: PluginConfig = { enabled: true, autoload: true }) {
    this.config = config;
  }

  /**
   * Load a plugin from a directory
   */
  async loadPlugin(pluginPath: string): Promise<LoadedPlugin | null> {
    try {
      // Look for .claude-plugin/plugin.json (Claude Code standard)
      const manifestPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');
      const manifestData = await fs.readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(manifestData);

      if (this.config.disabled?.includes(manifest.name)) {
        console.log(`[Plugins] Skipping disabled plugin: ${manifest.name}`);
        return null;
      }

      const plugin: LoadedPlugin = {
        manifest,
        path: pluginPath,
        enabled: true,
        hooks: manifest.hooks || [],
        skills: manifest.skills || [],
        commands: manifest.commands || [],
        agents: []
      };

      // Load hooks
      if (hasHooksManager() && plugin.hooks.length > 0) {
        const hooksManager = getHooksManager();
        for (const hook of plugin.hooks) {
          // Resolve relative paths
          if (typeof hook.handler === 'string' && !path.isAbsolute(hook.handler)) {
            hook.handler = path.join(pluginPath, 'hooks', hook.handler);
          }
          hooksManager.registerHook(hook);
        }
      }

      // Load agents
      if (manifest.agents) {
        for (const agentPath of manifest.agents) {
          const fullPath = path.join(pluginPath, 'agents', agentPath);
          try {
            const agentModule = require(fullPath);
            const agent = agentModule.default || agentModule;
            plugin.agents.push(agent);
          } catch (e: any) {
            console.error(`[Plugins] Failed to load agent ${agentPath}:`, e.message);
          }
        }
      }

      this.plugins.set(manifest.name, plugin);
      console.log(`[Plugins] Loaded: ${manifest.name} v${manifest.version}`);
      return plugin;

    } catch (e: any) {
      // Only log error if it's not just a missing manifest
      if (e.code !== 'ENOENT') {
        console.error(`[Plugins] Failed to load plugin at ${pluginPath}:`, e.message);
      }
      return null;
    }
  }

  /**
   * Load all plugins from directory
   */
  async loadAllPlugins(dir: string = PLUGINS_DIR): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginPath = path.join(dir, entry.name);
        await this.loadPlugin(pluginPath);
      }

      console.log(`[Plugins] Loaded ${this.plugins.size} plugins`);
    } catch {
      // Directory doesn't exist yet, that's OK
      console.log(`[Plugins] No plugins directory found at ${dir}`);
    }
  }

  /**
   * Enable a plugin
   */
  enablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a plugin
   */
  disablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Get a plugin by name
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all skills from all plugins
   */
  getAllSkills(): SkillDefinition[] {
    const skills: SkillDefinition[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled) {
        skills.push(...plugin.skills);
      }
    }
    return skills;
  }

  /**
   * Get all commands from all plugins
   */
  getAllCommands(): CommandDefinition[] {
    const commands: CommandDefinition[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled) {
        commands.push(...plugin.commands);
      }
    }
    return commands;
  }
}

// Singleton instance
let pluginManager: PluginManager | null = null;

export function initPluginManager(config: PluginConfig): PluginManager {
  pluginManager = new PluginManager(config);
  return pluginManager;
}

export function getPluginManager(): PluginManager {
  if (!pluginManager) {
    throw new Error('PluginManager not initialized');
  }
  return pluginManager;
}

export function hasPluginManager(): boolean {
  return pluginManager !== null;
}

export * from './types';
