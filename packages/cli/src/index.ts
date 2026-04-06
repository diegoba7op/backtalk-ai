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
  .action(async () => {
    const results = await run();
    printResults(results);
  });

program.parse();
