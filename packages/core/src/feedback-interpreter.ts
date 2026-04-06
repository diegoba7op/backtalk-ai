import type { LLMClient } from './llm.js';
import type { ResolvedTest, Conversation, JudgeResult, InterpretedFeedback } from './types.js';
import promptTemplate from './prompts/feedback-interpreter.md';

export async function interpretFeedback(
  rawComment: string,
  test: ResolvedTest,
  conversation: Conversation,
  judgeResult: JudgeResult,
  llm: LLMClient
): Promise<InterpretedFeedback> {
  const reference = test.reference
    .map((t) => (t.user ? `User: ${t.user}` : `Bot: ${t.bot}`))
    .filter(Boolean)
    .join('\n');

  const conversationText = conversation.messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`)
    .join('\n');

  const prompt = promptTemplate
    .replace('{{chatbotSpec}}', test.chatbotSpec)
    .replace('{{reference}}', reference)
    .replace('{{conversation}}', conversationText)
    .replace('{{qualityScore}}', String(judgeResult.quality.score))
    .replace('{{qualityReasoning}}', judgeResult.quality.reasoning)
    .replace('{{fidelityScore}}', String(judgeResult.fidelity.score))
    .replace('{{fidelityReasoning}}', judgeResult.fidelity.reasoning)
    .replace('{{rawComment}}', rawComment)
    .trim();

  const response = await llm.chat({
    model: test.judgeModel,
    messages: [{ role: 'user', content: prompt }],
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
