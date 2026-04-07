import { describe, it, expect, afterEach } from 'vitest';
import { resolveTests } from '../config.js';

const baseChatbot = {
  spec: 'A helpful customer service agent',
  url: 'http://localhost:3000',
};

const baseTest = {
  id: 'test1',
  conversation: [{ user: 'hello' }, { bot: 'hi there' }],
};

const baseSuite = {
  id: 'suite1',
  chatbot: 'bot',
  tests: [baseTest],
};

const baseConfig = {
  chatbots: { bot: baseChatbot },
  suites: [baseSuite],
};

describe('resolveTests', () => {
  describe('id resolution', () => {
    it('prefixes suite tests with suite id', () => {
      const [test] = resolveTests(baseConfig);
      expect(test.id).toBe('suite1/test1');
    });

    it('top-level tests use bare id', () => {
      const config = {
        chatbots: { bot: baseChatbot },
        tests: [{ ...baseTest, chatbot: 'bot' }],
      };
      const [test] = resolveTests(config);
      expect(test.id).toBe('test1');
    });

    it('sets suiteId on suite tests, undefined on top-level', () => {
      const config = {
        chatbots: { bot: baseChatbot },
        suites: [baseSuite],
        tests: [{ ...baseTest, id: 'standalone', chatbot: 'bot' }],
      };
      const results = resolveTests(config);
      const suiteTest = results.find((t) => t.id === 'suite1/test1')!;
      const topTest = results.find((t) => t.id === 'standalone')!;
      expect(suiteTest.suiteId).toBe('suite1');
      expect(topTest.suiteId).toBeUndefined();
    });
  });

  describe('model hierarchy', () => {
    it('defaults to gpt-4o-mini for both runner and judge', () => {
      const [test] = resolveTests(baseConfig);
      expect(test.runnerModel).toBe('gpt-4o-mini');
      expect(test.judgeModel).toBe('gpt-4o-mini');
    });

    it('global model applies to both', () => {
      const [test] = resolveTests({ ...baseConfig, model: 'gpt-4o' });
      expect(test.runnerModel).toBe('gpt-4o');
      expect(test.judgeModel).toBe('gpt-4o');
    });

    it('suite model overrides global', () => {
      const [test] = resolveTests({
        ...baseConfig,
        model: 'gpt-4o-mini',
        suites: [{ ...baseSuite, model: 'gpt-4o' }],
      });
      expect(test.runnerModel).toBe('gpt-4o');
      expect(test.judgeModel).toBe('gpt-4o');
    });

    it('test model overrides suite', () => {
      const [test] = resolveTests({
        ...baseConfig,
        suites: [{ ...baseSuite, model: 'gpt-4o', tests: [{ ...baseTest, model: 'claude-opus-4-6' }] }],
      });
      expect(test.runnerModel).toBe('claude-opus-4-6');
      expect(test.judgeModel).toBe('claude-opus-4-6');
    });

    it('runner_model overrides model for runner only', () => {
      const [test] = resolveTests({
        ...baseConfig,
        suites: [{ ...baseSuite, tests: [{ ...baseTest, model: 'gpt-4o', runner_model: 'gpt-4o-mini' }] }],
      });
      expect(test.runnerModel).toBe('gpt-4o-mini');
      expect(test.judgeModel).toBe('gpt-4o');
    });

    it('judge_model overrides model for judge only', () => {
      const [test] = resolveTests({
        ...baseConfig,
        suites: [{ ...baseSuite, tests: [{ ...baseTest, model: 'gpt-4o-mini', judge_model: 'claude-opus-4-6' }] }],
      });
      expect(test.runnerModel).toBe('gpt-4o-mini');
      expect(test.judgeModel).toBe('claude-opus-4-6');
    });

    it('runner section model only affects runner', () => {
      const [test] = resolveTests({ ...baseConfig, runner: { model: 'gpt-4o' } });
      expect(test.runnerModel).toBe('gpt-4o');
      expect(test.judgeModel).toBe('gpt-4o-mini');
    });

    it('judge section model only affects judge', () => {
      const [test] = resolveTests({ ...baseConfig, judge: { model: 'claude-opus-4-6' } });
      expect(test.runnerModel).toBe('gpt-4o-mini');
      expect(test.judgeModel).toBe('claude-opus-4-6');
    });
  });

  describe('threshold resolution', () => {
    it('defaults to 3/3', () => {
      const [test] = resolveTests(baseConfig);
      expect(test.threshold).toEqual({ quality: 3, fidelity: 3 });
    });

    it('scalar threshold applies to both dimensions', () => {
      const [test] = resolveTests({ ...baseConfig, threshold: 4 });
      expect(test.threshold).toEqual({ quality: 4, fidelity: 4 });
    });

    it('object threshold sets each dimension independently', () => {
      const [test] = resolveTests({ ...baseConfig, threshold: { quality: 4, fidelity: 2 } });
      expect(test.threshold).toEqual({ quality: 4, fidelity: 2 });
    });

    it('suite threshold overrides global', () => {
      const [test] = resolveTests({
        ...baseConfig,
        threshold: 5,
        suites: [{ ...baseSuite, threshold: 2 }],
      });
      expect(test.threshold).toEqual({ quality: 2, fidelity: 2 });
    });

    it('test threshold overrides suite', () => {
      const [test] = resolveTests({
        ...baseConfig,
        suites: [{ ...baseSuite, threshold: 4, tests: [{ ...baseTest, threshold: 2 }] }],
      });
      expect(test.threshold).toEqual({ quality: 2, fidelity: 2 });
    });
  });

  describe('mode resolution', () => {
    it('defaults to guided', () => {
      const [test] = resolveTests(baseConfig);
      expect(test.runnerMode).toBe('guided');
    });

    it('suite mode overrides global default', () => {
      const [test] = resolveTests({
        ...baseConfig,
        suites: [{ ...baseSuite, mode: 'strict' }],
      });
      expect(test.runnerMode).toBe('strict');
    });

    it('test mode overrides suite mode', () => {
      const [test] = resolveTests({
        ...baseConfig,
        suites: [{ ...baseSuite, mode: 'strict', tests: [{ ...baseTest, mode: 'intent' }] }],
      });
      expect(test.runnerMode).toBe('intent');
    });

    it('CLI mode filter overrides all config modes', () => {
      const [test] = resolveTests(
        { ...baseConfig, suites: [{ ...baseSuite, mode: 'intent', tests: [{ ...baseTest, mode: 'strict' }] }] },
        { mode: 'guided' }
      );
      expect(test.runnerMode).toBe('guided');
    });
  });

  describe('filtering', () => {
    const multiConfig = {
      chatbots: { bot: baseChatbot },
      suites: [
        { id: 'alpha', chatbot: 'bot', tests: [{ id: 'a1', conversation: [] }, { id: 'a2', conversation: [] }] },
        { id: 'beta', chatbot: 'bot', tests: [{ id: 'b1', conversation: [] }] },
      ],
    };

    it('returns all tests when no filters', () => {
      expect(resolveTests(multiConfig)).toHaveLength(3);
    });

    it('filters by suite id', () => {
      const results = resolveTests(multiConfig, { suite: 'alpha' });
      expect(results).toHaveLength(2);
      expect(results.every((t) => t.id.startsWith('alpha/'))).toBe(true);
    });

    it('filters by test id across suites', () => {
      const results = resolveTests(multiConfig, { test: 'a1' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('alpha/a1');
    });

    it('suite filter excludes top-level tests', () => {
      const config = {
        chatbots: { bot: baseChatbot },
        suites: [{ id: 'suite1', chatbot: 'bot', tests: [baseTest] }],
        tests: [{ id: 'top', chatbot: 'bot', conversation: [] }],
      };
      const results = resolveTests(config, { suite: 'suite1' });
      expect(results.every((t) => t.id !== 'top')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('throws when chatbot key is not in chatbots map', () => {
      expect(() =>
        resolveTests({ chatbots: { bot: baseChatbot }, suites: [{ ...baseSuite, chatbot: 'missing' }] })
      ).toThrow('Chatbot "missing" not found');
    });

    it('throws when top-level test has no chatbot field', () => {
      expect(() =>
        resolveTests({ chatbots: { bot: baseChatbot }, tests: [baseTest as any] })
      ).toThrow('must specify a chatbot');
    });
  });

  describe('env var interpolation', () => {
    afterEach(() => {
      delete process.env.TEST_BOT_URL;
      delete process.env.TEST_API_KEY;
    });

    it('interpolates env vars in chatbot url', () => {
      process.env.TEST_BOT_URL = 'http://api.example.com';
      const config = {
        chatbots: { bot: { ...baseChatbot, url: '${TEST_BOT_URL}' } },
        suites: [baseSuite],
      };
      const [test] = resolveTests(config);
      expect(test.chatbotUrl).toBe('http://api.example.com');
    });

    it('interpolates env vars in api_key', () => {
      process.env.TEST_API_KEY = 'sk-secret';
      const config = {
        chatbots: { bot: { ...baseChatbot, api_key: '${TEST_API_KEY}' } },
        suites: [baseSuite],
      };
      const [test] = resolveTests(config);
      expect(test.chatbotApiKey).toBe('sk-secret');
    });

    it('leaves unset env vars as empty string', () => {
      const config = {
        chatbots: { bot: { ...baseChatbot, url: '${UNSET_VAR}/path' } },
        suites: [baseSuite],
      };
      const [test] = resolveTests(config);
      expect(test.chatbotUrl).toBe('/path');
    });
  });

  describe('chatbot fields', () => {
    it('passes spec, url, and model to resolved test', () => {
      const config = {
        chatbots: { bot: { ...baseChatbot, model: 'gpt-3.5-turbo' } },
        suites: [baseSuite],
      };
      const [test] = resolveTests(config);
      expect(test.chatbotSpec).toBe(baseChatbot.spec);
      expect(test.chatbotUrl).toBe(baseChatbot.url);
      expect(test.chatbotModel).toBe('gpt-3.5-turbo');
    });

    it('mock_chatbot_system_prompt=true uses spec as prompt', () => {
      const config = {
        chatbots: { bot: { ...baseChatbot, mock_chatbot_system_prompt: true } },
        suites: [baseSuite],
      };
      const [test] = resolveTests(config);
      expect(test.mockChatbotSystemPrompt).toBe(baseChatbot.spec);
    });

    it('mock_chatbot_system_prompt string uses that string', () => {
      const config = {
        chatbots: { bot: { ...baseChatbot, mock_chatbot_system_prompt: 'custom prompt' } },
        suites: [baseSuite],
      };
      const [test] = resolveTests(config);
      expect(test.mockChatbotSystemPrompt).toBe('custom prompt');
    });

    it('mock_chatbot_system_prompt omitted means undefined', () => {
      const [test] = resolveTests(baseConfig);
      expect(test.mockChatbotSystemPrompt).toBeUndefined();
    });
  });
});
