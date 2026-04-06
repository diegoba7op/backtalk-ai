#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { run, openDB, addFeedback, listRuns, getLastRunResults, listFeedback } from '@backtalk-ai/core';
import { createReporter } from './reporter.js';

const program = new Command();

program
  .name('backtalk')
  .description('Chatbot test runner with an LLM judge')
  .version('0.0.1');

program
  .command('run')
  .description('Run tests')
  .option('-c, --config <path>', 'path to config file', 'backtalk.yaml')
  .option('-s, --suite <id>', 'run only this suite')
  .option('-t, --test <id>', 'run only this test')
  .option('-m, --mode <mode>', 'override runner mode (guided | intent | strict)')
  .option('-v, --verbose', 'show conversation turns as they happen')
  .action(async (opts) => {
    const reporter = createReporter({ verbose: opts.verbose ?? false });
    await run({
      configPath: opts.config,
      suite: opts.suite,
      test: opts.test,
      mode: opts.mode,
      reporter,
    });
  });

program
  .command('feedback <test-id>')
  .description('Give feedback on the most recent result for a test')
  .option('-c, --config <path>', 'path to config file (to locate DB)', 'backtalk.yaml')
  .option('--approve', 'approve the judgment')
  .option('--reject [comment]', 'reject the judgment (optional comment)')
  .action(async (testId: string, opts) => {
    if (!opts.approve && opts.reject === undefined) {
      console.error(chalk.red('Specify --approve or --reject'));
      process.exit(1);
    }

    const action = opts.approve ? 'approve' : 'reject';
    const comment = typeof opts.reject === 'string' ? opts.reject : undefined;

    const dbPath = path.join(path.dirname(path.resolve(opts.config)), '.backtalk.db');
    const db = openDB(dbPath);
    const id = await addFeedback(db, testId, action, comment);

    if (!id) {
      console.error(chalk.red(`No test result found for test "${testId}"`));
      process.exit(1);
    }

    const verb = action === 'approve' ? chalk.green('Approved') : chalk.red('Rejected');
    const tail = comment ? ` — "${comment}"` : '';
    console.log(`${verb}: ${testId}${tail}`);
  });

program
  .command('results')
  .description('Show results from the last run')
  .option('-c, --config <path>', 'path to config file (to locate DB)', 'backtalk.yaml')
  .action(async (opts) => {
    const dbPath = path.join(path.dirname(path.resolve(opts.config)), '.backtalk.db');
    const db = openDB(dbPath);
    const rows = await getLastRunResults(db);

    if (rows.length === 0) {
      console.log(chalk.dim('No results found. Run backtalk run first.'));
      return;
    }

    for (const r of rows) {
      const prefix = r.suiteId ? `${r.suiteId}:${r.testId}` : r.testId;
      const status = r.passed ? chalk.green('PASS') : chalk.red('FAIL');
      console.log(
        `  ${chalk.bold(prefix.padEnd(35))} ${status}  quality: ${r.qualityScore}  fidelity: ${r.fidelityScore}`
      );
      if (!r.passed) {
        console.log(chalk.dim(`    quality:  ${r.qualityReasoning}`));
        console.log(chalk.dim(`    fidelity: ${r.fidelityReasoning}`));
      }
    }

    const passed = rows.filter((r) => r.passed).length;
    console.log(`\n${chalk.bold(`${passed}/${rows.length} passed`)}`);
  });

program
  .command('history')
  .description('Show run history')
  .option('-c, --config <path>', 'path to config file (to locate DB)', 'backtalk.yaml')
  .option('-n, --limit <n>', 'number of runs to show', '10')
  .action(async (opts) => {
    const dbPath = path.join(path.dirname(path.resolve(opts.config)), '.backtalk.db');
    const db = openDB(dbPath);
    const allRuns = await listRuns(db, parseInt(opts.limit, 10));

    if (allRuns.length === 0) {
      console.log(chalk.dim('No runs recorded yet.'));
      return;
    }

    console.log(chalk.bold('Run history:\n'));
    for (const r of allRuns) {
      const date = new Date(r.startedAt).toLocaleString();
      const duration = ((r.finishedAt - r.startedAt) / 1000).toFixed(1);
      const status =
        r.failed === 0 ? chalk.green(`${r.passed}/${r.totalTests} passed`) : chalk.red(`${r.failed}/${r.totalTests} failed`);
      console.log(`  ${chalk.dim(r.id)}  ${date}  ${status}  ${chalk.dim(`${duration}s`)}`);
    }

    console.log('');
    const feedbackRows = await listFeedback(db, 10);
    if (feedbackRows.length > 0) {
      console.log(chalk.bold('Recent feedback:\n'));
      for (const f of feedbackRows) {
        const verb = f.action === 'approve' ? chalk.green('approved') : chalk.red('rejected');
        const tail = f.comment ? `  "${f.comment}"` : '';
        console.log(`  ${verb}  ${f.testId}${tail}`);
      }
    }
  });

program.parse();
