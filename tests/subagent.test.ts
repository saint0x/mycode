/**
 * Sub-Agent System Tests
 *
 * Tests:
 * - Types and configurations
 * - SubAgentAgent - shouldHandle, reqHandler
 * - Tool filtering
 * - System prompt building
 * - Depth tracking
 */

import { describe, test, beforeEach, afterEach } from 'bun:test';
import { createLogger, TestLogger } from './helpers/logger';
import {
  SubAgentAgent,
  subAgentAgent,
  SUBAGENT_CONFIGS,
  getSubAgentConfig,
  SUBAGENT_DEPTH_HEADER,
  SUBAGENT_ID_HEADER,
} from '../src/subagent';
import { buildSubAgentSystemPrompt, filterToolsForSubAgent } from '../src/subagent/configs';
import type { SubAgentType, SubAgentSystemConfig } from '../src/subagent/types';

describe('Sub-Agent System', () => {
  let log: TestLogger;

  beforeEach(() => {
    log = createLogger('SubAgent');
  });

  afterEach(() => {
    log.finish();
  });

  describe('Configurations', () => {
    test('all agent types have configurations', () => {
      log.info('Testing configuration completeness');

      const types: SubAgentType[] = ['research', 'code', 'review', 'custom'];

      for (const type of types) {
        const config = getSubAgentConfig(type);
        log.assertDefined(config, `config for ${type}`);
        log.assertEqual(config.type, type, `type matches for ${type}`);
        log.assertDefined(config.systemPrompt, `systemPrompt for ${type}`);
        log.assertGreaterThan(config.maxTokens, 0, `maxTokens for ${type}`);
      }

      log.success('All agent types have configurations');
    });

    test('research config has correct tool restrictions', () => {
      log.info('Testing research config tool restrictions');

      const config = SUBAGENT_CONFIGS.research;

      log.assertDefined(config.allowedTools, 'allowedTools');
      log.assertDefined(config.disallowedTools, 'disallowedTools');

      // Research should allow read tools
      log.assert(config.allowedTools!.includes('Read'), 'should allow Read');
      log.assert(config.allowedTools!.includes('Glob'), 'should allow Glob');
      log.assert(config.allowedTools!.includes('Grep'), 'should allow Grep');

      // Research should not allow write tools
      log.assert(config.disallowedTools!.includes('Write'), 'should disallow Write');
      log.assert(config.disallowedTools!.includes('Edit'), 'should disallow Edit');
      log.assert(config.disallowedTools!.includes('Bash'), 'should disallow Bash');

      log.success('Research config has correct restrictions');
    });

    test('code config allows write tools', () => {
      log.info('Testing code config tool permissions');

      const config = SUBAGENT_CONFIGS.code;

      log.assertDefined(config.allowedTools, 'allowedTools');
      log.assert(config.allowedTools!.includes('Write'), 'should allow Write');
      log.assert(config.allowedTools!.includes('Edit'), 'should allow Edit');
      log.assert(config.allowedTools!.includes('Bash'), 'should allow Bash');

      log.success('Code config allows write tools');
    });

    test('review config is read-only', () => {
      log.info('Testing review config is read-only');

      const config = SUBAGENT_CONFIGS.review;

      log.assertDefined(config.disallowedTools, 'disallowedTools');
      log.assert(config.disallowedTools!.includes('Write'), 'should disallow Write');
      log.assert(config.disallowedTools!.includes('Edit'), 'should disallow Edit');
      log.assert(config.disallowedTools!.includes('Bash'), 'should disallow Bash');

      log.success('Review config is read-only');
    });

    test('custom config has no tool restrictions', () => {
      log.info('Testing custom config flexibility');

      const config = SUBAGENT_CONFIGS.custom;

      log.assert(
        !config.allowedTools || config.allowedTools.length === 0,
        'should not have allowedTools restrictions'
      );
      log.assert(
        !config.disallowedTools || config.disallowedTools.length === 0,
        'should not have disallowedTools restrictions'
      );

      log.success('Custom config has no restrictions');
    });
  });

  describe('Tool Filtering', () => {
    const sampleTools = [
      { name: 'Read' },
      { name: 'Write' },
      { name: 'Edit' },
      { name: 'Glob' },
      { name: 'Grep' },
      { name: 'Bash' },
      { name: 'LSP' },
      { name: 'WebSearch' },
    ];

    test('filters tools based on allowedTools', () => {
      log.info('Testing allowedTools filtering');

      const config = SUBAGENT_CONFIGS.research;
      const filtered = filterToolsForSubAgent(sampleTools, config);

      log.info('Filtered tools', { tools: filtered.map(t => t.name) });

      // Should only include allowed tools
      for (const tool of filtered) {
        log.assert(
          config.allowedTools!.includes(tool.name),
          `${tool.name} should be in allowedTools`
        );
      }

      // Should not include disallowed tools
      const filteredNames = filtered.map(t => t.name);
      log.assert(!filteredNames.includes('Write'), 'should not include Write');
      log.assert(!filteredNames.includes('Edit'), 'should not include Edit');

      log.success('allowedTools filtering works');
    });

    test('filters tools based on disallowedTools', () => {
      log.info('Testing disallowedTools filtering');

      const config = SUBAGENT_CONFIGS.review;
      const filtered = filterToolsForSubAgent(sampleTools, config);

      log.info('Filtered tools', { tools: filtered.map(t => t.name) });

      // Should not include disallowed tools
      const filteredNames = filtered.map(t => t.name);
      for (const disallowed of config.disallowedTools!) {
        log.assert(
          !filteredNames.includes(disallowed),
          `should not include ${disallowed}`
        );
      }

      log.success('disallowedTools filtering works');
    });

    test('returns all tools when no restrictions', () => {
      log.info('Testing no restriction filtering');

      const config = SUBAGENT_CONFIGS.custom;
      const filtered = filterToolsForSubAgent(sampleTools, config);

      log.assertEqual(filtered.length, sampleTools.length, 'tool count');

      log.success('All tools returned when no restrictions');
    });
  });

  describe('System Prompt Building', () => {
    test('builds prompt with task', () => {
      log.info('Testing prompt building with task');

      const config = SUBAGENT_CONFIGS.research;
      const task = 'Find all usages of the MemoryService class';

      const prompt = buildSubAgentSystemPrompt(config, task);

      log.assert(prompt.includes(config.systemPrompt), 'should include base system prompt');
      log.assert(prompt.includes(task), 'should include task');
      log.assert(prompt.includes('<task>'), 'should have task tags');

      log.success('Prompt built correctly with task');
    });

    test('includes additional context when provided', () => {
      log.info('Testing prompt with additional context');

      const config = SUBAGENT_CONFIGS.code;
      const task = 'Implement a new feature';
      const context = 'The project uses TypeScript and Bun runtime';

      const prompt = buildSubAgentSystemPrompt(config, task, context);

      log.assert(prompt.includes(context), 'should include additional context');
      log.assert(prompt.includes('<additional_context>'), 'should have context tags');

      log.success('Additional context included');
    });

    test('includes memory context when provided', () => {
      log.info('Testing prompt with memory context');

      const config = SUBAGENT_CONFIGS.research;
      const task = 'Analyze the codebase';
      const memoryContext = '<inherited_global_memory>User prefers TypeScript</inherited_global_memory>';

      const prompt = buildSubAgentSystemPrompt(config, task, undefined, memoryContext);

      log.assert(prompt.includes(memoryContext), 'should include memory context');
      log.assert(prompt.indexOf(memoryContext) < prompt.indexOf(config.systemPrompt),
        'memory context should come before system prompt');

      log.success('Memory context included and positioned correctly');
    });

    test('includes sub-agent awareness section', () => {
      log.info('Testing sub-agent awareness');

      const config = SUBAGENT_CONFIGS.code;
      const task = 'Write a function';

      const prompt = buildSubAgentSystemPrompt(config, task);

      log.assert(prompt.includes('<sub_agent_awareness>'), 'should have awareness section');
      log.assert(prompt.includes('sub-agent'), 'should mention sub-agent');
      log.assert(prompt.includes('cannot spawn additional sub-agents'), 'should mention no recursion');

      log.success('Sub-agent awareness section included');
    });
  });

  describe('SubAgentAgent', () => {
    test('has correct name', () => {
      log.info('Testing agent name');

      log.assertEqual(subAgentAgent.name, 'subagent', 'agent name');

      log.success('Agent name is correct');
    });

    test('has spawn_subagent tool', () => {
      log.info('Testing spawn_subagent tool');

      log.assert(subAgentAgent.tools.has('spawn_subagent'), 'should have spawn_subagent tool');

      const tool = subAgentAgent.tools.get('spawn_subagent');
      log.assertDefined(tool, 'tool');
      log.assertDefined(tool.input_schema, 'input_schema');
      log.assertDefined(tool.handler, 'handler');

      log.success('spawn_subagent tool exists');
    });

    test('tool has correct input schema', () => {
      log.info('Testing tool input schema');

      const tool = subAgentAgent.tools.get('spawn_subagent')!;
      const schema = tool.input_schema;

      log.assertEqual(schema.type, 'object', 'schema type');
      log.assertDefined(schema.properties.type, 'type property');
      log.assertDefined(schema.properties.task, 'task property');
      log.assertDefined(schema.properties.context, 'context property');
      log.assertDefined(schema.properties.streamProgress, 'streamProgress property');

      // Check required fields
      log.assert(schema.required.includes('type'), 'type should be required');
      log.assert(schema.required.includes('task'), 'task should be required');

      log.success('Tool input schema is correct');
    });
  });

  describe('shouldHandle()', () => {
    test('returns true when enabled and depth < maxDepth', () => {
      log.info('Testing shouldHandle with valid request');

      const req = {
        headers: {},
      };

      const config = {
        SubAgent: {
          enabled: true,
          maxDepth: 3,
        },
      };

      const result = subAgentAgent.shouldHandle(req, config);
      log.assertEqual(result, true, 'shouldHandle result');

      log.success('shouldHandle returns true for valid request');
    });

    test('returns false when disabled', () => {
      log.info('Testing shouldHandle when disabled');

      const req = {
        headers: {},
      };

      const config = {
        SubAgent: {
          enabled: false,
          maxDepth: 3,
        },
      };

      const result = subAgentAgent.shouldHandle(req, config);
      log.assertEqual(result, false, 'shouldHandle result');

      log.success('shouldHandle returns false when disabled');
    });

    test('returns false when at max depth', () => {
      log.info('Testing shouldHandle at max depth');

      const req = {
        headers: {
          [SUBAGENT_DEPTH_HEADER]: '3',
        },
      };

      const config = {
        SubAgent: {
          enabled: true,
          maxDepth: 3,
        },
      };

      const result = subAgentAgent.shouldHandle(req, config);
      log.assertEqual(result, false, 'shouldHandle result');

      log.success('shouldHandle returns false at max depth');
    });

    test('returns false when beyond max depth', () => {
      log.info('Testing shouldHandle beyond max depth');

      const req = {
        headers: {
          [SUBAGENT_DEPTH_HEADER]: '5',
        },
      };

      const config = {
        SubAgent: {
          enabled: true,
          maxDepth: 3,
        },
      };

      const result = subAgentAgent.shouldHandle(req, config);
      log.assertEqual(result, false, 'shouldHandle result');

      log.success('shouldHandle returns false beyond max depth');
    });
  });

  describe('reqHandler()', () => {
    test('injects sub-agent instructions into system prompt', () => {
      log.info('Testing reqHandler system prompt injection');

      const req = {
        headers: {},
        body: {
          system: [
            { type: 'text', text: 'Original system prompt' },
          ],
        },
      };

      const config = {
        SubAgent: {
          enabled: true,
          maxDepth: 3,
          allowedTypes: ['research', 'code', 'review', 'custom'],
        },
      };

      subAgentAgent.reqHandler(req, config);

      log.assertEqual(req.body.system.length, 2, 'system prompt count');
      log.assert(req.body.system[1].text.includes('<subagent_capability>'),
        'should inject subagent capability');

      log.success('Sub-agent instructions injected');
    });

    test('sets subagentDepth on request', () => {
      log.info('Testing subagentDepth setting');

      const req = {
        headers: {
          [SUBAGENT_DEPTH_HEADER]: '2',
        },
        body: { system: [] },
      };

      const config = {
        SubAgent: {
          enabled: true,
          maxDepth: 5,
        },
      };

      subAgentAgent.reqHandler(req, config);

      log.assertEqual(req.subagentDepth, 2, 'subagentDepth');
      log.assertEqual(req.isSubAgent, true, 'isSubAgent');

      log.success('Depth tracking set correctly');
    });

    test('does not inject when at max depth', () => {
      log.info('Testing no injection at max depth');

      const req = {
        headers: {
          [SUBAGENT_DEPTH_HEADER]: '3',
        },
        body: {
          system: [
            { type: 'text', text: 'Original' },
          ],
        },
      };

      const config = {
        SubAgent: {
          enabled: true,
          maxDepth: 3,
        },
      };

      subAgentAgent.reqHandler(req, config);

      // Should not add to system prompt at max depth
      log.assertEqual(req.body.system.length, 1, 'system prompt count should remain 1');

      log.success('No injection at max depth');
    });
  });

  describe('Header Constants', () => {
    test('depth header is defined', () => {
      log.info('Testing depth header constant');

      log.assertEqual(SUBAGENT_DEPTH_HEADER, 'x-ccr-subagent-depth', 'depth header');

      log.success('Depth header is correct');
    });

    test('id header is defined', () => {
      log.info('Testing id header constant');

      log.assertEqual(SUBAGENT_ID_HEADER, 'x-ccr-subagent-id', 'id header');

      log.success('ID header is correct');
    });
  });
});
