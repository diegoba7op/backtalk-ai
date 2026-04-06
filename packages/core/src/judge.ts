import type { LLMClient } from './llm.js';
import type { ResolvedTest, Conversation, JudgeResult } from './types.js';
import judgePromptTemplate from './prompts/judge.md';

function buildJudgeSystemPrompt(test: ResolvedTest, feedbackContext = ''): string {
  const reference = test.reference
    .map((turn) => {
      if (turn.user) return `User: ${turn.user}`;
      if (turn.bot) return `Bot: ${turn.bot}`;
      return '';
    })
    .filter(Boolean)
    .join('\n');

  return judgePromptTemplate
    .replace('{{chatbotSpec}}', test.chatbotSpec)
    .replace('{{reference}}', reference)
    .replace(
      '{{judgeInstructions}}',
      test.judgeInstructions ? `Additional evaluation instructions: ${test.judgeInstructions}` : ''
    )
    .replace('{{feedbackContext}}', feedbackContext)
    .trim();
}

function buildJudgeUserMessage(conversation: Conversation): string {
  const transcript = conversation.messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`)
    .join('\n');
  return `Actual conversation:\n${transcript}`;
}

function parseJudgeResponse(raw: string): { quality: { score: number; reasoning: string }; fidelity: { score: number; reasoning: string } } {
  const match = raw.match(/```json\s*([\s\S]*?)```/);
  if (!match) throw new Error(`Judge response missing JSON block:\n${raw}`);
  return JSON.parse(match[1]);
}

export async function judgeConversation(
  test: ResolvedTest,
  conversation: Conversation,
  llm: LLMClient,
  feedbackContext = ''
): Promise<JudgeResult> {
  const response = await llm.chat({
    model: test.judgeModel,
    system: buildJudgeSystemPrompt(test, feedbackContext),
    messages: [{ role: 'user', content: buildJudgeUserMessage(conversation) }],
  });

  const parsed = parseJudgeResponse(response);

  const passed =
    parsed.quality.score >= test.threshold.quality &&
    parsed.fidelity.score >= test.threshold.fidelity;

  return {
    quality: parsed.quality,
    fidelity: parsed.fidelity,
    passed,
  };
}
