import { spawn, type StdioOptions } from "child_process";
import { readConfigFile } from ".";
import { closeService } from "./close";
import {
  decrementReferenceCount,
  incrementReferenceCount,
} from "./processCheck";
import { quote } from 'shell-quote';
import minimist from "minimist";
import { createEnvVariables } from "./createEnvVariables";
import { initSkillsManager, getSkillsManager, hasSkillsManager } from "../skills";
import { SKILLS_DIR } from "../constants";
import type { SkillContext, SkillArgValue } from "../skills/types";
import type { CCRConfig } from "../config/schema";

function parseSkillArgs(input: string, trigger: string): Record<string, SkillArgValue> {
  const argsStr = input.slice(trigger.length).trim();
  if (!argsStr) return {};

  const args: Record<string, SkillArgValue> = { _raw: argsStr };
  const parts = argsStr.split(/\s+/);

  parts.forEach((part, idx) => {
    if (part.startsWith('--')) {
      const [key, ...valueParts] = part.slice(2).split('=');
      args[key] = valueParts.length > 0 ? valueParts.join('=') : true;
    } else if (part.startsWith('-')) {
      args[part.slice(1)] = true;
    } else {
      args[`arg${idx}`] = part;
    }
  });

  return args;
}

async function tryExecuteSkill(input: string, config: CCRConfig): Promise<boolean> {
  if (!input.startsWith('/')) return false;

  // Initialize skills if needed
  if (!hasSkillsManager()) {
    try {
      const skillsManager = initSkillsManager();
      await skillsManager.loadSkillsFromDir(config.Skills?.directory || SKILLS_DIR);
    } catch (err) {
      console.error('[Skills] Failed to initialize:', err);
      return false;
    }
  }

  const skillsManager = getSkillsManager();
  const skill = skillsManager.findSkillByTrigger(input);

  if (!skill) return false;

  console.log(`[Skills] Executing: ${skill.name}`);

  const trigger = typeof skill.trigger === 'string' ? skill.trigger : skill.trigger.source;
  const skillContext: SkillContext = {
    args: parseSkillArgs(input, trigger),
    rawInput: input,
    config,
    projectPath: process.cwd()
  };

  try {
    const result = await skillsManager.executeSkill(skill.name, skillContext);

    if (result.success) {
      console.log(result.output);
    } else {
      console.error(`[Skills] Failed: ${result.output}`);
    }

    return true;
  } catch (err) {
    console.error('[Skills] Execution error:', err);
    return false;
  }
}

export async function executeCodeCommand(args: string[] = []) {
  // Set environment variables using shared function
  const config = await readConfigFile();

  // Check for skill invocation (slash commands)
  const firstArg = args[0];
  if (firstArg && firstArg.startsWith('/')) {
    const fullInput = args.join(' ');
    const wasSkill = await tryExecuteSkill(fullInput, config);
    if (wasSkill) {
      return;
    }
  }

  const env = await createEnvVariables();
  const settingsFlag: {
    env: typeof env;
    statusLine?: { type: string; command: string; padding: number };
  } = { env };
  if (config?.StatusLine?.enabled) {
    settingsFlag.statusLine = {
      type: "command",
      command: "ccr statusline",
      padding: 0,
    };
  }
  // args.push('--settings', `${JSON.stringify(settingsFlag)}`);

  // Non-interactive mode for automation environments
  if (config.NON_INTERACTIVE_MODE) {
    env.CI = "true";
    env.FORCE_COLOR = "0";
    env.NODE_NO_READLINE = "1";
    env.TERM = "dumb";
  }

  // Set ANTHROPIC_SMALL_FAST_MODEL if it exists in config
  const customModel = (config as { ANTHROPIC_SMALL_FAST_MODEL?: string })?.ANTHROPIC_SMALL_FAST_MODEL;
  if (customModel) {
    env.ANTHROPIC_SMALL_FAST_MODEL = customModel;
  }

  // Increment reference count when command starts
  incrementReferenceCount();

  // Execute claude command
  const claudePath = config?.CLAUDE_PATH || process.env.CLAUDE_PATH || "claude";

  const _joinedArgs = args.length > 0 ? quote(args) : "";

  const stdioConfig: StdioOptions = config.NON_INTERACTIVE_MODE
    ? ["pipe", "inherit", "inherit"] // Pipe stdin for non-interactive
    : "inherit"; // Default inherited behavior

  const argsObj = minimist(args)
  const argsArr = []

  // Add named options
  for (const [argsObjKey, argsObjValue] of Object.entries(argsObj)) {
    if (argsObjKey !== '_' && argsObj[argsObjKey]) {
      const prefix = argsObjKey.length === 1 ? '-' : '--';
      // For boolean flags, don't append the value
      if (argsObjValue === true) {
        argsArr.push(`${prefix}${argsObjKey}`);
      } else {
        argsArr.push(`${prefix}${argsObjKey}`);
        argsArr.push(String(argsObjValue));
      }
    }
  }

  // Add positional arguments
  if (argsObj._ && argsObj._.length > 0) {
    argsArr.push(...argsObj._.map(String));
  }

  const claudeProcess = spawn(
    claudePath,
    argsArr,
    {
      env: {
        ...process.env,
        ...env
      },
      stdio: stdioConfig,
      shell: false,  // Don't use shell - pass args directly
    }
  );

  // Close stdin for non-interactive mode
  if (config.NON_INTERACTIVE_MODE) {
    claudeProcess.stdin?.end();
  }

  claudeProcess.on("error", (error) => {
    console.error("Failed to start claude command:", error.message);
    console.log(
      "Make sure Claude Code is installed: npm install -g @anthropic-ai/claude-code"
    );
    decrementReferenceCount();
    process.exit(1);
  });

  claudeProcess.on("close", async (code) => {
    decrementReferenceCount();
    await closeService();
    process.exit(code || 0);
  });
}
