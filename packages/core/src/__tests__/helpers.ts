import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ulid } from 'ulid';
import * as schema from '../db/schema.js';
import { runs, testResults, feedback } from '../db/schema.js';

// Migrations are at src/db/migrations/ — one level up from __tests__/
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../db/migrations'
);

export type TestDB = ReturnType<typeof drizzle<typeof schema>>;

export function openTestDB(): TestDB {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}

// --- Fixture helpers ---

export function insertRun(db: TestDB, overrides: Partial<typeof runs.$inferInsert> = {}) {
  const id = overrides.id ?? ulid();
  db.insert(runs).values({
    id,
    startedAt: Date.now(),
    finishedAt: Date.now(),
    totalTests: 1,
    passed: 1,
    failed: 0,
    configSnapshot: '{}',
    ...overrides,
  }).run();
  return id;
}

export function insertTestResult(
  db: TestDB,
  runId: string,
  testId: string,
  overrides: Partial<typeof testResults.$inferInsert> = {}
) {
  const id = overrides.id ?? ulid();
  db.insert(testResults).values({
    id,
    runId,
    suiteId: null,
    testId,
    qualityScore: 3,
    fidelityScore: 3,
    qualityReasoning: 'acceptable',
    fidelityReasoning: 'matches reference',
    passed: true,
    conversation: JSON.stringify({ messages: [] }),
    referenceConversation: '[]',
    configSnapshot: '{}',
    createdAt: Date.now(),
    ...overrides,
  }).run();
  return id;
}

export function insertFeedback(
  db: TestDB,
  testResultId: string,
  overrides: Partial<typeof feedback.$inferInsert> = {}
) {
  const id = overrides.id ?? ulid();
  db.insert(feedback).values({
    id,
    testResultId,
    type: 'judge',
    rawComment: 'raw comment',
    comment: 'enriched comment',
    qualityScoreCorrection: null,
    fidelityScoreCorrection: null,
    createdAt: Date.now(),
    ...overrides,
  }).run();
  return id;
}
