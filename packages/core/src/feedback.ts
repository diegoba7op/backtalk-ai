import { eq, desc, and } from 'drizzle-orm';
import type { BacktalkDB } from './db/client.js';
import { feedback, testResults } from './db/schema.js';

export async function buildJudgeFeedbackPrompt(db: BacktalkDB, testId: string): Promise<string> {
  const rows = await db
    .select({
      comment: feedback.comment,
      qualityScore: testResults.qualityScore,
      fidelityScore: testResults.fidelityScore,
      qualityScoreCorrection: feedback.qualityScoreCorrection,
      fidelityScoreCorrection: feedback.fidelityScoreCorrection,
    })
    .from(feedback)
    .innerJoin(testResults, eq(feedback.testResultId, testResults.id))
    .where(and(eq(testResults.testId, testId), eq(feedback.type, 'judge')))
    .orderBy(desc(feedback.createdAt))
    .limit(10);

  if (rows.length === 0) return '';

  const items = rows.map((r) => {
    const wrong = `quality=${r.qualityScore}, fidelity=${r.fidelityScore}`;
    const corrections = [
      r.qualityScoreCorrection != null ? `quality=${r.qualityScoreCorrection}` : null,
      r.fidelityScoreCorrection != null ? `fidelity=${r.fidelityScoreCorrection}` : null,
    ].filter(Boolean).join(', ');
    const correctionLine = corrections ? `\n  Correct scores should be: ${corrections}` : '';
    return `- Scores were wrong (${wrong}): ${r.comment}${correctionLine}`;
  });

  return `Consider the following feedback given on imperfect / wrong past evaluations:\n\nJudge feedback — these past evaluations were wrong:\n${items.join('\n')}`;
}

export async function buildRunnerFeedbackPrompt(db: BacktalkDB, testId: string): Promise<string> {
  const rows = await db
    .select({ comment: feedback.comment })
    .from(feedback)
    .innerJoin(testResults, eq(feedback.testResultId, testResults.id))
    .where(and(eq(testResults.testId, testId), eq(feedback.type, 'runner')))
    .orderBy(desc(feedback.createdAt))
    .limit(10);

  if (rows.length === 0) return '';

  const items = rows.map((r) => `- ${r.comment}`);
  return `Consider the following feedback on how past conversations were conducted:\n\n${items.join('\n')}`;
}
