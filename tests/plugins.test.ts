/**
 * Plugins System Tests
 *
 * Tests:
 * - PluginManager loading
 * - Plugin enable/disable
 * - Skills and commands aggregation
 * - Singleton pattern
 */

import { describe, test, beforeEach, afterEach } from 'bun:test';
import { createLogger, TestLogger } from './helpers/logger';
import { createTempDir, cleanupTempDir } from './helpers/fixtures';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  PluginManager,
  initPluginManager,
  getPluginManager,
  hasPluginManager,
} from '../src/plugins';
import type { PluginManifest } from '../src/plugins/types';

describe('Plugins System', () => {
  let log: TestLogger;
  let pluginManager: PluginManager;
  let tempDir: string;

  beforeEach(() => {
    log = createLogger('Plugins');
    tempDir = createTempDir();
    pluginManager = new PluginManager({ enabled: true, autoload: false });
  });

  afterEach(() => {
    log.finish();
    cleanupTempDir(tempDir);
  });

  describe('Plugin Loading', () => {
    test('loads plugin from .claude-plugin/plugin.json', async () => {
      log.info('Testing plugin loading');

      // Create test plugin structure
      const pluginDir = join(tempDir, 'test-plugin');
      const manifestDir = join(pluginDir, '.claude-plugin');
      mkdirSync(manifestDir, { recursive: true });

      const manifest: PluginManifest = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'A test plugin',
        hooks: [],
        skills: [],
        commands: [],
      };

      writeFileSync(join(manifestDir, 'plugin.json'), JSON.stringify(manifest, null, 2));

      const plugin = await pluginManager.loadPlugin(pluginDir);

      log.assertDefined(plugin, 'plugin loaded');
      log.assertEqual(plugin!.manifest.name, 'test-plugin', 'plugin name');
      log.assertEqual(plugin!.manifest.version, '1.0.0', 'plugin version');
      log.assertEqual(plugin!.enabled, true, 'plugin enabled');

      log.success('Plugin loaded correctly');
    });

    test('skips disabled plugins', async () => {
      log.info('Testing disabled plugin skip');

      const disabledManager = new PluginManager({
        enabled: true,
        disabled: ['disabled-plugin'],
      });

      // Create test plugin
      const pluginDir = join(tempDir, 'disabled-plugin');
      const manifestDir = join(pluginDir, '.claude-plugin');
      mkdirSync(manifestDir, { recursive: true });

      writeFileSync(join(manifestDir, 'plugin.json'), JSON.stringify({
        name: 'disabled-plugin',
        version: '1.0.0',
      }, null, 2));

      const plugin = await disabledManager.loadPlugin(pluginDir);

      log.assertEqual(plugin, null, 'plugin not loaded');

      log.success('Disabled plugin skipped');
    });

    test('returns null for invalid plugin directory', async () => {
      log.info('Testing invalid plugin handling');

      const plugin = await pluginManager.loadPlugin(join(tempDir, 'nonexistent'));

      log.assertEqual(plugin, null, 'returns null');

      log.success('Invalid plugin handled');
    });
  });

  describe('Enable/Disable', () => {
    test('enables plugin', async () => {
      log.info('Testing plugin enable');

      // Create and load plugin
      const pluginDir = join(tempDir, 'enable-test');
      const manifestDir = join(pluginDir, '.claude-plugin');
      mkdirSync(manifestDir, { recursive: true });

      writeFileSync(join(manifestDir, 'plugin.json'), JSON.stringify({
        name: 'enable-test',
        version: '1.0.0',
      }, null, 2));

      await pluginManager.loadPlugin(pluginDir);

      const plugin = pluginManager.getPlugin('enable-test');
      log.assertDefined(plugin, 'plugin exists');

      // Disable and then enable
      pluginManager.disablePlugin('enable-test');
      log.assertEqual(plugin!.enabled, false, 'disabled');

      const result = pluginManager.enablePlugin('enable-test');
      log.assertEqual(result, true, 'enable succeeded');
      log.assertEqual(plugin!.enabled, true, 'enabled');

      log.success('Plugin enabled');
    });

    test('disables plugin', async () => {
      log.info('Testing plugin disable');

      // Create and load plugin
      const pluginDir = join(tempDir, 'disable-test');
      const manifestDir = join(pluginDir, '.claude-plugin');
      mkdirSync(manifestDir, { recursive: true });

      writeFileSync(join(manifestDir, 'plugin.json'), JSON.stringify({
        name: 'disable-test',
        version: '1.0.0',
      }, null, 2));

      await pluginManager.loadPlugin(pluginDir);

      const result = pluginManager.disablePlugin('disable-test');
      log.assertEqual(result, true, 'disable succeeded');

      const plugin = pluginManager.getPlugin('disable-test');
      log.assertEqual(plugin!.enabled, false, 'disabled');

      log.success('Plugin disabled');
    });

    test('returns false for nonexistent plugin', () => {
      log.info('Testing enable/disable nonexistent');

      log.assertEqual(pluginManager.enablePlugin('nonexistent'), false, 'enable returns false');
      log.assertEqual(pluginManager.disablePlugin('nonexistent'), false, 'disable returns false');

      log.success('Nonexistent plugin handled');
    });
  });

  describe('getAllPlugins()', () => {
    test('returns all loaded plugins', async () => {
      log.info('Testing getAllPlugins');

      // Create two plugins
      for (const name of ['plugin-a', 'plugin-b']) {
        const pluginDir = join(tempDir, name);
        const manifestDir = join(pluginDir, '.claude-plugin');
        mkdirSync(manifestDir, { recursive: true });

        writeFileSync(join(manifestDir, 'plugin.json'), JSON.stringify({
          name,
          version: '1.0.0',
        }, null, 2));

        await pluginManager.loadPlugin(pluginDir);
      }

      const all = pluginManager.getAllPlugins();
      log.assertEqual(all.length, 2, 'plugin count');

      log.success('All plugins returned');
    });
  });

  describe('getAllSkills()', () => {
    test('returns skills from enabled plugins only', async () => {
      log.info('Testing getAllSkills');

      // Create plugin with skills
      const pluginDir = join(tempDir, 'skills-plugin');
      const manifestDir = join(pluginDir, '.claude-plugin');
      mkdirSync(manifestDir, { recursive: true });

      writeFileSync(join(manifestDir, 'plugin.json'), JSON.stringify({
        name: 'skills-plugin',
        version: '1.0.0',
        skills: [
          { name: 'test-skill', description: 'Test', trigger: '/test', handler: 'test.js' },
        ],
      }, null, 2));

      await pluginManager.loadPlugin(pluginDir);

      let skills = pluginManager.getAllSkills();
      log.assertEqual(skills.length, 1, 'skill from enabled plugin');

      // Disable plugin
      pluginManager.disablePlugin('skills-plugin');
      skills = pluginManager.getAllSkills();
      log.assertEqual(skills.length, 0, 'no skills from disabled plugin');

      log.success('Skills aggregation works');
    });
  });

  describe('getAllCommands()', () => {
    test('returns commands from enabled plugins only', async () => {
      log.info('Testing getAllCommands');

      // Create plugin with commands
      const pluginDir = join(tempDir, 'commands-plugin');
      const manifestDir = join(pluginDir, '.claude-plugin');
      mkdirSync(manifestDir, { recursive: true });

      writeFileSync(join(manifestDir, 'plugin.json'), JSON.stringify({
        name: 'commands-plugin',
        version: '1.0.0',
        commands: [
          { name: 'test-cmd', description: 'Test', handler: 'test.js' },
        ],
      }, null, 2));

      await pluginManager.loadPlugin(pluginDir);

      let commands = pluginManager.getAllCommands();
      log.assertEqual(commands.length, 1, 'command from enabled plugin');

      // Disable plugin
      pluginManager.disablePlugin('commands-plugin');
      commands = pluginManager.getAllCommands();
      log.assertEqual(commands.length, 0, 'no commands from disabled plugin');

      log.success('Commands aggregation works');
    });
  });

  describe('loadAllPlugins()', () => {
    test('loads all plugins from directory', async () => {
      log.info('Testing loadAllPlugins');

      // Create plugins directory with multiple plugins
      const pluginsDir = join(tempDir, 'plugins');
      mkdirSync(pluginsDir, { recursive: true });

      for (const name of ['alpha', 'beta']) {
        const pluginDir = join(pluginsDir, name);
        const manifestDir = join(pluginDir, '.claude-plugin');
        mkdirSync(manifestDir, { recursive: true });

        writeFileSync(join(manifestDir, 'plugin.json'), JSON.stringify({
          name,
          version: '1.0.0',
        }, null, 2));
      }

      await pluginManager.loadAllPlugins(pluginsDir);

      const all = pluginManager.getAllPlugins();
      log.assertEqual(all.length, 2, 'all plugins loaded');

      log.success('All plugins loaded from directory');
    });
  });

  describe('validateDependencies()', () => {
    test('returns empty array when all dependencies are met', async () => {
      log.info('Testing valid dependencies');

      // Create two plugins where one depends on the other
      const pluginsDir = join(tempDir, 'valid-deps');
      mkdirSync(pluginsDir, { recursive: true });

      // Create base plugin
      const baseDir = join(pluginsDir, 'base-plugin');
      const baseManifestDir = join(baseDir, '.claude-plugin');
      mkdirSync(baseManifestDir, { recursive: true });
      writeFileSync(join(baseManifestDir, 'plugin.json'), JSON.stringify({
        name: 'base-plugin',
        version: '1.0.0',
      }, null, 2));

      // Create dependent plugin
      const depDir = join(pluginsDir, 'dependent-plugin');
      const depManifestDir = join(depDir, '.claude-plugin');
      mkdirSync(depManifestDir, { recursive: true });
      writeFileSync(join(depManifestDir, 'plugin.json'), JSON.stringify({
        name: 'dependent-plugin',
        version: '1.0.0',
        dependencies: ['base-plugin'],
      }, null, 2));

      await pluginManager.loadPlugin(baseDir);
      await pluginManager.loadPlugin(depDir);

      const missing = pluginManager.validateDependencies();
      log.assertEqual(missing.length, 0, 'no missing dependencies');

      log.success('Valid dependencies checked');
    });

    test('returns missing dependencies', async () => {
      log.info('Testing missing dependencies');

      // Create plugin with missing dependency
      const pluginDir = join(tempDir, 'missing-dep');
      const manifestDir = join(pluginDir, '.claude-plugin');
      mkdirSync(manifestDir, { recursive: true });
      writeFileSync(join(manifestDir, 'plugin.json'), JSON.stringify({
        name: 'orphan-plugin',
        version: '1.0.0',
        dependencies: ['nonexistent-plugin'],
      }, null, 2));

      await pluginManager.loadPlugin(pluginDir);

      const missing = pluginManager.validateDependencies();
      log.assertEqual(missing.length, 1, 'one missing dependency');
      log.assert(missing[0].includes('orphan-plugin'), 'mentions orphan plugin');
      log.assert(missing[0].includes('nonexistent-plugin'), 'mentions missing dependency');

      log.success('Missing dependencies detected');
    });
  });

  describe('Singleton Pattern', () => {
    test('initPluginManager creates singleton', () => {
      log.info('Testing singleton creation');

      const manager = initPluginManager({ enabled: true });
      log.assertDefined(manager, 'manager');
      log.assertEqual(hasPluginManager(), true, 'has manager');

      log.success('Singleton created');
    });

    test('getPluginManager returns singleton', () => {
      log.info('Testing singleton retrieval');

      initPluginManager({ enabled: true });
      const manager = getPluginManager();
      log.assertDefined(manager, 'manager');

      log.success('Singleton retrieved');
    });

    test('hasPluginManager returns correct state', () => {
      log.info('Testing hasPluginManager');

      initPluginManager({ enabled: true });
      log.assertEqual(hasPluginManager(), true, 'has manager after init');

      log.success('hasPluginManager works correctly');
    });
  });
});
