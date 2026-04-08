import { describe, it, expect, beforeEach } from 'vitest';
import { buildJudgeFeedbackPrompt, buildRunnerFeedbackPrompt } from '../feedback.js';
import { openTestDB, insertRun, insertTestResult, insertFeedback, type TestDB } from './helpers.js';

describe('buildJudgeFeedbackPrompt', () => {
  let db: TestDB;

  beforeEach(() => { db = openTestDB(); });

  it('returns empty string when no feedback exists', async () => {
    expect(await buildJudgeFeedbackPrompt(db, 'suite1/test1')).toBe('');
  });

  it('returns empty string when only runner feedback exists', async () => {
    const runId = insertRun(db);
    const resultId = insertTestResult(db, runId, 'test1');
    insertFeedback(db, resultId, { type: 'runner', comment: 'runner comment' });
    expect(await buildJudgeFeedbackPrompt(db, 'test1')).toBe('');
  });

  it('only returns feedback for the specified testId', async () => {
    const runId = insertRun(db);
    const targetResultId = insertTestResult(db, runId, 'target-test');
    const otherResultId = insertTestResult(db, runId, 'other-test');
    insertFeedback(db, otherResultId, { type: 'judge', comment: 'feedback for other test' });
    insertFeedback(db, targetResultId, { type: 'judge', comment: 'feedback for target' });
    const result = await buildJudgeFeedbackPrompt(db, 'target-test');
    expect(result).toContain('feedback for target');
    expect(result).not.toContain('feedback for other test');
  });

  it('includes the header line', async () => {
    const runId = insertRun(db);
    const resultId = insertTestResult(db, runId, 'test1');
    insertFeedback(db, resultId, { type: 'judge', comment: 'scores were off' });
    const result = await buildJudgeFeedbackPrompt(db, 'test1');
    expect(result).toContain('Consider the following feedback given on imperfect / wrong past evaluations');
  });

  it('includes wrong scores and enriched comment', async () => {
    const runId = insertRun(db);
    const resultId = insertTestResult(db, runId, 'test1', { qualityScore: 2, fidelityScore: 3 });
    insertFeedback(db, resultId, { type: 'judge', comment: 'response was actually quite good' });
    const result = await buildJudgeFeedbackPrompt(db, 'test1');
    expect(result).toContain('quality=2');
    expect(result).toContain('fidelity=3');
    expect(result).toContain('response was actually quite good');
  });

  it('includes score corrections when present', async () => {
    const runId = insertRun(db);
    const resultId = insertTestResult(db, runId, 'test1');
    insertFeedback(db, resultId, { type: 'judge', comment: 'should be higher', qualityScoreCorrection: 4, fidelityScoreCorrection: 5 });
    const result = await buildJudgeFeedbackPrompt(db, 'test1');
    expect(result).toContain('quality=4');
    expect(result).toContain('fidelity=5');
  });

  it('omits correction line when no score corrections', async () => {
    const runId = insertRun(db);
    const resultId = insertTestResult(db, runId, 'test1');
    insertFeedback(db, resultId, { type: 'judge', comment: 'general issue', qualityScoreCorrection: null, fidelityScoreCorrection: null });
    const result = await buildJudgeFeedbackPrompt(db, 'test1');
    expect(result).not.toContain('Correct scores should be');
  });
});

describe('buildRunnerFeedbackPrompt', () => {
  let db: TestDB;

  beforeEach(() => { db = openTestDB(); });

  it('returns empty string when no feedback exists', async () => {
    expect(await buildRunnerFeedbackPrompt(db, 'test1')).toBe('');
  });

  it('returns empty string when only judge feedback exists', async () => {
    const runId = insertRun(db);
    const resultId = insertTestResult(db, runId, 'test1');
    insertFeedback(db, resultId, { type: 'judge', comment: 'judge comment' });
    expect(await buildRunnerFeedbackPrompt(db, 'test1')).toBe('');
  });

  it('includes the header and comment', async () => {
    const runId = insertRun(db);
    const resultId = insertTestResult(db, runId, 'test1');
    insertFeedback(db, resultId, { type: 'runner', comment: 'runner was too pushy' });
    const result = await buildRunnerFeedbackPrompt(db, 'test1');
    expect(result).toContain('how past conversations were conducted');
    expect(result).toContain('runner was too pushy');
  });

  it('only returns feedback for the specified testId', async () => {
    const runId = insertRun(db);
    const targetResultId = insertTestResult(db, runId, 'target-test');
    const otherResultId = insertTestResult(db, runId, 'other-test');
    insertFeedback(db, otherResultId, { type: 'runner', comment: 'other runner comment' });
    insertFeedback(db, targetResultId, { type: 'runner', comment: 'target runner comment' });
    const result = await buildRunnerFeedbackPrompt(db, 'target-test');
    expect(result).toContain('target runner comment');
    expect(result).not.toContain('other runner comment');
  });

  it('does not include score fields', async () => {
    const runId = insertRun(db);
    const resultId = insertTestResult(db, runId, 'test1', { qualityScore: 2, fidelityScore: 2 });
    insertFeedback(db, resultId, { type: 'runner', comment: 'runner comment' });
    const result = await buildRunnerFeedbackPrompt(db, 'test1');
    expect(result).not.toMatch(/Scores were wrong/);
    expect(result).not.toMatch(/quality=/);
  });
});
