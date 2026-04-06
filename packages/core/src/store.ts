// High-level store operations used by CLI commands (feedback, history, results).
// All raw DB access stays in core; the CLI stays thin.

import { eq, desc } from 'drizzle-orm';
import { ulid } from 'ulid';
import { runs, testResults, feedback } from './db/schema.js';
import type { BacktalkDB } from './db/client.js';
import type { Feedback, InterpretedFeedback, StoredTestResult, Run } from './types.js';

// Fetches the most recent test result row for a given testId.
export async function getLatestTestResult(db: BacktalkDB, testId: string) {
  const [row] = await db
    .select()
    .from(testResults)
    .where(eq(testResults.testId, testId))
    .orderBy(desc(testResults.createdAt))
    .limit(1);
  return row ?? null;
}

export async function addJudgeFeedback(
  db: BacktalkDB,
  testResultId: string,
  rawComment: string,
  interpreted: InterpretedFeedback
): Promise<string> {
  const id = ulid();
  await db.insert(feedback).values({
    id,
    testResultId,
    type: 'judge',
    rawComment,
    comment: interpreted.comment,
    qualityScoreCorrection: interpreted.qualityScoreCorrection,
    fidelityScoreCorrection: interpreted.fidelityScoreCorrection,
    createdAt: Date.now(),
  });
  return id;
}

export async function addRunnerFeedback(
  db: BacktalkDB,
  testResultId: string,
  rawComment: string
): Promise<string> {
  const id = ulid();
  await db.insert(feedback).values({
    id,
    testResultId,
    type: 'runner',
    rawComment,
    comment: rawComment,
    qualityScoreCorrection: null,
    fidelityScoreCorrection: null,
    createdAt: Date.now(),
  });
  return id;
}

// Get the most recent N runs.
export async function listRuns(db: BacktalkDB, limit = 10): Promise<Run[]> {
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
export async function getLastRunResults(db: BacktalkDB): Promise<StoredTestResult[]> {
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
export async function listFeedback(db: BacktalkDB, limit = 20): Promise<Feedback[]> {
  const rows = await db
    .select({
      id: feedback.id,
      testResultId: feedback.testResultId,
      testId: testResults.testId,
      suiteId: testResults.suiteId,
      type: feedback.type,
      rawComment: feedback.rawComment,
      comment: feedback.comment,
      qualityScoreCorrection: feedback.qualityScoreCorrection,
      fidelityScoreCorrection: feedback.fidelityScoreCorrection,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .innerJoin(testResults, eq(feedback.testResultId, testResults.id))
    .orderBy(desc(feedback.createdAt))
    .limit(limit);

  return rows as Feedback[];
}
