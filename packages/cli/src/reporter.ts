import chalk from 'chalk';
import type { Reporter, ResolvedTest, TestResult } from '@backtalk-ai/core';

function localId(test: ResolvedTest): string {
  return test.suiteId ? test.id.slice(test.suiteId.length + 1) : test.id;
}

export function createReporter(options: { verbose: boolean }): Reporter {
  return {
    onSuiteStart(suiteId) {
      console.log('\n' + chalk.bold.white(suiteId));
    },

    onTestStart(test) {
      if (options.verbose) {
        const indent = test.suiteId ? '  ' : '';
        process.stdout.write(chalk.dim(`${indent}▸ ${localId(test)}\n`));
      }
    },

    onTurn(user, bot) {
      if (!options.verbose) return;
      console.log(chalk.dim('      User › ') + chalk.dim(user));
      console.log(chalk.dim('       Bot › ') + bot);
    },

    onTestComplete(result: TestResult) {
      const { test, judgeResult } = result;
      const indent = test.suiteId ? '  ' : '';
      const id = localId(test).padEnd(24);
      const icon = judgeResult.passed ? chalk.green('✓') : chalk.red('✗');
      const status = judgeResult.passed ? chalk.bold.green('PASS') : chalk.bold.red('FAIL');
      const q = judgeResult.quality.score;
      const f = judgeResult.fidelity.score;
      const scores = chalk.yellow(`quality: ${q}`) + '  ' + chalk.yellow(`fidelity: ${f}`);
      const reasoning = chalk.dim(`"${judgeResult.quality.reasoning}"`);
      console.log(`${indent}${icon} ${id} ${status}  ${scores}  ${reasoning}`);
    },

    onRunComplete(results: TestResult[]) {
      const passed = results.filter((r) => r.judgeResult.passed).length;
      const total = results.length;
      const msg = `\n${passed}/${total} passed`;
      console.log(passed === total ? chalk.bold.green(msg) : chalk.bold.red(msg));
    },
  };
}
