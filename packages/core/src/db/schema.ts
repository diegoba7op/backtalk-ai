import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at').notNull(),
  totalTests: integer('total_tests').notNull(),
  passed: integer('passed').notNull(),
  failed: integer('failed').notNull(),
  configSnapshot: text('config_snapshot').notNull(), // JSON
});

export const testResults = sqliteTable('test_results', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id),
  suiteId: text('suite_id'),
  testId: text('test_id').notNull(),
  qualityScore: integer('quality_score').notNull(),
  fidelityScore: integer('fidelity_score').notNull(),
  qualityReasoning: text('quality_reasoning').notNull(),
  fidelityReasoning: text('fidelity_reasoning').notNull(),
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  conversation: text('conversation').notNull(),          // JSON
  referenceConversation: text('reference_conversation').notNull(), // JSON
  configSnapshot: text('config_snapshot').notNull(),     // JSON
  createdAt: integer('created_at').notNull(),
});

export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  testResultId: text('test_result_id')
    .notNull()
    .references(() => testResults.id),
  comment: text('comment').notNull(),
  createdAt: integer('created_at').notNull(),
});
