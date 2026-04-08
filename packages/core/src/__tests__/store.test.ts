import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTestResultById,
  getLatestTestResult,
  addJudgeFeedback,
  addRunnerFeedback,
  listRuns,
  getLastRunResults,
  listFeedback,
} from '../store.js';
import { openTestDB, insertRun, insertTestResult, insertFeedback, type TestDB } from './helpers.js';
import type { InterpretedFeedback } from '../types.js';

const judgeInterpreted: InterpretedFeedback = {
  comment: 'The bot was too terse; should have elaborated more.',
  qualityScoreCorrection: 4,
  fidelityScoreCorrection: null,
};

const runnerInterpreted: InterpretedFeedback = {
  comment: 'The runner asked too aggressively in turn 2.',
  qualityScoreCorrection: null,
  fidelityScoreCorrection: null,
};

describe('store', () => {
  let db: TestDB;

  beforeEach(() => {
    db = openTestDB();
  });

  describe('getTestResultById', () => {
    it('returns null for unknown id', async () => {
      expect(await getTestResultById(db, 'nonexistent')).toBeNull();
    });

    it('returns the row with matching id', async () => {
      const runId = insertRun(db);
      const id = insertTestResult(db, runId, 'test1');
      const row = await getTestResultById(db, id);
      expect(row).not.toBeNull();
      expect(row!.id).toBe(id);
    });

    it('does not return a row with a different id', async () => {
      const runId = insertRun(db);
      insertTestResult(db, runId, 'test1', { id: 'id-a' });
      expect(await getTestResultById(db, 'id-b')).toBeNull();
    });
  });

  describe('getLatestTestResult', () => {
    it('returns null when no results exist for testId', async () => {
      const result = await getLatestTestResult(db, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns the test result row', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'suite1/test1');
      const row = await getLatestTestResult(db, 'suite1/test1');
      expect(row).not.toBeNull();
      expect(row!.id).toBe(resultId);
    });

    it('returns the most recent result when multiple exist', async () => {
      const runId1 = insertRun(db);
      const runId2 = insertRun(db);
      insertTestResult(db, runId1, 'test1', { createdAt: 1000 });
      const laterId = insertTestResult(db, runId2, 'test1', { createdAt: 9000 });
      const row = await getLatestTestResult(db, 'test1');
      expect(row!.id).toBe(laterId);
    });

    it('does not return results for other testIds', async () => {
      const runId = insertRun(db);
      insertTestResult(db, runId, 'test-other');
      const result = await getLatestTestResult(db, 'test-target');
      expect(result).toBeNull();
    });
  });

  describe('addJudgeFeedback', () => {
    it('returns a new id', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      const id = await addJudgeFeedback(db, resultId, 'raw comment', judgeInterpreted);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('stores type as judge', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      await addJudgeFeedback(db, resultId, 'raw', judgeInterpreted);
      const rows = await listFeedback(db);
      expect(rows[0].type).toBe('judge');
    });

    it('stores raw comment and enriched comment separately', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      await addJudgeFeedback(db, resultId, 'raw input', judgeInterpreted);
      const rows = await listFeedback(db);
      expect(rows[0].rawComment).toBe('raw input');
      expect(rows[0].comment).toBe(judgeInterpreted.comment);
    });

    it('stores quality score correction', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      await addJudgeFeedback(db, resultId, 'raw', judgeInterpreted);
      const rows = await listFeedback(db);
      expect(rows[0].qualityScoreCorrection).toBe(4);
      expect(rows[0].fidelityScoreCorrection).toBeNull();
    });
  });

  describe('addRunnerFeedback', () => {
    it('stores type as runner', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      await addRunnerFeedback(db, resultId, 'raw', runnerInterpreted);
      const rows = await listFeedback(db);
      expect(rows[0].type).toBe('runner');
    });

    it('stores null for score corrections regardless of interpreted value', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      await addRunnerFeedback(db, resultId, 'raw', {
        ...runnerInterpreted,
        qualityScoreCorrection: 5, // should be ignored
      });
      const rows = await listFeedback(db);
      expect(rows[0].qualityScoreCorrection).toBeNull();
      expect(rows[0].fidelityScoreCorrection).toBeNull();
    });
  });

  describe('listRuns', () => {
    it('returns empty array when no runs', async () => {
      const result = await listRuns(db);
      expect(result).toEqual([]);
    });

    it('returns runs in descending order by startedAt', async () => {
      insertRun(db, { id: 'run1', startedAt: 1000, finishedAt: 1001 });
      insertRun(db, { id: 'run2', startedAt: 3000, finishedAt: 3001 });
      insertRun(db, { id: 'run3', startedAt: 2000, finishedAt: 2001 });
      const result = await listRuns(db);
      expect(result.map((r) => r.id)).toEqual(['run2', 'run3', 'run1']);
    });

    it('respects limit parameter', async () => {
      insertRun(db, { id: 'r1' });
      insertRun(db, { id: 'r2' });
      insertRun(db, { id: 'r3' });
      const result = await listRuns(db, 2);
      expect(result).toHaveLength(2);
    });

    it('includes summary fields', async () => {
      insertRun(db, { totalTests: 5, passed: 3, failed: 2 });
      const [run] = await listRuns(db);
      expect(run.totalTests).toBe(5);
      expect(run.passed).toBe(3);
      expect(run.failed).toBe(2);
    });
  });

  describe('getLastRunResults', () => {
    it('returns empty array when no runs', async () => {
      const result = await getLastRunResults(db);
      expect(result).toEqual([]);
    });

    it('returns test results for the most recent run only', async () => {
      const oldRun = insertRun(db, { startedAt: 1000, finishedAt: 1001 });
      const newRun = insertRun(db, { startedAt: 9000, finishedAt: 9001 });
      insertTestResult(db, oldRun, 'test1');
      const r2 = insertTestResult(db, newRun, 'test2');
      const result = await getLastRunResults(db);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(r2);
    });

    it('returns all tests from the latest run', async () => {
      const runId = insertRun(db);
      insertTestResult(db, runId, 'suite1/test1');
      insertTestResult(db, runId, 'suite1/test2');
      const result = await getLastRunResults(db);
      expect(result).toHaveLength(2);
    });
  });

  describe('listFeedback', () => {
    it('returns empty array when no feedback', async () => {
      const result = await listFeedback(db);
      expect(result).toEqual([]);
    });

    it('returns feedback joined with testId and suiteId', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'suite1/test1', { suiteId: 'suite1' });
      insertFeedback(db, resultId);
      const [row] = await listFeedback(db);
      expect(row.testId).toBe('suite1/test1');
      expect(row.suiteId).toBe('suite1');
    });

    it('returns feedback in descending order by createdAt', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      insertFeedback(db, resultId, { id: 'f1', createdAt: 1000 });
      insertFeedback(db, resultId, { id: 'f2', createdAt: 3000 });
      insertFeedback(db, resultId, { id: 'f3', createdAt: 2000 });
      const result = await listFeedback(db);
      expect(result.map((r) => r.id)).toEqual(['f2', 'f3', 'f1']);
    });

    it('respects limit parameter', async () => {
      const runId = insertRun(db);
      const resultId = insertTestResult(db, runId, 'test1');
      insertFeedback(db, resultId, { id: 'f1' });
      insertFeedback(db, resultId, { id: 'f2' });
      insertFeedback(db, resultId, { id: 'f3' });
      const result = await listFeedback(db, 2);
      expect(result).toHaveLength(2);
    });
  });
});
