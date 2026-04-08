import { describe, it, expect, vi, beforeEach } from 'vitest';
import { interpretFeedback } from '../feedback-interpreter.js';
import type { ResolvedTest, LLMClient } from '../index.js';
import { openTestDB, insertRun, insertTestResult, type TestDB } from './helpers.js';

const baseTest: ResolvedTest = {
  id: 'suite1/test1',
  description: 'refund flow test',
  chatbotUrl: 'http://localhost:3000',
  chatbotSpec: 'A customer service agent that processes refund requests.',
  runnerIncludeChatbotSpec: true,
  runnerMode: 'guided',
  runnerModel: 'gpt-4o-mini',
  judgeModel: 'claude-opus-4-6',
  interpreterModel: 'claude-opus-4-6',
  threshold: { quality: 3, fidelity: 3 },
  reference: [
    { user: 'I want a refund' },
    { bot: 'I can help you with that. What was your order number?' },
  ],
};

const conversationMessages = [
  { role: 'user' as const, content: 'I want a refund' },
  { role: 'assistant' as const, content: 'Please provide your order ID.' },
];

function makeInterpreterResponse(data: object) {
  return `\`\`\`json\n${JSON.stringify(data)}\n\`\`\``;
}

describe('interpretFeedback', () => {
  const mockLLM = { chat: vi.fn() } as unknown as LLMClient;
  let db: TestDB;
  let resultId: string;

  beforeEach(() => {
    vi.mocked(mockLLM.chat).mockReset();
    db = openTestDB();
    const runId = insertRun(db);
    resultId = insertTestResult(db, runId, 'suite1/test1', {
      qualityScore: 2,
      fidelityScore: 3,
      qualityReasoning: 'response was too terse',
      fidelityReasoning: 'followed the flow',
      passed: false,
      conversation: JSON.stringify(conversationMessages),
    });
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
      const result = await interpretFeedback('judge', 'bot was cold', baseTest, resultId, db, mockLLM);
      expect(result.comment).toBe('The bot skipped the empathy step from the reference.');
      expect(result.qualityScoreCorrection).toBe(4);
      expect(result.fidelityScoreCorrection).toBe(2);
    });

    it('returns null for missing score corrections', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'general issue' }));
      const result = await interpretFeedback('judge', 'general issue', baseTest, resultId, db, mockLLM);
      expect(result.qualityScoreCorrection).toBeNull();
      expect(result.fidelityScoreCorrection).toBeNull();
    });

    it('includes chatbot spec in prompt', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'raw', baseTest, resultId, db, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain(baseTest.chatbotSpec);
    });

    it('fetches scores from the result row', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'raw', baseTest, resultId, db, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain('2'); // quality score from DB row
      expect(messages[0].content).toContain('too terse'); // quality reasoning from DB row
    });

    it('fetches conversation from the result row', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'raw', baseTest, resultId, db, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain('I want a refund');
      expect(messages[0].content).toContain('Please provide your order ID.');
    });

    it('includes raw comment in prompt', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'user said the bot was cold and unhelpful', baseTest, resultId, db, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain('user said the bot was cold and unhelpful');
    });

    it('uses interpreterModel from test config', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'raw', baseTest, resultId, db, mockLLM);
      expect(vi.mocked(mockLLM.chat).mock.calls[0][0].model).toBe('claude-opus-4-6');
    });

    it('sends no system prompt — role description is in the user message', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'raw', baseTest, resultId, db, mockLLM);
      expect(vi.mocked(mockLLM.chat).mock.calls[0][0].system).toBeUndefined();
    });

    it('includes role description in the user message', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('judge', 'raw', baseTest, resultId, db, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain('LLM judge');
    });
  });

  describe('runner type', () => {
    it('includes role description in the user message', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('runner', 'raw', baseTest, resultId, db, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain('LLM runner');
    });

    it('parses comment from response', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(
        makeInterpreterResponse({ comment: 'Runner was too aggressive in turn 2.' })
      );
      const result = await interpretFeedback('runner', 'too aggressive', baseTest, resultId, db, mockLLM);
      expect(result.comment).toBe('Runner was too aggressive in turn 2.');
    });

    it('fetches conversation from the result row', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue(makeInterpreterResponse({ comment: 'ok' }));
      await interpretFeedback('runner', 'raw', baseTest, resultId, db, mockLLM);
      const { messages } = vi.mocked(mockLLM.chat).mock.calls[0][0];
      expect(messages[0].content).toContain('I want a refund');
      expect(messages[0].content).toContain('Please provide your order ID.');
    });
  });

  describe('error handling', () => {
    it('throws when result id does not exist', async () => {
      await expect(
        interpretFeedback('judge', 'raw', baseTest, 'nonexistent-id', db, mockLLM)
      ).rejects.toThrow('No test result found');
    });

    it('throws when response has no JSON fence', async () => {
      vi.mocked(mockLLM.chat).mockResolvedValue('I cannot interpret this feedback.');
      await expect(
        interpretFeedback('judge', 'raw', baseTest, resultId, db, mockLLM)
      ).rejects.toThrow('missing JSON block');
    });
  });
});
