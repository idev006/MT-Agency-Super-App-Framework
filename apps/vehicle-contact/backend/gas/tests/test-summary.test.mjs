// scripts/test-summary.mjs (owner 2026-11-26: short test output to save tokens): totals + each failure once, with its error.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from '../../../../../scripts/test-summary.mjs';

test('SUMMARY-01 node --test: totals summed across runs; a failure is shown once, with its error, not its stack', () => {
  const out = ['✔ ok (1ms)', '✖ BROKEN-01 counts (2ms)', 'ℹ pass 1', 'ℹ fail 1', 'ℹ pass 5', 'ℹ fail 0', '✖ failing tests:', '',
    'test at a.test.mjs:3:1', '✖ BROKEN-01 counts (2ms)', '  AssertionError [ERR_ASSERTION]: op count', '      at TestContext (file:///x.mjs:3:9)', '  63 !== 64'].join('\n');
  const s = summarize(out, 1);
  assert.deepEqual(s.sum, {pass: 6, fail: 1, skip: 0, flaky: 0});
  assert.equal(s.failures.length, 1);
  assert.match(s.failures[0], /BROKEN-01 counts\n\s+AssertionError \[ERR_ASSERTION\]: op count\n\s+63 !== 64$/);
  assert.doesNotMatch(s.failures[0], /at TestContext/);
});

test('SUMMARY-02 vitest and Playwright totals; ANSI colours stripped; a crashed plain script shows its error', () => {
  const vitest = summarize('\u001b[31m × BROKEN-FE adds up 18ms\u001b[39m\n FAIL  tests/x.test.js > BROKEN-FE adds up\nAssertionError: expected 2 to be 3\n      Tests  1 failed | 292 passed (293)\n', 1);
  assert.deepEqual(vitest.sum, {pass: 292, fail: 1, skip: 0, flaky: 0});
  assert.equal(vitest.failures.length, 1, 'the run line and the summary line are one test');
  const pw = summarize('  1) [desktop] › e2e/a.e2e.js:2:1 › BROKEN-E2E ──\n    Error: expect(received).toBe(expected)\n  1 failed\n  1 skipped\n  27 passed (2.6m)\n', 1);
  assert.deepEqual(pw.sum, {pass: 27, fail: 1, skip: 1, flaky: 0});
  const crash = summarize('Vehicle lifecycle policy assertions PASSED\nAssertionError [ERR_ASSERTION]: plain script check\n    at file:///x.mjs:2:8\n', 1);
  assert.equal(crash.failures.length, 0); assert.match(crash.crash.join('\n'), /plain script check/);
  assert.deepEqual(summarize('ℹ pass 3\nℹ fail 0\n', 0).crash, [], 'nothing extra when it passes');
});
