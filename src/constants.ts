import path from "node:path";
import os from "node:os";

// NEW: Primary config location
export const HOME_DIR = process.env.CCR_HOME || path.join(os.homedir(), "mycode");

// LEGACY: For migration support
export const LEGACY_HOME_DIR = path.join(os.homedir(), ".claude-code-router");

// Core paths (all relative to HOME_DIR)
export const CONFIG_FILE = path.join(HOME_DIR, "config.json");
export const PLUGINS_DIR = path.join(HOME_DIR, "plugins");
export const PID_FILE = path.join(HOME_DIR, '.claude-code-router.pid');
export const MEMORY_DB_PATH = path.join(HOME_DIR, "memory.db");
export const LOGS_DIR = path.join(HOME_DIR, "logs");

// NEW: Extensibility directories
export const HOOKS_DIR = path.join(HOME_DIR, "hooks");
export const SKILLS_DIR = path.join(HOME_DIR, "skills");
export const COMMANDS_DIR = path.join(HOME_DIR, "commands");

export const REFERENCE_COUNT_FILE = path.join(os.tmpdir(), "claude-code-reference-count.txt");

// Claude projects directory (unchanged)
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

export const DEFAULT_CONFIG = {
  LOG: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};
