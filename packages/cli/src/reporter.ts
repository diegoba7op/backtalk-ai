import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { Reporter, ResolvedTest, TestResult } from '@backtalk-ai/core';

const USER_CHAR = '◆';
const BOT_CHAR  = '◇';

function localId(test: ResolvedTest): string {
  return test.suiteId ? test.id.slice(test.suiteId.length + 1) : test.id;
}

function resultLine(result: TestResult): { symbol: string; text: string } {
  const { test, judgeResult } = result;
  const id = localId(test).padEnd(24);
  const symbol = judgeResult.passed ? chalk.green('✓') : chalk.red('✗');
  const status = judgeResult.passed ? chalk.bold.green('PASS') : chalk.bold.red('FAIL');
  const scores = chalk.yellow(`quality: ${judgeResult.quality.score}`) + '  ' + chalk.yellow(`fidelity: ${judgeResult.fidelity.score}`);
  const reasoning = chalk.dim(`"${judgeResult.quality.reasoning}"`);
  return { symbol, text: `${id} ${status}  ${scores}  ${reasoning}` };
}

export function createReporter(options: { verbose: boolean }): Reporter {
  let spinner: Ora | null = null;
  let currentTest: ResolvedTest | null = null;
  let turnChars = '';

  function spinnerText(): string {
    const base = chalk.dim(localId(currentTest!));
    return turnChars ? `${base}  ${turnChars}` : base;
  }

  return {
    onSuiteStart(suiteId) {
      console.log('\n' + chalk.bold.white(suiteId));
    },

    onTestStart(test) {
      currentTest = test;
      turnChars = '';
      const indent = test.suiteId ? '  ' : '';
      if (options.verbose) {
        console.log(chalk.dim(`${indent}▸ ${localId(test)}`));
      } else {
        spinner = ora({ text: spinnerText(), indent: indent.length }).start();
      }
    },

    onTurn(user, bot) {
      if (options.verbose) {
        console.log(chalk.dim('      User › ') + chalk.dim(user));
        console.log(chalk.dim('       Bot › ') + bot);
      } else if (spinner) {
        turnChars += chalk.blue(USER_CHAR) + chalk.cyan(BOT_CHAR) + ' ';
        spinner.text = spinnerText();
      }
    },

    onTestComplete(result) {
      const { symbol, text } = resultLine(result);
      const indent = result.test.suiteId ? '  ' : '';
      if (spinner) {
        spinner.stop();
        spinner = null;
      }
      console.log(`${indent}${symbol} ${text}`);
    },

    onRunComplete(results) {
      const passed = results.filter((r) => r.judgeResult.passed).length;
      const total = results.length;
      const msg = `\n${passed}/${total} passed`;
      console.log(passed === total ? chalk.bold.green(msg) : chalk.bold.red(msg));
    },
  };
}
