/**
 * Hooks System Tests
 *
 * Tests:
 * - HooksManager registration
 * - Priority ordering
 * - Hook execution
 * - Timeout handling
 * - Singleton pattern
 */

import { describe, test, beforeEach, afterEach } from 'bun:test';
import { createLogger, TestLogger } from './helpers/logger';
import { createTempDir, cleanupTempDir } from './helpers/fixtures';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  HooksManager,
  initHooksManager,
  getHooksManager,
  hasHooksManager,
} from '../src/hooks';
import type { HookDefinition, HookEvent, HookContext, HookResult } from '../src/hooks/types';

describe('Hooks System', () => {
  let log: TestLogger;
  let hooksManager: HooksManager;
  let tempDir: string;

  beforeEach(() => {
    log = createLogger('Hooks');
    tempDir = createTempDir();
    hooksManager = new HooksManager({ enabled: true });
  });

  afterEach(() => {
    log.finish();
    cleanupTempDir(tempDir);
  });

  describe('Hook Registration', () => {
    test('registers hooks correctly', () => {
      log.info('Testing hook registration');

      const hook: HookDefinition = {
        name: 'test-hook',
        event: 'PreRoute',
        handler: async () => ({ continue: true }),
      };

      hooksManager.registerHook(hook);

      const hooks = hooksManager.getHooksForEvent('PreRoute');
      log.assertEqual(hooks.length, 1, 'hook count');
      log.assertEqual(hooks[0].name, 'test-hook', 'hook name');

      log.success('Hook registered correctly');
    });

    test('registers hooks for multiple events', () => {
      log.info('Testing multi-event hook registration');

      const hook: HookDefinition = {
        name: 'multi-event-hook',
        event: ['PreRoute', 'PostRoute'],
        handler: async () => ({ continue: true }),
      };

      hooksManager.registerHook(hook);

      log.assertEqual(hooksManager.getHooksForEvent('PreRoute').length, 1, 'PreRoute hooks');
      log.assertEqual(hooksManager.getHooksForEvent('PostRoute').length, 1, 'PostRoute hooks');

      log.success('Multi-event hook registered');
    });

    test('sorts hooks by priority (higher first)', () => {
      log.info('Testing priority sorting');

      hooksManager.registerHook({
        name: 'low-priority',
        event: 'PreRoute',
        priority: 1,
        handler: async () => ({ continue: true }),
      });

      hooksManager.registerHook({
        name: 'high-priority',
        event: 'PreRoute',
        priority: 10,
        handler: async () => ({ continue: true }),
      });

      hooksManager.registerHook({
        name: 'medium-priority',
        event: 'PreRoute',
        priority: 5,
        handler: async () => ({ continue: true }),
      });

      const hooks = hooksManager.getHooksForEvent('PreRoute');
      log.assertEqual(hooks[0].name, 'high-priority', 'first hook');
      log.assertEqual(hooks[1].name, 'medium-priority', 'second hook');
      log.assertEqual(hooks[2].name, 'low-priority', 'third hook');

      log.success('Hooks sorted by priority');
    });

    test('unregisters hooks by name', () => {
      log.info('Testing hook unregistration');

      hooksManager.registerHook({
        name: 'to-remove',
        event: 'PreRoute',
        handler: async () => ({ continue: true }),
      });

      hooksManager.registerHook({
        name: 'to-keep',
        event: 'PreRoute',
        handler: async () => ({ continue: true }),
      });

      hooksManager.unregisterHook('to-remove');

      const hooks = hooksManager.getHooksForEvent('PreRoute');
      log.assertEqual(hooks.length, 1, 'hook count');
      log.assertEqual(hooks[0].name, 'to-keep', 'remaining hook');

      log.success('Hook unregistered');
    });

    test('unregisters multi-event hooks correctly from all events', () => {
      log.info('Testing multi-event hook unregistration');

      // Register a hook for multiple events
      hooksManager.registerHook({
        name: 'multi-event-to-remove',
        event: ['PreRoute', 'PostRoute', 'PreToolUse'],
        handler: async () => ({ continue: true }),
      });

      // Register another hook to ensure we don't break other hooks
      hooksManager.registerHook({
        name: 'single-event-keep',
        event: 'PreRoute',
        handler: async () => ({ continue: true }),
      });

      // Verify hooks are registered in all events
      log.assertEqual(hooksManager.getHooksForEvent('PreRoute').length, 2, 'PreRoute hooks before');
      log.assertEqual(hooksManager.getHooksForEvent('PostRoute').length, 1, 'PostRoute hooks before');
      log.assertEqual(hooksManager.getHooksForEvent('PreToolUse').length, 1, 'PreToolUse hooks before');

      // Unregister the multi-event hook
      hooksManager.unregisterHook('multi-event-to-remove');

      // Verify hook is removed from all events
      const preRouteHooks = hooksManager.getHooksForEvent('PreRoute');
      const postRouteHooks = hooksManager.getHooksForEvent('PostRoute');
      const preToolUseHooks = hooksManager.getHooksForEvent('PreToolUse');

      log.assertEqual(preRouteHooks.length, 1, 'PreRoute hooks after');
      log.assertEqual(preRouteHooks[0].name, 'single-event-keep', 'remaining PreRoute hook');
      log.assertEqual(postRouteHooks.length, 0, 'PostRoute hooks after');
      log.assertEqual(preToolUseHooks.length, 0, 'PreToolUse hooks after');

      log.success('Multi-event hook unregistered from all events');
    });
  });

  describe('Hook Execution', () => {
    test('executes hooks in priority order', async () => {
      log.info('Testing execution order');

      const executionOrder: string[] = [];

      hooksManager.registerHook({
        name: 'first',
        event: 'PreRoute',
        priority: 10,
        handler: async () => {
          executionOrder.push('first');
          return { continue: true };
        },
      });

      hooksManager.registerHook({
        name: 'second',
        event: 'PreRoute',
        priority: 5,
        handler: async () => {
          executionOrder.push('second');
          return { continue: true };
        },
      });

      await hooksManager.executeHooks('PreRoute', { config: {} });

      log.assertEqual(executionOrder[0], 'first', 'first execution');
      log.assertEqual(executionOrder[1], 'second', 'second execution');

      log.success('Hooks executed in order');
    });

    test('respects enabled flag', async () => {
      log.info('Testing enabled flag');

      let executed = false;

      hooksManager.registerHook({
        name: 'disabled-hook',
        event: 'PreRoute',
        enabled: false,
        handler: async () => {
          executed = true;
          return { continue: true };
        },
      });

      await hooksManager.executeHooks('PreRoute', { config: {} });

      log.assertEqual(executed, false, 'hook not executed');

      log.success('Disabled hook not executed');
    });

    test('blocks execution when hook returns continue:false', async () => {
      log.info('Testing execution blocking');

      let secondExecuted = false;

      hooksManager.registerHook({
        name: 'blocker',
        event: 'PreRoute',
        priority: 10,
        handler: async () => ({ continue: false }),
      });

      hooksManager.registerHook({
        name: 'blocked',
        event: 'PreRoute',
        priority: 5,
        handler: async () => {
          secondExecuted = true;
          return { continue: true };
        },
      });

      const result = await hooksManager.executeHooks('PreRoute', { config: {} });

      log.assertEqual(result.continue, false, 'execution blocked');
      log.assertEqual(secondExecuted, false, 'second hook not executed');

      log.success('Execution blocked correctly');
    });

    test('continues on hook failure (non-blocking)', async () => {
      log.info('Testing non-blocking failure');

      let secondExecuted = false;

      hooksManager.registerHook({
        name: 'failer',
        event: 'PreRoute',
        priority: 10,
        handler: async () => {
          throw new Error('Hook failed');
        },
      });

      hooksManager.registerHook({
        name: 'survivor',
        event: 'PreRoute',
        priority: 5,
        handler: async () => {
          secondExecuted = true;
          return { continue: true };
        },
      });

      const result = await hooksManager.executeHooks('PreRoute', { config: {} });

      log.assertEqual(result.continue, true, 'execution continued');
      log.assertEqual(secondExecuted, true, 'second hook executed');

      log.success('Failure handled gracefully');
    });

    test('applies modifications from hooks', async () => {
      log.info('Testing hook modifications');

      hooksManager.registerHook({
        name: 'modifier',
        event: 'PreRoute',
        handler: async (ctx) => ({
          continue: true,
          modified: { ...ctx.request, modified: true },
        }),
      });

      const result = await hooksManager.executeHooks('PreRoute', {
        config: {},
        request: { original: true },
      });

      log.assertEqual(result.continue, true, 'execution continued');

      log.success('Modifications applied');
    });
  });

  describe('Timeout Handling', () => {
    test('handles hook timeout', async () => {
      log.info('Testing timeout handling');

      const shortTimeoutManager = new HooksManager({ enabled: true, timeout: 100 });

      shortTimeoutManager.registerHook({
        name: 'slow-hook',
        event: 'PreRoute',
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 500));
          return { continue: true };
        },
      });

      let fastExecuted = false;
      shortTimeoutManager.registerHook({
        name: 'fast-hook',
        event: 'PreRoute',
        priority: -1, // Run after slow hook
        handler: async () => {
          fastExecuted = true;
          return { continue: true };
        },
      });

      const result = await shortTimeoutManager.executeHooks('PreRoute', { config: {} });

      // Should continue despite timeout
      log.assertEqual(result.continue, true, 'execution continued');
      log.assertEqual(fastExecuted, true, 'fast hook still executed');

      log.success('Timeout handled gracefully');
    });
  });

  describe('getAllHooks()', () => {
    test('returns all unique hooks', () => {
      log.info('Testing getAllHooks');

      hooksManager.registerHook({
        name: 'hook1',
        event: 'PreRoute',
        handler: async () => ({ continue: true }),
      });

      hooksManager.registerHook({
        name: 'hook2',
        event: 'PostRoute',
        handler: async () => ({ continue: true }),
      });

      hooksManager.registerHook({
        name: 'hook3',
        event: ['PreRoute', 'PostRoute'],
        handler: async () => ({ continue: true }),
      });

      const all = hooksManager.getAllHooks();
      log.assertEqual(all.length, 3, 'unique hook count');

      log.success('All hooks returned');
    });
  });

  describe('Singleton Pattern', () => {
    test('initHooksManager creates singleton', () => {
      log.info('Testing singleton creation');

      const manager = initHooksManager({ enabled: true });
      log.assertDefined(manager, 'manager');
      log.assertEqual(hasHooksManager(), true, 'has manager');

      log.success('Singleton created');
    });

    test('getHooksManager returns singleton', () => {
      log.info('Testing singleton retrieval');

      initHooksManager({ enabled: true });
      const manager = getHooksManager();
      log.assertDefined(manager, 'manager');

      log.success('Singleton retrieved');
    });

    test('hasHooksManager returns correct state', () => {
      log.info('Testing hasHooksManager');

      // After init, should return true
      initHooksManager({ enabled: true });
      log.assertEqual(hasHooksManager(), true, 'has manager after init');

      log.success('hasHooksManager works correctly');
    });
  });
});
