import { createLLMClient } from './llm.js';
import { createChatbotClient } from './chatbot-client.js';
import { runConversation } from './runner.js';
import { judgeConversation } from './judge.js';
import type { ResolvedTest, TestResult } from './types.js';

// Phase 1: hardcoded test — no config file yet
function getHardcodedTest(): ResolvedTest {
  return {
    id: 'refund-happy-path',
    description: 'Customer asks for a refund on a recent order',
    chatbotUrl: 'https://api.openai.com/v1/chat/completions',
    chatbotApiKey: process.env.OPENAI_API_KEY,
    chatbotModel: 'gpt-4o-mini',
    chatbotSpec: `You are a customer support bot for an e-commerce store.
Be helpful, empathetic, and accurate about policies.
Refunds are accepted within 30 days of purchase with an order number.`,
    runnerMode: 'guided',
    runnerModel: 'gpt-4o-mini',
    judgeModel: 'gpt-4o-mini',
    threshold: { quality: 3, fidelity: 3 },
    reference: [
      { user: "Hi, I'd like a refund for my last order" },
      { bot: "I'd be happy to help with that. Could you provide your order number?" },
      { user: 'Order #12345' },
      { bot: "I found your order. Since it's within our 30-day window, I can process a full refund. It will appear in 3-5 business days." },
    ],
    judgeInstructions: 'Bot should ask for order number, confirm eligibility, and confirm the refund.',
  };
}

export async function run(): Promise<TestResult[]> {
  const test = getHardcodedTest();

  const llm = createLLMClient(test.runnerModel);
  const chatbot = createChatbotClient({
    url: test.chatbotUrl,
    apiKey: test.chatbotApiKey,
    model: test.chatbotModel,
  });

  const conversation = await runConversation(test, llm, chatbot);

  // Judge uses a potentially different model — create a new client if needed
  const judgeLlm = createLLMClient(test.judgeModel);
  const judgeResult = await judgeConversation(test, conversation, judgeLlm);

  return [{ test, conversation, judgeResult }];
}
