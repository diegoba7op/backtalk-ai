import path from 'node:path';
import { ulid } from 'ulid';
import { loadConfig, resolveTests } from './config.js';
import { createLLMClient } from './llm.js';
import { createChatbotClient } from './chatbot-client.js';
import { runConversation } from './runner.js';
import { judgeConversation } from './judge.js';
import { buildFeedbackPrompt } from './feedback.js';
import { interpretFeedback } from './feedback-interpreter.js';
import { openDB } from './db/client.js';
import { runs, testResults, feedback as feedbackTable } from './db/schema.js';
import { getTestResultById, addJudgeFeedback, addRunnerFeedback } from './store.js';
import type { RunnerMode, TestResult, Reporter } from './types.js';

export interface RunOptions {
  configPath?: string;   // defaults to backtalk.yaml in cwd
  suite?: string;
  test?: string;
  mode?: RunnerMode;
  reporter?: Reporter;
  dbPath?: string;       // defaults to .backtalk.db next to config
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

  const dbPath = options.dbPath ?? path.join(path.dirname(path.resolve(configPath)), '.backtalk.db');
  const db = openDB(dbPath);

  const runId = ulid();
  const startedAt = Date.now();

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
    const feedbackContext = await buildFeedbackPrompt(db, test.id);
    const judgeResult = await judgeConversation(test, conversation, judgeLlm, feedbackContext);

    const resultId = ulid();
    await db.insert(testResults).values({
      id: resultId,
      runId,
      suiteId: test.suiteId ?? null,
      testId: test.id,
      qualityScore: judgeResult.quality.score,
      fidelityScore: judgeResult.fidelity.score,
      qualityReasoning: judgeResult.quality.reasoning,
      fidelityReasoning: judgeResult.fidelity.reasoning,
      passed: judgeResult.passed,
      conversation: JSON.stringify(conversation.messages),
      referenceConversation: JSON.stringify(test.reference),
      configSnapshot: JSON.stringify(test),
      createdAt: Date.now(),
    });

    const result: TestResult = { test, conversation, judgeResult, resultId };
    results.push(result);
    reporter?.onTestComplete?.(result);
  }

  const finishedAt = Date.now();
  const passed = results.filter((r) => r.judgeResult.passed).length;
  const failed = results.length - passed;

  await db.insert(runs).values({
    id: runId,
    startedAt,
    finishedAt,
    totalTests: results.length,
    passed,
    failed,
    configSnapshot: JSON.stringify(config),
  });

  reporter?.onRunComplete?.(results);
  return results;
}

export interface SubmitFeedbackOptions {
  resultId: string;
  comment: string;
  type: 'judge' | 'runner';
  configPath?: string;
  dbPath?: string;
}

export async function submitFeedback(options: SubmitFeedbackOptions): Promise<void> {
  const configPath = options.configPath ?? 'backtalk.yaml';
  const dbPath = options.dbPath ?? path.join(path.dirname(path.resolve(configPath)), '.backtalk.db');
  const db = openDB(dbPath);

  const row = await getTestResultById(db, options.resultId);
  if (!row) throw new Error(`No test result found with id "${options.resultId}"`);

  const test: import('./types.js').ResolvedTest = JSON.parse(row.configSnapshot);
  const conversation: import('./types.js').Conversation = { messages: JSON.parse(row.conversation) };
  const judgeResult: import('./types.js').JudgeResult = {
    quality: { score: row.qualityScore, reasoning: row.qualityReasoning },
    fidelity: { score: row.fidelityScore, reasoning: row.fidelityReasoning },
    passed: row.passed,
  };

  const llm = createLLMClient(test.judgeModel);
  const interpreted = await interpretFeedback(options.type, options.comment, test, conversation, judgeResult, llm);

  if (options.type === 'runner') {
    await addRunnerFeedback(db, row.id, options.comment, interpreted);
  } else {
    await addJudgeFeedback(db, row.id, options.comment, interpreted);
  }
}

export { openDB };
export type { BacktalkDB } from './db/client.js';
