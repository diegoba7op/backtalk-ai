import type { LLMClient } from './llm.js';
import type { ChatbotClient } from './chatbot-client.js';
import type { ResolvedTest, Conversation, Message } from './types.js';
import runnerPromptTemplate from './prompts/runner.md';

const DONE_SENTINEL = '<<<DONE>>>';

function buildRunnerSystemPrompt(test: ResolvedTest): string {
  const reference = test.reference
    .map((turn) => {
      if (turn.user) return `User: ${turn.user}`;
      if (turn.bot) return `Bot: ${turn.bot}`;
      return '';
    })
    .filter(Boolean)
    .join('\n');

  const specBlock = test.runnerIncludeChatbotSpec
    ? `The chatbot you are talking to is described as follows:\n${test.chatbotSpec}\n`
    : '';

  return runnerPromptTemplate
    .replace('{{chatbotSpec}}', specBlock)
    .replace('{{reference}}', reference)
    .replace(
      '{{runnerInstructions}}',
      test.runnerInstructions ? `Additional instructions: ${test.runnerInstructions}` : ''
    )
    .trim();
}

export async function runConversation(
  test: ResolvedTest,
  llm: LLMClient,
  chatbot: ChatbotClient,
  onTurn?: (user: string, bot: string) => void
): Promise<Conversation> {
  const maxTurns = test.reference.filter((t) => t.user).length * 2;
  const conversationMessages: Message[] = [];
  const runnerHistory: Message[] = [];

  // runnerHistory tracks the runner LLM's own conversation context:
  //   'assistant' = the runner's previous outputs (fake user messages it generated)
  //   'user'      = us feeding it the chatbot's responses so it knows what happened
  // These are API role names, not personas — the runner IS the assistant in this exchange.
  // Seed with a kick-off prompt — Anthropic requires at least one message.
  runnerHistory.push({ role: 'user', content: 'Begin the conversation now.' });

  for (let turn = 0; turn < maxTurns; turn++) {
    const runnerOutput = await llm.chat({
      model: test.runnerModel,
      system: buildRunnerSystemPrompt(test),
      messages: runnerHistory,
    });

    if (runnerOutput.trim().split('\n').some((line) => line.trim() === DONE_SENTINEL)) {
      break;
    }

    // Runner output becomes the fake user message sent to the chatbot
    const fakeUserMessage: Message = { role: 'user', content: runnerOutput.trim() };
    conversationMessages.push(fakeUserMessage);
    runnerHistory.push({ role: 'assistant', content: runnerOutput.trim() });

    const botResponse = await chatbot.send(conversationMessages);
    const botMessage: Message = { role: 'assistant', content: botResponse };
    conversationMessages.push(botMessage);

    onTurn?.(fakeUserMessage.content, botResponse);

    // Feed chatbot response back so runner can adapt its next message
    runnerHistory.push({ role: 'user', content: `Chatbot responded: ${botResponse}` });
  }

  return { messages: conversationMessages };
}
