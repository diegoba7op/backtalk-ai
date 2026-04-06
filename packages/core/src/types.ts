// All shared types — no imports, leaf node in the dependency graph

export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  role: Role;
  content: string;
}

export type RunnerMode = 'guided' | 'intent' | 'strict';

// A single turn in a reference conversation from config
export interface ReferenceTurn {
  user?: string;
  bot?: string;
}

// A resolved test — all config hierarchy already flattened
export interface ResolvedTest {
  id: string;
  suiteId?: string;  // undefined for top-level tests
  description: string;
  chatbotUrl: string;
  chatbotApiKey?: string;
  chatbotModel?: string;
  chatbotSpec: string;
  runnerMode: RunnerMode;
  runnerModel: string;
  judgeModel: string;
  threshold: { quality: number; fidelity: number };
  reference: ReferenceTurn[];
  judgeInstructions?: string;
  runnerInstructions?: string;
}

// The actual conversation that ran
export interface Conversation {
  messages: Message[];
}

// Judge scores for one metric
export interface MetricScore {
  score: number; // 1-5
  reasoning: string;
}

export interface JudgeResult {
  quality: MetricScore;
  fidelity: MetricScore;
  passed: boolean;
}

export interface TestResult {
  test: ResolvedTest;
  conversation: Conversation;
  judgeResult: JudgeResult;
}
