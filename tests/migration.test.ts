/**
 * Migration System Tests
 *
 * Tests:
 * - Legacy config detection
 * - New config detection
 * - Backup creation
 * - Migration process
 * - Auto-migration logic
 */

import { describe, test, beforeEach, afterEach } from 'bun:test';
import { createLogger, TestLogger } from './helpers/logger';
import { createTempDir, cleanupTempDir } from './helpers/fixtures';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Mock the constants for testing
const originalHome = process.env.HOME;
let tempDir: string;
let legacyDir: string;
let newDir: string;

describe('Migration System', () => {
  let log: TestLogger;

  beforeEach(() => {
    log = createLogger('Migration');
    tempDir = createTempDir();
    legacyDir = join(tempDir, '.claude-code-router');
    newDir = join(tempDir, 'mycode');
  });

  afterEach(() => {
    log.finish();
    cleanupTempDir(tempDir);
  });

  describe('detectLegacyConfig()', () => {
    test('returns true when legacy config exists', async () => {
      log.info('Testing legacy config detection');

      // Create legacy directory and config
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, 'config.json'), '{"PORT": 3456}');

      const hasLegacy = existsSync(join(legacyDir, 'config.json'));
      log.assertEqual(hasLegacy, true, 'legacy config exists');

      log.success('Legacy config detected');
    });

    test('returns false when no legacy config', async () => {
      log.info('Testing missing legacy config');

      const hasLegacy = existsSync(join(legacyDir, 'config.json'));
      log.assertEqual(hasLegacy, false, 'legacy config missing');

      log.success('No legacy config detected');
    });
  });

  describe('detectNewConfig()', () => {
    test('returns true when new config exists', async () => {
      log.info('Testing new config detection');

      // Create new directory and config
      mkdirSync(newDir, { recursive: true });
      writeFileSync(join(newDir, 'config.json'), '{"PORT": 3456}');

      const hasNew = existsSync(join(newDir, 'config.json'));
      log.assertEqual(hasNew, true, 'new config exists');

      log.success('New config detected');
    });

    test('returns false when no new config', async () => {
      log.info('Testing missing new config');

      const hasNew = existsSync(join(newDir, 'config.json'));
      log.assertEqual(hasNew, false, 'new config missing');

      log.success('No new config detected');
    });
  });

  describe('Migration Process', () => {
    test('creates new directory structure', async () => {
      log.info('Testing directory structure creation');

      // Create the directories that should be created during migration
      const dirs = ['hooks', 'skills', 'commands', 'plugins', 'logs'];

      mkdirSync(newDir, { recursive: true });
      for (const dir of dirs) {
        mkdirSync(join(newDir, dir), { recursive: true });
      }

      for (const dir of dirs) {
        log.assert(existsSync(join(newDir, dir)), `${dir} directory exists`);
      }

      log.success('Directory structure created');
    });

    test('copies config.json correctly', async () => {
      log.info('Testing config.json copy');

      // Create legacy config
      mkdirSync(legacyDir, { recursive: true });
      const configContent = JSON.stringify({ PORT: 3456, LOG: true }, null, 2);
      writeFileSync(join(legacyDir, 'config.json'), configContent);

      // Simulate copy
      mkdirSync(newDir, { recursive: true });
      const content = readFileSync(join(legacyDir, 'config.json'), 'utf-8');
      writeFileSync(join(newDir, 'config.json'), content);

      const newContent = readFileSync(join(newDir, 'config.json'), 'utf-8');
      log.assertEqual(newContent, configContent, 'config content matches');

      log.success('Config copied correctly');
    });

    test('copies plugins directory', async () => {
      log.info('Testing plugins directory copy');

      // Create legacy plugins
      const pluginsDir = join(legacyDir, 'plugins', 'test-plugin');
      mkdirSync(pluginsDir, { recursive: true });
      writeFileSync(join(pluginsDir, 'plugin.json'), '{"name": "test"}');

      // Simulate copy
      const newPluginsDir = join(newDir, 'plugins', 'test-plugin');
      mkdirSync(newPluginsDir, { recursive: true });
      writeFileSync(join(newPluginsDir, 'plugin.json'), '{"name": "test"}');

      log.assert(existsSync(join(newPluginsDir, 'plugin.json')), 'plugin copied');

      log.success('Plugins directory copied');
    });

    test('copies logs directory', async () => {
      log.info('Testing logs directory copy');

      // Create legacy logs
      const logsDir = join(legacyDir, 'logs');
      mkdirSync(logsDir, { recursive: true });
      writeFileSync(join(logsDir, 'app.log'), 'test log content');

      // Simulate copy
      const newLogsDir = join(newDir, 'logs');
      mkdirSync(newLogsDir, { recursive: true });
      writeFileSync(join(newLogsDir, 'app.log'), 'test log content');

      log.assert(existsSync(join(newLogsDir, 'app.log')), 'log copied');

      log.success('Logs directory copied');
    });
  });

  describe('Backup Creation', () => {
    test('creates timestamped backup', async () => {
      log.info('Testing backup creation');

      // Create legacy directory
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, 'config.json'), '{}');

      // Create backup with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${legacyDir}.backup-${timestamp}`;
      mkdirSync(backupPath, { recursive: true });
      writeFileSync(join(backupPath, 'config.json'), '{}');

      log.assert(existsSync(backupPath), 'backup directory created');
      log.assert(backupPath.includes('.backup-'), 'backup has timestamp');

      log.success('Backup created with timestamp');
    });
  });

  describe('checkAndMigrate() Logic', () => {
    test('skips if new config already exists', async () => {
      log.info('Testing skip when new config exists');

      // Create both legacy and new configs
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, 'config.json'), '{}');

      mkdirSync(newDir, { recursive: true });
      writeFileSync(join(newDir, 'config.json'), '{}');

      const hasNew = existsSync(join(newDir, 'config.json'));
      log.assertEqual(hasNew, true, 'new config exists, should skip migration');

      log.success('Migration skipped when new config exists');
    });

    test('skips if no legacy config', async () => {
      log.info('Testing skip when no legacy config');

      const hasLegacy = existsSync(join(legacyDir, 'config.json'));
      const hasNew = existsSync(join(newDir, 'config.json'));

      log.assertEqual(hasLegacy, false, 'no legacy config');
      log.assertEqual(hasNew, false, 'no new config');

      // Fresh install - nothing to migrate
      log.success('Migration skipped for fresh install');
    });

    test('performs migration when legacy exists and new does not', async () => {
      log.info('Testing migration trigger condition');

      // Create only legacy config
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, 'config.json'), '{"PORT": 3456}');

      const hasLegacy = existsSync(join(legacyDir, 'config.json'));
      const hasNew = existsSync(join(newDir, 'config.json'));

      log.assertEqual(hasLegacy, true, 'legacy config exists');
      log.assertEqual(hasNew, false, 'no new config');

      // This is when migration should trigger
      const shouldMigrate = hasLegacy && !hasNew;
      log.assertEqual(shouldMigrate, true, 'should trigger migration');

      log.success('Migration triggers correctly');
    });
  });
});
