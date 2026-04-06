import { eq, desc } from 'drizzle-orm';
import type { BacktalkDB } from './db/client.js';
import { feedback, testResults } from './db/schema.js';

// Returns a feedback section to inject into the judge system prompt,
// or empty string if no feedback exists for this test.
export async function buildFeedbackPrompt(db: BacktalkDB, testId: string): Promise<string> {
  // Get the 10 most recent feedback entries for this test ID, with their result context
  const rows = await db
    .select({
      action: feedback.action,
      comment: feedback.comment,
      qualityScore: testResults.qualityScore,
      fidelityScore: testResults.fidelityScore,
      qualityReasoning: testResults.qualityReasoning,
      fidelityReasoning: testResults.fidelityReasoning,
    })
    .from(feedback)
    .innerJoin(testResults, eq(feedback.testResultId, testResults.id))
    .where(eq(testResults.testId, testId))
    .orderBy(desc(feedback.createdAt))
    .limit(10);

  if (rows.length === 0) return '';

  const entries = rows.map((r) => {
    const scores = `quality=${r.qualityScore}, fidelity=${r.fidelityScore}`;
    if (r.action === 'approve') {
      const comment = r.comment ? ` — "${r.comment}"` : '';
      return `- CORRECT (${scores})${comment}\n  Reasoning: quality="${r.qualityReasoning}" / fidelity="${r.fidelityReasoning}"`;
    } else {
      const comment = r.comment ? `\n  Correction: "${r.comment}"` : '';
      return `- WRONG (${scores})\n  Wrong reasoning: quality="${r.qualityReasoning}" / fidelity="${r.fidelityReasoning}"${comment}`;
    }
  });

  return `Consider the following feedback given on imperfect / wrong past evaluations:\n${entries.join('\n')}`;
}
