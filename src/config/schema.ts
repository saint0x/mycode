import type { HookConfig } from '../hooks/types';
import type { PluginConfig } from '../plugins/types';

export interface CCRConfig {
  // ═══════════════════════════════════════════════════════════════════
  // NETWORK & SERVER
  // ═══════════════════════════════════════════════════════════════════
  PORT: number;
  HOST?: string;
  APIKEY?: string;
  API_TIMEOUT_MS?: number;
  PROXY_URL?: string;

  // ═══════════════════════════════════════════════════════════════════
  // PROVIDERS & ROUTING
  // ═══════════════════════════════════════════════════════════════════
  Providers: ProviderConfig[];
  Router: RouterConfig;
  transformers?: TransformerConfig[];
  CUSTOM_ROUTER_PATH?: string;

  // ═══════════════════════════════════════════════════════════════════
  // MEMORY SYSTEM (Phase 1-3)
  // ═══════════════════════════════════════════════════════════════════
  Memory?: MemorySystemConfig;

  // ═══════════════════════════════════════════════════════════════════
  // SUB-AGENT SYSTEM (Phase 5)
  // ═══════════════════════════════════════════════════════════════════
  SubAgent?: SubAgentSystemConfig;

  // ═══════════════════════════════════════════════════════════════════
  // EXTENSIBILITY (Phase 10 - NEW)
  // ═══════════════════════════════════════════════════════════════════
  Hooks?: Partial<HookConfig>;
  Plugins?: Partial<PluginConfig>;
  Skills?: SkillsConfig;

  // ═══════════════════════════════════════════════════════════════════
  // UI & FEATURES
  // ═══════════════════════════════════════════════════════════════════
  StatusLine?: StatusLineConfig;
  LOG?: boolean;
  LOG_LEVEL?: string;
  CLAUDE_PATH?: string;
  NON_INTERACTIVE_MODE?: boolean;
}

export interface ProviderConfig {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: {
    use?: string[];
  };
}

export interface RouterConfig {
  default: string;
  background?: string;
  think?: string;
  longContext?: string;
  longContextThreshold?: number;
  webSearch?: string;
  image?: string;
}

export type TransformerOptionValue = string | number | boolean | null | TransformerOptionValue[] | { [key: string]: TransformerOptionValue };

export interface TransformerConfig {
  name?: string;
  path: string;
  options?: Record<string, TransformerOptionValue>;
}

export interface MemorySystemConfig {
  enabled: boolean;
  dbPath?: string;
  debugMode?: boolean;
  embedding: {
    provider: 'openai' | 'ollama' | 'local';
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  autoInject: {
    global: boolean;
    project: boolean;
    maxMemories: number;
    maxTokens: number;
  };
  autoExtract: boolean;
  retention: {
    minImportance: number;
    maxAgeDays: number;
    cleanupIntervalMs: number;
  };
}

export interface SubAgentSystemConfig {
  enabled: boolean;
  maxDepth: number;
  inheritMemory: boolean;
  defaultTimeout: number;
  allowedTypes: string[];
  debugMode?: boolean;
}

export interface SkillsConfig {
  enabled: boolean;
  directory?: string;
}

export interface StatusLineModuleConfig {
  type: string;
  icon?: string;
  text: string;
  color?: string;
  background?: string;
  scriptPath?: string;
}

export interface StatusLineThemeConfig {
  modules: StatusLineModuleConfig[];
}

export interface StatusLineConfig {
  enabled: boolean;
  currentStyle: string;
  default?: StatusLineThemeConfig;
  powerline?: StatusLineThemeConfig;
  [key: string]: boolean | string | StatusLineThemeConfig | undefined;
}
