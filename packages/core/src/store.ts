// High-level store operations used by CLI commands (feedback, history, results).
// All raw DB access stays in core; the CLI stays thin.

import { eq, desc } from 'drizzle-orm';
import { ulid } from 'ulid';
import { runs, testResults, feedback } from './db/schema.js';
import type { BacktalkDB } from './db/client.js';

export type FeedbackAction = 'approve' | 'reject';

export interface FeedbackRow {
  id: string;
  testResultId: string;
  testId: string;
  suiteId: string | null;
  action: FeedbackAction;
  comment: string | null;
  createdAt: number;
}

export interface TestResultRow {
  id: string;
  runId: string;
  suiteId: string | null;
  testId: string;
  qualityScore: number;
  fidelityScore: number;
  qualityReasoning: string;
  fidelityReasoning: string;
  passed: boolean;
  createdAt: number;
}

export interface RunRow {
  id: string;
  startedAt: number;
  finishedAt: number;
  totalTests: number;
  passed: number;
  failed: number;
}

// Add feedback for the most recent test result matching testId.
// Returns the created feedback id, or null if no matching test result found.
export async function addFeedback(
  db: BacktalkDB,
  testId: string,
  action: FeedbackAction,
  comment?: string
): Promise<string | null> {
  const [result] = await db
    .select({ id: testResults.id })
    .from(testResults)
    .where(eq(testResults.testId, testId))
    .orderBy(desc(testResults.createdAt))
    .limit(1);

  if (!result) return null;

  const id = ulid();
  await db.insert(feedback).values({
    id,
    testResultId: result.id,
    action,
    comment: comment ?? null,
    createdAt: Date.now(),
  });
  return id;
}

// Get the most recent N runs.
export async function listRuns(db: BacktalkDB, limit = 10): Promise<RunRow[]> {
  return db
    .select({
      id: runs.id,
      startedAt: runs.startedAt,
      finishedAt: runs.finishedAt,
      totalTests: runs.totalTests,
      passed: runs.passed,
      failed: runs.failed,
    })
    .from(runs)
    .orderBy(desc(runs.startedAt))
    .limit(limit);
}

// Get test results for the most recent run.
export async function getLastRunResults(db: BacktalkDB): Promise<TestResultRow[]> {
  const [lastRun] = await db
    .select({ id: runs.id })
    .from(runs)
    .orderBy(desc(runs.startedAt))
    .limit(1);

  if (!lastRun) return [];

  return db
    .select({
      id: testResults.id,
      runId: testResults.runId,
      suiteId: testResults.suiteId,
      testId: testResults.testId,
      qualityScore: testResults.qualityScore,
      fidelityScore: testResults.fidelityScore,
      qualityReasoning: testResults.qualityReasoning,
      fidelityReasoning: testResults.fidelityReasoning,
      passed: testResults.passed,
      createdAt: testResults.createdAt,
    })
    .from(testResults)
    .where(eq(testResults.runId, lastRun.id));
}

// List all feedback entries (most recent first).
export async function listFeedback(db: BacktalkDB, limit = 20): Promise<FeedbackRow[]> {
  const rows = await db
    .select({
      id: feedback.id,
      testResultId: feedback.testResultId,
      testId: testResults.testId,
      suiteId: testResults.suiteId,
      action: feedback.action,
      comment: feedback.comment,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .innerJoin(testResults, eq(feedback.testResultId, testResults.id))
    .orderBy(desc(feedback.createdAt))
    .limit(limit);

  return rows as FeedbackRow[];
}
