import type { TestResult } from './types.js';

export function printResults(results: TestResult[]): void {
  for (const { test, conversation, judgeResult } of results) {
    const status = judgeResult.passed ? 'PASS' : 'FAIL';
    const q = judgeResult.quality.score;
    const f = judgeResult.fidelity.score;

    console.log(`\n${test.id} ... ${status}  quality: ${q}  fidelity: ${f}`);
    console.log(`  quality:  ${q}/5 - "${judgeResult.quality.reasoning}"`);
    console.log(`  fidelity: ${f}/5 - "${judgeResult.fidelity.reasoning}"`);

    console.log('\n  Conversation:');
    for (const msg of conversation.messages) {
      const label = msg.role === 'user' ? '  User' : '  Bot ';
      console.log(`  ${label}: ${msg.content}`);
    }
  }

  const passed = results.filter((r) => r.judgeResult.passed).length;
  console.log(`\n${passed}/${results.length} passed`);
}
