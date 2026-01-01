import { readConfigFile } from ".";

export interface EnvVariables {
  ANTHROPIC_AUTH_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_BASE_URL: string;
  NO_PROXY: string;
  DISABLE_TELEMETRY: string;
  DISABLE_COST_WARNINGS: string;
  API_TIMEOUT_MS: string;
  CLAUDE_CODE_USE_BEDROCK: string | undefined;
  // Optional properties for non-interactive mode
  CI?: string;
  FORCE_COLOR?: string;
  NODE_NO_READLINE?: string;
  TERM?: string;
  ANTHROPIC_SMALL_FAST_MODEL?: string;
  [key: string]: string | undefined;
}

/**
 * Get environment variables for Agent SDK/Claude Code integration
 * This function is shared between `ccr env` and `ccr code` commands
 */
export const createEnvVariables = async (): Promise<EnvVariables> => {
  const config = await readConfigFile();
  const port = config.PORT || 3456;
  const apiKey = config.APIKEY || "test";

  return {
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    NO_PROXY: "127.0.0.1",
    DISABLE_TELEMETRY: "true",
    DISABLE_COST_WARNINGS: "true",
    API_TIMEOUT_MS: String(config.API_TIMEOUT_MS ?? 600000),
    // Reset CLAUDE_CODE_USE_BEDROCK when running with ccr
    CLAUDE_CODE_USE_BEDROCK: undefined,
  };
}