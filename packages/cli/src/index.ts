#!/usr/bin/env node
import { Command } from 'commander';
import { run } from '@backtalk-ai/core';
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

program.parse();
