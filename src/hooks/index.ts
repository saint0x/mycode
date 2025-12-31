import fs from "node:fs/promises";
import path from "node:path";
import { HookEvent, HookDefinition, HookContext, HookResult, HookConfig, HookHandler } from "./types";
import { HOOKS_DIR } from "../constants";
import type { CCRConfig } from "../config/schema";

interface HookModule {
  default?: HookDefinition;
  handler?: HookHandler;
  name?: string;
  event?: HookEvent | HookEvent[];
}

const DEFAULT_CONFIG: CCRConfig = {
  PORT: 3456,
  Providers: [],
  Router: { default: '' }
};

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
    for (const [, hooks] of this.hooks) {
      const filtered = hooks.filter(h => h.name !== name);
      this.hooks.set(hooks[0]?.event as HookEvent || 'Notification', filtered);
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
          const hookModule = await import(filePath) as HookModule;
          const hook = hookModule.default || hookModule;

          if (this.isValidHook(hook)) {
            this.registerHook({
              ...hook,
              handler: filePath  // Store path for reloading
            });
          }
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.error(`[Hooks] Failed to load ${file}:`, error.message);
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
      config: context.config || DEFAULT_CONFIG,
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

      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`[Hooks] ${hook.name} failed:`, error.message);
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
    const module = await import(handler) as HookModule;
    return module.default?.handler as HookHandler || module.handler || (module as unknown as HookHandler);
  }

  private isValidHook(obj: unknown): obj is HookDefinition {
    if (!obj || typeof obj !== 'object') return false;
    const hook = obj as Record<string, unknown>;
    return typeof hook.name === 'string' && hook.event !== undefined;
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
