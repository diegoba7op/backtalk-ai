import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import type { ResolvedTest, RunnerMode, ReferenceTurn } from './types.js';

// --- Raw YAML types (internal to this module) ---

interface RawChatbotConfig {
  spec: string;
  url: string;
  model?: string;
  api_key?: string;
  mock_chatbot_system_prompt?: string;  // injected as system message to the API; omit for already-deployed bots
}

type RawThreshold = number | { quality: number; fidelity: number };

interface RawTestConfig {
  id: string;
  description?: string;
  chatbot?: string;  // required for top-level tests
  mode?: RunnerMode;
  model?: string;
  runner_model?: string;
  judge_model?: string;
  threshold?: RawThreshold;
  conversation: ReferenceTurn[];
  judge?: string;
  runner?: string;
}

interface RawSuiteConfig {
  id: string;
  chatbot: string;
  description?: string;
  mode?: RunnerMode;
  model?: string;
  runner_model?: string;
  judge_model?: string;
  threshold?: RawThreshold;
  tests: RawTestConfig[];
}

interface RawConfig {
  model?: string;
  runner_model?: string;
  judge_model?: string;
  chatbots?: Record<string, RawChatbotConfig>;
  judge?: { model?: string };
  runner?: {
    mode?: RunnerMode;
    model?: string;
    // Include the chatbot spec in the runner's system prompt for more context.
    // Improves simulation accuracy but increases token usage. Default: true.
    include_chatbot_spec?: boolean;
  };
  threshold?: RawThreshold;
  suites?: RawSuiteConfig[];
  tests?: RawTestConfig[];
}

// --- Helpers ---

function interpolateEnv(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? '');
}

function resolveThreshold(raw?: RawThreshold): { quality: number; fidelity: number } {
  if (raw == null) return { quality: 3, fidelity: 3 };
  if (typeof raw === 'number') return { quality: raw, fidelity: raw };
  return raw;
}

// --- Public API ---

export interface RunFilters {
  suite?: string;
  test?: string;
  mode?: RunnerMode;
}

export function loadConfig(configPath: string): RawConfig {
  const raw = readFileSync(configPath, 'utf-8');
  return load(raw) as RawConfig;
}

export function resolveTests(config: RawConfig, filters: RunFilters = {}): ResolvedTest[] {
  const results: ResolvedTest[] = [];

  // --- Suite tests ---
  for (const suite of config.suites ?? []) {
    if (filters.suite && suite.id !== filters.suite) continue;

    const chatbot = config.chatbots?.[suite.chatbot];
    if (!chatbot) throw new Error(`Chatbot "${suite.chatbot}" not found in config`);

    for (const test of suite.tests ?? []) {
      if (filters.test && test.id !== filters.test) continue;

      results.push(resolveTest(test, config, suite, chatbot, filters));
    }
  }

  // --- Top-level tests (not in a suite) ---
  if (!filters.suite) {
    for (const test of config.tests ?? []) {
      if (filters.test && test.id !== filters.test) continue;

      if (!test.chatbot) throw new Error(`Top-level test "${test.id}" must specify a chatbot`);
      const chatbot = config.chatbots?.[test.chatbot];
      if (!chatbot) throw new Error(`Chatbot "${test.chatbot}" not found in config`);

      results.push(resolveTest(test, config, null, chatbot, filters));
    }
  }

  return results;
}

function resolveTest(
  test: RawTestConfig,
  config: RawConfig,
  suite: RawSuiteConfig | null,
  chatbot: RawChatbotConfig,
  filters: RunFilters
): ResolvedTest {
  // Model hierarchy: test > suite > global (runner/judge sections take precedence over shorthand `model`)
  const runnerModel =
    test.runner_model ??
    test.model ??
    suite?.runner_model ??
    suite?.model ??
    config.runner?.model ??
    config.runner_model ??
    config.model ??
    'gpt-4o-mini';

  const judgeModel =
    test.judge_model ??
    test.model ??
    suite?.judge_model ??
    suite?.model ??
    config.judge?.model ??
    config.judge_model ??
    config.model ??
    'gpt-4o-mini';

  // Mode hierarchy: CLI filter > test > suite > global runner > default
  const mode: RunnerMode =
    filters.mode ??
    test.mode ??
    suite?.mode ??
    config.runner?.mode ??
    'guided';

  // Threshold: test > suite > global > default
  const threshold = resolveThreshold(test.threshold ?? suite?.threshold ?? config.threshold);

  return {
    id: suite ? `${suite.id}/${test.id}` : test.id,
    suiteId: suite?.id,
    description: test.description ?? '',
    chatbotUrl: interpolateEnv(chatbot.url),
    chatbotApiKey: chatbot.api_key ? interpolateEnv(chatbot.api_key) : undefined,
    chatbotModel: chatbot.model,
    chatbotSpec: chatbot.spec,
    mockChatbotSystemPrompt: chatbot.mock_chatbot_system_prompt
      ? interpolateEnv(chatbot.mock_chatbot_system_prompt)
      : undefined,
    runnerIncludeChatbotSpec: config.runner?.include_chatbot_spec ?? true,
    runnerMode: mode,
    runnerModel,
    judgeModel,
    threshold,
    reference: test.conversation,
    judgeInstructions: test.judge,
    runnerInstructions: test.runner,
  };
}
