import { loadConfig, resolveTests } from './config.js';
import { createLLMClient } from './llm.js';
import { createChatbotClient } from './chatbot-client.js';
import { runConversation } from './runner.js';
import { judgeConversation } from './judge.js';
import type { RunnerMode, TestResult, Reporter } from './types.js';

export interface RunOptions {
  configPath?: string;   // defaults to backtalk.yaml in cwd
  suite?: string;
  test?: string;
  mode?: RunnerMode;
  reporter?: Reporter;
}

export async function run(options: RunOptions = {}): Promise<TestResult[]> {
  const { reporter } = options;
  const configPath = options.configPath ?? 'backtalk.yaml';
  const config = loadConfig(configPath);
  const tests = resolveTests(config, {
    suite: options.suite,
    test: options.test,
    mode: options.mode,
  });

  if (tests.length === 0) {
    throw new Error('No tests found matching the given filters');
  }

  const results: TestResult[] = [];
  let currentSuiteId: string | undefined = undefined;

  for (const test of tests) {
    if (test.suiteId !== currentSuiteId) {
      currentSuiteId = test.suiteId;
      if (test.suiteId) reporter?.onSuiteStart?.(test.suiteId);
    }

    reporter?.onTestStart?.(test);

    const llm = createLLMClient(test.runnerModel);
    const chatbot = createChatbotClient({
      url: test.chatbotUrl,
      apiKey: test.chatbotApiKey,
      model: test.chatbotModel,
      systemPrompt: test.mockChatbotSystemPrompt,
    });

    const conversation = await runConversation(
      test,
      llm,
      chatbot,
      reporter?.onTurn?.bind(reporter)
    );

    const judgeLlm = createLLMClient(test.judgeModel);
    const judgeResult = await judgeConversation(test, conversation, judgeLlm);

    const result: TestResult = { test, conversation, judgeResult };
    results.push(result);
    reporter?.onTestComplete?.(result);
  }

  reporter?.onRunComplete?.(results);
  return results;
}
