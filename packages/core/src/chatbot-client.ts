import OpenAI from 'openai';
import type { Message } from './types.js';

export interface ChatbotClient {
  send(messages: Message[]): Promise<string>;
}

export function createChatbotClient(params: {
  url: string;
  apiKey?: string;
  model?: string;
}): ChatbotClient {
  const client = new OpenAI({
    baseURL: params.url.replace(/\/v1\/chat\/completions$/, '/v1'),
    apiKey: params.apiKey ?? 'none',
  });

  return {
    async send(messages) {
      const response = await client.chat.completions.create({
        model: params.model ?? 'gpt-4o-mini',
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from chatbot');
      return content;
    },
  };
}
