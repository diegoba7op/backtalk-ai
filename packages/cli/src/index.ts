#!/usr/bin/env node
import { Command } from 'commander';
import { run, printResults } from '@backtalk-ai/core';

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
  .action(async (opts) => {
    const results = await run({
      configPath: opts.config,
      suite: opts.suite,
      test: opts.test,
      mode: opts.mode,
    });
    printResults(results);
  });

program.parse();
