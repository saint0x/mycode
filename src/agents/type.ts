// Agent context interface
export interface AgentContext {
  req: {
    body: {
      messages: unknown[];
      system?: unknown;
      tools?: unknown[];
      model?: string;
      [key: string]: unknown;
    };
    headers?: Record<string, string | string[] | undefined>;
    [key: string]: unknown;
  };
  config: Record<string, unknown>;
  [key: string]: unknown;
}

// Input schema type for tools
export interface ToolInputSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ITool {
  name: string;
  description: string;
  input_schema: ToolInputSchema;

  handler: (args: Record<string, unknown>, context: AgentContext) => Promise<string>;
}

export interface IAgent {
  name: string;

  tools: Map<string, ITool>;

  shouldHandle: (req: AgentContext['req'], config: Record<string, unknown>) => boolean;

  reqHandler: (req: AgentContext['req'], config: Record<string, unknown>) => void;

  resHandler?: (payload: Record<string, unknown>, config: Record<string, unknown>) => void;
}
