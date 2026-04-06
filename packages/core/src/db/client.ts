import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';

export type BacktalkDB = ReturnType<typeof openDB>;

export function openDB(dbPath: string): ReturnType<typeof drizzle<typeof schema>> {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Auto-create tables (idempotent)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      finished_at INTEGER NOT NULL,
      total_tests INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      failed INTEGER NOT NULL,
      config_snapshot TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      suite_id TEXT,
      test_id TEXT NOT NULL,
      quality_score INTEGER NOT NULL,
      fidelity_score INTEGER NOT NULL,
      quality_reasoning TEXT NOT NULL,
      fidelity_reasoning TEXT NOT NULL,
      passed INTEGER NOT NULL,
      conversation TEXT NOT NULL,
      reference_conversation TEXT NOT NULL,
      config_snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      test_result_id TEXT NOT NULL REFERENCES test_results(id),
      action TEXT NOT NULL CHECK(action IN ('approve', 'reject')),
      comment TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  return db;
}
