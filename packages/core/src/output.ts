import type { TestResult } from './types.js';

export function printResults(results: TestResult[]): void {
  // Group by suiteId (undefined = top-level)
  const suites = new Map<string | undefined, TestResult[]>();
  for (const r of results) {
    const key = r.test.suiteId;
    if (!suites.has(key)) suites.set(key, []);
    suites.get(key)!.push(r);
  }

  const lines: string[] = [];

  for (const [suiteId, suiteResults] of suites) {
    if (suiteId) lines.push(`${suiteId}:`);

    for (const { test, judgeResult } of suiteResults) {
      const status = judgeResult.passed ? 'PASS' : 'FAIL';
      const q = judgeResult.quality.score;
      const f = judgeResult.fidelity.score;
      // test.id is "suite/test" for suite tests — display just the local part
      const displayId = suiteId ? test.id.slice(suiteId.length + 1) : test.id;
      const indent = suiteId ? '  ' : '';
      lines.push(`${indent}${displayId}  ${status}  quality: ${q}  fidelity: ${f}`);
      lines.push(`${indent}  quality:  ${q}/5 - "${judgeResult.quality.reasoning}"`);
      lines.push(`${indent}  fidelity: ${f}/5 - "${judgeResult.fidelity.reasoning}"`);
    }

    if (suiteId) lines.push('');
  }

  // Conversation details
  for (const { test, conversation } of results) {
    lines.push(`\nConversation: ${test.id}`);
    for (const msg of conversation.messages) {
      const label = msg.role === 'user' ? 'User' : 'Bot ';
      lines.push(`  ${label}: ${msg.content}`);
    }
  }

  const passed = results.filter((r) => r.judgeResult.passed).length;
  lines.push(`\n${passed}/${results.length} passed`);

  console.log(lines.join('\n'));
}
