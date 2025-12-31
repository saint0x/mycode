import { HookDefinition } from '../hooks/types';
import { IAgent } from '../agents/type';

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;

  // Capabilities
  hooks?: HookDefinition[];
  skills?: SkillDefinition[];
  commands?: CommandDefinition[];
  agents?: string[];  // Paths to agent files

  // Configuration
  config?: Record<string, any>;

  // Dependencies
  dependencies?: string[];
}

export interface SkillDefinition {
  name: string;
  description: string;
  trigger: string | RegExp;  // e.g., "/review-pr"

  // Execution
  handler: string;  // Path to handler file

  // Configuration
  args?: ArgumentSchema[];
  requiresProject?: boolean;
  timeout?: number;
}

export interface CommandDefinition {
  name: string;           // e.g., "commit", "review-pr"
  description: string;
  aliases?: string[];
  args?: ArgumentSchema[];
  handler: string;        // Path to handler file
  hidden?: boolean;
  category?: string;
}

export interface ArgumentSchema {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description?: string;
  required?: boolean;
  default?: any;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  path: string;
  enabled: boolean;
  hooks: HookDefinition[];
  skills: SkillDefinition[];
  commands: CommandDefinition[];
  agents: IAgent[];
}

export interface PluginConfig {
  enabled: boolean;
  directory?: string;
  autoload?: boolean;
  disabled?: string[];  // List of disabled plugin names
}
