import fs from "node:fs/promises";
import path from "node:path";
import { HookEvent, HookDefinition, HookContext, HookResult, HookConfig, HookHandler } from "./types";
import { HOOKS_DIR } from "../constants";

export class HooksManager {
  private hooks: Map<HookEvent, HookDefinition[]> = new Map();
  private config: HookConfig;

  constructor(config: HookConfig = { enabled: true }) {
    this.config = config;
  }

  /**
   * Register a hook
   */
  registerHook(hook: HookDefinition): void {
    const events = Array.isArray(hook.event) ? hook.event : [hook.event];

    for (const event of events) {
      if (!this.hooks.has(event)) {
        this.hooks.set(event, []);
      }

      const eventHooks = this.hooks.get(event)!;
      eventHooks.push(hook);

      // Sort by priority (higher first)
      eventHooks.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }

    console.log(`[Hooks] Registered: ${hook.name} for ${events.join(', ')}`);
  }

  /**
   * Unregister a hook by name
   */
  unregisterHook(name: string): void {
    for (const [event, hooks] of this.hooks) {
      const filtered = hooks.filter(h => h.name !== name);
      this.hooks.set(event, filtered);
    }
  }

  /**
   * Load hooks from directory
   */
  async loadHooksFromDir(dir: string = HOOKS_DIR): Promise<void> {
    try {
      const files = await fs.readdir(dir);

      for (const file of files) {
        if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;

        const filePath = path.join(dir, file);
        try {
          const hookModule = require(filePath);
          const hook = hookModule.default || hookModule;

          if (this.isValidHook(hook)) {
            this.registerHook({
              ...hook,
              handler: filePath  // Store path for reloading
            });
          }
        } catch (e: any) {
          console.error(`[Hooks] Failed to load ${file}:`, e.message);
        }
      }
    } catch {
      // Directory doesn't exist yet, that's OK
    }
  }

  /**
   * Execute all hooks for an event
   */
  async executeHooks(event: HookEvent, context: Partial<HookContext>): Promise<HookResult> {
    if (!this.config.enabled) {
      return { continue: true };
    }

    const eventHooks = this.hooks.get(event) || [];
    const fullContext: HookContext = {
      event,
      config: context.config || {},
      timestamp: Date.now(),
      ...context
    };

    for (const hook of eventHooks) {
      if (hook.enabled === false) continue;

      try {
        const handler = await this.resolveHandler(hook.handler);
        const timeout = hook.timeout ?? this.config.timeout ?? 5000;

        const result = await Promise.race([
          handler(fullContext),
          new Promise<HookResult>((_, reject) =>
            setTimeout(() => reject(new Error('Hook timeout')), timeout)
          )
        ]);

        if (!result.continue) {
          console.log(`[Hooks] ${hook.name} blocked execution`);
          return result;
        }

        // Apply modifications if any
        if (result.modified) {
          Object.assign(fullContext, { request: result.modified });
        }

      } catch (e: any) {
        console.error(`[Hooks] ${hook.name} failed:`, e.message);
        // Continue on hook failure (non-blocking)
      }
    }

    return { continue: true };
  }

  /**
   * Get hooks registered for an event
   */
  getHooksForEvent(event: HookEvent): HookDefinition[] {
    return this.hooks.get(event) || [];
  }

  /**
   * Get all registered hooks
   */
  getAllHooks(): HookDefinition[] {
    const all: HookDefinition[] = [];
    for (const hooks of this.hooks.values()) {
      for (const hook of hooks) {
        if (!all.find(h => h.name === hook.name)) {
          all.push(hook);
        }
      }
    }
    return all;
  }

  private async resolveHandler(handler: string | HookHandler): Promise<HookHandler> {
    if (typeof handler === 'function') {
      return handler;
    }

    // Load from file path
    const module = require(handler);
    return module.default || module.handler || module;
  }

  private isValidHook(obj: any): obj is HookDefinition {
    return obj && typeof obj.name === 'string' && obj.event;
  }
}

// Singleton instance
let hooksManager: HooksManager | null = null;

export function initHooksManager(config: HookConfig): HooksManager {
  hooksManager = new HooksManager(config);
  return hooksManager;
}

export function getHooksManager(): HooksManager {
  if (!hooksManager) {
    throw new Error('HooksManager not initialized');
  }
  return hooksManager;
}

export function hasHooksManager(): boolean {
  return hooksManager !== null;
}

export * from './types';
