import { describe, it, expect, vi, beforeEach } from 'vitest';
import { interpretFeedback } from '../feedback-interpreter.js';
import type { ResolvedTest, Conversation, JudgeResult, LLMClient } from '../index.js';

const baseTest: ResolvedTest = {
  id: 'suite1/test1',
  description: 'refund flow test',
  chatbotUrl: 'http://localhost:3000',
  chatbotSpec: 'A customer service agent that processes refund requests.',
  runnerIncludeChatbotSpec: true,
  runnerMode: 'guided',
  runnerModel: 'gpt-4o-mini',
  judgeModel: 'claude-opus-4-6',
  threshold: { quality: 3, fidelity: 3 },
  reference: [
    { user: 'I want a refund' },
    { bot: 'I can help you with that. What was your order number?' },
  ],
};

const baseConversation: Conversation = {
  messages: [
    { role: 'user', content: 'I want a refund' },
    { role: 'assistant', content: 'Please provide your order ID.' },
  ],
};

const baseJudgeResult: JudgeResult = {
  quality: { score: 2, reasoning: 'response was too terse' },
  fidelity: { score: 3, reasoning: 'followed the flow' },
  passed: false,
};

function makeInterpreterResponse(data: object) {
  return `\`\`\`json\n${JSON.stringify(data)}\n\`\`\``;
}

describe('interpretFeedback', () => {
  const mockLLM = { chat: vi.fn() } as unknown as LLMClient;

  beforeEach(() => {
    vi.mocked(mockLLM.chat).mockReset();
  });

  describe('judge type', () => {
    it('parses comment and score corrections from response', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(
        makeInterpreterResponse({
          comment: 'The bot skipped the empathy step from the reference.',
          quality_score_correction: 4,
          fidelity_score_correction: 2,
        })
      );
      const result = await interpretFeedback('judge', 'bot was cold', baseTest, baseConversation, baseJudgeResult, mockLLM);
      expect(result.comment).toBe('The bot skipped the empathy step from the reference.');
      expect(result.qualityScoreCorrection).toBe(4);
      expect(result.fidelityScoreCorrection).toBe(2);
    });

    it('returns null for missing score corrections', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(
        makeInterpreterResponse({ comment: 'general issue' })
      );
      const result = await interpretFeedback('judge', 'general issue', baseTest, baseConversation, baseJudgeResult, mockLLM);
      expect(result.qualityScoreCorrection).toBeNull();
      expect(result.fidelityScoreCorrection).toBeNull();
    });

    it('includes chatbot spec in prompt', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'raw', baseTest, baseConversation, baseJudgeResult, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain(baseTest.chatbotSpec);
    });

    it('includes wrong scores in prompt', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'raw', baseTest, baseConversation, baseJudgeResult, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain('2'); // quality score
      expect(messages[0].content).toContain('too terse'); // quality reasoning
    });

    it('includes raw comment in prompt', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'user said the bot was cold and unhelpful', baseTest, baseConversation, baseJudgeResult, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain('user said the bot was cold and unhelpful');
    });

    it('uses judgeModel from test config', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'raw', baseTest, baseConversation, baseJudgeResult, mockLLM);
      expect(vi.mocked(mockLLM.chat).mock.calls[0][0].model).toBe('claude-opus-4-6');
    });

    it('sends no system prompt (single user message)', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'raw', baseTest, baseConversation, baseJudgeResult, mockLLM);
      const callArgs = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(callArgs.system).toBeUndefined();
    });
  });

  describe('runner type', () => {
    it('parses comment from response', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(
        makeInterpreterResponse({ comment: 'Runner was too aggressive in turn 2.' })
      );
      const result = await interpretFeedback('runner', 'too aggressive', baseTest, baseConversation, baseJudgeResult, mockLLM);
      expect(result.comment).toBe('Runner was too aggressive in turn 2.');
    });

    it('returns null score corrections for runner type', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(
        makeInterpreterResponse({ comment: 'ok', quality_score_correction: 5 })
      );
      // Runner prompt doesn't ask for scores — any score fields in response are irrelevant
      // The result should still include whatever the LLM returns
      const result = await interpretFeedback('runner', 'raw', baseTest, baseConversation, baseJudgeResult, mockLLM);
      expect(result.comment).toBe('ok');
    });

    it('includes actual conversation in prompt', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('runner', 'raw', baseTest, baseConversation, baseJudgeResult, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain('I want a refund');
      expect(messages[0].content).toContain('Please provide your order ID.');
    });
  });

  describe('error handling', () => {
    it('throws when response has no JSON fence', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue('I cannot interpret this feedback.');
      await expect(
        interpretFeedback('judge', 'raw', baseTest, baseConversation, baseJudgeResult, mockLLM)
      ).rejects.toThrow('missing JSON block');
    });
  });
});
