import type { LLMClient } from './llm.js';
import type { BacktalkDB } from './db/client.js';
import type { ResolvedTest, Conversation, InterpretedFeedback } from './types.js';
import { getTestResultById } from './store.js';
import judgePrompt from './prompts/feedback-interpreter-judge.md';
import runnerPrompt from './prompts/feedback-interpreter-runner.md';

export async function interpretFeedback(
  type: 'judge' | 'runner',
  rawComment: string,
  test: ResolvedTest,
  resultId: string,
  db: BacktalkDB,
  llm: LLMClient
): Promise<InterpretedFeedback> {
  const row = await getTestResultById(db, resultId);
  if (!row) throw new Error(`No test result found with id "${resultId}"`);

  const conversation: Conversation = { messages: JSON.parse(row.conversation) };

  const reference = test.reference
    .map((t) => (t.user ? `User: ${t.user}` : `Bot: ${t.bot}`))
    .filter(Boolean)
    .join('\n');

  const conversationText = conversation.messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`)
    .join('\n');

  let prompt: string;
  if (type === 'judge') {
    prompt = judgePrompt
      .replace('{{chatbotSpec}}', test.chatbotSpec)
      .replace('{{reference}}', reference)
      .replace('{{conversation}}', conversationText)
      .replace('{{qualityScore}}', String(row.qualityScore))
      .replace('{{qualityReasoning}}', row.qualityReasoning)
      .replace('{{fidelityScore}}', String(row.fidelityScore))
      .replace('{{fidelityReasoning}}', row.fidelityReasoning)
      .replace('{{rawComment}}', rawComment);
  } else {
    prompt = runnerPrompt
      .replace('{{chatbotSpec}}', test.chatbotSpec)
      .replace('{{reference}}', reference)
      .replace('{{conversation}}', conversationText)
      .replace('{{rawComment}}', rawComment);
  }

  const response = await llm.chat({
    model: test.interpreterModel,
    messages: [{ role: 'user', content: prompt.trim() }],
  });

  const match = response.match(/```json\s*([\s\S]*?)```/);
  if (!match) throw new Error(`Feedback interpreter response missing JSON block:\n${response}`);
  const parsed = JSON.parse(match[1]);

  return {
    comment: parsed.comment,
    qualityScoreCorrection: parsed.quality_score_correction ?? null,
    fidelityScoreCorrection: parsed.fidelity_score_correction ?? null,
  };
}
