import fs from "node:fs/promises";
import path from "node:path";
import { SkillDefinition } from "../plugins/types";
import { SkillContext, SkillResult, SkillHandler } from "./types";
import { SKILLS_DIR } from "../constants";

export class SkillsManager {
  private skills: Map<string, SkillDefinition> = new Map();

  /**
   * Register a skill
   */
  registerSkill(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
    console.log(`[Skills] Registered: ${skill.name}`);
  }

  /**
   * Unregister a skill
   */
  unregisterSkill(name: string): void {
    this.skills.delete(name);
  }

  /**
   * Load skills from directory
   */
  async loadSkillsFromDir(dir: string = SKILLS_DIR): Promise<void> {
    try {
      const files = await fs.readdir(dir);

      for (const file of files) {
        if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;

        const filePath = path.join(dir, file);
        try {
          const skillModule = require(filePath);
          const skill = skillModule.default || skillModule;

          if (this.isValidSkill(skill)) {
            this.registerSkill({
              ...skill,
              handler: filePath
            });
          }
        } catch (e: any) {
          console.error(`[Skills] Failed to load ${file}:`, e.message);
        }
      }
    } catch {
      // Directory doesn't exist yet, that's OK
    }
  }

  /**
   * Find skill by trigger (slash command)
   */
  findSkillByTrigger(input: string): SkillDefinition | undefined {
    for (const skill of this.skills.values()) {
      if (typeof skill.trigger === 'string') {
        if (input.startsWith(skill.trigger)) {
          return skill;
        }
      } else if (skill.trigger instanceof RegExp) {
        if (skill.trigger.test(input)) {
          return skill;
        }
      }
    }
    return undefined;
  }

  /**
   * Execute a skill
   */
  async executeSkill(name: string, context: SkillContext): Promise<SkillResult> {
    const skill = this.skills.get(name);
    if (!skill) {
      return { success: false, output: `Skill not found: ${name}` };
    }

    try {
      const handler = await this.resolveHandler(skill.handler);
      const timeout = skill.timeout ?? 30000;

      const result = await Promise.race([
        handler(context),
        new Promise<SkillResult>((_, reject) =>
          setTimeout(() => reject(new Error('Skill timeout')), timeout)
        )
      ]);

      return result;
    } catch (e: any) {
      return { success: false, output: `Skill failed: ${e.message}` };
    }
  }

  /**
   * Get all registered skills
   */
  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  private async resolveHandler(handler: string): Promise<SkillHandler> {
    const module = require(handler);
    return module.default || module.handler || module;
  }

  private isValidSkill(obj: any): obj is SkillDefinition {
    return obj && typeof obj.name === 'string' && obj.trigger;
  }
}

// Singleton instance
let skillsManager: SkillsManager | null = null;

export function initSkillsManager(): SkillsManager {
  skillsManager = new SkillsManager();
  return skillsManager;
}

export function getSkillsManager(): SkillsManager {
  if (!skillsManager) {
    throw new Error('SkillsManager not initialized');
  }
  return skillsManager;
}

export function hasSkillsManager(): boolean {
  return skillsManager !== null;
}

export * from './types';
