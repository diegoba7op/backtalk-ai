import { eq, desc } from 'drizzle-orm';
import type { BacktalkDB } from './db/client.js';
import { feedback, testResults } from './db/schema.js';

// Returns a feedback section to inject into the judge system prompt,
// or empty string if no feedback exists for this test.
export async function buildFeedbackPrompt(db: BacktalkDB, testId: string): Promise<string> {
  const rows = await db
    .select({
      type: feedback.type,
      comment: feedback.comment,
      qualityScore: testResults.qualityScore,
      fidelityScore: testResults.fidelityScore,
      qualityScoreCorrection: feedback.qualityScoreCorrection,
      fidelityScoreCorrection: feedback.fidelityScoreCorrection,
    })
    .from(feedback)
    .innerJoin(testResults, eq(feedback.testResultId, testResults.id))
    .where(eq(testResults.testId, testId))
    .orderBy(desc(feedback.createdAt))
    .limit(10);

  if (rows.length === 0) return '';

  const judgeEntries = rows.filter((r) => r.type === 'judge');
  const runnerEntries = rows.filter((r) => r.type === 'runner');

  const sections: string[] = [];

  if (judgeEntries.length > 0) {
    const items = judgeEntries.map((r) => {
      const wrong = `quality=${r.qualityScore}, fidelity=${r.fidelityScore}`;
      const corrections = [
        r.qualityScoreCorrection != null ? `quality=${r.qualityScoreCorrection}` : null,
        r.fidelityScoreCorrection != null ? `fidelity=${r.fidelityScoreCorrection}` : null,
      ].filter(Boolean).join(', ');
      const correctionLine = corrections ? `\n  Correct scores should be: ${corrections}` : '';
      return `- Scores were wrong (${wrong}): ${r.comment}${correctionLine}`;
    });
    sections.push(`Judge feedback — these past evaluations were wrong:\n${items.join('\n')}`);
  }

  if (runnerEntries.length > 0) {
    const items = runnerEntries.map((r) => `- ${r.comment}`);
    sections.push(`Runner feedback — how the conversation was conducted:\n${items.join('\n')}`);
  }

  return `Consider the following feedback given on imperfect / wrong past evaluations:\n\n${sections.join('\n\n')}`;
}
