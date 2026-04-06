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
    const verdict = r.action === 'approve' ? 'APPROVED' : 'REJECTED';
    const scores = `quality=${r.qualityScore}, fidelity=${r.fidelityScore}`;
    const comment = r.comment ? ` — "${r.comment}"` : '';
    return `- ${verdict} (${scores})${comment}\n  Reasoning was: quality="${r.qualityReasoning}" / fidelity="${r.fidelityReasoning}"`;
  });

  return `Past judgments on this test (learn from approvals and rejections):\n${entries.join('\n')}`;
}
