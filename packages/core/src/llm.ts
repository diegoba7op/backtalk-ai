import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Message } from './types.js';

export interface LLMClient {
  chat(params: { model: string; system: string; messages: Message[] }): Promise<string>;
}

function isClaudeModel(model: string): boolean {
  return model.startsWith('claude-');
}

function createAnthropicClient(): LLMClient {
  const client = new Anthropic();
  return {
    async chat({ model, system, messages }) {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system,
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });
      const block = response.content[0];
      if (block.type !== 'text') throw new Error('Unexpected response type from Anthropic');
      return block.text;
    },
  };
}

function createOpenAIClient(): LLMClient {
  const client = new OpenAI();
  return {
    async chat({ model, system, messages }) {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ],
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenAI');
      return content;
    },
  };
}

// Returns the right client based on model name prefix
export function createLLMClient(model: string): LLMClient {
  return isClaudeModel(model) ? createAnthropicClient() : createOpenAIClient();
}
