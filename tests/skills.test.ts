/**
 * Skills System Tests
 *
 * Tests:
 * - SkillsManager registration
 * - Trigger matching
 * - Skill execution
 * - Singleton pattern
 */

import { describe, test, beforeEach, afterEach } from 'bun:test';
import { createLogger, TestLogger } from './helpers/logger';
import { createTempDir, cleanupTempDir } from './helpers/fixtures';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  SkillsManager,
  initSkillsManager,
  getSkillsManager,
  hasSkillsManager,
} from '../src/skills';
import type { SkillDefinition } from '../src/plugins/types';

describe('Skills System', () => {
  let log: TestLogger;
  let skillsManager: SkillsManager;
  let tempDir: string;

  beforeEach(() => {
    log = createLogger('Skills');
    tempDir = createTempDir();
    skillsManager = new SkillsManager();
  });

  afterEach(() => {
    log.finish();
    cleanupTempDir(tempDir);
  });

  describe('Skill Registration', () => {
    test('registers skills correctly', () => {
      log.info('Testing skill registration');

      const skill: SkillDefinition = {
        name: 'test-skill',
        description: 'A test skill',
        trigger: '/test',
        handler: 'test.js',
      };

      skillsManager.registerSkill(skill);

      const all = skillsManager.getAllSkills();
      log.assertEqual(all.length, 1, 'skill count');
      log.assertEqual(all[0].name, 'test-skill', 'skill name');

      log.success('Skill registered correctly');
    });

    test('unregisters skills by name', () => {
      log.info('Testing skill unregistration');

      skillsManager.registerSkill({
        name: 'to-remove',
        description: 'Will be removed',
        trigger: '/remove',
        handler: 'remove.js',
      });

      skillsManager.registerSkill({
        name: 'to-keep',
        description: 'Will stay',
        trigger: '/keep',
        handler: 'keep.js',
      });

      skillsManager.unregisterSkill('to-remove');

      const all = skillsManager.getAllSkills();
      log.assertEqual(all.length, 1, 'skill count');
      log.assertEqual(all[0].name, 'to-keep', 'remaining skill');

      log.success('Skill unregistered');
    });
  });

  describe('findSkillByTrigger()', () => {
    test('matches string triggers', () => {
      log.info('Testing string trigger matching');

      skillsManager.registerSkill({
        name: 'commit-skill',
        description: 'Commit changes',
        trigger: '/commit',
        handler: 'commit.js',
      });

      const found = skillsManager.findSkillByTrigger('/commit');
      log.assertDefined(found, 'skill found');
      log.assertEqual(found!.name, 'commit-skill', 'correct skill');

      // Should also match with arguments
      const withArgs = skillsManager.findSkillByTrigger('/commit -m "message"');
      log.assertDefined(withArgs, 'skill found with args');

      log.success('String trigger matching works');
    });

    test('matches regex triggers', () => {
      log.info('Testing regex trigger matching');

      skillsManager.registerSkill({
        name: 'pr-skill',
        description: 'Review PR',
        trigger: /^\/review-pr\s+\d+$/,
        handler: 'pr.js',
      });

      const found = skillsManager.findSkillByTrigger('/review-pr 123');
      log.assertDefined(found, 'skill found');
      log.assertEqual(found!.name, 'pr-skill', 'correct skill');

      // Should not match invalid format
      const notFound = skillsManager.findSkillByTrigger('/review-pr abc');
      log.assertEqual(notFound, undefined, 'no match for invalid format');

      log.success('Regex trigger matching works');
    });

    test('returns undefined for no match', () => {
      log.info('Testing no match');

      skillsManager.registerSkill({
        name: 'specific-skill',
        description: 'Specific trigger',
        trigger: '/specific',
        handler: 'specific.js',
      });

      const notFound = skillsManager.findSkillByTrigger('/different');
      log.assertEqual(notFound, undefined, 'no match');

      log.success('No match returns undefined');
    });
  });

  describe('executeSkill()', () => {
    test('returns error for missing skill', async () => {
      log.info('Testing missing skill execution');

      const result = await skillsManager.executeSkill('nonexistent', {
        args: {},
        request: {},
        config: {},
      });

      log.assertEqual(result.success, false, 'execution failed');
      log.assert(result.output.includes('not found'), 'error message');

      log.success('Missing skill handled');
    });
  });

  describe('getAllSkills()', () => {
    test('returns all registered skills', () => {
      log.info('Testing getAllSkills');

      skillsManager.registerSkill({
        name: 'skill-1',
        description: 'First',
        trigger: '/first',
        handler: 'first.js',
      });

      skillsManager.registerSkill({
        name: 'skill-2',
        description: 'Second',
        trigger: '/second',
        handler: 'second.js',
      });

      const all = skillsManager.getAllSkills();
      log.assertEqual(all.length, 2, 'skill count');

      const names = all.map(s => s.name);
      log.assert(names.includes('skill-1'), 'has skill-1');
      log.assert(names.includes('skill-2'), 'has skill-2');

      log.success('All skills returned');
    });
  });

  describe('Singleton Pattern', () => {
    test('initSkillsManager creates singleton', () => {
      log.info('Testing singleton creation');

      const manager = initSkillsManager();
      log.assertDefined(manager, 'manager');
      log.assertEqual(hasSkillsManager(), true, 'has manager');

      log.success('Singleton created');
    });

    test('getSkillsManager returns singleton', () => {
      log.info('Testing singleton retrieval');

      initSkillsManager();
      const manager = getSkillsManager();
      log.assertDefined(manager, 'manager');

      log.success('Singleton retrieved');
    });

    test('hasSkillsManager returns correct state', () => {
      log.info('Testing hasSkillsManager');

      initSkillsManager();
      log.assertEqual(hasSkillsManager(), true, 'has manager after init');

      log.success('hasSkillsManager works correctly');
    });
  });
});
