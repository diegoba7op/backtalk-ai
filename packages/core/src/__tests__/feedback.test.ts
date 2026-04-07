import { describe, it, expect, beforeEach } from 'vitest';
import { buildFeedbackPrompt } from '../feedback.js';
import { openTestDB, insertRun, insertTestResult, insertFeedback, type TestDB } from './helpers.js';

describe('buildFeedbackPrompt', () => {
  let db: TestDB;

  beforeEach(() => {
    db = openTestDB();
  });

  it('returns empty string when no test results exist', async () => {
    const result = await buildFeedbackPrompt(db, 'suite1/test1');
    expect(result).toBe('');
  });

  it('returns empty string when test results exist but no feedback', async () => {
    const runId = insertRun(db);
    insertTestResult(db, runId, 'suite1/test1');
    const result = await buildFeedbackPrompt(db, 'suite1/test1');
    expect(result).toBe('');
  });

  it('only returns feedback for the specified testId', async () => {
    const runId = insertRun(db);
    const targetResultId = insertTestResult(db, runId, 'target-test');
    const otherResultId = insertTestResult(db, runId, 'other-test');
    insertFeedback(db, otherResultId, { comment: 'feedback for other test' });
    insertFeedback(db, targetResultId, { comment: 'feedback for target' });

    const result = await buildFeedbackPrompt(db, 'target-test');
    expect(result).toContain('feedback for target');
    expect(result).not.toContain('feedback for other test');
  });

  describe('judge feedback', () => {
    it('includes the header line', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      insertFeedback(db, resultId, { type: 'judge', comment: 'scores were off' });
      const result = await buildFeedbackPrompt(db, 'test1');
      expect(result).toContain('Consider the following feedback given on imperfect / wrong past evaluations');
    });

    it('includes wrong scores and enriched comment', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1', {
        qualityScore: 2,
        fidelityScore: 3,
      });
      insertFeedback(db, resultId, {
        type: 'judge',
        comment: 'response was actually quite good',
      });
      const result = await buildFeedbackPrompt(db, 'test1');
      expect(result).toContain('quality=2');
      expect(result).toContain('fidelity=3');
      expect(result).toContain('response was actually quite good');
    });

    it('includes score corrections when present', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      insertFeedback(db, resultId, {
        type: 'judge',
        comment: 'should be higher',
        qualityScoreCorrection: 4,
        fidelityScoreCorrection: 5,
      });
      const result = await buildFeedbackPrompt(db, 'test1');
      expect(result).toContain('quality=4');
      expect(result).toContain('fidelity=5');
    });

    it('omits correction line when no score corrections', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      insertFeedback(db, resultId, {
        type: 'judge',
        comment: 'general issue',
        qualityScoreCorrection: null,
        fidelityScoreCorrection: null,
      });
      const result = await buildFeedbackPrompt(db, 'test1');
      expect(result).not.toContain('Correct scores should be');
    });
  });

  describe('runner feedback', () => {
    it('includes runner section header', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      insertFeedback(db, resultId, { type: 'runner', comment: 'runner was too pushy' });
      const result = await buildFeedbackPrompt(db, 'test1');
      expect(result).toContain('Runner feedback');
      expect(result).toContain('runner was too pushy');
    });

    it('does not include score fields for runner feedback', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1', { qualityScore: 2, fidelityScore: 2 });
      insertFeedback(db, resultId, { type: 'runner', comment: 'runner comment' });
      const result = await buildFeedbackPrompt(db, 'test1');
      // Runner section should not mention wrong scores or corrections
      expect(result).not.toMatch(/Scores were wrong/);
    });
  });

  describe('mixed feedback', () => {
    it('includes both judge and runner sections when both exist', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      insertFeedback(db, resultId, { type: 'judge', comment: 'judge feedback here' });
      insertFeedback(db, resultId, { type: 'runner', comment: 'runner feedback here' });
      const result = await buildFeedbackPrompt(db, 'test1');
      expect(result).toContain('Judge feedback');
      expect(result).toContain('Runner feedback');
      expect(result).toContain('judge feedback here');
      expect(result).toContain('runner feedback here');
    });
  });
});
