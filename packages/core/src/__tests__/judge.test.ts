import { describe, it, expect, vi, beforeEach } from 'vitest';
import { judgeConversation } from '../judge.js';
import type { ResolvedTest, Conversation, LLMClient } from '../index.js';

const baseTest: ResolvedTest = {
  id: 'suite1/test1',
  description: 'basic greeting test',
  chatbotUrl: 'http://localhost:3000',
  chatbotSpec: 'A helpful customer service agent that greets users warmly.',
  runnerIncludeChatbotSpec: true,
  runnerMode: 'guided',
  runnerModel: 'gpt-4o-mini',
  judgeModel: 'gpt-4o-mini',
  interpreterModel: 'gpt-4o-mini',
  threshold: { quality: 3, fidelity: 3 },
  reference: [{ user: 'hello' }, { bot: 'Hi! How can I help you today?' }],
};

const baseConversation: Conversation = {
  messages: [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'Hi there! What can I do for you?' },
  ],
};

function makeResponse(quality: number, fidelity: number, qualityReasoning = 'ok', fidelityReasoning = 'ok') {
  return `\`\`\`json\n${JSON.stringify({
    quality: { score: quality, reasoning: qualityReasoning },
    fidelity: { score: fidelity, reasoning: fidelityReasoning },
  })}\n\`\`\``;
}

describe('judgeConversation', () => {
  const mockLLM = { chat: vi.fn() } as unknown as LLMClient;

  beforeEach(() => {
    vi.mocked(mockLLM.chat).mockReset();
  });

  describe('parsing', () => {
    it('returns quality and fidelity scores with reasoning', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(4, 3, 'warm greeting', 'followed reference'));
      const result = await judgeConversation(baseTest, baseConversation, mockLLM);
      expect(result.quality.score).toBe(4);
      expect(result.fidelity.score).toBe(3);
      expect(result.quality.reasoning).toBe('warm greeting');
      expect(result.fidelity.reasoning).toBe('followed reference');
    });

    it('throws when response has no JSON fence', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue('I cannot evaluate this conversation.');
      await expect(judgeConversation(baseTest, baseConversation, mockLLM)).rejects.toThrow('missing JSON block');
    });
  });

  describe('pass/fail determination', () => {
    it('passes when both scores exactly meet threshold', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(3, 3));
      const result = await judgeConversation(baseTest, baseConversation, mockLLM);
      expect(result.passed).toBe(true);
    });

    it('passes when both scores exceed threshold', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(5, 5));
      const result = await judgeConversation(baseTest, baseConversation, mockLLM);
      expect(result.passed).toBe(true);
    });

    it('fails when quality is below threshold', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(2, 4));
      const result = await judgeConversation(baseTest, baseConversation, mockLLM);
      expect(result.passed).toBe(false);
    });

    it('fails when fidelity is below threshold', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(5, 1));
      const result = await judgeConversation(baseTest, baseConversation, mockLLM);
      expect(result.passed).toBe(false);
    });

    it('respects custom threshold from test config', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(4, 4));
      const strictTest = { ...baseTest, threshold: { quality: 5, fidelity: 5 } };
      const result = await judgeConversation(strictTest, baseConversation, mockLLM);
      expect(result.passed).toBe(false);
    });
  });

  describe('LLM call', () => {
    it('calls LLM with the judge model from test config', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(4, 4));
      const customTest = { ...baseTest, judgeModel: 'claude-opus-4-6' };
      await judgeConversation(customTest, baseConversation, mockLLM);
      expect(vi.mocked(mockLLM.chat).mock.calls[0][0].model).toBe('claude-opus-4-6');
    });

    it('includes chatbot spec in system prompt', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(4, 4));
      await judgeConversation(baseTest, baseConversation, mockLLM);
      const { system } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(system).toContain(baseTest.chatbotSpec);
    });

    it('includes reference conversation in system prompt', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(4, 4));
      await judgeConversation(baseTest, baseConversation, mockLLM);
      const { system } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(system).toContain('Hi! How can I help you today?');
    });

    it('includes feedback context in system prompt when provided', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(4, 4));
      await judgeConversation(baseTest, baseConversation, mockLLM, 'past feedback context here');
      const { system } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(system).toContain('past feedback context here');
    });

    it('omits feedback context when not provided', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(4, 4));
      await judgeConversation(baseTest, baseConversation, mockLLM);
      const { system } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      // Empty feedback context should not add noise
      expect(system).not.toContain('undefined');
    });

    it('sends actual conversation as user message', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeResponse(4, 4));
      await judgeConversation(baseTest, baseConversation, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toContain('hello');
      expect(messages[0].content).toContain('Hi there! What can I do for you?');
    });
  });
});
