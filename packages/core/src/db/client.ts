import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type BacktalkDB = ReturnType<typeof openDB>;

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'db',
  'migrations'
);

export function openDB(dbPath: string): ReturnType<typeof drizzle<typeof schema>> {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });

  return db;
}
