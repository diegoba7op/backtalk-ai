import type { LLMClient } from './llm.js';
import type { ResolvedTest, Conversation, JudgeResult, InterpretedFeedback } from './types.js';
import judgePrompt from './prompts/feedback-interpreter.md';
import runnerPrompt from './prompts/feedback-interpreter-runner.md';

export async function interpretFeedback(
  type: 'judge' | 'runner',
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

  let prompt: string;
  if (type === 'judge') {
    prompt = judgePrompt
      .replace('{{chatbotSpec}}', test.chatbotSpec)
      .replace('{{reference}}', reference)
      .replace('{{conversation}}', conversationText)
      .replace('{{qualityScore}}', String(judgeResult.quality.score))
      .replace('{{qualityReasoning}}', judgeResult.quality.reasoning)
      .replace('{{fidelityScore}}', String(judgeResult.fidelity.score))
      .replace('{{fidelityReasoning}}', judgeResult.fidelity.reasoning)
      .replace('{{rawComment}}', rawComment);
  } else {
    prompt = runnerPrompt
      .replace('{{chatbotSpec}}', test.chatbotSpec)
      .replace('{{reference}}', reference)
      .replace('{{conversation}}', conversationText)
      .replace('{{rawComment}}', rawComment);
  }

  const response = await llm.chat({
    model: test.judgeModel,
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
