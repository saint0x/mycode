export interface SkillContext {
  args: Record<string, any>;
  request: any;
  config: any;
  sessionId?: string;
  projectPath?: string;
}

export interface SkillResult {
  success: boolean;
  output: string;
  actions?: SkillAction[];
}

export interface SkillAction {
  type: 'remember' | 'notify' | 'execute';
  payload: any;
}

export type SkillHandler = (context: SkillContext) => Promise<SkillResult>;
