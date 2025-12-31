import fs from "node:fs/promises";
import path from "node:path";
import { HOME_DIR, LEGACY_HOME_DIR, CONFIG_FILE } from "../constants";

export interface MigrationResult {
  success: boolean;
  migrated: string[];
  errors: string[];
  backupPath?: string;
}

/**
 * Check if legacy config directory exists
 */
export async function detectLegacyConfig(): Promise<boolean> {
  try {
    await fs.access(path.join(LEGACY_HOME_DIR, "config.json"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if new config directory already exists
 */
export async function detectNewConfig(): Promise<boolean> {
  try {
    await fs.access(CONFIG_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create timestamped backup of legacy directory
 */
export async function backupLegacyDir(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${LEGACY_HOME_DIR}.backup-${timestamp}`;
  await fs.cp(LEGACY_HOME_DIR, backupPath, { recursive: true });
  return backupPath;
}

/**
 * Migrate all data from legacy location to new location
 */
export async function migrateFromLegacy(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    migrated: [],
    errors: []
  };

  try {
    // Step 1: Backup legacy directory
    result.backupPath = await backupLegacyDir();
    console.log(`[Migration] Backed up to: ${result.backupPath}`);

    // Step 2: Create new directory structure
    await fs.mkdir(HOME_DIR, { recursive: true });
    await fs.mkdir(path.join(HOME_DIR, "plugins"), { recursive: true });
    await fs.mkdir(path.join(HOME_DIR, "logs"), { recursive: true });
    await fs.mkdir(path.join(HOME_DIR, "hooks"), { recursive: true });
    await fs.mkdir(path.join(HOME_DIR, "skills"), { recursive: true });
    await fs.mkdir(path.join(HOME_DIR, "commands"), { recursive: true });

    // Step 3: Copy files
    const filesToMigrate = [
      "config.json",
      "memory.db",
      ".claude-code-router.pid"
    ];

    for (const file of filesToMigrate) {
      const src = path.join(LEGACY_HOME_DIR, file);
      const dst = path.join(HOME_DIR, file);
      try {
        await fs.access(src);
        await fs.copyFile(src, dst);
        result.migrated.push(file);
        console.log(`[Migration] Copied: ${file}`);
      } catch {
        // File doesn't exist, skip
      }
    }

    // Step 4: Copy directories
    const dirsToCopy = ["plugins", "logs"];
    for (const dir of dirsToCopy) {
      const src = path.join(LEGACY_HOME_DIR, dir);
      const dst = path.join(HOME_DIR, dir);
      try {
        await fs.access(src);
        const entries = await fs.readdir(src);
        if (entries.length > 0) {
          await fs.cp(src, dst, { recursive: true });
          result.migrated.push(`${dir}/`);
          console.log(`[Migration] Copied directory: ${dir}/`);
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }

    result.success = true;
    console.log(`[Migration] Complete! Migrated ${result.migrated.length} items.`);

  } catch (error: any) {
    result.errors.push(error.message);
    console.error(`[Migration] Failed:`, error.message);
  }

  return result;
}

/**
 * Check if migration is needed and perform it automatically
 */
export async function checkAndMigrate(): Promise<boolean> {
  const hasLegacy = await detectLegacyConfig();
  const hasNew = await detectNewConfig();

  if (hasNew) {
    // Already using new location
    return false;
  }

  if (!hasLegacy) {
    // Fresh install, no migration needed
    return false;
  }

  // Need to migrate
  console.log(`\n[CCR] Found legacy config at ${LEGACY_HOME_DIR}`);
  console.log(`[CCR] Migrating to new location: ${HOME_DIR}\n`);

  const result = await migrateFromLegacy();

  if (result.success) {
    console.log(`\n[CCR] Migration successful!`);
    console.log(`[CCR] Backup saved at: ${result.backupPath}`);
    console.log(`[CCR] You can delete the old directory when ready.\n`);
  }

  return result.success;
}
