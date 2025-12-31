import type { CCRConfig } from '../config/schema';
import type { HookRequest } from '../hooks/types';

export type SkillArgValue = string | number | boolean | null;

export interface SkillContext {
  args: Record<string, SkillArgValue>;
  request: HookRequest;
  config: CCRConfig;
  sessionId?: string;
  projectPath?: string;
}

export interface SkillResult {
  success: boolean;
  output: string;
  actions?: SkillAction[];
}

export interface RememberPayload {
  content: string;
  scope: 'global' | 'project';
  category: string;
}

export interface NotifyPayload {
  message: string;
  level: 'info' | 'warn' | 'error';
}

export interface ExecutePayload {
  command: string;
  args?: string[];
}

export type SkillActionPayload = RememberPayload | NotifyPayload | ExecutePayload;

export interface SkillAction {
  type: 'remember' | 'notify' | 'execute';
  payload: SkillActionPayload;
}

export type SkillHandler = (context: SkillContext) => Promise<SkillResult>;
